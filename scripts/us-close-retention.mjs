// Keep only validated previously published reference data; never fabricate prices.
import {tradingDate} from './us-close-calendar.mjs';
const pos=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const dateMs=s=>Date.parse(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6)+'T00:00:00Z');
export function consecutiveBars(bars){
 if(!Array.isArray(bars)||bars.length!==40)return false;
 for(let i=0;i<bars.length;i++){
  const x=bars[i];
  if(!tradingDate(x?.date)||![x.open,x.high,x.low,x.close].every(pos)||x.high<Math.max(x.open,x.close)||x.low>Math.min(x.open,x.close))return false;
  if(i){
   const prev=dateMs(bars[i-1].date),next=dateMs(x.date);
   if(next<=prev||next-prev>10*86400000)return false;
   for(let t=prev+86400000;t<next;t+=86400000)if(tradingDate(new Date(t).toISOString().slice(0,10).replaceAll('-','')))return false;
  }
 }
 return true;
}
export function retainedClose(payload,[id,ticker],expected){
 if(!expected||payload?.market!=='US'||payload.currency!=='USD'||payload.isRealtime!==false)return null;
 const x=id==='spacex'?payload.extraQuotes?.spacex:payload.items?.find?.(q=>q?.id===id);
 if(x?.ok!==true||x.id!==id||x.ticker!==ticker||x.currency!=='USD'||!tradingDate(x.date)||x.date>expected||dateMs(expected)-dateMs(x.date)>10*86400000||!consecutiveBars(x.bars)||x.bars.at(-1).date!==x.date||x.bars.at(-1).close!==x.close||ticker==='SPCX'&&x.bars.some(b=>b.date<'20260612'))return null;
 return {raw:x.bars,source:String(x.source||'이전 공급원').replace(/ · 마지막 정상 게시자료$/,'')+' · 마지막 정상 게시자료',dividends:Array.isArray(x.dividends)?x.dividends.filter(d=>d&&/^\d{8}$/.test(d.date)&&d.date<=x.date&&pos(d.perShare)):[],splits:Array.isArray(x.splits)?x.splits.filter(d=>d&&/^\d{8}$/.test(d.date)&&d.date<=x.date&&typeof d.ratio==='string'):[]};
}
export function retainedFx(payload,now=Date.now()){
 const f=payload?.fx,t=Date.parse(f?.observedAt);
 if(payload?.market!=='US'||payload.currency!=='USD'||f?.ok!==true||!pos(f.usdKrw)||f.usdKrw<700||f.usdKrw>3000||!Number.isFinite(t)||t>now||now-t>3*86400000)return null;
 return {ok:true,usdKrw:f.usdKrw,observedAt:f.observedAt,source:String(f.source||'이전 참고환율').replace(/ · 마지막 정상 게시자료$/,'')+' · 마지막 정상 게시자료',realTime:false,retained:true};
}
export function preferFx(fresh,prior,now=Date.now()){
 const previous=retainedFx(prior,now);
 if(!previous)return fresh;
 if(fresh?.ok!==true||Date.parse(fresh.observedAt)<Date.parse(previous.observedAt))return previous;
 return fresh;
}
