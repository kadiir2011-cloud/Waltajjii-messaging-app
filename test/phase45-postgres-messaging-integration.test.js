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
const {createPostgresMessagesService}=require("../src/services/postgres-messages-service");
const {createPostgresMessagesRouter}=require("../src/routes/postgres-messages");

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw new Error("TEST_DATABASE_URL must point only to the disposable CI PostgreSQL service");
const pool=new Pool({connectionString,max:4,options:"-c search_path=waltajjii,public"});
const db=createPostgresAdapter(pool);
const service=createPostgresMessagesService({db});
const secret="phase45-disposable-test-secret-at-least-32-characters";
let alice,bob,carol,server,base;

async function request(url,token,options={}){
  const headers={...(options.body?{"content-type":"application/json"}:{}),...(token?{authorization:"Bearer "+token}:{})};
  const response=await fetch(base+url,{...options,headers});
  let data={};try{data=await response.json();}catch{}
  return {status:response.status,data};
}
function token(user){return jwt.sign({userId:String(user.id),username:user.username},secret,{expiresIn:"1h",issuer:"waltajjii",audience:"waltajjii-users"});}

test("Phase 45: direct messaging HTTP and PostgreSQL integration",async()=>{
  const ddl=fs.readFileSync(path.join(__dirname,"..","migrations/postgres/001_initial_schema.sql"),"utf8");
  await pool.query(ddl);
  await pool.query(fs.readFileSync(path.join(__dirname,"..","migrations/postgres/003_media_objects.sql"),"utf8"));
  const suffix=Date.now();
  const users=[];
  for(const username of ["p45_alice_"+suffix,"p45_bob_"+suffix,"p45_carol_"+suffix]){
    const row=await db.one("INSERT INTO users(username,password_hash) VALUES($1,'test-hash') RETURNING id,username",[username]);
    users.push(row);
  }
  [alice,bob,carol]=users;
  const aliceMedia=await db.one("INSERT INTO media_objects(owner_id,bucket,object_key,purpose,mime_type,file_size) VALUES($1,'waltajjii-media',$2,'message','image/png',128) RETURNING id",[alice.id,"phase45/"+alice.id+".png"]);
  const bobMedia=await db.one("INSERT INTO media_objects(owner_id,bucket,object_key,purpose,mime_type,file_size) VALUES($1,'waltajjii-media',$2,'message','image/png',128) RETURNING id",[bob.id,"phase45/"+bob.id+".png"]);

  const app=express();app.use(express.json({limit:"30kb"}));
  app.use("/api/messages",createPostgresMessagesRouter({messagesService:service,jwtSecret:secret}));
  const emitted=[];
  app.set("io",{to(room){return{emit(event,payload){emitted.push({room,event,payload});}};}});
  server=http.createServer(app);
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  base="http://127.0.0.1:"+server.address().port;

  try{
    const unauth=await request("/api/messages/users",null);
    assert.equal(unauth.status,401);

    const usersResponse=await request("/api/messages/users",token(alice));
    assert.equal(usersResponse.status,200);
    assert.ok(usersResponse.data.users.some(u=>u.username===bob.username));
    assert.ok(!usersResponse.data.users.some(u=>u.username===alice.username));

    const invalid=await request("/api/messages",token(alice),{method:"POST",body:JSON.stringify({receiverUsername:bob.username})});
    assert.equal(invalid.status,400);

    const sent=await request("/api/messages",token(alice),{method:"POST",body:JSON.stringify({receiverUsername:bob.username,body:"Hello from Phase 45"})});
    assert.equal(sent.status,201);
    const first=sent.data.message;
    const ownAttachment=await request("/api/messages",token(alice),{method:"POST",body:JSON.stringify({receiverUsername:bob.username,body:"",mediaPath:String(aliceMedia.id),mediaType:"image"})});
    assert.equal(ownAttachment.status,201);
    assert.equal(String(ownAttachment.data.message.mediaPath),String(aliceMedia.id));
    const foreignAttachment=await request("/api/messages",token(alice),{method:"POST",body:JSON.stringify({receiverUsername:bob.username,body:"",mediaPath:String(bobMedia.id),mediaType:"image"})});
    assert.equal(foreignAttachment.status,400);
    const forwardedAttachment=await request("/api/messages/"+ownAttachment.data.message.id+"/forward",token(alice),{method:"POST",body:JSON.stringify({receiverUsername:carol.username})});
    assert.equal(forwardedAttachment.status,201);
    assert.equal(String(forwardedAttachment.data.message.mediaPath),String(aliceMedia.id));
    assert.equal(first.sender,alice.username);
    assert.equal(first.recipient,bob.username);
    assert.equal(first.body,"Hello from Phase 45");
    assert.ok(emitted.some(e=>e.room==="user:"+bob.id&&e.event==="message:new"));

    const reply=await request("/api/messages",token(bob),{method:"POST",body:JSON.stringify({receiverUsername:alice.username,body:"A reply",replyToMessageId:String(first.id)})});
    assert.equal(reply.status,201);
    assert.equal(String(reply.data.message.replyToMessageId),String(first.id));

    const invalidReply=await request("/api/messages",token(carol),{method:"POST",body:JSON.stringify({receiverUsername:alice.username,body:"bad reply",replyToMessageId:String(first.id)})});
    assert.equal(invalidReply.status,400);

    const conversation=await request("/api/messages/conversation/"+encodeURIComponent(alice.username),token(bob));
    assert.equal(conversation.status,200);
    assert.equal(conversation.data.messages.length,2);
    assert.ok(conversation.data.messages.every(m=>Array.isArray(m.reactions)));

    const reacted=await request("/api/messages/"+first.id+"/reactions",token(bob),{method:"POST",body:JSON.stringify({emoji:"👍"})});
    assert.equal(reacted.status,200);
    assert.equal(reacted.data.reactions[0].count,1);
    assert.equal(reacted.data.reactions[0].reactedByMe,true);
    const toggled=await request("/api/messages/"+first.id+"/reactions",token(bob),{method:"POST",body:JSON.stringify({emoji:"👍"})});
    assert.equal(toggled.data.reactions.length,0);

    const edited=await request("/api/messages/"+first.id+"/edit",token(alice),{method:"PATCH",body:JSON.stringify({body:"Edited greeting"})});
    assert.equal(edited.status,200);
    assert.equal(edited.data.message.body,"Edited greeting");
    const forbiddenEdit=await request("/api/messages/"+first.id+"/edit",token(bob),{method:"PATCH",body:JSON.stringify({body:"Not mine"})});
    assert.equal(forbiddenEdit.status,403);

    const forwarded=await request("/api/messages/"+first.id+"/forward",token(alice),{method:"POST",body:JSON.stringify({receiverUsername:carol.username})});
    assert.equal(forwarded.status,201);
    assert.equal(forwarded.data.message.forwardedFromUsername,alice.username);
    assert.ok(emitted.some(e=>e.room==="user:"+carol.id&&e.event==="message:new"));

    const read=await request("/api/messages/conversation/"+encodeURIComponent(bob.username)+"/read",token(alice),{method:"POST"});
    assert.equal(read.status,200);
    assert.equal(read.data.updated,1);
    assert.ok(emitted.some(e=>e.room==="user:"+bob.id&&e.event==="message:status"&&e.payload.status==="read"));

    const hidden=await request("/api/messages/"+first.id+"/delete",token(bob),{method:"DELETE",body:JSON.stringify({scope:"me"})});
    assert.equal(hidden.status,200);
    const bobConversation=await request("/api/messages/conversation/"+encodeURIComponent(alice.username),token(bob));
    assert.ok(!bobConversation.data.messages.some(m=>String(m.id)===String(first.id)));

    const deleteForAllForbidden=await request("/api/messages/"+first.id+"/delete",token(bob),{method:"DELETE",body:JSON.stringify({scope:"everyone"})});
    assert.equal(deleteForAllForbidden.status,403);
    const deletedForAll=await request("/api/messages/"+first.id+"/delete",token(alice),{method:"DELETE",body:JSON.stringify({scope:"everyone"})});
    assert.equal(deletedForAll.status,200);
    const aliceConversation=await request("/api/messages/conversation/"+encodeURIComponent(bob.username),token(alice));
    assert.ok(aliceConversation.data.messages.some(m=>String(m.id)===String(first.id)&&m.body==="This message was deleted"&&m.mediaPath===null));
  }finally{
    if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
    await pool.query("DELETE FROM messages WHERE sender_id=ANY($1::bigint[]) OR receiver_id=ANY($1::bigint[])",[users.map(u=>String(u.id))]);
    await pool.query("DELETE FROM users WHERE id=ANY($1::bigint[])",[users.map(u=>String(u.id))]);
  }
});

test.after(async()=>{await pool.end();});
