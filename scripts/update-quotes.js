/* Official KRX ETF daily bars only. Does not trade or claim exchange real-time quotes.
 * Requires approved KRX ETF daily API and a GitHub Actions secret KRX_AUTH_KEY.
 * Never substitute news/blog/Naver prices for an unverified KRX closing price. */
import fs from 'node:fs/promises';

const funds=[['reit','329200'],['robot','469070'],['space','0131V0'],['sofr','455030'],['tr','278530'],['sol','0167B0']];
const root=new URL('../',import.meta.url);
const quotePath=new URL('quotes.json',root);
const historyPath=new URL('data/krx-history.json',root);
const endpoint='https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd';
const sourceName='KRX OPEN API · ETF 일별매매정보 (공식 확정 일봉)';
const sourceUrl='https://openapi.krx.co.kr/contents/OPP/USES/service/OPPUSES003_S2.cmd?BO_ID=nrEpCLaZpoLCTzPUMxuF';
const parts=d=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(v=>[v.type,v.value]));
const stamp=new Date(),k=parts(stamp),today=k.year+k.month+k.day,minute=Number(k.hour)*60+Number(k.minute);
const dateString=d=>d.toISOString().slice(0,10).replaceAll('-','');
const dateBeforeClose=()=>{
  const d=new Date(k.year+'-'+k.month+'-'+k.day+'T12:00:00Z');
  // Do not treat intraday or just-closed prices as finalized KRX daily bars.
  if(minute<990)d.setUTCDate(d.getUTCDate()-1);
  while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()-1);
  return dateString(d);
};
const target=dateBeforeClose();
const asNum=value=>{
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const parsed=Number(String(value).replaceAll(',',''));
 return Number.isFinite(parsed)?parsed:null;
};
const positive=value=>{const n=asNum(value);return n!==null&&n>0?n:null};
const positiveOrZero=value=>{const n=asNum(value);return n!==null&&n>=0?n:null};
async function readJson(path,fallback){try{return JSON.parse(await fs.readFile(path,'utf8'))}catch{return fallback}}
const oldHistory=await readJson(historyPath,{version:1,byId:{}});
const existing=oldHistory?.version===1&&oldHistory.byId&&typeof oldHistory.byId==='object'?oldHistory:{version:1,byId:{}};
for(const [id] of funds)if(!Array.isArray(existing.byId[id]))existing.byId[id]=[];
const previous=await readJson(quotePath,null);
const errors=[];
let latestDayVerified=false;
const byCode=new Map(funds.map(([id,code])=>[code,id]));
function parseRows(payload,date){
 if(!Array.isArray(payload?.OutBlock_1))throw Error('KRX 응답 OutBlock_1 형식 오류 또는 승인되지 않은 서비스');
 const rows=[];
 for(const rec of payload.OutBlock_1){
  // KRX responses can carry both a full ISIN and a 6-character exchange ticker.
  // Prefer an explicitly supplied short ticker; never mistake an ISIN for our symbol.
  const candidates=[rec.ISU_SRT_CD,rec.ISU_CD,rec.ISU_SHORT_CD,rec.SRT_CD]
   .filter(v=>v!==null&&v!==undefined)
   .map(v=>String(v).trim().toUpperCase().replace(/^A(?=[0-9A-Z]{6}$)/,''));
  const code=candidates.find(v=>byCode.has(v));
  const id=code?byCode.get(code):null;if(!id)continue;
  if(rec.BAS_DD&&String(rec.BAS_DD).replace(/-/g,'')!==date)continue;
  const open=positive(rec.TDD_OPNPRC),high=positive(rec.TDD_HGPRC),
    low=positive(rec.TDD_LWPRC),close=positive(rec.TDD_CLSPRC),volume=positiveOrZero(rec.ACC_TRDVOL);
  if(!(open&&high&&low&&close)||high<Math.max(open,close)||low>Math.min(open,close)||low>high)continue;
  const nav=positive(rec.NAV),marketCapKRW=positive(rec.MKTCAP),
    assetsKRW=positive(rec.INVSTASST_NETASST_TOTAMT),
    shares=positive(rec.LIST_SHRS),tradeValue=positiveOrZero(rec.ACC_TRDVAL);
  rows.push({id,code,date,open,high,low,close,volume,
    officialMetrics:{nav,marketCapKRW,assetsKRW,shares,tradingValueKRW:tradeValue}});
 }
 return rows;
}
async function getDate(date,key){
 const request=endpoint+'?basDd='+date;
 const res=await fetch(request,{headers:{AUTH_KEY:key,Accept:'application/json'},
   signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('KRX HTTP '+res.status+(res.status===401||res.status===403?' · 인증키 또는 ETF API 이용 승인 확인 필요':''));
 return parseRows(await res.json(),date);
}
function compute(id,code,bars){
 const rows=bars.slice(-40),last=rows.at(-1),last20=rows.slice(-20);
 if(rows.length!==40||!last||last.date>target)throw Error('확정 일봉 40거래일 미만');
 const avg=arr=>arr.reduce((s,v)=>s+v.close,0)/arr.length;
 const ma5=avg(rows.slice(-5)),previousMa5=avg(rows.slice(-6,-1));
 const ma20=avg(rows.slice(-20)),previousMa20=avg(rows.slice(-21,-1));
 const previousClose=rows.at(-2).close,day2Close=rows.at(-3).close;
 const day2Ma20=avg(rows.slice(-22,-2));
 const priorVolume=rows.slice(-21,-1).map(x=>x.volume);
 const volumeToday=last.volume,avgVolume20=priorVolume.every(Number.isFinite)?
   priorVolume.reduce((a,b)=>a+b,0)/20:null;
 const trend={ma5,previousMa5,ma5Rising:ma5>=previousMa5,
   goldenCross:previousMa5<=previousMa20&&ma5>ma20,
   deadCross:previousMa5>=previousMa20&&ma5<ma20,
   ma5Above20:ma5>ma20,ma20,previousMa20,previousClose,day2Close,day2Ma20,
   crossUp:previousClose<=previousMa20&&last.close>ma20,
   crossDown:previousClose>=previousMa20&&last.close<ma20,
   twoDaysAbove:previousClose>previousMa20&&last.close>ma20,
   twoDaysBelow:previousClose<previousMa20&&last.close<ma20,
   twoDayUpBreakout:day2Close<=day2Ma20&&previousClose>previousMa20&&last.close>ma20,
   maRising:ma20>=previousMa20,volumeToday,avgVolume20};
 const low20=Math.min(...last20.map(x=>x.low)),high20=Math.max(...last20.map(x=>x.high));
 if(!(ma5>0&&ma20>0&&high20>low20))throw Error('거래일 시세·이동평균 검증 실패');
 return {id,code,ok:true,date:last.date,close:last.close,low20,high20,
   rangeStart:last20[0].date,rangeEnd:last.date,
   bars:rows.map(({date,open,high,low,close,volume})=>({date,open,high,low,close,volume})),
   trend,officialMetrics:last.officialMetrics||null,sourceUrl};
}
const key=process.env.KRX_AUTH_KEY?.trim();
if(key){
 const enough=funds.every(([id])=>existing.byId[id].length>=42);
 const days=enough?8:105;
 const dates=[];
 const start=new Date(target.slice(0,4)+'-'+target.slice(4,6)+'-'+target.slice(6,8)+'T12:00:00Z');
 for(let back=days-1;back>=0;back--){
  const d=new Date(start);d.setUTCDate(d.getUTCDate()-back);
  if([0,6].includes(d.getUTCDay()))continue;
  const date=dateString(d);
  if(enough&&funds.every(([id])=>existing.byId[id].some(x=>x.date===date)))continue;
  dates.push(date);
 }
 for(const date of dates){
  try{
   const got=await getDate(date,key);
   if(date===target&&got.length>0)latestDayVerified=true;
   for(const bar of got){
    const list=existing.byId[bar.id];
    const at=list.findIndex(x=>x.date===date);
    if(at>=0)list[at]=bar;else list.push(bar);
   }
  }catch(e){
   const message=String(e.message||e);errors.push(date+': '+message);
   // Do not issue dozens of retries when credentials, approval, or API format is invalid.
   if(/KRX HTTP (401|403|429)\b|OutBlock_1 형식 오류|승인되지 않은 서비스/.test(message))break;
  }
  await new Promise(resolve=>setTimeout(resolve,130));
 }
}else errors.push('KRX_AUTH_KEY GitHub Actions Secret 미설정 또는 ETF 일별매매정보 승인 대기');
for(const [id] of funds){
 existing.byId[id]=existing.byId[id].filter(x=>x&&/^\d{8}$/.test(x.date)&&x.date<=target&&
  positive(x.close)&&positive(x.open)&&positive(x.high)&&positive(x.low))
   .sort((a,b)=>a.date.localeCompare(b.date))
   .filter((x,i,a)=>i===a.findIndex(y=>y.date===x.date)).slice(-80);
}
const items=funds.map(([id,code])=>{
 try{return compute(id,code,existing.byId[id])}
 catch(e){return {id,code,ok:false,date:null,close:null,bars:[],
   error:'KRX 검증 불가: '+e.message+(errors.length?' · '+errors[0]:'')};}
});
const good=items.filter(x=>x.ok).length;
// Preserve the last actually fetched timestamp if the KRX service is not connected.
// This must NOT make previously collected prices appear fresh.
// A collection timestamp advances only after the requested completed day is
// actually returned by KRX. A successful but empty holiday response is not a new close.
const fetchedAt=latestDayVerified?stamp.toISOString():(previous?.officialConfirmed?previous.fetchedAt:null);
const snapshot={fetchedAt,source:sourceName,sourceUrl,officialConfirmed:true,
  status:good===6?'ok':good?'partial':'unavailable',errors:errors.slice(0,6),items};
if(!key&&!good)console.warn('KRX 공식 API 키 미설정: 매수 신호 보류. 기존 시세를 임의로 채우지 않습니다.');
await fs.mkdir(new URL('data/',root),{recursive:true});
if(key&&funds.some(([id])=>existing.byId[id].length)){
 await fs.writeFile(historyPath,JSON.stringify(existing,null,2)+'\n');
}
await fs.writeFile(quotePath,JSON.stringify(snapshot,null,2)+'\n');
console.log('KRX 공식 확정 일봉:',good+'/6 · 기준 거래일:',items.filter(x=>x.ok).map(x=>x.date).sort().at(-1)||'미확인');
if(errors.length)console.warn('KRX 진단:',errors.slice(0,3).join('; '));
