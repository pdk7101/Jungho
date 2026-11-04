/* One-click local-only portfolio snapshot from user supplied screenshots.
 * The URL hash is never sent as part of an HTTP request. No personal account
 * number, share counts, cost bases or screenshot P/L are embedded in source. */
(function(){
'use strict';
const KEY='isa-user-portfolio-snapshot-v1';
const KRKEY='isa-private-positions-v1',USKEY='isa-us-holdings-v1';
const KR=['space','sol','tr','reit','sofr','robot'];
const US=['schd','spym','cony','agnc','spacex'];
const NAMES={space:'1Q 미국우주항공테크',sol:'SOL 200타겟',tr:'KODEX 200TR',
 reit:'TIGER 리츠',sofr:'KODEX 미국달러SOFR',robot:'RISE AI&로봇',
 schd:'SCHD',spym:'SPYM',cony:'CONY',agnc:'AGNC',spacex:'토스 화면 스페이스X'};
const $=id=>document.getElementById(id);
const money=n=>(Number(n)<0?'-':'')+Math.round(Math.abs(Number(n))).toLocaleString('ko-KR')+'원';
const signed=n=>(n>0?'+':'')+money(n);
const comma=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:6});
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function store(k,v){localStorage.setItem(k,JSON.stringify(v));}
function load(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(_){return null;}}
function localDay(){
 const v=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return v.year+'-'+v.month+'-'+v.day;
}
function decodePortfolio(encoded){
 const tokens=decodeURIComponent(encoded).split(';'),date=tokens.shift();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>localDay())throw Error('기준일이 올바르지 않습니다');
 const all={date,kr:{},us:{},tossTotal:null};
 for(const token of tokens){
  const p=token.split(':'),group=p.shift();
  if(group==='K'&&p.length===5){
   const [id,q,a,c,pl]=p,qty=Number(q),avg=Number(a),current=Number(c),pnl=Number(pl);
   if(!KR.includes(id)||all.kr[id]||!Number.isInteger(qty)||qty<0||qty>10000000||
    !Number.isFinite(avg)||avg<=0||!Number.isFinite(current)||current<=0||
    !Number.isFinite(pnl))throw Error('키움 종목·수량·평단을 확인해 주세요');
   all.kr[id]={qty,avg,current,pnl};
  }else if(group==='U'&&p.length===4){
   const [id,q,v,pl]=p,qty=Number(q),value=Number(v),pnl=Number(pl);
   if(!US.includes(id)||all.us[id]||!Number.isFinite(qty)||qty<0||qty>10000000||
    !Number.isFinite(value)||value<0||!Number.isFinite(pnl)||value-pnl<0)
    throw Error('토스 종목·평가금액·손익을 확인해 주세요');
   all.us[id]={qty,value,pnl};
  }else if(group==='T'&&p.length===2){
   const [val,pl]=p,amount=Number(val),pnl=Number(pl);
   if(all.tossTotal||!Number.isFinite(amount)||amount<0||!Number.isFinite(pnl))
    throw Error('토스 계좌 합계 형식 확인 필요');
   all.tossTotal={amount,pnl};
  }else throw Error('잔고 정보 형식이 맞지 않습니다');
 }
 if(KR.some(id=>!all.kr[id]))throw Error('키움 ISA 6종목의 보유수량·평단이 모두 필요합니다');
 const hasUS=US.some(id=>!!all.us[id])||!!all.tossTotal;
 if(hasUS&&(US.some(id=>!all.us[id])||!all.tossTotal))
  throw Error('토스 종목 기록을 추가할 경우 미국 5종목·계좌 합계가 모두 필요합니다');
 all.krOnly=!hasUS;
 return all;
}
function importSnapshot(){
 const hash=String(window.location?.hash||'');
 if(!hash.startsWith('#portfolio='))return {kind:'none'};
 let report={kind:'error',message:''};
 try{
  const parsed=decodePortfolio(hash.slice('#portfolio='.length));
  const existing=load(KEY);
  if(existing?.date&&existing.date>parsed.date)throw Error('더 새로운 날짜의 보유 기록이 있어 이전 자료로 덮어쓰지 않았습니다');
  const krOld=load(KRKEY)||{},usOld=load(USKEY)||{};
  const kr={...krOld},us={...usOld};
  let krApplied=0,usApplied=0,kept=0,derived=0;
  for(const id of KR){
   const old=krOld[id]||{},v=parsed.kr[id];
   if(old.snapshotDate&&old.snapshotDate>parsed.date){kept++;continue;}
   kr[id]={...old,qty:v.qty,avg:v.avg,snapshotDate:parsed.date};krApplied++;
  }
  // Keep any directly supplied cost basis and cumulative net distributions.
  // If missing, a USD-stock KRW cost basis may be estimated from valuation - P/L.
  for(const id of parsed.krOnly?[]:US.filter(x=>x!=='spacex')){
   const old=usOld[id]||{},v=parsed.us[id];
   if(old.krwSnapshotDate&&old.krwSnapshotDate>parsed.date){kept++;continue;}
   const next={...old,qty:v.qty,krwSnapshotDate:parsed.date};
   if(!(Number(next.krwAvg)>0)&&v.qty>0){
    next.krwAvg=Math.round(((v.value-v.pnl)/v.qty)*100)/100;
    next.krwAvgSource='estimated-from-screenshot-valuation-pnl';
    derived++;
   }
   // Do not use screenshot valuation as a current executable quote.
   delete next.krwCurrent;
   delete next.krwDay;
   us[id]=next;usApplied++;
  }
  // Save in the user's browser, not GitHub. Roll back on a storage failure.
  const backup=Object.fromEntries([KEY,KRKEY,USKEY].map(k=>[k,localStorage.getItem(k)]));
  try{
   store(KRKEY,kr);
   if(!parsed.krOnly)store(USKEY,us);
   // Preserve previous US screenshot and US holdings during a KR-only update.
   const combined=parsed.krOnly?
    {...parsed,us:existing?.us||{},tossTotal:existing?.tossTotal||null,usDate:existing?.usDate||existing?.date||null}:
    {...parsed,usDate:parsed.date};
   store(KEY,combined);
  }catch(err){
   for(const [key,val] of Object.entries(backup)){
    try{if(val===null)localStorage.removeItem(key);else localStorage.setItem(key,val);}catch(_){}
   }
   throw Error('이 브라우저에 저장할 수 없어 원래 정보를 유지했습니다');
  }
  report={kind:'success',message:parsed.date+' 화면 기준 국내 '+krApplied+'종목 보유수량·평단 저장.'+
   (parsed.krOnly?' 기존 미국주식 보유정보는 변경하지 않았습니다.':
    ' 미국 '+usApplied+'종목 보유수량 저장. 미국 원화 평단 '+derived+
    '종목은 사진 손익 역산 추정이며, 스페이스X는 별도 스냅샷에만 보관.')+
   (kept?' 최신으로 입력된 '+kept+'종목은 유지.':'')};
 }catch(err){report={kind:'error',message:String(err.message||err)};}
 finally{
  // Remove personal shares and P/L values from the displayed address.
  try{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}catch(_){}
 }
 return report;
}
function renderSnapshot(){
 const d=load(KEY);if(!d||!d.date)return;
 const anchor=$('summary');if(!anchor)return;
 let host=$('portfolio-screenshot-snapshot');
 if(!host){host=document.createElement('section');host.id='portfolio-screenshot-snapshot';host.className='panel';anchor.insertAdjacentElement('afterend',host);}
 const report=load('isa-user-portfolio-snapshot-report-v1');
 const rows=(group,data)=>{
  const order=group==='K'?KR:US;
  return '<div class="portfolio-shot-list">'+order.map(id=>{
   const x=data[id],primary=group==='K'?'평단 '+money(x.avg)+' · 화면가 '+money(x.current):
     '화면 평가액 '+money(x.value);
   return '<div class="portfolio-shot-row"><span><b>'+escapeHtml(NAMES[id])+'</b>'+
    '<small>'+comma(x.qty)+'주 · '+primary+'</small></span>'+
    '<strong class="'+(x.pnl>=0?'good':'error')+'">'+signed(x.pnl)+'</strong></div>';
  }).join('')+'</div>';
 };
 host.innerHTML='<h2>내 보유현황 · 사진 기록 '+escapeHtml(d.date)+'</h2>'+
 '<p class="sub">보내주신 증권사 화면의 기록입니다. 오늘 이후 시세·체결에 따라 달라질 수 있으며, 실제 실시간 계좌조회가 아닙니다.</p>'+
 (report?.kind==='success'?'<p class="sub" role="status">'+escapeHtml(report.message)+'</p>':'')+
 '<details><summary>키움 ISA 보유 6종목 · '+KR.reduce((n,id)=>n+d.kr[id].qty,0)+'주 · 사진 손익 '+signed(KR.reduce((n,id)=>n+d.kr[id].pnl,0))+'</summary>'+rows('K',d.kr)+'</details>'+
 (US.every(id=>d.us&&d.us[id])&&d.tossTotal?
 '<details><summary>토스 사진에 표시된 미국주식 5종목 · 전체계좌 평가 '+money(d.tossTotal.amount)+
 (d.usDate?' · 별도 기록 '+escapeHtml(d.usDate):'')+'</summary>'+
 rows('U',d.us)+'<p class="sub">토스 화면 전체 계좌 손익 '+signed(d.tossTotal.pnl)+
 ' · 화면 전체 합계는 위 미국 5종목만의 합계가 아닐 수 있습니다.</p>'+
 '<p class="sub">스페이스X 표시 종목은 앱의 미국 4종목 분석에 포함되지 않습니다. 기존 미국주식 평단은 유지했으며, 평단이 없던 종목의 역산값은 참고용입니다.</p></details>':
 '<p class="sub">미국주식 보유정보는 이 사진에 없어 이전 입력을 유지했습니다.</p>');
}
const report=importSnapshot();
if(report.kind!=='none'){
 try{store('isa-user-portfolio-snapshot-report-v1',report);}catch(_){}
 if(report.kind==='success'){
  // Reload once so existing domestic and US modules pick up the new local records.
  window.location.reload();
 }else{
  const marker=document.createElement('p');marker.className='error';
  marker.textContent='보유현황 적용 실패: '+report.message;
  $('summary')?.insertAdjacentElement('afterend',marker);
 }
}else renderSnapshot();
})();