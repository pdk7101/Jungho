import {workerOrigin} from './registry-cloud-client-v17.mjs';
export function krxRequestPlan(model){
 const seen=new Map();
 for(const h of Object.values(model.state.holdings)){
  if(h.archived)continue;
  const i=model.state.catalog[h.instrumentId];
  if(i?.market==='KR'&&['KRX-ETF','KOSPI','KOSDAQ'].includes(i.venue)&&/^[0-9A-Z]{6}$/.test(i.symbol))seen.set(i.id,{venue:i.venue,symbol:i.symbol});
 }
 return {instruments:[...seen.values()]};
}
export function validateKrResponse(payload,plan){
 if(payload?.schema!=='krx-dynamic-close-v17'||payload.realTime!==false||!/^\d{8}$/.test(payload.asOfCandidate)||!payload.byId)throw Error('KRX 응답 형식 미확인');
 const byId={};
 for(const i of plan.instruments){
  const id='KR:'+i.venue+':'+i.symbol,q=payload.byId[id];
  if(q?.id===id&&q.venue===i.venue&&q.symbol===i.symbol&&q.currency==='KRW'&&typeof q.close==='number'&&Number.isFinite(q.close)&&q.close>0&&/^\d{8}$/.test(q.date)&&q.date<=payload.asOfCandidate)byId[id]={...q};
  else byId[id]={error:'official_close_unconfirmed'};
 }
 return {byId,asOfCandidate:payload.asOfCandidate};
}
export function krxClient({url,token,fetchImpl=fetch}){
 const origin=workerOrigin(url);
 if(typeof token!=='string'||token.length<20)throw Error('KRX 조회 토큰 확인');
 return {async closes(model){
  const plan=krxRequestPlan(model);
  if(!plan.instruments.length)return {byId:{}};
  const r=await fetchImpl(origin+'/api/krx-dynamic-close',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(plan),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(100000)});
  if(!r.ok)throw Error('KRX Worker 응답 '+r.status);
  return validateKrResponse(await r.json(),plan);
 }};
}
