/** Browser-only last-good Toss cache regression; fully synthetic values, no real accounts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const TOKEN='a'.repeat(64);
const ENDPOINT='https://sample-private-gateway.ts.net';
const CACHE='isa-toss-readonly-last-good-v1';
const yesterday=new Date(Date.now()-24*60*60*1000).toISOString();
const today=new Date().toISOString();
const brokerRecord=iso=>({
 ok:true,source:'토스증권 공식 Open API · 조회 전용',fetchedAt:iso,
 accountCount:1,holdingCount:2,
 fx:{usdKrw:1400,validFrom:iso,validUntil:iso},
 amounts:{
  invested:{krw:1000,usd:100},valued:{krw:900,usd:102},
  afterCost:{krw:899,usd:101},profit:{krw:-100,usd:2}
 },
 totals:{investedKRW:141000,valueKRW:143700,afterCostKRW:142299,conversionApprox:true},
 holdings:[
  {symbol:'329200',name:'테스트리츠',marketCountry:'KR',currency:'KRW',
   quantity:3,averagePurchasePrice:100,lastPrice:95,
   purchaseAmount:300,marketValue:285,marketValueAfterCost:284,profitLoss:-15},
  {symbol:'SCHD',name:'테스트미국ETF',marketCountry:'US',currency:'USD',
   quantity:1.5,averagePurchasePrice:50,lastPrice:51,
   purchaseAmount:75,marketValue:76.5,marketValueAfterCost:76,profitLoss:1.5}
 ]
});
function storage(map){
 return {
  getItem:k=>map.has(k)?map.get(k):null,
  setItem:(k,v)=>map.set(k,String(v)),
  removeItem:k=>map.delete(k)
 };
}
const local=new Map([
 ['isa-toss-readonly-url-v1',ENDPOINT],
 ['isa-toss-readonly-view-v1',TOKEN]
]);
const session=new Map();
function browser(fetcher,localMap=local){
 const elements=new Map(),events=[];
 const el=id=>{
  if(!elements.has(id))elements.set(id,{
   value:'',checked:false,textContent:'',children:[],
   addEventListener(type,fn){this[type]=fn;},
   replaceChildren(){this.children=[];this.textContent='';},
   append(...children){this.children.push(...children);},
   appendChild(child){this.children.push(child);return child;}
  });
  return elements.get(id);
 };
 const doc={readyState:'complete',getElementById:el,
  createElement:tag=>({tag,textContent:'',children:[],
   append(...children){this.children.push(...children);}}),
  dispatchEvent:e=>events.push(e.type)};
 const window={};
 const context={window,document:doc,localStorage:storage(localMap),
  sessionStorage:storage(session),fetch:fetcher,Date,Intl,Number,Object,
  String,Math,JSON,Array,Promise,URL,AbortController,setTimeout,clearTimeout,
  Event:class Event{constructor(type){this.type=type;}}};
 vm.runInNewContext(src('personal-toss-client.js'),context,
  {filename:'personal-toss-client.js'});
 return {api:window.ISA_TOSS_BROKER,el,events,localMap};
}
const oldRecord=brokerRecord(yesterday);
const success=async()=>({ok:true,status:200,json:async()=>oldRecord});
const first=browser(success);
await first.api.load();
assert.equal(first.api.snapshotMeta().state,'live');
assert.equal(first.api.snapshot().holdingCount,2);
assert.ok(first.el('toss-broker-status').textContent.includes('자동 저장 완료'));
assert.ok(local.has(CACHE),'first successful official response must be stored on phone');
assert.equal(JSON.parse(local.get(CACHE)).data.fetchedAt,yesterday);
assert.equal(local.get(CACHE).includes(TOKEN),false,'never persist personal viewer token inside broker snapshot');
assert.equal(local.get(CACHE).includes('client_secret'),false,'never store Toss client secret');

// Mobile browser restarts on following day, Windows laptop is off: restore
// the last actual brokerage snapshot BEFORE attempting the failing fetch.
let offline=true;
const fetcher=async()=>offline?Promise.reject(new Error('Windows laptop offline')):
 {ok:true,status:200,json:async()=>brokerRecord(today)};
const second=browser(fetcher);
assert.equal(second.api.snapshotMeta().state,'cached');
assert.equal(second.api.snapshot().fetchedAt,yesterday);
assert.equal(second.api.snapshot().holdings[1].quantity,1.5);
await second.api.load().catch(()=>{});
assert.equal(second.api.snapshotMeta().state,'cached','failed refresh must not erase last-good record');
assert.equal(second.api.snapshot().fetchedAt,yesterday);
assert.ok(second.el('toss-broker-status').textContent.includes('현재 잔고 아님'));
assert.ok(second.el('toss-broker-holdings').children[0].textContent.includes('현재 실시간 아님'));

// Laptop turns on again, official API succeeds: replace yesterday's record.
offline=false;
await second.api.load();
assert.equal(second.api.snapshotMeta().state,'live');
assert.equal(JSON.parse(local.get(CACHE)).data.fetchedAt,today);
assert.ok(second.el('toss-broker-status').textContent.includes('최신 조회'));

// Disconnect purges the sensitive per-device cache without touching other records.
local.set('isa-us-distributions-krw-v1','synthetic-existing-dividend-ledger');
second.api.disconnect();
assert.equal(local.has(CACHE),false,'disconnect must erase cached brokerage values');
assert.equal(local.get('isa-us-distributions-krw-v1'),
 'synthetic-existing-dividend-ledger','user dividend history must remain');

// No snapshot on a different device; do not fabricate yesterday's close.
const newDevice=new Map();
const third=browser(async()=>{throw Error('offline');},newDevice);
assert.equal(third.api.snapshot(),null);
assert.equal(third.api.snapshotMeta().state,'none');

// Malformed and future-dated snapshots must not be displayed.
newDevice.set('isa-toss-readonly-url-v1',ENDPOINT);
newDevice.set('isa-toss-readonly-view-v1',TOKEN);
newDevice.set(CACHE,JSON.stringify({version:1,endpoint:ENDPOINT,
 data:brokerRecord(new Date(Date.now()+86400000).toISOString())}));
const fourth=browser(async()=>{throw Error('offline');},newDevice);
assert.equal(fourth.api.snapshot(),null,'future dated cached official snapshot rejected');
assert.ok(src('account-summary.js').includes('마지막 저장 잔고'));
assert.ok(src('account-summary.js').includes('!data.brokerApi'),
 'cached real broker data is not rewritten by the mixed-source reference lock');
assert.ok(src('index.html').includes('마지막 잔고를 이 기기에 자동 저장'));
assert.ok(!src('.github/workflows/pages.yml').includes('isa-toss-readonly-last-good-v1'),
 'private balance cache must not be uploaded to public GitHub Pages');
console.log('PASS: phone last-good broker snapshot survives Windows-off, is clearly dated/stale, refreshes on reconnect, clears on disconnect and never publishes accounts');
