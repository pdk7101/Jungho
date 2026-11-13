/*
 * Personal-use Cloudflare Worker for Finnhub's US quote API.
 *
 * This code is public; YOUR secrets MUST NOT be pasted into this file or GitHub.
 * Deploy as a separate Worker, then set Worker Secrets:
 *   FINNHUB_API_KEY = personal non-professional Finnhub API key
 *   VIEW_TOKEN      = private, long, random browser-to-Worker access token
 *
 * Finnhub's personal plan prohibits redistribution. Never share the Worker URL
 * with VIEW_TOKEN, expose a publicly accessible price feed, or resell prices.
 * No Toss Open API credentials are used. No trading/account endpoints exist.
 */
const ALLOWED_ORIGIN='https://pdk7101.github.io';
const SYMBOLS=Object.freeze({schd:'SCHD',agnc:'AGNC',spym:'SPYM',cony:'CONY'});
const REFRESH_MS=120_000;
let cached=null,loadedAt=0,inFlight=null;

function reply(body,status,origin){
 return new Response(JSON.stringify(body),{
  status,
  headers:{
   'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'private, no-store, max-age=0',
   'X-Content-Type-Options':'nosniff',
   'Vary':'Origin, Authorization',
   ...(origin===ALLOWED_ORIGIN?{
     'Access-Control-Allow-Origin':ALLOWED_ORIGIN,
     'Access-Control-Allow-Methods':'GET, OPTIONS',
     'Access-Control-Allow-Headers':'Authorization, Content-Type',
     'Access-Control-Max-Age':'120'}:{})
  }
 });
}
function safeEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
 let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
 return mismatch===0;
}
async function collect(env){
 const now=Date.now();
 const entries=await Promise.all(Object.entries(SYMBOLS).map(async ([id,symbol])=>{
  try{
   const u=new URL('https://finnhub.io/api/v1/quote');
   u.searchParams.set('symbol',symbol);
   const response=await fetch(u,{headers:{
    'X-Finnhub-Token':env.FINNHUB_API_KEY,
    'Accept':'application/json'
   },redirect:'manual',signal:AbortSignal.timeout(8000)});
   // Cloudflare Workers does not support redirect:'error'; it throws TypeError before fetching.
   // Manual handling blocks unexpected redirects without forwarding the API secret to another host.
   if(response.status>=300&&response.status<400)return [id,{error:'upstream_redirect_blocked'}];
   if(!response.ok)return [id,{error:'upstream_status_'+response.status}];
   const body=await response.json(),usd=Number(body?.c),ts=Number(body?.t);
   const tradeAtMs=ts*1000;
   if(!Number.isFinite(usd)||usd<=0||!Number.isFinite(ts)||
      tradeAtMs<=0||tradeAtMs>now+60000||tradeAtMs<now-5*86400000)
     return [id,{error:'invalid_or_outdated_trade'}];
   return [id,{usd,tradeAt:new Date(tradeAtMs).toISOString(),
    prevClose:Number.isFinite(Number(body?.pc))&&Number(body.pc)>0?Number(body.pc):null,
    symbol,source:'Finnhub US trade snapshot'}];
  }catch(_){return [id,{error:'upstream_unavailable'}];}
 }));
 return {source:'Finnhub personal use · exchange coverage and timestamps may vary',
  fetchedAt:new Date().toISOString(),quotes:Object.fromEntries(entries)};
}

export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(origin!==ALLOWED_ORIGIN)return reply({error:'origin_not_allowed'},403,null);
  if(request.method==='OPTIONS')return reply({ok:true},200,origin);
  if(request.method!=='GET'||url.pathname!=='/quotes')
    return reply({error:'not_found'},404,origin);
  if(!env.FINNHUB_API_KEY||!env.VIEW_TOKEN||env.VIEW_TOKEN.length<20)
    return reply({error:'server_secrets_not_configured'},503,origin);
  if(!safeEqual(request.headers.get('Authorization')||'','Bearer '+env.VIEW_TOKEN))
    return reply({error:'unauthorized'},401,origin);
  if(!cached||Date.now()-loadedAt>REFRESH_MS){
   if(!inFlight)inFlight=collect(env).then(r=>{cached=r;loadedAt=Date.now();return r;})
    .finally(()=>{inFlight=null;});
   await inFlight;
  }
  return reply(cached,200,origin);
 }
};
