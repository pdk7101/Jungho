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
   const date=parts[0],O=Number(parts[1]),H=Number(parts[2]),L=Number(parts[3]),C=Number(parts[4]);
   if(!/^\d{8}$/.test(date)||![O,H,L,C].every(Number.isFinite)||Math.min(O,H,L,C)<=0||H<Math.max(O,C)||L>Math.min(O,C)||seen.has(date))continue;
   if(date>currentDay||(date===currentDay&&minute<16*60+30))continue;
   seen.add(date);rows.push({date,open:O,high:H,low:L,close:C});
 }
 return rows.sort((a,b)=>a.date.localeCompare(b.date));
}
async function getFund([id,code]){
 try{
  const endpoint='https://fchart.stock.naver.com/sise.nhn?symbol='+encodeURIComponent(code)+'&timeframe=day&count=70&requestType=0';
  const resp=await fetch(endpoint,{headers:{Accept:'application/xml,text/xml,*/*','User-Agent':'Mozilla/5.0 (compatible; ISA-ETF-Watchlist/1.0)',Referer:'https://finance.naver.com/'},signal:AbortSignal.timeout(18000)});
  if(!resp.ok)throw Error('HTTP '+resp.status);
  const rows=parse(await resp.text()),bars=rows.slice(-20);
  if(bars.length!==20)throw Error('최근 일봉 20개 미달');
  const close=bars[19].close,low20=Math.min(...bars.map(x=>x.low)),high20=Math.max(...bars.map(x=>x.high));
  if(!(close>0&&high20>low20&&low20>0))throw Error('가격 검증 실패');
  console.log(code,bars[19].date,close,low20,high20);
  return {id,code,ok:true,date:bars[19].date,close,low20,high20,rangeStart:bars[0].date,rangeEnd:bars[19].date,bars};
 }catch(e){console.error(code,e.message);return {id,code,ok:false,error:'일봉 미확인: '+e.message,date:null,close:null,low20:null,high20:null,bars:[]};}
}
const items=await Promise.all(funds.map(getFund));
const result={fetchedAt:new Date().toISOString(),source:'네이버 금융 일봉 (비공식)',officialConfirmed:false,items};
await fs.writeFile(new URL('../quotes.json',import.meta.url),JSON.stringify(result,null,2));
console.log('유효 종목:',items.filter(x=>x.ok).length,'/',items.length);
