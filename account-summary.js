/* Top-level account totals. Read only user-owned browser storage and published quote
 * summaries; never publish balances to GitHub or treat a stale photo as live valuation.
 * Toss includes all 9 Korean equities and 5 US positions, not merely 4 tracked ETFs.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const KEY='isa-account-totals-v1',SNAP='isa-user-portfolio-snapshot-v1';
const US=['schd','spym','cony','agnc','spacex'];
const TD=['tsofr','treit','ttr','biotech','tspace','media','trobot','hongah','sensor'];
const money=v=>Math.round(v).toLocaleString('ko-KR')+'원';
const finite=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&
 Number.isFinite(Number(v))&&Number(v)>=0;
const read=key=>{
 try{const x=JSON.parse(localStorage.getItem(key)||'null');
  return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}
 catch(_){return {};}
};
function seoulDay(){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
function pair(invested,value){
 return finite(invested)&&finite(value)?{
  invested:Number(invested),value:Number(value)
 }:null;
}
function manualTotals(id){
 const v=read(KEY)[id]||{},p=pair(v.invested,v.value);
 return p?{...p,date:v.date||null,source:'증권사 앱 기준 사용자 직접 입력'}:null;
}
function snapshotToss(){
 const s=read(SNAP),options=[];
 const t=s.tossTotal;
 if(t&&finite(t.amount)&&Number.isFinite(Number(t.pnl))){
  const p=pair(Number(t.amount)-Number(t.pnl),t.amount);
  if(p)options.push({...p,date:s.tossTotalDate||null,source:'토스 계좌 합계 · 저장된 사진'});
 }
 const u=s.us||{},d=s.tossDomestic||{};
 const full=US.every(id=>u[id]&&finite(u[id].value)&&Number.isFinite(Number(u[id].pnl)))&&
  TD.every(id=>d[id]&&finite(d[id].value)&&Number.isFinite(Number(d[id].pnl)));
 if(full&&s.usDate&&s.usDate===s.tdDate){
  const rows=[...US.map(id=>u[id]),...TD.map(id=>d[id])];
  const value=rows.reduce((sum,r)=>sum+Number(r.value),0);
  const pnl=rows.reduce((sum,r)=>sum+Number(r.pnl),0);
  const p=pair(value-pnl,value);
  if(p)options.push({...p,date:s.usDate,source:'토스 국내 9·미국 5종목 · 저장된 사진 합산'});
 }
 if(!options.length)return null;
 options.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 return options[0];
}
function kiwoomComputed(){
 const data=window.ISA_KR_APP?.accountTotals?.();
 if(!data)return null;
 const details=[];
 if(data.missingHoldings?.length)details.push('보유정보 미입력 '+data.missingHoldings.length+'종목');
 if(data.missingPrice?.length)details.push('평가가격 미확인 '+data.missingPrice.length+'종목');
 const p=pair(data.principal,data.value);
 const d=Array.isArray(data.dates)&&data.dates.length?data.dates.slice().sort()[0]:null;
 const priceText=data.intraday&&data.close?'당일 검증 시세·확정 종가 혼합':
  data.intraday?'당일 검증 시세':'직전 확정 종가 참고';
 return {
  invested:finite(data.principal)?Number(data.principal):null,
  value:finite(data.value)?Number(data.value):null,
  date:d||(data.intraday?seoulDay():null),
  source:details.length?'키움 6종목 자동 합산 보류 · '+details.join(' · '):
   '키움 ISA 6종목 '+priceText+' · 참고 평가액',
  complete:!!p,estimated:true
 };
}
function totals(){
 return {
  toss:manualTotals('toss')||snapshotToss(),
  kiwoom:manualTotals('kiwoom')||kiwoomComputed()
 };
}
function displayAccount(id,data){
 const invested=$(id+'-total-invested'),value=$(id+'-total-value'),
  source=$(id+'-total-source');
 if(!invested||!value||!source)return;
 invested.textContent=finite(data?.invested)?money(data.invested):'합계 미확인';
 value.textContent=finite(data?.value)?money(data.value):'평가액 미확인';
 if(!data){
  source.textContent=id==='toss'?'토스 전체계좌 사진 기록 또는 합계 직접 입력 필요':
   '키움 ISA 6종목의 보유수량·평단·가격 확인 필요';
  return;
 }
 source.textContent=data.source+(data.date?' · 기준 '+data.date:' · 기준일 미확인')+
  (id==='toss'?' · 자동 장중 갱신 아님':'');
}
function render(){
 const x=totals();
 displayAccount('toss',x.toss);displayAccount('kiwoom',x.kiwoom);
 const combined=$('account-summary-total');if(!combined)return;
 const t=x.toss,k=x.kiwoom;
 if(finite(t?.invested)&&finite(k?.invested)){
  const cost=Number(t.invested)+Number(k.invested);
  if(finite(t?.value)&&finite(k?.value)){
   const difference=!(t.date&&k.date&&t.date===k.date);
   combined.textContent=(difference?'참고 단순합계 (계좌별 기준일 다름)':'두 계좌 합계')+
    ' · 총투자금 '+money(cost)+' · 평가금액 '+money(Number(t.value)+Number(k.value));
  }else combined.textContent='두 계좌 총투자금 '+money(cost)+' · 전체 평가금액 확인 대기';
 }else combined.textContent='전체 합계는 두 계좌의 총투자금·평가액이 확인된 후 표시합니다.';
}
function initEditor(){
 const fields={
  toss:['account-toss-invested','account-toss-value'],
  kiwoom:['account-kiwoom-invested','account-kiwoom-value']
 };
 const before=read(KEY);
 for(const [id,keys] of Object.entries(fields)){
  const manual=before[id]||{};
  if(finite(manual.invested)&&$(keys[0]))$(keys[0]).value=manual.invested;
  if(finite(manual.value)&&$(keys[1]))$(keys[1]).value=manual.value;
 }
 const status=$('account-total-message'),save=$('account-total-save'),reset=$('account-total-reset');
 if(!status||!save||!reset)return;
 save.addEventListener('click',()=>{
  const changes={};
  for(const [id,keys] of Object.entries(fields)){
   const a=$(keys[0]).value.trim(),b=$(keys[1]).value.trim();
   if(!a&&!b)continue;
   if(!a||!b||!finite(a)||!finite(b)||!Number.isSafeInteger(Number(a))||
      !Number.isSafeInteger(Number(b))){
    status.textContent='각 계좌의 총투자금과 평가금액을 모두 0원 이상 정수로 입력해 주세요.';
    return;
   }
   changes[id]={invested:Number(a),value:Number(b),date:seoulDay()};
  }
  if(!Object.keys(changes).length){
   status.textContent='입력한 계좌 금액이 없습니다. 기존 사진·시세 기준 금액은 유지됩니다.';
   return;
  }
  const previous=localStorage.getItem(KEY);
  try{
   localStorage.setItem(KEY,JSON.stringify({...read(KEY),...changes}));
   status.textContent='이 휴대전화에 계좌별 금액을 저장했습니다. 상단에 입력 날짜와 함께 표시됩니다.';
   render();
  }catch(_){
   try{if(previous===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,previous);}catch(__){}
   status.textContent='계좌 금액 저장에 실패했습니다. 기존 설정은 보존하도록 처리했습니다.';
  }
 });
 reset.addEventListener('click',()=>{
  try{localStorage.removeItem(KEY);}
  catch(_){status.textContent='기기 저장소를 초기화할 수 없습니다.';return;}
  Object.values(fields).flat().forEach(id=>{if($(id))$(id).value='';});
  status.textContent='계좌별 직접 입력값만 해제했습니다. 보유수량·평단·분배금 기록은 그대로입니다.';
  render();
 });
}
function mount(){
 if(!$('account-summary'))return;
 initEditor();
 document.addEventListener('isa-rendered',render);
 window.addEventListener('isa-us-valuation-refreshed',render);
 window.addEventListener('storage',render);
 window.addEventListener('pageshow',render);
 render();
}
window.ISA_ACCOUNT_SUMMARY={getTotals:totals,refresh:render};
mount();
})();