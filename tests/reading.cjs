// Presentation and mobile navigation; public API mocked, no writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('fs');
const seed=JSON.parse(fs.readFileSync('interview-data.json','utf8'));
const server=require('child_process').spawn('python',['-m','http.server','8767'],{stdio:'ignore'});
process.on('exit',()=>server.kill());
(async()=>{
 const {breathingText,newestCompanies}=await import('../reading.mjs');
 const sample='복잡한 요구사항을 사용자가 이해하기 쉬운 구조로 정리하고, 실제 화면과 인터랙션으로 구체화하는 데 강점이 있습니다.';
 assert.equal(breathingText(sample),'복잡한 요구사항을\n사용자가 이해하기 쉬운 구조로 정리하고,\n실제 화면과 인터랙션으로\n구체화하는 데 강점이 있습니다.');
 for(const c of seed.companies)for(const cat of c.categories)for(const q of cat.questions)for(const a of [q.answer,...(q.followUps||[]).map(f=>f.answer)])assert.equal(breathingText(a).replace(/\s/g,''),a.replace(/\s/g,''));
 assert.equal(newestCompanies(seed.companies)[0].id,'golfzon');
 await new Promise(r=>setTimeout(r,300));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH});
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('interviewGateUnlocked','1'));
 await page.route('https://api.github.com/**',r=>r.fulfill({json:{sha:'test',content:Buffer.from(JSON.stringify(seed)).toString('base64')}}));
 await page.goto('http://localhost:8767');
 await page.locator('.question-row').first().waitFor();
 for(const s of ['.app-header','.sidebar','.page-heading'])assert.equal(await page.locator(s).isVisible(),false);
 assert.ok((await page.locator('.tabs').boundingBox()).y<5);
 await page.locator('[data-view=study]').click();await page.locator('.study-card > summary').first().click();
 const answer=page.locator('.study-body > .answer').first();
 assert.ok((await answer.innerText()).includes('복잡한 요구사항을\n사용자가'));
 const original=await answer.getAttribute('data-original');await page.locator('#breathing-toggle').uncheck();assert.equal(await answer.textContent(),original);
 await page.locator('#breathing-toggle').check();assert.ok((await answer.innerText()).split('\n').length>original.split('\n').length);
 await page.screenshot({path:'/tmp/interview-reading-mobile.png'});
 await page.locator('#mobile-menu-btn').click();assert.ok(await page.locator('#mobile-tools').isVisible());
 assert.ok((await page.locator('#companies button').first().innerText()).includes('골프존'));
 await page.locator('#settings-btn').click();assert.equal(await page.locator('#mobile-tools').isVisible(),false);assert.ok(await page.locator('#dialog').isVisible());await page.getByRole('button',{name:'취소',exact:true}).click();
 await page.locator('#mobile-menu-btn').click();await page.locator('#add-company-btn').click();await page.getByLabel('기업명',{exact:true}).fill('신규 기업 테스트');await page.getByRole('button',{name:'기업 만들기',exact:true}).click();
 await page.locator('#mobile-menu-btn').click();assert.ok((await page.locator('#companies button').first().innerText()).includes('신규 기업 테스트'));
 await page.locator('#companies button').filter({hasText:'골프존'}).click();assert.equal(await page.locator('#mobile-tools').isVisible(),false);
 await page.locator('#mobile-menu-btn').click();await page.setViewportSize({width:1440,height:1000});assert.equal(await page.locator('#mobile-tools').isVisible(),false);assert.ok(await page.locator('#app .sidebar').isVisible());
 await page.locator('.study-card > summary').first().click();await page.screenshot({path:'/tmp/interview-reading-desktop.png'});
 for(const width of [320,390,700,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log('PASS reading: all original words preserved, manual paragraphs, breathing toggle, mobile hidden controls/drawer, desktop restore, newest companies, 320–1440px layout');
 await browser.close();server.kill();
})().catch(e=>{console.error(e);process.exit(1)});
