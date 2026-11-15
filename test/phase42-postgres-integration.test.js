const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL must point only to the disposable CI PostgreSQL service");
}

const pool = new Pool({ connectionString, max: 3 });
const root = path.join(__dirname, "..");
const ddl = fs.readFileSync(
  path.join(root, "migrations/postgres/001_initial_schema.sql"),
  "utf8"
);

const expectedTables = [
  "users", "messages", "groups", "group_members", "group_messages",
  "follows", "connection_requests", "posts", "post_likes", "post_comments",
  "notifications", "channels", "channel_members", "channel_messages", "moments",
  "message_reactions", "message_hidden_for", "group_message_reactions",
  "group_message_receipts", "group_invitations", "group_invitation_events",
  "group_join_requests", "group_activity", "group_polls", "group_poll_options",
  "group_poll_votes", "group_events", "group_event_rsvps",
  "group_event_reminder_deliveries"
];

const identityTables = [
  "users", "messages", "groups", "group_messages", "connection_requests",
  "posts", "post_comments", "notifications", "channels", "channel_messages",
  "moments", "group_invitations", "group_invitation_events",
  "group_join_requests", "group_activity", "group_polls",
  "group_poll_options", "group_events"
];

test("execute the complete draft DDL in the disposable PostgreSQL database", async () => {
  await pool.query(ddl);
  const schema = await pool.query(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'waltajjii'"
  );
  assert.equal(schema.rowCount, 1);
});

test("PostgreSQL creates exactly the 29 expected application tables in the isolated schema", async () => {
  const result = await pool.query(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'waltajjii' ORDER BY tablename"
  );
  const actual = result.rows.map(row => row.tablename);
  assert.equal(actual.length, 29);
  assert.deepEqual(actual, [...expectedTables].sort());
  const publicTables = await pool.query(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
    [expectedTables]
  );
  assert.equal(publicTables.rowCount, 0, "application tables must not leak into public schema");
});

test("all standalone entity IDs are real PostgreSQL identity columns", async () => {
  const result = await pool.query(
    "SELECT table_name, column_name, is_identity, data_type FROM information_schema.columns WHERE table_schema='waltajjii' AND column_name='id' AND table_name = ANY($1::text[])",
    [identityTables]
  );
  assert.equal(result.rowCount, identityTables.length);
  for (const row of result.rows) {
    assert.equal(row.is_identity, "YES", row.table_name);
    assert.equal(row.data_type, "bigint", row.table_name);
  }
});

test("timestamp, username, and poll-integrity contracts exist in PostgreSQL catalogs", async () => {
  const timestamps = await pool.query(
    "SELECT table_name, data_type FROM information_schema.columns WHERE table_schema='waltajjii' AND table_name IN ('users','messages','moments','group_events') AND column_name IN ('created_at','delivered_at','read_at','expires_at','starts_at')"
  );
  assert.ok(timestamps.rowCount >= 8);
  for (const row of timestamps.rows) {
    assert.equal(row.data_type, "timestamp with time zone", row.table_name);
  }

  const usernameIndex = await pool.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='waltajjii' AND indexname='users_username_lower_uq'"
  );
  assert.equal(usernameIndex.rowCount, 1);
  assert.match(usernameIndex.rows[0].indexdef, /lower\(username\)/i);

  const pollFk = await pool.query(
    "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='waltajjii'::regnamespace AND conname='group_poll_votes_option_same_poll_fk'"
  );
  assert.equal(pollFk.rowCount, 1);
  assert.match(pollFk.rows[0].definition, /FOREIGN KEY \(poll_id, option_id\)/i);
  assert.match(pollFk.rows[0].definition, /REFERENCES waltajjii\.group_poll_options\(poll_id, id\)/i);
});

test("synthetic inserts enforce identity, case-insensitive uniqueness, checks, and same-poll votes", async () => {
  const client = await pool.connect();
  let userId;
  try {
    await client.query("BEGIN");

    const user = await client.query(
      "INSERT INTO waltajjii.users (username,password_hash) VALUES ($1,$2) RETURNING id",
      ["phase42-synthetic-user", "not-a-real-password-hash"]
    );
    userId = user.rows[0].id;
    assert.ok(BigInt(userId) > 0n);

    await client.query("SAVEPOINT duplicate_username");
    await assert.rejects(
      client.query(
        "INSERT INTO waltajjii.users (username,password_hash) VALUES ($1,$2)",
        ["PHASE42-SYNTHETIC-USER", "synthetic"]
      ),
      error => error.code === "23505"
    );
    await client.query("ROLLBACK TO SAVEPOINT duplicate_username");

    const secondUser = await client.query(
      "INSERT INTO waltajjii.users (username,password_hash) VALUES ($1,$2) RETURNING id",
      ["phase42-synthetic-user-2", "synthetic"]
    );

    const group = await client.query(
      "INSERT INTO waltajjii.groups (name,created_by) VALUES ($1,$2) RETURNING id",
      ["Phase 42 synthetic group", userId]
    );
    const pollA = await client.query(
      "INSERT INTO waltajjii.group_polls (group_id,creator_id,question) VALUES ($1,$2,$3) RETURNING id",
      [group.rows[0].id, userId, "Synthetic poll A?"]
    );
    const pollB = await client.query(
      "INSERT INTO waltajjii.group_polls (group_id,creator_id,question) VALUES ($1,$2,$3) RETURNING id",
      [group.rows[0].id, userId, "Synthetic poll B?"]
    );
    const optionB = await client.query(
      "INSERT INTO waltajjii.group_poll_options (poll_id,option_text) VALUES ($1,$2) RETURNING id",
      [pollB.rows[0].id, "Option belonging to poll B"]
    );

    await client.query("SAVEPOINT cross_poll_vote");
    await assert.rejects(
      client.query(
        "INSERT INTO waltajjii.group_poll_votes (poll_id,option_id,user_id) VALUES ($1,$2,$3)",
        [pollA.rows[0].id, optionB.rows[0].id, secondUser.rows[0].id]
      ),
      error => error.code === "23503"
    );
    await client.query("ROLLBACK TO SAVEPOINT cross_poll_vote");

    await client.query("SAVEPOINT invalid_message");
    await assert.rejects(
      client.query(
        "INSERT INTO waltajjii.messages (sender_id,receiver_id,body) VALUES ($1,$2,$3)",
        [userId, secondUser.rows[0].id, ""]
      ),
      error => error.code === "23514"
    );
    await client.query("ROLLBACK TO SAVEPOINT invalid_message");

    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const count = await pool.query(
    "SELECT count(*)::int AS count FROM waltajjii.users WHERE username LIKE 'phase42-synthetic-user%'"
  );
  assert.equal(count.rows[0].count, 0, "synthetic records must be rolled back");
});

test("foreign keys and indexes are installed and transaction rollback is effective", async () => {
  const fks = await pool.query(
    "SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace='waltajjii'::regnamespace AND contype='f'"
  );
  assert.ok(fks.rows[0].count >= 40, "expected the relational foreign-key graph");

  const indexes = await pool.query(
    "SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname='waltajjii'"
  );
  assert.ok(indexes.rows[0].count >= 35, "expected application lookup and integrity indexes");
});

test.after(async () => {
  await pool.end();
});
