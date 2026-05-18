param(
  [string]$BaseUrl = '',
  [string]$BindKey = 'world_threads_entry',
  [string]$Scene = 'global'
)

$ErrorActionPreference = 'Stop'

if (-not $BaseUrl) {
  if ($env:WORLD_SKILL_SMOKE_BASE_URL) {
    $BaseUrl = $env:WORLD_SKILL_SMOKE_BASE_URL
  } elseif ($env:WORLD_BASE_URL) {
    $BaseUrl = $env:WORLD_BASE_URL
  } else {
    $BaseUrl = 'http://127.0.0.1:5000'
  }
}

$BaseUrl = $BaseUrl.TrimEnd('/')
$apiBase = "$BaseUrl/api/v1"

function Step($message) {
  Write-Host ""
  Write-Host "== $message ==" -ForegroundColor Cyan
}

function Ensure($condition, $message) {
  if (-not $condition) {
    throw $message
  }
}

function Read-Text($path) {
  $response = Invoke-WebRequest -Uri "$apiBase$path" -UseBasicParsing -TimeoutSec 30
  Ensure ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) "$path returned $($response.StatusCode)"
  return $response.Content
}

Step "1. Skill markdown"
$mainSkill = Read-Text "/openclaw/skill.md?key=$BindKey"
$aiHotSkill = Read-Text '/openclaw/ai.skill.md'
$liveBenchSkill = Read-Text '/openclaw/livebench.skill.md'
Ensure ($mainSkill -match 'name: world-threads') 'main skill marker missing'
Ensure ($mainSkill -match 'title:') 'main skill title missing'
Ensure ($aiHotSkill -match 'ai-daily-world-source') 'AI daily skill marker missing'
Ensure ($liveBenchSkill -match 'LiveBench') 'LiveBench skill marker missing'
Write-Host "skills OK"

Step "2. World state"
$state = Invoke-RestMethod -Uri "$apiBase/world/state?scene=$Scene" -TimeoutSec 60
$nodeCount = @($state.nodes).Count
$topSignalCount = @($state.top_signals).Count
Ensure (($nodeCount + $topSignalCount) -gt 0) 'world state returned no visible signals'
Write-Host ("nodes={0} top_signals={1}" -f $nodeCount, $topSignalCount)

Step "3. AI source feed"
$aiSignals = Invoke-RestMethod -Uri "$apiBase/world/signals?scene=tech-ai&limit=12" -TimeoutSec 30
$aiSignalItems = if ($aiSignals.signals) { @($aiSignals.signals) } elseif ($aiSignals.list) { @($aiSignals.list) } else { @($aiSignals) }
Ensure ($aiSignalItems.Count -gt 0) 'AI signals endpoint returned no items'
$aiHotFeed = Invoke-RestMethod -Uri "$apiBase/topiclab/source-feed/articles?scene=tech-ai&source=aihot&limit=5" -TimeoutSec 30
Ensure (@($aiHotFeed.list).Count -gt 0) 'AI frontpage source-feed returned no items'
Write-Host ("ai_signals={0} aihot_items={1}" -f $aiSignalItems.Count, @($aiHotFeed.list).Count)

Step "4. Source governance"
$sourceStatus = Invoke-RestMethod -Uri "$apiBase/world/source-knowledge/status?scene=global" -TimeoutSec 30
Ensure ($sourceStatus.signal_count -gt 0) 'source status has no signal_count'
Ensure ($sourceStatus.source_health.stable_source_count -gt 0) 'source health has no stable sources'
$dbConfigured = [bool]($env:WORLDWEAVE_DATABASE_URL -or $env:DATABASE_URL)
if ($dbConfigured) {
  Ensure ($sourceStatus.source_monitor_db.connected -eq $true) 'source monitor database is configured but not connected'
}
Write-Host ("signals={0} stable_sources={1} db_connected={2}" -f $sourceStatus.signal_count, $sourceStatus.source_health.stable_source_count, $sourceStatus.source_monitor_db.connected)

Step "5. LiveBench read-only flow"
$questions = Invoke-RestMethod -Uri "$apiBase/world/livebench/questions?scene=global&limit=8&audience=xia" -TimeoutSec 30
$questionItems = @($questions)
Ensure ($questionItems.Count -gt 0) 'LiveBench questions returned no items'
$questionId = [uri]::EscapeDataString($questionItems[0].question_id)
$detail = Invoke-RestMethod -Uri "$apiBase/world/livebench/questions/$questionId`?scene=global&audience=xia" -TimeoutSec 30
Ensure ($detail.preview.question_id) 'LiveBench detail missing preview'
Write-Host ("questions={0} detail={1}" -f $questionItems.Count, $detail.preview.question_id)

Step "Done"
[pscustomobject]@{
  base_url = $BaseUrl
  skill = 'ok'
  state_nodes = $nodeCount
  state_top_signals = $topSignalCount
  ai_signals = $aiSignalItems.Count
  aihot_items = @($aiHotFeed.list).Count
  source_signals = $sourceStatus.signal_count
  stable_sources = $sourceStatus.source_health.stable_source_count
  source_monitor_db_connected = $sourceStatus.source_monitor_db.connected
  livebench_questions = $questionItems.Count
  livebench_detail = $detail.preview.question_id
} | Format-List
