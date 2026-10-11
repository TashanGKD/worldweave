import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(source) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
}
const abortUrl = moduleUrl(readFileSync(new URL('../src/lib/world/asean-abort.ts', import.meta.url), 'utf8'));

for (const file of ['asean-dataset-metrics.ts', 'asean-public-risk-events.ts']) {
  const source = readFileSync(new URL('../src/lib/world/' + file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const name of ['fetchJson', 'fetchText']) {
    const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    const { [name]: fetchData } = await import(moduleUrl(`
      import { createLinkedTimeoutSignal, throwIfAseanAborted } from '${abortUrl}';
      const REQUEST_TIMEOUT_MS = 20;
      const CSV_REQUEST_TIMEOUT_MS = 20;
      const FETCH_ATTEMPTS = 1;
      export ${declaration.getText(ast)}
    `));

    test(`${file} ${name} keeps cancellation active while reading the body`, async () => {
      const original = globalThis.fetch;
      let bodyCanceled = false;
      globalThis.fetch = async (_url, { signal }) => {
        const read = () => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            bodyCanceled = true;
            reject(signal.reason);
          }, { once: true });
        });
        return { ok: true, json: read, text: read };
      };
      let timer;
      try {
        const target = file === 'asean-dataset-metrics.ts' ? { url: 'https://example.test', name: 'test' } : 'https://example.test';
        const result = await Promise.race([
          fetchData(target),
          new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('body deadline was removed')), 250); }),
        ]);
        assert.equal(result, null);
        assert.equal(bodyCanceled, true);
      } finally {
        clearTimeout(timer);
        globalThis.fetch = original;
      }
    });
  }
}
