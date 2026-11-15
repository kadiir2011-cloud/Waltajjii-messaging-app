const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const secretKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "waltajjii-media";

const configured = Boolean(url && secretKey);
const client = configured
  ? createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

async function uploadObject(path, buffer, contentType) {
  if (!client) return false;
  const { error } = await client.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: false
  });
  if (error) throw error;
  return true;
}

async function downloadObject(path) {
  if (!client) return null;
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error) {
    if (/not found|object not found/i.test(error.message || "")) return null;
    throw error;
  }
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

async function removeObject(path) {
  if (!client) return false;
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) throw error;
  return true;
}

module.exports = { configured, uploadObject, downloadObject, removeObject };
