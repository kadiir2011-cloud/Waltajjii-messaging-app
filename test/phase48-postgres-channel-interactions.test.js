"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http"),express=require("express"),{Pool}=require("pg"),jwt=require("jsonwebtoken");
const {createPostgresAdapter}=require("../src/db/postgres-adapter"),{createPostgresChannelsService}=require("../src/services/postgres-channels-service"),{createPostgresChannelsRouter}=require("../src/routes/postgres-channels");
const connectionString=process.env.TEST_DATABASE_URL;if(!connectionString)throw new Error("TEST_DATABASE_URL must point only to disposable CI PostgreSQL");
const pool=new Pool({connectionString,max:4,options:"-c search_path=waltajjii,public"}),db=createPostgresAdapter(pool),service=createPostgresChannelsService({db}),secret="phase48-disposable-test-secret-at-least-32-characters";
let server,base,users=[],channelIds=[];const token=u=>jwt.sign({userId:String(u.id),username:u.username},secret,{expiresIn:"1h",issuer:"waltajjii",audience:"waltajjii-users"});
async function request(url,user,options={}){const headers={...(options.body?{"content-type":"application/json"}:{}),...(user?{authorization:"Bearer "+token(user)}:{})};const response=await fetch(base+url,{...options,headers});let data={};try{data=await response.json();}catch{}return{status:response.status,data};}
test("Phase 48: channel reactions, receipts, editing, deletion, pinning and media metadata",async()=>{
 await pool.query(fs.readFileSync(path.join(__dirname,"..","migrations/postgres/001_initial_schema.sql"),"utf8"));
 await pool.query(fs.readFileSync(path.join(__dirname,"..","migrations/postgres/002_channel_message_interactions.sql"),"utf8"));
 await pool.query(fs.readFileSync(path.join(__dirname,"..","migrations/postgres/003_media_objects.sql"),"utf8"));
 const suffix=Date.now();for(const username of ["p48_owner_"+suffix,"p48_member_"+suffix,"p48_admin_"+suffix])users.push(await db.one("INSERT INTO users(username,password_hash) VALUES($1,'test-hash') RETURNING id,username",[username]));
 const [owner,member,adminUser]=users;
 const ownerMedia=await db.one("INSERT INTO media_objects(owner_id,bucket,object_key,purpose,mime_type,file_size) VALUES($1,'waltajjii-media',$2,'message','application/pdf',256) RETURNING id",[owner.id,"phase48/"+owner.id+".pdf"]);
 const app=express();app.use(express.json({limit:"30kb"}));app.use("/api/channels",createPostgresChannelsRouter({channelsService:service,jwtSecret:secret}));
 const emitted=[];app.set("io",{in(room){return{socketsJoin(target){emitted.push({room,target});}};},to(room){return{emit(event,payload){emitted.push({room,event,payload});}};}});
 server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));base="http://127.0.0.1:"+server.address().port;
 try{
  const created=await request("/api/channels",owner,{method:"POST",body:JSON.stringify({name:"Phase 48 Interactions"})});assert.equal(created.status,201);const cid=String(created.data.channel.id);channelIds.push(cid);
  assert.equal((await request("/api/channels/"+cid+"/join",member,{method:"POST"})).status,200);
  assert.equal((await request("/api/channels/"+cid+"/members",owner,{method:"POST",body:JSON.stringify({username:adminUser.username})})).status,201);
  const published=await request("/api/channels/"+cid+"/messages",owner,{method:"POST",body:JSON.stringify({body:"Initial announcement"})});assert.equal(published.status,201);const mid=String(published.data.message.id);
  assert.equal((await request("/api/channels/"+cid+"/messages/"+mid+"/delivered",member,{method:"POST"})).status,200);
  assert.equal((await request("/api/channels/"+cid+"/messages/"+mid+"/read",member,{method:"POST"})).status,200);
  const reacted=await request("/api/channels/"+cid+"/messages/"+mid+"/reactions",member,{method:"POST",body:JSON.stringify({emoji:"👍"})});assert.equal(reacted.status,200);assert.equal(reacted.data.message.reactions[0].count,1);assert.equal(reacted.data.message.reactions[0].reactedByMe,true);
  const unreacted=await request("/api/channels/"+cid+"/messages/"+mid+"/reactions",member,{method:"POST",body:JSON.stringify({emoji:"👍"})});assert.equal(unreacted.status,200);assert.equal(unreacted.data.message.reactions.length,0);
  const invalidEmoji=await request("/api/channels/"+cid+"/messages/"+mid+"/reactions",member,{method:"POST",body:JSON.stringify({emoji:"not-an-emoji"})});assert.equal(invalidEmoji.status,400);
  const deniedEdit=await request("/api/channels/"+cid+"/messages/"+mid,member,{method:"PATCH",body:JSON.stringify({body:"Unauthorized edit"})});assert.equal(deniedEdit.status,403);
  const edited=await request("/api/channels/"+cid+"/messages/"+mid,owner,{method:"PATCH",body:JSON.stringify({body:"Edited announcement"})});assert.equal(edited.status,200);assert.equal(edited.data.message.body,"Edited announcement");assert.ok(edited.data.message.editedAt);
  const pinned=await request("/api/channels/"+cid+"/messages/"+mid+"/pin",owner,{method:"PUT",body:JSON.stringify({pinned:true})});assert.equal(pinned.status,200);assert.ok(pinned.data.message.pinnedAt);
  const unpinned=await request("/api/channels/"+cid+"/messages/"+mid+"/pin",owner,{method:"PUT",body:JSON.stringify({pinned:false})});assert.equal(unpinned.status,200);assert.equal(unpinned.data.message.pinnedAt,null);
  const media=await request("/api/channels/"+cid+"/messages",owner,{method:"POST",body:JSON.stringify({mediaPath:String(ownerMedia.id),mediaType:"document"})});assert.equal(media.status,201);assert.equal(media.data.message.mediaType,"document");const mediaId=String(media.data.message.id);
  const memberHistory=await request("/api/channels/"+cid+"/messages",member);assert.equal(memberHistory.status,200);assert.ok(memberHistory.data.messages.some(m=>String(m.id)===mid&&m.receipts.some(r=>String(r.userId)===String(member.id)&&r.readAt)));
  assert.equal((await request("/api/channels/"+cid+"/messages/"+mediaId,owner,{method:"PATCH",body:JSON.stringify({body:"cannot edit media"})})).status,400);
  const deleted=await request("/api/channels/"+cid+"/messages/"+mid,owner,{method:"DELETE"});assert.equal(deleted.status,200);assert.ok(deleted.data.message.deletedAt);assert.equal(deleted.data.message.body,"This message was deleted");assert.equal(deleted.data.message.pinnedAt,null);
  assert.equal((await request("/api/channels/"+cid+"/messages/"+mid+"/reactions",member,{method:"POST",body:JSON.stringify({emoji:"❤️"})})).status,404);
  assert.ok(emitted.some(e=>e.event==="channel:message:updated"));
 }finally{
  if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(channelIds.length)await pool.query("DELETE FROM channels WHERE id=ANY($1::bigint[])",[channelIds]);
  if(users.length)await pool.query("DELETE FROM users WHERE id=ANY($1::bigint[])",[users.map(u=>String(u.id))]);
 }
});
test.after(async()=>{await pool.end();});
