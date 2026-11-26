// Isolated v17 collector. Not yet wired to live routes or cron.
// All prices and attempts are private. Existing portfolio keys are untouched.
export const BATCH=10, INTERVAL=60000, FRESH=5*60000;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const validSymbol=s=>typeof s==='string'&&/^[A-Z][A-Z0-9.\-]{0,14}$/.test(s);
export function activeUS(catalog,holdings){
 const symbols=new Set();
 for(const h of Object.values(holdings||{})){
  if(h.archived)continue;
  const i=catalog?.[h.instrumentId];
  if(i?.market==='US'&&i.venue==='US'&&validSymbol(i.symbol))symbols.add(i.symbol);
 }
 if(symbols.size>100)throw Error('catalog limit');
 return [...symbols].sort();
}
export function selectBatch(symbols,records,now){
 return [...new Set(symbols)].filter(validSymbol)
  .filter(s=>!records[s]||now-Number(records[s].attemptAt||0)>=FRESH)
  .sort((a,b)=>Number(records[a]?.attemptAt||0)-Number(records[b]?.attemptAt||0)||a.localeCompare(b))
  .slice(0,BATCH);
}
export function normalize(symbol,body,now){
 const usd=body?.c,t=body?.t,tradeAt=t*1000;
 if(!validSymbol(symbol)||!positive(usd)||!positive(t)||!Number.isFinite(tradeAt)||
  tradeAt>now+60000||tradeAt<now-5*86400000)return null;
 return {symbol,usd,tradeAt:new Date(tradeAt).toISOString(),receivedAt:new Date(now).toISOString(),source:'Finnhub personal quote'};
}
// A single D1 row atomically reserves a minute across devices/isolate instances.
// Reservation occurs BEFORE upstream calls; unsuccessful attempts also consume budget.
export function d1Store(db){
 return {
  async init(){
   await db.prepare('CREATE TABLE IF NOT EXISTS us_collect_gate_v17 (id INTEGER PRIMARY KEY CHECK(id=1), next_at INTEGER NOT NULL)').run();
   await db.prepare('CREATE TABLE IF NOT EXISTS us_collect_quotes_v17 (symbol TEXT PRIMARY KEY, attempt_at INTEGER NOT NULL, payload TEXT, error TEXT)').run();
  },
  async claim(now){
   const r=await db.prepare('INSERT INTO us_collect_gate_v17(id,next_at) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at WHERE us_collect_gate_v17.next_at<=?').bind(now+INTERVAL,now).run();
   return r.meta.changes===1;
  },
  async backoff(until){
   await db.prepare('UPDATE us_collect_gate_v17 SET next_at=max(next_at,?) WHERE id=1').bind(until).run();
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
export async function collectUS({catalog,holdings,store,fetchQuote,now=Date.now(),sessionOpen=false}){
 const symbols=activeUS(catalog,holdings);
 if(!sessionOpen||!symbols.length)return {status:'closed-or-empty',attempted:0};
 await store.init();
 const records=await store.load(symbols);
 const batch=selectBatch(symbols,records,now);
 if(!batch.length)return {status:'cached',attempted:0};
 if(!await store.claim(now))return {status:'rate-limited-locally',attempted:0};
 let attempted=0,succeeded=0;
 // Sequential (not a burst), max 10 calls per reserved minute.
 for(const symbol of batch){
  attempted++;
  let result;try{result=await fetchQuote(symbol)}catch(_){result={status:0}}
  const q=result?.status===200?normalize(symbol,result.body,now):null;
  const old=records[symbol]?.quote;
  const newer=q&&(!old||Date.parse(q.tradeAt)>=Date.parse(old.tradeAt))?q:null;
  await store.save(symbol,now,newer,result?.status===429?'upstream_429':newer?null:'unavailable-or-older');
  if(newer)succeeded++;
  if(result?.status===429){
   await store.backoff(now+2*INTERVAL);
   return {status:'provider-rate-limit',attempted,succeeded};
  }
 }
 return {status:'collected',attempted,succeeded};
}
export function finnhubFetcher(key,fetchImpl=fetch){
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
