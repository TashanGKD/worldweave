param(
  [string]$BaseUrl = "http://127.0.0.1:5000",
  [string]$Model = "MiniMax-M2.5"
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)

$root = Split-Path -Parent $PSScriptRoot
$hermesRepo = Join-Path $root "research\external-repos\hermes-agent"
$python = Join-Path $root ".hermes-venv\Scripts\python.exe"
$envFile = Join-Path $root ".env.local"

if (!(Test-Path $hermesRepo)) {
  throw "Hermes repo not found: $hermesRepo"
}
if (!(Test-Path $python)) {
  throw "Hermes Python not found: $python"
}
if (!(Test-Path $envFile)) {
  throw ".env.local not found: $envFile"
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$env:HERMES_HOME = Join-Path $hermesRepo ".hermes-world-test"
$env:OPENAI_API_KEY = $vars["MINIMAX_API_KEY"]
$env:OPENAI_BASE_URL = if ($vars["MINIMAX_BASE_URL"]) { $vars["MINIMAX_BASE_URL"] } else { "https://api.scnet.cn/api/llm/v1" }
$env:HERMES_INFERENCE_PROVIDER = "custom"
$env:HERMES_GIT_BASH_PATH = "C:\Program Files\Git\bin\bash.exe"
$env:NO_COLOR = "1"

$questionCount = $null
$taskText = $null
try {
  $questionResponse = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api/v1/world/livebench/questions?scene=global&status=active&limit=1&audience=xia" -TimeoutSec 60
  $questions = @($questionResponse.Content | ConvertFrom-Json)
  $questionCount = ($questions | Measure-Object).Count
  if ($questionCount -gt 0) {
    $q = $questions[0]
    $priceMatches = [regex]::Matches([string]$q.title, '(\d+(?:\.\d+)?)')
    $priceText = if ($priceMatches.Count -gt 0) { $priceMatches[$priceMatches.Count - 1].Groups[1].Value } else { "the stated threshold" }
    $instrument = if ([string]$q.title -match 'WTI') {
      "WTI crude oil"
    } elseif ([string]$q.title -match '布伦特|Brent') {
      "Brent crude oil"
    } else {
      "the stated subject"
    }
    $asciiQuestion = "Will $instrument be above $priceText USD at the stated resolve time?"
    $taskText = @(
      "question: $asciiQuestion",
      "background: The task asks whether the stated threshold is reached within the stated time window.",
      "topic: oil price",
      "region: $($q.region_label)",
      "resolve_at: $($q.resolve_at)",
      "status: $($q.settlement_status)",
      "moderator_note: The host has summarized the question, time window, and settlement rule.",
      "visible_source_note: no direct supporting source is included in this cleaned smoke-test package; if evidence is insufficient, say so instead of inferring market consensus"
    ) -join "`n"
  }
} catch {
  $questionCount = $null
}

if (-not $taskText) {
  $taskText = "question: no available question`nbackground: no open question is currently available for smoke testing."
}

$cacheDir = Join-Path $root ".cache"
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
$taskPath = Join-Path $cacheDir "hermes-world-smoke-task.txt"
Set-Content -Path $taskPath -Value $taskText -Encoding UTF8

$prompt = @"
You are running a mounted World source-skill scheduled task, not answering an end user.
Fetch this skill URL once only to confirm the current scheduled-task contract:
$BaseUrl/api/v1/openclaw/skill.md

Cleaned task package:
$taskText

Use ONLY that cleaned task package for the judgment. Do not fetch question detail, evaluation, logs, source status, signal pages, or any other URL.
This smoke test checks whether the mounted skill keeps LiveBench learning separate from user-facing source answers.

Return exactly these three lines and nothing else:
TITLE: <natural question title in Simplified Chinese, paraphrased from the ASCII question>
JUDGMENT: YES or NO
REASON: <one concrete source-based reason in Simplified Chinese>

Hard rules:
- No analysis, no preface, no markdown, no session id.
- JUDGMENT must be only YES or NO.
- Do not mention IDs, xia, votes, discussions, platform names, URLs, odds, percent signs, or probability wording.
- Do not mention market pricing, participant consensus, other agents, or community views.
- If the cleaned package has no direct source evidence, say current visible sources are insufficient instead of inventing evidence.
- Do not add facts that are not visible in the cleaned task package.
- Do not submit a vote.
"@

$sw = [Diagnostics.Stopwatch]::StartNew()
Push-Location $hermesRepo
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $promptPath = Join-Path $cacheDir "hermes-world-smoke-prompt.txt"
  Set-Content -Path $promptPath -Value $prompt -Encoding UTF8
  $runner = @'
import pathlib
import subprocess
import sys

prompt = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
model = sys.argv[2]
cmd = [
    sys.executable,
    "-m",
    "hermes_cli.main",
    "chat",
    "-q",
    prompt,
    "--model",
    model,
    "--toolsets",
    "terminal",
    "--max-turns",
    "15",
    "--yolo",
    "-Q",
]
completed = subprocess.run(cmd, text=True, encoding="utf-8", errors="replace")
raise SystemExit(completed.returncode)
'@
  $runnerPath = Join-Path $cacheDir "run-hermes-world-smoke.py"
  Set-Content -Path $runnerPath -Value $runner -Encoding UTF8
  $output = & $python $runnerPath $promptPath $Model 2>&1
  $exitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
  Pop-Location
  $sw.Stop()
}

$outputText = ($output | ForEach-Object {
  $text = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { [string]$_ }
  if ($text -and $text -ne "System.Management.Automation.RemoteException") { $text }
}) -join "`n"

$answerText = (($outputText -split "`r?`n" | Where-Object { $_.Trim() -ne "" -and $_ -notmatch '^session_id:' }) -join "`n").Trim()
$nonEmptyLines = @($answerText -split "`r?`n" | Where-Object { $_.Trim() -ne "" })
$hasExactThreeLineShape = (
  $nonEmptyLines.Count -eq 3 -and
  $nonEmptyLines[0] -match '^TITLE:\s*.+' -and
  $nonEmptyLines[1] -match '^JUDGMENT:\s*(YES|NO)\s*$' -and
  $nonEmptyLines[2] -match '^REASON:\s*.{6,}'
)
$forbiddenPattern = '(?i)(Manifold|Polymarket|Metaculus|Metaforecast|source_platform|origin_url|probability|aggregate_vote|market venue|market pricing|participant consensus|community views|other agents|question_id|xia_id|vote count|discussion count|其他虾|两位虾|参与者|共识|市场定价|市场|社群|Analysis|Based on|fetched|%|概率)'
$violatesOutputRules = [regex]::IsMatch($answerText, $forbiddenPattern)

[pscustomobject]@{
  ok = ($exitCode -eq 0 -and $hasExactThreeLineShape -and -not $violatesOutputRules)
  exit_code = $exitCode
  violates_output_rules = $violatesOutputRules
  has_exact_three_line_shape = $hasExactThreeLineShape
  elapsed_ms = $sw.ElapsedMilliseconds
  model = $Model
  base_url = $BaseUrl
  question_count = $questionCount
  output = $answerText
  raw_output = $outputText
} | ConvertTo-Json -Depth 4
