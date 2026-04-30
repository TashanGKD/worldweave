param(
  [string]$BaseUrl = 'http://192.168.3.124:5002',
  [string]$BindKey = 'world_threads_entry',
  [string]$Scene = 'global',
  [string]$XiaId = 'worldline-primary'
)

$ErrorActionPreference = 'Stop'

function Step($message) {
  Write-Host ""
  Write-Host "== $message ==" -ForegroundColor Cyan
}

function Ensure($condition, $message) {
  if (-not $condition) {
    throw $message
  }
}

$apiBase = "$BaseUrl/api/v1"

Step "1. Read skill"
$skill = & curl.exe -fsS "$apiBase/openclaw/skill.md?key=$BindKey"
Ensure ($LASTEXITCODE -eq 0) "skill.md request failed"
Ensure ($skill -match 'name: world-threads') "skill.md content did not match expected marker"
Write-Host "skill.md OK"

Step "2. Bootstrap"
$bootstrap = Invoke-RestMethod -Uri "$apiBase/openclaw/bootstrap?key=$BindKey"
Ensure ($bootstrap.access_token) "bootstrap did not return access_token"
Write-Host ("bind_key={0}" -f $bootstrap.bind_key)

Step "3. Manifest / policy"
$manifest = Invoke-RestMethod -Uri "$apiBase/openclaw/manifest"
$policy = Invoke-RestMethod -Uri "$apiBase/openclaw/cli-policy-pack"
Ensure ($manifest.commands.'world.report'.enabled) "world.report is not enabled in manifest"
Ensure ($policy.world_defaults.role -eq 'world_reporter') "unexpected policy payload"
Write-Host "manifest + policy OK"

Step "4. World state"
$state = Invoke-RestMethod -Uri "$apiBase/world/state?scene=$Scene"
Ensure ($state.nodes.Count -gt 0) "world state returned no nodes"
Write-Host ("nodes={0} reports={1}" -f $state.nodes.Count, $state.projection_reports.Count)

Step "5. Briefing"
$briefing = Invoke-RestMethod -Uri "$apiBase/world/briefing?scene=$Scene&xia_id=$XiaId"
Ensure ($briefing.mission_id) "briefing did not return mission_id"
Ensure ($briefing.evidence_signals.Count -gt 0) "briefing has no evidence_signals"
Write-Host ("mission_id={0}" -f $briefing.mission_id)

Step "6. Dispatch"
$dispatchBody = @{
  scene = $Scene
  xia_id = $XiaId
  mission_id = $briefing.mission_id
  briefing = $briefing
} | ConvertTo-Json -Depth 20
$dispatch = Invoke-RestMethod -Uri "$apiBase/world/dispatch" -Method Post -ContentType 'application/json' -Body $dispatchBody
Ensure ($dispatch.ok -eq $true) "dispatch did not return ok=true"
Ensure ($dispatch.briefing.mission_id) "dispatch did not return briefing.mission_id"
Write-Host ("dispatch_mission_id={0}" -f $dispatch.briefing.mission_id)

Step "7. Report"
$reportBody = @{
  scene = $Scene
  xia_id = $XiaId
  mission_id = $dispatch.briefing.mission_id
  briefing = $dispatch.briefing
} | ConvertTo-Json -Depth 20
$report = Invoke-RestMethod -Uri "$apiBase/world/report" -Method Post -ContentType 'application/json' -Body $reportBody
Ensure ($report.mission_id) "report did not return mission_id"
Ensure ($report.signal_id) "report did not return signal_id"
Ensure ($report.summary) "report did not return summary"
Write-Host ("report_mission_id={0}" -f $report.mission_id)
Write-Host ("summary={0}" -f $report.summary)

Step "Done"
[pscustomobject]@{
  skill = 'ok'
  bootstrap = 'ok'
  manifest = 'ok'
  policy = 'ok'
  state_nodes = $state.nodes.Count
  briefing_mission_id = $briefing.mission_id
  dispatch_mission_id = $dispatch.briefing.mission_id
  report_mission_id = $report.mission_id
  report_signal_id = $report.signal_id
} | Format-List
