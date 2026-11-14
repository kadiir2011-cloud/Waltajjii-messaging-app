"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function read(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}
function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function evaluatePublicReleaseReadiness() {
  const db = read("src/db.js");
  const server = read("src/server.js");
  const storage = read("src/storage.js");
  const uploads = read("src/routes/uploads.js");
  const moments = read("src/routes/moments.js");
  const authLimiters = read("src/security/auth-rate-limiters.js");
  const authRoute = read("src/routes/auth.js");
  const redisStore = read("src/security/redis-rest-rate-limit-store.js");
  const recoveryTokens = read("src/security/account-recovery-tokens.js");
  const security = read("src/security/session-token-policy.js");
  const checks = [];

  function add(id, title, state, severity, evidence, action) {
    checks.push({ id, title, state, severity, evidence, action });
  }

  add(
    "durable-system-of-record",
    "Durable production database",
    /better-sqlite3/.test(db) && /require\(["']\.\/db["']\)/.test(server) ? "blocked" : "needs-review",
    "critical",
    "The live server imports the SQLite database module; PostgreSQL route composition exists separately and is not mounted by the live server.",
    "Complete a protected SQLite export, rehearse the full data migration into managed PostgreSQL, verify all records and relationships, and explicitly approve a controlled cutover."
  );
  add(
    "durable-media",
    "Fail-closed durable media storage",
    /if \(storageService\.configured\)[\s\S]*?else \{[\s\S]*?writeFileSync/.test(uploads) &&
      /if \(storageService\.configured\)[\s\S]*?else \{[\s\S]*?writeFileSync/.test(moments)
      ? "blocked" : "needs-review",
    "critical",
    "Upload and Moment handlers retain a local-filesystem fallback when Supabase Storage is not configured.",
    "Make production uploads fail closed without durable object storage; verify private bucket policies, object reconciliation, cleanup and restore."
  );
  add(
    "upload-content-inspection",
    "Actual file-content validation",
    /fileFilter:[\s\S]*?file\.mimetype/.test(uploads) && !/(file-type|magic-bytes|fileSignature|sniffFile)/i.test(uploads)
      ? "blocked" : "needs-review",
    "high",
    "The upload filter relies on the client-supplied MIME type; byte-signature inspection is not present in the inspected route.",
    "Validate file signatures against allowed formats, reject MIME/byte mismatches, and consider quarantine or malware scanning."
  );
  add(
    "shared-rate-limiting",
    "Shared rate limiting for multi-instance deployment",
    !/\bstore\s*:/.test(authLimiters) && /function createRedisRestRateLimitStore/.test(redisStore)
      ? "blocked" : "needs-review",
    "high",
    "Authentication limiters do not inject a shared store; a Redis REST adapter exists as a separate, not-yet-wired foundation.",
    "Provision and test a supported shared store, wire login and registration limiters, and verify behavior across independent app processes and provider outages."
  );
  add(
    "session-revocation",
    "Session inventory and revocation",
    !/session-token-policy/.test(authRoute) && !/session|revok/i.test(authRoute)
      ? "blocked" : "needs-review",
    "high",
    "The session-claim policy is not integrated into the live SQLite authentication route; the route issues stateless two-hour JWTs without a persistent revocation check.",
    "Implement and test per-device sessions, logout/revocation, refresh-token rotation and account-wide invalidation across HTTP and Socket.IO."
  );
  add(
    "account-recovery",
    "Operational account recovery",
    /createRecoveryToken/.test(recoveryTokens) && !/password\/(reset|forgot)|recover/i.test(authRoute)
      ? "blocked" : "needs-review",
    "high",
    "Secure token primitives exist, but the live authentication router has no password-recovery endpoint, persistence, single-use transaction or verified delivery integration.",
    "Implement rate-limited, single-use recovery with digest-only persistence, verified delivery, replay protection and session revocation."
  );
  add(
    "database-health",
    "Dependency-aware health checks",
    /app\.get\(["']\/health["'][\s\S]*?res\.json\(\{\s*status:\s*["']ok["']\s*\}\)/.test(server)
      ? "blocked" : "needs-review",
    "medium",
    "The current /health handler returns a static success response and does not verify database or storage readiness.",
    "Separate liveness and readiness endpoints; readiness should check essential dependencies without leaking configuration or user data."
  );
  add(
    "multi-instance-presence",
    "Cross-instance presence and call state",
    /const onlineUsers = new Map\(/.test(server) && /const activeCalls = new Map\(/.test(server)
      ? "blocked" : "needs-review",
    "high",
    "The live server keeps online-user and active-call state in process-local Maps.",
    "Use a shared presence/call coordination design and test reconnects, multiple instances and node restarts."
  );
  add(
    "production-deployment-manifest",
    "Reproducible production deployment configuration",
    exists("render.yaml") || exists("Dockerfile") ? "needs-review" : "blocked",
    "high",
    "No Render Blueprint or Dockerfile is present at the repository root; actual service settings must be verified in the hosting dashboard.",
    "Document the exact production build/start commands, runtime version, health check, persistent storage/database, secrets, scaling and rollback configuration."
  );
  add(
    "backup-restore-evidence",
    "Verified database and media backup restoration",
    "manual",
    "critical",
    "Repository CI rehearses a synthetic SQLite-to-PostgreSQL fixture; it does not prove a backup or restore of the actual live database and private media objects.",
    "Create encrypted backups of the real database and media inventory, restore into an isolated environment, and record row counts, checksums and recovery time."
  );
  add(
    "privacy-and-operations",
    "Public-facing privacy, support and incident processes",
    "manual",
    "high",
    "This source audit does not establish approved privacy/terms documents, support ownership, moderation operations, data-deletion workflow or incident response.",
    "Approve and publish privacy/terms/support information; document abuse reporting, moderation escalation, account/data deletion and incident response."
  );
  add(
    "staging-capacity",
    "Production-like staging and capacity evidence",
    "manual",
    "high",
    "Phase 89 is an isolated synthetic HTTP/Socket.IO baseline; it does not measure PostgreSQL, media, Render resources, multi-instance behavior or real user journeys.",
    "Run an approved, monitored load test against a production-like staging environment with realistic data and a defined initial-user target."
  );

  const positiveControls = [
    { id: "jwt-scope", present: /issuer:\s*["']waltajjii["'][\s\S]*?audience:\s*["']waltajjii-users["']/.test(server), note: "JWT issuer and audience are verified in the live server." },
    { id: "origin-policy", present: /createOriginPolicy\(process\.env\)/.test(server) && /allowRequest:/.test(server), note: "HTTP and Socket.IO origin checks are present." },
    { id: "helmet", present: /app\.use\(helmet\(/.test(server), note: "Helmet security headers are enabled." },
    { id: "disposable-postgres-ci", present: exists(".github/workflows/phase79-postgres-integration.yml"), note: "Disposable PostgreSQL integration CI exists." },
    { id: "migration-rehearsal", present: exists("scripts/phase58-postgres-migration-rehearsal.js"), note: "A guarded, disposable-only migration rehearsal tool exists." }
  ];

  const blockers = checks.filter(c => c.state === "blocked" || c.state === "manual");
  return {
    phase: 90,
    title: "Waltajjii public-release readiness assessment",
    status: blockers.some(c => c.severity === "critical") ? "NOT_READY_FOR_PUBLIC_LAUNCH" : blockers.length ? "CONDITIONAL" : "READY_FOR_FINAL_APPROVAL",
    generatedAt: new Date().toISOString(),
    scope: "Static repository audit plus explicit manual evidence gates; not a live-host, penetration, privacy-law or disaster-recovery certification.",
    blockerCount: blockers.length,
    checks,
    positiveControls,
    launchDecision: "Do not open unrestricted public registration or migrate/deploy production until every critical and high-severity blocker is resolved and evidence is reviewed."
  };
}

if (require.main === module) {
  const report = evaluatePublicReleaseReadiness();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.status === "NOT_READY_FOR_PUBLIC_LAUNCH") process.exitCode = 2;
}
module.exports = { evaluatePublicReleaseReadiness };
