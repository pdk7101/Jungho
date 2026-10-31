/* Optional local-only KRW view for the USD US watchlist. Nothing is uploaded. */
(function(){
'use strict';
const ITEMS=['SCHD','AGNC','SPYM','CONY'];
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
const savedFx=storage('isa-us-fx-v1');
let manualFx=savedFx&&finitePositive(savedFx.rate)&&Number(savedFx.rate)>700&&Number(savedFx.rate)<3000?Number(savedFx.rate):null;
function holdings(){return storage('isa-us-holdings-v1')||{}}
function fx(){
 if(finitePositive(manualFx))return {rate:manualFx,source:'사용자 직접 입력 환율',when:'수동 입력',manual:true};
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
 const rate=fx();
 if(rate&&finitePositive(priceUsd))return {amount:Number(priceUsd)*rate.rate,manual:false,
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
function netDividend(id){
 const h=holdings()[id]||{},v=h.krwNet;
 const manual=v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 const logged=distributionStats(id);
 if(manual!==null)return {amount:manual,source:'직접 입력 누적 세후 분배금',kind:'cumulative',recorded:logged.net,
  discrepancy:logged.count?manual-logged.net:null,count:logged.count};
 if(logged.count)return {amount:logged.net,source:'날짜별 기록된 세후 분배금 합계 (누락 가능)',kind:'ledger',recorded:logged.net,
  discrepancy:null,count:logged.count};
 return null;
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
  '<small>'+(q.manual?'토스 당일 직접 입력':'환율 환산 참고 가격')+' · '+dollar+'</small>';
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
 const qty=num(h.qty),snapshot=h.krwSnapshotDate||'기준일 미입력',
  held=qty!==null&&Number.isFinite(qty)&&qty>=0;
 let line='<span class="us-small">실제 보유: <b>'+(held?qty.toLocaleString('ko-KR',{maximumFractionDigits:6})+'주':'미등록')+
  '</b> · 원화 평단 <b>'+(finitePositive(h.krwAvg)?won(h.krwAvg):'미입력')+'</b></span>';
 if(held&&finitePositive(h.krwAvg))line+='<span class="us-small">보유정보 기준: '+clean(snapshot)+'</span>';
 if(p)line+='<span class="us-small '+(p.pnl>=0?'us-positive':'us-negative')+'">'+
  '평가손익 '+signed(p.pnl)+' ('+signedPercent(p.rate)+')'+
  (p.inclusive!==null?' · 세후 분배금 포함 '+signed(p.inclusive):' · 누적 세후 분배금 미입력')+'</span>';
 else if(held)line+='<span class="us-small">원화 평가손익 계산용 가격 확인 필요</span>';
 return line;
}
function showHoldingsCheck(){
 const el=$('us-krw-holdings-check');if(!el)return;
 const all=holdings();let present=0,netKnown=0;let missing=[];
 for(const symbol of ITEMS){
  const id=symbol.toLowerCase(),p=all[id]||{};
  if(finitePositive(p.qty)&&finitePositive(p.krwAvg))present++;
  else missing.push(symbol);
  if(netDividend(id)!==null)netKnown++;
 }
 el.innerHTML='<p><b>이 기기에 저장된 미국주식 보유정보: '+present+'/4종목</b></p>'+
 (present===4?'<p class="us-small">4종목 보유수량·원화 평단이 저장되어 있습니다. 이전 스냅샷 이후 거래 여부는 직접 확인해야 합니다.</p>':
  '<p class="us-small">아직 보유정보 '+missing.join('·')+'가 미등록입니다. 채팅에서 수치를 알려주신 것만으로 이 기기에 저장되지는 않습니다. 별도 전용 적용 링크 또는 아래 입력란을 사용해 주세요.</p>')+
 '<p class="us-small">누적 세후 배당·분배금 확인: '+netKnown+'/4종목 · 미입력을 0원으로 취급하지 않습니다.</p>';
}
function totalKrw(){
 const app=window.ISA_US_APP;
 if(!app)return {count:0,principal:0,value:0,pnl:0,knownNet:0,missing:0,provisional:0,inclusive:null};
 let count=0,principal=0,value=0,pnl=0,knownNet=0,missing=0,provisional=0;
 for(const symbol of ITEMS){
  const id=symbol.toLowerCase(),current=app.getPrice?.(id),p=positionKrw(id,current);
  if(!p)continue;
  count++;principal+=p.principal;value+=p.value;pnl+=p.pnl;
  if(p.net===null)missing++;else {knownNet+=p.net;if(p.payout?.kind==='ledger')provisional++;}
 }
 return {count,principal,value,pnl,rate:principal>0?pnl/principal*100:null,
  knownNet,missing,provisional,inclusive:missing===0&&count>0?pnl+knownNet:null,
  inclusiveRate:missing===0&&count>0&&principal>0?(pnl+knownNet)/principal*100:null};
}
const signed=v=>(v>=0?'+':'')+won(v);
const signedPercent=v=>(v>=0?'+':'')+v.toFixed(2)+'%';
function showTotal(){
 const el=$('us-krw-total');if(!el)return;
 const v=totalKrw();
 if(!v.count){el.innerHTML='<p class="us-small">보유수량·원화 평단을 입력하면 4종목의 원화 평가손익을 계산합니다. 유효한 환율 또는 현재가가 필요합니다.</p>';return;}
 let html='<p><b>미국주식 평가·분배금 원화 합계 ('+v.count+'/4종목)</b></p>'+
 '<div class="us-total-grid"><div>누적 매수원가<strong>'+won(v.principal)+'</strong></div>'+
 '<div>추정 평가금액<strong>'+won(v.value)+'</strong></div>'+
 '<div>평가손익<strong class="'+(v.pnl>=0?'us-positive':'us-negative')+'">'+signed(v.pnl)+'</strong><small>'+signedPercent(v.rate)+'</small></div>'+
 '<div>확인된 누적 세후 배당금<strong>'+won(v.knownNet)+'</strong><small>'+(v.missing?'미입력 '+v.missing+'종목':'전체 입력/기록')+'</small></div>'+
 '<div>'+(v.provisional?'기록분 포함 잠정 총손익':'분배금 포함 총손익')+'<strong>'+(v.inclusive===null?'전체 계산 보류':signed(v.inclusive))+'</strong>'+
 (v.inclusiveRate!==null?'<small>'+signedPercent(v.inclusiveRate)+'</small>':'')+'</div></div>';
 if(v.missing)html+='<p class="us-small">미입력 '+v.missing+'종목이 있어 전체 분배금 포함 총손익을 계산하지 않았습니다. 빈 기록을 0원으로 가정하지 않습니다.</p>';
 if(v.provisional)html+='<p class="us-small">'+v.provisional+'종목은 날짜별로 기록된 지급금만 반영했습니다. 누락된 과거 분배금이 있으면 실제 누적 총손익과 다를 수 있습니다.</p>'; 
 html+='<p class="us-small">매수원가는 현재 보유수량 × 입력 평단가이며 분배금 재투자분도 포함될 수 있습니다. 외부에서 입금한 실제 투자원금과 다릅니다. 원화 평가액은 토스 입력 현재가 또는 비공식 참고환율로 계산한 추정치입니다.</p>';
 el.innerHTML=html;
}

function distributionDetail(id){
 const stats=distributionStats(id),net=netDividend(id);
 let html='<div class="us-dist-detail"><b>원화 분배금·배당금 상세</b>';
 if(net){
  html+='<p>손익에 반영하는 누적 세후 분배금 <strong>'+won(net.amount)+'</strong>'+
   ' <span class="us-small">('+clean(net.source)+')</span></p>';
  if(net.kind==='cumulative'&&stats.count){
   html+='<p>날짜별 기록 합계 '+won(stats.net)+' / 직접 입력 누적금액 '+won(net.amount)+
     ' · 차액 '+(net.discrepancy>=0?'+':'')+won(net.discrepancy)+'</p>'+
     '<p class="us-small">차액은 과거 지급내역 누락 또는 입력 차이일 수 있습니다. 두 금액을 더하지 않고 직접 입력 누적금액만 손익에 반영합니다.</p>';
  }else if(net.kind==='ledger')html+='<p class="us-small">날짜별 지급 기록만 합산했습니다. 과거 기록이 누락됐다면 실제 총수령액보다 적을 수 있습니다.</p>';
 }else html+='<p class="us-small">입력된 세후 분배금이 없어 분배금 포함 총손익을 확정 계산하지 않습니다.</p>';
 if(stats.count){
  const moneyPart=(label,amount,count)=>count===stats.count?'<p>'+label+' 합계 '+won(amount)+'</p>':
   '<p class="us-small">'+label+' 일부 입력 '+count+'/'+stats.count+'건 · 입력된 금액 합계 '+won(amount)+' (미입력액 제외)</p>';
  html+='<p>입력된 지급 횟수 '+stats.count+'건 · 세후 실수령 기록 합계 '+won(stats.net)+'</p>'+
   moneyPart('세전 지급금',stats.gross,stats.grossCount)+moneyPart('원천징수·세금',stats.tax,stats.taxCount)+
   moneyPart('재투자한 지급금',stats.reinvest,stats.reinvestCount);
  html+='<p class="us-small">월별 실제 입력 기록: '+stats.months.slice(0,4).map(([month,total])=>clean(month)+' '+won(total)).join(' · ')+'</p>';
  html+='<div class="us-dist-recent">'+stats.rows.slice(0,6).map(r=>
   '<div class="us-dist-row"><span>'+clean(r.date)+'</span><span>세후 '+won(r.net)+
   '<small>'+(r.gross!==null?'세전 '+won(r.gross)+' · ':'')+(r.tax!==null?'세금 '+won(r.tax)+' · ':'')+
   (r.reinvest!==null?'재투자 '+won(r.reinvest):'')+'</small></span></div>').join('')+'</div>';
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

function renderLedger(){
 const area=$('us-distribution-ledger'),select=$('us-distribution-ticker');if(!area||!select)return;
 const id=select.value||ledgerSelected;
 const stats=distributionStats(id),net=netDividend(id);
 let html='<p><b>'+clean(id.toUpperCase())+' · 날짜별 세후 분배금 내역</b></p>';
 if(!stats.count){
  html+='<p class="us-small">아직 입력된 지급내역이 없습니다. 실제 토스 입금내역의 원화 세후 금액을 등록해 주세요.</p>';
 }else{
  html+='<div class="us-dist-figures"><div>기록된 세후 지급금<strong>'+won(stats.net)+'</strong></div>'+
  '<div>입력된 지급횟수<strong>'+stats.count+'회</strong></div>'+
  '<div>원화 재투자 기록<strong>'+(stats.reinvestCount===stats.count?won(stats.reinvest):'일부만 입력')+'</strong></div></div>';
  html+='<p class="us-small">월별 입력 내역: '+stats.months.slice(0,6).map(([m,v])=>clean(m)+' '+won(v)).join(' · ')+'</p>';
  if(net&&net.kind==='cumulative'&&net.discrepancy!==null)html+='<p class="us-small">별도 누적 세후 수령액 '+won(net.amount)+' / 날짜별 기록 '+won(stats.net)+
    ' / 차이 '+signed(net.discrepancy)+'. 손익에는 누적 수령액만 반영하며 합산하지 않습니다.</p>';
  html+='<div class="us-dist-records">'+stats.rows.map(r=>
   '<div class="us-dist-record"><div><b>'+clean(r.date)+'</b> · 세후 '+won(r.net)+
    '<small>'+(r.gross!==null?'세전 '+won(r.gross)+' · ':'')+
    (r.tax!==null?'세금 '+won(r.tax)+' · ':'')+
    (r.reinvest!==null?'재투자 '+won(r.reinvest):'재투자액 미입력')+'</small></div>'+
   '<button type="button" class="us-dist-delete" data-ledger-key="'+clean(r.key)+'" aria-label="'+clean(r.date)+' 기록 삭제">삭제</button></div>'
  ).join('')+'</div>';
 }
 area.innerHTML=html;
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
 if(entries.length>=500){message.textContent='기록 500건 한도에 도달했습니다. 오래된 기록을 정리해 주세요.';return;}
 const unique='d'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 entries.push({key:unique,id,date,net,gross,tax,reinvest});
 if(!write(LEDGER_KEY,entries)){message.textContent='기기 저장소 저장 실패 · 지급금 기록을 저장하지 못했습니다.';return;}
 ['us-dist-net','us-dist-gross','us-dist-tax','us-dist-reinvest'].forEach(k=>{const el=$(k);if(el)el.value='';});
 message.textContent=clean(id.toUpperCase())+' '+date+' 세후 '+won(net)+' 지급기록을 이 기기에 저장했습니다.';
 render();
}
function renderForm(){
 const area=$('us-krw-editor');if(!area)return;
 const h=holdings();
 area.innerHTML=ITEMS.map(ticker=>{
  const id=ticker.toLowerCase(),p=h[id]||{};
  const fmt=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x))?String(x):'';
  return '<div class="us-krw-form-row"><strong>'+ticker+'</strong>'+
   '<label>보유수량 (주)<input data-krw-id="'+id+'" data-k="qty" type="number" min="0" step="0.000001" value="'+fmt(p.qty)+'"></label>'+
   '<label>토스 원화 평단 (원)<input data-krw-id="'+id+'" data-k="krwAvg" type="number" min="0" step="0.01" value="'+fmt(p.krwAvg)+'"></label>'+
   '<label>토스 현재가 (원 · 당일만)<input data-krw-id="'+id+'" data-k="krwCurrent" type="number" min="0" step="0.01" value="'+(p.krwDay===day()?fmt(p.krwCurrent):'')+'"></label>'+
   '<label>누적 세후 배당·분배금 (원)<input data-krw-id="'+id+'" data-k="krwNet" type="number" min="0" step="0.01" value="'+fmt(p.krwNet)+'"></label>'+
   '</div>';
 }).join('');
 area.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
  const id=input.dataset.krwId,k=input.dataset.k;
  const h=holdings(),p={...(h[id]||{})},value=input.value.trim()===''?null:Number(input.value);
  if(value!==null&&Number.isFinite(value)&&value>=0&&(k!=='krwAvg'||value>0)&&(k!=='krwCurrent'||value>0))p[k]=value;
  else delete p[k];
  if(k==='krwCurrent')p.krwDay=finitePositive(p.krwCurrent)?day():'';
  if(k==='qty'||k==='krwAvg')p.krwSnapshotDate=day();
  h[id]=p;
  write('isa-us-holdings-v1',h);
  $('us-krw-message').textContent='해당 기기에 보유정보를 저장했습니다. 추가매수·재투자 후 다시 갱신하세요.';
  window.ISA_US_APP?.applyFromLocal?.();
 }));
}
function importHoldings(){
 const field=$('us-krw-import'),msg=$('us-krw-message');
 if(!field)return;
 const lines=field.value.trim().split(/\r?\n/),h=holdings();let good=0,bad=0;
 for(const line of lines){
  if(!line.trim())continue;
  const m=line.trim().match(/^(SCHD|AGNC|SPYM|CONY)\s+([\d.]+)\s+([\d,.]+)\s+([\d,.]+)$/i);
  if(!m){bad++;continue;}
  const id=m[1].toLowerCase(),qty=Number(m[2]),avg=Number(m[3].replace(/,/g,'')),current=Number(m[4].replace(/,/g,''));
  if(!(qty>=0)||!Number.isFinite(qty)||!(avg>0)||!(current>0)){bad++;continue;}
  h[id]={...(h[id]||{}),qty,krwAvg:avg,krwCurrent:current,krwDay:day(),krwSnapshotDate:day()};
  good++;
 }
 if(!good){msg.textContent='형식 확인: SCHD 10 50000 49000 (티커 수량 평단원 현재가원)';return;}
 write('isa-us-holdings-v1',h);
 field.value='';renderForm();window.ISA_US_APP?.applyFromLocal?.();
 msg.textContent=good+'종목을 이 기기에 저장했습니다.'+(bad?' 형식 불일치 '+bad+'줄 제외.':'')+' 분배금은 별도 입력하세요.';
}

/* Personal portfolio snapshots are accepted only via a fragment on the user's
 * own link. Fragment data is not part of an HTTP request to GitHub Pages;
 * remove it from the address bar after one use. Never put private holdings
 * into the public application source, defaults or remote JSON. */
function applyPersonalLink(){
 const hash=String(window.location?.hash||'');
 if(!hash.startsWith('#us-holdings='))return;
 const info=$('us-krw-applied'),notice=$('us-krw-message');
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
  if($('us-krw-details'))$('us-krw-details').open=true;
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
 area.textContent=r?'적용 환율: 1 USD = '+won(r.rate,2)+' · '+r.source+' ('+r.when+')':'환율 확인 실패 · 환율 직접 입력 또는 토스 현재가를 사용하세요.';
}
function render(){
 showRate();
 showHoldingsCheck();
 showTotal();
 renderLedger();
 window.ISA_US_SIGNAL?.refreshSummary?.();
 window.ISA_US_APP?.rerender?.();
}
function mount(){
 const root=$('us-panel');if(!root)return;
 const head=$('us-updated');
 const holder=document.createElement('div');
 holder.id='us-krw-panel';holder.className='us-krw-panel';
 holder.innerHTML='<h3>미국주식 원화 평단·손익</h3>'+
 '<p class="us-small">달러 일봉과 별도로 토스 원화 현재가·평단을 표시합니다. 개인정보는 GitHub에 전송하지 않고 이 기기에만 저장합니다.</p>'+
 '<div id="us-krw-rate-status" class="us-small">환율 확인 중…</div>'+
 '<div id="us-krw-holdings-check" class="us-holdings-check"></div>'+
 '<div id="us-krw-total" class="us-total-summary"></div>'+
 '<p id="us-krw-applied" class="us-small" aria-live="polite"></p>'+
 '<label>선택: 직접 적용할 USD/KRW 환율 (원)<input id="us-krw-fx" type="number" min="700" max="3000" step="0.01" placeholder="비워두면 수집한 참고 환율 사용" value="'+(manualFx||'')+'"></label>'+
 '<details id="us-krw-details"><summary>토스 보유수량·원화 평단·현재가 입력</summary>'+
 '<p class="us-small">현재가는 입력 당일에만 사용하고 다음 날에는 만료합니다. 1줄에 티커 / 수량 / 원화 평단 / 현재가 순으로 붙여넣으면 한 번에 저장할 수 있습니다.</p>'+
 '<textarea id="us-krw-import" rows="5" placeholder="SCHD 10 50000 49000&#10;SPYM 5 120000 118000"></textarea>'+
 '<button type="button" id="us-krw-import-button" class="us-header-button">입력한 4종목 저장</button>'+
 '<div id="us-krw-editor"></div>'+
 '<p class="us-small" id="us-krw-message">누적 세후 분배금은 실수령액을 따로 입력해 주세요.</p></details>'+
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
 '<div id="us-distribution-ledger"></div></details>';
 head.insertAdjacentElement('afterend',holder);
 $('us-krw-fx').addEventListener('change',function(){
  const rate=this.value.trim()===''?null:Number(this.value);
  if(rate===null){manualFx=null;try{localStorage.removeItem('isa-us-fx-v1')}catch(_){}}
  else if(rate>700&&rate<3000&&Number.isFinite(rate)){manualFx=rate;write('isa-us-fx-v1',{rate});}
  else{$('us-krw-message').textContent='유효 환율을 확인해 주세요. 임의 환율을 적용하지 않았습니다.';return;}
  render();
 });
 $('us-krw-import-button').onclick=importHoldings;
 $('us-dist-add').onclick=addDistribution;
 $('us-distribution-date').value=day();
 $('us-distribution-ticker').value=ledgerSelected;
 $('us-distribution-ticker').addEventListener('change',function(){ledgerSelected=this.value;renderLedger();});
 const d=$('us-krw-details');d.addEventListener('toggle',()=>{if(d.open)renderForm();});
 renderForm();
 applyPersonalLink();
 window.ISA_US_KRW={cardLine,primaryPrice,metricPrice,dividendPrice,detailLine,basisKrw:positionKrw,fx,priceKrw,totalKrw,distributionStats,netDividend};
 showRate();
 window.addEventListener('isa-us-quotes-refreshed',()=>render());
 render();
}
mount();
})();