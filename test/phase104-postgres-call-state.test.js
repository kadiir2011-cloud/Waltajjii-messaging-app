"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPostgresCallStateService } = require("../src/services/postgres-call-state-service");

function fakeDb() {
  const calls = [], participants = [], devices = [];
  let nextId = 1;
  function findParticipant(callId,userId) {
    return participants.find(x=>x.callId===String(callId)&&x.userId===String(userId)&&x.leftAt===null) || null;
  }
  function one(sql,p=[]) {
    if (sql.startsWith("INSERT INTO realtime_call_sessions")) { const c={id:String(nextId),groupId:String(p[0]),host_user_id:String(p[1]),status:"active"};nextId++;calls.push(c);return {id:c.id}; }
    if (sql.includes("FROM groups")) return {id:p[0]};
    if (sql.includes("FROM group_members")) return {member:1};
    if (sql.includes("FROM realtime_call_sessions") && sql.includes("group_id")) return calls.find(c=>c.groupId===String(p[0])&&c.status==="active") || null;
    if (sql.includes("FROM realtime_call_sessions") && sql.includes("WHERE id")) return calls.find(c=>c.id===String(p[0])) || null;
    if (sql.includes("COUNT(*)")) return {count:participants.filter(x=>x.callId===String(p[0])&&x.leftAt===null).length};
    if (sql.includes("SELECT call_id FROM realtime_call_participants")) {
      const x=participants.find(x=>x.userId===String(p[0])&&x.leftAt===null);
      return x ? {call_id:x.callId}:null;
    }
    if (sql.includes("SELECT user_id FROM realtime_call_participants")) {
      const x=findParticipant(p[0],p[1]); return x ? {user_id:x.userId}:null;
    }
    if (sql.includes("SELECT 1 AS active FROM realtime_call_participants")) return findParticipant(p[0],p[1]) ? {active:1}:null;
    if (sql.includes("SELECT username FROM realtime_call_participants")) return findParticipant(p[0],p[1]);
    if (sql.includes("SELECT 1 AS active FROM realtime_call_device_sessions")) {
      return devices.some(x=>x.callId===String(p[0])&&x.userId===String(p[1])&&x.disconnectedAt===null) ? {active:1}:null;
    }
    return null;
  }
  async function execute(sql,p=[]) {
    if (sql.startsWith("INSERT INTO realtime_call_sessions")) {
      calls.push({id:String(nextId),groupId:String(p[0]),host_user_id:String(p[1]),status:"active"});nextId++;return 1;
    }
    if (sql.startsWith("INSERT INTO realtime_call_participants")) {
      participants.push({callId:String(p[0]),userId:String(p[1]),username:p[2],leftAt:null});return 1;
    }
    if (sql.startsWith("INSERT INTO realtime_call_device_sessions")) {
      devices.push({callId:String(p[0]),userId:String(p[1]),serverId:p[2],socketId:p[3],leaseExpiresAt:p[5],disconnectedAt:null});return 1;
    }
    if (sql.includes("UPDATE realtime_call_device_sessions SET disconnected_at") && sql.includes("call_id = $1")) {
      for(const d of devices)if(d.callId===String(p[0])&&d.disconnectedAt===null&&new Date(d.leaseExpiresAt)<=new Date(p[1]))d.disconnectedAt=p[1];
      return 1;
    }
    if (sql.startsWith("UPDATE realtime_call_device_sessions SET disconnected_at")) {
      const d=devices.find(x=>x.serverId===p[0]&&x.socketId===p[1]&&x.disconnectedAt===null);
      if(d){d.disconnectedAt=p[2];return 1;}return 0;
    }
    if (sql.includes("UPDATE realtime_call_participants") && sql.includes("NOT EXISTS")) return 0;
    if (sql.startsWith("UPDATE realtime_call_participants SET last_seen_at")) return 1;
    if (sql.startsWith("UPDATE realtime_call_participants SET left_at=$3")) {
      const x=findParticipant(p[0],p[1]);if(x)x.leftAt=p[2];return 1;
    }
    if (sql.startsWith("UPDATE realtime_call_sessions SET status")) {
      const c=calls.find(x=>x.id===String(p[0]));if(c)c.status="ended";return 1;
    }
    return 0;
  }
  const db={
    one:async(sql,p)=>one(sql,p),
    withTransaction:async work=>work({one:async(sql,p)=>one(sql,p),many:async()=>[],execute})
  };
  return {db,calls,participants,devices};
}

test("transactional call-state service starts and joins a group call across device sessions", async () => {
  let tick=Date.parse("2026-11-15T10:00:00Z");
  const f=fakeDb();
  const service=createPostgresCallStateService({db:f.db,clock:()=>new Date(tick)});
  const started=await service.startGroupCall({groupId:"7",userId:"11",username:"host",serverId:"s1",socketId:"h1"});
  assert.equal(started.ok,true);
  const joined=await service.joinGroupCall({groupId:"7",userId:"12",username:"member",serverId:"s1",socketId:"m1"});
  assert.equal(joined.ok,true);
  assert.equal(joined.participantCount,2);
  const secondDevice=await service.joinGroupCall({groupId:"7",userId:"12",username:"member",serverId:"s2",socketId:"m2"});
  assert.equal(secondDevice.additionalSession,true);
  assert.equal(secondDevice.participantCount,2);
});

test("service rejects invalid identities and requires transaction support", async () => {
  assert.throws(()=>createPostgresCallStateService({db:{one:async()=>null}}),/transactional/);
  const service=createPostgresCallStateService({db:fakeDb().db});
  assert.deepEqual(await service.startGroupCall({groupId:"0",userId:"1",username:"x",serverId:"s",socketId:"x"}),{ok:false,error:"Invalid call identity."});
});
