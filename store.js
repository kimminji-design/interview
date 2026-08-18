// ============================================================
// 기업(company)별 독립 면접 데이터 저장소.
//
// localStorage 한 키(interviewCompanyData.v1)에 아래 구조의 JSON을 통째로 저장한다.
// 백엔드가 없는 정적 사이트이므로, 이 프로젝트에서 이미 쓰고 있던 localStorage를
// 그대로 "DB"로 사용한다.
//
// {
//   selectedCompanyId: "polarisoffice",
//   companies: [
//     {
//       id, name, createdAt,
//       categories: [
//         { id, name, questions: [
//           { id, question, answer, favorite, keywords: string[], subcategory }
//         ]}
//       ]
//     },
//     ...
//   ]
// }
//
// - favorite: 사용자가 풀버전에서 ★로 즐겨찾기한 질문인지. 요약버전/실전면접은
//   이 값이 true인 질문만 모아서 보여준다.
// - keywords: 사용자가 직접 입력/수정하는 핵심 키워드 배열(수동 입력). 답변을
//   기준으로 자동 추출하지 않는다 — 예전에 조사/어미를 벗겨낸 어절을 인접한
//   순서대로 이어붙이는 2-gram 방식으로 자동 생성했었는데, "커리어 초반엔",
//   "초반엔 FISM"처럼 의미 없는 조각이 나와서 폐기했다. 새 질문/마이그레이션
//   직후에는 빈 배열([])이고, 아코디언의 "🏷️ 키워드 수정" 버튼으로 채워나간다.
//
// 질문/카테고리 id는 이제 내용(텍스트) 기반 해시가 아니라 무작위 id를 쓴다.
// 질문 텍스트 자체를 사용자가 수정할 수 있게 됐기 때문에, id가 텍스트에
// 의존하면 질문을 고치는 순간 id가 바뀌어 즐겨찾기·수정 이력이 끊어진다.
// ============================================================

const COMPANY_STORE_KEY = 'interviewCompanyData.v1';
// 이전 버전(기업 개념이 없던 시절)에 사용자가 답변을 수정했다면 이 키에 남아있다.
// 마이그레이션 때 한 번만 읽어서 폴라리스오피스 시드에 반영하고, 이후로는 건드리지 않는다.
const LEGACY_OVERRIDES_KEY = 'interviewAnswerOverrides.v1';

function randomId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- 마이그레이션 전용: RAW_FULL(interview_full.txt)을 파싱해 "질문 하나당
// 객체 하나" 형태의 원본 스냅샷을 만든다. 예전 버전(store.js)에서 쓰던 로직
// 그대로이며, 이 파일에서는 buildPolarisOfficeSeed()가 최초 1회만 호출한다. ----

function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'q_' + (h >>> 0).toString(36);
}

// "마무리" 카테고리는 질문 1개로, "인사" 카테고리는 질문 1개로 줄이고
// 그 안에 있던 답변들을 모두 합친다 (예전 store.js의 consolidateClosingSections).
function consolidateClosingSections(categories) {
  const wrapCat = categories.find((c) => c.name === '마무리');
  if (wrapCat && wrapCat.questions.length > 0) {
    const parts = wrapCat.questions;
    wrapCat.questions = [
      {
        question: '궁금한 점이 있는지',
        keywords: parts.map((q) => q.keywords).filter(Boolean).join(' / '),
        answer: parts.map((q) => q.answer).filter(Boolean).join(' '),
        subcategory: null,
        isPseudo: false,
        starred: true,
      },
    ];
  }

  const insaCat = categories.find((c) => c.name === '인사');
  if (insaCat && insaCat.questions.length > 0) {
    const parts = insaCat.questions;
    insaCat.questions = [
      {
        question: '마지막으로 하고 싶은 말',
        keywords: parts.map((q) => q.keywords).filter(Boolean).join(' / '),
        answer: parts.map((q) => q.answer).filter(Boolean).join(' '),
        subcategory: null,
        isPseudo: false,
        starred: true,
      },
    ];
  }

  return categories;
}

function buildBaseQuestions() {
  const categories = parseInterviewText(RAW_FULL);
  consolidateClosingSections(categories);

  const list = [];
  for (const cat of categories) {
    for (const q of cat.questions) {
      const id = hashId(cat.name + '|' + (q.subcategory || '') + '|' + q.question);
      list.push({
        id,
        category: cat.name,
        subcategory: q.subcategory || null,
        question: q.question,
        fullAnswer: q.answer,
        summaryKeywords: q.keywords,
      });
    }
  }
  return list;
}

// interview_full.txt를 원본 그대로 파싱한 뒤(+ 예전 수정 이력을 반영해서)
// "폴라리스오피스" 기업의 초기 카테고리/질문 목록을 만든다. 마이그레이션 전용이며,
// 이후 기업 추가/복사에는 관여하지 않는다.
function buildPolarisOfficeSeed() {
  const base = buildBaseQuestions(); // parser.js + data.js(RAW_FULL) 기반, 기존 로직 그대로

  let legacyOverrides = {};
  try {
    const raw = localStorage.getItem(LEGACY_OVERRIDES_KEY);
    legacyOverrides = raw ? JSON.parse(raw) : {};
  } catch (e) {
    legacyOverrides = {};
  }

  const categoryMap = new Map();
  const categories = [];

  for (const q of base) {
    const override = legacyOverrides[q.id] || {};
    // 예전 override는 fullAnswer 필드에 사용자가 고친 답변을 담고 있었다.
    const answer = override.fullAnswer !== undefined ? override.fullAnswer : q.fullAnswer;

    let category = categoryMap.get(q.category);
    if (!category) {
      category = { id: randomId('cat'), name: q.category, questions: [] };
      categoryMap.set(q.category, category);
      categories.push(category);
    }

    category.questions.push({
      id: randomId('q'),
      question: q.question,
      answer,
      subcategory: q.subcategory || null,
      favorite: false, // 요구사항: 기존 데이터에 즐겨찾기 정보가 없으면 초기값 false
      keywords: [], // 자동 추출을 폐기했으므로 빈 배열로 시작 — "키워드 수정"으로 직접 채운다
    });
  }

  return categories;
}

function buildPolarisOfficeCompany() {
  return {
    id: 'polarisoffice',
    name: '폴라리스오피스',
    createdAt: Date.now(),
    categories: buildPolarisOfficeSeed(),
  };
}

// 기업 데이터를 완전히 새 id로 깊은 복사한다. 이후 복사본을 수정해도 원본이
// 영향받지 않도록 질문/카테고리 id를 전부 새로 발급한다. 즐겨찾기 상태는
// 기업별로 독립적으로 관리한다는 요구사항에 따라 false로 초기화한다.
function deepCloneCategories(categories) {
  return categories.map((cat) => ({
    id: randomId('cat'),
    name: cat.name,
    questions: cat.questions.map((q) => ({
      id: randomId('q'),
      question: q.question,
      answer: q.answer,
      subcategory: q.subcategory || null,
      favorite: false,
      keywords: Array.isArray(q.keywords) ? q.keywords.slice() : [],
    })),
  }));
}

function persistCompanyStore() {
  try {
    localStorage.setItem(COMPANY_STORE_KEY, JSON.stringify(companyStore));
  } catch (e) {
    // localStorage를 못 쓰는 환경이면 조용히 무시 (메모리 상태로만 동작)
  }
}

function loadCompanyStore() {
  try {
    const raw = localStorage.getItem(COMPANY_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.companies) && parsed.companies.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // 저장된 값이 깨져 있으면 새로 만든다
  }

  const polaris = buildPolarisOfficeCompany();
  return { selectedCompanyId: polaris.id, companies: [polaris] };
}

let companyStore = loadCompanyStore();
persistCompanyStore(); // 최초 마이그레이션 결과를 바로 저장해둔다

// ================= 조회 =================

function getCompanies() {
  return companyStore.companies;
}

function getCompanyById(id) {
  return companyStore.companies.find((c) => c.id === id) || null;
}

function getSelectedCompanyId() {
  return companyStore.selectedCompanyId;
}

function getCurrentCompany() {
  return getCompanyById(companyStore.selectedCompanyId);
}

function countCompanyQuestions(company) {
  return company.categories.reduce((sum, cat) => sum + cat.questions.length, 0);
}

// 카테고리 구조를 유지한 채로 반환 (렌더링에서 그대로 순회)
function getCurrentCompanyCategories() {
  const company = getCurrentCompany();
  return company ? company.categories : [];
}

// 카테고리 정보를 각 질문에 얹어서 평탄화한 배열. 이 배열의 항목을 직접 고쳐도
// 실제 저장소에는 반영되지 않으므로, 수정 시에는 반드시 아래 CRUD 함수를 통해야 한다.
function getCurrentCompanyFlatQuestions() {
  const company = getCurrentCompany();
  if (!company) return [];
  const flat = [];
  for (const cat of company.categories) {
    for (const q of cat.questions) {
      flat.push(Object.assign({ category: cat.name, categoryId: cat.id }, q));
    }
  }
  return flat;
}

// ================= 기업 CRUD =================

function selectCompany(id) {
  companyStore.selectedCompanyId = id;
  persistCompanyStore();
}

function addCompany(name, copyFromCompanyId) {
  const source = copyFromCompanyId ? getCompanyById(copyFromCompanyId) : null;
  const categories = source ? deepCloneCategories(source.categories) : [];
  const company = {
    id: randomId('company'),
    name,
    createdAt: Date.now(),
    categories,
  };
  companyStore.companies.push(company);
  persistCompanyStore();
  return company;
}

// 업로드한 텍스트 파일을 parseCompanyTextFile()(script.js)로 파싱한 결과
// { categories: [{ name, questions: [{question, answer, favorite}] }] } 를 받아
// 새 기업으로 저장한다. 요약버전은 즐겨찾기(favorite) 필터로만 걸러지고 답변
// 필드를 공유하는 구조라, 풀버전 답변을 별도로 복제해둘 필요가 없다.
function createCompanyFromParsedCategories(name, parsedCategories) {
  const categories = parsedCategories.map((cat) => ({
    id: randomId('cat'),
    name: cat.name,
    questions: cat.questions.map((q) => ({
      id: randomId('q'),
      question: q.question,
      answer: q.answer,
      subcategory: null,
      favorite: !!q.favorite,
      keywords: [], // 업로드 파일에는 keywords 개념이 없음 — "키워드 수정"으로 직접 채운다
    })),
  }));

  const company = {
    id: randomId('company'),
    name,
    createdAt: Date.now(),
    categories,
  };
  companyStore.companies.push(company);
  persistCompanyStore();
  return company;
}

function deleteCompany(id) {
  companyStore.companies = companyStore.companies.filter((c) => c.id !== id);
  if (companyStore.selectedCompanyId === id) {
    companyStore.selectedCompanyId = companyStore.companies.length > 0 ? companyStore.companies[0].id : null;
  }
  persistCompanyStore();
}

// ================= 질문/카테고리 CRUD (현재 선택된 기업 기준) =================

function findQuestionLocation(questionId) {
  const company = getCurrentCompany();
  if (!company) return null;
  for (const category of company.categories) {
    const question = category.questions.find((q) => q.id === questionId);
    if (question) return { company, category, question };
  }
  return null;
}

// categoryName이 이미 있는 카테고리면 거기에 추가하고, 없으면 새 카테고리를 만든다.
// (요구사항 7의 "카테고리 추가 + 질문 추가"를 하나의 입력 흐름으로 처리)
function addQuestion(categoryName, question, answer) {
  const company = getCurrentCompany();
  if (!company) return null;

  let category = company.categories.find((c) => c.name === categoryName);
  if (!category) {
    category = { id: randomId('cat'), name: categoryName, questions: [] };
    company.categories.push(category);
  }

  const q = {
    id: randomId('q'),
    question,
    answer,
    subcategory: null,
    favorite: false,
    keywords: [],
  };
  category.questions.push(q);
  persistCompanyStore();
  return q;
}

// question/answer 중 넘어온 필드만 갱신한다. keywords는 더 이상 답변에서 자동으로
// 다시 만들지 않는다 — 사용자가 "키워드 수정"으로 직접 관리한다(updateQuestionKeywords).
function updateQuestion(questionId, { question, answer }) {
  const loc = findQuestionLocation(questionId);
  if (!loc) return null;
  if (question !== undefined) loc.question.question = question;
  if (answer !== undefined) loc.question.answer = answer;
  persistCompanyStore();
  return loc.question;
}

// keywords: string[] — 전체를 통째로 교체한다.
function updateQuestionKeywords(questionId, keywords) {
  const loc = findQuestionLocation(questionId);
  if (!loc) return null;
  loc.question.keywords = Array.isArray(keywords) ? keywords.slice() : [];
  persistCompanyStore();
  return loc.question;
}

function toggleFavorite(questionId) {
  const loc = findQuestionLocation(questionId);
  if (!loc) return null;
  loc.question.favorite = !loc.question.favorite;
  persistCompanyStore();
  return loc.question;
}

function deleteQuestion(questionId) {
  const company = getCurrentCompany();
  if (!company) return;
  for (const category of company.categories) {
    const idx = category.questions.findIndex((q) => q.id === questionId);
    if (idx !== -1) {
      category.questions.splice(idx, 1);
      persistCompanyStore();
      return;
    }
  }
}

// 삭제 모드에서 체크박스로 여러 개를 골라 한 번에 지울 때 사용한다.
function deleteQuestions(questionIds) {
  const company = getCurrentCompany();
  if (!company) return;
  const idSet = new Set(questionIds);
  for (const category of company.categories) {
    category.questions = category.questions.filter((q) => !idSet.has(q.id));
  }
  persistCompanyStore();
}
