/* Unattended-order PREPARATION (never transmits an actual brokerage order).
 * Only public market data and private on-device order notes. */
(function(){
'use strict';
const STORE='isa-unattended-order-plan-v1', REGISTER='isa-unattended-order-status-v1';
const DEFAULT={monthlyMax:1000000,tradingDays:21,conyCashDaily:15000,reitDaily:1,sofrDaily:0,
 usSchdDaily:0,usAgncDaily:0,usSpymDaily:0,trQty:1,solMode:'standby'};
const FIELDS=['monthlyMax','tradingDays','conyCashDaily','reitDaily','sofrDaily',
 'usSchdDaily','usAgncDaily','usSpymDaily','trQty','solMode'];
const ORDER_IDS=['reit','robot','space','sofr','sol','tr','schd','agnc','spym','cony'];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원';
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch(_){return null;}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(_){return false;}};
const nowDay=()=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
};
let plan={...DEFAULT},statuses=read(REGISTER)||{},koItems={},koUpdated=null;
const previous=read(STORE);
if(previous&&typeof previous==='object')for(const f of FIELDS){
 if(f==='solMode'){if(['standby','exclusive'].includes(previous[f]))plan[f]=previous[f];continue;}
 const v=Number(previous[f]);
 if(previous[f]!==null&&previous[f]!==undefined&&String(previous[f]).trim()!==''&&Number.isFinite(v)&&v>=0){
  if(f==='monthlyMax'&&v>=1000&&v<=100000000)plan[f]=v;
  else if(f==='tradingDays'&&Number.isInteger(v)&&v>=1&&v<=25)plan[f]=v;
  else if(f!=='monthlyMax'&&f!=='tradingDays'&&v<=1000000)plan[f]=v;
 }
}
function domesticRules(){
 const s=read('isa-rules')||{};
 const val=(key,fallback)=>Number.isFinite(Number(s[key]))&&Number(s[key])>0?Number(s[key]):fallback;
 const ceil5=n=>Math.ceil(n/5)*5;
 const floor5=n=>Math.floor(n/5)*5;
 const caps={robot:val('robotCap',9500),space:val('spaceCap',9700),sol:val('solCap',10000),
  trBase:val('trBase',31150)};
 return {...caps,trTarget:floor5(caps.trBase*.95)};
}
function quoteK(id){
 const x=koItems[id];if(!x||!x.ok||!(x.close>0)||!x.date)return null;
 const dt=String(x.date);if(!/^\d{8}$/.test(dt))return null;
 const d=new Date(dt.slice(0,4)+'-'+dt.slice(4,6)+'-'+dt.slice(6,8)+'T00:00:00Z');
 const age=Date.now()-d.getTime();if(age<0||age>10*86400000)return null;
 return {price:Number(x.close),date:dt.slice(0,4)+'-'+dt.slice(4,6)+'-'+dt.slice(6,8)};
}
function instrumentRows(){
 const lim=domesticRules(),reit=quoteK('reit'),sofr=quoteK('sofr'),
  rob=quoteK('robot'),space=quoteK('space'),sol=quoteK('sol'),tr=quoteK('tr');
 const conyPaused=read('isa-cony-autobuy-plan-v1')?.status!=='review';
 const backupAllowed=plan.solMode==='exclusive';
 const rows=[
 {id:'reit',market:'KR',name:'TIGER 리츠부동산인프라',type:'정기적립',price:'현재가 확인 후',qty:plan.reitDaily+'주/거래일',
  enabled:plan.reitDaily>0,level:'계획 유지',cost:reit?reit.price*plan.reitDaily:null,
  remarks:'기본 매 거래일 1주. 로봇·우주항공 둘 다 상한 초과 시 3주 검토 규칙은 주문 시스템 간 자동 연동 불가. 가격 미확인이면 주문 조건 직접 확인'},
 {id:'robot',market:'KR',name:'RISE AI&로봇',type:'조건부 자동감시',price:'매수가 상한 '+money(lim.robot),qty:'최대 1주/기회',
  enabled:true,level:rob&&rob.price>lim.robot?'상한 초과 · 신규주문 보류':'상한 이내에서만 1주 검토',
  cost:lim.robot,remarks:'주문 조건: 설정한 상한 이하에서만 지정가 매수. 5일 감시 설정은 증권사에서 등록/유효기간 확인. 감시 발동 후 재등록 필요 여부 확인'},
 {id:'space',market:'KR',name:'1Q 미국우주항공테크',type:'조건부 자동감시',price:'매수가 상한 '+money(lim.space),qty:'최대 1주/기회',
  enabled:true,level:space&&space.price>lim.space?'상한 초과 · 신규주문 보류':'상한 이내에서만 1주 검토',
  cost:lim.space,remarks:'저가·추세 대기 중이어도 상한 이하 가격 감시주문은 실행될 수 있습니다. 상한만으로 반등 확인 불가. 주문 조건과 5일 유효기간 직접 점검'},
 {id:'sofr',market:'KR',name:'KODEX 미국달러SOFR',type:'정기적립',price:sofr?money(sofr.price)+'(확정종가)':'현재가 미확인',qty:plan.sofrDaily?plan.sofrDaily+'주/거래일':'수량 미설정',
  enabled:plan.sofrDaily>0,level:plan.sofrDaily?'정기 적립 설정 확인':'기존 적립 유지 · 수량 입력 필요',
  cost:plan.sofrDaily?(sofr?sofr.price*plan.sofrDaily:null):0,
  remarks:'기존 정기 적립을 유지하되 실제 주기·수량을 입력해 월 예산에 포함. 입력 전에는 예산이 과소계산될 수 있음'},
 {id:'sol',market:'KR',name:'SOL 200타겟위클리커버드콜',type:'대체매수',price:'상한 '+money(lim.sol),qty:backupAllowed?'최대 1주(별도 단독 선택)':'0주(예비)',
  enabled:backupAllowed,level:backupAllowed?'기타 겹치는 주문 해제 확인 필수':'대체매수 대기',
  cost:backupAllowed?lim.sol:0,
  remarks:'로봇·우주항공 중 한 종목의 상한 초과 시에만 대체 1주 검토. 독립적인 사전 조건주문으로 두 종목의 상한초과를 자동 판정하지 못함. 동시 주문하면 의도하지 않은 중복 매수 위험'},
 {id:'tr',market:'KR',name:'KODEX 200TR',type:'5% 하락 감시',price:'기준 '+money(lim.trBase)+' → 감시 '+money(lim.trTarget),
  qty:plan.trQty+'주/발동',enabled:plan.trQty>0,level:'감시조건 등록 후 감시중 확인',
  cost:plan.trQty*lim.trTarget,
  remarks:'기준가 대비 5% 하락한 '+money(lim.trTarget)+' 이하에서 최대 '+plan.trQty+'주 검토. 이전 5일 감시주문이 살아 있는지 중복 확인. 등록=체결 아님'},
 {id:'schd',market:'US',name:'SCHD',type:'토스 주식모으기(선택)',price:'평단/총수익과 별도',qty:plan.usSchdDaily?money(plan.usSchdDaily)+'/일':'일일 금액 미입력',
  enabled:plan.usSchdDaily>0,level:plan.usSchdDaily?'사용자 설정 금액 확인':'자동매수 여부 미설정',
  cost:plan.usSchdDaily,remarks:'CONY 이후 분배금 재투자 우선순위 1. 원화 금액으로 토스 자동모으기 설정 확인. 기존 토스 주문을 프로그램이 변경하지 않음'},
 {id:'agnc',market:'US',name:'AGNC',type:'토스 주식모으기(선택)',price:'금리·BVPS 위험 별도',
  qty:plan.usAgncDaily?money(plan.usAgncDaily)+'/일':'일일 금액 미입력',enabled:plan.usAgncDaily>0,
  level:plan.usAgncDaily?'사용자 설정 금액 확인':'자동매수 여부 미설정',
  cost:plan.usAgncDaily,remarks:'재투자 우선순위 2. 모기지 리츠 개별주로 배당 지속성·BVPS 확인 없이 자동매수 확대하지 않기'},
 {id:'spym',market:'US',name:'SPYM',type:'토스 주식모으기(선택)',price:'지수형 분산 투자',
  qty:plan.usSpymDaily?money(plan.usSpymDaily)+'/일':'일일 금액 미입력',enabled:plan.usSpymDaily>0,
  level:plan.usSpymDaily?'사용자 설정 금액 확인':'자동매수 여부 미설정',
  cost:plan.usSpymDaily,remarks:'재투자 우선순위 3. 기존에 활성화된 자동매수가 있다면 금액을 입력해 월 예산에 포함'},
 {id:'cony',market:'US',name:'CONY',type:'자동매수 일시중단',price:'NAV·COIN·역분할 공시 확인 후 재검토',
  qty:conyPaused?'추가매수 0원/일':'자동재개 전 수동 검증',enabled:false,level:'중단 유지 · '+money(plan.conyCashDaily)+'/일 현금 적립',
  cost:0,remarks:'11월 1일 자동매수 일시정지 후 1~2주간 현금 모으기로 변경. 이전 15,000원/일 자동매수를 앱 신호만으로 재개하지 않음. 공식 NAV·분배금 포함 총수익률·COIN 반등 3~5거래일 확인 필요'}
 ];
 return rows;
}
function budget(){
 const rows=instrumentRows(),daily=rows.filter(x=>x.id!=='tr').reduce((n,x)=>n+(typeof x.cost==='number'?x.cost:0),0);
 const tr=rows.find(x=>x.id==='tr').cost,unknown=rows.filter(x=>x.enabled&&x.cost===null).map(x=>x.name);
 const cash=plan.conyCashDaily,monthly=(daily+cash)*plan.tradingDays+tr;
 return {daily,cash,tr,monthly,remaining:plan.monthlyMax-monthly,unknown,rows};
}
function statusFor(id){
 const st=statuses[id]||{},date=nowDay();
 const expired=st.expiry&&/^\d{4}-\d{2}-\d{2}$/.test(st.expiry)&&st.expiry<date&&st.status==='registered';
 return {status:st.status||'unregistered',expiry:st.expiry||'',expired};
}
function rowText(r){
 const x=statusFor(r.id),isDisabled=!r.enabled||r.id==='cony',state=isDisabled?'대기 / 중단':r.level;
 const orderState={unregistered:'미등록 또는 미확인',registered:'내가 증권사 등록 확인함',submitted:'주문 전송/발동 확인함',filled:'체결 확인함',closed:'취소/만료 확인함'}[x.status]||'미확인';
 return r.market+' | '+r.name+' | '+r.type+' | '+r.price+' | '+r.qty+' | '+state+
 ' | 기록 '+orderState+(x.expiry?' | 종료 '+x.expiry:'')+(x.expired?' (기한 지남, 실제 취소 여부 확인)':'')+
 '\n  주의: '+r.remarks;
}
function summaryText(){
 const b=budget(),t='사전 자동주문 준비표 ('+nowDay()+' · 개인 기록용, 실제 주문 미전송)';
 return [t,'월 최대 '+money(plan.monthlyMax)+' / 거래일 가정 '+plan.tradingDays+'일',
  '매일 조건부/정기 적립 최대 가정 '+money(b.daily)+' + CONY 매수 대신 현금 적립 '+money(b.cash),
  'KODEX200TR 1회 감시 예약금 '+money(b.tr),
  '월 계획 사용·유보액 '+money(b.monthly)+(b.unknown.length?' [계산 누락: '+b.unknown.join(', ')+']':''),
  '잔여 예산 '+money(b.remaining),...(b.rows.map(rowText)),
  '주의: 이 페이지는 거래소/증권사로 주문을 보내지 않습니다. 증권사에서 조건·유효기간·감시중/주문발동/체결을 직접 확인해야 합니다.',
  'SOL은 로봇·우주항공의 실시간 중단 여부를 브로커 간 자동 연동하지 못하므로 단독 대체 모드일 때만 수동으로 전환하세요.'
 ].join('\n\n');
}
function render(){
 const root=$('unattended-orders');if(!root)return;
 const b=budget(),bad=b.remaining<0,partial=b.unknown.length>0;
 const stat=$('uo-budget');
 stat.innerHTML='<div class="uo-summary-grid"><div>월 투자·현금 유보 한도<strong>'+money(plan.monthlyMax)+'</strong></div>'+
 '<div>매일 최대 가정(매수+현금적립)<strong>'+money(b.daily+b.cash)+'</strong></div>'+
 '<div>월 예상 사용·유보액<strong>'+money(b.monthly)+'</strong></div>'+
 '<div>남은 예산<strong class="'+(bad?'uo-danger':'')+'">'+money(b.remaining)+'</strong></div></div>'+
 (bad?'<p class="uo-danger">월 최대 투자예산을 초과합니다. 자동주문 금액이나 수량을 낮추세요.</p>':'')+
 (partial?'<p class="uo-danger">예산 미확정: '+b.unknown.map(esc).join('·')+' 가격 미확인. 현금 부족을 방지하려면 키움 최신 가격을 확인하세요.</p>':'')+
 '<p class="sub">매 거래일 같은 주문을 재등록·반복한다고 가정한 보수적 최대 예산입니다. 주말·공휴일·환율·수수료·중복 증권사 자동주문을 반영한 확정 금액이 아닙니다. CONY 재매수 중단에 따른 현금적립 '+money(b.cash)+'/일도 예산에 포함합니다.</p>';
 const rows=b.rows;
 $('uo-order-list').innerHTML=rows.map(r=>{
 const s=statusFor(r.id);
 return '<div class="uo-order"><div class="uo-order-top"><b>'+esc(r.name)+'</b><span>'+esc(r.market)+' · '+esc(r.type)+'</span></div>'+
  '<p><strong>'+esc(r.price)+'</strong> · '+esc(r.qty)+'</p>'+
  '<p class="uo-state">'+esc(r.level)+'</p>'+
  '<p class="sub">'+esc(r.remarks)+'</p>'+
  '<div class="uo-record"><label>증권사 처리상태(직접 확인 후 기록)<select data-order-status="'+r.id+'">'+
  [['unregistered','미등록/미확인'],['registered','증권사 등록 확인'],['submitted','주문 전송 확인'],['filled','체결 확인'],['closed','취소·만료 확인']].map(([k,v])=>
  '<option value="'+k+'"'+(s.status===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
  '<label>증권사 감시 만료일(선택)<input type="date" data-order-expiry="'+r.id+'" value="'+esc(s.expiry)+'"></label></div>'+
  (s.expired?'<p class="uo-danger">기록한 만료일이 지났습니다. 증권사에서 실제 감시상태를 확인하세요. 앱에서 자동 취소되지 않습니다.</p>':'')+
  '</div>';
 }).join('');
 root.querySelectorAll('select[data-order-status]').forEach(el=>el.onchange=()=>{
  const id=el.dataset.orderStatus;statuses[id]={...(statuses[id]||{}),status:el.value,changed:nowDay()};
  if(!save(REGISTER,statuses))$('uo-message').textContent='이 기기의 주문 기록 저장 실패';else $('uo-message').textContent='기기 안에만 상태를 기록했습니다. 실제 증권사 주문 상태는 별개입니다.';
  render();
 });
 root.querySelectorAll('input[data-order-expiry]').forEach(el=>el.onchange=()=>{
  const id=el.dataset.orderExpiry;statuses[id]={...(statuses[id]||{}),expiry:el.value,changed:nowDay()};
  if(!save(REGISTER,statuses))$('uo-message').textContent='만료일 저장 실패';else $('uo-message').textContent='만료일 메모를 저장했습니다. 실제 증권사 감시 유효기간과 대조하세요.';
  render();
 });
}
function mount(){
 const anchor=$('summary');if(!anchor)return;
 const section=document.createElement('section');section.className='panel uo-panel';section.id='unattended-orders';
 section.innerHTML='<h2>출근 전 자동·조건부 주문 준비표</h2>'+
 '<p class="sub">근무 중 시세창을 보지 않아도 되도록 키움 ISA 조건부 자동감시주문·토스 주식모으기에 설정할 조건을 정리합니다. 이 사이트는 증권사에 주문을 보내거나 자동매수를 실행하지 않습니다.</p>'+
 '<div id="uo-budget"></div>'+
 '<details class="uo-settings"><summary>월 예산·매일 적립금·대체매수 설정</summary>'+
 '<div class="uo-inputs">'+
 [['monthlyMax','월 최대 투자·유보 예산 (원)',1000],['tradingDays','월 거래일 가정 (일)',1],
 ['conyCashDaily','CONY 중단 대신 현금 적립 (원/일)',1000],
 ['reitDaily','리츠 하루 자동 적립 (주)',1],['sofrDaily','SOFR 하루 자동 적립 (주)',1],
 ['usSchdDaily','SCHD 하루 자동매수 (원)',1000],['usAgncDaily','AGNC 하루 자동매수 (원)',1000],
 ['usSpymDaily','SPYM 하루 자동매수 (원)',1000],['trQty','200TR -5% 감시매수 수량 (주)',1]].map(([key,label,step])=>
 '<label>'+label+'<input data-uo-key="'+key+'" type="number" min="0" step="'+step+'" value="'+plan[key]+'"></label>').join('')+
 '<label>SOL 대체매수 모드<select data-uo-key="solMode"><option value="standby">기본: 대체매수 대기</option><option value="exclusive">단독 전환 검토 (기타 주문 중복 확인)</option></select></label></div>'+
 '<p class="sub">월 최대 100만 원은 이전에 말씀하신 상한입니다. 실제 예산은 본인이 조정할 수 있습니다. 로봇 9,500원·1Q 9,700원·SOL 10,000원 상한과 200TR -5% 기준은 국내주식 설정을 읽습니다.</p></details>'+
 '<div class="uo-list" id="uo-order-list"></div>'+
 '<div class="uo-controls"><button type="button" id="uo-copy">주문 준비표 복사</button><button type="button" id="uo-text">준비표 펼치기</button></div>'+
 '<textarea rows="9" id="uo-copy-area" readonly hidden aria-label="복사용 주문 준비표"></textarea>'+
 '<p class="sub" id="uo-message">감시조건 등록과 체결은 반드시 키움·토스 앱에서 확인하세요. 이 페이지의 기록은 실제 계좌와 동기화되지 않습니다.</p>';
 anchor.insertAdjacentElement('afterend',section);
 section.querySelectorAll('[data-uo-key]').forEach(el=>{
  if(el.dataset.uoKey==='solMode')el.value=plan.solMode;
  el.addEventListener('change',()=>{
   const key=el.dataset.uoKey;
   if(key==='solMode')plan.solMode=el.value;
   else{
    const v=el.value.trim()===''?0:Number(el.value);
    if(!Number.isFinite(v)||v<0||v>100000000||(key==='tradingDays'&&(v<1||v>25||!Number.isInteger(v)))||
      (['reitDaily','sofrDaily','trQty'].includes(key)&&!Number.isInteger(v))||(key==='monthlyMax'&&v<1000)){
     $('uo-message').textContent='유효한 0 이상 금액·정수 수량·월 거래일(1~25)을 입력하세요.';
     el.value=plan[key];return;
    }
    plan[key]=v;
   }
   if(!save(STORE,plan))$('uo-message').textContent='이 기기에 계획을 저장하지 못했습니다.';
   else $('uo-message').textContent='예산 및 자동주문 준비조건을 이 기기에 저장했습니다. 실제 증권사 설정은 변경되지 않습니다.';
   render();
  });
 });
 $('uo-copy').onclick=async()=>{
  const value=summaryText();const ta=$('uo-copy-area');ta.hidden=false;ta.value=value;
  try{await navigator.clipboard.writeText(value);$('uo-message').textContent='주문 준비표를 복사했습니다. 키움·토스 앱에 직접 등록해야 합니다.';}
  catch(_){ta.focus();ta.select();$('uo-message').textContent='자동 복사가 불가능해 주문 준비표를 표시했습니다. 텍스트를 길게 눌러 복사하세요.';}
 };
 $('uo-text').onclick=()=>{const el=$('uo-copy-area');el.hidden=!el.hidden;if(!el.hidden)el.value=summaryText();};
 render();
 fetch('./quotes.json?uo='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();})
 .then(d=>{koUpdated=d.fetchedAt;koItems=Object.fromEntries((d.items||[]).filter(x=>ORDER_IDS.includes(x.id)).map(x=>[x.id,x]));render();})
 .catch(()=>{if($('uo-message'))$('uo-message').textContent='국내 확정 종가 조회 실패. 가격이 없으면 예산은 미확정으로 표시됩니다. 등록 전 증권사에서 가격 확인 필요.';render();});
}
window.ISA_ORDER_PLAN={instrumentRows,budget,summaryText,domesticRules,statusFor};
mount();
})();