/* Separate USD watchlist. No account data uploaded to GitHub. */
(function(){
'use strict';
const FUNDS=[
 {id:'schd',ticker:'SCHD',name:'Schwab US Dividend Equity ETF',type:'미국 배당 ETF',hint:'분배금 재투자 우선순위 1'},
 {id:'agnc',ticker:'AGNC',name:'AGNC Investment Corp.',type:'미국 개별주 · 모기지 리츠',hint:'배당 재투자 우선순위 2'},
 {id:'spym',ticker:'SPYM',name:'SPDR Portfolio S&P 500 ETF',type:'미국 S&P500 ETF',hint:'분배금 재투자 우선순위 3'},
 {id:'cony',ticker:'CONY',name:'YieldMax COIN Option Income Strategy ETF',type:'고위험 커버드콜 ETF',hint:'230~250주 목표 · 분배금/NAV/병합 별도 주의'}
];
let data=null,selected='cony',loadTime=null;
const $=id=>document.getElementById(id);
const valid=n=>n!==null&&n!==undefined&&String(n).trim()!==''&&Number.isFinite(Number(n))&&Number(n)>0;
const num=n=>Number(n);
const usd=(n,d=2)=>'$'+num(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const text=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>/^\d{8}$/.test(String(s))?s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8):'미확인';
const min=(...args)=>Math.min(...args);
const round=(n,p=2)=>Number(n.toFixed(p));
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(e){return null}};
function record(f){return data?.items?.find(x=>x.id===f.id);}
function fresh(x){
 if(!x?.ok||!/^\d{8}$/.test(x.date)||!Array.isArray(x.bars)||x.bars.length<40)return false;
 const dt=new Date(x.date.slice(0,4)+'-'+x.date.slice(4,6)+'-'+x.date.slice(6,8)+'T12:00:00Z');
 return Number.isFinite(dt.getTime())&&Math.abs(Date.now()-dt.getTime())<8*86400000;
}
function market(f){const x=record(f);return x&&fresh(x)?x:null;}
function price(f){const x=market(f),live=window.ISA_PERSONAL_US?.quote?.(f.id);return live?live.usd:x?Number(x.close):null;}
function zone(x,px){
 if(!x||!(px>0))return null;
 const b20=x.low20+(x.high20-x.low20)*.20,b30=x.low20+(x.high20-x.low20)*.30;
 return {b20:round(b20,3),b30:round(b30,3),level:px<=b20?2:px<=b30?1:0};
}
function trend(x){
 const t=x.trend;if(!t)return '미확인';
 if(t.goldenCross)return '5·20일선 골든크로스';
 if(t.deadCross)return '5·20일선 데드크로스';
 if(t.crossUp)return '20일선 종가 상향 돌파';
 if(t.crossDown)return '20일선 종가 아래 재이탈';
 if(t.twoDaysAbove&&t.ma5Above20&&t.maRising)return '20일선 위 추세 확인';
 if(x.close<t.ma20)return '20일선 아래 · 반등 확인 필요';
 return '상승 추세 추가 확인';
}
function distribution(x){
 if(!x||!Array.isArray(x.dividends))return {available:false,reason:'분배금 이벤트 데이터 미확인'};
 if(!x.source.includes('Yahoo'))return {available:false,reason:'대체 시세 제공처는 분배금 이벤트를 제공하지 않습니다'};
 const lastDate=new Date(x.date.slice(0,4)+'-'+x.date.slice(4,6)+'-'+x.date.slice(6,8)+'T12:00:00Z');
 const cutoff=new Date(lastDate.getTime()-90*86400000).getTime();
 const recent=x.dividends.filter(d=>Number.isFinite(d.perShare)&&d.perShare>0&&/^\d{8}$/.test(d.date)&&
 new Date(d.date.slice(0,4)+'-'+d.date.slice(4,6)+'-'+d.date.slice(6,8)+'T12:00:00Z').getTime()>=cutoff);
 return {available:recent.length>0,recent,total:recent.reduce((s,d)=>s+d.perShare,0),
  last:x.dividends.at(-1)||null,reason:recent.length?'최근 90일 제공처 기록 기준, 향후 분배금 보장 없음':'최근 90일 지급 이벤트 미확인'};
}
function chart(x){
 const b=x.bars,last=b.slice(-20);
 const closes=last.map(d=>d.close),ma5s=last.map((d,i)=>b.slice(i+16,i+21).reduce((s,e)=>s+e.close,0)/5);
 const ma20s=last.map((d,i)=>b.slice(i+1,i+21).reduce((s,e)=>s+e.close,0)/20);
 const lo=Math.min(...closes,...ma5s,...ma20s),hi=Math.max(...closes,...ma5s,...ma20s),range=Math.max(.01,hi-lo);
 const poly=series=>series.map((v,i)=>(12+i*276/19).toFixed(1)+','+(83-68*(v-lo)/range).toFixed(1)).join(' ');
 return '<svg viewBox="0 0 300 100" role="img" aria-label="미국장 20거래일 종가 빨강, 5일선 초록, 20일선 노랑">'+
 '<line x1="12" y1="83" x2="288" y2="83" stroke="#52627a"/>'+
 '<polyline points="'+poly(closes)+'" fill="none" stroke="#f87171" stroke-width="2.8"/>'+
 '<polyline points="'+poly(ma5s)+'" fill="none" stroke="#24bf9a" stroke-width="2.1"/>'+
 '<polyline points="'+poly(ma20s)+'" fill="none" stroke="#eab308" stroke-width="2.1"/></svg>';
}
function conversionLine(q){
 if(!q||!Number.isFinite(q.usd)||q.usd<=0||
    !Number.isFinite(q.fxRate)||q.fxRate<=0||!Number.isFinite(q.amount))return '';
 const usd=q.usd.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:6});
 const rate=q.fxRate.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:6});
 const calc=Math.round(q.amount).toLocaleString('ko-KR');
 let fxTime='환율 기준 미확인',warning='';
 if(q.fxManual){
  fxTime='사용자가 설정한 환율';
 }else{
  const stamp=Date.parse(q.fxAt||''),age=Date.now()-stamp;
  if(Number.isFinite(stamp)){
   fxTime='환율 기준 '+new Date(stamp).toLocaleString('ko-KR',
    {timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
   if(Number.isFinite(age)&&age>24*3600000)warning=' · 환율 기준 24시간 이상 경과';
  }
 }
 return usd+' USD × '+rate+'원/USD = 약 '+calc+'원 · '+fxTime+warning+
  ' · 토스 적용환율·체결시세와 차이 가능';
}
function wonAmount(n,decimals=0){
 return Number(n).toLocaleString('ko-KR',{minimumFractionDigits:decimals,maximumFractionDigits:decimals})+'원';
}
function signedWon(n){
 return (n>=0?'+':'-')+wonAmount(Math.abs(n));
}
function pct(n){
 return (n>=0?'+':'')+n.toFixed(2)+'%';
}
function fmtQty(n){
 return Number(n).toLocaleString('ko-KR',{maximumFractionDigits:6})+'주';
}
function pendingUSCloseUpdate(x,now=new Date()){
 if(!x?.date||!/^[0-9]{8}$/.test(String(x.date)))return false;
 const session=window.ISA_US_SIGNAL?.session?.(now);
 const expected=session?.calendarKnown?session.expected:data?.expectedDate;
 return typeof expected==='string'&&/^\d{8}$/.test(expected)&&x.date<expected;
}
function priceSource(f,x,wonQuote){
 const state=window.ISA_PERSONAL_US?.state?.();
 if(wonQuote?.kind==='finnhub-private'){
  const time=Date.parse(wonQuote.stamp||'');
  return {type:'live',short:'Finnhub 장중 체결'+(Number.isFinite(time)?
   ' · '+new Date(time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',
    month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'')};
 }
 if(wonQuote?.kind==='toss-broker-last')return {type:'broker',short:
  '토스 마지막 조회 단가 · '+new Date(wonQuote.stamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+
  ' · 실시간 아님'};
 if(wonQuote?.manual)return {type:'manual',short:'토스 원화 현재가 직접 입력 · 당일만 유효'};
 const reason=state?.fetching?'장중 시세 확인 중':
  !state?.configured?'장중 시세 미연결':
  state?.error?'장중 시세 조회 실패':'장중 시세 미수신·만료';
 const pending=pendingUSCloseUpdate(x);
 return {type:pending?'stale':'close',short:x?'직전 확정 종가 '+date(x.date)+
   (pending?' · 최근 미국장 종가 갱신 대기':'')+' · '+reason:
  '시세 확인 대기 · '+reason};
}
function movingAverageCard(x,wonQuote){
 const ma20=Number(x?.trend?.ma20),ma5=Number(x?.trend?.ma5);
 // Compare the displayed KRW price with USD daily-bar indicators translated
 // using one reference FX rate. Never call it a true KRW historical MA.
 const fxRate=Number(wonQuote?.fxRate||window.ISA_US_KRW?.fx?.()?.rate);
 if(!x||!valid(ma20)||!valid(ma5)||!valid(fxRate)||!valid(wonQuote?.amount))
  return '<div class="us-card-ma20"><div class="us-ma-heading">20일 이동평균선 · 확인 대기</div>'+
   '<div class="us-ma-foot">확정 일봉·참고환율·현재가격을 모두 확인한 후 계산합니다.</div></div>';
 const m20=ma20*fxRate,m5=ma5*fxRate,diff=wonQuote.amount-m20,relative=diff/m20*100;
 return '<div class="us-card-ma20">'+
  '<div class="us-ma-heading"><b>20일 이동평균선</b><strong>'+wonAmount(m20,2)+'</strong></div>'+
  '<div class="us-ma-comparison">비교가격 '+wonAmount(wonQuote.amount)+' · 20일선 대비 '+
  '<b class="'+(diff>=0?'us-positive':'us-negative')+'">'+signedWon(diff)+' ('+pct(relative)+')</b></div>'+
  '<div class="us-ma-foot">5일선 '+wonAmount(m5,2)+' · 기준 '+date(x.date)+' 확정 일봉</div>'+
  '<div class="us-ma-foot">달러 이평선의 원화 환산값</div>'+
  '</div>';
}
function holdingCard(id,usdPx){
 const h=read('isa-us-holdings-v1')?.[id]||{};
 const qty=h.qty!==null&&h.qty!==undefined&&String(h.qty).trim()!==''&&
   Number.isFinite(Number(h.qty))&&Number(h.qty)>=0?Number(h.qty):null;
 const avg=valid(h.krwAvg)?Number(h.krwAvg):null;
 const position=window.ISA_US_KRW?.basisKrw?.(id,usdPx);
 const receipt=window.ISA_US_KRW?.netDividend?.(id);
 // Cash actually received is not the same as dividend-inclusive P/L.
 // Render it independently, even if a live quote or average cost is missing.
 const diag=id==='cony'?window.ISA_US_KRW?.payoutStorageDiagnostic?.(id):null;
 const latestPayment=diag?'<small> · 오늘 '+(diag.todayCount?
   '세후 '+wonAmount(diag.todayNet)+' 기록 확인':'지급기록 없음')+
   (diag.unrecognized?' · 일부 지급기록 인식 불가':'')+'</small>':'';
 const receiptLine=receipt&&Number.isFinite(Number(receipt.amount))&&Number(receipt.amount)>=0?
   '<div class="us-card-dividend">누적 세후 배당·분배금 <b>'+wonAmount(receipt.amount)+'</b>'+
   '<small> · '+(receipt.kind==='ledger'?'날짜별 입력 합계(과거 누락 가능)':
    receipt.kind==='cumulative-extended'?'기존 누적액 + 기준일 이후 주별 지급분':
    receipt.unlinked?'기존 누적 기준 지급일 확인 필요':'기준일까지 직접 입력 누적액')+'</small>'+
    latestPayment+'</div>':
   '<div class="us-card-dividend">누적 세후 배당·분배금 미확인 · 입력값 필요'+latestPayment+'</div>';
 const official=window.ISA_TOSS_BROKER?.snapshot?.(),
  candidate=official?.ok&&Array.isArray(official.holdings)?
   official.holdings.find(x=>x?.marketCountry==='US'&&
    String(x.symbol||'').toUpperCase()===id.toUpperCase()):null;
 const stamp=Date.parse(official?.fetchedAt||'');
 const recordState=window.ISA_TOSS_BROKER?.snapshotMeta?.()?.state;
 const remote=!window.ISA_PORTFOLIO_TOTALS?.sharedBasis?.()&&candidate&&Number.isFinite(stamp)&&stamp<=Date.now()+60000&&
  ['live','cached'].includes(recordState)?candidate:null;
 const officialLine=remote?'<small>토스 공식 보유 '+fmtQty(remote.quantity)+' · 원화 자료 확인 필요</small>':'';
 // Keep the main card in KRW, using the same position basis as the account summary.
 const row=window.ISA_PORTFOLIO_TOTALS?.row?.('us',id);
 if((remote&&row?.official||window.ISA_SHARED_QUOTES?.valuationEnabled?.())&&row?.qty>0&&Number.isFinite(row.qty)&&Number.isFinite(row.invested)&&Number.isFinite(row.value)){
  const pnl=row.value-row.invested,rate=row.invested>0?100*pnl/row.invested:null;
  const net=receipt&&receipt.amount!==null&&receipt.amount!==undefined&&Number.isFinite(Number(receipt.amount))?Number(receipt.amount):null;
  const inclusive=net===null?null:pnl+net;
  return '<div class="us-card-holding">보유 '+fmtQty(row.qty)+' · 평단 '+(valid(row.avg)?wonAmount(row.avg,2):'미확인')+
   '<div class="us-card-pnl '+(pnl>=0?'us-positive':'us-negative')+'">평가손익 '+signedWon(pnl)+(rate===null?'':' ('+pct(rate)+')')+'</div>'+
   receiptLine+
   (inclusive===null?'':'<div class="us-card-inclusive '+(inclusive>=0?'us-positive':'us-negative')+'">분배금 포함 총손익 '+signedWon(inclusive)+(row.invested>0?' ('+pct(100*inclusive/row.invested)+')':'')+'</div>')+
   '<small>'+(row.official?(row.cachedHolding?'저장된 토스 보유자료 · 새 매매 미반영':'토스 공식 보유자료'):(row.priceSource||'공통 평가')+' · '+(row.priceDate||'기준일 미확인'))+' · 원화 환산 참고</small></div>';
 }
 const holdings='보유 '+(qty===null?'미입력':fmtQty(qty))+
  ' · 평단 '+(avg===null?'미입력':wonAmount(avg,2));
 if(qty===0)return '<div class="us-card-holding">'+holdings+' · 현재 미보유'+receiptLine+'</div>';
 if(!position||window.ISA_SHARED_QUOTES?.valuationEnabled?.())return '<div class="us-card-holding">'+holdings+officialLine+
  '<div class="us-card-pnl">평가손익 계산 대기 · 보유정보와 원화 참고가격 확인</div>'+
  receiptLine+'</div>';
 return '<div class="us-card-holding">'+holdings+
  '<div class="us-card-pnl '+(position.pnl>=0?'us-positive':'us-negative')+'">평가손익 '+
   signedWon(position.pnl)+' ('+pct(position.rate)+')</div>'+
  receiptLine+
  (position.inclusive!==null?
   '<div class="us-card-inclusive '+(position.inclusive>=0?'us-positive':'us-negative')+'">분배금 포함 총손익 '+
    signedWon(position.inclusive)+' ('+pct(position.inclusiveRate)+')</div>':
   '<div class="us-card-inclusive">분배금 포함 총손익: 누적 세후 지급금 확인 후 계산</div>')+
  '</div>';
}
// The fifth holding is already included in account totals. Show the same
// locally stored valuation without guessing a symbol or inventing signals.
function otherHoldingCard(){
 const r=window.ISA_PORTFOLIO_TOTALS?.row?.('us','spacex');
 const has=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n));
 const price=valid(r?.unitPrice)?wonAmount(r.unitPrice):'가격 미확인';
 const qty=has(r?.qty)?fmtQty(r.qty):'미입력';
 const avg=valid(r?.avg)?wonAmount(r.avg,2):'미입력';
 const pnl=has(r?.profit)?Number(r.profit):null;
 const rate=pnl!==null&&Number(r.invested)>0?100*pnl/r.invested:null;
 const rawDate=String(r?.priceDate||'');
 const stamp=Date.parse(rawDate);
 const label=/^\d{4}-\d{2}-\d{2}$/.test(rawDate)?rawDate:
  Number.isFinite(stamp)?new Date(stamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'기준일 미확인';
 const source=r?.priceSource?.includes('Finnhub')?'Finnhub 장중 체결 · 참고환율':(r?.priceSource||'시세 미연결');
 return '<div class="us-card us-list-row" id="us-other-holding-card">'+
  '<span class="us-list-top"><strong class="us-list-ticker">스페이스X</strong><b class="us-list-price">'+text(price)+'</b></span>'+
  '<span class="us-list-subtitle">토스 보유 미국 기타 종목 · SPCX · 나스닥</span>'+
  '<span class="us-list-source">'+text(source+' · '+label)+'</span>'+
  '<div class="us-card-signal state-wait"><strong class="us-card-signal-action">보류</strong><span class="us-card-signal-note">별도 매수 기준 미설정</span></div>'+
  '<div class="us-card-holding">보유 '+text(qty)+' · 평단 '+text(avg)+
  (has(r?.value)?'<div class="us-card-pnl">참고 평가금액 '+wonAmount(r.value)+'</div>':'')+
  (pnl!==null?'<div class="us-card-pnl '+(pnl>=0?'us-positive':'us-negative')+'">평가손익 '+signedWon(pnl)+(rate===null?'':' ('+pct(rate)+')')+'</div>':'')+
  '<small>상단 계좌 합계에 이미 포함 · 중복 합산하지 않음</small></div></div>';
}
function cards(){
 const host=$('us-cards');if(!host)return;
 // Match the vertical Korean ETF cards: price, source, MA20 reference, holdings and P/L.
 host.innerHTML=FUNDS.map(f=>{
  const x=market(f),px=price(f),
   q=window.ISA_US_KRW?.priceKrw?.(f.id,px);
  const common=window.ISA_SHARED_QUOTES?.valuationEnabled?.()?window.ISA_PORTFOLIO_TOTALS?.row?.('us',f.id):null;
  const krwPrice=common?(valid(common.unitPrice)?wonAmount(common.unitPrice):'공통 평가가격 미확인'):(valid(q?.amount)?wonAmount(q.amount):'원화 가격 미확인');
  const source=common?{short:(common.priceSource||'공통 평가가격 확인 중')+(common.priceDate?' · '+common.priceDate:''),type:''}:priceSource(f,x,q);
  const selectedClass=selected===f.id?'us-selected':'';
  const priceMeaning=q?.manual?'토스 직접 입력 · 오늘 가격':
   q?.kind==='finnhub-private'?'개인 체결가 · 원화 환산':
   q?.kind==='toss-broker-last'?'토스 공식 잔고 최종 표시 단가 · 실시간 보장 아님':
   q?.kind==='usd-close'?'확정 종가 '+date(x?.date)+' × 참고환율 · 현재가 아님':
   '원화 참고가격 미확인';
  return '<div role="button" tabindex="0" class="us-card us-list-row '+selectedClass+'" data-us="'+f.id+
   '" aria-label="'+text(f.ticker+' '+krwPrice+' '+source.short)+'" aria-pressed="'+
   (selected===f.id?'true':'false')+'">'+
   '<span class="us-list-top"><strong class="us-list-ticker">'+f.ticker+'</strong>'+
    '<b class="us-list-price">'+text(krwPrice)+'</b>'+
    '<span class="us-list-arrow" aria-hidden="true">›</span></span>'+
   '<span class="us-list-subtitle">'+text(f.type)+'</span>'+
   '<span class="us-list-source '+source.type+'">'+text(source.short+(common?'':q?.kind==='usd-close'?' · 참고환율 · 현재가 아님':q?.kind==='finnhub-private'?' · 원화 환산':''))+'</span>'+
   (window.ISA_US_SIGNAL?.cardStatus?.(f.id)||'<div class="us-card-signal state-wait"><strong class="us-card-signal-action">대기</strong><span class="us-card-signal-note">매수 판단 로딩 중</span></div>')+
   movingAverageCard(x,q)+holdingCard(f.id,px)+

   '</div>';
 }).join('')+otherHoldingCard();
 host.querySelectorAll('[data-us]').forEach(btn=>{
  const select=()=>{selected=btn.dataset.us;render();const detail=$('us-chart-panel');if(detail)detail.open=true;};
  btn.addEventListener('click',select);
  btn.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}
  });
 });
}
function details(){
 const f=FUNDS.find(f=>f.id===selected),x=market(f),px=x?Number(x.close):null,host=$('us-details');
 if(!host)return;
 if(!x){host.innerHTML='<h3>'+f.ticker+' · '+text(f.name)+'</h3>'+(window.ISA_US_SIGNAL?.detailLine?.(f.id)||'')+'<p class="us-small">미국장 완료 일봉을 확인할 수 없습니다. 가격과 이동평균선을 추정하지 않습니다. <a href="https://finance.yahoo.com/quote/'+f.ticker+'/" target="_blank" rel="noopener">시세 제공처에서 확인</a></p>';return;}
 const z=zone(x,px),div=distribution(x),t=x.trend,metric=n=>window.ISA_US_KRW?.metricPrice?.(n)||usd(n),divPrice=n=>window.ISA_US_KRW?.dividendPrice?.(n)||usd(n,4);
 const split=x.splits||[];
 let section='<h3>'+f.ticker+' · '+text(f.name)+'</h3><p class="us-small">'+text(f.type)+' · '+text(f.hint)+'</p>'+
 '<p class="us-small">기술분석: '+date(x.date)+' 확정 일봉 · 장중 시세와 별개</p>'+
 (window.ISA_US_SIGNAL?.detailLine?.(f.id)||'')+chart(x)+'<p class="us-legend">빨강 종가 · 초록 5일선 · 노랑 20일선 (원본 달러 차트)</p>'+
 '<div class="us-statgrid"><div>종가<strong>'+metric(x.close)+'</strong></div><div>5일선<strong>'+metric(t.ma5)+'</strong></div>'+
 '<div>20일선<strong>'+metric(t.ma20)+'</strong></div><div>20일 저가<strong>'+metric(x.low20)+'</strong></div>'+
 '<div>20일 고가<strong>'+metric(x.high20)+'</strong></div><div>하단 30% · 20%<strong>'+metric(z.b30)+' / '+metric(z.b20)+'</strong></div></div>'+
 '<p class="us-small">이평선 판단: <b>'+text(trend(x))+'</b>. 매수 조건은 개인 평단·비중·현금 여력을 함께 보세요.</p>'+ '<p class="us-small">원화 5·20일선과 박스권은 각각의 달러 지표에 동일 참고환율을 곱한 값입니다. 날짜별 실제 환율을 적용한 원화 이동평균은 아닙니다.</p>'+ (window.ISA_US_KRW?.detailLine?.(f.id,px)||'');
 if(div.available){
  section+='<p class="us-small"><b>최근 90일 세전 배당·분배금 합계(주당):</b> '+divPrice(div.total)+' · 월평균 환산 약 '+divPrice(div.total/3)+' (세전 참고)</p>'+
  '<p class="us-small">마지막 기록 '+date(div.last.date)+' · '+divPrice(div.last.perShare)+'/주 · 현재 참고환율 환산이며 지급 당시 환율·세후 실수령액과 다릅니다</p>';
 }else section+='<p class="us-small">배당·분배금 자동 확인: '+text(div.reason)+' · 정확한 실수령액은 증권사 내역을 입력하세요.</p>';
 if(f.id==='cony'){
  const h=read('isa-us-holdings-v1')||{},shares=valid(h.cony?.qty)?Number(h.cony.qty):0;
  section+='<div class="us-cony"><strong>CONY 별도 관리</strong>'+
  '<p>보유 '+shares.toLocaleString('ko-KR')+'주 · 목표 230~250주'+(shares>0?' · 230주 목표까지 '+Math.max(0,230-shares).toLocaleString('ko-KR')+'주 부족':' · 실제 보유수량을 입력해 진행률 표시')+'</p>'+
  '<div class="us-progress"><span style="width:'+Math.min(100,shares/230*100)+'%"></span></div>'+
  '<p class="us-small">COIN 주가, 옵션 수익구조, NAV, 분배금 포함 총수익률, 운용사 역분할 공시가 별도로 중요합니다. 이 화면에서 공식 NAV·운용사 공시를 실시간 확인하지는 않습니다.</p>'+
  '<p class="us-small">최근 6개월 제공처 분할 기록: '+(split.length?split.map(s=>date(s.date)+' 비율 '+text(s.ratio)).join(' · '):x.source.includes('Yahoo')?'조회된 이벤트 없음 (미래 병합 가능성 없음 의미 아님)':'제공처 미지원 · 병합 여부 별도 확인 필요')+'</p>'+
  '<a href="https://www.yieldmaxetfs.com/our-etfs/cony/" target="_blank" rel="noopener">CONY 공식 운용사 공지·분배금</a></div>';
 }
 if(f.id==='agnc')section+='<p class="us-small">AGNC는 ETF가 아니라 모기지 리츠 회사 주식입니다. 배당액뿐 아니라 순자산(BVPS), 금리 민감도 및 배당 지속가능성을 별도로 확인하세요.</p>';
 if(f.id==='spym')section+='<p class="us-small">SPYM은 State Street SPDR Portfolio S&P 500 ETF의 현재 티커입니다. 배당수익보다 지수 추적·총수익률 중심으로 점검합니다.</p>';
 const chosenQuote=window.ISA_US_KRW?.priceKrw?.(f.id,price(f));
 const calculation=conversionLine(chosenQuote);
 if(calculation)section+='<p class="us-small">시세 환산 상세: '+text(calculation)+'</p>';
 if(pendingUSCloseUpdate(x))section+='<p class="us-small us-quote-stale">미국장이 마감됐지만 최신 확정 일봉이 아직 반영되지 않았을 수 있습니다. 과거 종가와 참고환율로 환산한 가격은 토스 현재가가 아닙니다. 상단 보유정보 입력에서 해당 종목의 당일 원화 현재가를 보정할 수 있습니다.</p>';
 host.innerHTML=section;
}
function render(){cards();details();}
// A partial refresh must not erase a good dated candle or regress to an older
// source. Retained prices stay dated; the signal engine checks required session.
function mergeDaily(previous,next,now=Date.now()){
 const tickers={schd:'SCHD',agnc:'AGNC',spym:'SPYM',cony:'CONY',spacex:'SPCX'};
 const good=(q,id)=>q?.id===id&&q.ticker===tickers[id]&&q.ok===true&&
  /^\d{8}$/.test(q.date)&&Number.isFinite(q.close)&&q.close>0&&
  Array.isArray(q.bars)&&q.bars.length>=40&&q.bars.at(-1)?.date===q.date&&
  q.bars.at(-1)?.close===q.close&&(id!=='spacex'||q.bars.every(b=>b.date>='20260612'));
 const choose=(id,old,fresh)=>{
  if(good(fresh,id)&&(!good(old,id)||fresh.date>=old.date))return fresh;
  return good(old,id)?old:{id,ticker:tickers[id],ok:false,reason:'유효한 일봉 없음'};
 };
 const items=Object.keys(tickers).filter(id=>id!=='spacex').map(id=>
  choose(id,previous?.items?.find(q=>q.id===id),next.items.find(q=>q.id===id)));
 const spcx=choose('spacex',previous?.extraQuotes?.spacex,next.extraQuotes?.spacex);
 const fxOK=fx=>fx?.ok===true&&Number.isFinite(fx.usdKrw)&&fx.usdKrw>=700&&fx.usdKrw<=3000&&
  Number.isFinite(Date.parse(fx.observedAt))&&now-Date.parse(fx.observedAt)>=0&&now-Date.parse(fx.observedAt)<=8*86400000;
 const oldFX=previous?.fx,newFX=next.fx;
 const fx=fxOK(newFX)&&(!fxOK(oldFX)||Date.parse(newFX.observedAt)>=Date.parse(oldFX.observedAt))?
  newFX:fxOK(oldFX)?oldFX:{ok:false,reason:'유효한 환율 없음'};
 return {...next,items,extraQuotes:spcx.ok?{spacex:spcx}:{},fx};
}
async function refresh(){
 const el=$('us-updated');
 if(el)el.textContent='미국장 일봉을 확인 중…';
 try{
  const r=await fetch('./us-quotes.json?refresh='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();
  if(d.market!=='US'||d.currency!=='USD'||!Array.isArray(d.items))throw Error('미국장 일봉 형식 미확인');
  data=mergeDaily(data,d);loadTime=d.fetchedAt;
  const expected=window.ISA_US_SIGNAL?.session?.()?.expected||data.expectedDate;
  const count=FUNDS.filter(f=>market(f)?.date===expected).length;
  const spcx=data.extraQuotes?.spacex;
  const extraCount=spcx&&fresh(spcx)&&spcx.date===expected?1:0;
  const time=loadTime?new Date(loadTime).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인';
  const dated=FUNDS.map(f=>market(f)?.date).filter(Boolean).sort();
  el.textContent='최신 거래일 일봉 '+(expected?count+extraCount+'/5 · 필요 '+date(expected):'확인 대기')+' · 수집 기준 '+(dated.length?date(dated[0])+(dated[0]!==dated.at(-1)?'~'+date(dated.at(-1)):''):'미확인')+' · 조회 '+time;
 }catch(e){if(el)el.textContent='미국장 새 자료 조회 실패 · 마지막 확인 자료 유지: '+String(e.message||e);}
 render();
 window.dispatchEvent(new Event('isa-us-quotes-refreshed'));
}
window.ISA_US_APP={
 refresh,
 getData:()=>data,
 getPrice:id=>{if(id==='spacex'){const live=window.ISA_PERSONAL_US?.quote?.(id),x=data?.extraQuotes?.spacex;return live?.usd??(x?.ticker==='SPCX'&&fresh(x)&&x.date>='20260612'?Number(x.close):null);}
  const f=FUNDS.find(x=>x.id===id);return f?price(f):null;},
 getPosition:id=>(read('isa-us-holdings-v1')||{})[id]||{},
 applyFromLocal:()=>render(),
 rerender:()=>render()
};
window.addEventListener('isa-personal-us-quote-refreshed',()=>render());
document.addEventListener('isa-toss-broker-data',()=>render());
document.addEventListener('isa-portfolio-holdings-updated',()=>render());
window.addEventListener('pageshow',()=>render());
function mount(){
 const p=$('us-panel');if(!p)return;
 const reload=$('reload');if(reload)reload.addEventListener('click',refresh);
 $('us-refresh').onclick=refresh;
 refresh();
}
mount();
})();
