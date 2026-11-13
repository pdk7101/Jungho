/* Optional personal Finnhub quote connection. No vendor API credentials in this public site. */
(function(){
 'use strict';
 const IDS=['schd','agnc','spym','cony'];
 const URL_KEY='isa-us-private-worker-url-v1';
 const VIEW_KEY='isa-us-private-worker-access-session-v1';
 // Explicit opt-in only. A persistent access token can be read by scripts on this public origin.
 const REMEMBER_KEY='isa-us-private-worker-remembered-v1',REMEMBER_MAX_MS=30*86400000;
 const TRADE_TTL=45*60000,RESPONSE_TTL=5*60000;
 let endpoint='',password='',quotes={},fetchedAt='',busy=false,lastMessage='';
 const $=id=>document.getElementById(id);
 function rememberedAccess(url){
  if(!url)return '';
  try{
   const saved=JSON.parse(localStorage.getItem(REMEMBER_KEY)||'null');
   const savedAt=Number(saved?.savedAt),elapsed=Date.now()-savedAt;
   if(!saved||!Number.isFinite(savedAt)||elapsed<0||elapsed>REMEMBER_MAX_MS){
    if(saved)localStorage.removeItem(REMEMBER_KEY);
    return '';
   }
   return saved.url===url&&typeof saved.access==='string'&&saved.access.length>=20?saved.access:'';
  }catch(_){return '';}
 }
 function saveRememberedAccess(url,access){
  try{
   if($('us-live-remember')?.checked)
    localStorage.setItem(REMEMBER_KEY,JSON.stringify({url,access,savedAt:Date.now()}));
   else localStorage.removeItem(REMEMBER_KEY);
  }catch(_){}
 }
 function accessHint(){
  const hint=$('us-live-secret-hint'),input=$('us-live-secret');
  const active=safeUrl($('us-live-url')?.value)===endpoint&&password.length>=20;
  const remembered=active&&Boolean(rememberedAccess(endpoint));
  if(hint)hint.textContent=active?
   (remembered?'이 개인 휴대전화에 암호를 기억 중입니다. 새 탭에서도 자동 연결을 시도하며, 연결 해제를 누르면 저장된 암호까지 삭제합니다.':
   '현재 탭에 암호가 임시 보관되어 있습니다. 다시 조회할 때 입력하지 마세요. 새 탭에서도 유지하려면 위 기기 저장 옵션을 직접 선택하세요.'):
   '첫 연결에서만 암호 입력이 필요합니다. 공용 휴대전화에서는 기기에 암호 기억하기를 선택하지 마세요.';
  if(input)input.placeholder=active?'저장된 암호 사용 중 · 재입력 불필요':'Worker VIEW_TOKEN과 동일하게';
 }
 function safeUrl(raw){
  try{
   const u=new URL(String(raw||'').trim());
   return u.protocol==='https:'&&/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i.test(u.hostname)
    &&(u.pathname==='/'||u.pathname==='')&&!u.search&&!u.hash?u.origin:null;
  }catch(_){return null;}
 }
 function quote(id){
  const item=quotes[id],now=Date.now(),f=Date.parse(fetchedAt||''),t=Date.parse(item?.tradeAt||'');
  if(!IDS.includes(id)||!item||!Number.isFinite(item.usd)||item.usd<=0||item.usd>100000
    ||!Number.isFinite(f)||!Number.isFinite(t)||f>now+60000||t>now+60000
    ||now-f<0||now-f>RESPONSE_TTL||now-t<0||now-t>TRADE_TTL)return null;
  return {usd:item.usd,tradeAt:item.tradeAt,fetchedAt,source:'Finnhub personal authenticated US trade'};
 }
 function signal(){
  window.dispatchEvent(new Event('isa-personal-us-quote-refreshed'));
 }
 function status(message){
  if(typeof message==='string')lastMessage=message;
  const validCount=IDS.filter(id=>quote(id)).length;
  const label=fetchedAt?new Date(fetchedAt).toLocaleTimeString('ko-KR',
   {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}):'없음';
  const msg=lastMessage?
   lastMessage+' · ':endpoint?'개인용 무료 시세 연결됨 · ':'아직 연결되지 않음 · ';
  const line=validCount?
   '유효한 최근 체결 '+validCount+'/4 · 마지막 확인 '+label+' · 원화 평가에 사용':
   '유효한 장중 체결가격 없음 · 기존 확정 종가로 계산';
  if($('us-personal-status'))$('us-personal-status').textContent=msg+line;
  if($('us-live-badge'))$('us-live-badge').textContent=validCount?
   'Finnhub 개인 장중 체결 '+validCount+'/4 · '+label+' 조회 · 거래소 전체 체결가와 다를 수 있음':
   '개인 장중시세 '+(endpoint?'조회 대기/만료':'미설정')+' · 기본 미국장 확정 종가 참고';
 }
 async function refresh(){
  if(!endpoint||!password||busy||document.hidden)return;
  busy=true;
  try{
   const r=await fetch(endpoint+'/quotes',{
    method:'GET',
    headers:{Authorization:'Bearer '+password,Accept:'application/json'},
    cache:'no-store',
    signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw Error('개인 시세 서버 오류 '+r.status);
   const payload=await r.json(),now=Date.now(),f=Date.parse(payload?.fetchedAt||'');
   if(!String(payload?.source||'').includes('Finnhub')||!Number.isFinite(f)
      ||f>now+60000||now-f>RESPONSE_TTL||!payload?.quotes)
     throw Error('응답 날짜·형식 검증 실패');
   const next={};
   for(const id of IDS){
    const v=payload.quotes[id],t=Date.parse(v?.tradeAt||''),p=Number(v?.usd);
    if(v?.symbol!==id.toUpperCase()||!Number.isFinite(p)||p<=0||p>100000
       ||!Number.isFinite(t)||t>now+60000||now-t<0||now-t>TRADE_TTL)continue;
    next[id]={usd:p,tradeAt:v.tradeAt};
   }
   quotes=next;fetchedAt=payload.fetchedAt;
   status(IDS.filter(id=>quote(id)).length?
    '개인 시세 서버 조회 성공 · 최근 체결 확인':
    '개인 시세 서버 응답 성공 · 유효한 최근 체결 0/4 (시세 지연·미제공 가능, 장 마감 단정 불가)');
  }catch(e){
   quotes={};fetchedAt='';
   status('자동 조회 실패: '+String(e?.message||e));
  }finally{
   busy=false;signal();status();
  }
 }
 function connect(){
  const enteredUrl=$('us-live-url')?.value?.trim()||'';
  const url=safeUrl(enteredUrl),typed=$('us-live-secret')?.value?.trim()||'';
  // Reuse the secret only for the SAME Worker origin. Never send it to a new address.
  let cachedUrl=null,cachedAccess='';
  try{
   cachedUrl=safeUrl(localStorage.getItem(URL_KEY));
   cachedAccess=sessionStorage.getItem(VIEW_KEY)||'';
  }catch(_){}
  const access=typed||
   (url&&url===endpoint&&password.length>=20?password:'')||
   (url&&url===cachedUrl&&cachedAccess.length>=20?cachedAccess:'')||
   rememberedAccess(url);
  // Never show the credential; explain only the local input validation error.
  if(!enteredUrl){status('Worker 주소가 비어 있습니다. Cloudflare workers.dev 전체 주소를 입력하세요');return;}
  if(!url){status('Worker 주소 형식 오류: https://워커이름.계정이름.workers.dev 형태의 전체 HTTPS 주소를 입력하세요');return;}
  if(!access){status('개인 접근 암호가 비어 있습니다. 처음 한 번만 Cloudflare VIEW_TOKEN을 입력하세요');return;}
  if(access.length<20){
   status('개인 접근 암호 길이 부족: 현재 '+access.length+'자 / 최소 20자. Cloudflare의 VIEW_TOKEN도 20자 이상으로 수정한 뒤 같은 암호를 입력하세요');
   return;
  }
  const changed=url!==endpoint||access!==password;
  endpoint=url;password=access;
  if(changed){quotes={};fetchedAt='';signal();}
  try{localStorage.setItem(URL_KEY,url);sessionStorage.setItem(VIEW_KEY,access);}catch(_){}
  saveRememberedAccess(url,access);
  $('us-live-secret').value=''; // Never leave secret readable in the input/DOM.
  accessHint();
  status(typed?'개인 시세 서버 접속 중':'저장된 암호로 다시 조회합니다');
  refresh();
 }
 function disconnect(){
  endpoint='';password='';quotes={};fetchedAt='';
  try{localStorage.removeItem(URL_KEY);sessionStorage.removeItem(VIEW_KEY);localStorage.removeItem(REMEMBER_KEY);}catch(_){}
  if($('us-live-remember'))$('us-live-remember').checked=false;
  if($('us-live-url'))$('us-live-url').value='';
  if($('us-live-secret'))$('us-live-secret').value='';
  accessHint();
  status('개인 시세 연결 해제');signal();
 }
 window.ISA_PERSONAL_US={quote,refresh};
 const connectButton=$('us-live-connect'),stopButton=$('us-live-disconnect');
 if(connectButton)connectButton.addEventListener('click',connect);
 if(stopButton)stopButton.addEventListener('click',disconnect);
 try{
  const u=safeUrl(localStorage.getItem(URL_KEY)),token=sessionStorage.getItem(VIEW_KEY);
  const remembered=u?rememberedAccess(u):'';
  if($('us-live-url')&&u)$('us-live-url').value=u;
  if($('us-live-remember'))$('us-live-remember').checked=Boolean(remembered);
  if(u&&(token?.length>=20||remembered)){endpoint=u;password=token?.length>=20?token:remembered;}
 }catch(_){}
 accessHint();
 if($('us-live-url'))$('us-live-url').addEventListener('change',accessHint);
 if($('us-live-remember'))$('us-live-remember').addEventListener('change',function(){
  if(endpoint&&password.length>=20)saveRememberedAccess(endpoint,password);
  else if(!this.checked)try{localStorage.removeItem(REMEMBER_KEY);}catch(_){}
  accessHint();
 });
 status();
 if(endpoint&&password)refresh();
 // Free account: four vendor requests at most every 120 seconds while page is visible.
 setInterval(refresh,120000);
 setInterval(function(){
  const active=IDS.filter(id=>quote(id)).length;
  if(!active&&Object.keys(quotes).length){quotes={};fetchedAt='';signal();}
  status();
 },60000);
 document.addEventListener('visibilitychange',function(){
  if(!document.hidden)refresh();
 });
})();
