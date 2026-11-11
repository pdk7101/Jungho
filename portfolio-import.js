/* One-click local-only portfolio snapshot from user supplied screenshots.
 * The URL hash is never sent as part of an HTTP request. No personal account
 * number, share counts, cost bases or screenshot P/L are embedded in source. */
(function(){
'use strict';
const KEY='isa-user-portfolio-snapshot-v1';
const KRKEY='isa-private-positions-v1',USKEY='isa-us-holdings-v1',TDKEY='isa-private-toss-domestic-snapshot-v1';
const KR=['reit','sol','robot','space','sofr','tr'];
const US=['schd','spym','cony','agnc','spacex'];
const TD=['tsofr','treit','ttr','biotech','tspace','media','trobot','hongah','sensor'];
const NAMES={space:'1Q 미국우주항공테크',sol:'SOL 200타겟',tr:'KODEX 200TR',
 reit:'TIGER 리츠',sofr:'KODEX 미국달러SOFR',robot:'RISE AI&로봇',
 schd:'SCHD',spym:'SPYM',cony:'CONY',agnc:'AGNC',spacex:'토스 화면 스페이스X',
 tsofr:'KODEX 미국달러SOFR금리액티브',treit:'TIGER 리츠부동산인프라',
 ttr:'KODEX 200TR',biotech:'마이티 신약포커스바이오액티브',
 tspace:'1Q 미국우주항공테크',media:'TIGER 미디어컨텐츠',trobot:'RISE AI&로봇',
 hongah:'흥아해운',sensor:'센서뷰'};
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
 const all={date,kr:{},us:{},usPositions:{},tossDomestic:{},conyNote:null,tossTotal:null};
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
  }else if(group==='B'&&p.length===3){
   // Private per-share KRW average + quantity from the Toss holding screen.
   const [id,q,a]=p,qty=Number(q),avg=Number(a);
   if(!US.includes(id)||all.usPositions[id]||!Number.isFinite(qty)||qty<0||qty>10000000||
    !Number.isFinite(avg)||avg<=0||avg>1000000000)
    throw Error('토스 보유수량·원화 평균매수가를 확인해 주세요');
   all.usPositions[id]={qty,avg};
  }else if(group==='D'&&p.length===4){
   const [id,q,v,pl]=p,qty=Number(q),value=Number(v),pnl=Number(pl);
   if(!TD.includes(id)||all.tossDomestic[id]||!Number.isInteger(qty)||qty<0||qty>10000000||
    !Number.isFinite(value)||value<0||!Number.isFinite(pnl)||value-pnl<0)
    throw Error('토스 국내주식 보유수량·평가손익을 확인해 주세요');
   all.tossDomestic[id]={qty,value,pnl};
  }else if(group==='N'&&p.length===3){
   const [id,total,increment]=p,div=Number(total),inc=Number(increment);
   if(id!=='cony'||all.conyNote||!Number.isInteger(div)||!Number.isInteger(inc)||
    div<0||inc<0||inc>div)throw Error('CONY 누적 분배금 기록을 확인해 주세요');
   all.conyNote={total:div,increment:inc};
  }else if(group==='T'&&p.length===2){
   const [val,pl]=p,amount=Number(val),pnl=Number(pl);
   if(all.tossTotal||!Number.isFinite(amount)||amount<0||!Number.isFinite(pnl))
    throw Error('토스 계좌 합계 형식 확인 필요');
   all.tossTotal={amount,pnl};
  }else throw Error('잔고 정보 형식이 맞지 않습니다');
 }
 const hasKR=KR.some(id=>!!all.kr[id]);
 const hasUS=US.some(id=>!!all.us[id])||!!all.tossTotal;
 const hasBalance=US.some(id=>!!all.usPositions[id]);
 const hasTD=TD.some(id=>!!all.tossDomestic[id]);
 const hasNote=!!all.conyNote;
 if(!hasKR&&!hasUS&&!hasBalance&&!hasTD&&!hasNote)throw Error('적용할 보유 종목이 없습니다');
 if(hasKR&&KR.some(id=>!all.kr[id]))throw Error('키움 ISA 6종목의 보유수량·평단이 모두 필요합니다');
 if(hasUS&&US.some(id=>!all.us[id]))
  throw Error('토스 미국주식 5종목 기록이 모두 필요합니다');
 if(hasTD&&TD.some(id=>!all.tossDomestic[id]))
  throw Error('토스 국내주식 9종목 기록이 모두 필요합니다');
 if(hasBalance&&US.some(id=>!all.usPositions[id]))
  throw Error('토스 평단·수량은 5종목 전부 확인해야 합니다');
 all.hasKR=hasKR;all.hasUS=hasUS;all.hasBalance=hasBalance;all.hasTD=hasTD;all.hasNote=hasNote;
 all.krOnly=hasKR&&!hasUS&&!hasBalance&&!hasTD&&!hasNote;
 all.usOnly=(hasUS||hasBalance)&&!hasKR&&!hasTD&&!hasNote;
 all.balanceOnly=hasBalance&&!hasUS&&!hasKR&&!hasTD&&!hasNote;
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
  for(const id of parsed.hasKR?KR:[]){
   const old=krOld[id]||{},v=parsed.kr[id];
   if(old.snapshotDate&&old.snapshotDate>parsed.date){kept++;continue;}
   kr[id]={...old,qty:v.qty,avg:v.avg,snapshotDate:parsed.date};krApplied++;
  }
  // Keep any directly supplied cost basis and cumulative net distributions.
  // If missing, a USD-stock KRW cost basis may be estimated from valuation - P/L.
  for(const id of parsed.hasUS||parsed.hasBalance?US.filter(x=>x!=='spacex'):[]){
   const old=usOld[id]||{},v=parsed.us[id],balance=parsed.usPositions[id];
   if(old.krwSnapshotDate&&old.krwSnapshotDate>parsed.date){kept++;continue;}
   const next={...old,qty:balance?balance.qty:v.qty,krwSnapshotDate:parsed.date};
   if(balance){
    next.krwAvg=balance.avg;
    next.krwAvgSource='explicit-toss-screenshot';
   }else if(!(Number(next.krwAvg)>0)&&v.qty>0){
    next.krwAvg=Math.round(((v.value-v.pnl)/v.qty)*100)/100;
    next.krwAvgSource='estimated-from-screenshot-valuation-pnl';
    derived++;
   }
   // Valuation screenshots must never be mistaken for executable real-time quotes.
   // A cost-basis/quantity-only update leaves any independently supplied current quote alone.
   if(!parsed.balanceOnly){
    delete next.krwCurrent;
    delete next.krwDay;
   }
   us[id]=next;usApplied++;
  }
  // Save in the user's browser, not GitHub. Roll back on a storage failure.
  const backup=Object.fromEntries([KEY,KRKEY,USKEY,TDKEY].map(k=>[k,localStorage.getItem(k)]));
  try{
   if(parsed.hasKR)store(KRKEY,kr);
   if(parsed.hasUS||parsed.hasBalance)store(USKEY,us);
   if(parsed.hasTD)store(TDKEY,{date:parsed.date,rows:parsed.tossDomestic});
   // Retain the untouched market's historical screenshot and browser holdings.
   // Each market keeps its own snapshot date; the URL never contains account identifiers.
   const priorKr=existing?.kr||{},priorUs=existing?.us||{},priorTD=existing?.tossDomestic||{};
   const fullUS=parsed.hasUS?Object.fromEntries(US.map(id=>[id,{
    ...parsed.us[id],...(parsed.hasBalance?{avg:parsed.usPositions[id].avg}:{avg:priorUs[id]?.avg})
   }])):parsed.hasBalance?
    Object.fromEntries(US.map(id=>[id,{...(priorUs[id]||{}),...parsed.usPositions[id]}])):priorUs;
   const combined={
    date:parsed.date,
    kr:parsed.hasKR?parsed.kr:priorKr,
    krDate:parsed.hasKR?parsed.date:(existing?.krDate||null),
    us:fullUS,
    usDate:parsed.hasUS?parsed.date:(existing?.usDate||null),
    usPositionDate:parsed.hasBalance?parsed.date:(existing?.usPositionDate||null),
    tossDomestic:parsed.hasTD?parsed.tossDomestic:priorTD,
    tdDate:parsed.hasTD?parsed.date:(existing?.tdDate||null),
    conyNote:parsed.hasNote?parsed.conyNote:(existing?.conyNote||null),
    conyNoteDate:parsed.hasNote?parsed.date:(existing?.conyNoteDate||null),
    tossTotal:parsed.tossTotal||(existing?.tossTotal||null),
    tossTotalDate:parsed.tossTotal?parsed.date:(existing?.tossTotalDate||existing?.usDate||null)
   };
   store(KEY,combined);
  }catch(err){
   for(const [key,val] of Object.entries(backup)){
    try{if(val===null)localStorage.removeItem(key);else localStorage.setItem(key,val);}catch(_){}
   }
   throw Error('이 브라우저에 저장할 수 없어 원래 정보를 유지했습니다');
  }
  report={kind:'success',message:parsed.date+' 사진 기록 적용: '+
   (parsed.hasKR?'키움 ISA '+krApplied+'종목 · ':'')+
   (parsed.hasUS||parsed.hasBalance?'토스 미국 ETF·주식 '+usApplied+'종목 · ':'')+
   (parsed.hasTD?'토스 국내주식 '+TD.length+'종목 · ':'')+
   (parsed.hasNote?'CONY 누적 분배금 메모 · ':'')+
   '기존 매수규칙과 다른 시장의 보유기록은 유지.'+
   (kept?' 기존에 더 최신으로 입력한 '+kept+'종목은 보존.':'')};
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
  const order=group==='K'?KR:group==='D'?TD:US;
  return '<div class="portfolio-shot-list">'+order.map(id=>{
   const x=data[id],primary=group==='K'?'평단 '+money(x.avg)+' · 사진 현재가 '+money(x.current):
     (Number(x.avg)>0?'토스 원화 평단 '+money(x.avg)+' · ':'')+
     (Number.isFinite(x.value)?'사진 평가액 '+money(x.value):'사진 평가액 없음');
   return '<div class="portfolio-shot-row"><span><b>'+escapeHtml(NAMES[id])+'</b>'+
    '<small>'+comma(x.qty)+'주 · '+primary+'</small></span>'+
    '<strong class="'+(x.pnl>=0?'good':'error')+'">'+(Number.isFinite(x.pnl)?signed(x.pnl):'손익 미입력')+'</strong></div>';
  }).join('')+'</div>';
 };
 host.innerHTML='<h2>내 보유현황 · 사진 기록 '+escapeHtml(d.date)+'</h2>'+
 '<p class="sub">보내주신 증권사 화면의 기록입니다. 오늘 이후 시세·체결에 따라 달라질 수 있으며, 실제 실시간 계좌조회가 아닙니다.</p>'+
 (report?.kind==='success'?'<p class="sub" role="status">'+escapeHtml(report.message)+'</p>':'')+
 (KR.every(id=>d.kr&&d.kr[id])?
 '<details><summary>키움 ISA 보유 6종목 · '+KR.reduce((n,id)=>n+d.kr[id].qty,0)+'주 · 사진 손익 '+signed(KR.reduce((n,id)=>n+d.kr[id].pnl,0))+
 (d.krDate?' · 별도 기록 '+escapeHtml(d.krDate):'')+'</summary>'+rows('K',d.kr)+'</details>':
 '<p class="sub">키움 ISA 사진 기록은 이 브라우저에 없어 이전에 입력한 보유정보를 그대로 유지했습니다.</p>')+
 (US.every(id=>d.us&&d.us[id])?
 '<details><summary>토스 미국주식 5종목 · '+escapeHtml(d.usDate||d.usPositionDate||'기록일 미확인')+
 ' · 평가 '+money(US.reduce((n,id)=>n+(Number(d.us[id].value)||0),0))+
 ' · 사진 손익 '+signed(US.reduce((n,id)=>n+(Number(d.us[id].pnl)||0),0))+'</summary>'+
 rows('U',d.us)+
 '<p class="sub">스페이스X는 사진 보유현황에만 기록하고 미국 4종목 투자판단에 포함하지 않습니다.</p></details>':
 '<p class="sub">토스 미국주식 최신 사진 기록 없음 · 기존 보유정보 유지</p>')+
 (TD.every(id=>d.tossDomestic&&d.tossDomestic[id])?
 '<details><summary>토스 국내주식 9종목 · '+escapeHtml(d.tdDate||'기록일 미확인')+
 ' · 평가 '+money(TD.reduce((n,id)=>n+d.tossDomestic[id].value,0))+
 ' · 사진 손익 '+signed(TD.reduce((n,id)=>n+d.tossDomestic[id].pnl,0))+'</summary>'+
 rows('D',d.tossDomestic)+
 '<p class="sub">토스 국내주식은 키움 ISA 6종목과 별도입니다. 기존 국내 ETF 조건부 매수계획에 합산하지 않습니다.</p></details>':'')+
 (d.conyNote?
 '<details><summary>CONY 누적 분배금 메모 · '+escapeHtml(d.conyNoteDate||'날짜 미확인')+
 ' · '+money(d.conyNote.total)+'</summary>'+
 '<p>사진 누적 분배금 '+money(d.conyNote.total)+
 ' / 이번 기록 증가분 '+money(d.conyNote.increment)+
 ' / 이번 증가분을 제외한 이전 누적액 '+money(d.conyNote.total-d.conyNote.increment)+'</p>'+
 '<p class="sub">사진에는 세후 수령 여부가 명시되지 않아 기존 세후 분배금 원장과 별개로 보관했습니다. 세후 분배금 계산에 중복 합산하지 않습니다.</p></details>':'')+
 (d.tossTotal&&d.tossTotalDate&&d.tossTotalDate!==d.date?
 '<p class="sub">토스 이전 계좌 전체 평가 합계 '+money(d.tossTotal.amount)+' ('+escapeHtml(d.tossTotalDate)+')는 오늘 합계로 사용하지 않습니다.</p>':'');
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