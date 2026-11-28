// Isolated transactional recovery sandbox. Never uses the 18 live v16 keys.
// One atomic storage value contains both current records and rollback checkpoint.
import {canonicalRecords,verifyBackup,stageRecovery,createBackup} from './portfolio-recovery-v17.mjs';
export const SANDBOX_KEY='isa-v17-recovery-sandbox-only-v1';
const same=(a,b)=>JSON.stringify(canonicalRecords(a))===JSON.stringify(canonicalRecords(b));
const revisionOk=n=>Number.isSafeInteger(n)&&n>=1;
export function sandboxStore(storage,locks){
 if(!locks||typeof locks.request!=='function')throw Error('exclusive_lock_required');
 return {
  async exclusive(fn){return locks.request(SANDBOX_KEY,{mode:'exclusive'},async()=>fn({
   read(){const s=storage.getItem(SANDBOX_KEY);return s===null?null:JSON.parse(s)},
   write(value){storage.setItem(SANDBOX_KEY,JSON.stringify(value))}
  }))}
 };
}
async function verifiedState(tx,cryptoImpl){
 const s=tx.read();
 if(!s||s.schema!=='portfolio-recovery-sandbox-v17'||!revisionOk(s.revision))throw Error('sandbox_state_invalid');
 const current=await verifyBackup(s.current,{cryptoImpl});
 const previous=s.previous===null?null:await verifyBackup(s.previous,{cryptoImpl});
 return {...s,current,previous};
}
export async function initializeSandbox(store,records,{cryptoImpl=globalThis.crypto}={}){
 const current=await createBackup(records,{cryptoImpl});
 return store.exclusive(async tx=>{
  if(tx.read()!==null)throw Error('sandbox_already_initialized');
  const state={schema:'portfolio-recovery-sandbox-v17',revision:1,current,previous:null};
  tx.write(state);return state;
 });
}
export async function restoreSandbox(store,backup,{expectedRevision,expectedCurrent,confirm=false,cryptoImpl=globalThis.crypto}={}){
 if(confirm!==true)throw Error('explicit_confirmation_required');
 return store.exclusive(async tx=>{
  const state=await verifiedState(tx,cryptoImpl);
  if(state.revision!==expectedRevision||!same(state.current.records,expectedCurrent))throw Error('current_changed');
  if(state.revision===Number.MAX_SAFE_INTEGER)throw Error('revision_limit');
  const stage=await stageRecovery({current:state.current.records,expectedCurrent,backup,cryptoImpl});
  if(same(stage.before.records,stage.target.records))return state;
  const next={schema:state.schema,revision:state.revision+1,current:stage.target,previous:state.current};
  // Atomic setItem on a dedicated key: quota failure leaves the earlier envelope.
  tx.write(next);return next;
 });
}
export async function rollbackSandbox(store,{expectedRevision,confirm=false,cryptoImpl=globalThis.crypto}={}){
 if(confirm!==true)throw Error('explicit_confirmation_required');
 return store.exclusive(async tx=>{
  const state=await verifiedState(tx,cryptoImpl);
  if(state.revision!==expectedRevision)throw Error('current_changed');
  if(!state.previous)throw Error('no_rollback_checkpoint');
  if(state.revision===Number.MAX_SAFE_INTEGER)throw Error('revision_limit');
  const next={schema:state.schema,revision:state.revision+1,current:state.previous,previous:state.current};
  tx.write(next);return next;
 });
}
