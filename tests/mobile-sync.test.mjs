import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubSync } from '../github-sync.mjs';
import { clone, documentOf } from '../core.mjs';

const fixture = answer => documentOf([{ id: 'company', name: '네이트', categories: [{ id: 'cat', name: '질문', questions: [{ id: 'q', question: '질문', answer, favorite: false, keywords: [] }] }] }]);
function harness(fetcher, options = {}) {
  let local = fixture('이전 답변'), base = clone(local);
  const messages = [];
  const sync = new GitHubSync({ getLocal: () => local, getBase: () => base, setBase: v => { base = clone(v); }, apply: v => { local = clone(v); }, resolve: async () => null, status: (...args) => messages.push(args), fetcher, ...options });
  return { sync, messages, local: () => local, base: () => base };
}
test('mobile API rate limit falls back to public data without credentials or writes', async () => {
  const calls = [];
  const h = harness(async (url, opts) => { calls.push({url, opts}); return url.includes('api.github.com') ? { ok: false, status: 403 } : { ok: true, json: async () => fixture('새 답변') }; });
  h.sync.connect('expired-test-token');
  assert.equal(await h.sync.sync(false), true);
  assert.equal(h.local().companies[0].categories[0].questions[0].answer, '새 답변');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].opts.headers, undefined);
  assert.equal(calls[1].opts.credentials, 'omit');
  assert.ok(calls.every(c => c.opts.method === 'GET'));
});
test('unsupported AbortSignal.timeout does not prevent syncing', async () => {
  const old = AbortSignal.timeout;
  AbortSignal.timeout = undefined;
  try {
    const h = harness(async () => ({ ok: true, json: async () => ({sha:'sha', content:Buffer.from(JSON.stringify(fixture('새 답변'))).toString('base64')}) }));
    assert.equal(await h.sync.sync(false), true);
  } finally { AbortSignal.timeout = old; }
});
test('fallback still reconciles local edits and does not replace them', async () => {
  const base = fixture('기준'), local = fixture('직접 수정'), remote = fixture('기준');
  remote.companies[0].categories[0].questions[0].keywords = ['새 키워드'];
  const h = harness(async url => url.includes('api.github.com') ? {ok:false,status:403} : {ok:true,json:async()=>remote}, {getBase:()=>base,getLocal:()=>local});
  assert.equal(await h.sync.sync(false), true);
  assert.equal(h.local().companies[0].categories[0].questions[0].answer, '직접 수정');
  assert.deepEqual(h.local().companies[0].categories[0].questions[0].keywords, ['새 키워드']);
});
test('failed fallback or invalid JSON keeps local data and baseline', async () => {
  for (const result of [{ok:false,status:503}, {ok:true,json:async()=>({bad:true})}]) {
    const h = harness(async url => url.includes('api.github.com') ? {ok:false,status:403} : result);
    const local = clone(h.local()), base = clone(h.base());
    assert.equal(await h.sync.sync(false), false);
    assert.deepEqual(h.local(), local); assert.deepEqual(h.base(), base);
    assert.equal(h.messages.at(-1)[0], 'error');
  }
});
test('write failures never fall back to a source without a commit SHA', async () => {
  const calls=[];
  const h=harness(async(url,opts)=>{calls.push({url,opts});return {ok:false,status:401};});
  h.sync.connect('test-token');
  assert.equal(await h.sync.sync(true),false);
  assert.equal(calls.length,1);
  assert.equal(h.local().companies[0].categories[0].questions[0].answer,'이전 답변');
});
