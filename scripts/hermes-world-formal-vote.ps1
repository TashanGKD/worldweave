param(
  [string]$BaseUrl = "http://127.0.0.1:5000",
  [string]$Model = "MiniMax-M2.5",
  [string]$XiaId = "hermes-minimax",
  [string]$ContributorLabel = "Hermes / MiniMax-M2.5",
  [string]$SkipQuestionIds = "",
  [int]$WorldApiTimeoutSec = 25,
  [int]$HermesTimeoutSec = 180,
  [int]$RetryDepth = 0,
  [switch]$UseHermesTerminalFetch
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
$cacheDir = Join-Path $root ".cache"
$progressPath = Join-Path $cacheDir "hermes-world-formal-vote-progress.log"

function Write-ProgressLog([string]$stage) {
  if (!(Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir | Out-Null
  }
  Add-Content -LiteralPath $progressPath -Value "$((Get-Date).ToUniversalTime().ToString("o")) $stage" -Encoding UTF8
}

Write-ProgressLog "start base_url=$BaseUrl api_timeout=$WorldApiTimeoutSec hermes_timeout=$HermesTimeoutSec"

if (!(Test-Path $hermesRepo)) { throw "Hermes repo not found: $hermesRepo" }
if (!(Test-Path $python)) { throw "Hermes Python not found: $python" }
if (!(Test-Path $envFile)) { throw ".env.local not found: $envFile" }

$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim()
  }
}
$skipQuestionIdList = @($SkipQuestionIds -split '\|\|\|' | Where-Object { $_.Trim() -ne "" })
$runsPathForSkip = Join-Path $cacheDir "hermes-world-formal-vote-runs.jsonl"
if (Test-Path $runsPathForSkip) {
  $historicalQuestionIds = @(
    Get-Content -LiteralPath $runsPathForSkip -Tail 500 | ForEach-Object {
      try {
        $record = $_ | ConvertFrom-Json
        if ($record.xia_id -eq $XiaId -and $record.question_id) { [string]$record.question_id }
      } catch {
        $null
      }
    } | Where-Object { $_ }
  )
  $skipQuestionIdList = @($skipQuestionIdList + $historicalQuestionIds) | Select-Object -Unique
}

function Invoke-JsonGet($url) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec $WorldApiTimeoutSec
  if ($response.RawContentStream) {
    $response.RawContentStream.Position = 0
    $reader = [System.IO.StreamReader]::new($response.RawContentStream, [System.Text.Encoding]::UTF8, $true)
    try {
      return ($reader.ReadToEnd() | ConvertFrom-Json)
    } finally {
      $reader.Dispose()
    }
  }
  return ($response.Content | ConvertFrom-Json)
}

function Read-WorldSkillMount([string]$BaseUrl) {
  $skillUrl = "$BaseUrl/api/v1/openclaw/skill.md"
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $skillUrl -TimeoutSec 30
    $content = [string]$response.Content
    $lines = @($content -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" } | Select-Object -First 24)
    return [pscustomobject]@{
      ok = $true
      url = $skillUrl
      bytes = [System.Text.Encoding]::UTF8.GetByteCount($content)
      excerpt = [string]::Join([Environment]::NewLine, $lines)
    }
  } catch {
    return [pscustomobject]@{
      ok = $false
      url = $skillUrl
      bytes = 0
      excerpt = ""
      error = $_.Exception.Message
    }
  }
}

function Read-WorldSourceContext([string]$BaseUrl) {
  $status = $null
  $governance = $null
  $signals = $null
  $errors = @()

  try {
    $status = Invoke-JsonGet "$BaseUrl/api/v1/world/source-knowledge/status?scene=global"
  } catch {
    $errors += "source_status: $($_.Exception.Message)"
  }

  try {
    $governance = Invoke-JsonGet "$BaseUrl/api/v1/world/source-knowledge/governance"
  } catch {
    $errors += "source_governance: $($_.Exception.Message)"
  }

  try {
    $signals = Invoke-JsonGet "$BaseUrl/api/v1/world/signals?scene=global&limit=12"
  } catch {
    $errors += "recent_signals: $($_.Exception.Message)"
  }

  $health = if ($status) { $status.source_health } else { $null }
  $sourceSummary = [pscustomobject]@{
    generated_at = if ($status) { $status.generated_at } else { $null }
    window_days = if ($status) { $status.window_days } else { $null }
    signal_count = if ($status) { $status.signal_count } else { $null }
    indexed_signal_count = if ($status) { $status.indexed_signal_count } else { $null }
    chunk_count = if ($status) { $status.chunk_count } else { $null }
    latest_signal_published_at = if ($status) { $status.latest_signal_published_at } else { $null }
    last_embedding_backend = if ($status) { $status.last_embedding_backend } else { $null }
    stable_source_count = if ($health) { $health.stable_source_count } else { $null }
    watchlist_source_count = if ($health) { $health.watchlist_source_count } else { $null }
    runtime_ready_skill_count = if ($health) { $health.runtime_ready_skill_count } else { $null }
    context_ready_skill_count = if ($health) { $health.context_ready_skill_count } else { $null }
    weak_signal_skill_count = if ($health) { $health.weak_signal_skill_count } else { $null }
    blocked_skill_count = if ($health) { $health.blocked_skill_count } else { $null }
    embeddings = if ($status -and $status.source_status) { $status.source_status.embeddings } else { $null }
  }

  $governanceSummary = [pscustomobject]@{
    generated_at = if ($governance) { $governance.generated_at } else { $null }
    latest_poll_finished_at = if ($governance) { $governance.latest_poll_finished_at } else { $null }
    monitor_source_count = if ($governance) { $governance.monitor_source_count } else { $null }
    changed_source_count = if ($governance) { $governance.changed_source_count } else { $null }
    high_quality_source_count = if ($governance) { $governance.high_quality_source_count } else { $null }
    recommended_source_count = if ($governance) { $governance.recommended_source_count } else { $null }
    cooling_down_count = if ($governance) { $governance.cooling_down_count } else { $null }
    runtime_failure_count = if ($governance) { $governance.runtime_failure_count } else { $null }
    recent_failure_count = if ($governance) { @($governance.recent_runtime_failures).Count } else { $null }
  }

  $signalSummary = [pscustomobject]@{
    available = [bool]$signals
    total = if ($signals) { $signals.total } else { $null }
    returned_count = if ($signals) { @($signals.signals).Count } else { $null }
    latest_published_at = if ($signals -and @($signals.signals).Count -gt 0) { @($signals.signals)[0].published_at } else { $null }
    excerpts = if ($signals) {
      @($signals.signals | Select-Object -First 6 | ForEach-Object {
        "$($_.title): $($_.summary)"
      })
    } else {
      @()
    }
  }

  $sourceTextLines = @(
    "source_window_days=$($sourceSummary.window_days)",
    "source_signals=$($sourceSummary.signal_count), indexed=$($sourceSummary.indexed_signal_count), chunks=$($sourceSummary.chunk_count)",
    "source_health=stable:$($sourceSummary.stable_source_count), watchlist:$($sourceSummary.watchlist_source_count), runtime_ready:$($sourceSummary.runtime_ready_skill_count), context_ready:$($sourceSummary.context_ready_skill_count), weak_signal:$($sourceSummary.weak_signal_skill_count), blocked:$($sourceSummary.blocked_skill_count)",
    "source_governance=monitor:$($governanceSummary.monitor_source_count), changed:$($governanceSummary.changed_source_count), high_quality:$($governanceSummary.high_quality_source_count), recommended:$($governanceSummary.recommended_source_count), cooling:$($governanceSummary.cooling_down_count), failures:$($governanceSummary.runtime_failure_count)",
    "source_latest_signal=$($sourceSummary.latest_signal_published_at), source_last_poll=$($governanceSummary.latest_poll_finished_at)",
    "source_embedding=$($sourceSummary.last_embedding_backend)",
    "recent_signals=available:$($signalSummary.available), total:$($signalSummary.total), returned:$($signalSummary.returned_count), latest:$($signalSummary.latest_published_at)",
    "recent_signal_excerpts=$([string]::Join(' || ', @($signalSummary.excerpts)))"
  )
  $sourceText = [string]::Join([Environment]::NewLine, $sourceTextLines)

  [pscustomobject]@{
    status = $sourceSummary
    governance = $governanceSummary
    dashboard_signals = $signalSummary
    errors = $errors
    text = $sourceText
  }
}

function Read-QuestionSourceRecall([string]$BaseUrl, [string]$QuestionText) {
  $encodedQuery = [uri]::EscapeDataString($QuestionText)
  return Invoke-JsonGet "$BaseUrl/api/v1/world/source-knowledge/recall?scene=global&limit=8&query=$encodedQuery"
}

function Read-XiaQuestionDetail([string]$BaseUrl, [string]$QuestionId) {
  $encodedQuestionId = [uri]::EscapeDataString($QuestionId)
  return Invoke-JsonGet "$BaseUrl/api/v1/world/livebench/questions?scene=global&audience=xia&question_id=$encodedQuestionId"
}

function Write-HermesLearningLog([object]$record) {
  $cacheDir = Join-Path $root ".cache"
  if (!(Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir | Out-Null
  }
  $lastPath = Join-Path $cacheDir "hermes-world-formal-vote-last.json"
  $runsPath = Join-Path $cacheDir "hermes-world-formal-vote-runs.jsonl"
  $json = $record | ConvertTo-Json -Depth 12
  $jsonLine = $record | ConvertTo-Json -Depth 12 -Compress
  Set-Content -LiteralPath $lastPath -Value $json -Encoding UTF8
  Add-Content -LiteralPath $runsPath -Value $jsonLine -Encoding UTF8
  return $lastPath
}

Write-ProgressLog "source_context:start"
$sourceContext = Read-WorldSourceContext $BaseUrl
Write-ProgressLog "source_context:done errors=$(@($sourceContext.errors).Count)"
if (@($sourceContext.errors | Where-Object { $_ -match '^source_status:|^recent_signals:' }).Count -gt 0 -or -not $sourceContext.status.generated_at -or [int]$sourceContext.dashboard_signals.returned_count -le 0) {
  $learningPath = Write-HermesLearningLog ([pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    ok = $false
    submitted = $false
    reason = "source_recall_prerequisite_failed"
    base_url = $BaseUrl
    skill_url = "$BaseUrl/api/v1/openclaw/skill.md"
    xia_id = $XiaId
    model = $Model
    source_context = $sourceContext
  })
  [pscustomobject]@{
    ok = $false
    submitted = $false
    reason = "source_recall_prerequisite_failed"
    source_errors = $sourceContext.errors
    learning_log = $learningPath
  } | ConvertTo-Json -Depth 6
  exit 1
}
Write-ProgressLog "skill_mount:start"
$skillMount = Read-WorldSkillMount $BaseUrl
Write-ProgressLog "skill_mount:done ok=$($skillMount.ok) bytes=$($skillMount.bytes)"

$questionsUrl = "$BaseUrl/api/v1/world/livebench/questions?scene=global&status=active&limit=60"
Write-ProgressLog "questions:start url=$questionsUrl"
$questions = @(Invoke-JsonGet $questionsUrl | ForEach-Object { $_ })
Write-ProgressLog "questions:done count=$($questions.Count)"
$candidate = $null
$candidateDetail = $null
$candidateXiaDetail = $null
$candidateRecall = $null

foreach ($question in $questions) {
  if ($question.settlement_status -ne "open") { continue }
  if ($skipQuestionIdList -contains $question.question_id) { continue }
  $participantLabels = @($question.aggregate_vote.participant_labels | ForEach-Object { [string]$_ })
  if ($participantLabels -contains $ContributorLabel) { continue }
  try {
    Write-ProgressLog "question_detail:start question_id=$($question.question_id)"
    $detail = Read-XiaQuestionDetail $BaseUrl $question.question_id
    Write-ProgressLog "question_detail:done question_id=$($question.question_id)"
    Write-ProgressLog "source_recall:start question_id=$($question.question_id)"
    $recall = Read-QuestionSourceRecall $BaseUrl "$($question.title) $($question.background) $($question.topic_label) $($question.region_label)"
    Write-ProgressLog "source_recall:done question_id=$($question.question_id) recalled=$($recall.recalled_count)"
    if (!$detail -or !$detail.preview) { continue }
    if (!$recall -or [int]$recall.recalled_count -le 0) { continue }
    $candidate = $question
    $candidateDetail = $detail
    $candidateXiaDetail = $detail
    $candidateRecall = $recall
  } catch {
    Write-ProgressLog "candidate_context:failed question_id=$($question.question_id) error=$($_.Exception.Message)"
    continue
  }
  Write-ProgressLog "candidate:selected question_id=$($question.question_id)"
  break
}

if (!$candidate -or !$candidateDetail) {
  Write-ProgressLog "candidate:none question_count=$($questions.Count)"
  $learningPath = Write-HermesLearningLog ([pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    ok = $true
    submitted = $false
    reason = "no_open_question_with_source_recall"
    base_url = $BaseUrl
    skill_url = "$BaseUrl/api/v1/openclaw/skill.md"
    skill_mount = $skillMount
    xia_id = $XiaId
    model = $Model
    question_count = $questions.Count
    skipped_question_ids = $skipQuestionIdList
    source_context = $sourceContext
  })
  [pscustomobject]@{
    ok = $true
    submitted = $false
    reason = "no_open_question_with_source_recall"
    question_count = $questions.Count
    xia_id = $XiaId
    learning_log = $learningPath
  } | ConvertTo-Json -Depth 5
  exit 0
}

$questionTitle = ([string]$candidateXiaDetail.preview.title).Trim()
$questionBackground = ([string]$candidateXiaDetail.preview.background).Trim()
$questionTopic = ([string]$candidateXiaDetail.preview.topic_label).Trim()
if (!$questionBackground) {
  $questionBackground = "Use the moderator brief, source context, settlement rule, and visible discussion to judge the event in the question title."
}
if (!$questionTopic) {
  $questionTopic = "general forecast"
}
$peerDigestYes = @($candidateXiaDetail.learning_context.peer_digest.yes) -join ' | '
$peerDigestNo = @($candidateXiaDetail.learning_context.peer_digest.no) -join ' | '
$recallLines = @($candidateRecall.signals | Select-Object -First 8 | ForEach-Object {
  "- $($_.title): $($_.summary)"
})
$evidenceLines = @($candidateXiaDetail.evidence | ForEach-Object {
  $section = $_
  @($section.references | Select-Object -First 3 | ForEach-Object {
    "- $($_.title): $($_.summary)"
  })
}) | Select-Object -First 6
$taskTextLines = @(
  "question: $questionTitle",
  "background: $questionBackground",
  "topic: $questionTopic",
  "region: $($candidate.region_label)",
  "resolve_at: $($candidate.resolve_at)",
  "status: $($candidate.settlement_status)",
  "source_query:",
  $sourceContext.text,
  "按题召回线索：",
  ([string]::Join([Environment]::NewLine, $recallLines)),
  "单题证据：",
  ([string]::Join([Environment]::NewLine, $evidenceLines)),
  "主持人背景：$($candidateXiaDetail.learning_context.host_background)",
  "复核背景：$($candidateXiaDetail.learning_context.platform_background)",
  "复核方向：$($candidateXiaDetail.learning_context.aggregate_direction.side)",
  "赞成方简述：$peerDigestYes",
  "反对方简述：$peerDigestNo",
  "信源提示：如果题目缺少直接证据，就明确写当前可见信源不足，不要把讨论热度当成事实。"
)
$taskText = [string]::Join([Environment]::NewLine, $taskTextLines)

$evaluationText = "evaluation: unavailable"
try {
  Write-ProgressLog "evaluation:start"
  $evaluation = Invoke-JsonGet "$BaseUrl/api/v1/world/livebench/evaluation?scene=global"
  $sourceScored = 0
  $sourceVotes = 0
  if ($evaluation.platform_model.PSObject.Properties.Name -contains "source_formal_scored_question_count") {
    $sourceScored = [int]$evaluation.platform_model.source_formal_scored_question_count
  }
  if ($evaluation.platform_model.PSObject.Properties.Name -contains "source_formal_vote_count") {
    $sourceVotes = [int]$evaluation.platform_model.source_formal_vote_count
  }
  if ($sourceScored -gt 0) {
    $evaluationText = "evaluation: source_formal_votes=$sourceVotes, source_scored=$sourceScored, source_hit_rate=$($evaluation.platform_model.source_formal_hit_rate), source_avg_error=$($evaluation.platform_model.source_formal_avg_brier)"
  } else {
    $evaluationText = "evaluation: source_formal_votes=$sourceVotes, source_scored=0, source_score_status=waiting_for_settlement"
  }
  Write-ProgressLog "evaluation:done"
} catch {
  $evaluationText = "evaluation: unavailable"
  Write-ProgressLog "evaluation:failed error=$($_.Exception.Message)"
}

$env:HERMES_HOME = Join-Path $hermesRepo ".hermes-world-test"
$env:OPENAI_API_KEY = $vars["MINIMAX_API_KEY"]
$env:OPENAI_BASE_URL = if ($vars["MINIMAX_BASE_URL"]) { $vars["MINIMAX_BASE_URL"] } else { "https://api.scnet.cn/api/llm/v1" }
$env:HERMES_INFERENCE_PROVIDER = "custom"
$env:HERMES_GIT_BASH_PATH = "C:\Program Files\Git\bin\bash.exe"
$env:NO_COLOR = "1"

$terminalFetchInstruction = if ($UseHermesTerminalFetch) {
@"
Use terminal to fetch the current World source skill once only to confirm the current scheduled-task contract:
$BaseUrl/api/v1/openclaw/skill.md
Use terminal to fetch the current source status and governance once only to confirm that the source-skill side is reachable:
$BaseUrl/api/v1/world/source-knowledge/status?scene=global
$BaseUrl/api/v1/world/source-knowledge/governance
"@
} else {
@"
The wrapper has mounted and read the current World source skill before calling Hermes.
skill_url: $($skillMount.url)
skill_ok: $($skillMount.ok)
skill_bytes: $($skillMount.bytes)
skill_excerpt:
$($skillMount.excerpt)
"@
}

$prompt = @"
You are running a mounted World source-skill scheduled task, not answering an end user.
$terminalFetchInstruction

Cleaned scheduled-task package:
$taskText

$evaluationText

You are a formal xia using World Threads as a source skill.
The main task is source-based judgment; LiveBench is the learning loop attached to that source skill.
First make a source-only initial judgment from the question/background/source note.
Then review the host background, discussion background, peer digests, aggregate direction, and evaluation line.
Return exactly six plain text lines, no markdown, no extra text:
INITIAL: yes or no, then one short Chinese reason based only on the source package
SIDE: yes or no
PREDICTION: one short sentence in Simplified Chinese
WHY: one concrete reason in Simplified Chinese
CHANGE: one condition in Simplified Chinese that would change the judgment
REFLECTION: one short Chinese sentence about what the review material changed or confirmed

Rules:
- SIDE value must be exactly yes or no.
- prediction must clearly match side.
- why may use the review context, but it must still be grounded in source quality, rules, time window, or direct evidence.
- Do not summarize what you fetched.
- Do not mention question IDs, xia IDs, source IDs, other xia, vote counts, or discussion counts.
- Do not mention the source platform name, origin URL, source_platform, or market venue.
- Do not write percent signs or numeric odds; use qualitative wording.
- Do not write platform pricing, market pricing, odds, percent moves, or quantified crowd signals.
- Do not write internal field names such as moderator_note, platform_background, aggregate_direction, peer_digest, or source_note.
- You may say the review material confirmed or weakened the initial judgment, but do not name specific platforms or pricing mechanisms.
- If the cleaned package has no direct source evidence, say current visible sources are insufficient instead of inventing evidence.
- Prefer direct signal, rule, time window, and visible evidence over generic market wording.
- Do not submit a vote yourself. The wrapper will submit.
- Do not rewrite the question into oil, finance, price, or threshold wording unless those words are explicitly in the question title.
"@

$sw = [Diagnostics.Stopwatch]::StartNew()
$cacheDir = Join-Path $root ".cache"
if (!(Test-Path $cacheDir)) {
  New-Item -ItemType Directory -Path $cacheDir | Out-Null
}
$promptPath = Join-Path $cacheDir "hermes-world-formal-vote-prompt.txt"
$runnerPath = Join-Path $cacheDir "hermes-world-formal-vote-runner.py"
Set-Content -LiteralPath $promptPath -Value $prompt -Encoding UTF8
Set-Content -LiteralPath $runnerPath -Value @'
import pathlib
import subprocess
import sys

python = sys.argv[1]
repo = sys.argv[2]
timeout = int(sys.argv[3])
prompt_path = pathlib.Path(sys.argv[4])
model = sys.argv[5]
use_terminal = sys.argv[6] == "1"

prompt = prompt_path.read_text(encoding="utf-8")
args = [
    python,
    "-m",
    "hermes_cli.main",
    "chat",
    "-q",
    prompt,
    "--model",
    model,
    "--max-turns",
    "5",
    "--yolo",
    "-Q",
]
if use_terminal:
    args.extend(["--toolsets", "terminal"])

try:
    completed = subprocess.run(
        args,
        cwd=repo,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        timeout=timeout,
    )
    if completed.stdout:
        print(completed.stdout, end="")
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr)
    raise SystemExit(completed.returncode)
except subprocess.TimeoutExpired as exc:
    if exc.stdout:
        sys.stdout.write(exc.stdout if isinstance(exc.stdout, str) else exc.stdout.decode("utf-8", "replace"))
    if exc.stderr:
        sys.stderr.write(exc.stderr if isinstance(exc.stderr, str) else exc.stderr.decode("utf-8", "replace"))
    print(f"__HERMES_TIMEOUT__ after {timeout}s", file=sys.stderr)
    raise SystemExit(124)
'@ -Encoding UTF8
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $useTerminalValue = if ($UseHermesTerminalFetch) { "1" } else { "0" }
  Write-ProgressLog "hermes:start question_id=$($candidate.question_id)"
  $rawOutput = & $python $runnerPath $python $hermesRepo $HermesTimeoutSec $promptPath $Model $useTerminalValue 2>&1
  $exitCode = $LASTEXITCODE
  Write-ProgressLog "hermes:done exit_code=$exitCode elapsed_ms=$($sw.ElapsedMilliseconds)"
} finally {
  $ErrorActionPreference = $previousErrorActionPreference
  $sw.Stop()
}

$outputText = ($rawOutput | ForEach-Object {
  $text = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { [string]$_ }
  if ($text -and $text -ne "System.Management.Automation.RemoteException") { $text }
}) -join "`n"

if ($exitCode -ne 0) {
  $failureReason = if ($exitCode -eq 124) { "hermes_timeout" } else { "hermes_failed" }
  $learningPath = Write-HermesLearningLog ([pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    ok = $false
    submitted = $false
    reason = $failureReason
    exit_code = $exitCode
    elapsed_ms = $sw.ElapsedMilliseconds
    base_url = $BaseUrl
    skill_url = "$BaseUrl/api/v1/openclaw/skill.md"
    question_id = $candidate.question_id
    xia_id = $XiaId
    output = $outputText
  })
  [pscustomobject]@{
    ok = $false
    submitted = $false
    reason = $failureReason
    exit_code = $exitCode
    elapsed_ms = $sw.ElapsedMilliseconds
    question_id = $candidate.question_id
    learning_log = $learningPath
    output = $outputText
  } | ConvertTo-Json -Depth 5
  exit 1
}

$answerText = (($outputText -split "`r?`n" | Where-Object { $_.Trim() -ne "" -and $_ -notmatch '^session_id:' }) -join "`n").Trim()

function Clean-HermesVoteField([string]$text) {
  if (!$text) { return "" }
  $clean = $text
  $largeMove = -join ([char[]](0x663E, 0x8457, 0x5E45, 0x5EA6))
  $reviewContext = -join ([char[]](0x590D, 0x6838, 0x80CC, 0x666F))
  $reviewCn = -join ([char[]](0x590D, 0x6838))
  $hostCn = -join ([char[]](0x4E3B, 0x6301, 0x4EBA))
  $platformCn = -join ([char[]](0x5E73, 0x53F0))
  $platformDiscussion = -join ([char[]](0x5E73, 0x53F0, 0x8BA8, 0x8BBA))
  $discussionDirection = -join ([char[]](0x8BA8, 0x8BBA, 0x65B9, 0x5411))
  $reviewView = -join ([char[]](0x590D, 0x6838, 0x610F, 0x89C1))
  $platformPricing = -join ([char[]](0x5E73, 0x53F0, 0x5B9A, 0x4EF7))
  $marketPricing = -join ([char[]](0x5E02, 0x573A, 0x5B9A, 0x4EF7))
  $marketReviewOpinion = -join ([char[]](0x5E02, 0x573A, 0x590D, 0x6838, 0x610F, 0x89C1))
  $marketReview = -join ([char[]](0x5E02, 0x573A, 0x590D, 0x6838))
  $marketExpectation = -join ([char[]](0x5E02, 0x573A, 0x9884, 0x671F))
  $publicPricing = -join ([char[]](0x516C, 0x5F00, 0x5B9A, 0x4EF7))
  $pricingTendency = -join ([char[]](0x5B9A, 0x4EF7, 0x503E, 0x5411))
  $platformTendency = -join ([char[]](0x5E73, 0x53F0, 0x503E, 0x5411))
  $crowdSignal = -join ([char[]](0x7FA4, 0x4F53, 0x4FE1, 0x53F7))
  $collectiveExpectation = -join ([char[]](0x96C6, 0x4F53, 0x9884, 0x671F))
  $odds = -join ([char[]](0x8D54, 0x7387))
  $probabilityCn = -join ([char[]](0x6982, 0x7387))
  $otherXia = -join ([char[]](0x5176, 0x4ED6, 0x867E))
  $participants = -join ([char[]](0x53C2, 0x4E0E, 0x8005))
  $consensus = -join ([char[]](0x5171, 0x8BC6))
  $pricingPattern = @(
    $platformPricing,
    $marketPricing,
    $marketReviewOpinion,
    $marketReview,
    $marketExpectation,
    $publicPricing,
    $pricingTendency,
    $platformTendency,
    $crowdSignal,
    $collectiveExpectation,
    $odds,
    $probabilityCn
  ) | ForEach-Object { [regex]::Escape($_) }
  $peerPattern = @($otherXia, $participants, $consensus) | ForEach-Object { [regex]::Escape($_) }
  $clean = [regex]::Replace($clean, '\d+(?:\.\d+)?\s*%', $largeMove)
  $clean = [regex]::Replace($clean, '(?i)[\p{L}\p{N}_-]*_note', $reviewContext)
  $clean = [regex]::Replace($clean, '(?i)(moderator_note|platform_background|host_background|aggregate_direction|peer_digest)', $reviewContext)
  $clean = [regex]::Replace($clean, '(?i)review\s+step', $reviewCn)
  $clean = [regex]::Replace($clean, '(?i)moderator', $hostCn)
  $clean = [regex]::Replace($clean, ([regex]::Escape($platformDiscussion)), $reviewView)
  $clean = [regex]::Replace($clean, ([regex]::Escape($discussionDirection)), $reviewView)
  $clean = [regex]::Replace($clean, ([regex]::Escape($platformCn)), $reviewCn)
  $clean = [regex]::Replace($clean, ($pricingPattern -join '|'), $reviewContext)
  $clean = [regex]::Replace($clean, ($peerPattern -join '|'), $reviewView)
  return $clean.Trim()
}

$sideMatch = [regex]::Match($answerText, '(?im)^\s*SIDE\s*:\s*(yes|no)\s*$')
$initialMatch = [regex]::Match($answerText, '(?im)^\s*INITIAL\s*:\s*(.+?)\s*$')
$predictionMatch = [regex]::Match($answerText, '(?im)^\s*PREDICTION\s*:\s*(.+?)\s*$')
$whyMatch = [regex]::Match($answerText, '(?im)^\s*WHY\s*:\s*(.+?)\s*$')
$changeMatch = [regex]::Match($answerText, '(?im)^\s*CHANGE\s*:\s*(.+?)\s*$')
$reflectionMatch = [regex]::Match($answerText, '(?im)^\s*REFLECTION\s*:\s*(.+?)\s*$')

$side = if ($sideMatch.Success) { $sideMatch.Groups[1].Value.Trim().ToLowerInvariant() } else { "" }
if ($side -ne "yes" -and $side -ne "no") {
  [pscustomobject]@{
    ok = $false
    submitted = $false
    reason = "invalid_side_from_hermes"
    question_id = $candidate.question_id
    output = $outputText
  } | ConvertTo-Json -Depth 5
  exit 1
}

$forbiddenTerms = @(
  'Manifold',
  'Polymarket',
  'Metaculus',
  'Metaforecast',
  'source_platform',
  'origin_url',
  'probability',
  'aggregate_vote',
  'market venue',
  'market expectation',
  'crowd signal',
  'collective expectation',
  (-join ([char[]](0x5E73, 0x53F0))),
  (-join ([char[]](0x5E73, 0x53F0, 0x8BA8, 0x8BBA))),
  (-join ([char[]](0x8BA8, 0x8BBA, 0x65B9, 0x5411))),
  'question_id',
  'xia_id',
  '_note',
  'moderator_note',
  'platform_background',
  'host_background',
  'aggregate_direction',
  'peer_digest',
  'vote count',
  'discussion count',
  '%',
  (-join ([char[]](0x5E73, 0x53F0, 0x5B9A, 0x4EF7))),
  (-join ([char[]](0x5E02, 0x573A, 0x5B9A, 0x4EF7))),
  (-join ([char[]](0x5E02, 0x573A, 0x590D, 0x6838, 0x610F, 0x89C1))),
  (-join ([char[]](0x5E02, 0x573A, 0x590D, 0x6838))),
  (-join ([char[]](0x5E02, 0x573A, 0x9884, 0x671F))),
  (-join ([char[]](0x516C, 0x5F00, 0x5B9A, 0x4EF7))),
  (-join ([char[]](0x5B9A, 0x4EF7, 0x503E, 0x5411))),
  (-join ([char[]](0x5E73, 0x53F0, 0x503E, 0x5411))),
  (-join ([char[]](0x7FA4, 0x4F53, 0x4FE1, 0x53F7))),
  (-join ([char[]](0x96C6, 0x4F53, 0x9884, 0x671F))),
  (-join ([char[]](0x8D54, 0x7387))),
  (-join ([char[]](0x6982, 0x7387)))
)
$forbiddenPattern = '(?i)(' + (($forbiddenTerms | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')'
$initial = if ($initialMatch.Success) { Clean-HermesVoteField $initialMatch.Groups[1].Value } else { "" }
$prediction = if ($predictionMatch.Success) { Clean-HermesVoteField $predictionMatch.Groups[1].Value } else { "" }
$why = if ($whyMatch.Success) { Clean-HermesVoteField $whyMatch.Groups[1].Value } else { "" }
$change = if ($changeMatch.Success) { Clean-HermesVoteField $changeMatch.Groups[1].Value } else { "" }
$reflection = if ($reflectionMatch.Success) { Clean-HermesVoteField $reflectionMatch.Groups[1].Value } else { "" }
if ($initial -match '^(yes|no)$' -and $why) {
  $initial = "$initial $why"
}
$checkedVoteText = @($initial, $prediction, $why, $change, $reflection) -join "`n"
if ([regex]::IsMatch($checkedVoteText, $forbiddenPattern)) {
  $learningPath = Write-HermesLearningLog ([pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    ok = $false
    submitted = $false
    reason = "invalid_hermes_output_leaked_platform_or_probability"
    base_url = $BaseUrl
    skill_url = "$BaseUrl/api/v1/openclaw/skill.md"
    skill_mount = $skillMount
    xia_id = $XiaId
    model = $Model
    question_id = $candidate.question_id
    title = $candidate.title
    skipped_question_ids = $skipQuestionIdList
    source_context = $sourceContext
    source_recall = $candidateRecall
    initial = $initial
    side = $side
    prediction = $prediction
    why = $why
    change = $change
    reflection = $reflection
    hermes_output = $outputText
  })
  [pscustomobject]@{
    ok = $false
    submitted = $false
    reason = "invalid_hermes_output_leaked_platform_or_probability"
    question_id = $candidate.question_id
    learning_log = $learningPath
    output = $outputText
  } | ConvertTo-Json -Depth 5
  exit 1
}
if (!$prediction) {
  $prediction = if ($side -eq "yes") { "我判断这件事会在题面时间窗内发生。" } else { "我判断这件事不会在题面时间窗内发生。" }
}
if (!$why) {
  $why = "当前可见信源还不足以支持相反方向。"
}

$sourceSnapshotGeneratedAt = if ($sourceContext -and $sourceContext.status) { [string]$sourceContext.status.generated_at } else { $null }
$sourceSnapshotIdBase = if ($sourceSnapshotGeneratedAt) { $sourceSnapshotGeneratedAt } else { (Get-Date).ToUniversalTime().ToString("o") }
$sourceSnapshotId = "source-" + ([regex]::Replace($sourceSnapshotIdBase, '[^0-9A-Za-z]+', '')).ToLowerInvariant()

$voteBody = @{
  question_id = $candidate.question_id
  xia_id = $XiaId
  source = "xia"
  contributor_kind = "xia"
  contributor_label = $ContributorLabel
  origin_url = "$BaseUrl/api/v1/world/livebench/questions/$([uri]::EscapeDataString($candidate.question_id))?scene=global&audience=xia"
  side = $side
  human_readable_prediction = $prediction
  human_readable_why = $why
  what_changes_my_mind = $change
  cited_signal_ids = @($candidateRecall.signals | Select-Object -First 5 | ForEach-Object { [string]$_.id })
  source_attached = $true
  source_snapshot_id = $sourceSnapshotId
  source_context_generated_at = $sourceSnapshotGeneratedAt
  source_cutoff_at = (Get-Date).ToUniversalTime().ToString("o")
  source_signal_count = if ($sourceContext -and $sourceContext.status) { $sourceContext.status.signal_count } else { $null }
  source_embedding_backend = if ($sourceContext -and $sourceContext.status) { $sourceContext.status.last_embedding_backend } else { $null }
  source_latest_signal_published_at = if ($sourceContext -and $sourceContext.status) { $sourceContext.status.latest_signal_published_at } else { $null }
  source_governance_finished_at = if ($sourceContext -and $sourceContext.governance) { $sourceContext.governance.latest_poll_finished_at } else { $null }
} | ConvertTo-Json -Depth 5

try {
  $voteBodyBytes = [System.Text.Encoding]::UTF8.GetBytes($voteBody)
  Write-ProgressLog "vote_submit:start question_id=$($candidate.question_id)"
  $vote = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$BaseUrl/api/v1/world/livebench/vote" -ContentType "application/json; charset=utf-8" -Body $voteBodyBytes -TimeoutSec 60
  Write-ProgressLog "vote_submit:done status=$($vote.StatusCode) elapsed_header=$($vote.Headers['x-world-vote-elapsed-ms'])"
  $voteJson = $vote.Content | ConvertFrom-Json
  $learningPath = Write-HermesLearningLog ([pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    ok = $true
    submitted = $true
    base_url = $BaseUrl
    skill_url = "$BaseUrl/api/v1/openclaw/skill.md"
    skill_mount = $skillMount
    xia_id = $XiaId
    model = $Model
    elapsed_ms = $sw.ElapsedMilliseconds
    question_count = $questions.Count
    question_id = $candidate.question_id
    title = $candidate.title
    resolve_at = $candidate.resolve_at
    skipped_question_ids = $skipQuestionIdList
    source_context = $sourceContext
    source_recall = $candidateRecall
    source_snapshot_id = $sourceSnapshotId
    initial = $initial
    side = $voteJson.side
    prediction = $prediction
    why = $why
    change = $change
    reflection = $reflection
    evaluation = $evaluationText
    vote_id = $voteJson.vote_id
    probability_yes = $voteJson.probability_yes
    hermes_session = if ($outputText -match 'session_id:\s*(\S+)') { $matches[1] } else { $null }
  })
  [pscustomobject]@{
    ok = $true
    submitted = $true
    elapsed_ms = $sw.ElapsedMilliseconds
    xia_id = $XiaId
    question_count = $questions.Count
    question_id = $candidate.question_id
    side = $voteJson.side
    probability_yes = $voteJson.probability_yes
    vote_id = $voteJson.vote_id
    initial = $initial
    reflection = $reflection
    learning_log = $learningPath
    hermes_session = if ($outputText -match 'session_id:\s*(\S+)') { $matches[1] } else { $null }
  } | ConvertTo-Json -Depth 5
} catch {
  Write-ProgressLog "vote_submit:failed error=$($_.Exception.Message)"
  $errorBody = $null
  try {
    $response = $_.Exception.Response
    if ($response) {
      $stream = $response.GetResponseStream()
      if ($stream) {
        $reader = [System.IO.StreamReader]::new($stream)
        $errorBody = $reader.ReadToEnd()
      }
    }
  } catch {
    $errorBody = $null
  }
  if ($errorBody -match 'still in cooldown') {
    $learningPath = Write-HermesLearningLog ([pscustomobject]@{
      timestamp = (Get-Date).ToUniversalTime().ToString("o")
      ok = $true
      submitted = $false
      reason = "cooldown_existing_vote"
      base_url = $BaseUrl
      skill_url = "$BaseUrl/api/v1/openclaw/skill.md"
      skill_mount = $skillMount
      xia_id = $XiaId
      model = $Model
      question_id = $candidate.question_id
      title = $candidate.title
      skipped_question_ids = $skipQuestionIdList
      source_context = $sourceContext
      source_recall = $candidateRecall
      initial = $initial
      side = $side
      prediction = $prediction
      why = $why
      change = $change
      reflection = $reflection
      response_body = $errorBody
      hermes_output = $outputText
    })
    [pscustomobject]@{
      ok = $true
      submitted = $false
      reason = "cooldown_existing_vote"
      question_id = $candidate.question_id
      learning_log = $learningPath
      hermes_session = if ($outputText -match 'session_id:\s*(\S+)') { $matches[1] } else { $null }
    } | ConvertTo-Json -Depth 5
    exit 0
  }
  $learningPath = Write-HermesLearningLog ([pscustomobject]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    ok = $false
    submitted = $false
    reason = "vote_submit_failed"
    base_url = $BaseUrl
    skill_url = "$BaseUrl/api/v1/openclaw/skill.md"
    skill_mount = $skillMount
    xia_id = $XiaId
    model = $Model
    question_id = $candidate.question_id
    title = $candidate.title
    skipped_question_ids = $skipQuestionIdList
    source_context = $sourceContext
    source_recall = $candidateRecall
    initial = $initial
    side = $side
    prediction = $prediction
    why = $why
    change = $change
    reflection = $reflection
    error = $_.Exception.Message
    response_body = $errorBody
    hermes_output = $outputText
  })
  if ($errorBody -match 'Live question not found') {
    $nextSkip = @($skipQuestionIdList + $candidate.question_id) | Select-Object -Unique
    if ($RetryDepth -lt 5 -and $nextSkip.Count -lt $questions.Count) {
      & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -BaseUrl $BaseUrl -Model $Model -XiaId $XiaId -ContributorLabel $ContributorLabel -SkipQuestionIds ($nextSkip -join '|||') -WorldApiTimeoutSec $WorldApiTimeoutSec -HermesTimeoutSec $HermesTimeoutSec -RetryDepth ($RetryDepth + 1)
      exit $LASTEXITCODE
    }
  }
  [pscustomobject]@{
    ok = $false
    submitted = $false
    reason = "vote_submit_failed"
    question_id = $candidate.question_id
    error = $_.Exception.Message
    response_body = $errorBody
    learning_log = $learningPath
    hermes_output = $outputText
  } | ConvertTo-Json -Depth 5
  exit 1
}
