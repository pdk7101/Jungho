import assert from 'node:assert/strict';
import {addHolding} from '../instrument-registry.mjs';
import {activeUS,selectBatch,collectUS,normalize,BATCH,INTERVAL} from '../private-us-collector-v17.mjs';
let state={catalog:{},holdings:{}};
for(let n=0;n<100;n++)state=addHolding(state,'toss-us',{market:'US',venue:'US',symbol:'T'+n,name:'Synthetic '+n});
const symbols=activeUS(state.catalog,state.holdings);
assert.equal(symbols.length,100);
assert.equal(selectBatch(symbols,{},100000).length,10);
let nextAt=0,calls=0,records={};
const store={init:async()=>{},load:async()=>records,claim:async now=>{
 if(now<nextAt)return false;nextAt=now+INTERVAL;return true;
},backoff:async until=>{nextAt=Math.max(nextAt,until)},save:async (s,attemptAt,quote,error)=>{
 records[s]={attemptAt,quote:quote||records[s]?.quote||null,error};
}};
const start=Date.parse('2026-11-27T15:00:00Z');
const run=(now,sessionOpen=true,override)=>collectUS({...state,store,now,sessionOpen,
 fetchQuote:async s=>{calls++;return override?override(s):{status:200,body:{c:10,t:(now-1000)/1000}}}});
assert.equal((await run(start,false)).attempted,0);
assert.equal((await run(start)).attempted,BATCH);
assert.equal((await run(start)).attempted,0);
for(let m=1;m<10;m++)await run(start+m*INTERVAL);
assert.equal(Object.keys(records).length,100);
assert.equal(calls,100);
assert.equal(Object.values(records).every(r=>r.quote.usd===10),true);
const old=records[symbols[0]].quote;
const limited=await run(start+10*INTERVAL,true,()=>({status:429}));
assert.equal(limited.attempted,1);
assert.equal(limited.status,'provider-rate-limit');
assert.equal((await run(start+11*INTERVAL)).attempted,0);
assert.equal(records[symbols[0]].quote.usd,old.usd);
assert.equal(normalize('T0',{c:10,t:(start+120000)/1000},start),null);
assert.equal(normalize('T0',{c:0,t:start/1000},start),null);
console.log('PASS: 100 US symbols, deduplicated queue, shared reservation, closed market, fair rotation, 429 backoff, last good quote');
