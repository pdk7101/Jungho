/* Public best-effort Naver quote fallback for browser CORS restrictions. */
import fs from 'node:fs/promises';
const funds=[['reit','329200'],['robot','469070'],['space','0131V0'],['sofr','455030'],['tr','278530'],['sol','0167B0']];
const parts=d=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d).map(x=>[x.type,x.value]));
const kday=d=>{const v=parts(d);return v.year+v.month+v.day};
const num=x=>x!=null&&String(x).trim()!==''&&Number.isFinite(Number(String(x).replace(/,/g,'')))&&Number(String(x).replace(/,/g,''))>0?Number(String(x).replace(/,/g,'')):null;
function tradeAt(str){
 if(typeof str!=='string')return null;
 let s=str.trim(),d=null;
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s))d=new Date(/[+-]\d{2}:\d{2}$|Z$/i.test(s)?s:s+'+09:00');
 if(!d&&/^\d{8}T?\d{6}$/.test(s)){s=s.replace('T','');d=new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+s.slice(8,10)+':'+s.slice(10,12)+':'+s.slice(12,14)+'+09:00');}
 return d&&!isNaN(d.getTime())?d:null;
}
function rows(obj){
 if(Array.isArray(obj?.datas))return obj.datas;
 if(Array.isArray(obj?.result?.datas))return obj.result.datas;
 if(Array.isArray(obj?.result?.areas))return obj.result.areas.flatMap(x=>x.datas||[]);
 if(Array.isArray(obj?.areas))return obj.areas.flatMap(x=>x.datas||[]);
 return [];
}
async function query(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json','User-Agent':'Mozilla/5.0','Referer':'https://finance.naver.com/'}});
 if(!r.ok)throw Error('HTTP '+r.status);
 return r.json();
}
async function one([id,code],now){
 const urls=['https://polling.finance.naver.com/api/realtime/domestic/stock/'+encodeURIComponent(code),
 'https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:'+encodeURIComponent(code)];
 const failures=[];
 for(const url of urls){
  try{
   const items=rows(await query(url));
   const item=items.find(x=>String(x.itemCode||x.stockCode||x.code||x.cd||'').replace(/^A(?=[A-Z0-9]{6}$)/i,'')===code);
   if(!item)throw Error('종목코드 미확인');
   const price=num(item.closePrice??item.currentPrice??item.nv),stamp=tradeAt(item.localTradedAt||item.tradedAt||item.tradeTime||'');
   if(!price||!stamp)throw Error('현재가/체결시각 없음');
   const age=(now-stamp)/60000,dt=parts(now),minutes=Number(dt.hour)*60+Number(dt.minute);
   const active=minutes>=540&&minutes<=930;
   if(kday(stamp)!==kday(now)||age< -2||age>(active?15:1440))throw Error('오늘 체결시각 미확인·지연');
   return {id,code,price,tradeAt:stamp.toISOString(),date:kday(stamp),status:String(item.marketStatus||item.marketState||item.ms||'')};
  }catch(e){failures.push(String(e.message||e));}
 }
 return {id,code,error:failures.join(' / ')};
}
const now=new Date(),p=parts(now),minute=Number(p.hour)*60+Number(p.minute);
const weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short'}).format(now);
// On deploys after the close, retain today's last trade so evening users can verify it.
const run=!['Sat','Sun'].includes(weekday)&&minute>=540&&minute<1440;
const items=run?await Promise.all(funds.map(x=>one(x,now))):[];
await fs.writeFile(new URL('../intraday-quotes.json',import.meta.url),JSON.stringify({fetchedAt:now.toISOString(),kstDate:kday(now),source:'네이버 금융 비공식 / GitHub 게시 지연 가능',items},null,2));
console.log('KR intraday '+p.hour+':'+p.minute+' '+items.filter(x=>x.price).length+'/'+funds.length);
for(const x of items)console.log(x.code,x.price??x.error,x.tradeAt??'');
