export const clone = value => JSON.parse(JSON.stringify(value));
export const uid = prefix => `${prefix}_${crypto.randomUUID()}`;
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const count = company => company.categories.reduce((n, c) => n + c.questions.length, 0);
export const flat = company => company.categories.flatMap(c => c.questions.map(q => ({ ...q, categoryId: c.id, categoryName: c.name })));

// Validate the entire document before making any mutation. Preserve unknown fields.
export function validate(input) {
  if (!input || !Array.isArray(input.companies)) throw new Error('기업 목록이 있는 면접 JSON 파일을 선택해주세요.');
  const data = clone(input), ids = new Set();
  function checkId(obj, scope) {
    if (typeof obj.id !== 'string' || !obj.id || scope.has(obj.id)) throw new Error('누락되거나 중복된 ID가 있습니다. 원본 파일을 확인해주세요.');
    scope.add(obj.id);
  }
  for (const company of data.companies) {
    checkId(company, ids);
    if (typeof company.name !== 'string' || !company.name.trim() || !Array.isArray(company.categories)) throw new Error('기업 이름 또는 카테고리 형식이 올바르지 않습니다.');
    const cats = new Set(), questions = new Set();
    for (const cat of company.categories) {
      checkId(cat, cats);
      if (typeof cat.name !== 'string' || !Array.isArray(cat.questions)) throw new Error('카테고리 형식이 올바르지 않습니다.');
      for (const q of cat.questions) {
        checkId(q, questions);
        if (typeof q.question !== 'string' || typeof q.answer !== 'string') throw new Error('질문과 답변은 텍스트여야 합니다.');
        if (q.keywords != null && (!Array.isArray(q.keywords) || q.keywords.some(x => typeof x !== 'string'))) throw new Error('키워드 형식이 올바르지 않습니다.');
        q.keywords ??= [];
        q.favorite = !!q.favorite;
      }
    }
  }
  return data;
}

export function documentOf(companies) { return { schemaVersion: 2, companies: clone(companies) }; }
export function newCompany(name, source, ids, questionsOnly = false) {
  return { id: uid('company'), name: name.trim(), createdAt: Date.now(), categories: source ? source.categories.map(cat => ({
    ...clone(cat), id: uid('cat'), questions: cat.questions.filter(q => !ids || ids.has(q.id)).map(q => ({
      ...clone(q), id: uid('q'), favorite: false, status: 'draft',
      ...(questionsOnly ? { answer: '', keywords: [] } : {}),
    })),
  })).filter(c => c.questions.length) : [] };
}

// Three-way merge by stable IDs, including deletions and independent ordering.
// Unresolved conflicts retain both values; callers must ask the user before writing.
export function mergeDocuments(base, local, remote, choices = {}) {
  const conflicts = [];
  const copy = v => v === undefined ? undefined : clone(v);
  function conflict(b, l, r, path) {
    if (choices[path]) return copy(choices[path] === 'local' ? l : r);
    conflicts.push({ path, local: copy(l), remote: copy(r) });
    return copy(l);
  }
  function walk(b, l, r, path) {
    if (equal(l, r)) return copy(l);
    if (equal(b, l)) return copy(r);
    if (equal(b, r)) return copy(l);
    if (l === undefined || r === undefined || b === undefined) return conflict(b, l, r, path);
    if (Array.isArray(l) && Array.isArray(r) && Array.isArray(b)) {
      const keyed = a => a.every(x => x && typeof x === 'object' && typeof x.id === 'string');
      if (!keyed(b) || !keyed(l) || !keyed(r)) return conflict(b, l, r, path);
      const bm = new Map(b.map(x => [x.id, x])), lm = new Map(l.map(x => [x.id, x])), rm = new Map(r.map(x => [x.id, x]));
      const keys = [...new Set([...b, ...l, ...r].map(x => x.id))];
      const merged = new Map(keys.map(id => [id, walk(bm.get(id), lm.get(id), rm.get(id), `${path}/${id}`)]).filter(([, v]) => v !== undefined));
      const common = b.map(x => x.id).filter(id => lm.has(id) && rm.has(id) && merged.has(id));
      const bo = common, lo = l.map(x => x.id).filter(id => common.includes(id)), ro = r.map(x => x.id).filter(id => common.includes(id));
      let order = l.map(x => x.id);
      if (equal(lo, bo)) order = r.map(x => x.id);
      else if (!equal(ro, bo) && !equal(lo, ro)) order = conflict(bo, l.map(x => x.id), r.map(x => x.id), `${path}/순서`);
      // Insert additions from the other side next to their nearest preceding item.
      for (const sequence of [l, r]) sequence.forEach((x, i) => {
        if (!order.includes(x.id) && merged.has(x.id)) {
          const prev = sequence.slice(0, i).reverse().find(y => order.includes(y.id));
          order.splice(prev ? order.indexOf(prev.id) + 1 : 0, 0, x.id);
        }
      });
      return order.filter(id => merged.has(id)).map(id => merged.get(id));
    }
    if (b && l && r && typeof b === 'object' && typeof l === 'object' && typeof r === 'object' && !Array.isArray(l) && !Array.isArray(r)) {
      const result = {};
      for (const key of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
        const value = walk(b[key], l[key], r[key], `${path}/${key}`);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    return conflict(b, l, r, path);
  }
  return { data: walk(base, local, remote, ''), conflicts };
}

export function move(array, id, offset) {
  const index = array.findIndex(x => x.id === id), next = index + offset;
  if (index < 0 || next < 0 || next >= array.length) return false;
  [array[index], array[next]] = [array[next], array[index]];
  return true;
}

// Local phrase suggestions, not AI or a claim of semantic summarization.
// Never replace existing user-written keywords automatically.
export function suggestKeywords(answer) {
  const terms = ['정보 위계', '정보 구조', '사용자 흐름', '디자인 시스템', '디자인시스템', '공통 기준', '라이브러리', '컴포넌트', '프로토타입', '인터랙션', '퍼블리셔', '이해관계자', '사용자 데이터', '사용자 리서치', '피드백', '요구사항', '우선순위', '일관성', '협업', '조율', '운영', 'AI', 'Figma', 'ProtoPie'];
  const text = answer.replace(/[\s\u2028]+/g, ' ').trim();
  const found = terms.map(term => ({ term, pos: text.toLowerCase().indexOf(term.toLowerCase()) })).filter(x => x.pos >= 0).sort((a,b) => a.pos-b.pos).map(x => x.term);
  const numbers = text.match(/\d+(?:~\d+)?\s*(?:년|개월|개|종|일|주|회)/g) || [];
  const quoted = [...text.matchAll(/[‘“「]([^’”」]{2,40})[’”」]/g)].map(m => m[1]);
  return [...new Set([...quoted, ...found, ...numbers])].slice(0, 10);
}

export function parseBulk(text) {
  const categories = []; let cat, q;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (/^##?\s+/.test(line)) { cat = { id: uid('cat'), name: line.replace(/^##?\s+/, ''), questions: [] }; categories.push(cat); q = null; }
    else if (/^(?:⭐\s*)?Q[.：:]\s*/i.test(line)) {
      if (!cat) { cat = { id: uid('cat'), name: '기본 질문', questions: [] }; categories.push(cat); }
      q = { id: uid('q'), question: line.replace(/^(?:⭐\s*)?Q[.：:]\s*/i, ''), answer: '', favorite: line.startsWith('⭐'), keywords: [], status: 'draft' }; cat.questions.push(q);
    } else if (q) {
      if (/^키워드[:：]/.test(line)) q.keywords = line.replace(/^키워드[:：]\s*/, '').split(/→|,|\|/).map(x => x.trim()).filter(Boolean);
      else q.answer += (q.answer ? '\n' : '') + raw.replace(/^(?:A[.：:]|내용[:：])\s*/i, '');
    }
  }
  for (const c of categories) for (const q of c.questions) q.answer = q.answer.trim();
  if (!categories.some(c => c.questions.length)) throw new Error('Q. 로 시작하는 질문을 넣어주세요.');
  return categories.filter(c => c.questions.length);
}
