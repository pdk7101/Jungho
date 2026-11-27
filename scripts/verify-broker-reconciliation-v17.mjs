import assert from 'node:assert/strict';
import {initialPreview,previewAdd} from '../registry-ui-preview.mjs';
import {tossSnapshot,kiwoomSnapshot,compareBroker} from '../broker-reconciliation-v17.mjs';
const now=Date.parse('2026-11-27T05:00:00Z'),fetchedAt=new Date(now).toISOString();
let model=initialPreview();
const added=previewAdd(model,{account:'toss-us',symbol:'QQQM',name:'QQQM'});model=added.model;
const toss={ok:true,accountCount:1,holdingCount:3,fetchedAt,holdings:[
 {marketCountry:'US',currency:'USD',symbol:'QQQM',quantity:1.5,averagePurchasePrice:20,purchaseAmount:30},
 {marketCountry:'KR',currency:'KRW',symbol:'A329200',quantity:3,averagePurchasePrice:5000,purchaseAmount:15000},
 {marketCountry:'KR',currency:'KRW',symbol:'123456',quantity:1,averagePurchasePrice:1000,purchaseAmount:1000}
]};
const records={[added.id]:{qty:1,avgKRW:30000},'toss-kr|KR:KRX-ETF:329200':{qty:3,avgKRW:5000}};
const options={now,singleAccountConfirmed:true};
assert.throws(()=>tossSnapshot(toss,{now}));
assert.throws(()=>tossSnapshot({...toss,accountCount:2},options));
assert.throws(()=>tossSnapshot({...toss,fetchedAt:'2026-11-27T04:00:00Z'},options));
assert.throws(()=>tossSnapshot({...toss,holdings:[{...toss.holdings[0],currency:'KRW'},...toss.holdings.slice(1)]},options));
const snap=tossSnapshot(toss,options);
assert.equal(snap.rows[0].avgKRW,null);assert.equal(snap.rows[0].avgUSD,20);
const report=compareBroker(model,records,snap);
assert.equal(report.writeAllowed,false);
assert.equal(report.rows.find(r=>r.key==='toss-us|QQQM').status,'review_us_basis');
assert.equal(report.rows.find(r=>r.key==='toss-kr|329200').status,'match');
assert.equal(report.rows.find(r=>r.key==='toss-kr|123456').status,'unregistered');
assert.ok(report.rows.some(r=>r.status==='not_returned'));
assert.ok(report.rows.every(r=>r.proposed===null));
assert.equal(records[added.id].qty,1);
assert.equal(compareBroker(model,records,{...snap,rows:[...snap.rows,snap.rows[0]]}).rows.find(r=>r.key==='toss-us|QQQM').status,'ambiguous');
const page={contYn:'N',body:{return_code:0,acnt_evlt_remn_indv_tot:[{stk_cd:'A0167B0',rmnd_qty:'000000000000004',pur_pric:'000000000010000',pur_amt:'000000000040000',crd_tp:'00'}]}};
const kopt={now,fetchedAt,isaConfirmed:true};
assert.throws(()=>kiwoomSnapshot([page],{now,fetchedAt}));
assert.throws(()=>kiwoomSnapshot([{...page,contYn:'Y',nextKey:'next'}],kopt));
assert.throws(()=>kiwoomSnapshot([{...page,body:{...page.body,return_code:1}}],kopt));
assert.throws(()=>kiwoomSnapshot([{...page,body:{...page.body,acnt_evlt_remn_indv_tot:[{...page.body.acnt_evlt_remn_indv_tot[0],crd_tp:'03'}]}}],kopt));
const k=kiwoomSnapshot([page],kopt);
assert.equal(k.rows[0].symbol,'0167B0');assert.equal(k.rows[0].qty,4);assert.equal(k.rows[0].avgKRW,10000);
assert.equal(compareBroker(model,{},k).rows.find(r=>r.key==='kiwoom-isa|0167B0').status,'review');
assert.equal(kiwoomSnapshot([{...page,contYn:'Y',nextKey:'next'},page],kopt).rows.length,2);
console.log('PASS: broker identity, account scope, stale snapshots, continuation, USD basis protection and read-only reconciliation');
