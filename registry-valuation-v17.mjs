// Isolated v17 new-position valuation. No legacy storage, broker orders or network.
import {closeContext} from './scripts/us-close-calendar.mjs';
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const nonnegative=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const day=s=>typeof s==='string'&&/^\d{8}$/.test(s)&&(()=>{const d=new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6)+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10).replaceAll('-','')===s})();
const dateKey=(now,zone)=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));return p.year+p.month+p.day;};
export function inputNumber(raw){if(typeof raw!=='string'||!raw.trim())return null;const n=Number(raw);if(!nonnegative(n))throw Error('invalid_number');return n;}
export function editNewBasis(model,records,id,input){
 const h=model.state.holdings[id],i=model.state.catalog[h?.instrumentId];
 if(!h||!i||!model.added.includes(id))throw Error('new_position_only');
 const {qty,avgKRW,netDistributionsKRW}=input;
 if(qty!==null&&(!nonnegative(qty)||i.market==='KR'&&!Number.isSafeInteger(qty))||
 avgKRW!==null&&!positive(avgKRW)||netDistributionsKRW!==null&&!nonnegative(netDistributionsKRW))throw Error('invalid_basis');
 if(qty!==null&&qty>0&&avgKRW!==null&&!Number.isFinite(qty*avgKRW))throw Error('invalid_basis');
 return {...records,[id]:{qty,avgKRW,netDistributionsKRW}};
}
// A single explicitly dated reference FX applies to all USD rows; no implied broker FX.
export function validFx(fx,now=Date.now()){
 const date=dateKey(now,'Asia/Seoul');
 if(!fx||!positive(fx.rate)||fx.rate<700||fx.rate>3000||!day(fx.date)||fx.date>date)return false;
 const epoch=s=>Date.parse(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6)+'T00:00:00Z');
 return epoch(date)-epoch(fx.date)<=3*86400000;
}
export function chooseValuationQuote(i,{live,daily,kr,fx,now=Date.now()}={}){
 if(i.market==='KR'){
  const q=kr?.byId?.[i.id],today=dateKey(now,'Asia/Seoul');
  return q?.id===i.id&&q.symbol===i.symbol&&q.venue===i.venue&&q.currency==='KRW'&&positive(q.close)&&day(q.date)&&day(kr.asOfCandidate)&&q.date<=kr.asOfCandidate&&kr.asOfCandidate<today
   ?{amountKRW:q.close,date:q.date,kind:'krx-dated-close',reference:true}:null;
 }
 if(!validFx(fx,now))return null;
 const q=live?.bySymbol?.[i.symbol],t=Date.parse(q?.tradeAt),r=Date.parse(q?.receivedAt),session=live?.session;
 const et=dateKey(now,'America/New_York');
 const minuteET=stamp=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)).map(x=>[x.type,x.value]));return Number(p.hour)*60+Number(p.minute);};
 const minute=minuteET(now),tradeMinute=Number.isFinite(t)?minuteET(t):-1;
 const tradeDay=Number.isFinite(t)?dateKey(t,'America/New_York'):null;
 if(session?.open===true&&session.date===et&&[780,960].includes(session.close)&&minute>=570&&minute<session.close&&tradeDay===et&&tradeMinute>=570&&tradeMinute<session.close&&q?.symbol===i.symbol&&positive(q.usd)&&t<=now&&now-t<=45*60000&&r<=now&&now-r<=7*60000)
  return {amountKRW:q.usd*fx.rate,date:et,kind:'us-live-reference-fx',fxDate:fx.date,reference:true};
 const d=daily?.bySymbol?.[i.symbol],expected=closeContext(new Date(now)).expected;
 if(d?.symbol===i.symbol&&d.currency==='USD'&&positive(d.close)&&day(d.date)&&expected&&d.date===expected&&daily.expectedDate===expected)
  return {amountKRW:d.close*fx.rate,date:d.date,kind:'us-daily-reference-fx',fxDate:fx.date,reference:true};
 return null;
}
export function valueNewPosition(model,records,id,inputs){
 const h=model.state.holdings[id],i=model.state.catalog[h?.instrumentId];
 if(!h||!i||!model.added.includes(id))throw Error('new_position_only');
 const b=records[id]||{qty:null,avgKRW:null,netDistributionsKRW:null},q=chooseValuationQuote(i,inputs);
 const cost=b.qty===0?0:nonnegative(b.qty)&&positive(b.avgKRW)?b.qty*b.avgKRW:null;
 const value=b.qty===0?0:nonnegative(b.qty)&&q&&positive(q.amountKRW)&&Number.isFinite(b.qty*q.amountKRW)?b.qty*q.amountKRW:null;
 const profit=cost!==null&&value!==null?value-cost:null;
 return {id,account:h.account,...b,quote:q,cost,value,profit,returnPct:profit!==null&&cost>0?profit/cost*100:null,signal:'wait'};
}
export function newPositionTotals(model,records,inputs){
 const rows=model.added.filter(id=>model.state.holdings[id]).map(id=>valueNewPosition(model,records,id,inputs));
 const out={};
 for(const account of ['kiwoom-isa','toss-kr','toss-us']){
  const r=rows.filter(x=>x.account===account);
  const complete=k=>r.every(x=>x[k]!==null);
  const sum=k=>r.reduce((s,x)=>s+(x[k]??0),0);
  out[account]={count:r.length,cost:complete('cost')?sum('cost'):null,value:complete('value')?sum('value'):null,profit:complete('profit')?sum('profit'):null,netDistributionsKRW:complete('netDistributionsKRW')?sum('netDistributionsKRW'):null,missing:r.filter(x=>x.cost===null||x.value===null).length};
 }
 return out;
}
