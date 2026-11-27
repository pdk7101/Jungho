import {initialPreview,previewAdd} from './registry-ui-preview.mjs';
import {instrument,holdingId} from './instrument-registry.mjs';
// Tokens stay in memory, never localStorage, URL, logs or GitHub.
export function workerOrigin(raw){
 const u=new URL(String(raw).trim());
 if(u.protocol!=='https:'||!/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i.test(u.hostname)||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/')throw Error('Worker 주소 확인');
 return u.origin;
}
export function modelFromWatchlist(payload){
 if(payload?.schema!=='watchlist-v17'||!payload.catalog||!payload.holdings||Object.keys(payload.catalog).length>100||Object.keys(payload.holdings).length>300)throw Error('등록 목록 형식 미확인');
 let model=initialPreview();
 for(const [id,h] of Object.entries(payload.holdings)){
  const i=instrument(payload.catalog[h.instrumentId]),account=id.split('|')[0];
  if(h.archived!==false||holdingId(account,i)!==id||h.instrumentId!==i.id)throw Error('등록 목록 불일치');
  model=previewAdd(model,{account,venue:i.venue,symbol:i.symbol,name:i.name}).model;
 }
 if(Object.keys(model.state.holdings).length!==Object.keys(payload.holdings).length)throw Error('기존 등록 목록 누락');
 return model;
}
export function watchClient({url,viewToken,writeToken,sharedRead=null,fetchImpl=fetch}){
 const origin=workerOrigin(url);
 if(sharedRead&&(typeof sharedRead!=='function'||origin!==V17_ORIGIN))throw Error('shared_read_scope');
 if(!sharedRead&&(typeof viewToken!=='string'||viewToken.length<20))throw Error('조회 토큰 확인');
 if(writeToken&&(writeToken.length<32||writeToken===viewToken))throw Error('등록 토큰 확인');
 async function call(path,token,body){
  if(!body&&sharedRead)return sharedRead(path);
  const options={method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)};
  if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
  const r=await fetchImpl(origin+path,options);
  if(!r.ok)throw Error('Worker 응답 '+r.status);
  return r.json();
 }
 return {
  async load(){return modelFromWatchlist(await call('/watchlist',viewToken));},
  async register(input){
   if(!writeToken)throw Error('등록 권한 없음');
   const {account,venue,symbol,name}=input;
   const market=account==='toss-us'?'US':'KR',i=instrument({market,venue:market==='US'?'US':venue,symbol,name});
   const id=holdingId(account,i);
   const result=await call('/watchlist',writeToken,{account,venue:i.venue,symbol:i.symbol,name:i.name});
   if(!['registered','already_registered'].includes(result?.status)||result.symbol!==i.symbol)throw Error('등록 응답 미확인');
   // Re-read server state; no optimistic local success or overwrite.
   const model=await this.load();
   if(!Object.hasOwn(model.state.holdings,id))throw Error('저장 확인 실패 · 다시 조회 필요');
   return {model,id,duplicate:result.status==='already_registered'};
  },
  async daily(){
   const p=await call('/daily',viewToken);
   if(p.schema!=='us-private-daily-v17'||p.cachedOnly!==true||!p.bySymbol||typeof p.bySymbol!=='object')throw Error('확정 일봉 응답 미확인');
   return p;
  },
  async quotes(){
   const p=await call('/quotes',viewToken);
   if(p.cachedOnly!==true||!p.bySymbol||typeof p.bySymbol!=='object')throw Error('예약 수집 응답 미확인');
   return p;
  }
 };
}

const SYNC_ORIGIN='https://jungho-portfolio-sync.pdk7101.workers.dev';
const V17_ORIGIN='https://jungho-v17.pdk7101.workers.dev';
// Reuse only an established sync connection, and send its existing token only to its original host.
export function sharedRegistryRead(storage,fetchImpl=fetch){
 const read=()=>{
  try{
   const c=JSON.parse(storage.getItem('isa-portfolio-sync-config-v1')||'null'),b=JSON.parse(storage.getItem('isa-portfolio-sync-base-v1')||'null');
   if(c?.url!==SYNC_ORIGIN+'/sync'||b?.url!==c.url||!Number.isSafeInteger(b.revision)||b.revision<1||typeof c.token!=='string'||c.token.length<32)return null;
   return c.token;
  }catch(_){return null;}
 };
 const initial=read();if(!initial)return null;
 const paths={'/watchlist':'/quote/watchlist','/quotes':'/quote/us','/daily':'/quote/daily'};
 return async path=>{
  if(!Object.hasOwn(paths,path)||read()!==initial)throw Error('shared_read_disconnected');
  const r=await fetchImpl(SYNC_ORIGIN+paths[path],{method:'GET',headers:{Authorization:'Bearer '+initial,Accept:'application/json'},cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('shared_read_'+r.status);
  return r.json();
 };
}
