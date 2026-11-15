"use strict";
const fs=require("node:fs"),path=require("node:path");
const PURPOSES=Object.freeze({
 "users.avatar_path":"profile",
 "messages.media_path":"message",
 "group_messages.media_path":"group",
 "channel_messages.media_path":"channel",
 "moments.media_path":"moment"
});
const ALLOWED_MIME_TYPES=new Set([
 "image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm",
 "audio/webm","audio/ogg","audio/mp4","audio/mpeg","audio/wav","audio/x-wav",
 "application/pdf","application/msword",
 "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 "text/csv","application/vnd.ms-powerpoint",
 "application/vnd.openxmlformats-officedocument.presentationml.presentation","text/plain"
]);
function buildMediaMigrationPlan({reconciliationReportPath,outputPath}){
 if(!reconciliationReportPath||!fs.existsSync(reconciliationReportPath))throw new Error("A Phase 93 reconciliation report is required.");
 const report=JSON.parse(fs.readFileSync(path.resolve(reconciliationReportPath),"utf8"));
 if(report.phase!==93||!report.bucket||!Array.isArray(report.matched))throw new Error("Input is not a valid Phase 93 reconciliation report.");
 const blockers=[];
 for(const [name,items] of [
  ["missing references",report.missing],
  ["ambiguous references",report.ambiguous],
  ["numeric media IDs requiring manual resolution",report.idReferences],
  ["external URLs requiring manual review",report.externalReferences],
  ["unsafe references",report.unsafeReferences]
 ]){
  if(Array.isArray(items)&&items.length)blockers.push({code:name.replaceAll(" ","_"),count:items.length,reason:"Resolve every item before media metadata import."});
 }
 const recordsByKey=new Map();
 for(const match of report.matched){
  const source=String(match.table||"")+"."+String(match.column||"");
  const purpose=PURPOSES[source];
  if(!purpose){blockers.push({code:"unsupported_source_reference",source,reference:match.reference,reason:"No reviewed owner/purpose mapping exists for this source column."});continue;}
  const ownerId=String(match.ownerId||"");
  if(!/^[1-9][0-9]*$/.test(ownerId)){blockers.push({code:"invalid_owner",source,reference:match.reference,reason:"A positive source owner ID is required."});continue;}
  const object=match.object||{},objectKey=String(object.key||"");
  if(!objectKey||object.bucket!==report.bucket){blockers.push({code:"invalid_object_identity",source,reference:match.reference,reason:"Exact object key and expected bucket are required."});continue;}
  const mimeType=String(object.mimeType||"").split(";")[0].trim().toLowerCase();
  const fileSize=Number(object.sizeBytes);
  if(!ALLOWED_MIME_TYPES.has(mimeType)){blockers.push({code:"unsupported_or_missing_mime",source,reference:match.reference,mimeType,reason:"Storage metadata must contain a supported MIME type."});continue;}
  if(!Number.isSafeInteger(fileSize)||fileSize<=0||fileSize>10*1024*1024||(purpose==="profile"&&fileSize>2*1024*1024)){
   blockers.push({code:"invalid_file_size",source,reference:match.reference,fileSize,reason:"File size is missing or exceeds the reviewed limit for this purpose."});continue;
  }
  const existing=recordsByKey.get(objectKey);
  const sourceReference={table:match.table,column:match.column,rowKey:match.rowKey,reference:match.reference};
  if(existing){
   if(existing.ownerId!==ownerId||existing.purpose!==purpose||existing.mimeType!==mimeType||existing.fileSize!==fileSize||existing.bucket!==object.bucket){
    blockers.push({code:"conflicting_object_ownership_or_metadata",objectKey,existing:{ownerId:existing.ownerId,purpose:existing.purpose},candidate:{ownerId,purpose},reason:"One unique storage object cannot be assigned to conflicting owners or purposes."});
   }else existing.sourceReferences.push(sourceReference);
  }else{
   recordsByKey.set(objectKey,{ownerId,bucket:object.bucket,objectKey,purpose,mimeType,fileSize,sourceReferences:[sourceReference]});
  }
 }
 const records=[...recordsByKey.values()].sort((a,b)=>a.objectKey.localeCompare(b.objectKey));
 const plan={
  phase:94,
  generatedAt:new Date().toISOString(),
  status:blockers.length?"blocked":"ready_for_disposable_import_review",
  automaticWritesAllowed:false,
  destination:"waltajjii.media_objects",
  bucket:report.bucket,
  sourceReconciliationSummary:report.summary||null,
  summary:{candidateObjectCount:records.length,sourceReferenceCount:records.reduce((n,r)=>n+r.sourceReferences.length,0),blockerCount:blockers.length},
  records,
  blockers,
  requiredHumanChecks:[
   "Confirm the source owner IDs are preserved in the PostgreSQL users table.",
   "Confirm every referenced object can be downloaded from the private bucket and its SHA-256 is verified.",
   "Confirm the actual file signature matches the recorded MIME type.",
   "Review each owner/purpose assignment and retention/deletion policy.",
   "Run the import only against a disposable PostgreSQL database after approval; do not use this plan for production cutover."
  ],
  limitations:[
   "This plan is derived from a read-only exported inventory and does not connect to Supabase.",
   "The plan contains metadata only; it does not copy media bytes or create PostgreSQL rows.",
   "Orphan objects are intentionally excluded and are never deleted by this tool.",
   "A ready plan is a candidate for disposable-import review, not permission to write to production."
  ]
 };
 if(outputPath){const destination=path.resolve(outputPath);if(fs.existsSync(destination))throw new Error("Plan output already exists; refusing to overwrite.");fs.writeFileSync(destination,JSON.stringify(plan,null,2)+"\n",{encoding:"utf8",flag:"wx"});}
 return plan;
}
function main(argv=process.argv.slice(2)){
 const values={};while(argv.length){const key=argv.shift(),value=argv.shift();if(!value||!["--reconciliation-report","--out"].includes(key))throw new Error("Usage: node script --reconciliation-report <phase93-report.json> [--out <plan.json>]");values[key]=value;}
 if(!values["--reconciliation-report"])throw new Error("--reconciliation-report is required.");
 const plan=buildMediaMigrationPlan({reconciliationReportPath:values["--reconciliation-report"],outputPath:values["--out"]});
 process.stdout.write(JSON.stringify(plan,null,2)+"\n");
 if(plan.blockers.length)process.exitCode=2;
}
if(require.main===module){try{main();}catch(error){process.stderr.write("Phase 94 media migration plan failed: "+error.message+"\n");process.exitCode=1;}}
module.exports={PURPOSES,ALLOWED_MIME_TYPES,buildMediaMigrationPlan};
