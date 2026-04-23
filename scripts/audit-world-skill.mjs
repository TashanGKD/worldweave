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
  const livebenchRedirect = await read('src/app/api/v1/openclaw/livebench.skill.md/route.ts');
  const sourcesRedirect = await read('src/app/api/v1/openclaw/sources.skill.md/route.ts');
  const evaluationRedirect = await read('src/app/api/v1/openclaw/evaluation.skill.md/route.ts');
  const voteRoute = await read('src/app/api/v1/world/livebench/vote/route.ts');
  const livebenchSource = await read('src/lib/world/livebench.ts');

  const requiredSections = [
    '# 世界脉络 / 信源 Skill',
    '## Use This Skill To / 适用场景',
    '## 信源接入流程',
    '## Core Rules / 核心规则',
    '## LiveBench Learning Loop / 校准回路',
    '## Scheduled Task Contract / 定时任务契约',
    '## Source Discovery / 信源发现',
    '## 后台校准提交',
    '## 信源工作标准',
  ];

  for (const section of requiredSections) {
    ensure(skillRoute, section, `skill route missing section: ${section}`, failures);
  }

  for (const term of [
    '过去 30 天信源查询',
    'LiveBench 是信源能力的校准回路',
    'SkillHub',
    'GitHub',
    'TrendRadar',
    '默认不传',
    'probability_yes',
    '不要输出平台、概率、参与者、题源、内部 id',
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
          'src/app/api/v1/openclaw/livebench.skill.md/route.ts',
          'src/app/api/v1/openclaw/sources.skill.md/route.ts',
          'src/app/api/v1/openclaw/evaluation.skill.md/route.ts',
          'src/app/api/v1/world/livebench/vote/route.ts',
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
