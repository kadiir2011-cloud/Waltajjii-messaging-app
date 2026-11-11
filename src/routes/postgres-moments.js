"use strict";
const express=require("express"),jwt=require("jsonwebtoken"),multer=require("multer");
function createPostgresMomentsRouter({momentsService,jwtSecret,jwtImplementation=jwt,uploadMiddleware=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}}).single("media"),storeMedia,removeMedia,readMedia}={}) {
 if(!momentsService||!["cleanupExpired","listVisible","create","getVisibleMedia","deleteOwn"].every(k=>typeof momentsService[k]==="function"))throw new TypeError("A complete PostgreSQL Moments service is required.");
 const router=express.Router();
 router.use((req,res,next)=>{const [scheme,token]=String(req.headers.authorization||"").split(" ");if(scheme!=="Bearer"||!token)return res.status(401).json({error:"Login required."});try{req.auth=jwtImplementation.verify(token,jwtSecret,{issuer:"waltajjii",audience:"waltajjii-users"});if(!req.auth?.userId)return res.status(401).json({error:"Invalid or expired login token."});return next();}catch{return res.status(401).json({error:"Invalid or expired login token."});}});
 const handle=fn=>async(req,res)=>{try{return await fn(req,res);}catch(e){if(Number.isInteger(e?.status)&&e.status>=400&&e.status<600)return res.status(e.status).json({error:e.message});console.error("PostgreSQL Moments request failed:",e?.message||"Unknown error");return res.status(500).json({error:"Could not complete the Moment request."});}};
 const cleanup=async()=>{const paths=await momentsService.cleanupExpired();if(removeMedia)for(const p of paths){try{await removeMedia(p);}catch(e){console.error("Expired Moment media cleanup failed:",e?.message||"Unknown error");}}};
 router.get("/",handle(async(req,res)=>{await cleanup();return res.json({moments:await momentsService.listVisible(req.auth.userId)});}));
 router.post("/",(req,res,next)=>uploadMiddleware(req,res,error=>{if(error){const message=error.code==="LIMIT_FILE_SIZE"?"Moment media must be 10 MB or smaller.":error.message||"Moment upload failed.";return res.status(400).json({error:message});}return next();}),handle(async(req,res)=>{
  const content=String(req.body?.content||"").trim(),audience=String(req.body?.audience||"followers");
  if(content.length>500)return res.status(400).json({error:"Moment text must be 500 characters or fewer."});
  if(!["everyone","followers"].includes(audience))return res.status(400).json({error:"Choose a valid Moment audience."});
  if(!content&&!req.file)return res.status(400).json({error:"Add text or choose a photo/video."});
  let stored=null;
  try{
   if(req.file){if(typeof storeMedia!=="function")return res.status(503).json({error:"Moment media storage is not configured."});stored=await storeMedia(req.file,req.auth.userId);}
   const result=await momentsService.create(req.auth.userId,{content,audience,mediaPath:stored?.filename,mediaType:stored?.type});
   return res.status(201).json(result);
  }catch(e){if(stored&&removeMedia){try{await removeMedia(stored.filename,req.auth.userId);}catch(cleanupError){console.error("Moment media rollback failed:",cleanupError?.message||"Unknown error");}}throw e;}
 }));
 router.get("/media/:momentId",handle(async(req,res)=>{await cleanup();const media=await momentsService.getVisibleMedia(req.auth.userId,req.params.momentId);if(typeof readMedia!=="function")return res.status(503).json({error:"Moment media delivery is not configured."});return readMedia(media,res);}));
 router.delete("/:momentId",handle(async(req,res)=>{const deleted=await momentsService.deleteOwn(req.auth.userId,req.params.momentId);if(deleted.mediaPath&&removeMedia){try{await removeMedia(deleted.mediaPath,req.auth.userId);}catch(e){console.error("Deleted Moment media cleanup failed:",e?.message||"Unknown error");}}return res.json({message:"Moment deleted."});}));
 return router;
}
module.exports={createPostgresMomentsRouter};
