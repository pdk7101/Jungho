/* Top-level account totals. Read only user-owned browser storage and published quote
 * summaries; never publish balances to GitHub or treat a stale photo as live valuation.
 * Toss includes all 9 Korean equities and 5 US positions, not merely 4 tracked ETFs.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const KEY='isa-account-totals-v1',SNAP='isa-user-portfolio-snapshot-v1';
const DIV='isa-account-dividend-totals-v1',US_HOLD='isa-us-holdings-v1',LEDGER='isa-us-distributions-krw-v1';
const PAYOUT_US=['schd','spym','cony','agnc'];
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

function readRows(key){
 try{const v=JSON.parse(localStorage.getItem(key)||'null');return Array.isArray(v)?v:[];}catch(_){return [];}
}
function payoutEntry(v){
 return v&&typeof v==='object'&&finite(v.amount)?{amount:Number(v.amount),date:v.date||null}:null;
}
function usPayout(id){
 const v=read(US_HOLD)[id]?.krwNet;
 if(finite(v))return {amount:Number(v),kind:'cumulative'};
 const a=readRows(LEDGER).filter(x=>x&&String(x.id).toLowerCase()===id&&finite(x.net)&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.date)));
 return a.length?{amount:a.reduce((sum,x)=>sum+Number(x.net),0),kind:'ledger'}:null;
}
function dividendTotals(){
 const missing=[],provisional=[];let us=0,usKnown=0;
 for(const id of PAYOUT_US){
  const v=usPayout(id);
  if(!v){missing.push(id.toUpperCase());continue;}
  us+=v.amount;usKnown++;if(v.kind==='ledger')provisional.push(id.toUpperCase());
 }
 const stored=read(DIV),domestic=payoutEntry(stored.tossDomestic),kiwoom=payoutEntry(stored.kiwoom);
 if(!domestic)missing.push('토스 국내주식');
 if(!kiwoom)missing.push('키움 ISA');
 return {us,usKnown,domestic:domestic?.amount??null,kiwoom:kiwoom?.amount??null,
  toss:us+(domestic?.amount||0),all:us+(domestic?.amount||0)+(kiwoom?.amount||0),
  complete:!missing.length,missing,provisional,dates:[domestic?.date,kiwoom?.date].filter(Boolean)};
}
function renderDividends(){
 const x=dividendTotals(),label=$('account-dividend-label'),total=$('account-dividend-total'),
  breakdown=$('account-dividend-breakdown'),note=$('account-dividend-source');
 if(!label||!total||!breakdown||!note)return;
 label.textContent=x.complete?'총 누적 세후 배당·분배금':'확인된 누적 세후 배당·분배금 (미입력 제외)';
 total.textContent=money(x.all);
 breakdown.textContent='토스 미국 '+x.usKnown+'/4종목 '+money(x.us)+' · 토스 국내 '+
  (x.domestic===null?'미입력':money(x.domestic))+' · 키움 ISA '+(x.kiwoom===null?'미입력':money(x.kiwoom));
 note.textContent=(x.missing.length?'미확인: '+x.missing.join(', ')+'. ':'')+
  (x.provisional.length?'날짜별 지급 기록만 있는 '+x.provisional.join(', ')+'은 과거 누락 가능. ':'')+
  (x.dates.length?'국내 지급금 입력 기준 '+x.dates.join(' / ')+'. ':'')+
  '실제 세후 수령 누적액이며 주식 평가액에 더하지 않습니다.';
}
function initDividendEditor(){
 const ids={tossDomestic:'account-div-toss-domestic',kiwoom:'account-div-kiwoom'},
  saved=read(DIV),msg=$('account-dividend-message');
 for(const [key,id] of Object.entries(ids)){
  const v=payoutEntry(saved[key]);if(v&&$(id))$(id).value=v.amount;
 }
 const save=$('account-dividend-save'),reset=$('account-dividend-clear');
 if(!save||!reset||!msg)return;
 save.addEventListener('click',()=>{
  const prev=localStorage.getItem(DIV),next={...read(DIV)};let count=0;
  for(const [key,id] of Object.entries(ids)){
   const raw=$(id)?.value.trim()||'';
   if(!raw)continue;
   if(!finite(raw)||Number(raw)>1e10){msg.textContent='세후 누적액을 0원 이상 숫자로 입력해 주세요.';return;}
   next[key]={amount:Number(raw),date:seoulDay(),source:'사용자 직접 입력'};count++;
  }
  if(!count){msg.textContent='새로 입력한 금액이 없습니다.';return;}
  try{localStorage.setItem(DIV,JSON.stringify(next));render();
   msg.textContent='국내 계좌 누적 분배금 저장 완료 · 미국 종목과 주별 기록은 변경하지 않았습니다.';
  }catch(_){try{if(prev===null)localStorage.removeItem(DIV);else localStorage.setItem(DIV,prev);}catch(__){}
   msg.textContent='저장 실패 · 기존 값은 보존했습니다.';}
 });
 reset.addEventListener('click',()=>{
  if(typeof window.confirm==='function'&&!window.confirm('토스 국내·키움 ISA 누적 분배금 입력만 해제할까요? 미국 종목과 지급기록은 유지합니다.'))return;
  try{localStorage.removeItem(DIV);Object.values(ids).forEach(id=>{if($(id))$(id).value='';});
   render();msg.textContent='국내 계좌 누적 입력금만 해제했습니다.';
  }catch(_){msg.textContent='저장소 오류 · 변경하지 않았습니다.';}
 });
}
function applyPrivateDividendPhoto(){
 const hash=String(window.location?.hash||'');
 if(!hash.startsWith('#payouts='))return;
 try{
  const pieces=decodeURIComponent(hash.slice(9)).split(';'),date=pieces.shift(),v={};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>seoulDay())throw Error('사진 기준일 오류');
  for(const p of pieces){
   const x=p.split(':'),id=x[0];
   if(x.length!==2||!['schd','spym','cony','agnc','tossDomestic','kiwoom'].includes(id)||
    id in v||!/^\d{1,11}$/.test(x[1])||Number(x[1])>1e10)throw Error('입력 자료 오류');
   v[id]=Number(x[1]);
  }
  if(Object.keys(v).length!==6)throw Error('지급금 항목 수 확인 필요');
  if(typeof window.confirm==='function'&&!window.confirm(date+' 엑셀 사진의 누적 세후 지급금 자료를 이 브라우저에 적용할까요? 기존의 더 큰 누적금액과 날짜별 입금기록은 그대로 유지합니다.'))return;
  const oldUS=localStorage.getItem(US_HOLD),oldDIV=localStorage.getItem(DIV);
  const h={...read(US_HOLD)},d={...read(DIV)};
  for(const id of PAYOUT_US){
   const original=finite(h[id]?.krwNet)?Number(h[id].krwNet):null;
   if(original===null||original<v[id])h[id]={...(h[id]||{}),krwNet:v[id]};
  }
  for(const id of ['tossDomestic','kiwoom']){
   const original=payoutEntry(d[id]);
   if(!original||(String(original.date||'')<=date&&original.amount<v[id]))
    d[id]={amount:v[id],date,source:'사용자 엑셀 사진'};
  }
  try{localStorage.setItem(US_HOLD,JSON.stringify(h));localStorage.setItem(DIV,JSON.stringify(d));}
  catch(e){try{if(oldUS===null)localStorage.removeItem(US_HOLD);else localStorage.setItem(US_HOLD,oldUS);
   if(oldDIV===null)localStorage.removeItem(DIV);else localStorage.setItem(DIV,oldDIV);}catch(__){}
   throw Error('기기 저장 오류');}
  const msg=$('account-dividend-message');
  if(msg)msg.textContent=date+' 사진의 누적 분배금 적용 완료 · 기존 더 큰 금액과 개별 지급일은 유지했습니다.';
  if($('account-div-toss-domestic'))$('account-div-toss-domestic').value=d.tossDomestic?.amount??'';
  if($('account-div-kiwoom'))$('account-div-kiwoom').value=d.kiwoom?.amount??'';
  window.ISA_US_APP?.rerender?.();
 }catch(e){const msg=$('account-dividend-message');if(msg)msg.textContent='사진 분배금 적용 실패: '+String(e.message||e);}
 finally{try{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}catch(_){}}
}

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
 renderDividends();
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
 initDividendEditor();
 applyPrivateDividendPhoto();
 document.addEventListener('isa-rendered',render);
 window.addEventListener('isa-us-valuation-refreshed',render);
 window.addEventListener('storage',render);
 window.addEventListener('pageshow',render);
 render();
}
window.ISA_ACCOUNT_SUMMARY={getTotals:totals,getDividends:dividendTotals,refresh:render};
mount();
})();