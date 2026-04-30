param(
  [string]$BaseUrl = 'http://127.0.0.1:5000',
  [string]$Scene = 'global'
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

function Get-Json($uri) {
  Invoke-RestMethod -Uri $uri -TimeoutSec 25
}

$apiBase = "$BaseUrl/api/v1"

Step "1. Read skill"
$skill = Invoke-WebRequest -Uri "$apiBase/openclaw/skill.md" -UseBasicParsing -TimeoutSec 25
Ensure ($skill.StatusCode -eq 200) "skill.md request failed"
Ensure ($skill.Content -match 'name: world-threads') "skill.md content did not match expected marker"
Ensure ($skill.Content -match 'source-knowledge/recall') "skill.md lost source recall entry"
Write-Host "skill.md OK"

Step "2. Source status"
$sourceStatus = Get-Json "$apiBase/world/source-knowledge/status?scene=$Scene"
Ensure ($sourceStatus.indexed_signal_count -gt 0) "source knowledge has no indexed signals"
Ensure ($sourceStatus.last_embedding_backend) "source knowledge did not report embedding backend"
Write-Host ("signals={0} indexed={1} backend={2}" -f $sourceStatus.signal_count, $sourceStatus.indexed_signal_count, $sourceStatus.last_embedding_backend)

Step "3. Recent signals"
$signals = Get-Json "$apiBase/world/signals?scene=$Scene&limit=8"
Ensure ($signals.signals.Count -gt 0) "recent signals returned no items"
Write-Host ("recent_signals={0}" -f $signals.signals.Count)

Step "4. LiveBench questions"
$questions = Get-Json "$apiBase/world/livebench/questions?scene=$Scene&audience=xia"
Ensure ($questions.Count -gt 0) "livebench questions returned no items"
$firstQuestion = $questions[0]
Ensure ($firstQuestion.question_id) "question item did not contain question_id"
Write-Host ("questions={0} first={1}" -f $questions.Count, $firstQuestion.question_id)

Step "5. Single question detail"
$encodedQuestionId = [uri]::EscapeDataString($firstQuestion.question_id)
$detail = Get-Json "$apiBase/world/livebench/questions?scene=$Scene&audience=xia&question_id=$encodedQuestionId"
Ensure ($detail.question.question_id) "single question detail did not return question"
Ensure ($detail.moderator_brief.summary) "single question detail missing moderator brief"
Write-Host ("detail_question={0}" -f $detail.question.question_id)

Step "6. Recall"
$query = [uri]::EscapeDataString($firstQuestion.title)
$recall = Get-Json "$apiBase/world/source-knowledge/recall?scene=$Scene&query=$query&limit=5"
Ensure ($recall.signals.Count -gt 0) "source recall returned no signals"
Write-Host ("recall_signals={0}" -f $recall.signals.Count)

Step "7. Evaluation"
$evaluation = Get-Json "$apiBase/world/livebench/evaluation?scene=$Scene"
Ensure ($evaluation.platform_model.resolved_question_count -ge 0) "evaluation missing platform_model"
Write-Host ("resolved={0} scored={1} avg_brier={2} hit_rate={3}" -f $evaluation.platform_model.resolved_question_count, $evaluation.platform_model.scored_question_count, $evaluation.platform_model.avg_brier, $evaluation.platform_model.hit_rate)

Step "Done"
[pscustomobject]@{
  skill = 'ok'
  source_signals = $sourceStatus.signal_count
  indexed_signals = $sourceStatus.indexed_signal_count
  recent_signals = $signals.signals.Count
  questions = $questions.Count
  recall_signals = $recall.signals.Count
  resolved_questions = $evaluation.platform_model.resolved_question_count
  scored_questions = $evaluation.platform_model.scored_question_count
} | Format-List
