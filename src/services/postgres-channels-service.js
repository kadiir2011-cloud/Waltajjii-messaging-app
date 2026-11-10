"use strict";
function createPostgresChannelsService({db}={}) {
 if(!db||!["one","many","execute","withTransaction"].every(k=>typeof db[k]==="function"))throw new TypeError("A PostgreSQL adapter is required.");
 const fail=(status,message)=>Object.assign(new Error(message),{status}),validId=v=>/^[1-9][0-9]*$/.test(String(v??""));
 const allowedEmojis=new Set(["👍","❤️","😂","😮","😢","🙏","🎉","🔥","👏","💯"]);
 async function membership(cid,uid,tx=db){return tx.one('SELECT role,joined_at AS "joinedAt" FROM channel_members WHERE channel_id=$1 AND user_id=$2',[cid,uid]);}
 async function requireMember(cid,uid,tx=db){const m=await membership(cid,uid,tx);if(!m)throw fail(404,"Channel not found.");return m;}
 async function requireAdmin(cid,uid,tx=db){const m=await requireMember(cid,uid,tx);if(!["owner","admin"].includes(m.role))throw fail(403,"Only channel admins can perform this action.");return m;}
 async function listChannels(uid){return db.many(\`
 SELECT c.id,c.name,c.description,c.visibility,c.created_at AS "createdAt",u.username AS owner,
 (SELECT COUNT(*)::int FROM channel_members cm WHERE cm.channel_id=c.id) AS "memberCount",mine.role AS "myRole"
 FROM channels c JOIN users u ON u.id=c.created_by LEFT JOIN channel_members mine ON mine.channel_id=c.id AND mine.user_id=$1
 WHERE c.visibility='public' OR mine.user_id IS NOT NULL ORDER BY c.id DESC LIMIT 100\`,[uid]);}
 async function createChannel(uid,input={}) {
  const name=String(input.name||"").trim(),description=String(input.description||"").trim(),visibility=input.visibility==="private"?"private":"public";
  if(!name||name.length>80)throw fail(400,"Channel name must be 1–80 characters.");
  if(description.length>300)throw fail(400,"Description must be 300 characters or fewer.");
  return db.withTransaction(async tx=>{const channel=await tx.one('INSERT INTO channels(name,description,visibility,created_by) VALUES($1,$2,$3,$4) RETURNING id,name,description,visibility,created_by AS "createdBy",created_at AS "createdAt"',[name,description,visibility,uid]);await tx.execute("INSERT INTO channel_members(channel_id,user_id,role) VALUES($1,$2,'owner')",[channel.id,uid]);return{channel,memberIds:[String(uid)]};});
 }
 async function joinChannel(cid,uid){if(!validId(cid))throw fail(404,"Public channel not found.");return db.withTransaction(async tx=>{const c=await tx.one("SELECT id,visibility FROM channels WHERE id=$1",[cid]);if(!c||c.visibility!=="public")throw fail(404,"Public channel not found.");if(await membership(cid,uid,tx))return{joined:false,channelId:String(cid)};await tx.execute("INSERT INTO channel_members(channel_id,user_id,role) VALUES($1,$2,'member')",[cid,uid]);return{joined:true,channelId:String(cid)};});}
 async function listMembers(cid,uid){const me=await requireMember(cid,uid);const members=await db.many(\`SELECT u.id,u.username,cm.role,cm.joined_at AS "joinedAt" FROM channel_members cm JOIN users u ON u.id=cm.user_id WHERE cm.channel_id=$1 ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.username\`,[cid]);return{members,canManage:["owner","admin"].includes(me.role)};}
 async function addMember(cid,actor,username){return db.withTransaction(async tx=>{await requireAdmin(cid,actor,tx);const u=await tx.one("SELECT id FROM users WHERE LOWER(username)=LOWER($1)",[String(username||"").trim()]);if(!u)throw fail(404,"User not found.");try{await tx.execute("INSERT INTO channel_members(channel_id,user_id,role) VALUES($1,$2,'member')",[cid,u.id]);}catch(e){if(e.code==="23505")throw fail(409,"That user is already a channel member.");throw e;}return{userId:String(u.id)};});}
 async function removeMember(cid,actor,target){return db.withTransaction(async tx=>{await requireAdmin(cid,actor,tx);const m=await membership(cid,target,tx);if(!m)throw fail(404,"Channel member not found.");if(m.role==="owner")throw fail(400,"The channel owner cannot be removed.");await tx.execute("DELETE FROM channel_members WHERE channel_id=$1 AND user_id=$2",[cid,target]);return{userId:String(target)};});}
 async function messageById(tx,cid,mid,viewer) {
  const m=await tx.one(\`SELECT cm.id,cm.channel_id AS "channelId",cm.sender_id AS "senderId",u.username AS sender,
   CASE WHEN cm.deleted_at IS NOT NULL THEN 'This message was deleted' ELSE cm.body END AS body,
   CASE WHEN cm.deleted_at IS NOT NULL THEN NULL ELSE cm.media_path END AS "mediaPath",
   CASE WHEN cm.deleted_at IS NOT NULL THEN NULL ELSE cm.media_type END AS "mediaType",
   cm.created_at AS "createdAt",cm.edited_at AS "editedAt",cm.deleted_at AS "deletedAt",
   cm.pinned_at AS "pinnedAt",cm.pinned_by AS "pinnedBy",pu.username AS "pinnedByUsername"
   FROM channel_messages cm JOIN users u ON u.id=cm.sender_id LEFT JOIN users pu ON pu.id=cm.pinned_by
   WHERE cm.channel_id=$1 AND cm.id=$2\`,[cid,mid]);
  if(!m)return null;
  const [reactions,receipts]=await Promise.all([
   tx.many(\`SELECT emoji,COUNT(*)::int AS count,BOOL_OR(user_id=$1) AS "reactedByMe"
    FROM channel_message_reactions WHERE channel_message_id=$2 GROUP BY emoji ORDER BY emoji\`,[viewer,mid]),
   tx.many(\`SELECT u.id AS "userId",u.username,r.delivered_at AS "deliveredAt",r.read_at AS "readAt"
    FROM channel_message_receipts r JOIN users u ON u.id=r.user_id
    WHERE r.channel_message_id=$1 ORDER BY u.username\`,[mid])
  ]);
  m.reactions=reactions.map(x=>({...x,reactedByMe:Boolean(x.reactedByMe)}));m.receipts=receipts;return m;
 }
 async function getMessages(cid,uid) {
  const me=await requireMember(cid,uid);
  await db.execute(\`UPDATE channel_message_receipts SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP)
    WHERE user_id=$1 AND delivered_at IS NULL AND channel_message_id IN
    (SELECT id FROM channel_messages WHERE channel_id=$2 AND sender_id<>$1)\`,[uid,cid]);
  await db.execute(\`UPDATE channel_message_receipts SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP),
    delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP)
    WHERE user_id=$1 AND read_at IS NULL AND channel_message_id IN
    (SELECT id FROM channel_messages WHERE channel_id=$2 AND sender_id<>$1)\`,[uid,cid]);
  const rows=await db.many("SELECT id FROM channel_messages WHERE channel_id=$1 ORDER BY id DESC LIMIT 200",[cid]);
  const messages=[];for(const row of rows.reverse())messages.push(await messageById(db,cid,row.id,uid));
  return{messages,canPublish:["owner","admin"].includes(me.role)};
 }
 async function publishMessage(cid,uid,input={}) {
  let body=String(input.body||"").trim();const mediaPath=String(input.mediaPath||"").trim(),mediaType=String(input.mediaType||"").trim();
  if(body.length>4000||(!body&&!mediaPath))throw fail(400,"Write an announcement or attach media (maximum 4000 characters).");
  if(mediaPath&&!/^[0-9a-f-]+\\.(jpg|jpeg|png|webp|gif|mp4|webm|ogg|m4a|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(mediaPath))throw fail(400,"Invalid media file.");
  if(mediaPath&&!["image","video","audio","document"].includes(mediaType))throw fail(400,"Invalid media type.");
  if(!body)body=mediaType==="video"?"[Video]":mediaType==="audio"?"[Audio]":mediaType==="document"?"[Document]":"[Image]";
  return db.withTransaction(async tx=>{
   await requireAdmin(cid,uid,tx);
   const m=await tx.one(\`INSERT INTO channel_messages(channel_id,sender_id,body,media_path,media_type)
    VALUES($1,$2,$3,$4,$5) RETURNING id\`,[cid,uid,body,mediaPath||null,mediaPath?mediaType:null]);
   await tx.execute(\`INSERT INTO channel_message_receipts(channel_message_id,user_id)
    SELECT $1,user_id FROM channel_members WHERE channel_id=$2 AND user_id<>$3
    ON CONFLICT(channel_message_id,user_id) DO NOTHING\`,[m.id,cid,uid]);
   return{message:await messageById(tx,cid,m.id,uid)};
  });
 }
 async function markDelivered(cid,mid,uid) {
  await requireMember(cid,uid);
  const m=await db.one("SELECT id,sender_id AS sender FROM channel_messages WHERE channel_id=$1 AND id=$2",[cid,mid]);
  if(!m||String(m.sender)===String(uid))throw fail(404,"Message not found for this recipient.");
  const n=await db.execute("UPDATE channel_message_receipts SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP) WHERE channel_message_id=$1 AND user_id=$2 AND delivered_at IS NULL",[mid,uid]);
  return{delivered:true,updated:n>0};
 }
 async function markRead(cid,mid,uid) {
  await requireMember(cid,uid);
  const m=await db.one("SELECT id,sender_id AS sender FROM channel_messages WHERE channel_id=$1 AND id=$2",[cid,mid]);
  if(!m||String(m.sender)===String(uid))throw fail(404,"Message not found for this recipient.");
  const n=await db.execute("UPDATE channel_message_receipts SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP),read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE channel_message_id=$1 AND user_id=$2 AND read_at IS NULL",[mid,uid]);
  return{read:true,updated:n>0};
 }
 async function toggleReaction(cid,mid,uid,emoji) {
  if(!allowedEmojis.has(emoji))throw fail(400,"Choose a supported reaction.");
  return db.withTransaction(async tx=>{await requireMember(cid,uid,tx);const m=await tx.one("SELECT id FROM channel_messages WHERE channel_id=$1 AND id=$2 AND deleted_at IS NULL",[cid,mid]);if(!m)throw fail(404,"Message not found.");const old=await tx.one("SELECT 1 FROM channel_message_reactions WHERE channel_message_id=$1 AND user_id=$2 AND emoji=$3",[mid,uid,emoji]);if(old)await tx.execute("DELETE FROM channel_message_reactions WHERE channel_message_id=$1 AND user_id=$2 AND emoji=$3",[mid,uid,emoji]);else await tx.execute("INSERT INTO channel_message_reactions(channel_message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[mid,uid,emoji]);return{message:await messageById(tx,cid,mid,uid)};});
 }
 async function editMessage(cid,mid,uid,body) {
  body=String(body||"").trim();if(!body||body.length>4000)throw fail(400,"Message must contain 1–4000 characters.");
  return db.withTransaction(async tx=>{await requireMember(cid,uid,tx);const m=await tx.one("SELECT sender_id AS sender,media_path AS media,\"deletedAt\" FROM (SELECT sender_id,media_path,deleted_at AS \"deletedAt\" FROM channel_messages WHERE channel_id=$1 AND id=$2) x",[cid,mid]);if(!m)throw fail(404,"Message not found.");if(String(m.sender)!==String(uid))throw fail(403,"Only the sender can edit this message.");if(m.media||m.deletedAt)throw fail(400,"Only active text messages can be edited.");await tx.execute("UPDATE channel_messages SET body=$1,edited_at=CURRENT_TIMESTAMP WHERE channel_id=$2 AND id=$3",[body,cid,mid]);return{message:await messageById(tx,cid,mid,uid)};});
 }
 async function deleteMessage(cid,mid,uid) {
  return db.withTransaction(async tx=>{const me=await requireMember(cid,uid,tx);const m=await tx.one("SELECT sender_id AS sender FROM channel_messages WHERE channel_id=$1 AND id=$2",[cid,mid]);if(!m)throw fail(404,"Message not found.");if(String(m.sender)!==String(uid)&&!["owner","admin"].includes(me.role))throw fail(403,"Only the sender or a channel admin can delete this message.");await tx.execute("UPDATE channel_messages SET body='This message was deleted',media_path=NULL,media_type=NULL,deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP),deleted_by=$1 WHERE id=$2",[uid,mid]);await tx.execute("DELETE FROM channel_message_reactions WHERE channel_message_id=$1",[mid]);return{message:await messageById(tx,cid,mid,uid)};});
 }
 async function pinMessage(cid,mid,uid,pin=true) {
  await requireAdmin(cid,uid);
  if(pin){const m=await db.one("SELECT id FROM channel_messages WHERE channel_id=$1 AND id=$2 AND deleted_at IS NULL",[cid,mid]);if(!m)throw fail(404,"Active channel message not found.");await db.execute("UPDATE channel_messages SET pinned_at=CURRENT_TIMESTAMP,pinned_by=$1 WHERE channel_id=$2 AND id=$3",[uid,cid,mid]);}
  else {const n=await db.execute("UPDATE channel_messages SET pinned_at=NULL,pinned_by=NULL WHERE channel_id=$1 AND id=$2 AND pinned_at IS NOT NULL",[cid,mid]);if(!n)throw fail(404,"Pinned message not found.");}
  return{message:await messageById(db,cid,mid,uid)};
 }
 async function leaveChannel(cid,uid){return db.withTransaction(async tx=>{const m=await membership(cid,uid,tx);if(!m)throw fail(404,"Channel membership not found.");if(m.role==="owner")throw fail(400,"The owner must transfer ownership before leaving.");await tx.execute("DELETE FROM channel_members WHERE channel_id=$1 AND user_id=$2",[cid,uid]);return{left:true};});}
 return Object.freeze({listChannels,createChannel,joinChannel,listMembers,addMember,removeMember,getMessages,publishMessage,markDelivered,markRead,toggleReaction,editMessage,deleteMessage,pinMessage,leaveChannel});
}
module.exports={createPostgresChannelsService};
