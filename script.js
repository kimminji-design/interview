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

function openList(mode) {
  const raw = mode === 'full' ? RAW_FULL : RAW_SUMMARY;
  listTitle.textContent = mode === 'full' ? '풀버전 연습' : '요약버전 연습';

  const categories = parseInterviewText(raw);
  const { intro, specials, categories: rest } = extractSpecialQuestions(categories);

  const pinned = [];
  if (intro) pinned.push(intro);
  pinned.push(...shuffle(specials));

  // 카테고리 자체의 배치 순서는 데이터에 정의된 순서를 그대로 고정 노출한다.
  renderAccordion(pinned, rest);

  landingView.classList.remove('active');
  liveView.classList.remove('active');
  listView.classList.add('active');
  window.scrollTo(0, 0);
}

function renderAccordion(pinned, categories) {
  accordionRoot.innerHTML = '';

  if (pinned.length > 0) {
    accordionRoot.appendChild(buildCategorySection('🎯 필수 준비 질문', pinned, true));
  }

  for (const cat of categories) {
    accordionRoot.appendChild(buildCategorySection(cat.name, cat.questions, false));
  }
}

function buildCategorySection(title, questions, pinnedStyle) {
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
    list.appendChild(buildQAItem(q));
  }

  section.appendChild(list);
  return section;
}

function buildQAItem(q) {
  const item = document.createElement('div');
  item.className = 'qa-item';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'qa-question';
  btn.setAttribute('aria-expanded', 'false');

  const qText = document.createElement('span');
  qText.className = 'qa-question__text';
  qText.textContent = q.question;

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

  if (q.keywords) {
    const kw = document.createElement('p');
    kw.className = 'qa-keywords';
    kw.textContent = q.keywords;
    inner.appendChild(kw);
  }

  if (q.answer) {
    const ans = document.createElement('p');
    ans.className = 'qa-answer-text';
    ans.textContent = q.answer;
    inner.appendChild(ans);
  }

  panel.appendChild(inner);

  btn.addEventListener('click', () => {
    const isOpen = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  item.appendChild(btn);
  item.appendChild(panel);
  return item;
}

// ================= 실전 면접 모드 =================
// 요약버전(RAW_SUMMARY) 데이터를 사용한다. "1분 자기소개"는 항상 맨 처음 질문으로
// 고정하고, 그 이후 질문들은 실제 면접에서 자연스러운 큰 흐름
// (지원동기 → 직무/경험 → 프로젝트·포트폴리오 → 문제해결/역량 →
//  폴라리스오피스 정합성 → 처우·컬처핏 → 마무리) 순서의 "구간(스테이지)"으로
// 먼저 묶은 뒤, 각 구간 내부에서만 순서를 섞는 준랜덤 방식을 사용한다.
// 이렇게 하면 매번 세부 순서는 달라지지만 완전 무작위로 인한 흐름 붕괴는 피할 수 있다.
const LIVE_STAGE_MATCHERS = [
  (cat, q) => q.question.includes('이직') && q.question.includes('이유'),
  (cat) => cat.name.includes('자기소개'),
  (cat) => cat.name.includes('포트폴리오') || cat.name.includes('우리WON뱅킹'),
  (cat) => cat.name.includes('협업') || cat.name.includes('AI Heuristic'),
  (cat) => cat.name.includes('폴라리스오피스 적합성'),
  (cat) => cat.name.includes('방향만 메모'),
];

function buildLiveInterviewOrder() {
  const categories = parseInterviewText(RAW_SUMMARY);

  let intro = null;
  for (const cat of categories) {
    const idx = cat.questions.findIndex(
      (q) => q.question.includes('1분') && q.question.includes('자기소개')
    );
    if (idx !== -1) {
      intro = cat.questions.splice(idx, 1)[0];
      break;
    }
  }

  const stages = LIVE_STAGE_MATCHERS.map(() => []);
  const fallback = []; // 마무리·인사 등 위 흐름에 속하지 않는 나머지 (항상 마지막)

  for (const cat of categories) {
    for (const q of cat.questions) {
      const stageIdx = LIVE_STAGE_MATCHERS.findIndex((m) => m(cat, q));
      (stageIdx === -1 ? fallback : stages[stageIdx]).push(q);
    }
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
      keywords: intro ? intro.keywords : '',
      answer: intro ? intro.answer : '',
    };
  }
  const q = questions[index - 1];
  return { question: q.question, keywords: q.keywords, answer: q.answer };
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
