import fs from 'node:fs/promises';
import {closeContext,tradingDate,chooseCompletedBar} from './us-close-calendar.mjs';
import {consecutiveBars,retainedClose,preferFx} from './us-close-retention.mjs';
const funds=[['schd','SCHD'],['agnc','AGNC'],['spym','SPYM'],['cony','CONY']];
const out=new URL('../us-quotes.json',import.meta.url);
const now=new Date();
const ET=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const etParts=date=>Object.fromEntries(ET.formatToParts(date).map(x=>[x.type,x.value]));
const todayPart=etParts(now);
const etToday=todayPart.year+todayPart.month+todayPart.day;
const context=closeContext(now);
const dateET=t=>{const p=etParts(new Date(t));return p.year+p.month+p.day;};
const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const fixed=x=>Number(x.toFixed(5));
function make([id,ticker],raw,source,dividends,splits){
 const sorted=raw.filter(x=>x&&/^\d{8}$/.test(x.date)&&[x.open,x.high,x.low,x.close].every(valid)&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close))
  .filter(x=>context.expected&&x.date<=context.expected&&tradingDate(x.date))
  .sort((a,b)=>a.date.localeCompare(b.date));
 const bars=[...new Map(sorted.map(x=>[x.date,x])).values()].slice(-40);
 if(!consecutiveBars(bars))throw Error('연속 완료된 미국장 40거래일 일봉 부족 ('+bars.length+')');
 const last=bars.slice(-20),avg=a=>a.reduce((s,x)=>s+x.close,0)/a.length;
 const ma5=avg(bars.slice(-5)),ma20=avg(last),prev5=avg(bars.slice(-6,-1)),prev20=avg(bars.slice(-21,-1));
 const low20=Math.min(...last.map(x=>x.low)),high20=Math.max(...last.map(x=>x.high));
 const close=bars.at(-1).close,prevClose=bars.at(-2).close;
 const prevVolumes=bars.slice(-21,-1).map(x=>x.volume);
 const volAvg=prevVolumes.every(x=>typeof x==='number'&&Number.isFinite(x))?prevVolumes.reduce((a,b)=>a+b,0)/20:null;
 return {id,ticker,ok:true,date:bars.at(-1).date,close,low20:fixed(low20),high20:fixed(high20),
  rangeStart:last[0].date,rangeEnd:last.at(-1).date,bars,source,currency:'USD',
  trend:{ma5:fixed(ma5),ma20:fixed(ma20),previousMa5:fixed(prev5),previousMa20:fixed(prev20),
   ma5Above20:ma5>ma20,maRising:ma20>=prev20,ma5Rising:ma5>=prev5,
   goldenCross:prev5<=prev20&&ma5>ma20,deadCross:prev5>=prev20&&ma5<ma20,
   crossUp:prevClose<=prev20&&close>ma20,crossDown:prevClose>=prev20&&close<ma20,
   twoDaysAbove:prevClose>prev20&&close>ma20,volume:bars.at(-1).volume,previousVolumeAverage:volAvg},
  dividends:dividends.filter(x=>x.date<=bars.at(-1).date).slice(-32),
  splits:splits.filter(x=>x.date<=bars.at(-1).date).slice(-16)};
}
async function yahoo(ticker){
 let errors=[];
 for(const host of ['query2.finance.yahoo.com','query1.finance.yahoo.com']){
  try{
   const url='https://'+host+'/v8/finance/chart/'+encodeURIComponent(ticker)+'?range=6mo&interval=1d&events=div%2Csplits';
   const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'ISA-Research-Daily-Watchlist/1.0'}});
   if(!r.ok)throw Error('HTTP '+r.status);
   const obj=await r.json(),v=obj?.chart?.result?.[0],q=v?.indicators?.quote?.[0],ts=v?.timestamp;
   if(!v||String(v.meta?.symbol).toUpperCase()!==ticker||!q||!Array.isArray(ts))throw Error('티커/일봉 구조 검증 실패');
   const raw=ts.map((t,i)=>({date:dateET(t*1000),open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],volume:Number.isFinite(q.volume?.[i])?q.volume[i]:null}));
   const dividends=Object.values(v.events?.dividends||{}).map(x=>({date:dateET(Number(x.date)*1000),perShare:Number(x.amount),currency:'USD',kind:'historic-provider-event'})).filter(x=>/^\d{8}$/.test(x.date)&&valid(x.perShare)).sort((a,b)=>a.date.localeCompare(b.date));
   const splits=Object.values(v.events?.splits||{}).map(x=>({date:dateET(Number(x.date)*1000),ratio:String(x.splitRatio||'미확인')})).filter(x=>/^\d{8}$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date));
   return {raw,source:'Yahoo Finance 비공식 일봉',dividends,splits};
  }catch(e){errors.push(host+': '+String(e.message||e));}
 }
 throw Error(errors.join(' / '));
}
async function stooq(ticker){
 const url='https://stooq.com/q/d/l/?s='+ticker.toLowerCase()+'.us&i=d&d1=20260101&d2='+etToday;
 const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{Accept:'text/csv,text/plain,*/*','User-Agent':'ISA-Research-Daily-Watchlist/1.0'}});
 if(!r.ok)throw Error('HTTP '+r.status);
 const lines=(await r.text()).trim().split(/\r?\n/);
 if(!/^Date,Open,High,Low,Close,Volume$/i.test(lines[0]?.trim()||'')||lines.length<45)throw Error('대체 일봉 수량/형식 부족');
 const raw=lines.slice(1).map(l=>{const [date,o,h,low,c,vol]=l.split(',');return {date:date.replace(/-/g,''),open:Number(o),high:Number(h),low:Number(low),close:Number(c),volume:Number(vol)};});
 return {raw,source:'Stooq 비공식 일봉 · 배당/병합 이벤트 미제공',dividends:[],splits:[]};
}
let previousPromise;
function previousPublished(){
 if(!previousPromise)previousPromise=(async()=>{
  try{const r=await fetch('https://pdk7101.github.io/Jungho/us-quotes.json',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
  catch(_){console.warn('직전 공개 일봉 조회 불가 · 대체 기록 미확인');return null;}
 })();
 return previousPromise;
}
async function eachFund(f){
 const [id,ticker]=f;
 if(!context.expected)return {id,ticker,ok:false,reason:'거래일 달력 미확인',date:null,close:null,currency:'USD',bars:[],dividends:[],splits:[],closeStatus:'unavailable',expectedDate:null};
 const from=load=>async()=>{const data=await load(ticker);return make(f,data.raw,data.source,data.dividends,data.splits)};
 const result=await chooseCompletedBar(context.expected,[['Yahoo Finance',from(yahoo)],['Stooq',from(stooq)],['마지막 정상 게시자료',async()=>{const old=retainedClose(await previousPublished(),f,context.expected);if(!old)throw Error('retention_unavailable');return {...make(f,old.raw,old.source,old.dividends,old.splits),retained:true};}]]);
 console.log(ticker,'expected',context.expected,'actual',result.date,'status',result.closeStatus,'source',result.source||'none','attempts',JSON.stringify(result.attempts));
 return {id,ticker,currency:'USD',bars:[],dividends:[],splits:[],...result,...(!result.ok?{reason:'완료 일봉 수집 실패'}:{})};
}
async function readFx(){
 const errors=[];
 for(const host of ['query2.finance.yahoo.com','query1.finance.yahoo.com']){
  try{
   const url='https://'+host+'/v8/finance/chart/KRW%3DX?range=5d&interval=1d';
   const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','User-Agent':'ISA-Research-Daily-Watchlist/1.0'}});
   if(!r.ok)throw Error('HTTP '+r.status);
   const j=await r.json(),v=j?.chart?.result?.[0],q=v?.indicators?.quote?.[0],times=v?.timestamp;
   if(!v||!Array.isArray(times)||!Array.isArray(q?.close))throw Error('환율 일봉 미확인');
   const rows=times.map((t,i)=>({time:new Date(t*1000).toISOString(),rate:q.close[i]})).filter(x=>x.rate>700&&x.rate<3000&&Number.isFinite(x.rate));
   if(!rows.length)throw Error('유효 환율 값 없음');
   const last=rows.at(-1);
   if(Date.now()-new Date(last.time).getTime()>8*86400000)throw Error('환율 자료가 너무 오래됨');
   return {ok:true,usdKrw:last.rate,observedAt:last.time,source:'Yahoo Finance KRW=X (비공식 환율 일봉)',realTime:false};
  }catch(e){errors.push(host+': '+String(e.message||e));}
 }
 console.warn('USD/KRW 환율 조회 실패:',errors.join(' / '));
 return {ok:false,reason:'공개 환율 조회 실패 · 직접 환율 입력 가능'};
}
const fx=preferFx(await readFx(),await previousPublished(),now.getTime());
const items=[];
for(const f of funds)items.push(await eachFund(f));
const extra=await eachFund(['spacex','SPCX']);
// The symbol previously belonged to a different security: only post-IPO bars are eligible.
const spcx=extra.ok&&extra.bars.every(b=>b.date>='20260612')?extra:null;
await fs.writeFile(out,JSON.stringify({fetchedAt:now.toISOString(),market:'US',currency:'USD',isRealtime:false,expectedDate:context.expected,calendarKnown:context.calendarKnown,fx,extraQuotes:spcx?{spacex:spcx}:{},
 sourceNote:'미국장 확정 일봉만 사용하며 실시간 호가가 아닙니다. 조회 실패 시 검증된 마지막 게시자료만 원래 기준일로 유지합니다. 최신 자료가 아니면 신규 판단은 보류합니다.',items},null,2)+'\n');
console.log('US 최신 거래일 일봉',items.filter(x=>x.closeStatus==='current').length+'/4','SPCX',spcx?.closeStatus||'unavailable','expected',context.expected);
