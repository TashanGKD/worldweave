import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/request-origin.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext}}).outputText;
const {resolvePublicBaseUrl, resolvePublicSkillUrl} = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('mounted proxy produces externally reachable Skill links', () => {
  const headers = new Headers({host: 'host.docker.internal:3020',
    'x-forwarded-host': 'world.tashan.chat', 'x-forwarded-proto': 'http',
    'x-forwarded-prefix': '/worldweave'});
  const input = {headers, requestUrl: 'http://host.docker.internal:3020/api/v1/openclaw/skill.md'};
  assert.equal(resolvePublicBaseUrl(input), 'https://world.tashan.chat/worldweave');
  assert.equal(resolvePublicSkillUrl(input), 'https://world.tashan.chat/worldweave/api/v1/openclaw/skill.md');
});

test('internal proxy origin never escapes in a public document', () => {
  const previous = process.env.AGENT_PUBLIC_BASE_URL;
  const legacy = process.env.OPENCLAW_BASE_URL;
  try {
    delete process.env.AGENT_PUBLIC_BASE_URL;
    delete process.env.OPENCLAW_BASE_URL;
    const input = {headers: new Headers({host: 'host.docker.internal:3020'})};
    assert.throws(() => resolvePublicBaseUrl(input), /Public Agent base URL/);
    process.env.AGENT_PUBLIC_BASE_URL = 'https://world.tashan.chat/worldweave';
    assert.equal(resolvePublicBaseUrl(input), process.env.AGENT_PUBLIC_BASE_URL);
  } finally {
    if (previous === undefined) delete process.env.AGENT_PUBLIC_BASE_URL;
    else process.env.AGENT_PUBLIC_BASE_URL = previous;
    if (legacy === undefined) delete process.env.OPENCLAW_BASE_URL;
    else process.env.OPENCLAW_BASE_URL = legacy;
  }
});
