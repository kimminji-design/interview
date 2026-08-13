// 화면 전환 + 아코디언 렌더링 + 랜덤 순서 로직

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const gateView = document.getElementById('gate-view');
const gateForm = document.getElementById('gate-form');
const gateInput = document.getElementById('gate-input');
const gateError = document.getElementById('gate-error');

const landingView = document.getElementById('landing-view');
const listView = document.getElementById('list-view');
const liveView = document.getElementById('live-view');
const listTitle = document.getElementById('list-title');
const accordionRoot = document.getElementById('accordion-root');

// ================= 비밀번호 확인 =================
// 클라이언트 사이드 정적 페이지라 완전한 보안은 아니지만, 아무나 바로 들어오지
// 못하도록 첫 진입 시 비밀번호를 확인한다. 같은 브라우저 탭에서 한 번 맞히면
// 새로고침해도 다시 묻지 않도록 세션 동안만 기억한다.
const GATE_PASSCODE = '1303';
const GATE_SESSION_KEY = 'interviewGateUnlocked';

if (sessionStorage.getItem(GATE_SESSION_KEY) === '1') {
  unlockGate();
}

gateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (gateInput.value.trim() === GATE_PASSCODE) {
    sessionStorage.setItem(GATE_SESSION_KEY, '1');
    gateError.hidden = true;
    unlockGate();
  } else {
    gateError.hidden = false;
    gateInput.value = '';
    gateInput.focus();
    gateForm.classList.remove('shake');
    // eslint-disable-next-line no-unused-expressions
    gateForm.offsetWidth; // 애니메이션 재실행을 위한 리플로우 강제
    gateForm.classList.add('shake');
  }
});

function unlockGate() {
  gateView.classList.remove('active');
  landingView.classList.add('active');
}

document.getElementById('btn-full').addEventListener('click', () => openList('full'));
document.getElementById('btn-summary').addEventListener('click', () => openList('summary'));
document.getElementById('btn-back').addEventListener('click', showLanding);

function showLanding() {
  listView.classList.remove('active');
  liveView.classList.remove('active');
  landingView.classList.add('active');
  accordionRoot.innerHTML = '';
}

// ================= 핀 고정 질문 선별 (비파괴적) =================
// "1분 자기소개"는 항상 맨 앞, 그 다음 5개(성격/강점/약점/협업갈등/지원동기)는
// 매번 순서를 섞어서 앞쪽에 배치한다. 원본 배열은 건드리지 않고 id만 골라낸다.
const INTRO_PATTERNS = [(q) => q.question.includes('1분') && q.question.includes('자기소개')];
const SPECIAL_SLOTS = [
  { patterns: [(q) => q.question.includes('성격') && q.question.includes('장') && q.question.includes('단')] },
  { patterns: [(q) => q.question.includes('강점')] },
  { patterns: [(q) => q.question.includes('약점')] },
  {
    patterns: [
      (q) => q.question.includes('개발자') && q.question.includes('충돌'),
      (q) => q.question.includes('충돌') && q.question.includes('경험'),
      (q) => q.question.includes('갈등') && q.question.includes('경험'),
    ],
  },
  { patterns: [(q) => q.question.includes('이직') && q.question.includes('이유')] },
];

function pickPinned(questions) {
  const used = new Set();
  function findFirst(patterns) {
    for (const pattern of patterns) {
      const found = questions.find((q) => !used.has(q.id) && pattern(q));
      if (found) {
        used.add(found.id);
        return found;
      }
    }
    return null;
  }
  const intro = findFirst(INTRO_PATTERNS);
  const specials = SPECIAL_SLOTS.map((slot) => findFirst(slot.patterns)).filter(Boolean);
  return { intro, specials, usedIds: used };
}

function openList(mode) {
  const questions = getEditedQuestions().filter((q) => mode === 'full' || q.starred);
  listTitle.textContent = mode === 'full' ? '풀버전 연습' : '요약버전 연습';

  const { intro, specials, usedIds } = pickPinned(questions);
  const pinned = [];
  if (intro) pinned.push(intro);
  pinned.push(...shuffle(specials));

  // 카테고리 순서는 데이터에 등장하는 원래 순서를 그대로 유지한다 (랜덤 셔플 없음).
  const categoryOrder = [];
  const categoryMap = new Map();
  for (const q of questions) {
    if (usedIds.has(q.id)) continue;
    let bucket = categoryMap.get(q.category);
    if (!bucket) {
      bucket = { name: q.category, questions: [] };
      categoryMap.set(q.category, bucket);
      categoryOrder.push(bucket);
    }
    bucket.questions.push(q);
  }

  renderAccordion(pinned, categoryOrder, mode);

  landingView.classList.remove('active');
  liveView.classList.remove('active');
  listView.classList.add('active');
  window.scrollTo(0, 0);
}

function renderAccordion(pinned, categories, mode) {
  accordionRoot.innerHTML = '';

  if (pinned.length > 0) {
    accordionRoot.appendChild(buildCategorySection('🎯 필수 준비 질문', pinned, true, mode));
  }

  for (const cat of categories) {
    accordionRoot.appendChild(buildCategorySection(cat.name, cat.questions, false, mode));
  }
}

function buildCategorySection(title, questions, pinnedStyle, mode) {
  const section = document.createElement('section');
  section.className = 'category' + (pinnedStyle ? ' category--pinned' : '');

  const heading = document.createElement('h2');
  heading.className = 'category__title';
  heading.textContent = title;
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'qa-list';

  let lastSub = null;
  for (const q of questions) {
    if (q.subcategory && q.subcategory !== lastSub) {
      const subEl = document.createElement('div');
      subEl.className = 'subcategory-label';
      subEl.textContent = q.subcategory;
      list.appendChild(subEl);
      lastSub = q.subcategory;
    } else if (!q.subcategory) {
      lastSub = null;
    }
    list.appendChild(buildQAItem(q, mode));
  }

  section.appendChild(list);
  return section;
}

// mode: 'full' → fullAnswer가 본문(+summaryKeywords는 참고용 태그), 수정 대상은 fullAnswer
// mode: 'summary' → summaryKeywords만 본문으로 보여주고, 수정 대상도 summaryKeywords
function buildQAItem(q, mode) {
  const field = mode === 'full' ? 'fullAnswer' : 'summaryKeywords';

  const item = document.createElement('div');
  item.className = 'qa-item';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'qa-question';
  btn.setAttribute('aria-expanded', 'false');

  const qText = document.createElement('span');
  qText.className = 'qa-question__text';
  const qTextLabel = document.createElement('span');
  qTextLabel.textContent = q.question;
  qText.appendChild(qTextLabel);

  const arrow = document.createElement('span');
  arrow.className = 'qa-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '▾';

  btn.appendChild(qText);
  btn.appendChild(arrow);

  const panel = document.createElement('div');
  panel.className = 'qa-answer';

  const inner = document.createElement('div');
  inner.className = 'qa-answer__inner';

  // 풀버전에서는 요약 키워드를 참고 태그로 위에 살짝 보여주고, 본문은 fullAnswer.
  // 요약버전에서는 summaryKeywords 자체가 본문이라 별도 태그 없이 한 번만 보여준다.
  let keywordsEl = null;
  if (mode === 'full' && q.summaryKeywords) {
    keywordsEl = document.createElement('p');
    keywordsEl.className = 'qa-keywords';
    keywordsEl.textContent = q.summaryKeywords;
    inner.appendChild(keywordsEl);
  }

  const bodyEl = document.createElement('p');
  bodyEl.className = mode === 'full' ? 'qa-answer-text' : 'qa-keywords';
  bodyEl.textContent = q[field] || '';
  bodyEl.hidden = !q[field];
  inner.appendChild(bodyEl);

  const actions = document.createElement('div');
  actions.className = 'qa-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'qa-action-btn qa-action-btn--edit';
  editBtn.textContent = '✏️ 수정';

  const revertBtn = document.createElement('button');
  revertBtn.type = 'button';
  revertBtn.className = 'qa-action-btn qa-action-btn--revert';
  revertBtn.textContent = '↺ 원본으로 되돌리기';

  actions.appendChild(editBtn);
  actions.appendChild(revertBtn);
  inner.appendChild(actions);

  const editBox = document.createElement('div');
  editBox.className = 'qa-edit-box';
  editBox.hidden = true;

  const textarea = document.createElement('textarea');
  textarea.className = 'qa-edit-textarea';

  const editButtons = document.createElement('div');
  editButtons.className = 'qa-edit-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'qa-cancel-btn';
  cancelBtn.textContent = '취소';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'qa-save-btn';
  saveBtn.textContent = '저장';

  editButtons.appendChild(cancelBtn);
  editButtons.appendChild(saveBtn);
  editBox.appendChild(textarea);
  editBox.appendChild(editButtons);
  inner.appendChild(editBox);

  panel.appendChild(inner);

  function syncEditedState() {
    const edited = hasOverride(q.id, field);
    revertBtn.style.display = edited ? '' : 'none';
    let dot = qText.querySelector('.qa-edited-dot');
    if (edited && !dot) {
      dot = document.createElement('span');
      dot.className = 'qa-edited-dot';
      dot.title = '수정된 답변';
      qText.appendChild(dot);
    } else if (!edited && dot) {
      dot.remove();
    }
  }

  function enterEditMode(e) {
    e.stopPropagation();
    textarea.value = bodyEl.textContent;
    bodyEl.hidden = true;
    if (keywordsEl) keywordsEl.hidden = true;
    actions.hidden = true;
    editBox.hidden = false;
    textarea.focus();
  }

  function exitEditMode() {
    editBox.hidden = true;
    actions.hidden = false;
    bodyEl.hidden = !bodyEl.textContent;
    if (keywordsEl) keywordsEl.hidden = false;
  }

  editBtn.addEventListener('click', enterEditMode);

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exitEditMode();
  });

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const value = textarea.value.trim();
    setQuestionOverride(q.id, field, value);
    q[field] = value;
    bodyEl.textContent = value;
    exitEditMode();
    syncEditedState();
  });

  revertBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearQuestionOverrideField(q.id, field);
    const base = findBaseQuestion(q.id);
    const original = base ? base[field] : '';
    q[field] = original;
    bodyEl.textContent = original || '';
    bodyEl.hidden = !original;
    syncEditedState();
  });

  syncEditedState();

  btn.addEventListener('click', () => {
    const isOpen = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  item.appendChild(btn);
  item.appendChild(panel);
  return item;
}

// 실전 면접 화면에는 데이터에 저장된 명사형 질문 라벨(예: "이직하는 이유")을
// 그대로 쓰지 않고, 면접관이 실제로 말하는 듯한 구어체 질문으로 바꿔서 보여준다.
// 학습 모드(아코디언)의 질문 표기는 원본 그대로 유지하므로 여기서만 사용한다.
const LIVE_QUESTION_PHRASING = {
  '본인의 가장 큰 강점은 무엇인가': '본인의 가장 큰 강점은 무엇인가요?',
  '본인의 약점이나 보완이 필요한 부분은 무엇인가': '본인의 약점이나 보완이 필요한 부분은 무엇인가요?',
  '이직하는 이유': '이직하려는 이유는 무엇인가요?',
  '데이터 기반 디자인 경험이 상대적으로 부족한데, 프로덕트 디자이너 역할을 잘할 수 있나':
    '데이터 기반 디자인 경험이 상대적으로 부족하신 것 같은데, 프로덕트 디자이너 역할을 잘 해내실 수 있을까요?',
  '성격의 장단점': '본인 성격의 장단점을 말씀해주세요.',
  '포트폴리오에서 가장 자신 있는 프로젝트는 무엇인가': '포트폴리오에서 가장 자신 있는 프로젝트는 무엇인가요?',
  '가장 아쉬웠던 프로젝트는 무엇인가 / 실패했다고 생각하는 경험 / 잘못 판단했던 경험 / 부족했던 경험이 있나':
    '가장 아쉬웠던 프로젝트, 혹은 실패했다고 생각하는 경험이 있다면 말씀해주세요.',
  '개발자와 디자인 구현 방식이 충돌했던 경험은?': '개발자와 디자인 구현 방식이 충돌했던 경험이 있으신가요?',
  '왜 폴라리스오피스인가': '폴라리스오피스를 선택하신 이유가 무엇인가요?',
  '폴라리스오피스를 직접 사용해봤나': '폴라리스오피스를 직접 사용해보셨나요?',
  '사용하면서 가장 좋았던 기능은 무엇인가': '사용하시면서 가장 좋았던 기능은 무엇인가요?',
  '가장 불편했던 부분 / 본인이라면 가장 먼저 개선하고 싶은 것':
    '가장 불편했던 부분이나, 본인이라면 가장 먼저 개선하고 싶은 점을 말씀해주세요.',
  '왜 Core → Sub → Nudge 구조를 만들었나': 'Core → Sub → Nudge 구조는 왜 만드셨나요?',
  'Core / Sub / Nudge를 각각 어떻게 정의했나': 'Core, Sub, Nudge는 각각 어떻게 정의하셨나요?',
  '각 그룹사가 자기 서비스를 더 보여달라고 하면 어떻게 설득했나':
    '각 그룹사가 자기 서비스를 더 보여달라고 요청하면 어떻게 설득하셨나요?',
  '실제 사용자 테스트 없이 학습 효과가 있다고 말할 수 있나': '실제 사용자 테스트 없이도 학습 효과가 있다고 말씀하실 수 있나요?',
  '현재 업무에서 AI를 얼마나·어떻게 활용하고 있나': '현재 업무에서 AI를 얼마나, 어떻게 활용하고 계신가요?',
  '입사 후 폴라리스오피스 업무에 AI를 어떻게 활용해보고 싶은가':
    '입사 후에는 폴라리스오피스 업무에 AI를 어떻게 활용해보고 싶으신가요?',
  MBTI: 'MBTI가 어떻게 되세요?',
  '스트레스는 어떻게 해소하나': '스트레스는 어떻게 해소하시나요?',
  '어떤 디자이너가 되고 싶은가 (최종)': '앞으로 어떤 디자이너가 되고 싶으신가요?',
  연봉: '희망하시는 연봉을 말씀해주세요.',
  '입사 가능 시점': '입사 가능하신 시점이 언제쯤인가요?',
  // "마무리" 카테고리는 "궁금한 점이 있는지" 하나로, "인사" 카테고리는
  // "마지막으로 하고 싶은 말" 하나로 통합되어 있다 (store.js의 consolidateClosingSections).
  '궁금한 점이 있는지': '그 밖에 저희에게 궁금하신 점이 있다면 편하게 말씀해주세요.',
  '마지막으로 하고 싶은 말': '마지막으로 하고 싶은 말씀이 있다면 해주세요.',
};

function toSpokenQuestion(text) {
  if (LIVE_QUESTION_PHRASING[text]) return LIVE_QUESTION_PHRASING[text];
  const trimmed = text.trim();
  // 매핑에 없는 질문이 추가되더라도 최소한 자연스러운 구어체 종결형으로 보이도록 하는 보정.
  if (/[?？]$/.test(trimmed)) return trimmed;
  if (/(나요|가요|까요|세요|주세요|습니다|니다)$/.test(trimmed)) return trimmed;
  return trimmed + '에 대해 말씀해주세요.';
}

// ================= 실전 면접 모드 =================
// "1분 자기소개"는 항상 맨 처음 질문으로 고정하고, 그 이후 질문들은 실제 면접에서
// 자연스러운 큰 흐름(지원동기 → 직무/경험 → 프로젝트·포트폴리오 → 문제해결/역량 →
// 폴라리스오피스 정합성 → 처우·컬처핏 → 마무리) 순서의 "구간(스테이지)"으로 먼저
// 묶은 뒤, 각 구간 내부에서만 순서를 섞는 준랜덤 방식을 사용한다. 요약 키워드
// (starred=true인 핵심 질문)만 대상으로 하며, 매번 세부 순서는 달라지지만 완전
// 무작위로 인한 흐름 붕괴는 피할 수 있다.
const LIVE_STAGE_MATCHERS = [
  (q) => q.question.includes('이직') && q.question.includes('이유'),
  (q) => q.category.includes('자기소개'),
  (q) => q.category.includes('포트폴리오') || q.category.includes('우리WON뱅킹'),
  (q) => q.category.includes('협업') || q.category.includes('AI Heuristic'),
  (q) => q.category.includes('폴라리스오피스 적합성'),
  (q) => q.category.includes('방향만 메모'),
];

function buildLiveInterviewOrder() {
  const starred = getEditedQuestions().filter((q) => q.starred);

  let intro = null;
  const rest = [];
  for (const q of starred) {
    if (!intro && q.question.includes('1분') && q.question.includes('자기소개')) {
      intro = q;
    } else {
      rest.push(q);
    }
  }

  const stages = LIVE_STAGE_MATCHERS.map(() => []);
  const fallback = []; // 마무리·인사 등 위 흐름에 속하지 않는 나머지 (항상 마지막)

  for (const q of rest) {
    const stageIdx = LIVE_STAGE_MATCHERS.findIndex((m) => m(q));
    (stageIdx === -1 ? fallback : stages[stageIdx]).push(q);
  }
  stages.push(fallback);

  const questions = stages.flatMap((stage) => shuffle(stage));
  return { intro, questions };
}

const liveStage = document.getElementById('live-stage');
const liveEnd = document.getElementById('live-end');
const liveProgress = document.getElementById('live-progress');
const liveQuestionText = document.getElementById('live-question-text');
const liveAnswerRow = document.getElementById('live-answer-row');
const liveAnswerKeywords = document.getElementById('live-answer-keywords');
const liveAnswerText = document.getElementById('live-answer-text');
const liveHint = document.getElementById('live-hint');

let liveSession = null; // { intro, questions, index, revealed }

document.getElementById('btn-live').addEventListener('click', startLiveInterview);
document.getElementById('btn-live-restart').addEventListener('click', startLiveInterview);
document.getElementById('btn-live-home').addEventListener('click', showLanding);
document.getElementById('btn-live-exit').addEventListener('click', (e) => {
  e.stopPropagation();
  showLanding();
});
liveStage.addEventListener('click', handleLiveTap);

function startLiveInterview() {
  liveSession = { ...buildLiveInterviewOrder(), index: 0, revealed: false };

  landingView.classList.remove('active');
  listView.classList.remove('active');
  liveView.classList.add('active');
  window.scrollTo(0, 0);

  renderLiveStep();
}

function currentLiveStep() {
  const { intro, questions, index } = liveSession;
  if (index === 0) {
    return {
      question: '먼저 간단하게 자기소개 부탁드립니다.',
      keywords: intro ? intro.summaryKeywords : '',
      answer: '',
    };
  }
  const q = questions[index - 1];
  return { question: toSpokenQuestion(q.question), keywords: q.summaryKeywords, answer: '' };
}

function renderLiveStep() {
  const total = liveSession.questions.length + 1;
  const { index, revealed } = liveSession;

  if (index >= total) {
    liveStage.hidden = true;
    liveEnd.hidden = false;
    return;
  }

  liveStage.hidden = false;
  liveEnd.hidden = true;

  const step = currentLiveStep();
  liveProgress.textContent = (index + 1) + ' / ' + total;
  liveQuestionText.textContent = step.question;

  if (revealed) {
    const hasKeywords = !!step.keywords;
    liveAnswerKeywords.textContent = step.keywords || '';
    liveAnswerKeywords.style.display = hasKeywords ? '' : 'none';
    liveAnswerText.textContent = step.answer || '';
    liveAnswerText.style.display = step.answer ? '' : 'none';
    liveAnswerRow.hidden = false;
    liveHint.textContent =
      index + 1 < total ? '탭하면 다음 질문으로 넘어가요' : '탭하면 면접이 종료돼요';
  } else {
    liveAnswerRow.hidden = true;
    liveHint.textContent = '탭하면 답변을 확인할 수 있어요';
  }
}

function handleLiveTap() {
  if (!liveSession) return;
  if (!liveSession.revealed) {
    liveSession.revealed = true;
  } else {
    liveSession.index += 1;
    liveSession.revealed = false;
  }
  renderLiveStep();
}
