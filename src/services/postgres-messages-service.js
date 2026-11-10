"use strict";

function createPostgresMessagesService({ db } = {}) {
  if (!db || !["one","many","execute","withTransaction"].every(k => typeof db[k] === "function")) {
    throw new TypeError("A PostgreSQL adapter with one(), many(), execute(), and withTransaction() is required.");
  }
  const fail = (status, message) => Object.assign(new Error(message), { status });

  async function listUsers(viewerId) {
    return db.many(`
      SELECT id, username,
        CASE WHEN profile_mode IN ('personal','both') THEN bio ELSE '' END AS bio,
        CASE WHEN profile_mode IN ('professional','both') THEN professional_title ELSE '' END AS "professionalTitle",
        CASE WHEN profile_mode IN ('professional','both') THEN organization ELSE '' END AS organization,
        CASE WHEN profile_mode IN ('professional','both') THEN department ELSE '' END AS department,
        CASE WHEN profile_mode IN ('professional','both') THEN location ELSE '' END AS location,
        avatar_path AS "avatarPath"
      FROM users WHERE id <> $1 ORDER BY username LIMIT 100
    `, [viewerId]);
  }

  async function sendMessage(senderId, input = {}) {
    const receiverUsername = String(input.receiverUsername || "").trim();
    let body = String(input.body || "").trim();
    const mediaPath = String(input.mediaPath || "").trim();
    const mediaType = String(input.mediaType || "").trim();
    const replyId = input.replyToMessageId == null || input.replyToMessageId === "" ? null : String(input.replyToMessageId);
    if (!receiverUsername) throw fail(400, "Please select a recipient.");
    if (replyId !== null && !/^[1-9][0-9]*$/.test(replyId)) throw fail(400, "Invalid reply target.");
    if (body.length > 2000) throw fail(400, "Message must not exceed 2000 characters.");
    if (!body && !mediaPath) throw fail(400, "Write a message or attach an image/video.");
    if (mediaPath && !/^[0-9a-f-]+\.(jpg|png|webp|gif|mp4|webm|ogg|m4a|mp3|wav|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(mediaPath)) {
      throw fail(400, "Invalid media file.");
    }
    if (mediaPath && !["image","video","document"].includes(mediaType)) throw fail(400, "Invalid media type.");
    if (!body) body = mediaType === "video" ? "[Video]" : mediaType === "document" ? "[Document]" : "[Image]";

    return db.withTransaction(async tx => {
      const receiver = await tx.one("SELECT id FROM users WHERE username = $1", [receiverUsername]);
      if (!receiver) throw fail(404, "Recipient not found.");
      if (String(receiver.id) === String(senderId)) throw fail(400, "You cannot message yourself.");
      if (replyId !== null) {
        const reply = await tx.one(`
          SELECT id FROM messages WHERE id = $1 AND deleted_at IS NULL AND
          ((sender_id = $2 AND receiver_id = $3) OR (sender_id = $3 AND receiver_id = $2))
        `, [replyId, senderId, receiver.id]);
        if (!reply) throw fail(400, "The message you are replying to is not in this conversation.");
      }
      const inserted = await tx.one(`
        INSERT INTO messages (sender_id,receiver_id,body,media_path,media_type,reply_to_message_id)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
      `, [senderId, receiver.id, body, mediaPath || null, mediaPath ? mediaType : null, replyId]);
      const message = await getMessage(tx, inserted.id);
      return { message, receiverId: String(receiver.id) };
    });
  }

  async function getMessage(q, id) {
    return q.one(`
      SELECT m.id, s.username AS sender, r.username AS recipient, m.body,
        m.media_path AS "mediaPath", m.media_type AS "mediaType",
        m.created_at AS "createdAt", m.delivered_at AS "deliveredAt", m.read_at AS "readAt",
        m.forwarded_from_username AS "forwardedFromUsername",
        m.reply_to_message_id AS "replyToMessageId",
        replySender.username AS "replyToSender", replyMessage.body AS "replyToBody"
      FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.receiver_id
      LEFT JOIN messages replyMessage ON replyMessage.id=m.reply_to_message_id
      LEFT JOIN users replySender ON replySender.id=replyMessage.sender_id
      WHERE m.id=$1
    `, [id]);
  }

  async function getConversation(viewerId, username) {
    const other = await db.one("SELECT id FROM users WHERE username=$1", [String(username || "")]);
    if (!other) throw fail(404, "User not found.");
    const messages = await db.many(`
      SELECT m.id, s.username AS sender, r.username AS recipient,
        CASE WHEN m.deleted_at IS NOT NULL THEN 'This message was deleted' ELSE m.body END AS body,
        CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.media_path END AS "mediaPath",
        CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.media_type END AS "mediaType",
        m.deleted_at AS "deletedAt", m.edited_at AS "editedAt", m.created_at AS "createdAt",
        m.delivered_at AS "deliveredAt", m.read_at AS "readAt",
        m.reply_to_message_id AS "replyToMessageId",
        replySender.username AS "replyToSender", replyMessage.body AS "replyToBody"
      FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.receiver_id
      LEFT JOIN messages replyMessage ON replyMessage.id=m.reply_to_message_id
      LEFT JOIN users replySender ON replySender.id=replyMessage.sender_id
      WHERE ((m.sender_id=$1 AND m.receiver_id=$2) OR (m.sender_id=$2 AND m.receiver_id=$1))
        AND NOT EXISTS (SELECT 1 FROM message_hidden_for h WHERE h.message_id=m.id AND h.user_id=$1)
      ORDER BY m.id ASC LIMIT 200
    `, [viewerId, other.id]);
    const ids = messages.map(m => String(m.id));
    if (ids.length) {
      const reactions = await db.many(`
        SELECT mr.message_id AS "messageId", mr.emoji, COUNT(*)::int AS count,
          BOOL_OR(mr.user_id=$1) AS "reactedByMe",
          STRING_AGG(u.username, ', ' ORDER BY u.username) AS usernames
        FROM message_reactions mr JOIN users u ON u.id=mr.user_id
        WHERE mr.message_id=ANY($2::bigint[])
        GROUP BY mr.message_id,mr.emoji ORDER BY mr.emoji
      `, [viewerId, ids]);
      const grouped = new Map();
      for (const r of reactions) {
        const key=String(r.messageId);
        if(!grouped.has(key)) grouped.set(key,[]);
        grouped.get(key).push({emoji:r.emoji,count:r.count,reactedByMe:Boolean(r.reactedByMe),usernames:r.usernames||""});
      }
      for (const m of messages) m.reactions=grouped.get(String(m.id))||[];
    } else {
      for (const m of messages) m.reactions=[];
    }
    return { messages };
  }

  async function markConversationRead(viewerId, username) {
    const other=await db.one("SELECT id FROM users WHERE username=$1",[String(username||"")]);
    if(!other) throw fail(404,"User not found.");
    const receipts=await db.withTransaction(async tx=>{
      const updated=await tx.many(`
        UPDATE messages SET delivered_at=COALESCE(delivered_at,CURRENT_TIMESTAMP),read_at=CURRENT_TIMESTAMP
        WHERE sender_id=$1 AND receiver_id=$2 AND read_at IS NULL
        RETURNING id AS "messageId",sender_id AS "senderId",receiver_id AS "receiverId",delivered_at AS "deliveredAt",read_at AS "readAt"
      `,[other.id,viewerId]);
      if(!updated.length) return [];
      return tx.many(`
        SELECT m.id AS "messageId",m.sender_id AS "senderId",m.receiver_id AS "receiverId",
          s.username AS sender,r.username AS recipient,m.delivered_at AS "deliveredAt",m.read_at AS "readAt"
        FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.receiver_id
        WHERE m.id=ANY($1::bigint[]) AND m.sender_id=$2 AND m.receiver_id=$3
      `,[updated.map(x=>String(x.messageId)),other.id,viewerId]);
    });
    return { updated: receipts.length, receipts };
  }

  async function deleteMessage(viewerId, rawId, scope="me") {
    if(!["me","everyone"].includes(scope)) throw fail(400,"Choose a valid deletion option.");
    return db.withTransaction(async tx=>{
      const message=await tx.one("SELECT id,sender_id AS \"senderId\",receiver_id AS \"receiverId\" FROM messages WHERE id=$1 AND (sender_id=$2 OR receiver_id=$2)",[rawId,viewerId]);
      if(!message) throw fail(404,"Message not found.");
      if(scope==="everyone") {
        if(String(message.senderId)!==String(viewerId)) throw fail(403,"Only the sender can delete this message for everyone.");
        await tx.execute(`UPDATE messages SET deleted_at=CURRENT_TIMESTAMP,deleted_by=$1,body='This message was deleted',media_path=NULL,media_type=NULL WHERE id=$2 AND deleted_at IS NULL`,[viewerId,rawId]);
      } else {
        await tx.execute("INSERT INTO message_hidden_for(message_id,user_id) VALUES($1,$2) ON CONFLICT(message_id,user_id) DO NOTHING",[rawId,viewerId]);
      }
      return {success:true,scope,messageId:String(rawId),senderId:String(message.senderId),receiverId:String(message.receiverId)};
    });
  }

  async function editMessage(viewerId, rawId, body) {
    const message=await db.one(`SELECT id,sender_id AS "senderId",receiver_id AS "receiverId",media_path AS "mediaPath",deleted_at AS "deletedAt" FROM messages WHERE id=$1 AND (sender_id=$2 OR receiver_id=$2)`,[rawId,viewerId]);
    if(!message) throw fail(404,"Message not found.");
    if(String(message.senderId)!==String(viewerId)) throw fail(403,"Only the sender can edit this message.");
    if(message.deletedAt) throw fail(400,"A deleted message cannot be edited.");
    if(message.mediaPath) throw fail(400,"Only text messages can be edited.");
    const changed=await db.one("UPDATE messages SET body=$1,edited_at=CURRENT_TIMESTAMP WHERE id=$2 AND deleted_at IS NULL RETURNING id",[body,rawId]);
    if(!changed) throw fail(409,"This message could not be edited.");
    const updated=await db.one(`SELECT m.id,s.username AS sender,r.username AS recipient,m.body,m.edited_at AS "editedAt",m.created_at AS "createdAt" FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.receiver_id WHERE m.id=$1`,[rawId]);
    return {message:updated,senderId:String(message.senderId),receiverId:String(message.receiverId)};
  }

  async function forwardMessage(viewerId, rawId, receiverUsername) {
    if(!receiverUsername) throw fail(400,"Choose a valid message and recipient.");
    return db.withTransaction(async tx=>{
      const source=await tx.one(`SELECT m.id,m.body,m.media_path AS "mediaPath",m.media_type AS "mediaType",m.forwarded_from_username AS "forwardedFromUsername",s.username AS "originalSender" FROM messages m JOIN users s ON s.id=m.sender_id WHERE m.id=$1 AND m.deleted_at IS NULL AND (m.sender_id=$2 OR m.receiver_id=$2)`,[rawId,viewerId]);
      if(!source) throw fail(404,"This message is no longer available to forward.");
      const receiver=await tx.one("SELECT id FROM users WHERE username=$1",[receiverUsername]);
      if(!receiver) throw fail(404,"Recipient not found.");
      if(String(receiver.id)===String(viewerId)) throw fail(400,"You cannot forward a message to yourself.");
      const inserted=await tx.one(`INSERT INTO messages(sender_id,receiver_id,body,media_path,media_type,forwarded_from_username) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[viewerId,receiver.id,source.body,source.mediaPath,source.mediaType,source.forwardedFromUsername||source.originalSender]);
      return {message:await getMessage(tx,inserted.id),receiverId:String(receiver.id)};
    });
  }

  async function toggleReaction(viewerId, rawId, emoji) {
    return db.withTransaction(async tx=>{
      const message=await tx.one(`SELECT m.id,m.sender_id AS "senderId",m.receiver_id AS "receiverId",s.username AS sender,r.username AS recipient FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.receiver_id WHERE m.id=$1 AND m.deleted_at IS NULL AND (m.sender_id=$2 OR m.receiver_id=$2)`,[rawId,viewerId]);
      if(!message) throw fail(404,"Message not found.");
      const existing=await tx.one("SELECT 1 FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3",[rawId,viewerId,emoji]);
      if(existing) await tx.execute("DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3",[rawId,viewerId,emoji]);
      else await tx.execute("INSERT INTO message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT(message_id,user_id,emoji) DO NOTHING",[rawId,viewerId,emoji]);
      const reactions=await tx.many(`SELECT mr.emoji,COUNT(*)::int AS count,BOOL_OR(mr.user_id=$1) AS "reactedByMe",STRING_AGG(u.username,', ' ORDER BY u.username) AS usernames FROM message_reactions mr JOIN users u ON u.id=mr.user_id WHERE mr.message_id=$2 GROUP BY mr.emoji ORDER BY mr.emoji`,[viewerId,rawId]);
      return {reactions:reactions.map(r=>({emoji:r.emoji,count:r.count,reactedByMe:Boolean(r.reactedByMe),usernames:r.usernames||""})),messageId:String(rawId),sender:String(message.sender),recipient:String(message.recipient),senderId:String(message.senderId),receiverId:String(message.receiverId)};
    });
  }

  return Object.freeze({listUsers,sendMessage,getConversation,markConversationRead,deleteMessage,editMessage,forwardMessage,toggleReaction});
}
module.exports={createPostgresMessagesService};
