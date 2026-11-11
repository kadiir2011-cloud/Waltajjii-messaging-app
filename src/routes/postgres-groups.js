"use strict";
const express=require("express");
const jwt=require("jsonwebtoken");

function createPostgresGroupsRouter({groupsService,mediaStorage,jwtSecret,jwtImplementation=jwt}={}) {
  const required=["createGroup","listGroups","listMembers","addMember","getMessages","sendMessage","markDelivered","toggleReaction","editMessage","deleteMessage","pinMessage"];
  if(!groupsService||!required.every(k=>typeof groupsService[k]==="function"))throw new TypeError("A complete PostgreSQL groups service is required.");
  const router=express.Router(),allowed=new Set(["👍","❤️","😂","😮","😢","🙏","🎉","🔥"]);
  const idOk=v=>/^[1-9][0-9]*$/.test(String(v??""));
  router.use((req,res,next)=>{
    const [scheme,token]=String(req.headers.authorization||"").split(" ");
    if(scheme!=="Bearer"||!token)return res.status(401).json({error:"Login required."});
    try{req.auth=jwtImplementation.verify(token,jwtSecret,{issuer:"waltajjii",audience:"waltajjii-users"});if(!req.auth?.userId)return res.status(401).json({error:"Invalid or expired login token."});next();}
    catch{return res.status(401).json({error:"Invalid or expired login token."});}
  });
  const handle=fn=>async(req,res)=>{try{return await fn(req,res);}catch(e){if(Number.isInteger(e?.status)&&e.status>=400&&e.status<600)return res.status(e.status).json({error:e.message});console.error("PostgreSQL groups request failed:",e?.message||"Unknown error");return res.status(500).json({error:"Could not complete the group request."});}};
  const io=(req)=>req.app.get("io");
  router.get("/",handle(async(req,res)=>res.json({groups:await groupsService.listGroups(req.auth.userId)})));
  router.post("/",handle(async(req,res)=>{
    const result=await groupsService.createGroup(req.auth.userId,req.body||{});
    const socket=io(req);if(socket)for(const uid of result.memberIds){socket.in("user:"+uid).socketsJoin("group:"+result.group.id);socket.to("user:"+uid).emit("groups:updated",{groupId:String(result.group.id)});}
    return res.status(201).json({group:result.group});
  }));
  router.get("/:id/members",handle(async(req,res)=>{if(!idOk(req.params.id))return res.status(404).json({error:"Group not found."});return res.json(await groupsService.listMembers(req.params.id,req.auth.userId));}));
  router.post("/:id/members",handle(async(req,res)=>{if(!idOk(req.params.id))return res.status(403).json({error:"Only group admins can add members."});const result=await groupsService.addMember(req.params.id,req.auth.userId,String(req.body?.username||"").trim());const socket=io(req);if(socket){socket.in("user:"+result.userId).socketsJoin("group:"+req.params.id);socket.to("user:"+result.userId).emit("groups:updated",{groupId:req.params.id});socket.to("group:"+req.params.id).emit("group:members:updated",{groupId:req.params.id});}return res.status(201).json({message:"Member added."});}));
  router.get("/:id/messages",handle(async(req,res)=>{if(!idOk(req.params.id))return res.status(404).json({error:"Group not found."});const result=await groupsService.getMessages(req.params.id,req.auth.userId);if(result.receiptsUpdated&&io(req))io(req).to("group:"+req.params.id).emit("group:receipts:updated",{groupId:req.params.id});return res.json({messages:result.messages});}));
  router.post("/:id/messages",handle(async(req,res)=>{if(!idOk(req.params.id))return res.status(404).json({error:"Group not found."});const result=await groupsService.sendMessage(req.params.id,req.auth.userId,req.body||{});if(io(req))io(req).to("group:"+req.params.id).emit("group:message",result.message);return res.status(201).json({message:result.message});}));
  router.post("/:id/messages/:messageId/delivered",handle(async(req,res)=>{if(!idOk(req.params.id)||!idOk(req.params.messageId))return res.status(404).json({error:"Message not found for this recipient."});const result=await groupsService.markDelivered(req.params.id,req.params.messageId,req.auth.userId);if(result.updated&&io(req))io(req).to("group:"+req.params.id).emit("group:receipts:updated",{groupId:req.params.id,messageId:req.params.messageId});return res.json({delivered:true});}));
  router.post("/:id/messages/:messageId/reactions",handle(async(req,res)=>{if(!idOk(req.params.id)||!idOk(req.params.messageId)||!allowed.has(String(req.body?.emoji||"")))return res.status(400).json({error:"Choose a supported reaction."});const result=await groupsService.toggleReaction(req.params.id,req.params.messageId,req.auth.userId,String(req.body.emoji));if(io(req))io(req).to("group:"+req.params.id).emit("group:message:updated",result.message);return res.json({message:result.message});}));
  router.patch("/:id/messages/:messageId",handle(async(req,res)=>{if(!idOk(req.params.id)||!idOk(req.params.messageId))return res.status(404).json({error:"Message not found."});const body=String(req.body?.body||"").trim();if(!body||body.length>2000)return res.status(400).json({error:"Message must contain 1–2000 characters."});const result=await groupsService.editMessage(req.params.id,req.params.messageId,req.auth.userId,body);if(io(req))io(req).to("group:"+req.params.id).emit("group:message:updated",result.message);return res.json({message:result.message});}));
  router.delete("/:id/messages/:messageId",handle(async(req,res)=>{if(!idOk(req.params.id)||!idOk(req.params.messageId))return res.status(404).json({error:"Message not found."});const result=await groupsService.deleteMessage(req.params.id,req.params.messageId,req.auth.userId);if(result.mediaPath&&mediaStorage?.removeIfUnreferenced)await mediaStorage.removeIfUnreferenced(result.mediaPath).catch(error=>console.error("Media cleanup queued for retry:",error?.message||"Unknown error"));if(io(req))io(req).to("group:"+req.params.id).emit("group:message:updated",result.message);return res.json({message:result.message});}));
  router.post("/:id/messages/:messageId/pin",handle(async(req,res)=>{if(!idOk(req.params.id)||!idOk(req.params.messageId))return res.status(403).json({error:"Only group admins can pin messages."});const result=await groupsService.pinMessage(req.params.id,req.params.messageId,req.auth.userId,true);if(io(req))io(req).to("group:"+req.params.id).emit("group:message:updated",result.message);return res.json({message:result.message});}));
  router.delete("/:id/messages/:messageId/pin",handle(async(req,res)=>{if(!idOk(req.params.id)||!idOk(req.params.messageId))return res.status(403).json({error:"Only group admins can unpin messages."});const result=await groupsService.pinMessage(req.params.id,req.params.messageId,req.auth.userId,false);if(io(req))io(req).to("group:"+req.params.id).emit("group:message:updated",result.message);return res.json({message:result.message});}));
  return router;
}
module.exports={createPostgresGroupsRouter};
