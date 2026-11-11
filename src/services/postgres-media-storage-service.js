"use strict";

const crypto = require("node:crypto");

const TYPES = Object.freeze({
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif",
  "video/mp4": ".mp4", "video/webm": ".webm",
  "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav",
  "application/pdf": ".pdf", "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv", "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt"
});
const LIMITS = Object.freeze({ profile: 2 * 1024 * 1024, message: 10 * 1024 * 1024, group: 10 * 1024 * 1024, channel: 10 * 1024 * 1024, moment: 10 * 1024 * 1024 });
const PURPOSES = new Set(Object.keys(LIMITS));

function createPostgresMediaStorageService({ db, storageClient, bucket = "waltajjii-media", idFactory = crypto.randomUUID } = {}) {
  if (!db || typeof db.one !== "function" || typeof db.execute !== "function" || typeof db.withTransaction !== "function" || typeof db.many !== "function") throw new TypeError("A PostgreSQL adapter is required.");
  if (!storageClient || typeof storageClient.from !== "function") throw new TypeError("A private Supabase Storage client is required.");
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(String(bucket))) throw new TypeError("A valid storage bucket is required.");

  const fail = (status, message) => Object.assign(new Error(message), { status });
  const storage = storageClient.from(bucket);

  async function upload(ownerId, file, purpose) {
    const owner = String(ownerId ?? "");
    if (!/^[1-9][0-9]*$/.test(owner)) throw fail(400, "Invalid media owner.");
    if (!PURPOSES.has(purpose)) throw fail(400, "Choose a valid media purpose.");
    const mimeType = String(file?.mimetype || "").split(";")[0].trim().toLowerCase();
    const extension = TYPES[mimeType];
    if (!extension) throw fail(415, "Unsupported file type.");
    if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0) throw fail(400, "Choose a non-empty file.");
    const size = file.buffer.length;
    if (size > LIMITS[purpose]) throw fail(413, "File size limit exceeded.");
    const objectKey = owner + "/" + idFactory() + extension;

    const { error: uploadError } = await storage.upload(objectKey, file.buffer, {
      contentType: mimeType, upsert: false, cacheControl: "3600"
    });
    if (uploadError) throw fail(502, "Media storage is temporarily unavailable.");

    try {
      const row = await db.one(
        "INSERT INTO media_objects(owner_id,bucket,object_key,purpose,mime_type,file_size) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,owner_id AS \"ownerId\",bucket,object_key AS \"objectKey\",purpose,mime_type AS \"mimeType\",file_size AS \"fileSize\",created_at AS \"createdAt\"",
        [owner, bucket, objectKey, purpose, mimeType, size]
      );
      return row;
    } catch (error) {
      try { await storage.remove([objectKey]); } catch { /* preserve the database error; orphan cleanup is separately monitored */ }
      throw error;
    }
  }

  async function getOwned(ownerId, mediaId, purpose = null) {
    if (!/^[1-9][0-9]*$/.test(String(mediaId ?? ""))) throw fail(400, "Invalid media reference.");
    const row = await db.one(
      "SELECT id,owner_id AS \"ownerId\",bucket,object_key AS \"objectKey\",purpose,mime_type AS \"mimeType\",file_size AS \"fileSize\",created_at AS \"createdAt\" FROM media_objects WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND ($3::text IS NULL OR purpose=$3)",
      [String(mediaId), String(ownerId), purpose]
    );
    if (!row) throw fail(404, "Media not found.");
    return row;
  }

  async function removeOwned(ownerId, mediaId, purpose = null) {
    const row = await getOwned(ownerId, mediaId, purpose);
    const { error } = await storage.remove([row.objectKey]);
    if (error) throw fail(502, "Media storage is temporarily unavailable.");
    await db.execute("UPDATE media_objects SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL AND ($3::text IS NULL OR purpose=$3)", [String(mediaId), String(ownerId), purpose]);
    return { id: String(mediaId), removed: true };
  }

  async function downloadForViewer(viewerId, mediaId) {
    const id = String(mediaId ?? "");
    if (!/^[1-9][0-9]*$/.test(id)) throw fail(400, "Invalid media reference.");
    const row = await db.one(`
      SELECT mo.id,mo.owner_id AS "ownerId",mo.bucket,mo.object_key AS "objectKey",
        mo.purpose,mo.mime_type AS "mimeType",mo.file_size AS "fileSize",
        mo.created_at AS "createdAt"
      FROM media_objects mo
      WHERE mo.id=$1 AND mo.deleted_at IS NULL
        AND (
          (mo.purpose IN ('message','group','channel') AND EXISTS (
            SELECT 1 FROM messages m WHERE m.media_path=mo.id::text
              AND (m.sender_id=$2 OR m.receiver_id=$2) AND m.deleted_at IS NULL
          ))
          OR (mo.purpose IN ('message','group','channel') AND EXISTS (
            SELECT 1 FROM group_messages gm
            JOIN group_members mine ON mine.group_id=gm.group_id AND mine.user_id=$2
            WHERE gm.media_path=mo.id::text AND gm.deleted_at IS NULL
          ))
          OR (mo.purpose IN ('message','group','channel') AND EXISTS (
            SELECT 1 FROM channel_messages cm
            JOIN channel_members mine ON mine.channel_id=cm.channel_id AND mine.user_id=$2
            WHERE cm.media_path=mo.id::text AND cm.deleted_at IS NULL
          ))
        )
    `, [id, String(viewerId)]);
    if (!row) throw fail(404, "Media not found.");
    const { data, error } = await storage.download(row.objectKey);
    if (error || !data) throw fail(502, "Media storage is temporarily unavailable.");
    return { metadata: row, buffer: Buffer.from(await data.arrayBuffer()) };
  }

  async function removeById(mediaId) {
    const id = String(mediaId ?? "");
    if (!/^[1-9][0-9]*$/.test(id)) throw fail(400, "Invalid media reference.");
    const row = await db.one(
      "SELECT id,owner_id AS \"ownerId\",object_key AS \"objectKey\" FROM media_objects WHERE id=$1 AND purpose='moment' AND deleted_at IS NULL",
      [id]
    );
    if (!row) throw fail(404, "Moment media not found.");
    const { error } = await storage.remove([row.objectKey]);
    if (error) throw fail(502, "Media storage is temporarily unavailable.");
    await db.execute("UPDATE media_objects SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1 AND purpose='moment' AND deleted_at IS NULL", [id]);
    return { id, removed: true };
  }

  async function downloadOwned(ownerId, mediaId, purpose = null) {
    const row = await getOwned(ownerId, mediaId, purpose);
    const { data, error } = await storage.download(row.objectKey);
    if (error || !data) throw fail(502, "Media storage is temporarily unavailable.");
    return { metadata: row, buffer: Buffer.from(await data.arrayBuffer()) };
  }


  // Detachments enqueue storage deletion only after every live application reference is gone.
  // The media row lock serializes this check against message creation and forwarding.
  async function removeIfUnreferenced(mediaId) {
    const id = String(mediaId ?? "");
    if (!/^[1-9][0-9]*$/.test(id)) throw fail(400, "Invalid media reference.");
    const result = await db.withTransaction(async tx => {
      const row = await tx.one(
        "SELECT id,bucket,object_key AS \"objectKey\",deleted_at AS \"deletedAt\" FROM media_objects WHERE id=$1 FOR UPDATE",
        [id]
      );
      if (!row) return { id, queued: false, reason: "missing" };
      const refs = await tx.one(`
        SELECT
          EXISTS(SELECT 1 FROM messages WHERE media_path=$1 AND deleted_at IS NULL) OR
          EXISTS(SELECT 1 FROM group_messages WHERE media_path=$1 AND deleted_at IS NULL) OR
          EXISTS(SELECT 1 FROM channel_messages WHERE media_path=$1 AND deleted_at IS NULL) OR
          EXISTS(SELECT 1 FROM moments WHERE media_path=$1 AND expires_at > CURRENT_TIMESTAMP)
          AS referenced
      `, [id]);
      if (refs?.referenced) return { id, queued: false, reason: "still-referenced" };
      await tx.execute("UPDATE media_objects SET deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP) WHERE id=$1", [id]);
      await tx.execute(`
        INSERT INTO media_storage_cleanup(media_id,bucket,object_key)
        VALUES($1,$2,$3) ON CONFLICT(media_id) DO NOTHING
      `, [id, row.bucket, row.objectKey]);
      return { id, queued: true, reason: "unreferenced" };
    });
    if (result.queued) {
      const processed = await processCleanupQueue(1);
      return { ...result, removed: processed.removed > 0, cleanupPending: processed.failed > 0 || processed.claimed > processed.removed + processed.failed };
    }
    return { ...result, removed: false, cleanupPending: false };
  }

  async function processCleanupQueue(limit = 25) {
    const batch = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 25));
    const claimed = await db.withTransaction(tx => tx.many(`
      WITH candidates AS (
        SELECT media_id FROM media_storage_cleanup
        WHERE claimed_at IS NULL OR claimed_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
        ORDER BY created_at,media_id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE media_storage_cleanup q SET claimed_at=CURRENT_TIMESTAMP
      FROM candidates c WHERE q.media_id=c.media_id
      RETURNING q.media_id AS "mediaId",q.bucket,q.object_key AS "objectKey"
    `, [batch]));
    let removed = 0, failed = 0;
    for (const item of claimed) {
      try {
        const { error } = await storageClient.from(item.bucket).remove([item.objectKey]);
        if (error) throw error;
        await db.execute("DELETE FROM media_storage_cleanup WHERE media_id=$1", [String(item.mediaId)]);
        removed++;
      } catch (error) {
        await db.execute(
          "UPDATE media_storage_cleanup SET attempts=attempts+1,last_error=$2,claimed_at=NULL WHERE media_id=$1",
          [String(item.mediaId), String(error?.message || "Storage deletion failed").slice(0, 500)]
        );
        failed++;
      }
    }
    return { claimed: claimed.length, removed, failed };
  }

  return Object.freeze({ upload, getOwned, removeOwned, removeById, downloadOwned, downloadForViewer, removeIfUnreferenced, processCleanupQueue });
}

module.exports = { createPostgresMediaStorageService, MEDIA_TYPES: TYPES, MEDIA_LIMITS: LIMITS };
