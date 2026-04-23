param(
  [string]$HostAddress = "0.0.0.0",
  [int]$Port = 9119,
  [switch]$OpenBrowser,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$hermesRepo = Join-Path $root "research\external-repos\hermes-agent"
$python = Join-Path $root ".hermes-venv\Scripts\python.exe"
$envFile = Join-Path $root ".env.local"
$hermesHome = Join-Path $hermesRepo ".hermes-world-test"
$webDist = Join-Path $hermesRepo "hermes_cli\web_dist"
$outLog = Join-Path $root ".cache\hermes-dashboard-current.out.log"
$errLog = Join-Path $root ".cache\hermes-dashboard-current.err.log"

if (!(Test-Path $hermesRepo)) { throw "Hermes repo not found: $hermesRepo" }
if (!(Test-Path $python)) { throw "Hermes Python not found: $python" }
if (!(Test-Path $envFile)) { throw ".env.local not found: $envFile" }
if (!(Test-Path (Join-Path $webDist "index.html"))) {
  throw "Hermes web_dist not built: $webDist. Build it from research\external-repos\hermes-agent\web first."
}

New-Item -ItemType Directory -Force -Path (Join-Path $root ".cache") | Out-Null

$existing = netstat -ano | Select-String (":$Port\s") | Where-Object { $_.Line -match '\sLISTENING\s' }
if ($existing) {
  $line = ($existing | Select-Object -First 1).Line.Trim()
  $pidText = ($line -split '\s+')[-1]
  [pscustomobject]@{
    ok = $true
    already_running = $true
    port = $Port
    pid = $pidText
    local_url = "http://127.0.0.1:$Port/"
    bind = $line
  } | ConvertTo-Json -Depth 5
  exit 0
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$env:HERMES_HOME = $hermesHome
$env:HERMES_WEB_DIST = $webDist
$env:OPENAI_API_KEY = $vars["MINIMAX_API_KEY"]
$env:OPENAI_BASE_URL = $vars["MINIMAX_BASE_URL"]
$env:HERMES_INFERENCE_PROVIDER = "custom"
$env:NO_COLOR = "1"

$args = @(
  "-m", "hermes_cli.main",
  "dashboard",
  "--host", $HostAddress,
  "--port", "$Port",
  "--insecure"
)
if (!$OpenBrowser) {
  $args += "--no-open"
}

if ($Foreground) {
  & $python $args
  exit $LASTEXITCODE
}

if (Test-Path $outLog) { Remove-Item -LiteralPath $outLog -Force }
if (Test-Path $errLog) { Remove-Item -LiteralPath $errLog -Force }

$proc = Start-Process -FilePath $python `
  -ArgumentList $args `
  -WorkingDirectory $hermesRepo `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -PassThru `
  -WindowStyle Hidden

Start-Sleep -Seconds 3

$listener = netstat -ano | Select-String (":$Port\s") | Where-Object { $_.Line -match '\sLISTENING\s' } | Select-Object -First 1
if (!$listener) {
  $outTail = if (Test-Path $outLog) { Get-Content $outLog -Tail 30 } else { @() }
  $errTail = if (Test-Path $errLog) { Get-Content $errLog -Tail 30 } else { @() }
  [pscustomobject]@{
    ok = $false
    pid = $proc.Id
    port = $Port
    out_log = $outLog
    err_log = $errLog
    out_tail = $outTail
    err_tail = $errTail
  } | ConvertTo-Json -Depth 5
  exit 1
}

$lanIps = @()
try {
  $lanIps = @(ipconfig | Select-String 'IPv4.*:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)' | ForEach-Object {
    $ip = $_.Matches[0].Groups[1].Value
    if ($ip -notlike "127.*" -and $ip -notlike "169.254.*") { $ip }
  } | Select-Object -Unique)
} catch {
  $lanIps = @()
}

[pscustomobject]@{
  ok = $true
  already_running = $false
  pid = $proc.Id
  port = $Port
  local_url = "http://127.0.0.1:$Port/"
  lan_urls = @($lanIps | ForEach-Object { "http://${_}:$Port/" })
  out_log = $outLog
  err_log = $errLog
} | ConvertTo-Json -Depth 5
