
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir =
  process.env.STORAGE_DIR || path.join(__dirname, "..", "data");

fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "waltajjii.db");
const db = new Database(dbPath);

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

// Create users first because other tables reference users(id).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
   bio TEXT NOT NULL DEFAULT '',
avatar_path TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
    media_path TEXT,
    media_type TEXT CHECK(
      media_type IS NULL OR media_type IN ('image', 'video', 'document')
    ),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(sender_id, receiver_id, id);

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
      CHECK(role IN ('admin', 'member')),
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_group_members_user
  ON group_members(user_id, group_id);

  CREATE INDEX IF NOT EXISTS idx_group_messages_group
  ON group_messages(group_id, id);
`);


// Add profile fields to existing Waltajjii databases without deleting user data.
const profileColumnNames = db.prepare("PRAGMA table_info(users)").all().map(column => column.name);
const profileMigrations = [
  ["professional_title", "TEXT NOT NULL DEFAULT ''"],
  ["organization", "TEXT NOT NULL DEFAULT ''"],
  ["department", "TEXT NOT NULL DEFAULT ''"],
  ["location", "TEXT NOT NULL DEFAULT ''"],
  ["website", "TEXT NOT NULL DEFAULT ''"],
  ["profile_mode", "TEXT NOT NULL DEFAULT 'both'"]
];
for (const [column, definition] of profileMigrations) {
  if (!profileColumnNames.includes(column)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
  }
}
// Safely add the bio field to existing databases.
const userColumns = db.prepare("PRAGMA table_info(users)").all();

if (!userColumns.some(column => column.name === "bio")) {
  db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
}
const avatarColumn = db.prepare("PRAGMA table_info(users)").all();

if (!avatarColumn.some(column => column.name === "avatar_path")) {
  db.exec("ALTER TABLE users ADD COLUMN avatar_path TEXT");
}
// Phase 2 social features: follows, connection requests, posts, comments, likes and notifications.
db.exec("CREATE TABLE IF NOT EXISTS follows (follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (follower_id, following_id), CHECK (follower_id != following_id), FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE)");
db.exec("CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id, follower_id)");
db.exec("CREATE TABLE IF NOT EXISTS connection_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK (requester_id != recipient_id), FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE)");
db.exec("CREATE INDEX IF NOT EXISTS idx_connection_requests_recipient ON connection_requests(recipient_id, status, id)");
db.exec("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 2000), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)");
db.exec("CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, id)");
db.exec("CREATE TABLE IF NOT EXISTS post_likes (post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (post_id, user_id), FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)");
db.exec("CREATE TABLE IF NOT EXISTS post_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 1000), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)");
db.exec("CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, id)");
db.exec("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, actor_id INTEGER, type TEXT NOT NULL, entity_id INTEGER, message TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL)");
db.exec("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, id)");

/* Phase 3: public/private channels with admin-only broadcast publishing. */
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
    description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 300),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','member')),
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS channel_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id, channel_id);
  CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id, id);
`);
// Phase 5: ephemeral Moments expire automatically after 24 hours.
db.exec(`
  CREATE TABLE IF NOT EXISTS moments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '' CHECK(length(content) <= 500),
    media_path TEXT,
    media_type TEXT CHECK(media_type IS NULL OR media_type IN ('image','video')),
    audience TEXT NOT NULL DEFAULT 'followers' CHECK(audience IN ('everyone','followers')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL DEFAULT (datetime('now', '+24 hours')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CHECK(length(content) > 0 OR media_path IS NOT NULL)
  );
  CREATE INDEX IF NOT EXISTS idx_moments_expiry ON moments(expires_at, user_id);
  CREATE INDEX IF NOT EXISTS idx_moments_user ON moments(user_id, id);
`);

/* Phase 13: durable direct-message delivery and read receipts. */
const messageColumnNames = db.prepare("PRAGMA table_info(messages)").all().map(column => column.name);
for (const [column, definition] of [
  ["delivered_at", "TEXT"],
  ["read_at", "TEXT"]
]) {
  if (!messageColumnNames.includes(column)) {
    db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${definition}`);
  }
}
db.exec("CREATE INDEX IF NOT EXISTS idx_messages_receipts ON messages(receiver_id, sender_id, read_at, delivered_at)");

/* Phase 14: direct-message replies and emoji reactions. */
const replyColumnNames = db.prepare("PRAGMA table_info(messages)").all().map(column => column.name);
if (!replyColumnNames.includes("reply_to_message_id")) {
  db.exec("ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL");
}
db.exec(`
  CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    emoji TEXT NOT NULL CHECK(length(emoji) BETWEEN 1 AND 16),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions(message_id, emoji);
`);

/* Phase 17: record when a sender edits a text message. */
const editColumns = db.prepare("PRAGMA table_info(messages)").all().map(column => column.name);
if (!editColumns.includes("edited_at")) {
  db.exec("ALTER TABLE messages ADD COLUMN edited_at TEXT");
}

/* Phase 16: per-user message hiding and sender-controlled deletion for everyone. */
const deletionColumns = db.prepare("PRAGMA table_info(messages)").all().map(column => column.name);
for (const [column, definition] of [
  ["deleted_at", "TEXT"],
  ["deleted_by", "INTEGER REFERENCES users(id)"]
]) {
  if (!deletionColumns.includes(column)) db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${definition}`);
}
db.exec(`
  CREATE TABLE IF NOT EXISTS message_hidden_for (
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    hidden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_message_hidden_user
  ON message_hidden_for(user_id, message_id);
`);

/* Phase 15A: retain the original sender when a direct message is forwarded. */
const forwardingColumns = db.prepare("PRAGMA table_info(messages)").all().map(column => column.name);
if (!forwardingColumns.includes("forwarded_from_username")) {
  db.exec("ALTER TABLE messages ADD COLUMN forwarded_from_username TEXT");
}



/* Phase 19: group media, replies, reactions, edits and deletions. */
db.exec(`
  CREATE TABLE IF NOT EXISTS group_message_reactions (
    group_message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    emoji TEXT NOT NULL CHECK(length(emoji) BETWEEN 1 AND 16),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_message_id, user_id, emoji),
    FOREIGN KEY (group_message_id) REFERENCES group_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_group_message_reactions_message
  ON group_message_reactions(group_message_id, emoji);
`);
const groupMessageColumns = db.prepare("PRAGMA table_info(group_messages)").all().map(column => column.name);
for (const [column, definition] of [
  ["media_path", "TEXT"],
  ["media_type", "TEXT"],
  ["reply_to_message_id", "INTEGER REFERENCES group_messages(id) ON DELETE SET NULL"],
  ["edited_at", "TEXT"],
  ["deleted_at", "TEXT"]
]) {
  if (!groupMessageColumns.includes(column)) db.exec(`ALTER TABLE group_messages ADD COLUMN ${column} ${definition}`);
}

/* Phase 21: per-member group delivery and read receipts. */
const groupReceiptTableExists = db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'group_message_receipts'"
).get();
db.exec(`
  CREATE TABLE IF NOT EXISTS group_message_receipts (
    group_message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    delivered_at TEXT,
    read_at TEXT,
    PRIMARY KEY (group_message_id, user_id),
    FOREIGN KEY (group_message_id) REFERENCES group_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_group_message_receipts_user
  ON group_message_receipts(user_id, read_at, group_message_id);
`);
// Treat pre-Phase-21 history as already seen; receipts are tracked for new messages.
if (!groupReceiptTableExists) {
  db.exec(`
    INSERT OR IGNORE INTO group_message_receipts
      (group_message_id, user_id, delivered_at, read_at)
    SELECT gm.id, member.user_id, gm.created_at, gm.created_at
    FROM group_messages gm
    JOIN group_members member ON member.group_id = gm.group_id
    WHERE member.user_id != gm.sender_id
      AND datetime(gm.created_at) >= datetime(member.joined_at)
  `);
}

module.exports = db;


/* Phase 23: group pinned messages and admin announcements. */
const phase23GroupColumns = db.prepare("PRAGMA table_info(group_messages)").all().map(column => column.name);
for (const [column, definition] of [
  ["is_announcement", "INTEGER NOT NULL DEFAULT 0"],
  ["pinned_at", "TEXT"],
  ["pinned_by", "INTEGER REFERENCES users(id)"]
]) {
  if (!phase23GroupColumns.includes(column)) db.exec(`ALTER TABLE group_messages ADD COLUMN ${column} ${definition}`);
}
db.exec("CREATE INDEX IF NOT EXISTS idx_group_messages_pinned ON group_messages(group_id, pinned_at)");


/* Phase 25A: secure group invitations. Only SHA-256 token hashes are stored. */
db.exec(`
  CREATE TABLE IF NOT EXISTS group_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    use_limit INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    CHECK (use_limit IS NULL OR use_limit BETWEEN 1 AND 1000),
    CHECK (use_count >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_group_invitations_group
    ON group_invitations(group_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS group_invitation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('joined','requested','revoked')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invitation_id) REFERENCES group_invitations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
