// Integration tests use a local HTTP server and an in-memory GitHub API only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const seed=JSON.parse(fs.readFileSync('interview-data-backup-2026-09-07.json','utf8'));
seed.companies.push({id:'golfzon',name:'골프존',createdAt:0,categories:[]});
const server=require('node:child_process').spawn('python',['-m','http.server','8765'],{stdio:'ignore'});
process.on('exit',()=>server.kill());
(async()=>{
 await new Promise(r=>setTimeout(r,500));
 const browser=await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
 let remote=structuredClone(seed),sha=1,puts=0;
 const errors=[];
 async function setup(viewport){
  const context=await browser.newContext({viewport});
  await context.addInitScript(()=>sessionStorage.setItem('interviewGateUnlocked','1'));
  await context.route('https://api.github.com/repos/kimminji-design/interview/contents/interview-data.json*',async route=>{
   const request=route.request();
   if(request.method()==='PUT'){
    const data=request.postDataJSON();if(data.sha!==String(sha))return route.fulfill({status:409,body:'{}'});
    remote=JSON.parse(Buffer.from(data.content,'base64').toString('utf8'));sha++;puts++;
    return route.fulfill({json:{content:{sha:String(sha)}}});
   }
   return route.fulfill({json:{sha:String(sha),content:Buffer.from(JSON.stringify(remote)).toString('base64')}});
  });
  await context.route('http://localhost:8765/interview-data.json',route=>route.fulfill({json:seed}));
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});page.on('dialog',d=>d.accept());
  await page.goto('http://localhost:8765');await page.locator('#sync-status[data-state="saved"]').waitFor({timeout:7000,state:'attached'}).catch(async e=>{console.log('STATUS',await page.locator('#sync-status').innerText());console.log('BODY',(await page.locator('body').innerText()).slice(0,500));throw e;});return {page,context};
 }
 const {page,context}=await setup({width:1440,height:1000});
 await page.locator('#companies button').filter({hasText:'폴라리스오피스'}).click();
 assert.equal(await page.locator('.question-row').count(),91);
 await page.screenshot({path:'/tmp/interview-desktop.png',fullPage:false});
 // Empty Golfzon workspace, draft question creation and editing.
 await page.locator('#companies button').filter({hasText:'골프존'}).click();
 await page.locator('#add-question-btn').click();
 await page.getByLabel('질문',{exact:true}).fill('자기소개 테스트');
 await page.getByLabel('답변',{exact:true}).fill('8년간 정보 위계와 공통 기준을 정리했습니다. 디자인 시스템과 AI를 활용합니다.');
 await page.getByRole('button',{name:'키워드 추천',exact:true}).click();
 await page.getByRole('button',{name:'+ 정보 위계',exact:true}).click();
 await page.getByLabel('중요 질문으로 표시').check();
 await page.getByRole('button',{name:'저장',exact:true}).click();
 assert.equal(await page.locator('.question-row').count(),1);
 await page.locator('[data-view="starred"]').click();assert.equal(await page.locator('.study-card').count(),1);
 await page.locator('.study-card summary').click();assert.ok(await page.locator('.answer').innerText());
 // Existing company copy does not overwrite originals.
 await page.locator('[data-view="manage"]').click();await page.locator('#copy-questions-btn').click();
 await page.getByLabel('가져올 기업').selectOption(seed.companies[0].id);
 const questionChecks=page.locator('#dialog .check-list label:not(.cat-label) input');await questionChecks.first().check();
 await page.getByRole('button',{name:'선택한 질문 복사',exact:true}).click();assert.equal(await page.locator('.question-row').count(),2);
 // Move question down; clear category filter remains stable.
 const before=await page.locator('.question-title').allTextContents();
 await page.locator('.question-row').last().locator('.question-main').click();
 await page.getByLabel('카테고리',{exact:true}).fill('기본 질문');await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.locator('.question-row').first().locator('.reorder button').last().click();
 assert.equal((await page.locator('.question-title').allTextContents())[1],before[0]);
 // JSON export contains just selected company and no credentials.
 await page.locator('#transfer-btn').click();const exported=page.waitForEvent('download');await page.getByRole('button',{name:'선택한 기업 내보내기',exact:true}).click();
 const dl=await exported;const exportData=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));assert.equal(exportData.companies.length,1);assert.equal(exportData.companies[0].name,'골프존');
 await page.getByRole('button',{name:'닫기',exact:true}).last().click();
 // Connect and write to mock API; then read from a separate mobile browser.
 await page.locator('#settings-btn').click();await page.getByLabel('GitHub 연결 키',{exact:true}).fill('test-token-not-real');await page.getByLabel('내가 저장하는 질문·답변이 이 공개 GitHub 저장소에 공개되는 것을 이해하고 동의합니다.').check();await page.getByRole('button',{name:'연결하고 동기화'}).click();
 await page.locator('#sync-status[data-state="saved"]').waitFor({state:'attached'});assert.equal(puts,1);
 assert.ok(!(await page.evaluate(()=>localStorage.getItem('interviewWorkspace.v2'))).includes('test-token-not-real'));
 const mobile=await setup({width:390,height:844});await mobile.page.locator('#mobile-menu-btn').click();await mobile.page.locator('#companies button').filter({hasText:'골프존'}).click();
 assert.equal(await mobile.page.locator('.question-row').count(),2);
 assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mobile.page.screenshot({path:'/tmp/interview-mobile.png',fullPage:false});
 // Mobile editor, practice and additive JSON import.
 await mobile.page.locator('.question-main').first().click();
 assert.ok(await mobile.page.locator('#dialog').isVisible());
 await mobile.page.screenshot({path:'/tmp/interview-editor-mobile.png',fullPage:false});
 await mobile.page.getByRole('button',{name:'취소',exact:true}).click();
 await mobile.page.locator('[data-view="live"]').click();
 await mobile.page.getByRole('button',{name:'연습 시작',exact:true}).click();
 await mobile.page.getByRole('button',{name:'답변 확인',exact:true}).click();
 assert.ok((await mobile.page.locator('#live .answer').innerText()).includes('정보 위계'));
 await mobile.page.getByRole('button',{name:'종료',exact:true}).click();
 await mobile.page.locator('[data-view="manage"]').click();
 await mobile.page.locator('#mobile-menu-btn').click();await mobile.page.locator('#transfer-btn').click();
 await mobile.page.getByLabel('면접 JSON 파일 선택').setInputFiles({name:'import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({companies:[{id:'imported',name:'가져오기 테스트',categories:[]}]}))});
 await mobile.page.getByRole('button',{name:'선택한 기업 가져오기',exact:true}).click();
 assert.equal(await mobile.page.locator('#companies button').count(),4);
 assert.equal(remote.companies.length,3); // read-only device has local pending edits
 // Legacy data is retained byte-for-byte at migration, no silent replacement.
 const legacy=structuredClone(seed); legacy.companies[1].categories[0].questions[0].answer='이 기기에서만 수정한 답변'; legacy.selectedCompanyId=legacy.companies[1].id;
 const oldContext=await browser.newContext();await oldContext.addInitScript(data=>{sessionStorage.setItem('interviewGateUnlocked','1');localStorage.setItem('interviewCompanyData.v1',JSON.stringify(data));},legacy);
 await oldContext.route('https://api.github.com/**',route=>route.fulfill({json:{sha:String(sha),content:Buffer.from(JSON.stringify(remote)).toString('base64')}}));
 const old=await oldContext.newPage();old.on('pageerror',e=>errors.push(e.message));await old.goto('http://localhost:8765');await old.getByRole('heading',{name:'기존 수정본을 확인해주세요'}).waitFor();
 const stored=await old.evaluate(()=>JSON.parse(localStorage.getItem('interviewCompanyData.v1')));assert.deepEqual(stored,legacy);
 await old.getByRole('button',{name:'닫기',exact:true}).click();
 assert.equal(await old.locator('#companies button').count(),3);
 assert.equal(await old.locator('.question-row').count(),43);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS desktop/mobile rendering, CRUD, favorites, copy, reorder, company export, mock GitHub save, cross-device read, legacy preservation; no browser errors.');
 await browser.close();
 server.kill();
})().catch(e=>{console.error(e);process.exit(1)});
