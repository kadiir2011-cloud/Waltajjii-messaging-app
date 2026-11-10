"use strict";
const express=require("express"),jwt=require("jsonwebtoken");
function createPostgresSocialRouter({socialService,jwtSecret,jwtImplementation=jwt}={}) {
 const required=["discover","follow","unfollow","connect","listRequests","respondRequest","followers","following","feed","createPost","toggleLike","listComments","createComment","listNotifications","markNotificationsRead"];
 if(!socialService||!required.every(k=>typeof socialService[k]==="function"))throw new TypeError("A complete PostgreSQL social service is required.");
 const router=express.Router(),idOk=v=>/^[1-9][0-9]*$/.test(String(v??""));
 router.use((req,res,next)=>{const [scheme,token]=String(req.headers.authorization||"").split(" ");if(scheme!=="Bearer"||!token)return res.status(401).json({error:"Login required."});try{req.auth=jwtImplementation.verify(token,jwtSecret,{issuer:"waltajjii",audience:"waltajjii-users"});if(!req.auth?.userId)return res.status(401).json({error:"Invalid or expired login token."});return next();}catch{return res.status(401).json({error:"Invalid or expired login token."});}});
 const handle=fn=>async(req,res)=>{try{return await fn(req,res);}catch(e){if(Number.isInteger(e?.status)&&e.status>=400&&e.status<600)return res.status(e.status).json({error:e.message});console.error("PostgreSQL social request failed:",e?.message||"Unknown error");return res.status(500).json({error:"Could not complete the social request."});}};
 router.get("/discover",handle(async(req,res)=>res.json({users:await socialService.discover(req.auth.userId,req.query.q)})));
 router.post("/follow/:userId",handle(async(req,res)=>res.json(await socialService.follow(req.auth.userId,req.params.userId))));
 router.delete("/follow/:userId",handle(async(req,res)=>res.json(await socialService.unfollow(req.auth.userId,req.params.userId))));
 router.post("/connect/:userId",handle(async(req,res)=>res.status(201).json(await socialService.connect(req.auth.userId,req.params.userId))));
 router.get("/requests",handle(async(req,res)=>res.json(await socialService.listRequests(req.auth.userId))));
 router.post("/requests/:requestId/respond",handle(async(req,res)=>res.json(await socialService.respondRequest(req.auth.userId,req.params.requestId,String(req.body?.action||"")))));
 router.get("/followers",handle(async(req,res)=>res.json({users:await socialService.followers(req.auth.userId)})));
 router.get("/following",handle(async(req,res)=>res.json({users:await socialService.following(req.auth.userId)})));
 router.get("/feed",handle(async(req,res)=>res.json({posts:await socialService.feed(req.auth.userId)})));
 router.post("/posts",handle(async(req,res)=>res.status(201).json(await socialService.createPost(req.auth.userId,req.body?.content))));
 router.post("/posts/:postId/like",handle(async(req,res)=>res.json(await socialService.toggleLike(req.auth.userId,req.params.postId))));
 router.get("/posts/:postId/comments",handle(async(req,res)=>res.json(await socialService.listComments(req.params.postId))));
 router.post("/posts/:postId/comments",handle(async(req,res)=>res.status(201).json(await socialService.createComment(req.auth.userId,req.params.postId,req.body?.content))));
 router.get("/notifications",handle(async(req,res)=>res.json(await socialService.listNotifications(req.auth.userId))));
 router.post("/notifications/read",handle(async(req,res)=>res.json(await socialService.markNotificationsRead(req.auth.userId))));
 return router;
}
module.exports={createPostgresSocialRouter};
