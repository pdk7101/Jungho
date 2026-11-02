/* Signals are shown while this page is open. Optional browser notices need
 * the visitor to enable them, and CANNOT work when GitHub Pages is closed. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const cash=x=>Number(x).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원';
const NAMES={reit:'TIGER 리츠',robot:'RISE AI&로봇',space:'1Q 미국우주항공',sofr:'KODEX SOFR',tr:'KODEX 200TR',sol:'SOL 200타겟'};
const order=['robot','space','reit','sol','sofr','tr'];
const colors={buy:'매수 검토',stop:'매수 중지',wait:'확인 대기'};
const prior=new Map();let initialized=false;
function notice(item){
 if(!('Notification' in window)||Notification.permission!=='granted')return;
 try{
  const message=(item.type==='buy'?'매수 검토: ':'매수 중지 검토: ')+NAMES[item.id]+
   ' · '+(item.quote?cash(item.quote.price):'가격 미확인');
  const n=new Notification(message,{body:item.reason.slice(0,130)+' · 실제 키움 주문은 별도 설정',tag:'kr-isa-'+item.id});
  if(typeof n.close==='function')setTimeout(()=>n.close(),8000);
 }catch(_){ /* Mobile browsers sometimes disallow page notifications. */ }
}
function renderSignals(){
 const area=$('intraday-signal-list'),status=$('intraday-signal-status');
 if(!area||!status||!window.ISA_KR_APP)return;
 const api=window.ISA_KR_APP,result=api.quoteStatus?.()||{},quotes=result.quotes||{};
 const all=api.decisions?.()||[],byId=Object.fromEntries(all.map(x=>[x.id,x]));
 const todayQuotes=Object.keys(quotes).length;
 const active=window.ISA_livePriceFetch?.active?.(new Date())||false;
 const updated=result.checkedAt?new Date(result.checkedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}):'아직 조회하지 않음';
 const source=Object.values(quotes).some(q=>q.method==='published')?'일부 GitHub 게시 지연시세 포함':'공개 현재가 조회';
 status.textContent=(active?'한국장 장중':'한국장 장외')+' · 당일 검증 체결가 '+todayQuotes+'/6 · 마지막 조회 '+updated+
  (todayQuotes?' · '+source:' · 오늘 체결시각 검증 실패')+
  '. 자동 조회는 이 페이지가 열려 있을 때만 작동합니다.';
 const alertItems=[];
 area.innerHTML=order.map(id=>{
  const v=byId[id];
  if(!v)return '';
  const q=quotes[id],sourceNote=q?'오늘 체결 '+new Date(q.tradeAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})+
   (q.method==='published'?' · 지연 게시 시세':' · 직접 공개 시세'):'검증된 당일 체결가 없음 · 과거 일봉 참고';
  const text=(v.title||'')+' · '+(v.reason||'');
  const flag=v.type||'wait';
  // A Kiwoom fill is past execution; keep the independent next-session signal
  // visible without recommending a second purchase on the same trading day.
  const afterFill=id==='robot'?
   '<p class="sub"><b>체결 이후 추가매수 판단:</b> '+
   safe(flag==='buy'?
    '현재 조건은 매수 검토 '+(v.qty>0?v.qty+'주':'')+' · 오늘 이미 매수했다면 동일 조건으로 재매수하지 않고 다음 거래일 최신 시세로 다시 판단':
    flag==='stop'?
    '현재 조건은 매수 중지 · 다음 거래일 가격 상한과 추세를 다시 확인':
    '현재 조건은 매수 판단 대기 · 다음 거래일 가격·평단·추세 확인 후 다시 판단')+
   ' (키움 체결 여부와 독립된 분석 · 주문 실행 아님)</p>':'';

  if(q&&['robot','space','sol'].includes(id)){
   const key=flag+'|'+(v.qty??0);
   if(initialized&&prior.has(id)&&prior.get(id)!==key&&['buy','stop'].includes(flag))alertItems.push({...v,id,quote:q});
   prior.set(id,key);
  }else{
   prior.delete(id);
  }
  return '<div class="intraday-signal-row"><div class="intraday-signal-main"><strong>'+safe(NAMES[id])+'</strong>'+
   '<span class="intraday-signal-kind state-'+flag+'">'+safe(colors[flag]||'확인 대기')+(v.qty>0?' · '+v.qty+'주':'')+'</span></div>'+
   '<p class="sub">'+safe(sourceNote)+(q?' · '+cash(q.price):'')+'</p>'+
   '<p class="sub">'+safe(text)+'</p>'+afterFill+'</div>';
 }).join('');
 initialized=true;
 for(const item of alertItems)notice(item);
 if(alertItems.length){
  const el=$('intraday-signal-changes');
  if(el)el.textContent='새로운 매수·중지 검토 변화: '+alertItems.map(x=>NAMES[x.id]+' '+colors[x.type]).join(' · ')+
   ' — 실제 키움 주문은 자동 변경되지 않습니다.';
 }
}
function mount(){
 const base=$('summary');if(!base)return;
 const section=document.createElement('section');section.className='panel';section.id='intraday-signals';
 section.innerHTML='<h2>한국 ETF 당일 체결가 기반 매수·중지 신호</h2>'+
 '<p class="sub" id="intraday-signal-status">당일 시세 확인 전</p>'+
 '<p class="sub">상한: 로봇 9,500원 · 1Q 9,700원 · SOL 10,000원. 리츠 1/2/3주와 SOL 0/1주를 연동 판단합니다. 5·20일선은 마지막 확정 일봉이며 키움 주문은 변경되지 않습니다.</p>'+
 '<div id="intraday-signal-list"></div>'+
 '<p id="intraday-signal-changes" class="intraday-signal-changes" role="status" aria-live="polite"></p>'+
 '<button type="button" class="outline" id="intraday-enable-notifications">이 페이지가 열려 있을 때 변경 알림 사용</button>'+
 '<p class="sub" id="intraday-permission-note">알림 허용이 가능한 브라우저에서만 새 신호에 대한 알림을 표시합니다. 앱을 닫으면 자동 감시·푸시가 지속되지 않습니다. 가격 조회 실패 시 매수 신호를 내지 않습니다.</p>';
 base.insertAdjacentElement('beforebegin',section);
 $('intraday-enable-notifications').onclick=async()=>{
  const note=$('intraday-permission-note');
  if(!('Notification' in window)){note.textContent='이 브라우저에서는 알림이 지원되지 않습니다. 앱 내부 신호표를 확인하세요.';return;}
  try{
   const permission=await Notification.requestPermission();
   note.textContent=permission==='granted'?'변경 알림 허용됨 · 페이지가 열려 있을 때만 알림을 시도합니다.':
    '알림 권한 미허용. 페이지 내부 신호표로 확인할 수 있습니다.';
  }catch(_){note.textContent='알림 권한 요청 실패. 브라우저 설정에서 확인하거나 화면 내 신호표를 사용하세요.';}
 };
 document.addEventListener('isa-rendered',renderSignals);
 renderSignals();
}
mount();
})();