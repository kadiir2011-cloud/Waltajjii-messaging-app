# Phase 62 — Username identity and case-sensitivity compatibility

## Audit conclusion

The earlier concern that SQLite login was case-sensitive while PostgreSQL login was case-insensitive is **not supported by the source code**. The current SQLite `users.username` column is declared `COLLATE NOCASE UNIQUE`; therefore its equality lookup in the SQLite login route is case-insensitive, and its uniqueness constraint rejects case variants. PostgreSQL migration 001 implements the equivalent rule with a unique index on `LOWER(username)`, while the PostgreSQL authentication service looks up with `LOWER(username) = LOWER($1)`.

The registration services on both sides trim surrounding whitespace and accept the same ASCII username grammar: 3–30 characters using letters, digits, and underscores. Unicode usernames are not accepted. For this allowed ASCII character set, SQLite NOCASE and PostgreSQL LOWER implement the intended case-insensitive identity rule.

## Work in this phase

- Added regression tests proving SQLite case-insensitive equality, login lookup semantics, and uniqueness.
- Added source-contract checks that SQLite and PostgreSQL retain matching case-insensitive identity rules and the same registration grammar.
- Added a preflight contract check confirming that case-insensitive duplicate legacy usernames are blocked before migration.
- Kept existing PostgreSQL HTTP integration tests as the end-to-end test for uppercase login and duplicate registration.

## Migration and safety

- No account names are rewritten or normalized.
- No account rows are merged, renamed, or deleted.
- No live SQLite database or Supabase project is accessed.
- No live PostgreSQL DDL or data is changed.
- No Render configuration, runtime, or deployment is changed.
- The PostgreSQL runtime remains opt-in and is not mounted in the production SQLite server.
- This is a draft integration branch and must not be merged or deployed until the full stacked review and staging gates are approved.

## Remaining identity checks before public cutover

- Run the read-only preflight against the final source database and resolve every reported case-insensitive collision.
- Verify any future username-change, recovery, discovery, and invitation lookup endpoints use the same identity rule.
- Preserve original display casing; use case-insensitive comparison only for identity matching.
