/**
 * PRE-DEPLOY CONTRACT CHECK. Synthetic fixtures only; no real holdings or broker API.
 * These guard existing agreed rules. Passing is not proof of exchange-realtime prices.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const txt=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=txt('index.html'), brokerCode=txt('unattended-orders.js');
const liveCode=txt('live-prices.js'), portfolioCode=txt('portfolio-import.js');
let n=0;
function equal(a,b,label){assert.deepEqual(a,b,label);console.log('OK',++n,label)}
function truth(v,label){assert.ok(v,label);console.log('OK',++n,label)}
function storage(data={}){
 const map=new Map(Object.entries(data).map(([k,v])=>[k,JSON.stringify(v)]));
 return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),
  removeItem:k=>map.delete(k),read:k=>JSON.parse(map.get(k)||'null')};
}
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
}).formatToParts(new Date()).map(v=>[v.type,v.value]));
const today='20261102';
const loc=storage();
const win={ISA_livePriceFetch:{active:()=>true}};
const FixedDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-02T05:00:00.000Z']));}static now(){return Date.parse('2026-11-02T05:00:00.000Z');}};
const appCode=html.slice(html.indexOf('var FUNDS='),html.indexOf('function chart(bars){'));
truth(appCode.includes('window.ISA_KR_APP='),'domestic decision module is present');
const app=new Function('window','localStorage','document','Date',appCode+
 '\nreturn {FUNDS,defaults,settings,positions,byId,manual,verdict,pairPlan,solDailyEntry,effectiveCap,current,freshQuote,setQuotes:q=>liveQuotes=q};')(
 win,loc,{getElementById:()=>null},FixedDate);
equal(app.FUNDS.map(x=>[x.id,x.code]),[
 ['reit','329200'],['robot','469070'],['space','0131V0'],
 ['sofr','455030'],['tr','278530'],['sol','0167B0']
],'Korean symbols and code identifiers');
equal([app.defaults.robotCap,app.defaults.spaceCap,app.defaults.solCap,app.defaults.trBase],
 [9500,9700,10000,31150],'Korean direct price caps and KODEX watch base');
equal(app.defaults.capMode,'auto','moving-average calculation enabled by default');
truth(html.indexOf('id="cap-settings"')<html.indexOf('id="summary"'),
 'manual limit controls appear above Korean stock recommendations');
for(const id of ['robotCap','spaceCap','solCap'])
 equal(html.split('id="'+id+'"').length-1,1,id+' manual cap input exists exactly once');
const bars=(id,price,date=today)=>({id,ok:true,date,close:price,low20:8800,high20:11500,
 bars:Array.from({length:40},()=>({date,open:price,high:price+50,low:price-50,close:price})),
 trend:{ma5:price-50,previousMa5:price-35,ma20:price+150,previousMa20:price+120,
  maRising:false,ma5Above20:false,twoDaysAbove:false,deadCross:false,goldenCross:false,
  crossUp:false,crossDown:false}});
for(const [id,p] of Object.entries({reit:3805,robot:9300,space:9350,sofr:11500,tr:33685,sol:9750}))
 app.byId[id]=bars(id,p);
app.positions.robot={avg:9500,qty:3};
app.positions.space={avg:9600,qty:3};
const trade=p=>({price:p,tradeAt:'2026-11-02T05:00:00.000Z',date:today,method:'published'});
const verdict=id=>app.verdict(app.FUNDS.find(f=>f.id===id));
app.settings.capMode='manual'; // Preserve the legacy manual-price tests while evaluating new auto mode independently.
for(const [robot,space,solPrice,reit,sol] of [
 [9300,9350,9400,1,0],[9501,9350,9400,2,1],
 [9300,9701,9400,2,1],[9501,9701,9400,3,1],
 [9501,9350,9750,4,0],[9501,9701,9750,4,0],
 [9501,9701,10001,4,0]
]){
 app.setQuotes({robot:trade(robot),space:trade(space),sol:trade(solPrice)});
 equal([app.pairPlan().reitQty,app.pairPlan().solQty],[reit,sol],
  'robot='+robot+' space='+space+' SOL '+solPrice+' -> REIT '+reit+' SOL '+sol);
 equal([verdict('reit').qty,verdict('sol').qty],[reit,sol],
  'visible share quantities match daily SOL and REIT rules');
}
equal(app.solDailyEntry().state,'stop','SOL over price cap is no-buy');
app.setQuotes({robot:trade(9501),space:trade(9701)});
equal([app.pairPlan().reitQty,app.pairPlan().solQty],[3,null],
 'unconfirmed SOL quote does not trigger a four-share fallback');
equal(app.solDailyEntry().state,'wait','SOL missing quote is unknown rather than confirmed stop');
loc.setItem('isa-unattended-order-status-v1',JSON.stringify({
 robot:{status:'running',checkedDate:parts.year+'-'+parts.month+'-'+parts.day},
 space:{status:'running',checkedDate:parts.year+'-'+parts.month+'-'+parts.day}
}));
app.setQuotes({robot:trade(9501),space:trade(9701),sol:trade(9400)});
equal(app.pairPlan().reitQty,3,'broker-running log cannot override price-based entry decision');
app.setQuotes({robot:trade(9300),space:trade(9685),sol:trade(9400)});
equal(verdict('space').type,'wait','below price cap alone is not sufficient for BUY');
equal(app.pairPlan().known,true,'fresh-price technical WAIT is no BUY today for the paired plan');
equal([app.pairPlan().reitQty,app.pairPlan().solQty],[2,1],
 'robot BUY and aerospace priced no-BUY -> REIT 2 shares and SOL 1 share');
equal(verdict('sol').qty,1,'SOL follows confirmed one-no-buy plan under its own price cap');
app.setQuotes({robot:trade(9300),sol:trade(9400)});
equal(app.pairPlan().known,false,'no verified aerospace price keeps conditional extras unknown');
equal(app.pairPlan().reitQty,1,'REIT base one share remains when space price unavailable');
equal(verdict('reit').qty,1,'REIT base one share still displayed as BUY');
app.setQuotes({robot:trade(9300),space:trade(9685),sol:trade(9400)});
app.manual.robot=25000;
equal(app.current(app.byId.robot,'robot'),9300,'verified quote outranks manually entered old price');
app.setQuotes({});
app.byId.robot=bars('robot',9300,'20260102');
equal(verdict('robot').type,'wait','stale daily candle cannot generate a new BUY');
equal(verdict('tr').type,'wait','KODEX 200TR remains watch order, not a trading command');
app.setQuotes({robot:trade(9300),space:{...trade(9701),tradeAt:'2026-11-02T04:00:00Z'},sol:trade(9400)});
equal(app.freshQuote('space'),null,'60-minute-old intraday quote rejected');
equal(verdict('space').type,'wait','expired quote cannot trigger BUY or STOP');
app.setQuotes({robot:trade(9300),space:{...trade(9701),tradeAt:'2026-11-01T06:30:00Z'},sol:trade(9400)});
equal(app.freshQuote('space'),null,'prior-day quote rejected');

// Moving-average mode: compare each validated intraday price with dynamic cap.
delete app.manual.robot; // Clear the earlier manual-price test override.
app.settings.capMode='auto';
app.byId.robot=bars('robot',9300);
app.byId.space=bars('space',9350);
app.byId.sol=bars('sol',9750);
app.setQuotes({robot:trade(9300),space:trade(9350),sol:trade(9400)});
equal(app.effectiveCap('robot').value,9260,'weak trend auto cap is 98% of MA20 rounded to 5 KRW');
equal(verdict('robot').type,'stop','live market quote over dynamic cap blocks new robot purchase');
equal(app.solDailyEntry().state,'buy',"SOL qualifies with verified intraday quote below its dynamic cap and low-zone signal");
const trendRobot=app.byId.robot.trend;
trendRobot.ma5=9100;trendRobot.ma20=9000;trendRobot.maRising=true;
equal(app.effectiveCap('robot').value,9180,'rising trend auto cap is 102% of MA20');
app.setQuotes({robot:trade(9150),space:trade(9350),sol:trade(9400)});
equal(verdict('robot').type,'buy','fresh robot quote below dynamic cap still respects existing entry conditions');
app.settings.robotCap=9000;
equal(app.effectiveCap('robot').value,9000,'user-defined cap is always a hard upper bound in auto mode');
equal(verdict('robot').type,'stop','manual user cap overrides higher moving-average cap');
app.settings.robotCap=9500;
app.settings.capMode='manual';
equal(app.effectiveCap('robot').value,9500,'manual mode bypasses automatic MA cap');
app.settings.capMode='auto';
app.byId.sol=bars('sol',9750,'20260102');
equal(app.solDailyEntry().state,'wait','missing/expired SOL daily bars cannot produce a substitute trade');
equal(app.effectiveCap('sol').value,null,'invalid MA data never invents a dynamic upper limit');
app.byId.sol=bars('sol',9750);
app.settings.capMode='manual';
const isMonday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',weekday:'short'})
 .format(new Date())==='Mon';
equal(verdict('sofr').qty,1,'SOFR 1 share on fixed Monday');
equal(verdict('sofr').type,'buy','SOFR Monday recurrence is BUY regardless of trend');
const TuesdayDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-03T05:00:00.000Z']));}static now(){return Date.parse('2026-11-03T05:00:00.000Z');}};
const tueApp=new Function('window','localStorage','document','Date',appCode+
 '\nreturn {FUNDS,verdict};')({ISA_livePriceFetch:{active:()=>false}},loc,{getElementById:()=>null},TuesdayDate);
const tuesdaySofr=tueApp.verdict(tueApp.FUNDS.find(x=>x.id==='sofr'));
equal([tuesdaySofr.type,tuesdaySofr.qty],['wait',0],
 'SOFR Tuesday is zero shares today, not a daily BUY signal');
truth(tuesdaySofr.title.includes('다음 월요일'),
 'SOFR non-Monday is a scheduled weekly buy, not price-data failure');
const planHost={innerHTML:''};
const planSrc=html.slice(html.indexOf('function renderPlan(){'),html.indexOf('function render(){'));
const planApp=new Function('window','localStorage','document','Date',appCode+'\n'+planSrc+
 '\nreturn {renderPlan};')({ISA_livePriceFetch:{active:()=>false}},loc,
 {getElementById:id=>id==='plan'?planHost:null},FixedDate);
planApp.renderPlan();
truth(planHost.innerHTML.includes('KODEX 미국달러SOFR 1주 (월요일 정기매수 예정 · 예상가격 미확인)'),
 'SOFR Monday scheduled 1 share stays visible with missing bar price, without guessed cost');

const head=source=>source.slice(0,source.indexOf('function mount(){'))
 .replace(/^\/\*[\s\S]*?\*\/\s*\(function\(\)\{\s*'use strict';/,'');
win.ISA_KR_APP={pairPlan:app.pairPlan,effectiveCap:app.effectiveCap,decisions:()=>app.FUNDS.map(f=>{
 const d=app.verdict(f),x=app.byId[f.id];
 return {id:f.id,type:d.type,title:d.title,reason:d.info,qty:d.qty,quote:x?.close,
  quoteDate:parts.year+'-'+parts.month+'-'+parts.day,hasIntraday:false};
})};
const broker=new Function('window','localStorage',head(brokerCode)+
 '\nreturn {plan,decisions,rows,budget,mondaysThisMonth,tossDailyKrw};')(win,loc);
equal(broker.plan.monthlyMax,1000000,'monthly 1m KRW ceiling unchanged');
equal(['schd','spym','agnc','cony'].map(x=>broker.tossDailyKrw(x)),
 [4000,3000,3000,15000],'US fractional daily KRW contributions unchanged');
equal(broker.decisions().cony.value,'pause','CONY remains paused, no automatic restart');
equal(broker.rows().filter(x=>x.mode==='자동감시주문').map(x=>x.id),
 ['tr'],'only KODEX 200TR is broker price-watch order');
equal(broker.plan.sofrWeekly,1,'SOFR recurring 1 share per Monday');
truth(broker.decisions().sofr.label.includes('월요일'),
 'broker schedule displays weekly SOFR, not technical pause');
truth(broker.rows().find(x=>x.id==='sofr').label.includes('월요일'),
 'broker SOFR order row displays weekly schedule');
equal(broker.rows().find(x=>x.id==='sofr').mode,'매주 월요일 주식모으기',
 'SOFR order schedule remains weekly not daily');
equal(broker.budget().sofrMonthly,11500*broker.mondaysThisMonth(),
 'monthly budget counts Mondays rather than weekdays for SOFR');
equal(broker.budget().cash,150000,'paused CONY 15000 KRW x 10-day reserve');

const liveBody=liveCode.replace(/^\/\*[\s\S]*?\*\/\s*\(function\(\)\{\s*'use strict';/,'')
 .replace(/\}\)\(\);\s*$/,'');
const feed=new Function('window',liveBody+'\nreturn {parseResponse,parsePublished};')({});
const now=new Date('2026-11-02T08:54:00Z');
const symbols=[{id:'space',code:'0131V0'}];
equal(feed.parseResponse({datas:[{itemCode:'0131V0',closePrice:'9,685',
 localTradedAt:'2026-11-02T15:30:00+09:00'}]},symbols,now).space.price,9685,
 'validated source code/market timestamp used for price');
const packet={kstDate:'20261102',fetchedAt:'2026-11-02T08:53:35Z',
 items:[{id:'space',code:'0131V0',price:9685,tradeAt:'2026-11-02T06:30:00Z'}]};
equal(feed.parsePublished(packet,symbols,now).space.price,9685,
 'published quote requires same market day');
for(const [invalid,label] of [
 [{...packet,kstDate:'20261030'},'incorrect market day rejected'],
 [{...packet,fetchedAt:'2026-11-01T08:53:35Z'},'stale publish timestamp rejected'],
 [{...packet,items:[{...packet.items[0],code:'005930'}]},'wrong ticker rejected']
]){
 assert.throws(()=>feed.parsePublished(invalid,symbols,now),label);console.log('OK',++n,label);
}
assert.throws(()=>feed.parseResponse({datas:[{itemCode:'0131V0',closePrice:'9,685'}]},
 symbols,now),'no verified trade-time -> no signal');console.log('OK',++n,'missing trade time rejected');

const privateStore=storage({
 'isa-private-positions-v1':{reit:{qty:77,avg:3000,snapshotDate:'2026-11-01'}},
 'isa-us-holdings-v1':{cony:{qty:17.5,krwAvg:21500,krwNet:12345,krwSnapshotDate:'2026-11-01'}}
});
const sample=['2026-10-31',
 ...['space','sol','tr','reit','sofr','robot'].map(x=>'K:'+x+':2:7000:7100:200'),
 ...['schd','spym','cony','agnc','spacex'].map(x=>'U:'+x+':1.25:25000:-300'),
 'T:190000:-2000'].join(';');
const location={hash:'#portfolio='+encodeURIComponent(sample),pathname:'/Jungho/',search:''};
const pWindow={location,history:{state:null,replaceState(){location.hash='';}}};
const portfolioHead=portfolioCode.slice(0,portfolioCode.indexOf('const report=importSnapshot();'))
 .replace(/^\/\*[\s\S]*?\*\/\s*\(function\(\)\{\s*'use strict';/,'');
const importer=new Function('window','localStorage',portfolioHead+
 '\nreturn {importSnapshot};')(pWindow,privateStore);
equal(importer.importSnapshot().kind,'success','private snapshot can import synthetic sample');
equal(privateStore.read('isa-private-positions-v1').reit.qty,77,
 'newer Korean holdings never overwritten by prior snapshot');
equal(privateStore.read('isa-us-holdings-v1').cony.qty,17.5,
 'newer US holdings never overwritten by prior snapshot');
equal(privateStore.read('isa-us-holdings-v1').cony.krwNet,12345,
 'existing cumulative post-tax distributions preserved');
equal(location.hash,'','private holdings fragment removed from URL');
// Combined same-date user-screenshot import: Kiwoom, US quantities, Toss KR and CONY notes.
const combinedSample=['2026-11-05',
 ...['space','sol','tr','reit','sofr','robot'].map(id=>'K:'+id+':5:8000:7500:-2500'),
 ...['schd','spym','cony','agnc','spacex'].map(id=>'U:'+id+':2.5:40000:-800'),
 ...['schd','spym','cony','agnc','spacex'].map(id=>'B:'+id+':2.5:15000'),
 ...['tsofr','treit','ttr','biotech','tspace','media','trobot','hongah','sensor']
  .map(id=>'D:'+id+':9:26000:-7500'),
 'N:cony:5000:1000'].join(';');
location.hash='#portfolio='+encodeURIComponent(combinedSample);
equal(importer.importSnapshot().kind,'success','all market groups import together without Toss whole-account total');
equal(privateStore.read('isa-private-positions-v1').robot.qty,5,'Kiwoom snapshot updated from new date');
equal(privateStore.read('isa-us-holdings-v1').cony.krwAvg,15000,'exact Toss KRW average cost applied');
equal(privateStore.read('isa-us-holdings-v1').cony.krwNet,12345,
 'existing CONY confirmed net distribution amount is never overridden by note');
equal(privateStore.read('isa-private-toss-domestic-snapshot-v1').rows.treit.qty,9,
 'Toss domestic holdings stored separately from Kiwoom');
equal(privateStore.read('isa-user-portfolio-snapshot-v1').conyNote.total,5000,
 'gross/unspecified CONY dividends stored only as separate note');
equal(privateStore.read('isa-user-portfolio-snapshot-v1').conyNote.increment,1000,
 'recent increase in CONY dividend note preserved');
equal(location.hash,'','complete portfolio fragment removed from browser address');
truth(!portfolioCode.includes('isa-us-distributions-krw-v1'),
 'import never writes to verified payout ledger');
console.log('PASS: '+n+' contract checks. This gate does NOT certify actual live quote accuracy.');
