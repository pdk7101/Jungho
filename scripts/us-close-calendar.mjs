// NYSE 2026–2028 schedule: https://www.nyse.com/trade/hours-calendars
const HOLIDAYS=new Set('20260101 20260119 20260216 20260403 20260525 20260619 20260703 20260907 20261126 20261225 20270101 20270118 20270215 20270326 20270531 20270618 20270705 20270906 20271125 20271224 20280117 20280221 20280414 20280529 20280619 20280704 20280904 20281123 20281225'.split(' '));
const EARLY=new Set('20261127 20261224 20271126 20280703 20281124'.split(' '));
const ET=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const parts=d=>Object.fromEntries(ET.formatToParts(d).map(x=>[x.type,x.value]));
const key=d=>d.toISOString().slice(0,10).replaceAll('-','');
const known=s=>['2026','2027','2028'].includes(s.slice(0,4));
export function tradingDate(s){
 if(typeof s!=='string'||!/^\d{8}$/.test(s)||!known(s))return false;
 const d=new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T00:00:00Z');
 return Number.isFinite(d.getTime())&&key(d)===s&&![0,6].includes(d.getUTCDay())&&!HOLIDAYS.has(s);
}
export function closeContext(now=new Date()){
 const p=parts(now),today=p.year+p.month+p.day;
 const minute=Number(p.hour)*60+Number(p.minute),close=EARLY.has(today)?780:960;
 if(!known(today))return {today,expected:null,calendarKnown:false};
 const day=new Date(p.year+'-'+p.month+'-'+p.day+'T00:00:00Z');
 // Require 30 min after regular close before accepting that day's daily bar.
 if(!tradingDate(today)||minute<close+30)day.setUTCDate(day.getUTCDate()-1);
 for(let i=0;i<10;i++,day.setUTCDate(day.getUTCDate()-1)){
  const date=key(day);
  if(!known(date))break;
  if(tradingDate(date))return {today,expected:date,calendarKnown:true,closeMinute:close};
 }
 return {today,expected:null,calendarKnown:false};
}
export async function chooseCompletedBar(expected,sources){
 if(!expected||!tradingDate(expected))throw Error('미국 거래일 미확인');
 let best=null;const attempts=[];
 for(const [name,load] of sources){
  try{
   const item=await load();
   if(!item?.ok||!tradingDate(item.date)||item.date>expected)throw Error('일봉 기준일 오류');
   attempts.push({source:name,date:item.date,status:item.date===expected?'current':'stale'});
   if(item.date===expected)return {...item,expectedDate:expected,closeStatus:'current',attempts};
   if(!best||item.date>best.date)best=item;
  }catch(_){attempts.push({source:name,status:'unavailable'});}
 }
 if(best)return {...best,expectedDate:expected,closeStatus:'stale',attempts};
 return {ok:false,date:null,close:null,expectedDate:expected,closeStatus:'unavailable',attempts};
}
