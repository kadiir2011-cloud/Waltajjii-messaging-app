# SQLite-to-MySQL 8 schema conversion register

This is a conversion register, not executable DDL. Every item must be reconciled against the current SQLite schema and application SQL before a MySQL schema is approved.

## Tables to preserve

| Area | Tables |
|---|---|
| Identity | `users` |
| Direct messaging | `messages`, `message_reactions`, `message_hidden_for` |
| Groups | `groups`, `group_members`, `group_messages`, `group_message_reactions`, `group_message_receipts`, `group_invitations`, `group_invitation_events`, `group_join_requests`, `group_activity`, `group_polls`, `group_poll_options`, `group_poll_votes`, `group_events`, `group_event_rsvps`, `group_event_reminder_deliveries` |
| Channels | `channels`, `channel_members`, `channel_messages` |
| Social | `follows`, `connection_requests`, `posts`, `post_likes`, `post_comments`, `notifications`, `moments` |

Total: 29 tables. Index inventory: 28 named indexes in the current `src/db.js`, plus primary-key and unique constraints.

## Type mapping policy for the DDL review

| SQLite source | MySQL 8 candidate | Review requirement |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT UNSIGNED AUTO_INCREMENT PRIMARY KEY` | Confirm maximum IDs and safe JS integer range before choosing INT/BIGINT. |
| Foreign-key `INTEGER` | Same signedness and width as referenced key | All referencing columns must match the referenced key type exactly. |
| `TEXT` free-form content | `TEXT` / `MEDIUMTEXT` | Choose based on actual app limits; index only bounded prefixes or dedicated normalized columns. |
| `TEXT` username | `VARCHAR(64)` (candidate) | Confirm maximum accepted username length in validation; use explicit case-insensitive collation and unique index. |
| `TEXT` media path / token hash | bounded `VARCHAR` (candidate) | Derive maximum lengths from generated values and Supabase object naming. |
| `TEXT DEFAULT CURRENT_TIMESTAMP` | `DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)` (candidate) | Standardize UTC handling and preserve historical timestamp meaning. |
| SQLite integer booleans | `TINYINT(1)` | Normalize to booleans at API boundary; retain checks where supported. |
| SQLite `CHECK` | MySQL 8 enforced `CHECK` | Confirm deployed MySQL 8 minor version and test each constraint. |
| `COLLATE NOCASE` | `utf8mb4_0900_ai_ci` or a selected case-insensitive collation | Confirm username normalization and uniqueness semantics; do not apply accent-insensitivity without product decision. |

## Required special conversions

### Case-insensitive username uniqueness
SQLite declares `users.username` with `COLLATE NOCASE UNIQUE`. MySQL must preserve case-insensitive uniqueness explicitly. The selected collation must be documented and tested with case-only and accent variants. Do not silently change login behavior.

### Pending group join-request uniqueness
SQLite uses a partial unique index:

```sql
CREATE UNIQUE INDEX idx_group_join_requests_pending
ON group_join_requests(group_id, user_id)
WHERE status = 'pending';
```

MySQL does not support this exact partial-index syntax. A generated nullable column such as `pending_user_id` can encode the pending-only key, with a unique index on `(group_id, user_id, pending_user_id)`; all non-pending rows must have NULL in the generated key. This design must be validated against the final status domain and concurrent approval/request operations.

### Ignore/conflict behavior
- Convert SQLite `INSERT OR IGNORE` only after determining which uniqueness conflict is intended.
- Prefer explicit `INSERT ... ON DUPLICATE KEY UPDATE` for known idempotent keys.
- Never use broad MySQL `INSERT IGNORE` as a mechanical replacement; it may suppress truncation and data-conversion errors.
- Convert SQLite `ON CONFLICT (...) DO UPDATE` to MySQL `ON DUPLICATE KEY UPDATE` only where the intended unique key is equivalent.

### Time expressions
- Replace SQLite `datetime('now')` / `datetime(column)` with explicit MySQL UTC-safe expressions.
- Preserve whether timestamps are stored as UTC text, local time, or offset-bearing ISO strings. Inspect actual stored values before choosing DATETIME versus VARCHAR.
- Test expiration boundaries for Moments and group invitations, and scheduled event reminders.

### String comparisons
SQLite `COLLATE NOCASE` and MySQL collations do not have identical Unicode behavior. Review every `COLLATE NOCASE` query and any case-sensitive comparison. Keep identifiers and tokens case-sensitive where required.

## Foreign-key ordering and deletion policy

Create parent tables before dependent tables. The final schema must preserve each declared `ON DELETE CASCADE`, `SET NULL`, or default restrictive relationship. Self-referencing message reply keys must be created after their parent table exists. Validate all foreign-key relationships before and after import.

## Data migration invariants

For every table:
1. Preserve primary-key values.
2. Preserve NULL versus empty string.
3. Preserve timestamps without implicit timezone shifts.
4. Preserve binary/Unicode text and emoji.
5. Preserve media paths exactly; media objects are backed up separately in Supabase.
6. Verify row counts and deterministic row digests.
7. Verify all foreign keys and unique constraints.
8. Restore AUTO_INCREMENT to greater than the maximum imported ID.

## Approval status

No executable MySQL schema has been approved or applied. This register is the review checklist for preparing the first DDL draft. The source SQLite schema and every route query must be cross-checked before any rehearsal import.
