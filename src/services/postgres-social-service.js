"use strict";
function createPostgresSocialService({db}={}) {
 if(!db||!["one","many","execute","withTransaction"].every(k=>typeof db[k]==="function"))throw new TypeError("A PostgreSQL adapter is required.");
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 const profileSql="SELECT u.id,u.username,u.full_name AS \"fullName\",CASE WHEN u.profile_mode IN ('personal','both') THEN u.bio ELSE '' END AS bio,CASE WHEN u.profile_mode IN ('professional','both') THEN u.professional_title ELSE '' END AS \"professionalTitle\",CASE WHEN u.profile_mode IN ('professional','both') THEN u.organization ELSE '' END AS organization,CASE WHEN u.profile_mode IN ('professional','both') THEN u.department ELSE '' END AS department,CASE WHEN u.profile_mode IN ('professional','both') THEN u.location ELSE '' END AS location,CASE WHEN u.profile_mode IN ('professional','both') THEN u.website ELSE '' END AS website,u.avatar_path AS \"avatarPath\",u.profile_background AS \"profileBackground\" FROM users u";
 const notify=async(tx,userId,actorId,type,entityId,message)=>{if(String(userId)!==String(actorId))await tx.execute("INSERT INTO notifications(user_id,actor_id,type,entity_id,message) VALUES($1,$2,$3,$4,$5)",[userId,actorId,type,entityId==null?null:String(entityId),message]);};
 async function discover(viewerId,rawSearch=""){
  const search=String(rawSearch||"").trim().slice(0,80),pattern="%"+search+"%";
  return db.many("SELECT p.*,EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.id) AS \"isFollowing\",(SELECT COUNT(*)::int FROM follows f WHERE f.following_id=p.id) AS \"followersCount\",(SELECT COUNT(*)::int FROM follows f WHERE f.follower_id=p.id) AS \"followingCount\",(SELECT id FROM connection_requests cr WHERE cr.requester_id=p.id AND cr.recipient_id=$1 AND cr.status='pending' ORDER BY cr.id DESC LIMIT 1) AS \"incomingRequestId\",(SELECT status FROM connection_requests cr WHERE (cr.requester_id=$1 AND cr.recipient_id=p.id) OR (cr.requester_id=p.id AND cr.recipient_id=$1) ORDER BY cr.id DESC LIMIT 1) AS \"connectionStatus\" FROM ("+profileSql+") p WHERE p.id<>$1 AND ($2='' OR p.username ILIKE $3 OR p.\"fullName\" ILIKE $3 OR p.bio ILIKE $3 OR p.\"professionalTitle\" ILIKE $3 OR p.organization ILIKE $3 OR p.department ILIKE $3) ORDER BY LOWER(p.username) LIMIT 50",[viewerId,search,pattern]);
 }
 async function follow(viewerId,targetId){
  if(!/^[1-9][0-9]*$/.test(String(targetId))||String(targetId)===String(viewerId))throw fail(400,"Choose a valid member to follow.");
  return db.withTransaction(async tx=>{const target=await tx.one("SELECT id,username FROM users WHERE id=$1",[targetId]);if(!target)throw fail(404,"Member not found.");const inserted=await tx.one("INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT(follower_id,following_id) DO NOTHING RETURNING follower_id",[viewerId,targetId]);if(inserted)await notify(tx,targetId,viewerId,"follow",targetId,"started following you");return {message:"You are now following "+target.username+"."};});
 }
 async function unfollow(viewerId,targetId){if(!/^[1-9][0-9]*$/.test(String(targetId)))throw fail(400,"Invalid member.");await db.execute("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2",[viewerId,targetId]);return {message:"You have unfollowed this member."};}
 async function connect(viewerId,targetId){
  if(!/^[1-9][0-9]*$/.test(String(targetId))||String(targetId)===String(viewerId))throw fail(400,"Choose a valid member.");
  return db.withTransaction(async tx=>{
   const ids=[String(viewerId),String(targetId)].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
   const locked=await tx.many("SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE",[ids]);if(locked.length!==2)throw fail(404,"Member not found.");
   const target=await tx.one("SELECT id,username FROM users WHERE id=$1",[targetId]);
   const incoming=await tx.one("SELECT id FROM connection_requests WHERE requester_id=$1 AND recipient_id=$2 AND status='pending' ORDER BY id DESC LIMIT 1",[targetId,viewerId]);
   if(incoming)throw fail(409,"This member has already requested to connect. Please respond to their request.");
   const existing=await tx.one("SELECT id,status FROM connection_requests WHERE requester_id=$1 AND recipient_id=$2 ORDER BY id DESC LIMIT 1",[viewerId,targetId]);
   if(existing&&existing.status==="pending")throw fail(409,"Your connection request is already pending.");
   if(existing&&existing.status==="accepted")throw fail(409,"You are already connected.");
   const request=await tx.one("INSERT INTO connection_requests(requester_id,recipient_id,status) VALUES($1,$2,'pending') RETURNING id",[viewerId,targetId]);
   await notify(tx,targetId,viewerId,"connection_request",request.id,"sent you a connection request");
   return {message:"Connection request sent to "+target.username+"."};
  });
 }
 async function listRequests(viewerId){
  const incoming=await db.many("SELECT cr.id,cr.created_at AS \"createdAt\",u.id AS \"userId\",u.username,u.full_name AS \"fullName\",CASE WHEN u.profile_mode IN ('personal','both') THEN u.bio ELSE '' END AS bio,CASE WHEN u.profile_mode IN ('professional','both') THEN u.professional_title ELSE '' END AS \"professionalTitle\",CASE WHEN u.profile_mode IN ('professional','both') THEN u.organization ELSE '' END AS organization,u.avatar_path AS \"avatarPath\" FROM connection_requests cr JOIN users u ON u.id=cr.requester_id WHERE cr.recipient_id=$1 AND cr.status='pending' ORDER BY cr.id DESC LIMIT 50",[viewerId]);
  const outgoing=await db.many("SELECT cr.id,cr.created_at AS \"createdAt\",u.id AS \"userId\",u.username,u.full_name AS \"fullName\" FROM connection_requests cr JOIN users u ON u.id=cr.recipient_id WHERE cr.requester_id=$1 AND cr.status='pending' ORDER BY cr.id DESC LIMIT 50",[viewerId]);return {incoming,outgoing};
 }
 async function respondRequest(viewerId,requestId,action){
  if(!/^[1-9][0-9]*$/.test(String(requestId))||!["accept","decline"].includes(action))throw fail(400,"Choose accept or decline.");
  return db.withTransaction(async tx=>{const request=await tx.one("SELECT id,requester_id AS \"requesterId\",recipient_id AS \"recipientId\" FROM connection_requests WHERE id=$1 AND recipient_id=$2 AND status='pending' FOR UPDATE",[requestId,viewerId]);if(!request)throw fail(404,"Pending request not found.");
   if(action==="accept"){await tx.execute("UPDATE connection_requests SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[requestId]);await tx.execute("INSERT INTO follows(follower_id,following_id) VALUES($1,$2),($2,$1) ON CONFLICT(follower_id,following_id) DO NOTHING",[request.requesterId,request.recipientId]);await notify(tx,request.requesterId,viewerId,"connection_accepted",requestId,"accepted your connection request");return {message:"Connection accepted."};}
   await tx.execute("UPDATE connection_requests SET status='declined',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[requestId]);return {message:"Request declined."};
  });
 }
 async function followers(viewerId){return db.many(profileSql+" JOIN follows f ON f.follower_id=u.id WHERE f.following_id=$1 ORDER BY LOWER(u.username) LIMIT 100",[viewerId]);}
 async function following(viewerId){return db.many(profileSql+" JOIN follows f ON f.following_id=u.id WHERE f.follower_id=$1 ORDER BY LOWER(u.username) LIMIT 100",[viewerId]);}
 async function feed(viewerId){
  return db.many("SELECT p.id,p.user_id AS \"userId\",u.username,u.full_name AS \"fullName\",u.avatar_path AS \"avatarPath\",p.content,p.created_at AS \"createdAt\",(SELECT COUNT(*)::int FROM post_likes l WHERE l.post_id=p.id) AS \"likeCount\",(SELECT COUNT(*)::int FROM post_comments c WHERE c.post_id=p.id) AS \"commentCount\",EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS \"likedByMe\" FROM posts p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 OR p.user_id IN(SELECT following_id FROM follows WHERE follower_id=$1) ORDER BY p.id DESC LIMIT 50",[viewerId]);
 }
 async function createPost(viewerId,rawContent){
  const content=String(rawContent||"").trim();if(!content||content.length>2000)throw fail(400,"A post must contain 1–2000 characters.");
  const post=await db.one("INSERT INTO posts(user_id,content) VALUES($1,$2) RETURNING id,user_id AS \"userId\",content,created_at AS \"createdAt\"",[viewerId,content]);
  const user=await db.one("SELECT username,full_name AS \"fullName\" FROM users WHERE id=$1",[viewerId]);return {post:{...post,username:user.username,fullName:user.fullName,likeCount:0,commentCount:0,likedByMe:false}};
 }
 async function toggleLike(viewerId,postId){
  if(!/^[1-9][0-9]*$/.test(String(postId)))throw fail(400,"Invalid post.");
  return db.withTransaction(async tx=>{const post=await tx.one("SELECT id,user_id AS \"userId\" FROM posts WHERE id=$1",[postId]);if(!post)throw fail(404,"Post not found.");
   const removed=await tx.one("DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2 RETURNING post_id",[postId,viewerId]);if(removed)return {liked:false,message:"Like removed."};
   const added=await tx.one("INSERT INTO post_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT(post_id,user_id) DO NOTHING RETURNING post_id",[postId,viewerId]);if(added)await notify(tx,post.userId,viewerId,"like",postId,"liked your post");return {liked:Boolean(added),message:"Post liked."};
  });
 }
 async function listComments(postId){
  if(!/^[1-9][0-9]*$/.test(String(postId)))throw fail(400,"Invalid post.");if(!await db.one("SELECT id FROM posts WHERE id=$1",[postId]))throw fail(404,"Post not found.");
  const comments=await db.many("SELECT c.id,c.user_id AS \"userId\",u.username,u.full_name AS \"fullName\",c.content,c.created_at AS \"createdAt\" FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 ORDER BY c.id ASC LIMIT 100",[postId]);return {comments};
 }
 async function createComment(viewerId,postId,rawContent){
  if(!/^[1-9][0-9]*$/.test(String(postId)))throw fail(400,"Invalid post.");const content=String(rawContent||"").trim();if(!content||content.length>1000)throw fail(400,"A comment must contain 1–1000 characters.");
  return db.withTransaction(async tx=>{const post=await tx.one("SELECT id,user_id AS \"userId\" FROM posts WHERE id=$1",[postId]);if(!post)throw fail(404,"Post not found.");
   const comment=await tx.one("INSERT INTO post_comments(post_id,user_id,content) VALUES($1,$2,$3) RETURNING id,user_id AS \"userId\",content,created_at AS \"createdAt\"",[postId,viewerId,content]);const user=await tx.one("SELECT username,full_name AS \"fullName\" FROM users WHERE id=$1",[viewerId]);await notify(tx,post.userId,viewerId,"comment",postId,"commented on your post");return {comment:{...comment,username:user.username,fullName:user.fullName}};
  });
 }
 async function listNotifications(viewerId){
  const notifications=await db.many("SELECT n.id,n.type,n.entity_id AS \"entityId\",n.message,n.is_read AS \"isRead\",n.created_at AS \"createdAt\",u.username AS \"actorUsername\",u.full_name AS \"actorFullName\" FROM notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 100",[viewerId]);return {notifications:notifications.map(n=>({...n,isRead:Boolean(n.isRead)}))};
 }
 async function markNotificationsRead(viewerId){await db.execute("UPDATE notifications SET is_read=1 WHERE user_id=$1 AND is_read=0",[viewerId]);return {message:"Notifications marked as read."};}
 return Object.freeze({discover,follow,unfollow,connect,listRequests,respondRequest,followers,following,feed,createPost,toggleLike,listComments,createComment,listNotifications,markNotificationsRead});
}
module.exports={createPostgresSocialService};
