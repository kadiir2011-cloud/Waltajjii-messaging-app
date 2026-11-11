"use strict";
const fs=require("node:fs"),path=require("node:path"),Database=require("better-sqlite3");
const CORE_TABLES=["users","messages","groups","group_members","group_messages"];
const TIMESTAMP_COLUMN=/(?:^|_)(?:created|updated|joined|delivered|read|edited|deleted|pinned|revoked|expires|responded|accepted|declined|last_seen|sent)_at$/i;
const MEDIA_COLUMN=/(?:^|_)(?:media_path|avatar_path|file_path|storage_path|object_key)$/i;
function quoteIdentifier(v){return '"'+String(v).replace(/"/g,'""')+'"';}
function parseTimestamp(v){if(v===null||v===undefined||v==="")return true;if(typeof v==="number"&&Number.isFinite(v))return true;return Number.isFinite(Date.parse(String(v)));}
function auditSqliteDatabase(databasePath){
 const absolutePath=path.resolve(databasePath);
 if(!fs.existsSync(absolutePath)){const e=new Error("SQLite database file does not exist: "+absolutePath);e.code="SQLITE_FILE_MISSING";throw e;}
 const db=new Database(absolutePath,{readonly:true,fileMustExist:true,timeout:5000});
 try{
  const integrityMessages=db.pragma("integrity_check").map(r=>String(r.integrity_check));
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const tableSet=new Set(tables),missingCoreTables=CORE_TABLES.filter(n=>!tableSet.has(n));
  const tableReports=[],invalidTimestamps=[],mediaReferences=[];let negativePrimaryKeys=0;
  for(const table of tables){
   const qt=quoteIdentifier(table),count=Number(db.prepare("SELECT COUNT(*) AS count FROM "+qt).get().count);
   const columns=db.pragma("table_info("+qt+")"),idColumn=columns.find(c=>c.name==="id");let maxId=null,negativeIds=0;
   if(idColumn){const a=db.prepare("SELECT MAX("+quoteIdentifier("id")+") AS max_id,SUM(CASE WHEN "+quoteIdentifier("id")+"<0 THEN 1 ELSE 0 END) AS negative_ids FROM "+qt).get();maxId=a.max_id===null?null:String(a.max_id);negativeIds=Number(a.negative_ids||0);negativePrimaryKeys+=negativeIds;}
   tableReports.push({table,rowCount:count,maxId,negativeIds});
   for(const column of columns){
    const qc=quoteIdentifier(column.name);
    if(TIMESTAMP_COLUMN.test(column.name)){
     const vals=db.prepare("SELECT "+qc+" AS value FROM "+qt+" WHERE "+qc+" IS NOT NULL AND "+qc+"<>''").all();
     let invalidCount=0;for(const row of vals)if(!parseTimestamp(row.value))invalidCount++;
     if(invalidCount)invalidTimestamps.push({table,column:column.name,invalidCount});
    }
    if(MEDIA_COLUMN.test(column.name)){
     const vals=db.prepare("SELECT "+qc+" AS value FROM "+qt+" WHERE "+qc+" IS NOT NULL AND "+qc+"<>''").all();
     let numericIdCount=0,pathLikeCount=0,opaqueReferenceCount=0;
     for(const row of vals){const v=String(row.value);if(/^[1-9][0-9]*$/.test(v))numericIdCount++;else if(/[\\/]/.test(v)||/\.(?:png|jpe?g|gif|webp|mp4|mov|pdf|docx?)$/i.test(v))pathLikeCount++;else opaqueReferenceCount++;}
     mediaReferences.push({table,column:column.name,total:vals.length,numericIdCount,pathLikeCount,opaqueReferenceCount});
    }
   }
  }
  const foreignKeyViolations=db.pragma("foreign_key_check").map(r=>({table:r.table,rowId:r.rowid===null?null:String(r.rowid),parent:r.parent,foreignKeyIndex:r.fkid}));
  let usernameAudit={checked:false,blankCount:0,caseInsensitiveDuplicateGroups:0};
  if(tableSet.has("users")&&db.pragma("table_info(users)").some(c=>c.name==="username")){
   usernameAudit.checked=true;
   usernameAudit.blankCount=Number(db.prepare("SELECT COUNT(*) AS count FROM users WHERE username IS NULL OR TRIM(username)=''").get().count);
   usernameAudit.caseInsensitiveDuplicateGroups=Number(db.prepare("SELECT COUNT(*) AS count FROM (SELECT username COLLATE NOCASE FROM users WHERE username IS NOT NULL AND TRIM(username)<>'' GROUP BY username COLLATE NOCASE HAVING COUNT(*)>1)").get().count);
  }
  const blockers=[],warnings=[];
  if(integrityMessages.some(m=>m!=="ok"))blockers.push("SQLite integrity_check reported database damage.");
  if(missingCoreTables.length)blockers.push("Required core tables are missing: "+missingCoreTables.join(", "));
  if(foreignKeyViolations.length)blockers.push("SQLite foreign_key_check found "+foreignKeyViolations.length+" violation(s).");
  if(negativePrimaryKeys)blockers.push("Found "+negativePrimaryKeys+" negative id value(s); review PostgreSQL identity compatibility.");
  if(invalidTimestamps.length)blockers.push("Found invalid timestamp values in "+invalidTimestamps.length+" column(s).");
  if(usernameAudit.blankCount)blockers.push("Found "+usernameAudit.blankCount+" user row(s) with blank usernames.");
  if(usernameAudit.caseInsensitiveDuplicateGroups)blockers.push("Found case-insensitive duplicate username group(s).");
  if(mediaReferences.some(m=>m.total>0))warnings.push("Media references were inventoried, but object existence and access permissions must be verified against the private Supabase Storage bucket separately.");
  warnings.push("This is a read-only SQLite preflight. It does not export records, create PostgreSQL rows, verify Supabase objects, or authorize a runtime cutover.");
  return {phase:57,title:"SQLite-to-PostgreSQL migration readiness preflight",sourceDatabase:path.basename(absolutePath),readOnly:true,generatedAt:new Date().toISOString(),status:blockers.length?"blocked":"ready_for_rehearsal",integrityCheck:integrityMessages,tableCount:tables.length,tables:tableReports,missingCoreTables,totalRows:tableReports.reduce((s,x)=>s+x.rowCount,0),usernameAudit,foreignKeyViolationCount:foreignKeyViolations.length,foreignKeyViolations,invalidTimestamps,negativePrimaryKeyCount:negativePrimaryKeys,mediaReferences,blockers,warnings};
 } finally {
  db.close();
 }
}
function main(argv=process.argv.slice(2)){
 const args=[...argv];let outputPath=null;const i=args.indexOf("--out");
 if(i!==-1){outputPath=args[i+1];if(!outputPath)throw new Error("--out requires a report file path.");args.splice(i,2);}
 const dbPath=args[0]||process.env.WALTAJJII_SQLITE_PATH||path.join(__dirname,"..","data","waltajjii.db");
 const report=auditSqliteDatabase(dbPath),serialized=JSON.stringify(report,null,2)+"\n";
 if(outputPath)fs.writeFileSync(path.resolve(outputPath),serialized,{encoding:"utf8",flag:"wx"});
 process.stdout.write(serialized);if(report.blockers.length)process.exitCode=2;
}
if(require.main===module){try{main();}catch(e){process.stderr.write("Phase 57 preflight failed: "+e.message+"\n");process.exitCode=1;}}
module.exports={auditSqliteDatabase,parseTimestamp};
