"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {exportStorageInventory,safeSegment}=require("../scripts/phase95-readonly-storage-inventory-export");
function makeClient(pages,bucketPublic=false,failAt=null){
 const calls=[];
 return {
  calls,
  storage:{
   async getBucket(name){calls.push({type:"getBucket",name});return{data:{id:name,public:bucketPublic},error:null};},
   from(name){return{async list(prefix,options){calls.push({type:"list",bucket:name,prefix,offset:options.offset,limit:options.limit});if(failAt===prefix+":"+options.offset)return{data:null,error:new Error("fixture failure")};return{data:pages[prefix+":"+options.offset]||[],error:null};}};}
  }
 };
}
test("Phase 95: paginates folders read-only and exports nested object metadata",async()=>{
 const pages={
  ":0":[{name:"alice",id:null,metadata:null},{name:"root.jpg",id:"file-1",metadata:{size:120,mimetype:"image/jpeg"}}],
  ":2":[],
  "alice/:0":[{name:"avatar.png",id:"file-2",metadata:{size:240,mimetype:"image/png"}},{name:"message.mp4",id:"file-3",metadata:{size:900,mimetype:"video/mp4"}}],
  "alice/:2":[]
 };
 const client=makeClient(pages,false),report=await exportStorageInventory({client,bucket:"waltajjii-media",pageSize:2});
 assert.equal(report.readOnly,true);assert.equal(report.bucketIsPublic,false);assert.equal(report.objectCount,3);assert.equal(report.totalBytes,1260);
 assert.deepEqual(report.objects.map(x=>x.name),["alice/avatar.png","alice/message.mp4","root.jpg"]);
 assert.ok(client.calls.every(x=>x.type==="list"||x.type==="getBucket"));
 assert.equal(client.calls.some(x=>/upload|remove|update|create/i.test(x.type)),false);
});
test("Phase 95: reports public bucket state without attempting to change it",async()=>{
 const client=makeClient({":0":[]},true),report=await exportStorageInventory({client});
 assert.equal(report.bucketIsPublic,true);assert.equal(client.calls.filter(x=>x.type==="getBucket").length,1);
});
test("Phase 95: fails closed on listing errors and object/folder safety limits",async()=>{
 const failed=makeClient({},false,":0");
 await assert.rejects(exportStorageInventory({client:failed}),/listing failed/);
 const tooMany=makeClient({":0":[{name:"one.jpg",id:"1",metadata:{size:1,mimetype:"image/jpeg"}}]});
 await assert.rejects(exportStorageInventory({client:tooMany,pageSize:1,maxPages:1}),/page safety limit/);
});
test("Phase 95: rejects unsafe path segments",()=>{
 assert.throws(()=>safeSegment("../private"),/unsafe path segment/);
 assert.throws(()=>safeSegment("folder/file.jpg"),/unsafe path segment/);
 assert.equal(safeSegment("avatar.jpg"),"avatar.jpg");
});
