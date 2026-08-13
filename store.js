// interview_full.txt 하나를 유일한 소스로 삼아 "질문 하나당 객체 하나" 형태의
// 통합 데이터를 만든다. 각 객체는 { id, category, subcategory, question,
// fullAnswer, summaryKeywords, starred } 형태를 갖는다.
//  - fullAnswer      : 풀버전에서 보여줄 전체 답변 문장
//  - summaryKeywords : 요약버전 / 실전 면접에서 보여줄 핵심 키워드 요약
//  - starred         : 원본 문서에서 ⭐⭐로 표시된 핵심 질문인지 (요약버전 노출 대상)
//
// 여기서 만든 BASE_QUESTIONS는 원본 스냅샷이고, 실제 화면에는 localStorage에
// 저장된 수정 내역(overrides)을 얹은 getEditedQuestions() 결과를 사용한다.

function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'q_' + (h >>> 0).toString(36);
}

// "마무리" 카테고리는 질문 1개("궁금한 점이 있는지")로, "인사" 카테고리는
// 질문 1개("마지막으로 하고 싶은 말")로 줄이고, 그 안에 있던 답변들을 모두 합친다.
function consolidateClosingSections(categories) {
  const wrapCat = categories.find((c) => c.name === '마무리');
  if (wrapCat && wrapCat.questions.length > 0) {
    const parts = wrapCat.questions;
    const mergedAnswer = parts
      .map((q) => q.answer)
      .filter(Boolean)
      .join(' ');
    const mergedKeywords = parts
      .map((q) => q.keywords)
      .filter(Boolean)
      .join(' / ');

    wrapCat.questions = [
      {
        question: '궁금한 점이 있는지',
        keywords: mergedKeywords,
        answer: mergedAnswer,
        subcategory: null,
        isPseudo: false,
        starred: true,
      },
    ];
  }

  const insaCat = categories.find((c) => c.name === '인사');
  if (insaCat && insaCat.questions.length > 0) {
    const parts = insaCat.questions;
    const mergedAnswer = parts
      .map((q) => q.answer)
      .filter(Boolean)
      .join(' ');
    const mergedKeywords = parts
      .map((q) => q.keywords)
      .filter(Boolean)
      .join(' / ');

    insaCat.questions = [
      {
        question: '마지막으로 하고 싶은 말',
        keywords: mergedKeywords,
        answer: mergedAnswer,
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
        starred: !!q.starred,
      });
    }
  }
  return list;
}

const BASE_QUESTIONS = buildBaseQuestions();

// ================= 수정 내역 (localStorage) =================
const ANSWER_OVERRIDES_KEY = 'interviewAnswerOverrides.v1';

function loadOverrides() {
  try {
    const raw = localStorage.getItem(ANSWER_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveOverrides(overrides) {
  try {
    localStorage.setItem(ANSWER_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    // localStorage를 못 쓰는 환경이면 조용히 무시 (메모리 상태로만 동작)
  }
}

let questionOverrides = loadOverrides();

function findBaseQuestion(id) {
  return BASE_QUESTIONS.find((q) => q.id === id) || null;
}

// 원본 + 수정 내역을 합친 "현재 보여줄" 질문 목록
function getEditedQuestions() {
  return BASE_QUESTIONS.map((q) => {
    const ov = questionOverrides[q.id];
    return ov ? Object.assign({}, q, ov) : q;
  });
}

function hasOverride(id, field) {
  return !!(questionOverrides[id] && Object.prototype.hasOwnProperty.call(questionOverrides[id], field));
}

// field: 'fullAnswer' | 'summaryKeywords'
function setQuestionOverride(id, field, value) {
  const base = findBaseQuestion(id);
  if (!base) return;

  const entry = Object.assign({}, questionOverrides[id]);
  if (value === base[field]) {
    // 원본과 똑같아졌으면 굳이 오버라이드로 남겨두지 않는다.
    delete entry[field];
  } else {
    entry[field] = value;
  }

  if (Object.keys(entry).length === 0) {
    delete questionOverrides[id];
  } else {
    questionOverrides[id] = entry;
  }
  saveOverrides(questionOverrides);
}

function clearQuestionOverrideField(id, field) {
  if (!questionOverrides[id]) return;
  delete questionOverrides[id][field];
  if (Object.keys(questionOverrides[id]).length === 0) {
    delete questionOverrides[id];
  }
  saveOverrides(questionOverrides);
}
