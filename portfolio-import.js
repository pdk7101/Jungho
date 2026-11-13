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
// Previously displayed a full historic photo portfolio panel.
// Keep the optional private import and the locally saved holdings; omit the duplicate panel.
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
}
})();