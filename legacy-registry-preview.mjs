// Read-only migration projection for legacy v16 account data.
// No storage writes, no network requests, no broker orders.
import {addHolding,holdingId,instrument,totals} from './instrument-registry.mjs';
const KR=[
 ['reit','329200','TIGER 리츠부동산인프라','KRX-ETF','treit'],
 ['sol','0167B0','SOL 200타겟위클리커버드콜','KRX-ETF',null],
 ['robot','469070','RISE AI&로봇','KRX-ETF','trobot'],
 ['space','0131V0','1Q 미국우주항공테크','KRX-ETF','tspace'],
 ['sofr','455030','KODEX 미국달러SOFR','KRX-ETF','tsofr'],
 ['tr','278530','KODEX 200TR','KRX-ETF','ttr'],
 ['biotech','0229F0','마이티 신약포커스바이오액티브','KRX-ETF','biotech'],
 ['media','228810','TIGER 미디어컨텐츠','KRX-ETF','media'],
 ['hongah','003280','흥아해운','KOSPI','hongah'],
 ['sensor','321370','센서뷰','KOSDAQ','sensor']
];
const US=[['schd','SCHD'],['agnc','AGNC'],['spym','SPYM'],['cony','CONY'],['spacex','SPCX']];
const num=(v,positive=false)=>{
 if(typeof v!=='number'&&typeof v!=='string'||String(v).trim()==='')return null;
 const n=Number(v);return Number.isFinite(n)&&n>=0&&(!positive||n>0)?n:null;
};
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):null;
export const aliases=[
 ...KR.slice(0,6).map(([legacyId,symbol,name,venue])=>({account:'kiwoom-isa',legacyId,market:'KR',venue,symbol,name})),
 ...KR.filter(r=>r[4]).map(([id,symbol,name,venue,legacyId])=>({account:'toss-kr',legacyId,market:'KR',venue,symbol,name})),
 ...US.map(([legacyId,symbol])=>({account:'toss-us',legacyId,market:'US',venue:'US',symbol,name:symbol}))
];
// Prefer the existing resolved row API for Toss (including the exact legacy
// fallback rules). A non-shared official broker row is not eligible for
// migration into the shared owner-entered cost basis.
export function projectLegacy({isaRows={},tossRows=[],shared=false}={}){
 let state={catalog:{},holdings:{}},diagnostics=[];
 const toss=new Map(tossRows.map(r=>[r.market+'|'+r.id,r]));
 for(const a of aliases){
  state=addHolding(state,a.account,a);
  const i=instrument(a),id=holdingId(a.account,i);
  const r=a.account==='kiwoom-isa'?isaRows[a.legacyId]:toss.get((a.account==='toss-us'?'us':'domestic')+'|'+a.legacyId);
  const ineligible=a.account!=='kiwoom-isa'&&r?.official;
  let qty=ineligible?null:num(r?.qty),avgKRW=ineligible?null:num(r?.avg,true);
  if(a.market==='KR'&&qty!==null&&!Number.isSafeInteger(qty))qty=null;
  state.holdings[id]={...state.holdings[id],qty,avgKRW,legacyId:a.legacyId,
   basisDate:date(r?.holdingDate||r?.snapshotDate),basisSource:ineligible?'device-broker-excluded':r?.fromSnapshot?'legacy-snapshot':'legacy-record'};
  if(ineligible||qty===null||qty>0&&avgKRW===null)diagnostics.push({id,reason:ineligible?'device-broker-excluded':'basis-missing'});
 }
 return {state,diagnostics,shared:Boolean(shared),migrationReady:false};
}
// Read only: compare the amount produced by existing resolved records against
// the same projection. Never silently apply a difference.
export function compareBasis(preview,legacyTotals){
 const result={};
 for(const account of ['kiwoom-isa','toss-kr','toss-us']){
  const h=Object.values(preview.state.holdings).filter(h=>h.account===account);
  const known=h.every(r=>r.qty!==null&&(r.qty===0||r.avgKRW!==null));
  const sum=known?h.reduce((s,r)=>s+(r.qty===0?0:r.qty*r.avgKRW),0):null;
  const expected=num(legacyTotals?.[account]);
  result[account]={projected:sum,legacy:expected,match:sum!==null&&expected!==null&&Math.abs(sum-expected)<0.01};
 }
 return result;
}
export function quoteRegistry(state){
 // Strip all position sizes, cost basis, dividends and names from the collector input.
 const catalog={},holdings={};
 for(const h of Object.values(state.holdings)){
  if(h.archived)continue;
  const i=state.catalog[h.instrumentId];
  if(!i||i.market!=='US')continue;
  const checked=instrument(i);
  catalog[checked.id]={id:checked.id,market:checked.market,venue:checked.venue,symbol:checked.symbol};
  holdings[checked.id]={instrumentId:checked.id,archived:false};
 }
 return {catalog,holdings};
}
// Registration by explicit symbol/market selection. Adds a watchlist entry
// only; never fabricates broker quantity, cost, trade or strategy.
export function registerForReview(state,account,input){
 const i=instrument(input);
 const next=addHolding(state,account,i);
 const id=holdingId(account,i);
 return {state:next,id,signal:'wait',reason:'신규 종목 시세 및 투자 규칙 확인 필요'};
}
