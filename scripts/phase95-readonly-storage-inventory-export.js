"use strict";
const fs=require("node:fs"),path=require("node:path");
const {createClient}=require("@supabase/supabase-js");
function safeSegment(value){
 const name=String(value||"");
 if(!name||name==="."||name===".."||name.includes("/")||name.includes("\\")||name.includes("\0"))throw new Error("Storage returned an unsafe path segment.");
 return name;
}
async function exportStorageInventory({client,bucket="waltajjii-media,pageSize=100,maxObjects=100000,maxPages=10000}={}){
 if(!client?.storage||typeof client.storage.from!=="function"||typeof client.storage.getBucket!=="function")throw new TypeError("A Supabase Storage client with read-only list/getBucket methods is required.");
 if(!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(bucket))throw new Error("Invalid storage bucket name.");
 const bucketResult=await client.storage.getBucket(bucket);
 if(bucketResult.error||!bucketResult.data)throw new Error("Could not verify the requested Storage bucket.");
 const bucketIsPublic=Boolean(bucketResult.data.public);
 const storage=client.storage.from(bucket),objects=[],folders=[""],visited=new Set([""]),folderCount=0;
 let pages=0,totalBytes=0;
 while(folders.length){
  const prefix=folders.shift();
  let offset=0;
  while(true){
   if(++pages>maxPages)throw new Error("Storage inventory exceeded the configured page safety limit.");
   const result=await storage.list(prefix,{limit:pageSize,offset,sortBy:{column:"name",order:"asc"}});
   if(result.error||!Array.isArray(result.data))throw new Error("Storage listing failed; no inventory file was written.");
   for(const entry of result.data){
    const name=safeSegment(entry.name);
    const key=prefix+name;
    const isFolder=(entry.id===null||entry.id===undefined)&&(!entry.metadata||typeof entry.metadata!=="object");
    if(isFolder){
     const nextPrefix=key+"/";
     if(!visited.has(nextPrefix)){
      visited.add(nextPrefix);folders.push(nextPrefix);
      if(visited.size>maxPages)throw new Error("Storage inventory exceeded the configured folder safety limit.");
     }
     continue;
    }
    const metadata=entry.metadata&&typeof entry.metadata==="object"?entry.metadata:{};
    const size=Number(metadata.size??entry.size??0);
    if(!Number.isSafeInteger(size)||size<0)throw new Error("Storage returned invalid file-size metadata for "+key);
    objects.push({
     bucket,
     name:key,
     sizeBytes:size,
     mimeType:String(metadata.mimetype||metadata.contentType||""),
     lastModified:metadata.lastModified||entry.updated_at||entry.created_at||null,
     eTag:metadata.eTag||metadata.etag||null
    });
    totalBytes+=size;
    if(objects.length>maxObjects)throw new Error("Storage inventory exceeded the configured object safety limit.");
   }
   if(result.data.length<pageSize)break;
   offset+=result.data.length;
  }
 }
 objects.sort((a,b)=>a.name.localeCompare(b.name));
 return {
  formatVersion:1,
  exportedAt:new Date().toISOString(),
  bucket,
  bucketIsPublic,
  readOnly:true,
  objectCount:objects.length,
  totalBytes,
  objects,
  limitations:[
   "This is a metadata listing only; object bytes are not downloaded or hashed.",
   "A private bucket is expected; bucketIsPublic is reported for operator review and is never changed.",
   "The exporter does not alter bucket policies, upload, delete, rename, or move objects."
  ]
 };
}
async function main(argv=process.argv.slice(2)){
 const outputPath=argv[0];
 if(!outputPath||argv.length!==1)throw new Error("Usage: node scripts/phase95-readonly-storage-inventory-export.js <new-output.json>");
 const absoluteOutput=path.resolve(outputPath);
 if(fs.existsSync(absoluteOutput))throw new Error("Output file already exists; refusing to overwrite.");
 const url=process.env.SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
 const bucket=process.env.SUPABASE_STORAGE_BUCKET||"waltajjii-media";
 if(!url||!key)throw new Error("Set SUPABASE_URL and a server-only SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in the local environment.");
 const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const report=await exportStorageInventory({client,bucket});
 fs.mkdirSync(path.dirname(absoluteOutput),{recursive:true});
 fs.writeFileSync(absoluteOutput,JSON.stringify(report,null,2)+"\n",{encoding:"utf8",flag:"wx",mode:0o600});
 process.stdout.write(JSON.stringify({outputPath:absoluteOutput,bucket:report.bucket,bucketIsPublic:report.bucketIsPublic,objectCount:report.objectCount,totalBytes:report.totalBytes,readOnly:true},null,2)+"\n");
}
if(require.main===module)main().catch(error=>{process.stderr.write("Phase 95 storage inventory export failed: "+error.message+"\n");process.exitCode=1;});
module.exports={exportStorageInventory,safeSegment};
