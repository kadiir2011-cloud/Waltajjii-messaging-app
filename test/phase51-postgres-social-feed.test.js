"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http"),express=require("express"),{Pool}=require("pg"),jwt=require("jsonwebtoken");
const {createPostgresAdapter}=require("../src/db/postgres-adapter"),{createPostgresSocialService}=require("../src/services/postgres-social-service"),{createPostgresSocialRouter}=require("../src/routes/postgres-social");
const connectionString=process.env.TEST_DATABASE_URL;if(!connectionString)throw new Error("TEST_DATABASE_URL must point only to disposable CI PostgreSQL");
const pool=new Pool({connectionString,max:4,options:"-c search_path=waltajjii,public"}),db=createPostgresAdapter(pool),service=createPostgresSocialService({db}),secret="phase51-disposable-test-secret-at-least-32-characters";
let server,base,users=[];
const token=u=>jwt.sign({userId:String(u.id),username:u.username},secret,{expiresIn:"1h",issuer:"waltajjii",audience:"waltajjii-users"});
async function request(url,user,options={}){const headers={...(options.body?{"content-type":"application/json"}:{}),...(user?{authorization:"Bearer "+token(user)}:{})};const response=await fetch(base+url,{...options,headers});let data={};try{data=await response.json();}catch{}return{status:response.status,data};}
test("Phase 51: social discovery, follows, connection requests, feed, likes, comments and notifications over PostgreSQL",async()=>{
 await pool.query(fs.readFileSync(path.join(__dirname,"..","migrations/postgres/001_initial_schema.sql"),"utf8"));
 const suffix=Date.now();for(const username of ["p51_alice_"+suffix,"p51_bob_"+suffix,"p51_cara_"+suffix])users.push(await db.one("INSERT INTO users(username,password_hash,full_name,bio,professional_title,profile_mode) VALUES($1,'hash',$2,$3,$4,'both') RETURNING id,username",[username,"Full "+username,"Bio "+username,"Clinician"]));
 const [alice,bob,cara]=users,app=express();app.use(express.json({limit:"20kb"}));app.use("/api/social",createPostgresSocialRouter({socialService:service,jwtSecret:secret}));
 server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));base="http://127.0.0.1:"+server.address().port;
 try{
  assert.equal((await request("/api/social/discover",null)).status,401);
  const discovery=await request("/api/social/discover?q="+encodeURIComponent("Bio "+bob.username),alice);assert.equal(discovery.status,200);assert.equal(discovery.data.users.length,1);assert.equal(String(discovery.data.users[0].id),String(bob.id));assert.equal(discovery.data.users[0].bio,"Bio "+bob.username);
  assert.equal((await request("/api/social/follow/"+alice.id,alice,{method:"POST"})).status,400);
  assert.equal((await request("/api/social/follow/"+bob.id,alice,{method:"POST"})).status,200);
  assert.equal((await request("/api/social/follow/"+bob.id,alice,{method:"POST"})).status,200);
  let notifications=await request("/api/social/notifications",bob);assert.equal(notifications.data.notifications.filter(n=>n.type==="follow").length,1);
  const followers=await request("/api/social/followers",bob);assert.ok(followers.data.users.some(u=>String(u.id)===String(alice.id)));
  const following=await request("/api/social/following",alice);assert.ok(following.data.users.some(u=>String(u.id)===String(bob.id)));
  assert.equal((await request("/api/social/follow/"+bob.id,alice,{method:"DELETE"})).status,200);
  assert.equal((await request("/api/social/connect/"+bob.id,alice,{method:"POST"})).status,201);
  assert.equal((await request("/api/social/connect/"+alice.id,bob,{method:"POST"})).status,409);
  let requests=await request("/api/social/requests",bob);assert.equal(requests.data.incoming.length,1);const requestId=String(requests.data.incoming[0].id);
  assert.equal((await request("/api/social/requests/"+requestId+"/respond",cara,{method:"POST",body:JSON.stringify({action:"accept"})})).status,404);
  assert.equal((await request("/api/social/requests/"+requestId+"/respond",bob,{method:"POST",body:JSON.stringify({action:"accept"})})).status,200);
  assert.equal((await request("/api/social/connect/"+bob.id,alice,{method:"POST"})).status,409);
  assert.ok((await request("/api/social/following",alice)).data.users.some(u=>String(u.id)===String(bob.id)));
  assert.ok((await request("/api/social/following",bob)).data.users.some(u=>String(u.id)===String(alice.id)));
  notifications=await request("/api/social/notifications",alice);assert.ok(notifications.data.notifications.some(n=>n.type==="connection_accepted"));
  const postB=await request("/api/social/posts",bob,{method:"POST",body:JSON.stringify({content:"Bob's clinical update"})});assert.equal(postB.status,201);const postId=String(postB.data.post.id);
  const feedA=await request("/api/social/feed",alice);assert.ok(feedA.data.posts.some(p=>String(p.id)===postId));
  assert.equal((await request("/api/social/posts/"+postId+"/like",alice,{method:"POST"})).data.liked,true);
  assert.equal((await request("/api/social/posts/"+postId+"/like",alice,{method:"POST"})).data.liked,false);
  assert.equal((await request("/api/social/posts/"+postId+"/like",cara,{method:"POST"})).data.liked,true);
  assert.equal((await request("/api/social/posts/"+postId+"/comments",alice)).data.comments.length,0);
  const comment=await request("/api/social/posts/"+postId+"/comments",alice,{method:"POST",body:JSON.stringify({content:"Thank you for sharing."})});assert.equal(comment.status,201);assert.equal(comment.data.comment.username,alice.username);
  assert.equal((await request("/api/social/posts/"+postId+"/comments",bob)).data.comments.length,1);
  assert.equal((await request("/api/social/posts",alice,{method:"POST",body:JSON.stringify({content:""})})).status,400);
  assert.equal((await request("/api/social/posts/"+postId+"/comments",alice,{method:"POST",body:JSON.stringify({content:""})})).status,400);
  notifications=await request("/api/social/notifications",bob);assert.ok(notifications.data.notifications.some(n=>n.type==="like"));assert.ok(notifications.data.notifications.some(n=>n.type==="comment"));
  assert.equal((await request("/api/social/notifications/read",bob,{method:"POST"})).status,200);
  notifications=await request("/api/social/notifications",bob);assert.ok(notifications.data.notifications.every(n=>n.isRead===true));
  const feedCara=await request("/api/social/feed",cara);assert.ok(!feedCara.data.posts.some(p=>String(p.id)===postId));
 }finally{
  if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(users.length)await pool.query("DELETE FROM users WHERE id=ANY($1::bigint[])",[users.map(u=>String(u.id))]);
 }
});
test.after(async()=>{await pool.end();});
