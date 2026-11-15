"use strict";
const fs=require("node:fs"),path=require("node:path"),Database=require("better-sqlite3");
const {verifyBackupSnapshot}=require("./phase91-verified-local-backup-snapshot");
const REFERENCE_COLUMN=/(?:^|_)(?:avatar_path|media_path|file_path|storage_path|object_key)$/i;
const OWNER_COLUMNS=["owner_id","user_id","sender_id","created_by"];
function quote(value){return '"'+String(value).replace(/"/g,'""')+'"';}
function classifyReference(value){
 if(value===null||value===undefined||String(value).trim()==="")return"empty";
 const raw=String(value).trim();
 if(/^https?:\/\//i.test(raw))return"external-url";
 if(/^[1-9][0-9]*$/.test(raw))return"media-record-id";
 if(raw.includes("\\")||raw.includes("\0")||raw.startsWith("/")||raw.split("/").some(part=>!part||part==="."||part===".."))return"unsafe-path";
 return"object-key";
}
function extractReferences(sqlitePath){
 const db=new Database(sqlitePath,{readonly:true,fileMustExist:true,timeout:5000});
 try{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const references=[];
  for(const table of tables){
   const columns=db.pragma("table_info("+quote(table)+")"),mediaColumns=columns.filter(c=>REFERENCE_COLUMN.test(c.name));
   if(!mediaColumns.length)continue;
   const primaryKeys=columns.filter(c=>Number(c.pk)>0).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
   if(!primaryKeys.length)throw new Error("Cannot safely identify media reference rows without a primary key: "+table);
   const ownerColumn=OWNER_COLUMNS.find(name=>columns.some(c=>c.name===name))||(table==="users"&&columns.some(c=>c.name==="id")?"id":null);
   for(const mediaColumn of mediaColumns){
    const selected=[...new Set([...primaryKeys,mediaColumn.name,...(ownerColumn?[ownerColumn]:[])])];
    const rows=db.prepare("SELECT "+selected.map(quote).join(",")+" FROM "+quote(table)+" WHERE "+quote(mediaColumn.name)+" IS NOT NULL AND TRIM(CAST("+quote(mediaColumn.name)+" AS TEXT))<>''").all();
    for(const row of rows){
     const value=String(row[mediaColumn.name]).trim(),classification=classifyReference(value);
     references.push({
      table,column:mediaColumn.name,
      rowKey:Object.fromEntries(primaryKeys.map(key=>[key,row[key]===null?null:String(row[key])])),
      ownerId:ownerColumn&&row[ownerColumn]!==null?String(row[ownerColumn]):null,
      reference:value,classification
     });
    }
   }
  }
  return references;
 }finally{db.close();}
}
function parseStorageInventory(filePath,expectedBucket="waltajjii-media"){
 const payload=JSON.parse(fs.readFileSync(filePath,"utf8"));
 const objects=Array.isArray(payload)?payload:payload.objects;
 if(!Array.isArray(objects))throw new Error("Storage inventory must be a JSON array or an object with an objects array.");
 const defaultBucket=payload.bucket||expectedBucket,seen=new Set(),normalized=[];
 for(const item of objects){
  if(!item||typeof item!=="object")throw new Error("Storage inventory contains an invalid object entry.");
  const bucket=String(item.bucket||defaultBucket),key=String(item.name||item.object_key||item.objectKey||"");
  if(bucket!==expectedBucket)continue;
  if(classifyReference(key)!=="object-key")throw new Error("Storage inventory contains an unsafe object key.");
  const identity=bucket+"\0"+key;
  if(seen.has(identity))throw new Error("Storage inventory contains a duplicate bucket/object key: "+key);
  seen.add(identity);
  const metadata=item.metadata&&typeof item.metadata==="object"?item.metadata:{};
  normalized.push({bucket,key,sizeBytes:Number(item.sizeBytes??item.size??metadata.size??0),mimeType:String(item.mimeType||item.mimetype||metadata.mimetype||metadata.contentType||"")});
 }
 return normalized.sort((a,b)=>a.key.localeCompare(b.key));
}
function reconcileMediaObjects({manifestPath,storageInventoryPath,outputPath,bucket="waltajjii-media"}){
 if(!manifestPath||!storageInventoryPath)throw new Error("A verified Phase 91 snapshot manifest and read-only storage inventory are required.");
 const verified=verifyBackupSnapshot(manifestPath);
 const manifest=JSON.parse(fs.readFileSync(path.resolve(manifestPath),"utf8"));
 const sqlitePath=path.resolve(path.dirname(path.resolve(manifestPath)),manifest.database.file);
 const references=extractReferences(sqlitePath),objects=parseStorageInventory(storageInventoryPath,bucket),objectByKey=new Map(objects.map(o=>[o.key,o]));
 const matched=[],missing=[],ambiguous=[],idReferences=[],externalReferences=[],unsafeReferences=[];
 const matchedKeys=new Set();
 for(const ref of references){
  if(ref.classification==="media-record-id"){idReferences.push(ref);continue;}
  if(ref.classification==="external-url"){externalReferences.push(ref);continue;}
  if(ref.classification==="unsafe-path"){unsafeReferences.push(ref);continue;}
  if(ref.classification!=="object-key")continue;
  if(objectByKey.has(ref.reference)){
   matched.push({...ref,object:objectByKey.get(ref.reference)});matchedKeys.add(ref.reference);continue;
  }
  const suffixMatches=objects.filter(o=>o.key.endsWith("/"+ref.reference));
  if(suffixMatches.length>1)ambiguous.push({...ref,candidates:suffixMatches.map(o=>o.key)});
  else missing.push({...ref,possibleMatch:suffixMatches[0]?.key||null});
 }
 const report={
  phase:93,
  generatedAt:new Date().toISOString(),
  bucket,
  sourceSnapshot:{databaseSha256:verified.databaseSha256,tableCount:verified.tableCount,totalRows:verified.totalRows},
  summary:{
   referenceCount:references.length,
   uniqueObjectKeyReferences:new Set(references.filter(r=>r.classification==="object-key").map(r=>r.reference)).size,
   matchedReferenceCount:matched.length,
   missingReferenceCount:missing.length,
   ambiguousReferenceCount:ambiguous.length,
   numericMediaIdCount:idReferences.length,
   externalUrlCount:externalReferences.length,
   unsafeReferenceCount:unsafeReferences.length,
   inventoryObjectCount:objects.length,
   unreferencedObjectCount:objects.filter(o=>!matchedKeys.has(o.key)).length
  },
  matched,missing,ambiguous,idReferences,externalReferences,unsafeReferences,
  unreferencedObjects:objects.filter(o=>!matchedKeys.has(o.key)),
  limitations:[
   "Inventory is supplied as a read-only JSON export; this tool does not connect to Supabase or access credentials.",
   "Exact object-key matches are treated as confirmed; suffix matches are only candidates and are never auto-mapped.",
   "This report does not copy, delete, rename, or modify any storage object or database row.",
   "Owner-level authorization, MIME/content inspection, and remote object download/checksum verification require a separately approved storage audit."
  ]
 };
 if(outputPath){
  const destination=path.resolve(outputPath);
  if(fs.existsSync(destination))throw new Error("Report output already exists; refusing to overwrite.");
  fs.writeFileSync(destination,JSON.stringify(report,null,2)+"\n",{encoding:"utf8",flag:"wx"});
 }
 return report;
}
function main(argv=process.argv.slice(2)){
 const values={};while(argv.length){const key=argv.shift(),value=argv.shift();if(!value||!["--snapshot-manifest","--storage-inventory","--out","--bucket"].includes(key))throw new Error("Usage: node script --snapshot-manifest <manifest.json> --storage-inventory <inventory.json> [--out <report.json>] [--bucket waltajjii-media]");values[key]=value;}
 if(!values["--snapshot-manifest"]||!values["--storage-inventory"])throw new Error("Both --snapshot-manifest and --storage-inventory are required.");
 const report=reconcileMediaObjects({manifestPath:values["--snapshot-manifest"],storageInventoryPath:values["--storage-inventory"],outputPath:values["--out"],bucket:values["--bucket"]||"waltajjii-media"});
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
if(require.main===module){try{main();}catch(error){process.stderr.write("Phase 93 media reconciliation failed: "+error.message+"\n");process.exitCode=1;}}
module.exports={classifyReference,extractReferences,parseStorageInventory,reconcileMediaObjects};
