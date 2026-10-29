import fs from 'node:fs/promises';
const funds=[['reit','329200'],['robot','469070'],['space','0131V0'],['sofr','455030'],['tr','278530'],['sol','0167B0']];
const name=Object.fromEntries(funds);
const out=new URL('../metrics.json',import.meta.url);
const historyPath=new URL('../data/metric-history.json',import.meta.url);
const now=new Date().toISOString();
const priceData=JSON.parse(await fs.readFile(new URL('../quotes.json',import.meta.url),'utf8'));
let historical={version:1,byId:{}};
try {
 const x=JSON.parse(await fs.readFile(historyPath,'utf8'));
 if(x&&x.version===1&&x.byId&&typeof x.byId==='object')historical=x;
}catch(e){console.warn('기존 기록 없음:',e.message);}
const result={fetchedAt:now,source:'네이버 금융 ETF 목록 (비공식)',status:'unavailable',items:[],notes:'시가총액은 AUM과 다릅니다. 추정 발행좌수 및 추정 순자산은 시가총액을 이용한 비공식 계산치입니다.'};
const numeric=(n)=>n!==null&&n!==undefined&&String(n).trim()!==''&&Number.isFinite(Number(n))?Number(n):null;
const valid=(n)=>numeric(n)!==null&&Number(n)>0;
function historyChange(history,days,key){
 const sorted=history.filter(x=>valid(x[key])).sort((a,b)=>a.date.localeCompare(b.date));
 if(sorted.length<days+1)return {value:null,count:sorted.length,needed:days+1};
 const prev=sorted[sorted.length-1-days],cur=sorted.at(-1);
 if(!(prev[key]>0))return {value:null,count:sorted.length,needed:days+1};
 return {value:(cur[key]/prev[key]-1)*100,count:sorted.length,needed:days+1,from:prev.date,to:cur.date};
}
try{
 const response=await fetch('https://finance.naver.com/api/sise/etfItemList.nhn',{
   headers:{'Accept':'application/json,text/plain,*/*','User-Agent':'Mozilla/5.0 (compatible; ISA-ETF-Dashboard/1.0)','Referer':'https://finance.naver.com/'},
   signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('API HTTP '+response.status);
 let text=await response.text();
 const json=JSON.parse(text.replace(/^\uFEFF/,''));
 const records=json?.result?.etfItemList;
 if(!Array.isArray(records)||records.length<50)throw Error('ETF listing payload unexpected');
 const byCode=new Map(records.map(x=>[String(x.itemcode),x]));
 let successes=0;
 for(const [id,code] of funds){
  const rec=byCode.get(code),q=priceData.items.find(x=>x.id===id);
  let item={id,code,date:q?.date||null,ok:false,reason:null};
  const previous=(historical.byId[id]||[]).filter(x=>x&&/^\d{8}$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date));
  if(!rec){item.reason='ETF 목록에서 종목 코드를 확인하지 못함';}
  else if(!q?.ok||!/^\d{8}$/.test(q.date)||!valid(q.close)){item.reason='수집 완료된 종가 미확인';}
  else{
    const price=numeric(rec.nowVal),nav=numeric(rec.nav),market100m=numeric(rec.marketSum),
    volume=numeric(rec.quant),amountM=numeric(rec.amonut);
    if(!valid(price)||!valid(nav)||!valid(market100m)){item.reason='시가총액/종가/NAV 값 미확인';}
    else if(Math.abs(price-q.close)/q.close>0.018){item.reason='목록 시세와 완료 종가가 불일치하여 비교 보류';}
    else {
      const marketCapKRW=market100m*1e8;
      const impliedShares=Math.round(marketCapKRW/price);
      const estimatedAUMKRW=impliedShares*nav;
      const divergencePct=(price/nav-1)*100;
      if(!Number.isFinite(estimatedAUMKRW)||estimatedAUMKRW<=0||!Number.isFinite(divergencePct)||Math.abs(divergencePct)>50){
        item.reason='ETF 규모와 괴리율 값 검증 실패';
      }else{
        item={id,code,date:q.date,ok:true,marketCap100m:market100m,marketCapKRW,nav,marketPrice:price,
         divergencePct,impliedShares,estimatedAUMKRW,
         volume:volume!==null&&volume>=0?volume:null,tradingValueKRW:amountM!==null&&amountM>=0?amountM*1e6:null};
        // Append only one snapshot per distinct completed trading date. Never fabricate past snapshots.
        const fresh=previous.filter(x=>x.date!==q.date);
        fresh.push({date:q.date,marketCapKRW,impliedShares,estimatedAUMKRW,nav,divergencePct,
          volume:item.volume,tradingValueKRW:item.tradingValueKRW});
        historical.byId[id]=fresh.sort((a,b)=>a.date.localeCompare(b.date)).slice(-65);
        item.cap5=historyChange(historical.byId[id],5,'marketCapKRW');
        item.cap20=historyChange(historical.byId[id],20,'marketCapKRW');
        item.shares5=historyChange(historical.byId[id],5,'impliedShares');
        item.shares20=historyChange(historical.byId[id],20,'impliedShares');
        successes++;
      }
    }
  }
  if(!item.ok){
    item.cap5=item.cap20=item.shares5=item.shares20={value:null};
  }
  result.items.push(item);
  console.log(code,item.ok?'시총(억원) '+item.marketCap100m+' NAV '+item.nav+' 추정좌수 '+item.impliedShares:item.reason);
 }
 if(successes===0)throw Error('6종목 중 유효한 ETF 규모 정보 없음');
 result.status=successes===funds.length?'ok':'partial';
 result.count=successes;
 await fs.writeFile(historyPath,JSON.stringify(historical,null,2)+'\n','utf8');
 console.log('ETF 규모 데이터:',successes,'/',funds.length,'기록 성장 시작. 5/20거래일 전 비교는 실제 스냅샷 축적 이후.');
}catch(e){
 result.status='unavailable';
 result.reason=String(e.message||e);
 result.items=funds.map(([id,code])=>({id,code,ok:false,date:null,reason:'시가총액/NAV 자료 수집 실패: '+result.reason}));
 console.error('ETF listing unavailable; do not infer AUM/share changes:',result.reason);
}
await fs.writeFile(out,JSON.stringify(result,null,2)+'\n','utf8');
