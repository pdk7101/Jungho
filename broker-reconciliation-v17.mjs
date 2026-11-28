// Broker comparison only: no credentials, network, storage writes, or order paths.
import {instrument,holdingId} from './instrument-registry.mjs';
const n=v=>typeof v==='number'||typeof v==='string'&&/^\+?\d+(?:\.\d+)?$/.test(v.trim())?Number(v):NaN;
const nn=v=>{const x=n(v);if(!Number.isFinite(x)||x<0||x>1e15)throw Error('invalid_broker_number');return x;};
const codeKR=v=>{const s=String(v??'').trim().toUpperCase().replace(/^A(?=[0-9A-Z]{6}$)/,'');if(!/^[0-9A-Z]{6}$/.test(s))throw Error('invalid_symbol');return s;};
const codeUS=v=>{const s=String(v??'').trim().toUpperCase();if(!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(s))throw Error('invalid_symbol');return s;};
const fresh=(at,now)=>{const t=Date.parse(at);return Number.isFinite(t)&&t<=now&&now-t<=5*60000;};
export function tossSnapshot(data,{now=Date.now(),singleAccountConfirmed=false}={}){
 if(data?.ok!==true||!Array.isArray(data.holdings)||data.holdings.length!==data.holdingCount||data.holdings.length>1000||data.accountCount!==1||!singleAccountConfirmed||!fresh(data.fetchedAt,now))throw Error('toss_scope_or_freshness_unconfirmed');
 const rows=data.holdings.map(x=>{
  if(!['KR','US'].includes(x.marketCountry)||x.currency!==(x.marketCountry==='KR'?'KRW':'USD'))throw Error('market_currency_mismatch');
  const kr=x.marketCountry==='KR',qty=nn(x.quantity),avg=nn(x.averagePurchasePrice),cost=nn(x.purchaseAmount);
  if(kr&&!Number.isSafeInteger(qty)||qty>0&&avg===0)throw Error('invalid_holding');
  // USD average/cost is not historical KRW purchase basis. Never convert with today's FX.
  return {account:kr?'toss-kr':'toss-us',symbol:kr?codeKR(x.symbol):codeUS(x.symbol),qty,avgKRW:kr?avg:null,avgUSD:kr?null:avg,purchaseAmount:cost,currency:x.currency};
 });
 return {source:'toss',fetchedAt:data.fetchedAt,rows};
}
// Each page must be fetched by an authorized, private server using kt00018.
// Account identity is an explicit operator confirmation, not inferred from rows.
export function kiwoomSnapshot(pages,{fetchedAt,now=Date.now(),isaConfirmed=false}={}){
 if(!isaConfirmed||!fresh(fetchedAt,now)||!Array.isArray(pages)||pages.length<1||pages.length>20)throw Error('isa_scope_or_freshness_unconfirmed');
 const rows=[],seenKeys=new Set();
 for(let i=0;i<pages.length;i++){
  const {body,contYn,nextKey}=pages[i]||{};
  if(body?.return_code!==0||!Array.isArray(body.acnt_evlt_remn_indv_tot)||!['Y','N'].includes(contYn)||contYn!==(i===pages.length-1?'N':'Y'))throw Error('incomplete_kiwoom_pages');
  if(contYn==='Y'){if(typeof nextKey!=='string'||!nextKey||seenKeys.has(nextKey))throw Error('invalid_continuation');seenKeys.add(nextKey);}
  for(const x of body.acnt_evlt_remn_indv_tot){
   if(x.crd_tp!=='00')throw Error('noncash_holding');
   const qty=nn(x.rmnd_qty),avg=nn(x.pur_pric),cost=nn(x.pur_amt);
   if(!Number.isSafeInteger(qty)||qty>0&&avg===0)throw Error('invalid_holding');
   rows.push({account:'kiwoom-isa',symbol:codeKR(x.stk_cd),qty,avgKRW:avg,avgUSD:null,purchaseAmount:cost,currency:'KRW'});
   if(rows.length>1000)throw Error('too_many_rows');
  }
 }
 return {source:'kiwoom',fetchedAt,rows};
}
export function compareBroker(model,records,snapshot){
 const groups=new Map(),out=[];
 for(const row of snapshot.rows){const key=row.account+'|'+row.symbol;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 for(const [key,rows] of groups){
  const r=rows[0],matches=Object.values(model.state.holdings).filter(h=>!h.archived&&h.account===r.account&&model.state.catalog[h.instrumentId]?.symbol===r.symbol);
  if(rows.length!==1||matches.length>1){out.push({key,status:'ambiguous',proposed:null});continue;}
  if(matches.length===0){out.push({key,status:'unregistered',proposed:null,broker:r});continue;}
  const h=matches[0],b=records[h.id];
  const qtyMatch=b?.qty!==null&&b?.qty!==undefined&&Math.abs(b.qty-r.qty)<1e-8;
  const avgMatch=r.avgKRW!==null&&b?.avgKRW!==null&&b?.avgKRW!==undefined&&Math.abs(b.avgKRW-r.avgKRW)<0.01;
  out.push({key,id:h.id,status:qtyMatch&&avgMatch?'match':r.currency==='USD'?'review_us_basis':'review',broker:r,recorded:b??null,proposed:null});
 }
 // Missing from broker is not evidence of sale, never set qty=0.
 for(const h of Object.values(model.state.holdings)){
  const eligible=snapshot.source==='kiwoom'?h.account==='kiwoom-isa':h.account==='toss-kr'||h.account==='toss-us';
  const key=h.account+'|'+model.state.catalog[h.instrumentId]?.symbol;
  if(eligible&&!h.archived&&!groups.has(key))out.push({key,id:h.id,status:'not_returned',proposed:null});
 }
 return {source:snapshot.source,fetchedAt:snapshot.fetchedAt,rows:out,writeAllowed:false};
}
