import { breathingText, newestCompanies } from './reading.mjs?v=4';
import { clone, uid, equal, count, flat, validate, documentOf, newCompany, mergeDocuments, move, suggestKeywords, parseBulk } from './core.mjs?v=3';
import { GitHubSync, SEED_PATH } from './github-sync.mjs?v=3';

const $ = id => document.getElementById(id);
const STORAGE = 'interviewWorkspace.v2', LEGACY = 'interviewCompanyData.v1';
let state = { data: documentOf([]), base: null, selected: null, backups: [], revision: 0 };
let storageBroken = false, staleTab = false, view = 'manage', selected = new Set(), saveTimer, toastTimer;
let editorDirty = false, dialogCleanup = null, liveSession = null, clock;
const statuses = { draft: '작성 중', review: '검토 필요', ready: '준비 완료' };
try {
  const stored = localStorage.getItem(STORAGE);
  if (stored) { state = JSON.parse(stored); state.data = documentOf(validate(state.data).companies); if (state.base) state.base = documentOf(validate(state.base).companies); }
  else if (localStorage.getItem(LEGACY)) {
    const legacy = validate(JSON.parse(localStorage.getItem(LEGACY)));
    state.data = documentOf(legacy.companies); state.selected = legacy.selectedCompanyId;
    state.backups.push({ date: new Date().toISOString(), reason: '이전 버전 원본', data: clone(state.data) });
  }
} catch (error) { storageBroken = true; }
state.backups ??= []; state.revision ??= 0;
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
function btn(text, action, cls = '') { const b = el('button', cls, text); b.type = 'button'; b.onclick = action; return b; }
function option(value, text) { const o = el('option', '', text); o.value = value; return o; }
function message(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
function orderedCompanies() { return newestCompanies(state.data.companies); }
function current() { return state.data.companies.find(c => c.id === state.selected) || orderedCompanies()[0]; }
function localSave() {
  if (staleTab || storageBroken) return false;
  try { state.revision++; localStorage.setItem(STORAGE, JSON.stringify(state)); return true; }
  catch { storageBroken = true; $('sync-status').dataset.state = 'error'; $('sync-status').textContent = '이 기기에 저장할 수 없어요. 내보내기로 백업해주세요.'; return false; }
}
function backup(reason) {
  state.backups = [{ date: new Date().toISOString(), reason, data: clone(state.data) }, ...state.backups].slice(0, 4);
  localSave();
}
function changed() {
  if (staleTab) { message('다른 탭에서 수정했어요. 새로고침 후 다시 편집해주세요.'); return; }
  localSave();
  if (!storageBroken) { $('sync-status').dataset.state = 'pending'; $('sync-status').textContent = '이 기기에 저장됨 · GitHub 저장 대기'; }
  clearTimeout(saveTimer);
  if (sync.token) saveTimer = setTimeout(() => runSync(true), 2200);
}
function safeSelection() {
  if (!state.data.companies.some(c => c.id === state.selected)) state.selected = orderedCompanies()[0]?.id || null;
}
function download(data, name) {
  const a = el('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '_') + '.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function openDialog(title, wide = false) {
  closeMobileTools();
  if ($('dialog').open) { if (!closeDialog()) return null; }
  const body = $('dialog-body'); body.replaceChildren(); $('dialog').classList.toggle('wide', wide);
  const heading = el('div', 'dialog-heading'); heading.append(el('h2', '', title), btn('×', () => closeDialog())); heading.lastChild.setAttribute('aria-label', '닫기'); body.append(heading);
  $('dialog').showModal(); return body;
}
function closeDialog(force = false) {
  if (editorDirty && !force && !confirm('아직 저장하지 않은 수정사항을 닫을까요?')) return false;
  editorDirty = false; $('dialog').close(); const cleanup = dialogCleanup; dialogCleanup = null; if (cleanup) cleanup(); return true;
}
$('dialog').addEventListener('cancel', e => { e.preventDefault(); closeDialog(); });
// The same management controls move into a small-screen drawer; IDs/handlers stay intact.
const mobileSlots = [];
function closeMobileTools() {
  for (const {node, marker} of mobileSlots) { marker.replaceWith(node); }
  mobileSlots.length = 0;
  if ($('mobile-tools').open) $('mobile-tools').close();
  $('mobile-menu-btn').setAttribute('aria-expanded', 'false');
}
$('mobile-menu-btn').onclick=()=>{
  for(const selector of ['.app-header','.sidebar','.page-heading']) {
    const node=document.querySelector(selector), marker=document.createComment('mobile-tools-slot');
    node.replaceWith(marker); mobileSlots.push({node,marker}); $('mobile-tools-body').append(node);
  }
  $('mobile-menu-btn').setAttribute('aria-expanded','true');$('mobile-tools').showModal();
};
$('mobile-menu-close').onclick=closeMobileTools;
$('mobile-tools').addEventListener('cancel',e=>{e.preventDefault();closeMobileTools();});
$('mobile-tools').addEventListener('close',closeMobileTools);
matchMedia('(max-width:700px)').addEventListener('change',e=>{if(!e.matches)closeMobileTools();});
try { $('breathing-toggle').checked=localStorage.getItem('interviewBreathing')!=='off'; } catch {}
function answerNode(text) {
  const node=el('p','answer');node.dataset.original=text||'아직 답변이 없습니다.';
  node.textContent=$('breathing-toggle').checked?breathingText(node.dataset.original):node.dataset.original;
  return node;
}
$('breathing-toggle').onchange=()=>{
  try { localStorage.setItem('interviewBreathing',$('breathing-toggle').checked?'on':'off'); } catch {}
  document.querySelectorAll('.answer[data-original]').forEach(n=>n.textContent=$('breathing-toggle').checked?breathingText(n.dataset.original):n.dataset.original);
};
function field(parent, title, control) { const l = el('label', 'field', title); l.append(control); parent.append(l); return control; }
function input(value = '', placeholder = '') { const i = el('input'); i.value = value; i.placeholder = placeholder; return i; }
function footer(parent, ...buttons) { const f = el('div', 'dialog-footer'); f.append(...buttons); parent.append(f); return f; }
function errorBox(parent) { const e = el('p', 'error'); e.setAttribute('role', 'alert'); parent.append(e); return e; }

const sync = new GitHubSync({
  getLocal: () => state.data, getBase: () => state.base,
  setBase: value => { state.base = clone(value); localSave(); },
  apply: value => { if (!equal(value, state.data)) { backup('동기화 전'); state.data = clone(value); safeSelection(); localSave(); render(); } },
  resolve: resolveConflicts,
  status: (type, text) => { $('sync-status').dataset.state = type; $('sync-status').textContent = text; },
});
async function runSync(write = false) {
  if (staleTab) return message('다른 탭에서 변경했어요. 새로고침 후 동기화해주세요.');
  if (storageBroken) return message('브라우저 저장소를 확인하고 먼저 JSON을 내보내주세요.');
  if ($('dialog').open || sync.busy) { if (write && sync.token) { clearTimeout(saveTimer); saveTimer = setTimeout(() => runSync(true), 2500); } return; }
  if (write && !sync.token) return settings();
  const completed = await sync.sync(write);
  if (completed && sync.token && !equal(state.data, state.base) && $('sync-status').dataset.state !== 'error') {
    clearTimeout(saveTimer); saveTimer = setTimeout(() => runSync(true), 2500);
  }
}
function conflictName(path, local, remote) {
  const pieces = path.split('/');
  const all = [...local.companies, ...remote.companies];
  return pieces.filter(Boolean).map(p => {
    const company = all.find(c => c.id === p); if (company) return company.name;
    const category = all.flatMap(c => c.categories).find(c => c.id === p); if (category) return category.name;
    const question = all.flatMap(c => c.categories.flatMap(k => k.questions)).find(q => q.id === p); if (question) return question.question;
    const follow = all.flatMap(c => c.categories.flatMap(k => k.questions.flatMap(q => q.followUps || []))).find(f => f.id === p); if (follow) return follow.question;
    return { companies: '', categories: '', questions: '', followUps: '꼬리질문', answer: '답변', question: '질문', keywords: '키워드', favorite: '중요 표시', status: '준비 상태', name: '이름' }[p] ?? p;
  }).filter(Boolean).join(' › ');
}
function resolveConflicts(base, local, remote, conflicts) {
  return new Promise(resolve => {
    const body = openDialog(base ? '양쪽에서 수정한 내용 확인' : '기존 수정본을 확인해주세요', true);
    if (!body) return resolve(null);
    dialogCleanup = () => resolve(null);
    body.append(el('p', 'note', base ? '다른 기기와 같은 항목을 수정했어요. 항목별로 사용할 내용을 선택해주세요. 서로 다른 항목의 수정은 함께 반영합니다.' : '이 기기의 기존 내용과 GitHub 내용이 달라요. 같은 기업은 아래에서 고른 쪽의 내용을 사용하고, 한쪽에만 있는 기업은 함께 유지합니다. 현재 기기의 원본은 복구용으로 보관합니다.'));
    const choices = {};
    const describe = value => value === undefined ? '(삭제됨)' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (!base) {
      const desc = d => d.companies.map(c => `${c.name}: ${count(c)}문항`).join('\n');
      const box = el('div', 'field-row');
      for (const [key, label, data] of [['local','이 기기 내용',local],['remote','GitHub 내용',remote]]) {
        const card = el('div', 'conflict-card'); card.append(el('h3','',label),el('p','conflict-value',desc(data)));
        card.append(btn('이쪽 기준으로 합치기', () => { const merged=clone(data); const other=key==='local'?remote:local; for(const company of other.companies) if(!merged.companies.some(c=>c.id===company.id||c.name===company.name)) merged.companies.push(clone(company)); backup('첫 동기화 선택 전'); dialogCleanup = null; closeDialog(true); resolve(merged); }, 'primary')); box.append(card);
      } body.append(box);
    } else {
      for (const c of conflicts) {
        const card = el('section', 'conflict-card'); card.append(el('h3', '', conflictName(c.path, local, remote)));
        for (const [key, label] of [['local','이 기기'],['remote','GitHub']]) {
          const radio = input(); radio.type = 'radio'; radio.name = c.path; radio.value = key; radio.onchange = () => choices[c.path] = key;
          const l = el('label','',label); l.prepend(radio); card.append(l, el('div','conflict-value',describe(c[key])));
        } body.append(card);
      }
      const err = errorBox(body);
      footer(body, btn('취소', () => closeDialog()), btn('선택한 내용 반영', () => {
        if (conflicts.some(c => !choices[c.path])) { err.textContent = '모든 항목의 사용할 내용을 선택해주세요.'; return; }
        const merged = mergeDocuments(base, local, remote, choices).data;
        backup('충돌 해결 전'); dialogCleanup = null; closeDialog(true); resolve(merged);
      }, 'primary'));
    }
    body.append(btn('이 기기 원본 내려받기', () => download(local, '동기화-전-백업')));
  });
}
function settings() {
  const body = openDialog('GitHub 저장 연결'); if (!body) return;
  body.append(el('p', 'note', '연결 후 수정사항은 GitHub에 자동 저장됩니다. 읽기만 하는 기기는 연결하지 않아도 최신 노트를 불러올 수 있어요. 연결 키는 현재 페이지 메모리에서만 사용하며, 새로고침하거나 닫으면 다시 입력해야 합니다.'));
  const instructions = el('ol','muted');
  for (const t of ['GitHub에서 Fine-grained personal access token을 만드세요.', 'Repository access: Only select repositories → interview를 선택하세요.', 'Repository permissions: Contents를 Read and write로 설정하세요. 다른 권한은 필요하지 않습니다.', '발급받은 키를 아래에 입력하세요. 채팅이나 저장소 파일에 붙여넣지 마세요.']) instructions.append(el('li','',t));
  const link = el('a','', 'GitHub에서 연결 키 만들기 ↗'); link.href = 'https://github.com/settings/personal-access-tokens/new'; link.target = '_blank'; link.rel = 'noopener noreferrer';
  body.append(instructions,link,el('p','note warning','현재 interview 저장소는 공개 상태입니다. GitHub에 저장한 질문·답변은 공개되며, 입장 비밀번호로 데이터 파일을 보호할 수는 없습니다.'));
  const token = field(body,'GitHub 연결 키',input('','github_pat_…')); token.type = 'password'; token.autocomplete = 'off'; token.spellcheck = false;
  const consent=input();consent.type='checkbox';const consentLabel=el('label','note','내가 저장하는 질문·답변이 이 공개 GitHub 저장소에 공개되는 것을 이해하고 동의합니다.');consentLabel.prepend(consent);body.append(consentLabel);
  const err = errorBox(body);
  footer(body,btn('연결 해제',()=>{sync.disconnect(); clearTimeout(saveTimer); closeDialog(); message('쓰기 연결을 해제했어요. 저장된 노트는 유지됩니다.');}),btn('취소',()=>closeDialog()),btn('연결하고 동기화',async()=>{
    if(!consent.checked){err.textContent='공개 저장 범위에 동의한 경우에만 연결할 수 있어요.';return;}
    if (!token.value.trim()) { err.textContent='연결 키를 입력해주세요.'; return; }
    sync.connect(token.value); token.value=''; closeDialog(true); await runSync(true);
  },'primary'));
}

function render() {
  safeSelection(); const company = current();
  $('companies').replaceChildren();
  orderedCompanies().forEach(c => {
    const b=btn('',()=>{state.selected=c.id;closeMobileTools();selected.clear();$('search').value='';$('category-filter').value='all';localSave();stopLive();render();});
    b.append(el('span','',c.name),el('small','',count(c)));b.classList.toggle('active',c.id===company?.id);if(c.id===company?.id)b.setAttribute('aria-current','page');$('companies').append(b);
  });
  $('company-title').textContent=company?.name||'새 기업을 추가해보세요';
  $('mobile-menu-btn').textContent=(company?.name||'기업')+' · 메뉴';
  document.querySelector('.reading-options').hidden=view==='manage';
  const qs=company?flat(company):[];
  const follows=qs.reduce((n,q)=>n+(q.followUps?.length||0),0);
  $('company-count').textContent=`기본 ${qs.length} · 꼬리 ${follows} · 중요 ${qs.filter(q=>q.favorite).length} · 준비 완료 ${qs.filter(q=>q.status==='ready').length}`;
  for(const id of ['add-question-btn','company-menu-btn','copy-questions-btn','bulk-btn','category-btn']) $(id).disabled=!company;
  const oldFilter=$('category-filter').value;$('category-filter').replaceChildren(option('all','전체 카테고리'));
  company?.categories.forEach(c=>$('category-filter').append(option(c.id,c.name)));
  if([...$('category-filter').options].some(o=>o.value===oldFilter))$('category-filter').value=oldFilter;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-selected',String(b.dataset.view===view));});
  $('workspace').hidden=view==='live';$('live').hidden=view!=='live';$('keyword-only-label').hidden=view==='manage';
  $('copy-questions-btn').hidden=view!=='manage';$('bulk-btn').hidden=view!=='manage';
  if(view==='live') renderLive(); else renderList();
}
function filtered() {
  const text=$('search').value.trim().toLowerCase(),category=$('category-filter').value,status=$('status-filter').value;
  return (current()?flat(current()):[]).filter(q=>
    (view!=='starred'||q.favorite)&&(category==='all'||q.categoryId===category)&&
    (status==='all'||status==='empty'&&!q.answer.trim()||status==='favorite'&&q.favorite||(q.status||'draft')===status)&&
    (!text||[q.question,q.answer,...q.keywords,...(q.followUps||[]).flatMap(f=>[f.question,f.answer,...(f.keywords||[])])].join(' ').toLowerCase().includes(text)));
}
function followUpPanel(q) {
  if(!q.followUps?.length)return null;
  const panel=el('details','follow-ups'),summary=el('summary');
  summary.append(el('span','',`꼬리질문 ${q.followUps.length}개`),el('span','follow-hint','필요할 때 펼쳐보기'));
  panel.append(summary);
  const list=el('div','follow-list');
  q.followUps.forEach((f,i)=>{
    const item=el('details','follow-item'),title=el('summary','',`${i+1}. ${f.question}`),content=el('div','follow-answer');
    if(f.keywords?.length){const chips=el('div','chips');f.keywords.forEach(k=>chips.append(el('span','chip',k)));content.append(chips);}
    content.append(answerNode(f.answer));
    item.append(title,content);list.append(item);
  });
  panel.append(list);return panel;
}
function starButton(q) {
  const b=btn(q.favorite?'★':'☆',e=>{e.preventDefault();e.stopPropagation();const loc=locate(q.id);loc.q.favorite=!loc.q.favorite;changed();render();},'star'+(q.favorite?' on':''));
  b.setAttribute('aria-label',q.favorite?'중요 질문 해제':'중요 질문 표시');b.setAttribute('aria-pressed',String(q.favorite));return b;
}
function locate(id) { const c=current();for(const cat of c.categories){const q=cat.questions.find(q=>q.id===id);if(q)return{q,cat};} }
function renderList() {
  const questions=filtered(),root=$('question-list');root.replaceChildren();$('result-count').textContent=`${questions.length}개 질문`;
  $('bulk-actions').hidden=!selected.size||view!=='manage';$('selected-count').textContent=`${selected.size}개 선택`;
  if(!questions.length){const empty=el('div','empty');empty.append(el('h2','',view==='starred'?'중요 질문을 골라보세요':'표시할 질문이 없어요'),el('p','',view==='starred'?'질문 옆 별표를 누르면 이곳과 실전 연습에서 볼 수 있어요.':'검색·필터를 바꾸거나 질문을 추가해주세요.'));root.append(empty);return;}
  for(const cat of current().categories){const items=questions.filter(q=>q.categoryId===cat.id);if(!items.length)continue;
    const heading=el('div','category-heading');
    if(view==='manage'){const check=input();check.type='checkbox';check.setAttribute('aria-label',cat.name+' 전체 선택');check.checked=items.every(q=>selected.has(q.id));check.indeterminate=!check.checked&&items.some(q=>selected.has(q.id));check.onchange=()=>{items.forEach(q=>check.checked?selected.add(q.id):selected.delete(q.id));renderList();};heading.append(check);}
    heading.append(el('span','',`${cat.name} · ${items.length}`));root.append(heading);
    items.forEach(q=>{
      if(view==='manage'){
        const row=el('div','question-row');const check=input();check.type='checkbox';check.checked=selected.has(q.id);check.setAttribute('aria-label','선택: '+q.question);check.onchange=()=>{check.checked?selected.add(q.id):selected.delete(q.id);renderList();};
        const main=btn('',()=>editQuestion(q.id),'question-main');main.append(el('span','question-title',q.question),el('span','question-preview',q.answer.replace(/\s+/g,' ')||'답변을 작성해주세요'));
        if(q.followUps?.length)main.append(el('span','follow-count',`↳ 꼬리질문 ${q.followUps.length}개`));
        const reorder=el('div','reorder');for(const [arrow,offset]of[['↑',-1],['↓',1]]){const b=btn(arrow,()=>{move(cat.questions,q.id,offset);changed();renderList();});b.disabled=cat.questions.findIndex(x=>x.id===q.id)+(offset)<0||cat.questions.findIndex(x=>x.id===q.id)+offset>=cat.questions.length;b.setAttribute('aria-label',q.question+' '+(offset<0?'위로':'아래로'));reorder.append(b);}
        row.append(check,starButton(q),main,el('span','status-badge status-'+(q.status||'draft'),statuses[q.status]||statuses.draft),reorder);root.append(row);
      }else{
        const card=el('details','study-card');const summary=el('summary');summary.append(el('span','question-title',q.question),starButton(q));const body=el('div','study-body');
        const chips=el('div','chips');q.keywords.forEach(k=>chips.append(el('span','chip',k)));body.append(chips);
        if(!$('keyword-only').checked)body.append(answerNode(q.answer));else if(!q.keywords.length)body.append(el('p','muted','키워드가 없어요. 수정에서 답변 속 문구를 선택해 추가할 수 있어요.'));
        const follows=followUpPanel(q);if(follows)body.append(follows);
        body.append(btn('질문·답변 수정',()=>editQuestion(q.id)));card.append(summary,body);root.append(card);
      }
    });
  }
}
function editQuestion(id=null) {
  const existing=id?locate(id):null,company=current();if(!company)return;
  const body=openDialog(existing?'질문·답변 수정':'질문 추가',true);if(!body)return;
  const question=field(body,'질문',input(existing?.q.question||''));
  const row=el('div','field-row');body.append(row);
  const category=field(row,'카테고리',input(existing?.cat.name||company.categories[0]?.name||'기본 질문'));category.setAttribute('list','editor-categories');const dl=el('datalist');dl.id='editor-categories';company.categories.forEach(c=>dl.append(option(c.name,c.name)));body.append(dl);
  const status=el('select');Object.entries(statuses).forEach(([k,v])=>status.append(option(k,v)));status.value=existing?.q.status||'draft';field(row,'준비 상태',status);
  const answer=el('textarea');answer.value=existing?.q.answer||'';answer.rows=11;field(body,'답변',answer);
  const keywordInput=el('textarea','keywords-editor');keywordInput.value=(existing?.q.keywords||[]).join(' → ');keywordInput.rows=2;field(body,'기억할 키워드 / 말할 순서',keywordInput);
  body.append(el('p','muted','화살표(→), 쉼표 또는 줄바꿈으로 구분하세요. 추천은 답변에 실제 있는 문구만 찾으며 AI 요약은 아닙니다. 기존 키워드는 직접 바꾸기 전까지 유지됩니다.'));
  let selection='';answer.addEventListener('select',()=>selection=answer.value.slice(answer.selectionStart,answer.selectionEnd).trim());
  function addKeyword(value){const keys=keywordInput.value.split(/→|,|\n/).map(x=>x.trim()).filter(Boolean);if(value&&!keys.includes(value)){keywordInput.value=[...keys,value].join(' → ');editorDirty=true;}}
  const tools=el('div','keyword-tools'),suggestions=el('div','suggestions');
  tools.append(btn('선택한 답변 문구 추가',()=>{if(!selection)return message('답변에서 기억할 문구를 먼저 선택해주세요.');addKeyword(selection);}),btn('키워드 추천',()=>{suggestions.replaceChildren();const list=suggestKeywords(answer.value);if(!list.length)suggestions.append(el('p','muted','추천할 문구가 없어요. 답변에서 중요한 부분을 선택해 추가해보세요.'));list.forEach(k=>suggestions.append(btn('+ '+k,()=>addKeyword(k))));}));body.append(tools,suggestions);
  const followDraft=clone(existing?.q.followUps||[]),followEditor=el('details','follow-editor'),followSummary=el('summary'),followList=el('div','follow-editor-list');
  followEditor.append(followSummary,el('p','muted','기본 답변에는 섞이지 않습니다. 연습할 때 필요하면 펼쳐볼 수 있어요.'),followList);
  function drawFollowEditor(focusId=null){
    followSummary.textContent=`꼬리질문 관리 · ${followDraft.length}개`;followList.replaceChildren();
    followDraft.forEach((f,i)=>{
      const row=el('section','follow-edit-row'),head=el('div','follow-edit-head');head.append(el('strong','',`꼬리질문 ${i+1}`));
      for(const [arrow,offset]of[['↑',-1],['↓',1]]){const b=btn(arrow,()=>{move(followDraft,f.id,offset);editorDirty=true;drawFollowEditor(f.id);},'small');b.disabled=i+offset<0||i+offset>=followDraft.length;b.setAttribute('aria-label',`꼬리질문 ${i+1} ${offset<0?'위로':'아래로'}`);head.append(b);}
      const remove=btn('삭제',()=>{followDraft.splice(i,1);editorDirty=true;drawFollowEditor();},'small danger');remove.setAttribute('aria-label',`꼬리질문 ${i+1} 삭제`);head.append(remove);row.append(head);
      const title=field(row,`꼬리질문 ${i+1} 질문`,input(f.question));title.oninput=()=>f.question=title.value;
      const text=el('textarea','follow-textarea');text.rows=4;text.value=f.answer;field(row,`꼬리질문 ${i+1} 답변`,text);text.oninput=()=>f.answer=text.value;
      const keys=field(row,`꼬리질문 ${i+1} 키워드 (선택)`,input((f.keywords||[]).join(' → ')));keys.oninput=()=>f.keywords=keys.value.split(/→|,|\n/).map(x=>x.trim()).filter(Boolean);
      followList.append(row);if(focusId===f.id)queueMicrotask(()=>title.focus());
    });
  }
  followEditor.append(btn('+ 꼬리질문 추가',()=>{const f={id:uid('follow'),question:'',answer:'',keywords:[]};followDraft.push(f);followEditor.open=true;editorDirty=true;drawFollowEditor(f.id);},'small'));
  drawFollowEditor();body.append(followEditor);
  const favorite=input();favorite.type='checkbox';favorite.checked=!!existing?.q.favorite;const favLabel=el('label','field','중요 질문으로 표시');favLabel.prepend(favorite);body.append(favLabel);
  const err=errorBox(body);body.addEventListener('input',()=>editorDirty=true);
  function save(){
    if(staleTab){err.textContent='다른 탭에서 내용이 변경됐어요. 입력 내용을 복사한 뒤 새로고침해주세요.';return;}
    if(!question.value.trim()||!category.value.trim()){err.textContent='질문과 카테고리를 입력해주세요.';return;}
    if(followDraft.some(f=>!f.question.trim())){err.textContent='비어 있는 꼬리질문의 질문을 입력하거나 삭제해주세요.';followEditor.open=true;return;}
    let target=company.categories.find(c=>c.name===category.value.trim());if(!target){target={id:uid('cat'),name:category.value.trim(),questions:[]};company.categories.push(target);}
    const q={...(existing?clone(existing.q):{id:uid('q'),subcategory:null}),question:question.value.trim(),answer:answer.value.trim(),keywords:[...new Set(keywordInput.value.split(/→|,|\n/).map(x=>x.trim()).filter(Boolean))],favorite:favorite.checked,status:status.value};
    if(followDraft.length||existing?.q.followUps)q.followUps=followDraft.map(f=>({...f,question:f.question.trim(),answer:f.answer.trim(),keywords:[...new Set(f.keywords||[])]}));
    if(existing&&existing.cat.id===target.id)existing.cat.questions[existing.cat.questions.findIndex(x=>x.id===id)]=q;
    else{if(existing)existing.cat.questions=existing.cat.questions.filter(x=>x.id!==id);target.questions.push(q);}
    changed();closeDialog(true);render();message('저장했어요.');
  }
  footer(body,btn('취소',()=>closeDialog()),btn('저장',save,'primary'));
  body.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();save();}});question.focus();
}

function companyDialog(edit=false) {
  const company=current();const body=openDialog(edit?'기업 관리':'기업 추가');if(!body)return;
  const name=field(body,'기업명',input(edit?company.name:'','예: 골프존'));const err=errorBox(body);
  if(!edit)body.append(el('p','note','빈 노트로 시작합니다. 추가 후 「다른 기업에서 가져오기」에서 질문만 또는 질문·답변을 골라 복사할 수 있어요. 회사명은 자동 치환하지 않습니다.'));
  if(edit)body.append(btn('이 기업 내보내기',()=>download(documentOf([company]),company.name+'-면접준비')));
  footer(body,...(edit?[btn('기업 삭제',()=>{if(!confirm(`${company.name}의 ${count(company)}개 질문을 삭제할까요? 복구용 백업은 남습니다.`))return;backup('기업 삭제 전');state.data.companies=state.data.companies.filter(c=>c.id!==company.id);selected.clear();changed();closeDialog(true);render();},'danger spacer')]:[]),btn('취소',()=>closeDialog()),btn(edit?'저장':'기업 만들기',()=>{
    if(!name.value.trim()){err.textContent='기업명을 입력해주세요.';return;}
    if(state.data.companies.some(c=>c.name===name.value.trim()&&(!edit||c.id!==company.id))){err.textContent='같은 이름의 기업이 있어요. 다른 이름을 입력해주세요.';return;}
    if(edit)company.name=name.value.trim();else{const c=newCompany(name.value);state.data.companies.push(c);state.selected=c.id;}
    changed();closeDialog(true);selected.clear();render();
  },'primary'));
}
function categoriesDialog() {
  const company=current(),body=openDialog('카테고리와 표시 순서');if(!body)return;
  const list=el('div');body.append(el('p','muted','위·아래 버튼으로 카테고리 순서를 바꾸세요. 질문의 순서는 질문 관리 목록에서 바꿀 수 있어요.'),list);
  const draft=clone(company.categories);
  function draw(){list.replaceChildren();draft.forEach((cat,i)=>{const row=el('div','rename-row');const name=input(cat.name);name.setAttribute('aria-label','카테고리 이름');name.oninput=()=>{cat.name=name.value;editorDirty=true;};row.append(name);
    for(const [text,offset]of[['↑',-1],['↓',1]]){const b=btn(text,()=>{move(draft,cat.id,offset);editorDirty=true;draw();});b.disabled=i+offset<0||i+offset>=draft.length;row.append(b);}
    if(!cat.questions.length)row.append(btn('삭제',()=>{draft.splice(i,1);editorDirty=true;draw();},'danger'));list.append(row);});}
  draw();body.append(btn('+ 카테고리 추가',()=>{draft.push({id:uid('cat'),name:'새 카테고리',questions:[]});editorDirty=true;draw();}));const err=errorBox(body);
  footer(body,btn('취소',()=>closeDialog()),btn('순서와 이름 저장',()=>{const names=draft.map(c=>c.name.trim());if(names.some(n=>!n)||new Set(names).size!==names.length){err.textContent='빈 이름이나 중복된 이름을 수정해주세요.';return;}draft.forEach(c=>c.name=c.name.trim());company.categories=draft;changed();closeDialog(true);render();},'primary'));
}
function copyQuestions() {
  const body=openDialog('다른 기업에서 질문 가져오기',true);if(!body)return;const target=current();
  const sources=state.data.companies.filter(c=>c.id!==target.id);if(!sources.length){body.append(el('p','note','먼저 다른 기업을 추가하거나 JSON을 가져와주세요.'));return;}
  const source=el('select');sources.forEach(c=>source.append(option(c.id,c.name)));field(body,'가져올 기업',source);
  const mode=el('select');mode.append(option('questions','질문만 가져오기 · 답변은 새로 작성'),option('all','질문과 답변 함께 가져오기 · 검토 필요로 표시'));field(body,'가져올 내용',mode);
  body.append(el('p','note','원본은 유지됩니다. 복사한 답변의 회사명과 지원동기는 새 기업에 맞게 직접 확인해주세요.'));
  const list=el('div','check-list'),picked=new Set();body.append(list);
  function draw(){list.replaceChildren();const c=sources.find(c=>c.id===source.value);for(const cat of c.categories){const parent=el('label','cat-label',cat.name);const check=input();check.type='checkbox';check.onchange=()=>{cat.questions.forEach(q=>check.checked?picked.add(q.id):picked.delete(q.id));draw();};check.checked=cat.questions.length>0&&cat.questions.every(q=>picked.has(q.id));parent.prepend(check);list.append(parent);cat.questions.forEach(q=>{const l=el('label','',q.question),b=input();b.type='checkbox';b.checked=picked.has(q.id);b.onchange=()=>{b.checked?picked.add(q.id):picked.delete(q.id);};l.prepend(b);list.append(l);});}}
  source.onchange=()=>{picked.clear();draw();};draw();const err=errorBox(body);
  footer(body,btn('취소',()=>closeDialog()),btn('선택한 질문 복사',()=>{if(!picked.size){err.textContent='가져올 질문을 선택해주세요.';return;}const copied=newCompany(target.name,sources.find(c=>c.id===source.value),picked,mode.value==='questions');for(const cat of copied.categories){cat.questions.forEach(q=>q.status=mode.value==='all'?'review':'draft');const match=target.categories.find(c=>c.name===cat.name);if(match)match.questions.push(...cat.questions);else target.categories.push(cat);}changed();closeDialog(true);render();message(`${picked.size}개 질문을 가져왔어요.`);},'primary'));
}
function bulkPaste() {
  const body=openDialog('여러 질문·답변 붙여넣기',true);if(!body)return;
  body.append(el('p','note','카테고리는 # 제목, 질문은 Q. 로 시작하세요. A. 는 생략해도 됩니다. 기존 문항은 그대로 유지하고 새 문항을 추가합니다.'));
  const text=el('textarea');text.rows=13;text.placeholder='# 자기소개\nQ. 간단히 자기소개해주세요.\nA. 답변 내용\n키워드: 경력 → 강점 → 기여\n\nQ. 이직 이유는 무엇인가요?\nA. 답변 내용';field(body,'질문·답변',text);
  const preview=el('div','note');preview.hidden=true;body.append(preview);const err=errorBox(body);let parsed;
  text.oninput=()=>{editorDirty=true;parsed=null;preview.hidden=true;};
  footer(body,btn('취소',()=>closeDialog()),btn('미리보기',()=>{try{parsed=parseBulk(text.value);preview.hidden=false;preview.textContent=parsed.map(c=>`${c.name}: ${c.questions.length}개\n`+c.questions.map(q=>'• '+q.question).join('\n')).join('\n');preview.style.whiteSpace='pre-wrap';err.textContent='';}catch(e){err.textContent=e.message;}}),btn('미리본 문항 추가',()=>{if(!parsed){err.textContent='먼저 미리보기로 문항을 확인해주세요.';return;}for(const cat of parsed){const match=current().categories.find(c=>c.name===cat.name);if(match)match.questions.push(...cat.questions);else current().categories.push(cat);}changed();closeDialog(true);render();},'primary'));
}
function transferDialog() {
  const body=openDialog('기업별 가져오기 / 내보내기');if(!body)return;
  body.append(el('h3','','내보내기'));const list=el('div','check-list'),picked=new Set(current()?[current().id]:[]);body.append(list);
  orderedCompanies().forEach(c=>{const check=input();check.type='checkbox';check.checked=picked.has(c.id);check.onchange=()=>check.checked?picked.add(c.id):picked.delete(c.id);const label=el('label','',`${c.name} · ${count(c)}개 질문`);label.prepend(check);list.append(label);});
  body.append(btn('선택한 기업 내보내기',()=>{if(!picked.size)return message('내보낼 기업을 선택해주세요.');const companies=state.data.companies.filter(c=>picked.has(c.id));download(documentOf(companies),companies.length===1?companies[0].name+'-면접준비':'면접준비-선택기업');}));
  body.append(el('h3','','JSON 가져오기'));const file=el('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','면접 JSON 파일 선택');body.append(file,el('p','muted','전체 파일을 교체하지 않습니다. 파일 안에서 가져올 기업과 처리 방법을 선택할 수 있어요.'));
  const err=errorBox(body);
  file.onchange=async()=>{if(!file.files[0])return;try{const imported=validate(JSON.parse(await file.files[0].text()));closeDialog(true);importPreview(imported);}catch(e){err.textContent=e.message;} };
  if(state.backups.length){body.append(el('h3','','이 기기의 복구용 백업'));const backups=el('div','check-list');state.backups.forEach((b,i)=>backups.append(btn(`${new Date(b.date).toLocaleString('ko-KR')} · ${b.reason}`,()=>download(b.data,'면접준비-복구백업-'+(i+1)))));body.append(backups);}
  footer(body,btn('닫기',()=>closeDialog()));
}
function importPreview(imported) {
  const body=openDialog('가져올 기업 확인',true);if(!body)return;const decisions=[];
  body.append(el('p','note','기존 기업과 이름 또는 ID가 같으면 기본적으로 사본을 만듭니다. 「기존 기업 교체」를 직접 선택한 경우에만 해당 기업을 바꾸며, 다른 기업은 유지합니다.'));
  for(const c of imported.companies){
    const match=state.data.companies.find(x=>x.id===c.id)||state.data.companies.find(x=>x.name===c.name);
    const card=el('div','conflict-card');card.append(el('h3','',`${c.name} · ${count(c)}개 질문`));
    const select=el('select');select.append(option('skip','가져오지 않음'),option('copy',match?'새 사본으로 가져오기':'새 기업으로 가져오기'));if(match)select.append(option('replace',`기존 「${match.name}」 교체`));select.value='copy';select.setAttribute('aria-label',c.name+' 가져오기 방식');card.append(select);body.append(card);decisions.push({c,match,select});
  }
  footer(body,btn('취소',()=>closeDialog()),btn('선택한 기업 가져오기',()=>{
    const chosen=decisions.filter(d=>d.select.value!=='skip');if(!chosen.length)return message('가져올 기업을 선택해주세요.');
    if(chosen.some(d=>d.select.value==='replace')&&!confirm('선택한 기존 기업을 파일 내용으로 교체할까요? 현재 원본은 복구용 백업에 남습니다.'))return;
    backup('JSON 가져오기 전');let first;
    for(const {c,match,select}of chosen){
      if(select.value==='replace'){const replacement=clone(c);replacement.id=match.id;state.data.companies[state.data.companies.findIndex(x=>x.id===match.id)]=replacement;first??=replacement.id;}
      else{const copied=clone(c);if(state.data.companies.some(x=>x.id===copied.id))copied.id=uid('company');let suffix=1;const originalName=copied.name;while(state.data.companies.some(x=>x.name===copied.name))copied.name=`${originalName} (가져옴 ${suffix++})`;state.data.companies.push(copied);first??=copied.id;}
    }
    state.selected=first;selected.clear();changed();closeDialog(true);render();message(`${chosen.length}개 기업을 가져왔어요.`);
  },'primary'));
}
function bulkMove(){
  const body=openDialog('선택한 질문 분류 이동');if(!body)return;const category=el('select');current().categories.forEach(c=>category.append(option(c.id,c.name)));field(body,'이동할 카테고리',category);
  footer(body,btn('취소',()=>closeDialog()),btn('이동',()=>{const company=current(),target=company.categories.find(c=>c.id===category.value);const questions=flat(company).filter(q=>selected.has(q.id)).map(q=>clone(locate(q.id).q));company.categories.forEach(c=>c.questions=c.questions.filter(q=>!selected.has(q.id)));target.questions.push(...questions);selected.clear();changed();closeDialog(true);render();},'primary'));
}
function batchKeywords(){
  const candidates=filtered().filter(q=>(!selected.size||selected.has(q.id))&&!q.keywords.length&&q.answer.trim());
  const body=openDialog('빈 키워드 한 번에 채우기',true);if(!body)return;body.append(el('p','note','현재 검색·필터 범위에서 키워드가 비어 있는 답변만 제안합니다. 문항을 선택했다면 선택 문항만 대상으로 합니다. AI 없이 답변 속 용어를 찾는 방식이므로, 말할 순서는 직접 확인해주세요.'));
  const proposals=[];
  for(const q of candidates){const keywords=suggestKeywords(q.answer);if(!keywords.length)continue;const card=el('div','conflict-card'),check=input();check.type='checkbox';check.checked=true;const label=el('label','',q.question);label.prepend(check);const text=input(keywords.join(' → '));text.style.width='100%';text.setAttribute('aria-label',q.question+' 추천 키워드');card.append(label,text);body.append(card);proposals.push({q,check,text});}
  if(!proposals.length)body.append(el('p','muted','추천할 빈 키워드가 없어요. 개별 수정에서 답변 문구를 선택해 추가할 수 있습니다.'));
  footer(body,btn('취소',()=>closeDialog()),btn('확인한 키워드 적용',()=>{let n=0;for(const {q,check,text}of proposals){if(check.checked){locate(q.id).q.keywords=[...new Set(text.value.split(/→|,|\n/).map(x=>x.trim()).filter(Boolean))];n++;}}if(n){changed();render();}closeDialog(true);message(`${n}개 문항의 키워드를 저장했어요.`);},'primary'));
}
function stopLive(){clearInterval(clock);liveSession=null;$('live').classList.remove('live-stage');document.body.classList.remove('live-running');}
function renderLive(){
  const root=$('live');root.replaceChildren();
  const running=!!liveSession&&liveSession.index<liveSession.questions.length;
  root.classList.toggle('live-stage',running);document.body.classList.toggle('live-running',running);
  if(!liveSession){
    const card=el('div','live-card live-setup');card.append(el('p','eyebrow','PRACTICE OUT LOUD'),el('h2','','한 질문씩, 내 말로 답해보세요.'),el('p','muted','답변을 먼저 가리고 시간을 재며 연습합니다. 중요 질문 또는 전체 질문을 선택할 수 있어요.'));
    const settings=el('div','field-row');card.append(settings);const scope=el('select');scope.append(option('favorite','중요 질문'),option('all','전체 질문'));field(settings,'연습 범위',scope);const order=el('select');order.append(option('ordered','정해둔 순서대로'),option('random','무작위 순서'));field(settings,'질문 순서',order);
    card.append(btn('연습 시작',()=>{let qs=current()?flat(current()).filter(q=>scope.value==='all'||q.favorite):[];if(!qs.length)return message('연습할 질문이 없어요. 중요 표시를 하거나 전체 질문을 선택해주세요.');if(order.value==='random'){qs=[...qs];for(let i=qs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[qs[i],qs[j]]=[qs[j],qs[i]];}}liveSession={questions:qs,index:0,reveal:false,start:Date.now()};renderLive();},'primary'));root.append(card);return;
  }
  clearInterval(clock);const s=liveSession,card=el('div','live-card');
  if(s.index>=s.questions.length){card.append(el('h2','','준비한 질문을 모두 연습했어요.'),btn('다시 설정하기',()=>{stopLive();renderLive();},'primary'));root.append(card);return;}
  const q=s.questions[s.index],meta=el('div','live-meta'),timer=el('span','',`${Math.floor((Date.now()-s.start)/1000)}초`);meta.append(el('span','',`${s.index+1} / ${s.questions.length}`),timer);const toolbar=el('div','live-toolbar');toolbar.append(btn('연습 종료',()=>{stopLive();renderLive();},'live-exit'),meta);root.append(toolbar);card.append(el('p','live-speaker','면접관'),el('h2','live-question',q.question));
  if(!s.reveal)clock=setInterval(()=>timer.textContent=`${Math.floor((Date.now()-s.start)/1000)}초`,1000);
  if(s.reveal){const response=el('div','live-response');response.tabIndex=0;response.setAttribute('role','region');response.setAttribute('aria-label','모범 답변과 꼬리질문');const chips=el('div','chips');q.keywords.forEach(k=>chips.append(el('span','chip',k)));response.append(chips,answerNode(q.answer));const follows=followUpPanel(q);if(follows)response.append(follows);card.append(response);}
  const actions=el('div','actions');actions.append(btn(s.reveal?'다음 질문':'답변 확인',()=>{if(s.reveal){s.index++;s.reveal=false;s.start=Date.now();}else s.reveal=true;renderLive();},'primary'),btn('종료',()=>{stopLive();renderLive();}));card.append(actions);root.append(card);
}

$('add-company-btn').onclick=()=>companyDialog();$('company-menu-btn').onclick=()=>companyDialog(true);
$('add-question-btn').onclick=()=>editQuestion();$('category-btn').onclick=categoriesDialog;
$('copy-questions-btn').onclick=copyQuestions;$('bulk-btn').onclick=bulkPaste;$('transfer-btn').onclick=transferDialog;
$('settings-btn').onclick=settings;$('sync-btn').onclick=()=>runSync(true);$('refresh-btn').onclick=()=>runSync(false);
$('search').oninput=renderList;$('category-filter').onchange=renderList;$('status-filter').onchange=renderList;$('keyword-only').onchange=renderList;
$('bulk-clear').onclick=()=>{selected.clear();renderList();};$('bulk-move').onclick=bulkMove;
for(const [id,value]of[['bulk-star',true],['bulk-unstar',false]])$(id).onclick=()=>{selected.forEach(id=>{const loc=locate(id);if(loc)loc.q.favorite=value;});changed();render();};
$('bulk-delete').onclick=()=>{if(!confirm(`선택한 ${selected.size}개 질문을 삭제할까요?`))return;backup('질문 삭제 전');current().categories.forEach(c=>c.questions=c.questions.filter(q=>!selected.has(q.id)));selected.clear();changed();render();};
const keywordsBtn=btn('빈 키워드 채우기',batchKeywords);$('bulk-btn').after(keywordsBtn);
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;selected.clear();stopLive();render();});
window.addEventListener('beforeunload',e=>{if(editorDirty||!equal(state.data,state.base)&&state.data.companies.length&&sync.token){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',e=>{
  if(e.key!==STORAGE||!e.newValue)return;
  try{const incoming=JSON.parse(e.newValue);if(equal(incoming.data,state.data)&&equal(incoming.base,state.base))return;}catch{}
  staleTab=true;clearTimeout(saveTimer);sync.disconnect();$('sync-status').dataset.state='error';$('sync-status').textContent='다른 탭에서 변경됨 · 이 탭을 새로고침해주세요';
  document.querySelectorAll('#app button,#app input,#app select').forEach(n=>n.disabled=true);
  $('refresh-btn').disabled=false;$('refresh-btn').onclick=()=>location.reload();
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('app').hidden&&!$('dialog').open&&!editorDirty&&view!=='live')runSync(false);});
let started=false;
async function start(){
  $('gate').hidden=true;$('app').hidden=false;render();if(started)return;started=true;
  if(storageBroken){$('sync-status').textContent='기존 저장소를 읽지 못했어요. 원본을 보존하기 위해 동기화를 중단했습니다.';$('sync-status').dataset.state='error';message('이전 버전 데이터는 유지됩니다. JSON 백업을 확인해주세요.');return;}
  if(!state.data.companies.length&&!state.base){
    try{let response=await fetch('./interview-data.json',{cache:'no-store'});if(response.status===404)response=await fetch('./'+SEED_PATH,{cache:'no-store'});if(!response.ok)throw new Error();const data=documentOf(validate(await response.json()).companies);state.base=clone(data);state.data=clone(data);safeSelection();localSave();render();}catch{message('기본 데이터를 불러오지 못했어요. 새로고침하거나 JSON을 가져와주세요.');}
  }
  await runSync(false);
  if(!staleTab&&!state.data.companies.some(c=>c.id==='golfzon'||c.name==='골프존')){state.data.companies.push({id:'golfzon',name:'골프존',createdAt:0,categories:[]});changed();render();}
}
$('gate-form').onsubmit=e=>{e.preventDefault();if($('gate-input').value.trim()==='1303'){sessionStorage.setItem('interviewGateUnlocked','1');$('gate-input').value='';start();}else{$('gate-error').textContent='비밀번호를 확인해주세요.';}};
if(sessionStorage.getItem('interviewGateUnlocked')==='1')start();
