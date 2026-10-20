import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTION_KEY, readConnection, saveConnection } from '../connection.mjs';
import { GitHubSync } from '../github-sync.mjs';
const fakeToken='test-device-only-not-a-real-token';
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
test('connection is opt-in; saving and restoring survives new instances; disconnect removes it',()=>{
  const device=storage();assert.equal(readConnection(device),'');
  saveConnection(device,fakeToken,false);assert.equal(readConnection(device),'');
  saveConnection(device,' '+fakeToken+' ',true);assert.equal(readConnection(device),fakeToken);
  const newSession=new GitHubSync({});newSession.connect(readConnection(device));assert.equal(newSession.token,fakeToken);
  saveConnection(device,'',false);assert.equal(readConnection(device),'');
});
test('remembered connections belong to each device and this repository only',()=>{
  const pc=storage(),mobile=storage();saveConnection(pc,fakeToken,true);assert.equal(readConnection(mobile),'');
  mobile.setItem(CONNECTION_KEY,JSON.stringify({repository:'other/repo',token:fakeToken}));assert.equal(readConnection(mobile),'');
});
test('corrupt/unavailable browser storage raises an actionable error instead of losing interview data',()=>{
  const device=storage();device.setItem(CONNECTION_KEY,'{');assert.throws(()=>readConnection(device));
  assert.throws(()=>saveConnection({setItem(){throw Error('quota');}},fakeToken,true));
});
test('restored connection uploads pending edits; other device reads them; no key in payload or data',async()=>{
  const original={schemaVersion:2,companies:[{id:'g',name:'골프존',categories:[{id:'c',name:'기본',questions:[{id:'q',question:'질문',answer:'이전 답변',keywords:[]}]}]}]};
  let remote=structuredClone(original),base=structuredClone(original),local=structuredClone(original),puts=0;
  local.companies[0].categories[0].questions[0].answer='기기에서 수정한 답변';
  const device=storage();saveConnection(device,fakeToken,true);
  const fetcher=async(url,options)=>{
    if(options.method==='PUT'){
      assert.equal(options.headers.Authorization,'Bearer '+fakeToken);
      const body=JSON.parse(options.body);
      const decoded=Buffer.from(body.content,'base64').toString('utf8');
      assert.ok(!decoded.includes(fakeToken));assert.ok(!options.body.includes(fakeToken));
      remote=JSON.parse(decoded);puts++;
      return new Response(JSON.stringify({content:{sha:'2'}}));
    }
    return new Response(JSON.stringify({sha:'1',content:Buffer.from(JSON.stringify(remote)).toString('base64')}));
  };
  const writer=new GitHubSync({getLocal:()=>local,getBase:()=>base,setBase:v=>base=v,apply:v=>local=v,resolve:()=>{throw Error('unexpected conflict');},status(){},fetcher});
  writer.connect(readConnection(device));assert.equal(await writer.sync(true),true);assert.equal(puts,1);
  let mobile=structuredClone(original),mobileBase=structuredClone(original);
  const reader=new GitHubSync({getLocal:()=>mobile,getBase:()=>mobileBase,setBase:v=>mobileBase=v,apply:v=>mobile=v,resolve:()=>{throw Error('unexpected conflict');},status(){},fetcher});
  assert.equal(await reader.sync(false),true);
  assert.equal(mobile.companies[0].categories[0].questions[0].answer,'기기에서 수정한 답변');
  assert.ok(!JSON.stringify({local,base,mobile,remote}).includes(fakeToken));
});
