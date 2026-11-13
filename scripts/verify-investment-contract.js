/**
 * PRE-DEPLOY CONTRACT CHECK. Synthetic fixtures only; no real holdings or broker API.
 * These guard existing agreed rules. Passing is not proof of exchange-realtime prices.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const txt=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=txt('index.html'), brokerCode=txt('unattended-orders.js');
const liveCode=txt('live-prices.js'), portfolioCode=txt('portfolio-import.js');
const usKrwCode=txt('us-krw.js');
const usDashboardCode=txt('us-dashboard.js');
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
 '\nreturn {FUNDS,defaults,settings,positions,byId,manual,verdict,pairPlan,solDailyEntry,effectiveCap,ma20Comparison,current,freshQuote,setQuotes:q=>liveQuotes=q};')(
 win,loc,{getElementById:()=>null},FixedDate);
equal(app.FUNDS.map(x=>[x.id,x.code]),[
 ['reit','329200'],['sol','0167B0'],['robot','469070'],
 ['space','0131V0'],['sofr','455030'],['tr','278530']
],'Korean ETF cards and symbols ordered REIT SOL Robot Space SOFR 200TR');
truth(html.indexOf('id="funds"')<html.indexOf('id="us-panel"'),
 'all six Korean ETF cards appear before the US stocks section');
truth(brokerCode.includes("const KR=['reit','sol','robot','space','sofr']"),
 'broker checklist preserves same Korean ETF order before the TR watch item');
truth(portfolioCode.includes("const KR=['reit','sol','robot','space','sofr','tr']"),
 'stored portfolio snapshot uses the same Korean ETF order');
equal([app.defaults.robotCap,app.defaults.spaceCap,app.defaults.solCap,app.defaults.trBase],
 [9500,9700,10000,31150],'Korean direct price caps and KODEX watch base');
equal(app.defaults.capMode,'ma','moving-average-only is the default buy cap mode');
for(const mode of ['ma','manual','both'])truth(html.includes('value="'+mode+'"'),mode+' appears in mode selector');
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
truth(!html.includes('id="ma20-panel"'),
 'standalone top 20-day moving average panel has been removed');
truth(html.includes('function renderMa20InCard(id)'),
 'moving average is rendered directly inside each ETF card');
truth(html.includes('avgText+renderMa20InCard(f.id)+tag'),
 'moving average appears after average-cost comparison and before buy status');
truth(html.includes('20일선 대비'),
 'card shows price-to-MA20 distance in KRW and percent');
equal(app.ma20Comparison('reit').ma20,3955,'20-day moving average is derived from confirmed bar data');
equal(app.ma20Comparison('reit').delta,-150,'20-day price difference uses latest confirmed close');
truth(app.ma20Comparison('reit').note.includes('하락 추세 주의'),
 '20-day bearish reading is an observation, not a forced BUY');
app.setQuotes({reit:{price:4000,tradeAt:'2026-11-02T05:00:00.000Z',date:today,method:'published'}});
equal(app.ma20Comparison('reit').price,4000,'verified same-day quote is compared against confirmed 20-day mean');
app.byId.reit=bars('reit',3805,'20260102');
equal(app.ma20Comparison('reit').ready,false,'stale moving average is not shown as current');
app.byId.reit=bars('reit',3805);
app.setQuotes({});
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
app.settings.capMode='ma';
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
equal(app.effectiveCap('robot').value,9180,'MA-only uses calculated upper cap and ignores lower manual price limit');
equal(verdict('robot').type,'buy','MA-only decision independent from manually entered ceiling');
app.settings.capMode='both';
equal(app.effectiveCap('robot').value,9000,'combined chooses lower of MA and manual upper cap');
equal(verdict('robot').type,'stop','combined cap blocks live price over the manually specified limit');
app.settings.capMode='manual';
equal(app.effectiveCap('robot').value,9000,'manual-only uses exactly the user-entered upper cap');
equal(verdict('robot').type,'stop','manual-only blocks quote above user-entered price limit');
app.settings.robotCap=9500;
equal(app.effectiveCap('robot').value,9500,'manual-only ignores lower moving-average ceiling');
equal(verdict('robot').type,'buy','manual-only permits quote under manual cap when other criteria hold');
app.settings.capMode='both';
equal(app.effectiveCap('robot').value,9180,'combined selects MA cap when it is lower than manual cap');
app.settings.capMode='ma';
app.settings.capMode='ma';
app.byId.sol=bars('sol',9750,'20260102');
equal(app.solDailyEntry().state,'wait','missing/expired SOL daily bars cannot produce a substitute trade');
equal(app.effectiveCap('sol').value,null,'invalid MA data never invents a dynamic upper limit');
app.settings.capMode='manual';
equal(app.effectiveCap('sol').value,10000,'manual cap value remains available without recent MA bars');
app.settings.capMode='both';
equal(app.effectiveCap('sol').value,null,'combined mode refuses to fabricate a missing MA cap');
app.settings.capMode='ma';
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
truth(html.includes('data-auto-kr-id='),'Korean holding editor has automatically sourced read-only reference prices');
truth(html.includes("querySelectorAll('input[data-pos]')"),
 'read-only Korean prices never trigger cost-basis/quantity edits');
truth(html.includes('확정 일봉 종가 · 당일 현재가 아님'),
 'Korean previous close is identified as historical, not a live price');
truth(usKrwCode.includes('data-auto-krw-id='),
 'US holding editor displays an automatically calculated KRW price');
truth(usKrwCode.includes('data-auto-krw-id="'+String.fromCharCode(39)),
 'US editor uses distinct non-editable auto quote input');
truth(usKrwCode.includes("querySelectorAll('input[data-krw-id]')"),
 'US auto quote display is excluded from manual-holdings save handler');
truth(usKrwCode.includes("window.addEventListener('isa-us-quotes-refreshed',()=>render())"),
 'US auto quote display refreshes after published US market data changes');
truth(usKrwCode.includes("if(k==='krwCurrent')p.krwDay="),
 'US Toss user-confirmed manual price still expires daily');
truth(usKrwCode.includes("const LEDGER_KEY='isa-us-distributions-krw-v1'"),
 'US historical distribution ledger remains untouched');

truth(usDashboardCode.includes("date(x.date)+' 확정 종가 × 참고 환율 · 실시간 호가 아님'"),
 'US cards clearly label per-symbol date of completed close');
truth(usDashboardCode.includes("'매수중 기록'")&&usDashboardCode.includes("'일시중지 기록'"),
 'US historic broker notes cannot appear as authenticated live broker states');
truth(usDashboardCode.includes('마지막 사용자 확인 '),
 'US card identifies last manual confirmation date');
truth(usDashboardCode.includes("fetch('./us-quotes.json?refresh="),
 'US source remains an explicitly non-live published JSON data file');
// The public TradingView ticker is an independent, possibly delayed USD display.
// Never read embedded widget text into holdings, valuations, orders or MA signals.
truth(html.includes('src="https://widgets.tradingview-widget.com/w/en/tv-ticker-tape.js"'),
 'TradingView ticker tape is loaded using the official external module');
truth(html.includes('symbols="AMEX:SCHD,NASDAQ:AGNC,AMEX:SPYM,AMEX:CONY"'),
 'all four requested US symbols appear in the same watchlist');
truth(html.indexOf('id="us-intraday"')>html.indexOf('id="us-panel"')&&
 html.indexOf('id="us-intraday"')<html.indexOf('id="us-cards"'),
 'delayed intraday quotes are above the existing close-based US cards');
truth(html.includes('위젯 수치는 현재 매수판단·평가손익에 자동 반영되지 않습니다.'),
 'US widget price is clearly separated from order decisions and KRW valuation');
truth(!usDashboardCode.includes('tv-ticker-tape')&&!usKrwCode.includes('tv-ticker-tape'),
 'US trading decision and cost basis never consume external widget DOM');
// TradingView widget prices cannot be read programmatically. Verify explicit user confirmation.
for(const path of ['us-dashboard.js','us-krw.js'])
 truth(!!new vm.Script(txt(path),{filename:path}),path+' is valid JavaScript');
truth(html.includes('id="tv-price-apply"')&&html.includes('id="tv-price-confirm"')&&
 html.includes('id="tv-price-clear"'),'user-confirmed TV inputs and clear button exist');
for(const symbol of ['schd','agnc','spym','cony'])
 truth(html.includes('data-tv-usd="'+symbol+'"'),symbol+' can be individually price-confirmed');
truth(usDashboardCode.includes("TV_TTL_MS=30*60*1000"),
 'user-observed quotes expire automatically after 30 minutes');
truth(usDashboardCode.includes("sessionStorage.setItem(TV_KEY"),
 'confirmed price records stay within browser tab session');
truth(usDashboardCode.includes("window.dispatchEvent(new Event('isa-tv-user-reference-changed'))"),
 'explicit confirmation triggers valuation refresh event');
truth(usKrwCode.includes("if(rate&&tv&&finitePositive(tv.usd))"),
 'user-confirmed USD quote must have verified reference FX before KRW conversion');
truth(usKrwCode.includes("kind:'tv-user-confirmed'"),
 'manual TradingView observation has explicit provenance separate from Toss price');
truth(usKrwCode.includes("source:'미국장 USD 종가 × '"),
 'quote expires back to original completed US daily close price');

const observedStart=usDashboardCode.indexOf('function observedQuote(id){');
const observedEnd=usDashboardCode.indexOf('function recoverTvQuotes(){',observedStart);
truth(observedStart>=0&&observedEnd>observedStart,'confirmed price getter can be inspected');
const tctx=vm.createContext({tvObserved:{schd:{usd:42.5,confirmedAt:new Date().toISOString()}},
 TV_TTL_MS:1800000,valid:v=>Number(v)>0&&Number.isFinite(Number(v)),Date,Number});
vm.runInContext(usDashboardCode.slice(observedStart,observedEnd)+'\nthis.readQuote=observedQuote;',tctx);
equal(tctx.readQuote('schd').usd,42.5,'fresh user-confirmed quote is available for valuation');
tctx.tvObserved.schd.confirmedAt=new Date(Date.now()-31*60000).toISOString();
equal(tctx.readQuote('schd'),null,'31-minute-old price cannot be used for valuation');

const kStart=usKrwCode.indexOf('function priceKrw(id,priceUsd){');
const kEnd=usKrwCode.indexOf('// Automated public reference quote',kStart);
truth(kStart>=0&&kEnd>kStart,'KRW conversion function can be inspected');
const convert=new Function('holdings','finitePositive','day','fx','window',
 usKrwCode.slice(kStart,kEnd)+'\nreturn priceKrw;');
const validPositive=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>0;
const chosen={observedQuote:()=>({usd:42.5,confirmedAt:'2026-11-13T10:00:00Z'})};
const priceFromTv=convert(()=>({}),validPositive,()=> '2026-11-13',
 ()=>({rate:1400,source:'test FX'}),{ISA_US_APP:chosen});
equal(priceFromTv('schd',39).amount,59500,'confirmed 42.50 USD × 1400 KRW is used for personal valuation');
equal(priceFromTv('schd',39).kind,'tv-user-confirmed','user-entered TV quote is never labeled as API live');
const priceFromClose=convert(()=>({}),validPositive,()=> '2026-11-13',
 ()=>({rate:1400,source:'test FX'}),{ISA_US_APP:{observedQuote:()=>null}});
equal(priceFromClose('schd',39).amount,54600,'expired or missing TV input falls back to 39 USD completed close');
const directToss=convert(()=>({schd:{krwCurrent:61000,krwDay:'2026-11-13'}}),validPositive,
 ()=> '2026-11-13',()=>({rate:1400,source:'test FX'}),{ISA_US_APP:chosen});
equal(directToss('schd',39).amount,61000,'user-confirmed Toss KRW value keeps priority over TV observation');
truth(usDashboardCode.includes("manual?manual.usd:live?live.usd:x?Number(x.close):null"),
 'US valuation uses user-confirmed price first, recent private price second, daily close last');
truth(usDashboardCode.includes("valid(manual[f.id])?Number(manual[f.id]):x?Number(x.close):null"),
 'daily-bar trend detail is never silently changed by intraday quote');
// Optional private personal-US feed: API keys remain in Cloudflare Secrets, never in GitHub.
const feedCode=txt('personal-us-live.js'),workerCode=txt('private-us-quotes-worker.js');
const stampCode=txt('scripts/stamp-assets.js');
truth(stampCode.includes("'personal-us-live.js','us-dashboard.js'"),
 'personal quote connector asset MUST be cache-busted on each site deployment');
const pagesWorkflow=txt('.github/workflows/pages.yml');
truth(/cp index\.html[^\n]*\bpersonal-us-live\.js\b[^\n]*\bsite\//.test(pagesWorkflow),
 'GitHub Pages deploy MUST copy personal quote connector script before reporting success');
truth(!!new vm.Script(feedCode,{filename:'personal-us-live.js'}),
 'mobile personal feed is valid browser-side JavaScript');
truth(!!new vm.Script(workerCode.replace('export default {','const worker = {'),
   {filename:'private-us-quotes-worker.js'}),
 'free Worker bridge is valid JavaScript');
truth(html.includes('src="./personal-us-live.js" defer')&&
 html.indexOf('src="./personal-us-live.js" defer')<
 html.indexOf('src="./us-dashboard.js" defer'),
 'private source is available before US valuation dashboard');
truth(html.includes('id="us-live-url"')&&html.includes('id="us-live-secret"')&&
 html.includes('id="us-live-connect"')&&html.includes('id="us-live-badge"'),
 'mobile dashboard can configure private personal endpoint');
truth(workerCode.includes("const ALLOWED_ORIGIN='https://pdk7101.github.io'")&&
 workerCode.includes("request.headers.get('Authorization')")&&
 workerCode.includes('env.FINNHUB_API_KEY')&&workerCode.includes('env.VIEW_TOKEN'),
 'Worker must require explicit authentication and private provider key');
truth(workerCode.includes("request.method!=='GET'||url.pathname!=='/quotes'"),
 'Worker exposes read-only quote path, not orders/account access');
truth(workerCode.includes('X-Finnhub-Token')&&
 workerCode.includes("Cache-Control':'private, no-store"),
 'provider key sent only to Finnhub; personal response is not publicly cached');
truth(feedCode.includes("setInterval(refresh,120000)")&&
 feedCode.includes("sessionStorage.setItem(VIEW_KEY,access)"),
 'free bridge polls at most once every two minutes with session-only viewer token');
truth(feedCode.includes("Worker 주소 형식 오류:")&&
 feedCode.includes("개인 접근 암호 길이 부족: 현재 ")&&
 feedCode.includes("access.length<20"),
 'mobile connection separately identifies malformed Worker address and short VIEW_TOKEN without exposing its value');
truth(html.includes('id="us-live-secret-hint"')&&
 feedCode.includes('function accessHint(){')&&
 feedCode.includes("accessHint();"),
 'the mobile UI explains same-tab secret reuse without displaying the credential');
truth(feedCode.includes("url&&url===endpoint&&password.length>=20?password")&&
 feedCode.includes("url&&url===cachedUrl&&cachedAccess.length>=20?cachedAccess"),
 'blank token input reuses only a previously saved token for exactly the same Worker URL');
truth(feedCode.includes("$('us-live-secret').value=''; // Never leave secret readable")&&
 !feedCode.includes("localStorage.setItem(VIEW_KEY"),
 'input is cleared; non-opt-in session token is not written to durable localStorage');
truth(html.includes('id="us-live-remember"')&&
 feedCode.includes("if($('us-live-remember')?.checked)")&&
 feedCode.includes('elapsed>REMEMBER_MAX_MS')&&
 feedCode.includes('saved.url===url'),
 'on-device token persistence is opt-in, 30-day-limited, and scoped to its original Worker');
truth(feedCode.includes('개인 시세 서버 응답 성공 · 유효한 최근 체결 0/4'),
 'authenticated quote response with outdated trades is distinguished from a connection failure');
truth(feedCode.includes('now-t>TRADE_TTL')&&feedCode.includes('now-f>RESPONSE_TTL'),
 'client rejects expired trade and stale API response');
truth(usKrwCode.includes("kind:'finnhub-private'")&&
 usKrwCode.includes("isa-personal-us-quote-refreshed"),
 'private US live price is used in KRW valuation and refreshes on new quote');
truth(usDashboardCode.includes("kind==='finnhub-private'"),
 'private price appears with distinct source/date, not as an official Toss quote');

const feedStart=feedCode.indexOf('function quote(id){'),feedEnd=feedCode.indexOf('function signal(){',feedStart);
truth(feedStart>=0&&feedEnd>feedStart,'client intraday quote validation function accessible');
const currentTrade=new Date(Date.now()-2*60000).toISOString();
const feedContext=vm.createContext({
 IDS:['schd','agnc','spym','cony'],
 quotes:{schd:{usd:42,tradeAt:currentTrade}},
 fetchedAt:new Date().toISOString(),
 TRADE_TTL:45*60000,RESPONSE_TTL:5*60000,
 Date,Number
});
vm.runInContext(feedCode.slice(feedStart,feedEnd)+'\nthis.getQuote=quote;',feedContext);
equal(feedContext.getQuote('schd').usd,42,'recent private confirmed trade accepted');
feedContext.quotes.schd.tradeAt=new Date(Date.now()-46*60000).toISOString();
equal(feedContext.getQuote('schd'),null,'trade older than 45 min is not used as fresh');
feedContext.quotes.schd.tradeAt=currentTrade;
feedContext.fetchedAt=new Date(Date.now()-6*60000).toISOString();
equal(feedContext.getQuote('schd'),null,'stale server response not used as fresh');

const personal=convert(()=>({}),validPositive,()=> '2026-11-13',
 ()=>({rate:1400,source:'test FX'}),
 {ISA_US_APP:{observedQuote:()=>null},
  ISA_PERSONAL_US:{quote:()=>({usd:42,tradeAt:'2026-11-13T10:00:00Z'})}});
equal(personal('schd',39).amount,58800,'private quote 42 USD × 1400 KRW converts automatically');
equal(personal('schd',39).kind,'finnhub-private','private price source kept distinct');
const overridePersonal=convert(()=>({schd:{krwCurrent:61000,krwDay:'2026-11-13'}}),
 validPositive,()=> '2026-11-13',()=>({rate:1400,source:'test FX'}),
 {ISA_US_APP:{observedQuote:()=>null},
  ISA_PERSONAL_US:{quote:()=>({usd:42,tradeAt:'2026-11-13T10:00:00Z'})}});
equal(overridePersonal('schd',39).amount,61000,
 'manually confirmed Toss price takes priority over personal intraday quote');

// Behavioral browser mocks: double-click, reload, optional on-device store, scoped token
// and disconnect. No real credentials, market feeds, or broker orders used.
function fakeStorage(backing=new Map()){
 return {
  getItem:key=>backing.get(key)??null,
  setItem:(key,value)=>backing.set(key,String(value)),
  removeItem:key=>backing.delete(key),
  backing
 };
}
function runFeed(local,session){
 const nodes={};
 const el=id=>{
  if(!nodes[id]){
   const hooks={};
   nodes[id]={
    value:'',checked:false,placeholder:'',textContent:'',
    addEventListener:(type,fn)=>{hooks[type]=fn;},
    invoke:type=>{if(!hooks[type])throw Error(id+' lacks '+type);return hooks[type]();}
   };
  }
  return nodes[id];
 };
 const dom={hidden:true,getElementById:el,addEventListener:()=>{}};
 const ctx={
  localStorage:local,sessionStorage:session,document:dom,
  window:{dispatchEvent:()=>{}},Event:class{constructor(name){this.type=name;}},
  setInterval:()=>0,URL,Date,Number,JSON
 };
 vm.runInNewContext(feedCode,ctx,{filename:'personal-us-live.js'});
 return {el,ctx};
}
const url='https://shy-moon-ff5b.pdk7101.workers.dev';
const sampleToken='SYNTHETIC_PRIVATE_TOKEN_32_TEST_ONLY';
const localFake=fakeStorage(),sessionFake=fakeStorage();
const appOne=runFeed(localFake,sessionFake);
appOne.el('us-live-url').value=url;
appOne.el('us-live-secret').value=sampleToken;
appOne.el('us-live-connect').invoke('click');
equal(appOne.el('us-live-secret').value,'','token input cleared after successful same-tab connect');
truth(sessionFake.getItem('isa-us-private-worker-access-session-v1')===sampleToken,
 'VIEW_TOKEN remembered in sessionStorage for a same-tab click');
truth(!localFake.getItem('isa-us-private-worker-remembered-v1'),
 'without consent, VIEW_TOKEN is not stored persistently');
appOne.el('us-live-connect').invoke('click');
truth(appOne.el('us-personal-status').textContent.includes('저장된 암호로 다시 조회합니다'),
 'repeated connect click reuses in-memory/session secret without asking again');

const reloaded=runFeed(localFake,sessionFake);
reloaded.el('us-live-connect').invoke('click');
truth(reloaded.el('us-personal-status').textContent.includes('저장된 암호로 다시 조회합니다'),
 'reload in the same browser tab reuses session token');

const freshTab=runFeed(localFake,fakeStorage());
freshTab.el('us-live-connect').invoke('click');
truth(freshTab.el('us-personal-status').textContent.includes('개인 접근 암호가 비어 있습니다'),
 'without opt-in, opening a fresh tab does not silently persist a secret');

appOne.el('us-live-remember').checked=true;
appOne.el('us-live-remember').invoke('change');
truth(JSON.parse(localFake.getItem('isa-us-private-worker-remembered-v1')).access===sampleToken,
 'explicit remember selection stores token only on personal device');
const persistedTab=runFeed(localFake,fakeStorage());
equal(persistedTab.el('us-live-remember').checked,true,
 'opted-in personal device remembers the setting in a new tab');
persistedTab.el('us-live-connect').invoke('click');
truth(persistedTab.el('us-personal-status').textContent.includes('저장된 암호로 다시 조회합니다'),
 'opted-in personal device connects in a new tab without retyping');

persistedTab.el('us-live-url').value='https://different-user.other-account.workers.dev';
persistedTab.el('us-live-connect').invoke('click');
truth(persistedTab.el('us-personal-status').textContent.includes('개인 접근 암호가 비어 있습니다'),
 'remembered VIEW_TOKEN is never reused for a different Worker address');

persistedTab.el('us-live-disconnect').invoke('click');
equal(localFake.getItem('isa-us-private-worker-remembered-v1'),null,
 'disconnect deletes persistent remembered access token');

const expiredLocal=fakeStorage(new Map([
 ['isa-us-private-worker-url-v1',url],
 ['isa-us-private-worker-remembered-v1',
  JSON.stringify({url,access:sampleToken,savedAt:Date.now()-31*86400000})]
]));
const expired=runFeed(expiredLocal,fakeStorage());
expired.el('us-live-connect').invoke('click');
truth(expired.el('us-personal-status').textContent.includes('개인 접근 암호가 비어 있습니다'),
 '30-day-old persisted VIEW_TOKEN is rejected');
equal(expiredLocal.getItem('isa-us-private-worker-remembered-v1'),null,
 'expired on-device secret is purged');
console.log('PASS: '+n+' contract checks. This gate does NOT certify actual live quote accuracy.');
