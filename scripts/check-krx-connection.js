/* Private authenticated connectivity test. Never stores or logs any KRX market values.
 * Run only as a manually dispatched GitHub Actions job. */
const key=String(process.env.KRX_AUTH_KEY||'').trim();
if(!key){
 console.error('FAIL: KRX_AUTH_KEY repository secret is missing or empty.');
 process.exitCode=1;
}else{
 const dt=new Date();
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const p=Object.fromEntries(fmt.formatToParts(dt).map(x=>[x.type,x.value]));
 const nowMinutes=Number(p.hour)*60+Number(p.minute);
 const base=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');
 if(nowMinutes<990)base.setUTCDate(base.getUTCDate()-1);
 const expected=new Map([['329200','TIGER 리츠'],['469070','RISE AI&로봇'],
  ['0131V0','1Q 우주항공'],['455030','KODEX SOFR'],
  ['278530','KODEX 200TR'],['0167B0','SOL 위클리커버드콜']]);
 const endpoint='https://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd';
 let confirmed=false,failReason='';
 for(let daysBack=0;daysBack<8&&!confirmed;daysBack++){
  const d=new Date(base);d.setUTCDate(d.getUTCDate()-daysBack);
  if([0,6].includes(d.getUTCDay()))continue;
  const day=d.toISOString().slice(0,10).replaceAll('-','');
  try{
   const response=await fetch(endpoint+'?basDd='+day,{
    headers:{AUTH_KEY:key,Accept:'application/json'},
    signal:AbortSignal.timeout(15000)
   });
   if(!response.ok){
    failReason='KRX HTTP '+response.status+(response.status===401||response.status===403?' (key approval or ETF service permission)':'');
    if([401,403,429].includes(response.status))break;
    continue;
   }
   const payload=await response.json();
   if(!Array.isArray(payload?.OutBlock_1)){
    failReason='KRX response does not include the expected OutBlock_1 records (check ETF API service permission)';
    break;
   }
   const found=new Set();
   for(const rec of payload.OutBlock_1){
    const ticker=[rec.ISU_SRT_CD,rec.ISU_CD,rec.ISU_SHORT_CD,rec.SRT_CD]
     .filter(x=>x!==null&&x!==undefined)
     .map(x=>String(x).trim().toUpperCase().replace(/^A(?=[0-9A-Z]{6}$)/,''))
     .find(x=>expected.has(x));
    if(ticker)found.add(ticker);
   }
   if(!payload.OutBlock_1.length){failReason='No completed-session rows for requested date';continue;}
   console.log('KRX API authorized; completed trade date: '+day);
   console.log('Six configured ETF symbol matches: '+found.size+'/6');
   console.log('This job does NOT log, save, or publish prices, NAV, or other KRX data.');
   if(found.size!==expected.size){
    console.error('FAIL: ETF codes or API data format needs validation.');
    process.exitCode=1;
   }
   confirmed=true;
  }catch(err){
   failReason=err?.name==='TimeoutError'?'KRX request timeout':'KRX request could not be completed or parsed';
  }
 }
 if(!confirmed){
  console.error('FAIL: '+(failReason||'No verified KRX daily response in recent sessions'));
  console.error('Check KRX API key approval and separate ETF daily-data service approval. Do not share your key.');
  process.exitCode=1;
 }
}
