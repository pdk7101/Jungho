/* Phone-first Toss official balance client (read-only).
 * No Toss client_id, client_secret or OAuth token in public browser code.
 * TOSS_VIEW_TOKEN is a separate private gateway password, not the broker API key.
 */
(function(){
'use strict';
const URL_KEY='isa-toss-readonly-url-v1',TOKEN_KEY='isa-toss-readonly-view-v1';
const SESSION_KEY='isa-toss-readonly-session-v1';
// Only an on-device copy of an authenticated SUCCESSFUL response. Never publish to GitHub.
const SNAPSHOT_KEY='isa-toss-readonly-last-good-v1';
const get=(area,key)=>{try{return area.getItem(key)||''}catch(_){return ''}};
const put=(area,key,val)=>{try{area.setItem(key,val);return true}catch(_){return false}};
const del=(area,key)=>{try{area.removeItem(key)}catch(_){}};
let gateway=get(localStorage,URL_KEY);
let password=get(localStorage,TOKEN_KEY)||get(sessionStorage,TOKEN_KEY);
let record=null,recordState='none',loading=null,lastError='',diagnosis='';
function validEndpoint(value){
 const u=new URL(String(value||'').trim());
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
  u.pathname!=='/'||u.port)throw Error('개인 전용 HTTPS 서버 기본 주소만 입력하세요.');
 if(u.origin==='https://pdk7101.github.io')throw Error('GitHub Pages는 토스증권 계좌 API 서버가 아닙니다.');
 return u.origin;
}
const money=v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:0})+'원';
const unit=(v,c)=>v===null||v===undefined?'미확인':
 Number(v).toLocaleString('ko-KR',{maximumFractionDigits:6})+
 (c==='USD'?'달러':'원');
const getElement=id=>document.getElementById(id);
function status(text){
 const node=getElement('toss-broker-status');if(node)node.textContent=text;
}
function configured(){return !!(gateway&&password&&password.length>=32);}
function displayTime(iso){
 const ms=Date.parse(String(iso||''));
 return Number.isFinite(ms)?new Date(ms).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'기준일 미확인';
}
function sameStoredConnection(endpoint,token){
 return gateway===endpoint&&password===token;
}
function saveLastGood(data){
 try{
  const json=JSON.stringify({version:1,endpoint:gateway,data});
  if(json.length>250000)return false; // fail closed rather than filling storage
  localStorage.setItem(SNAPSHOT_KEY,json);
  return localStorage.getItem(SNAPSHOT_KEY)===json;
 }catch(_){return false;}
}
function restoreLastGood(){
 if(!configured())return false;
 try{
  const saved=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');
  if(!saved||saved.version!==1||saved.endpoint!==gateway)return false;
  const candidate=validate(saved.data);
  const stamp=Date.parse(candidate.fetchedAt);
  if(!Number.isFinite(stamp)||stamp>Date.now()+5*60000)return false;
  record=candidate;recordState='cached';return true;
 }catch(_){return false;}
}
function setConnection(url,token,remember=true){
 const canonical=validEndpoint(url),secret=String(token||'').trim();
 if(secret.length<32)throw Error('개인 조회 토큰을 32자 이상 입력하세요. 토스 Client Secret은 입력하지 마세요.');
 const same=sameStoredConnection(canonical,secret);
 gateway=canonical;password=secret;
 if(!put(localStorage,URL_KEY,gateway))throw Error('브라우저 주소 저장 실패');
 if(!same)del(localStorage,SNAPSHOT_KEY);
 del(localStorage,TOKEN_KEY);del(sessionStorage,TOKEN_KEY);del(sessionStorage,SESSION_KEY);
 if(remember){
  if(!put(localStorage,TOKEN_KEY,password))throw Error('개인 기기 토큰 저장 실패');
 }else{
  if(!put(sessionStorage,TOKEN_KEY,password))throw Error('탭 세션 토큰 저장 실패');
  put(sessionStorage,SESSION_KEY,'1');
 }
 record=null;recordState='none';lastError='';diagnosis='';
 if(same)restoreLastGood();
}
function disconnect(){
 gateway='';password='';record=null;recordState='none';lastError='';diagnosis='';
 del(localStorage,URL_KEY);del(localStorage,TOKEN_KEY);del(localStorage,SNAPSHOT_KEY);
 del(sessionStorage,TOKEN_KEY);del(sessionStorage,SESSION_KEY);
 status('토스 계좌 자동 조회 연결 해제. 기존 보유 기록·분배금은 보존됩니다.');
 render();
 document.dispatchEvent(new Event('isa-toss-broker-data'));
}
function validate(data){
 if(!data||data.ok!==true||typeof data.fetchedAt!=='string'||
  !Number.isFinite(Date.parse(data.fetchedAt))||
  Date.parse(data.fetchedAt)>Date.now()+5*60000||
  !Array.isArray(data.holdings)||data.holdings.length>1000||
  !data.amounts||!data.amounts.valued||!data.amounts.invested||
  !data.totals||!Number.isInteger(data.holdingCount)||
  data.holdingCount!==data.holdings.length)throw Error('토스 조회 결과 검증 실패');
 for(const item of data.holdings){
  if(!item||!['KR','US'].includes(item.marketCountry)||
   !['KRW','USD'].includes(item.currency)||
   typeof item.symbol!=='string'||!Number.isFinite(item.quantity)||
   !Number.isFinite(item.marketValue)||item.quantity<0||
   item.marketValue<0)throw Error('토스 보유종목 자료 검증 실패');
 }
 return data;
}
async function load(){
 if(!configured())throw Error('토스 전용 HTTPS 서버 주소와 조회 토큰을 먼저 연결하세요.');
 if(loading)return loading;
 loading=(async()=>{
  status('토스증권 새 잔고 조회 중…'+(record?' · '+displayTime(record.fetchedAt)+' 기록은 보존 중':''));
  diagnosis='';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  let httpStatus=null;
  try{
   const response=await fetch(gateway+'/api/toss/holdings',{
    headers:{Authorization:'Bearer '+password,Accept:'application/json'},
    method:'GET',cache:'no-store',signal:controller.signal
   });
   httpStatus=response.status;
   const payload=await response.json().catch(()=>({error:'JSON 응답 오류'}));
   if(!response.ok)throw Error('토스 자동 조회 실패 ('+response.status+'): '+String(payload.error||'서버 상태 확인').slice(0,100));
   const fresh=validate(payload);
   record=fresh;recordState='live';lastError='';
   const stored=saveLastGood(fresh);
   status('토스 공식 보유잔고 '+record.holdingCount+'종목 · '+displayTime(record.fetchedAt)+
    ' 최신 조회'+(stored?' · 이 기기에 자동 저장 완료 (노트북 꺼져도 마지막 기록 표시)':
    ' · 기기 저장 실패, 오프라인 기록 보장 안 됨'));
   render();
   document.dispatchEvent(new Event('isa-toss-broker-data'));
   return record;
  }catch(e){
   lastError=String(e?.message||e);
   diagnosis=httpStatus===401?'HTTP 401 · 개인 조회 암호 불일치':
    httpStatus===403?'HTTP 403 · 서버 접근 허용 설정 확인':
    httpStatus===404?'HTTP 404 · 계좌 조회 경로 없음':
    httpStatus===429?'HTTP 429 · 호출 한도 초과':
    httpStatus>=500?'HTTP '+httpStatus+' · 토스 조회 서버 또는 공식 API 오류':
    httpStatus===200?'HTTP 200 · 계좌 응답 형식 검증 실패':
    httpStatus?'HTTP '+httpStatus+' · 조회 실패':
    e?.name==='AbortError'?'25초 응답 없음 · 서버 연결 상태 확인':
    '서버 접속 실패 · 서버 실행, HTTPS 또는 CORS 확인';
   if(record)recordState='cached';
   else recordState='none';
   status('새 조회 실패: '+lastError+
    (record?' · '+displayTime(record.fetchedAt)+'에 조회한 공식 계좌 기록 표시 (현재 잔고 아님)':
    ' · 저장된 공식 계좌 기록 없음'));
   render();
   document.dispatchEvent(new Event('isa-toss-broker-data'));
   throw e;
  }finally{
   clearTimeout(timeout);
   loading=null;
  }
 })();
 return loading;
}
function render(){
 const wrap=getElement('toss-broker-holdings');if(!wrap)return;
 wrap.replaceChildren();
 if(!record){wrap.textContent='공식 계좌가 연결되면 보유수량·평단·평가금액을 여기에서 자동 확인합니다.';return;}
 const recorded=document.createElement('p');
 recorded.textContent=(recordState==='cached'?'마지막 저장된 공식 잔고 · 현재 실시간 아님':'토스증권 공식 잔고 · 이번 접속 조회')+
  ' · 조회 시각 '+displayTime(record.fetchedAt)+
  ' · '+record.holdingCount+'종목';
 wrap.appendChild(recorded);
 const h=document.createElement('p');
 const fx=record.fx?.usdKrw;
 const native=record.amounts;
 h.textContent='국내 평가 '+unit(native.valued.krw,'KRW')+' · 미국 평가 '+unit(native.valued.usd,'USD')+
  (fx?' · USD/KRW '+Number(fx).toLocaleString('ko-KR')+' (토스 표시 환율)':' · USD/KRW 미확인')+
  '. 전체 원화 합계는 참고 환율 변환값으로 토스 앱과 다를 수 있습니다.';
 wrap.appendChild(h);
 for(const item of record.holdings){
  const row=document.createElement('div');row.className='toss-broker-item';
  const title=document.createElement('strong');
  title.textContent=item.name+' · '+item.symbol;
  const desc=document.createElement('small');
  desc.textContent='보유 '+Number(item.quantity).toLocaleString('ko-KR',{maximumFractionDigits:8})+'주 · 평단 '+
   unit(item.averagePurchasePrice,item.currency)+' · 현재 단가 '+unit(item.lastPrice,item.currency)+
   ' · 평가 '+unit(item.marketValue,item.currency);
  row.append(title,desc);wrap.appendChild(row);
 }
}
function mount(){
 const url=getElement('toss-broker-url'),secret=getElement('toss-broker-view-token'),
  remember=getElement('toss-broker-remember'),
  connect=getElement('toss-broker-connect'),reload=getElement('toss-broker-reload'),
  off=getElement('toss-broker-disconnect');
 if(!url||!secret||!connect||!reload||!off)return;
 url.value=gateway;
 if(remember)remember.checked=!!get(localStorage,TOKEN_KEY);
 connect.addEventListener('click',()=>{
  try{
   setConnection(url.value,secret.value||password,!!remember?.checked);
   secret.value='';load().catch(()=>{});
  }catch(e){status('연결 설정 확인: '+String(e.message||e));}
 });
 reload.addEventListener('click',()=>load().catch(()=>{}));
 off.addEventListener('click',()=>{
  disconnect();url.value='';secret.value='';
 });
 restoreLastGood();
 render();
 if(configured()){
  if(record)status('이 기기에 저장된 '+displayTime(record.fetchedAt)+' 공식 잔고 복원 · 실시간 아님');
  load().catch(()=>{});
 }
 else if(gateway)status('주소 저장됨 · 이 브라우저의 개인 조회 토큰을 입력하세요.');
 else status('아직 연결되지 않았습니다. 토스 API 인증정보는 개인 서버 내부에만 보관합니다.');
}
window.ISA_TOSS_BROKER={configured,load,snapshot:()=>record,
 snapshotMeta:()=>({state:recordState,fetchedAt:record?.fetchedAt||null,loading:!!loading,diagnosis}),
 setConnection,disconnect,lastError:()=>lastError};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
})();
