import {ACCOUNT_NAMES,initialPreview,previewAdd,previewRows,previewCounts} from './registry-ui-preview.mjs';
import {watchClient} from './registry-cloud-client-v17.mjs';
import {krxClient} from './registry-krx-client-v17.mjs';
import {inputNumber,editNewBasis,valueNewPosition,newPositionTotals,validFx} from './registry-valuation-v17.mjs';
import {positionClient} from './registry-position-client-v17.mjs';
import {readLegacyBasis,consolidated,loadPublishedReference,mergeReferenceDaily} from './registry-consolidated-v17.mjs';
const $=id=>document.getElementById(id);
let model=initialPreview(),client=null,quotes=null,busy=false,canWrite=false,krClient=null,krQuotes=null,dailyQuotes=null;
let legacyBasis={},legacyConfirmed=false,autoFx=null,publicDaily=null;
let basis={},fx=null,position=null,positionRows={},positionReady=false,drafts={},cloudUrl='';
const won=n=>n===null?'미확인':Math.round(n).toLocaleString('ko-KR')+'원';
const valuationInputs=()=>({live:quotes,daily:mergeReferenceDaily(publicDaily,dailyQuotes),kr:krQuotes,fx:validFx(fx)?fx:validFx(autoFx)?autoFx:null});
const el=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e};
function message(value,error=false){$('message').textContent=value;$('message').dataset.error=String(error)}
function adjust(){const us=$('account').value==='toss-us';$('venue-label').hidden=us;$('venue').disabled=us;$('symbol').maxLength=us?15:6;$('symbol').placeholder=us?'예: QQQM':'예: 329200';}
function render(){
 const count=previewCounts(model);
 $('counts').textContent='고유 종목 '+count.instruments+'/100 · 계좌별 등록 '+count.positions+'건 · 미국 수집 대상 '+count.usSymbols+'개';
 const list=$('list');list.replaceChildren();
 const combined=$('combined-totals');combined.replaceChildren();
 const result=consolidated(model,{legacyBasis,newBasis:basis,legacyConfirmed,newConfirmed:!!client&&positionReady,inputs:valuationInputs()});
 for(const [account,t] of [...Object.entries(result.accounts),['all',result.all]])combined.append(el('p',(account==='all'?'전체':ACCOUNT_NAMES[account])+' · '+t.count+'건 · 원금 '+won(t.cost)+' · 참고 평가 '+won(t.value)+' · 손익 '+won(t.profit)+' · 수익률 '+(t.returnPct===null?'미확인':t.returnPct.toFixed(2)+'%')+' · 미확인 '+t.missing+'건 · 가격 기준 '+(t.dates.join(', ')||'미확인'),'sub'));
 combined.append(el('p','기존·신규 통합 배당금: 중복 범위 확인 전 보류','sub'));
 const active=valuationInputs().fx;$('fx-status').textContent=active?(active.manual?'직접 입력':'자동 참고환율')+' · '+active.rate.toLocaleString('ko-KR')+'원/USD · 기준 '+active.date+' · 실제 증권사 환율 아님':'유효한 참고환율 미확인';
 const totals=$('new-totals');totals.replaceChildren();
 for(const [account,t] of Object.entries(newPositionTotals(model,basis,valuationInputs()))){if(!t.count)continue;totals.append(el('p',ACCOUNT_NAMES[account]+' · 신규 '+t.count+'건 · 원금 '+won(t.cost)+' · 참고 평가 '+won(t.value)+' · 손익 '+won(t.profit)+' · 세후 분배금 '+won(t.netDistributionsKRW)+' · 미확인 '+t.missing+'건','sub'));}
 for(const [account,name] of Object.entries(ACCOUNT_NAMES)){
  if($('filter').value!=='all'&&$('filter').value!==account)continue;
  const rows=previewRows(model,account);
  list.append(el('h3',name+' ('+rows.length+')'));
  for(const r of rows){
   const row=el('article','','row');
   let price=r.priceStatus,dailyNote=null;
   if(client&&account==='toss-us'){
    const q=quotes?.bySymbol?.[r.symbol],now=Date.now(),trade=Date.parse(q?.tradeAt),received=Date.parse(q?.receivedAt);
    const usable=q?.symbol===r.symbol&&typeof q.usd==='number'&&Number.isFinite(q.usd)&&q.usd>0&&trade<=now&&now-trade<=45*60000&&received<=now&&now-received<=7*60000;
    const d=dailyQuotes?.bySymbol?.[r.symbol];
    const dailyValid=d?.symbol===r.symbol&&d.currency==='USD'&&Number.isFinite(d.close)&&d.close>0&&/^\d{8}$/.test(d.date)&&/^\d{8}$/.test(dailyQuotes?.expectedDate||'')&&d.date<=dailyQuotes.expectedDate;
    const ready=dailyValid&&d.date===dailyQuotes.expectedDate&&d.status==='ready'&&d.barCount===40&&[d.ma5,d.ma20,d.low20,d.high20].every(v=>Number.isFinite(v)&&v>0);
    dailyNote=dailyValid?'미국 일봉 '+d.date+' · USD '+d.close.toFixed(2)+(ready?' · 5일선 '+d.ma5.toFixed(2)+' · 20일선 '+d.ma20.toFixed(2)+' · 20일 범위 '+d.low20.toFixed(2)+'~'+d.high20.toFixed(2):' · 최신성 또는 40거래일 자료 부족')+' · 신규 매수 판단 보류':'미국 확정 일봉 미연결 · 공급원 승인 또는 수집 대기';
    price=usable?'USD '+q.usd.toFixed(2)+' · 체결 '+new Date(trade).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · 원화 환산 미연결':'미국 예약 시세 대기 또는 만료';
   }else if(account!=='toss-us'&&krClient){
    const id='KR:'+r.venue+':'+r.symbol,q=krQuotes?.byId?.[id];
    price=q?.close>0?'KRW '+q.close.toLocaleString('ko-KR')+'원 · 공식 일별 종가 '+q.date.slice(0,4)+'-'+q.date.slice(4,6)+'-'+q.date.slice(6)+(q.date!==krQuotes.asOfCandidate?' · 이전 자료':'')+' · 실시간 아님':'KRX 공식 종가 미확인';
   }else if(client&&r.added)price='국내 신규 시세 연결 대기';
   row.append(el('strong',r.name+' ('+r.symbol+')'),el('p',r.venue+' · '+r.status,r.added?'wait':'sub'),el('p',(r.added?'':'수량 미확인 · 평단 미확인 · ')+price,'sub'));
   if(dailyNote)row.append(el('p',dailyNote,'sub'));
   if(r.added){
    const v=valueNewPosition(model,basis,r.id,valuationInputs());
    row.append(el('p','수량 '+(v.qty??'미확인')+' · 평단 '+won(v.avgKRW),'sub'),el('p','투자원금 '+won(v.cost)+' · 참고 평가액 '+won(v.value),'sub'),el('p','평가손익 '+won(v.profit)+' · 수익률 '+(v.returnPct===null?'미확인':v.returnPct.toFixed(2)+'%'),'sub'),el('p','누적 세후 분배금 직접 입력 '+won(v.netDistributionsKRW)+' · 평가손익과 별도','sub'));
    if(v.quote)row.append(el('p','참고 평가 기준 '+v.quote.date+(v.quote.fxDate?' · 환율 기준 '+v.quote.fxDate:'')+' · 실제 증권사 평가액 아님','sub'));
    const form=document.createElement('form');const fields={};
    for(const [k,label] of [['qty','보유수량'],['avgKRW','원화 평단'],['netDistributionsKRW','누적 세후 배당·분배금(원)']]){
     const wrap=el('label',label),input=document.createElement('input');input.type='number';input.min='0';input.step=k==='qty'&&r.account!=='toss-us'?'1':'any';input.value=drafts[r.id]?.[k]??v[k]??'';input.addEventListener('input',()=>{drafts[r.id]??={};drafts[r.id][k]=input.value});wrap.append(input);form.append(wrap);fields[k]=input;
    }
    const btn=el('button',client?'서버 투자기록 저장':'신규 종목 평가 테스트 저장');btn.type='submit';btn.disabled=!!client&&(!position||!positionReady);form.append(btn);
    if(positionRows[r.id])form.append(el('p','서버 기록 버전 '+positionRows[r.id].revision+' · '+positionRows[r.id].updatedAt,'sub'));
    if(drafts[r.id])form.append(el('p','미저장 입력이 남아 있습니다. 서버 기록과 비교 후 저장하세요.','wait'));
    const status=el('p','','sub');form.append(status);
    form.addEventListener('submit',async e=>{
     e.preventDefault();if(busy||client&&(!position||!positionReady))return;
     let next;
     drafts[r.id]=Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,input.value]));
     try{next=editNewBasis(model,basis,r.id,Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,inputNumber(input.value)])));}catch(_){status.textContent='수량·평단·분배금 입력값을 확인하세요.';return;}
     if(!client){basis=next;delete drafts[r.id];render();return;}
     if(!window.confirm('이 계좌의 신규 종목 기록을 저장할까요?'))return;
     busy=true;controls();btn.disabled=true;
     try{
      const saved=await position.save(model,r.id,next[r.id],positionRows[r.id]?.revision??0);
      positionRows={...positionRows,[r.id]:saved};basis={...basis,[r.id]:saved.data};delete drafts[r.id];
      positionStatus('서버 저장 확인 완료 · 다른 기기는 다시 조회하면 반영됩니다.');
     }catch(e){
      positionReady=false;
      positionStatus(e.message==='basis_conflict'?'다른 기기 변경 감지 · 입력 초안 유지 · 서버 투자기록 다시 조회 후 비교하세요.':'저장 확인 실패 · 입력 초안 유지 · 다시 조회 후 서버 기록을 확인하세요.');
     }finally{busy=false;controls();render();}
    });row.append(form);
   }
   list.append(row);
  }
 }
}
$('account').addEventListener('change',adjust);
$('filter').addEventListener('change',render);
function controls(){
 $('reference-refresh').disabled=busy;$('legacy-read').disabled=busy;
 $('connect').disabled=busy||!!client;$('disconnect').disabled=busy||!client;
 $('cloud-refresh').disabled=busy||!client;$('add').disabled=busy||!!client&&!canWrite;
 $('kr-connect').disabled=busy||!!krClient;$('kr-refresh').disabled=busy||!krClient;$('kr-disconnect').disabled=busy||!krClient;
 $('position-connect').disabled=busy||!client||!!position;
 $('position-refresh').disabled=busy||!position;
 $('add').textContent=client?'서버에 종목 등록':'종목 등록 테스트';
}
function positionStatus(value){$('position-status').textContent=value}
async function refreshPositions(){
 if(!position)return;
 positionReady=false;
 try{const next=await position.load(model);positionRows=next;basis=Object.fromEntries(Object.entries(next).map(([id,r])=>[id,r.data]));positionReady=true;positionStatus('서버 신규 투자기록 '+Object.keys(next).length+'건 확인 · 미저장 입력은 유지됩니다.');}
 catch(_){positionStatus('서버 투자기록 조회 실패 · 저장 중단 · 기존 확인값과 입력 초안 유지');}
}
function krStatus(value){$('kr-status').textContent=value}
async function refreshKr(){
 if(!krClient)return;
 try{krQuotes=await krClient.closes(model);const all=Object.values(krQuotes.byId),count=all.filter(q=>q.close>0).length;krStatus('공식 종가 확인 '+count+'/'+all.length+' · 거래일별 자료 · 당일 실시간 아님');}
 catch(_){krQuotes=null;krStatus('KRX 조회 실패 · 인증·승인·제한 확인 필요');}
}
function cloudStatus(value){$('cloud-status').textContent=value}
async function refreshReference(){try{const p=await loadPublishedReference();autoFx=p.fx;publicDaily=p.daily;}catch(_){autoFx=null;publicDaily=null;}}
async function refreshQuotes(){
 await refreshReference();
 const [live,daily]=await Promise.allSettled([client.quotes(),client.daily()]);
 quotes=live.status==='fulfilled'?live.value:null;dailyQuotes=daily.status==='fulfilled'?daily.value:null;
 return live.status==='fulfilled';
}
$('connection').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||client||!$('confirm-dev').checked)return;
 if(model.added.length&&!window.confirm('메모리 테스트 등록은 서버로 이전되지 않습니다. 서버 목록으로 전환할까요?'))return;
 busy=true;controls();
 try{
  const writeToken=$('write-token').value;
  const candidate=watchClient({url:$('worker-url').value,viewToken:$('view-token').value,writeToken});
  const next=await candidate.load();client=candidate;cloudUrl=$('worker-url').value;model=next;basis={};drafts={};canWrite=Boolean(writeToken);
  krQuotes=null;const ok=await refreshQuotes();cloudStatus('서버 목록 확인 · '+(canWrite?'등록 토큰 입력됨':'조회 전용')+(ok?' · 시세 캐시 조회 완료':' · 시세 확인 실패'));
 }catch(_){cloudStatus('개발 Worker 연결 실패 · 주소·토큰·버전을 확인하세요.');}
 finally{$('view-token').value='';$('write-token').value='';busy=false;controls();render();}
});
$('cloud-refresh').addEventListener('click',async()=>{
 if(busy||!client)return;busy=true;controls();
 try{model=await client.load();await refreshPositions();krQuotes=null;const ok=await refreshQuotes();cloudStatus(ok?'서버 목록과 시세 캐시 조회 완료':'서버 목록 확인 · 시세 조회 실패');}
 catch(_){quotes=null;dailyQuotes=null;cloudStatus('서버 조회 실패 · 마지막 확인 목록 유지');}
 finally{busy=false;controls();render();}
});
$('disconnect').addEventListener('click',()=>{
 if(busy)return;if(Object.keys(drafts).length&&!window.confirm('미저장 입력을 버리고 연결을 해제할까요?'))return;position=null;positionReady=false;positionRows={};drafts={};cloudUrl='';positionStatus('미연결');client=null;quotes=null;dailyQuotes=null;krQuotes=null;canWrite=false;basis={};model=initialPreview();$('confirm-dev').checked=false;cloudStatus('연결 해제 · 오프라인 미리보기');controls();render();
});
$('registration').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||client&&!canWrite)return;
 const input={account:$('account').value,venue:$('venue').value,symbol:$('symbol').value,name:$('name').value};
 busy=true;controls();
 try{
  // Validate locally first, but always reconcile connected mode with server.
  const checked=previewAdd(model,input);
  const result=client?await client.register(input):checked;
  model=result.model;
  if(client){await refreshPositions();await refreshQuotes();}
  if(input.account!=='toss-us'&&krClient){krQuotes=null;krStatus('등록 목록 변경 · 국내 종목 다시 조회를 누르세요');}
  $('filter').value=input.account;render();
  message(result.duplicate?'이미 해당 계좌에 등록된 종목입니다.':client?'서버 저장 확인 완료 · 실제 시세와 투자 규칙 확인 전 보류':'테스트 등록 완료 · 실제 시세와 투자 규칙 확인 전 보류');
  if(!result.duplicate){$('symbol').value='';$('name').value='';$('symbol').focus()}
 }catch(_){message(client?'등록 또는 저장 확인 실패 · 다시 조회하여 중복 여부를 확인하세요.':'입력한 계좌·시장·종목코드·종목명을 확인하세요. 최대 고유 종목 100개입니다.',true)}
 finally{busy=false;controls();}
});
$('kr-connection').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||krClient||!$('kr-confirm').checked)return;
 busy=true;controls();
 try{krClient=krxClient({url:$('kr-worker-url').value,token:$('kr-token').value});await refreshKr();}
 catch(_){krClient=null;krQuotes=null;krStatus('KRX 개발 Worker 주소 또는 조회 토큰 확인 필요');}
 finally{$('kr-token').value='';busy=false;controls();render();}
});
$('kr-refresh').addEventListener('click',async()=>{if(busy||!krClient)return;busy=true;controls();try{await refreshKr();}finally{busy=false;controls();render();}});
$('kr-disconnect').addEventListener('click',()=>{if(busy)return;krClient=null;krQuotes=null;$('kr-confirm').checked=false;krStatus('연결 해제');controls();render();});
$('fx-form').addEventListener('submit',e=>{e.preventDefault();if(busy)return;try{const candidate={rate:inputNumber($('fx-rate').value),date:$('fx-date').value.replaceAll('-','')};if(!validFx(candidate))throw Error('fx');fx={...candidate,manual:true};render();}catch(_){window.alert('환율 및 최근 3일 이내 기준일을 확인하세요.');}});
$('fx-clear').addEventListener('click',()=>{if(busy)return;fx=null;$('fx-rate').value='';$('fx-date').value='';$('fx-status').textContent='참고환율 미입력';render();});
$('position-connection').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!client||position)return;
 busy=true;controls();
 try{position=positionClient({url:cloudUrl,token:$('position-token').value});await refreshPositions();if(!positionReady)position=null;}
 catch(_){position=null;positionReady=false;positionStatus('투자기록 연결 실패 · 별도 토큰 설정 확인');}
 finally{$('position-token').value='';busy=false;controls();render();}
});
$('position-refresh').addEventListener('click',async()=>{if(busy||!position)return;busy=true;controls();try{model=await client.load();await refreshPositions();}catch(_){positionReady=false;positionStatus('등록 목록 재조회 실패 · 저장 중단');}finally{busy=false;controls();render();}});
$('legacy-confirm').addEventListener('change',()=>{legacyConfirmed=false;$('legacy-status').textContent='다시 읽어 확인하세요.';render();});
$('legacy-read').addEventListener('click',()=>{if(busy)return;legacyBasis=readLegacyBasis(localStorage);legacyConfirmed=$('legacy-confirm').checked;const known=Object.values(legacyBasis).filter(x=>x.qty!==null&&(x.qty===0||x.avgKRW!==null)).length;$('legacy-status').textContent='기존 직접 입력 '+known+'/20건 · '+(legacyConfirmed?'사용자 확인 기준 참고 평가':'확인 전 합산 보류');render();});
window.addEventListener('storage',e=>{if(e.key===null||['isa-private-positions-v1','isa-private-toss-domestic-holdings-v1','isa-us-holdings-v1'].includes(e.key)){legacyConfirmed=false;$('legacy-confirm').checked=false;$('legacy-status').textContent='기존 기록 변경 감지 · 다시 확인하세요.';render();}});
$('reference-refresh').addEventListener('click',async()=>{if(busy)return;busy=true;controls();try{await refreshReference();}finally{busy=false;controls();render();}});
adjust();render();controls();message('등록 테스트 가능');
refreshReference().then(render);
