import { validate, documentOf, mergeDocuments, equal, clone } from './core.mjs?v=3';

export const REPO = 'kimminji-design/interview';
export const DATA_PATH = 'interview-data.json';
export const SEED_PATH = 'interview-data-backup-2026-09-07.json';
const ENDPOINT = `https://api.github.com/repos/${REPO}/contents/`;
const utf8encode = text => {
  let binary = ''; for (const b of new TextEncoder().encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
};
const utf8decode = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')), c => c.charCodeAt(0)));

export class GitHubSync {
  constructor({ getLocal, getBase, setBase, apply, resolve, status, fetcher = (...args) => globalThis.fetch(...args) }) {
    Object.assign(this, { getLocal, getBase, setBase, apply, resolve, status, fetcher });
    this.token = ''; this.busy = false;
  }
  connect(token) { this.token = token.trim(); }
  disconnect() { this.token = ''; }
  async request(method = 'GET', body, path = DATA_PATH) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await this.fetcher(ENDPOINT + path + (method === 'GET' ? '?ref=main' : ''), {
      method, headers, cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    if (response.status === 404 && method === 'GET' && path === DATA_PATH) return { missing: true };
    if (!response.ok) {
      const messages = { 401: 'GitHub 연결 키를 확인해주세요.', 403: '저장 권한 또는 API 사용 한도를 확인해주세요.', 404: '저장소나 데이터 파일을 읽을 수 없습니다.', 409: '다른 기기에서 먼저 저장했습니다. 다시 동기화해주세요.', 422: 'GitHub에서 저장을 거절했습니다. 권한과 최신 상태를 확인해주세요.' };
      throw new Error(messages[response.status] || `GitHub 연결 실패 (${response.status})`);
    }
    return response.json();
  }
  async reconcile(base, local, remote) {
    if (!base) {
      if (!local.companies.length || equal(local, remote)) return remote;
      return this.resolve(null, local, remote, [{ path: '첫 연결: 이 기기의 기존 데이터와 GitHub 데이터', local, remote }]);
    }
    const result = mergeDocuments(base, local, remote);
    return result.conflicts.length ? this.resolve(base, local, remote, result.conflicts) : result.data;
  }
  async sync(write = false) {
    if (this.busy) return false;
    this.busy = true; this.status('busy', '최신 내용 확인 중…');
    try {
      let response = await this.request();
      const missing = !!response.missing;
      if (missing) response = await this.request('GET', undefined, SEED_PATH);
      const remote = documentOf(validate(JSON.parse(utf8decode(response.content))).companies);
      const local = clone(this.getLocal());
      const merged = await this.reconcile(this.getBase(), local, remote);
      if (!merged) { this.status('pending', '선택을 취소했어요. 이 기기의 내용은 유지됩니다.'); return false; }
      validate(merged);
      // Any edit made while the initial selection dialog was open must survive.
      if (!equal(this.getLocal(), local)) { this.status('pending', '새 수정사항이 있어요. 다시 저장해주세요.'); return false; }
      this.setBase(remote);
      this.apply(merged);
      if (equal(merged, remote)) { this.status('saved', 'GitHub 최신 상태'); return true; }
      if (!write || !this.token) { this.status('pending', '이 기기에 저장됨 · GitHub 저장 대기'); return true; }
      this.status('busy', 'GitHub에 저장 중…');
      await this.request('PUT', {
        message: 'Update interview preparation data', branch: 'main', ...(missing ? {} : { sha: response.sha }),
        content: utf8encode(JSON.stringify(merged, null, 2) + '\n'),
      });
      // Changes made during the PUT are still local pending edits, not discarded.
      this.setBase(merged);
      this.status(equal(this.getLocal(), merged) ? 'saved' : 'pending', equal(this.getLocal(), merged) ? 'GitHub 저장 완료' : '새 수정사항 저장 대기');
      return true;
    } catch (error) {
      this.status('error', `${error.name === 'TimeoutError' ? '연결 시간이 초과됐어요.' : error.message} 수정본은 이 기기에 유지됩니다.`);
      return false;
    } finally { this.busy = false; }
  }
}
