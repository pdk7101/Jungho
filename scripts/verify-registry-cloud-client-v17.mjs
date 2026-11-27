import assert from 'node:assert/strict';
import {watchClient,workerOrigin,modelFromWatchlist} from '../registry-cloud-client-v17.mjs';
import {initialPreview,previewAdd} from '../registry-ui-preview.mjs';
const url='https://test.account.workers.dev',viewToken='synthetic-view-token-20-characters',writeToken='synthetic-write-token-32-characters-long';
assert.equal(workerOrigin(url),url);
for(const bad of ['http://test.account.workers.dev','https://test.account.workers.dev/quotes','https://test.account.workers.dev?token=bad','https://test.account.workers.dev.evil.invalid','https://user:pass@test.account.workers.dev'])assert.throws(()=>workerOrigin(bad));
let model=initialPreview(),requests=[],failRead=false;
const fake=async (path,opts)=>{
 requests.push({path,opts});
 assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');assert.equal(opts.cache,'no-store');
 if(opts.method==='POST'){
  assert.equal(opts.headers.Authorization,'Bearer '+writeToken);
  const data=JSON.parse(opts.body);assert.deepEqual(Object.keys(data).sort(),['account','name','symbol','venue']);
  const r=previewAdd(model,data);model=r.model;
  return {ok:true,json:async()=>({status:r.duplicate?'already_registered':'registered',symbol:data.symbol})};
 }
 assert.equal(opts.headers.Authorization,'Bearer '+viewToken);
 if(failRead)return {ok:false,status:503};
 return {ok:true,json:async()=>({schema:'watchlist-v17',...model.state})};
};
const c=watchClient({url,viewToken,writeToken,fetchImpl:fake});
const input={account:'toss-us',symbol:'qqqm',name:'QQQM'};
assert.equal((await c.load()).added.length,0);
const r=await c.register(input);assert.equal(r.model.added.length,1);
assert.equal(r.model.state.holdings[r.id].qty,null);
assert.deepEqual(requests.slice(-2).map(x=>x.opts.method),['POST','GET']);
assert.equal((await c.register(input)).duplicate,true);
const ro=watchClient({url,viewToken,fetchImpl:fake});await assert.rejects(ro.register(input));
failRead=true;await assert.rejects(c.register({account:'toss-us',symbol:'VTI',name:'VTI'}));
failRead=false;assert.equal((await c.load()).added.length,2);
assert.throws(()=>modelFromWatchlist({schema:'watchlist-v17',catalog:{},holdings:{}}));
console.log('PASS: cloud client endpoint validation, distinct tokens, confirmed readback, retry reconciliation');
