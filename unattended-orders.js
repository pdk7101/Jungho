/* Workday-friendly manual review of Kiwoom daily stock collection, Toss daily stock
 * collection and one Kiwoom KODEX 200TR broker-side watch order.
 * This static page NEVER authenticates with brokers, places, pauses or cancels orders. */
(function(){
'use strict';
const PLAN='isa-unattended-order-plan-v1',STATE='isa-unattended-order-status-v1';
const DEFAULT={monthlyMax:1000000,tradingDays:21,conyCashDaily:15000,conyCashDays:10,
 reitDaily:1,robotDaily:1,spaceDaily:1,sofrWeekly:1,solDaily:1,trQty:1,
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
/* User-confirmed Toss states are imported into this browser only from the
 * one-time private URL fragment. Never publish personal account status in source. */
function importTossConfirmation(){
 const hash=String(window.location?.hash||'');
 if(!hash.startsWith('#toss-collection='))return null;
 let message='';
 try{
  const value=decodeURIComponent(hash.slice('#toss-collection='.length));
  const cells=value.split(';'),date=cells.shift();
  const expected=['schd','agnc','spym','cony'];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>dateK()||cells.length!==4)
   throw Error('확인 날짜 또는 종목 수가 맞지 않습니다');
  const updates={};
  for(const cell of cells){
   const parts=cell.split(':'),id=parts[0],state=parts[1];
   if(parts.length!==2||!expected.includes(id)||updates[id]||!['running','paused'].includes(state))
    throw Error('종목 또는 매수상태를 확인해 주세요');
   updates[id]=state;
  }
  if(expected.some(id=>!updates[id]))throw Error('4종목이 모두 필요합니다');
  const copy={...records};let applied=0,kept=0;
  for(const id of expected){
   const older=copy[id]?.checkedDate&&copy[id].checkedDate>date;
   if(older){kept++;continue;}
   copy[id]={...(copy[id]||{}),status:updates[id],checkedDate:date,source:'user-confirmed'};
   applied++;
  }
  if(!save(STATE,copy))throw Error('이 기기의 저장소에 쓸 수 없습니다');
  records=copy;
  message=date+' 토스 주식모으기 사용자 확인 기록 '+applied+'종목 저장'+
   (kept?' (더 최근 확인 '+kept+'종목은 유지)':'')+'. 실제 주문은 변경하지 않았습니다.';
 }catch(err){
  message='토스 상태 적용 실패: '+String(err.message||err);
 }finally{
  try{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}catch(_){}
 }
 return message;
}
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
  if(id==='sofr'){
   const monday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short'}).format(new Date())==='Mon';
   v={value:'keep',label:monday?'SOFR 오늘 월요일 1주 정기매수 예정':'SOFR 다음 월요일 1주 정기매수 예정 · 오늘 0주',
    reason:'SOFR은 매주 월요일 1주 정기적립 계획입니다. 가격·5/20일 이동평균선·로봇/우주항공 매수 신호와 독립적이며 실제 키움 체결은 별도로 확인합니다.',sourceDate:null};
  }
  if(id==='reit'){
   v=pair.known?{value:'keep',label:'리츠 '+pair.reitQty+'주 적립 검토',
    reason:'로봇·우주항공 '+pair.stopped+'종목 매수 안 함 → 리츠 '+pair.reitQty+'주. 키움 주식모으기 수량은 앱에서 자동 조정되지 않습니다.',
    sourceDate:x?.quoteDate||null}:
    {value:'keep',label:'리츠 기본 1주 유지 · 추가 수량 미확정',reason:'기존 매 거래일 리츠 1주 적립은 유지하며, 로봇·우주항공 가격/상태 미확인으로 추가 1~2주만 보류합니다.',
     sourceDate:x?.quoteDate||null};
  }
  if(id==='sol'){
   if(!pair.known)v={value:'unknown',label:'SOL 연동조건 확인 대기',
    reason:'SOL 일일 판별: '+pair.solReason+'. 로봇·우주 시세/판단 미확인',sourceDate:x?.quoteDate||null};
   else if(pair.solQty===null)v={value:'unknown',label:'SOL 일일 판별 자료 확인 대기',
    reason:pair.solReason+'. 자료 미확인을 매수 불가로 간주하여 리츠 4주 매수하지 않음',sourceDate:x?.quoteDate||null};
   else if(pair.solQty===0)v={value:'pause',
    label:pair.solNeeded?'SOL 일일 매수조건 미충족 · 0주':'SOL 대체매수 미발동 · 0주',
    reason:pair.solReason+' / '+(pair.solNeeded?'리츠 4주 대체 검토':'로봇·우주 모두 매수 가능'),sourceDate:x?.quoteDate||null};
   else v={value:'keep',label:'SOL 일일조건 충족 · 1주',
    reason:pair.solReason+' / 실제 키움 주식모으기 변경 없음',sourceDate:x?.quoteDate||null};
  }
  result[id]=v;
 }
 for(const id of US){
  const x=usDecision(id);
  result[id]=id==='cony'?
    {value:'pause',label:'CONY 정액매수 중단 계획',reason:'11월 1일부터 기존 15,000원 주식모으기를 일시중단하고 현금으로 유보합니다. 실제 상태는 토스 사용자 확인 기록과 구분하며 NAV·COIN·역분할 공시 확인 전 재개하지 않습니다.',sourceDate:x?.sourceDate||null}:
    {value:'keep',label:'매일 원화 정액 소수점 적립 계획',
     reason:'기존 SCHD·AGNC·SPYM 일일 원화 적립계획은 유지합니다. '+
       (x?'기술적 분석: '+x.title+' — '+x.reason+' 이는 추가매수 위험 참고이며 토스의 매수중·중지 상태를 뜻하지 않습니다.':
        '미국장 기술적 분석은 미확인입니다. 실제 토스 주식모으기 상태는 사용자 확인 기록으로만 표시합니다.'),
     sourceDate:x?.sourceDate||null};
 }
 return result;
}
function rows(){
 const d=decisions(),r=rules(),pair=pairInfo(),result=[];
 for(const id of KR){
  let info='';
  if(id==='robot')info='가격 상한 '+won(r.robot)+' · 1일 최대 '+plan.robotDaily+'주 (상한 자동 정지 불가)';
  if(id==='space')info='가격 상한 '+won(r.space)+' · 1일 최대 '+plan.spaceDaily+'주 (상한 자동 정지 불가)';
  if(id==='reit')info=pair.known?'로봇·우주항공 '+pair.stopped+'종목 중지 → 리츠 '+pair.reitQty+'주/거래일 권고 (키움 실제 수량 자동 변경 불가)':'리츠 기본 1주/거래일 유지 · 추가 1~2주 미확정';
  if(id==='sofr')info=plan.sofrWeekly?'매주 월요일 '+plan.sofrWeekly+'주 정기 주식모으기 · 월 '+mondaysThisMonth()+'회 예정':'매주 월요일 정기매수 수량 0주 · 설정 확인 필요';
  if(id==='sol')info='매수·중지 상태에 따라 SOL '+(pair.known?pair.solQty+'주':'미확정')+' · 상한 '+won(r.sol)+' · 키움 실제 주문 미변경';
  result.push({id,name:LABELS[id],broker:'키움증권',mode:id==='sofr'?'매주 월요일 주식모으기':'매일 주식모으기',details:info,...d[id]});
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
function mondaysThisMonth(date=dateK()){
 const [yr,mo]=date.slice(0,7).split('-').map(Number);
 if(!Number.isInteger(yr)||!Number.isInteger(mo)||mo<1||mo>12)return 0;
 const days=new Date(Date.UTC(yr,mo,0)).getUTCDate();
 let count=0;
 for(let i=1;i<=days;i++)if(new Date(Date.UTC(yr,mo-1,i)).getUTCDay()===1)count++;
 return count;
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
 const monthMondays=mondaysThisMonth(),sofrMonthly=qty('sofrWeekly')&&sofrValid?qty('sofrWeekly')*Number(sofrQuote)*monthMondays:0;
 const unknown=[];
 if(shareReit&&!reitValid)unknown.push('리츠 현재가');
 if(qty('sofrWeekly')&&!sofrValid)unknown.push('SOFR 월요일 정기매수 현재가');
 if(!qty('sofrWeekly'))unknown.push('SOFR 월요일 실제 모으기 수량');
 if(!qty('usSchdDaily'))unknown.push('SCHD 실제 모으기 금액');
 if(!qty('usAgncDaily'))unknown.push('AGNC 실제 모으기 금액');
 if(!qty('usSpymDaily'))unknown.push('SPYM 실제 모으기 금액');
 if(uncertain)unknown.push('로봇·우주항공 매수/중지 확인 전 · 보수적 최대치 예산 사용');
 const daily=rob+space+sol+kReit+us,cash=qty('conyCashDaily')*qty('conyCashDays');
 const subtotal=daily*qty('tradingDays')+sofrMonthly+watch+cash;
 return {daily,watch,cash,subtotal,remaining:plan.monthlyMax-subtotal,unknown,
  estimatedOnly:unknown.length>0,rates:r,conditional:pair,sofrMondays:monthMondays,sofrWeekly:qty('sofrWeekly'),sofrMonthly,shares:{robot:shareRobot,space:shareSpace,reit:shareReit,sol:shareSol},
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
 if(US.includes(row.id)){
  if(st.value==='unknown')return '토스 실제 주식모으기 상태는 미확인입니다. 프로그램의 적립계획·기술 분석으로 대신 판단하지 않습니다.';
  if(prior)return '마지막 사용자 확인 날짜 '+st.date+' · 최신 토스 주문 상태는 실시간 조회하지 않습니다.';
  if(row.id==='cony'&&st.value==='running')return 'CONY 중단 계획과 확인된 매수중 기록이 다릅니다. 토스에서 실제 중단 여부를 확인하세요.';
  return '';
 }
 if(row.value==='unknown')return '시세 또는 조건 확인 전 임의 재개하지 마세요';
 if(st.value==='unknown')return row.value==='pause'?'중지 권고 · 키움 실제 모으기 상태 미확인':'유지 권고 · 키움 실제 모으기 상태 미확인';
 if(row.value==='pause'&&st.value==='running')return '중지 검토와 키움 사용자 확인 매수중 기록이 다릅니다. 주문 변경 여부는 직접 판단해야 합니다.';
 if(row.value==='keep'&&st.value==='paused')return '매수 유지 검토지만 키움 사용자 확인 중지 상태입니다. 재개 전 확인하세요.';
 if(prior)return '증권사 상태 기록이 오늘 확인한 것이 아님';
 return '';
}
function render(){
 const root=$('unattended-orders');if(!root)return;
 const data=rows(),budgetData=budget(),loc=$('uo-budget');
 const tossActual=US.map(id=>({id,...note(id)})),
  running=tossActual.filter(x=>x.value==='running').length,
  paused=tossActual.filter(x=>x.value==='paused').length,
  missing=tossActual.filter(x=>x.value==='unknown').length;
 loc.innerHTML='<div class="uo-summary-grid">'+
 '<div>월 계획 한도<strong>'+won(plan.monthlyMax)+'</strong></div>'+
 '<div>확인된 설정 기반 추정<strong>'+won(budgetData.subtotal)+'</strong></div>'+
 '<div>CONY 별도 현금 유보<strong>'+won(budgetData.cash)+'</strong></div>'+
 '<div>단순 잔여 추정<strong>'+won(budgetData.remaining)+'</strong></div></div>'+
 '<p class="sub"><b>토스 사용자 확인 상태:</b> 매수중 '+running+'종목 · 일시중지 '+paused+'종목 · 미확인 '+missing+'종목. 실시간 토스 계좌 조회가 아닌 이 기기의 기록입니다.</p>'+ 
 (budgetData.remaining<0?'<p class="uo-danger">월 최대 투자한도 초과 예상 · 매일 모으기 금액·수량 조정이 필요합니다.</p>':'')+
 (budgetData.estimatedOnly?'<p class="uo-danger">예산 미완성: '+budgetData.unknown.map(esc).join(' · ')+'. 등록금액 미확인은 0원으로 계산된 항목이 있으므로 남은 예산이 실제보다 많아 보일 수 있습니다.</p>':'')+
 '<p class="sub">SOFR은 매주 월요일 '+budgetData.sofrWeekly+'주 · 이번 달 월요일 '+budgetData.sofrMondays+'회 · 월간 예상 매수대금 '+(budgetData.sofrMonthly?won(budgetData.sofrMonthly):'가격 확인 대기')+' (월요일 공휴일이면 실제 체결일은 달라질 수 있음)</p>'+ 
 '<p class="sub">리츠·SOL 조건별 예상 수량: 리츠 '+(budgetData.conditional.known?budgetData.shares.reit+'주':'미확정')+' / SOL '+(budgetData.conditional.known?budgetData.shares.sol+'주':'미확정')+' · '+esc(budgetData.scenario)+'</p>'+
 '<p class="sub">로봇·우주의 당일 키움 사용자 확인 기록이 있으면 우선 사용하며, 없으면 시세 기반 판단을 참고합니다. 주식모으기 수량이나 중지 상태는 키움에서 자동 변경되지 않습니다. 금액·환율·수수료에 따라 예산은 달라질 수 있습니다.</p>';
 const groups=[['키움증권',data.filter(r=>r.broker==='키움증권')],['토스증권',data.filter(r=>r.broker==='토스증권')]];
 $('uo-order-list').innerHTML=groups.map(([name,items])=>
  '<h3 class="uo-broker-title">'+esc(name)+'</h3>'+
  items.map(row=>{
   const st=note(row.id),warning=mismatch(row),
    pair=pairInfo(),statusLabel=row.value==='keep'?'매수 유지':row.value==='pause'?'매수 중지':row.value==='watch'?'자동감시':'자료 확인';
   const badge=US.includes(row.id)?(st.value==='running'?'매수중 · 사용자 확인':st.value==='paused'?'일시중지 · 사용자 확인':'실제 상태 미확인'):
    KR.includes(row.id)?(st.value==='running'?'키움 매수중 · 사용자 확인':st.value==='paused'?'키움 중지 · 사용자 확인':'키움 실제 상태 미확인'):statusLabel;
   const options=row.id==='tr'?
    [['unknown','미확인'],['watching','감시중 확인'],['paused','감시중지 확인'],['filled','체결 확인'],['expired','만료/취소 확인']]:
    [['unknown','미확인'],['running','주식모으기 매수중 확인'],['paused','주식모으기 중지 확인']];
   return '<details class="uo-order"><summary class="uo-order-top"><b>'+esc(row.name)+'</b>'+
    '<span>'+esc(row.mode)+'</span><em class="uo-action action-'+(US.includes(row.id)||KR.includes(row.id)?(st.value==='running'?'keep':st.value==='paused'?'pause':'unknown'):row.value)+'">'+esc(badge)+'</em></summary>'+
    (KR.includes(row.id)?'':'<p class="uo-state"><b>'+(US.includes(row.id)?'투자 계획:':'프로그램 판단:')+'</b> '+esc(row.label)+'</p>')+
    '<p class="sub">'+esc(row.details)+'</p>'+ (US.includes(row.id)?'<p class="sub">토스 주문상태: <b>'+esc(st.value==='running'?'매수중':st.value==='paused'?'일시중지':'미확인')+'</b> · '+esc(st.date||'확인일 없음')+' 사용자 확인 기록 (실시간 연동 아님)</p>':'')+
    (KR.includes(row.id)?'':'<p class="sub"><b>판단 이유:</b> '+esc(row.reason)+'</p>')+
    (row.id==='sofr'?'<p class="sub">정기매수 기준: 매주 월요일 1주 · 이동평균선 매수조건 없음</p>':
    row.sourceDate?'<p class="sub">분석 일봉 기준: '+esc(row.sourceDate)+(row.manual?' · 당일 시세 참고':'')+'</p>':
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
 section.innerHTML='<h2>매일 주식모으기 실제 주문 상태·예산 확인</h2>'+
 '<p class="sub"><b>키움:</b> 리츠·로봇·1Q·SOL은 매일 주식모으기, <b>SOFR은 매주 월요일 1주</b>, KODEX 200TR만 자동감시주문. <b>토스:</b> 미국주식은 매일 원화 소수점 주식모으기입니다. 실제 증권사 설정은 별도로 확인하세요.</p>'+
 '<p class="sub"><b>확인시점:</b> <span id="uo-today">'+dateK()+'</span> · 확정 일봉/비공식 가격 참고 · 이 웹페이지는 계좌에 접속하거나 자동매수를 중지·재개하지 않습니다.</p>'+
 '<div id="uo-budget"></div>'+
 '<details class="uo-settings"><summary>월 예산 및 실제 주식모으기 수량·금액 입력</summary>'+
 '<div class="uo-inputs">'+
 [['monthlyMax','월 투자·유보 예산 한도 (원)',1000],['tradingDays','월 거래일 가정',1],
 ['robotDaily','키움 로봇 매일 최대 수량(주)',1],
 ['spaceDaily','키움 1Q 매일 최대 수량(주)',1],['sofrWeekly','키움 SOFR 월요일마다 매수(주)',1],
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
 const importedToss=importTossConfirmation();
 if(importedToss)$('uo-message').textContent=importedToss;
 section.querySelectorAll('[data-uo-plan]').forEach(inp=>{
  const key=inp.dataset.uoPlan;
  inp.addEventListener('change',()=>{
   {
    const val=inp.value.trim()===''?0:Number(inp.value),isDays=['tradingDays','conyCashDays'].includes(key);
    const isShares=['robotDaily','spaceDaily','sofrWeekly','trQty'].includes(key);
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
 window.ISA_US_APP?.rerender?.();
 window.addEventListener('isa-us-quotes-refreshed',render);
 render();
}
window.ISA_ORDER_PLAN={rows,decisions,rules,budget,mondaysThisMonth,note,checklist,mismatch,tossDailyKrw,importTossConfirmation};
mount();
})();