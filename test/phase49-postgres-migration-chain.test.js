"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{Pool}=require("pg");
const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw new Error("TEST_DATABASE_URL must point only to disposable CI PostgreSQL");
const pool=new Pool({connectionString,max:3,options:"-c search_path=waltajjii,public"});
const readMigration=name=>fs.readFileSync(path.join(__dirname,"..","migrations","postgres",name),"utf8");
test("Phase 49: ordered PostgreSQL migration chain is additive, repeatable and preserves legacy channel messages",async()=>{
 const foundation=readMigration("001_initial_schema.sql"),interactions=readMigration("002_channel_message_interactions.sql");
 await pool.query(foundation);
 const suffix=Date.now();
 const user=(await pool.query("INSERT INTO waltajjii.users(username,password_hash) VALUES($1,'hash') RETURNING id",["p49_user_"+suffix])).rows[0];
 const recipient=(await pool.query("INSERT INTO waltajjii.users(username,password_hash) VALUES($1,'hash') RETURNING id",["p49_recipient_"+suffix])).rows[0];
 const channel=(await pool.query("INSERT INTO waltajjii.channels(name,created_by) VALUES($1,$2) RETURNING id",["P49 migration test",user.id])).rows[0];
 await pool.query("INSERT INTO waltajjii.channel_members(channel_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'member')",[channel.id,user.id,recipient.id]);
 const legacy=(await pool.query("INSERT INTO waltajjii.channel_messages(channel_id,sender_id,body) VALUES($1,$2,'Legacy message before channel interaction migration') RETURNING id",[channel.id,user.id])).rows[0];
 try {
  await pool.query(interactions);
  const preserved=(await pool.query("SELECT body,media_path,media_type,edited_at,deleted_at,pinned_at FROM waltajjii.channel_messages WHERE id=$1",[legacy.id])).rows[0];
  assert.equal(preserved.body,"Legacy message before channel interaction migration");
  assert.equal(preserved.media_path,null);assert.equal(preserved.media_type,null);assert.equal(preserved.edited_at,null);assert.equal(preserved.deleted_at,null);assert.equal(preserved.pinned_at,null);
  await pool.query("INSERT INTO waltajjii.channel_message_reactions(channel_message_id,user_id,emoji) VALUES($1,$2,'👍')",[legacy.id,recipient.id]);
  await pool.query("INSERT INTO waltajjii.channel_message_receipts(channel_message_id,user_id,delivered_at,read_at) VALUES($1,$2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",[legacy.id,recipient.id]);
  await pool.query(interactions);
  const repeated=(await pool.query("SELECT body FROM waltajjii.channel_messages WHERE id=$1",[legacy.id])).rows[0];
  assert.equal(repeated.body,"Legacy message before channel interaction migration");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM waltajjii.channel_message_reactions WHERE channel_message_id=$1",[legacy.id])).rows[0].count,1);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM waltajjii.channel_message_receipts WHERE channel_message_id=$1 AND read_at IS NOT NULL",[legacy.id])).rows[0].count,1);
  await assert.rejects(pool.query("INSERT INTO waltajjii.channel_message_reactions(channel_message_id,user_id,emoji) VALUES($1,$2,'👍')",[legacy.id,recipient.id]),e=>e.code==="23505");
  await assert.rejects(pool.query("INSERT INTO waltajjii.channel_message_receipts(channel_message_id,user_id,read_at) VALUES($1,$2,CURRENT_TIMESTAMP)",[legacy.id,user.id]),e=>e.code==="23514");
  await assert.rejects(pool.query("UPDATE waltajjii.channel_messages SET media_type='archive' WHERE id=$1",[legacy.id]),e=>e.code==="23514");
  const tableCount=(await pool.query("SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema='waltajjii' AND table_type='BASE TABLE'")).rows[0].count;
  assert.ok(tableCount>=29,"Foundation should retain all application tables; found "+tableCount);
  const required=["channel_message_reactions","channel_message_receipts"];
  for(const table of required)assert.ok((await pool.query("SELECT to_regclass($1) AS name",["waltajjii."+table])).rows[0].name);
  await pool.query("DELETE FROM waltajjii.channels WHERE id=$1",[channel.id]);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM waltajjii.channel_message_reactions WHERE channel_message_id=$1",[legacy.id])).rows[0].count,0);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM waltajjii.channel_message_receipts WHERE channel_message_id=$1",[legacy.id])).rows[0].count,0);
 } finally {
  await pool.query("DELETE FROM waltajjii.users WHERE id=ANY($1::bigint[])",[[String(user.id),String(recipient.id)]]);
 }
});
test.after(async()=>{await pool.end();});
