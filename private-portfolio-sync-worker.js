/* Private portfolio synchronization only. No market data or brokerage orders. */
const ORIGIN='https://pdk7101.github.io';
const KEYS=['isa-private-positions-v1','isa-private-toss-domestic-holdings-v1','isa-us-holdings-v1','isa-user-portfolio-snapshot-v1','isa-private-toss-domestic-snapshot-v1','isa-us-distributions-krw-v1','isa-kr-distribution-ledger-v1','isa-kr-distribution-baselines-v1','isa-account-dividend-totals-v1','isa-account-totals-v1','isa-account-calculation-mode-v1','isa-rules','isa-us-signal-limits-v1','isa-sol-distributions-v1','isa-sol-dist-edit-v1','isa-unattended-order-plan-v1','isa-unattended-order-status-v1','isa-cony-autobuy-plan-v1'];
const LIMIT=800000;
function response(status,data){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Vary':'Origin','X-Content-Type-Options':'nosniff'}});}
async function authorized(request,env){
 const secret=env.PORTFOLIO_SYNC_TOKEN,header=request.headers.get('Authorization')||'';
 if(typeof secret!=='string'||secret.length<32||!header.startsWith('Bearer '))return false;
 const enc=new TextEncoder(),a=await crypto.subtle.digest('SHA-256',enc.encode(header.slice(7))),b=await crypto.subtle.digest('SHA-256',enc.encode(secret));
 let diff=0;for(let i=0;i<32;i++)diff|=new Uint8Array(a)[i]^new Uint8Array(b)[i];return diff===0;
}
function validData(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==KEYS.length)return false;
 return KEYS.every(k=>Object.hasOwn(data,k)&&(data[k]===null||typeof data[k]==='string'&&(()=>{try{const x=JSON.parse(data[k]);return x!==null&&typeof x==='object'}catch(_){return false}})()));
}
export default {async fetch(request,env){
 if(request.headers.get('Origin')!==ORIGIN)return response(403,{error:'origin'});
 if(new URL(request.url).pathname!=='/sync')return response(404,{error:'path'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
 if(!await authorized(request,env))return response(401,{error:'authorization'});
 if(!['GET','PUT'].includes(request.method))return response(405,{error:'method'});
 try{
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS portfolio_sync (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
  const get=()=>env.DB.prepare('SELECT revision,payload,updated_at FROM portfolio_sync WHERE id=1').first();
  const row=await get();
  if(request.method==='GET')return response(200,{revision:row?.revision||0,data:row?JSON.parse(row.payload):null,updatedAt:row?.updated_at||null});
  if(Number(request.headers.get('Content-Length')||0)>LIMIT)return response(413,{error:'size'});
  const raw=await request.text();if(new TextEncoder().encode(raw).length>LIMIT)return response(413,{error:'size'});
  let body;try{body=JSON.parse(raw)}catch(_){return response(400,{error:'json'})}
  if(!Number.isSafeInteger(body?.revision)||body.revision<0||!validData(body.data))return response(400,{error:'schema'});
  if(body.revision!==(row?.revision||0))return response(409,{error:'revision'});
  const rev=body.revision+1,payload=JSON.stringify(body.data),stamp=new Date().toISOString();
  const result=body.revision===0?await env.DB.prepare('INSERT OR IGNORE INTO portfolio_sync(id,revision,payload,updated_at) VALUES(1,?,?,?)').bind(rev,payload,stamp).run():
   await env.DB.prepare('UPDATE portfolio_sync SET revision=?,payload=?,updated_at=? WHERE id=1 AND revision=?').bind(rev,payload,stamp,body.revision).run();
  if(result.meta.changes!==1)return response(409,{error:'revision'});
  return response(200,{revision:rev,data:body.data,updatedAt:stamp});
 }catch(_){return response(503,{error:'database'})}
}};
