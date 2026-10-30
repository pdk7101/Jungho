import fs from 'node:fs/promises';
const funds=[['reit','329200'],['robot','469070'],['space','0131V0'],['sofr','455030'],['tr','278530'],['sol','0167B0']];
const out=new URL('../metrics.json',import.meta.url);
const historyPath=new URL('../data/metric-history.json',import.meta.url);
const fetchedAt=new Date();
const now=fetchedAt.toISOString();
const KST=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const part=Object.fromEntries(KST.formatToParts(fetchedAt).map(x=>[x.type,x.value]));
const today=part.year+part.month+part.day;
const minute=Number(part.hour)*60+Number(part.minute);
const afterClose=minute>=16*60+30;
const numeric=v=>{
 if(v===null||v===undefined||String(v).trim()==='')return null;
 const n=Number(String(v).replace(/,/g,''));
 return Number.isFinite(n)?n:null;
};
const valid=v=>numeric(v)!==null&&Number(v)>0;
const percent=(a,b)=>(a/b-1)*100;
let historical={version:1,byId:{}};
try{
 const old=JSON.parse(await fs.readFile(historyPath,'utf8'));
 if(old&&old.version===1&&old.byId&&typeof old.byId==='object')historical=old;
}catch(e){console.warn('기존 규모 기록 없음: '+String(e.message||e));}
const priceData=JSON.parse(await fs.readFile(new URL('../quotes.json',import.meta.url),'utf8'));
const result={
 fetchedAt:now,observationDate:today,source:'네이버 금융 ETF 목록 (비공식)',
 status:'unavailable',items:[],notes:'ETF 목록의 가격·시가총액·NAV는 조회 당시의 참고값입니다. 공식 실시간 시세, 공식 발행좌수, 공식 확정 AUM 또는 확정 괴리율이 아닙니다.'
};
function historyChange(history,days,key){
 const all=history.filter(x=>x&&/^\d{8}$/.test(x.date)&&numeric(x[key])>0).sort((a,b)=>a.date.localeCompare(b.date));
 if(all.length<days+1)return {value:null,count:all.length,needed:days+1};
 const prev=all[all.length-1-days],cur=all.at(-1);
 // Require distinct trading days; never duplicate an intraday observation for a previous date.
 if(prev.date>=cur.date||!(prev[key]>0))return {value:null,count:all.length,needed:days+1};
 return {value:percent(cur[key],prev[key])*100/100,count:all.length,needed:days+1,from:prev.date,to:cur.date};
}
try{
 const response=await fetch('https://finance.naver.com/api/sise/etfItemList.nhn',{
  headers:{Accept:'application/json,text/plain,*/*','User-Agent':'Mozilla/5.0 (compatible; ISA-ETF-Watchlist/1.1)',Referer:'https://finance.naver.com/'},
  signal:AbortSignal.timeout(20000)
 });
 if(!response.ok)throw Error('HTTP '+response.status);
 const body=JSON.parse((await response.text()).replace(/^\uFEFF/,''));
 const records=body?.result?.etfItemList;
 if(!Array.isArray(records)||records.length<50)throw Error('ETF 목록 형식 검증 실패');
 const byCode=new Map(records.map(r=>[String(r.itemcode||'').replace(/^A(?=\d{6})/,'').toUpperCase(),r]));
 let successes=0,saved=0;
 for(const [id,code] of funds){
  const rec=byCode.get(code),q=priceData.items?.find(x=>x.id===id);
  const oldHistory=(historical.byId[id]||[]).filter(x=>x&&/^\d{8}$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date));
  const item={id,code,ok:false,date:q?.date||null,observedAt:now,observationDate:today,
   historicalClose:q?.ok&&valid(q.close)?Number(q.close):null,reason:null,
   historyEligible:false,priceTimeVerified:false,sourceTiming:'ETF 목록의 개별 체결·NAV 기준시각 미제공'};
  if(!rec){item.reason='ETF 목록에서 해당 종목코드를 찾지 못했습니다';}
  else{
   const price=numeric(rec.nowVal),nav=numeric(rec.nav),m100=numeric(rec.marketSum),
    volume=numeric(rec.quant),amountM=numeric(rec.amonut);
   if(!(price>0)||!(m100>0)){item.reason='ETF 목록 현재가 또는 시가총액이 확인되지 않았습니다';}
   else {
    const marketCapKRW=m100*1e8,impliedShares=Math.round(marketCapKRW/price);
    const estimatedAUMKRW=nav>0?impliedShares*nav:null;
    const divergencePct=nav>0?percent(price,nav):null;
    if(!Number.isFinite(marketCapKRW)||marketCapKRW<=0||
       !Number.isFinite(impliedShares)||impliedShares<=0||
       (divergencePct!==null&&(!Number.isFinite(divergencePct)||Math.abs(divergencePct)>50))){
      item.reason='ETF 규모 또는 NAV 비공식 데이터 검증 실패';
    }else{
     // ETF list numbers belong together. A prior trading day's final OHLC is NOT
     // a valid comparator for the current ETF list price during active trading.
     const delta=q?.ok&&valid(q.close)?percent(price,Number(q.close)):null;
     const sameDay=Boolean(q?.ok&&q.date===today&&afterClose);
     const closeConsistent=sameDay&&delta!==null&&Math.abs(delta)<=1.8;
     Object.assign(item,{
      ok:true,marketCap100m:m100,marketCapKRW,marketPrice:price,
      nav:nav>0?nav:null,divergencePct,impliedShares,
      estimatedAUMKRW,volume:volume!==null&&volume>=0?volume:null,
      tradingValueKRW:amountM!==null&&amountM>=0?amountM*1e6:null,
      priorCloseDifferencePct:delta,
      comparisonNote:q?.date!==today?
       '직전 확정 일봉 '+(q?.date||'미확인')+'과 조회 당일 목록 가격의 기준일이 달라 직접 비교하지 않습니다':
       !afterClose?'장중 수치이며 당일 확정 종가와 비교하지 않습니다':
       !closeConsistent?'확정 일봉과 목록 시세의 차이가 있어 기록만 보류합니다':'확정 일봉과 비공식 목록 가격의 일치 확인',
      historyEligible:closeConsistent&&nav>0,
      historyNote:closeConsistent&&nav>0?'확정 일봉 기준 날짜에 기록':'장중/시점차·NAV 미확인으로 날짜별 변화율 기록 제외'
     });
     if(item.historyEligible){
      const history=oldHistory.filter(x=>x.date!==q.date);
      history.push({date:q.date,marketCapKRW,impliedShares,estimatedAUMKRW,nav,divergencePct,
       volume:item.volume,tradingValueKRW:item.tradingValueKRW});
      historical.byId[id]=history.sort((a,b)=>a.date.localeCompare(b.date)).slice(-65);
      saved++;
     }
     successes++;
    }
   }
  }
  const existing=historical.byId[id]||oldHistory;
  item.cap5=historyChange(existing,5,'marketCapKRW');
  item.cap20=historyChange(existing,20,'marketCapKRW');
  item.shares5=historyChange(existing,5,'impliedShares');
  item.shares20=historyChange(existing,20,'impliedShares');
  result.items.push(item);
  console.log(code,item.ok?
   '목록현재가 '+item.marketPrice+' 목록시총(억원) '+item.marketCap100m+
   ' NAV '+item.nav+' 일봉 '+item.date+' 기록 '+(item.historyEligible?'예':'보류'):
   '미확인 '+item.reason);
 }
 result.status=successes===6?'ok':successes>0?'partial':'unavailable';
 result.count=successes;
 result.historySaved=saved;
 // No past-day overwrite when running the GitHub workflow before the market closes.
 if(saved>0)await fs.writeFile(historyPath,JSON.stringify(historical,null,2)+'\n','utf8');
 console.log('ETF 규모 조회 '+successes+'/6, 확정 일봉 기록 '+saved+'/6, 조회일 '+today);
}catch(e){
 result.status='unavailable';result.reason=String(e.message||e);
 result.items=funds.map(([id,code])=>({id,code,ok:false,reason:'ETF 목록 확인 실패: '+result.reason}));
 console.error('ETF 현재 규모 정보 확인 실패: '+result.reason);
}
await fs.writeFile(out,JSON.stringify(result,null,2)+'\n','utf8');
