"use strict";
const express=require("express"),jwt=require("jsonwebtoken");
function createPostgresGroupGovernanceRouter({governanceService,jwtSecret,jwtImplementation=jwt,publicAppUrl=""}={}) {
 const methods=["changeRole","leave","removeMember","updateDetails","getDetails","listActivity","createInvitation","listInvitations","revokeInvitation","previewInvitation","joinByInvitation","listJoinRequests","reviewJoinRequest","listPolls","createPoll","votePoll","closePoll","listEvents","createEvent","rsvp","cancelEvent"];
 if(!governanceService||!methods.every(k=>typeof governanceService[k]==="function"))throw new TypeError("A complete PostgreSQL group governance service is required.");
 const router=express.Router(),validId=v=>/^[1-9][0-9]*$/.test(String(v??""));
 const io=req=>req.app?.get("io");
 router.use((req,res,next)=>{const [scheme,token]=String(req.headers.authorization||"").split(" ");if(scheme!=="Bearer"||!token)return res.status(401).json({error:"Login required."});try{req.auth=jwtImplementation.verify(token,jwtSecret,{issuer:"waltajjii",audience:"waltajjii-users"});if(!req.auth?.userId)return res.status(401).json({error:"Invalid or expired login token."});return next();}catch{return res.status(401).json({error:"Invalid or expired login token."});}});
 const handle=fn=>async(req,res)=>{try{return await fn(req,res);}catch(e){if(Number.isInteger(e?.status)&&e.status>=400&&e.status<600)return res.status(e.status).json({error:e.message});console.error("PostgreSQL group governance request failed:",e?.message||"Unknown error");return res.status(500).json({error:"Could not complete the group request."});}};
 const groupId=req=>{if(!validId(req.params.id))throw Object.assign(new Error("Invalid group."),{status:400});return String(req.params.id);};
 router.get("/invitation/:token",handle(async(req,res)=>res.json(await governanceService.previewInvitation(req.params.token))));
 router.post("/invitation/:token/join",handle(async(req,res)=>{
  const result=await governanceService.joinByInvitation(req.params.token,req.auth.userId);
  if(result.pending){if(io(req))io(req).to("group:"+result.groupId).emit("group:join-request",{groupId:result.groupId,requestId:result.requestId});return res.status(202).json({message:"Your request has been sent to the group admins for approval.",pending:true,groupId:result.groupId});}
  if(result.joined&&!result.alreadyMember&&io(req)){io(req).in("user:"+req.auth.userId).socketsJoin("group:"+result.groupId);io(req).to("user:"+req.auth.userId).emit("groups:updated",{groupId:result.groupId});io(req).to("group:"+result.groupId).emit("group:members:updated",{groupId:result.groupId});}
  return res.json({message:result.alreadyMember?"You are already a member of this group.":"You joined the group.",groupId:result.groupId,alreadyMember:Boolean(result.alreadyMember)});
 }));
 router.patch("/:id/members/:userId/role",handle(async(req,res)=>{const g=groupId(req);if(!validId(req.params.userId))return res.status(400).json({error:"Invalid member."});const result=await governanceService.changeRole(g,req.auth.userId,req.params.userId,String(req.body?.role||""));if(io(req))io(req).to("group:"+g).emit("group:members:updated",{groupId:g,roleChanged:true});return res.json(result);}));
 router.delete("/:id/leave",handle(async(req,res)=>{const g=groupId(req);const result=await governanceService.leave(g,req.auth.userId);if(io(req)){io(req).to("group:"+g).emit("group:members:updated",{groupId:g,left:String(req.auth.userId)});io(req).in("user:"+req.auth.userId).socketsLeave("group:"+g);io(req).to("user:"+req.auth.userId).emit("groups:updated",{groupId:g,removed:true});}return res.json(result);}));
 router.delete("/:id/members/:userId",handle(async(req,res)=>{const g=groupId(req);if(!validId(req.params.userId))return res.status(400).json({error:"Invalid member."});const result=await governanceService.removeMember(g,req.auth.userId,req.params.userId);if(io(req)){io(req).to("group:"+g).emit("group:members:updated",{groupId:g});io(req).in("user:"+req.params.userId).socketsLeave("group:"+g);io(req).to("user:"+req.params.userId).emit("groups:updated",{groupId:g,removed:true});}return res.json(result);}));
 router.get("/:id/details",handle(async(req,res)=>res.json(await governanceService.getDetails(groupId(req),req.auth.userId))));
 router.patch("/:id/details",handle(async(req,res)=>{const g=groupId(req),result=await governanceService.updateDetails(g,req.auth.userId,req.body||{});if(io(req))io(req).to("group:"+g).emit("group:details:updated",{groupId:g});return res.json(result);}));
 router.get("/:id/activity",handle(async(req,res)=>res.json(await governanceService.listActivity(groupId(req),req.auth.userId,{limit:req.query.limit,before:req.query.before||null}))));
 router.post("/:id/invitations",handle(async(req,res)=>{
  const g=groupId(req),result=await governanceService.createInvitation(g,req.auth.userId,{expiresInHours:req.body?.expiresInHours??24,useLimit:req.body?.useLimit??null});
  const configured=String(publicAppUrl||process.env.PUBLIC_APP_URL||"").trim().replace(/\/$/,"");
  const base=configured||req.protocol+"://"+req.get("host");
  return res.status(201).json({invitation:{id:result.invitation.id,url:base+"/?groupInvite="+encodeURIComponent(result.invitation.token),expiresAt:result.invitation.expiresAt,useLimit:result.invitation.useLimit}});
 }));
 router.get("/:id/invitations",handle(async(req,res)=>res.json(await governanceService.listInvitations(groupId(req),req.auth.userId))));
 router.delete("/:id/invitations/:invitationId",handle(async(req,res)=>{const g=groupId(req);if(!validId(req.params.invitationId))return res.status(400).json({error:"Invalid invitation."});const result=await governanceService.revokeInvitation(g,req.auth.userId,req.params.invitationId);if(io(req))io(req).to("group:"+g).emit("group:invitations:updated",{groupId:g});return res.json(result);}));
 router.get("/:id/join-requests",handle(async(req,res)=>res.json(await governanceService.listJoinRequests(groupId(req),req.auth.userId))));
 router.post("/:id/join-requests/:requestId/review",handle(async(req,res)=>{
  const g=groupId(req);if(!validId(req.params.requestId))return res.status(400).json({error:"Invalid request."});
  const result=await governanceService.reviewJoinRequest(g,req.auth.userId,req.params.requestId,String(req.body?.decision||""));
  if(result.approved&&io(req)){io(req).in("user:"+result.userId).socketsJoin("group:"+g);io(req).to("user:"+result.userId).emit("groups:updated",{groupId:g});io(req).to("group:"+g).emit("group:members:updated",{groupId:g});}
  if(io(req))io(req).to("user:"+result.userId).emit("group:join-request:decision",{groupId:g,decision:String(req.body?.decision||""),alreadyMember:Boolean(result.alreadyMember)});
  return res.json({message:result.message});
 }));
 router.get("/:id/polls",handle(async(req,res)=>res.json(await governanceService.listPolls(groupId(req),req.auth.userId))));
 router.post("/:id/polls",handle(async(req,res)=>{const g=groupId(req),result=await governanceService.createPoll(g,req.auth.userId,req.body||{});if(io(req))io(req).to("group:"+g).emit("group:polls:updated",{groupId:g,pollId:String(result.poll.id)});return res.status(201).json(result);}));
 router.put("/:id/polls/:pollId/vote",handle(async(req,res)=>{const g=groupId(req);if(!validId(req.params.pollId))return res.status(400).json({error:"Invalid poll."});const result=await governanceService.votePoll(g,req.params.pollId,req.auth.userId,req.body?.optionIds);if(io(req))io(req).to("group:"+g).emit("group:polls:updated",{groupId:g,pollId:String(req.params.pollId)});return res.json(result);}));
 router.post("/:id/polls/:pollId/close",handle(async(req,res)=>{const g=groupId(req);if(!validId(req.params.pollId))return res.status(400).json({error:"Invalid poll."});const result=await governanceService.closePoll(g,req.params.pollId,req.auth.userId);if(io(req))io(req).to("group:"+g).emit("group:polls:updated",{groupId:g,pollId:String(req.params.pollId)});return res.json(result);}));
 router.get("/:id/events",handle(async(req,res)=>res.json(await governanceService.listEvents(groupId(req),req.auth.userId))));
 router.post("/:id/events",handle(async(req,res)=>{const g=groupId(req),result=await governanceService.createEvent(g,req.auth.userId,req.body||{});if(io(req))io(req).to("group:"+g).emit("group:events:updated",{groupId:g,eventId:result.eventId});return res.status(201).json(result);}));
 router.put("/:id/events/:eventId/rsvp",handle(async(req,res)=>{const g=groupId(req);if(!validId(req.params.eventId))return res.status(400).json({error:"Invalid event."});const result=await governanceService.rsvp(g,req.params.eventId,req.auth.userId,String(req.body?.response||""));if(io(req))io(req).to("group:"+g).emit("group:events:updated",{groupId:g,eventId:String(req.params.eventId)});return res.json(result);}));
 router.post("/:id/events/:eventId/cancel",handle(async(req,res)=>{const g=groupId(req);if(!validId(req.params.eventId))return res.status(400).json({error:"Invalid event."});const result=await governanceService.cancelEvent(g,req.params.eventId,req.auth.userId);if(io(req))io(req).to("group:"+g).emit("group:events:updated",{groupId:g,eventId:String(req.params.eventId)});return res.json(result);}));
 return router;
}
module.exports={createPostgresGroupGovernanceRouter};
