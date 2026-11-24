/* Top-level account totals. Read only user-owned browser storage and published quote
 * summaries; never publish balances to GitHub or treat a stale photo as live valuation.
 * Toss includes all 9 Korean equities and 5 US positions, not merely 4 tracked ETFs.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const KEY='isa-account-totals-v1',SNAP='isa-user-portfolio-snapshot-v1',MODE='isa-account-calculation-mode-v1';
const REFERENCE='isa-account-locked-reference-v1';
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
 // Use the same cumulative + later weekly payouts as the US stock card.
 const reconciled=window.ISA_US_KRW?.netDividend?.(id);
 if(reconciled)return reconciled;
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
  us+=v.amount;usKnown++;if(v.kind==='ledger'||v.unlinked)provisional.push(id.toUpperCase());
 }
 const stored=read(DIV),domesticBase=payoutEntry(stored.tossDomestic),kiwoomBase=payoutEntry(stored.kiwoom);
 // Account-wide Excel/photo totals are opening balances. Only receipts dated later
 // than that baseline may increase them: historical per-stock entries are never added twice.
 const calculator=window.ISA_KR_DIVIDENDS?.accountTotal;
 const domesticItem=typeof calculator==='function'?calculator('tossDomestic',domesticBase):null;
 const kiwoomItem=typeof calculator==='function'?calculator('kiwoom',kiwoomBase):null;
 const domestic=domesticItem?{amount:domesticItem.amount,date:domesticBase?.date||null}:domesticBase;
 const kiwoom=kiwoomItem?{amount:kiwoomItem.amount,date:kiwoomBase?.date||null}:kiwoomBase;
 if(!domestic)missing.push('토스 국내주식');
 if(!kiwoom)missing.push('키움 ISA');
 if(domesticItem?.kind==='partial')provisional.push('토스 국내주식 일부 종목');
 if(kiwoomItem?.kind==='partial')provisional.push('키움 ISA 일부 종목');
 return {us,usKnown,domestic:domestic?.amount??null,kiwoom:kiwoom?.amount??null,
  toss:us+(domestic?.amount||0),all:us+(domestic?.amount||0)+(kiwoom?.amount||0),
  complete:!missing.length&&!provisional.length,missing,provisional,
  dates:[domestic?.date,kiwoom?.date].filter(Boolean),
  afterBase:[domesticItem?.added||0,kiwoomItem?.added||0]};
}
function renderDividends(){
 const x=dividendTotals(),label=$('account-dividend-label'),total=$('account-dividend-total'),
  breakdown=$('account-dividend-breakdown'),note=$('account-dividend-source');
 if(!label||!total||!breakdown||!note)return;
 label.textContent=x.complete?'기록된 누적 세후 배당·분배금':'기록된 누적 세후 배당·분배금 (일부 확인 필요)';
 total.textContent=money(x.all);
 breakdown.textContent='토스 미국 '+x.usKnown+'/4종목 '+money(x.us)+' · 토스 국내 '+
  (x.domestic===null?'미입력':money(x.domestic))+' · 키움 ISA '+(x.kiwoom===null?'미입력':money(x.kiwoom));
 note.textContent=(x.missing.length?'미확인: '+x.missing.join(', ')+'. ':'')+
  (x.provisional.length?'누적 기준 지급일 미확인 또는 과거 기록 누락: '+x.provisional.join(', ')+' 확인 필요. ':'')+
  (x.afterBase?.some(x=>x>0)?'계좌 전체 누적액 기준일 이후 종목별 지급기록만 추가 합산. ':'')+
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
   if(original===null||original<v[id])
    h[id]={...(h[id]||{}),krwNet:v[id],krwNetAsOf:date};
   else if(original===v[id]&&!h[id]?.krwNetAsOf)
    h[id]={...(h[id]||{}),krwNetAsOf:date};
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
  window.dispatchEvent(new Event('isa-us-valuation-refreshed'));
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
 return p?{...p,date:v.date||null,source:'증권사 앱 전체 금액 직접 기록 (자동 연결 아님)'}:null;
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
function tossComputed(){
 const data=window.ISA_PORTFOLIO_TOTALS?.totals?.();
 if(!data)return null;
 return {invested:data.invested,value:data.value,date:data.date,
  source:data.source+(data.mixedDates?' · 가격 기준일 혼합·미확인':'')+
   (data.invested===null?' · 확인된 일부 매수원가 '+money(data.knownInvested):''),
  complete:data.completeBasis&&data.completeValue,estimated:true};
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
function tossOfficial(){
 const data=window.ISA_TOSS_BROKER?.snapshot?.();
 if(!data?.ok||!data.totals||!data.amounts)return null;
 const basis=data.totals.investedKRW,valuation=data.totals.valueKRW;
 const native=data.amounts.valued||{};
 const usd=Number(native.usd||0),krw=Number(native.krw||0);
 const source='토스 공식 API · 보유 '+data.holdingCount+'종목 · 국내 '+money(krw)+
  ' / 미국 USD '+usd.toLocaleString('ko-KR',{maximumFractionDigits:2})+
  (data.fx?.usdKrw?' · 공식 참고환율 '+data.fx.usdKrw:' · 환율 미확인')+
  ' · 실제 토스 앱 전체 원화액과 환율 및 비용 차이 가능';
 return {invested:finite(basis)?Number(basis):null,
  value:finite(valuation)?Number(valuation):null,
  date:data.fetchedAt||null,source,
  complete:finite(basis)&&finite(valuation),estimated:true,brokerApi:true};
}
function totals(){
 const mode=read(MODE),tossManual=manualTotals('toss'),
  kiwoomManual=manualTotals('kiwoom'),
  tossAutomatic=tossComputed(),kiwoomAutomatic=kiwoomComputed();
 return {
  toss:tossOfficial()||(mode.toss==='auto'?(tossAutomatic||tossManual||snapshotToss()):
   (tossManual||(tossAutomatic&&tossAutomatic.invested!==null?tossAutomatic:null)||snapshotToss()||tossAutomatic)),
  kiwoom:mode.kiwoom==='auto'?(kiwoomAutomatic||kiwoomManual):
   (kiwoomManual||kiwoomAutomatic)
 };
}
// Account-wide estimates are a saved reference, not a live broker balance.
// Quotes arrive asynchronously, so a partly updated 14-stock mixed-date basket
// must never silently overwrite a value already shown to the user.
function referenceSignature(id,data){
 if(id==='toss'){
  const rows=window.ISA_PORTFOLIO_TOTALS?.totals?.()?.rows;
  return Array.isArray(rows)&&rows.length===14?
   JSON.stringify(rows.map(r=>[r.market,r.id,r.qty,r.avg])):
   String(data?.invested??'missing');
 }
 const k=window.ISA_KR_APP?.accountTotals?.();
 return k?.holdingsKey||String(k?.principal??data?.invested??'missing');
}
function recordOK(x){
 return x&&finite(x.invested)&&finite(x.value)&&
  typeof x.signature==='string'&&typeof x.checkedAt==='string';
}
function saveReference(id,data,signature){
 const entry={signature,checkedAt:new Date().toISOString(),
  invested:Number(data.invested),value:Number(data.value),
  date:data.date||null,source:data.source||'자동 참고평가'};
 try{localStorage.setItem(REFERENCE,JSON.stringify({...read(REFERENCE),[id]:entry}));}
 catch(_){}
 return entry;
}
function referenceDisplay(id,data){
 if(!data?.estimated||data.brokerApi)return data;
 const signature=referenceSignature(id,data),old=read(REFERENCE)[id];
 if(recordOK(old)&&old.signature===signature){
  return {...data,invested:old.invested,value:old.value,date:old.date,
   source:old.source+' · 저장된 참고 평가액 (직접 갱신 시 변경)',
   checkedAt:old.checkedAt,locked:true};
 }
 if(!finite(data.invested)||!finite(data.value))return data;
 const saved=saveReference(id,data,signature);
 return {...data,checkedAt:saved.checkedAt,locked:true};
}
function viewTotals(){
 const x=totals();
 return {toss:referenceDisplay('toss',x.toss),
  kiwoom:referenceDisplay('kiwoom',x.kiwoom)};
}
function refreshReferenceTotals(){
 const x=totals(),updated=[],skipped=[];
 for(const id of ['toss','kiwoom']){
  const data=x[id];
  if(data?.estimated&&finite(data.invested)&&finite(data.value)){
   saveReference(id,data,referenceSignature(id,data));
   updated.push(id==='toss'?'토스':'키움 ISA');
  }else skipped.push(id==='toss'?'토스':'키움 ISA');
 }
 render();
 const note=$('account-valuation-note');
 if(note)note.textContent=(updated.length?'참고 평가액 재계산: '+updated.join('·')+'. ':'')+
  (skipped.length?'현재 평가가격 미확인·직접 입력 유지: '+skipped.join('·')+'. ':'')+
  '실제 증권사 잔고와 다를 수 있습니다. 휴대폰·노트북 저장정보는 서로 동기화되지 않습니다.';
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
  (id==='toss'&&!data.brokerApi?' · 자동 장중 갱신 아님':'');
}
function render(){
 const x=viewTotals();
 displayAccount('toss',x.toss);displayAccount('kiwoom',x.kiwoom);
 renderDividends();
 const note=$('account-valuation-note');
 if(note){
  const saved=read(REFERENCE),latest=[saved.toss?.checkedAt,saved.kiwoom?.checkedAt]
   .filter(Boolean).sort().at(-1);
  note.textContent=(x.toss?.brokerApi?'토스는 공식 API 조회 결과를 사용합니다. USD 보유분은 공식 표시환율로 참고 환산한 금액이며 토스 앱과 다를 수 있습니다. ':'계좌 참고평가액은 저장된 계산값으로 고정됩니다. 새 시세는 위의 ‘참고 평가액 갱신’을 눌러 반영합니다. ')+
   (latest?' 마지막 참고 계산: '+new Date(latest).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+'.':'')+
   ' 실제 증권사 잔고가 아니며 휴대폰·노트북 저장정보는 서로 동기화되지 않습니다.';
 }
 const brokerNote=$('account-broker-compare');
 if(brokerNote){
  const broker=manualTotals('toss');
  const estimate=tossComputed(),official=tossOfficial();
  const explicit=read(MODE).toss==='manual';
  if(official){
   const officialValue=finite(official.value)?money(official.value):'환율 미확인 · 통화별로만 표시';
   brokerNote.textContent='토스 공식 API '+window.ISA_TOSS_BROKER.snapshot().holdingCount+'종목 · '+
    '현재 원화 참고환산 '+officialValue+
    (estimate&&finite(estimate.value)?' · 기존 14종목 사진·시세 참고액 '+money(estimate.value)+
     (finite(official.value)?' · 차이 '+(estimate.value>=official.value?'+':'')+
       money(Math.round(estimate.value)-Math.round(official.value)):''):'')+
    ' · 미국 자산 원화 환산은 토스증권 앱의 예상세금·수수료·매입환율 반영액과 다를 수 있습니다.';
  }else if(broker){
   if(estimate&&finite(estimate.value)&&finite(estimate.invested)){
    const valueDelta=Math.round(estimate.value)-Math.round(broker.value);
    const basisDelta=Math.round(estimate.invested)-Math.round(broker.invested);
    const signed=v=>(v>0?'+':'')+money(v);
    brokerNote.textContent='토스 앱 직접 입력 '+money(broker.value)+' ('+(broker.date||'날짜 미확인')+
     ') · 14종목 참고 계산 '+money(estimate.value)+' · 평가금액 차이 '+signed(valueDelta)+
     ' · 원금 차이 '+signed(basisDelta)+
     (explicit?' · 상단은 토스 앱 입력값 우선 표시':' · 현재 자동 참고 모드 · 위 입력값으로 전환하려면 계좌 합계를 다시 저장')+
     ' · 기준일·환율·가격 출처가 다르므로 차이는 실제 손익이 아닙니다.';
   }else{
    brokerNote.textContent='토스 앱에서 직접 기록한 전체 평가금액 '+money(broker.value)+
     ' · 14종목 참고 계산은 일부 수량·평단·가격 미확인으로 비교 보류.'+
     (explicit?' 상단은 직접 입력값을 표시합니다.':' 상단 자동 참고 모드.');
   }
  }else{
   brokerNote.textContent='토스 앱의 실제 원금·전체 평가금액을 아직 입력하지 않았습니다. 14종목 계산값은 과거 사진·환산가격이 섞인 참고값입니다. 아래 실제 계좌금액 입력 버튼으로 대조하세요.';
  }
 }
 const combined=$('account-summary-total');if(!combined)return;
 const t=x.toss,k=x.kiwoom;
 if(finite(t?.invested)&&finite(k?.invested)){
  // The summary must reconcile exactly with the integer KRW amounts visible
  // in each brokerage row. Fractional-share FX conversions can carry sub-won
  // values; adding those unrounded values created a 1 KRW P/L discrepancy.
  const cost=Math.round(Number(t.invested))+Math.round(Number(k.invested));
  if(finite(t?.value)&&finite(k?.value)){
   const value=Math.round(Number(t.value))+Math.round(Number(k.value));
   const profit=value-cost;
   const profitText=(profit>0?'+':'')+money(profit);
   const rateText=cost>0?' ('+(profit>=0?'+':'')+(100*profit/cost).toFixed(2)+'%)':' (수익률 계산 불가)';
   const difference=!(t.date&&k.date&&t.date===k.date);
   combined.textContent=(difference?'참고 단순합계 (계좌별 기준일 다름)':'두 계좌 합계')+
    ' · 총투자금 '+money(cost)+' · 평가금액 '+money(value)+
    ' · 평가손익 '+profitText+rateText;
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
   localStorage.setItem(MODE,JSON.stringify({...read(MODE),...Object.fromEntries(Object.keys(changes).map(id=>[id,'manual']))}));
   status.textContent='이 휴대전화에 계좌별 금액을 저장했습니다. 상단에 입력 날짜와 함께 표시됩니다.';
   render();
  }catch(_){
   try{if(previous===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,previous);}catch(__){}
   status.textContent='계좌 금액 저장에 실패했습니다. 기존 설정은 보존하도록 처리했습니다.';
  }
 });
 $('account-total-auto')?.addEventListener('click',()=>{
  try{
   localStorage.removeItem(REFERENCE);
   localStorage.setItem(MODE,JSON.stringify({...read(MODE),toss:'auto',kiwoom:'auto'}));
   status.textContent='보유수량·평단 기반 자동합계가 우선 적용됩니다. 기존 수동 계좌 합계는 삭제하지 않았습니다.';
   render();
  }catch(_){status.textContent='자동합계 모드 저장 실패 · 기존 설정을 유지합니다.';}
 });
 reset.addEventListener('click',()=>{
  try{localStorage.removeItem(REFERENCE);localStorage.removeItem(KEY);localStorage.setItem(MODE,JSON.stringify({...read(MODE),toss:'auto',kiwoom:'auto'}));}
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
 $('account-show-editor')?.addEventListener('click',()=>{
  const outer=$('holdings-settings'),inner=$('account-edit');
  if(outer)outer.open=true;
  if(inner)inner.open=true;
  if(inner?.scrollIntoView)inner.scrollIntoView({behavior:'smooth',block:'start'});
  $('account-toss-invested')?.focus?.();
 });
 $('account-summary-recalc')?.addEventListener('click',()=>{
  if(window.ISA_TOSS_BROKER?.configured?.())window.ISA_TOSS_BROKER.load().catch(()=>{});
  else refreshReferenceTotals();
 });
 document.addEventListener('isa-rendered',render);
 document.addEventListener('isa-portfolio-holdings-updated',render);
 window.addEventListener('isa-us-valuation-refreshed',render);
 document.addEventListener('isa-kr-dividends-updated',render);
 document.addEventListener('isa-toss-broker-data',render);
 window.addEventListener('storage',render);
 window.addEventListener('pageshow',render);
 render();
}
window.ISA_ACCOUNT_SUMMARY={getTotals:totals,getDisplayTotals:viewTotals,getDividends:dividendTotals,refresh:render,refreshReferenceTotals};
mount();
})();
