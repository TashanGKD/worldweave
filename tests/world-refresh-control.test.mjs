import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

import {
  acquireFileLock,
  delayWithSignal,
  processTreeIsAlive,
  signalProcessTree,
  terminateProcessTree,
  withDeadline,
  writeJsonAtomicSync,
} from '../scripts/world-refresh-control.mjs';

test('withDeadline aborts the underlying operation', async () => {
  let observedAbort = false;
  await assert.rejects(
    withDeadline(
      async (signal) => {
        signal.addEventListener('abort', () => {
          observedAbort = true;
        });
        await delayWithSignal(5_000, signal);
      },
      25,
      { message: 'test deadline exceeded' },
    ),
    /test deadline exceeded/,
  );
  assert.equal(observedAbort, true);
});

test('file lock is single-flight and can be released', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world-refresh-lock-'));
  const lockPath = path.join(directory, 'refresh.lock');
  const first = acquireFileLock(lockPath, { runId: 'first' });
  const second = acquireFileLock(lockPath, { runId: 'second' });
  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(second.lock.run_id, 'first');
  first.release();
  const third = acquireFileLock(lockPath, { runId: 'third' });
  assert.equal(third.acquired, true);
  third.release();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('atomic JSON writes leave a complete document', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world-refresh-json-'));
  const filePath = path.join(directory, 'status.json');
  writeJsonAtomicSync(filePath, { state: 'running', value: 42 });
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { state: 'running', value: 42 });
  assert.deepEqual(fs.readdirSync(directory), ['status.json']);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('detached worker termination removes its descendant process group', { skip: process.platform === 'win32' }, async (t) => {
  const parent = spawn(
    process.execPath,
    [
      '-e',
      "const{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.send(child.pid);setInterval(()=>{},1000)",
    ],
    { detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  t.after(() => signalProcessTree(parent.pid, 'SIGKILL', { detached: true }));
  const descendantPid = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('descendant pid was not reported')), 2_000);
    parent.once('message', (value) => {
      clearTimeout(timer);
      resolve(Number(value));
    });
    parent.once('error', reject);
    parent.once('exit', (code, signal) => reject(new Error(`worker exited before reporting descendant pid: ${code ?? signal}`)));
  });
  assert.equal(processTreeIsAlive(parent.pid, { detached: true }), true);
  assert.equal(processTreeIsAlive(descendantPid, { detached: false }), true);
  const result = await terminateProcessTree(parent.pid, { detached: true, graceMs: 2_000 });
  assert.equal(result.ok, true);
  assert.equal(processTreeIsAlive(parent.pid, { detached: true }), false);
  assert.equal(processTreeIsAlive(descendantPid, { detached: false }), false);
});
