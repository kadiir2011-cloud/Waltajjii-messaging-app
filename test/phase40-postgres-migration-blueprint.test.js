const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const ddl = fs.readFileSync(path.join(root, "migrations/postgres/001_initial_schema.sql"), "utf8");
const blueprint = fs.readFileSync(path.join(root, "PHASE-40-POSTGRESQL-MIGRATION-AND-PUBLIC-LAUNCH-BLUEPRINT.md"), "utf8");

const expectedTables = [
  "users", "messages", "groups", "group_members", "group_messages", "follows",
  "connection_requests", "posts", "post_likes", "post_comments", "notifications",
  "channels", "channel_members", "channel_messages", "moments", "message_reactions",
  "message_hidden_for", "group_message_reactions", "group_message_receipts",
  "group_invitations", "group_invitation_events", "group_join_requests",
  "group_activity", "group_polls", "group_poll_options", "group_poll_votes",
  "group_events", "group_event_rsvps", "group_event_reminder_deliveries"
];

test("PostgreSQL DDL contains all 29 named application tables", () => {
  const declared = [...ddl.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/gi)]
    .map((match) => match[1].toLowerCase());
  for (const name of expectedTables) assert.ok(declared.includes(name), "missing table: " + name);
  assert.equal(expectedTables.length, 29);
});

test("blueprint explicitly blocks public launch until critical migration and security gates pass", () => {
  for (const phrase of [
    "persistent managed PostgreSQL",
    "Socket.IO",
    "Background work",
    "dry-run mode",
    "backup and restore",
    "Public launch is blocked",
    "Explicit approval obtained"
  ]) assert.ok(blueprint.includes(phrase), "blueprint missing release requirement: " + phrase);
});

test("blueprint preserves the no-live-change safety boundary", () => {
  assert.match(blueprint, /does not connect to PostgreSQL or Supabase, execute SQL/);
  assert.match(blueprint, /does not .*change Render/);
});
