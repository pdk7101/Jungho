import fs from 'node:fs/promises';
const funds=[['reit','329200'],['robot','469070'],['space','0131V0'],['sofr','455030'],['tr','278530'],['sol','0167B0']];
const format=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const nowPart=Object.fromEntries(format.formatToParts(new Date()).map(x=>[x.type,x.value]));
const currentDay=nowPart.year+nowPart.month+nowPart.day;
const minute=Number(nowPart.hour)*60+Number(nowPart.minute);
function parse(raw){
 if(typeof raw!=='string'||!/chartdata|<item/i.test(raw))throw Error('원본 차트 형식 오류');
 const rows=[];const seen=new Set();let m;
 const matcher=/<item\s+data\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
 while((m=matcher.exec(raw))!==null){
   const parts=m[1].split('|');if(parts.length<5)continue;
   const date=parts[0],O=Number(parts[1]),H=Number(parts[2]),L=Number(parts[3]),C=Number(parts[4]),V=parts.length>=6?Number(parts[5]):NaN;
   if(!/^\d{8}$/.test(date)||![O,H,L,C].every(Number.isFinite)||Math.min(O,H,L,C)<=0||H<Math.max(O,C)||L>Math.min(O,C)||seen.has(date))continue;
   if(date>currentDay||(date===currentDay&&minute<16*60+30))continue;
   seen.add(date);rows.push({date,open:O,high:H,low:L,close:C,volume:Number.isFinite(V)&&V>=0?V:null});
 }
 return rows.sort((a,b)=>a.date.localeCompare(b.date));
}
async function getFund([id,code]){
 try{
  const endpoint='https://fchart.stock.naver.com/sise.nhn?symbol='+encodeURIComponent(code)+'&timeframe=day&count=70&requestType=0';
  const resp=await fetch(endpoint,{headers:{Accept:'application/xml,text/xml,*/*','User-Agent':'Mozilla/5.0 (compatible; ISA-ETF-Watchlist/1.0)',Referer:'https://finance.naver.com/'},signal:AbortSignal.timeout(18000)});
  if(!resp.ok)throw Error('HTTP '+resp.status);
  const rows=parse(await resp.text()),bars=rows.slice(-40);
  if(bars.length!==40)throw Error('20일선 계산을 위한 일봉 40개 미달');
  const last20=bars.slice(-20);
  const close=last20[19].close,low20=Math.min(...last20.map(x=>x.low)),high20=Math.max(...last20.map(x=>x.high));
  const avg=(a)=>a.reduce((sum,x)=>sum+x.close,0)/a.length;
  const ma20=avg(bars.slice(-20));
  const previousMa20=avg(bars.slice(-21,-1));
  const day2Ma20=avg(bars.slice(-22,-2));
  const previousClose=bars[bars.length-2].close;
  const day2Close=bars[bars.length-3].close;
  const crossUp=previousClose<=previousMa20&&close>ma20;
  const crossDown=previousClose>=previousMa20&&close<ma20;
  const twoDaysAbove=previousClose>previousMa20&&close>ma20;
  const twoDaysBelow=previousClose<previousMa20&&close<ma20;
  const twoDayUpBreakout=day2Close<=day2Ma20&&previousClose>previousMa20&&close>ma20;
  const maRising=ma20>=previousMa20;
  const volumeToday=Number.isFinite(last20[19].volume)?last20[19].volume:null;
  const priorVolume=bars.slice(-21,-1).map(x=>x.volume);
  const avgVolume20=priorVolume.every(Number.isFinite)?priorVolume.reduce((a,b)=>a+b,0)/20:null;
  if(!(close>0&&high20>low20&&low20>0&&ma20>0&&previousMa20>0))throw Error('가격·이동평균 검증 실패');
  const trend={ma20,previousMa20,previousClose,day2Close,day2Ma20,crossUp,crossDown,twoDaysAbove,twoDaysBelow,twoDayUpBreakout,maRising,volumeToday,avgVolume20};
  console.log(code,last20[19].date,close,'MA20',ma20.toFixed(1),'crossUp',crossUp,'twoDaysAbove',twoDaysAbove);
  return {id,code,ok:true,date:last20[19].date,close,low20,high20,rangeStart:last20[0].date,rangeEnd:last20[19].date,bars,trend};
 }catch(e){console.error(code,e.message);return {id,code,ok:false,error:'일봉 미확인: '+e.message,date:null,close:null,low20:null,high20:null,bars:[]};}
}
const items=await Promise.all(funds.map(getFund));
const result={fetchedAt:new Date().toISOString(),source:'네이버 금융 일봉 (비공식)',officialConfirmed:false,items};
await fs.writeFile(new URL('../quotes.json',import.meta.url),JSON.stringify(result,null,2));
console.log('유효 종목:',items.filter(x=>x.ok).length,'/',items.length);
