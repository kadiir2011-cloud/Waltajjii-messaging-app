"use strict";
function createPostgresMomentsService({db}={}) {
 if(!db||!["one","many","execute","withTransaction"].every(k=>typeof db[k]==="function"))throw new TypeError("A PostgreSQL adapter is required.");
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 const momentFields="m.id,m.user_id AS \"userId\",u.username,u.full_name AS \"fullName\",u.avatar_path AS \"avatarPath\",m.content,m.media_path AS \"mediaPath\",m.media_type AS \"mediaType\",m.audience,m.created_at AS \"createdAt\",m.expires_at AS \"expiresAt\"";
 async function cleanupExpired(){
  return db.withTransaction(async tx=>{
   const expired=await tx.many("SELECT id,media_path AS \"mediaPath\" FROM moments WHERE expires_at<=CURRENT_TIMESTAMP AND media_path IS NOT NULL ORDER BY id");
   await tx.execute("DELETE FROM moments WHERE expires_at<=CURRENT_TIMESTAMP");
   return expired.map(x=>x.mediaPath).filter(Boolean);
  });
 }
 async function listVisible(viewerId){
  return db.many("SELECT "+momentFields+",(m.user_id=$1) AS \"isMine\" FROM moments m JOIN users u ON u.id=m.user_id WHERE m.expires_at>CURRENT_TIMESTAMP AND (m.user_id=$1 OR m.audience='everyone' OR (m.audience='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=m.user_id))) ORDER BY m.created_at DESC,m.id DESC LIMIT 100",[viewerId]);
 }
 async function create(viewerId,input={}){
  const content=String(input.content||"").trim(),audience=String(input.audience||"followers"),mediaPath=input.mediaPath?String(input.mediaPath):null,mediaType=input.mediaType?String(input.mediaType):null;
  if(content.length>500)throw fail(400,"Moment text must be 500 characters or fewer.");
  if(!["everyone","followers"].includes(audience))throw fail(400,"Choose a valid Moment audience.");
  if(!content&&!mediaPath)throw fail(400,"Add text or choose a photo/video.");
  if(mediaPath&&!/^[1-9][0-9]*$/.test(mediaPath))throw fail(400,"Invalid Moment media file.");
  if(mediaPath&&!["image","video"].includes(mediaType))throw fail(400,"Invalid Moment media type.");
  if(!mediaPath&&mediaType)throw fail(400,"Moment media type requires a media file.");
  if(mediaPath){
   const ownedMedia=await db.one("SELECT id FROM media_objects WHERE id=$1 AND owner_id=$2 AND purpose='moment' AND deleted_at IS NULL",[mediaPath,String(viewerId)]);
   if(!ownedMedia)throw fail(400,"This Moment media file is unavailable or does not belong to your account.");
  }
  const moment=await db.one("INSERT INTO moments(user_id,content,media_path,media_type,audience) VALUES($1,$2,$3,$4,$5) RETURNING id,user_id AS \"userId\",content,media_path AS \"mediaPath\",media_type AS \"mediaType\",audience,created_at AS \"createdAt\",expires_at AS \"expiresAt\"",[viewerId,content,mediaPath,mediaType,audience]);
  const user=await db.one("SELECT username,full_name AS \"fullName\",avatar_path AS \"avatarPath\" FROM users WHERE id=$1",[viewerId]);
  return {moment:{...moment,...user,isMine:true}};
 }
 async function getVisibleMedia(viewerId,momentId){
  if(!/^[1-9][0-9]*$/.test(String(momentId)))throw fail(400,"Invalid Moment.");
  const moment=await db.one("SELECT m.id,m.media_path AS \"mediaPath\",m.media_type AS \"mediaType\",m.user_id AS \"ownerId\",m.audience FROM moments m WHERE m.id=$1 AND m.expires_at>CURRENT_TIMESTAMP AND m.media_path IS NOT NULL AND (m.user_id=$2 OR m.audience='everyone' OR (m.audience='followers' AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.following_id=m.user_id)))",[momentId,viewerId]);
  if(!moment)throw fail(404,"Moment not found or expired.");
  return moment;
 }
 async function deleteOwn(viewerId,momentId){
  if(!/^[1-9][0-9]*$/.test(String(momentId)))throw fail(400,"Invalid Moment.");
  const deleted=await db.one("DELETE FROM moments WHERE id=$1 AND user_id=$2 RETURNING id,media_path AS \"mediaPath\"",[momentId,viewerId]);
  if(!deleted)throw fail(404,"Moment not found.");
  return deleted;
 }
 return Object.freeze({cleanupExpired,listVisible,create,getVisibleMedia,deleteOwn});
}
module.exports={createPostgresMomentsService};
