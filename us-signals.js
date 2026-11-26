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
function brokerHolding(id){
 const b=window.ISA_TOSS_BROKER?.snapshot?.(),meta=window.ISA_TOSS_BROKER?.snapshotMeta?.();
 const fetched=Date.parse(b?.fetchedAt||''),age=Date.now()-fetched;
 if(!b?.ok||!Array.isArray(b.holdings)||meta?.state!=='live'||
  !Number.isFinite(age)||age<0||age>10*60000)return null;
 const q=b.holdings.find(h=>h?.marketCountry==='US'&&
  String(h.symbol||'').toUpperCase()===NAMES[id]);
 return q&&Number.isFinite(q.quantity)&&q.quantity>=0?q:null;
}
// Published NYSE holiday calendar 2026–2028; unknown years fail conservatively on weekdays.
// https://www.nyse.com/trade/hours-calendars
const US_HOLIDAYS=new Set('20260101 20260119 20260216 20260403 20260525 20260619 20260703 20260907 20261126 20261225 20270101 20270118 20270215 20270326 20270531 20270618 20270705 20270906 20271125 20271224 20280117 20280221 20280414 20280529 20280619 20280704 20280904 20281123 20281225'.split(' '));
const US_EARLY=new Set('20261127 20261224 20271126 20280703 20281124'.split(' '));
function usSession(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 const today=p.year+p.month+p.day,t=Number(p.hour)*60+Number(p.minute);
 const d=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');
 const key=z=>z.toISOString().slice(0,10).replace(/-/g,'');
 const trading=z=>![0,6].includes(z.getUTCDay())&&!US_HOLIDAYS.has(key(z));
 const close=US_EARLY.has(today)?780:960;
 const open=trading(d)&&t>=570&&t<close;
 if(!trading(d)||t<close){do{d.setUTCDate(d.getUTCDate()-1);}while(!trading(d));}
 return {open,expected:key(d),today,calendarKnown:['2026','2027','2028'].includes(p.year)};
}
function quote(id){
 const x=item(id),v=x?.close,session=usSession();
 let kr=window.ISA_US_KRW?.priceKrw?.(id,v);
 if(!session.open||kr?.kind==='toss-broker-last'){
  const fx=window.ISA_US_KRW?.fx?.();
  kr=valid(v)&&valid(Number(fx?.rate))?{amount:v*Number(fx.rate),usd:v,manual:false,kind:'usd-close',source:'확정 USD 종가 × '+fx.source}:null;
 }
 const p=read('isa-us-holdings-v1')?.[id]||{},actual=brokerHolding(id);
 const qty=actual?.quantity??num(p.qty),avg=num(p.krwAvg);
 const live=kr?.kind==='finnhub-private'&&valid(Number(kr.usd));
 const brokerRef=kr?.kind==='toss-broker-last'&&valid(Number(kr.usd));
 return {x,krw:kr,session,qty:qty!==null&&Number.isFinite(qty)&&qty>=0?qty:null,
  avg:valid(avg)?avg:null,usdClose:valid(v)?v:null,
  usdPrice:live||brokerRef?Number(kr.usd):valid(v)?Number(v):null,
  priceKind:live?'finnhub-private':brokerRef?'toss-broker-last':kr?.kind||'missing',
  brokerQtySource:!!actual};
}
function latest(x){
 if(!x||!x.ok||!/^\d{8}$/.test(x.date)||!Array.isArray(x.bars)||x.bars.length<40)return false;
 if(!valid(x.close)||!valid(x.low20)||!valid(x.high20)||x.low20>x.high20)return false;
 if(!x.trend||!valid(Number(x.trend.ma5))||!valid(Number(x.trend.ma20)))return false;
 const dt=new Date(x.date.slice(0,4)+'-'+x.date.slice(4,6)+'-'+x.date.slice(6,8)+'T12:00:00Z');
 const age=Date.now()-dt.getTime();
 return Number.isFinite(age)&&age>=0&&age<=7*86400000;
}
function chartAssessment(x){
 // Supplementary chart evidence based only on US completed daily bars.
 if(!latest(x))return {level:'unknown',ratio:null,note:'미국장 확정 일봉 확인 대기'};
 const t=x.trend||{},close=Number(x.close),ma5=Number(t.ma5),ma20=Number(t.ma20);
 const volume=t.volume!==null&&t.volume!==undefined?Number(t.volume):NaN;
 const previous=t.previousVolumeAverage!==null&&t.previousVolumeAverage!==undefined?
  Number(t.previousVolumeAverage):NaN;
 const ratio=Number.isFinite(volume)&&volume>=0&&Number.isFinite(previous)&&previous>0?
  volume/previous:null;
 const bars=x.bars,mean=(end,count)=>bars.slice(end-count+1,end+1)
  .reduce((sum,bar)=>sum+Number(bar.close),0)/count;
 let cross=null,crossDate=null;
 for(let i=bars.length-3;i<bars.length;i++){
  if(i<20)continue;
  const m5=mean(i,5),m20=mean(i,20),p5=mean(i-1,5),p20=mean(i-1,20);
  if(![m5,m20,p5,p20].every(v=>valid(v)))continue;
  if(p5<=p20&&m5>m20){cross='golden';crossDate=bars[i].date;}
  else if(p5>=p20&&m5<m20){cross='dead';crossDate=bars[i].date;}
 }
 const bearish=ma5<ma20&&!t.maRising&&close<ma20;
 const risk=ratio!==null&&ratio>=1.5&&(bearish||cross==='dead');
 const support=ratio!==null&&ratio>=1.2&&cross==='golden'&&!!t.maRising&&close>=ma20;
 const detail=(ratio!==null?'거래량 '+ratio.toFixed(2)+'배':'거래량 미확인')+
  (cross?' · 최근 3거래일 '+(cross==='golden'?'골든크로스':'데드크로스')+
   ' ('+String(crossDate).slice(4,6)+'/'+String(crossDate).slice(6,8)+')':'');
 return {level:risk?'risk':support?'support':ratio===null?'unknown':'neutral',
  ratio,cross,note:detail+(risk?' · 매수 보류 위험':support?' · 매수 보조 확인':' · 단독 매수 신호 아님')};
}
function dailyAmount(id){
 // All Toss US orders use KRW amounts with fractional shares; never 1-share orders.
 const fromPlanner=window.ISA_ORDER_PLAN?.tossDailyKrw?.(id);
 if(typeof fromPlanner==='number'&&Number.isFinite(fromPlanner)&&fromPlanner>=0)return fromPlanner;
 const saved=read('isa-unattended-order-plan-v1');
 const field={schd:'usSchdDaily',spym:'usSpymDaily',agnc:'usAgncDaily',cony:'conyCashDaily'}[id];
 const defaults={schd:4000,spym:3000,agnc:3000,cony:15000};
 const v=saved&&field!==undefined?saved[field]:undefined;
 return typeof v==='number'&&Number.isFinite(v)&&v>0?v:defaults[id]??0;
}
function evaluate(id,source,cap){
 const x=source?.x,usd=source?.usdPrice??source?.usdClose,kr=source?.krw,
  qty=source?.qty,avg=source?.avg;
 const basic=(type,title,reason,extra={})=>({
  type,title,reason,qty:0,amountKRW:null,sourceDate:x?.date||null,rule:'US closed daily candle',...extra});
 if(!NAMES[id])return basic('wait','종목 미확인','미국장 관리 대상 4종목이 아닙니다.');
 if(source?.session&&(!source.session.calendarKnown||x?.date!==source.session.expected))
  return basic('wait','최신 미국장 확정 종가 확인 보류','필요한 확정 일봉 '+source.session.expected+' · 현재 자료 '+(x?.date||'없음')+' · 이전 일봉으로 새 주문을 판단하지 않습니다.',{priceKind:source.priceKind,session:source.session});
 if(!latest(x))return basic('wait','시세 확인 대기','최근 미국장 확정 일봉 40개 및 5·20일선이 검증되지 않아 매수 판단을 보류합니다.');
 if(!kr||!valid(kr.amount))return basic('wait','원화가격 미확인 · 대기','참고 USD/KRW 환율과 원화 현재가 모두 확인되지 않아 매수 상한 및 원화 평단을 검증할 수 없습니다.');
 const t=x.trend,ma20=Number(t.ma20),ma5=Number(t.ma5);
 const b30=x.low20+(x.high20-x.low20)*.30,b20=x.low20+(x.high20-x.low20)*.20;
 const low=usd<=b30,deep=usd<=b20;
 // Allow a normal MA uptrend near the 20-day average, without mandatory two-day closes.
 const healthy=!!t.maRising&&ma5>ma20&&usd>=ma20*.99&&usd<=ma20*1.05;
 const down=usd<ma20||!t.maRising;
 const steep=usd<ma20*.9&&down;
 const splitRecent=id==='cony'&&Array.isArray(x.splits)&&x.splits.some(e=>{
  const d=new Date(String(e.date||'').slice(0,4)+'-'+String(e.date||'').slice(4,6)+'-'+String(e.date||'').slice(6,8)+'T12:00:00Z');
  const end=new Date(x.date.slice(0,4)+'-'+x.date.slice(4,6)+'-'+x.date.slice(6,8)+'T12:00:00Z');
  const age=end-d;
  return Number.isFinite(age)&&age>=0&&age<=30*86400000;
 });
 const graph=chartAssessment(x);
 const reasons=[low?(deep?'20거래일 저가 하단 20%':'20거래일 저가 하단 30%'):'20거래일 박스권 일반 구간',
  healthy?'5·20일선 상승·가격 20일선 부근 확인':down?'20일선 이탈 또는 기울기 약세':'상승 추세 추가 확인 필요',
  '그래프 매수 보조: '+graph.note];
 const extras={priceKRW:kr.amount,ma20USD:ma20,ma5USD:ma5,low,healthy,down,steep,
  graphLevel:graph.level,volumeRatio:graph.ratio,
  quoteSource:kr.source,quoteManual:!!kr.manual,
  session:source?.session,priceKind:source?.priceKind||'usd-close',brokerQtySource:!!source?.brokerQtySource,
  notes:reasons.concat([
   source?.priceKind==='finnhub-private'?
    '최근 미국 체결가에 직전 완료 일봉 5·20일선 적용 · 당일 확정 종가 아님':
   source?.priceKind==='toss-broker-last'?
    '토스 공식 잔고 최종 표시 단가 참고 · 체결 시각 없음 · 확정 종가/실시간 체결가 아님':
    '미국장 마지막 완료 일봉 기준 · 장중 체결가격 아님',
   source?.brokerQtySource?'보유수량: 토스 공식 계좌 방금 조회':'보유수량: 이 기기 저장값'
  ])};
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
 const lowOpportunity=low&&(avg===null||canLower);
 // Review only, never an automatic sell or a mechanical stop-loss.
 if(qty!==null&&qty>0&&avg!==null&&kr.amount>avg&&
   x.close<ma20*.94&&t.deadCross&&ma5<ma20)
  return basic('sell','매도 검토 · 하락 위험 확대',
   '완료된 미국장 종가가 20일선보다 6% 넘게 낮고 데드크로스가 확인됐습니다. 원화 평가이익 구간이라 일부 이익실현 여부를 검토할 수 있지만 장기 투자 방침, 실제 토스 평단, 세금, 배당 전망을 먼저 확인하세요. 자동 매도하지 않습니다.',
   {...extras,reviewOnly:true});
 if(graph.level==='risk')return basic('wait','거래량·약세 위험 확인 대기',
  '최근 확정 일봉의 강한 약세와 거래량 급증이 동시에 확인됐습니다. 무리한 추가매수를 보류하고 추세 안정 여부를 확인하세요. '+graph.note,extras);
 if(id==='agnc'){
  if(steep||t.deadCross)return basic('wait','AGNC 배당·자산가치 점검',
   'AGNC는 모기지 리츠 개별주입니다. 하락추세가 강해 장부가치(BVPS), 레버리지, 금리 민감도와 배당 지속성을 확인할 때까지 추가매수를 보류합니다.',extras);
  if(lowOpportunity||healthy)return basic('buy','AGNC 소액 정액 적립 검토',
   '기술적 조건을 충족했으나 배당만으로 안전성을 판단할 수 없습니다. 공식 BVPS·배당 지속성 확인과 별도 예산 점검 후 매일 설정된 원화 금액의 소수점 적립을 검토하세요.',
   {...extras,qty:0,amountKRW:dailyAmount(id)});
  return basic('wait','AGNC 추세·배당 확인 대기',
   '저가만으로 매수하지 않습니다. 기술적 약세와 공식 BVPS/배당 지속성 미확인 상태에서 대기합니다.',extras);
 }
 if(steep||t.deadCross)return basic('wait','하락 추세 확인 대기',
  '20일선 대비 큰 하락 또는 데드크로스 위험이 있습니다. 저가라도 반등 확인 전 분할매수는 보수적으로 대기합니다.',extras);
 if(lowOpportunity)return basic('buy','저가 소액 분할매수 검토',
  '저가 구간이므로 기존 원화 정액 적립 범위에서 분할매수를 검토합니다. 약세가 남아 있을 수 있으므로 과도한 추가매수는 피하고 보유 비중·예산을 확인하세요.',
  {...extras,qty:0,amountKRW:dailyAmount(id)});
 if(healthy)return basic('buy','추세 확인 소액매수 검토',
  '5일선 우위·20일선 상승 및 표시가격이 20일선 -1%~+5% 범위입니다. 최근 2일 종가 연속 확인은 필수 조건이 아니며, 원화 정액 소수점 적립을 검토하세요.',
  {...extras,qty:0,amountKRW:dailyAmount(id)});
 return basic('wait',low?'저가·추세 확인 대기':'추세·가격 조건 대기',
  (avg!==null&&kr.amount>=avg?'현재 가격은 입력된 원화 평단보다 낮지 않습니다. ':'')+
  '저가/평단 인하 또는 상승 추세 확인 조건이 충족되지 않아 신규 매수를 보류합니다.',extras);
}
function decision(id){
 if(id==='cony'&&read('isa-cony-autobuy-plan-v1')?.status!=='review'){
  // CONY shares the same chart interpretation, but a positive signal NEVER overrides the user's pause.
  const x=item(id),graph=chartAssessment(x);
  return {type:'stop',title:'CONY 자동매수 일시중단 유지',
   reason:'11월 1일부터 CONY 일 15,000원 자동매수를 일시 중단하고 그 금액을 현금으로 모으기로 한 최신 계획을 우선합니다. 실시간 COIN·공식 NAV·분배금 포함 총수익률·병합 공시 안정성을 이 앱에서 검증할 수 없으므로 가격 반등만으로 자동매수 재개하지 않습니다.',
   notes:['그래프 매수 보조: '+graph.note+' · 현재 자동매수 중단 유지'],
   qty:0,amountKRW:null,sourceDate:x?.date||null};
 }
 const q=quote(id),cap=getLimit(id);
 return evaluate(id,q,cap);
}
function cardStatus(id){
 const v=decision(id);
 const kind=['buy','wait','stop','sell'].includes(v.type)?v.type:'wait';
 const label=kind==='buy'?'매수 검토':kind==='stop'?'중지':kind==='sell'?'매도 검토':'보류';
 const note=id==='cony'&&kind==='stop'&&v.title==='CONY 자동매수 일시중단 유지'?
  '기존 CONY 자동매수 중단 계획 유지':v.title;
 return '<div class="us-card-signal state-'+kind+'" aria-label="'+
  esc(NAMES[id]||id)+' 매수 판단 '+label+' · '+esc(note)+'">'+
  '<strong class="us-card-signal-action">'+label+'</strong>'+
  '<span class="us-card-signal-note">'+esc(note)+(v.session&&!v.session.open?' · 확정 종가 기준':'')+'</span>'+
  '</div>';
}
function cardLine(id){
 const v=decision(id),daily=dailyAmount(id);
 return '<div class="us-trade-status state-'+v.type+'"><span class="us-signal-dot"></span>'+
  esc(v.title)+'</div>'+
  '<span class="us-small">토스 매일 주식모으기 설정 기준: <b>'+krw(daily)+'</b> · 소수점 적립 (실제 활성·중지 상태 별도 확인)</span>'+
  '<span class="us-small">기술적 판단: <b>'+
 (v.type==='sell'?'매도 여부 검토 · 자동 주문 아님':v.type==='buy'?'정액 적립 유지 검토':
 id==='cony'?'CONY 일시중지 유지 검토':'추가매수 주의 · 정액 모으기와 별개')+'</b></span>';
}
function detailLine(id){
 const v=decision(id);
 let html='<div class="us-decision-block us-decision-'+v.type+'">'+
  '<div class="us-decision-head"><b>'+esc(NAMES[id])+' · 기술적 참고: '+esc(v.title)+'</b>'+
  '<span class="us-decision-kind">'+(v.type==='buy'?'기술상 매수 검토':v.type==='stop'?'기술상 추가매수 중지':v.type==='sell'?'매도 검토 · 실제 주문 아님':'추세 확인 보류')+'</span></div>'+
  '<p>'+esc(v.reason)+'</p>';
 if(v.notes?.length)html+='<p class="us-small">'+v.notes.map(esc).join(' · ')+'</p>';
 html+='<p class="us-small">토스 매일 주식모으기 기준 <b>'+krw(dailyAmount(id))+' 원화 정액 소수점 매수</b> · 프로그램 판단: <b>'+(v.type==='sell'?'매도 여부 검토':v.type==='buy'?'정액매수 유지 검토':id==='cony'?'기존 매수 일시중지 유지':'보류·중지 검토')+'</b>'+
  '</b> · 시세 '+(v.sourceDate?v.sourceDate.slice(0,4)+'-'+v.sourceDate.slice(4,6)+'-'+v.sourceDate.slice(6,8):'확인 불가')+
  ' 미국장 확정 일봉에 기초한 참고 판단 · '+
 (v.priceKind==='finnhub-private'?'가격은 최근 개인 미국 체결가':'가격은 마지막 완료 일봉')+
 ' · 실제 매매 주문 아님</p>';
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
 const counts={buy:vals.filter(d=>d.type==='buy').length,stop:vals.filter(d=>d.type==='stop').length,
  sell:vals.filter(d=>d.type==='sell').length,wait:vals.filter(d=>d.type==='wait').length};
 panel.innerHTML='<div class="us-signal-counts"><div><b class="state-buy">매수 검토 '+counts.buy+'</b></div>'+
 '<div><b class="state-stop">추가매수 중지 '+counts.stop+'</b></div>'+
 '<div><b class="state-wait">매도 검토 '+counts.sell+'</b></div>'+
 '<div><b class="state-wait">보류 '+counts.wait+'</b></div></div>'+
 '<p class="us-small">'+(usSession().open?'미국 정규장 · 최근 가격 참고':'다음 미국 거래 준비 · 최신 확정 종가 기준')+' · 실제 주문 상태와 별도입니다.</p>';
}
function mount(){
 const container=$('us-panel');if(!container)return;
 const holder=document.createElement('div');
 holder.id='us-signals-panel';
 holder.className='us-signals-panel';
 holder.innerHTML=
 '<div id="us-signal-summary" hidden></div>'+
 '<details id="us-signal-settings"><summary>미국주식 원화 매수 상한 설정 (선택)</summary>'+
 '<p class="us-small">상한은 미설정이 기본값입니다. 투자자가 정한 상한을 초과하면 중단으로 표시합니다. 임의 상한을 자동으로 정하지 않습니다.</p>'+
 '<div id="us-signal-limits" class="us-signal-limits"></div>'+
 '<p class="us-small" id="us-signal-limits-note"></p></details>';
 const settingsRoot=$('cap-settings');
 if(settingsRoot)settingsRoot.appendChild(holder);else container.appendChild(holder);
 window.ISA_US_SIGNAL={evaluate,decision,cardLine,cardStatus,detailLine,settings,refreshSummary};
 updateLimitsUI();
 window.addEventListener('isa-us-quotes-refreshed',render);
 document.addEventListener('isa-toss-broker-data',render);
 window.addEventListener('isa-personal-us-quote-refreshed',render);
 render();
}
mount();
})();