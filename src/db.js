
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
module.exports = db;
