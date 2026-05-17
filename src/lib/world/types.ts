export type WorldScene = string;

export type MissionMode = 'hotspot' | 'exploration';
export type WorldValidationStatus = 'pending' | 'confirmed' | 'falsified';
export type WorldThreadRelation = 'continue' | 'upgrade' | 'downgrade' | 'branch' | 'revise' | 'echo';
export type LiveQuestionStatus = 'active' | 'watchlist' | 'resolved' | 'pending';
export type LiveQuestionPlatform = 'metaculus' | 'manifold' | 'polymarket' | 'internal' | 'fallback';
export type LiveQuestionSide = 'yes' | 'no';
export type LiveVoteSource = 'baseline' | 'xia' | 'external';
export type LiveQuestionDisplayMode = 'consensus' | 'market-structure';
export type LiveGraphNodeKind =
  | 'question'
  | 'signal_chunk'
  | 'vote'
  | 'resolution'
  | 'moderator'
  | 'pro'
  | 'con'
  | 'reference';
export type LiveGraphEdgeRelation = 'cites' | 'supports' | 'contradicts' | 'updates' | 'resolves';

export type WorldNodeType = 'hotspot' | 'exploration' | 'projection';
export type WorldDisplayLevel = 'high' | 'elevated' | 'monitoring';
export type WorldSourceAdmissionTier = 'anchor' | 'context' | 'weak_signal' | 'blocked';
export type WorldSourceReliabilityTier = 'stable' | 'watchlist' | 'blocked_or_unknown';

export interface WorldSourceReliability {
  tier: WorldSourceReliabilityTier;
  label: string;
  reason: string;
  source_name: string;
  source_url: string;
  connectivity?: string;
  matched_skill_name?: string | null;
  matched_admission_tier?: WorldSourceAdmissionTier | null;
}

export interface WorldSignal {
  id: string;
  title: string;
  summary: string;
  displayTitle: string;
  displaySummary: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  observedAt: string;
  locationName: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  severity: number;
  displayLevel: WorldDisplayLevel;
  relevanceScore: number;
  tags: string[];
  alignmentTags: string[];
  intensity: number | null;
  mentionCount: number | null;
  urgencyReason: string;
  scene: WorldScene;
  region: string;
  hotspotScore: number;
  explorationScore: number;
  coverageGap: number;
  clusterNotes?: string;
}

export interface WorldEvidenceSignal {
  id: string;
  title: string;
  summary: string;
  display_title: string;
  display_summary: string;
  source_name: string;
  source_url: string;
  published_at: string;
  location_name: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  tags: string[];
  alignment_tags: string[];
  intensity: number | null;
  mention_count: number | null;
  urgency_reason: string;
  scene: WorldScene;
  region: string;
  severity: number;
  display_level: WorldDisplayLevel;
  relevance_score: number;
  hotspot_score: number;
  exploration_score: number;
  coverage_gap: number;
  intake_score?: number | null;
  intake_decision?: string | null;
  intake_tier?: string | null;
  source_reliability?: WorldSourceReliability;
}

export interface WorldBriefing {
  mission_id: string;
  xia_id?: string;
  mode: MissionMode;
  scene: WorldScene;
  region: string;
  topic: string;
  topic_label: string;
  priority_score: number;
  dispatch_reason: string;
  next_hop_reason?: string;
  next_hop_label?: string;
  next_hop_confidence?: number;
  previous_signal_id?: string | null;
  question_now?: string;
  why_here?: string;
  what_changes_my_mind?: string;
  handoff_to_next_agent?: string;
  for_your_human?: string;
  source_health?: {
    stable_source_count: number;
    watchlist_source_count: number;
    blocked_or_unknown_source_count: number;
    note: string;
  };
  recommended_bundles?: Array<{
    name: string;
    note: string;
    source_count: number;
  }>;
  pending_reference_reports?: WorldValidationMemoryItem[];
  evidence_signals: WorldEvidenceSignal[];
}

export interface WorldValidationMemoryItem {
  report_id: string;
  signal_id: string;
  region: string;
  scene: WorldScene;
  topic: string;
  topic_label: string;
  claim: string;
  reason: string;
  forecast: string;
  prediction_time: string;
  confidence: number;
  review_count: number;
  pending_judgments: number;
  confirmed_judgments: number;
  falsified_judgments: number;
  validation_status: WorldValidationStatus;
  validated_at?: string | null;
  validation_note?: string | null;
  validated_by_xia_id?: string | null;
  validation_signal_id?: string | null;
}

export interface WorldProjection {
  title: string;
  summary: string;
  confidence: number;
  assumptions: string[];
  invalidators: string[];
}

export interface WorldProjectionLink {
  projection_index: number;
  fact_indices: number[];
  invalidator_indices?: number[];
}

export interface WorldReport {
  report_id: string;
  mission_id: string;
  signal_id: string;
  xia_id?: string;
  question_now?: string;
  why_here?: string;
  what_changes_my_mind?: string;
  handoff_to_next_agent?: string;
  for_your_human?: string;
  source_reliability?: WorldSourceReliability;
  past_report: string;
  current_analysis: string;
  future_projection: string;
  report_kind: string;
  report_kind_note: string;
  summary: string;
  facts: string[];
  inference: string;
  projection: WorldProjection[];
  confidence: number;
  invalidators: string[];
  brake_line: string;
  scene: WorldScene;
  mode: MissionMode;
  region: string;
  topic: string;
  topic_label: string;
  thread_parent_report_id?: string | null;
  thread_relation?: WorldThreadRelation | null;
  validation_target_report_ids?: string[] | null;
  projection_links?: WorldProjectionLink[] | null;
  why_now: string;
  watch_next: string;
  signal_stage: string;
  validation_status: WorldValidationStatus;
  validated_at?: string | null;
  validation_note?: string | null;
  validated_by_xia_id?: string | null;
  validation_signal_id?: string | null;
  validation_updated_at?: string | null;
  validation_review_count?: number;
  validation_pending_count?: number;
  validation_confirmed_count?: number;
  validation_falsified_count?: number;
  created_at: string;
}

export interface WorldNodeActivity {
  mission_id: string;
  mode: MissionMode;
  topic: string;
  topic_label: string;
  past_report: string;
  current_analysis: string;
  future_projection: string;
  report_kind: string;
  report_kind_note: string;
  summary: string;
  inference: string;
  confidence: number;
  brake_line: string;
  why_now: string;
  watch_next: string;
  signal_stage: string;
  created_at: string;
}

export interface WorldStateNode {
  node_id: string;
  node_type: WorldNodeType;
  geo: {
    lat: number | null;
    lng: number | null;
    label: string;
    country: string;
    region: string;
  };
  tags: string[];
  alignment_tags: string[];
  intensity: number | null;
  mention_count: number | null;
  urgency_reason: string;
  scene: WorldScene;
  hotspot_score: number;
  exploration_score: number;
  coverage_gap: number;
  severity: number;
  display_level: WorldDisplayLevel;
  published_at: string;
  updated_at: string;
  source_name: string;
  source_url: string;
  last_report_at: string | null;
  title: string;
  summary: string;
  display_title: string;
  display_summary: string;
  confidence?: number;
  activities: WorldNodeActivity[];
}

export interface WorldStateMetrics {
  active_signal_count: number;
  mapped_signal_count: number;
  active_question_count: number;
  resolved_question_count: number;
  watchlist_question_count: number;
  avg_hotspot_score: number;
  avg_coverage_gap: number;
  hottest_region: string;
  least_covered_region: string;
}

export interface WorldValidationSummary {
  window_days: number;
  generated_at: string;
  confirmed_count: number;
  falsified_count: number;
  pending_count: number;
  confirmed_reports: WorldValidationMemoryItem[];
  falsified_reports: WorldValidationMemoryItem[];
  pending_reports: WorldValidationMemoryItem[];
  top_future_event?: WorldValidationMemoryItem | null;
}

export interface WorldMarketMover {
  symbol: string;
  name: string;
  market: 'CN' | 'HK' | 'US';
  price: number | null;
  prev_close: number | null;
  change: number | null;
  change_rate: number | null;
}

export interface WorldMarketStock {
  symbol: string;
  name: string;
  market: 'CN' | 'HK' | 'US';
  price: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  change: number | null;
  change_rate: number | null;
  volume: number | null;
  trade_date: string | null;
  updated_at: string | null;
}

export interface WorldMarketLeaderboardEntry {
  rank: number;
  nickname: string;
  username: string;
  return_rate: number | null;
  total_value: number | null;
  holdings_count: number | null;
  markets: string[];
  joined_at: string | null;
}

export interface WorldMarketSnapshot {
  generated_at: string;
  source_name: string;
  source_url: string;
  refresh_interval_seconds: number;
  latest_trade_date?: string | null;
  latest_settle_time?: string | null;
  stats: {
    participants: number | null;
    today_trades: number | null;
    total_trades: number | null;
    tradeable_symbols: number | null;
  };
  markets: {
    CN: {
      stocks: WorldMarketStock[];
      movers: WorldMarketMover[];
    };
    HK: {
      stocks: WorldMarketStock[];
      movers: WorldMarketMover[];
    };
    US: {
      stocks: WorldMarketStock[];
      movers: WorldMarketMover[];
    };
  };
  leaderboard: WorldMarketLeaderboardEntry[];
}

export interface WorldKnowledgeSignal {
  id: string;
  title: string;
  summary: string;
  display_title: string;
  display_summary: string;
  source_name: string;
  source_url: string;
  published_at: string;
  location_name: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  tags: string[];
  alignment_tags: string[];
  intensity: number | null;
  mention_count: number | null;
  urgency_reason: string;
  scene: WorldScene;
  region: string;
  severity: number;
  display_level: WorldDisplayLevel;
  relevance_score: number;
  hotspot_score: number;
  exploration_score: number;
  coverage_gap: number;
  source_reliability?: WorldSourceReliability;
}

export interface WorldTrailPoint {
  signal_id: string;
  lat: number;
  lng: number;
  region: string;
  topic: string;
  created_at: string;
}

export interface WorldTrailEdge {
  from_signal_id: string;
  to_signal_id: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  reason: string;
  label: string;
  confidence: number;
  created_at: string;
}

export interface WorldTrail {
  xia_id: string;
  color: string;
  points: WorldTrailPoint[];
  edges: WorldTrailEdge[];
}

export interface WorldSourceCatalogSource {
  source_name: string;
  url: string;
  source_type: string;
  connectivity: string;
  note: string;
}

export interface WorldSourceCatalogSkill {
  name: string;
  source_platform: string;
  url: string;
  skill_type: string;
  visible_sources: string;
  validation_status: string | null;
  candidate_role_for_xia_report: string | null;
  integration_shape: string | null;
  priority_for_poc: string | null;
  admission_tier: WorldSourceAdmissionTier;
  recommended_scene: WorldScene;
  usable_source_count: number;
  runnable_source_count: number;
  sources: WorldSourceCatalogSource[];
}

export interface WorldSourceCatalogHub {
  platform_name: string;
  url: string;
  platform_type: string;
  domestic_ip_access: string;
  content_visibility: string;
  searchability: string;
  signal_skill_density: string;
  worth_tracking: string;
  notes: string;
  source_skill_count: number;
  usable_source_count: number;
  source_skills: WorldSourceCatalogSkill[];
}

export interface WorldSourceCatalogOverflowPool {
  platform_name: string;
  source_skill_count: number;
  usable_source_count: number;
  source_skills: WorldSourceCatalogSkill[];
}

export interface WorldSourceCatalogIntakeCandidate {
  name: string;
  source_platform: string;
  admission_tier: WorldSourceAdmissionTier;
  recommended_scene: WorldScene;
  priority_for_poc: string | null;
  integration_shape: string | null;
  validation_status: string | null;
  usable_source_count: number;
  runnable_source_count: number;
}

export interface WorldSourceCatalog {
  generated_at: string;
  bundle_name: string;
  bundle_date: string;
  index_updated_at: string | null;
  completion_stage: string;
  high_value_total: number;
  endpoint_covered: number;
  site_covered: number;
  uncovered: number;
  connectivity_counts: {
    direct: number;
    unstable: number;
    blocked_or_unknown: number;
  };
  admission_counts: {
    anchor: number;
    context: number;
    weak_signal: number;
    blocked: number;
  };
  intake_summary: {
    runtime_ready_skill_count: number;
    context_ready_skill_count: number;
    weak_signal_skill_count: number;
    blocked_skill_count: number;
    stable_source_count: number;
    watchlist_source_count: number;
    scene_counts: Record<string, number>;
    next_batch: WorldSourceCatalogIntakeCandidate[];
  };
  skillhub_count: number;
  mapped_skillhub_count: number;
  source_skill_count: number;
  usable_source_count: number;
  hubs: WorldSourceCatalogHub[];
  overflow_pools: WorldSourceCatalogOverflowPool[];
}

export interface WorldSourceIntakeSourceStat {
  source_name: string;
  category: string;
  policy: string;
  emitted_count: number;
  kept_count: number;
  collapsed_count: number;
}

export interface WorldSourceIntakeStats {
  total_emitted_count: number;
  total_kept_count: number;
  total_collapsed_count: number;
  bursty_sources: WorldSourceIntakeSourceStat[];
}

export interface LiveQuestion {
  question_id: string;
  source_platform: LiveQuestionPlatform;
  discovered_via?:
    | 'metaculus-direct'
    | 'metaforecast'
    | 'metaforecast-discovery'
    | 'platform-direct-fallback'
    | 'internal-metaso-scout'
    | 'fallback-signals'
    | null;
  source_question_id: string;
  origin_url: string;
  title: string;
  title_zh?: string | null;
  background: string;
  background_zh?: string | null;
  resolution_criteria: string;
  resolution_criteria_zh?: string | null;
  region_hint: string;
  topic_bucket: string;
  tags: string[];
  open_at: string | null;
  freeze_at: string | null;
  close_at: string | null;
  resolve_at: string | null;
  status: LiveQuestionStatus;
  official_outcome?: LiveQuestionSide | null;
  official_resolved_at?: string | null;
  platform_probability_yes: number | null;
  platform_probability_updated_at: string | null;
  display_mode?: LiveQuestionDisplayMode | null;
  platform_commentary?: string[] | null;
  platform_participants?: string[] | null;
  platform_market_structure?: string[] | null;
  platform_question_url?: string | null;
  source_note?: string | null;
  raw_source_platform?: string | null;
  validation_mode?:
    | 'platform'
    | 'metaso-price-up'
    | 'metaso-price-down'
    | 'metaso-supply-ease'
    | 'metaso-supply-tight'
    | null;
  validation_query?: string | null;
  platform_context?: string | null;
  presentation_generated_at?: string | null;
  moderator_view_cache?: LiveQuestionModeratorView | null;
  debate_cache?: {
    pro: LiveQuestionDebateSide;
    con: LiveQuestionDebateSide;
  } | null;
  references_cache?: LiveQuestionReference[] | null;
  updated_at: string;
  created_at: string;
}

export interface SourceEmbeddingChunk {
  chunk_id: string;
  signal_id: string;
  title: string;
  text: string;
  published_at: string;
  scene: WorldScene;
  region: string;
  tags: string[];
  source_name: string;
  source_url: string;
  embedding: number[];
  embedding_model: string;
  embedding_backend: string;
  expires_at: string;
}

export interface LiveVote {
  vote_id: string;
  question_id: string;
  xia_id: string;
  source: LiveVoteSource;
  contributor_kind?: 'xia' | 'human' | 'ai' | 'community' | null;
  contributor_label?: string | null;
  origin_url?: string | null;
  side: LiveQuestionSide;
  probability_yes: number;
  reply_to_vote_id?: string | null;
  human_readable_prediction: string;
  human_readable_why: string;
  cited_signal_ids: string[];
  cited_vote_ids: string[];
  what_changes_my_mind: string;
  created_at: string;
  source_attached?: boolean;
  source_snapshot_id?: string | null;
  source_context_generated_at?: string | null;
  source_cutoff_at?: string | null;
  source_signal_count?: number | null;
  source_embedding_backend?: string | null;
  source_latest_signal_published_at?: string | null;
  source_governance_finished_at?: string | null;
  freeze_probability_yes: number | null;
  resolved_outcome?: LiveQuestionSide | null;
  resolved_at?: string | null;
  points_delta?: number | null;
  brier_score?: number | null;
}

export interface ArenaScorecard {
  xia_id: string;
  label?: string;
  vote_count: number;
  resolved_vote_count: number;
  hit_rate: number;
  avg_brier_score: number | null;
  avg_lead_hours: number | null;
  calibration_buckets: Array<{
    label: string;
    min: number;
    max: number;
    count: number;
    hit_rate: number;
  }>;
  quality_score: number;
  points_balance: number;
}

export interface LiveBenchAggregateVote {
  probability_yes: number | null;
  side: LiveQuestionSide | null;
  participant_count: number;
  missing_count: number;
  spread: number | null;
  stddev: number | null;
  complete: boolean;
  participant_labels: string[];
  updated_at: string | null;
}

export interface LiveBenchQuestionPreview {
  question_id: string;
  href: string;
  status: LiveQuestionStatus;
  settlement_status: 'open' | 'pending_official' | 'resolved';
  title: string;
  background: string;
  region_label: string;
  topic_label: string;
  resolve_at: string | null;
  official_outcome: LiveQuestionSide | null;
  official_resolved_at: string | null;
  moderator_line: string;
  source_label: string;
  evidence_count: number;
  rule_count: number;
  discussion_count: number;
  xia_count: number;
  aggregate_vote: LiveBenchAggregateVote;
  platform_question_url: string | null;
}

export interface LiveBenchQuestionDiscussionEntry {
  id: string;
  kind: 'platform-brief' | 'platform-participant' | 'external-post';
  label: string;
  author: string | null;
  side: LiveQuestionSide | null;
  probability_yes: number | null;
  summary: string;
  detail: string | null;
  created_at: string | null;
  origin_url: string | null;
}

export interface LiveBenchQuestionPosition {
  vote_id: string;
  xia_id: string;
  label: string;
  side: LiveQuestionSide;
  probability_yes: number;
  prediction: string;
  why: string;
  what_changes_my_mind: string;
  cited_signal_ids: string[];
  created_at: string;
  brier_score: number | null;
  points_delta: number | null;
}

export interface LiveBenchGroupedPositions {
  yes: LiveBenchQuestionPosition[];
  no: LiveBenchQuestionPosition[];
  missing: Array<{
    xia_id: string;
    label: string;
  }>;
}

export interface LiveBenchEvidenceSection {
  role: 'zvec-core' | 'question-rule';
  title: string;
  description: string;
  total_count: number;
  visible_count: number;
  references: LiveQuestionReference[];
}

export interface LiveBenchSettlementScore {
  official_outcome: LiveQuestionSide | null;
  official_resolved_at: string | null;
  platform_brier_score: number | null;
  platform_hit: boolean | null;
  replay_summary: string;
  xia_scores: Array<{
    xia_id: string;
    label: string;
    side: LiveQuestionSide;
    probability_yes: number;
    brier_score: number | null;
    points_delta: number | null;
    hit: boolean | null;
  }>;
}

export interface LiveBenchQuestionDetail {
  generated_at: string;
  scene: WorldScene;
  question: LiveQuestion;
  preview: LiveBenchQuestionPreview;
  moderator_brief: {
    summary: string;
    resolution_rule: string;
    current_bias: string;
    watch_for: string[];
    citation_ids: string[];
  };
  external_discussion: {
    summary: string;
    entries: LiveBenchQuestionDiscussionEntry[];
  };
  xia_positions: LiveBenchGroupedPositions;
  aggregate_vote: LiveBenchAggregateVote;
  evidence: LiveBenchEvidenceSection[];
  settlement: LiveBenchSettlementScore;
}

export interface LiveBenchResolvedQuestionSeriesItem {
  question_id: string;
  title: string;
  href: string;
  resolved_at: string | null;
  probability_yes: number | null;
  official_outcome: LiveQuestionSide | null;
  hit: boolean | null;
  brier_score: number | null;
  participant_count: number;
  formal_participant_count: number;
  synthetic_participant_count: number;
  source_formal_participant_count: number;
  formal_hit: boolean | null;
  formal_brier_score: number | null;
  formal_scored: boolean;
  source_formal_hit: boolean | null;
  source_formal_brier_score: number | null;
  source_formal_scored: boolean;
  scored: boolean;
}

export interface LiveBenchCalibrationBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  empirical_yes_rate: number;
  avg_probability_yes: number | null;
  gap: number | null;
}

export interface LiveBenchPlatformModelSummary {
  resolved_question_count: number;
  scored_question_count: number;
  formal_scored_question_count: number;
  source_formal_scored_question_count: number;
  formal_vote_count: number;
  source_formal_vote_count: number;
  formal_participant_count: number;
  synthetic_scored_question_count: number;
  active_question_count: number;
  watchlist_question_count?: number;
  open_question_count?: number;
  current_question_count?: number;
  avg_brier: number | null;
  formal_avg_brier: number | null;
  source_formal_avg_brier: number | null;
  hit_rate: number;
  formal_hit_rate: number;
  source_formal_hit_rate: number;
  scoring_coverage_rate: number;
  formal_scoring_coverage_rate: number;
  source_formal_scoring_coverage_rate: number;
  calibration: LiveBenchCalibrationBucket[];
}

export interface LiveBenchSourceHealth {
  status: 'ok' | 'degraded';
  total_question_count: number;
  open_question_count: number;
  active_question_count: number;
  watchlist_question_count: number;
  resolved_question_count: number;
  settlement_pending_count: number;
  metaculus_configured: boolean;
  metaforecast_candidate_count: number;
  metaforecast_scanned_count: number;
  metaforecast_platform_candidate_count: number;
  manifold_direct_count: number;
  manifold_fallback_count: number;
  polymarket_direct_count: number;
  retained_open_count: number;
  retained_resolved_count: number;
  min_open_question_count: number;
  min_total_question_count: number;
  issues: string[];
  note: string;
}

export interface LiveBenchEvaluation {
  generated_at: string;
  scene: WorldScene;
  platform_model: LiveBenchPlatformModelSummary;
  participant_scorecards: ArenaScorecard[];
  history_series: Array<{
    resolved_at: string | null;
    avg_brier: number | null;
    formal_avg_brier: number | null;
    source_formal_avg_brier?: number | null;
    hit_rate: number;
    formal_hit_rate: number;
    source_formal_hit_rate?: number;
    resolved_question_count: number;
    scored_question_count: number;
    formal_scored_question_count: number;
    source_formal_scored_question_count?: number;
  }>;
  resolved_question_series: LiveBenchResolvedQuestionSeriesItem[];
}

export interface LiveQuestionModeratorView {
  summary: string;
  citation_ids: string[];
}

export interface LiveQuestionDebateSide {
  summary: string;
  citation_ids: string[];
  vote_ids: string[];
  count: number;
}

export interface LiveQuestionReference {
  ref_id: string;
  label: string;
  url: string;
  source_name: string;
  source_kind?: 'signal' | 'question_rule';
  recall_role?: 'zvec-core' | 'question-rule';
  published_at?: string | null;
  signal_id?: string | null;
  note?: string | null;
}

export interface LiveQuestionSnapshot {
  question: LiveQuestion;
  xia_votes: LiveVote[];
  discussion_votes: LiveVote[];
  zvec_chunks: SourceEmbeddingChunk[];
  references: LiveQuestionReference[];
}

export interface LiveBenchArenaState {
  generated_at: string;
  scene: WorldScene;
  source_status: {
    metaculus: string;
    metaforecast: string;
    embeddings: string;
  };
  source_health?: LiveBenchSourceHealth;
  active_window_days: number;
  watchlist_window_days: number;
  sticky_question: LiveQuestionSnapshot | null;
  active_questions: LiveQuestionSnapshot[];
  resolved_questions: LiveQuestionSnapshot[];
  watchlist_questions: LiveQuestionSnapshot[];
  settlement_pending_count: number;
  odds_board: ArenaScorecard[];
  quality_board: ArenaScorecard[];
}

export interface WorldDashboardAction {
  label: string;
  href: string;
  description: string;
  kind: 'primary' | 'secondary';
  audience: 'human' | 'agent' | 'shared';
}

export interface WorldDashboardSourceRefreshSummary {
  generated_at: string;
  skillhub_snapshot: {
    last_refreshed_at: string | null;
    stage: string;
    summary: string;
  };
  source_skill_snapshot: {
    last_refreshed_at: string | null;
    scanned_hub_count: number;
    active_hub_count: number;
    yielded_skill_count: number;
  };
  repo_discovery_snapshot: {
    last_refreshed_at: string | null;
    local_repo_count: number;
    github_candidate_count: number;
    directory_candidate_count?: number;
    rss_candidate_count?: number;
    rss_added_count?: number;
    rss_removed_count?: number;
    endpoint_candidate_count?: number;
    method_candidate_count?: number;
    trendradar_ready: boolean;
    summary: string;
  };
  monitor_runtime: {
    latest_poll_finished_at: string | null;
    monitor_source_count: number;
    changed_source_count: number;
    high_quality_source_count: number;
    recommended_source_count: number;
    cooling_down_count: number;
    next_batch_count: number;
    runtime_failure_count: number;
  };
  refresh_job?: {
    started_at: string | null;
    finished_at: string | null;
    running: boolean;
    ok: boolean;
    timed_out: boolean;
    duration_ms: number | null;
    directory_ok?: boolean | null;
    world_cache_ok?: boolean | null;
    world_cache_degraded?: boolean;
    world_cache_base_url?: string | null;
    self_healing_ok?: boolean | null;
    note_count?: number;
  };
  signal_mix: {
    total_signal_count: number;
    mapped_signal_count: number;
    world_monitor_count: number;
    minimax_labeled_count: number;
    wechat_count: number;
    wechat_labeled_count: number;
  };
}

export interface WorldDashboardLiveBenchSummary {
  generated_at: string;
  window_days: number;
  active_question_count: number;
  watchlist_question_count: number;
  open_question_count?: number;
  resolved_question_count: number;
  settlement_pending_count: number;
  current_question_count: number;
  platform_counts: Array<{
    platform: LiveQuestionPlatform;
    label: string;
    count: number;
  }>;
  source_status: {
    metaculus: string;
    metaforecast: string;
    embeddings: string;
  };
  source_health?: LiveBenchSourceHealth;
  synthetic_participant_count: number;
  synthetic_refresh_minutes: number;
  resolved_backfill_enabled: boolean;
}

export interface WorldSourceKnowledgeState {
  generated_at: string;
  scene: WorldScene;
  window_days: number;
  signal_count: number;
  indexed_signal_count: number;
  chunk_count: number;
  zvec_group_count: number;
  last_synced_at: string | null;
  last_embedding_backend: string | null;
  latest_signal_published_at: string | null;
  oldest_signal_published_at: string | null;
  source_status: {
    embeddings: string;
  };
  source_health?: {
    stable_source_count: number;
    watchlist_source_count: number;
    blocked_or_unknown_source_count: number;
    runtime_ready_skill_count: number;
    context_ready_skill_count: number;
    weak_signal_skill_count: number;
    blocked_skill_count: number;
    latest_signal_age_hours?: number | null;
    freshness_status?: 'fresh' | 'stale' | 'unknown';
    issues?: string[];
    next_batch: WorldSourceCatalogIntakeCandidate[];
    note: string;
  };
  governance?: {
    generated_at: string;
    runtime_failure_count: number;
    cooling_down_count: number;
    monitor_source_count: number;
    changed_source_count?: number;
    high_quality_source_count: number;
    recommended_source_count: number;
    latest_poll_finished_at: string | null;
    recent_runtime_failures: Array<{
      key: string;
      label: string;
      source_kind: 'catalog' | 'selected' | 'public-anchor';
      fail_count: number;
      cooldown_until: string | null;
      last_error: string;
      last_failed_at: string | null;
      last_succeeded_at: string | null;
    }>;
    cooling_down_sources: Array<{
      key: string;
      label: string;
      source_kind: 'catalog' | 'selected' | 'public-anchor';
      fail_count: number;
      cooldown_until: string | null;
      last_error: string;
      last_failed_at: string | null;
      last_succeeded_at: string | null;
    }>;
    recommended_sources: Array<{
      skill: string;
      source_name: string;
      scene: string;
      admission_tier: string;
      success_rate: number;
      quality_score: number;
      recommendation: string;
      avg_latency_ms: number;
      last_checked_at: string | null;
    }>;
  };
  embedding_groups: Array<{
    backend: string;
    model: string;
    dimension: number;
    count: number;
  }>;
  source_refresh_summary?: Pick<WorldDashboardSourceRefreshSummary, 'repo_discovery_snapshot'>;
  source_monitor_db?: WorldSourceMonitorDbStatus;
}

export interface WorldSourceMonitorDbStatus {
  enabled: boolean;
  connected: boolean | null;
  snapshot_table_ready: boolean | null;
  latest_scene: WorldScene | null;
  latest_snapshot_recorded_at: string | null;
  latest_signal_published_at: string | null;
  latest_signal_count: number | null;
  error?: string;
}
