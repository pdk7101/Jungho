/* Free, best-effort public KRX ETF quote lookup for a static GitHub Pages site.
   No brokerage/account data is sent. Browser CORS may block direct Naver fetch;
   one public proxy is tried as fallback. Timestamp/identity validation is mandatory.
   This is not a licensed real-time exchange feed. */
(function(){
'use strict';
const num=v=>{
 if(v===null||v===undefined||String(v).trim()==='')return null;
 const n=Number(String(v).replace(/,/g,'').replace(/\s/g,''));
 return Number.isFinite(n)&&n>0?n:null;
};
const kstParts=date=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hour12:false
}).formatToParts(date).map(x=>[x.type,x.value]));
const koreaDay=d=>{const k=kstParts(d);return k.year+k.month+k.day;};
function parseTradeAt(value){
 if(!value||typeof value!=='string')return null;
 const v=value.trim();
 let date;
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)){
  date=new Date(/[+-]\d{2}:\d{2}$|Z$/i.test(v)?v:v+'+09:00');
 }else if(/^\d{8}T?\d{6}$/.test(v)){
  const digits=v.replace('T','');
  date=new Date(digits.slice(0,4)+'-'+digits.slice(4,6)+'-'+digits.slice(6,8)+'T'+digits.slice(8,10)+':'+digits.slice(10,12)+':'+digits.slice(12,14)+'+09:00');
 }else return null;
 return isNaN(date.getTime())?null:date;
}
function parseResponse(obj,funds,now){
 const list=Array.isArray(obj?.datas)?obj.datas:
  Array.isArray(obj?.result?.datas)?obj.result.datas:
  Array.isArray(obj?.result)?obj.result:
  Array.isArray(obj?.data)?obj.data:null;
 if(!list||!list.length)throw Error('시세 응답 형식을 확인할 수 없습니다');
 const codeById=Object.fromEntries(funds.map(f=>[String(f.code),f.id]));
 const result={};
 let rejected=0,firstReason='';
 for(const d of list){
  const code=String(d.itemCode||d.itemcode||d.stockCode||d.code||d.cd||'').replace(/^A(?=\d{6}$)/,'');
  const id=codeById[code];
  if(!id)continue; // Do not attribute a different ticker's price to an ETF.
  const price=num(d.closePrice??d.nowVal??d.currentPrice??d.nv);
  const tradedAt=parseTradeAt(d.localTradedAt||d.tradedAt||d.tradeTime||d.time||'');
  if(price===null||!tradedAt){rejected++;firstReason=firstReason||'현재가 또는 마지막 체결 시각 미확인';continue;}
  const age=(now.getTime()-tradedAt.getTime())/60000;
  const day=koreaDay(tradedAt),today=koreaDay(now);
  // Trading time can reflect a delayed unofficial feed. Never label a prior-day
  // close or a feed older than 15 min during Korean regular market as live.
  const k=kstParts(now),min=Number(k.hour)*60+Number(k.minute);
  const active=min>=9*60&&min<=15*60+30;
  const validAge=age>=-2&&(active?age<=15:age<=24*60);
  if(day!==today||!validAge){
   rejected++;firstReason=firstReason||'조회된 체결이 당일 시세가 아니거나 거래 시각이 오래됐습니다';continue;
  }
  result[id]={price,tradeAt:tradedAt.toISOString(),date:day,status:String(d.marketStatus||d.marketState||''),
   source:'네이버 금융 비공식 현재가',quoteAgeMinutes:Math.max(0,age)};
 }
 if(Object.keys(result).length===0){
  throw Error(firstReason||('유효한 종목코드/체결시각을 확인할 수 없습니다 ('+rejected+'건 제외)'));
 }
 return result;
}
async function requestJson(url,ms){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),ms);
 try{
  const r=await fetch(url,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();
  return data;
 }finally{clearTimeout(timer);}
}
async function lookup(funds){
 const codes=funds.map(f=>f.code).join(',');
 const url='https://polling.finance.naver.com/api/realtime/domestic/stock/'+codes;
 const routes=[
  {type:'direct',url},
  {type:'proxy',url:'https://proxy.cors.dev/'+url}
 ];
 const fail=[];
 for(const route of routes){
  try{
   const res=await requestJson(route.url,route.type==='direct'?4500:10000);
   const quotes=parseResponse(res,funds,new Date());
   if(Object.keys(quotes).length<funds.length){
    // Keep validated partial data only, never fill missing ticker prices by position.
    return {ok:true,quotes,via:route.type,partial:true,source:'네이버 금융 비공식 현재가'};
   }
   return {ok:true,quotes,via:route.type,partial:false,source:'네이버 금융 비공식 현재가'};
  }catch(e){fail.push(route.type+': '+String(e.message||e));}
 }
 return {ok:false,quotes:{},reason:fail.join(' / ')};
}
window.ISA_livePriceFetch={lookup,parseResponse,parseTradeAt};
})();