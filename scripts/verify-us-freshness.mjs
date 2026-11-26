import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const signals=read('us-signals.js'),dashboard=read('us-dashboard.js');
const now=new Date('2026-11-27T15:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now.getTime()]))}static now(){return now.getTime()}}
const rules=new Function('Date','NAMES','valid','krw','window','read',
 signals.slice(signals.indexOf('function sessionTrade('),signals.indexOf('function decision(id)'))+
 '\nreturn {sessionTrade,evaluate};')(Clock,{schd:'SCHD'},
 n=>typeof n==='number'&&Number.isFinite(n)&&n>0,String,{ISA_ORDER_PLAN:{tossDailyKrw:()=>4000}},()=>null);
const x={ok:true,date:'20261125',close:99,low20:90,high20:120,bars:Array.from({length:40},()=>({date:'20261125',close:100,volume:100})),
 trend:{ma5:100,ma20:100,volume:100,previousVolumeAverage:100}};
const q={x,usdPrice:99,krw:{amount:138600,usd:99,stamp:'2026-11-27T14:55:00Z'},qty:10,avg:154000,
 priceKind:'finnhub-private',session:{open:true,calendarKnown:true,today:'20261127',expected:'20261125'}};
assert.equal(rules.sessionTrade(q),true);
assert.equal(rules.evaluate('schd',q,null).type,'buy');
for(const [stamp,kind] of [['2026-11-27T14:29:00Z','finnhub-private'],['2026-11-27T13:30:00Z','finnhub-private'],
 ['2026-11-25T21:00:00Z','finnhub-private'],['2026-11-27T14:55:00Z','usd-close']]){
 const v={...q,priceKind:kind,krw:{...q.krw,stamp}};
 assert.equal(rules.sessionTrade(v),false);
 assert.equal(rules.evaluate('schd',v,null).type,'wait');
}
assert.equal(rules.evaluate('schd',{...q,priceKind:'usd-close',session:{...q.session,open:false}},null).type,'buy');
assert.equal(rules.evaluate('schd',{...q,session:{...q.session,expected:'20261127'}},null).type,'wait');
const merge=new Function(dashboard.slice(dashboard.indexOf('function mergeDaily('),dashboard.indexOf('async function refresh(){'))+'\nreturn mergeDaily;')();
const bar=(id,ticker,date,close)=>({id,ticker,date,close,ok:true,bars:Array.from({length:40},()=>({date,close}))});
const fx={ok:true,usdKrw:1400,observedAt:'2026-11-25T22:00:00Z'};
const previous={items:[bar('schd','SCHD','20261125',35),bar('agnc','AGNC','20261125',8)],extraQuotes:{spacex:bar('spacex','SPCX','20261125',127)},fx};
const next={items:[{id:'schd',ok:false},bar('agnc','AGNC','20261124',7)],fx:{ok:false}};
const result=merge(previous,next,now.getTime());
assert.equal(result.items[0].close,35);
assert.equal(result.items[1].close,8);
assert.equal(result.extraQuotes.spacex.close,127);
assert.equal(result.fx.usdKrw,1400);
assert.equal(merge(previous,{items:[bar('schd','SCHD','20261126',36)]},now.getTime()).items[0].close,36);
assert.equal(merge(null,{items:[bar('schd','WRONG','20261126',36)]},now.getTime()).items[0].ok,false);
console.log('PASS: US session trade guard, stale fallback, after-close planning, partial response and FX preservation');
