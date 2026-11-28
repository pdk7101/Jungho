// v17 backup and restore staging. No network calls or production storage writes.
export const LEGACY_KEYS=Object.freeze(['isa-private-positions-v1','isa-private-toss-domestic-holdings-v1','isa-us-holdings-v1','isa-user-portfolio-snapshot-v1','isa-private-toss-domestic-snapshot-v1','isa-us-distributions-krw-v1','isa-kr-distribution-ledger-v1','isa-kr-distribution-baselines-v1','isa-account-dividend-totals-v1','isa-account-totals-v1','isa-account-calculation-mode-v1','isa-rules','isa-us-signal-limits-v1','isa-sol-distributions-v1','isa-sol-dist-edit-v1','isa-unattended-order-plan-v1','isa-unattended-order-status-v1','isa-cony-autobuy-plan-v1']);
const MAX_BYTES=5*1024*1024;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export function canonicalRecords(data){
 if(!exact(data,LEGACY_KEYS))throw Error('legacy_schema_mismatch');
 const out={};
 for(const k of LEGACY_KEYS){
  const v=data[k];
  if(v!==null){
   if(typeof v!=='string')throw Error('invalid_record');
   let parsed;try{parsed=JSON.parse(v)}catch(_){throw Error('invalid_record')}
   if(parsed===null||typeof parsed!=='object')throw Error('invalid_record');
  }
  out[k]=v;
 }
 if(new TextEncoder().encode(JSON.stringify(out)).byteLength>MAX_BYTES)throw Error('backup_too_large');
 return out;
}
export function readRecords(storage){
 return canonicalRecords(Object.fromEntries(LEGACY_KEYS.map(k=>[k,storage.getItem(k)])));
}
const equal=(a,b)=>LEGACY_KEYS.every(k=>a[k]===b[k]);
const revisionOK=n=>Number.isSafeInteger(n)&&n>=0;
async function digest(body,cryptoImpl=globalThis.crypto){
 const bytes=await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(body)));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function createBackup(data,{createdAt=new Date().toISOString(),revision=null,cryptoImpl=globalThis.crypto}={}){
 if(typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt))||revision!==null&&!revisionOK(revision))throw Error('invalid_metadata');
 const body={schema:'portfolio-backup-v17',legacyVersion:1,createdAt,revision,records:canonicalRecords(data)};
 return {...body,sha256:await digest(body,cryptoImpl)};
}
export async function verifyBackup(file,{cryptoImpl=globalThis.crypto}={}){
 if(!exact(file,['schema','legacyVersion','createdAt','revision','records','sha256'])||file.schema!=='portfolio-backup-v17'||file.legacyVersion!==1||typeof file.sha256!=='string'||!/^[0-9a-f]{64}$/.test(file.sha256))throw Error('backup_schema_mismatch');
 const expected=await createBackup(file.records,{createdAt:file.createdAt,revision:file.revision,cryptoImpl});
 if(expected.sha256!==file.sha256)throw Error('backup_checksum_mismatch');
 return expected;
}
export function compareRecords(current,target){
 const a=canonicalRecords(current),b=canonicalRecords(target);
 return LEGACY_KEYS.map(key=>({key,status:a[key]===b[key]?'same':b[key]===null?'would_remove':a[key]===null?'would_add':'would_replace'}));
}
// An isolated recovery envelope is one atomic storage value. It is never used by v16.
// No function in this module applies changes to actual v16 keys.
export async function stageRecovery({current,backup,expectedCurrent,cryptoImpl=globalThis.crypto}){
 const now=canonicalRecords(current),expected=canonicalRecords(expectedCurrent);
 if(!equal(now,expected))throw Error('current_changed');
 const verified=await verifyBackup(backup,{cryptoImpl});
 return {schema:'portfolio-recovery-stage-v17',before:await createBackup(now,{cryptoImpl}),target:verified,changes:compareRecords(now,verified.records),liveApplied:false};
}
// v1 wire format remains exact; v17 watchlist must be stored separately.
// Never send a partially merged payload when any record is in conflict.
export function planSync({base,local,remote}){
 const a=canonicalRecords(local);
 if(!plain(remote)||!revisionOK(remote.revision))throw Error('remote_contract');
 if(remote.revision===0&&remote.data!==null)throw Error('remote_contract');
 const b=remote.revision===0?null:canonicalRecords(remote.data);
 if(!base){
  if(b&&equal(a,b))return {status:'identical',revision:remote.revision,data:a};
  return {status:b?'initial_conflict':'initial_confirmation',revision:remote.revision,data:null};
 }
 if(!revisionOK(base.revision)||base.revision<1)throw Error('base_contract');
 const old=canonicalRecords(base.data);
 if(!b||remote.revision<base.revision||remote.revision===base.revision&&!equal(old,b))return {status:'remote_reset_or_diverged',data:null};
 const merged={},conflicts=[];
 for(const k of LEGACY_KEYS){
  if(a[k]===b[k])merged[k]=a[k];
  else if(a[k]===old[k])merged[k]=b[k];
  else if(b[k]===old[k])merged[k]=a[k];
  else conflicts.push(k);
 }
 if(conflicts.length)return {status:'conflict',revision:remote.revision,conflicts,data:null};
 return {status:equal(merged,b)?'read_only':'ready',revision:remote.revision,data:merged};
}
