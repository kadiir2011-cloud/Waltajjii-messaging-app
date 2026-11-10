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
  if (!db || typeof db.one !== "function" || typeof db.execute !== "function") throw new TypeError("A PostgreSQL adapter is required.");
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

  async function getOwned(ownerId, mediaId) {
    if (!/^[1-9][0-9]*$/.test(String(mediaId ?? ""))) throw fail(400, "Invalid media reference.");
    const row = await db.one(
      "SELECT id,owner_id AS \"ownerId\",bucket,object_key AS \"objectKey\",purpose,mime_type AS \"mimeType\",file_size AS \"fileSize\",created_at AS \"createdAt\" FROM media_objects WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL",
      [String(mediaId), String(ownerId)]
    );
    if (!row) throw fail(404, "Media not found.");
    return row;
  }

  async function removeOwned(ownerId, mediaId) {
    const row = await getOwned(ownerId, mediaId);
    const { error } = await storage.remove([row.objectKey]);
    if (error) throw fail(502, "Media storage is temporarily unavailable.");
    await db.execute("UPDATE media_objects SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL", [String(mediaId), String(ownerId)]);
    return { id: String(mediaId), removed: true };
  }

  async function downloadOwned(ownerId, mediaId) {
    const row = await getOwned(ownerId, mediaId);
    const { data, error } = await storage.download(row.objectKey);
    if (error || !data) throw fail(502, "Media storage is temporarily unavailable.");
    return { metadata: row, buffer: Buffer.from(await data.arrayBuffer()) };
  }

  return Object.freeze({ upload, getOwned, removeOwned, downloadOwned });
}

module.exports = { createPostgresMediaStorageService, MEDIA_TYPES: TYPES, MEDIA_LIMITS: LIMITS };
