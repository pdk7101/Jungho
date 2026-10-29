/* ISA ETF watchlist supplemental insights. Public market data only; personal records remain in localStorage. */
(function(){
'use strict';
const FUND=[
['reit','TIGER 리츠부동산인프라'],['robot','RISE AI&로봇'],['space','1Q 미국우주항공테크'],
['sofr','KODEX 미국달러SOFR'],['tr','KODEX 200TR'],['sol','SOL 200타겟위클리커버드콜']
];
const NAMES=Object.fromEntries(FUND);
const DOC_URL='https://www.soletf.co.kr/ko/fund/etf/211107?tabIndex=1';
const DIST_URL='https://wolbae.com/etf/0167B0/';
let quotes=null,metrics=null,metricHistory=null,distEntries=[],simShares=null,loaded=false;
const $=(id)=>document.getElementById(id);
const num=(v)=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const money=(n)=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1})+'원';
const pct=(n)=>((n>=0?'+':'')+n.toFixed(2)+'%');
const safe=(x)=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=(d)=>/^\d{8}$/.test(String(d))?(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)):'미확인';
const round5=(n)=>Math.floor(n/5)*5;
const getSaved=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
const writeSaved=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(_){return false}};
function vars(){
 const defaults={robotCap:9500,spaceCap:9700,solCap:10000,trBase:31150};
 const v=getSaved('isa-rules')||{};
 for(const k in defaults)if(!(num(v[k])>0))v[k]=defaults[k];
 return v;
}
function holdings(){return getSaved('isa-private-positions-v1')||{}}
function capsAt(id,rules){
 const key=id==='robot'?'robotCap':id==='space'?'spaceCap':'solCap';
 return Number(rules[key])||0;
}
function stateAt(bars,i,id,rules,h){
 if(i<19||i>=bars.length)return null;
 const rows=bars.slice(i-19,i+1),c=Number(bars[i].close);
 if(!rows.every(b=>num(b.close)>0&&num(b.low)>0&&num(b.high)>0))return null;
 const low=Math.min(...rows.map(b=>Number(b.low))),hi=Math.max(...rows.map(b=>Number(b.high)));
 const b20=round5(low+(hi-low)*.2),b30=round5(low+(hi-low)*.3);
 const ma20=rows.reduce((s,b)=>s+Number(b.close),0)/20;
 const ma5=rows.slice(-5).reduce((s,b)=>s+Number(b.close),0)/5;
 const avg=h&&num(h.qty)>0&&num(h.avg)>0?Number(h.avg):null;
 const zone=c<=b20?2:c<=b30?1:0;
 return {date:bars[i].date,close:c,zone,ma20,ma5,cap:(id==='robot'||id==='space'||id==='sol')&&c>capsAt(id,rules),
   belowAvg:avg!==null?c<avg:null,trigger200:id==='tr'&&c<=round5(Number(rules.trBase)*.95)};
}
function event(id,date,level,text,sub){
 return {id,date,level,text,sub:sub||'',title:NAMES[id],key:id+'|'+date+'|'+text};
}
function signalsFor(id,bars,rules,hold){
 const results=[];
 if(!Array.isArray(bars)||bars.length<21)return results;
 const h=hold[id];
 const from=Math.max(20,bars.length-14);
 for(let i=from;i<bars.length;i++){
  const a=stateAt(bars,i-1,id,rules,h),b=stateAt(bars,i,id,rules,h);
  if(!a||!b)continue;
  const d=b.date;
  const dailyMove=(b.close/a.close-1)*100;
  if(Math.abs(dailyMove)>=4){
   results.push(event(id,d,dailyMove<0?'risk':'normal','일일 종가 '+(dailyMove>0?'급등':'급락')+' '+pct(dailyMove),
    money(a.close)+' → '+money(b.close)+' · 단기 변동 주의'));
  }
  if(['robot','space','sol'].includes(id)&&a.cap!==b.cap){
   results.push(event(id,d,b.cap?'risk':'opportunity',b.cap?'매수 상한 신규 초과':'매수 상한 이내 재진입',money(a.close)+' → '+money(b.close)));
  }
  if(a.zone!==b.zone){
   const label=['일반 가격대','박스권 하단 30%','박스권 하단 20%'];
   results.push(event(id,d,b.zone>a.zone?'opportunity':'normal',label[b.zone]+' '+(b.zone>a.zone?'신규 진입':'구간 이탈'),label[a.zone]+' → '+label[b.zone]));
  }
  if(a.belowAvg!==null&&a.belowAvg!==b.belowAvg){
   results.push(event(id,d,b.belowAvg?'opportunity':'normal',
     b.belowAvg?'개인 평단가 아래 진입':'개인 평단가 위 재진입',
     money(a.close)+' → '+money(b.close)+' · 개인 평단가 기준'));
  }
  if((a.ma5<=a.ma20&&b.ma5>b.ma20)||(a.ma5>=a.ma20&&b.ma5<b.ma20)){
   const golden=a.ma5<=a.ma20&&b.ma5>b.ma20;
   results.push(event(id,d,golden?'opportunity':'risk',
     golden?'5일·20일선 골든크로스':'5일·20일선 데드크로스',
     '직전 일봉 대비 이동평균선 교차'));
  }
  if((a.close<=a.ma20&&b.close>b.ma20)||(a.close>=a.ma20&&b.close<b.ma20)){
   const up=a.close<=a.ma20&&b.close>b.ma20;
   results.push(event(id,d,up?'opportunity':'risk',up?'종가 20일선 상향 돌파':'종가 20일선 하향 이탈','당일 종가 기준'));
  }
  if(id==='tr'&&a.trigger200!==b.trigger200){
   results.push(event(id,d,b.trigger200?'opportunity':'normal',
     b.trigger200?'200TR -5% 감시가격 도달':'200TR -5% 감시가격 위 회복',
     '기존 하락 감시 기준 유지'));
  }
 }
 return results;
}
function metricSignals(){
 if(!metrics||!metricHistory||!metricHistory.byId)return [];
 const out=[];
 for(const x of metrics.items||[]){
  if(!x.ok||!x.date)continue;
  const records=(metricHistory.byId[x.id]||[]).filter(y=>y.date&&num(y.divergencePct)!==null).sort((a,b)=>a.date.localeCompare(b.date));
  const old=records.filter(y=>y.date<x.date).at(-1);
  if(!old)continue;
  const nowRisk=Math.abs(Number(x.divergencePct))>=1.5,oldRisk=Math.abs(Number(old.divergencePct))>=1.5;
  if(nowRisk!==oldRisk)out.push(event(x.id,x.date,nowRisk?'risk':'normal',nowRisk?'NAV 괴리율 주의구간 신규 진입':'NAV 괴리율 주의구간 이탈',pct(Number(old.divergencePct))+' → '+pct(Number(x.divergencePct))+' · 비공식 비교'));
  if(num(x.tradingValueKRW)!==null&&num(old.tradingValueKRW)!==null){
   const low=Number(x.tradingValueKRW)<5e7,was=Number(old.tradingValueKRW)<5e7;
   if(low!==was)out.push(event(x.id,x.date,low?'risk':'normal',low?'거래대금 5천만원 미만':'거래대금 5천만원 이상 회복','해당 거래일 비공식 거래대금'));
  }
  if(num(old.marketCapKRW)>0&&num(x.marketCapKRW)>0){
   const changed=(Number(x.marketCapKRW)/Number(old.marketCapKRW)-1)*100;
   if(Math.abs(changed)>=5)out.push(event(x.id,x.date,'normal','시가총액 1거래일 큰 변동 '+pct(changed),
      'ETF 시가총액의 변화일 뿐 실제 순유입·환매 확정 신호 아님'));
  }
  if(num(old.nav)>0&&num(x.nav)>0){
   const changed=(Number(x.nav)/Number(old.nav)-1)*100;
   if(Math.abs(changed)>=4)out.push(event(x.id,x.date,changed<0?'risk':'normal','NAV 1거래일 큰 변동 '+pct(changed),
      '분배락·시장변동 확인 필요 · NAV 변화만으로 분배금 포함 수익률 판단 금지'));
  }
  if(x.shares5&&Number.isFinite(x.shares5.value)){
   const drop=x.shares5.value<=-10;
   if(drop)out.push(event(x.id,x.date,'risk','추정 좌수 5거래일 -10% 이상',pct(x.shares5.value)+' · 실제 설정·환매 확인 필요'));
  }
 }
 return out;
}
function allSignals(){
 if(!quotes||!Array.isArray(quotes.items))return [];
 const r=vars(),h=holdings(),out=[];
 for(const x of quotes.items)if(x.ok&&Array.isArray(x.bars))out.push(...signalsFor(x.id,x.bars,r,h));
 out.push(...metricSignals());
 const distNote=getSaved('isa-sol-dist-edit-v1');
 const latestDate=quotes.items.filter(x=>x.ok).map(x=>x.date).sort().at(-1);
 if(distNote&&distNote.date===latestDate&&distNote.month&&num(distNote.amount)!==null){
  const comp=distEntries.slice().sort((a,b)=>b.month.localeCompare(a.month));
  const curr=comp.find(x=>x.month===distNote.month),prior=comp.filter(x=>x.month<distNote.month)[0];
  if(curr&&prior&&prior.amount>0){
   const changed=(curr.amount/prior.amount-1)*100;
   out.push(event('sol',latestDate,changed<=-10?'risk':'normal','확인 입력한 분배금 '+pct(changed),
     curr.month+' '+money(curr.amount)+'/주 · '+prior.month+' 대비 · 수동 입력 기록'));
  }
 }
 return out.sort((a,b)=>b.date.localeCompare(a.date)||({risk:0,opportunity:1,normal:2}[a.level]-{risk:0,opportunity:1,normal:2}[b.level]));
}
function alertLabel(s){
 return '<span class="change-item change-'+s.level+'"><b>'+safe(s.title)+'</b> · '+safe(s.text)+'<small>'+safe(day(s.date))+(s.sub?' · '+safe(s.sub):'')+'</small></span>';
}
function updateAlerts(){
 const area=$('important-changes'),history=$('signal-history');
 if(!area||!history)return;
 if(!quotes){area.textContent='자료 확인 중';return;}
 const latest=quotes.items.filter(x=>x.ok).map(x=>x.date).sort().at(-1);
 const all=allSignals(),fresh=all.filter(x=>x.date===latest);
 const prior=all.filter(x=>x.date!==latest).slice(0,20);
 const meta='<p class="fieldset-note">최근 수집 일봉 '+safe(day(latest))+' 기준 · 전 거래일 대비 신규로 바뀐 조건만 표시합니다. 개인 평단 신호는 해당 기기에 입력한 값 기준입니다.</p>';
 area.innerHTML=meta+(fresh.length?'<div class="change-feed">'+fresh.map(alertLabel).join('')+'</div>':'<p class="sub">이번 일봉에서 새로 바뀐 주요 조건이 없습니다. 기존 매수 중단·대기 상태는 종목별 카드를 확인하세요.</p>');
 history.innerHTML=prior.length?'<div class="change-feed">'+prior.map(alertLabel).join('')+'</div>':'<p class="sub">최근 분석 가능한 기간에 추가 변화 기록이 없습니다.</p>';
 // Each ETF card shows only latest-day material changes. Re-run after ordinary render.
 const cards=document.querySelectorAll('#funds [data-id]');
 cards.forEach(card=>{
  let spot=card.querySelector('.change-mini');
  if(!spot){spot=document.createElement('div');spot.className='change-mini';card.appendChild(spot);}
  const id=card.getAttribute('data-id'),e=fresh.filter(x=>x.id===id);
  spot.innerHTML=e.length?'<strong>새 변화: '+e.slice(0,2).map(x=>safe(x.text)).join(' · ')+(e.length>2?' 외 '+(e.length-2)+'건':'')+'</strong>':'<span class="sub">이번 일봉 중요 변화 없음</span>';
 });
}
const publicDists=[
{month:'2026-07',amount:150,source:'공개 분배금 이력'},
{month:'2026-08',amount:168,source:'공개 분배금 이력'},
{month:'2026-09',amount:170,source:'공개 분배금 이력'}
];
function getDists(){
 const v=getSaved('isa-sol-distributions-v1');
 if(v===null)return publicDists.map(x=>({...x}));
 if(!Array.isArray(v))return [];
 return v.filter(x=>/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month)&&num(x.amount)>=0&&num(x.amount)!==null)
 .map(x=>({month:x.month,amount:Number(x.amount),source:x.source==='공개 분배금 이력'?'공개 분배금 이력':'직접 입력'}))
 .sort((a,b)=>a.month.localeCompare(b.month)).slice(-48);
}
function saveDists(){return writeSaved('isa-sol-distributions-v1',distEntries)}
function latestDistribution(){
 return distEntries.slice().sort((a,b)=>b.month.localeCompare(a.month)).slice(0,3);
}
function distChange(){
 const rec=latestDistribution();
 if(rec.length<2||rec[1].amount<=0)return null;
 return {last:rec[0],previous:rec[1],pct:(rec[0].amount/rec[1].amount-1)*100};
}
function solData(){
 const q=quotes?.items?.find(x=>x.id==='sol'),m=metrics?.items?.find(x=>x.id==='sol');
 return {q:q&&q.ok?q:null,m:m&&m.ok?m:null};
}
function calcSolGoal(avg,qty,currentPrice){
 const shares=Number(qty)||0;
 const estimate=shares*avg;
 const needed30=Math.ceil(300000/avg),needed50=Math.ceil(500000/avg);
 return {estimate,needed30,needed50,additional30:Math.max(0,needed30-shares),additional50:Math.max(0,needed50-shares),
 additionalCost30:currentPrice>0?Math.max(0,needed30-shares)*currentPrice:null,
 additionalCost50:currentPrice>0?Math.max(0,needed50-shares)*currentPrice:null};
}
function updateSol(){
 const area=$('sol-summary'),records=$('sol-records'),message=$('sol-msg');
 if(!area||!records||!message)return;
 const {q,m}=solData(),recent=latestDistribution(),chg=distChange();
 const mean=recent.length===3?recent.reduce((a,b)=>a+b.amount,0)/3:null;
 const personal=holdings().sol||{};
 const shares=simShares===null?(Number(personal.qty)||0):simShares;
 const currentPrice=q?Number(q.close):null;
 const cal=mean>0?calcSolGoal(mean,shares,currentPrice):null;
 let words='<p class="fieldset-note"><b>분배금은 공개 지급 이력 또는 직접 확인해 입력한 금액</b>입니다. 분배금 자동 확정 조회는 연결돼 있지 않습니다. 계산은 세전 가정이며 지급을 보장하지 않습니다.</p>';
 if(m){
  words+='<p class="sol-data">NAV <b>'+money(m.nav)+'</b> · 괴리율 <b>'+pct(Number(m.divergencePct))+'</b> · 시가총액 '+Number(m.marketCap100m).toLocaleString('ko-KR')+'억원</p>';
  const hist=(metricHistory?.byId?.sol||[]).filter(x=>num(x.nav)>0).sort((a,b)=>a.date.localeCompare(b.date));
  if(hist.length>=2){
   const oldest=hist[0],last=hist[hist.length-1],change=(Number(last.nav)/Number(oldest.nav)-1)*100;
   words+='<p class="sol-data">기록 기간 NAV 변화: '+pct(change)+' ('+day(oldest.date)+'~'+day(last.date)+') · 분배금 미반영</p>';
  }else words+='<p class="sub">NAV 추세: 거래일 기록 축적 중. 분배금 반영 총수익률은 계산하지 않습니다.</p>';
 }else words+='<p class="sub">NAV와 ETF 괴리율은 확인된 게시 자료가 없습니다.</p>';
 if(chg){
  words+='<p class="sol-data">최근 기록된 주당 분배금 <b>'+money(chg.last.amount)+'</b> ('+safe(chg.last.month)+') · 전월 대비 <b class="'+(chg.pct<=-10?'error':'')+'">'+pct(chg.pct)+'</b></p>';
  if(chg.pct<=-10)words+='<p class="sol-warning">분배금 10% 이상 감소: 지속성과 NAV를 함께 확인하세요. ('+safe(chg.last.source)+')</p>';
 }
 if(cal){
  words+='<p class="sol-data">최근 3개 기록 평균 주당 <b>'+money(mean)+'</b> / 선택 수량 <b>'+shares.toLocaleString('ko-KR')+'주</b> 기준 월 세전 가정 <b>'+Math.round(cal.estimate).toLocaleString('ko-KR')+'원</b></p>';
  words+='<div class="sol-progress"><div style="width:'+Math.max(0,Math.min(100,cal.estimate/300000*100))+'%"></div></div>';
  words+='<p class="sol-data">월 30만원 목표: 약 <b>'+cal.needed30.toLocaleString('ko-KR')+'주</b> ('+cal.additional30.toLocaleString('ko-KR')+'주 추가 필요)'
   +(cal.additionalCost30!==null?' · 추가 매수대금 약 '+money(cal.additionalCost30):'')+'</p>';
  words+='<p class="sol-data">월 50만원 목표: 약 <b>'+cal.needed50.toLocaleString('ko-KR')+'주</b> ('+cal.additional50.toLocaleString('ko-KR')+'주 추가 필요)'
   +(cal.additionalCost50!==null?' · 추가 매수대금 약 '+money(cal.additionalCost50):'')+'</p>';
 }else words+='<p class="sub">서로 다른 3개월의 주당 분배금 기록이 있으면 목표 달성에 필요한 수량을 계산합니다.</p>';
 words+='<p class="sol-warning">분배금 포함 총수익률: 검증된 동일 기간의 수정기준가 자료가 없어 계산하지 않습니다. NAV 단순 변동을 원금 훼손으로 단정하지 마세요. 옵션 프리미엄 목표율은 확정 분배율이 아닙니다.</p>';
 area.innerHTML=words;
 records.innerHTML=distEntries.slice().sort((a,b)=>b.month.localeCompare(a.month)).map(r=>
   '<div class="sol-dist-row"><span>'+safe(r.month)+'</span><span>'+money(r.amount)+'/주 <small>'+safe(r.source)+'</small></span><button type="button" class="sol-del" data-month="'+safe(r.month)+'" aria-label="'+safe(r.month)+' 기록 삭제">삭제</button></div>'
 ).join('')||'<p class="sub">입력된 분배금 기록이 없습니다.</p>';
 records.querySelectorAll('button[data-month]').forEach(btn=>btn.onclick=()=>{
  distEntries=distEntries.filter(r=>r.month!==btn.dataset.month);saveDists();updateSol();updateAlerts();
 });
 message.textContent=recent.length?'최근 분배금 기록 '+recent[0].month+' · 출처: '+recent[0].source:'기록 없음';
 const sim=$('sol-sim-shares');
 if(sim&&document.activeElement!==sim)sim.value=String(shares);
}
function mount(){
 const root=$('summary');
 if(!root||$('important-changes'))return;
 const panel=document.createElement('section');
 panel.className='panel';panel.id='changes-panel';
 panel.innerHTML='<h2>중요 변화 · 이번 일봉에서 새로 발생한 신호</h2><div id="important-changes">시세 확인 중</div>'+
 '<details><summary>최근 매수판단 변화 이력 보기</summary><p class="fieldset-note">최근 40거래일 일봉에서 계산 가능한 범위의 변화만 복원했습니다. 개인 평단가가 바뀌면 과거 비교도 현재 입력 기준으로 다시 계산됩니다. 이전 실제 주문 이력과는 다릅니다.</p><div id="signal-history"></div></details>';
 root.parentNode.insertBefore(panel,root);
 const sol=document.createElement('section');sol.className='panel';sol.id='sol-panel';
 sol.innerHTML='<h2>SOL 200타겟위클리커버드콜 · 분배금 및 NAV</h2>'+
 '<p class="fieldset-note">월 분배금 목표: 세전 30만~50만원 · ETF 실제 분배금·NAV·옵션 운용정보는 <a href="'+DOC_URL+'" target="_blank" rel="noopener noreferrer">운용사 SOL ETF 공식 안내</a>에서 확인하세요. 지급내역 교차 확인: <a href="'+DIST_URL+'" target="_blank" rel="noopener noreferrer">과거 분배금 이력</a>.</p>'+
 '<label class="sol-input-label">목표 계산용 가정 수량 (주) <input id="sol-sim-shares" type="number" min="0" step="1" placeholder="내 보유수량 또는 가정 수량"></label>'+
 '<div id="sol-summary"></div>'+
 '<details><summary>주당 월 분배금 기록 추가·수정</summary>'+
 '<p class="fieldset-note">처음 표시된 2026년 7~9월 분배금은 공개 지급 이력의 과거 확인치이며, 현재 월 금액을 자동으로 추정하지 않습니다. 이후 공식 공시를 확인한 값만 입력하세요.</p>'+
 '<div class="sol-inputs"><label>지급 기준 월<input type="month" id="sol-dist-month" min="2026-03"></label><label>확인된 주당 분배금 (원)<input type="number" id="sol-dist-amount" min="0" step="0.01" placeholder="공식 확인 금액"></label></div>'+
 '<button id="sol-dist-save" type="button">분배금 기록 저장</button><p id="sol-msg" class="fieldset-note"></p><div id="sol-records"></div></details>';
 const detail=$('detail');detail.parentNode.insertBefore(sol,detail);
 $('sol-dist-save').onclick=()=>{
  const month=$('sol-dist-month').value,amount=num($('sol-dist-amount').value);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||amount===null||amount<0){$('sol-msg').textContent='확인된 기준 월과 0원 이상의 주당 분배금을 입력하세요.';return;}
  const old=distEntries.find(r=>r.month===month);
  if(old)old.amount=amount,old.source='직접 입력';
  else distEntries.push({month,amount,source:'직접 입력'});
  distEntries.sort((a,b)=>a.month.localeCompare(b.month));saveDists();
  const latestDate=quotes?.items?.filter(x=>x.ok).map(x=>x.date).sort().at(-1);
  writeSaved('isa-sol-dist-edit-v1',{date:latestDate,month,amount});
  updateSol();updateAlerts();
  $('sol-msg').textContent='해당 기기에 분배금 기록을 저장했습니다. 공식 공시와 금액을 대조하세요.';
 };
 $('sol-sim-shares').onchange=function(){
  const n=num(this.value);simShares=n!==null&&n>=0?Math.floor(n):0;updateSol();
 };
 distEntries=getDists();
}
async function reloadAll(){
 if(!loaded)return; // only bootstrap after mount
 try{
  const files=await Promise.allSettled(['quotes.json','metrics.json','metric-history.json'].map(async file=>{
   const r=await fetch('./'+file+'?t='+Date.now(),{cache:'no-store'});
   if(!r.ok)throw Error(file+' '+r.status);
   return r.json();
  }));
  quotes=files[0].status==='fulfilled'?files[0].value:null;
  metrics=files[1].status==='fulfilled'?files[1].value:null;
  metricHistory=files[2].status==='fulfilled'?files[2].value:null;
  updateAlerts();updateSol();
  if(!quotes&&$('important-changes'))$('important-changes').textContent='일봉을 확인할 수 없어 새로운 매수판단 변화는 표시하지 않습니다.';
  if(!metrics&&$('sol-summary'))$('sol-summary').insertAdjacentHTML('afterbegin','<p class="sol-warning">현재 NAV 자료 확인 실패 · 공개 분배금 기록과 목표 계산만 표시합니다.</p>');
 }catch(e){
  const s=$('important-changes');
  if(s)s.textContent='변화 분석 데이터를 확인하지 못했습니다: '+String(e.message||e);
  const ss=$('sol-summary');
  if(ss)ss.innerHTML='<p class="sub">일부 자료가 없어 최신 NAV 비교를 확인할 수 없습니다. 분배금 기록은 기기에서 유지됩니다.</p>';
 }
}
mount();loaded=true;
document.addEventListener('isa-rendered',()=>{updateAlerts();updateSol();});
const btn=$('reload');if(btn)btn.addEventListener('click',()=>reloadAll());
const controls=$('positions');if(controls)controls.addEventListener('change',()=>{simShares=null;updateAlerts();updateSol();});
['robotCap','spaceCap','solCap','trBase'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',()=>updateAlerts());});
reloadAll();
})();
