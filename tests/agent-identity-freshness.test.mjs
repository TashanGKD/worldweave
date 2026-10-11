import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function moduleAt(path){const source=readFileSync(new URL(path,import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const {resolveVoteIdentity}=await moduleAt('../src/lib/agent-identity.ts');
const {signalFreshness}=await moduleAt('../src/lib/signal-freshness.ts');
test('authenticated vote identity ignores a spoofed caller label',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(JSON.stringify({agent_uid:'agent-owner',display_name:'Owner',identity_verified:true,scopes:['read','world:vote']}));
 const identity=await resolveVoteIdentity(new Request('https://world.test',{headers:{Authorization:'Bearer credential'}}),'victim');
 assert.equal(identity.xia_id,'agent-owner');assert.equal(identity.identity_verified,true);
 globalThis.fetch=async()=>new Response(JSON.stringify({agent_uid:'agent-owner',identity_verified:true,scopes:['read']}));
 await assert.rejects(()=>resolveVoteIdentity(new Request('https://world.test',{headers:{Authorization:'Bearer credential'}}),'victim'),/permission/);
 }finally{globalThis.fetch=original;}
});
test('anonymous labels cannot occupy a verified identity namespace',async()=>{
 const identity=await resolveVoteIdentity(new Request('https://world.test'),'agent-owner');
 assert.equal(identity.xia_id,'anonymous:agent-owner');assert.equal(identity.identity_verified,false);
});
test('recent cache generation never conceals stale source content',()=>{
 const now=Date.parse('2026-10-11T12:00:00Z');
 const status=signalFreshness(['2026-10-08T12:00:00Z'],'2026-10-11T11:59:00Z',now);
 assert.equal(status.content_age_hours,72);assert.equal(status.freshness_status,'stale');assert.equal(status.source_fetch_status,'unknown');
 assert.equal(signalFreshness(['invalid','2027-01-01T00:00:00Z'],null,now).freshness_status,'unknown');
});
const {reserveVoteReceipt,completeVoteReceipt}=await moduleAt('../src/lib/world/vote-receipts.ts');
test('vote receipts prevent duplicate work and reject changed inputs',async()=>{
 const fs=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vote-receipt-'));
 try{
 const first=await reserveVoteReceipt(directory,'agent-one','request-key-001',{side:'yes',question:'one'});assert.equal(first.created,true);
 const pending=await reserveVoteReceipt(directory,'agent-one','request-key-001',{question:'one',side:'yes'});assert.equal(pending.created,false);assert.equal(pending.vote,undefined);
 await completeVoteReceipt(first,{vote_id:'vote-one'});
 const replay=await reserveVoteReceipt(directory,'agent-one','request-key-001',{side:'yes',question:'one'});assert.equal(replay.vote.vote_id,'vote-one');
 await assert.rejects(()=>reserveVoteReceipt(directory,'agent-one','request-key-001',{side:'no',question:'one'}),/idempotency_conflict/);
 assert.equal((await reserveVoteReceipt(directory,'agent-two','request-key-001',{side:'yes',question:'one'})).created,true);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
