"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http"),express=require("express"),{Pool}=require("pg"),jwt=require("jsonwebtoken");
const {createPostgresAdapter}=require("../src/db/postgres-adapter"),{createPostgresMomentsService}=require("../src/services/postgres-moments-service"),{createPostgresMomentsRouter}=require("../src/routes/postgres-moments");
const connectionString=process.env.TEST_DATABASE_URL;if(!connectionString)throw new Error("TEST_DATABASE_URL must point only to disposable CI PostgreSQL");
const pool=new Pool({connectionString,max:4,options:"-c search_path=waltajjii,public"}),db=createPostgresAdapter(pool),service=createPostgresMomentsService({db}),secret="phase52-disposable-test-secret-at-least-32-characters";
let server,base,users=[],removed=[];
const token=u=>jwt.sign({userId:String(u.id),username:u.username},secret,{expiresIn:"1h",issuer:"waltajjii",audience:"waltajjii-users"});
async function request(url,user,options={}){const headers={...(options.body?{"content-type":"application/json"}:{}),...(user?{authorization:"Bearer "+token(user)}:{})};const response=await fetch(base+url,{...options,headers});let data={};try{data=await response.json();}catch{}return{status:response.status,data};}
test("Phase 52: PostgreSQL Moments visibility, follower privacy, media access, expiry and deletion",async()=>{
 await pool.query(fs.readFileSync(path.join(__dirname,"..","migrations/postgres/001_initial_schema.sql"),"utf8"));
 const suffix=Date.now();for(const username of ["p52_owner_"+suffix,"p52_follower_"+suffix,"p52_guest_"+suffix])users.push(await db.one("INSERT INTO users(username,password_hash) VALUES($1,'hash') RETURNING id,username",[username]));
 const [owner,follower,guest]=users;
 await db.execute("INSERT INTO follows(follower_id,following_id) VALUES($1,$2)",[follower.id,owner.id]);
 const app=express();app.use(express.json({limit:"20kb"}));app.use("/api/moments",createPostgresMomentsRouter({momentsService:service,jwtSecret:secret,uploadMiddleware:(req,res,next)=>next(),removeMedia:async p=>removed.push(p),readMedia:async(m,res)=>res.json({mediaPath:m.mediaPath,mediaType:m.mediaType})}));
 server=http.createServer(app);await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));base="http://127.0.0.1:"+server.address().port;
 let expiredId;
 try{
  assert.equal((await request("/api/moments",null)).status,401);
  const followersOnly=await request("/api/moments",owner,{method:"POST",body:JSON.stringify({content:"Followers-only update",audience:"followers"})});assert.equal(followersOnly.status,201);const privateId=String(followersOnly.data.moment.id);
  assert.ok((await request("/api/moments",follower)).data.moments.some(m=>String(m.id)===privateId));
  assert.ok(!(await request("/api/moments",guest)).data.moments.some(m=>String(m.id)===privateId));
  assert.ok((await request("/api/moments",owner)).data.moments.some(m=>String(m.id)===privateId&&m.isMine===true));
  const publicMoment=await request("/api/moments",owner,{method:"POST",body:JSON.stringify({content:"Public community update",audience:"everyone"})});assert.equal(publicMoment.status,201);const publicId=String(publicMoment.data.moment.id);
  assert.ok((await request("/api/moments",guest)).data.moments.some(m=>String(m.id)===publicId));
  assert.equal((await request("/api/moments",owner,{method:"POST",body:JSON.stringify({content:"",audience:"everyone"})})).status,400);
  assert.equal((await request("/api/moments",owner,{method:"POST",body:JSON.stringify({content:"Bad audience",audience:"private"})})).status,400);
  const mediaPath="123e4567-e89b-12d3-a456-426614174000.jpg";
  const media=await db.one("INSERT INTO moments(user_id,content,media_path,media_type,audience) VALUES($1,'Media moment',$2,'image','followers') RETURNING id",[owner.id,mediaPath]);const mediaId=String(media.id);
  assert.equal((await request("/api/moments/media/"+mediaId,follower)).status,200);
  assert.equal((await request("/api/moments/media/"+mediaId,guest)).status,404);
  assert.equal((await request("/api/moments/media/"+mediaId,owner)).data.mediaPath,mediaPath);
  assert.equal((await request("/api/moments/"+mediaId,guest,{method:"DELETE"})).status,404);
  assert.equal((await request("/api/moments/"+mediaId,owner,{method:"DELETE"})).status,200);
  assert.ok(removed.includes(mediaPath));
  const expired=await db.one("INSERT INTO moments(user_id,content,media_path,media_type,audience,expires_at) VALUES($1,'Expired media',$2,'video','everyone',CURRENT_TIMESTAMP-INTERVAL '1 hour') RETURNING id",[owner.id,"123e4567-e89b-12d3-a456-426614174001.mp4"]);expiredId=String(expired.id);
  assert.ok(!(await request("/api/moments",owner)).data.moments.some(m=>String(m.id)===expiredId));
  assert.equal((await db.one("SELECT id FROM moments WHERE id=$1",[expiredId])),null);
  assert.ok(removed.includes("123e4567-e89b-12d3-a456-426614174001.mp4"));
  assert.equal((await request("/api/moments/media/"+publicId,guest)).status,404);
  assert.equal((await request("/api/moments/"+privateId,owner,{method:"DELETE"})).status,200);
 }finally{
  if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  if(users.length)await pool.query("DELETE FROM users WHERE id=ANY($1::bigint[])",[users.map(u=>String(u.id))]);
 }
});
test.after(async()=>{await pool.end();});
