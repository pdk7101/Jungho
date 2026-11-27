// Combined reference view, independently calculated from confirmed per-position records.
// Never adds to old account totals, writes storage, or creates orders.
import {aliases} from './legacy-registry-preview.mjs';
import {instrument,holdingId} from './instrument-registry.mjs';
import {readLegacyBasis,consolidated,loadPublishedReference,mergeReferenceDaily} from './registry-consolidated-v17.mjs';
import {sharedRegistryRead,watchClient} from './registry-cloud-client-v17.mjs';
import {positionClient} from './registry-position-client-v17.mjs';
const TARGET='https://jungho-v17.pdk7101.workers.dev',SYNC='https://jungho-portfolio-sync.pdk7101.workers.dev/sync';
const basisKeys=['isa-private-positions-v1','isa-private-toss-domestic-holdings-v1','isa-us-holdings-v1'];
const names={'kiwoom-isa':'키움 ISA','toss-kr':'토스 국내','toss-us':'토스 미국',all:'전체'};
const krIds={tsofr:'sofr',treit:'reit',ttr:'tr',tspace:'space',trobot:'robot'};
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const day=(now)=>{const x=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));return x.year+x.month+x.day;};
export function confirmedLegacy(storage){
 try{
  const c=JSON.parse(storage.getItem('isa-portfolio-sync-config-v1')||'null'),b=JSON.parse(storage.getItem('isa-portfolio-sync-base-v1')||'null');
  if(c?.url!==SYNC||b?.url!==SYNC||!Number.isSafeInteger(b.revision)||b.revision<1||!b.data||!basisKeys.every(k=>Object.hasOwn(b.data,k)&&storage.getItem(k)===b.data[k]))return null;
  return {revision:b.revision,basis:readLegacyBasis(storage)};
 }catch(_){return null;}
}
export function commonKR(common,now=Date.now()){
 const byId={},today=day(now);let asOfCandidate=null;
 if(common?.version!==1)return {byId,asOfCandidate};
 for(const a of aliases.filter(x=>x.market==='KR')){
  const id=instrument(a).id,q=common.kr?.[krIds[a.legacyId]||a.legacyId];
  const date=q?.date?.replaceAll('-',''),stamp=Date.parse(q?.date||'');
  if(q?.source!=='KRX 공식 확정 종가'||!positive(q.amount)||!/^\d{8}$/.test(date||'')||date>=today||!Number.isFinite(stamp)||now-stamp>14*86400000)continue;
  byId[id]={id,symbol:a.symbol,venue:a.venue,currency:'KRW',date,close:q.amount};
  if(!asOfCandidate||date>asOfCandidate)asOfCandidate=date;
 }
 return {byId,asOfCandidate};
}
export function unifiedReference(model,{legacy,records,registryConfirmed=false,positionConfirmed=false,inputs={}}={}){
 const seen=new Set();let ambiguous=false;
 for(const h of Object.values(model.state.holdings)){
  const i=model.state.catalog[h.instrumentId];if(!i||h.archived)continue;
  const key=h.account+'|'+i.market+'|'+i.symbol;
  if(seen.has(key))ambiguous=true;seen.add(key);
 }
 const ready=registryConfirmed&&!ambiguous;
 const data=consolidated(model,{legacyBasis:legacy?.basis||{},legacyConfirmed:!!legacy,newBasis:records||{},newConfirmed:positionConfirmed,registryConfirmed:ready,inputs});
 return {...data,ambiguous,legacyRevision:legacy?.revision??null,registryConfirmed:ready,positionConfirmed};
}
const won=n=>n===null?'미확인':Math.round(n).toLocaleString('ko-KR')+'원';
export function mountUnified(doc,win){
 const $=id=>doc.getElementById(id),root=$('v17-unified-rows');if(!root)return;
 let busy=false,position=null,model=null,records=null,reference=null,daily=null,live=null,registryConfirmed=false,positionConfirmed=false;
 const status=$('v17-unified-status'),form=$('v17-unified-auth'),input=$('v17-unified-token'),refresh=$('v17-unified-refresh');
 const render=()=>{
  root.replaceChildren();if(!model)return;
  const result=unifiedReference(model,{legacy:confirmedLegacy(win.localStorage),records,registryConfirmed,positionConfirmed,inputs:{kr:commonKR(win.ISA_SHARED_QUOTES?.valuationData?.()),live,daily:mergeReferenceDaily(reference?.daily,daily),fx:reference?.fx}});
  for(const [account,t] of [...Object.entries(result.accounts),['all',result.all]]){
   const p=doc.createElement('p');p.className='sub';
   p.textContent=names[account]+' · '+t.count+'건 · 원금 '+won(t.cost)+' · 참고 평가 '+won(t.value)+' · 손익 '+won(t.profit)+' · 수익률 '+(t.returnPct===null?'미확인':t.returnPct.toFixed(2)+'%')+' · 미확인 '+t.missing+'건 · 기준일 '+(t.dates.join(', ')||'미확인');
   root.append(p);
  }
  const p=doc.createElement('p');p.className='sub';p.textContent=result.ambiguous?'동일 계좌·종목에 시장 분류가 중복되어 합산 보류':result.legacyRevision===null?'기존 동기화 기록 확인 전 합산 보류':'기존 동기화 버전 '+result.legacyRevision+' · 신규 배당 '+won(result.all.newNetDistributionsKRW)+' (기존 배당과 합산 보류)';
  root.append(p);
 };
 async function load(){
  if(busy||doc.hidden)return;busy=true;refresh.disabled=true;registryConfirmed=false;positionConfirmed=false;render();
  try{
   const reader=sharedRegistryRead(win.localStorage);if(!reader)throw Error('sync_required');
   const client=watchClient({url:TARGET,sharedRead:reader});
   model=await client.load();registryConfirmed=true;
   const results=await Promise.allSettled([loadPublishedReference(),client.quotes(),client.daily(),position?position.load(model):Promise.resolve(null)]);
   reference=results[0].status==='fulfilled'?results[0].value:null;live=results[1].status==='fulfilled'?results[1].value:null;daily=results[2].status==='fulfilled'?results[2].value:null;
   records=results[3].status==='fulfilled'&&results[3].value!==null?Object.fromEntries(Object.entries(results[3].value).map(([id,r])=>[id,r.data])):{};
   positionConfirmed=model.added.length===0||!!position&&results[3].status==='fulfilled'&&results[3].value!==null;
   status.textContent=positionConfirmed?'서버 등록 및 신규 투자기록 확인 · 참고 평가':'신규 투자기록 조회 암호 필요 또는 조회 실패 · 합계 미확인';
  }catch(_){registryConfirmed=false;positionConfirmed=false;status.textContent='동기화 또는 v17 조회 연결 확인 필요 · 기존 투자현황 유지';}
  finally{busy=false;refresh.disabled=false;render();}
 }
 form.addEventListener('submit',e=>{e.preventDefault();if(busy)return;const token=input.value;input.value='';try{position=positionClient({url:TARGET,token});load();}catch(_){status.textContent='투자기록 전용 암호 확인 필요';}});
 refresh.addEventListener('click',load);
 win.addEventListener('storage',e=>{if(e.key===null||basisKeys.includes(e.key)||['isa-portfolio-sync-config-v1','isa-portfolio-sync-base-v1'].includes(e.key)){registryConfirmed=false;positionConfirmed=false;records=null;render();status.textContent='기존 기록 변경 감지 · 다시 조회하세요.';}});
 win.addEventListener('isa-personal-us-quote-refreshed',()=>{live=win.ISA_PERSONAL_US?.scheduledSnapshot?.()||null;render();});
 // No continuous provider calls: refresh only when explicitly requested; recheck freshness locally.
 win.setInterval(render,60000);
}
if(typeof window!=='undefined'&&typeof document!=='undefined')mountUnified(document,window);
