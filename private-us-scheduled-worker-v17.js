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
// Private account records are isolated from market-data credentials and legacy sync.
const basisKeys=['avgKRW','netDistributionsKRW','qty'];
function eligibleBasis(registry,id){
 return typeof id==='string'&&Object.hasOwn(registry.holdings,id)&&!Object.hasOwn(seedRegistry().holdings,id)&&registry.holdings[id].archived===false;
}
function checkedBasis(registry,id,data){
 if(!eligibleBasis(registry,id)||!data||Object.keys(data).sort().join(',')!==basisKeys.join(','))throw Error('invalid_basis');
 const i=registry.catalog[registry.holdings[id].instrumentId],{qty,avgKRW,netDistributionsKRW}=data;
 const bounded=(v,lower)=>typeof v==='number'&&Number.isFinite(v)&&v>=lower&&v<=1e12;
 if(qty!==null&&(!bounded(qty,0)||i.market==='KR'&&!Number.isSafeInteger(qty))||avgKRW!==null&&(!bounded(avgKRW,0)||avgKRW===0)||netDistributionsKRW!==null&&!bounded(netDistributionsKRW,0)||qty!==null&&avgKRW!==null&&qty*avgKRW>1e15)throw Error('invalid_basis');
 return {qty,avgKRW,netDistributionsKRW};
}
async function basisInit(db){await db.prepare('CREATE TABLE IF NOT EXISTS new_position_basis_v17 (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();}
async function basisList(db,registry){
 const records={};
 for(const row of (await db.prepare('SELECT id,revision,payload,updated_at FROM new_position_basis_v17').all()).results||[]){
  if(!eligibleBasis(registry,row.id))continue;
  if(!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('invalid_revision');
  records[row.id]={revision:row.revision,data:checkedBasis(registry,row.id,JSON.parse(row.payload)),updatedAt:row.updated_at};
 }
 return {schema:'new-position-basis-v17',records};
}
async function saveBasis(db,registry,input){
 if(!input||Object.keys(input).sort().join(',')!=='data,id,revision'||!Number.isSafeInteger(input.revision)||input.revision<0||input.revision>=Number.MAX_SAFE_INTEGER)throw Error('invalid_basis');
 const {id,revision}=input,data=checkedBasis(registry,id,input.data),payload=JSON.stringify(data),updatedAt=new Date().toISOString();
 const result=revision===0
  ?await db.prepare('INSERT OR IGNORE INTO new_position_basis_v17(id,revision,payload,updated_at) VALUES(?,1,?,?)').bind(id,payload,updatedAt).run()
  :await db.prepare('UPDATE new_position_basis_v17 SET revision=revision+1,payload=?,updated_at=? WHERE id=? AND revision=?').bind(payload,updatedAt,id,revision).run();
 if(result.meta.changes!==1)throw Error('basis_conflict');
 return {id,revision:revision+1,data,updatedAt};
}
async function basisRoute(request,env){
 if(!['GET','POST'].includes(request.method))return response(405,{error:'method'});
 const secret=env.POSITION_RECORD_TOKEN;
 if(typeof secret!=='string'||secret.length<32||[env.VIEW_TOKEN,env.REGISTRY_WRITE_TOKEN,env.FINNHUB_API_KEY].includes(secret))return response(503,{error:'basis_disabled'});
 if(!await authorized(request,secret))return response(401,{error:'unauthorized'});
 if(!env.DB)return response(503,{error:'missing database binding'});
 try{
  const registry=await registryFromDB(env.DB);await basisInit(env.DB);
  if(request.method==='GET')return response(200,await basisList(env.DB,registry));
  let input;try{input=await readSmallJSON(request)}catch(_){return response(400,{error:'invalid_body'});}
  return response(200,await saveBasis(env.DB,registry,input));
 }catch(e){return response(e.message==='basis_conflict'?409:e.message==='invalid_basis'?400:503,{error:['basis_conflict','invalid_basis'].includes(e.message)?e.message:'basis_unavailable'});}
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
// Private dynamic daily history. Disabled unless the operator confirms permitted
// automated personal use of the existing Yahoo chart source. No paid API calls.
function dailyContext(now){
 const p=ET.formatToParts(new Date(now)),x=Object.fromEntries(p.map(v=>[v.type,v.value]));
 const day=new Date(x.year+'-'+x.month+'-'+x.day+'T12:00:00Z'),minute=Number(x.hour)*60+Number(x.minute);
 const current=session(now);
 if(!['2026','2027','2028'].includes(x.year))return null;
 if(!current.trading||minute<current.close+30)day.setUTCDate(day.getUTCDate()-1);
 for(let n=0;n<10;n++,day.setUTCDate(day.getUTCDate()-1)){
  const s=day.toISOString().slice(0,10).replaceAll('-','');
  if(!['2026','2027','2028'].includes(s.slice(0,4)))return null;
  if(![0,6].includes(day.getUTCDay())&&!HOLIDAYS.has(s))return s;
 }
 return null;
}
function dailyTradingDate(s){
 if(typeof s!=='string'||!/^\d{8}$/.test(s)||!['2026','2027','2028'].includes(s.slice(0,4)))return false;
 const d=new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10).replaceAll('-','')===s&&![0,6].includes(d.getUTCDay())&&!HOLIDAYS.has(s);
}
function analyzeDaily(symbol,raw,expected){
 if(!validSymbol(symbol)||!dailyTradingDate(expected)||!Array.isArray(raw))throw Error('daily_input');
 const rows=new Map(),conflict=new Set();
 for(const b of raw){
  if(!dailyTradingDate(b?.date)||b.date>expected||symbol==='SPCX'&&b.date<'20260612'||![b.open,b.high,b.low,b.close].every(positive)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))continue;
  const row={date:b.date,open:b.open,high:b.high,low:b.low,close:b.close};
  if(rows.has(b.date)&&JSON.stringify(rows.get(b.date))!==JSON.stringify(row))conflict.add(b.date);
  rows.set(b.date,row);
 }
 for(const d of conflict)rows.delete(d);
 const bars=[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-40);
 const last=bars.at(-1);
 if(!last)return null;
 const d=new Date(last.date.slice(0,4)+'-'+last.date.slice(4,6)+'-'+last.date.slice(6,8)+'T12:00:00Z');
 let consecutive=true;
 for(let i=bars.length-1;i>=0;i--){
  while(!dailyTradingDate(d.toISOString().slice(0,10).replaceAll('-',''))){if(d.getUTCFullYear()<2026){consecutive=false;break;}d.setUTCDate(d.getUTCDate()-1);}
  if(!consecutive||bars[i].date!==d.toISOString().slice(0,10).replaceAll('-','')){consecutive=false;break;}
  d.setUTCDate(d.getUTCDate()-1);
 }
 const complete=bars.length===40&&consecutive&&last.date===expected;
 const avg=n=>bars.slice(-n).reduce((a,b)=>a+b.close,0)/n;
 return {symbol,date:last.date,close:last.close,expectedDate:expected,barCount:bars.length,
  status:last.date!==expected?'stale':complete?'ready':'history_incomplete',currency:'USD',
  source:'Yahoo Finance 비공식 일봉',ma5:complete?avg(5):null,ma20:complete?avg(20):null,
  low20:complete?Math.min(...bars.slice(-20).map(b=>b.low)):null,high20:complete?Math.max(...bars.slice(-20).map(b=>b.high)):null,signal:'wait'};
}
function yahooDaily(fetchImpl=fetch){
 return async symbol=>{
  if(!validSymbol(symbol))throw Error('daily_symbol');
  const url='https://query2.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=6mo&interval=1d';
  const r=await fetchImpl(url,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!r.ok)return {status:r.status};
  const v=(await r.json())?.chart?.result?.[0],q=v?.indicators?.quote?.[0];
  if(v?.meta?.symbol!==symbol||v?.meta?.currency!=='USD'||!q||!Array.isArray(v.timestamp))throw Error('daily_identity');
  const rows=v.timestamp.map((t,i)=>{const p=Object.fromEntries(ET.formatToParts(new Date(t*1000)).map(x=>[x.type,x.value]));return {date:p.year+p.month+p.day,open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i]};});
  return {status:200,rows};
 };
}
function dailyStore(db){
 return {
  async init(){
   await db.prepare('CREATE TABLE IF NOT EXISTS us_daily_v17(symbol TEXT PRIMARY KEY, expected TEXT NOT NULL, attempts INTEGER NOT NULL, attempted_at INTEGER NOT NULL, payload TEXT, error TEXT)').run();
   await db.prepare('CREATE TABLE IF NOT EXISTS us_daily_gate_v17(id INTEGER PRIMARY KEY CHECK(id=1), next_at INTEGER NOT NULL)').run();
  },
  async claim(now){const r=await db.prepare('INSERT INTO us_daily_gate_v17(id,next_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at WHERE us_daily_gate_v17.next_at<=?').bind(now+180000,now).run();return r.meta.changes===1;},
  async defer(until){await db.prepare('UPDATE us_daily_gate_v17 SET next_at=MAX(next_at,?) WHERE id=1').bind(until).run();},
  async load(){const out={};for(const r of (await db.prepare('SELECT * FROM us_daily_v17').all()).results||[]){let q=null;try{q=JSON.parse(r.payload||'null')}catch(_){}out[r.symbol]={...r,q};}return out;},
  async reserve(symbol,expected,now){
   const r=await db.prepare('INSERT INTO us_daily_v17(symbol,expected,attempts,attempted_at) VALUES(?,?,1,?) ON CONFLICT(symbol) DO UPDATE SET expected=excluded.expected,attempts=CASE WHEN us_daily_v17.expected=excluded.expected THEN us_daily_v17.attempts+1 ELSE 1 END,attempted_at=excluded.attempted_at WHERE us_daily_v17.expected<excluded.expected OR (us_daily_v17.expected=excluded.expected AND us_daily_v17.attempts<2 AND us_daily_v17.attempted_at<=?)').bind(symbol,expected,now,now-30*60000).run();
   return r.meta.changes===1;
  },
  async save(symbol,expected,now,quote,error){await db.prepare('UPDATE us_daily_v17 SET payload=COALESCE(?,payload),error=? WHERE symbol=? AND expected=? AND attempted_at=?').bind(quote?JSON.stringify(quote):null,error,symbol,expected,now).run();}
 };
}
async function collectDaily({symbols,store,fetchDaily,now=Date.now()}){
 const expected=dailyContext(now);
 if(!expected||session(now).open)return {attempted:0,status:'closed-or-unknown'};
 await store.init();
 const records=await store.load();
 const batch=symbols.filter(s=>validSymbol(s)&&!(records[s]?.q?.date===expected&&records[s].q.status==='ready')&&
  (records[s]?.expected!==expected||records[s].attempts<2&&now-records[s].attempted_at>=30*60000))
  .sort((a,b)=>(records[a]?.attempted_at||0)-(records[b]?.attempted_at||0)||a.localeCompare(b)).slice(0,3);
 if(!batch.length||!await store.claim(now))return {attempted:0,status:'cached-or-limited'};
 let attempted=0;
 for(const symbol of batch){
  if(!await store.reserve(symbol,expected,now))continue;
  attempted++;
  let result;try{result=await fetchDaily(symbol)}catch(_){result={status:0};}
  let q=null;try{if(result.status===200)q=analyzeDaily(symbol,result.rows,expected);}catch(_){}
  const old=records[symbol]?.q;
  const usable=q&&(!old||q.date>=old.date)?q:null;
  await store.save(symbol,expected,now,usable,result.status===429?'rate_limited':q?null:'unavailable');
  if(result.status===429){await store.defer(now+30*60000);break;}
 }
 return {attempted,status:'collected'};
}
function dailyPayload(symbols,records,now){
 const expectedDate=dailyContext(now),bySymbol={};
 for(const symbol of symbols){
  const q=records[symbol]?.q;
  if(!q||q.symbol!==symbol||!positive(q.close)||!dailyTradingDate(q.date)||!expectedDate||q.date>expectedDate){bySymbol[symbol]={symbol,status:'unavailable',signal:'wait'};continue;}
  const status=q.date===expectedDate?q.status:'stale';
  bySymbol[symbol]={...q,expectedDate,status,signal:'wait',...(status!=='ready'?{ma5:null,ma20:null,low20:null,high20:null}:{})};
 }
 return {schema:'us-private-daily-v17',expectedDate,bySymbol,cachedOnly:true};
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
// Isolated deployment check: available only on the dedicated v17 Worker.
const TEST_ORIGIN='https://jungho-v17.pdk7101.workers.dev';
const TEST_HTML=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>v17 서버 연결 점검</title><style>body{font-family:system-ui,sans-serif;background:#0e1627;color:#eaf0fb;margin:0}main{max-width:600px;margin:auto;padding:20px}section{border:1px solid #35435a;border-radius:12px;padding:16px;background:#19253a}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;min-height:44px;margin:8px 0 16px;padding:10px;border-radius:8px}input{background:#101b2e;color:white;border:1px solid #596a85}button{background:#2563eb;color:white;border:0;font-weight:bold}button:disabled{opacity:.5}p,li{line-height:1.6;overflow-wrap:anywhere}</style></head><body><main><h1>v17 서버 연결 점검</h1><p>개발 서버 전용. 실제 투자기록 및 시세 공급원을 변경하지 않습니다.</p><section><form id="check" autocomplete="off"><label>조회용 암호 (VIEW_TOKEN)<input id="view" type="password" required minlength="20" autocomplete="off"></label><label>투자기록용 암호 (POSITION_RECORD_TOKEN, 선택)<input id="position" type="password" minlength="32" autocomplete="off"></label><button id="run" type="submit">연결 테스트</button></form><ul id="results" aria-live="polite"></ul><p id="status" role="status">암호를 입력하고 연결 테스트를 누르세요.</p></section><p>암호는 저장하거나 화면에 출력하지 않습니다. 성공 결과만 캡처하세요. 시세 수집이 시작되지 않았으면 가격 0건은 정상입니다.</p><script src="/connection-test.js" defer></script></main></body></html>`;
const TEST_JS=`'use strict';
const $=id=>document.getElementById(id);
$('check').addEventListener('submit',async e=>{
 e.preventDefault();if($('run').disabled)return;
 const view=$('view').value,position=$('position').value;
 $('view').value='';$('position').value='';$('run').disabled=true;$('results').replaceChildren();$('status').textContent='확인 중';
 let success=0,attempted=0;
 async function check(path,token,validate){
  attempted++;const item=document.createElement('li');$('results').append(item);
  try{
   const r=await fetch(path,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!r.ok){item.textContent=path+' · HTTP '+r.status+' · 연결 실패';return;}
   const detail=validate(await r.json());if(detail===null){item.textContent=path+' · 응답 형식 오류';return;}
   success++;item.textContent=path+' · 200 연결 성공 · '+detail;
  }catch(_){item.textContent=path+' · 통신 또는 응답 오류';}
 }
 try{
  await check('/watchlist',view,p=>p?.schema==='watchlist-v17'&&p.catalog&&p.holdings?'고유 종목 '+Object.keys(p.catalog).length+'개 / 계좌별 '+Object.keys(p.holdings).length+'건':null);
  await check('/quotes',view,p=>p?.cachedOnly===true&&p.bySymbol?'수집 대상 '+Object.keys(p.bySymbol).length+'개 / 유효 시세 '+Object.values(p.bySymbol).filter(q=>typeof q.usd==='number'&&q.usd>0).length+'건':null);
  if(position)await check('/position-records',position,p=>p?.schema==='new-position-basis-v17'&&p.records?'신규 투자기록 '+Object.keys(p.records).length+'건':null);
  $('status').textContent=success===attempted?'연결 점검 통과 ('+success+'/'+attempted+') · 실제 장중 수집 및 저장 테스트는 별도':'연결 점검 '+success+'/'+attempted+' · 실패 항목 확인 필요';
 }finally{$('run').disabled=false;}
});`;
function testAsset(url,request){
 if(url.origin!==TEST_ORIGIN||url.search||request.method!=='GET')return null;
 if(!['/connection-test','/connection-test.js'].includes(url.pathname))return null;
 const js=url.pathname.endsWith('.js');
 return new Response(js?TEST_JS:TEST_HTML,{headers:{'Content-Type':js?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",'X-Robots-Tag':'noindex, nofollow'}});
}
function sameOriginTestRead(request,url){
 return url.origin===TEST_ORIGIN&&request.method==='GET'&&!url.search&&['/watchlist','/quotes','/position-records'].includes(url.pathname)&&request.headers.get('Sec-Fetch-Site')==='same-origin'&&(!request.headers.get('Origin')||request.headers.get('Origin')===TEST_ORIGIN);
}
export default {
 async scheduled(controller,env,ctx){
  // Use the actual invocation time, not an old scheduledTime after platform delay.
  const now=Date.now();
  if(!session(now).open){
   if(env.US_DAILY_AUTHORIZED==='true'&&env.DB)ctx.waitUntil((async()=>{const state=await registryFromDB(env.DB);return collectDaily({symbols:activeUS(state.catalog,state.holdings),store:dailyStore(env.DB),fetchDaily:yahooDaily(),now});})());
   return;
  }
  if(!env.DB||!env.FINNHUB_API_KEY)throw Error('missing collector bindings');
  ctx.waitUntil(tick({store:d1Store(env.DB),readRegistry:()=>registryFromDB(env.DB),fetchQuote:finnhubFetcher(env.FINNHUB_API_KEY),now}));
 },
 async fetch(request,env){
  const url=new URL(request.url);
  const asset=testAsset(url,request);if(asset)return asset;
  if(request.headers.get('Origin')!==ORIGIN&&!sameOriginTestRead(request,url))return new Response(null,{status:403});
  if(!['/quotes','/registry','/watchlist','/daily','/position-records'].includes(url.pathname)||url.search)return response(404,{error:'not_found'});
  if(request.method==='OPTIONS')return response(200,{ok:true});
  if(url.pathname==='/position-records')return basisRoute(request,env);
  if(url.pathname==='/registry'||url.pathname==='/watchlist')return registrationRoute(request,env,url.pathname==='/watchlist');
  if(request.method!=='GET')return response(405,{error:'method'});
  if(!await authorized(request,env.VIEW_TOKEN))return response(401,{error:'unauthorized'});
  if(!env.DB)return response(503,{error:'missing database binding'});
  try{
   const registry=await registryFromDB(env.DB);
   if(url.pathname==='/daily'){
    if(env.US_DAILY_AUTHORIZED!=='true')return response(503,{error:'daily_source_not_authorized'});
    const daily=dailyStore(env.DB);await daily.init();
    return response(200,dailyPayload(activeUS(registry.catalog,registry.holdings),await daily.load(),Date.now()));
   }
   const store=d1Store(env.DB);
   await store.init();
   const symbols=activeUS(registry.catalog,registry.holdings);
   return response(200,cachedPayload(symbols,await store.load(symbols),Date.now()));
  }catch(_){return response(503,{error:'cache_unavailable'});}
 }
};
