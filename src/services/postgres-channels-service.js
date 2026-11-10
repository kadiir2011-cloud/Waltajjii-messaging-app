"use strict";
function createPostgresChannelsService({db}={}) {
 if(!db||!["one","many","execute","withTransaction"].every(k=>typeof db[k]==="function"))throw new TypeError("A PostgreSQL adapter is required.");
 const fail=(status,message)=>Object.assign(new Error(message),{status}),validId=v=>/^[1-9][0-9]*$/.test(String(v??""));
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
 async function getMessages(cid,uid){await requireMember(cid,uid);const messages=await db.many(\`SELECT cm.id,cm.channel_id AS "channelId",cm.sender_id AS "senderId",u.username AS sender,cm.body,cm.created_at AS "createdAt" FROM channel_messages cm JOIN users u ON u.id=cm.sender_id WHERE cm.channel_id=$1 ORDER BY cm.id DESC LIMIT 200\`,[cid]);messages.reverse();const me=await membership(cid,uid);return{messages,canPublish:["owner","admin"].includes(me.role)};}
 async function publishMessage(cid,uid,input={}){const body=String(input.body||"").trim();if(!body||body.length>4000)throw fail(400,"Announcement must contain 1–4000 characters.");return db.withTransaction(async tx=>{await requireAdmin(cid,uid,tx);const m=await tx.one('INSERT INTO channel_messages(channel_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,channel_id AS "channelId",sender_id AS "senderId",body,created_at AS "createdAt"',[cid,uid,body]);const u=await tx.one("SELECT username FROM users WHERE id=$1",[uid]);m.sender=u.username;return{message:m};});}
 async function leaveChannel(cid,uid){return db.withTransaction(async tx=>{const m=await membership(cid,uid,tx);if(!m)throw fail(404,"Channel membership not found.");if(m.role==="owner")throw fail(400,"The owner must transfer ownership before leaving.");await tx.execute("DELETE FROM channel_members WHERE channel_id=$1 AND user_id=$2",[cid,uid]);return{left:true};});}
 return Object.freeze({listChannels,createChannel,joinChannel,listMembers,addMember,removeMember,getMessages,publishMessage,leaveChannel});
}
module.exports={createPostgresChannelsService};
