import type { AseanGraphEdge, AseanGraphNode, AseanTopicKey, AseanTopicPayload } from './asean-topic';

export type AseanGraphifyLayer = 'center' | 'country' | 'topic' | 'evidence' | 'context';
export type AseanGraphifyEdgeRole = 'hub' | 'hierarchy' | 'evidence';

export type AseanGraphifyNode = AseanGraphNode & {
  px: number;
  py: number;
  graphify_layer: AseanGraphifyLayer;
  source_file: string;
  source_location: string;
};

export type AseanGraphifyEdge = AseanGraphEdge & {
  edge_role: AseanGraphifyEdgeRole;
};

export type AseanGraphifyView = {
  nodes: AseanGraphifyNode[];
  edges: AseanGraphifyEdge[];
};

const ASEAN_COUNTRY_ORDER = ['印尼', '东帝汶', '菲律宾', '文莱', '马来西亚', '新加坡', '泰国', '缅甸', '老挝', '越南', '柬埔寨'];

function nodeMatchesScope(node: AseanGraphNode, activeIssue: AseanTopicKey | 'all', selectedCountry: string | null) {
  const issueMatch = activeIssue === 'all' || node.community === activeIssue || node.issue === activeIssue;
  const countryMatch = !selectedCountry || node.country_scope?.includes(selectedCountry) || node.id === `country:${selectedCountry}`;
  if (node.id === 'region:asean') return true;
  if (node.type === 'country') return true;
  if (node.type === 'issue') return issueMatch;
  if (node.type === 'route_or_asset') return issueMatch || node.community === 'regional_context';
  if (node.type === 'forecast_question') return issueMatch && countryMatch;
  if (node.type === 'event_cluster') return issueMatch && countryMatch && node.confidence === 'EXTRACTED';
  return activeIssue === 'all' || node.community === activeIssue || node.community === 'regional_context';
}

function ringPosition(radiusX: number, radiusY: number, index: number, count: number, start = -90, end = 270) {
  const angle = (start + (index / Math.max(1, count)) * (end - start)) * Math.PI / 180;
  return {
    px: Number((50 + Math.cos(angle) * radiusX).toFixed(2)),
    py: Number((50 + Math.sin(angle) * radiusY).toFixed(2)),
  };
}

function offsetPosition(position: { px: number; py: number }, index: number, total: number, distance = 7) {
  const angle = ((index / Math.max(1, total)) * 360 - 90) * Math.PI / 180;
  return {
    px: Number((position.px + Math.cos(angle) * distance).toFixed(2)),
    py: Number((position.py + Math.sin(angle) * distance).toFixed(2)),
  };
}

function graphifyLayer(node: AseanGraphNode): AseanGraphifyLayer {
  if (node.id === 'region:asean') return 'center';
  if (node.type === 'country') return 'country';
  if (node.type === 'issue' || node.type === 'route_or_asset' || node.type === 'forecast_question') return 'topic';
  if (node.type === 'event_cluster') return 'evidence';
  return 'context';
}

function withGraphifyFields(node: AseanGraphNode, px: number, py: number): AseanGraphifyNode {
  return {
    ...node,
    px,
    py,
    graphify_layer: graphifyLayer(node),
    source_file: 'worldweave:asean-topic',
    source_location: node.confidence,
  };
}

function countrySort(left: AseanGraphNode, right: AseanGraphNode) {
  const leftIndex = ASEAN_COUNTRY_ORDER.indexOf(left.label);
  const rightIndex = ASEAN_COUNTRY_ORDER.indexOf(right.label);
  return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
}

function strongestIssueForEvent(node: AseanGraphNode, topic: AseanTopicPayload): AseanTopicKey | null {
  const signalId = node.evidence_signal_ids?.[0];
  return topic.signals.find((signal) => signal.id === signalId)?.topic || (node.issue as AseanTopicKey | undefined) || null;
}

export function buildAseanGraphifyView(
  topic: AseanTopicPayload,
  activeIssue: AseanTopicKey | 'all',
  selectedCountry: string | null,
): AseanGraphifyView {
  const scoped = topic.graph.nodes.filter((node) => nodeMatchesScope(node, activeIssue, selectedCountry));
  const byId = new Map(scoped.map((node) => [node.id, node]));
  const center = byId.get('region:asean') || topic.graph.nodes.find((node) => node.id === 'region:asean');
  const countries = topic.graph.nodes
    .filter((node) => node.type === 'country')
    .sort(countrySort);
  const issueNodes = scoped
    .filter((node) => node.type === 'issue')
    .sort((left, right) => right.weight - left.weight);
  const routeNodes = scoped
    .filter((node) => node.type === 'route_or_asset')
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3);
  const questionNodes = scoped
    .filter((node) => node.type === 'forecast_question')
    .sort((left, right) => {
      return right.weight - left.weight;
    })
    .slice(0, 2);
  const topics = [...issueNodes, ...routeNodes, ...questionNodes];
  const events = scoped
    .filter((node) => node.type === 'event_cluster')
    .sort((left, right) => right.weight - left.weight)
    .slice(0, selectedCountry || activeIssue !== 'all' ? 5 : 6);
  const context = scoped
    .filter((node) => node.type === 'external_actor' && node.id !== 'region:asean')
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4);

  const positioned: AseanGraphifyNode[] = [];
  if (center) positioned.push(withGraphifyFields(center, 50, 50));
  countries.forEach((node, index) => {
    const pos = ringPosition(21, 18, index, countries.length);
    positioned.push(withGraphifyFields(node, pos.px, pos.py));
  });
  topics.forEach((node, index) => {
    const pos = ringPosition(38, 31, index, topics.length, -82, 278);
    positioned.push(withGraphifyFields(node, pos.px, pos.py));
  });

  const topicPosition = new Map(positioned.filter((node) => node.type === 'issue').map((node) => [node.id, node]));
  const eventAnchorCounts = new Map<string, number>();
  events.forEach((node, index) => {
    const issue = strongestIssueForEvent(node, topic);
    const anchorId = issue ? `issue:${issue}` : '';
    const anchor = topicPosition.get(anchorId);
    const anchorCount = eventAnchorCounts.get(anchorId) || 0;
    eventAnchorCounts.set(anchorId, anchorCount + 1);
    const pos = anchor
      ? offsetPosition(anchor, anchorCount, 4, 7.2)
      : ringPosition(43, 35, index, Math.max(1, events.length), 128, 232);
    positioned.push(withGraphifyFields(node, pos.px, pos.py));
  });
  context.forEach((node, index) => {
    const pos = ringPosition(43, 35, index, Math.max(1, context.length), -150, -104);
    positioned.push(withGraphifyFields(node, pos.px, pos.py));
  });

  const positionIds = new Set(positioned.map((node) => node.id));
  const countryIssuePairs = new Set<string>();
  for (const signal of topic.signals) {
    if (activeIssue !== 'all' && signal.topic !== activeIssue) continue;
    if (selectedCountry && !signal.country_scope.includes(selectedCountry)) continue;
    for (const country of signal.country_scope) {
      if (country !== '东盟') countryIssuePairs.add(`country:${country}::issue:${signal.topic}`);
    }
  }

  const edges: AseanGraphifyEdge[] = countries.map((country) => ({
    source: 'region:asean',
    target: country.id,
    relation: 'located_in',
    confidence: 'TEMPLATE',
    weight: 0.72,
    evidence_signal_ids: [],
    edge_role: 'hub',
  }));
  const countryIssueDegree = new Map<string, number>();
  for (const pair of countryIssuePairs) {
    const [source, target] = pair.split('::');
    if (!positionIds.has(source) || !positionIds.has(target)) continue;
    const degree = countryIssueDegree.get(source) || 0;
    if (degree >= 2) continue;
    countryIssueDegree.set(source, degree + 1);
    edges.push({
      source,
      target,
      relation: 'related_to_issue',
      confidence: 'EXTRACTED',
      weight: 0.58,
      evidence_signal_ids: [],
      edge_role: 'hierarchy',
    });
  }
  for (const event of events) {
    const issue = strongestIssueForEvent(event, topic);
    const issueId = issue ? `issue:${issue}` : '';
    if (!positionIds.has(event.id) || !positionIds.has(issueId)) continue;
    edges.push({
      source: event.id,
      target: issueId,
      relation: 'related_to_issue',
      confidence: event.confidence,
      weight: event.weight,
      evidence_signal_ids: event.evidence_signal_ids || [],
      edge_role: 'evidence',
    });
  }
  for (const question of questionNodes) {
    const issueId = question.issue ? `issue:${question.issue}` : '';
    if (!positionIds.has(question.id) || !positionIds.has(issueId)) continue;
    edges.push({
      source: question.id,
      target: issueId,
      relation: 'supports_question',
      confidence: question.confidence,
      weight: question.weight,
      evidence_signal_ids: question.evidence_signal_ids || [],
      edge_role: 'evidence',
    });
  }

  return { nodes: positioned, edges };
}
