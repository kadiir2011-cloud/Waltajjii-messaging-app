"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http"),express=require("express"),{Pool}=require("pg"),jwt=require("jsonwebtoken");
const {createPostgresAdapter}=require("../src/db/postgres-adapter"),{createPostgresChannelsService}=require("../src/services/postgres-channels-service"),{createPostgresChannelsRouter}=require("../src/routes/postgres-channels");
const connectionString=process.env.TEST_DATABASE_URL;if(!connectionString)throw new Error("TEST_DATABASE_URL must point only to disposable CI PostgreSQL");
const pool=new Pool({connectionString,max:4,options:"-c search_path=waltajjii,public"}),db=createPostgresAdapter(pool),service=createPostgresChannelsService({db}),secret="phase47-disposable-test-secret-at-least-32-characters";
let server,base,users=[],channelIds=[];const token=u=>jwt.sign({userId:String(u.id),username:u.username},secret,{expiresIn:"1h",issuer:"waltajjii",audience:"waltajjii-users"});
async function request(url,user,options={}){const headers={...(options.body?{"content-type":"application/json"}:{}),...(user?{authorization:"Bearer "+token(user)}:{})};const response=await fetch(base+url,{...options,headers});let data={};try{data=await response.json();}catch{}return{status:response.status,data};}
test("Phase 47: channel creation, discovery, membership and publishing over PostgreSQL",async()=>{
 await pool.query(fs.readFileSync(path.join(__dirname,"..","migrations/postgres/001_initial_schema.sql"),"utf8"));
 const suffix=Date.now();for(const username of ["p47_owner_"+suffix,"p47_member_"+suffix,"p47_guest_"+suffix])users.push(await db.one("INSERT INTO users(username,password_hash) VALUES($1,'test-hash') RETURNING id,username",[username]));
 const [owner,member,guest]=users,app=express();app.use(express.json({limit:"30kb"}));app.use("/api/channels",createPostgresChannelsRouter({channelsService:service,jwtSecret:secret}));
 const emitted=[];app.set("io",{in(room){return{socketsJoin(target){emitted.push({room,target});}};},to(room){return{emit(event,payload){emitted.push({room,event,payload});}};}});server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));base="http://127.0.0.1:"+server.address().port;
 try{
  assert.equal((await request("/api/channels",null)).status,401);
  assert.equal((await request("/api/channels",owner,{method:"POST",body:JSON.stringify({name:""})})).status,400);
  const created=await request("/api/channels",owner,{method:"POST",body:JSON.stringify({name:"Phase 47 Public Channel",description:"Integration test channel",visibility:"public"})});assert.equal(created.status,201);
  const cid=String(created.data.channel.id);channelIds.push(cid);assert.ok(emitted.some(e=>e.target==="channel:"+cid));
  const discovered=await request("/api/channels",guest);assert.ok(discovered.data.channels.some(c=>String(c.id)===cid));
  assert.equal((await request("/api/channels/"+cid+"/join",member,{method:"POST"})).status,200);
  const members=await request("/api/channels/"+cid+"/members",member);assert.equal(members.status,200);assert.equal(members.data.members.length,2);assert.equal(members.data.canManage,false);
  assert.equal((await request("/api/channels/"+cid+"/messages",member,{method:"POST",body:JSON.stringify({body:"Not allowed"})})).status,403);
  assert.equal((await request("/api/channels/"+cid+"/members",owner,{method:"POST",body:JSON.stringify({username:guest.username})})).status,201);
  assert.equal((await request("/api/channels/"+cid+"/members",owner,{method:"POST",body:JSON.stringify({username:guest.username})})).status,409);
  const published=await request("/api/channels/"+cid+"/messages",owner,{method:"POST",body:JSON.stringify({body:"Official channel announcement"})});assert.equal(published.status,201);assert.equal(published.data.message.body,"Official channel announcement");
  assert.ok(emitted.some(e=>e.room==="channel:"+cid&&e.event==="channel:message"));
  const history=await request("/api/channels/"+cid+"/messages",guest);assert.equal(history.status,200);assert.equal(history.data.canPublish,false);assert.equal(history.data.messages.length,1);
  assert.equal((await request("/api/channels/"+cid+"/members/"+guest.id,owner,{method:"DELETE"})).status,200);
  assert.equal((await request("/api/channels/"+cid+"/messages",guest)).status,404);
  assert.equal((await request("/api/channels/"+cid+"/leave",member,{method:"DELETE"})).status,200);
  assert.equal((await request("/api/channels/"+cid+"/leave",owner,{method:"DELETE"})).status,400);
  const privateResult=await request("/api/channels",owner,{method:"POST",body:JSON.stringify({name:"Phase 47 Private Channel",visibility:"private"})});assert.equal(privateResult.status,201);
  const pid=String(privateResult.data.channel.id);channelIds.push(pid);
  const hidden=await request("/api/channels",guest);assert.ok(!hidden.data.channels.some(c=>String(c.id)===pid));
  assert.equal((await request("/api/channels/"+pid+"/join",guest,{method:"POST"})).status,404);
  assert.equal((await request("/api/channels/"+pid+"/members",owner,{method:"POST",body:JSON.stringify({username:member.username})})).status,201);
  assert.equal((await request("/api/channels/"+pid+"/members",member)).status,200);
 }finally{
  if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(channelIds.length)await pool.query("DELETE FROM channels WHERE id=ANY($1::bigint[])",[channelIds]);
  if(users.length)await pool.query("DELETE FROM users WHERE id=ANY($1::bigint[])",[users.map(u=>String(u.id))]);
 }
});
test.after(async()=>{await pool.end();});
