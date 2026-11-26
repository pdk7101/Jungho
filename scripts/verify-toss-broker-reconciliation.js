/** Toss account authority / 14 holdings discrepancy regression with fake data only.
 * Never stores actual user's broker holdings or financial details in public files.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const store=new Map();
const localStorage={
 getItem:k=>store.get(k)||null,
 setItem:(k,v)=>store.set(k,String(v)),
 removeItem:k=>store.delete(k)
};
const idsUS=['schd','spym','cony','agnc','spacex'],idsKR=[
 'tsofr','treit','ttr','biotech','tspace','media','trobot','hongah','sensor'
];
const snapshot={usDate:'2026-11-21',tdDate:'2026-11-21',us:{},tossDomestic:{}};
for(const id of idsUS)snapshot.us[id]={qty:2,value:200,pnl:0};
for(const id of idsKR)snapshot.tossDomestic[id]={qty:3,value:300,pnl:0};
localStorage.setItem('isa-user-portfolio-snapshot-v1',JSON.stringify(snapshot));
localStorage.setItem('isa-account-totals-v1',JSON.stringify({
 toss:{invested:3000,value:2750,date:'2026-11-24'}
}));
localStorage.setItem('isa-account-calculation-mode-v1',JSON.stringify({toss:'manual',kiwoom:'auto'}));
const elements=new Map(),handlers=new Map();
const element=id=>{
 if(!elements.has(id))elements.set(id,{textContent:'',value:'',open:false,
  addEventListener:(event,cb)=>handlers.set(id+':'+event,cb),
  scrollIntoView:()=>{},focus:()=>{},querySelectorAll:()=>[]});
 return elements.get(id);
};
const document={
 getElementById:element,addEventListener:()=>{},dispatchEvent:()=>{}
};
const window={
 addEventListener:()=>{},
 ISA_US_APP:{getPrice:()=>null},
 ISA_US_KRW:{priceKrw:()=>null},
 ISA_KR_APP:{decisions:()=>[],accountTotals:()=>({
  principal:600,value:580,missingHoldings:[],missingPrice:[],
  intraday:0,close:6,dates:['2026-11-23'],holdingsKey:'synthetic-isa'
 })}
};
const sandbox={window,document,localStorage,Date,Intl,Number,Math,JSON,Object,Array,String,
 Map,Set,Event:class Event{constructor(name){this.type=name;}}};
vm.runInNewContext(read('portfolio-totals.js'),sandbox,{filename:'portfolio-totals.js'});
vm.runInNewContext(read('account-summary.js'),sandbox,{filename:'account-summary.js'});
const portfolio=window.ISA_PORTFOLIO_TOTALS,account=window.ISA_ACCOUNT_SUMMARY;
assert.equal(account.getTotals().toss.value,2750,
 'explicitly entered broker whole-account figure is authoritative');
assert.equal(element('toss-total-value').textContent,'2,750원');
assert.equal(element('toss-total-invested').textContent,'3,000원');
assert.ok(element('account-broker-compare').textContent.includes('14종목 참고 계산 3,700원'),
 'broker manual amount and mixed-date stock estimate must be shown separately');
assert.ok(element('account-broker-compare').textContent.includes('평가금액 차이 +950원'),
 'reference minus broker comparison must be arithmetically correct');
// A direct edit of position quantity must NOT flip the broker account to auto.
portfolio.markAuto('toss');
assert.equal(JSON.parse(localStorage.getItem('isa-account-calculation-mode-v1')).toss,'manual');
assert.equal(account.getTotals().toss.value,2750,'holding refresh cannot erase broker total');
// Direct user-entered daily Toss price has precedence over a past photo for that ticker.
const todayParts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',
 year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
const today=todayParts.year+'-'+todayParts.month+'-'+todayParts.day;
localStorage.setItem('isa-private-toss-domestic-holdings-v1',JSON.stringify({
 treit:{qty:3,avg:100,krwCurrent:157,krwDay:today}
}));
const direct=portfolio.row('domestic','treit');
assert.equal(direct.unitPrice,157);
assert.equal(direct.value,471);
assert.equal(direct.priceMode,'broker-manual');
assert.ok(direct.priceSource.includes('토스증권 앱'));
assert.ok(portfolio.totals().source.includes('토스 원화 단가 직접 입력 1종목'));
assert.equal(account.getTotals().toss.value,2750,
 'changing a ticker Toss reference price cannot overwrite actual broker total');
localStorage.setItem('isa-private-toss-domestic-holdings-v1',JSON.stringify({
 treit:{qty:3,avg:100,krwCurrent:157,krwDay:'2026-11-01'}
}));
const expired=portfolio.row('domestic','treit');
assert.equal(expired.priceMode,'photo','yesterday broker quote cannot masquerade as today');
assert.equal(expired.unitPrice,100);
assert.equal(account.getTotals().toss.value,2750);
// User deliberately elects reference-auto mode: only this action changes the top.
assert.equal(typeof handlers.get('account-total-auto:click'),'function');
handlers.get('account-total-auto:click')();
assert.equal(account.getTotals().toss.value,3700);
assert.equal(element('toss-total-value').textContent,'3,700원');
assert.equal(element('account-broker-compare').textContent.includes('토스 앱 직접 입력'),true);
// User re-enters the broker value: manual mode must be restored reliably.
element('account-toss-invested').value='3200';
element('account-toss-value').value='2800';
handlers.get('account-total-save:click')();
assert.equal(account.getTotals().toss.value,2800);
assert.equal(element('toss-total-value').textContent,'2,800원');
assert.ok(element('account-broker-compare').textContent.includes('평가금액 차이 +900원'));
// Laptop offline: cached broker holdings remain available, but a newer
// independently sourced quote can change the reference valuation.
const stamp=new Date(Date.now()-86400000).toISOString();
const saved={
 ok:true,fetchedAt:stamp,holdingCount:14,fx:{usdKrw:1400},
 amounts:{valued:{krw:900,usd:100}},
 totals:{investedKRW:14000,valueKRW:12000},
 holdings:[
  ...idsUS.map(id=>({marketCountry:'US',currency:'USD',symbol:id.toUpperCase(),
   name:id==='spacex'?'스페이스X':id,quantity:2,averagePurchasePrice:1,lastPrice:1,
   purchaseAmount:2,marketValue:2})),
  ...[['455030','SOFR'],['329200','리츠'],['278530','200TR'],
   ['test1','마이티 신약포커스바이오액티브'],['0131V0','우주'],['test2','TIGER 미디어컨텐츠'],
   ['469070','로봇'],['test3','흥아해운'],['test4','센서뷰']].map(([symbol,name])=>({
    marketCountry:'KR',currency:'KRW',symbol,name,quantity:3,averagePurchasePrice:100,
    lastPrice:100,purchaseAmount:300,marketValue:300}))
 ]
};
window.ISA_TOSS_BROKER={snapshot:()=>saved,snapshotMeta:()=>({state:'cached'})};
window.ISA_US_KRW.priceKrw=()=>({amount:1500,stamp:new Date().toISOString(),source:'synthetic recent quote'});
const offline=portfolio.row('us','schd');
assert.equal(offline.qty,2);
assert.equal(offline.value,3000,'saved broker quantity is multiplied by newer external quote');
assert.equal(offline.cachedHolding,true);
assert.equal(portfolio.row('domestic','sensor').value,300,'missing new quote retains last broker amount');
assert.equal(account.getTotals().toss.revalued,true,'complete cached holdings produce automatic offline reference estimate');
assert.equal(account.getTotals().toss.cached,true,'revalued snapshot must never be described as current actual account');
assert.equal(saved.totals.valueKRW,12000,'original official snapshot remains intact');
// Confirmed sync makes owner-entered KRW records the common basis, regardless
// of whether the device has an official snapshot (including a live snapshot).
const endpoint='https://example.test.workers.dev/sync';
localStorage.setItem('isa-portfolio-sync-config-v1',JSON.stringify({url:endpoint,token:'synthetic-not-a-secret'}));
assert.equal(portfolio.sharedBasis(),false,'unconfirmed sync does not alter account basis');
localStorage.setItem('isa-portfolio-sync-base-v1',JSON.stringify({url:endpoint,revision:1,data:{}}));
assert.equal(portfolio.sharedBasis(),true);
assert.equal(account.getTotals().toss.value,2800,'explicit synchronized manual total is preserved');
localStorage.setItem('isa-account-calculation-mode-v1',JSON.stringify({toss:'auto',kiwoom:'auto'}));
const withCache=portfolio.totals(),withCacheAccount=account.getTotals().toss;
assert.equal(withCache.rows.some(r=>r.official),false,'private cache cannot override shared holdings');
window.ISA_TOSS_BROKER.snapshotMeta=()=>({state:'live'});
assert.equal(portfolio.totals().invested,withCache.invested,'live device cannot change shared reference cost basis');
delete window.ISA_TOSS_BROKER;
assert.equal(portfolio.totals().invested,withCache.invested,'same owner holdings give identical principal without broker cache');
assert.equal(portfolio.totals().value,withCache.value,'same source quotes give identical estimated valuation');
assert.equal(account.getTotals().toss.invested,withCacheAccount.invested);
assert.equal(account.getTotals().toss.value,withCacheAccount.value);
assert.equal(saved.totals.valueKRW,12000,'official snapshot never modified');
console.log('PASS: synchronized KRW cost basis is independent of device-only official balance');
console.log('PASS: Toss actual broker total authority, discrepancy, 14-price provenance, same-day override, explicit auto mode');

// Cloud-only quote relay uses a separate authenticated route, not the portfolio DB.
const relayCalls=[];
const relay=new Function('fetch','crypto',read('private-portfolio-sync-worker.js').replace('export default','return'))(
 async(url,options)=>{relayCalls.push({url,options});return new Response(JSON.stringify({items:[]}));},
 globalThis.crypto);
const relayEnv={PORTFOLIO_SYNC_TOKEN:'s'.repeat(32),
 KRX_QUOTE_URL:'https://mock-krx.pdk7101.workers.dev',KRX_QUOTE_TOKEN:'k'.repeat(20),
 US_QUOTE_URL:'https://mock-us.pdk7101.workers.dev',US_QUOTE_TOKEN:'u'.repeat(20)};
const request=(path,token=relayEnv.PORTFOLIO_SYNC_TOKEN,origin='https://pdk7101.github.io',method='GET')=>
 new Request('https://jungho-portfolio-sync.pdk7101.workers.dev'+path,{method,headers:{Origin:origin,Authorization:'Bearer '+token}});
assert.equal((await relay.fetch(request('/quote/krx?page=0'),relayEnv)).status,200);
assert.equal(relayCalls[0].url,relayEnv.KRX_QUOTE_URL+'/api/krx-history?page=0');
assert.equal(relayCalls[0].options.headers.Authorization,'Bearer '+relayEnv.KRX_QUOTE_TOKEN);
assert.equal(relayCalls[0].options.redirect,'manual');
assert.equal((await relay.fetch(request('/quote/us'),relayEnv)).status,200);
assert.equal(relayCalls[1].url,relayEnv.US_QUOTE_URL+'/quotes');
assert.equal(relayCalls[1].options.headers.Authorization,'Bearer '+relayEnv.US_QUOTE_TOKEN);
assert.equal((await relay.fetch(request('/quote/krx?page=5'),relayEnv)).status,400);
assert.equal((await relay.fetch(request('/quote/us','wrong'),relayEnv)).status,401);
assert.equal((await relay.fetch(request('/quote/us',undefined,'https://wrong.example'),relayEnv)).status,403);
assert.equal((await relay.fetch(request('/quote/us',undefined,undefined,'PUT'),relayEnv)).status,405);
assert.equal((await relay.fetch(request('/quote/us'),{...relayEnv,US_QUOTE_URL:'https://external.example'})).status,503);
assert.equal(relayCalls.length,2,'unauthorized or invalid requests never contact a quote server');
const serviceCalls=[];
const service={fetch:async req=>{
 serviceCalls.push(req);return new Response(JSON.stringify({items:[]}));
}};
const boundEnv={...relayEnv,KRX_SERVICE:service,US_SERVICE:service};
assert.equal((await relay.fetch(request('/quote/krx?page=2'),boundEnv)).status,200);
assert.equal(new URL(serviceCalls[0].url).pathname,'/api/krx-history');
assert.equal(new URL(serviceCalls[0].url).searchParams.get('page'),'2');
assert.equal(serviceCalls[0].headers.get('Authorization'),'Bearer '+relayEnv.KRX_QUOTE_TOKEN);
assert.equal((await relay.fetch(request('/quote/us'),boundEnv)).status,200);
assert.equal(new URL(serviceCalls[1].url).pathname,'/quotes');
assert.equal(serviceCalls[1].headers.get('Authorization'),'Bearer '+relayEnv.US_QUOTE_TOKEN);
assert.equal(relayCalls.length,2,'bound services bypass public worker HTTP');
assert.equal((await relay.fetch(request('/quote/us','wrong'),boundEnv)).status,401);
assert.equal(serviceCalls.length,2);
const badService={fetch:async()=>new Response('failure',{status:401})};
const denied=await relay.fetch(request('/quote/us'),{...boundEnv,US_SERVICE:badService});
assert.equal(denied.status,401);
assert.equal((await denied.json()).error,'시세 원본 접근 토큰 확인 필요');
console.log('PASS: private service bindings bypass same-account HTTP and preserve upstream authentication');
console.log('PASS: authenticated shared quote relay, no D1 access or arbitrary redirects');

// Shared valuation is sourced once per refresh interval, not from either device.
const marketRows=new Map();
const marketDB={prepare(sql){let args=[];return {
 bind(...v){args=v;return this},
 async first(){return marketRows.get(args[0])||null},
 async run(){if(sql.startsWith('INSERT INTO market_valuation')){
  const [id,slot,payload,updated_at]=args;
  if(!marketRows.has(id)||marketRows.get(id).slot<slot)marketRows.set(id,{slot,payload,updated_at});
 }return {meta:{changes:1}}}
}}};
const recent=new Date().toISOString(),recentDay=recent.slice(0,10).replace(/-/g,'');
let quoteReads=0;
const krService={fetch:async()=>{quoteReads++;return new Response(JSON.stringify({
 ok:true,page:0,latestExpected:recentDay,rows:[{id:'reit',code:'329200',date:recentDay,close:4000}],
 extraQuotes:[{id:'hongah',code:'003280',date:recentDay,close:2000},{id:'sensor',code:'wrong',date:recentDay,close:123}]
}))}};
const usService={fetch:async()=>{quoteReads++;return new Response(JSON.stringify({source:'Finnhub personal use',fetchedAt:recent,quotes:{}}))}};
const valRelay=new Function('fetch','crypto',read('private-portfolio-sync-worker.js').replace('export default','return'))(
 async(url,options)=>{quoteReads++;assert.equal(url,'https://pdk7101.github.io/Jungho/us-quotes.json');return new Response(JSON.stringify({
 market:'US',currency:'USD',fx:{ok:true,usdKrw:1400,observedAt:recent},
 items:[{id:'schd',ticker:'SCHD',ok:true,date:recentDay,close:20}],
 extraQuotes:{spacex:{id:'spacex',ticker:'SPCX',ok:true,date:recentDay,close:10}}
 }));},globalThis.crypto);
const valEnv={...relayEnv,DB:marketDB,KRX_SERVICE:krService,US_SERVICE:usService};
const valA=await (await valRelay.fetch(request('/quote/valuation'),valEnv)).json();
const valB=await (await valRelay.fetch(request('/quote/valuation'),valEnv)).json();
assert.deepEqual(valA,valB,'devices get the same common snapshot in one interval');
assert.equal(quoteReads,3,'common snapshot avoids repeated upstream requests');
assert.equal(valA.kr.reit.amount,4000);
assert.equal(valA.kr.hongah.amount,2000);
assert.equal(valA.kr.sensor,undefined,'wrong code not cached');
assert.equal(valA.us.schd.amount,28000);
assert.equal(valA.us.spacex.amount,14000);
assert.equal(valA.us.schd.fxRate,valA.us.spacex.fxRate);
for(const row of marketRows.values())row.slot--;
const failedEnv={...valEnv,KRX_SERVICE:{fetch:async()=>new Response('failure',{status:502})}};
const afterFailure=await (await valRelay.fetch(request('/quote/valuation'),failedEnv)).json();
assert.deepEqual(afterFailure.kr,valA.kr,'common KR last-good prices survive upstream failure');
assert.equal((await valRelay.fetch(request('/quote/valuation','wrong'),valEnv)).status,401);
window.ISA_SHARED_QUOTES={valuationEnabled:()=>true,valuationPrice:(m,id)=>({amount:m==='kr'?4000:28000,date:recent.slice(0,10),source:'synthetic common quote'})};
window.ISA_US_KRW.priceKrw=()=>({amount:999999,stamp:recent});
assert.equal(portfolio.row('us','schd').unitPrice,28000,'shared valuation takes priority over device-only quote');
assert.equal(portfolio.row('domestic','treit').unitPrice,4000);
window.ISA_SHARED_QUOTES.valuationPrice=()=>null;
assert.equal(portfolio.row('us','schd').unitPrice,100,'missing common price falls back only to shared recorded photo, never device quote');
console.log('PASS: common valuation snapshot, shared FX, source validation, last-good fallback, no device-only price override');
