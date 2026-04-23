import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2] || '/tmp/world_questions_5001.json';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function asSnapshots(payload) {
  if (Array.isArray(payload)) return payload;
  return [
    ...(payload.active_questions || []),
    ...(payload.watchlist_questions || []),
    ...(payload.resolved_questions || []),
  ];
}

function normalizeSignalId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('signal:')) return raw.slice('signal:'.length);
  if (raw.startsWith('ref-signal-')) return raw.slice('ref-signal-'.length);
  if (raw.startsWith('reference:ref-signal-')) return raw.slice('reference:ref-signal-'.length);
  if (raw.startsWith('selected-source-')) return raw;
  if (raw.startsWith('catalog-source-')) return raw;
  if (raw.startsWith('event-')) return raw;
  if (raw.startsWith('marker-')) return raw;
  if (raw.startsWith('monitor-source-')) return raw;
  if (raw.startsWith('metaso:')) return raw;
  return raw.includes(':') ? raw.split(':').pop() : raw;
}

function uniqueSignals(values) {
  return [...new Set(values.map(normalizeSignalId).filter(Boolean))];
}

function overlapRatio(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const overlap = [...leftSet].filter((item) => rightSet.has(item));
  return {
    overlap,
    ratio: rightSet.size === 0 ? 0 : overlap.length / rightSet.size,
  };
}

function referencesById(snapshot) {
  return new Map((snapshot.references || []).map((reference) => [reference.ref_id, reference]));
}

function citationSignalsFromRefIds(snapshot, refIds) {
  const refMap = referencesById(snapshot);
  return uniqueSignals(
    (refIds || []).map((refId) => {
      const reference = refMap.get(refId);
      return reference?.signal_id || refId;
    }),
  );
}

function currentCitationSignals(snapshot) {
  return uniqueSignals([
    ...citationSignalsFromRefIds(snapshot, snapshot.moderator_view?.citation_ids || []),
    ...citationSignalsFromRefIds(snapshot, snapshot.debate?.pro?.citation_ids || []),
    ...citationSignalsFromRefIds(snapshot, snapshot.debate?.con?.citation_ids || []),
  ]);
}

function independentXiaVotes(snapshot) {
  return (snapshot.xia_votes || []).filter(
    (vote) => !['arena-harbor', 'arena-citadel'].includes(String(vote.xia_id || '')),
  );
}

function independentCitationSignals(snapshot) {
  return uniqueSignals(
    independentXiaVotes(snapshot).flatMap((vote) => vote.cited_signal_ids || []),
  );
}

function scoreQuestion(snapshot) {
  const comparison = snapshot.graph_comparison || {};
  const zvec = uniqueSignals(comparison.zvec_chunk_ids || []);
  const graph = uniqueSignals(comparison.graph_chunk_ids || []);
  const currentCitations = currentCitationSignals(snapshot);
  const independentCitations = independentCitationSignals(snapshot);
  const gold = uniqueSignals([...currentCitations, ...independentCitations]);
  const zvecVsGold = overlapRatio(zvec, gold);
  const graphVsGold = overlapRatio(graph, gold);

  return {
    question_id: snapshot.question?.question_id || comparison.question_id || 'unknown',
    title: snapshot.question?.title || snapshot.question?.title_zh || 'unknown',
    zvec_count: zvec.length,
    graph_count: graph.length,
    current_citation_count: currentCitations.length,
    independent_citation_count: independentCitations.length,
    gold_count: gold.length,
    zvec_hit_count: zvecVsGold.overlap.length,
    graph_hit_count: graphVsGold.overlap.length,
    zvec_hit_ratio: zvecVsGold.ratio,
    graph_hit_ratio: graphVsGold.ratio,
    zvec_only_hits: zvecVsGold.overlap.filter((item) => !graph.includes(item)),
    graph_only_hits: graphVsGold.overlap.filter((item) => !zvec.includes(item)),
    zvec_chunks: zvec,
    graph_chunks: graph,
    gold_signals: gold,
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function main() {
  const resolvedPath = path.resolve(inputPath);
  const payload = readJson(resolvedPath);
  const snapshots = asSnapshots(payload);
  const scored = snapshots
    .map(scoreQuestion)
    .filter((item) => item.zvec_count > 0 || item.graph_count > 0);

  const withGold = scored.filter((item) => item.gold_count > 0);
  const zvecWins = withGold.filter((item) => item.zvec_hit_ratio > item.graph_hit_ratio);
  const graphWins = withGold.filter((item) => item.graph_hit_ratio > item.zvec_hit_ratio);
  const ties = withGold.filter((item) => item.graph_hit_ratio === item.zvec_hit_ratio);

  const summary = {
    input_path: resolvedPath,
    question_count: scored.length,
    questions_with_gold: withGold.length,
    avg_zvec_hit_ratio: Number(average(withGold.map((item) => item.zvec_hit_ratio)).toFixed(4)),
    avg_graph_hit_ratio: Number(average(withGold.map((item) => item.graph_hit_ratio)).toFixed(4)),
    avg_zvec_hit_count: Number(average(withGold.map((item) => item.zvec_hit_count)).toFixed(4)),
    avg_graph_hit_count: Number(average(withGold.map((item) => item.graph_hit_count)).toFixed(4)),
    zvec_wins: zvecWins.length,
    graph_wins: graphWins.length,
    ties: ties.length,
    strongest_zvec_examples: zvecWins
      .sort((left, right) => (right.zvec_hit_ratio - right.graph_hit_ratio) || (right.zvec_hit_count - left.zvec_hit_count))
      .slice(0, 5)
      .map((item) => ({
        question_id: item.question_id,
        title: item.title,
        gold_count: item.gold_count,
        zvec_hit_ratio: item.zvec_hit_ratio,
        graph_hit_ratio: item.graph_hit_ratio,
        zvec_only_hits: item.zvec_only_hits.slice(0, 4),
      })),
    strongest_graph_examples: graphWins
      .sort((left, right) => (right.graph_hit_ratio - right.zvec_hit_ratio) || (right.graph_hit_count - left.graph_hit_count))
      .slice(0, 5)
      .map((item) => ({
        question_id: item.question_id,
        title: item.title,
        gold_count: item.gold_count,
        zvec_hit_ratio: item.zvec_hit_ratio,
        graph_hit_ratio: item.graph_hit_ratio,
        graph_only_hits: item.graph_only_hits.slice(0, 4),
      })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
