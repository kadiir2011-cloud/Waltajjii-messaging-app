"use strict";
const fs=require("node:fs"),path=require("node:path"),{Pool}=require("pg");
const {verifyBackupSnapshot}=require("./phase91-verified-local-backup-snapshot");
const {runMigrationRehearsal}=require("./phase58-postgres-migration-rehearsal");

async function runVerifiedSnapshotRehearsal({manifestPath,pool,allowDisposableTarget=false,schema="waltajjii"}){
 if(!allowDisposableTarget)throw new Error("Safety gate: explicit disposable-target approval is required.");
 if(!manifestPath||!fs.existsSync(manifestPath))throw new Error("A verified Phase 91 snapshot manifest is required.");
 if(!pool||typeof pool.query!=="function"||typeof pool.connect!=="function")throw new Error("A PostgreSQL pool is required.");
 const verified=verifyBackupSnapshot(manifestPath);
 const manifest=JSON.parse(fs.readFileSync(path.resolve(manifestPath),"utf8"));
 const sqlitePath=path.resolve(path.dirname(path.resolve(manifestPath)),manifest.database.file);
 const migration=await runMigrationRehearsal({sqlitePath,pool,allowDisposableTarget:true,schema});
 return {
  phase:92,
  status:"passed",
  sourceSnapshot:{manifestVersion:manifest.manifestVersion,databaseSha256:verified.databaseSha256,tableCount:verified.tableCount,totalRows:verified.totalRows,localMediaFileCount:verified.mediaFileCount},
  postgresRehearsal:migration,
  notes:[
   "The SQLite snapshot was checksum-verified before any PostgreSQL connection or write.",
   "PostgreSQL import was performed only by the existing transactional Phase 58 rehearsal with its disposable-database name and empty-target safeguards.",
   "Remote Supabase Storage objects are not migrated or verified by this phase.",
   "This is not a production migration, live backup, or cutover approval."
  ]
 };
}

async function main(){
 const manifestPath=process.argv[2];
 const connectionString=process.env.WALTAJJII_REHEARSAL_DATABASE_URL;
 if(!manifestPath)throw new Error("Usage: node scripts/phase92-verified-snapshot-postgres-rehearsal.js <snapshot-manifest.json>");
 if(!connectionString)throw new Error("Set WALTAJJII_REHEARSAL_DATABASE_URL to a disposable PostgreSQL database.");
 if(process.env.WALTAJJII_ALLOW_DISPOSABLE_TARGET!=="1")throw new Error("Set WALTAJJII_ALLOW_DISPOSABLE_TARGET=1 only for an isolated disposable rehearsal.");
 const pool=new Pool({connectionString,max:2,ssl:process.env.PGSSL==="true"?{rejectUnauthorized:true}:undefined});
 try{const report=await runVerifiedSnapshotRehearsal({manifestPath,pool,allowDisposableTarget:true});process.stdout.write(JSON.stringify(report,null,2)+"\n");}
 finally{await pool.end();}
}
if(require.main===module)main().catch(error=>{process.stderr.write("Phase 92 snapshot rehearsal failed: "+error.message+"\n");process.exitCode=1;});
module.exports={runVerifiedSnapshotRehearsal};
