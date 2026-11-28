// Pure quote-only adapter. No authentication, network, account mutation or orders.
// Official reference: https://developers.tossinvest.com/docs/market-data
// Same KR symbol is quoted once across Toss and Kiwoom; account cost basis stays separate.
const code=v=>typeof v==='string'&&/^[0-9A-Z]{6}$/.test(v);
export function planTossKR(catalog,holdings){
 const map=new Map();
 for(const h of Object.values(holdings)){
  if(h.archived)continue;
  const i=catalog[h.instrumentId];
  if(!i)throw Error('missing instrument');
  if(i.market!=='KR')continue;
  if(!code(i.symbol))throw Error('invalid KR symbol');
  if(!map.has(i.symbol))map.set(i.symbol,new Set());
  map.get(i.symbol).add(i.id);
 }
 const symbols=[...map.keys()].sort();
 if(symbols.length>100)throw Error('registry limit');
 return {symbols,bySymbol:Object.fromEntries(symbols.map(s=>[s,[...map.get(s)].sort()])),
  currentPath:symbols.length?'/api/v1/prices?'+new URLSearchParams({symbols:symbols.join(',')}):null,
  dailyPaths:symbols.map(s=>({symbol:s,path:'/api/v1/candles?'+new URLSearchParams({symbol:s,interval:'1d',count:'2',adjusted:'false'})}))};
}
const positive=s=>typeof s==='string'&&/^\d+(?:\.\d+)?$/.test(s)&&Number.isFinite(Number(s))&&Number(s)>0?Number(s):null;
const tradeTime=s=>typeof s==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s))?Date.parse(s):NaN;
const kst=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(ms);
const candidateFlags={officialConfirmed:false,regularSessionConfirmed:false,signalEligible:false};
export function parseTossKRCurrent(payload,plan,now=Date.now()){
 if(!Array.isArray(payload?.result))throw Error('prices schema');
 const wanted=new Set(plan.symbols),seen=new Set(),bySymbol=Object.create(null);
 for(const r of payload.result){
  if(!wanted.has(r?.symbol))continue;
  const s=r.symbol,t=tradeTime(r.timestamp),price=positive(r.lastPrice);
  if(seen.has(s)){bySymbol[s]={error:'duplicate'};continue;}seen.add(s);
  bySymbol[s]=r.currency==='KRW'&&price!==null&&Number.isFinite(t)&&t<=now&&kst(t)===kst(now)?
   {symbol:s,price,tradeAt:new Date(t).toISOString(),date:kst(t),currency:'KRW',source:'Toss current quote candidate',...candidateFlags}:
   {error:'invalid_or_stale'};
 }
 for(const s of wanted)if(!Object.hasOwn(bySymbol,s))bySymbol[s]={error:'missing'};
 return bySymbol;
}
export function parseTossKRDaily(payload,symbol,expectedDate,now=Date.now()){
 if(!code(symbol)||!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)||expectedDate>kst(now)||!Array.isArray(payload?.result?.candles))throw Error('daily schema');
 const matches=payload.result.candles.filter(r=>{const t=tradeTime(r?.timestamp);return Number.isFinite(t)&&t<=now&&kst(t)===expectedDate});
 if(matches.length!==1)return {symbol,error:matches.length?'duplicate':'missing_expected_date'};
 const r=matches[0],open=positive(r.openPrice),high=positive(r.highPrice),low=positive(r.lowPrice),close=positive(r.closePrice);
 if(r.currency!=='KRW'||[open,high,low,close].some(x=>x===null)||high<Math.max(open,close)||low>Math.min(open,close)||high<low)return {symbol,error:'invalid_ohlc'};
 // REST candle documentation does not establish KRX-only regular-session finality.
 // A dated raw candle is not an official close. Require real broker/KRX comparison separately.
 return {symbol,date:expectedDate,open,high,low,close,currency:'KRW',source:'Toss unadjusted daily candidate',...candidateFlags};
}
