// Read-only consolidated reference valuation; never writes legacy account records.
import {aliases} from './legacy-registry-preview.mjs';
import {instrument,holdingId} from './instrument-registry.mjs';
import {validFx,chooseValuationQuote,valueNewPosition} from './registry-valuation-v17.mjs';
const accounts=['kiwoom-isa','toss-kr','toss-us'];
const keys={'kiwoom-isa':'isa-private-positions-v1','toss-kr':'isa-private-toss-domestic-holdings-v1','toss-us':'isa-us-holdings-v1'};
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const parse=n=>typeof n==='number'||typeof n==='string'&&n.trim()?Number(n):null;
const known=n=>{const v=parse(n);return finite(v)?v:null;};
const sum=(rows,k)=>rows.every(r=>finite(r[k]))?rows.reduce((a,r)=>a+r[k],0):null;
const day=(stamp)=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(stamp)).map(x=>[x.type,x.value]));return p.year+p.month+p.day;};
export function publishedFx(payload,now=Date.now()){
 const f=payload?.fx,stamp=Date.parse(f?.observedAt);
 if(payload?.market!=='US'||payload.currency!=='USD'||f?.ok!==true||!Number.isFinite(stamp)||stamp>now||now-stamp>3*86400000)return null;
 const fx={rate:f.usdKrw,date:day(stamp),observedAt:f.observedAt,source:'기존 공개 참고환율',manual:false};
 return validFx(fx,now)?fx:null;
}
export async function loadPublishedFx(fetchImpl=fetch,now=Date.now()){
 const r=await fetchImpl('./us-quotes.json',{cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('fx_unavailable');
 return publishedFx(await r.json(),now);
}
export function readLegacyBasis(storage){
 const records={};
 for(const account of accounts){
  let data={};
  try{const parsed=JSON.parse(storage.getItem(keys[account])||'null');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))data=parsed;}catch(_){}
  for(const a of aliases.filter(x=>x.account===account)){
   const id=holdingId(account,instrument(a)),r=data[a.legacyId]||{};
   let qty=known(r.qty),avgKRW=known(account==='toss-us'?r.krwAvg:r.avg);
   if(a.market==='KR'&&qty!==null&&!Number.isSafeInteger(qty))qty=null;
   if(avgKRW===0)avgKRW=null;
   records[id]={qty,avgKRW};
  }
 }
 return records;
}
export function consolidated(model,{legacyBasis={},newBasis={},inputs={},legacyConfirmed=false,newConfirmed=false}={}){
 const legacyIds=new Set(aliases.map(a=>holdingId(a.account,instrument(a))));
 const rows=[];
 for(const h of Object.values(model.state.holdings)){
  const i=model.state.catalog[h.instrumentId];
  if(!i||h.archived)continue;
  if(legacyIds.has(h.id)){
   const b=legacyConfirmed?legacyBasis[h.id]:null,qty=b?.qty,avg=b?.avgKRW;
   const cost=qty===0?0:finite(qty)&&finite(avg)&&avg>0&&Number.isFinite(qty*avg)?qty*avg:null;
   const q=chooseValuationQuote(i,inputs);
   const value=qty===0?0:finite(qty)&&q&&finite(q.amountKRW)&&Number.isFinite(qty*q.amountKRW)?qty*q.amountKRW:null;
   rows.push({id:h.id,account:h.account,kind:'legacy',cost,value,netDistributionsKRW:null,quoteDate:q?.date??null});
  }else if(model.added.includes(h.id)){
   const v=valueNewPosition(model,newConfirmed?newBasis:{},h.id,inputs);
   rows.push({...v,kind:'new',quoteDate:v.quote?.date??null});
  }
 }
 // Missing legacy registration is not silently treated as zero.
 for(const a of aliases){const id=holdingId(a.account,instrument(a));if(!rows.some(r=>r.id===id))rows.push({id,account:a.account,kind:'legacy',cost:null,value:null,netDistributionsKRW:null,quoteDate:null});}
 const summarize=r=>{
  const cost=sum(r,'cost'),value=sum(r,'value'),profit=cost!==null&&value!==null?value-cost:null;
  return {count:r.length,cost,value,profit,returnPct:profit!==null&&cost>0?profit/cost*100:null,missing:r.filter(x=>x.cost===null||x.value===null).length,
   dates:[...new Set(r.map(x=>x.quoteDate).filter(Boolean))].sort(),newNetDistributionsKRW:sum(r.filter(x=>x.kind==='new'),'netDistributionsKRW'),
   combinedNetDistributionsKRW:null};
 };
 return {accounts:Object.fromEntries(accounts.map(a=>[a,summarize(rows.filter(r=>r.account===a))])),all:summarize(rows),rows};
}
