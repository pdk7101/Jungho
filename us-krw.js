/* Optional local-only KRW view for the USD US watchlist. Nothing is uploaded. */
(function(){
'use strict';
const ITEMS=['SCHD','AGNC','SPYM','CONY'];
const $=id=>document.getElementById(id);
const xnum=v=>v===null||v===undefined||String(v).trim()===''?null:Number(v);
const finitePositive=v=>Number.isFinite(xnum(v))&&xnum(v)>0;
const won=(v,d=0)=>Number(v).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d})+'원';
const usd=(v,d=2)=>'$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const clean=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=()=>{
 const a=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return a.year+'-'+a.month+'-'+a.day;
};
const storage=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}};
const savedFx=storage('isa-us-fx-v1');
let manualFx=savedFx&&finitePositive(savedFx.rate)&&Number(savedFx.rate)>700&&Number(savedFx.rate)<3000?Number(savedFx.rate):null;
function holdings(){return storage('isa-us-holdings-v1')||{}}
function fx(){
 if(finitePositive(manualFx))return {rate:manualFx,source:'사용자 직접 입력 환율',when:'수동 입력',manual:true};
 const r=window.ISA_US_APP?.getData?.()?.fx;
 if(!r?.ok||!finitePositive(r.usdKrw)||!r.observedAt)return null;
 const age=Date.now()-new Date(r.observedAt).getTime();
 if(!Number.isFinite(age)||age<0||age>8*86400000)return null;
 return {rate:Number(r.usdKrw),source:'공개 비공식 참고 환율',when:r.observedAt,manual:false};
}
function priceKrw(id,priceUsd){
 const p=holdings()[id]||{};
 if(finitePositive(p.krwCurrent)&&p.krwDay===day()){
  return {amount:Number(p.krwCurrent),manual:true,source:'토스 현재가 직접 입력',stamp:p.krwDay};
 }
 const rate=fx();
 if(rate&&finitePositive(priceUsd))return {amount:Number(priceUsd)*rate.rate,manual:false,
  source:'미국장 USD 종가 × '+rate.source,stamp:rate.when};
 return null;
}
function positionKrw(id,priceUsd){
 const p=holdings()[id]||{},q=priceKrw(id,priceUsd);
 if(!q||!finitePositive(p.qty)||!finitePositive(p.krwAvg))return null;
 const qty=Number(p.qty),avg=Number(p.krwAvg),value=q.amount*qty,principal=avg*qty,pnl=value-principal;
 const net=p.krwNet!==undefined&&p.krwNet!==null&&String(p.krwNet).trim()!==''&&Number.isFinite(Number(p.krwNet))&&Number(p.krwNet)>=0?Number(p.krwNet):null;
 return {qty,avg,price:q.amount,value,principal,pnl,net,inclusive:net!==null?pnl+net:null,
  postOne:(principal+q.amount)/(qty+1),source:q.source,stamp:q.stamp,manual:q.manual};
}
function cardLine(id,priceUsd){
 const q=priceKrw(id,priceUsd),p=positionKrw(id,priceUsd);
 if(!q)return '<span class="us-small">원화 가격: 환율 또는 토스 현재가 입력 필요</span>';
 return '<span class="us-krw-price">'+won(q.amount)+' <small>'+(q.manual?'토스 직접 입력 · 당일':'달러 종가 환산 추정치')+'</small></span>'+
 (p?'<span class="us-small '+(p.pnl>=0?'us-positive':'us-negative')+'">원화 평단 '+won(p.avg)+' · 평가손익 '+(p.pnl>=0?'+':'')+won(p.pnl)+'</span>':'');
}
function detailLine(id,priceUsd){
 const q=priceKrw(id,priceUsd),p=positionKrw(id,priceUsd);
 const header='<div class="us-ledger"><b>원화(KRW) 기준 매수 판단</b>';
 if(!q)return header+'<p class="us-small">미국장 종가에 적용할 환율 또는 토스 원화 현재가가 없습니다. 추정 가격을 표시하지 않습니다.</p></div>';
 let html=header+'<p>원화 표시가격 <b>'+won(q.amount,2)+'</b> · '+clean(q.source)+'</p>';
 if(!p)return html+'<p class="us-small">토스 보유수량과 원화 평단을 입력하면 평가손익과 1주 추가매수 후 예상 평단을 계산합니다.</p></div>';
 html+='<p>보유 '+p.qty.toLocaleString('ko-KR',{maximumFractionDigits:6})+'주 · 원화 평단 <b>'+won(p.avg)+'</b></p>'+
 '<p>원화 투자원금(평단 × 수량) '+won(p.principal)+' · 평가금액 '+won(p.value)+'</p>'+
 '<p>평가손익 <b class="'+(p.pnl>=0?'us-positive':'us-negative')+'">'+(p.pnl>=0?'+':'')+won(p.pnl)+'</b></p>';
 if(p.net!==null)html+='<p>누적 세후 배당·분배금 '+won(p.net)+' / <b>분배금 포함 총손익 '+(p.inclusive>=0?'+':'')+won(p.inclusive)+'</b></p>';
 else html+='<p class="us-small">누적 세후 배당금 미입력 · 분배금 포함 총손익은 계산하지 않습니다.</p>';
 html+='<p>현재 표시가격으로 1주 추가매수 후 추정 원화 평단 <b>'+won(p.postOne,2)+'</b>'+
 (p.postOne<p.avg?' · 평단 인하':' · 평단 인하 효과 없음')+'</p>'+
 '<p class="us-small">환율은 참고값이며 실제 토스 적용환율·거래 시각·수수료·표시 반올림과 차이 날 수 있습니다. 기존 평단을 현재 환율로 역산하지 않습니다. 분배금 재투자분은 실제 매입원가와 수량에 포함하고 누적 세후 분배금은 총손익 계산에만 한 번 반영합니다.</p></div>';
 return html;
}
function renderForm(){
 const area=$('us-krw-editor');if(!area)return;
 const h=holdings();
 area.innerHTML=ITEMS.map(ticker=>{
  const id=ticker.toLowerCase(),p=h[id]||{};
  const fmt=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x))?String(x):'';
  return '<div class="us-krw-form-row"><strong>'+ticker+'</strong>'+
   '<label>보유수량 (주)<input data-krw-id="'+id+'" data-k="qty" type="number" min="0" step="0.000001" value="'+fmt(p.qty)+'"></label>'+
   '<label>토스 원화 평단 (원)<input data-krw-id="'+id+'" data-k="krwAvg" type="number" min="0" step="0.01" value="'+fmt(p.krwAvg)+'"></label>'+
   '<label>토스 현재가 (원 · 당일만)<input data-krw-id="'+id+'" data-k="krwCurrent" type="number" min="0" step="0.01" value="'+(p.krwDay===day()?fmt(p.krwCurrent):'')+'"></label>'+
   '<label>누적 세후 배당·분배금 (원)<input data-krw-id="'+id+'" data-k="krwNet" type="number" min="0" step="0.01" value="'+fmt(p.krwNet)+'"></label>'+
   '</div>';
 }).join('');
 area.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
  const id=input.dataset.krwId,k=input.dataset.k;
  const h=holdings(),p={...(h[id]||{})},value=input.value.trim()===''?null:Number(input.value);
  if(value!==null&&Number.isFinite(value)&&value>=0&&(k!=='krwAvg'||value>0)&&(k!=='krwCurrent'||value>0))p[k]=value;
  else delete p[k];
  if(k==='krwCurrent')p.krwDay=finitePositive(p.krwCurrent)?day():'';
  h[id]=p;
  write('isa-us-holdings-v1',h);
  $('us-krw-message').textContent='해당 기기에 보유정보를 저장했습니다. 추가매수·재투자 후 다시 갱신하세요.';
  window.ISA_US_APP?.applyFromLocal?.();
 }));
}
function importHoldings(){
 const field=$('us-krw-import'),msg=$('us-krw-message');
 if(!field)return;
 const lines=field.value.trim().split(/\r?\n/),h=holdings();let good=0,bad=0;
 for(const line of lines){
  if(!line.trim())continue;
  const m=line.trim().match(/^(SCHD|AGNC|SPYM|CONY)\s+([\d.]+)\s+([\d,.]+)\s+([\d,.]+)$/i);
  if(!m){bad++;continue;}
  const id=m[1].toLowerCase(),qty=Number(m[2]),avg=Number(m[3].replace(/,/g,'')),current=Number(m[4].replace(/,/g,''));
  if(!(qty>=0)||!Number.isFinite(qty)||!(avg>0)||!(current>0)){bad++;continue;}
  h[id]={...(h[id]||{}),qty,krwAvg:avg,krwCurrent:current,krwDay:day()};
  good++;
 }
 if(!good){msg.textContent='형식 확인: SCHD 10 50000 49000 (티커 수량 평단원 현재가원)';return;}
 write('isa-us-holdings-v1',h);
 field.value='';renderForm();window.ISA_US_APP?.applyFromLocal?.();
 msg.textContent=good+'종목을 이 기기에 저장했습니다.'+(bad?' 형식 불일치 '+bad+'줄 제외.':'')+' 분배금은 별도 입력하세요.';
}

/* Personal portfolio snapshots are accepted only via a fragment on the user's
 * own link. Fragment data is not part of an HTTP request to GitHub Pages;
 * remove it from the address bar after one use. Never put private holdings
 * into the public application source, defaults or remote JSON. */
function applyPersonalLink(){
 const hash=String(window.location?.hash||'');
 if(!hash.startsWith('#us-holdings='))return;
 const info=$('us-krw-applied'),notice=$('us-krw-message');
 try{
  const value=decodeURIComponent(hash.slice('#us-holdings='.length));
  if(!value)throw Error('보유정보 없음');
  const cells=value.split(';');
  const asOf=cells.shift();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||cells.length!==4)throw Error('기준일 또는 종목 수 확인 불가');
  const seen=new Set(),updates={};
  for(const cell of cells){
   const a=cell.split(',');
   if(a.length!==3)throw Error('형식 오류');
   const id=String(a[0]).toLowerCase(),qty=Number(a[1]),avg=Number(a[2]);
   if(!ITEMS.includes(id.toUpperCase())||seen.has(id)||
      !Number.isFinite(qty)||qty<0||qty>10000000||
      !Number.isFinite(avg)||avg<=0||avg>1000000000)throw Error('종목·보유수량·평단가 검증 실패');
   seen.add(id);updates[id]={qty,krwAvg:avg};
  }
  const all=holdings();
  for(const [id,vals] of Object.entries(updates)){
   // Retain any existing separately entered USD cost bases and net distributions.
   all[id]={...(all[id]||{}),...vals,krwSnapshotDate:asOf};
   // Do not import 2026-10-30 prices as if they were fresh today.
   delete all[id].krwCurrent;
   delete all[id].krwDay;
  }
  if(!write('isa-us-holdings-v1',all))throw Error('기기 저장소 접근 실패');
  window.ISA_US_APP?.applyFromLocal?.();
  renderForm();
  const msg='토스 '+asOf+' 기준 미국주식 4종목 보유수량·원화 평단가를 이 기기에 적용했습니다. 이후 추가매수·재투자가 있었다면 갱신하세요.';
  if(info)info.textContent=msg;
  if(notice)notice.textContent=msg;
  if($('us-krw-details'))$('us-krw-details').open=true;
 }catch(e){
  const msg='보유정보 자동 적용 실패: '+String(e.message||e)+'. 입력 항목에서 직접 등록할 수 있습니다.';
  if(info)info.textContent=msg;
  if(notice)notice.textContent=msg;
 }finally{
  // Ensure personal share counts and cost bases do not linger in the URL bar.
  try{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}catch(_){}
 }
}
function showRate(){
 const r=fx(),area=$('us-krw-rate-status');if(!area)return;
 area.textContent=r?'적용 환율: 1 USD = '+won(r.rate,2)+' · '+r.source+' ('+r.when+')':'환율 확인 실패 · 환율 직접 입력 또는 토스 현재가를 사용하세요.';
}
function render(){
 showRate();
 window.ISA_US_APP?.rerender?.();
}
function mount(){
 const root=$('us-panel');if(!root)return;
 const head=$('us-updated');
 const holder=document.createElement('div');
 holder.id='us-krw-panel';holder.className='us-krw-panel';
 holder.innerHTML='<h3>미국주식 원화 평단·손익</h3>'+
 '<p class="us-small">달러 일봉과 별도로 토스 원화 현재가·평단을 표시합니다. 개인정보는 GitHub에 전송하지 않고 이 기기에만 저장합니다.</p>'+
 '<div id="us-krw-rate-status" class="us-small">환율 확인 중…</div>'+
 '<p id="us-krw-applied" class="us-small" aria-live="polite"></p>'+
 '<label>선택: 직접 적용할 USD/KRW 환율 (원)<input id="us-krw-fx" type="number" min="700" max="3000" step="0.01" placeholder="비워두면 수집한 참고 환율 사용" value="'+(manualFx||'')+'"></label>'+
 '<details id="us-krw-details"><summary>토스 보유수량·원화 평단·현재가 입력</summary>'+
 '<p class="us-small">현재가는 입력 당일에만 사용하고 다음 날에는 만료합니다. 1줄에 티커 / 수량 / 원화 평단 / 현재가 순으로 붙여넣으면 한 번에 저장할 수 있습니다.</p>'+
 '<textarea id="us-krw-import" rows="5" placeholder="SCHD 10 50000 49000&#10;SPYM 5 120000 118000"></textarea>'+
 '<button type="button" id="us-krw-import-button" class="us-header-button">입력한 4종목 저장</button>'+
 '<div id="us-krw-editor"></div>'+
 '<p class="us-small" id="us-krw-message">누적 세후 분배금은 실수령액을 따로 입력해 주세요.</p></details>';
 head.insertAdjacentElement('afterend',holder);
 $('us-krw-fx').addEventListener('change',function(){
  const rate=this.value.trim()===''?null:Number(this.value);
  if(rate===null){manualFx=null;try{localStorage.removeItem('isa-us-fx-v1')}catch(_){}}
  else if(rate>700&&rate<3000&&Number.isFinite(rate)){manualFx=rate;write('isa-us-fx-v1',{rate});}
  else{$('us-krw-message').textContent='유효 환율을 확인해 주세요. 임의 환율을 적용하지 않았습니다.';return;}
  render();
 });
 $('us-krw-import-button').onclick=importHoldings;
 const d=$('us-krw-details');d.addEventListener('toggle',()=>{if(d.open)renderForm();});
 renderForm();
 applyPersonalLink();
 window.ISA_US_KRW={cardLine,detailLine,basisKrw:positionKrw,fx,priceKrw};
 showRate();
 window.addEventListener('isa-us-quotes-refreshed',()=>render());
 render();
}
mount();
})();