"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createPostgresGroupEventReminderWorker}=require("../src/workers/postgres-group-event-reminder-worker");

test("reminder worker coalesces overlapping runs and reports health counters",async()=>{
 let release, calls=0, intervalCallback, cleared=false;
 const gate=new Promise(resolve=>{release=resolve;});
 const statuses=[];
 const worker=createPostgresGroupEventReminderWorker({
  governanceService:{deliverDueEventReminders:async()=>{calls++;await gate;return{delivered:3};}},
  intervalMs:5000,
  setIntervalImpl:fn=>{intervalCallback=fn;return{unref(){}};},
  clearIntervalImpl:()=>{cleared=true;},
  onStatus:s=>statuses.push(s)
 });
 assert.equal(worker.start({runImmediately:false}),true);
 assert.equal(worker.start(),false);
 const a=worker.runOnce(),b=worker.runOnce();
 assert.equal(a,b);
 await Promise.resolve();
 assert.equal(calls,1);
 assert.equal(worker.getStatus().inFlight,true);
 release();
 assert.deepEqual(await a,{delivered:3});
 assert.equal(worker.getStatus().successfulRuns,1);
 assert.equal(worker.getStatus().lastDelivered,3);
 assert.equal(worker.getStatus().consecutiveFailures,0);
 assert.equal(statuses.length>0,true);
 await worker.stop();
 assert.equal(cleared,true);
 assert.equal(worker.getStatus().running,false);
 assert.equal(typeof intervalCallback,"function");
});

test("reminder worker records failures and recovers on the next scheduled run",async()=>{
 let calls=0,errors=[];
 const worker=createPostgresGroupEventReminderWorker({
  governanceService:{deliverDueEventReminders:async()=>{calls++;if(calls===1)throw new Error("temporary database outage");return{delivered:1};}},
  intervalMs:1000,
  setIntervalImpl:()=>({unref(){}}),
  clearIntervalImpl:()=>{},
  logger:{error:(...args)=>errors.push(args)}
 });
 await assert.rejects(worker.runOnce(),/temporary database outage/);
 let state=worker.getStatus();
 assert.equal(state.failedRuns,1);
 assert.equal(state.consecutiveFailures,1);
 assert.match(state.lastError,/temporary database outage/);
 assert.deepEqual(await worker.runOnce(),{delivered:1});
 state=worker.getStatus();
 assert.equal(state.successfulRuns,1);
 assert.equal(state.consecutiveFailures,0);
 assert.equal(state.lastDelivered,1);
 worker.start({runImmediately:false});
 worker.tick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(errors.length,0);
 await worker.stop();
});

test("reminder worker validates monitoring and scheduler configuration",()=>{
 assert.throws(()=>createPostgresGroupEventReminderWorker({governanceService:{deliverDueEventReminders(){}},intervalMs:999}),/at least 1000/);
 assert.throws(()=>createPostgresGroupEventReminderWorker({governanceService:{deliverDueEventReminders(){}},onStatus:true}),/onStatus/);
});
