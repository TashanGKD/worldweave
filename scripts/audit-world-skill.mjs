import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

function ensure(text, pattern, message, failures) {
  const ok = typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
  if (!ok) failures.push(message);
}

async function main() {
  const failures = [];

  const skillRoute = await read('src/app/api/v1/openclaw/skill.md/route.ts');
  const aihotSkillRoute = await read('src/app/api/v1/openclaw/aihot.skill.md/route.ts');
  const livebenchRedirect = await read('src/app/api/v1/openclaw/livebench.skill.md/route.ts');
  const sourcesRedirect = await read('src/app/api/v1/openclaw/sources.skill.md/route.ts');
  const evaluationRedirect = await read('src/app/api/v1/openclaw/evaluation.skill.md/route.ts');
  const voteRoute = await read('src/app/api/v1/world/livebench/vote/route.ts');
  const judgmentsRoute = await read('src/app/api/v1/world/livebench/judgments/route.ts');
  const votesRoute = await read('src/app/api/v1/world/livebench/votes/route.ts');
  const livebenchSource = await read('src/lib/world/livebench.ts');
  const hermesFormalVote = await read('scripts/hermes-world-formal-vote.ps1');
  const questionsRoute = await read('src/app/api/v1/world/livebench/questions/route.ts');
  const questionDetailRoute = await read('src/app/api/v1/world/livebench/questions/[questionId]/route.ts');
  const signalsRoute = await read('src/app/api/v1/world/signals/route.ts');
  const sourceFeedRoute = await read('src/app/api/v1/topiclab/source-feed/articles/route.ts');
  const signalsPage = await read('src/app/signals/page.tsx');

  const requiredSections = [
    '# 世界脉络 / 信源',
    '## 给外部虾',
    '## 快速开始',
    '## 关键入口',
    '## 适合做什么',
    '## 核心规则',
    '## 后台校准回路',
    '## 定时运行时的工作方式',
    '## 模型回看',
    '## 常见失误',
  ];

  for (const section of requiredSections) {
    ensure(skillRoute, section, `skill route missing section: ${section}`, failures);
  }

  for (const term of [
    '近 30 天信源查询',
    '先有信源，再有判断',
    '先独立完成',
    '后台校准不是主回答',
    '不要把内部标识、来源标签、其他虾数量这类运行细节写进自然语言理由',
    'probability_yes',
    '可选字段；如果不确定就不传',
    '/world/signals',
    '/topiclab/source-feed/articles',
    'AI Hot Skill',
    'question_id=从题池取得的question_id',
    '/world/livebench/vote',
    'probability_yes',
  ]) {
    ensure(skillRoute, term, `skill route missing contract term: ${term}`, failures);
  }

  for (const redirectSource of [livebenchRedirect, sourcesRedirect, evaluationRedirect]) {
    ensure(redirectSource, 'NextResponse.redirect', 'legacy child skill endpoint must redirect to main skill', failures);
    ensure(redirectSource, '/openclaw/skill.md', 'legacy child skill endpoint must point at main skill', failures);
    ensure(redirectSource, "'Cache-Control': 'no-store'", 'legacy child skill endpoint must be no-store', failures);
  }

  for (const field of [
    'source_attached',
    'source_snapshot_id',
    'source_context_generated_at',
    'source_signal_count',
    'source_embedding_backend',
  ]) {
    ensure(voteRoute, field, `vote route missing source-attached field: ${field}`, failures);
    ensure(livebenchSource, field, `livebench persistence missing source-attached field: ${field}`, failures);
  }

  ensure(
    livebenchSource,
    'source_formal_vote_count',
    'evaluation summary missing source-formal metrics',
    failures,
  );
  ensure(
    skillRoute,
    'resolveRequestOrigin',
    'skill route must generate LAN-aware URLs from the request origin',
    failures,
  );
  ensure(
    questionsRoute,
    'url.searchParams.get(\'question_id\')',
    'questions route must support query-param question detail lookup for external agents',
    failures,
  );
  ensure(
    questionsRoute,
    'x-world-detail-alias',
    'query-param question detail lookup must mark alias responses',
    failures,
  );
  ensure(
    questionDetailRoute,
    'decodeURIComponent(pathQuestionId)',
    'question detail route must decode encoded question ids',
    failures,
  );
  ensure(signalsRoute, 'signals:', 'world signals API must expose a signals array', failures);
  ensure(signalsRoute, 'Cache-Control', 'world signals API must be no-store', failures);
  ensure(sourceFeedRoute, 'q', 'source-feed API must accept a text query', failures);
  ensure(sourceFeedRoute, 'source', 'source-feed API must accept source filtering', failures);
  ensure(sourceFeedRoute, 'Cache-Control', 'source-feed API must be no-store', failures);
  ensure(aihotSkillRoute, 'api/public/items?mode=selected', 'AI Hot skill must document the selected-items API', failures);
  ensure(aihotSkillRoute, 'User-Agent', 'AI Hot skill must require a browser-like User-Agent for raw API calls', failures);
  ensure(aihotSkillRoute, 'LiveBench', 'AI Hot skill must keep LiveBench as calibration loop', failures);
  ensure(signalsPage, "redirect('/source-knowledge')", 'legacy /signals page must redirect to source knowledge page', failures);
  ensure(judgmentsRoute, "export { GET, POST } from '../vote/route'", 'judgments alias must proxy to vote route', failures);
  ensure(votesRoute, "export { GET, POST } from '../vote/route'", 'votes alias must proxy to vote route', failures);
  ensure(
    hermesFormalVote,
    '/api/v1/topiclab/source-feed/articles',
    'Hermes formal vote must call source-feed before judging',
    failures,
  );
  ensure(
    hermesFormalVote,
    'source_feed_prerequisite_failed',
    'Hermes formal vote must stop when source-feed prerequisites fail',
    failures,
  );
  ensure(
    hermesFormalVote,
    'Read-XiaQuestionDetail',
    'Hermes formal vote must load single-question detail before judging',
    failures,
  );
  ensure(
    hermesFormalVote,
    'cited_signal_ids',
    'Hermes formal vote must attach source-feed signal ids to votes',
    failures,
  );

  if (failures.length > 0) {
    console.error(JSON.stringify({ ok: false, failures }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checked_files: [
          'src/app/api/v1/openclaw/skill.md/route.ts',
          'src/app/api/v1/openclaw/aihot.skill.md/route.ts',
          'src/app/api/v1/openclaw/livebench.skill.md/route.ts',
          'src/app/api/v1/openclaw/sources.skill.md/route.ts',
          'src/app/api/v1/openclaw/evaluation.skill.md/route.ts',
          'src/app/api/v1/world/livebench/vote/route.ts',
          'src/app/api/v1/world/livebench/judgments/route.ts',
          'src/app/api/v1/world/livebench/votes/route.ts',
          'src/app/api/v1/world/livebench/questions/route.ts',
          'src/app/api/v1/world/livebench/questions/[questionId]/route.ts',
          'src/app/api/v1/world/signals/route.ts',
          'src/app/api/v1/topiclab/source-feed/articles/route.ts',
          'src/app/signals/page.tsx',
          'scripts/hermes-world-formal-vote.ps1',
          'src/lib/world/livebench.ts',
        ],
        required_sections: requiredSections,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
