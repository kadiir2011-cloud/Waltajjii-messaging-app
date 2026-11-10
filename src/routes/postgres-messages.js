"use strict";
const express=require("express");
const jwt=require("jsonwebtoken");

function createPostgresMessagesRouter({messagesService,jwtSecret,jwtImplementation=jwt}={}) {
  if(!messagesService || !["listUsers","sendMessage","getConversation","markConversationRead","deleteMessage","editMessage","forwardMessage","toggleReaction"].every(k=>typeof messagesService[k]==="function")) throw new TypeError("A complete PostgreSQL messages service is required.");
  const router=express.Router();
  const allowed=new Set(["👍","❤️","😂","😮","😢","🎉","🙏","🔥"]);
  function auth(req,res,next){
    const [scheme,token]=String(req.headers.authorization||"").split(" ");
    if(scheme!=="Bearer"||!token) return res.status(401).json({error:"Login required."});
    try{
      req.auth=jwtImplementation.verify(token,jwtSecret,{issuer:"waltajjii",audience:"waltajjii-users"});
      if(!req.auth?.userId) return res.status(401).json({error:"Invalid or expired login token."});
      return next();
    }catch{return res.status(401).json({error:"Invalid or expired login token."});}
  }
  const idOk=v=>/^[1-9][0-9]*$/.test(String(v??""));
  const handle=fn=>async(req,res)=>{try{return await fn(req,res);}catch(e){
    if(Number.isInteger(e?.status)&&e.status>=400&&e.status<600)return res.status(e.status).json({error:e.message});
    console.error("PostgreSQL messages request failed:",e?.message||"Unknown error");
    return res.status(500).json({error:"Could not complete the message request."});
  }};
  router.get("/users",auth,handle(async(req,res)=>res.json({users:await messagesService.listUsers(req.auth.userId)})));
  router.post("/",auth,handle(async(req,res)=>{
    const result=await messagesService.sendMessage(req.auth.userId,req.body||{});
    const io=req.app.get("io");if(io)io.to("user:"+result.receiverId).emit("message:new",result.message);
    return res.status(201).json({message:result.message});
  }));
  router.get("/conversation/:username",auth,handle(async(req,res)=>res.json(await messagesService.getConversation(req.auth.userId,req.params.username))));
  router.post("/conversation/:username/read",auth,handle(async(req,res)=>{
    const result=await messagesService.markConversationRead(req.auth.userId,req.params.username);
    const io=req.app.get("io");if(io)for(const receipt of result.receipts)io.to("user:"+receipt.senderId).emit("message:status",{...receipt,status:"read"});
    return res.json({updated:result.updated});
  }));
  router.delete("/:messageId/delete",auth,handle(async(req,res)=>{
    if(!idOk(req.params.messageId))return res.status(400).json({error:"Choose a valid deletion option."});
    const result=await messagesService.deleteMessage(req.auth.userId,req.params.messageId,String(req.body?.scope||"me"));
    const io=req.app.get("io");if(io){io.to("user:"+result.senderId).emit("message:deleted",{messageId:result.messageId,scope:result.scope});io.to("user:"+result.receiverId).emit("message:deleted",{messageId:result.messageId,scope:result.scope});}
    return res.json({success:true,scope:result.scope});
  }));
  router.patch("/:messageId/edit",auth,handle(async(req,res)=>{
    if(!idOk(req.params.messageId))return res.status(400).json({error:"Invalid message."});
    const body=String(req.body?.body||"").trim();if(!body||body.length>2000)return res.status(400).json({error:"Edited message must contain 1 to 2000 characters."});
    const result=await messagesService.editMessage(req.auth.userId,req.params.messageId,body);
    const io=req.app.get("io");if(io){io.to("user:"+result.senderId).emit("message:edited",result.message);io.to("user:"+result.receiverId).emit("message:edited",result.message);}
    return res.json({message:result.message});
  }));
  router.post("/:messageId/forward",auth,handle(async(req,res)=>{
    if(!idOk(req.params.messageId)||!String(req.body?.receiverUsername||"").trim())return res.status(400).json({error:"Choose a valid message and recipient."});
    const result=await messagesService.forwardMessage(req.auth.userId,req.params.messageId,String(req.body.receiverUsername).trim());
    const io=req.app.get("io");if(io)io.to("user:"+result.receiverId).emit("message:new",result.message);
    return res.status(201).json({message:result.message});
  }));
  router.post("/:messageId/reactions",auth,handle(async(req,res)=>{
    if(!idOk(req.params.messageId)||!allowed.has(String(req.body?.emoji||"").trim()))return res.status(400).json({error:"Choose a supported reaction."});
    const result=await messagesService.toggleReaction(req.auth.userId,req.params.messageId,String(req.body.emoji).trim());
    const payload={messageId:result.messageId,sender:result.sender,recipient:result.recipient,reactions:result.reactions};
    const io=req.app.get("io");if(io){io.to("user:"+result.senderId).emit("message:reaction:update",payload);io.to("user:"+result.receiverId).emit("message:reaction:update",payload);}
    return res.json({reactions:result.reactions});
  }));
  return router;
}
module.exports={createPostgresMessagesRouter};
