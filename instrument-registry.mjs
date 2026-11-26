// v17 architecture prototype. Pure functions only; no network, storage, trading or migration writes.
export const MAX_INSTRUMENTS=100;
export const ACCOUNTS=Object.freeze({'kiwoom-isa':'KR','toss-kr':'KR','toss-us':'US'});
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'?v.trim():'';
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function instrument(input){
 if(!obj(input))throw Error('instrument');
 const market=text(input.market).toUpperCase(),venue=text(input.venue).toUpperCase(),symbol=text(input.symbol).toUpperCase(),name=text(input.name);
 const valid=market==='KR'&&['KRX-ETF','KOSPI','KOSDAQ'].includes(venue)&&/^[0-9A-Z]{6}$/.test(symbol)||
  market==='US'&&venue==='US'&&/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol);
 if(!valid||!name||name.length>120)throw Error('instrument identity');
 return {id:market+':'+venue+':'+symbol,market,venue,symbol,name,currency:market==='KR'?'KRW':'USD'};
}
export function addInstrument(catalog,input){
 if(!obj(catalog))throw Error('catalog');
 const i=instrument(input);
 if(Object.hasOwn(catalog,i.id))return {...catalog};
 if(Object.keys(catalog).length>=MAX_INSTRUMENTS)throw Error('catalog limit');
 return {...catalog,[i.id]:i};
}
export function holdingId(account,i){
 if(!Object.hasOwn(ACCOUNTS,account)||ACCOUNTS[account]!==i.market)throw Error('account market mismatch');
 return account+'|'+i.id;
}
export function addHolding(state,account,input){
 if(!obj(state)||!obj(state.catalog)||!obj(state.holdings))throw Error('state');
 const i=instrument(input),catalog=addInstrument(state.catalog,i),id=holdingId(account,i);
 if(Object.hasOwn(state.holdings,id))return {...state,catalog};
 return {...state,catalog,holdings:{...state.holdings,[id]:{id,account,instrumentId:i.id,qty:null,avgKRW:null,archived:false}}};
}
export function archiveHolding(state,id){
 const h=state.holdings[id];
 if(!h||h.qty!==0)throw Error('holding not confirmed empty');
 return {...state,holdings:{...state.holdings,[id]:{...h,archived:true}}};
}
export function planQuotes(catalog,holdings,asOf,usBudget=0){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isSafeInteger(usBudget)||usBudget<0)throw Error('plan arguments');
 const ids=[...new Set(Object.values(holdings).filter(h=>!h.archived).map(h=>h.instrumentId))].sort();
 const grouped={},us=[];
 for(const id of ids){
  const i=catalog[id];if(!i)throw Error('missing catalog entry');
  if(i.market==='KR'){
   const k=i.venue;
   if(!grouped[k])grouped[k]={provider:'KRX',venue:k,asOf,ids:[],requestUnits:1};
   grouped[k].ids.push(id);
  }else us.push(id);
 }
 return {kr:Object.values(grouped),us:us.slice(0,usBudget).map(id=>({provider:'US_ADAPTER',id,requestUnits:1})),
  deferred:us.slice(usBudget),asOf};
}
export function totals(state,quotes){
 let cost=0,value=0;const missing=[];
 for(const h of Object.values(state.holdings)){
  if(h.archived&&h.qty===0)continue;
  if(h.qty===0)continue;
  const q=quotes[h.instrumentId];
  if(!num(h.qty)||!num(h.avgKRW)||h.avgKRW<=0){missing.push({id:h.id,reason:'holding'});continue;}
  cost+=h.qty*h.avgKRW;
  if(!q||!num(q.amountKRW)||q.amountKRW<=0||typeof q.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(q.date)){missing.push({id:h.id,reason:'quote'});continue;}
  value+=h.qty*q.amountKRW;
 }
 return {costKnown:cost,valueKnown:value,complete:missing.length===0,missing};
}
