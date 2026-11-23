/* Only KRX-certified ETF daily metrics are published.
 * One source of truth: officialMetrics embedded in quotes.json. */
import fs from 'node:fs/promises';
const funds=[['reit','329200'],['robot','469070'],['space','0131V0'],['sofr','455030'],['tr','278530'],['sol','0167B0']];
const output=new URL('../metrics.json',import.meta.url);
const historyPath=new URL('../data/metric-history.json',import.meta.url);
const quotes=JSON.parse(await fs.readFile(new URL('../quotes.json',import.meta.url),'utf8'));
const num=x=>x===null||x===undefined||String(x).trim()===''?null:
 Number.isFinite(Number(String(x).replaceAll(',','')))?Number(String(x).replaceAll(',','')):null;
const pos=x=>{const n=num(x);return n!==null&&n>0?n:null};
const rate=(list,days,prop)=>{
 const r=list.filter(x=>/^\d{8}$/.test(String(x?.date))&&pos(x[prop])!==null)
 .sort((a,b)=>a.date.localeCompare(b.date));
 if(r.length<days+1)return {value:null,count:r.length,needed:days+1};
 return {value:(r.at(-1)[prop]/r.at(-1-days)[prop]-1)*100,
 count:r.length,needed:days+1,from:r.at(-1-days).date,to:r.at(-1).date};
};
let hist={version:1,source:'KRX OPEN API',byId:{}};
try{const prior=JSON.parse(await fs.readFile(historyPath,'utf8'));
 if(prior?.version===1&&prior.source==='KRX OPEN API'&&prior.byId)hist=prior;
}catch(_){}
const data={fetchedAt:quotes.fetchedAt||null,observationDate:null,
 source:'KRX OPEN API · ETF 일별매매정보 (공식)',sourceUrl:quotes.sourceUrl||null,
 status:'unavailable',count:0,items:[],
 notes:'KRX가 확정하여 공개한 일봉·NAV·시가총액·순자산총액·상장좌수만 표시합니다. 거래일이 다르거나 공식 수치가 확인되지 않으면 보류합니다.'};
let saved=0;
for(const [id,code] of funds){
 const q=quotes.items?.find(x=>x.id===id),m=q?.officialMetrics;
 const item={id,code,date:q?.date||null,observedAt:quotes.fetchedAt||null,ok:false,
   reason:'KRX 확정 일봉 또는 공식 ETF 지표 미확인',sourceUrl:data.sourceUrl};
 if(quotes.officialConfirmed===true&&q?.ok&&m&&pos(m.marketCapKRW)&&pos(m.nav)){
  const cap=pos(m.marketCapKRW),nav=pos(m.nav),shares=pos(m.shares),
  assets=pos(m.assetsKRW),volume=num(m.tradingValueKRW),divergence=(q.close/nav-1)*100;
  Object.assign(item,{ok:true,marketCap100m:cap/1e8,marketCapKRW:cap,
   marketPrice:q.close,nav,divergencePct:divergence,
   impliedShares:shares,estimatedAUMKRW:assets,volume:q.bars?.at(-1)?.volume??null,
   tradingValueKRW:volume,
   comparisonNote:'KRX 동일 기준일 '+q.date+' 공식 확정 종가와 NAV',
   historyNote:'KRX 공식 기준일별 기록',
   historyEligible:true,priceTimeVerified:true});
  const prior=Array.isArray(hist.byId[id])?hist.byId[id]:[];
  const rec={date:q.date,marketCapKRW:cap,impliedShares:shares,estimatedAUMKRW:assets,
   nav,divergencePct:divergence,volume:item.volume,tradingValueKRW:item.tradingValueKRW};
  const found=prior.find(x=>x.date===q.date);
  hist.byId[id]=[...prior.filter(x=>x.date!==q.date),rec]
   .sort((a,b)=>a.date.localeCompare(b.date)).slice(-70);
  if(JSON.stringify(found)!==JSON.stringify(rec))saved++;
  data.count++;
  data.observationDate=data.observationDate&&data.observationDate>q.date?data.observationDate:q.date;
 }else if(q?.error)item.reason=q.error;
 const past=Array.isArray(hist.byId[id])?hist.byId[id]:[];
 item.cap5=rate(past,5,'marketCapKRW');
 item.cap20=rate(past,20,'marketCapKRW');
 item.shares5=rate(past,5,'impliedShares');
 item.shares20=rate(past,20,'impliedShares');
 data.items.push(item);
}
data.status=data.count===6?'ok':data.count?'partial':'unavailable';
if(saved)await fs.writeFile(historyPath,JSON.stringify(hist,null,2)+'\n');
await fs.writeFile(output,JSON.stringify(data,null,2)+'\n');
console.log('KRX 공식 ETF NAV·규모 자료:',data.count+'/6; 일별 갱신:',saved);
