/**
 * Private KRX owner-only bridge verification, using synthetic official-shaped data only.
 * Never reads, stores or prints real API credentials or real KRX quotes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const workerSource=source('private-krx-etf-worker.js');
const clientSource=source('private-krx-client.js');
const pageSource=source('index.html');
const workflow=source('.github/workflows/pages.yml');
const funds=[['reit','329200'],['sol','0167B0'],['robot','469070'],
 ['space','0131V0'],['sofr','455030'],['tr','278530']];
const token='T'.repeat(64),origin='https://pdk7101.github.io';
const host='https://personal-krx-test.workers.dev';
let officialCalls=0,stockDenied=false;
const officialFetch=async request=>{
 officialCalls++;
 const url=new URL(request),date=url.searchParams.get('basDd');
 if(url.pathname.includes('/sto/')){
  if(stockDenied)return new Response('{}',{status:403});
  const code=url.pathname.endsWith('/stk_bydd_trd')?'003280':'321370';
  return new Response(JSON.stringify({OutBlock_1:[{BAS_DD:date,ISU_CD:code,TDD_CLSPRC:'1500'}]}),{status:200});
 }
 assert.match(date,/^\d{8}$/);
 return new Response(JSON.stringify({OutBlock_1:[...funds,['biotech','0229F0'],['media','228810']].map(([id,code],i)=>{
  const price=3800+i*1350+Number(date.slice(-2))*5;
  return {BAS_DD:date,ISU_SRT_CD:code,ISU_CD:'KR'+code+'xxxx',
   TDD_OPNPRC:String(price),TDD_HGPRC:String(price+120),
   TDD_LWPRC:String(price-100),TDD_CLSPRC:String(price+15),
   NAV:String(price+10),MKTCAP:'145000000000',
   LIST_SHRS:'12300000',INVSTASST_NETASST_TOTAMT:'139000000000',
   ACC_TRDVOL:'25,000',ACC_TRDVAL:'140000000'};})}),
 {status:200,headers:{'Content-Type':'application/json'}});
};
const backend=new Function('fetch',workerSource.replace('export default {','const worker={')+
 '\nreturn worker;')(officialFetch);
const env={KRX_AUTH_KEY:'synthetic-fake',KRX_VIEW_TOKEN:token};
const req=(p,key=token,site=origin)=>new Request(host+'/api/krx-history?page='+p,
 {headers:{Origin:site,Authorization:'Bearer '+key}});
assert.equal((await backend.fetch(req(0,'wrong'),env)).status,401,
 'unknown token cannot fetch market data');
assert.equal((await backend.fetch(req(0,token,'https://other.example'),env)).status,403,
 'unapproved browser origin rejected');
assert.equal((await backend.fetch(req(0,token),{KRX_VIEW_TOKEN:token})).status,503,
 'missing KRX key rejected');
assert.equal(officialCalls,0,'invalid authentication does not call KRX');
const storage=()=>{
 const map=new Map();
 return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),
 removeItem:key=>map.delete(key),snapshot:()=>Object.fromEntries(map)};
};
const localStorage=storage(),sessionStorage=storage(),window={},document={
 readyState:'loading',getElementById:()=>null,addEventListener:()=>{}
};
const browserFetch=(url,opts)=>backend.fetch(new Request(url,{
 headers:{Origin:origin,Authorization:opts.headers.Authorization}
}),env);
new Function('window','document','localStorage','sessionStorage','fetch',
 clientSource)(window,document,localStorage,sessionStorage,browserFetch);
window.ISA_PRIVATE_KRX.setConnection(host,token,true);
const snapshot=await window.ISA_PRIVATE_KRX.load();
assert.equal(snapshot.items.length,6);
assert.equal(snapshot.extraQuotes.biotech.code,'0229F0');
assert.equal(snapshot.extraQuotes.media.code,'228810');
assert.equal(snapshot.extraQuotes.hongah.code,'003280');
assert.equal(snapshot.extraQuotes.sensor.code,'321370');
assert.equal(snapshot.extraErrors.length,0);
assert.equal(window.ISA_PRIVATE_KRX.extraQuote('biotech').date,snapshot.items[0].date);
assert.equal(snapshot.items.some(x=>x.id==='biotech'||x.id==='media'),false,'Toss-only prices cannot change six ISA strategy items');
for(const ticker of snapshot.items){
 assert.equal(ticker.ok,true,'ticker requires 40 completed verified bars');
 assert.equal(ticker.bars.length,40);
 assert.ok(ticker.trend.ma20>0&&ticker.trend.ma5>0);
 assert.equal(ticker.code,funds.find(x=>x[0]===ticker.id)[1]);
}
assert.equal(window.ISA_PRIVATE_KRX.metrics().count,6,'NAV and AUM are derived privately');
assert.equal(window.ISA_PRIVATE_KRX.metricHistory().source,'KRX OPEN API');
const remembered=window.ISA_PRIVATE_KRX.lastGood();
assert.ok(remembered&&remembered.items.length===6,
 'owner-only official 6-ETF snapshot is retained for temporary KRX outages');
assert.equal(remembered.fetchedAt,snapshot.fetchedAt);
assert.equal(JSON.stringify(remembered).includes(token),false);

assert.equal(officialCalls>60,true,'KRX requests are made privately, never through GitHub');
assert.equal(JSON.stringify(snapshot).includes(token),false,'secret never appears in quotes');
assert.deepEqual(Object.keys(localStorage.snapshot()).sort(),
 ['isa-krx-private-view-token-v1','isa-krx-private-worker-url-v1',
  'isa-krx-last-good-device-v1'].sort(),
 'Worker URL and personal view token persist on this trusted device');
assert.equal(sessionStorage.getItem('isa-krx-private-view-token-v1'),null,
 'persistent mode does not require session token');
const reopenedWindow={};
new Function('window','document','localStorage','sessionStorage','fetch',
 clientSource)(reopenedWindow,document,localStorage,sessionStorage,browserFetch);
assert.equal(reopenedWindow.ISA_PRIVATE_KRX.configured(),true,
 'new browser visit automatically restores saved KRX connection');
const beforeRecent=officialCalls;
const reopened=await reopenedWindow.ISA_PRIVATE_KRX.load();
assert.equal(reopened.items.filter(x=>x.ok).length,6,
 'new browser visit can retrieve official-shaped prices without retyping the token');
assert.ok(officialCalls-beforeRecent>0&&officialCalls-beforeRecent<=20,
 'saved verified bars require only recent KRX page instead of all 100 calendar days');
assert.match(reopened.latestExpected,/^\d{8}$/);
assert.ok(reopened.items.every(x=>x.bars.length===40),
 'incremental refresh preserves 40-day analysis history');
stockDenied=true;
const denied=await reopenedWindow.ISA_PRIVATE_KRX.load();
assert.ok(denied.items.every(x=>x.ok),'stock permission failure must not block ETFs');
assert.equal(denied.extraErrors.length,2);
assert.equal(denied.extraQuotes.hongah.close,1500,'last verified stock quote remains available');
stockDenied=false;
assert.ok(pageSource.includes('이 기기에 개인 접근 토큰 저장'),
 'UI must plainly explain persistent device storage');
const cacheStamp=source('scripts/stamp-assets.js');
assert.ok(cacheStamp.includes("'private-krx-client.js'"),
 'the one-time-token update must be cache-busted on deployment');
assert.ok(pageSource.includes('내 전용 KRX 공식 종가 연결')&&
 pageSource.includes('private-krx-client.js'));
assert.ok(workflow.includes('private-krx-client.js')&&
 !workflow.includes('cp private-krx-etf-worker.js')&&
 !workflow.includes('KRX_AUTH_KEY: '+ '$'+'{{ secrets.KRX_AUTH_KEY }}'),
 'public site contains only the client, no private key and no licensed KRX bars');
assert.throws(()=>window.ISA_PRIVATE_KRX.calculate('space','0131V0',[]),
 /40거래일/,'cannot issue signal without verified 40-day history');
window.ISA_PRIVATE_KRX.disconnect();
assert.equal(localStorage.getItem('isa-krx-last-good-device-v1'),null,
 'disconnect also removes last official KRX close from this device');
assert.equal(window.ISA_PRIVATE_KRX.configured(),false);
assert.equal(sessionStorage.getItem('isa-krx-private-view-token-v1'),null,
 'disconnect removes session token');
assert.equal(localStorage.getItem('isa-krx-private-view-token-v1'),null,
 'disconnect removes persistent token');
assert.equal(localStorage.getItem('isa-krx-private-worker-url-v1'),null,
 'disconnect removes Worker address but keeps unrelated portfolio records');
window.ISA_PRIVATE_KRX.setConnection(host,token,false);
assert.equal(localStorage.getItem('isa-krx-private-view-token-v1'),null,
 'unchecked mode does not store a persistent token');
assert.equal(sessionStorage.getItem('isa-krx-private-view-token-v1'),token,
 'unchecked mode uses only tab session');
assert.equal(sessionStorage.getItem('isa-krx-private-session-only-v1'),'1',
 'explicit session-only mode remains respected after reopening the same tab');
const sessionWindow={};
new Function('window','document','localStorage','sessionStorage','fetch',
 clientSource)(sessionWindow,document,localStorage,sessionStorage,browserFetch);
assert.equal(sessionWindow.ISA_PRIVATE_KRX.configured(),true,
 'session-only token is usable on a same-tab reload');
assert.equal(localStorage.getItem('isa-krx-private-view-token-v1'),null,
 'explicit session-only mode does not silently upgrade to persistence');
// Emulate a token stored by the old tab-only version, before the new setting existed.
sessionStorage.removeItem('isa-krx-private-session-only-v1');
const migratedWindow={};
new Function('window','document','localStorage','sessionStorage','fetch',
 clientSource)(migratedWindow,document,localStorage,sessionStorage,browserFetch);
assert.equal(migratedWindow.ISA_PRIVATE_KRX.configured(),true,
 'existing browser session automatically upgrades to user-requested persistent connection');
assert.equal(localStorage.getItem('isa-krx-private-view-token-v1'),token,
 'existing connected session is migrated without another token prompt');
migratedWindow.ISA_PRIVATE_KRX.disconnect();
assert.equal(localStorage.getItem('isa-krx-private-view-token-v1'),null);
assert.equal(sessionStorage.getItem('isa-krx-private-view-token-v1'),null);
console.log('PASS: private KRX Worker authentication, 6 ETF moving averages, NAV, persistent re-entry-free trusted-device access');
