/* Owner-only KRX daily data bridge for public GitHub Pages.
 * Only the configured owner's browser receives quotes from a token-gated Worker.
 * No official daily bars, NAV, authorization key or VIEW_TOKEN are sent to GitHub.
 */
(function(){
'use strict';
const IDS=[['reit','329200'],['sol','0167B0'],['robot','469070'],
 ['space','0131V0'],['sofr','455030'],['tr','278530']];
const OFFICIAL='https://openapi.krx.co.kr/contents/OPP/USES/service/OPPUSES003_S2.cmd?BO_ID=nrEpCLaZpoLCTzPUMxuF';
const URL_KEY='isa-krx-private-worker-url-v1';
const TOKEN_KEY='isa-krx-private-view-token-v1';
const SESSION_ONLY_KEY='isa-krx-private-session-only-v1';
let workerUrl='',token='',snapshot=null,metricSnapshot=null,metricHistory=null,busy=false;
const read=(storage,key)=>{try{return storage.getItem(key)||'';}catch(_){return ''}};
const write=(storage,key,val)=>{try{storage.setItem(key,val);return true}catch(_){return false}};
const remove=(storage,key)=>{try{storage.removeItem(key)}catch(_){}};
const n=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const positive=v=>n(v)!==null&&Number(v)>0;
const iso=v=>/^\d{8}$/.test(String(v||''))?String(v):null;
workerUrl=read(localStorage,URL_KEY);
const savedDeviceToken=read(localStorage,TOKEN_KEY);
const savedTabToken=read(sessionStorage,TOKEN_KEY);
token=savedDeviceToken||savedTabToken;
// Upgrade a previously connected tab to the user's explicitly requested
// trusted-device persistence without exposing credentials to the public site.
if(!savedDeviceToken&&savedTabToken.length>=20&&workerUrl&&read(sessionStorage,SESSION_ONLY_KEY)!=='1'){
 if(write(localStorage,TOKEN_KEY,savedTabToken))remove(sessionStorage,TOKEN_KEY);
}
function endpoint(raw){
 const u=new URL(String(raw).trim());
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('HTTPS Worker 주소를 확인하세요.');
 if(u.pathname!=='/'&&u.pathname!=='')throw Error('Worker의 기본 주소만 입력하세요.');
 return u.origin;
}
function validate(data,page,latestExpected){
 if(!data||data.ok!==true||data.page!==page||!Array.isArray(data.rows)||
  !iso(data.latestExpected))throw Error('KRX 개인 조회 응답 형식 확인 실패');
 if(latestExpected&&data.latestExpected!==latestExpected)throw Error('요청 중 한국장 기준 거래일이 달라졌습니다. 다시 조회하세요.');
 const byCode=Object.fromEntries(IDS.map(([id,code])=>[code,id]));
 return data.rows.map(x=>{
  if(!x||x.id!==byCode[x.code]||!iso(x.date)||
   x.date>data.latestExpected)throw Error('KRX 종목 또는 거래일 검증 실패');
  const open=n(x.open),high=n(x.high),low=n(x.low),close=n(x.close);
  if(!positive(open)||!positive(high)||!positive(low)||!positive(close)||
   high<Math.max(open,close)||low>Math.min(open,close))throw Error('KRX 가격 검증 실패');
  const volume=n(x.volume);
  if(volume!==null&&volume<0)throw Error('KRX 거래량 검증 실패');
  return {id:x.id,code:x.code,date:x.date,open,high,low,close,volume,
   officialMetrics:x.officialMetrics&&typeof x.officialMetrics==='object'?x.officialMetrics:{}};
 });
}
function calculate(id,code,bars){
 if(!Array.isArray(bars)||bars.length<40)throw Error('확정 일봉 40거래일 미달');
 const b=bars.slice(-40),last=b.at(-1),twenty=b.slice(-20),
  mean=v=>v.reduce((s,x)=>s+x.close,0)/v.length;
 const ma5=mean(b.slice(-5)),previousMa5=mean(b.slice(-6,-1)),
  ma20=mean(b.slice(-20)),previousMa20=mean(b.slice(-21,-1));
 const previousClose=b.at(-2).close,day2Close=b.at(-3).close,
  day2Ma20=mean(b.slice(-22,-2));
 const lows=twenty.map(x=>x.low),highs=twenty.map(x=>x.high);
 const low20=Math.min(...lows),high20=Math.max(...highs);
 if(!positive(ma5)||!positive(ma20)||high20<=low20)throw Error('5·20일선 또는 20일 변동폭 검증 실패');
 const volumes=b.slice(-21,-1).map(x=>x.volume);
 const trend={
  ma5,previousMa5,ma5Rising:ma5>=previousMa5,
  goldenCross:previousMa5<=previousMa20&&ma5>ma20,
  deadCross:previousMa5>=previousMa20&&ma5<ma20,
  ma5Above20:ma5>ma20,ma20,previousMa20,previousClose,day2Close,day2Ma20,
  crossUp:previousClose<=previousMa20&&last.close>ma20,
  crossDown:previousClose>=previousMa20&&last.close<ma20,
  twoDaysAbove:previousClose>previousMa20&&last.close>ma20,
  twoDaysBelow:previousClose<previousMa20&&last.close<ma20,
  twoDayUpBreakout:day2Close<=day2Ma20&&previousClose>previousMa20&&last.close>ma20,
  maRising:ma20>=previousMa20,volumeToday:last.volume,
  avgVolume20:volumes.every(x=>x!==null&&x>=0)?volumes.reduce((s,x)=>s+x,0)/20:null
 };
 return {id,code,ok:true,date:last.date,close:last.close,low20,high20,
  rangeStart:twenty[0].date,rangeEnd:last.date,bars:b,trend,
  officialMetrics:last.officialMetrics,sourceUrl:OFFICIAL};
}
function percent(a,b){return (a/b-1)*100;}
function calcChange(rows,days,field){
 const v=rows.filter(x=>positive(x[field]));
 if(v.length<days+1)return {value:null,count:v.length,needed:days+1};
 return {value:percent(v.at(-1)[field],v.at(-1-days)[field]),count:v.length,
  needed:days+1,from:v.at(-1-days).date,to:v.at(-1).date};
}
function secondary(items,history){
 const byId={},mItems=[];
 let count=0;
 for(const [id,code] of IDS){
  const item=items.find(x=>x.id===id),bars=history[id]||[];
  const metricRows=bars.map(b=>{
   const m=b.officialMetrics||{},nav=n(m.nav),marketCapKRW=n(m.marketCapKRW),
    shares=n(m.shares),assets=n(m.assetsKRW);
   if(!positive(nav)||!positive(marketCapKRW))return null;
   return {date:b.date,nav,marketCapKRW,impliedShares:positive(shares)?shares:null,
    estimatedAUMKRW:positive(assets)?assets:null,
    divergencePct:percent(b.close,nav),volume:b.volume,
    tradingValueKRW:n(m.tradingValueKRW)};
  }).filter(Boolean);
  byId[id]=metricRows;
  const last=metricRows.at(-1),latest=item?.ok&&last&&last.date===item.date;
  const m={id,code,ok:!!latest,date:item?.date||null,
   reason:latest?null:'KRX 최신 NAV/시가총액 확인 불가',sourceUrl:OFFICIAL};
  if(latest){
   Object.assign(m,{marketCap100m:last.marketCapKRW/1e8,marketCapKRW:last.marketCapKRW,
    marketPrice:item.close,nav:last.nav,divergencePct:last.divergencePct,
    impliedShares:last.impliedShares,estimatedAUMKRW:last.estimatedAUMKRW,
    volume:last.volume,tradingValueKRW:last.tradingValueKRW,
    comparisonNote:'KRX 동일 기준일 공식 확정 종가와 NAV',
    historyNote:'KRX 공식 확정 거래일 기록',historyEligible:true});
   count++;
  }
  m.cap5=calcChange(metricRows,5,'marketCapKRW');
  m.cap20=calcChange(metricRows,20,'marketCapKRW');
  m.shares5=calcChange(metricRows,5,'impliedShares');
  m.shares20=calcChange(metricRows,20,'impliedShares');
  mItems.push(m);
 }
 return {metrics:{fetchedAt:snapshot?.fetchedAt||null,
  source:'KRX OPEN API · ETF 일별매매정보 (개인 인증 조회)',sourceUrl:OFFICIAL,
  status:count===6?'ok':count?'partial':'unavailable',count,items:mItems},
  history:{version:1,source:'KRX OPEN API',byId}};
}
async function load(){
 if(busy)throw Error('KRX 개인 조회가 이미 진행 중입니다.');
 if(!configured())throw Error('내 전용 KRX Worker 주소와 접근 토큰을 먼저 연결하세요.');
 busy=true;snapshot=null;metricSnapshot=null;metricHistory=null;
 const status=document.getElementById('krx-private-status');
 if(status)status.textContent='KRX 공식 확정 일봉을 개인 연결로 확인 중입니다.';
 try{
  const origin=endpoint(workerUrl);
  const pages=await Promise.all([0,1,2,3,4].map(async page=>{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),45000);
   try{
    const response=await fetch(origin+'/api/krx-history?page='+page,{
     method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
     cache:'no-store',signal:controller.signal
    });
    const body=await response.json().catch(()=>({error:'응답 형식 확인 실패'}));
    if(!response.ok)throw Error('개인 KRX 조회 실패 ('+response.status+'): '+String(body.error||'승인 확인 필요').slice(0,120));
    return body;
   }finally{clearTimeout(timeout);}
  }));
  const expected=pages[0]?.latestExpected;
  if(!iso(expected))throw Error('KRX 기준 거래일 확인 실패');
  const rows=pages.flatMap((p,index)=>validate(p,index,expected)),group={};
  for(const [id] of IDS)group[id]=new Map();
  for(const x of rows)group[x.id].set(x.date,x);
  const byId={};
  const items=IDS.map(([id,code])=>{
   const bars=[...group[id].values()].sort((a,b)=>a.date.localeCompare(b.date));
   byId[id]=bars;
   try{return calculate(id,code,bars);}
   catch(error){return {id,code,ok:false,date:null,close:null,bars:[],
    error:'공식 일봉 분석 보류: '+String(error.message||error)};}
  });
  // A connected but stale market-day response must never be displayed as today's close.
  const stamp=new Date().toISOString();
  snapshot={fetchedAt:stamp,source:'KRX OPEN API · ETF 일별매매정보 (개인 인증 조회)',
   sourceUrl:OFFICIAL,officialConfirmed:true,status:items.every(x=>x.ok)?'ok':'partial',
   items,errors:items.filter(x=>!x.ok).map(x=>x.id+': '+x.error)};
  const computed=secondary(items,byId);
  metricSnapshot={...computed.metrics,fetchedAt:stamp};metricHistory=computed.history;
  const validCount=items.filter(x=>x.ok).length;
  if(status)status.textContent='공식 KRX 개인 조회 '+validCount+'/6종목 · 기준일 '+String(items.filter(x=>x.ok).map(x=>x.date).sort().at(-1)||'미확인')+
   ' · 실제 체결가 아님 · 개인 브라우저에서만 표시';
  return snapshot;
 }catch(error){
  snapshot=null;metricSnapshot=null;metricHistory=null;
  if(status)status.textContent='KRX 개인 조회 실패: '+String(error.message||error).slice(0,200);
  throw error;
 }finally{busy=false;}
}
function configured(){return !!(workerUrl&&token&&token.length>=20);}
function setConnection(raw,secret,remember){
 const url=endpoint(raw),v=String(secret||'').trim();
 if(v.length<20)throw Error('접근 토큰은 20자 이상이어야 합니다.');
 workerUrl=url;token=v;
 if(!write(localStorage,URL_KEY,url))throw Error('Worker 주소를 브라우저에 저장할 수 없습니다.');
 remove(localStorage,TOKEN_KEY);
 remove(sessionStorage,TOKEN_KEY);
 remove(sessionStorage,SESSION_ONLY_KEY);
 if(remember){
  if(!write(localStorage,TOKEN_KEY,v))
   throw Error('이 기기에서 접근 토큰을 저장할 수 없습니다. 브라우저 저장소 설정을 확인하세요.');
 }else{
  write(sessionStorage,TOKEN_KEY,v);
  write(sessionStorage,SESSION_ONLY_KEY,'1');
 }
 snapshot=null;metricSnapshot=null;metricHistory=null;
}
function disconnect(){
 workerUrl='';token='';snapshot=null;metricSnapshot=null;metricHistory=null;
 remove(localStorage,URL_KEY);remove(localStorage,TOKEN_KEY);remove(sessionStorage,TOKEN_KEY);remove(sessionStorage,SESSION_ONLY_KEY);
}
function mount(){
 const url=document.getElementById('krx-private-worker');
 const pass=document.getElementById('krx-private-token');
 const msg=document.getElementById('krx-private-status');
 const keep=document.getElementById('krx-private-remember');
 const connect=document.getElementById('krx-private-connect');
 const off=document.getElementById('krx-private-disconnect');
 if(!url||!pass||!msg||!connect||!off)return;
 if(workerUrl)url.value=workerUrl;
 if(configured())msg.textContent=read(localStorage,TOKEN_KEY)?
  'KRX 연결 저장됨 · 이 기기에서 다음 접속 시 자동으로 공식 종가를 조회합니다.':
  'KRX 연결됨 · 이 탭을 닫으면 접근 토큰을 다시 입력해야 합니다.';
 else if(workerUrl)msg.textContent='Worker 주소가 저장되어 있습니다. 개인 접근 토큰을 입력하세요.';
 else msg.textContent='개인 Worker 연결 전 · 공개 GitHub에는 KRX 가격이 저장되지 않습니다.';
 connect.onclick=async()=>{
  connect.disabled=true;
  try{
   setConnection(url.value,pass.value||token,!!keep?.checked);
   pass.value='';msg.textContent='개인 인증 정보 확인 중...';
   await window.ISA_KR_APP?.refresh?.();
  }catch(err){msg.textContent='연결 실패: '+String(err.message||err);}
  finally{connect.disabled=false;}
 };
 off.onclick=async()=>{
  disconnect();pass.value='';url.value='';msg.textContent='개인 KRX 연결 해제 · 원본 시세 미보관';
  await window.ISA_KR_APP?.refresh?.();
 };
}
window.ISA_PRIVATE_KRX={configured,load,snapshot:()=>snapshot,metrics:()=>metricSnapshot,
 metricHistory:()=>metricHistory,setConnection,disconnect,validate,calculate};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
})();
