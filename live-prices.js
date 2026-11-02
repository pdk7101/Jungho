/* Public KR quotes: best-effort intraday browser fetch, validated GitHub snapshot fallback.
 * No brokerage API, no trade submission, no claim of official exchange realtime feed. */
(function(){
'use strict';
const n=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(String(v).replace(/,/g,'')))&&Number(String(v).replace(/,/g,''))>0?Number(String(v).replace(/,/g,'')):null;
const kparts=d=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d).map(x=>[x.type,x.value]));
const kday=d=>{const v=kparts(d);return v.year+v.month+v.day};
const active=d=>{const v=kparts(d),mins=Number(v.hour)*60+Number(v.minute),weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short'}).format(d);return !['Sat','Sun'].includes(weekday)&&mins>=540&&mins<=930};
function tradeTime(value){
 if(!value||typeof value!=='string')return null;
 let v=value.trim(),dt=null;
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v))dt=new Date(/[+-]\d{2}:\d{2}$|Z$/i.test(v)?v:v+'+09:00');
 else if(/^\d{8}T?\d{6}$/.test(v)){v=v.replace('T','');dt=new Date(v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6,8)+'T'+v.slice(8,10)+':'+v.slice(10,12)+':'+v.slice(12,14)+'+09:00');}
 return dt&&!Number.isNaN(dt.getTime())?dt:null;
}
function validate(price,stamp,now,source,status,method){
 const d=tradeTime(stamp),value=n(price);
 if(!d||!value)return null;
 const age=(now-d)/60000;
 if(kday(now)!==kday(d)||age< -2||age>(active(now)?20:1440))return null;
 return {price:value,tradeAt:d.toISOString(),date:kday(d),quoteAgeMinutes:Math.max(0,age),
  source,status:String(status||''),method};
}
function getList(obj){
 if(Array.isArray(obj?.datas))return obj.datas;
 if(Array.isArray(obj?.result?.datas))return obj.result.datas;
 if(Array.isArray(obj?.result?.areas))return obj.result.areas.flatMap(x=>x.datas||[]);
 if(Array.isArray(obj?.areas))return obj.areas.flatMap(x=>x.datas||[]);
 if(Array.isArray(obj?.data))return obj.data;
 return [];
}
function parseResponse(obj,funds,now=new Date(),singleCode=null){
 const list=getList(obj);
 if(!list.length)throw Error('시세 응답 형식 미확인');
 const ids=Object.fromEntries(funds.map(f=>[String(f.code),f.id])),out={};
 for(const row of list){
  const code=String(row.itemCode||row.itemcode||row.stockCode||row.code||row.cd||singleCode||'').replace(/^A(?=\d{6}$)/,'');
  const id=ids[code];if(!id)continue;
  const quote=validate(row.closePrice??row.nowVal??row.currentPrice??row.nv,
   row.localTradedAt||row.tradedAt||row.tradeTime||row.time||'',now,
   '네이버 비공식 당일 체결가격',row.marketStatus||row.marketState||row.ms||'','browser');
  if(quote)out[id]=quote;
 }
 if(!Object.keys(out).length)throw Error('종목코드 일치·당일 체결시간·현재가 확인 실패');
 return out;
}
async function json(url,timeout=6500){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
 try{
  const r=await fetch(url,{cache:'no-store',signal:ctl.signal,headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  return r.json();
 }finally{clearTimeout(timer);}
}
function parsePublished(payload,funds,now=new Date()){
 if(!payload||kday(now)!==payload.kstDate||!Array.isArray(payload.items))throw Error('게시 시세 날짜·형식 미확인');
 const fetched=new Date(payload.fetchedAt);
 if(!Number.isFinite(fetched.getTime()))throw Error('게시 수집시각 미확인');
 const fresh=(now-fetched)/60000;
 if(fresh< -2||fresh>(active(now)?22:1440))throw Error('게시 시세 재수집 지연 ('+Math.round(fresh)+'분)');
 const ids=Object.fromEntries(funds.map(f=>[String(f.code),f.id])),result={};
 for(const item of payload.items){
  if(!ids[String(item.code)]||ids[String(item.code)]!==item.id)continue;
  const q=validate(item.price,item.tradeAt,now,'GitHub 공개 비공식 시세 (게시 지연 가능)',item.status,'published');
  if(q)result[item.id]={...q,publicationAgeMinutes:Math.max(0,fresh)};
 }
 if(!Object.keys(result).length)throw Error('게시된 유효한 당일 체결 시세 없음');
 return result;
}
async function lookup(funds){
 const now=new Date(),codes=funds.map(f=>f.code).join(',');
 const base='https://polling.finance.naver.com';
 const candidates=[
  {name:'직접',url:base+'/api/realtime/domestic/stock/'+codes,timeout:4000},
  {name:'직접 통합',url:base+'/api/realtime?query='+encodeURIComponent('SERVICE_ITEM:'+codes),timeout:3500},
  {name:'공개 프록시',url:'https://proxy.cors.dev/'+base+'/api/realtime/domestic/stock/'+codes,timeout:6000}
 ];
 const fail=[],quotes={};
 for(const c of candidates){
  try{
   Object.assign(quotes,parseResponse(await json(c.url,c.timeout),funds,now));
   if(Object.keys(quotes).length===funds.length)return {ok:true,quotes,via:c.name,partial:false};
  }catch(e){fail.push(c.name+': '+String(e.message||e));}
 }
 try{
  const published=parsePublished(await json('./intraday-quotes.json?nocache='+Date.now(),4800),funds,new Date());
  for(const [id,q] of Object.entries(published))if(!quotes[id])quotes[id]=q;
 }catch(e){fail.push('GitHub 게시 시세: '+String(e.message||e));}
 const count=Object.keys(quotes).length;
 return count?{ok:true,quotes,via:Object.values(quotes).some(q=>q.method==='published')?'공개 게시 보조 시세':'직접 비공식',partial:count!==funds.length,reason:fail.join(' / ')}:
 {ok:false,quotes:{},reason:fail.join(' / ')};
}
window.ISA_livePriceFetch={lookup,parseResponse,parsePublished,tradeTime,active};
})();