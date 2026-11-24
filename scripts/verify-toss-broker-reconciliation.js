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
console.log('PASS: Toss actual broker total authority, discrepancy, 14-price provenance, same-day override, explicit auto mode');
