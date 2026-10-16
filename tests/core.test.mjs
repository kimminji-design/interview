import test from 'node:test';
import assert from 'node:assert/strict';
import {clone, documentOf, validate, mergeDocuments, newCompany, suggestKeywords, parseBulk, move} from '../core.mjs';
import {GitHubSync} from '../github-sync.mjs';
const fixture=()=>documentOf([{id:'c',name:'기업',categories:[{id:'cat',name:'분류',questions:[{id:'q1',question:'질문1',answer:'답변1',favorite:false,keywords:[]},{id:'q2',question:'질문2',answer:'답변2',favorite:false,keywords:[]}]}]}]);
const question=d=>d.companies[0].categories[0].questions[0];
test('independent edits on two devices merge; same answer edits conflict',()=>{const b=fixture(),l=clone(b),r=clone(b);question(l).answer='로컬';question(r).favorite=true;const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(question(m.data).answer,'로컬');assert.equal(question(m.data).favorite,true);question(r).answer='원격';const conflict=mergeDocuments(b,l,r);assert.equal(conflict.conflicts.length,1);const choices={[conflict.conflicts[0].path]:'remote'};assert.equal(question(mergeDocuments(b,l,r,choices).data).answer,'원격');});
test('deletion vs edit is explicit; independent additions are preserved',()=>{const b=fixture(),l=clone(b),r=clone(b);l.companies[0].categories[0].questions.shift();question(r).answer='changed';assert.equal(mergeDocuments(b,l,r).conflicts.length,1);const a=fixture(),x=clone(a),y=clone(a);x.companies.push({id:'local',name:'local',categories:[]});y.companies.push({id:'remote',name:'remote',categories:[]});assert.equal(mergeDocuments(a,x,y).data.companies.length,3);});
test('reorder survives independent content edits',()=>{const b=fixture(),l=clone(b),r=clone(b);l.companies[0].categories[0].questions.reverse();question(r).answer='new';const m=mergeDocuments(b,l,r);assert.equal(m.conflicts.length,0);assert.deepEqual(m.data.companies[0].categories[0].questions.map(q=>q.id),['q2','q1']);assert.equal(m.data.companies[0].categories[0].questions[1].answer,'new');});
test('opposing order changes require choice',()=>{const b=fixture();b.companies[0].categories[0].questions.push({...clone(question(b)),id:'q3'});const l=clone(b),r=clone(b);move(l.companies[0].categories[0].questions,'q1',1);move(r.companies[0].categories[0].questions,'q3',-1);assert.equal(mergeDocuments(b,l,r).conflicts.length,1);});
test('copy selects questions, regenerates IDs and never changes source',()=>{const c=fixture().companies[0],before=clone(c);const copy=newCompany('골프존',c,new Set(['q1']),true);assert.equal(copy.categories[0].questions.length,1);assert.notEqual(copy.categories[0].questions[0].id,'q1');assert.equal(copy.categories[0].questions[0].answer,'');assert.deepEqual(c,before);});
test('validate rejects malformed or duplicate IDs before import',()=>{assert.throws(()=>validate({companies:[{id:'c',name:'bad'}]}));const d=fixture();d.companies[0].categories[0].questions.push(clone(question(d)));assert.throws(()=>validate(d));assert.equal(validate(fixture()).companies.length,1);});
test('multiline Korean input, empty answers and Unicode survive bulk parsing',()=>{const result=parseBulk('# 협업\nQ. 질문\nA. 첫 문장\n두 번째 문장\n키워드: 기준 → 협업\n\nQ. 다음 질문\n');assert.equal(result[0].questions[0].answer,'첫 문장\n두 번째 문장');assert.deepEqual(result[0].questions[0].keywords,['기준','협업']);assert.equal(result[0].questions[1].answer,'');});
test('keyword candidates only quote phrases actually in text',()=>{const answer='8년간 정보 위계와 공통 기준을 정리했고, 디자인 시스템 및 AI를 활용했습니다.';assert.ok(suggestKeywords(answer).length>0);for(const word of suggestKeywords(answer))assert.ok(answer.includes(word));assert.deepEqual(suggestKeywords('안녕하세요.'),[]);});
const encode=d=>Buffer.from(JSON.stringify(d)).toString('base64');
function syncHarness({base=fixture(),local=fixture(),remote=fixture(),failPut=false,onPut}={}){
 let data=local,b=base;const calls=[],messages=[];
 const sync=new GitHubSync({getLocal:()=>data,getBase:()=>b,setBase:v=>b=clone(v),apply:v=>data=clone(v),resolve:async()=>null,status:(...s)=>messages.push(s),fetcher:async(url,options)=>{calls.push({url,options});if(options.method==='PUT'){if(onPut)onPut(data);return{ok:!failPut,status:409,json:async()=>({})};}return{ok:true,json:async()=>({sha:'blob-sha',content:encode(remote)})};}});
 return {sync,calls,messages,data:()=>data,base:()=>b};
}
test('read-only sync never writes, and pending data stays local',async()=>{const local=fixture();question(local).answer='수정';const h=syncHarness({local});await h.sync.sync(false);assert.equal(h.calls.length,1);assert.equal(question(h.data()).answer,'수정');assert.equal(h.messages.at(-1)[0],'pending');});
test('authenticated save uses current SHA and UTF-8 payload',async()=>{const local=fixture();question(local).answer='한글 테스트';const h=syncHarness({local});h.sync.connect('test-only');assert.ok(await h.sync.sync(true));assert.equal(h.calls.length,2);const put=JSON.parse(h.calls[1].options.body);assert.equal(put.sha,'blob-sha');assert.equal(question(JSON.parse(Buffer.from(put.content,'base64').toString('utf8'))).answer,'한글 테스트');assert.equal(h.messages.at(-1)[0],'saved');});
test('failed PUT preserves pending data and does not advance saved baseline',async()=>{const local=fixture();question(local).answer='로컬 유지';const h=syncHarness({local,failPut:true});h.sync.connect('test');assert.equal(await h.sync.sync(true),false);assert.equal(question(h.data()).answer,'로컬 유지');assert.equal(question(h.base()).answer,'답변1');assert.equal(h.messages.at(-1)[0],'error');});
test('edit during PUT stays pending and is not overwritten',async()=>{const local=fixture();question(local).answer='first';const h=syncHarness({local,onPut:data=>question(data).answer='second'});h.sync.connect('test');await h.sync.sync(true);assert.equal(question(h.data()).answer,'second');assert.equal(question(h.base()).answer,'first');assert.equal(h.messages.at(-1)[0],'pending');});
test('cancelling first connection preserves local and does not write',async()=>{const local=fixture();question(local).answer='기존 기기';const h=syncHarness({base:null,local});h.sync.connect('test');assert.equal(await h.sync.sync(true),false);assert.equal(h.calls.length,1);assert.equal(question(h.data()).answer,'기존 기기');});
test('first sync reads existing seed; explicit write creates common file without stale SHA',async()=>{
 let data=fixture(),base=fixture();question(data).answer='새 답변';const calls=[];
 const sync=new GitHubSync({getLocal:()=>data,getBase:()=>base,setBase:v=>base=clone(v),apply:v=>data=clone(v),resolve:async()=>null,status:()=>{},fetcher:async(url,opts)=>{
  calls.push({url,opts});if(opts.method==='PUT')return{ok:true,status:201,json:async()=>({})};
  if(url.includes('/interview-data.json'))return{ok:false,status:404,json:async()=>({})};
  return{ok:true,status:200,json:async()=>({sha:'seed-not-current-file-sha',content:encode(fixture())})};
 }});
 sync.connect('test');assert.ok(await sync.sync(true));assert.equal(calls.length,3);const put=JSON.parse(calls[2].opts.body);assert.equal(Object.hasOwn(put,'sha'),false);assert.ok(calls[1].url.includes('backup-2026-09-07.json'));
});

test('follow-up validation preserves old data and rejects malformed nested questions',()=>{
 const old=fixture();assert.deepEqual(validate(old),old);
 const d=fixture();question(d).followUps=[{id:'f1',question:'추가 질문',answer:'답변',keywords:['키워드']}];
 assert.deepEqual(validate(d),d);
 question(d).followUps.push({...question(d).followUps[0]});assert.throws(()=>validate(d),/중복/);
 question(d).followUps=[{id:'f1',question:'',answer:'답변'}];assert.throws(()=>validate(d),/꼬리질문/);
 question(d).followUps='잘못된 값';assert.throws(()=>validate(d),/목록/);
});
test('question-only copy clears follow-up answers and creates new IDs without changing source',()=>{
 const d=fixture(),source=d.companies[0];question(d).followUps=[{id:'f1',question:'추가 질문',answer:'다른 회사 답변',keywords:['다른 회사']}];
 const before=clone(source);const copied=newCompany('새 회사',source,null,true).categories[0].questions[0];
 assert.equal(copied.followUps[0].answer,'');assert.deepEqual(copied.followUps[0].keywords,[]);assert.notEqual(copied.followUps[0].id,'f1');assert.deepEqual(source,before);
});
test('independent follow-up edits merge; conflicting answers and edit-versus-delete require a choice',()=>{
 const b=fixture();question(b).followUps=[{id:'f1',question:'추가1',answer:'답1'},{id:'f2',question:'추가2',answer:'답2'}];
 const l=clone(b),r=clone(b);question(l).followUps[0].answer='로컬';question(r).followUps[1].answer='원격';
 const merged=mergeDocuments(b,l,r);assert.equal(merged.conflicts.length,0);assert.deepEqual(question(merged.data).followUps.map(f=>f.answer),['로컬','원격']);
 question(r).followUps[0].answer='동시수정';assert.equal(mergeDocuments(b,l,r).conflicts.length,1);
 question(r).followUps.shift();assert.equal(mergeDocuments(b,l,r).conflicts.length,1);
});
