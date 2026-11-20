/* Optional local-only KRW view for the USD US watchlist. Nothing is uploaded. */
(function(){
'use strict';
const ITEMS=['SCHD','AGNC','SPYM','CONY'];
// Replaced at deployment, so the user can tell whether the latest payout code loaded.
const PAYOUT_BUILD_VERSION='PAYOUT_BUILD_PLACEHOLDER';
const $=id=>document.getElementById(id);
const xnum=v=>v===null||v===undefined||String(v).trim()===''?null:Number(v);
const finitePositive=v=>Number.isFinite(xnum(v))&&xnum(v)>0;
const won=(v,d=0)=>Number(v).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d})+'원';
const usd=(v,d=2)=>'$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const clean=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=()=>{
 const a=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return a.year+'-'+a.month+'-'+a.day;
};
const storage=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}};
function holdings(){return storage('isa-us-holdings-v1')||{}}
function fx(){
 const r=window.ISA_US_APP?.getData?.()?.fx;
 if(!r?.ok||!finitePositive(r.usdKrw)||!r.observedAt)return null;
 const age=Date.now()-new Date(r.observedAt).getTime();
 if(!Number.isFinite(age)||age<0||age>8*86400000)return null;
 return {rate:Number(r.usdKrw),source:'공개 비공식 참고 환율',when:r.observedAt,manual:false};
}
function priceKrw(id,priceUsd){
 const p=holdings()[id]||{};
 if(finitePositive(p.krwCurrent)&&p.krwDay===day()){
  return {amount:Number(p.krwCurrent),manual:true,source:'토스 현재가 직접 입력',stamp:p.krwDay};
 }
 const rate=fx(),privateQuote=window.ISA_PERSONAL_US?.quote?.(id);
 if(rate&&privateQuote&&finitePositive(privateQuote.usd))
  return {amount:privateQuote.usd*rate.rate,manual:false,kind:'finnhub-private',
   usd:Number(privateQuote.usd),fxRate:rate.rate,fxAt:rate.when,fxSource:rate.source,fxManual:rate.manual,
   source:'Finnhub 개인 체결가 USD × '+rate.source,stamp:privateQuote.tradeAt};
 if(rate&&finitePositive(priceUsd))return {amount:Number(priceUsd)*rate.rate,manual:false,kind:'usd-close',
  usd:Number(priceUsd),fxRate:rate.rate,fxAt:rate.when,fxSource:rate.source,fxManual:rate.manual,
  source:'미국장 USD 종가 × '+rate.source,stamp:rate.when};
 return null;
}

/* Private, user-entered Korean-won dividend/distribution ledger.
 * The public price feed never claims to know actual after-tax Korean receipts. */
const LEDGER_KEY='isa-us-distributions-krw-v1';
let ledgerSelected='cony';
function ledgerEntries(){
 const raw=storage(LEDGER_KEY);
 if(!Array.isArray(raw))return [];
 return raw.filter(r=>r&&ITEMS.includes(String(r.id||'').toUpperCase())&&
  /^\d{4}-\d{2}-\d{2}$/.test(String(r.date||''))&&
  Number.isFinite(Number(r.net))&&Number(r.net)>=0&&
  typeof r.key==='string').map(r=>({
   key:r.key,id:String(r.id).toLowerCase(),date:r.date,net:Number(r.net),
   gross:r.gross!==null&&r.gross!==undefined&&Number.isFinite(Number(r.gross))&&Number(r.gross)>=0?Number(r.gross):null,
   tax:r.tax!==null&&r.tax!==undefined&&Number.isFinite(Number(r.tax))&&Number(r.tax)>=0?Number(r.tax):null,
   reinvest:r.reinvest!==null&&r.reinvest!==undefined&&Number.isFinite(Number(r.reinvest))&&Number(r.reinvest)>=0?Number(r.reinvest):null
  })).slice(-500);
}
function distributionStats(id){
 const rows=ledgerEntries().filter(r=>r.id===id).sort((a,b)=>b.date.localeCompare(a.date));
 const sum=key=>rows.reduce((n,r)=>n+(r[key]===null?0:r[key]),0);
 const month={};
 rows.forEach(r=>{const m=r.date.slice(0,7);month[m]=(month[m]||0)+r.net;});
 return {rows,count:rows.length,net:sum('net'),gross:sum('gross'),tax:sum('tax'),reinvest:sum('reinvest'),
  grossCount:rows.filter(r=>r.gross!==null).length,taxCount:rows.filter(r=>r.tax!==null).length,
  reinvestCount:rows.filter(r=>r.reinvest!==null).length,months:Object.entries(month).sort((a,b)=>b[0].localeCompare(a[0]))};
}
// All weekly CONY receipts remain stored as individual rows; only their display is grouped.
function monthlyGroups(stats){
 const map=new Map();
 stats.rows.forEach(row=>{
  const month=row.date.slice(0,7);
  if(!map.has(month))map.set(month,{month,net:0,count:0,rows:[]});
  const g=map.get(month);g.net+=row.net;g.count++;g.rows.push(row);
 });
 return [...map.values()].sort((a,b)=>b.month.localeCompare(a.month));
}
function conyMonthlyView(stats,editable){
 return '<div class="us-dist-months" aria-label="CONY 월별 세후 분배금 합계">'+monthlyGroups(stats).map(g=>
  '<details class="us-dist-month"><summary><span><b>'+clean(g.month)+'</b>'+
    '<small>주별 '+g.count+'건</small></span><strong>'+won(g.net)+'</strong></summary>'+
  '<div class="us-dist-month-weeks">'+g.rows.map(r=>
    '<div class="us-dist-record"><div><b>'+clean(r.date)+'</b> · 세후 '+won(r.net)+
     '<small>'+(r.gross!==null?'세전 '+won(r.gross)+' · ':'')+
     (r.tax!==null?'세금 '+won(r.tax)+' · ':'')+
     (r.reinvest!==null?'재투자 '+won(r.reinvest):'')+'</small></div>'+
    (editable?'<button type="button" class="us-dist-delete" data-ledger-key="'+clean(r.key)+
     '" aria-label="'+clean(r.date)+' 기록 삭제">삭제</button>':'')+'</div>'
  ).join('')+'</div></details>'
 ).join('')+'</div>';
}
function validLedgerDate(v){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return false;
 const d=new Date(v+'T00:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v&&v<=day();
}
function netDividend(id){
 const h=holdings()[id]||{},raw=h.krwNet;
 const manual=raw!==null&&raw!==undefined&&String(raw).trim()!==''&&
  Number.isFinite(Number(raw))&&Number(raw)>=0?Number(raw):null;
 const logged=distributionStats(id);
 if(manual===null){
  return logged.count?{amount:logged.net,source:'날짜별 기록 세후 분배금 합계 (과거 누락 가능)',
   kind:'ledger',recorded:logged.net,discrepancy:null,count:logged.count,added:logged.count}:null;
 }
 // A manually entered cumulative value is an opening balance, NOT a permanent override.
 // Include strictly later dated receipts, never overlapping history a second time.
 let asOf=validLedgerDate(h.krwNetAsOf)?h.krwNetAsOf:null,inferred=false;
 // Older personal portfolio imports can prove the date of an opening balance
 // even when the weekly receipt history is incomplete. Never use a different amount.
 if(!asOf&&id==='cony'){
  const snapshot=storage('isa-user-portfolio-snapshot-v1');
  const datedTotal=snapshot?.conyNote?.total,dated=snapshot?.conyNoteDate;
  if(Number.isFinite(Number(datedTotal))&&Number(datedTotal)===manual&&validLedgerDate(dated)){
   asOf=dated;inferred=true;
  }
 }
 if(!asOf&&manual===0)asOf='2000-01-01';
 if(!asOf&&logged.count){
  // Migration of older browsers: if the historical weekly prefix exactly equals the
  // prior cumulative amount, its latest payment date is a provable opening-balance date.
  const ascending=[...logged.rows].sort((a,b)=>a.date.localeCompare(b.date));
  let cumulative=0;
  for(const row of ascending){
   cumulative+=row.net;
   if(Math.abs(cumulative-manual)<.005){asOf=row.date;inferred=true;}
  }
 }
 if(asOf){
  const additions=logged.rows.filter(row=>row.date>asOf),
   added=additions.reduce((sum,row)=>sum+row.net,0);
  return {amount:manual+added,source:'기존 누적 세후 분배금 + 기준일 이후 실제 지급액',
   kind:added?'cumulative-extended':'cumulative',
   recorded:logged.net,discrepancy:logged.count?manual+added-logged.net:null,
   count:logged.count,asOf,added:added,addedCount:additions.length,inferred};
 }
 // No reliably supported historical boundary: do not silently count receipts twice.
 return {amount:manual,source:'직접 입력 누적 세후 분배금 · 지급액 자동 합산 기준일 확인 필요',
  kind:'cumulative-unlinked',recorded:logged.net,
  discrepancy:logged.count?manual-logged.net:null,count:logged.count,
  unlinked:true,added:0};
}
function positionKrw(id,priceUsd){
 const p=holdings()[id]||{},q=priceKrw(id,priceUsd);
 if(!q||!finitePositive(p.qty)||!finitePositive(p.krwAvg))return null;
 const qty=Number(p.qty),avg=Number(p.krwAvg),value=q.amount*qty,principal=avg*qty,pnl=value-principal;
 const payout=netDividend(id),net=payout?payout.amount:null;
 return {qty,avg,price:q.amount,value,principal,pnl,rate:pnl/principal*100,net,payout,
  inclusive:net!==null?pnl+net:null,inclusiveRate:net!==null?(pnl+net)/principal*100:null,
  postOne:(principal+q.amount)/(qty+1),source:q.source,stamp:q.stamp,manual:q.manual};
}

function primaryPrice(id,priceUsd){
 const q=priceKrw(id,priceUsd);
 const dollar=finitePositive(priceUsd)?usd(priceUsd):'달러 시세 미확인';
 if(q)return '<span class="us-won-main">'+won(q.amount)+'</span>'+
  '<small>'+(q.kind==='finnhub-private'?'Finnhub 최근 체결 × 참고환율':
   q.manual?'토스 당일 직접 입력':'확정 종가 × 참고환율')+' · '+dollar+'</small>';
 return '<span class="us-won-main">원화 미확인</span>'+
  '<small>환율 정보가 없어 환산 보류 · 달러 원본 '+dollar+'</small>';
}
function metricPrice(priceUsd){
 if(!finitePositive(priceUsd))return '<span>미확인</span>';
 const r=fx();
 return r?'<span>'+won(priceUsd*r.rate)+'</span><small class="us-usd-note">'+usd(priceUsd)+' · 동일 참고환율 환산</small>':
 '<span>원화 환산 불가</span><small class="us-usd-note">달러 원본 '+usd(priceUsd)+'</small>';
}
function dividendPrice(amountUsd){
 if(!finitePositive(amountUsd))return '미확인';
 const r=fx();
 return r?won(amountUsd*r.rate,2)+' (참고, '+usd(amountUsd,4)+')':
 usd(amountUsd,4)+' (환율 미확인)';
}
function cardLine(id,priceUsd){
 const p=positionKrw(id,priceUsd),h=holdings()[id]||{};
 const qty=xnum(h.qty),snapshot=h.krwSnapshotDate,
  held=qty!==null&&Number.isFinite(qty)&&qty>=0;
 let line='<span class="us-small">실제 보유: <b>'+(held?qty.toLocaleString('ko-KR',{maximumFractionDigits:6})+'주':'미등록')+
  '</b> · 원화 평단 <b>'+(finitePositive(h.krwAvg)?won(h.krwAvg):'미입력')+'</b></span>';
 if(held&&finitePositive(h.krwAvg)&&/^\d{4}-\d{2}-\d{2}$/.test(String(snapshot||'')))
  line+='<span class="us-small">보유정보 기준: '+clean(snapshot)+'</span>';
 if(p)line+='<span class="us-small '+(p.pnl>=0?'us-positive':'us-negative')+'">'+
  '평가손익 '+signed(p.pnl)+' ('+signedPercent(p.rate)+')'+
  (p.inclusive!==null?' · 세후 분배금 포함 '+signed(p.inclusive):' · 누적 세후 분배금 미입력')+'</span>';
 else if(held)line+='<span class="us-small">원화 평가손익 계산용 가격 확인 필요</span>';
 return line;
}
function compactLine(id,priceUsd){
 const info=holdings()[id]||{},qty=xnum(info.qty),avg=xnum(info.krwAvg),p=positionKrw(id,priceUsd);
 const parts=[];
 if(qty!==null&&Number.isFinite(qty)&&qty>=0)parts.push('보유 '+qty.toLocaleString('ko-KR',{maximumFractionDigits:6})+'주');
 else parts.push('보유 미입력');
 if(finitePositive(avg))parts.push('평단 '+won(avg));
 else parts.push('평단 미입력');
 if(p)parts.push('평가손익 '+signed(p.pnl)+' ('+signedPercent(p.rate)+')');
 else parts.push('손익 미확인');
 return parts.join(' · ');
}
function totalKrw(){
 const app=window.ISA_US_APP;
 if(!app)return {count:0,principal:0,value:0,pnl:0,knownNet:0,missing:0,provisional:0,inclusive:null};
 let count=0,principal=0,value=0,pnl=0,knownNet=0,missing=0,provisional=0;
 for(const symbol of ITEMS){
  const id=symbol.toLowerCase(),current=app.getPrice?.(id),p=positionKrw(id,current);
  if(!p)continue;
  count++;principal+=p.principal;value+=p.value;pnl+=p.pnl;
  if(p.net===null)missing++;else {knownNet+=p.net;if(p.payout?.kind==='ledger'||p.payout?.unlinked)provisional++;}
 }
 return {count,principal,value,pnl,rate:principal>0?pnl/principal*100:null,
  knownNet,missing,provisional,inclusive:missing===0&&count>0?pnl+knownNet:null,
  inclusiveRate:missing===0&&count>0&&principal>0?(pnl+knownNet)/principal*100:null};
}
const signed=v=>(v>=0?'+':'')+won(v);
const signedPercent=v=>(v>=0?'+':'')+v.toFixed(2)+'%';
function distributionDetail(id){
 const stats=distributionStats(id),net=netDividend(id);
 let html='<div class="us-dist-detail"><b>원화 분배금·배당금 상세</b>';
 if(net){
  html+='<p>손익에 반영하는 누적 세후 분배금 <strong>'+won(net.amount)+'</strong>'+
   ' <span class="us-small">('+clean(net.source)+')</span></p>';
  if(net.kind!=='ledger'&&stats.count){
   html+='<p class="us-small">기존 직접 입력 누적금 '+won(holdings()[id].krwNet)+
     (net.asOf?' · 포함 지급일 '+clean(net.asOf):' · 포함 지급일 미확인')+
     (net.addedCount?' · 이후 '+net.addedCount+'회 추가 '+won(net.added):'')+'</p>'+
     '<p class="us-small">주별 입력 기록 '+won(stats.net)+'은 기존 누적금액과 겹칠 수 있어, 포함 지급일 이후 내역만 더합니다.</p>';
  }else if(net.kind==='ledger')html+='<p class="us-small">날짜별 지급 기록만 합산했습니다. 과거 기록이 누락됐다면 실제 총수령액보다 적을 수 있습니다.</p>';
 }else html+='<p class="us-small">입력된 세후 분배금이 없어 분배금 포함 총손익을 확정 계산하지 않습니다.</p>';
 if(stats.count){
  const moneyPart=(label,amount,count)=>count===stats.count?'<p>'+label+' 합계 '+won(amount)+'</p>':
   '<p class="us-small">'+label+' 일부 입력 '+count+'/'+stats.count+'건 · 입력된 금액 합계 '+won(amount)+' (미입력액 제외)</p>';
  html+='<p class="us-small">현재 브라우저 최근 저장 지급일: '+clean(stats.rows[0].date)+' · 브라우저를 바꾸면 지급기록이 자동으로 공유되지 않습니다.</p>';
  html+='<p>입력된 지급 횟수 '+stats.count+'건 · 세후 실수령 기록 합계 '+won(stats.net)+'</p>'+
   moneyPart('세전 지급금',stats.gross,stats.grossCount)+moneyPart('원천징수·세금',stats.tax,stats.taxCount)+
   moneyPart('재투자한 지급금',stats.reinvest,stats.reinvestCount);
  if(id==='cony'){
   html+='<p class="us-small">월별 세후 지급금만 표시합니다. 해당 월을 누르면 주별 입금 내역을 볼 수 있습니다.</p>'+
    conyMonthlyView(stats,false);
  }else{
   html+='<p class="us-small">월별 실제 입력 기록: '+stats.months.slice(0,4).map(([month,total])=>clean(month)+' '+won(total)).join(' · ')+'</p>';
   html+='<div class="us-dist-recent">'+stats.rows.slice(0,6).map(r=>
    '<div class="us-dist-row"><span>'+clean(r.date)+'</span><span>세후 '+won(r.net)+
    '<small>'+(r.gross!==null?'세전 '+won(r.gross)+' · ':'')+(r.tax!==null?'세금 '+won(r.tax)+' · ':'')+
    (r.reinvest!==null?'재투자 '+won(r.reinvest):'')+'</small></span></div>').join('')+'</div>';
  }
 }
 return html+'</div>';
}
function detailLine(id,priceUsd){
 const q=priceKrw(id,priceUsd),p=positionKrw(id,priceUsd),dist=distributionDetail(id);
 const header='<div class="us-ledger"><b>원화 기준 평가손익 상세</b>';
 if(!q)return header+'<p class="us-small">토스 현재가 또는 USD 종가×참고환율이 없어 원화 평가손익을 계산하지 않습니다.</p></div>'+dist;
 let html=header+'<p>원화 현재가격 <b>'+won(q.amount,2)+'</b> · '+clean(q.source)+'</p>';
 if(!p)return html+'<p class="us-small">보유수량과 토스 원화 평단을 입력하면 원화 투자원금과 평가손익을 계산합니다.</p></div>'+dist;
 html+='<div class="us-fin-grid">'+
  '<div>현재 보유수량<strong>'+p.qty.toLocaleString('ko-KR',{maximumFractionDigits:6})+'주</strong></div>'+
  '<div>원화 평균매수가<strong>'+won(p.avg)+'</strong></div>'+
  '<div>매수 누적원가<strong>'+won(p.principal)+'</strong></div>'+
  '<div>현재 평가금액<strong>'+won(p.value)+'</strong></div>'+
  '<div>평가손익<strong class="'+(p.pnl>=0?'us-positive':'us-negative')+'">'+signed(p.pnl)+'</strong><small>'+signedPercent(p.rate)+'</small></div>'+
  '<div>'+(p.payout?.kind==='ledger'?'기록분 포함 잠정 총손익':'분배금 포함 총손익')+'<strong>'+(p.inclusive===null?'미확인':signed(p.inclusive))+'</strong>'+
  (p.inclusiveRate===null?'':'<small>'+signedPercent(p.inclusiveRate)+'</small>')+'</div></div>';
 html+='<p>현재 표시가격으로 1주 추가 시 예상 원화 평단 <b>'+won(p.postOne,2)+'</b> ('+
  (p.postOne<p.avg?'평단 인하 가능':'평단 인하 효과 없음')+')</p>';
 html+='<p class="us-small">평가손익 = 평가금액 − 매수 누적원가 / 분배금 포함 총손익 = 평가손익 + 누적 세후 지급금. 재투자 분배금은 누적 지급금에서 빼지 않으며, 재투자로 매수한 주식의 수량·매입원가는 이미 보유정보에 반영해야 합니다. 동일 지급금을 두 번 합산하지 않습니다.</p>'+
 '<p class="us-small">매수 누적원가는 현재 보유수량×평단가로 추정한 금액이며 계좌 외부에서 납입한 순원금과 다를 수 있습니다. 환율·시세 시점·수수료로 인해 토스 실제 손익과 오차가 발생할 수 있습니다.</p></div>';
 return html+dist;
}

// Keep the old cumulative number as the opening balance on a NEW dated payout.
// Use the previous recorded payment date (or the prior calendar day if none).
// Never retroactively assign a cutoff to historical bulk imports.
function dayBefore(iso){
 const d=new Date(iso+'T00:00:00Z');
 d.setUTCDate(d.getUTCDate()-1);
 return d.toISOString().slice(0,10);
}
function autoAnchorNewReceipt(id,receiptDate,priorEntries){
 const before=netDividend(id);
 if(!before?.unlinked)return null;
 const existing=priorEntries.filter(x=>x.id===id);
 if(existing.some(x=>x.date>=receiptDate))return null;
 const cutoff=existing.length?
  [...existing].sort((a,b)=>b.date.localeCompare(a.date))[0].date:
  dayBefore(receiptDate);
 const snapshot=holdings(),p=snapshot[id];
 if(!p||!Number.isFinite(Number(p.krwNet)))return null;
 return {cutoff,next:{...snapshot,[id]:{...p,krwNetAsOf:cutoff}}};
}
function payoutStorageDiagnostic(id){
 const raw=storage(LEDGER_KEY),recognized=ledgerEntries(),
  rows=recognized.filter(row=>row.id===id).sort((a,b)=>b.date.localeCompare(a.date)),
  today=day(),todayRows=rows.filter(row=>row.date===today),
  current=netDividend(id),hold=holdings()[id]||{},
  newest=rows[0]||null;
 return {id:id.toUpperCase(),today,version:PAYOUT_BUILD_VERSION,
  records:rows.length,unrecognized:Array.isArray(raw)?raw.length-recognized.length:
   raw===null?0:-1,
  todayCount:todayRows.length,todayNet:todayRows.reduce((total,row)=>total+row.net,0),
  latestDate:newest?.date||null,latestNet:newest?.net??null,
  savedTotal:rows.reduce((sum,row)=>sum+row.net,0),
  oldCumulative:hold.krwNet??null,
  oldCutoff:current?.asOf||null,
  calculated:current?.amount??null,
  status:current?.unlinked?'기존 누적액 기준 지급일 미확인':current?.kind==='ledger'?'지급기록 합계 (과거 누락 가능)':
   current?'기존 누적액과 날짜별 기록 연결됨':'입력 기록 없음',
  storageType:Array.isArray(raw)?'records':raw===null?'empty':'invalid'};
}
function payoutDiagnosticText(id){
 const r=payoutStorageDiagnostic(id);
 return [r.id+' 지급금 화면 진단 / 프로그램 '+r.version,
  '이 브라우저 확인일: '+r.today,
  '저장소: '+r.storageType+' / 인식된 지급기록 '+r.records+'건'+
   (r.unrecognized?' / 형식 확인 필요 '+r.unrecognized+'건':''),
  '오늘 저장: '+r.todayCount+'건 / 세후 '+won(r.todayNet),
  '마지막 기록: '+(r.latestDate||'없음')+' / '+(r.latestNet===null?'없음':won(r.latestNet)),
  '지급기록 합계: '+won(r.savedTotal),
  '기존 직접입력 누적액: '+(r.oldCumulative===null?'없음':won(r.oldCumulative)),
  '마지막 포함 지급일: '+(r.oldCutoff||'미확인'),
  '손익 및 상단 계산 금액: '+(r.calculated===null?'미확인':won(r.calculated)),
  '현재 상태: '+r.status,
  '개인 분배금 데이터는 이 브라우저에만 저장됩니다. 다른 브라우저와 자동 공유하지 않습니다.'].join('\n');
}
function renderLedger(){
 const area=$('us-distribution-ledger'),select=$('us-distribution-ticker');if(!area||!select)return;
 const id=select.value||ledgerSelected;
 const stats=distributionStats(id),net=netDividend(id);
 const diag=payoutStorageDiagnostic(id),latestLine=diag.latestDate?
  '마지막 '+clean(diag.latestDate)+' '+won(diag.latestNet):
  '이 브라우저에는 지급기록 없음';
 let html='<p><b>'+clean(id.toUpperCase())+(id==='cony'?' · 월별 세후 분배금':' · 날짜별 세후 분배금 내역')+'</b></p>'+
  '<p class="us-small" role="status"><b>현재 브라우저 저장 확인:</b> 오늘 '+(diag.todayCount?
   won(diag.todayNet)+' · '+diag.todayCount+'건 저장됨':'지급기록 없음')+
   ' · '+latestLine+' · 손익 반영 '+(diag.calculated===null?'미확인':won(diag.calculated))+
   (diag.unrecognized?' · 읽지 못한 기록 '+diag.unrecognized+'건':'')+
   (diag.status?' · '+clean(diag.status):'')+'</p>'+
  '<p class="us-small">지급 내역은 브라우저별로 별도 저장됩니다. 화면 버전 '+clean(diag.version)+
  ' · <button type="button" class="us-header-button outline" data-payout-diagnose="true">저장 상태 복사</button></p>';
 if(!stats.count){
  html+='<p class="us-small">아직 입력된 지급내역이 없습니다. 실제 토스 입금내역의 원화 세후 금액을 등록해 주세요.</p>';
 }else{
  html+='<div class="us-dist-figures"><div>기록된 세후 지급금<strong>'+won(stats.net)+'</strong></div>'+
  '<div>입력된 지급횟수<strong>'+stats.count+'회</strong></div>'+
  '<div>원화 재투자 기록<strong>'+(stats.reinvestCount===stats.count?won(stats.reinvest):'일부만 입력')+'</strong></div></div>';
  if(id==='cony')html+='<p class="us-small">매주 입력한 지급금을 월별로 합산합니다. 월을 누르면 날짜별 기록과 삭제 버튼을 확인할 수 있습니다.</p>';
  else html+='<p class="us-small">월별 입력 내역: '+stats.months.slice(0,6).map(([m,v])=>clean(m)+' '+won(v)).join(' · ')+'</p>';
  if(net&&net.kind!=='ledger'){
   html+='<p class="us-small">손익 반영 누적 세후 지급금 <b>'+won(net.amount)+'</b>'+
    ' · 지급일 기록 합계 '+won(stats.net)+
    (net.asOf?' · 누적 기준 지급일 '+clean(net.asOf)+' · 이후 '+(net.addedCount||0)+'회 '+won(net.added):'')+'</p>';
   if(net.unlinked){
    const latest=stats.rows[0],earlier=stats.rows.filter(x=>x.date<latest.date),
     cutoff=earlier.length?earlier[0].date:dayBefore(latest.date);
    html+='<p class="us-small" role="status">기존 누적액의 마지막 포함 지급일이 확인되지 않아 최근 지급분이 총분배금에 아직 반영되지 않았습니다. 이미 저장된 지급기록은 유지됩니다.</p>'+
     '<p class="us-small">기존 누적액에 '+clean(cutoff)+' 지급분까지 포함돼 있고, '+clean(latest.date)+
     ' 지급분은 포함되지 않았다면 아래 버튼으로 연결할 수 있습니다. 이후 입금액은 자동 계산됩니다.</p>'+
     '<button type="button" class="us-header-button" data-us-payout-link="'+clean(id)+
     '" data-us-payout-cutoff="'+clean(cutoff)+'">기존 누적액과 새 분배금 연결</button>';
   }
  }
  if(id==='cony')html+=conyMonthlyView(stats,true);
  else html+='<div class="us-dist-records">'+stats.rows.map(r=>
   '<div class="us-dist-record"><div><b>'+clean(r.date)+'</b> · 세후 '+won(r.net)+
    '<small>'+(r.gross!==null?'세전 '+won(r.gross)+' · ':'')+
    (r.tax!==null?'세금 '+won(r.tax)+' · ':'')+
    (r.reinvest!==null?'재투자 '+won(r.reinvest):'재투자액 미입력')+'</small></div>'+
   '<button type="button" class="us-dist-delete" data-ledger-key="'+clean(r.key)+'" aria-label="'+clean(r.date)+' 기록 삭제">삭제</button></div>'
  ).join('')+'</div>';
 }
 area.innerHTML=html;
 const diagnose=area.querySelector('button[data-payout-diagnose]');
 if(diagnose)diagnose.addEventListener('click',async()=>{
  const report=payoutDiagnosticText(id),message=$('us-dist-message');
  try{
   if(!navigator.clipboard?.writeText)throw Error('no clipboard');
   await navigator.clipboard.writeText(report);
   if(message)message.textContent='저장 상태 진단을 복사했습니다. 내용에 비밀번호나 계좌번호는 없습니다.';
  }catch(_){
   if(message)message.textContent='복사 권한이 없어 진단내용을 아래에 표시했습니다.';
   const output=area.querySelector('[data-payout-diagnostic-text]');
   if(output)output.textContent=report;
   else{
    const p=document.createElement('pre');
    p.dataset.payoutDiagnosticText='true';p.style.whiteSpace='pre-wrap';
    p.style.overflowWrap='anywhere';p.textContent=report;area.appendChild(p);
   }
  }
 });
 area.querySelectorAll('button[data-us-payout-link]').forEach(btn=>btn.addEventListener('click',()=>{
  const id=btn.getAttribute('data-us-payout-link'),cutoff=btn.getAttribute('data-us-payout-cutoff');
  const previous=netDividend(id);
  if(!previous?.unlinked||!validLedgerDate(cutoff))return;
  const newRows=distributionStats(id).rows.filter(row=>row.date>cutoff);
  const increment=newRows.reduce((sum,row)=>sum+row.net,0);
  if(!newRows.length)return;
  if(typeof window.confirm==='function'&&!window.confirm(
   id.toUpperCase()+' 누적금액 '+won(previous.amount)+'에는 '+cutoff+
   ' 지급분까지 포함되고, 이후 '+newRows.length+'건 '+won(increment)+
   '은 포함되지 않았습니까? 확인하면 새 입금분만 추가해 모든 합계를 다시 계산합니다.'))return;
  const all=holdings();
  if(!write('isa-us-holdings-v1',{...all,[id]:{...(all[id]||{}),krwNetAsOf:cutoff}})){
   const msg=$('us-dist-message');if(msg)msg.textContent='기준일 저장 실패 · 기록은 변경하지 않았습니다.';return;
  }
  if($('holdings-settings')?.open)renderForm();
  const msg=$('us-dist-message');
  if(msg)msg.textContent=id.toUpperCase()+' 누적액 연결 완료 · 총 세후 분배금 '+won(netDividend(id)?.amount??previous.amount);
  render();
 }));
 area.querySelectorAll('button[data-ledger-key]').forEach(btn=>btn.addEventListener('click',()=>{
  const key=btn.getAttribute('data-ledger-key');
  if(typeof window.confirm==='function'&&!window.confirm('선택한 세후 분배금 지급 기록을 삭제할까요?'))return;
  const old=ledgerEntries(),next=old.filter(r=>r.key!==key);
  if(next.length===old.length)return;
  if(!write(LEDGER_KEY,next)){$('us-dist-message').textContent='기기 저장소에 접근할 수 없어 삭제하지 못했습니다.';return;}
  $('us-dist-message').textContent='해당 지급 기록을 삭제했습니다.';
  render();
 }));
}
function addDistribution(){
 const id=$('us-distribution-ticker')?.value,date=$('us-distribution-date')?.value;
 const readField=(key,required)=>{
  const el=$(key),raw=el?.value.trim()||'';
  if(!raw)return required?NaN:null;
  const value=Number(raw.replace(/,/g,''));
  return Number.isFinite(value)&&value>=0?value:NaN;
 };
 const net=readField('us-dist-net',true),gross=readField('us-dist-gross',false),
  tax=readField('us-dist-tax',false),reinvest=readField('us-dist-reinvest',false);
 const message=$('us-dist-message');
 if(!ITEMS.includes(String(id||'').toUpperCase())||!date||!/^20\d{2}-\d{2}-\d{2}$/.test(date)||
  date>day()||![net,gross,tax,reinvest].every(v=>v===null||(Number.isFinite(v)&&v>=0))){
  message.textContent='종목, 실제 지급일, 세후 실수령액(0원 이상)을 확인해 주세요. 미래 지급일이나 잘못된 금액은 등록할 수 없습니다.';return;
 }
 if(gross!==null&&tax!==null&&(tax>gross||Math.abs(gross-tax-net)>2)){
  message.textContent='세전 지급금 − 세금이 세후 지급액과 일치하지 않습니다. 토스 입금내역을 확인해 주세요.';return;
 }
 if(reinvest!==null&&reinvest>net){
  message.textContent='재투자한 지급금은 해당 지급일의 세후 실수령액 이하로 입력해 주세요.';return;
 }
 const entries=ledgerEntries();
 const rawEntries=storage(LEDGER_KEY);
 if(rawEntries!==null&&(!Array.isArray(rawEntries)||rawEntries.length!==entries.length)){
  message.textContent='현재 저장된 기록 중 확인이 필요한 항목이 있습니다. 기존 내역 보존을 위해 추가 저장을 중단했습니다.';return;
 }
 const sameDate=entries.filter(r=>r.id===id&&r.date===date);
 if(sameDate.length){message.textContent=sameDate.length===1&&Math.abs(sameDate[0].net-net)<.005?
  '해당 종목·지급일·세후 금액은 이미 저장되어 있습니다. 중복 저장하지 않았습니다.':
  '해당 종목·지급일에 다른 기록이 있습니다. 기존 금액을 덮어쓰거나 중복 저장하지 않았습니다.';return;}
 if(entries.length>=500){message.textContent='기록 500건 한도에 도달했습니다. 오래된 기록을 정리해 주세요.';return;}
 const anchor=autoAnchorNewReceipt(id,date,entries);
 const originalHold=anchor?localStorage.getItem('isa-us-holdings-v1'):null;
 const originalLedger=localStorage.getItem(LEDGER_KEY);
 if(anchor&&!write('isa-us-holdings-v1',anchor.next)){
  message.textContent='기존 누적금액 기준일 저장 실패 · 분배금 지급내역은 변경하지 않았습니다.';return;
 }
 const unique='d'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 entries.push({key:unique,id,date,net,gross,tax,reinvest});
 const saved=write(LEDGER_KEY,entries)&&
  ledgerEntries().some(r=>r.key===unique&&r.id===id&&r.date===date&&Math.abs(r.net-net)<.005);
 if(!saved){
  try{
   if(originalLedger===null)localStorage.removeItem(LEDGER_KEY);
   else localStorage.setItem(LEDGER_KEY,originalLedger);
   if(anchor){
    if(originalHold===null)localStorage.removeItem('isa-us-holdings-v1');
    else localStorage.setItem('isa-us-holdings-v1',originalHold);
   }
  }catch(_){}
  message.textContent='지급금 저장 검증 실패 · 기존 기록 복원을 시도했습니다. 입력내역을 확인해 주세요.';return;
 }
 if(anchor&&$('holdings-settings')?.open)renderForm();
 ['us-dist-net','us-dist-gross','us-dist-tax','us-dist-reinvest'].forEach(k=>{const el=$(k);if(el)el.value='';});
 const payout=netDividend(id);
 message.textContent=clean(id.toUpperCase())+' '+date+' 세후 '+won(net)+' 저장 · 누적 세후 지급금 '+
  (payout?won(payout.amount):'미확인')+
  (payout?.unlinked?' · 기존 누적 기준 지급일 입력 후 카드와 전체 합계에 반영됩니다.':' · 카드·상단 총분배금·분배금 포함 손익 갱신');
 render();
}
// Restore user-owned dated receipts without putting private investment data in the public repo.
function importDatedReceipts(){
 const area=$('us-dist-bulk-input'),message=$('us-dist-bulk-message');
 const id=$('us-distribution-ticker')?.value;
 if(!area||!message||!ITEMS.includes(String(id||'').toUpperCase()))return;
 const lines=area.value.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!lines.length||lines.length>500){message.textContent='지급일과 세후 원화금액을 1~500줄 입력해 주세요.';return;}
 const input=[],dates=new Set();
 for(const line of lines){
  const match=/^([0-9]{4}-[0-9]{2}-[0-9]{2})[\s,;|]+([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/.exec(line);
  if(!match){message.textContent='형식 확인: 2026-10-01 5000처럼 지급일과 세후 원화금액을 입력해 주세요.';return;}
  const date=match[1],net=Number(match[2].replace(/,/g,'')),parsed=new Date(date+'T00:00:00Z');
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||
   date>day()||date<'2000-01-01'||!Number.isFinite(net)||net<=0||net>100000000||dates.has(date)){
   message.textContent=clean(date)+'의 날짜·금액 또는 중복 입력을 확인해 주세요.';return;
  }
  dates.add(date);input.push({date,net});
 }
 const old=ledgerEntries(),rawOld=storage(LEDGER_KEY);
 if(rawOld!==null&&(!Array.isArray(rawOld)||rawOld.length!==old.length)){
  message.textContent='기존 기록에 형식이 다른 항목이 있어 자동 복원을 중단했습니다. 기록을 삭제하거나 덮어쓰지 않았습니다.';return;
 }
 const same=old.filter(v=>v.id===id),insert=[],duplicates=[];
 for(const row of input){
  const matched=same.filter(v=>v.date===row.date);
  if(matched.length>1){message.textContent=row.date+' 기존 내역이 여러 건이라 자동 병합하지 않았습니다.';return;}
  if(matched.length){
   if(Math.abs(matched[0].net-row.net)>.005){
    message.textContent=row.date+' 기존 '+won(matched[0].net)+' · 입력 '+won(row.net)+
     '으로 불일치합니다. 기존 데이터를 덮어쓰지 않았습니다.';return;
   }
   duplicates.push(row);continue;
  }
  insert.push({key:'excel-'+id+'-'+row.date,id,date:row.date,net:row.net,gross:null,tax:null,reinvest:null});
 }
 if(old.length+insert.length>500){message.textContent='기존 기록을 포함해 500건 한도를 초과합니다.';return;}
 if(!insert.length){message.textContent='같은 날짜·금액 '+duplicates.length+'건이 이미 저장되어 있습니다. 중복 저장하지 않았습니다.';return;}
 if(typeof window.confirm==='function'&&!window.confirm(
  id.toUpperCase()+' 과거 지급기록 '+insert.length+'건을 현재 브라우저에 추가할까요? 동일 날짜 '+duplicates.length+
  '건과 별도 누적 세후 금액은 변경하지 않습니다.'))return;
 if(!write(LEDGER_KEY,old.concat(insert))){message.textContent='브라우저 저장에 실패했습니다.';return;}
 const persisted=ledgerEntries(),ok=insert.every(row=>persisted.some(v=>v.key===row.key&&v.date===row.date&&Math.abs(v.net-row.net)<.005));
 if(!ok){message.textContent='저장 직후 확인에 실패했습니다. 브라우저 저장 권한을 확인해 주세요.';return;}
 message.textContent='복원 '+insert.length+'건 · 중복 제외 '+duplicates.length+'건. 누적 세후 분배금은 변경하지 않았습니다.';
 render();
}
function renderForm(){
 const area=$('us-krw-editor');if(!area)return;
 const h=holdings();
 area.innerHTML=ITEMS.map(ticker=>{
  const id=ticker.toLowerCase(),p=h[id]||{};
  const fmt=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x))?String(x):'';
  return '<div class="us-krw-form-row"><strong>'+ticker+'</strong>'+
   '<label>보유수량 (주 · 소수점 가능)<input data-krw-id="'+id+'" data-k="qty" type="number" min="0" step="0.000001" placeholder="보유수량" value="'+fmt(p.qty)+'"></label>'+
   '<label>원화 평단가 (원)<input data-krw-id="'+id+'" data-k="krwAvg" type="number" min="0" step="0.01" placeholder="토스 평균매수가" value="'+fmt(p.krwAvg)+'"></label>'+
   '<details class="us-krw-optional"><summary>선택: 당일 현재가 보정 · 누적 세후 분배금</summary>'+
   '<div class="us-krw-optional-fields">'+
   '<label>토스 원화 현재가 직접 보정 (원 · 오늘만)<input data-krw-id="'+id+'" data-k="krwCurrent" type="number" min="0" step="0.01" placeholder="기본은 자동 시세" value="'+(p.krwDay===day()?fmt(p.krwCurrent):'')+'"></label>'+
   '<label>기존 누적 세후 분배금 (원)<input data-krw-id="'+id+'" data-k="krwNet" type="number" min="0" step="0.01" placeholder="기준일까지 누적액" value="'+fmt(p.krwNet)+'"></label>'+
   '<label>누적금액 기준 지급일 (마지막 포함 지급일)<input data-krw-id="'+id+'" data-k="krwNetAsOf" type="date" value="'+(validLedgerDate(p.krwNetAsOf)?p.krwNetAsOf:'')+'"></label>'+
   '<p class="us-small">기존 누적액에 포함된 마지막 지급일을 입력하면 이후 주별 입금액만 자동 추가합니다.</p>'+
   '</div></details></div>';
 }).join('');
 area.querySelectorAll('input[data-krw-id]').forEach(input=>input.addEventListener('change',()=>{
  const id=input.dataset.krwId,k=input.dataset.k;
  const h=holdings(),p={...(h[id]||{})},raw=input.value.trim(),
   isDate=k==='krwNetAsOf',value=raw===''?null:isDate?raw:Number(raw);
  const invalid=isDate?(value!==null&&!validLedgerDate(value)):
   value!==null&&(!Number.isFinite(value)||value<0||
    (k==='krwAvg'&&value===0)||(k==='krwCurrent'&&value===0)||
    (k==='qty'&&Math.abs(value-Math.round(value*1000000)/1000000)>1e-10));
  const topMsg=$('us-holding-message');
  if(invalid){
   input.value=p[k]===null||p[k]===undefined?'':String(p[k]);
   if(topMsg)topMsg.textContent='보유수량(0 이상 · 소수점 6자리까지) 또는 원화 평단가(0보다 큼)를 확인해 주세요.';
   return;
  }
  if(value===null)delete p[k];
  else p[k]=value;
  if(k==='krwCurrent')p.krwDay=finitePositive(p.krwCurrent)?day():'';
  if(k==='qty'||k==='krwAvg')p.krwSnapshotDate=day();
  if(k==='krwNet'){
   if(value===null)delete p.krwNetAsOf;
   else{
    // Re-entering a cumulative total generally means it already includes receipts
    // up to today. Reset its cutoff so previously entered weekly payouts aren't added twice.
    // Users can set a historical "last included payment" date immediately afterward.
    p.krwNetAsOf=day();
    const inputDate=area.querySelector('input[data-krw-id="'+id+'"][data-k="krwNetAsOf"]');
    if(inputDate)inputDate.value=p.krwNetAsOf;
   }
  }
  h[id]=p;
  if(!write('isa-us-holdings-v1',h)){
   if(topMsg)topMsg.textContent='브라우저 저장에 실패했습니다. 저장공간과 브라우저 설정을 확인해 주세요.';
   return;
  }
  if((k==='qty'||k==='krwAvg')&&typeof window!=='undefined')window.ISA_PORTFOLIO_TOTALS?.markAuto?.('toss');
  const payout=netDividend(id);
  const message=id.toUpperCase()+' 저장 · 누적 세후 분배금 '+(payout?won(payout.amount):'미확인')+
   (payout?.unlinked?' · 기존 누적 기준 지급일 확인 필요':' · 종목 카드·상단 분배금·총손익 갱신');
  if(topMsg)topMsg.textContent=message;
  render();
 }));
}
/* Personal portfolio snapshots are accepted only via a fragment on the user's
 * own link. Fragment data is not part of an HTTP request to GitHub Pages;
 * remove it from the address bar after one use. Never put private holdings
 * into the public application source, defaults or remote JSON. */
function applyPersonalLink(){
 const hash=String(window.location?.hash||'');
 if(!hash.startsWith('#us-holdings='))return;
 const info=$('us-krw-applied'),notice=$('us-holding-message');
 try{
  const value=decodeURIComponent(hash.slice('#us-holdings='.length));
  if(!value)throw Error('보유정보 없음');
  const cells=value.split(';'),asOf=cells.shift();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||cells.length!==4||asOf>day())
   throw Error('기준일 또는 종목 수 확인 불가');
  const seen=new Set(),updates={};
  for(const cell of cells){
   const a=cell.split(',');
   if(a.length!==3&&a.length!==4)throw Error('자료 형식 확인 필요');
   const id=String(a[0]).toLowerCase(),qty=Number(a[1]),avg=Number(a[2]),
    net=a.length===4&&a[3]!==''?Number(a[3]):null;
   if(!ITEMS.includes(id.toUpperCase())||seen.has(id)||
      !Number.isFinite(qty)||qty<0||qty>10000000||
      !Number.isFinite(avg)||avg<=0||avg>1000000000||
      (net!==null&&(!Number.isFinite(net)||net<0||net>1000000000)))
      throw Error('종목·수량·원화 평단·세후 분배금 검증 실패');
   seen.add(id);updates[id]={qty,krwAvg:avg,krwNet:net};
  }
  const all=holdings();
  let applied=0,kept=0,dividendUpdated=0;
  for(const [id,values] of Object.entries(updates)){
   const old=all[id]||{};
   // Never replace holdings with a snapshot older than an explicitly edited one.
   const stamped=/^\d{4}-\d{2}-\d{2}$/.test(String(old.krwSnapshotDate||''));
   const older=stamped&&old.krwSnapshotDate>asOf;
   const unknownManual=!stamped&&finitePositive(old.qty)&&finitePositive(old.krwAvg);
   const p={...old};
   if(older||unknownManual)kept++;
   else {p.qty=values.qty;p.krwAvg=values.krwAvg;p.krwSnapshotDate=asOf;applied++;}
   // Cumulative receipts can only rise; preserve a newer amount already entered.
   if(values.krwNet!==null){
    const previous=old.krwNet!==undefined&&old.krwNet!==null&&String(old.krwNet).trim()!==''&&Number.isFinite(Number(old.krwNet))&&Number(old.krwNet)>=0?Number(old.krwNet):null;
    if(previous===null||values.krwNet>previous){
     p.krwNet=values.krwNet;dividendUpdated++;
    }
   }
   // Stale old prices must not be used as if they were today's current prices.
   if(p.krwDay!==day()){delete p.krwCurrent;delete p.krwDay;}
   all[id]=p;
  }
  if(!write('isa-us-holdings-v1',all))throw Error('기기 저장소 접근 실패');
  window.ISA_US_APP?.applyFromLocal?.();
  renderForm();
  const msg=asOf+' 토스 보유정보: '+applied+'종목 적용'+(kept?' · 기존 최신/수동 입력 '+kept+'종목 유지':'')+
    (dividendUpdated?' · 누적 세후 분배금 '+dividendUpdated+'종목 반영':'')+
    '. 기존 정보가 없었던 기기에 저장했습니다. 최신 추가매수 내역이 있다면 직접 갱신하세요.';
  if(info)info.textContent=msg;
  if(notice)notice.textContent=msg;
  if($('holdings-settings'))$('holdings-settings').open=true;
 }catch(e){
  const msg='보유정보 자동 적용 실패: '+String(e.message||e)+'. 입력 항목에서 직접 등록할 수 있습니다.';
  if(info)info.textContent=msg;
  if(notice)notice.textContent=msg;
 }finally{
  try{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}catch(_){}
 }
}
function showRate(){
 const r=fx(),area=$('us-krw-rate-status');if(!area)return;
 area.textContent=r?'자동 참고환율: 1 USD = '+won(r.rate,2)+' · '+r.source+' ('+r.when+')':'자동 참고환율 확인 실패 · 토스 원화 현재가를 직접 보정하면 해당 종목의 원화 평가액을 표시할 수 있습니다.';
}
function render(){
 showRate();
 renderLedger();
 window.ISA_US_SIGNAL?.refreshSummary?.();
 window.ISA_US_APP?.rerender?.();
 window.dispatchEvent(new Event('isa-us-valuation-refreshed'));
}
function mount(){
 const root=$('us-panel');if(!root)return;
 const head=$('us-updated');
 const holder=document.createElement('div');
 holder.id='us-krw-panel';holder.className='us-krw-panel';
 holder.innerHTML='<div id="us-krw-rate-status" class="us-small">자동 참고환율 확인 중…</div>'+
 '<p id="us-krw-applied" class="us-small" aria-live="polite"></p>'+
 '<details id="us-distribution-details"><summary>세후 배당·분배금 원화 지급내역 상세 등록</summary>'+
 '<p class="us-small">실제 토스 입금내역의 날짜와 원화 금액을 입력하세요. 세전 지급금·세금·재투자액은 선택사항입니다. 과거 지급내역이 누락되어 있다면 별도의 누적 실수령액을 우선 사용하며 두 값을 합산하지 않습니다.</p>'+
 '<div class="us-dist-form">'+
 '<label>종목<select id="us-distribution-ticker"><option value="schd">SCHD</option><option value="agnc">AGNC</option><option value="spym">SPYM</option><option value="cony" selected>CONY</option></select></label>'+
 '<label>실제 지급일<input type="date" id="us-distribution-date"></label>'+
 '<label>세후 실수령액 (원, 필수)<input type="number" min="0" step="0.01" id="us-dist-net" placeholder="토스 입금 원화"></label>'+
 '<label>세전 지급액 (원, 선택)<input type="number" min="0" step="0.01" id="us-dist-gross" placeholder="확인 시 입력"></label>'+
 '<label>원천징수·세금 (원, 선택)<input type="number" min="0" step="0.01" id="us-dist-tax" placeholder="확인 시 입력"></label>'+
 '<label>지급금 중 재투자액 (원, 선택)<input type="number" min="0" step="0.01" id="us-dist-reinvest" placeholder="지급금 내 재투자"></label>'+
 '</div><button type="button" class="us-header-button" id="us-dist-add">세후 지급내역 저장</button>'+
 '<p id="us-dist-message" class="us-small" aria-live="polite"></p>'+
 '<div id="us-distribution-ledger"></div>'+
 '<details class="us-krw-optional"><summary>엑셀의 날짜별 세후 분배금 복원 (선택)</summary>'+
 '<p class="us-small">현재 선택한 종목의 지급일과 세후 원화금액을 한 줄씩 붙여넣으세요. 기존 동일 날짜·금액은 중복 제외하며 서로 다른 금액은 자동 덮어쓰지 않습니다. 업로드 없이 이 브라우저에만 저장됩니다.</p>'+
 '<textarea id="us-dist-bulk-input" rows="5" placeholder="2026-10-01 5000" style="width:100%;box-sizing:border-box;min-height:110px;border-radius:9px;padding:10px;background:#101c31;color:#e8f0ff;border:1px solid #526789"></textarea>'+
 '<button type="button" class="us-header-button" id="us-dist-bulk-add">지급일 중복 검사 후 복원</button>'+
 '<p id="us-dist-bulk-message" class="us-small" role="status"></p></details></details>';
 head.insertAdjacentElement('afterend',holder);
 $('us-dist-add').onclick=addDistribution;
 $('us-dist-bulk-add').onclick=importDatedReceipts;
 $('us-distribution-date').value=day();
 $('us-distribution-ticker').value=ledgerSelected;
 $('us-distribution-ticker').addEventListener('change',function(){ledgerSelected=this.value;renderLedger();});
 const d=$('holdings-settings');if(d)d.addEventListener('toggle',()=>{if(d.open)renderForm();});
 renderForm();
 applyPersonalLink();
 window.ISA_US_KRW={cardLine,compactLine,primaryPrice,metricPrice,dividendPrice,detailLine,basisKrw:positionKrw,fx,priceKrw,totalKrw,distributionStats,netDividend,payoutStorageDiagnostic,payoutDiagnosticText};
 showRate();
 window.addEventListener('isa-us-quotes-refreshed',()=>render());
 window.addEventListener('isa-personal-us-quote-refreshed',()=>render());
 render();
}
mount();
})();