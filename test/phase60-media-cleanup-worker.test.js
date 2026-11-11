"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createPostgresMediaCleanupWorker}=require("../src/workers/postgres-media-cleanup-worker");

test("media cleanup worker avoids overlapping runs and stops cleanly",async()=>{
 let callback=null,cleared=false,calls=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 const worker=createPostgresMediaCleanupWorker({
  mediaStorage:{processCleanupQueue:async size=>{calls++;assert.equal(size,7);await gate;return{claimed:1,removed:1,failed:0};}},
  intervalMs:1000,batchSize:7,
  setIntervalImpl:fn=>{callback=fn;return{unref(){}};},
  clearIntervalImpl:()=>{cleared=true;}
 });
 assert.equal(worker.start({runImmediately:false}),true);
 assert.equal(worker.start(),false);
 const one=worker.runOnce(),two=worker.runOnce();
 assert.equal(one,two);
 assert.equal(calls,1);
 release();
 assert.deepEqual(await one,{claimed:1,removed:1,failed:0});
 await worker.stop();
 assert.equal(cleared,true);
 assert.equal(worker.running,false);
});
