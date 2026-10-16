// All data and GitHub requests are mocked; no production writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const seed=JSON.parse(fs.readFileSync('interview-data.json','utf8'));
const server=require('node:child_process').spawn('python',['-m','http.server','8766'],{stdio:'ignore'});
process.on('exit',()=>server.kill());
(async()=>{
 await new Promise(r=>setTimeout(r,400));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 let remote=structuredClone(seed),sha=1,puts=0;const errors=[];
 async function setup(viewport){
  const context=await browser.newContext({viewport});
  await context.addInitScript(()=>sessionStorage.setItem('interviewGateUnlocked','1'));
  await context.route('**/interview-data.json',route=>route.fulfill({json:seed}));
  await context.route('https://api.github.com/**',async route=>{
   const req=route.request();if(req.method()==='PUT'){
    const data=req.postDataJSON();assert.equal(data.sha,String(sha));remote=JSON.parse(Buffer.from(data.content,'base64'));sha++;puts++;
    return route.fulfill({json:{content:{sha:String(sha)}}});
   }
   return route.fulfill({json:{sha:String(sha),content:Buffer.from(JSON.stringify(remote)).toString('base64')}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://localhost:8766');await page.locator('#sync-status[data-state="saved"]').waitFor();
  await page.locator('#companies button').filter({hasText:'골프존'}).click();return{page,context};
 }
 const {page}=await setup({width:1440,height:1000});
 assert.equal(await page.locator('.question-row').count(),30);
 assert.ok((await page.locator('#company-count').innerText()).includes('꼬리 20'));
 await page.locator('[data-view="study"]').click();
 const card=page.locator('.study-card').filter({has:page.locator('.question-title',{hasText:'골프존 앱을 사용해 봤나요?'})});
 await card.locator(':scope > summary').click();
 assert.equal(await card.locator('.follow-ups').getAttribute('open'),null);
 assert.equal(await card.locator('.follow-answer').first().isVisible(),false);
 await card.locator('.follow-ups > summary').click();assert.equal(await card.locator('.follow-item').count(),2);
 await card.locator('.follow-item > summary').first().click();assert.ok((await card.locator('.follow-answer').first().innerText()).includes('회원가입은 골프존 웹'));
 await card.scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/interview-followups-desktop.png'});
 // Keyword-only view retains optional follow-ups; they remain collapsed after redraw.
 await page.locator('#keyword-only').check();
 await card.locator(':scope > summary').click();assert.equal(await card.locator('.study-body > .answer').count(),0);
 assert.equal(await card.locator('.follow-ups').getAttribute('open'),null);
 // Search can find content present only in a follow-up; no extra top-level question.
 await page.locator('#search').fill('회원가입은 골프존 웹');assert.equal(await page.locator('.study-card').count(),1);
 await page.locator('#search').fill('');await page.locator('[data-view="manage"]').click();
 await page.locator('.question-main').filter({hasText:'골프존 앱을 사용해 봤나요?'}).click();
 await page.locator('.follow-editor > summary').click();
 await page.getByRole('button',{name:'+ 꼬리질문 추가',exact:true}).click();
 await page.getByLabel('꼬리질문 3 질문',{exact:true}).fill('추가 동기화 테스트');
 await page.getByLabel('꼬리질문 3 답변',{exact:true}).fill('휴대폰에도 보이는 답변');
 await page.getByLabel('꼬리질문 3 키워드 (선택)',{exact:true}).fill('동기화 → 보존');
 await page.getByRole('button',{name:'꼬리질문 3 위로',exact:true}).click();
 assert.equal(await page.getByLabel('꼬리질문 2 질문',{exact:true}).inputValue(),'추가 동기화 테스트');
 await page.getByRole('button',{name:'저장',exact:true}).click();
 // Delete inside editor, then cancel: original follow-up remains.
 await page.locator('.question-main').filter({hasText:'골프존 앱을 사용해 봤나요?'}).click();await page.locator('.follow-editor > summary').click();
 await page.getByRole('button',{name:'꼬리질문 2 삭제',exact:true}).click();await page.getByRole('button',{name:'취소',exact:true}).click();
 const local=await page.evaluate(()=>JSON.parse(localStorage.getItem('interviewWorkspace.v2')).data);
 const app=local.companies.find(c=>c.id==='golfzon').categories.flatMap(c=>c.questions).find(q=>q.id==='golfzon_app');assert.equal(app.followUps.length,3);
 // Export includes nested data.
 await page.locator('#transfer-btn').click();const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'선택한 기업 내보내기',exact:true}).click();
 const dl=await downloading;const exported=JSON.parse(fs.readFileSync(await dl.path(),'utf8'));assert.equal(exported.companies.length,1);
 assert.equal(exported.companies[0].categories.flatMap(c=>c.questions).find(q=>q.id==='golfzon_app').followUps[1].answer,'휴대폰에도 보이는 답변');await page.getByRole('button',{name:'닫기',exact:true}).last().click();
 // Write mock and read in independent mobile context.
 await page.locator('#settings-btn').click();await page.getByLabel('GitHub 연결 키',{exact:true}).fill('test-not-a-credential');
 await page.getByLabel('내가 저장하는 질문·답변이 이 공개 GitHub 저장소에 공개되는 것을 이해하고 동의합니다.').check();await page.getByRole('button',{name:'연결하고 동기화'}).click();await page.locator('#sync-status[data-state="saved"]').waitFor();assert.equal(puts,1);
 const mobile=await setup({width:390,height:844});const m=mobile.page;
 await m.locator('[data-view="starred"]').click();assert.equal(await m.locator('.study-card').count(),12);
 const mc=m.locator('.study-card').filter({has:m.locator('.question-title',{hasText:'골프존 앱을 사용해 봤나요?'})});await mc.locator(':scope > summary').click();await mc.locator('.follow-ups > summary').click();
 await mc.locator('.follow-item > summary').nth(1).click();assert.ok((await mc.locator('.follow-answer').nth(1).innerText()).includes('휴대폰에도 보이는 답변'));
 await mc.locator('.follow-ups').scrollIntoViewIfNeeded();assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await m.screenshot({path:'/tmp/interview-followups-mobile.png'});
 await mc.getByRole('button',{name:'질문·답변 수정',exact:true}).click();await m.locator('.follow-editor > summary').click();await m.getByLabel('꼬리질문 2 질문',{exact:true}).scrollIntoViewIfNeeded();
 await m.screenshot({path:'/tmp/interview-followups-editor.png'});assert.ok(await m.locator('#dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await m.getByRole('button',{name:'취소',exact:true}).click();
 // Live: skip first three favorites to app; follow-ups appear only after answer reveal.
 await m.locator('[data-view="live"]').click();await m.getByRole('button',{name:'연습 시작',exact:true}).click();
 for(let i=0;i<3;i++){await m.getByRole('button',{name:'답변 확인',exact:true}).click();await m.getByRole('button',{name:'다음 질문',exact:true}).click();}
 assert.ok((await m.locator('.live-question').innerText()).includes('앱을 사용'));
 assert.equal(await m.locator('#live .follow-ups').count(),0);await m.getByRole('button',{name:'답변 확인',exact:true}).click();
 assert.equal(await m.locator('#live .follow-ups').getAttribute('open'),null);await m.locator('#live .follow-ups > summary').click();await m.locator('#live .follow-item > summary').nth(1).click();
 assert.ok(await m.locator('#live .follow-answer').nth(1).isVisible());await m.getByRole('button',{name:'다음 질문',exact:true}).click();
 await m.getByRole('button',{name:'답변 확인',exact:true}).click();assert.equal(await m.locator('#live .follow-ups').getAttribute('open'),null);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS follow-ups: collapsed disclosure, search, edit/add/reorder, cancel safety, export, mock GitHub cross-device sync, mobile/editor layout, starred/keyword/live modes.');
 await browser.close();server.kill();
})().catch(e=>{console.error(e);process.exit(1)});
