// Contract: saved, dated, after-tax US payouts must update the same browser's
// ledger and cumulative card/account calculation. Synthetic amounts only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../us-krw.js',import.meta.url),'utf8');
const coreStart=src.indexOf("const LEDGER_KEY='isa-us-distributions-krw-v1'");
const coreEnd=src.indexOf('function positionKrw(id,priceUsd){',coreStart);
const anchorStart=src.indexOf('function dayBefore(iso){');
const anchorEnd=src.indexOf('function payoutStorageDiagnostic(id){',anchorStart);
const saveStart=src.indexOf('function parsePayoutWonText(raw,required){');
const saveEnd=src.indexOf('// Restore user-owned dated receipts',saveStart);
assert.ok(coreStart>=0&&coreEnd>coreStart&&anchorStart>=0&&
 anchorEnd>anchorStart&&saveStart>=0&&saveEnd>saveStart);
const build=new Function('$','ITEMS','storage','write','holdings','day',
 'localStorage','renderForm','render','won','clean','window','Date','Math',
 src.slice(coreStart,coreEnd)+'\n'+src.slice(anchorStart,anchorEnd)+'\n'+
 src.slice(saveStart,saveEnd)+
 '\nreturn {addDistribution,ledgerEntries,netDividend,parsePayoutWonText};');
const ledgerKey='isa-us-distributions-krw-v1',holdKey='isa-us-holdings-v1';
const memory=new Map([
 [ledgerKey,JSON.stringify([{key:'prior',id:'cony',date:'2026-11-13',net:300}])],
 [holdKey,JSON.stringify({cony:{krwNet:1000,qty:80,krwAvg:20000}})]
]);
const localStorage={
 getItem:key=>memory.get(key)??null,
 setItem:(key,v)=>memory.set(key,String(v)),
 removeItem:key=>memory.delete(key)
};
const read=key=>JSON.parse(localStorage.getItem(key)||'null');
const fields={
 'us-distribution-ticker':{value:'cony'},
 'us-distribution-date':{value:'2026-11-20'},
 'us-dist-net':{value:'12,500원'},
 'us-dist-gross':{value:''},
 'us-dist-tax':{value:''},
 'us-dist-reinvest':{value:''},
 'us-dist-message':{textContent:'',dataset:{},setAttribute:()=>{},scrollIntoView:()=>{}}
};
let rerenders=0;
const app=build(id=>fields[id]??null,['SCHD','AGNC','SPYM','CONY'],
 read,(key,val)=>{localStorage.setItem(key,JSON.stringify(val));return true;},
 ()=>read(holdKey)||{},()=> '2026-11-20',localStorage,
 ()=>{},()=>{rerenders++;},n=>Number(n).toLocaleString('ko-KR')+'원',
 String,{},Date,Math);
assert.equal(app.parsePayoutWonText('₩12,500원',true),12500);
assert.equal(app.parsePayoutWonText('12,500.00',true),12500);
assert.ok(Number.isNaN(app.parsePayoutWonText('12,50원',true)));
assert.equal(app.netDividend('cony').amount,1000);
assert.equal(app.netDividend('cony').unlinked,true);
app.addDistribution();
assert.equal(app.ledgerEntries().length,2);
assert.equal(app.ledgerEntries()[1].net,12500);
assert.equal(read(holdKey).cony.krwNetAsOf,'2026-11-13');
assert.equal(app.netDividend('cony').amount,13500);
assert.equal(fields['us-dist-message'].dataset.result,'success');
assert.ok(fields['us-dist-message'].textContent.includes('13,500원'));
assert.equal(rerenders,1);
fields['us-dist-net'].value='12,500원';
app.addDistribution();
assert.equal(app.ledgerEntries().length,2);
assert.equal(fields['us-dist-message'].dataset.result,'error');
fields['us-dist-net'].value='12,50원';
app.addDistribution();
assert.equal(app.ledgerEntries().length,2);
assert.equal(fields['us-dist-message'].dataset.result,'error');
assert.ok(src.includes('type="text" inputmode="decimal"'));
assert.ok(src.includes('입금액 저장 · 전체 합계 재계산'));
console.log('PASS: mobile after-tax payout save, won parsing, cumulative roll-forward and duplicate rejection');
