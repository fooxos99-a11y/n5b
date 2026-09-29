$ErrorActionPreference = 'Stop'
# Local MySQL for Nukhab only: its own data folder and port, separate from every other project.
$port = 3310
$mysqlBin = 'C:\Program Files\MySQL\MySQL Server 8.4\bin'
if (-not (Test-Path -LiteralPath (Join-Path $mysqlBin 'mysqld.exe'))) {
  $found = Get-ChildItem -LiteralPath 'C:\Program Files\MySQL' -Recurse -Filter 'mysqld.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $found) { throw 'MySQL Server is not installed.' }
  $mysqlBin = $found.DirectoryName
}
$mysqld = Join-Path $mysqlBin 'mysqld.exe'
$root = Join-Path $env:LOCALAPPDATA 'nukhab-mysql'
$data = Join-Path $root 'data'
$ini = Join-Path $root 'mysql.ini'
New-Item -ItemType Directory -Force -Path $root | Out-Null
$logFile = Join-Path $root 'mysql-error.log'
$slash = { param($path) $path -replace '\\', '/' }
$iniText = "[mysqld]`r`nbasedir=$(& $slash (Split-Path -Parent $mysqlBin))`r`ndatadir=$(& $slash $data)`r`nport=$port`r`nbind-address=127.0.0.1`r`nmysqlx=0`r`ncharacter-set-server=utf8mb4`r`ncollation-server=utf8mb4_unicode_ci`r`nlog-error=$(& $slash $logFile)`r`n"
[IO.File]::WriteAllText($ini, $iniText, (New-Object System.Text.UTF8Encoding($false)))

if (-not (Test-Path -LiteralPath $data)) {
  Write-Host 'Creating the Nukhab database folder (first run only)...'
  & $mysqld "--defaults-file=$ini" --initialize-insecure --console
  if ($LASTEXITCODE -ne 0) { throw 'MySQL initialization failed.' }
}

$listening = { Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue }
if (-not (& $listening)) {
  $outFile = Join-Path $root 'mysqld-out.log'
  $errFile = Join-Path $root 'mysqld-err.log'
  $process = Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=`"$ini`"" -WorkingDirectory $mysqlBin -WindowStyle Hidden -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  for ($i = 0; $i -lt 30 -and -not (& $listening); $i++) { Start-Sleep -Seconds 1 }
  if (-not (& $listening)) {
    if ($process.HasExited) { Write-Host "mysqld exited with code $($process.ExitCode)" }
    foreach ($file in @($errFile, $outFile, $logFile)) { if (Test-Path -LiteralPath $file) { Get-Content -LiteralPath $file -Tail 15 } }
    throw "MySQL did not start on port $port."
  }
}

$envFile = Join-Path $PSScriptRoot '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) {
  $lines = @(
    'SITE_KEY=nukhab', 'API_PORT=3002', 'MYSQL_HOST=127.0.0.1', "MYSQL_PORT=$port",
    'MYSQL_USER=root', 'MYSQL_PASSWORD=', 'MYSQL_DATABASE=nukhab_local',
    'PLATFORM_MYSQL_DATABASE=nukhab_platform_local', 'PLATFORM_TENANT_DATABASE_PREFIX=nukhab_tenant_',
    'MANAGER_LOGIN_NUMBER=1483', 'SEED_DEFAULT_DATA=false'
  )
  [IO.File]::WriteAllText($envFile, (($lines -join "`r`n") + "`r`n"), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'Created .env.local'
}
Write-Host "MySQL ready on port $port"
