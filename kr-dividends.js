/* User-owned Korean stock distributions: local browser only.
   Weekly dated receipts, per-stock cumulative opening balances and monthly condensed display.
   Never infer the absence of a dividend as a confirmed zero payment. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const LEDGER='isa-kr-distribution-ledger-v1',BASE='isa-kr-distribution-baselines-v1';
const SNAP='isa-user-portfolio-snapshot-v1';
const KIWOOM=[
 ['reit','TIGER 리츠부동산인프라'],['sol','SOL 200타겟위클리커버드콜'],
 ['robot','RISE AI&로봇'],['space','1Q 미국우주항공테크'],
 ['sofr','KODEX 미국달러SOFR'],['tr','KODEX 200TR']
];
const TOSS=[
 ['tsofr','KODEX 미국달러SOFR'],['treit','TIGER 리츠부동산인프라'],
 ['ttr','KODEX 200TR'],['biotech','마이티 신약포커스바이오액티브'],
 ['tspace','1Q 미국우주항공테크'],['media','TIGER 미디어컨텐츠'],
 ['trobot','RISE AI&로봇'],['hongah','흥아해운'],['sensor','센서뷰']
];
const CATALOG=[
 ...KIWOOM.map(([id,name])=>({key:'kiwoom:'+id,account:'kiwoom',id,name})),
 ...TOSS.map(([id,name])=>({key:'toss:'+id,account:'tossDomestic',id,name}))
];
const allowed=new Set(CATALOG.map(x=>x.key));
const valid=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x))&&Number(x)>=0;
const money=x=>Math.round(Number(x)).toLocaleString('ko-KR')+'원';
const signed=x=>(Number(x)>=0?'+':'')+money(x);
const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function localDay(){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function validDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return false;
 const parsed=new Date(date+'T00:00:00Z');
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date&&
  date<='9999-12-31'&&date<=''+localDay();
}
function load(key,fallback){
 try{const v=JSON.parse(localStorage.getItem(key)||'null');return v===null?fallback:v;}
 catch(_){return fallback;}
}
function object(key){const v=load(key,{});return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
function ledger(){
 const raw=load(LEDGER,[]);
 if(!Array.isArray(raw))return [];
 return raw.filter(r=>r&&allowed.has(r.symbol)&&validDate(r.date)&&
  typeof r.key==='string'&&valid(r.net)&&Number(r.net)>0&&Number(r.net)<=1e9).map(r=>({
  key:r.key,symbol:r.symbol,date:r.date,net:Number(r.net),
  gross:valid(r.gross)?Number(r.gross):null,
  tax:valid(r.tax)?Number(r.tax):null,reinvest:valid(r.reinvest)?Number(r.reinvest):null
 }));
}
function baseline(symbol){
 const b=object(BASE)[symbol];
 return b&&validDate(b.date)&&valid(b.amount)?{amount:Number(b.amount),date:b.date}:null;
}
function rowsOf(symbol){return ledger().filter(r=>r.symbol===symbol).sort((a,b)=>b.date.localeCompare(a.date));}
function netFor(symbol){
 if(!allowed.has(symbol))return null;
 const b=baseline(symbol),rows=rowsOf(symbol);
 if(b){const recent=rows.filter(x=>x.date>b.date);
  return {amount:b.amount+recent.reduce((sum,x)=>sum+x.net,0),kind:'baseline',
   asOf:b.date,additions:recent.length,rows:rows.length};
 }
 if(rows.length)return {amount:rows.reduce((sum,x)=>sum+x.net,0),
  kind:'ledger',rows:rows.length};
 return null;
}
function accountTotal(account,opening){
 const selected=CATALOG.filter(x=>x.account===account),symbols=new Set(selected.map(x=>x.key));
 const all=ledger().filter(r=>symbols.has(r.symbol));
 if(opening&&valid(opening.amount)&&validDate(opening.date)){
  const after=all.filter(r=>r.date>opening.date);
  return {amount:Number(opening.amount)+after.reduce((s,r)=>s+r.net,0),
   kind:'account-baseline',added:after.length,asOf:opening.date};
 }
 const amounts=selected.map(x=>netFor(x.key)),known=amounts.filter(Boolean);
 if(!known.length)return null;
 return {amount:known.reduce((s,x)=>s+x.amount,0),kind:'partial',
  known:known.length,total:selected.length};
}
function monthly(rows){
 const m=new Map();
 rows.forEach(r=>{
  const month=r.date.slice(0,7);
  if(!m.has(month))m.set(month,{month,amount:0,rows:[]});
  const x=m.get(month);x.amount+=r.net;x.rows.push(r);
 });
 return [...m.values()].sort((a,b)=>b.month.localeCompare(a.month));
}
function status(symbol){
 const x=netFor(symbol);
 if(!x)return '<div class="kr-div-card-line">누적 세후 배당·분배금 <b>미입력</b></div>';
 return '<div class="kr-div-card-line">누적 세후 배당·분배금 <b>'+money(x.amount)+'</b>'+
  '<small>'+(x.kind==='baseline'?'입력한 기존 누적금 + 기준일 이후 지급금':
    '날짜별 입력 합계 · 이전 기록 누락 가능')+'</small></div>';
}
function cardLine(id,price){
 const symbol='kiwoom:'+id,net=netFor(symbol);
 let html=status(symbol);
 const p=object('isa-private-positions-v1')[id]||{},qty=Number(p.qty),avg=Number(p.avg);
 if(net&&valid(price)&&Number(price)>0&&valid(p.qty)&&qty>0&&
  valid(p.avg)&&avg>0){
  const principal=qty*avg,profit=qty*Number(price)-principal;
  const inclusive=profit+net.amount;
  html+='<div class="kr-div-card-return">평가손익 '+signed(profit)+
   ' · <b>분배금 포함 총손익 '+signed(inclusive)+
   ' ('+(inclusive/principal*100>=0?'+':'')+(inclusive/principal*100).toFixed(2)+'%)</b></div>';
 }
 return '<div class="kr-div-card-info">'+html+'</div>';
}
function recordsHtml(symbol){
 const rows=rowsOf(symbol),net=netFor(symbol),b=baseline(symbol);
 if(!rows.length&&!b)return '<p class="kr-div-note">지급 기록이 없습니다. 실제 증권사에서 받은 세후 원화 금액을 입력하세요.</p>';
 let html='<p class="kr-div-note">누적 세후 지급금: <b>'+(net?money(net.amount):'미입력')+'</b>'+
  (b?' · 기존 누적 '+money(b.amount)+' (기준 '+clean(b.date)+')':' · 입력된 날짜별 기록만 합산')+
  '</p>';
 if(!rows.length)return html+'<p class="kr-div-note">입력된 주별 지급일이 없습니다.</p>';
 html+='<p class="kr-div-note">월별 지급 합계 · 월을 누르면 지급일을 펼쳐 확인할 수 있습니다.</p><div class="kr-dist-months">';
 html+=monthly(rows).map(g=>'<details class="kr-dist-month"><summary><b>'+clean(g.month)+'</b>'+
   '<span>'+money(g.amount)+' <small>('+g.rows.length+'건)</small></span></summary>'+
   '<div class="kr-dist-weeks">'+g.rows.map(r=>'<div class="kr-dist-week"><span><b>'+clean(r.date)+
    '</b> · 세후 '+money(r.net)+'<small>'+
    [r.gross!==null?'세전 '+money(r.gross):'',r.tax!==null?'세금 '+money(r.tax):'',
     r.reinvest!==null?'재투자 '+money(r.reinvest):''].filter(Boolean).join(' · ')+
    '</small></span><button type="button" class="kr-div-delete" data-kr-div-key="'+clean(r.key)+
    '" aria-label="'+clean(r.date)+' 지급기록 삭제">삭제</button></div>').join('')+'</div></details>').join('');
 return html+'</div>';
}
function renderRecordList(){
 const symbol=$('kr-div-symbol')?.value;
 if(!allowed.has(symbol))return;
 const host=$('kr-div-records');
 if(host)host.innerHTML=recordsHtml(symbol);
 const b=baseline(symbol);
 if($('kr-div-baseline'))$('kr-div-baseline').value=b?b.amount:'';
 if($('kr-div-baseline-date'))$('kr-div-baseline-date').value=b?.date||localDay();
 if(!host)return;
 host.querySelectorAll('[data-kr-div-key]').forEach(btn=>btn.addEventListener('click',()=>{
  const key=btn.getAttribute('data-kr-div-key');
  if(typeof window.confirm==='function'&&!window.confirm('선택한 실제 세후 분배금 기록을 삭제할까요?'))return;
  const previous=load(LEDGER,[]),all=ledger(),next=all.filter(r=>r.key!==key);
  if(next.length===all.length)return;
  // Fail closed if old stored records are malformed: don't discard unrecognized input.
  if(!Array.isArray(previous)||previous.length!==all.length){
   message('기존 기록 중 확인이 필요한 항목이 있어 삭제를 중단했습니다.');return;
  }
  try{localStorage.setItem(LEDGER,JSON.stringify(next));message('선택한 지급기록을 삭제했습니다.');refresh();}
  catch(_){message('삭제 저장 실패 · 기존 기록을 유지합니다.');}
 }));
}
function message(s){const el=$('kr-div-status');if(el)el.textContent=s;}
function refresh(){
 renderRecordList();
 renderTossCards();
 window.ISA_KR_APP?.renderCards?.();
 document.dispatchEvent(new Event('isa-kr-dividends-updated'));
}
function saveReceipt(){
 const symbol=$('kr-div-symbol')?.value,date=$('kr-div-date')?.value;
 const num=(id,required)=>{
  const raw=$(id)?.value.trim()||'';
  if(raw==='')return required?NaN:null;
  return Number(raw);
 };
 const net=num('kr-div-net',true),gross=num('kr-div-gross',false),
  tax=num('kr-div-tax',false),reinvest=num('kr-div-reinvest',false);
 if(!allowed.has(symbol)||!validDate(date)||!Number.isFinite(net)||net<=0||net>1e9||
  [gross,tax,reinvest].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>1e9))||
  (reinvest!==null&&reinvest>net)){
  message('지급일·세후 입금액을 확인하세요. 선택 입력 금액은 0원 이상, 재투자액은 세후 수령액 이하입니다.');return;
 }
 const raw=load(LEDGER,[]),existing=ledger();
 if(!Array.isArray(raw)||raw.length!==existing.length){
  message('기존 저장기록 중 인식하지 못하는 항목이 있어 저장을 중단했습니다. 삭제하지 않았습니다.');return;
 }
 const same=existing.filter(r=>r.symbol===symbol&&r.date===date);
 if(same.length){
  message(same.length===1&&Math.abs(same[0].net-net)<.005?
   '이미 같은 종목·지급일·세후 금액이 저장되어 있습니다. 중복 저장하지 않았습니다.':
   '이미 같은 종목·지급일 기록이 있습니다. 기존 지급액을 덮어쓰지 않았습니다.');return;
 }
 if(existing.length>=500){message('500건 한도에 도달했습니다.');return;}
 const row={key:'kr-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
  symbol,date,net,gross,tax,reinvest};
 try{
  localStorage.setItem(LEDGER,JSON.stringify(existing.concat(row)));
  if(!ledger().some(x=>x.key===row.key&&x.symbol===symbol&&x.date===date&&x.net===net))
   throw Error('저장 결과 확인 실패');
  for(const id of ['kr-div-net','kr-div-gross','kr-div-tax','kr-div-reinvest'])$(id).value='';
  refresh();message(date+' · '+money(net)+' 세후 분배금 저장 확인 (같은 지급일 중복 방지).');
 }catch(_){message('기록 저장 확인 실패. 브라우저 저장 권한을 확인해 주세요.');}
}
function saveBaseline(){
 const symbol=$('kr-div-symbol')?.value,date=$('kr-div-baseline-date')?.value,
  raw=$('kr-div-baseline')?.value.trim()||'';
 if(!allowed.has(symbol)||!validDate(date)||!valid(raw)||Number(raw)>1e10){
  message('기존 누적 세후금액과 기준일을 확인해 주세요.');return;
 }
 const old=object(BASE)[symbol];
 if(old&&(Number(old.amount)!==Number(raw)||old.date!==date)&&
  typeof window.confirm==='function'&&
  !window.confirm('해당 종목의 기존 누적 세후 지급금 기준을 변경할까요? 날짜별 지급기록은 유지됩니다.'))return;
 const next={...object(BASE),[symbol]:{amount:Number(raw),date}};
 try{localStorage.setItem(BASE,JSON.stringify(next));
  if(baseline(symbol)?.amount!==Number(raw))throw Error('verification');
  refresh();message('기존 누적 세후 지급금 기준 저장 완료. 기준일 이후 날짜별 지급금만 추가합니다.');
 }catch(_){message('누적 지급금 저장 실패 · 기존 지급일 기록은 보존됩니다.');}
}
function renderTossCards(){
 const host=$('kr-toss-dividend-cards');if(!host)return;
 const snapshot=object(SNAP),rows=snapshot.tossDomestic||{},date=snapshot.tdDate||null;
 host.innerHTML=TOSS.map(([id,name])=>{
  const symbol='toss:'+id,payout=netFor(symbol),item=rows[id],hasPnL=item&&
   Number.isFinite(Number(item.pnl))&&Number.isFinite(Number(item.value));
  let total='';
  const computed=window.ISA_PORTFOLIO_TOTALS?.row?.('domestic',id);
  if(computed){
   const cost=computed.invested,pnl=computed.profit,value=computed.value;
   total='<div class="kr-div-card-return">보유 '+(computed.qty===null?'미입력':computed.qty+'주')+
    ' · 평단 '+(computed.avg===null?'미입력':money(computed.avg))+
    ' · 매수원가 '+(cost===null?'미확인':money(cost))+'</div>';
   if(value!==null){
    const overall=payout?pnl+payout.amount:null;
    total+='<div class="kr-div-card-return">참고 평가 '+money(value)+
     ' · 평가손익 '+signed(pnl)+
     (overall!==null?' · <b>분배금 포함 총손익 '+signed(overall)+
      (cost>0?' ('+(overall>=0?'+':'')+(overall/cost*100).toFixed(2)+'%)':'')+'</b>':'')+
     ' <small>('+clean(computed.priceSource||'가격 근거 미확인')+' · '+
      clean(computed.priceDate||'날짜 미확인')+')</small></div>';
   }else total+='<p class="kr-div-note">평가액 미확인 · 검증된 시세 또는 사진 기준 가격 확인 필요</p>';
  }else if(payout&&hasPnL){
   const overall=Number(item.pnl)+payout.amount,cost=Number(item.value)-Number(item.pnl);
   total='<div class="kr-div-card-return">사진 기준 평가손익 '+signed(item.pnl)+
    ' · <b>분배금 포함 총손익 '+signed(overall)+
    (cost>0?' ('+(overall>=0?'+':'')+(overall/cost*100).toFixed(2)+'%)':'')+
    '</b> <small>(사진 기준 '+clean(date||'미확인')+')</small></div>';
  }
  return '<div class="kr-toss-dividend-card" data-toss-div-card="'+clean(id)+'"><b>'+clean(name)+'</b>'+
   status(symbol)+total+'</div>';
 }).join('');
}
function importPhoto(){
 const hash=String(window.location?.hash||'');
 if(!hash.startsWith('#krpayouts='))return;
 const removeHash=()=>{try{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}catch(_){}};
 try{
  const raw=decodeURIComponent(hash.slice('#krpayouts='.length)).split(';'),
   date=raw.shift(),patch={};
  if(!validDate(date))throw Error('사진 기준일 확인 필요');
  for(const text of raw){
   const pos=text.lastIndexOf(':'),key=text.slice(0,pos),value=text.slice(pos+1);
   if(pos<0||!allowed.has(key)||key in patch||!/^\d{1,11}$/.test(value)||
    Number(value)>1e10)throw Error('사진 지급금 형식 확인 필요');
   patch[key]=Number(value);
  }
  if(!Object.keys(patch).length)throw Error('사진 누적금액이 없습니다');
  if(typeof window.confirm==='function'&&
   !window.confirm('이전에 제공하신 '+date+' 엑셀 사진의 국내 종목별 세후 누적 지급금 '+
    Object.keys(patch).length+'건을 현재 브라우저에 적용할까요? 기존 기록을 덮어쓰지 않고, 더 새로운 누적금액은 유지합니다.'))return;
  const old=object(BASE),next={...old};let applied=0,kept=0;
  for(const [symbol,amount] of Object.entries(patch)){
   const v=baseline(symbol);
   if(v&&(v.date>date||(v.date===date&&v.amount>=amount))){kept++;continue;}
   if(v&&v.date<date&&v.amount>amount){kept++;continue;}
   next[symbol]={amount,date};applied++;
  }
  localStorage.setItem(BASE,JSON.stringify(next));
  refresh();
  message('사진 누적액 '+applied+'종목 반영 · 기존 최신 '+kept+
   '종목 유지. 기존 주별 지급기록 및 계좌 전체 누적액은 변경하지 않았습니다.');
 }catch(e){message('사진 분배금 적용 실패: '+String(e.message||e));}
 finally{removeHash();}
}
function mount(){
 const picker=$('kr-div-symbol');if(!picker)return;
 picker.innerHTML='<optgroup label="키움 ISA">'+KIWOOM.map(([id,name])=>
  '<option value="kiwoom:'+clean(id)+'">'+clean(name)+'</option>').join('')+'</optgroup>'+
  '<optgroup label="토스 국내주식">'+TOSS.map(([id,name])=>
  '<option value="toss:'+clean(id)+'">'+clean(name)+'</option>').join('')+'</optgroup>';
 picker.addEventListener('change',renderRecordList);
 $('kr-div-save')?.addEventListener('click',saveReceipt);
 $('kr-div-baseline-save')?.addEventListener('click',saveBaseline);
 $('kr-div-date').value=localDay();
 document.addEventListener('isa-rendered',renderTossCards);
 document.addEventListener('isa-portfolio-holdings-updated',renderTossCards);
 document.addEventListener('click',e=>{
  const card=e.target?.closest?.('[data-id]');
  if(card&&allowed.has('kiwoom:'+card.dataset.id)){
   picker.value='kiwoom:'+card.dataset.id;renderRecordList();
  }
 });
 importPhoto();
 refresh();
}
window.ISA_KR_DIVIDENDS={getNet:netFor,cardLine,accountTotal,refresh,monthly,ledger};
mount();
})();