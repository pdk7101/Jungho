import {workerOrigin} from './registry-cloud-client-v17.mjs';
import {editNewBasis} from './registry-valuation-v17.mjs';
// Dedicated credential, in memory only. No price API or legacy sync access.
export function positionClient({url,token,sharedRead=null,fetchImpl=fetch}){
 const origin=workerOrigin(url);
 if(sharedRead&&(typeof sharedRead!=='function'||origin!=='https://jungho-v17.pdk7101.workers.dev'))throw Error('position_scope');
 if(!sharedRead&&(typeof token!=='string'||token.length<32))throw Error('position_token');
 async function request(data){
  if(!data&&sharedRead)return sharedRead('/position-records');
  if(typeof token!=='string'||token.length<32)throw Error('position_write_required');
  const r=await fetchImpl(origin+'/position-records',{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error(r.status===409?'basis_conflict':'basis_http_'+r.status);
  return r.json();
 }
 const row=(model,id,x)=>{
  if(!x||!Number.isSafeInteger(x.revision)||x.revision<1||!Number.isFinite(Date.parse(x.updatedAt))||!x.data||Object.keys(x.data).sort().join(',')!=='avgKRW,netDistributionsKRW,qty')throw Error('basis_response');
  return {revision:x.revision,data:editNewBasis(model,{},id,x.data)[id],updatedAt:x.updatedAt};
 };
 return {
  async load(model){
   const p=await request();
   if(p?.schema!=='new-position-basis-v17'||!p.records||Array.isArray(p.records)||Object.keys(p.records).length>300)throw Error('basis_response');
   const out={};
   for(const [id,x] of Object.entries(p.records))out[id]=row(model,id,x);
   return out;
  },
  async save(model,id,data,revision){
   const checked=editNewBasis(model,{},id,data)[id];
   if(!Number.isSafeInteger(revision)||revision<0)throw Error('basis_revision');
   const p=await request({id,data:checked,revision});
   const result=row(model,id,p);
   if(p.id!==id||result.revision!==revision+1||JSON.stringify(result.data)!==JSON.stringify(checked))throw Error('basis_response');
   return result;
  }
 };
}
