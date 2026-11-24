# Disposable MySQL 8 validation

This is a local-only rehearsal. It is not connected to Render, Supabase, or the live Waltajjii service.

## Requirements
- Windows PowerShell 5.1 or PowerShell 7
- Docker Desktop installed and running
- Internet access for the first pull of the pinned `mysql:8.0.36` image

## Run
Open PowerShell in this folder and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Test-Waltajjii-MySQL8.ps1
```

The script generates throwaway random credentials in memory, starts a container bound only to `127.0.0.1:3307`, waits for MySQL health, verifies exactly 29 tables, and runs constraint tests. It does not remove the container or volume when finished.

## Inspect
```powershell
docker logs waltajjii-mysql8-validation
docker exec -it waltajjii-mysql8-validation mysql -uroot -p -D waltajjii_migration_test
```

The generated root password is intentionally not printed or saved. If you need an interactive session, rerun the script with a planned credential-handling workflow or inspect using the validation runner. Do not reuse any local validation credential in production.

## Cleanup (destructive to this disposable test database only)
After reviewing results and exiting the MySQL client:

```powershell
docker compose -f .\docker-compose.mysql8-validation.yml down -v
```

This removes the local test container and its disposable database volume. Do not run cleanup if you want to preserve this test instance for further inspection.

## Scope and limitations
- The SQL file is a conversion draft, not a certified final production schema.
- The runner verifies DDL initialization, table count, pending-request uniqueness behavior, foreign-key enforcement, and a message-body CHECK constraint.
- It does not validate live data compatibility, every application query, throughput, concurrency, timestamp fidelity, or a production migration.
- A current consistent export of the live SQLite database is still required before designing and testing the data-copy phase.
- The test volume is disposable. Never point this compose file at a production database.
