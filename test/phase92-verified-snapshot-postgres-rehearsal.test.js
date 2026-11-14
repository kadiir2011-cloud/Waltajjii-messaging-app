"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Database=require("better-sqlite3"),{Pool}=require("pg");
const {createBackupSnapshot}=require("../scripts/phase91-verified-local-backup-snapshot");
const {runVerifiedSnapshotRehearsal}=require("../scripts/phase92-verified-snapshot-postgres-rehearsal");
const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw new Error("TEST_DATABASE_URL must point only to disposable Phase 92 PostgreSQL CI.");
const pool=new Pool({connectionString,max:4,ssl:process.env.PGSSL==="true"?{rejectUnauthorized:true}:undefined});
const migration=name=>fs.readFileSync(path.join(__dirname,"..","migrations","postgres",name),"utf8");

async function makeFullApplicationSnapshot(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"waltajjii-phase92-"));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 process.env.STORAGE_DIR=root;
 const db=require("../src/db");
 try{
  const alice=db.prepare("INSERT INTO users(username,password_hash,full_name) VALUES(?,?,?)").run("phase92_alice","hash-a","Alice");
  const bob=db.prepare("INSERT INTO users(username,password_hash,full_name) VALUES(?,?,?)").run("phase92_bob","hash-b","Bob");
  db.prepare("INSERT INTO messages(sender_id,receiver_id,body) VALUES(?,?,?)").run(Number(alice.lastInsertRowid),Number(bob.lastInsertRowid),"Phase 92 snapshot import");
 }finally{db.close();}
 const databasePath=path.join(root,"waltajjii.db"),outputDir=path.join(root,"verified-snapshot");
 const snapshot=await createBackupSnapshot({databasePath,outputDir});
 return{root,manifestPath:snapshot.manifestPath};
}

test("Phase 92: only a verified Phase 91 snapshot is imported into an empty disposable PostgreSQL schema",async t=>{
 const fixture=await makeFullApplicationSnapshot(t);
 await pool.query("DROP SCHEMA IF EXISTS waltajjii CASCADE");
 await pool.query(migration("001_initial_schema.sql"));
 await pool.query(migration("002_channel_message_interactions.sql"));
 await pool.query(migration("003_media_objects.sql"));
 const report=await runVerifiedSnapshotRehearsal({manifestPath:fixture.manifestPath,pool,allowDisposableTarget:true});
 assert.equal(report.phase,92);
 assert.equal(report.status,"passed");
 assert.equal(report.sourceSnapshot.tableCount,29);
 assert.equal(report.sourceSnapshot.totalRows,3);
 assert.equal(report.postgresRehearsal.tableCount,29);
 assert.equal(report.postgresRehearsal.totalRows,3);
 assert.equal(report.postgresRehearsal.mediaObjectsImported,0);
 const users=(await pool.query("SELECT COUNT(*)::int AS count FROM waltajjii.users")).rows[0].count;
 assert.equal(users,2);
 await assert.rejects(runVerifiedSnapshotRehearsal({manifestPath:fixture.manifestPath,pool,allowDisposableTarget:true}),/Target table is not empty/);
});

test("Phase 92: corrupted snapshot is rejected before the PostgreSQL pool is used",async t=>{
 const fixture=await makeFullApplicationSnapshot(t);
 const databasePath=path.join(path.dirname(fixture.manifestPath),"waltajjii.sqlite");
 fs.appendFileSync(databasePath,Buffer.from("tamper"));
 let connected=false;
 const fakePool={query:async()=>({rows:[]}),connect:async()=>{connected=true;throw new Error("should not connect");}};
 await assert.rejects(runVerifiedSnapshotRehearsal({manifestPath:fixture.manifestPath,pool:fakePool,allowDisposableTarget:true}),/checksum mismatch/);
 assert.equal(connected,false);
});

test("Phase 92: refuses to run without explicit disposable-target approval",async()=>{
 await assert.rejects(runVerifiedSnapshotRehearsal({manifestPath:"missing.json",pool,allowDisposableTarget:false}),/explicit disposable-target approval/);
});

test.after(async()=>{await pool.end();});
