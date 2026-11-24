/* Private, owner-authenticated KRX daily ETF data bridge.
 * This Worker is NOT a public market data service. Never cache, log or publish prices.
 * Cloudflare secrets: KRX_AUTH_KEY, KRX_VIEW_TOKEN (minimum 20 random characters).
 * The KRX API service must be authorized for personal use. Respect KRX terms.
 */
const ORIGIN='https://pdk7101.github.io';
const KRX_ENDPOINT='https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd';
const FUNDS=[['reit','329200'],['sol','0167B0'],['robot','469070'],
 ['space','0131V0'],['sofr','455030'],['tr','278530']];
const EXTRA=[['biotech','0229F0'],['media','228810']];
const EXTRA_IDS=new Set(EXTRA.map(([id])=>id));
const CODE=new Map([...FUNDS,...EXTRA].map(([id,code])=>[code,id]));
function kst(date){
 return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(date).map(x=>[x.type,x.value]));
}
function targetDay(){
 const p=kst(new Date()),m=Number(p.hour)*60+Number(p.minute);
 const t=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');
 if(m<990)t.setUTCDate(t.getUTCDate()-1);
 while([0,6].includes(t.getUTCDay()))t.setUTCDate(t.getUTCDate()-1);
 return t;
}
const int=v=>{const n=Number(v);return Number.isInteger(n)?n:null};
const numeric=v=>{
 if(v===null||v===undefined||String(v).trim()==='')return null;
 const n=Number(String(v).replace(/,/g,''));
 return Number.isFinite(n)?n:null;
};
const pos=v=>{const n=numeric(v);return n!==null&&n>0?n:null};
const nonNeg=v=>{const n=numeric(v);return n!==null&&n>=0?n:null};
function match(day,body){
 if(!Array.isArray(body?.OutBlock_1))throw Error('KRX 응답 형식 검증 실패');
 const rows=[];
 for(const r of body.OutBlock_1){
  const code=[r.ISU_SRT_CD,r.ISU_CD,r.ISU_SHORT_CD,r.SRT_CD]
   .filter(x=>x!==null&&x!==undefined)
   .map(x=>String(x).trim().toUpperCase().replace(/^A(?=[0-9A-Z]{6}$)/,''))
   .find(x=>CODE.has(x));
  if(!code)continue;
  if(r.BAS_DD&&String(r.BAS_DD).replace(/-/g,'')!==day)continue;
  const open=pos(r.TDD_OPNPRC),high=pos(r.TDD_HGPRC),low=pos(r.TDD_LWPRC),
   close=pos(r.TDD_CLSPRC),volume=nonNeg(r.ACC_TRDVOL);
  if(!open||!high||!low||!close||high<Math.max(open,close)||low>Math.min(open,close)||low>high)continue;
  rows.push({id:CODE.get(code),code,date:day,open,high,low,close,volume,
   officialMetrics:{nav:pos(r.NAV),marketCapKRW:pos(r.MKTCAP),
    assetsKRW:pos(r.INVSTASST_NETASST_TOTAMT),
    shares:pos(r.LIST_SHRS),tradingValueKRW:nonNeg(r.ACC_TRDVAL)}});
 }
 return rows;
}
function headers(origin){
 const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
 if(origin===ORIGIN){
  h['Access-Control-Allow-Origin']=ORIGIN;
  h['Access-Control-Allow-Headers']='Authorization, Content-Type';
  h['Access-Control-Allow-Methods']='GET, OPTIONS';
  h['Access-Control-Max-Age']='600';
 }
 return h;
}
const reply=(status,body,origin)=>new Response(JSON.stringify(body),{status,headers:headers(origin)});
function tokenMatches(given,expected){
 if(typeof given!=='string'||typeof expected!=='string'||given.length!==expected.length||given.length<20)return false;
 // Fixed-work comparison does not leak the first differing character.
 let d=0;
 for(let i=0;i<given.length;i++)d|=given.charCodeAt(i)^expected.charCodeAt(i);
 return d===0;
}
async function daily(day,key){
 const response=await fetch(KRX_ENDPOINT+'?basDd='+day,{
  headers:{AUTH_KEY:key,Accept:'application/json'},
  signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('KRX HTTP '+response.status);
 return match(day,await response.json());
}
// Separate stock-market services may require their own KRX approval.
const STOCKS=[['hongah','003280','stk_bydd_trd'],['sensor','321370','ksq_bydd_trd']];
async function stockClose(id,code,service,days,key){
 for(const day of days){
  try{
   const r=await fetch('https://data-dbg.krx.co.kr/svc/apis/sto/'+service+'?basDd='+day,{
    headers:{AUTH_KEY:key,Accept:'application/json'},signal:AbortSignal.timeout(5000)
   });
   if(!r.ok)return {id,error:'KRX HTTP '+r.status+' · 주식 API 승인 또는 호출 상태 확인'};
   const data=await r.json();
   if(!Array.isArray(data?.OutBlock_1))return {id,error:'주식 API 응답 형식 또는 승인 확인'};
   const row=data.OutBlock_1.find(x=>
    [x.ISU_SRT_CD,x.ISU_CD,x.ISU_SHORT_CD,x.SRT_CD].some(v=>String(v??'').trim().replace(/^A(?=\\d{6}$)/,'')===code)&&
    (!x.BAS_DD||String(x.BAS_DD).replace(/-/g,'')===day));
   const close=pos(row?.TDD_CLSPRC);
   if(close)return {id,code,date:day,close};
  }catch(_){return {id,error:'주식 API 연결 또는 응답 확인 실패'};}
 }
 return {id,error:'최근 공식 종가 미확인'};
}
async function pageRows(page,key){
 const end=targetDay(),start=new Date(end);
 start.setUTCDate(start.getUTCDate()-(page*20));
 const dates=[];
 for(let i=0;i<20;i++){
  const d=new Date(start);d.setUTCDate(d.getUTCDate()-i);
  if([0,6].includes(d.getUTCDay()))continue;
  dates.push(d.toISOString().slice(0,10).replace(/-/g,''));
 }
 // Limit parallel KRX calls to avoid bursts.
 const rows=[],errs=[];let cursor=0;
 const jobs=Array.from({length:3},async()=>{
  while(cursor<dates.length){
   const day=dates[cursor++];
   try{rows.push(...await daily(day,key));}
   catch(err){errs.push({day,reason:/^KRX HTTP (401|403|429)$/.test(String(err.message))?
    String(err.message):'KRX 자료 확인 실패'});}
  }
 });
 await Promise.all(jobs);
 return {rows:rows.sort((a,b)=>a.date.localeCompare(b.date)),errors:errs,
  latestExpected:targetDay().toISOString().slice(0,10).replace(/-/g,'')};
}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  if(origin!==ORIGIN)return reply(403,{error:'허용되지 않은 접근 경로'},origin);
  const u=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
  if(request.method!=='GET'||u.pathname!=='/api/krx-history')
   return reply(404,{error:'지원하지 않는 요청'},origin);
  const expected=String(env.KRX_VIEW_TOKEN||'');
  const given=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!tokenMatches(given,expected))return reply(401,{error:'개인 접근 토큰 확인 실패'},origin);
  if(!env.KRX_AUTH_KEY)return reply(503,{error:'KRX 인증키 Worker Secret 미설정'},origin);
  const page=int(u.searchParams.get('page'));
  if(page===null||page<0||page>4)return reply(400,{error:'조회 범위 오류'},origin);
  try{
   const result=await pageRows(page,String(env.KRX_AUTH_KEY));
   if(result.errors.some(x=>/KRX HTTP (401|403|429)/.test(x.reason)))
    return reply(502,{error:'KRX 인증·이용 승인 또는 API 호출 제한 확인 필요'},origin);
   if(result.errors.length)return reply(502,{error:'KRX 일별 자료 일부 수집 실패 · 해당 페이지 보류'},origin);
   const days=[...new Set([result.latestExpected,result.rows.at(-1)?.date].filter(Boolean))];
   const stocks=page===0?await Promise.all(STOCKS.map(([id,code,service])=>stockClose(id,code,service,days,String(env.KRX_AUTH_KEY)))):[];
   const extras=page===0?result.rows.filter(x=>EXTRA_IDS.has(x.id)).map(({id,code,date,close})=>({id,code,date,close})):[];
   return reply(200,{ok:true,source:'한국거래소(KRX) ETF 일별매매정보',
    page,latestExpected:result.latestExpected,rows:result.rows.filter(x=>!EXTRA_IDS.has(x.id)),
    extraQuotes:[...extras,...stocks.filter(x=>!x.error)],extraErrors:stocks.filter(x=>x.error)},origin);
  }catch(_){
   return reply(502,{error:'KRX 공식 자료 조회 실패'},origin);
  }
 }
};
