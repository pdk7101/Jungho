/* Phone-first Toss official balance client (read-only).
 * No Toss client_id, client_secret or OAuth token in public browser code.
 * TOSS_VIEW_TOKEN is a separate private gateway password, not the broker API key.
 */
(function(){
'use strict';
const URL_KEY='isa-toss-readonly-url-v1',TOKEN_KEY='isa-toss-readonly-view-v1';
const SESSION_KEY='isa-toss-readonly-session-v1';
const get=(area,key)=>{try{return area.getItem(key)||''}catch(_){return ''}};
const put=(area,key,val)=>{try{area.setItem(key,val);return true}catch(_){return false}};
const del=(area,key)=>{try{area.removeItem(key)}catch(_){}};
let gateway=get(localStorage,URL_KEY);
let password=get(localStorage,TOKEN_KEY)||get(sessionStorage,TOKEN_KEY);
let record=null,loading=null,lastError='';
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
function setConnection(url,token,remember=true){
 const canonical=validEndpoint(url),secret=String(token||'').trim();
 if(secret.length<32)throw Error('개인 조회 토큰을 32자 이상 입력하세요. 토스 Client Secret은 입력하지 마세요.');
 gateway=canonical;password=secret;
 if(!put(localStorage,URL_KEY,gateway))throw Error('브라우저 주소 저장 실패');
 del(localStorage,TOKEN_KEY);del(sessionStorage,TOKEN_KEY);del(sessionStorage,SESSION_KEY);
 if(remember){
  if(!put(localStorage,TOKEN_KEY,password))throw Error('개인 기기 토큰 저장 실패');
 }else{
  if(!put(sessionStorage,TOKEN_KEY,password))throw Error('탭 세션 토큰 저장 실패');
  put(sessionStorage,SESSION_KEY,'1');
 }
 record=null;lastError='';
}
function disconnect(){
 gateway='';password='';record=null;lastError='';
 del(localStorage,URL_KEY);del(localStorage,TOKEN_KEY);
 del(sessionStorage,TOKEN_KEY);del(sessionStorage,SESSION_KEY);
 status('토스 계좌 자동 조회 연결 해제. 기존 보유 기록·분배금은 보존됩니다.');
 render();
 document.dispatchEvent(new Event('isa-toss-broker-data'));
}
function validate(data){
 if(!data||data.ok!==true||typeof data.fetchedAt!=='string'||!Array.isArray(data.holdings)||
  !data.amounts||!data.totals||!Number.isInteger(data.holdingCount)||
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
  status('토스증권 공식 보유잔고 조회 중...');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const response=await fetch(gateway+'/api/toss/holdings',{
    headers:{Authorization:'Bearer '+password,Accept:'application/json'},
    method:'GET',cache:'no-store',signal:controller.signal
   });
   const payload=await response.json().catch(()=>({error:'JSON 응답 오류'}));
   if(!response.ok)throw Error('토스 자동 조회 실패 ('+response.status+'): '+String(payload.error||'서버 상태 확인').slice(0,100));
   record=validate(payload);lastError='';
   const d=new Date(record.fetchedAt);
   status('토스 공식 보유잔고 '+record.holdingCount+'종목 · '+d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+
    ' 조회 · 휴대폰/노트북 동일 계좌 서버 사용');
   render();
   document.dispatchEvent(new Event('isa-toss-broker-data'));
   return record;
  }catch(e){
   lastError=String(e?.message||e);
   record=null;
   status(lastError+' · 토스 증권사 잔고로 표시하지 않습니다.');
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
 render();
 if(configured())load().catch(()=>{});
 else if(gateway)status('주소 저장됨 · 이 브라우저의 개인 조회 토큰을 입력하세요.');
 else status('아직 연결되지 않았습니다. 토스 API 인증정보는 개인 서버 내부에만 보관합니다.');
}
window.ISA_TOSS_BROKER={configured,load,snapshot:()=>record,
 setConnection,disconnect,lastError:()=>lastError};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
})();
