/* Workday-friendly manual review of Kiwoom daily stock collection, Toss daily stock
 * collection and one Kiwoom KODEX 200TR broker-side watch order.
 * This static page NEVER authenticates with brokers, places, pauses or cancels orders. */
(function(){
'use strict';
const PLAN='isa-unattended-order-plan-v1',STATE='isa-unattended-order-status-v1';
const DEFAULT={monthlyMax:1000000,tradingDays:21,conyCashDaily:15000,conyCashDays:10,
 reitDaily:1,robotDaily:1,spaceDaily:1,sofrDaily:0,solDaily:1,trQty:1,
 usSchdDaily:4000,usAgncDaily:3000,usSpymDaily:3000,solMode:'standby'};
const LABELS={
 reit:'TIGER 리츠부동산인프라',robot:'RISE AI&로봇',space:'1Q 미국우주항공테크',
 sofr:'KODEX 미국달러SOFR',sol:'SOL 200타겟위클리커버드콜',tr:'KODEX 200TR',
 schd:'SCHD',agnc:'AGNC',spym:'SPYM',cony:'CONY'
};
const KR=['reit','robot','space','sofr','sol'],US=['schd','agnc','spym','cony'];
const $=id=>document.getElementById(id);
const won=n=>Math.round(Number(n)).toLocaleString('ko-KR')+'원';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateK=()=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(z=>[z.type,z.value]));
 return p.year+'-'+p.month+'-'+p.day;
};
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}};
const pos=n=>Number.isFinite(Number(n))&&Number(n)>0&&n!==null&&n!==''&&n!==undefined;
const plan={...DEFAULT},saved=read(PLAN);
for(const key of Object.keys(DEFAULT)){
 const v=saved?.[key];
 if(v===null||v===undefined||v==='')continue;
 if(key==='solMode'){if(['standby','exclusive'].includes(v))plan[key]=v;continue;}
 const n=Number(v);
 if(!Number.isFinite(n)||n<0||n>100000000)continue;
 if(key==='monthlyMax'&&n>=1000)plan[key]=n;
 else if(['tradingDays','conyCashDays'].includes(key)&&Number.isInteger(n)&&n>=1&&n<=25)plan[key]=n;
 else if(!['monthlyMax','tradingDays','conyCashDays'].includes(key))plan[key]=n;
}
/* The previous app stored zero placeholders for the three Toss daily amounts.
 * One-time on-device migration corrects those placeholder values without
 * replacing a later user adjustment, including an explicit future zero. */
const MIGRATION='isa-toss-daily-amounts-2026-11-02-v1';
if(!read(MIGRATION)){
 const restored={schd:4000,agnc:3000,spym:3000};
 for(const [id,amount] of Object.entries(restored)){
  const field='us'+id[0].toUpperCase()+id.slice(1)+'Daily';
  if(plan[field]===0)plan[field]=amount;
 }
 // Migration marker only when both writes succeed; never touch broker settings.
 if(save(PLAN,plan))save(MIGRATION,{applied:true,date:'2026-11-02'});
}
let records=read(STATE)||{};
function rules(){
 const s=read('isa-rules')||{},val=(k,f)=>pos(s[k])?Number(s[k]):f;
 const robot=val('robotCap',9500),space=val('spaceCap',9700),sol=val('solCap',10000),trBase=val('trBase',31150);
 return {robot,space,sol,trBase,trPrice:Math.floor(trBase*.95/5)*5};
}
function krDecisions(){
 const a=window.ISA_KR_APP?.decisions?.();
 return Array.isArray(a)?Object.fromEntries(a.map(x=>[x.id,x])):{};
}
function usDecision(id){
 try{return window.ISA_US_SIGNAL?.decision?.(id)||null}catch(_){return null}
}
function tossDailyKrw(id){
 if(id==='cony')return plan.conyCashDaily;
 const key={schd:'usSchdDaily',agnc:'usAgncDaily',spym:'usSpymDaily'}[id];
 return key?Number(plan[key])||0:null;
}
function note(id){
 const old=records[id]||{};
 let value=old.status||'unknown';
 if(value==='registered')value=id==='tr'?'watching':'running';
 if(value==='submitted')value=id==='tr'?'watching':'unknown';
 if(value==='filled')value=id==='tr'?'filled':'unknown';
 if(value==='closed')value=id==='tr'?'expired':'paused';
 if(!['unknown','running','paused','watching','filled','expired'].includes(value))value='unknown';
 return {value,date:old.checkedDate||old.changed||'',expiry:old.expiry||''};
}
function category(type,title,reason,sourceDate,manual=false){
 if(type==='buy')return {value:'keep',label:'매수 유지 검토',reason,sourceDate,manual};
 if(type==='stop')return {value:'pause',label:'매수 중지 검토',reason,sourceDate,manual};
 // No confirmed up-to-date signal -> do not claim safe to start/stop.
 if(/미확인|자료|시세|오래된|수동|재확인|입력 대기|보유량 입력/.test(title))
  return {value:'unknown',label:'자료 확인 필요',reason,sourceDate,manual};
 return {value:'pause',label:'매수 중지 검토',reason,sourceDate,manual};
}
function pairInfo(){
 const p=window.ISA_KR_APP?.pairPlan?.();
 return p&&typeof p.known==='boolean'?p:{known:false,robot:'wait',space:'wait',reitQty:null,solQty:null,stopped:null,sources:{}};
}
function decisions(){
 const kd=krDecisions(),pair=pairInfo(),limit=rules();
 const result={};
 for(const id of KR){
  const x=kd[id];
  let v=!x?category('wait','자료 미확인','국내주식 판단 데이터가 아직 로드되지 않았습니다.',null):
    category(x.type,x.title,x.reason,x.quoteDate,!!x.hasIntraday);
  if(id==='reit'){
   v=pair.known?{value:'keep',label:'리츠 '+pair.reitQty+'주 적립 검토',
    reason:'로봇·우주항공 '+pair.stopped+'종목 중지 → 리츠 '+pair.reitQty+'주. 키움 주식모으기 수량은 앱에서 자동 조정되지 않습니다.',
    sourceDate:x?.quoteDate||null}:
    {value:'unknown',label:'리츠 수량 확인 필요',reason:'로봇·우주항공의 매수/중지 상태가 불확실해 리츠 1·2·3주를 결정하지 않습니다.',
     sourceDate:x?.quoteDate||null};
  }
  if(id==='sol'){
   if(!pair.known)v={value:'unknown',label:'SOL 연동조건 확인 필요',
    reason:'로봇·우주항공이 각각 매수중/중지 중 어디에 해당하는지 확인 필요. SOL을 임의로 0·1주 결정하지 않습니다.',
    sourceDate:x?.quoteDate||null};
   else if(pair.solQty===0)v={value:'pause',label:'SOL 0주 · 매수 중지 검토',
    reason:'로봇·우주항공 모두 매수 → SOL 0주. 이미 매수중이면 키움 주식모으기 중지를 직접 확인해야 합니다.',
    sourceDate:x?.quoteDate||null};
   else if(x?.type==='stop')v={value:'pause',label:'SOL 상한 초과 · 매수 중지 검토',
    reason:'로봇·우주항공 한 종목 이상 중지해 SOL 1주 조건이지만, SOL 매수상한 '+won(limit.sol)+'을 초과해 매수를 보류합니다.',
    sourceDate:x?.quoteDate||null};
   else if(x?.type==='wait'&&/미확인|오래된|상한 미설정|수동/.test(x.title||''))v={
    value:'unknown',label:'SOL 원화가격 확인 필요',reason:'SOL 1주 조건이지만 SOL 시세·매수상한 확인이 불완전합니다. 임의 재개하지 마세요.',
    sourceDate:x?.quoteDate||null};
   else v={value:'keep',label:'SOL 1주 매수 검토',
    reason:'로봇·우주항공 '+pair.stopped+'종목 중지 → SOL 1주. 매수상한 '+won(limit.sol)+' 이내, 키움에서 실제 수량·활성 상태를 별도 확인하세요.',
    sourceDate:x?.quoteDate||null};
  }
  result[id]=v;
 }
 for(const id of US){
  const x=usDecision(id);
  result[id]=id==='cony'?
    {value:'pause',label:'CONY 자동매수 중지 유지',reason:'11월 1일에 일 15,000원 자동매수를 일시중단하고 1~2주간 현금을 모으기로 한 최근 계획을 우선합니다. NAV·COIN 안정·총수익률·역분할 공시 확인 전 자동 재개를 권하지 않습니다.',sourceDate:x?.sourceDate||null}:
    !x?category('wait','시세 미확인','미국주식 매수 판단 자료를 아직 읽지 못했습니다.',null):
     category(x.type,x.title,x.reason,x.sourceDate,!!x.quoteManual);
 }
 return result;
}
function rows(){
 const d=decisions(),r=rules(),pair=pairInfo(),result=[];
 for(const id of KR){
  let info='';
  if(id==='robot')info='가격 상한 '+won(r.robot)+' · 1일 최대 '+plan.robotDaily+'주 (상한 자동 정지 불가)';
  if(id==='space')info='가격 상한 '+won(r.space)+' · 1일 최대 '+plan.spaceDaily+'주 (상한 자동 정지 불가)';
  if(id==='reit')info=pair.known?'로봇·우주항공 '+pair.stopped+'종목 중지 → 리츠 '+pair.reitQty+'주/거래일 권고 (키움 실제 수량 자동 변경 불가)':'상태 확인 전 리츠 1·2·3주 미확정';
  if(id==='sofr')info=plan.sofrDaily?plan.sofrDaily+'주/거래일 계획':'주식모으기 수량 미입력 · 실제 등록량 확인 필요';
  if(id==='sol')info='매수·중지 상태에 따라 SOL '+(pair.known?pair.solQty+'주':'미확정')+' · 상한 '+won(r.sol)+' · 키움 실제 주문 미변경';
  result.push({id,name:LABELS[id],broker:'키움증권',mode:'매일 주식모으기',details:info,...d[id]});
 }
 result.push({id:'tr',name:LABELS.tr,broker:'키움증권',mode:'자동감시주문',
  details:won(r.trPrice)+' 이하 하락 감시 · '+plan.trQty+'주/발동 (기준 '+won(r.trBase)+')',
  value:'watch',label:'감시주문 상태 확인',reason:'KODEX 200TR만 자동감시주문입니다. 지정된 조건과 유효기간, 미체결·체결·중복 등록 상태를 키움에서 확인하세요. 앱에서 자동으로 주문을 등록·변경하지 않습니다.',sourceDate:null});
 for(const id of US){
  let amount=id==='schd'?plan.usSchdDaily:id==='agnc'?plan.usAgncDaily:id==='spym'?plan.usSpymDaily:0;
  result.push({id,name:LABELS[id],broker:'토스증권',mode:'매일 주식모으기',
   details:id==='cony'?'원래 매일 '+won(plan.conyCashDaily)+' 주식모으기 · 현재 중지 · 동일 금액 현금 유보':
   amount>0?won(amount)+'/거래일 예정':'모으기 금액 미입력 · 실제 등록금액 확인 필요',
   ...d[id]});
 }
 return result;
}
function budget(){
 const r=rules(),pair=pairInfo(),qty=id=>Math.max(0,Number(plan[id])||0);
 const shareRobot=pair.known?(pair.robot==='buy'?qty('robotDaily'):0):qty('robotDaily');
 const shareSpace=pair.known?(pair.space==='buy'?qty('spaceDaily'):0):qty('spaceDaily');
 const shareReit=pair.known?pair.reitQty:3;
 const shareSol=pair.known?pair.solQty:1;
 const uncertain=!pair.known;
 const rob=shareRobot*r.robot,space=shareSpace*r.space,sol=shareSol*r.sol;
 const watch=qty('trQty')*r.trPrice,us=qty('usSchdDaily')+qty('usAgncDaily')+qty('usSpymDaily');
 const kd=krDecisions(),reitQuote=kd.reit?.quote||null,sofrQuote=kd.sofr?.quote||null;
 const reitValid=pos(reitQuote),sofrValid=pos(sofrQuote);
 const kReit=reitValid?shareReit*Number(reitQuote):0;
 const kSofr=qty('sofrDaily')&&sofrValid?qty('sofrDaily')*Number(sofrQuote):0;
 const unknown=[];
 if(shareReit&&!reitValid)unknown.push('리츠 현재가');
 if(qty('sofrDaily')&&!sofrValid)unknown.push('SOFR 현재가');
 if(!qty('sofrDaily'))unknown.push('SOFR 실제 모으기 수량');
 if(!qty('usSchdDaily'))unknown.push('SCHD 실제 모으기 금액');
 if(!qty('usAgncDaily'))unknown.push('AGNC 실제 모으기 금액');
 if(!qty('usSpymDaily'))unknown.push('SPYM 실제 모으기 금액');
 if(uncertain)unknown.push('로봇·우주항공 매수/중지 확인 전 · 보수적 최대치 예산 사용');
 const daily=rob+space+sol+kReit+kSofr+us,cash=qty('conyCashDaily')*qty('conyCashDays');
 const subtotal=daily*qty('tradingDays')+watch+cash;
 return {daily,watch,cash,subtotal,remaining:plan.monthlyMax-subtotal,unknown,
  estimatedOnly:unknown.length>0,rates:r,conditional:pair,shares:{robot:shareRobot,space:shareSpace,reit:shareReit,sol:shareSol},
  scenario:uncertain?'상태 미확정 → 보수적 최대 매수 가정':'조건별 예상 수량'};
}
function mismatch(row){
 const st=note(row.id),today=dateK(),prior=st.date&&st.date<today;
 if(row.id==='tr'){
  if(st.value==='watching'&&st.expiry&&st.expiry<today)return '감시 만료일 지남 · 키움 재등록 확인';
  if(st.value==='unknown')return '실제 감시 등록·유효기간 확인 필요';
  if(st.value==='filled')return '체결 확인 기록 · 중복 재매수 감시 여부 확인';
  if(st.value==='expired')return '만료·취소 기록 · 재등록 필요 여부 확인';
  return prior?'감시중 기록이 이전 날짜임 · 키움 확인':'';
 }
 if(row.value==='unknown')return '시세 또는 조건 확인 전 임의 재개하지 마세요';
 if(st.value==='unknown')return row.value==='pause'?'중지 권고 · 토스/키움 실제 모으기 상태 미확인':'유지 권고 · 실제 모으기 상태 미확인';
 if(row.value==='pause'&&st.value==='running')return '중지 권고와 증권사 모으기 기록 불일치 · 실제 중지 확인 필요';
 if(row.value==='keep'&&st.value==='paused')return '매수 유지 검토 상태지만 증권사 중지 기록 있음 · 재개 전 확인';
 if(prior)return '증권사 상태 기록이 오늘 확인한 것이 아님';
 return '';
}
function render(){
 const root=$('unattended-orders');if(!root)return;
 const data=rows(),budgetData=budget(),loc=$('uo-budget');
 loc.innerHTML='<div class="uo-summary-grid">'+
 '<div>월 계획 한도<strong>'+won(plan.monthlyMax)+'</strong></div>'+
 '<div>확인된 설정 기반 추정<strong>'+won(budgetData.subtotal)+'</strong></div>'+
 '<div>CONY 별도 현금 유보<strong>'+won(budgetData.cash)+'</strong></div>'+
 '<div>단순 잔여 추정<strong>'+won(budgetData.remaining)+'</strong></div></div>'+
 (budgetData.remaining<0?'<p class="uo-danger">월 최대 투자한도 초과 예상 · 매일 모으기 금액·수량 조정이 필요합니다.</p>':'')+
 (budgetData.estimatedOnly?'<p class="uo-danger">예산 미완성: '+budgetData.unknown.map(esc).join(' · ')+'. 등록금액 미확인은 0원으로 계산된 항목이 있으므로 남은 예산이 실제보다 많아 보일 수 있습니다.</p>':'')+
 '<p class="sub">리츠·SOL 조건별 예상 수량: 리츠 '+(budgetData.conditional.known?budgetData.shares.reit+'주':'미확정')+' / SOL '+(budgetData.conditional.known?budgetData.shares.sol+'주':'미확정')+' · '+esc(budgetData.scenario)+'</p>'+
 '<p class="sub">가격 상한은 참고 기준입니다. 주식모으기는 프로그램의 가격 판단을 따라 자동 중지되지 않습니다. 월 계산은 모든 날 설정액대로 주문되는 가정이며 변동 가격·환율·수수료는 제외합니다.</p>';
 const groups=[['키움증권',data.filter(r=>r.broker==='키움증권')],['토스증권',data.filter(r=>r.broker==='토스증권')]];
 $('uo-order-list').innerHTML=groups.map(([name,items])=>
  '<h3 class="uo-broker-title">'+esc(name)+'</h3>'+
  items.map(row=>{
   const st=note(row.id),warning=mismatch(row),statusLabel=row.value==='keep'?'매수 유지':row.value==='pause'?'매수 중지':row.value==='watch'?'자동감시':'자료 확인';
   const options=row.id==='tr'?
    [['unknown','미확인'],['watching','감시중 확인'],['paused','감시중지 확인'],['filled','체결 확인'],['expired','만료/취소 확인']]:
    [['unknown','미확인'],['running','주식모으기 매수중 확인'],['paused','주식모으기 중지 확인']];
   return '<details class="uo-order"><summary class="uo-order-top"><b>'+esc(row.name)+'</b>'+
    '<span>'+esc(row.mode)+'</span><em class="uo-action action-'+row.value+'">'+statusLabel+'</em></summary>'+
    '<p class="uo-state"><b>프로그램 판단:</b> '+esc(row.label)+'</p>'+
    '<p class="sub">'+esc(row.details)+'</p>'+
    '<p class="sub"><b>판단 이유:</b> '+esc(row.reason)+'</p>'+
    (row.sourceDate?'<p class="sub">분석 일봉 기준: '+esc(row.sourceDate)+(row.manual?' · 당일 시세 참고':'')+'</p>':
    '<p class="sub">분석 일봉 기준: 자료 확인 필요</p>')+
    (warning?'<p class="uo-danger">'+esc(warning)+'</p>':'')+
    '<div class="uo-record"><label>실제 증권사 상태 (사용자 확인 기록)<select data-uo-status="'+row.id+'">'+
    options.map(([v,l])=>'<option value="'+v+'"'+(st.value===v?' selected':'')+'>'+l+'</option>').join('')+
    '</select></label><label>'+(row.id==='tr'?'자동감시 만료일':'마지막 직접 확인 날짜')+
    (row.id==='tr'?'<input type="date" data-uo-expiry="'+row.id+'" value="'+esc(st.expiry)+'">':
    '<input type="text" readonly value="'+esc(st.date||'확인기록 없음')+'">')+'</label></div>'+
    '</details>';
  }).join('')).join('');
 root.querySelectorAll('[data-uo-status]').forEach(ctrl=>ctrl.addEventListener('change',()=>{
  const id=ctrl.dataset.uoStatus;
  records[id]={...(records[id]||{}),status:ctrl.value,checkedDate:dateK()};
  if(!save(STATE,records)){$('uo-message').textContent='이 기기에 상태를 저장하지 못했습니다.';return;}
  $('uo-message').textContent=dateK()+' 사용자가 확인한 증권사 상태만 기록했습니다. 실제 증권사 주문은 바뀌지 않았습니다.';
  render();
 }));
 root.querySelectorAll('[data-uo-expiry]').forEach(ctrl=>ctrl.addEventListener('change',()=>{
  const id=ctrl.dataset.uoExpiry;
  records[id]={...(records[id]||{}),expiry:ctrl.value,checkedDate:dateK()};
  if(!save(STATE,records)){$('uo-message').textContent='이 기기에 만료일을 저장하지 못했습니다.';return;}
  $('uo-message').textContent='만료일을 기록했습니다. 실제 감시 상태는 키움에서 확인해야 합니다.';
  render();
 }));
}
function checklist(){
 const rs=rows(),a=budget();
 return ['출근 전 주식모으기 매수·중지 점검 '+dateK(),
  '프로그램 권고일 뿐 증권사 주문·중지는 실행되지 않음',
  '월 한도 '+won(plan.monthlyMax)+' · 계산상 사용액 '+won(a.subtotal)+' (미확인: '+a.unknown.join(', ')+')',
  ...rs.map(r=>{
   const status=note(r.id),warning=mismatch(r);
   return r.broker+' / '+r.name+' / '+r.mode+' / '+r.label+
   ' / 사용자 기록 '+status.value+(warning?' / '+warning:'')+
   ' / '+r.details+' / '+r.reason;
  })].join('\n');
}
function mount(){
 const anchor=$('summary');if(!anchor)return;
 const section=document.createElement('section');section.className='panel uo-panel';section.id='unattended-orders';
 section.innerHTML='<h2>매일 주식모으기 매수·중지 점검</h2>'+
 '<p class="sub"><b>키움:</b> 국내 5종목은 매일 주식모으기, KODEX 200TR만 자동감시주문. <b>토스:</b> 미국주식은 매일 주식모으기. 현재 프로그램 판단과 증권사에 실제 설정한 상태는 다르므로 각각 확인해야 합니다.</p>'+
 '<p class="sub"><b>확인시점:</b> <span id="uo-today">'+dateK()+'</span> · 확정 일봉/비공식 가격 참고 · 이 웹페이지는 계좌에 접속하거나 자동매수를 중지·재개하지 않습니다.</p>'+
 '<div id="uo-budget"></div>'+
 '<details class="uo-settings"><summary>월 예산 및 실제 주식모으기 수량·금액 입력</summary>'+
 '<div class="uo-inputs">'+
 [['monthlyMax','월 투자·유보 예산 한도 (원)',1000],['tradingDays','월 거래일 가정',1],
 ['robotDaily','키움 로봇 매일 최대 수량(주)',1],
 ['spaceDaily','키움 1Q 매일 최대 수량(주)',1],['sofrDaily','키움 SOFR 매일 수량(주)',1],
 ['trQty','KODEX 200TR 감시 매수 수량(주)',1],
 ['usSchdDaily','토스 SCHD 매일 금액(원)',1000],
 ['usAgncDaily','토스 AGNC 매일 금액(원)',1000],
 ['usSpymDaily','토스 SPYM 매일 금액(원)',1000],
 ['conyCashDaily','CONY 중단으로 유보하는 현금(원/일)',1000],
 ['conyCashDays','CONY 현금 유보 거래일 수',1]
 ].map(([key,label,step])=>'<label>'+label+
 '<input data-uo-plan="'+key+'" type="number" min="0" step="'+step+'" value="'+plan[key]+'"></label>').join('')+
 '</div>'+ 
 '<p class="sub">0으로 남은 금액은 실제 모으기가 꺼져 있다는 뜻이 아니라 등록금액을 아직 입력하지 않았다는 뜻일 수 있습니다. 증권사에 설정한 금액을 정확히 입력해야 월 예산 계산이 맞습니다.</p></details>'+
 '<div id="uo-order-list" class="uo-list"></div>'+
 '<div class="uo-controls"><button type="button" id="uo-copy">오늘 점검표 복사</button>'+
 '<button type="button" id="uo-refresh">상태 다시 확인</button></div>'+
 '<textarea id="uo-copy-area" rows="7" hidden readonly aria-label="오늘 점검표"></textarea>'+
 '<p class="sub" id="uo-message">매일 주식모으기 유지·중지 판단은 앱을 열었을 때 표시됩니다. GitHub Pages가 증권사 계좌를 실시간 변경하지는 않습니다.</p>';
 anchor.insertAdjacentElement('afterend',section);
 section.querySelectorAll('[data-uo-plan]').forEach(inp=>{
  const key=inp.dataset.uoPlan;
  inp.addEventListener('change',()=>{
   {
    const val=inp.value.trim()===''?0:Number(inp.value),isDays=['tradingDays','conyCashDays'].includes(key);
    const isShares=['robotDaily','spaceDaily','sofrDaily','trQty'].includes(key);
    if(!Number.isFinite(val)||val<0||val>100000000||(isDays&&(!Number.isInteger(val)||val<1||val>25))||
     (isShares&&!Number.isInteger(val))||(key==='monthlyMax'&&val<1000)){
     inp.value=plan[key];$('uo-message').textContent='금액·정수 수량·거래일(1~25)을 확인하세요.';return;
    }
    plan[key]=val;
   }
   if(!save(PLAN,plan))$('uo-message').textContent='기기 저장소에 예산을 저장하지 못했습니다.';
   else $('uo-message').textContent='계획만 기기에 저장했습니다. 실제 증권사 주식모으기 상태에는 영향을 주지 않습니다.';
   render();
  });
 });
 $('uo-copy').onclick=async()=>{
  const box=$('uo-copy-area'),value=checklist();box.hidden=false;box.value=value;
  try{await navigator.clipboard.writeText(value);$('uo-message').textContent='점검표를 복사했습니다.';}
  catch(_){box.focus();box.select();$('uo-message').textContent='텍스트를 길게 눌러 복사해 주세요.';}
 };
 $('uo-refresh').onclick=()=>{render();$('uo-message').textContent='현재 페이지에 로드된 자료로 판단을 다시 계산했습니다. 증권사 실제 상태를 다시 조회한 것은 아닙니다.';};
 document.addEventListener('isa-rendered',render);
 window.addEventListener('isa-us-quotes-refreshed',render);
 render();
}
window.ISA_ORDER_PLAN={rows,decisions,rules,budget,note,checklist,mismatch,tossDailyKrw};
mount();
})();