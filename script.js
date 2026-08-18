// 화면 전환 + 기업 관리 + 아코디언 렌더링(즐겨찾기/삭제/수정/추가) + 실전 면접 로직

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ================= DOM 참조 =================
const gateView = document.getElementById('gate-view');
const gateForm = document.getElementById('gate-form');
const gateInput = document.getElementById('gate-input');
const gateError = document.getElementById('gate-error');

const companyView = document.getElementById('company-view');
const companyListEl = document.getElementById('company-list');
const btnAddCompany = document.getElementById('btn-add-company');

const landingView = document.getElementById('landing-view');
const landingCompanyName = document.getElementById('landing-company-name');
const listView = document.getElementById('list-view');
const liveView = document.getElementById('live-view');
const listTitle = document.getElementById('list-title');
const listToolbar = document.getElementById('list-toolbar');
const accordionRoot = document.getElementById('accordion-root');
const btnAddQuestion = document.getElementById('btn-add-question');
const btnDeleteMode = document.getElementById('btn-delete-mode');
const deleteModeActions = document.getElementById('delete-mode-actions');
const deleteSelectedCountEl = document.getElementById('delete-selected-count');
const btnDeleteSelected = document.getElementById('btn-delete-selected');
const btnDeleteCancel = document.getElementById('btn-delete-cancel');

const modalAddCompany = document.getElementById('modal-add-company');
const addCompanyNameInput = document.getElementById('add-company-name');
const addCompanySourceList = document.getElementById('add-company-source-list');
const addCompanyError = document.getElementById('add-company-error');
const addCompanyCopySection = document.getElementById('add-company-copy-section');
const addCompanyUploadSection = document.getElementById('add-company-upload-section');
const addCompanyFileInput = document.getElementById('add-company-file-input');
const addCompanyFileDrop = document.querySelector('label[for="add-company-file-input"]');
const addCompanyFileNameEl = document.getElementById('add-company-file-name');

const modalAddQuestion = document.getElementById('modal-add-question');
const addQCategoryInput = document.getElementById('add-q-category');
const addQCategoryOptions = document.getElementById('add-q-category-options');
const addQQuestionInput = document.getElementById('add-q-question');
const addQAnswerInput = document.getElementById('add-q-answer');
const addQuestionError = document.getElementById('add-question-error');

const modalConfirm = document.getElementById('modal-confirm');
const modalConfirmMessage = document.getElementById('modal-confirm-message');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
const btnConfirmOk = document.getElementById('btn-confirm-ok');

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
    gateForm.offsetWidth; // 애니메이션 재실행을 위한 리플로우 강제
    gateForm.classList.add('shake');
  }
});

function unlockGate() {
  gateView.classList.remove('active');
  companyView.classList.add('active');
  renderCompanyList();
}

function showLanding() {
  listView.classList.remove('active');
  liveView.classList.remove('active');
  landingView.classList.add('active');
  accordionRoot.innerHTML = '';
  stopTimer();
}

document.getElementById('btn-back').addEventListener('click', showLanding);

// ================= 범용 확인 모달 =================
let pendingConfirmAction = null;

function showConfirmModal(message, onConfirm, confirmLabel) {
  modalConfirmMessage.textContent = message;
  btnConfirmOk.textContent = confirmLabel || '삭제';
  pendingConfirmAction = onConfirm;
  modalConfirm.hidden = false;
}

function closeConfirmModal() {
  modalConfirm.hidden = true;
  pendingConfirmAction = null;
}

btnConfirmCancel.addEventListener('click', closeConfirmModal);
btnConfirmOk.addEventListener('click', () => {
  const action = pendingConfirmAction;
  closeConfirmModal();
  if (action) action();
});

function attachOverlayDismiss(overlay, onDismiss) {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onDismiss();
  });
}

attachOverlayDismiss(modalConfirm, closeConfirmModal);

// ================= 키워드 칩 렌더링 (아코디언 · 실전 면접 공용) =================
function renderKeywordChips(container, keywords) {
  container.innerHTML = '';
  const list = Array.isArray(keywords) ? keywords : [];
  container.hidden = list.length === 0;
  for (const kw of list) {
    const chip = document.createElement('span');
    chip.className = 'qa-keyword-chip';
    chip.textContent = kw;
    container.appendChild(chip);
  }
}

// ================= 기업 선택 화면 =================
function renderCompanyList() {
  companyListEl.innerHTML = '';

  const companies = getCompanies();
  if (companies.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'company-list__empty';
    empty.textContent = '등록된 기업이 없습니다. 기업을 추가해주세요.';
    companyListEl.appendChild(empty);
  }

  for (const company of companies) {
    const card = document.createElement('div');
    card.className = 'company-card';

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'company-card__select';

    const nameEl = document.createElement('span');
    nameEl.className = 'company-card__name';
    nameEl.textContent = company.name;

    const countEl = document.createElement('span');
    countEl.className = 'company-card__count';
    countEl.textContent = countCompanyQuestions(company) + '개 질문';

    selectBtn.appendChild(nameEl);
    selectBtn.appendChild(countEl);
    selectBtn.addEventListener('click', () => chooseCompany(company.id));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'company-card__delete';
    delBtn.textContent = '🗑';
    delBtn.setAttribute('aria-label', '기업 삭제');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirmModal(
        '"' + company.name + '" 기업 데이터를 정말 삭제하시겠습니까?\n삭제하면 되돌릴 수 없습니다.',
        () => {
          deleteCompany(company.id);
          renderCompanyList();
        }
      );
    });

    card.appendChild(selectBtn);
    card.appendChild(delBtn);
    companyListEl.appendChild(card);
  }
}

function chooseCompany(id) {
  selectCompany(id);
  const company = getCurrentCompany();
  landingCompanyName.textContent = company ? company.name : '';
  companyView.classList.remove('active');
  landingView.classList.add('active');
}

document.getElementById('btn-change-company').addEventListener('click', () => {
  landingView.classList.remove('active');
  companyView.classList.add('active');
  renderCompanyList();
});

// ---- 기업 추가 모달 ----
let pendingUploadFile = null;

function openAddCompanyModal() {
  addCompanyNameInput.value = '';
  addCompanyError.hidden = true;
  renderAddCompanySourceList();

  // 데이터 소스는 매번 "기존 기업 복사"로 초기화한다.
  const copyRadio = document.querySelector('input[name="add-company-source-mode"][value="copy"]');
  if (copyRadio) copyRadio.checked = true;
  addCompanyCopySection.hidden = false;
  addCompanyUploadSection.hidden = true;

  pendingUploadFile = null;
  addCompanyFileInput.value = '';
  addCompanyFileNameEl.textContent = '클릭해서 .txt 파일을 선택하세요';
  addCompanyFileDrop.classList.remove('has-file', 'is-dragover');

  modalAddCompany.hidden = false;
  addCompanyNameInput.focus();
}

document.querySelectorAll('input[name="add-company-source-mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const mode = radio.value;
    if (radio.checked) {
      addCompanyCopySection.hidden = mode !== 'copy';
      addCompanyUploadSection.hidden = mode !== 'upload';
      addCompanyError.hidden = true;
    }
  });
});

function setPendingUploadFile(file) {
  pendingUploadFile = file || null;
  if (file) {
    addCompanyFileNameEl.textContent = '📄 ' + file.name;
    addCompanyFileDrop.classList.add('has-file');
  } else {
    addCompanyFileNameEl.textContent = '클릭해서 .txt 파일을 선택하세요';
    addCompanyFileDrop.classList.remove('has-file');
  }
}

addCompanyFileInput.addEventListener('change', () => {
  setPendingUploadFile(addCompanyFileInput.files && addCompanyFileInput.files[0]);
});

addCompanyFileDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  addCompanyFileDrop.classList.add('is-dragover');
});
addCompanyFileDrop.addEventListener('dragleave', () => {
  addCompanyFileDrop.classList.remove('is-dragover');
});
addCompanyFileDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  addCompanyFileDrop.classList.remove('is-dragover');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) setPendingUploadFile(file);
});

function renderAddCompanySourceList() {
  addCompanySourceList.innerHTML = '';
  const companies = getCompanies();

  if (companies.length === 0) {
    const p = document.createElement('p');
    p.className = 'modal__hint';
    p.textContent = '복사할 기존 기업 데이터가 없습니다. 빈 상태로 새로 만들어집니다.';
    addCompanySourceList.appendChild(p);
    return;
  }

  companies.forEach((c, idx) => {
    const label = document.createElement('label');
    label.className = 'modal__radio-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'add-company-source';
    input.value = c.id;
    if (idx === 0) input.checked = true;

    const span = document.createElement('span');
    span.textContent = c.name;

    label.appendChild(input);
    label.appendChild(span);
    addCompanySourceList.appendChild(label);
  });
}

btnAddCompany.addEventListener('click', openAddCompanyModal);
document.getElementById('btn-add-company-cancel').addEventListener('click', () => {
  modalAddCompany.hidden = true;
});
attachOverlayDismiss(modalAddCompany, () => {
  modalAddCompany.hidden = true;
});

// ================= 업로드 텍스트 파일 파싱 =================
// "━━━" 구분선 사이의 텍스트가 카테고리 제목, "Q. "/"⭐ Q. "로 시작하는 줄이
// 질문(⭐면 즐겨찾기), 다음 Q./구분선 전까지의 줄이 답변인 포맷을 파싱한다.
// 형식이 어긋나는 줄을 만나도 경고만 남기고 파싱을 계속 진행한다.
const SEPARATOR_LINE = /^[━─=—-]{5,}$/;
const QUESTION_LINE = /^(⭐)?\s*Q\.\s*(.+)$/;

function parseCompanyTextFile(text) {
  const lines = text.split(/\r?\n/);
  const categories = [];
  const warnings = [];
  let currentCategory = null;
  let currentQuestion = null;
  let justSawSeparator = false;

  function ensureCategory(name) {
    currentCategory = { name, questions: [] };
    categories.push(currentCategory);
  }

  function finalizeQuestion() {
    if (!currentQuestion) return;
    const answer = currentQuestion.answerLines.join(' ').replace(/\s+/g, ' ').trim();
    currentCategory.questions.push({
      question: currentQuestion.question,
      answer,
      favorite: currentQuestion.favorite,
    });
    currentQuestion = null;
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (line === '') return; // 빈 줄은 무시 — 질문/카테고리 경계 신호로 쓰지 않는다

    if (SEPARATOR_LINE.test(line)) {
      finalizeQuestion();
      justSawSeparator = true;
      return;
    }

    const qMatch = line.match(QUESTION_LINE);
    if (qMatch) {
      finalizeQuestion();
      if (!currentCategory) {
        warnings.push('(줄 ' + (idx + 1) + ') 카테고리 없이 등장한 질문이라 "미분류"에 담았습니다: "' + qMatch[2].slice(0, 30) + '"');
        ensureCategory('미분류');
      }
      justSawSeparator = false;
      currentQuestion = {
        question: qMatch[2].trim(),
        favorite: !!qMatch[1],
        answerLines: [],
      };
      return;
    }

    if (justSawSeparator) {
      finalizeQuestion();
      ensureCategory(line);
      justSawSeparator = false;
      return;
    }

    if (currentQuestion) {
      currentQuestion.answerLines.push(line);
    } else {
      warnings.push('(줄 ' + (idx + 1) + ') 질문/카테고리 문맥 밖의 텍스트를 건너뜁니다: "' + line.slice(0, 40) + '"');
    }
  });

  finalizeQuestion();

  return { categories: categories.filter((c) => c.questions.length > 0), warnings };
}

document.getElementById('btn-add-company-confirm').addEventListener('click', async () => {
  const name = addCompanyNameInput.value.trim();
  if (!name) {
    addCompanyError.textContent = '기업명을 입력해주세요.';
    addCompanyError.hidden = false;
    return;
  }

  const mode = document.querySelector('input[name="add-company-source-mode"]:checked').value;

  if (mode === 'copy') {
    const selected = addCompanySourceList.querySelector('input[name="add-company-source"]:checked');
    const sourceId = selected ? selected.value : null;
    addCompany(name, sourceId);
    modalAddCompany.hidden = true;
    renderCompanyList();
    return;
  }

  // mode === 'upload'
  if (!pendingUploadFile) {
    addCompanyError.textContent = '업로드할 텍스트 파일을 선택해주세요.';
    addCompanyError.hidden = false;
    return;
  }

  let text;
  try {
    text = await pendingUploadFile.text();
  } catch (e) {
    addCompanyError.textContent = '파일을 읽는 중 문제가 발생했습니다.';
    addCompanyError.hidden = false;
    return;
  }

  const { categories, warnings } = parseCompanyTextFile(text);

  if (warnings.length > 0) {
    console.warn('[기업 추가 · 파일 파싱] 형식이 예상과 다른 줄 ' + warnings.length + '개를 건너뛰었습니다:');
    warnings.forEach((w) => console.warn('  ' + w));
  }

  const questionCount = categories.reduce((sum, c) => sum + c.questions.length, 0);
  const favoriteCount = categories.reduce(
    (sum, c) => sum + c.questions.filter((q) => q.favorite).length,
    0
  );

  if (categories.length === 0 || questionCount === 0) {
    addCompanyError.textContent = '파일에서 질문을 찾지 못했습니다. "Q. " 형식으로 시작하는 질문이 있는지 확인해주세요.';
    addCompanyError.hidden = false;
    console.warn('[기업 추가 · 파일 파싱] 질문을 하나도 찾지 못했습니다. 포맷을 확인해주세요.');
    return;
  }

  console.log(
    '[기업 추가 · 파일 파싱 완료] "' + name + '" — 카테고리 ' + categories.length +
      '개 / 질문 ' + questionCount + '개 / 즐겨찾기 ' + favoriteCount + '개'
  );
  console.log(categories.map((c) => '  - ' + c.name + ' (' + c.questions.length + '문항)').join('\n'));

  createCompanyFromParsedCategories(name, categories);
  modalAddCompany.hidden = true;
  renderCompanyList();
});

// ================= 풀버전 / 요약버전 (아코디언) =================
let currentListMode = 'full';

// ---- 삭제 모드: 툴바의 "삭제"를 누르면 각 질문 카드 앞에 체크박스가 나타나고,
// 여러 개를 고른 뒤 "선택 삭제"로 한 번에 지운다. 카드에 있던 즉시-삭제
// 휴지통 아이콘은 오조작 위험 때문에 없앴다. ----
let deleteMode = false;
let selectedForDeletion = new Set();

function updateDeleteToolbarUI() {
  const inFull = currentListMode === 'full';
  listToolbar.hidden = !inFull;
  btnAddQuestion.hidden = !inFull || deleteMode;
  btnDeleteMode.hidden = !inFull || deleteMode;
  deleteModeActions.hidden = !deleteMode;
  updateDeleteSelectionCount();
}

function updateDeleteSelectionCount() {
  const count = selectedForDeletion.size;
  deleteSelectedCountEl.textContent = count + '개 선택';
  btnDeleteSelected.disabled = count === 0;
}

function enterDeleteMode() {
  deleteMode = true;
  selectedForDeletion.clear();
  updateDeleteToolbarUI();
  openList(currentListMode);
}

function exitDeleteMode() {
  deleteMode = false;
  selectedForDeletion.clear();
  updateDeleteToolbarUI();
  openList(currentListMode);
}

btnDeleteMode.addEventListener('click', enterDeleteMode);
btnDeleteCancel.addEventListener('click', exitDeleteMode);

btnDeleteSelected.addEventListener('click', () => {
  if (selectedForDeletion.size === 0) return;
  const count = selectedForDeletion.size;
  showConfirmModal('선택한 ' + count + '개 질문을 정말 삭제하시겠습니까?', () => {
    deleteQuestions([...selectedForDeletion]);
    exitDeleteMode();
  });
});

document.getElementById('btn-full').addEventListener('click', () => openList('full'));
document.getElementById('btn-summary').addEventListener('click', () => openList('summary'));

function groupByCategory(questions) {
  const order = [];
  const map = new Map();
  for (const q of questions) {
    let bucket = map.get(q.category);
    if (!bucket) {
      bucket = { name: q.category, questions: [] };
      map.set(q.category, bucket);
      order.push(bucket);
    }
    bucket.questions.push(q);
  }
  return order;
}

function openList(mode) {
  currentListMode = mode;
  if (mode !== 'full') {
    deleteMode = false;
    selectedForDeletion.clear();
  }
  const company = getCurrentCompany();
  const companyName = company ? company.name : '';
  listTitle.textContent = (mode === 'full' ? '풀버전' : '요약버전') + ' · ' + companyName;
  updateDeleteToolbarUI();

  landingView.classList.remove('active');
  liveView.classList.remove('active');
  listView.classList.add('active');
  window.scrollTo(0, 0);

  const all = getCurrentCompanyFlatQuestions();
  const questions = mode === 'full' ? all : all.filter((q) => q.favorite);

  if (mode === 'summary' && questions.length === 0) {
    renderEmptyState(
      '⭐',
      '아직 즐겨찾기한 질문이 없어요',
      '풀버전에서 질문 옆 ☆ 버튼을 눌러 요약버전 · 실전 면접에 사용할 질문을 골라보세요.',
      '풀버전으로 가기',
      () => openList('full')
    );
    return;
  }

  if (mode === 'full' && questions.length === 0) {
    renderEmptyState(
      '📝',
      '등록된 질문이 없어요',
      '위 "+ 질문 추가" 버튼으로 첫 질문을 만들어보세요.',
      null,
      null
    );
    return;
  }

  renderAccordion(groupByCategory(questions), mode);
}

function renderEmptyState(icon, title, desc, buttonLabel, onClick) {
  accordionRoot.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'empty-state';

  const iconEl = document.createElement('p');
  iconEl.className = 'empty-state__icon';
  iconEl.textContent = icon;

  const titleEl = document.createElement('p');
  titleEl.className = 'empty-state__title';
  titleEl.textContent = title;

  const descEl = document.createElement('p');
  descEl.className = 'empty-state__desc';
  descEl.textContent = desc;

  box.appendChild(iconEl);
  box.appendChild(titleEl);
  box.appendChild(descEl);

  if (buttonLabel && onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mode-btn';
    btn.textContent = buttonLabel;
    btn.addEventListener('click', onClick);
    box.appendChild(btn);
  }

  accordionRoot.appendChild(box);
}

function renderAccordion(categories, mode) {
  accordionRoot.innerHTML = '';
  for (const cat of categories) {
    accordionRoot.appendChild(buildCategorySection(cat.name, cat.questions, mode));
  }
}

function buildCategorySection(title, questions, mode) {
  const section = document.createElement('section');
  section.className = 'category';

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

// mode 'full'일 때만 즐겨찾기(☆/★) 아이콘을 보여준다. 삭제는 카드에서 즉시
// 하지 않고, 툴바의 "삭제" → 체크박스 다중 선택 → "선택 삭제" 흐름으로만 한다.
// 질문/답변 수정과 키워드 수정은 두 모드 모두에서 가능하다.
function buildQAItem(q, mode) {
  const showManageIcons = mode === 'full';

  const item = document.createElement('div');
  item.className = 'qa-item';

  const row = document.createElement('div');
  row.className = 'qa-question';

  if (showManageIcons && deleteMode) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'qa-select-checkbox';
    checkbox.setAttribute('aria-label', '삭제할 질문 선택');
    checkbox.checked = selectedForDeletion.has(q.id);
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedForDeletion.add(q.id);
      else selectedForDeletion.delete(q.id);
      updateDeleteSelectionCount();
    });
    row.appendChild(checkbox);
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'qa-question__toggle';
  toggleBtn.setAttribute('aria-expanded', 'false');

  const qTextLabel = document.createElement('span');
  qTextLabel.className = 'qa-question__text';
  qTextLabel.textContent = q.question;
  toggleBtn.appendChild(qTextLabel);
  row.appendChild(toggleBtn);

  if (showManageIcons && !deleteMode) {
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'qa-icon-btn qa-fav-btn';
    favBtn.setAttribute('aria-label', '즐겨찾기');

    function updateFavButton() {
      favBtn.textContent = q.favorite ? '★' : '☆';
      favBtn.classList.toggle('is-favorite', !!q.favorite);
    }
    updateFavButton();

    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const updated = toggleFavorite(q.id);
      if (updated) {
        q.favorite = updated.favorite;
        updateFavButton();
      }
    });
    row.appendChild(favBtn);
  }

  const arrow = document.createElement('span');
  arrow.className = 'qa-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '▾';
  row.appendChild(arrow);

  const panel = document.createElement('div');
  panel.className = 'qa-answer';

  const inner = document.createElement('div');
  inner.className = 'qa-answer__inner';

  // 최종 배치 순서: 질문 제목(row) → 키워드 태그 → 답변 전문 → 수정 버튼들.
  // 각 요소는 아래에서 만들고, 실제 inner.appendChild 순서는 함수 끝부분에서
  // 한 번에 정리한다 (키워드 수정 폼은 키워드 자리에, 답변 수정 폼은 답변 자리에).
  const chipsEl = document.createElement('div');
  chipsEl.className = 'qa-keyword-chips';
  renderKeywordChips(chipsEl, q.keywords);

  const bodyEl = document.createElement('p');
  bodyEl.className = 'qa-answer-text';
  bodyEl.textContent = q.answer || '';
  bodyEl.hidden = !q.answer;

  const actions = document.createElement('div');
  actions.className = 'qa-actions';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'qa-action-btn qa-action-btn--edit';
  editBtn.textContent = '✏️ 수정';
  actions.appendChild(editBtn);

  const keywordEditBtn = document.createElement('button');
  keywordEditBtn.type = 'button';
  keywordEditBtn.className = 'qa-action-btn qa-action-btn--edit';
  keywordEditBtn.textContent = '🏷️ 키워드 수정';
  actions.appendChild(keywordEditBtn);

  const editBox = document.createElement('div');
  editBox.className = 'qa-edit-box';
  editBox.hidden = true;

  const questionLabel = document.createElement('label');
  questionLabel.className = 'qa-edit-label';
  questionLabel.textContent = '질문';
  const questionInput = document.createElement('input');
  questionInput.type = 'text';
  questionInput.className = 'qa-edit-input';

  const answerLabel = document.createElement('label');
  answerLabel.className = 'qa-edit-label';
  answerLabel.textContent = '답변';
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

  editBox.appendChild(questionLabel);
  editBox.appendChild(questionInput);
  editBox.appendChild(answerLabel);
  editBox.appendChild(textarea);
  editBox.appendChild(editButtons);

  // ---- 키워드 수정 (태그 형태로 추가/삭제) ----
  const keywordEditBox = document.createElement('div');
  keywordEditBox.className = 'qa-keyword-edit';
  keywordEditBox.hidden = true;

  let editingKeywords = [];
  const keywordEditChips = document.createElement('div');
  keywordEditChips.className = 'qa-keyword-edit__chips';

  function renderEditingChips() {
    keywordEditChips.innerHTML = '';
    editingKeywords.forEach((kw, idx) => {
      const chip = document.createElement('span');
      chip.className = 'qa-keyword-chip qa-keyword-chip--removable';

      const label = document.createElement('span');
      label.textContent = kw;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'qa-keyword-remove';
      removeBtn.textContent = '✕';
      removeBtn.setAttribute('aria-label', '키워드 삭제');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editingKeywords.splice(idx, 1);
        renderEditingChips();
      });

      chip.appendChild(label);
      chip.appendChild(removeBtn);
      keywordEditChips.appendChild(chip);
    });
  }

  const keywordAddRow = document.createElement('div');
  keywordAddRow.className = 'qa-keyword-edit__add';

  const keywordInput = document.createElement('input');
  keywordInput.type = 'text';
  keywordInput.className = 'qa-keyword-input';
  keywordInput.placeholder = '새 키워드 입력';
  keywordInput.addEventListener('click', (e) => e.stopPropagation());
  keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeywordFromInput();
    }
  });

  const keywordAddBtn = document.createElement('button');
  keywordAddBtn.type = 'button';
  keywordAddBtn.className = 'qa-keyword-add-btn';
  keywordAddBtn.textContent = '추가';
  keywordAddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addKeywordFromInput();
  });

  function addKeywordFromInput() {
    const value = keywordInput.value.trim();
    if (!value) return;
    editingKeywords.push(value);
    keywordInput.value = '';
    renderEditingChips();
    keywordInput.focus();
  }

  keywordAddRow.appendChild(keywordInput);
  keywordAddRow.appendChild(keywordAddBtn);

  const keywordEditButtons = document.createElement('div');
  keywordEditButtons.className = 'qa-edit-buttons';
  const keywordCancelBtn = document.createElement('button');
  keywordCancelBtn.type = 'button';
  keywordCancelBtn.className = 'qa-cancel-btn';
  keywordCancelBtn.textContent = '취소';
  const keywordSaveBtn = document.createElement('button');
  keywordSaveBtn.type = 'button';
  keywordSaveBtn.className = 'qa-save-btn';
  keywordSaveBtn.textContent = '저장';
  keywordEditButtons.appendChild(keywordCancelBtn);
  keywordEditButtons.appendChild(keywordSaveBtn);

  keywordEditBox.appendChild(keywordEditChips);
  keywordEditBox.appendChild(keywordAddRow);
  keywordEditBox.appendChild(keywordEditButtons);

  // 질문 제목(위쪽 row) → 키워드 태그/키워드 수정 폼 → 답변 전문/답변 수정 폼 → 수정 버튼들
  inner.appendChild(chipsEl);
  inner.appendChild(keywordEditBox);
  inner.appendChild(bodyEl);
  inner.appendChild(editBox);
  inner.appendChild(actions);

  panel.appendChild(inner);

  function enterEditMode(e) {
    e.stopPropagation();
    questionInput.value = q.question;
    textarea.value = q.answer;
    bodyEl.hidden = true;
    chipsEl.hidden = true;
    actions.hidden = true;
    editBox.hidden = false;
    questionInput.focus();
  }

  function exitEditMode() {
    editBox.hidden = true;
    actions.hidden = false;
    bodyEl.hidden = !bodyEl.textContent;
    renderKeywordChips(chipsEl, q.keywords);
  }

  editBtn.addEventListener('click', enterEditMode);
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exitEditMode();
  });

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newQuestion = questionInput.value.trim();
    const newAnswer = textarea.value.trim();
    if (!newQuestion || !newAnswer) return;

    const updated = updateQuestion(q.id, { question: newQuestion, answer: newAnswer });
    if (updated) {
      q.question = updated.question;
      q.answer = updated.answer;
      qTextLabel.textContent = q.question;
      bodyEl.textContent = q.answer;
    }
    exitEditMode();
  });

  function enterKeywordEditMode(e) {
    e.stopPropagation();
    editingKeywords = Array.isArray(q.keywords) ? q.keywords.slice() : [];
    renderEditingChips();
    keywordInput.value = '';
    chipsEl.hidden = true;
    actions.hidden = true;
    keywordEditBox.hidden = false;
    keywordInput.focus();
  }

  function exitKeywordEditMode() {
    keywordEditBox.hidden = true;
    actions.hidden = false;
    renderKeywordChips(chipsEl, q.keywords);
  }

  keywordEditBtn.addEventListener('click', enterKeywordEditMode);
  keywordCancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exitKeywordEditMode();
  });

  keywordSaveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const updated = updateQuestionKeywords(q.id, editingKeywords);
    if (updated) {
      q.keywords = updated.keywords;
    }
    exitKeywordEditMode();
  });

  toggleBtn.addEventListener('click', () => {
    const isOpen = item.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  });

  item.appendChild(row);
  item.appendChild(panel);
  return item;
}

// ---- 질문 추가 모달 ----
function openAddQuestionModal() {
  addQCategoryInput.value = '';
  addQQuestionInput.value = '';
  addQAnswerInput.value = '';
  addQuestionError.hidden = true;

  addQCategoryOptions.innerHTML = '';
  const names = [...new Set(getCurrentCompanyCategories().map((c) => c.name))];
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    addQCategoryOptions.appendChild(opt);
  }

  modalAddQuestion.hidden = false;
  addQCategoryInput.focus();
}

btnAddQuestion.addEventListener('click', openAddQuestionModal);
document.getElementById('btn-add-question-cancel').addEventListener('click', () => {
  modalAddQuestion.hidden = true;
});
attachOverlayDismiss(modalAddQuestion, () => {
  modalAddQuestion.hidden = true;
});

document.getElementById('btn-add-question-confirm').addEventListener('click', () => {
  const category = addQCategoryInput.value.trim();
  const question = addQQuestionInput.value.trim();
  const answer = addQAnswerInput.value.trim();

  if (!category || !question || !answer) {
    addQuestionError.textContent = '카테고리, 질문, 답변을 모두 입력해주세요.';
    addQuestionError.hidden = false;
    return;
  }

  addQuestion(category, question, answer);
  modalAddQuestion.hidden = true;
  openList('full');
});

// ================= 실전 면접 화면 문구 =================
// 데이터에 저장된 명사형 질문 라벨(예: "이직하는 이유")을 그대로 쓰지 않고,
// 면접관이 실제로 말하는 듯한 구어체 질문으로 바꿔서 보여준다. 아코디언의
// 질문 표기는 원본 그대로 유지하므로 여기서만 사용한다.
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
  '궁금한 점이 있는지': '그 밖에 저희에게 궁금하신 점이 있다면 편하게 말씀해주세요.',
  '마지막으로 하고 싶은 말': '마지막으로 하고 싶은 말씀이 있다면 해주세요.',
};

function toSpokenQuestion(text) {
  if (LIVE_QUESTION_PHRASING[text]) return LIVE_QUESTION_PHRASING[text];
  const trimmed = text.trim();
  if (/[?？]$/.test(trimmed)) return trimmed;
  // 끝에 마침표 등이 붙어있으면 떼고 어미를 판단해야 "~해주세요."처럼 이미
  // 자연스러운 문장에 "~에 대해 말씀해주세요."가 중복으로 붙지 않는다.
  const core = trimmed.replace(/[.!?？]+$/, '');
  if (/(나요|가요|까요|세요|주세요|습니다|니다)$/.test(core)) return trimmed;
  return core + '에 대해 말씀해주세요.';
}

// ================= 실전 면접 모드 =================
// 즐겨찾기(★)한 질문만 대상으로, 실제 면접에서 자연스러운 큰 흐름(자기소개 →
// 지원동기 → 직무/경험 → 프로젝트·포트폴리오 → 문제해결/역량 → 폴라리스오피스
// 정합성 → 처우·컬처핏 → 그 외) 순서의 "구간(스테이지)"으로 먼저 묶은 뒤, 각
// 구간 내부에서만 순서를 섞는 준랜덤 방식을 사용한다. 매번 세부 순서는
// 달라지지만 완전 무작위로 인한 흐름 붕괴는 피할 수 있다.
const LIVE_STAGE_MATCHERS = [
  (q) => q.question.includes('1분') && q.question.includes('자기소개'),
  (q) => q.question.includes('이직') && q.question.includes('이유'),
  (q) => q.category.includes('자기소개'),
  (q) => q.category.includes('포트폴리오') || q.category.includes('우리WON뱅킹'),
  (q) => q.category.includes('협업') || q.category.includes('AI Heuristic'),
  (q) => q.category.includes('폴라리스오피스 적합성'),
  (q) => q.category.includes('방향만 메모'),
];

function buildLiveInterviewOrder(favoriteQuestions) {
  const stages = LIVE_STAGE_MATCHERS.map(() => []);
  const fallback = [];

  for (const q of favoriteQuestions) {
    const idx = LIVE_STAGE_MATCHERS.findIndex((m) => m(q));
    (idx === -1 ? fallback : stages[idx]).push(q);
  }

  const [introStage, ...restStages] = stages;
  return [...introStage, ...restStages.flatMap((s) => shuffle(s)), ...shuffle(fallback)];
}

const liveStage = document.getElementById('live-stage');
const liveEnd = document.getElementById('live-end');
const liveProgress = document.getElementById('live-progress');
const liveTimer = document.getElementById('live-timer');
const liveQuestionText = document.getElementById('live-question-text');
const liveAnswerRow = document.getElementById('live-answer-row');
const liveAnswerKeywords = document.getElementById('live-answer-keywords');
const liveAnswerText = document.getElementById('live-answer-text');
const liveHint = document.getElementById('live-hint');

let liveSession = null; // { questions, index, revealed }

// ---- 스톱워치: 질문이 뜨면 0초부터 시작, 답변을 펼치면 멈추고, 다음 질문으로
// 넘어가면 다시 0초부터 시작한다. ----
let timerIntervalId = null;
let timerSeconds = 0;

function renderTimer() {
  liveTimer.textContent = timerSeconds + '초';
}

function startTimer() {
  stopTimer();
  timerSeconds = 0;
  renderTimer();
  timerIntervalId = setInterval(() => {
    timerSeconds += 1;
    renderTimer();
  }, 1000);
}

function stopTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

document.getElementById('btn-live').addEventListener('click', startLiveInterview);
document.getElementById('btn-live-restart').addEventListener('click', startLiveInterview);
document.getElementById('btn-live-home').addEventListener('click', showLanding);
document.getElementById('btn-live-exit').addEventListener('click', (e) => {
  e.stopPropagation();
  showLanding();
});
liveStage.addEventListener('click', handleLiveTap);

function startLiveInterview() {
  const favorites = getCurrentCompanyFlatQuestions().filter((q) => q.favorite);
  if (favorites.length === 0) {
    openList('summary'); // 즐겨찾기가 없으면 안내 문구가 있는 화면으로 유도
    return;
  }

  liveSession = { questions: buildLiveInterviewOrder(favorites), index: 0, revealed: false };

  landingView.classList.remove('active');
  listView.classList.remove('active');
  liveView.classList.add('active');
  window.scrollTo(0, 0);

  renderLiveStep();
  startTimer();
}

function currentLiveStep() {
  const q = liveSession.questions[liveSession.index];
  const isIntro = q.question.includes('1분') && q.question.includes('자기소개');
  return {
    question: isIntro ? '먼저 간단하게 자기소개 부탁드립니다.' : toSpokenQuestion(q.question),
    keywords: q.keywords,
    answer: q.answer,
  };
}

function renderLiveStep() {
  const total = liveSession.questions.length;
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
    renderKeywordChips(liveAnswerKeywords, step.keywords);
    liveAnswerText.textContent = step.answer || '';
    liveAnswerText.hidden = !step.answer;
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
    stopTimer();
    renderLiveStep();
  } else {
    liveSession.index += 1;
    liveSession.revealed = false;
    renderLiveStep();
    if (liveSession.index < liveSession.questions.length) {
      startTimer();
    } else {
      stopTimer(); // 마지막 질문까지 끝났으면 타이머 정지
    }
  }
}
