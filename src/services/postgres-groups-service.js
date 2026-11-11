"use strict";

function createPostgresGroupsService({db}={}) {
  if(!db||!["one","many","execute","withTransaction"].every(k=>typeof db[k]==="function")) throw new TypeError("A PostgreSQL adapter is required.");
  const fail=(status,message)=>Object.assign(new Error(message),{status});
  const validId=v=>/^[1-9][0-9]*$/.test(String(v??""));
  const allowedEmojis=new Set(["👍","❤️","😂","😮","😢","🙏","🎉","🔥"]);

  async function membership(groupId,userId,tx=db) {
    return tx.one("SELECT role,joined_at AS \"joinedAt\" FROM group_members WHERE group_id=$1 AND user_id=$2",[groupId,userId]);
  }
  async function requireMember(groupId,userId,tx=db) {
    const m=await membership(groupId,userId,tx);
    if(!m) throw fail(404,"Group not found.");
    return m;
  }
  async function requireAdmin(groupId,userId,tx=db) {
    const m=await requireMember(groupId,userId,tx);
    if(m.role!=="admin") throw fail(403,"Only group admins can perform this action.");
    return m;
  }
  async function createGroup(creatorId,input={}) {
    const name=String(input.name||"").trim();
    const usernames=Array.isArray(input.memberUsernames)?[...new Set(input.memberUsernames.map(v=>String(v).trim()).filter(Boolean))]:[];
    if(!name||name.length>80) throw fail(400,"Group name must be 1–80 characters.");
    if(usernames.length>99) throw fail(400,"A group can have at most 100 members including you.");
    return db.withTransaction(async tx=>{
      let members=[];
      if(usernames.length){
        members=await tx.many("SELECT id,username FROM users WHERE LOWER(username)=ANY($1::text[])",[usernames.map(x=>x.toLowerCase())]);
        if(members.length!==usernames.length) throw fail(400,"One or more member usernames were not found.");
      }
      const group=await tx.one("INSERT INTO groups(name,created_by) VALUES($1,$2) RETURNING id,name,created_by AS \"createdBy\",created_at AS \"createdAt\"",[name,creatorId]);
      await tx.execute("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'admin')",[group.id,creatorId]);
      for(const user of members) await tx.execute("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'member')",[group.id,user.id]);
      return {group,memberIds:[String(creatorId),...members.map(u=>String(u.id))]};
    });
  }
  async function listGroups(userId) {
    return db.many(`
      SELECT g.id,g.name,g.created_by AS "createdBy",g.created_at AS "createdAt",
        COUNT(DISTINCT gm.user_id)::int AS "memberCount",
        mine.role AS "myRole",
        COUNT(DISTINCT CASE WHEN msg.sender_id<>$1 AND receipt.read_at IS NULL
          AND msg.created_at>=mine.joined_at THEN msg.id END)::int AS "unreadCount"
      FROM groups g JOIN group_members mine ON mine.group_id=g.id AND mine.user_id=$1
      JOIN group_members gm ON gm.group_id=g.id
      LEFT JOIN group_messages msg ON msg.group_id=g.id
      LEFT JOIN group_message_receipts receipt ON receipt.group_message_id=msg.id AND receipt.user_id=$1
      GROUP BY g.id,mine.role,mine.joined_at ORDER BY g.id DESC
    `,[userId]);
  }
  async function listMembers(groupId,userId) {
    const me=await requireMember(groupId,userId);
    const settings=await db.one("SELECT member_list_visibility AS \"memberListVisibility\" FROM groups WHERE id=$1",[groupId]);
    const restricted=settings?.memberListVisibility==="admins"&&me.role!=="admin";
    const members=restricted
      ? await db.many("SELECT u.id,u.username,gm.role,gm.joined_at AS \"joinedAt\" FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND gm.user_id=$2",[groupId,userId])
      : await db.many("SELECT u.id,u.username,gm.role,gm.joined_at AS \"joinedAt\" FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 ORDER BY CASE gm.role WHEN 'admin' THEN 0 ELSE 1 END,u.username",[groupId]);
    return {members,canManage:me.role==="admin",memberListRestricted:restricted};
  }
  async function addMember(groupId,actorId,username) {
    return db.withTransaction(async tx=>{
      await requireAdmin(groupId,actorId,tx);
      const user=await tx.one("SELECT id FROM users WHERE username=$1",[String(username||"").trim()]);
      if(!user) throw fail(404,"User not found.");
      const count=await tx.one("SELECT COUNT(*)::int AS n FROM group_members WHERE group_id=$1",[groupId]);
      if(count.n>=100) throw fail(400,"This group has reached 100 members.");
      try { await tx.execute("INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'member')",[groupId,user.id]); }
      catch(e){if(e.code==="23505")throw fail(409,"That user is already a member.");throw e;}
      return {userId:String(user.id)};
    });
  }
  async function getMessage(tx,groupId,messageId,viewerId) {
    const m=await tx.one(`
      SELECT gm.id,gm.group_id AS "groupId",gm.sender_id AS "senderId",u.username AS sender,
        CASE WHEN gm.deleted_at IS NOT NULL THEN 'This message was deleted' ELSE gm.body END AS body,
        CASE WHEN gm.deleted_at IS NOT NULL THEN NULL ELSE gm.media_path END AS "mediaPath",
        CASE WHEN gm.deleted_at IS NOT NULL THEN NULL ELSE gm.media_type END AS "mediaType",
        gm.reply_to_message_id AS "replyToMessageId",reply.body AS "replyToBody",
        replyUser.username AS "replyToSender",gm.edited_at AS "editedAt",gm.deleted_at AS "deletedAt",
        gm.is_announcement AS "isAnnouncement",gm.pinned_at AS "pinnedAt",gm.pinned_by AS "pinnedBy",
        pinUser.username AS "pinnedByUsername",gm.created_at AS "createdAt"
      FROM group_messages gm JOIN users u ON u.id=gm.sender_id
      LEFT JOIN users pinUser ON pinUser.id=gm.pinned_by
      LEFT JOIN group_messages reply ON reply.id=gm.reply_to_message_id
      LEFT JOIN users replyUser ON replyUser.id=reply.sender_id
      WHERE gm.group_id=$1 AND gm.id=$2
    `,[groupId,messageId]);
    if(!m)return null;
    const [reactions,receipts]=await Promise.all([
      tx.many("SELECT emoji,COUNT(*)::int AS count,BOOL_OR(user_id=$1) AS \"reactedByMe\" FROM group_message_reactions WHERE group_message_id=$2 GROUP BY emoji ORDER BY emoji",[viewerId,messageId]),
      tx.many("SELECT u.id AS \"userId\",u.username,receipt.delivered_at AS \"deliveredAt\",receipt.read_at AS \"readAt\" FROM group_message_receipts receipt JOIN users u ON u.id=receipt.user_id WHERE receipt.group_message_id=$1 ORDER BY u.username",[messageId])
    ]);
    m.reactions=reactions.map(r=>({...r,reactedByMe:Boolean(r.reactedByMe)}));
    m.receipts=receipts;
    return m;
  }
  async function getMessages(groupId,userId) {
    await requireMember(groupId,userId);
    const changed=await db.execute(`
      UPDATE group_message_receipts SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP),
        read_at=COALESCE(read_at,CURRENT_TIMESTAMP)
      WHERE user_id=$1 AND read_at IS NULL AND group_message_id IN (
        SELECT gm.id FROM group_messages gm JOIN group_members member
          ON member.group_id=gm.group_id AND member.user_id=$1
        WHERE gm.group_id=$2 AND gm.sender_id<>$1 AND gm.created_at>=member.joined_at
      )
    `,[userId,groupId]);
    const ids=await db.many("SELECT id FROM group_messages WHERE group_id=$1 ORDER BY id ASC LIMIT 300",[groupId]);
    const messages=[];
    for(const row of ids) messages.push(await getMessage(db,groupId,row.id,userId));
    return {messages,receiptsUpdated:changed>0};
  }
  async function sendMessage(groupId,senderId,input={}) {
    let body=String(input.body||"").trim();
    const mediaPath=String(input.mediaPath||"").trim();
    const mediaType=String(input.mediaType||"").trim();
    const replyId=input.replyToMessageId==null||input.replyToMessageId===""?null:String(input.replyToMessageId);
    if(body.length>2000||(!body&&!mediaPath)) throw fail(400,"Write a message or attach a file (maximum 2000 characters).");
    if(mediaPath&&!/^[1-9][0-9]*$/.test(mediaPath)) throw fail(400,"Invalid media file.");
    if(mediaPath&&!["image","video","document","audio"].includes(mediaType)) throw fail(400,"Invalid media type.");
    if(replyId!==null&&!validId(replyId)) throw fail(400,"Reply target is not in this group.");
    const isAnnouncement=input.isAnnouncement===true;
    return db.withTransaction(async tx=>{
      const me=await requireMember(groupId,senderId,tx);
      if(mediaPath){
        const ownedMedia=await tx.one(
          "SELECT id FROM media_objects WHERE id=$1 AND owner_id=$2 AND purpose IN ('message','group') AND deleted_at IS NULL FOR UPDATE",
          [mediaPath,String(senderId)]
        );
        if(!ownedMedia)throw fail(400,"This media file is unavailable or does not belong to your account.");
      }
      if(replyId!==null){
        const reply=await tx.one("SELECT id FROM group_messages WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",[replyId,groupId]);
        if(!reply)throw fail(400,"Reply target is not in this group.");
      }
      if(isAnnouncement&&me.role!=="admin")throw fail(403,"Only group admins can publish announcements.");
      if(!body)body=mediaType==="video"?"[Video]":mediaType==="audio"?"[Voice message]":mediaType==="document"?"[Document]":"[Image]";
      const inserted=await tx.one(`
        INSERT INTO group_messages(group_id,sender_id,body,media_path,media_type,reply_to_message_id,is_announcement)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id
      `,[groupId,senderId,body,mediaPath||null,mediaPath?mediaType:null,replyId,isAnnouncement?1:0]);
      await tx.execute("INSERT INTO group_message_receipts(group_message_id,user_id) SELECT $1,user_id FROM group_members WHERE group_id=$2 AND user_id<>$3 ON CONFLICT(group_message_id,user_id) DO NOTHING",[inserted.id,groupId,senderId]);
      const message=await getMessage(tx,groupId,inserted.id,senderId);
      const members=await tx.many("SELECT user_id AS id FROM group_members WHERE group_id=$1",[groupId]);
      return {message,memberIds:members.map(m=>String(m.id))};
    });
  }
  async function markDelivered(groupId,messageId,userId) {
    await requireMember(groupId,userId);
    const message=await db.one("SELECT id,sender_id AS \"senderId\" FROM group_messages WHERE id=$1 AND group_id=$2",[messageId,groupId]);
    if(!message||String(message.senderId)===String(userId))throw fail(404,"Message not found for this recipient.");
    const count=await db.execute("UPDATE group_message_receipts SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP) WHERE group_message_id=$1 AND user_id=$2 AND delivered_at IS NULL",[messageId,userId]);
    return {delivered:true,updated:count>0};
  }
  async function toggleReaction(groupId,messageId,userId,emoji) {
    if(!allowedEmojis.has(emoji))throw fail(400,"Choose a supported reaction.");
    return db.withTransaction(async tx=>{
      await requireMember(groupId,userId,tx);
      const message=await tx.one("SELECT id FROM group_messages WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",[messageId,groupId]);
      if(!message)throw fail(404,"Message not found.");
      const existing=await tx.one("SELECT 1 FROM group_message_reactions WHERE group_message_id=$1 AND user_id=$2 AND emoji=$3",[messageId,userId,emoji]);
      if(existing)await tx.execute("DELETE FROM group_message_reactions WHERE group_message_id=$1 AND user_id=$2 AND emoji=$3",[messageId,userId,emoji]);
      else await tx.execute("INSERT INTO group_message_reactions(group_message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[messageId,userId,emoji]);
      return {message:await getMessage(tx,groupId,messageId,userId),mediaPath:msg.mediaPath};
    });
  }
  async function editMessage(groupId,messageId,userId,body) {
    if(!body||body.length>2000)throw fail(400,"Message must contain 1–2000 characters.");
    return db.withTransaction(async tx=>{
      await requireMember(groupId,userId,tx);
      const msg=await tx.one("SELECT sender_id AS \"senderId\",media_path AS \"mediaPath\",deleted_at AS \"deletedAt\" FROM group_messages WHERE id=$1 AND group_id=$2",[messageId,groupId]);
      if(!msg)throw fail(404,"Message not found.");
      if(String(msg.senderId)!==String(userId))throw fail(403,"Only the sender can edit this message.");
      if(msg.mediaPath||msg.deletedAt)throw fail(400,"Only active text messages can be edited.");
      const updated=await tx.execute("UPDATE group_messages SET body=$1,edited_at=CURRENT_TIMESTAMP WHERE id=$2 AND deleted_at IS NULL",[body,messageId]);
      if(!updated)throw fail(409,"This message could not be edited.");
      return {message:await getMessage(tx,groupId,messageId,userId),mediaPath:msg.media_path};
    });
  }
  async function deleteMessage(groupId,messageId,userId) {
    return db.withTransaction(async tx=>{
      const me=await requireMember(groupId,userId,tx);
      const msg=await tx.one("SELECT sender_id AS \"senderId\" FROM group_messages WHERE id=$1 AND group_id=$2",[messageId,groupId]);
      if(!msg)throw fail(404,"Message not found.");
      if(String(msg.senderId)!==String(userId)&&me.role!=="admin")throw fail(403,"Only the sender or a group admin can delete this message.");
      await tx.execute("UPDATE group_messages SET body='This message was deleted',media_path=NULL,media_type=NULL,deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP) WHERE id=$1",[messageId]);
      await tx.execute("DELETE FROM group_message_reactions WHERE group_message_id=$1",[messageId]);
      return {message:await getMessage(tx,groupId,messageId,userId),mediaPath:msg.media_path};
    });
  }
  async function pinMessage(groupId,messageId,userId,pin=true) {
    await requireAdmin(groupId,userId);
    if(pin){
      const msg=await db.one("SELECT id FROM group_messages WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",[messageId,groupId]);
      if(!msg)throw fail(404,"Active group message not found.");
      await db.execute("UPDATE group_messages SET pinned_at=CURRENT_TIMESTAMP,pinned_by=$1 WHERE id=$2",[userId,messageId]);
    }else{
      const changed=await db.execute("UPDATE group_messages SET pinned_at=NULL,pinned_by=NULL WHERE id=$1 AND group_id=$2 AND pinned_at IS NOT NULL",[messageId,groupId]);
      if(!changed)throw fail(404,"Pinned message not found.");
    }
    return {message:await getMessage(db,groupId,messageId,userId)};
  }
  return Object.freeze({createGroup,listGroups,listMembers,addMember,getMessages,sendMessage,markDelivered,toggleReaction,editMessage,deleteMessage,pinMessage});
}
module.exports={createPostgresGroupsService};
