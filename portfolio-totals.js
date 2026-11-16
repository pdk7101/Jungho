/* On-device 14-position Toss cost-basis/valuation reconciliation.
 * Not a broker API or live account value. All personal data stays in localStorage.
 * Every holding uses one editing location: Toss domestic 9 here, US 4 in us-krw.js,
 * and the remaining US 1 here. No synthetic or guessed prices.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id),SNAP='isa-user-portfolio-snapshot-v1';
const TD='isa-private-toss-domestic-holdings-v1',US='isa-us-holdings-v1';
const MODE='isa-account-calculation-mode-v1';
const TOSS_KR=[
 ['tsofr','KODEX 미국달러SOFR금리액티브','sofr'],
 ['treit','TIGER 리츠부동산인프라','reit'],
 ['ttr','KODEX 200TR','tr'],
 ['biotech','마이티 신약포커스바이오액티브',null],
 ['tspace','1Q 미국우주항공테크','space'],
 ['media','TIGER 미디어컨텐츠',null],
 ['trobot','RISE AI&로봇','robot'],
 ['hongah','흥아해운',null],
 ['sensor','센서뷰',null]
];
const TOSS_US=['schd','spym','cony','agnc','spacex'];
const known=n=>n!==null&&n!==undefined&&String(n).trim()!==''&&Number.isFinite(Number(n))&&Number(n)>=0;
const positive=n=>known(n)&&Number(n)>0;
const fmt=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:2})+'원';
const qtyfmt=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:6});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key){
 try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}
 catch(_){return {};}
}
function seoulDay(){
 const v=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(new Date()).map(p=>[p.type,p.value]));
 return v.year+'-'+v.month+'-'+v.day;
}
function snapshotInfo(market,id){
 const s=read(SNAP);return {row:(market==='us'?s.us:s.tossDomestic)?.[id]||null,
  date:market==='us'?s.usDate||null:s.tdDate||null};
}
function row(market,id){
 if(market!=='us'&&market!=='domestic')return null;
 const us=market==='us',idOk=us?TOSS_US.includes(id):TOSS_KR.some(x=>x[0]===id);
 if(!idOk)return null;
 const key=us?US:TD,stored=read(key)[id]||{},shot=snapshotInfo(market,id);
 const snap=shot.row,oldQty=snap&&known(snap.qty)?Number(snap.qty):null;
 const qty=known(stored.qty)?Number(stored.qty):oldQty;
 let inferredAvg=positive(snap?.avg)?Number(snap.avg):null;
 if(inferredAvg===null&&positive(oldQty)&&known(snap?.value)&&known(snap?.pnl)){
  const basis=Number(snap.value)-Number(snap.pnl);
  if(basis>=0)inferredAvg=basis/oldQty;
 }
 const avg=positive(us?stored.krwAvg:stored.avg)?Number(us?stored.krwAvg:stored.avg):inferredAvg;
 const edited=known(stored.qty)||positive(us?stored.krwAvg:stored.avg);
 let unitPrice=null,priceSource=null,priceDate=null,priceMode='none';
 if(us&&id!=='spacex'){
  try{
   const usd=window.ISA_US_APP?.getPrice?.(id);
   const q=window.ISA_US_KRW?.priceKrw?.(id,usd);
   if(positive(q?.amount)){
    unitPrice=Number(q.amount);priceSource=q.source||'비공식 미국주식 원화 환산';
    priceDate=q.stamp||null;priceMode='us-reference';
   }
  }catch(_){}
 }
 if(!us){
  const mapped=TOSS_KR.find(x=>x[0]===id)?.[2];
  if(mapped){
   try{
    const q=window.ISA_KR_APP?.decisions?.().find(x=>x.id===mapped);
    if(q?.verified&&positive(q.quote)){
     unitPrice=Number(q.quote);priceSource=q.hasIntraday?'비공식 당일 조회가격':'확정 일봉 참고';
     priceDate=q.quoteDate||null;priceMode='kr-reference';
    }
   }catch(_){}
  }
 }
 if(unitPrice===null&&positive(oldQty)&&known(snap?.value)){
  unitPrice=Number(snap.value)/oldQty;
  priceSource='과거 증권사 사진 환산 단가';priceDate=shot.date;priceMode='photo';
 }
 const zero=qty===0,hasBasis=zero||(qty!==null&&avg!==null&&qty>=0);
 const hasPrice=zero||hasBasis&&unitPrice!==null;
 const invested=hasBasis?(zero?0:qty*avg):null;
 const value=hasPrice?(zero?0:qty*unitPrice):null;
 return {market,id,qty,avg,invested,value,profit:value!==null?value-invested:null,
  edited,unitPrice,priceSource,priceDate,priceMode,fromSnapshot:!edited&&!!snap,
  hasBasis,hasPrice};
}
function totals(){
 const us=TOSS_US.map(id=>row('us',id)),domestic=TOSS_KR.map(x=>row('domestic',x[0]));
 const rows=us.concat(domestic),basis=rows.filter(x=>x.hasBasis),values=rows.filter(x=>x.hasPrice);
 const invested=basis.length===14?rows.reduce((s,x)=>s+x.invested,0):null;
 const value=values.length===14?rows.reduce((s,x)=>s+x.value,0):null;
 const used=rows.filter(x=>x.qty>0);
 const stamps=[...new Set(used.map(x=>x.priceDate||'미확인'))];
 const prices={photo:rows.filter(x=>x.qty>0&&x.priceMode==='photo').length,
  reference:rows.filter(x=>x.qty>0&&x.priceMode!=='none'&&x.priceMode!=='photo').length,
  missing:rows.filter(x=>x.qty>0&&x.priceMode==='none').length};
 const note=['토스 미국 5·국내 9종목 보유수량 × 원화평단 자동합계',
  '기록 '+basis.length+'/14종목'];
 if(basis.length<14)note.push('매수원가 미입력 '+(14-basis.length)+'종목');
 if(values.length<14)note.push('평가액 미확인 '+(14-values.length)+'종목');
 if(prices.photo)note.push('과거 사진 가격 '+prices.photo+'종목 (실시간 아님)');
 if(prices.reference)note.push('비공식 참고가격 '+prices.reference+'종목');
 return {invested,value,knownInvested:basis.reduce((s,x)=>s+x.invested,0),
  knownValue:values.reduce((s,x)=>s+x.value,0),completeBasis:basis.length===14,
  completeValue:values.length===14,rows,count:14,knownCount:basis.length,
  valuedCount:values.length,date:stamps.length===1&&stamps[0]!=='미확인'?stamps[0]:null,
  mixedDates:stamps.length!==1||stamps[0]==='미확인',prices,
  source:note.join(' · ')};
}
function markAuto(account){
 if(!['toss','kiwoom'].includes(account))return;
 const before=read(MODE);
 try{localStorage.setItem(MODE,JSON.stringify({...before,[account]:'auto',updatedAt:seoulDay()}));}
 catch(_){return;}
 document.dispatchEvent(new Event('isa-portfolio-holdings-updated'));
}
function labelText(r){
 const p=r.invested!==null?'보유 매수원가 '+fmt(r.invested):'매수원가 미입력';
 const v=r.value!==null?' · 참고 평가 '+fmt(r.value):' · 평가액 미확인';
 return p+v+(r.priceMode==='photo'?' · 과거 사진가격 '+(r.priceDate||'날짜 미확인'):'');
}
function renderEditor(containerId,market,ids){
 const place=$(containerId);if(!place)return;
 const holdings=read(market==='us'?US:TD);
 place.innerHTML=ids.map(([id,name])=>{
  const r=row(market,id),saved=holdings[id]||{},qty=known(saved.qty)?saved.qty:'',
   avg=positive(market==='us'?saved.krwAvg:saved.avg)?
    (market==='us'?saved.krwAvg:saved.avg):'',
   source=r.fromSnapshot?'기존 사진 참고값 (확인 후 입력 권장)':'기존 입력·사진값';
  const step=market==='us'?'0.000001':'1';
  return '<div class="pos-row" data-toss-editor-row="'+esc(id)+'"><div class="pos-name">'+esc(name)+
   '<div class="pos-sub">토스 '+(market==='us'?'미국주식':'국내주식')+' · '+esc(source)+
   '</div><small class="toss-holding-preview">'+esc(labelText(r))+'</small></div>'+
   '<label>보유수량 (주)<input type="number" min="0" step="'+step+
   '" data-toss-edit="'+esc(id)+'" data-market="'+market+'" data-kind="qty" value="'+
   esc(qty)+ '" placeholder="'+(r.qty===null?'수량':qtyfmt(r.qty))+'"></label>'+
   '<label>원화 평단가 (원)<input type="number" min="0" step="0.01" data-toss-edit="'+
   esc(id)+'" data-market="'+market+'" data-kind="avg" value="'+esc(avg)+
   '" placeholder="'+(r.avg===null?'평단 미확인':fmt(r.avg))+'"></label></div>';
 }).join('');
 place.querySelectorAll('input[data-toss-edit]').forEach(input=>{
  input.addEventListener('change',()=>{
   const id=input.dataset.tossEdit,kind=input.dataset.kind,raw=input.value.trim();
   const val=raw===''?null:Number(raw);
   const validQty=val!==null&&Number.isFinite(val)&&val>=0&&
    (market==='us'?Math.abs(val-Math.round(val*1e6)/1e6)<1e-9:Number.isSafeInteger(val));
   const validAvg=val!==null&&Number.isFinite(val)&&val>0&&val<=1e9;
   const hint=$(market==='us'?'toss-other-us-message':'toss-domestic-message');
   if(val!==null&&!(kind==='qty'?validQty:validAvg)){
    if(hint)hint.textContent='보유수량은 '+(market==='us'?'소수점 6자리까지':'0 이상 정수')+
     ', 원화 평단은 0원 초과로 입력해 주세요.';
    return;
   }
   const key=market==='us'?US:TD,old=read(key),entry={...(old[id]||{})};
   const field=kind==='qty'?'qty':market==='us'?'krwAvg':'avg';
   if(val===null)delete entry[field];else entry[field]=val;
   entry.updatedAt=seoulDay();
   try{
    localStorage.setItem(key,JSON.stringify({...old,[id]:entry}));
    if(JSON.parse(localStorage.getItem(key)||'{}')?.[id]?.[field]!==entry[field])
     throw Error('저장 검증 실패');
   }catch(_){if(hint)hint.textContent='저장 확인 실패 · 기존 값은 유지되어야 합니다.';return;}
   markAuto('toss');
   renderEditor(containerId,market,ids);
   window.ISA_KR_DIVIDENDS?.refresh?.();
   window.ISA_ACCOUNT_SUMMARY?.refresh?.();
   if(hint)hint.textContent=esc(name)+' 보유정보 저장 · 토스 투자원가와 상단 합계를 다시 계산했습니다.'; 
  });
 });
}
function renderEditors(){
 renderEditor('toss-domestic-positions','domestic',TOSS_KR.map(([id,name])=>[id,name]));
 renderEditor('toss-other-us-positions','us',[['spacex','토스 미국 기타 1종목 (스페이스X 사진 기록)']]);
}
window.ISA_PORTFOLIO_TOTALS={totals,row,markAuto,renderEditors,getMode:()=>read(MODE)};
renderEditors();
window.addEventListener('pageshow',()=>renderEditors());
})();
