// Isolated v17 collector. Not yet wired to live routes or cron.
// All prices and attempts are private. Existing portfolio keys are untouched.
const BATCH=10, INTERVAL=60000, FRESH=5*60000, LEASE=180000;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const validSymbol=s=>typeof s==='string'&&/^[A-Z][A-Z0-9.\-]{0,14}$/.test(s);
function activeUS(catalog,holdings){
 const symbols=new Set();
 for(const h of Object.values(holdings||{})){
  if(h.archived)continue;
  const i=catalog?.[h.instrumentId];
  if(i?.market==='US'&&i.venue==='US'&&validSymbol(i.symbol))symbols.add(i.symbol);
 }
 if(symbols.size>100)throw Error('catalog limit');
 return [...symbols].sort();
}
function selectBatch(symbols,records,now){
 return [...new Set(symbols)].filter(validSymbol)
  .filter(s=>!records[s]||now-Number(records[s].attemptAt||0)>=FRESH)
  .sort((a,b)=>Number(records[a]?.attemptAt||0)-Number(records[b]?.attemptAt||0)||a.localeCompare(b))
  .slice(0,BATCH);
}
function normalize(symbol,body,now){
 const usd=body?.c,t=body?.t,tradeAt=t*1000;
 if(!validSymbol(symbol)||!positive(usd)||!positive(t)||!Number.isFinite(tradeAt)||
  tradeAt>now+60000||tradeAt<now-5*86400000)return null;
 return {symbol,usd,tradeAt:new Date(tradeAt).toISOString(),receivedAt:new Date(now).toISOString(),source:'Finnhub personal quote'};
}
// A single D1 row atomically reserves a minute across devices/isolate instances.
// Reservation occurs BEFORE upstream calls; unsuccessful attempts also consume budget.
function d1Store(db){
 return {
  async init(){
   await db.prepare('CREATE TABLE IF NOT EXISTS us_collect_gate_v17 (id INTEGER PRIMARY KEY CHECK(id=1), next_at INTEGER NOT NULL, owner INTEGER NOT NULL)').run();
   await db.prepare('CREATE TABLE IF NOT EXISTS us_collect_quotes_v17 (symbol TEXT PRIMARY KEY, attempt_at INTEGER NOT NULL, payload TEXT, error TEXT)').run();
  },
  async claim(now){
   const r=await db.prepare('INSERT INTO us_collect_gate_v17(id,next_at,owner) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at,owner=excluded.owner WHERE us_collect_gate_v17.next_at<=?').bind(now+LEASE,now,now).run();
   return r.meta.changes===1;
  },
  async finish(owner,until){
   await db.prepare('UPDATE us_collect_gate_v17 SET next_at=? WHERE id=1 AND owner=?').bind(until,owner).run();
  },
  async load(symbols){
   if(!symbols.length)return {};
   // Bound values only, chunks below D1's bind limit. Never return unrequested symbols.
   const out={};
   for(let offset=0;offset<symbols.length;offset+=40){
    const batch=symbols.slice(offset,offset+40);
    const r=await db.prepare('SELECT symbol,attempt_at,payload,error FROM us_collect_quotes_v17 WHERE symbol IN ('+batch.map(()=>'?').join(',')+')').bind(...batch).all();
    for(const q of r.results||[]){
     let quote=null;try{quote=JSON.parse(q.payload||'null')}catch(_){}
     out[q.symbol]={attemptAt:q.attempt_at,quote,error:q.error};
    }
   }
   return out;
  },
  async save(symbol,attemptAt,quote,error){
   await db.prepare('INSERT INTO us_collect_quotes_v17(symbol,attempt_at,payload,error) VALUES(?,?,?,?) ON CONFLICT(symbol) DO UPDATE SET attempt_at=excluded.attempt_at,payload=COALESCE(excluded.payload,us_collect_quotes_v17.payload),error=excluded.error WHERE us_collect_quotes_v17.attempt_at<=excluded.attempt_at').bind(symbol,attemptAt,quote?JSON.stringify(quote):null,error).run();
  }
 };
}
async function collectUS({catalog,holdings,store,fetchQuote,now=Date.now(),sessionOpen=false,clock=Date.now}){
 const symbols=activeUS(catalog,holdings);
 if(!sessionOpen||!symbols.length)return {status:'closed-or-empty',attempted:0};
 await store.init();
 const records=await store.load(symbols);
 const batch=selectBatch(symbols,records,now);
 if(!batch.length)return {status:'cached',attempted:0};
 if(!await store.claim(now))return {status:'rate-limited-locally',attempted:0};
 let attempted=0,succeeded=0;
 let delay=INTERVAL;
 try{
 // Sequential (not a burst), max 10 calls per reserved minute.
 for(const symbol of batch){
  if(Math.max(now,clock())-now>=LEASE-15000)break;
  attempted++;
  let result;try{result=await fetchQuote(symbol)}catch(_){result={status:0}}
  const q=result?.status===200?normalize(symbol,result.body,Math.max(now,clock())):null;
  const old=records[symbol]?.quote;
  const newer=q&&(!old||Date.parse(q.tradeAt)>=Date.parse(old.tradeAt))?q:null;
  await store.save(symbol,now,newer,result?.status===429?'upstream_429':newer?null:'unavailable-or-older');
  if(newer)succeeded++;
  if(result?.status===429){
   delay=2*INTERVAL;
   return {status:'provider-rate-limit',attempted,succeeded};
  }
 }
 return {status:'collected',attempted,succeeded};
 }finally{await store.finish(now,Math.max(now,clock())+delay);}
}
function finnhubFetcher(key,fetchImpl=fetch){
 if(typeof key!=='string'||!key)throw Error('provider key missing');
 return async symbol=>{
  if(!validSymbol(symbol))return {status:400};
  try{
   const u='https://finnhub.io/api/v1/quote?symbol='+encodeURIComponent(symbol);
   const r=await fetchImpl(u,{headers:{'X-Finnhub-Token':key,Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8000)});
   return {status:r.status,body:r.status===200?await r.json():null};
  }catch(_){return {status:0};}
 };
}

// Candidate for the existing Finnhub Worker; do not deploy until integrated regression tests pass.
// Bind the existing D1 database as DB, retain FINNHUB_API_KEY and VIEW_TOKEN.
// Cron: */1 * * * * (UTC). No browser request triggers a provider call.
const ORIGIN='https://pdk7101.github.io';
const LEGACY=Object.freeze({schd:'SCHD',agnc:'AGNC',spym:'SPYM',cony:'CONY',spacex:'SPCX'});
const HOLIDAYS=new Set('20260101 20260119 20260216 20260403 20260525 20260619 20260703 20260907 20261126 20261225 20270101 20270118 20270215 20270326 20270531 20270618 20270705 20270906 20271125 20271224 20280117 20280221 20280414 20280529 20280619 20280704 20280904 20281123 20281225'.split(' '));
const EARLY=new Set('20261127 20261224 20271126 20280703 20281124'.split(' '));
const ET=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function session(now){
 const p=Object.fromEntries(ET.formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const date=p.year+p.month+p.day,m=Number(p.hour)*60+Number(p.minute),close=EARLY.has(date)?780:960;
 const trading=['2026','2027','2028'].includes(p.year)&&!['Sat','Sun'].includes(p.weekday)&&!HOLIDAYS.has(date);
 return {date,open:trading&&m>=570&&m<close,trading,close,minute:m};
}
const KR_SEED=[
 ['329200','TIGER 리츠부동산인프라','KRX-ETF',true,true],
 ['0167B0','SOL 200타겟위클리커버드콜','KRX-ETF',true,false],
 ['469070','RISE AI&로봇','KRX-ETF',true,true],
 ['0131V0','1Q 미국우주항공테크','KRX-ETF',true,true],
 ['455030','KODEX 미국달러SOFR','KRX-ETF',true,true],
 ['278530','KODEX 200TR','KRX-ETF',true,true],
 ['0229F0','마이티 신약포커스바이오액티브','KRX-ETF',false,true],
 ['228810','TIGER 미디어컨텐츠','KRX-ETF',false,true],
 ['003280','흥아해운','KOSPI',false,true],
 ['321370','센서뷰','KOSDAQ',false,true]
];
const accounts={'kiwoom-isa':'KR','toss-kr':'KR','toss-us':'US'};
function watchInput(x){
 if(!x||Object.keys(x).sort().join(',')!=='account,name,symbol,venue'||!Object.hasOwn(accounts,x.account))throw Error('invalid_input');
 const market=accounts[x.account],{symbol,venue,name}=x;
 if(typeof name!=='string'||!name.trim()||name.length>120||
 !(market==='US'?venue==='US'&&validSymbol(symbol):['KRX-ETF','KOSPI','KOSDAQ'].includes(venue)&&typeof symbol==='string'&&/^[A-Z0-9]{6}$/.test(symbol)))throw Error('invalid_input');
 return {account:x.account,id:market+':'+venue+':'+symbol,market,venue,symbol,name:name.trim()};
}
function appendWatch(state,input){
 const i=watchInput(input),id=i.account+'|'+i.id;
 if(Object.hasOwn(state.holdings,id))return false;
 if(!Object.hasOwn(state.catalog,i.id)&&Object.keys(state.catalog).length>=100)throw Error('registry_limit');
 state.catalog[i.id]??={id:i.id,market:i.market,venue:i.venue,symbol:i.symbol,name:i.name};
 state.holdings[id]={instrumentId:i.id,archived:false};
 return true;
}
function seedRegistry(){
 const state={catalog:{},holdings:{}};
 for(const symbol of Object.values(LEGACY))appendWatch(state,{account:'toss-us',venue:'US',symbol,name:symbol});
 for(const [symbol,name,venue,isa,toss] of KR_SEED){
  if(isa)appendWatch(state,{account:'kiwoom-isa',venue,symbol,name});
  if(toss)appendWatch(state,{account:'toss-kr',venue,symbol,name});
 }
 return state;
}
function decodeRegistry(row){
 const state=seedRegistry();
 if(!row)return state;
 const data=JSON.parse(row.payload);
 if(!data||!data.catalog||!data.holdings||Array.isArray(data.catalog)||Array.isArray(data.holdings)||Object.keys(data.catalog).length>100||Object.keys(data.holdings).length>300)throw Error('registry invalid');
 // Upgrade previous US-only prototype row without dropping any registrations.
 for(const [key,h] of Object.entries(data.holdings)){
  const i=data.catalog[h?.instrumentId],account=key.split('|')[0];
  if(!i||h.archived!==false)throw Error('registry invalid');
  const input={account,venue:i.venue,symbol:i.symbol,name:i.name||i.symbol};
  const checked=watchInput(input);
  if(checked.id!==h.instrumentId||key!==account+'|'+checked.id||i.market!==checked.market)throw Error('registry invalid');
  appendWatch(state,input);
 }
 return state;
}
async function registryRow(db){
 await db.prepare('CREATE TABLE IF NOT EXISTS us_collect_registry_v17 (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)').run();
 return db.prepare('SELECT payload FROM us_collect_registry_v17 WHERE id=1').first();
}
async function registryFromDB(db){return decodeRegistry(await registryRow(db));}
async function registerWatch(db,input){
 const i=watchInput(input);
 for(let attempt=0;attempt<5;attempt++){
  const row=await registryRow(db),state=decodeRegistry(row);
  if(!appendWatch(state,input))return {status:'already_registered',symbol:i.symbol};
  const payload=JSON.stringify(state);
  const result=row
   ?await db.prepare('UPDATE us_collect_registry_v17 SET payload=? WHERE id=1 AND payload=?').bind(payload,row.payload).run()
   :await db.prepare('INSERT OR IGNORE INTO us_collect_registry_v17(id,payload) VALUES(1,?)').bind(payload).run();
  if(result.meta.changes===1)return {status:'registered',symbol:i.symbol};
 }
 throw Error('registry_conflict');
}
async function registerSymbol(db,symbol){return registerWatch(db,{account:'toss-us',venue:'US',symbol,name:symbol});}
async function readSmallJSON(request){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')||!request.body)throw Error('invalid_body');
 const reader=request.body.getReader(),decoder=new TextDecoder();
 let size=0,raw='';
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024)throw Error('invalid_body');raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();
  return JSON.parse(raw);
 }finally{await reader.cancel().catch(()=>{});}
}
async function registrationRoute(request,env,full=false){
 if(full&&request.method==='GET'){
  if(!await authorized(request,env.VIEW_TOKEN))return response(401,{error:'unauthorized'});
  if(!env.DB)return response(503,{error:'missing database binding'});
  try{return response(200,{schema:'watchlist-v17',...(await registryFromDB(env.DB))});}catch(_){return response(503,{error:'registry_unavailable'});}
 }
 if(request.method!=='POST')return response(405,{error:'method'});
 const secret=env.REGISTRY_WRITE_TOKEN;
 if(typeof secret!=='string'||secret.length<32||secret===env.VIEW_TOKEN)return response(503,{error:'registry_write_disabled'});
 if(!await authorized(request,secret))return response(401,{error:'unauthorized'});
 if(!env.DB)return response(503,{error:'missing database binding'});
 let data;
 try{data=await readSmallJSON(request)}catch(_){return response(400,{error:'invalid_body'});}
 if(!full&&(!data||Object.keys(data).length!==1||!validSymbol(data.symbol)))return response(400,{error:'invalid_symbol'});
 if(full){try{watchInput(data)}catch(_){return response(400,{error:'invalid_input'});}}
 try{return response(200,full?await registerWatch(env.DB,data):await registerSymbol(env.DB,data.symbol));}
 catch(e){return response(e.message==='registry_limit'?409:e.message==='registry_conflict'?409:503,{error:['registry_limit','registry_conflict'].includes(e.message)?e.message:'registry_unavailable'});}
}
async function tick({store,readRegistry,fetchQuote,now=Date.now(),clock=Date.now}){
 if(!session(now).open)return {status:'closed',attempted:0};
 const state=await readRegistry();
 return collectUS({...state,store,fetchQuote,now,clock,sessionOpen:true});
}
function cachedPayload(symbols,records,now){
 const quotes={},bySymbol={};
 for(const symbol of symbols){
  const r=records[symbol],q=r?.quote;
  const received=Date.parse(q?.receivedAt||''),trade=Date.parse(q?.tradeAt||'');
  const usable=q?.symbol===symbol&&positive(q.usd)&&Number.isFinite(received)&&Number.isFinite(trade)&&
   received<=now&&now-received<=7*60000&&trade<=now&&now-trade<=45*60000;
  bySymbol[symbol]=usable?{...q,attemptAt:r.attemptAt}:{symbol,error:r?.error==='upstream_429'?'upstream_status_429':'invalid_or_outdated_trade'};
 }
 // Old browser and sync Worker can read the same envelope without changing account records.
 for(const [id,symbol] of Object.entries(LEGACY))quotes[id]=bySymbol[symbol]||{error:'invalid_or_outdated_trade'};
 return {source:'Finnhub personal use · shared scheduled cache',workerVersion:'20261127-v17-scheduled-candidate',
  fetchedAt:new Date(now).toISOString(),quotes,bySymbol,session:session(now),cachedOnly:true};
}
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Vary':'Origin, Authorization','X-Content-Type-Options':'nosniff'}});
async function authorized(request,secret){
 if(typeof secret!=='string'||secret.length<20)return false;
 const enc=new TextEncoder(),a=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(request.headers.get('Authorization')||''))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('Bearer '+secret)));
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export default {
 async scheduled(controller,env,ctx){
  // Use the actual invocation time, not an old scheduledTime after platform delay.
  const now=Date.now();
  if(!session(now).open)return;
  if(!env.DB||!env.FINNHUB_API_KEY)throw Error('missing collector bindings');
  ctx.waitUntil(tick({store:d1Store(env.DB),readRegistry:()=>registryFromDB(env.DB),fetchQuote:finnhubFetcher(env.FINNHUB_API_KEY),now}));
 },
 async fetch(request,env){
  if(request.headers.get('Origin')!==ORIGIN)return new Response(null,{status:403});
  const url=new URL(request.url);
  if(!['/quotes','/registry','/watchlist'].includes(url.pathname)||url.search)return response(404,{error:'not_found'});
  if(request.method==='OPTIONS')return response(200,{ok:true});
  if(url.pathname==='/registry'||url.pathname==='/watchlist')return registrationRoute(request,env,url.pathname==='/watchlist');
  if(request.method!=='GET')return response(405,{error:'method'});
  if(!await authorized(request,env.VIEW_TOKEN))return response(401,{error:'unauthorized'});
  if(!env.DB)return response(503,{error:'missing database binding'});
  try{
   const store=d1Store(env.DB),registry=await registryFromDB(env.DB);
   await store.init();
   const symbols=activeUS(registry.catalog,registry.holdings);
   return response(200,cachedPayload(symbols,await store.load(symbols),Date.now()));
  }catch(_){return response(503,{error:'cache_unavailable'});}
 }
};
