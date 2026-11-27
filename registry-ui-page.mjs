import {ACCOUNT_NAMES,initialPreview,previewAdd,previewRows,previewCounts} from './registry-ui-preview.mjs';
import {watchClient} from './registry-cloud-client-v17.mjs';
const $=id=>document.getElementById(id);
let model=initialPreview(),client=null,quotes=null,busy=false,canWrite=false;
const el=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e};
function message(value,error=false){$('message').textContent=value;$('message').dataset.error=String(error)}
function adjust(){const us=$('account').value==='toss-us';$('venue-label').hidden=us;$('venue').disabled=us;$('symbol').maxLength=us?15:6;$('symbol').placeholder=us?'예: QQQM':'예: 329200';}
function render(){
 const count=previewCounts(model);
 $('counts').textContent='고유 종목 '+count.instruments+'/100 · 계좌별 등록 '+count.positions+'건 · 미국 수집 대상 '+count.usSymbols+'개';
 const list=$('list');list.replaceChildren();
 for(const [account,name] of Object.entries(ACCOUNT_NAMES)){
  if($('filter').value!=='all'&&$('filter').value!==account)continue;
  const rows=previewRows(model,account);
  list.append(el('h3',name+' ('+rows.length+')'));
  for(const r of rows){
   const row=el('article','','row');
   let price=r.priceStatus;
   if(client&&account==='toss-us'){
    const q=quotes?.bySymbol?.[r.symbol],now=Date.now(),trade=Date.parse(q?.tradeAt),received=Date.parse(q?.receivedAt);
    const usable=q?.symbol===r.symbol&&typeof q.usd==='number'&&Number.isFinite(q.usd)&&q.usd>0&&trade<=now&&now-trade<=45*60000&&received<=now&&now-received<=7*60000;
    price=usable?'USD '+q.usd.toFixed(2)+' · 체결 '+new Date(trade).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · 원화 환산 미연결':'미국 예약 시세 대기 또는 만료';
   }else if(client&&r.added)price='국내 신규 시세 연결 대기';
   row.append(el('strong',r.name+' ('+r.symbol+')'),el('p',r.venue+' · '+r.status,r.added?'wait':'sub'),el('p','수량 미확인 · 평단 미확인 · '+price,'sub'));
   list.append(row);
  }
 }
}
$('account').addEventListener('change',adjust);
$('filter').addEventListener('change',render);
function controls(){
 $('connect').disabled=busy||!!client;$('disconnect').disabled=busy||!client;
 $('cloud-refresh').disabled=busy||!client;$('add').disabled=busy||!!client&&!canWrite;
 $('add').textContent=client?'서버에 종목 등록':'종목 등록 테스트';
}
function cloudStatus(value){$('cloud-status').textContent=value}
async function refreshQuotes(){try{quotes=await client.quotes();return true}catch(_){quotes=null;return false}}
$('connection').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||client||!$('confirm-dev').checked)return;
 if(model.added.length&&!window.confirm('메모리 테스트 등록은 서버로 이전되지 않습니다. 서버 목록으로 전환할까요?'))return;
 busy=true;controls();
 try{
  const writeToken=$('write-token').value;
  const candidate=watchClient({url:$('worker-url').value,viewToken:$('view-token').value,writeToken});
  const next=await candidate.load();client=candidate;model=next;canWrite=Boolean(writeToken);
  const ok=await refreshQuotes();cloudStatus('서버 목록 확인 · '+(canWrite?'등록 토큰 입력됨':'조회 전용')+(ok?' · 시세 캐시 조회 완료':' · 시세 확인 실패'));
 }catch(_){cloudStatus('개발 Worker 연결 실패 · 주소·토큰·버전을 확인하세요.');}
 finally{$('view-token').value='';$('write-token').value='';busy=false;controls();render();}
});
$('cloud-refresh').addEventListener('click',async()=>{
 if(busy||!client)return;busy=true;controls();
 try{model=await client.load();const ok=await refreshQuotes();cloudStatus(ok?'서버 목록과 시세 캐시 조회 완료':'서버 목록 확인 · 시세 조회 실패');}
 catch(_){quotes=null;cloudStatus('서버 조회 실패 · 마지막 확인 목록 유지');}
 finally{busy=false;controls();render();}
});
$('disconnect').addEventListener('click',()=>{
 if(busy)return;client=null;quotes=null;canWrite=false;model=initialPreview();$('confirm-dev').checked=false;cloudStatus('연결 해제 · 오프라인 미리보기');controls();render();
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
  if(client)await refreshQuotes();
  $('filter').value=input.account;render();
  message(result.duplicate?'이미 해당 계좌에 등록된 종목입니다.':client?'서버 저장 확인 완료 · 실제 시세와 투자 규칙 확인 전 보류':'테스트 등록 완료 · 실제 시세와 투자 규칙 확인 전 보류');
  if(!result.duplicate){$('symbol').value='';$('name').value='';$('symbol').focus()}
 }catch(_){message(client?'등록 또는 저장 확인 실패 · 다시 조회하여 중복 여부를 확인하세요.':'입력한 계좌·시장·종목코드·종목명을 확인하세요. 최대 고유 종목 100개입니다.',true)}
 finally{busy=false;controls();}
});
adjust();render();controls();message('등록 테스트 가능');
