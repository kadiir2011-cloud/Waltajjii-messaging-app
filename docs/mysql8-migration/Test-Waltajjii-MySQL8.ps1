# Waltajjii MySQL 8 disposable validation runner.
# Starts only a local Docker container bound to 127.0.0.1:3307.
# It does not connect to Render, Supabase, or the live Waltajjii application.
# It does not delete the validation volume. Remove it manually only after review.

$ErrorActionPreference = "Stop"
$ComposeFile = Join-Path $PSScriptRoot "docker-compose.mysql8-validation.yml"
$SchemaFile = Join-Path $PSScriptRoot "mysql8-schema-draft.sql"
$SmokeFile = Join-Path $PSScriptRoot "mysql8-smoke-tests.sql"
$ContainerName = "waltajjii-mysql8-validation"

foreach ($file in @($ComposeFile, $SchemaFile, $SmokeFile)) {
  if (-not (Test-Path $file)) { throw "Required file not found: $file" }
}

$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) { throw "Docker CLI not found. Install/start Docker Desktop, then retry." }

docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop is not running or the Docker engine is unavailable." }

# Use a list/filter query: "inspect" writes an error when the container is absent,
# and PowerShell 7 can promote native stderr to a terminating error under Stop.
$existing = docker container ls -aq --filter "name=^/$ContainerName$"
if ($LASTEXITCODE -ne 0) { throw "Could not check whether the validation container already exists." }
if ($existing) {
  throw "Container '$ContainerName' already exists. Inspect it first; this runner will not replace or delete it."
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','A').Replace('/','B')
}

$env:MYSQL_ROOT_PASSWORD = New-RandomSecret
$env:MYSQL_APP_PASSWORD = New-RandomSecret

try {
  Write-Host "Starting isolated MySQL 8.0.36 validation container..." -ForegroundColor Cyan
  docker compose -f $ComposeFile up -d
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed to start the validation database." }

  $ready = $false
  for ($i = 1; $i -le 60; $i++) {
    $health = docker inspect --format '{{.State.Health.Status}}' $ContainerName 2>$null
    if ($health -eq "healthy") { $ready = $true; break }
    if ($health -eq "unhealthy") { throw "MySQL container became unhealthy. Inspect: docker logs $ContainerName" }
    Start-Sleep -Seconds 5
  }
  if (-not $ready) { throw "MySQL did not become healthy within 5 minutes. Inspect: docker logs $ContainerName" }

  Write-Host "MySQL is healthy. Checking schema and table count..." -ForegroundColor Cyan
  $tableCount = docker exec $ContainerName mysql -uroot "-p$env:MYSQL_ROOT_PASSWORD" -N -B -D waltajjii_migration_test -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE';"
  if ($LASTEXITCODE -ne 0) { throw "Could not query schema table count." }
  $tableCount = ($tableCount | Out-String).Trim()
  if ($tableCount -ne "29") { throw "Expected 29 application tables, found '$tableCount'. Do not proceed." }

  Write-Host "Running constraint and behavior smoke tests..." -ForegroundColor Cyan
  Get-Content -Raw $SmokeFile | docker exec -i $ContainerName mysql -uroot "-p$env:MYSQL_ROOT_PASSWORD" -D waltajjii_migration_test
  if ($LASTEXITCODE -ne 0) { throw "Schema smoke tests failed. Inspect output above and container logs." }

  Write-Host ""
  Write-Host "PASS: MySQL 8.0.36 started; all 29 tables exist; smoke tests completed." -ForegroundColor Green
  Write-Host "The disposable database remains available at 127.0.0.1:3307 for inspection."
  Write-Host "Credentials were randomly generated for this disposable container and were not printed or written to the repository."
  Write-Host "No live app, Render service, Supabase project, or production database was changed."
}
finally {
  Remove-Item Env:MYSQL_ROOT_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:MYSQL_APP_PASSWORD -ErrorAction SilentlyContinue
}
