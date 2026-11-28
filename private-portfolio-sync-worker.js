/* Private portfolio synchronization and authenticated, read-only quote forwarding.
 * Only private latest valuation prices are kept in a separate D1 table; never provider credentials. */
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
function quoteConfig(env,kind){
 const raw=kind==='krx'?env.KRX_QUOTE_URL:env.US_QUOTE_URL;
 const token=kind==='krx'?env.KRX_QUOTE_TOKEN:env.US_QUOTE_TOKEN;
 try{
  const u=new URL(String(raw||''));
  // Only this owner's Cloudflare account; no arbitrary URLs or redirects.
  if(u.protocol!=='https:'||!/^[-a-z0-9]+\.pdk7101\.workers\.dev$/.test(u.hostname)||
   u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||
   u.hostname==='jungho-portfolio-sync.pdk7101.workers.dev'||
   typeof token!=='string'||token.length<20)return null;
  return {url:u.origin,token,service:kind==='krx'?env.KRX_SERVICE:env.US_SERVICE};
 }catch(_){return null;}
}
function quoteCapabilities(env){return {krx:!!quoteConfig(env,'krx'),us:!!quoteConfig(env,'us')};}
async function forwardQuote(request,env,kind){
 if(request.method!=='GET')return response(405,{error:'method'});
 const cfg=quoteConfig(env,kind);
 if(!cfg)return response(503,{error:'공통 시세 설정 필요'});
 const incoming=new URL(request.url);
 let path='/quotes';
 if(kind==='watchlist'||kind==='daily'||kind==='positions'){
  if(incoming.search||cfg.url!=='https://jungho-v17.pdk7101.workers.dev'||!cfg.service?.fetch)return response(503,{error:'v17_read_connection_required'});
  path=kind==='watchlist'?'/watchlist':kind==='positions'?'/position-records':'/daily';
  if(kind==='positions'){
   const secret=env.V17_POSITION_READ_TOKEN;
   if(typeof secret!=='string'||secret.length<32||secret===cfg.token||secret===env.PORTFOLIO_SYNC_TOKEN)return response(503,{error:'position_read_not_configured'});
   cfg.token=secret;
  }
 }
 if(kind==='krx'){
  const page=incoming.searchParams.get('page');
  if(!/^[0-4]$/.test(page||''))return response(400,{error:'page'});
  path='/api/krx-history?page='+page;
 }
 try{
  const options={method:'GET',redirect:'manual',
   headers:{Origin:ORIGIN,Authorization:'Bearer '+cfg.token,Accept:'application/json'}};
  // Same-account workers.dev HTTP calls can fail (Cloudflare 1042).
  // Prefer explicit service bindings, retain legacy HTTP path for migration.
  const upstream=cfg.service?.fetch?
   await cfg.service.fetch(new Request(cfg.url+path,options)):
   await fetch(cfg.url+path,options);
  if(!upstream.ok)return response(upstream.status===401?401:upstream.status===429?429:502,{
   error:upstream.status===401?'시세 원본 접근 토큰 확인 필요':
    upstream.status===429?'시세 API 호출 한도 확인 필요':
    '공통 시세 원본 연결 실패 · '+(cfg.service?.fetch?'서비스 바인딩':'직접 HTTP')+' · HTTP '+upstream.status});
  const data=await upstream.json();
  return response(200,data);
 }catch(_){return response(502,{error:'공통 시세 조회 실패 · '+(cfg.service?.fetch?'서비스 바인딩':'직접 HTTP')});}
}
// Owner-only valuation snapshot. Identical prices and FX for both devices,
// with an independent cache table; no holdings, credentials or orders here.
const KR_CODES={reit:'329200',sol:'0167B0',robot:'469070',space:'0131V0',sofr:'455030',tr:'278530',biotech:'0229F0',media:'228810',hongah:'003280',sensor:'321370'};
const US_CODES={schd:'SCHD',agnc:'AGNC',spym:'SPYM',cony:'CONY',spacex:'SPCX'};
const validPositive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const date8=s=>typeof s==='string'&&/^\d{8}$/.test(s);
const isoDay=s=>s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
const within=(stamp,age,now=Date.now())=>Number.isFinite(Date.parse(stamp))&&Date.parse(stamp)<=now+60000&&now-Date.parse(stamp)<=age;
function krValuation(body,previous,now){
 const out={...previous};
 if(body?.ok!==true||body.page!==0||!date8(body.latestExpected))return out;
 for(const q of [...(Array.isArray(body.rows)?body.rows:[]),...(Array.isArray(body.extraQuotes)?body.extraQuotes:[])]){
  if(!q||!Object.hasOwn(KR_CODES,q.id)||KR_CODES[q.id]!==q.code||!date8(q.date)||
    q.date>body.latestExpected||!within(isoDay(q.date),14*86400000,now)||!validPositive(q.close))continue;
  const date=isoDay(q.date);
  if(!out[q.id]||out[q.id].date<=date)out[q.id]={amount:q.close,date,source:'KRX 공식 확정 종가'};
 }
 return out;
}
function usValuation(body,previous,now){
 const out={...previous};const fx=body?.fx;
 if(body?.market!=='US'||body.currency!=='USD'||fx?.ok!==true||
   !validPositive(fx.usdKrw)||fx.usdKrw<700||fx.usdKrw>3000||
   !within(fx.observedAt,8*86400000,now))return out;
 // Never regress FX across partial deployments. Retain a prior dollar close
 // when a ticker is missing; recompute all retained quotes at one common FX.
 const prev=Object.values(previous||{}).find(q=>q?.fxAt);
 if(prev&&Date.parse(prev.fxAt)>Date.parse(fx.observedAt))return out;
 for(const q of [...(Array.isArray(body.items)?body.items:[]),body.extraQuotes?.spacex]){
  if(!q||q.ok!==true||!Object.hasOwn(US_CODES,q.id)||q.ticker!==US_CODES[q.id]||
    !date8(q.date)||!within(isoDay(q.date),10*86400000,now)||!validPositive(q.close)||
    (q.id==='spacex'&&q.date<'20260612'))continue;
  const date=isoDay(q.date);
  if(!out[q.id]||out[q.id].date<=date)out[q.id]={usd:q.close,date};
 }
 for(const q of Object.values(out))if(validPositive(q.usd)){
  q.amount=q.usd*fx.usdKrw;q.fxRate=fx.usdKrw;q.fxAt=fx.observedAt;
  q.source='미국 확정 일봉 × 공통 참고환율';
 }
 return out;
}
function withRecentTrades(body,base,now){
 const out=Object.fromEntries(Object.entries(base||{}).map(([id,q])=>[id,{...q}]));
 for(const [id,q] of Object.entries(out)){
  delete q.liveAmount;delete q.liveAt;
  const trade=body?.quotes?.[id];
  if(!String(body?.source||'').includes('Finnhub')||!within(body.fetchedAt,5*60000,now)||
   trade?.symbol!==US_CODES[id]||!validPositive(trade.usd)||!within(trade.tradeAt,45*60000,now)||
   !validPositive(q.fxRate))continue;
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(trade.tradeAt)).map(x=>[x.type,x.value]));
  if(p.year+'-'+p.month+'-'+p.day<=q.date)continue;
  q.liveAmount=trade.usd*q.fxRate;q.liveAt=trade.tradeAt;
 }
 return out;
}
async function sharedValuation(request,env){
 if(request.method!=='GET')return response(405,{error:'method'});
 try{
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS market_valuation (id TEXT PRIMARY KEY, slot INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
  const load=async id=>env.DB.prepare('SELECT slot,payload,updated_at FROM market_valuation WHERE id=?').bind(id).first();
  const read=row=>{try{return JSON.parse(row?.payload||'{}')}catch(_){return {}}};
  const now=Date.now();
  async function update(id,interval,get){
   const slot=Math.floor(now/interval),old=await load(id),before=read(old);
   if(old&&old.slot>=slot)return {data:before,checkedAt:old.updated_at};
   let data=before;
   try{data=await get(before)}catch(_){}
   const stamp=new Date(now).toISOString();
   // First completed refresh in the interval wins; every reader returns the DB winner.
   await env.DB.prepare('INSERT INTO market_valuation(id,slot,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET slot=excluded.slot,payload=excluded.payload,updated_at=excluded.updated_at WHERE market_valuation.slot<excluded.slot').bind(id,slot,JSON.stringify(data),stamp).run();
   const final=await load(id);return {data:read(final),checkedAt:final?.updated_at||null};
  }
  const [kr,us]=await Promise.all([
   update('kr',30*60000,async before=>{
    const u=new URL(request.url);u.pathname='/quote/krx';u.search='?page=0';
    const r=await forwardQuote(new Request(u.toString(),{method:'GET'}),env,'krx');
    return r.ok?krValuation(await r.json(),before,now):before;
   }),
   update('us',5*60000,async before=>{
    let base=before,live=null;
    try{
     const r=await fetch(ORIGIN+'/Jungho/us-quotes.json',{redirect:'manual',headers:{Accept:'application/json'},cache:'no-store'});
     if(r.ok)base=usValuation(await r.json(),before,now);
    }catch(_){}
    try{
     const u=new URL(request.url);u.pathname='/quote/us';u.search='';
     const r=await forwardQuote(new Request(u.toString(),{method:'GET'}),env,'us');
     if(r.ok)live=await r.json();
    }catch(_){}
    return withRecentTrades(live,base,now);
   })
  ]);
  // Old quotes remain dated and are never passed off as today's prices.
  return response(200,{version:1,kr:kr.data,us:us.data,krCheckedAt:kr.checkedAt,usCheckedAt:us.checkedAt});
 }catch(_){return response(503,{error:'공통 평가가격 조회 실패'});}
}
export default {async fetch(request,env){
 if(request.headers.get('Origin')!==ORIGIN)return response(403,{error:'origin'});
 const path=new URL(request.url).pathname;
 if(!['/sync','/quote/krx','/quote/us','/quote/valuation','/quote/watchlist','/quote/daily','/quote/positions'].includes(path))return response(404,{error:'path'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
 if(!await authorized(request,env))return response(401,{error:'authorization'});
 if(path==='/quote/valuation')return sharedValuation(request,env);
 if(path!=='/sync')return forwardQuote(request,env,path==='/quote/krx'?'krx':path==='/quote/watchlist'?'watchlist':path==='/quote/daily'?'daily':path==='/quote/positions'?'positions':'us');
 if(!['GET','PUT'].includes(request.method))return response(405,{error:'method'});
 try{
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS portfolio_sync (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
  const get=()=>env.DB.prepare('SELECT revision,payload,updated_at FROM portfolio_sync WHERE id=1').first();
  const row=await get();
  if(request.method==='GET')return response(200,{revision:row?.revision||0,data:row?JSON.parse(row.payload):null,updatedAt:row?.updated_at||null,quoteCapabilities:{...quoteCapabilities(env),valuation:true}});
  if(Number(request.headers.get('Content-Length')||0)>LIMIT)return response(413,{error:'size'});
  const raw=await request.text();if(new TextEncoder().encode(raw).length>LIMIT)return response(413,{error:'size'});
  let body;try{body=JSON.parse(raw)}catch(_){return response(400,{error:'json'})}
  if(!Number.isSafeInteger(body?.revision)||body.revision<0||!validData(body.data))return response(400,{error:'schema'});
  if(body.revision!==(row?.revision||0))return response(409,{error:'revision'});
  const rev=body.revision+1,payload=JSON.stringify(body.data),stamp=new Date().toISOString();
  const result=body.revision===0?await env.DB.prepare('INSERT OR IGNORE INTO portfolio_sync(id,revision,payload,updated_at) VALUES(1,?,?,?)').bind(rev,payload,stamp).run():
   await env.DB.prepare('UPDATE portfolio_sync SET revision=?,payload=?,updated_at=? WHERE id=1 AND revision=?').bind(rev,payload,stamp,body.revision).run();
  if(result.meta.changes!==1)return response(409,{error:'revision'});
  return response(200,{revision:rev,data:body.data,updatedAt:stamp,quoteCapabilities:{...quoteCapabilities(env),valuation:true}});
 }catch(_){return response(503,{error:'database'})}
}};
