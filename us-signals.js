/* Korea-style BUY / STOP / WAIT decisions for the four US investments.
 * Official live market data / NAV / BVPS are NOT available here.
 * Private KRW buy limits are stored only in browser localStorage. */
(function(){
'use strict';
const NAMES={schd:'SCHD',agnc:'AGNC',spym:'SPYM',cony:'CONY'};
const KEY='isa-us-signal-limits-v1';
const $=id=>document.getElementById(id);
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const num=n=>n===null||n===undefined||String(n).trim()===''?null:Number(n);
const krw=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch(_){return null;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(_){return false;}};
const settings=read(KEY)||{};
const getLimit=id=>{
 const v=num(settings[id]);
 return valid(v)&&v>=100&&v<=10000000?v:null;
};
function item(id){
 const d=window.ISA_US_APP?.getData?.();
 return d?.items?.find(x=>x.id===id)||null;
}
function quote(id){
 const x=item(id);
 const v=x?.close,fx=window.ISA_US_KRW;
 const kr=fx?.priceKrw?.(id,v);
 const p=read('isa-us-holdings-v1')?.[id]||{};
 const qty=num(p.qty),avg=num(p.krwAvg);
 return {x,krw:kr,qty:qty!==null&&Number.isFinite(qty)&&qty>=0?qty:null,
  avg:valid(avg)?avg:null,usdClose:valid(v)?v:null};
}
function latest(x){
 if(!x||!x.ok||!/^\d{8}$/.test(x.date)||!Array.isArray(x.bars)||x.bars.length<40)return false;
 if(!valid(x.close)||!valid(x.low20)||!valid(x.high20)||x.low20>x.high20)return false;
 if(!x.trend||!valid(Number(x.trend.ma5))||!valid(Number(x.trend.ma20)))return false;
 const dt=new Date(x.date.slice(0,4)+'-'+x.date.slice(4,6)+'-'+x.date.slice(6,8)+'T12:00:00Z');
 const age=Date.now()-dt.getTime();
 return Number.isFinite(age)&&age>=0&&age<=7*86400000;
}
function evaluate(id,source,cap){
 const x=source?.x,usd=source?.usdClose,kr=source?.krw,qty=source?.qty,avg=source?.avg;
 const basic=(type,title,reason,extra={})=>({
  type,title,reason,qty:0,amountKRW:null,sourceDate:x?.date||null,rule:'US closed daily candle',...extra});
 if(!NAMES[id])return basic('wait','종목 미확인','미국장 관리 대상 4종목이 아닙니다.');
 if(!latest(x))return basic('wait','시세 확인 대기','최근 미국장 확정 일봉 40개 및 5·20일선이 검증되지 않아 매수 판단을 보류합니다.');
 if(!kr||!valid(kr.amount))return basic('wait','원화가격 미확인 · 대기','참고 USD/KRW 환율과 원화 현재가 모두 확인되지 않아 매수 상한 및 원화 평단을 검증할 수 없습니다.');
 const t=x.trend,ma20=Number(t.ma20),ma5=Number(t.ma5);
 const b30=x.low20+(x.high20-x.low20)*.30,b20=x.low20+(x.high20-x.low20)*.20;
 const low=usd<=b30,deep=usd<=b20;
 const healthy=!!t.twoDaysAbove&&!!t.maRising&&!!t.ma5Above20&&usd>ma20&&ma5>ma20;
 const down=usd<ma20||!t.maRising;
 const steep=usd<ma20*.9&&down;
 const splitRecent=id==='cony'&&Array.isArray(x.splits)&&x.splits.some(e=>{
  const d=new Date(String(e.date||'').slice(0,4)+'-'+String(e.date||'').slice(4,6)+'-'+String(e.date||'').slice(6,8)+'T12:00:00Z');
  const end=new Date(x.date.slice(0,4)+'-'+x.date.slice(4,6)+'-'+x.date.slice(6,8)+'T12:00:00Z');
  const age=end-d;
  return Number.isFinite(age)&&age>=0&&age<=30*86400000;
 });
 const reasons=[low?(deep?'20거래일 저가 하단 20%':'20거래일 저가 하단 30%'):'20거래일 박스권 일반 구간',
  healthy?'5·20일선 상승 추세 확인':down?'20일선 이탈 또는 기울기 약세':'상승 추세 추가 확인 필요'];
 const extras={priceKRW:kr.amount,ma20USD:ma20,ma5USD:ma5,low,healthy,down,steep,
  quoteSource:kr.source,quoteManual:!!kr.manual,notes:reasons};
 if(cap!==null&&(!valid(cap)||cap<100||cap>10000000))return basic('wait','상한 설정 확인','원화 매수 상한 설정이 올바르지 않습니다.',extras);
 if(cap!==null&&kr.amount>cap)return basic('stop','매수 중단 · 원화 상한 초과',
  '표시가격 '+krw(kr.amount)+'이 직접 설정한 매수 상한 '+krw(cap)+'을 초과했습니다. 추격매수 보류.',extras);
 // High-risk fund: stop the aggressive accumulation once the lower edge of the target is reached.
 if(id==='cony'){
  if(qty===null)return basic('wait','보유량 입력 대기','CONY 목표 수량 230~250주를 기준으로 판단하려면 실제 보유수량을 입력해야 합니다.',extras);
  if(qty>=230)return basic('stop','CONY 집중매수 중단',
   '230~250주 목표 구간에 도달했습니다. 목표 이후에는 기존 계획대로 일 2,000원 소액 적립 여부만 별도 검토하세요. 역분할·NAV 위험이 해소됐다는 뜻은 아닙니다.',extras);
  if(splitRecent)return basic('wait','CONY 병합·분할 확인 대기',
   '최근 30일 제공처에 분할 이벤트가 기록되어 있습니다. 공식 운용사 공시와 주식 수량·평단 조정 확인 후 신규 적립을 재검토하세요.',extras);
  if(steep||t.deadCross)return basic('wait','CONY 원금 위험 점검 대기',
   '급격한 20일선 하회 또는 데드크로스가 감지됐습니다. COIN·공식 NAV·총수익률·분배금 지속성 확인 전에는 적립 확대를 보류하는 보수적 신호입니다.',extras);
  if(kr.manual)return basic('wait','직접 입력 현재가 · 재확인',
   '토스 현재가와 미국장 확정 일봉의 기준시점이 다릅니다. 주문 전 현재 거래가격·NAV를 확인하세요.',extras);
  if(low&&!down)return basic('buy','CONY 계획 소액 적립 검토',
   '230주 목표 미달이며 저가 구간과 기술적 약세 완화 조건을 충족합니다. 기존 일 15,000원 적립 계획을 소액으로 검토하되 공식 NAV·총수익률·병합 공시를 반드시 별도로 확인하세요.',
   {...extras,amountKRW:15000});
  if(healthy)return basic('buy','CONY 계획 적립 검토',
   '230주 목표 미달이고 이동평균 상승 추세를 확인했습니다. 기존 일 15,000원 적립 계획을 검토하되 COIN·NAV·분배금·병합 위험은 이 신호로 검증되지 않습니다.',
   {...extras,amountKRW:15000});
  return basic('wait','CONY 위험 확인 대기',
   '목표 수량은 미달이지만 가격 추세가 약합니다. 기존 자동매수 설정은 자동 중지되지 않으므로 실제 매수 계속 여부는 별도로 결정하세요. COIN·NAV·분배금 지속성 점검 권장.',extras);
 }
 // For SCHD/SPYM/AGNC: no invented personal buy cap or cash budget.
 if(kr.manual)return basic('wait','직접 입력 현재가 · 재확인',
  '토스 당일 가격과 확정 일봉을 혼합하지 않도록 주문 전 최신 가격을 재확인하세요. 표시 원화 가격은 자동매수 신호가 아닙니다.',extras);
 const canLower=avg!==null&&kr.amount<avg;
 if(id==='agnc'){
  if(steep||t.deadCross)return basic('wait','AGNC 배당·자산가치 점검',
   'AGNC는 모기지 리츠 개별주입니다. 하락추세가 강해 장부가치(BVPS), 레버리지, 금리 민감도와 배당 지속성을 확인할 때까지 추가매수를 보류합니다.',extras);
  if((low&&canLower&&!down)||healthy)return basic('buy','AGNC 소액 분할매수 검토',
   '기술적 조건을 충족했으나 배당만으로 안전성을 판단할 수 없습니다. 공식 BVPS·배당 지속성 확인과 별도 예산 점검 후 소액 분할매수를 검토하세요.',
   {...extras,qty:1});
  return basic('wait','AGNC 추세·배당 확인 대기',
   '저가만으로 매수하지 않습니다. 기술적 약세와 공식 BVPS/배당 지속성 미확인 상태에서 대기합니다.',extras);
 }
 if(steep||t.deadCross)return basic('wait','하락 추세 확인 대기',
  '20일선 대비 큰 하락 또는 데드크로스 위험이 있습니다. 저가라도 반등 확인 전 분할매수는 보수적으로 대기합니다.',extras);
 if(low&&canLower&&!down)return basic('buy','평단 인하 분할매수 검토',
  '저가 구간이며 입력된 원화 평단보다 낮고 20일선 약세가 완화됐습니다. 투자예산과 종목 비중을 확인하고 소액 1주 검토.',
  {...extras,qty:1});
 if(healthy&&usd<=ma20*1.05)return basic('buy','추세 전환 매수 검토',
  '종가가 20일선 위에서 2거래일 유지하고 5일선이 우위이며 20일선이 상승·횡보입니다. 추격매수를 피하면서 최대 1주를 검토하세요.',
  {...extras,qty:1});
 return basic('wait',low?'저가·추세 확인 대기':'추세·가격 조건 대기',
  (avg!==null&&kr.amount>=avg?'현재 가격은 입력된 원화 평단보다 낮지 않습니다. ':'')+
  '저가/평단 인하 또는 상승 추세 확인 조건이 충족되지 않아 신규 매수를 보류합니다.',extras);
}
function decision(id){
 const q=quote(id),cap=getLimit(id);
 return evaluate(id,q,cap);
}
function cardLine(id){
 const v=decision(id),held=quote(id).qty;
 return '<div class="us-trade-status state-'+v.type+'"><span class="us-signal-dot"></span>'+
  esc(v.title)+'</div>'+
  '<span class="us-small us-existing-shares">실제 보유수량: <b>'+(held!==null?held.toLocaleString('ko-KR',{maximumFractionDigits:6})+'주':'이 기기에 미등록')+'</b></span>'+
  '<span class="us-small">추가매수 검토: <b>'+(v.qty?v.qty+'주':v.amountKRW?krw(v.amountKRW)+' 소액 적립':'0주 (대기/중단)')+'</b></span>';
}
function detailLine(id){
 const v=decision(id);
 let html='<div class="us-decision-block us-decision-'+v.type+'">'+
  '<div class="us-decision-head"><b>'+esc(NAMES[id])+' · '+esc(v.title)+'</b>'+
  '<span class="us-decision-kind">'+(v.type==='buy'?'매수 검토':v.type==='stop'?'매수 중단':'대기')+'</span></div>'+
  '<p>'+esc(v.reason)+'</p>';
 if(v.notes?.length)html+='<p class="us-small">'+v.notes.map(esc).join(' · ')+'</p>';
 html+='<p class="us-small">추가매수 검토 수량/예산 (실제 보유수량 아님): <b>'+(v.qty?v.qty+'주':v.amountKRW?krw(v.amountKRW)+' 계획 적립 검토':'0주')+
  '</b> · 시세 '+(v.sourceDate?v.sourceDate.slice(0,4)+'-'+v.sourceDate.slice(4,6)+'-'+v.sourceDate.slice(6,8):'확인 불가')+
  ' 미국장 확정 일봉 · 비공식, 실시간 주문 신호 아님</p>';
 if(id!=='cony')html+='<p class="us-small">매수 상한: '+(getLimit(id)!==null?krw(getLimit(id)):'미설정')+
  ' · 예산과 계좌 비중은 별도 확인. CONY 목표 달성 뒤 재투자 우선순위: SCHD → AGNC → SPYM.</p>';
 else html+='<p class="us-small">CONY의 공식 NAV·COIN 기초자산·총수익률·역분할 공시는 자동 검증하지 않습니다. 신호는 자동 주문이나 매도 지시가 아닙니다.</p>';
 return html+'</div>';
}
function updateLimitsUI(){
 const host=$('us-signal-limits');
 if(!host)return;
 host.innerHTML=Object.entries(NAMES).map(([id,sym])=>
 '<label>'+sym+' 선택 매수상한 (원, 비우면 미설정)<input data-limit="'+id+'" type="number" min="100" max="10000000" step="100" value="'+(getLimit(id)??'')+'" placeholder="상한 미설정"></label>').join('');
 host.querySelectorAll('[data-limit]').forEach(input=>input.onchange=()=>{
  const raw=input.value.trim(),v=raw===''?null:Number(raw);
  if(v!==null&&(!valid(v)||v<100||v>10000000)){
   $('us-signal-limits-note').textContent='상한은 100~10,000,000원으로 입력하거나 비워 두세요. 기존 설정을 유지했습니다.';
   input.value=getLimit(input.dataset.limit)??'';
   return;
  }
  if(v===null)delete settings[input.dataset.limit];else settings[input.dataset.limit]=v;
  if(!write(KEY,settings)){$('us-signal-limits-note').textContent='기기 저장소에 설정을 저장하지 못했습니다.';return;}
  $('us-signal-limits-note').textContent='원화 상한을 이 기기에 저장했습니다. 매수 신호를 다시 계산합니다.';
  render();
 });
}
function render(){
 refreshSummary();
 window.ISA_US_APP?.rerender?.();
}
function refreshSummary(){
 const panel=$('us-signal-summary');if(!panel)return;
 const vals=Object.keys(NAMES).map(id=>decision(id));
 const counts={buy:vals.filter(d=>d.type==='buy').length,stop:vals.filter(d=>d.type==='stop').length,wait:vals.filter(d=>d.type==='wait').length};
 panel.innerHTML='<div class="us-signal-counts"><div><b class="state-buy">매수 검토 '+counts.buy+'</b></div>'+
 '<div><b class="state-stop">매수 중단 '+counts.stop+'</b></div>'+
 '<div><b class="state-wait">대기 '+counts.wait+'</b></div></div>'+
 '<p class="us-small">‘추가매수 검토’는 보유수량이 아니라 새로 살지 살펴보는 수량입니다. 실제 보유수량은 각 카드에서 확인하세요. 자동 주문은 실행하지 않으며 토스 시세와 예산을 확인하세요.</p>';
}
function mount(){
 const container=$('us-panel');if(!container)return;
 const holder=document.createElement('div');
 holder.id='us-signals-panel';
 holder.className='us-signals-panel';
 holder.innerHTML='<div class="us-head"><h3>미국주식 매수 · 중단 · 대기 판단</h3></div>'+
 '<div id="us-signal-summary"></div>'+
 '<details id="us-signal-settings"><summary>미국주식 원화 매수 상한 설정 (선택)</summary>'+
 '<p class="us-small">상한은 미설정이 기본값입니다. 투자자가 정한 상한을 초과하면 중단으로 표시합니다. 임의 상한을 자동으로 정하지 않습니다.</p>'+
 '<div id="us-signal-limits" class="us-signal-limits"></div>'+
 '<p class="us-small" id="us-signal-limits-note"></p></details>';
 const anchor=$('us-krw-panel');
 if(anchor)anchor.insertAdjacentElement('afterend',holder);else $('us-updated').insertAdjacentElement('afterend',holder);
 window.ISA_US_SIGNAL={evaluate,decision,cardLine,detailLine,settings,refreshSummary};
 updateLimitsUI();
 window.addEventListener('isa-us-quotes-refreshed',render);
 render();
}
mount();
})();