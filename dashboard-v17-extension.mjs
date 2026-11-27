// Read-only dashboard extension. No credentials, writes, fetch or order paths.
const seed=new Set(['SCHD','AGNC','SPYM','CONY','SPCX']);
export function extraRows(snapshot,now=Date.now()){
 const stamp=Date.parse(snapshot?.fetchedAt||'');
 if(!Number.isFinite(stamp)||stamp>now||now-stamp>5*60000||!snapshot?.bySymbol||typeof snapshot.bySymbol!=='object'||Array.isArray(snapshot.bySymbol)||Object.keys(snapshot.bySymbol).length>100)return null;
 const rows=[];
 for(const [symbol,q] of Object.entries(snapshot.bySymbol)){
  if(!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(symbol)||seed.has(symbol)||q?.symbol!==symbol)continue;
  const t=Date.parse(q.tradeAt||''),r=Date.parse(q.receivedAt||'');
  const valid=snapshot.session?.open===true&&typeof q.usd==='number'&&Number.isFinite(q.usd)&&q.usd>0&&Number.isFinite(t)&&t<=now&&now-t<=45*60000&&Number.isFinite(r)&&r<=now&&now-r<=7*60000;
  rows.push({symbol,usd:valid?q.usd:null,tradeAt:valid?q.tradeAt:null,signal:'보류'});
 }
 return rows.sort((a,b)=>a.symbol.localeCompare(b.symbol));
}
export function mountExtraUS(doc,win){
 const root=doc.getElementById('v17-extra-us-list'),status=doc.getElementById('v17-extra-us-status');
 if(!root||!status)return;
 const render=()=>{
  const rows=extraRows(win.ISA_PERSONAL_US?.scheduledSnapshot?.());
  root.replaceChildren();
  status.textContent=rows===null?'v17 시세 목록 확인 대기':rows.length?'신규 미국 감시 종목 '+rows.length+'개 · 투자기록 및 매수판단 별도':'신규 미국 감시 종목 없음';
  for(const row of rows||[]){
   const p=doc.createElement('p');p.className='sub';
   p.textContent=row.symbol+' · '+(row.usd===null?'유효 시세 대기':'USD '+row.usd.toFixed(2)+' · 체결 '+new Date(row.tradeAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))+' · '+row.signal;
   root.append(p);
  }
 };
 win.addEventListener('isa-personal-us-quote-refreshed',render);
 win.addEventListener('pageshow',render);win.setInterval(render,60000);render();
}
if(typeof document!=='undefined'&&typeof window!=='undefined')mountExtraUS(document,window);
