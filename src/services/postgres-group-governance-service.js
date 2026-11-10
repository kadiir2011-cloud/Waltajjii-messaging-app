"use strict";
const crypto=require("node:crypto");
function createPostgresGroupGovernanceService({db,clock=()=>new Date()}={}) {
 if(!db||!["one","many","execute","withTransaction"].every(k=>typeof db[k]==="function"))throw new TypeError("A PostgreSQL adapter is required.");
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 const validId=v=>/^[1-9][0-9]*$/.test(String(v??""));
 const tokenHash=t=>crypto.createHash("sha256").update(t).digest("hex");
 const validToken=t=>typeof t==="string"&&/^[A-Za-z0-9_-]{40,100}$/.test(t);
 const activity=async(tx,g,a,type,subject=null,details="")=>tx.execute("INSERT INTO group_activity(group_id,actor_id,subject_user_id,event_type,details) VALUES($1,$2,$3,$4,$5)",[g,a||null,subject,String(type),String(details||"").slice(0,240)]);
 async function member(tx,g,u){return tx.one("SELECT role,joined_at AS \"joinedAt\" FROM group_members WHERE group_id=$1 AND user_id=$2",[g,u]);}
 async function requireMember(tx,g,u){const m=await member(tx,g,u);if(!m)throw fail(404,"Group not found.");return m;}
 async function requireAdmin(tx,g,u){const m=await requireMember(tx,g,u);if(m.role!=="admin")throw fail(403,"Only group admins can perform this action.");return m;}
 async function changeRole(g,actor,target,role){
  if(!validId(g)||!validId(target)||!["admin","member"].includes(role))throw fail(400,"Invalid group member or role.");
  return db.withTransaction(async tx=>{await requireAdmin(tx,g,actor);const current=await member(tx,g,target);if(!current)throw fail(404,"Member not found.");
   if(current.role==="admin"&&role==="member"){const count=await tx.one("SELECT COUNT(*)::int AS n FROM group_members WHERE group_id=$1 AND role='admin'",[g]);if(count.n<=1)throw fail(400,"A group must always have at least one admin.");}
   await tx.execute("UPDATE group_members SET role=$1 WHERE group_id=$2 AND user_id=$3",[role,g,target]);await activity(tx,g,actor,"role_changed",target,role);
   return {message:role==="admin"?"Member promoted to admin.":"Admin role removed."};
  });
 }
 async function leave(g,user){
  if(!validId(g))throw fail(400,"Invalid group.");
  return db.withTransaction(async tx=>{const current=await requireMember(tx,g,user);if(current.role==="admin"){const others=await tx.one("SELECT COUNT(*)::int AS n FROM group_members WHERE group_id=$1 AND role='admin' AND user_id<>$2",[g,user]);if(others.n===0)throw fail(400,"Assign another admin before leaving this group.");}
   await tx.execute("DELETE FROM group_members WHERE group_id=$1 AND user_id=$2",[g,user]);await activity(tx,g,user,"member_left",user);return {message:"You left the group."};
  });
 }
 async function removeMember(g,actor,target){
  if(!validId(g)||!validId(target))throw fail(400,"Invalid group or member.");
  if(String(actor)===String(target))throw fail(400,"An admin cannot remove themselves. Assign another admin first.");
  return db.withTransaction(async tx=>{await requireAdmin(tx,g,actor);const current=await member(tx,g,target);if(!current)throw fail(404,"Member not found.");
   if(current.role==="admin"){const admins=await tx.one("SELECT COUNT(*)::int AS n FROM group_members WHERE group_id=$1 AND role='admin'",[g]);if(admins.n<=1)throw fail(400,"A group must always have at least one admin.");}
   await tx.execute("DELETE FROM group_members WHERE group_id=$1 AND user_id=$2",[g,target]);await activity(tx,g,actor,"member_removed",target);return {message:"Member removed."};
  });
 }
 async function updateDetails(g,actor,input={}){
  return db.withTransaction(async tx=>{await requireAdmin(tx,g,actor);
   const current=await tx.one("SELECT visibility FROM groups WHERE id=$1",[g]);if(!current)throw fail(404,"Group not found.");
   const description=String(input.description??"").trim(),rules=String(input.rules??"").trim(),visibility=String(input.visibility??current.visibility),approval=input.approvalRequired===true,memberVisibility=String(input.memberListVisibility||"members");
   if(description.length>500)throw fail(400,"Group description must be 500 characters or fewer.");
   if(rules.length>2000)throw fail(400,"Group rules must be 2,000 characters or fewer.");
   if(!["private","public"].includes(visibility))throw fail(400,"Visibility must be private or public.");
   if(!["members","admins"].includes(memberVisibility))throw fail(400,"Member-list visibility must be members or admins.");
   await tx.execute("UPDATE groups SET description=$1,rules=$2,visibility=$3,approval_required=$4,member_list_visibility=$5 WHERE id=$6",[description,rules,visibility,approval?1:0,memberVisibility,g]);
   await activity(tx,g,actor,"group_settings_updated",actor,visibility+(approval?";approval required":";approval off")+";member list:"+memberVisibility);
   return {details:await tx.one("SELECT id,name,description,rules,visibility,approval_required AS \"approvalRequired\",member_list_visibility AS \"memberListVisibility\" FROM groups WHERE id=$1",[g]),message:"Group details saved."};
  });
 }
 async function getDetails(g,user){await requireMember(db,g,user);return {details:await db.one("SELECT id,name,description,rules,visibility,approval_required AS \"approvalRequired\",member_list_visibility AS \"memberListVisibility\" FROM groups WHERE id=$1",[g])};}
 async function listActivity(g,user,{limit=30,before=null}={}){
  await requireMember(db,g,user);const n=Math.max(1,Math.min(Number.isSafeInteger(Number(limit))?Number(limit):30,100));
  if(before!==null&&!validId(before))throw fail(400,"Invalid activity cursor.");
  const events=await db.many("SELECT a.id,a.event_type AS \"eventType\",a.details,a.created_at AS \"createdAt\",actor.username AS \"actorUsername\",subject.username AS \"subjectUsername\" FROM group_activity a LEFT JOIN users actor ON actor.id=a.actor_id LEFT JOIN users subject ON subject.id=a.subject_user_id WHERE a.group_id=$1 AND ($2::bigint IS NULL OR a.id<$2::bigint) ORDER BY a.id DESC LIMIT $3",[g,before,n]);
  return {events,nextBefore:events.length===n?String(events[events.length-1].id):null};
 }
 async function createInvitation(g,actor,{expiresInHours=24,useLimit=null}={}){
  if(![1,24,168,720].includes(Number(expiresInHours)))throw fail(400,"Choose an expiry of 1 hour, 1 day, 7 days, or 30 days.");
  if(useLimit!==null&&(!Number.isSafeInteger(Number(useLimit))||Number(useLimit)<1||Number(useLimit)>1000))throw fail(400,"Use limit must be between 1 and 1000.");
  const rawToken=crypto.randomBytes(32).toString("base64url"),expiry=new Date(clock().getTime()+Number(expiresInHours)*3600000).toISOString();
  const invitation=await db.withTransaction(async tx=>{await requireAdmin(tx,g,actor);const row=await tx.one("INSERT INTO group_invitations(group_id,token_hash,created_by,expires_at,use_limit) VALUES($1,$2,$3,$4,$5) RETURNING id,created_at AS \"createdAt\",expires_at AS \"expiresAt\",use_limit AS \"useLimit\",use_count AS \"useCount\"",[g,tokenHash(rawToken),actor,expiry,useLimit==null?null:Number(useLimit)]);await activity(tx,g,actor,"invitation_created");return row;});
  return {invitation:{...invitation,token:rawToken}};
 }
 async function listInvitations(g,actor){await requireAdmin(db,g,actor);return {invitations:await db.many("SELECT i.id,i.created_at AS \"createdAt\",i.expires_at AS \"expiresAt\",i.revoked_at AS \"revokedAt\",i.use_limit AS \"useLimit\",i.use_count AS \"useCount\",u.username AS \"createdBy\" FROM group_invitations i JOIN users u ON u.id=i.created_by WHERE i.group_id=$1 ORDER BY i.id DESC LIMIT 100",[g])};}
 async function revokeInvitation(g,actor,id){return db.withTransaction(async tx=>{await requireAdmin(tx,g,actor);const changed=await tx.execute("UPDATE group_invitations SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1 AND group_id=$2 AND revoked_at IS NULL",[id,g]);if(!changed)throw fail(404,"Active invitation not found.");await activity(tx,g,actor,"invitation_revoked");return {message:"Invitation revoked."};});}
 async function previewInvitation(token){
  if(!validToken(token))throw fail(404,"Invitation not found.");
  const i=await db.one("SELECT i.id,i.group_id AS \"groupId\",i.expires_at AS \"expiresAt\",i.revoked_at AS \"revokedAt\",i.use_limit AS \"useLimit\",i.use_count AS \"useCount\",g.name AS \"groupName\" FROM group_invitations i JOIN groups g ON g.id=i.group_id WHERE i.token_hash=$1",[tokenHash(token)]);
  if(!i||i.revokedAt||new Date(i.expiresAt)<=clock()||(i.useLimit!==null&&i.useCount>=i.useLimit))throw fail(410,"This invitation is expired, revoked, or has reached its use limit.");
  return {invitation:{groupName:i.groupName,expiresAt:i.expiresAt}};
 }
 async function joinByInvitation(token,user){
  if(!validToken(token))throw fail(404,"Invitation not found.");
  return db.withTransaction(async tx=>{
   const invite=await tx.one("SELECT i.id,i.group_id AS \"groupId\",i.expires_at AS \"expiresAt\",i.revoked_at AS \"revokedAt\",i.use_limit AS \"useLimit\",i.use_count AS \"useCount\",g.approval_required AS \"approvalRequired\" FROM group_invitations i JOIN groups g ON g.id=i.group_id WHERE i.token_hash=$1 FOR UPDATE OF i,g",[tokenHash(token)]);
   if(!invite||invite.revokedAt||new Date(invite.expiresAt)<=clock()||(invite.useLimit!==null&&invite.useCount>=invite.useLimit))throw fail(410,"This invitation is expired, revoked, or has reached its use limit.");
   const existing=await member(tx,invite.groupId,user);if(existing)return {alreadyMember:true,groupId:String(invite.groupId)};
   const count=await tx.one("SELECT COUNT(*)::int AS n FROM group_members WHERE group_id=$1",[invite.groupId]);if(count.n>=100)throw fail(410,"This group has reached 100 members.");
   if(invite.approvalRequired){
    const pending=await tx.one("INSERT INTO group_join_requests(group_id,user_id,invitation_id) VALUES($1,$2,$3) ON CONFLICT(group_id,user_id) WHERE status='pending' DO UPDATE SET invitation_id=EXCLUDED.invitation_id,created_at=CURRENT_TIMESTAMP RETURNING id",[invite.groupId,user,invite.id]);
    await tx.execute("INSERT INTO group_invitation_events(invitation_id,user_id,event_type) VALUES($1,$2,'requested')",[invite.id,user]);await activity(tx,invite.groupId,user,"join_requested",user);
    return {pending:true,requestId:String(pending.id),groupId:String(invite.groupId)};
   }
   const consumed=await tx.execute("UPDATE group_invitations SET use_count=use_count+1 WHERE id=$1 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP AND (use_limit IS NULL OR use_count<use_limit)",[invite.id]);
   if(!consumed)throw fail(410,"This invitation is no longer available.");
   await tx.execute("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'member')",[invite.groupId,user]);
   await tx.execute("INSERT INTO group_invitation_events(invitation_id,user_id,event_type) VALUES($1,$2,'joined')",[invite.id,user]);await activity(tx,invite.groupId,user,"member_joined",user);
   return {groupId:String(invite.groupId),joined:true};
  });
 }
 async function listJoinRequests(g,actor){await requireAdmin(db,g,actor);return {requests:await db.many("SELECT r.id,r.user_id AS \"userId\",u.username,r.created_at AS \"createdAt\",r.status FROM group_join_requests r JOIN users u ON u.id=r.user_id WHERE r.group_id=$1 AND r.status='pending' ORDER BY r.created_at ASC LIMIT 100",[g])};}
 async function reviewJoinRequest(g,actor,id,decision){
  if(!["approve","reject"].includes(decision))throw fail(400,"Choose approve or reject.");
  return db.withTransaction(async tx=>{
   await requireAdmin(tx,g,actor);
   const req=await tx.one("SELECT r.id,r.user_id AS \"userId\",r.invitation_id AS \"invitationId\",r.status,i.expires_at AS \"expiresAt\",i.revoked_at AS \"revokedAt\",i.use_limit AS \"useLimit\",i.use_count AS \"useCount\" FROM group_join_requests r LEFT JOIN group_invitations i ON i.id=r.invitation_id WHERE r.id=$1 AND r.group_id=$2 FOR UPDATE OF r",[id,g]);
   if(!req||req.status!=="pending")throw fail(409,"This request has already been reviewed or no longer exists.");
   if(decision==="reject"){await tx.execute("UPDATE group_join_requests SET status='rejected',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$1 WHERE id=$2",[actor,id]);await activity(tx,g,actor,"join_rejected",req.userId);return {message:"Join request rejected.",userId:String(req.userId),approved:false};}
   if(await member(tx,g,req.userId)){await tx.execute("UPDATE group_join_requests SET status='approved',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$1 WHERE id=$2",[actor,id]);return {message:"The requester is already a member.",userId:String(req.userId),alreadyMember:true};}
   if(!req.invitationId||req.revokedAt||!req.expiresAt||new Date(req.expiresAt)<=clock()||(req.useLimit!==null&&req.useCount>=req.useLimit))throw fail(409,"The invitation has expired, been revoked, or reached its use limit. The request cannot be approved.");
   const count=await tx.one("SELECT COUNT(*)::int AS n FROM group_members WHERE group_id=$1",[g]);if(count.n>=100)throw fail(409,"This group has reached 100 members.");
   const consumed=await tx.execute("UPDATE group_invitations SET use_count=use_count+1 WHERE id=$1 AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP AND (use_limit IS NULL OR use_count<use_limit)",[req.invitationId]);if(!consumed)throw fail(409,"The invitation is no longer available.");
   await tx.execute("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'member')",[g,req.userId]);
   await tx.execute("UPDATE group_join_requests SET status='approved',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=$1 WHERE id=$2",[actor,id]);
   await tx.execute("INSERT INTO group_invitation_events(invitation_id,user_id,event_type) VALUES($1,$2,'joined')",[req.invitationId,req.userId]);await activity(tx,g,actor,"join_approved",req.userId);
   return {message:"Join request approved.",userId:String(req.userId),approved:true};
  });
 }
 async function listPolls(g,user){
  await requireMember(db,g,user);
  const polls=await db.many("SELECT p.id,p.group_id AS \"groupId\",p.creator_id AS \"creatorId\",u.username AS \"creatorUsername\",p.question,p.multiple_choice AS \"multipleChoice\",p.status,p.created_at AS \"createdAt\",p.closed_at AS \"closedAt\",(SELECT COUNT(DISTINCT v.user_id)::int FROM group_poll_votes v WHERE v.poll_id=p.id) AS \"voterCount\" FROM group_polls p JOIN users u ON u.id=p.creator_id WHERE p.group_id=$1 ORDER BY p.id DESC LIMIT 50",[g]);
  for(const p of polls){p.multipleChoice=Boolean(p.multipleChoice);p.options=await db.many("SELECT o.id,o.option_text AS text,(SELECT COUNT(*)::int FROM group_poll_votes v WHERE v.option_id=o.id) AS votes,EXISTS(SELECT 1 FROM group_poll_votes v WHERE v.option_id=o.id AND v.user_id=$1) AS selected FROM group_poll_options o WHERE o.poll_id=$2 ORDER BY o.id",[user,p.id]);p.options=p.options.map(o=>({...o,selected:Boolean(o.selected)}));}
  return {polls};
 }
 async function createPoll(g,user,input={}){
  const question=String(input.question||"").trim(),options=Array.isArray(input.options)?input.options.map(x=>String(x||"").trim()):[],multiple=Boolean(input.multipleChoice);
  if(question.length<1||question.length>300)throw fail(400,"Poll question must be 1–300 characters.");
  if(options.length<2||options.length>10||options.some(x=>!x||x.length>100))throw fail(400,"Add 2–10 options, each 1–100 characters.");
  if(new Set(options.map(x=>x.toLocaleLowerCase())).size!==options.length)throw fail(400,"Poll options must be unique.");
  const id=await db.withTransaction(async tx=>{await requireMember(tx,g,user);const p=await tx.one("INSERT INTO group_polls(group_id,creator_id,question,multiple_choice) VALUES($1,$2,$3,$4) RETURNING id",[g,user,question,multiple?1:0]);for(const option of options)await tx.execute("INSERT INTO group_poll_options(poll_id,option_text) VALUES($1,$2)",[p.id,option]);await activity(tx,g,user,"poll_created",null,question.slice(0,100));return String(p.id);});
  return {poll:(await listPolls(g,user)).polls.find(p=>String(p.id)===id)};
 }
 async function votePoll(g,pollId,user,rawIds){
  const ids=Array.isArray(rawIds)?[...new Set(rawIds.map(String))]:[];if(!ids.length||ids.length>10||ids.some(x=>!validId(x)))throw fail(400,"Select at least one valid poll option.");
  await db.withTransaction(async tx=>{await requireMember(tx,g,user);const p=await tx.one("SELECT id,multiple_choice AS \"multipleChoice\",status FROM group_polls WHERE id=$1 AND group_id=$2 FOR UPDATE",[pollId,g]);if(!p)throw fail(404,"Poll not found.");if(p.status!=="open")throw fail(400,"This poll is closed.");if(!p.multipleChoice&&ids.length!==1)throw fail(400,"Choose only one option for this poll.");
   const valid=await tx.many("SELECT id FROM group_poll_options WHERE poll_id=$1 AND id=ANY($2::bigint[])",[pollId,ids]);if(valid.length!==ids.length)throw fail(400,"One or more selected options do not belong to this poll.");
   await tx.execute("DELETE FROM group_poll_votes WHERE poll_id=$1 AND user_id=$2",[pollId,user]);for(const optionId of ids)await tx.execute("INSERT INTO group_poll_votes(poll_id,option_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[pollId,optionId,user]);
  });
  return {poll:(await listPolls(g,user)).polls.find(p=>String(p.id)===String(pollId))};
 }
 async function closePoll(g,pollId,user){
  return db.withTransaction(async tx=>{const me=await requireMember(tx,g,user);const p=await tx.one("SELECT creator_id AS \"creatorId\",status FROM group_polls WHERE id=$1 AND group_id=$2 FOR UPDATE",[pollId,g]);if(!p)throw fail(404,"Poll not found.");if(String(p.creatorId)!==String(user)&&me.role!=="admin")throw fail(403,"Only the poll creator or a group admin can close this poll.");if(p.status==="open"){await tx.execute("UPDATE group_polls SET status='closed',closed_at=CURRENT_TIMESTAMP,closed_by=$1 WHERE id=$2",[user,pollId]);await activity(tx,g,user,"poll_closed");}return {poll:(await listPolls(g,user)).polls.find(x=>String(x.id)===String(pollId))};});
 }
 async function listEvents(g,user){
  await requireMember(db,g,user);
  const events=await db.many("SELECT e.id,e.group_id AS \"groupId\",e.created_by AS \"createdBy\",creator.username AS \"creatorUsername\",e.title,e.description,e.starts_at AS \"startsAt\",e.location,e.reminder_minutes AS \"reminderMinutes\",e.status,e.created_at AS \"createdAt\",e.cancelled_at AS \"cancelledAt\",(SELECT response FROM group_event_rsvps WHERE event_id=e.id AND user_id=$1) AS \"myResponse\",(SELECT COUNT(*)::int FROM group_event_rsvps WHERE event_id=e.id AND response='going') AS \"goingCount\",(SELECT COUNT(*)::int FROM group_event_rsvps WHERE event_id=e.id AND response='maybe') AS \"maybeCount\",(SELECT COUNT(*)::int FROM group_event_rsvps WHERE event_id=e.id AND response='not_going') AS \"notGoingCount\" FROM group_events e JOIN users creator ON creator.id=e.created_by WHERE e.group_id=$2 ORDER BY CASE e.status WHEN 'scheduled' THEN 0 ELSE 1 END,e.starts_at ASC,e.id DESC",[user,g]);
  const attendees=await db.many("SELECT r.event_id AS \"eventId\",r.response,u.username FROM group_event_rsvps r JOIN users u ON u.id=r.user_id JOIN group_events e ON e.id=r.event_id WHERE e.group_id=$1 ORDER BY LOWER(u.username)",[g]);
  const byEvent=new Map();for(const a of attendees){const key=String(a.eventId);if(!byEvent.has(key))byEvent.set(key,{going:[],maybe:[],notGoing:[]});byEvent.get(key)[a.response==="not_going"?"notGoing":a.response].push(a.username);}
  return {events:events.map(e=>({...e,attendees:byEvent.get(String(e.id))||{going:[],maybe:[],notGoing:[]}}))};
 }
 async function createEvent(g,user,input={}){
  const title=String(input.title||"").trim(),description=String(input.description||"").trim(),location=String(input.location||"").trim(),startsAt=String(input.startsAt||"").trim(),reminder=Number(input.reminderMinutes||0),date=new Date(startsAt);
  if(!title||title.length>120)throw fail(400,"Event title must be 1–120 characters.");if(description.length>2000)throw fail(400,"Event description must be at most 2,000 characters.");if(location.length>200)throw fail(400,"Location must be at most 200 characters.");
  if(!startsAt||Number.isNaN(date.getTime())||!/(Z|[+-]\d{2}:?\d{2})$/i.test(startsAt))throw fail(400,"Choose a valid event date and time.");
  if(date.getTime()<clock().getTime()-60000||date.getTime()>clock().getTime()+366*86400000)throw fail(400,"Events must be scheduled from now up to one year ahead.");
  if(![0,5,10,15,30,60,1440].includes(reminder))throw fail(400,"Choose a supported reminder interval.");
  const event=await db.withTransaction(async tx=>{await requireMember(tx,g,user);const e=await tx.one("INSERT INTO group_events(group_id,created_by,title,description,starts_at,location,reminder_minutes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[g,user,title,description,date.toISOString(),location,reminder]);await activity(tx,g,user,"event_created",null,title);return e;});
  return {message:"Group event created.",eventId:String(event.id)};
 }
 async function rsvp(g,eventId,user,response){
  if(!["going","maybe","not_going"].includes(response))throw fail(400,"Choose Going, Maybe or Not going.");
  return db.withTransaction(async tx=>{await requireMember(tx,g,user);const e=await tx.one("SELECT id,status FROM group_events WHERE id=$1 AND group_id=$2",[eventId,g]);if(!e)throw fail(404,"Event not found.");if(e.status!=="scheduled")throw fail(409,"This event is cancelled; RSVPs are closed.");await tx.execute("INSERT INTO group_event_rsvps(event_id,user_id,response) VALUES($1,$2,$3) ON CONFLICT(event_id,user_id) DO UPDATE SET response=EXCLUDED.response,updated_at=CURRENT_TIMESTAMP",[eventId,user,response]);return {message:"Your RSVP has been saved.",response};});
 }
 async function cancelEvent(g,eventId,user){
  return db.withTransaction(async tx=>{const me=await requireMember(tx,g,user);const e=await tx.one("SELECT id,created_by AS \"createdBy\",status,title FROM group_events WHERE id=$1 AND group_id=$2 FOR UPDATE",[eventId,g]);if(!e)throw fail(404,"Event not found.");if(String(e.createdBy)!==String(user)&&me.role!=="admin")throw fail(403,"Only the event creator or a group admin can cancel this event.");if(e.status!=="cancelled"){await tx.execute("UPDATE group_events SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,cancelled_by=$1 WHERE id=$2",[user,eventId]);await activity(tx,g,user,"event_cancelled",null,e.title);}return {message:"Event cancelled. Its details and RSVP list remain visible."};});
 }
 async function deliverDueEventReminders({now=null,batchSize=200}={}){
  const at=now?new Date(now):clock();if(Number.isNaN(at.getTime()))throw fail(400,"Invalid reminder processing time.");
  return db.withTransaction(async tx=>{
   const due=await tx.many("SELECT e.id AS \"eventId\",e.group_id AS \"groupId\",e.title,e.starts_at AS \"startsAt\",e.reminder_minutes AS \"reminderMinutes\",gm.user_id AS \"userId\" FROM group_events e JOIN group_members gm ON gm.group_id=e.group_id WHERE e.status='scheduled' AND e.reminder_minutes>0 AND e.starts_at>=$1::timestamptz AND e.starts_at- make_interval(mins=>e.reminder_minutes)<=$1::timestamptz AND e.starts_at>$1::timestamptz AND NOT EXISTS(SELECT 1 FROM group_event_reminder_deliveries d WHERE d.event_id=e.id AND d.user_id=gm.user_id) ORDER BY e.starts_at,e.id LIMIT $2 FOR UPDATE OF e SKIP LOCKED",[at.toISOString(),Math.max(1,Math.min(Number(batchSize)||200,1000))]);
   let delivered=0;
   for(const item of due){const claim=await tx.one("INSERT INTO group_event_reminder_deliveries(event_id,user_id) VALUES($1,$2) ON CONFLICT(event_id,user_id) DO NOTHING RETURNING event_id",[item.eventId,item.userId]);if(!claim)continue;
    await tx.execute("INSERT INTO notifications(user_id,actor_id,type,entity_id,message) VALUES($1,NULL,'group_event_reminder',$2,$3)",[item.userId,String(item.eventId),"Reminder: "+item.title+" is scheduled for "+new Date(item.startsAt).toISOString()]);delivered++;
   }
   return {delivered};
  });
 }
 return Object.freeze({changeRole,leave,removeMember,updateDetails,getDetails,listActivity,createInvitation,listInvitations,revokeInvitation,previewInvitation,joinByInvitation,listJoinRequests,reviewJoinRequest,listPolls,createPoll,votePoll,closePoll,listEvents,createEvent,rsvp,cancelEvent,deliverDueEventReminders});
}
module.exports={createPostgresGroupGovernanceService};
