"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const http=require("node:http");
const express=require("express");
const {Pool}=require("pg");
const jwt=require("jsonwebtoken");
const {createPostgresAdapter}=require("../src/db/postgres-adapter");
const {createPostgresGroupsService}=require("../src/services/postgres-groups-service");
const {createPostgresGroupsRouter}=require("../src/routes/postgres-groups");
const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw new Error("TEST_DATABASE_URL must point only to the disposable CI PostgreSQL service");
const pool=new Pool({connectionString,max:4,options:"-c search_path=waltajjii,public"});
const db=createPostgresAdapter(pool),service=createPostgresGroupsService({db});
const secret="phase46-disposable-test-secret-at-least-32-characters";
let server,base,users=[],groupId;
const token=u=>jwt.sign({userId:String(u.id),username:u.username},secret,{expiresIn:"1h",issuer:"waltajjii",audience:"waltajjii-users"});
async function request(url,user,options={}){
 const headers={...(options.body?{"content-type":"application/json"}:{}),...(user?{authorization:"Bearer "+token(user)}:{})};
 const response=await fetch(base+url,{...options,headers});let data={};try{data=await response.json();}catch{}return{status:response.status,data};
}

test("Phase 46: group messaging HTTP and PostgreSQL integration",async()=>{
 const ddl=fs.readFileSync(path.join(__dirname,"..","migrations/postgres/001_initial_schema.sql"),"utf8");
 await pool.query(ddl);
 const suffix=Date.now();
 for(const username of ["p46_alice_"+suffix,"p46_bob_"+suffix,"p46_carol_"+suffix]){
  users.push(await db.one("INSERT INTO users(username,password_hash) VALUES($1,'test-hash') RETURNING id,username",[username]));
 }
 const [alice,bob,carol]=users;
 const app=express();app.use(express.json({limit:"30kb"}));
 app.use("/api/groups",createPostgresGroupsRouter({groupsService:service,jwtSecret:secret}));
 const emitted=[];
 app.set("io",{in(room){return{socketsJoin(target){emitted.push({room,target,action:"join"});}};},to(room){return{emit(event,payload){emitted.push({room,event,payload});}};}});
 server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));base="http://127.0.0.1:"+server.address().port;
 try{
  assert.equal((await request("/api/groups",null)).status,401);
  const created=await request("/api/groups",alice,{method:"POST",body:JSON.stringify({name:"Phase 46 Test Group",memberUsernames:[bob.username]})});
  assert.equal(created.status,201);groupId=String(created.data.group.id);
  assert.ok(emitted.some(e=>e.action==="join"&&e.target==="group:"+groupId));
  const listed=await request("/api/groups",alice);assert.equal(listed.status,200);assert.ok(listed.data.groups.some(g=>String(g.id)===groupId&&g.myRole==="admin"));
  const members=await request("/api/groups/"+groupId+"/members",bob);assert.equal(members.status,200);assert.equal(members.data.members.length,2);
  const forbiddenAdd=await request("/api/groups/"+groupId+"/members",bob,{method:"POST",body:JSON.stringify({username:carol.username})});assert.equal(forbiddenAdd.status,403);
  const add=await request("/api/groups/"+groupId+"/members",alice,{method:"POST",body:JSON.stringify({username:carol.username})});assert.equal(add.status,201);
  const announcementDenied=await request("/api/groups/"+groupId+"/messages",bob,{method:"POST",body:JSON.stringify({body:"Admin only",isAnnouncement:true})});assert.equal(announcementDenied.status,403);
  const sent=await request("/api/groups/"+groupId+"/messages",alice,{method:"POST",body:JSON.stringify({body:"Welcome to the group",isAnnouncement:true})});
  assert.equal(sent.status,201);const first=sent.data.message;assert.equal(first.isAnnouncement,1);assert.equal(first.receipts.length,2);
  assert.ok(emitted.some(e=>e.room==="group:"+groupId&&e.event==="group:message"));
  const reply=await request("/api/groups/"+groupId+"/messages",bob,{method:"POST",body:JSON.stringify({body:"Thank you",replyToMessageId:String(first.id)})});
  assert.equal(reply.status,201);assert.equal(String(reply.data.message.replyToMessageId),String(first.id));
  const badReply=await request("/api/groups/"+groupId+"/messages",carol,{method:"POST",body:JSON.stringify({body:"Wrong group reply",replyToMessageId:"999999999"})});assert.equal(badReply.status,400);
  const delivered=await request("/api/groups/"+groupId+"/messages/"+first.id+"/delivered",bob,{method:"POST"});assert.equal(delivered.status,200);
  const reacted=await request("/api/groups/"+groupId+"/messages/"+first.id+"/reactions",bob,{method:"POST",body:JSON.stringify({emoji:"🔥"})});assert.equal(reacted.status,200);assert.equal(reacted.data.message.reactions[0].count,1);
  const edited=await request("/api/groups/"+groupId+"/messages/"+reply.data.message.id,bob,{method:"PATCH",body:JSON.stringify({body:"Edited group reply"})});assert.equal(edited.status,200);assert.equal(edited.data.message.body,"Edited group reply");
  const forbiddenEdit=await request("/api/groups/"+groupId+"/messages/"+first.id, bob,{method:"PATCH",body:JSON.stringify({body:"No"})});assert.equal(forbiddenEdit.status,403);
  const pinned=await request("/api/groups/"+groupId+"/messages/"+first.id+"/pin",alice,{method:"POST"});assert.equal(pinned.status,200);assert.ok(pinned.data.message.pinnedAt);
  const unpinned=await request("/api/groups/"+groupId+"/messages/"+first.id+"/pin",alice,{method:"DELETE"});assert.equal(unpinned.status,200);assert.equal(unpinned.data.message.pinnedAt,null);
  const bobMessages=await request("/api/groups/"+groupId+"/messages",bob);assert.equal(bobMessages.status,200);assert.ok(bobMessages.data.messages.some(m=>String(m.id)===String(first.id)));
  const aliceMessages=await request("/api/groups/"+groupId+"/messages",alice);assert.equal(aliceMessages.status,200);
  const deleteDenied=await request("/api/groups/"+groupId+"/messages/"+first.id,bob,{method:"DELETE"});assert.equal(deleteDenied.status,403);
  const deleted=await request("/api/groups/"+groupId+"/messages/"+first.id,alice,{method:"DELETE"});assert.equal(deleted.status,200);assert.equal(deleted.data.message.body,"This message was deleted");assert.equal(deleted.data.message.mediaPath,null);
  const finalList=await request("/api/groups/"+groupId+"/messages",carol);assert.equal(finalList.status,200);
 }finally{
  if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(groupId)await pool.query("DELETE FROM groups WHERE id=$1",[groupId]);
  if(users.length)await pool.query("DELETE FROM users WHERE id=ANY($1::bigint[])",[users.map(u=>String(u.id))]);
 }
});
test.after(async()=>{await pool.end();});
