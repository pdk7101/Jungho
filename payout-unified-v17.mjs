// Read-only reconciliation of recorded net payments. Never count account-wide
// opening balances and overlapping new-symbol lifetime totals twice.
import {aliases} from './legacy-registry-preview.mjs';
import {holdingId,instrument} from './instrument-registry.mjs';
const accounts=['kiwoom-isa','toss-kr','toss-us'];
const fields={'kiwoom-isa':'kiwoom','toss-kr':'domestic','toss-us':'us'};
const legacyIds=new Set(aliases.map(a=>holdingId(a.account,instrument(a))));
const keys=['isa-account-dividend-totals-v1','isa-us-holdings-v1','isa-us-distributions-krw-v1','isa-kr-distribution-ledger-v1','isa-kr-distribution-baselines-v1','isa-user-portfolio-snapshot-v1'];
const sync='https://jungho-portfolio-sync.pdk7101.workers.dev/sync';
const known=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
export function confirmedPayouts(storage,totals){
 try{
  const c=JSON.parse(storage.getItem('isa-portfolio-sync-config-v1')||'null'),b=JSON.parse(storage.getItem('isa-portfolio-sync-base-v1')||'null');
  if(c?.url!==sync||b?.url!==sync||!Number.isSafeInteger(b.revision)||b.revision<1||!b.data||!keys.every(k=>Object.hasOwn(b.data,k)&&storage.getItem(k)===b.data[k]))return null;
  if(!totals||!known(totals.all)||!Array.isArray(totals.missing)||!Array.isArray(totals.provisional))return null;
  return totals;
 }catch(_){return null;}
}
export function unifiedPayouts(model,{legacy=null,records={},registryConfirmed=false,positionConfirmed=false}={}){
 const grouped=Object.fromEntries(accounts.map(a=>[a,[]])),seen=new Set();
 let ambiguous=false;
 for(const h of Object.values(model?.state?.holdings||{})){
  const i=model.state.catalog[h.instrumentId];if(!i||h.archived)continue;
  const key=h.account+'|'+i.market+'|'+i.symbol;
  if(seen.has(key))ambiguous=true;seen.add(key);
  if(!legacyIds.has(h.id)&&Object.hasOwn(grouped,h.account))grouped[h.account].push(h.id);
 }
 const valid=!!legacy&&registryConfirmed&&!ambiguous;
 const result={};
 for(const a of accounts){
  const raw=legacy?.[fields[a]],base=known(raw)?raw:null,ids=grouped[a],scope=legacy?.scope?.[a];
  let added=0,held=0,unknown=0;
  for(const id of ids){
   const v=positionConfirmed?records[id]?.netDistributionsKRW:null;
   if(!known(v)){unknown++;continue;}
   if(v===0||scope==='legacy-symbols')added+=v;else held+=v;
  }
  const sum=base===null?null:base+added;
  result[a]={legacy:base,added:valid?added:null,overlap:valid?held:null,unknown:ids.length&&!positionConfirmed?ids.length:unknown,
   recorded:valid&&known(sum)?sum:null};
 }
 const vals=Object.values(result),recorded=valid?legacy.all+vals.reduce((n,x)=>n+x.added,0):null;
 const overlap=valid?vals.reduce((n,x)=>n+x.overlap,0):null,unknown=vals.reduce((n,x)=>n+x.unknown,0);
 return {accounts:result,recorded:known(recorded)?recorded:null,overlap,unknown,ambiguous,complete:valid&&legacy.complete===true&&overlap===0&&unknown===0&&known(recorded)};
}
