/* Independent, opt-in sync of explicit private portfolio records.
 * Never synchronize provider keys, brokerage tokens, price caches or derived totals. */
(function(){
'use strict';
const KEYS=['isa-private-positions-v1','isa-private-toss-domestic-holdings-v1','isa-us-holdings-v1','isa-user-portfolio-snapshot-v1','isa-private-toss-domestic-snapshot-v1','isa-us-distributions-krw-v1','isa-kr-distribution-ledger-v1','isa-kr-distribution-baselines-v1','isa-account-dividend-totals-v1','isa-account-totals-v1','isa-account-calculation-mode-v1','isa-rules','isa-us-signal-limits-v1','isa-sol-distributions-v1','isa-sol-dist-edit-v1','isa-unattended-order-plan-v1','isa-unattended-order-status-v1','isa-cony-autobuy-plan-v1'];
const CONFIG='isa-portfolio-sync-config-v1',BASE='isa-portfolio-sync-base-v1',BACKUP='isa-portfolio-sync-backup-v1',FIRST='isa-portfolio-sync-initial-backup-v1';
const $=id=>document.getElementById(id);
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(_){return null}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const snapshot=()=>Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]));
const equal=(a,b)=>KEYS.every(k=>a?.[k]===b?.[k]);
const valid=data=>data&&Object.keys(data).length===KEYS.length&&KEYS.every(k=>Object.hasOwn(data,k)&&(data[k]===null||typeof data[k]==='string'&&(()=>{try{const x=JSON.parse(data[k]);return x!==null&&typeof x==='object'}catch(_){return false}})()));
function merge(base,local,remote,choice){
 const data={},conflicts=[];
 for(const k of KEYS){
  if(local[k]===remote[k])data[k]=local[k];
  else if(local[k]===base[k])data[k]=remote[k];
  else if(remote[k]===base[k])data[k]=local[k];
  else{conflicts.push(k);data[k]=choice==='local'?local[k]:remote[k]}
 }
 return {data,conflicts};
}
function endpoint(raw){
 try{const u=new URL(raw.trim());return u.protocol==='https:'&&u.hostname.endsWith('.workers.dev')&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&(u.pathname==='/'||u.pathname==='/sync')?u.origin+'/sync':null}catch(_){return null}
}
let busy=false,conflict=false,lastSeen=null,lastEdit=0,checkingAt=0;
let quoteFlags={krx:false,us:false,valuation:false},quoteIdentity=null;
function quoteConnection(kind){
 const c=read(CONFIG),b=read(BASE);
 if(!quoteFlags[kind]||!c||!b||c.url!==b.url||b.revision<1||
  quoteIdentity!==c.url||!endpoint(c.url)||typeof c.token!=='string'||c.token.length<32)return null;
 return {url:new URL(c.url).origin+'/quote/'+kind,token:c.token};
}
const VAL_CACHE='isa-common-valuation-v1';
let valuation=null,valuationBusy=false,lastValuation=0;
function valuationEnabled(){return !!quoteConnection('valuation');}
function valuationData(){
 if(!valuationEnabled())return null;
 if(valuation)return valuation;
 const c=read(CONFIG),old=read(VAL_CACHE);
 return old?.url===c?.url&&validValuation(old.data)?old.data:null;
}
function validValuation(data){
 if(data?.version!==1||!data.kr||!data.us)return false;
 return ['kr','us'].every(m=>Object.values(data[m]).every(q=>q&&Number.isFinite(q.amount)&&q.amount>0&&
  /^\d{4}-\d{2}-\d{2}$/.test(q.date)&&typeof q.source==='string'));
}
function valuationPrice(market,id){
 const q=valuationData()?.[market]?.[id];if(!q)return null;
 const age=Date.now()-Date.parse(q.date);
 return Number.isFinite(age)&&age>=-86400000&&age<=14*86400000?q:null;
}
async function refreshValuation(force=false){
 const c=quoteConnection('valuation');
 if(!c||valuationBusy||(!force&&Date.now()-lastValuation<60000))return;
 valuationBusy=true;lastValuation=Date.now();
 const label=$('portfolio-sync-valuation-status');
 try{
  const r=await fetch(c.url,{method:'GET',headers:{Authorization:'Bearer '+c.token,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(55000)});
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();if(!validValuation(data))throw Error('응답 검증 실패');
  if(quoteConnection('valuation')?.url!==c.url||quoteConnection('valuation')?.token!==c.token)return;
  valuation=data;
  try{save(VAL_CACHE,{url:read(CONFIG).url,data})}catch(_){}
  if(label)label.textContent='공통 평가가격 · 국내 '+Object.keys(data.kr).length+'/10 · 미국 '+Object.keys(data.us).length+'/5 · 동일 환율';
 }catch(_){if(label)label.textContent='공통 평가가격 조회 실패 · 마지막 공통 가격 유지';}
 finally{
  valuationBusy=false;
  window.ISA_KR_APP?.renderCards?.();window.ISA_US_APP?.rerender?.();window.ISA_ACCOUNT_SUMMARY?.refresh?.();
 }
}
window.ISA_SHARED_QUOTES={connection:quoteConnection,valuationEnabled,valuationPrice,valuationData,refreshValuation};
function setQuoteCapabilities(config,result){
 const next={krx:result?.quoteCapabilities?.krx===true,us:result?.quoteCapabilities?.us===true,valuation:result?.quoteCapabilities?.valuation===true};
 const changed=quoteIdentity!==config.url||next.krx!==quoteFlags.krx||next.us!==quoteFlags.us||next.valuation!==quoteFlags.valuation;
 if(quoteIdentity!==config.url)valuation=null;
 quoteFlags=next;quoteIdentity=config.url;
 const label=$('portfolio-sync-quote-status');
 if(label)label.textContent='공통 시세: 국내 '+(next.krx?'설정됨':'미설정')+' · 미국 '+(next.us?'설정됨':'미설정');
 return changed;
}

function status(message){if($('portfolio-sync-status'))$('portfolio-sync-status').textContent=message;}
function choices(show,initial=false){
 $('portfolio-sync-choices').hidden=!show;
 $('portfolio-sync-local').textContent=initial?'이 기기 기록을 최초 저장':'충돌 항목: 이 기기 기록 사용';
 $('portfolio-sync-cloud').textContent=initial?'클라우드 기록 가져오기':'충돌 항목: 클라우드 기록 사용';
}
function editing(){const e=document.activeElement;return !!e&&['INPUT','TEXTAREA','SELECT'].includes(e.tagName)&&!e.closest('#portfolio-sync-panel');}
async function api(config,method,body){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const r=await fetch(config.url,{method,headers:{Authorization:'Bearer '+config.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:ctrl.signal});
  if(r.status===409)throw Error('다른 기기 변경 감지 · 다시 동기화합니다');
  if(!r.ok)throw Error('연결 오류 '+r.status+' · 기존 기록 유지');
  const x=await r.json();
  if(!Number.isSafeInteger(x.revision)||x.revision<0||(x.revision===0?x.data!==null:!valid(x.data)))throw Error('동기화 응답 검증 실패');
  return x;
 }finally{clearTimeout(timer)}
}
function apply(data,original,initial){
 if(equal(data,original))return false;
 // Backup is saved before any local record is overwritten; failure stops the operation.
 save(initial?FIRST:BACKUP,{at:new Date().toISOString(),data:original});
 try{
  for(const k of KEYS)if(data[k]!==original[k]){
   if(data[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,data[k]);
  }
 }catch(e){
  for(const k of KEYS){try{if(original[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,original[k])}catch(_){}}
  throw e;
 }
 return true;
}
async function sync(choice=null){
 const config=read(CONFIG);
 if(!config||busy||document.visibilityState==='hidden'||editing())return;
 if(conflict&&!choice)return;
 if(!endpoint(config.url)||typeof config.token!=='string'||config.token.length<32)return status('연결 설정을 확인하세요.');
 busy=true;checkingAt=Date.now();
 try{
  const original=snapshot(),base=read(BASE),server=await api(config,'GET');
  if(!equal(snapshot(),original)||editing())return status('입력 중 · 저장 후 자동 동기화');
  if(!valid(original))throw Error('기기 기록 형식 확인 필요 · 변경하지 않았습니다');
  let data,initial=!base||base.url!==config.url||!valid(base.data);
  if(initial){
   if(server.revision===0){
    if(choice!=='local'){conflict=true;choices(true,true);status('첫 연결: 최신 기록이 있는 기기에서 최초 저장을 선택하세요.');return;}
    data=original;
   }else if(equal(original,server.data)){data=original;}
   else if(choice==='cloud'){data=server.data;}
   else{conflict=true;choices(true,true);status('이미 클라우드 기록이 있습니다. 이 기기 기록은 백업 후 가져올 수 있습니다. 최초 저장으로 덮어쓸 수 없습니다.');return;}
  }else{
   if(server.revision===0||server.revision<base.revision)throw Error('클라우드 기록이 초기화됐습니다. 자동 덮어쓰기 중단');
   const merged=merge(base.data,original,server.data,choice);
   if(merged.conflicts.length&&!choice){conflict=true;choices(true);status('동시 수정 충돌 '+merged.conflicts.length+'개 기록 · 선택하기 전 양쪽 데이터 유지');return;}
   data=merged.data;
  }
  if(!equal(snapshot(),original)||editing())return;
  const final=server.revision===0||!equal(data,server.data)?await api(config,'PUT',{revision:server.revision,data}):server;
  if(!equal(snapshot(),original)||editing())return status('추가 입력 감지 · 다음 조회에서 다시 비교합니다');
  const nextBase={url:config.url,revision:final.revision,data:final.data};
  // If browser storage is full, stop before changing editor records.
  const oldBase=localStorage.getItem(BASE);
  save(BASE,nextBase);
  let changed;
  try{changed=apply(final.data,original,initial);}
  catch(e){try{if(oldBase===null)localStorage.removeItem(BASE);else localStorage.setItem(BASE,oldBase)}catch(_){}throw e;}
  const quotesChanged=setQuoteCapabilities(config,final);
  if(quoteFlags.valuation)refreshValuation(quotesChanged);
  conflict=false;choices(false);
  lastSeen=JSON.stringify(snapshot());lastEdit=0;
  status('자동 동기화 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));
  if(changed){try{sessionStorage.setItem('isa-portfolio-sync-scroll-v1',String(window.scrollY||0));}catch(_){}location.reload();} // Reload existing in-memory editors.
  else if(initial||quotesChanged){window.ISA_KR_APP?.renderCards?.();window.ISA_US_APP?.rerender?.();window.ISA_ACCOUNT_SUMMARY?.refresh?.();if(quoteFlags.krx)Promise.resolve(window.ISA_KR_APP?.refresh?.()).catch(()=>{});if(quoteFlags.us)Promise.resolve(window.ISA_PERSONAL_US?.refresh?.()).catch(()=>{});}
 }catch(e){status(String(e.message||e)+' · 기기 기록은 유지됩니다.');}
 finally{busy=false;}
}
function mount(){
 const root=$('dashboard-settings');if(!root)return;
 const panel=document.createElement('details');panel.id='portfolio-sync-panel';panel.className='panel';
 panel.innerHTML='<summary><b>개인 투자기록 자동 동기화 · 노트북 / 휴대폰</b></summary><p class="sub">기존 수량·평단·분배금·개인 설정을 비공개 저장소로 연결합니다. 시세·증권사 연결키는 공유하지 않습니다.</p><label>동기화 Worker 주소<input id="portfolio-sync-url" type="url" placeholder="https://…workers.dev" autocomplete="off"></label><label>동기화 전용 비밀키<input id="portfolio-sync-token" type="password" autocomplete="off" placeholder="32자 이상 · 두 기기 동일"></label><button type="button" id="portfolio-sync-connect">연결</button> <button type="button" id="portfolio-sync-disconnect" class="outline">연결 해제</button><p id="portfolio-sync-status" class="sub" role="status">미연결 · 기기별 기록 유지</p><p class="sub" id="portfolio-sync-quote-status">공통 시세 연결 확인 전</p><p class="sub" id="portfolio-sync-valuation-status">공통 평가가격 확인 전</p><div id="portfolio-sync-choices" hidden><button type="button" id="portfolio-sync-local">이 기기 기록 사용</button> <button type="button" id="portfolio-sync-cloud" class="outline">클라우드 기록 가져오기</button><p class="sub">최초 연결 또는 동시 수정 시에만 선택합니다. 가져오기 전 기존 기기 기록을 백업합니다.</p></div>';
 root.appendChild(panel);
 const c=read(CONFIG);if(c){$('portfolio-sync-url').value=c.url;$('portfolio-sync-token').value=c.token;status('자동 동기화 연결 확인 중');}
 $('portfolio-sync-connect').onclick=()=>{
  if(busy)return status('동기화 진행 중 · 완료 후 연결 변경');
  const url=endpoint($('portfolio-sync-url').value),token=$('portfolio-sync-token').value.trim();
  if(!url||token.length<32)return status('정확한 workers.dev 주소 및 32자 이상 전용 비밀키를 입력하세요.');
  try{const prev=read(CONFIG);if(prev&&(prev.url!==url||prev.token!==token))localStorage.removeItem(BASE);save(CONFIG,{url,token});conflict=false;choices(false);sync();}
  catch(_){status('기기 저장 실패 · 기존 기록 유지');}
 };
 $('portfolio-sync-disconnect').onclick=()=>{if(busy)return status('동기화 진행 중 · 완료 후 해제');localStorage.removeItem(CONFIG);localStorage.removeItem(BASE);quoteFlags={krx:false,us:false,valuation:false};valuation=null;quoteIdentity=null;conflict=false;choices(false);$('portfolio-sync-token').value='';status('연결 해제 · 기기 기록 유지');window.ISA_KR_APP?.renderCards?.();window.ISA_US_APP?.rerender?.();window.ISA_ACCOUNT_SUMMARY?.refresh?.();};
 $('portfolio-sync-local').onclick=()=>sync('local');
 $('portfolio-sync-cloud').onclick=()=>sync('cloud');
 try{const y=sessionStorage.getItem('isa-portfolio-sync-scroll-v1');if(y!==null){sessionStorage.removeItem('isa-portfolio-sync-scroll-v1');window.addEventListener('load',()=>window.scrollTo(0,Number(y)||0),{once:true});}}catch(_){}
 lastSeen=JSON.stringify(snapshot());
 setInterval(()=>{
  if(document.visibilityState==='hidden'||!read(CONFIG))return;
  const now=Date.now(),cur=JSON.stringify(snapshot());
  if(cur!==lastSeen){lastSeen=cur;lastEdit=now}
  if((lastEdit&&now-lastEdit>=3000&&now-checkingAt>=5000)||now-checkingAt>=30000)sync();
 },2000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync()});
 window.addEventListener('online',()=>sync());
 if(c)sync();
}
mount();
})();
