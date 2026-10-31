/* Separate USD watchlist. No account data uploaded to GitHub. */
(function(){
'use strict';
const FUNDS=[
 {id:'schd',ticker:'SCHD',name:'Schwab US Dividend Equity ETF',type:'미국 배당 ETF',hint:'분배금 재투자 우선순위 1'},
 {id:'agnc',ticker:'AGNC',name:'AGNC Investment Corp.',type:'미국 개별주 · 모기지 리츠',hint:'배당 재투자 우선순위 2'},
 {id:'spym',ticker:'SPYM',name:'SPDR Portfolio S&P 500 ETF',type:'미국 S&P500 ETF',hint:'분배금 재투자 우선순위 3'},
 {id:'cony',ticker:'CONY',name:'YieldMax COIN Option Income Strategy ETF',type:'고위험 커버드콜 ETF',hint:'230~250주 목표 · 분배금/NAV/병합 별도 주의'}
];
let data=null,selected='cony',positions={},manual={},loadTime=null;
const $=id=>document.getElementById(id);
const valid=n=>n!==null&&n!==undefined&&String(n).trim()!==''&&Number.isFinite(Number(n))&&Number(n)>0;
const num=n=>Number(n);
const usd=(n,d=2)=>'$'+num(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const text=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>/^\d{8}$/.test(String(s))?s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8):'미확인';
const min=(...args)=>Math.min(...args);
const round=(n,p=2)=>Number(n.toFixed(p));
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(e){return null}};
function save(){
 try{
  const all=read('isa-us-holdings-v1')||{};
  for(const f of FUNDS){
   const p=positions[f.id]||{};
   all[f.id]={...(all[f.id]||{}),qty:p.qty,avg:p.avg,net:p.net};
  }
  localStorage.setItem('isa-us-holdings-v1',JSON.stringify(all));
 }catch(e){$('us-store-msg').textContent='이 기기의 저장소를 사용할 수 없습니다.';}
}
let saved=read('isa-us-holdings-v1');
if(saved&&typeof saved==='object')FUNDS.forEach(f=>{
 const p=saved[f.id];if(!p)return;
 positions[f.id]={qty:valid(p.qty)?Number(p.qty):'',avg:valid(p.avg)?Number(p.avg):'',net:typeof p.net==='number'&&Number.isFinite(p.net)&&p.net>=0?p.net:''};
});
function record(f){return data?.items?.find(x=>x.id===f.id);}
function fresh(x){
 if(!x?.ok||!/^\d{8}$/.test(x.date)||!Array.isArray(x.bars)||x.bars.length<40)return false;
 const dt=new Date(x.date.slice(0,4)+'-'+x.date.slice(4,6)+'-'+x.date.slice(6,8)+'T12:00:00Z');
 return Number.isFinite(dt.getTime())&&Math.abs(Date.now()-dt.getTime())<8*86400000;
}
function market(f){const x=record(f);return x&&fresh(x)?x:null;}
function price(f){const x=market(f);return valid(manual[f.id])?Number(manual[f.id]):x?Number(x.close):null;}
function zone(x,px){
 if(!x||!(px>0))return null;
 const b20=x.low20+(x.high20-x.low20)*.20,b30=x.low20+(x.high20-x.low20)*.30;
 return {b20:round(b20,3),b30:round(b30,3),level:px<=b20?2:px<=b30?1:0};
}
function basis(f,px){
 const p=positions[f.id];
 if(!p||!valid(p.qty)||!valid(p.avg)||!(px>0))return null;
 const qty=Number(p.qty),avg=Number(p.avg),value=qty*px,principal=qty*avg,unrealized=value-principal;
 const net=typeof p.net==='number'&&p.net>=0?p.net:null;
 return {qty,avg,principal,value,unrealized,net,
  withNet:net!==null?unrealized+net:null,
  afterOne:(principal+px)/(qty+1)};
}
function trend(x){
 const t=x.trend;if(!t)return '미확인';
 if(t.goldenCross)return '5·20일선 골든크로스';
 if(t.deadCross)return '5·20일선 데드크로스';
 if(t.crossUp)return '20일선 종가 상향 돌파';
 if(t.crossDown)return '20일선 종가 아래 재이탈';
 if(t.twoDaysAbove&&t.ma5Above20&&t.maRising)return '20일선 위 추세 확인';
 if(x.close<t.ma20)return '20일선 아래 · 반등 확인 필요';
 return '상승 추세 추가 확인';
}
function distribution(x){
 if(!x||!Array.isArray(x.dividends))return {available:false,reason:'분배금 이벤트 데이터 미확인'};
 if(!x.source.includes('Yahoo'))return {available:false,reason:'대체 시세 제공처는 분배금 이벤트를 제공하지 않습니다'};
 const lastDate=new Date(x.date.slice(0,4)+'-'+x.date.slice(4,6)+'-'+x.date.slice(6,8)+'T12:00:00Z');
 const cutoff=new Date(lastDate.getTime()-90*86400000).getTime();
 const recent=x.dividends.filter(d=>Number.isFinite(d.perShare)&&d.perShare>0&&/^\d{8}$/.test(d.date)&&
 new Date(d.date.slice(0,4)+'-'+d.date.slice(4,6)+'-'+d.date.slice(6,8)+'T12:00:00Z').getTime()>=cutoff);
 return {available:recent.length>0,recent,total:recent.reduce((s,d)=>s+d.perShare,0),
  last:x.dividends.at(-1)||null,reason:recent.length?'최근 90일 제공처 기록 기준, 향후 분배금 보장 없음':'최근 90일 지급 이벤트 미확인'};
}
function chart(x){
 const b=x.bars,last=b.slice(-20);
 const closes=last.map(d=>d.close),ma5s=last.map((d,i)=>b.slice(i+16,i+21).reduce((s,e)=>s+e.close,0)/5);
 const ma20s=last.map((d,i)=>b.slice(i+1,i+21).reduce((s,e)=>s+e.close,0)/20);
 const lo=Math.min(...closes,...ma5s,...ma20s),hi=Math.max(...closes,...ma5s,...ma20s),range=Math.max(.01,hi-lo);
 const poly=series=>series.map((v,i)=>(12+i*276/19).toFixed(1)+','+(83-68*(v-lo)/range).toFixed(1)).join(' ');
 return '<svg viewBox="0 0 300 100" role="img" aria-label="미국장 20거래일 종가 파랑, 5일선 초록, 20일선 노랑">'+
 '<line x1="12" y1="83" x2="288" y2="83" stroke="#52627a"/>'+
 '<polyline points="'+poly(closes)+'" fill="none" stroke="#60a5fa" stroke-width="2.8"/>'+
 '<polyline points="'+poly(ma5s)+'" fill="none" stroke="#24bf9a" stroke-width="2.1"/>'+
 '<polyline points="'+poly(ma20s)+'" fill="none" stroke="#eab308" stroke-width="2.1"/></svg>';
}
function cards(){
 const host=$('us-cards');if(!host)return;
 // Domestic-style layout: one compact full-width row per US symbol.
 // The rich indicators, dividend and risk details remain in the selection panel.
 host.innerHTML=FUNDS.map(f=>{
  const x=market(f),px=price(f),decision=window.ISA_US_SIGNAL?.decision?.(f.id),
    wonQuote=window.ISA_US_KRW?.priceKrw?.(f.id,px);
  const status=decision?.type||'wait';
  const decisionText=decision?.title||'자료 확인 대기';
  const wonPrice=wonQuote&&Number.isFinite(wonQuote.amount)&&wonQuote.amount>0?
   Math.round(wonQuote.amount).toLocaleString('ko-KR')+'원':'원화 미확인';
  const summary=window.ISA_US_KRW?.compactLine?.(f.id,px)||'보유수량·원화 평단 입력 필요';
  const selectedClass=selected===f.id?'us-selected':'';
  return '<button class="us-card us-list-row '+selectedClass+'" type="button" data-us="'+f.id+
   '" aria-label="'+text(f.ticker+' 현재가 '+wonPrice+' '+decisionText+' '+summary)+
   '" aria-pressed="'+(selected===f.id?'true':'false')+'">'+
   '<span class="us-list-top"><strong class="us-list-ticker">'+f.ticker+'</strong>'+
   '<b class="us-list-price">'+text(wonPrice)+'</b>'+
   '<span class="us-list-state state-'+status+'">'+text(status==='buy'?'매수 검토':status==='stop'?'매수 중단':'대기')+'</span>'+
   '<span class="us-list-arrow" aria-hidden="true">›</span></span>'+
   '<span class="us-list-meta">'+text(summary)+'</span>'+
   '<span class="us-list-extra">'+text(decisionText)+
   (x?' · 미국장 '+date(x.date)+' 확정 종가':' · 시세 확인 대기')+
   '</span></button>';
 }).join('');
 host.querySelectorAll('[data-us]').forEach(btn=>btn.onclick=()=>{
  selected=btn.dataset.us;
  const select=$('us-selector');if(select)select.value=selected;
  render();
 });
}
function renderPositionEditor(){
 const host=$('us-positions');if(!host)return;
 host.innerHTML=FUNDS.map(f=>{
 const p=positions[f.id]||{};
 const val=v=>typeof v==='number'&&Number.isFinite(v)?String(v):'';
 return '<div class="us-pos-row"><strong>'+f.ticker+'</strong>'+
 '<label>보유수량 (주)<input data-symbol="'+f.id+'" data-field="qty" type="number" min="0" step="0.000001" value="'+val(p.qty)+'" placeholder="미보유: 0"></label>'+
 '<label>평단 (USD)<input data-symbol="'+f.id+'" data-field="avg" type="number" min="0" step="0.0001" value="'+val(p.avg)+'" placeholder="미입력"></label>'+
 '<label>누적 세후 배당·분배금 (USD)<input data-symbol="'+f.id+'" data-field="net" type="number" min="0" step="0.01" value="'+val(p.net)+'" placeholder="직접 입력"></label>'+
 '</div>';
 }).join('');
 host.querySelectorAll('input[data-symbol]').forEach(input=>input.addEventListener('change',()=>{
 const id=input.dataset.symbol,field=input.dataset.field,n=input.value.trim()===''?null:Number(input.value);
 if(!positions[id])positions[id]={qty:'',avg:'',net:''};
 positions[id][field]=n!==null&&Number.isFinite(n)&&n>=0?n:'';
 if(field==='avg'&&n===0)positions[id][field]='';
 save();$('us-store-msg').textContent='이 기기에 저장했습니다. 토스에서 추가매수·재투자 후 평단과 수량을 갱신하세요.';render();
 }));
}
function details(){
 const f=FUNDS.find(f=>f.id===selected),x=market(f),px=price(f),host=$('us-details');
 if(!host)return;
 if(!x){host.innerHTML='<h3>'+f.ticker+' · '+text(f.name)+'</h3>'+(window.ISA_US_SIGNAL?.detailLine?.(f.id)||'')+'<p class="us-small">미국장 완료 일봉을 확인할 수 없습니다. 가격과 이동평균선을 추정하지 않습니다. <a href="https://finance.yahoo.com/quote/'+f.ticker+'/" target="_blank" rel="noopener">시세 제공처에서 확인</a></p>';return;}
 const z=zone(x,px),b=basis(f,px),div=distribution(x),t=x.trend,metric=n=>window.ISA_US_KRW?.metricPrice?.(n)||usd(n),divPrice=n=>window.ISA_US_KRW?.dividendPrice?.(n)||usd(n,4);
 const split=x.splits||[];
 let section='<h3>'+f.ticker+' · '+text(f.name)+'</h3><p class="us-small">'+text(f.type)+' · '+text(f.hint)+'</p>'+
 '<p class="us-small">미국장 확정 일봉 '+date(x.date)+' · '+text(x.source)+' · 실시간 호가 아님 · 원화 환산 참고</p>'+
 (window.ISA_US_SIGNAL?.detailLine?.(f.id)||'')+chart(x)+'<p class="us-legend">파랑 종가 · 초록 5일선 · 노랑 20일선 (원본 달러 차트)</p>'+
 '<div class="us-statgrid"><div>종가<strong>'+metric(x.close)+'</strong></div><div>5일선<strong>'+metric(t.ma5)+'</strong></div>'+
 '<div>20일선<strong>'+metric(t.ma20)+'</strong></div><div>20일 저가<strong>'+metric(x.low20)+'</strong></div>'+
 '<div>20일 고가<strong>'+metric(x.high20)+'</strong></div><div>하단 30% · 20%<strong>'+metric(z.b30)+' / '+metric(z.b20)+'</strong></div></div>'+
 '<p class="us-small">이평선 판단: <b>'+text(trend(x))+'</b>. 매수 조건은 개인 평단·비중·현금 여력을 함께 보세요.</p>'+ '<p class="us-small">원화 5·20일선과 박스권은 각각의 달러 지표에 동일 참고환율을 곱한 값입니다. 날짜별 실제 환율을 적용한 원화 이동평균은 아닙니다.</p>'+ (window.ISA_US_KRW?.detailLine?.(f.id,px)||'');
 if(b){
  section+='<details class="us-ledger"><summary>달러(USD) 매입원가·평가손익 참고 · '+b.qty.toLocaleString('ko-KR')+'주</summary>'+
  '<p>매수원가(평단×수량) '+usd(b.principal)+' / 평가금액 '+usd(b.value)+'</p>'+
  '<p>평가손익 <strong class="'+(b.unrealized>=0?'us-positive':'us-negative')+'">'+(b.unrealized>=0?'+':'')+usd(b.unrealized)+'</strong></p>'+
  (b.net!==null?'<p>누적 세후 분배금 '+usd(b.net)+' · <b>분배금 포함 총손익 '+(b.withNet>=0?'+':'')+usd(b.withNet)+'</b></p>':
   '<p class="us-small">누적 세후 배당금 미입력 · 분배금 포함 손익 계산 보류</p>')+
  '<p>현재 가격에 1주 추가 시 예상 평단 '+usd(b.afterOne,4)+(px<b.avg?' · 평단 인하 가능':' · 평단 인하 효과 없음')+'</p>'+
  '<p class="us-small">별도 입력한 달러 기준 원가의 참고 내역입니다. 원화 손익은 위 원화 기준 계산을 우선하세요. 분배금 재투자 시 동일 지급금을 이중으로 반영하지 마세요.</p></details>';
 }
 if(div.available){
  section+='<p class="us-small"><b>최근 90일 세전 배당·분배금 합계(주당):</b> '+divPrice(div.total)+' · 월평균 환산 약 '+divPrice(div.total/3)+' (세전 참고)</p>'+
  '<p class="us-small">마지막 기록 '+date(div.last.date)+' · '+divPrice(div.last.perShare)+'/주 · 현재 참고환율 환산이며 지급 당시 환율·세후 실수령액과 다릅니다</p>';
 }else section+='<p class="us-small">배당·분배금 자동 확인: '+text(div.reason)+' · 정확한 실수령액은 증권사 내역을 입력하세요.</p>';
 if(f.id==='cony'){
  const shares=valid(positions[f.id]?.qty)?Number(positions[f.id].qty):0;
  section+='<div class="us-cony"><strong>CONY 별도 관리</strong>'+
  '<p>보유 '+shares.toLocaleString('ko-KR')+'주 · 목표 230~250주'+(shares>0?' · 230주 목표까지 '+Math.max(0,230-shares).toLocaleString('ko-KR')+'주 부족':' · 실제 보유수량을 입력해 진행률 표시')+'</p>'+
  '<div class="us-progress"><span style="width:'+Math.min(100,shares/230*100)+'%"></span></div>'+
  '<p class="us-small">COIN 주가, 옵션 수익구조, NAV, 분배금 포함 총수익률, 운용사 역분할 공시가 별도로 중요합니다. 이 화면에서 공식 NAV·운용사 공시를 실시간 확인하지는 않습니다.</p>'+
  '<p class="us-small">최근 6개월 제공처 분할 기록: '+(split.length?split.map(s=>date(s.date)+' 비율 '+text(s.ratio)).join(' · '):x.source.includes('Yahoo')?'조회된 이벤트 없음 (미래 병합 가능성 없음 의미 아님)':'제공처 미지원 · 병합 여부 별도 확인 필요')+'</p>'+
  '<a href="https://www.yieldmaxetfs.com/our-etfs/cony/" target="_blank" rel="noopener">CONY 공식 운용사 공지·분배금</a></div>';
 }
 if(f.id==='agnc')section+='<p class="us-small">AGNC는 ETF가 아니라 모기지 리츠 회사 주식입니다. 배당액뿐 아니라 순자산(BVPS), 금리 민감도 및 배당 지속가능성을 별도로 확인하세요.</p>';
 if(f.id==='spym')section+='<p class="us-small">SPYM은 State Street SPDR Portfolio S&P 500 ETF의 현재 티커입니다. 배당수익보다 지수 추적·총수익률 중심으로 점검합니다.</p>';
 section+='<label>가격 직접 비교 (USD, 화면 한정)<input id="us-manual" type="number" min="0" step="0.01" placeholder="확정 일봉 대체가 아닌 가정 가격" value="'+(valid(manual[f.id])?manual[f.id]:'')+'"></label>'+
 '<p class="us-small">직접 입력은 가정 가격입니다. 이동평균선은 확정 일봉 기준이며, 실제 주문가격이나 실시간 조회가격으로 오인하지 마세요.</p>';
 host.innerHTML=section;
 $('us-manual').onchange=function(){const v=Number(this.value);if(this.value.trim()!==''&&Number.isFinite(v)&&v>0)manual[f.id]=v;else delete manual[f.id];render();};
}
function render(){cards();details();}
async function refresh(){
 const el=$('us-updated');
 if(el)el.textContent='미국장 일봉을 확인 중…';
 try{
  const r=await fetch('./us-quotes.json?refresh='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  const d=await r.json();
  if(!Array.isArray(d.items))throw Error('미국장 일봉 형식 미확인');
  data=d;loadTime=d.fetchedAt;
  const count=FUNDS.filter(f=>market(f)).length;
  const time=loadTime?new Date(loadTime).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인';
  el.textContent='미국장 완료 일봉 '+count+'/4 · 마지막 수집 '+time+' · 원화 우선(USD 참고) · 실시간 호가 아님';
 }catch(e){data=null;if(el)el.textContent='미국장 자료 확인 실패: '+String(e.message||e);}
 render();
 window.dispatchEvent(new Event('isa-us-quotes-refreshed'));
}
window.ISA_US_APP={
 getData:()=>data,
 getPrice:id=>{const f=FUNDS.find(x=>x.id===id);return f?price(f):null;},
 getPosition:id=>positions[id]||{},
 applyFromLocal:function(){
  const all=read('isa-us-holdings-v1')||{};
  for(const f of FUNDS){
   const p=all[f.id]||{};
   positions[f.id]={qty:valid(p.qty)?Number(p.qty):'',avg:valid(p.avg)?Number(p.avg):'',net:typeof p.net==='number'&&Number.isFinite(p.net)&&p.net>=0?p.net:''};
  }
  renderPositionEditor();render();
 },
 rerender:()=>render()
};
function mount(){
 const p=$('us-panel');if(!p)return;
 const sel=$('us-selector');
 FUNDS.forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.ticker+' · '+f.name;sel.appendChild(o);});
 sel.value=selected;
 sel.onchange=function(){selected=this.value;render();};
 renderPositionEditor();
 const details=$('us-holdings-details');
 if(details)details.addEventListener('toggle',()=>{if(details.open)renderPositionEditor();});
 const reload=$('reload');if(reload)reload.addEventListener('click',refresh);
 $('us-refresh').onclick=refresh;
 refresh();
}
mount();
})();
