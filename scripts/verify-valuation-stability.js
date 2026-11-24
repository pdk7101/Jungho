/**
 * Reproduce mid-refresh Toss/Kiwoom valuation flicker with synthetic browser data.
 * No real holdings, market prices, KRX data, API credentials or user data used.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../account-summary.js',import.meta.url),'utf8');
const values=new Map(),nodes=new Map(),handlers=new Map();
const localStorage={
 getItem:k=>values.get(k)??null,
 setItem:(k,v)=>values.set(k,String(v)),
 removeItem:k=>values.delete(k)
};
const document={
 getElementById:id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',
   addEventListener:(event,cb)=>handlers.set(id+':'+event,cb)});
  return nodes.get(id);
 },
 addEventListener:()=>{}
};
const SYMBOLS=[...['schd','spym','cony','agnc','spacex'].map(id=>['us',id]),
 ...['tsofr','treit','ttr','biotech','tspace','media','trobot','hongah','sensor'].map(id=>['domestic',id])];
let tossValue=9000,kiwoomValue=1900,invested=10000,kiwoomCost=2000,qty=10;
const appWindow={
 addEventListener:()=>{},
 ISA_PORTFOLIO_TOTALS:{totals:()=>({
  invested,value:tossValue,completeBasis:true,completeValue:true,
  knownInvested:invested,count:14,knownCount:14,date:null,mixedDates:true,
  source:'synthetic mixed-date basket',
  rows:SYMBOLS.map(([market,id],i)=>({market,id,qty:i===0?qty:1,avg:100}))
 })},
 ISA_KR_APP:{accountTotals:()=>({
  principal:kiwoomCost,value:kiwoomValue,
  missingHoldings:[],missingPrice:kiwoomValue===null?['reit']:[],
  intraday:0,close:kiwoomValue===null?0:6,dates:kiwoomValue===null?[]:['2026-11-23'],
  holdingsKey:JSON.stringify({kiwoomCost})
 })}
};
vm.runInNewContext(script,{
 window:appWindow,document,localStorage,Date,Intl,Math,Number,String,
 JSON,Object,Array
},{filename:'account-summary.js'});
const app=appWindow.ISA_ACCOUNT_SUMMARY;
const shown=id=>document.getElementById(id).textContent;
const oldToss=shown('toss-total-value'),oldKiwoom=shown('kiwoom-total-value');
assert.equal(oldToss,'9,000원');
assert.equal(oldKiwoom,'1,900원');
assert.ok(values.has('isa-account-locked-reference-v1'),
 'initial complete estimates are stored as private device-only references');
// Quotes arrive separately: the Toss 14-position basket changes sources and
// the KRX six-ticker response temporarily disappears while refreshing.
tossValue=8700;kiwoomValue=null;
app.refresh();
assert.equal(app.getTotals().toss.value,8700,'fresh calculations can change internally');
assert.equal(app.getTotals().kiwoom.value,null,'KRX missing data remains unavailable in raw calculation');
assert.equal(shown('toss-total-value'),'8,700원',
 'a complete 14-position valuation automatically refreshes with available dated prices');
assert.equal(shown('kiwoom-total-value'),oldKiwoom,
 'temporary KRX lookup failure keeps the previous reference instead of dropping it');
assert.ok(shown('account-summary-total').includes('평가금액 10,600원'),
 'combined value reflects refreshed Toss and preserved last-good Kiwoom');
kiwoomValue=1800;app.refresh();
assert.equal(shown('kiwoom-total-value'),'1,800원',
 'restored complete KRX bars automatically update the reference');
assert.equal(typeof handlers.get('account-summary-recalc:click'),'function',
 'there is an explicit owner action for recalculation');
await handlers.get('account-summary-recalc:click')();
assert.equal(shown('toss-total-value'),'8,700원',
 'optional explicit refresh keeps current synthetic Toss basket');
assert.equal(shown('kiwoom-total-value'),'1,800원',
 'optional explicit refresh keeps current synthetic Kiwoom valuation');
assert.ok(shown('account-summary-total').includes('평가금액 10,500원'));
// Editing the actual holdings is a user action and must invalidate the lock.
qty=11;invested=10300;tossValue=8750;app.refresh();
assert.equal(shown('toss-total-invested'),'10,300원');
assert.equal(shown('toss-total-value'),'8,750원',
 'change of quantity or cost automatically updates its own saved reference');
// A temporarily incomplete fresh KRX reference does not overwrite the saved one.
kiwoomValue=null;app.refresh();
assert.equal(shown('kiwoom-total-value'),'1,800원');
await handlers.get('account-summary-recalc:click')();
assert.equal(shown('kiwoom-total-value'),'1,800원',
 'explicit refresh also refuses to replace a verified reference with missing prices');
// A user's manually entered broker-wide valuation must still override automatic data.
values.set('isa-account-totals-v1',JSON.stringify({
 toss:{invested:12000,value:11500,date:'2026-11-23'}
}));
values.set('isa-account-calculation-mode-v1',JSON.stringify({toss:'manual',kiwoom:'auto'}));
app.refresh();
assert.equal(shown('toss-total-value'),'11,500원',
 'manual whole-account broker figure always takes priority');
assert.equal(shown('kiwoom-total-value'),'1,800원');
console.log('PASS: automatic complete valuation refresh, incomplete KRX fallback, holding edits, manual overrides');
