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
truth(html.includes('var avgText=renderHoldingInCard(f.id,p);'),
 'all six Korean ETF cards show local share count and average cost above MA20');
truth(html.includes('data-holding=')&&html.includes('function renderHoldingInCard(id,p){'),
 'Korean ETF holding block uses only local stored positions and not public hardcoded counts');
const holdingStart=html.indexOf('function renderHoldingInCard(id,p){');
const holdingEnd=html.indexOf('function renderMa20InCard(id){',holdingStart);
truth(holdingStart>=0&&holdingEnd>holdingStart,
 'Korean ETF holding formatter can be independently tested');
const syntheticHoldings={reit:{qty:42,avg:3886},robot:{qty:0,avg:''},space:{qty:5,avg:''}};
const holdingFormatter=new Function('positions','qtyValid','valid','avgMoney','safe',
 html.slice(holdingStart,holdingEnd)+'\nreturn renderHoldingInCard;')(
 syntheticHoldings,
 v=>Number.isInteger(Number(v))&&Number(v)>=0&&String(v).trim()!=='',
 v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>0,
 v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:2})+'원',
 v=>String(v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))
);
const reitHolding=holdingFormatter('reit',3690);
truth(reitHolding.includes('보유 42주 · 평단 3,886원')&&
 reitHolding.includes('-5.04%'),
 'REIT card correctly displays 42 owned shares, 3,886 KRW average cost and price difference');
truth(holdingFormatter('robot',8880).includes('보유 0주 (미보유) · 평단 해당 없음'),
 'zero-share Korean ETF is labeled unowned without misleading average cost');
truth(holdingFormatter('space',9700).includes('보유 5주 · 평단 미입력'),
 'quantity remains visible when average purchase price is missing');
truth(holdingFormatter('sol',9300).includes('보유수량 미입력 · 평단 미입력'),
 'missing local holdings never fabricate share count or cost');
truth(app.FUNDS.every(f=>holdingFormatter(f.id,9300).includes('data-holding="'+f.id+'"')),
 'the new holding row handles all six Korean ETF symbols');

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

const head=source=>source.slice(0,source.indexOf('window.ISA_ORDER_PLAN='))
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
truth(!portfolioCode.includes('function renderSnapshot(){')&&
 !portfolioCode.includes('portfolio-screenshot-snapshot')&&
 portfolioCode.includes('const report=importSnapshot();'),
 'old screenshot portfolio panel is removed, but private holdings import is intact');
truth(!brokerCode.includes('function mount(){')&&
 !brokerCode.includes('function render(){')&&
 !brokerCode.includes('매일 주식모으기 실제 주문 상태·예산 확인')&&
 brokerCode.includes('window.ISA_ORDER_PLAN='),
 'broker actual-order/budget panel is removed without changing decision helper API');
truth(!html.includes('.uo-panel')&&!html.includes('.portfolio-shot-row'),
 'obsolete broker order and screenshot snapshot styles are removed from published page');
truth(usKrwCode.includes("const LEDGER_KEY='isa-us-distributions-krw-v1'"),
 'verified after-tax payout ledger is retained in the personal US holdings view');
// Shared holding settings: one edit location for six Kiwoom and four Toss holdings.
const capSection=html.slice(html.indexOf('<section class="panel" id="cap-settings">'),
 html.indexOf('</section>',html.indexOf('<section class="panel" id="cap-settings">')));
truth(capSection.includes('id="holdings-settings"')&&
 capSection.includes('id="positions"')&&
 capSection.includes('id="us-krw-editor"'),
 'both Korean and US portfolio editors appear inside original ETF price-cap settings');
truth(html.split('id="positions"').length===2&&html.split('id="us-krw-editor"').length===2,
 'there is exactly one editor host for each domestic and US market');
truth(!html.includes('id="posDetails"')&&
 !usKrwCode.includes("'<div id=\"us-krw-editor\"></div>'"),
 'duplicate remote holdings editor is removed from page bottom and US summary');
truth(html.includes("querySelectorAll('input[data-pos]')")&&
 html.includes("var avgText=renderHoldingInCard(f.id,p);"),
 'all six Korean ETF cards read locally saved quantity/average cost and listen to editor changes');
truth(html.includes('과거 일봉 종가 · '),
 'Korean previous close is identified as historical, not current live price');
truth(!html.includes('data-auto-kr-id=')&&!usKrwCode.includes('data-auto-krw-id='),
 'central holding form has no redundant read-only current-price inputs');
truth(usKrwCode.includes("querySelectorAll('input[data-krw-id]')")&&
 usKrwCode.includes("if(k==='qty'||k==='krwAvg')p.krwSnapshotDate=day()"),
 'US fractional quantity and KRW cost edits save in locally stamped holding records');
truth(usKrwCode.includes("if(!write('isa-us-holdings-v1',h))")&&
 usKrwCode.includes("  render();\n }));")&&
 usKrwCode.includes("window.ISA_US_APP?.rerender?.()"),
 'US editor save refreshes live KRW cards and portfolio summary');
truth(usKrwCode.includes("window.addEventListener('isa-us-quotes-refreshed',()=>render())"),
 'US live quote updates keep refreshing the cards and KRW valuation');
truth(usKrwCode.includes("if(k==='krwCurrent')p.krwDay="),
 'optional Toss price correction still expires each day');
truth(usKrwCode.includes("const LEDGER_KEY='isa-us-distributions-krw-v1'"),
 'existing cumulative net KRW distribution ledger is retained');

// Behaviour test: domestic editor change updates a saved position without altering cost basis.
const domesticSrc=html.slice(html.indexOf('function renderPositions(){'),html.indexOf('function renderPlan(){'));
truth(domesticSrc.startsWith('function renderPositions(){')&&domesticSrc.includes("positions[id]=h;persist();render();"),
 'domestic holdings editor source is separately executable and updates cards');
const domesticSaved={reit:{qty:42,avg:3886}},domesticInputs=[];
const domesticMessage={textContent:''},domesticHost={
 innerHTML:'',
 querySelectorAll:()=>domesticInputs
};
const domFn=new Function('el','FUNDS','positions','valid','qtyValid','safe','persist','render',
 domesticSrc+'\nreturn renderPositions;')(
 id=>id==='positions'?domesticHost:domesticMessage,
 [{id:'reit',name:'TIGER 리츠부동산인프라',code:'329200'}],domesticSaved,
 v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number(v)>0&&Number.isFinite(Number(v)),
 v=>String(v).trim()!==''&&Number.isInteger(Number(v))&&Number(v)>=0,
 v=>String(v),()=>{domesticMessage.saved=(domesticMessage.saved||0)+1;},
 ()=>{domesticMessage.rerendered=(domesticMessage.rerendered||0)+1;}
);
const domesticQty={dataset:{pos:'reit',kind:'qty'},value:'43',
 addEventListener:(_name,cb)=>domesticQty.change=cb};
const domesticAvg={dataset:{pos:'reit',kind:'avg'},value:'3910',
 addEventListener:(_name,cb)=>domesticAvg.change=cb};
domesticInputs.push(domesticQty,domesticAvg);
domFn();
truth(domesticHost.innerHTML.includes('data-kind="qty"')&&
 domesticHost.innerHTML.includes('data-kind="avg"'),
 'Korean settings contain dedicated quantity and KRW average purchase fields');
domesticQty.change.call(domesticQty);
equal(domesticSaved.reit.qty,43,'domestic change updates the stored share quantity');
equal(domesticSaved.reit.avg,3886,'changing share quantity preserves previous average cost');
domesticAvg.change.call(domesticAvg);
equal(domesticSaved.reit.avg,3910,'changing KRW average cost updates the existing holdings record');
equal(domesticMessage.rerendered,2,'each valid domestic edit refreshes ETF cards');
domesticQty.value='1.25';domesticQty.change.call(domesticQty);
equal(domesticSaved.reit.qty,43,'domestic non-integer share quantities are rejected safely');

// Behaviour test: US editor updates local investment holdings without overwriting dividends.
const usFormSrc=usKrwCode.slice(usKrwCode.indexOf('function renderForm(){'),
 usKrwCode.indexOf('function importHoldings(){'));
truth(usFormSrc.startsWith('function renderForm(){'),
 'US share and cost editor is separately executable for synthetic local holdings');
let usSaved={schd:{qty:24.330226,krwAvg:47864,krwNet:12345}},usRenders=0;
const usInputs=[],usHost={innerHTML:'',querySelectorAll:()=>usInputs};
const usMsg={textContent:''},usAltMsg={textContent:''};
const usInput={dataset:{krwId:'schd',k:'qty'},value:'25.330226',
 addEventListener:(_name,cb)=>usInput.change=cb};
const usAvg={dataset:{krwId:'schd',k:'krwAvg'},value:'48000',
 addEventListener:(_name,cb)=>usAvg.change=cb};
usInputs.push(usInput,usAvg);
const usFn=new Function('$','ITEMS','holdings','day','finitePositive','write','render',
 usFormSrc+'\nreturn renderForm;')(
 id=>id==='us-krw-editor'?usHost:id==='us-holding-message'?usMsg:usAltMsg,
 ['SCHD','AGNC','SPYM','CONY'],()=>usSaved,()=> '2026-11-14',
 v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>0,
 (key,value)=>{if(key!=='isa-us-holdings-v1')throw Error('unexpected storage key');usSaved=value;return true;},
 ()=>{usRenders++}
);
usFn();
truth(usHost.innerHTML.includes('data-k="qty"')&&
 usHost.innerHTML.includes('data-k="krwAvg"')&&
 usHost.innerHTML.includes('step="0.000001"'),
 'US holdings editor supports fractional share input and KRW average price');
usInput.change();
equal(usSaved.schd.qty,25.330226,'US fractional share change updates local holdings');
equal(usSaved.schd.krwNet,12345,'US edit preserves existing cumulative after-tax distributions');
usAvg.change();
equal(usSaved.schd.krwAvg,48000,'US average cost is stored in KRW');
equal(usRenders,2,'US edits trigger card and portfolio re-render');

// The mobile US portfolio has one private live price feed with safe EOD fallback.
// Redundant TradingView widget and old USD editor must never reappear.
truth(usDashboardCode.includes("'직전 확정 종가 '+date(x.date)")&&
 usDashboardCode.includes("기술 분석용 확정 일봉"),
 'US fallback is explicitly dated as completed previous-session close');
truth(usDashboardCode.includes("'장중 시세 미연결'")&&
 usDashboardCode.includes("'장중 시세 조회 실패'")&&
 usDashboardCode.includes("'장중 시세 미수신·만료'"),
 'US cards distinguish disconnected feed, failed request, and expired intraday trade');
truth(usDashboardCode.includes("short:'Finnhub 장중 체결'")&&
 usDashboardCode.includes("month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'"),
 'valid US intraday trade shows time in Korean local timezone');
truth(!usDashboardCode.includes("'매수중 기록'")&&
 !usDashboardCode.includes("'일시중지 기록'")&&
 !usDashboardCode.includes("ISA_ORDER_PLAN?.note")&&
 !html.includes('us-list-state'),
 'US price cards no longer show manually recorded broker order statuses');
truth(usDashboardCode.includes("fetch('./us-quotes.json?refresh="),
 'completed US daily bars stay available for technical analysis');
truth(!html.includes('tv-ticker-tape')&&!html.includes('id="us-intraday"')&&
 !html.includes('id="tv-price-apply"')&&!html.includes('data-tv-usd='),
 'obsolete public ticker tape and its manual quote form are removed');
truth(!html.includes('id="us-holdings-details"')&&
 !html.includes('id="us-positions"')&&
 !usDashboardCode.includes("renderPositionEditor"),
 'duplicate USD-only position editor removed while KRW holdings ledger stays');
truth(html.includes('id="us-live-badge"')&&
 html.includes('id="us-live-refresh"')&&
 html.includes('id="us-cards"')&&
 html.includes('id="us-krw-details"')===false,
 'USD source status, quick refresh and KRW card hosts remain');
truth(usDashboardCode.includes("const x=market(f),live=window.ISA_PERSONAL_US?.quote?.(f.id)")&&
 usDashboardCode.includes("return live?live.usd:x?Number(x.close):null"),
 'US price is private authenticated intraday when valid, else completed daily close');
truth(usDashboardCode.includes("const h=read('isa-us-holdings-v1')||{},shares="),
 'CONY share target reads actual saved KRW holdings, not stale USD inputs');
truth(!usDashboardCode.includes("observedQuote")&&
 !usKrwCode.includes("observedQuote")&&
 !usKrwCode.includes("kind:'tv-user-confirmed'"),
 'retired TradingView manual quote cannot override live evaluation anymore');
for(const path of ['us-dashboard.js','us-krw.js'])
 truth(!!new vm.Script(txt(path),{filename:path}),path+' is valid JavaScript');
truth(usKrwCode.includes("kind:'finnhub-private'")&&
 usKrwCode.includes("source:'미국장 USD 종가 × '"),
 'live USD quote and completed USD close have separate provenance');
truth(usKrwCode.includes("const LEDGER_KEY='isa-us-distributions-krw-v1'"),
 'existing cumulative net KRW dividend ledger is never deleted');
const kStart=usKrwCode.indexOf('function priceKrw(id,priceUsd){');
const kEnd=usKrwCode.indexOf('/* Private, user-entered Korean-won dividend/distribution ledger.',kStart);
truth(kStart>=0&&kEnd>kStart,'KRW price conversion function available');
const convert=new Function('holdings','finitePositive','day','fx','window',
 usKrwCode.slice(kStart,kEnd)+'\nreturn priceKrw;');
const validPositive=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>0;
const priceFromClose=convert(()=>({}),validPositive,()=> '2026-11-13',
 ()=>({rate:1400,source:'test FX'}),{ISA_PERSONAL_US:{quote:()=>null}});
equal(priceFromClose('schd',39).amount,54600,'unavailable live USD quote falls back to 39 USD daily close');
const directToss=convert(()=>({schd:{krwCurrent:61000,krwDay:'2026-11-13'}}),validPositive,
 ()=> '2026-11-13',()=>({rate:1400,source:'test FX'}),
 {ISA_PERSONAL_US:{quote:()=>({usd:42,tradeAt:'2026-11-13T10:00:00Z'})}});
equal(directToss('schd',39).amount,61000,'verified same-day Toss KRW manual override is preserved');
truth(usDashboardCode.includes("const f=FUNDS.find(f=>f.id===selected),x=market(f),px=x?Number(x.close):null"),
 'trend detail consumes completed EOD bars rather than streaming live trades');

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
truth(feedCode.includes("state:connectionState")&&
 feedCode.includes("configured:Boolean(endpoint&&password)")&&
 feedCode.includes("error:lastError?'시세 서버 조회 실패':''"),
 'card connection state is read-only, secret-free and never exposes VIEW_TOKEN');
truth(feedCode.includes("window.addEventListener('pageshow',refreshOnReturn)")&&
 feedCode.includes("window.addEventListener('focus',refreshOnReturn)")&&
 feedCode.includes("Date.now()-lastRequestAt<15000"),
 'mobile return to a tab retries verified intraday quotes with throttling');
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
 {ISA_PERSONAL_US:{quote:()=>({usd:42,tradeAt:'2026-11-13T10:00:00Z'})}});
equal(personal('schd',39).amount,58800,'private quote 42 USD × 1400 KRW converts automatically');
equal(personal('schd',39).kind,'finnhub-private','private price source kept distinct');
const overridePersonal=convert(()=>({schd:{krwCurrent:61000,krwDay:'2026-11-13'}}),
 validPositive,()=> '2026-11-13',()=>({rate:1400,source:'test FX'}),
 {ISA_PERSONAL_US:{quote:()=>({usd:42,tradeAt:'2026-11-13T10:00:00Z'})}});
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
  window:{dispatchEvent:()=>{},addEventListener:()=>{}},Event:class{constructor(name){this.type=name;}},
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
// Diagnose unavailable Finnhub quotes without assuming the US market is closed.
truth(html.includes('id="us-quote-debug"')&&html.includes('id="us-quote-debug-text"'),
 'personal mobile page shows per-symbol non-secret API response diagnostics');
truth(feedCode.includes('diagnostics=details')&&
 feedCode.includes('details[id]=quoteDiagnosis(v,now)'),
 'when zero quotes validate, the client preserves safe per-symbol failure reasons');
const diagStart=feedCode.indexOf('function quoteDiagnosis(item,now){');
const diagEnd=feedCode.indexOf('function renderDiagnostics(){',diagStart);
truth(diagStart>=0&&diagEnd>diagStart,'non-secret quote diagnosis function available');
const diagCtx=vm.createContext({TRADE_TTL:45*60000,Date,Number,Math});
vm.runInContext(feedCode.slice(diagStart,diagEnd)+'\nthis.diagnose=quoteDiagnosis;',diagCtx);
const diagNow=Date.now();
truth(diagCtx.diagnose({error:'upstream_status_403'},diagNow).includes('403'),
 'Finnhub 403 is identified as provider access denial, not market closure');
truth(diagCtx.diagnose({error:'upstream_status_429'},diagNow).includes('429'),
 'provider rate limit is identified without exposing any API key');
truth(diagCtx.diagnose({error:'invalid_or_outdated_trade'},diagNow).includes('유효한 가격'),
 'missing or outdated trade is identified as data not usable for valuation');
truth(diagCtx.diagnose({usd:42,tradeAt:new Date(diagNow-50*60000).toISOString()},diagNow).includes('45분 초과'),
 'old trade timestamp is distinguished from an API failure');
truth(diagCtx.diagnose({usd:42,tradeAt:new Date(diagNow-3*60000).toISOString()},diagNow)==='최근 체결가격 사용 가능',
 'recent valid trade is clearly distinguished from provider errors');
// Regression: Workers runtime rejects redirect:'error' before any Finnhub network request.
// The Worker must use the supported manual mode and reject actual redirects explicitly.
truth(workerCode.includes("redirect:'manual'")&&!workerCode.includes("},redirect:'error'"),
 'Cloudflare Worker does not use unsupported redirect:error for Finnhub subrequests');
truth(workerCode.includes("if(response.status>=300&&response.status<400)")&&
 workerCode.includes("upstream_redirect_blocked"),
 'unexpected Finnhub redirects are rejected without leaking a key to another URL');
const collectFrom=workerCode.indexOf('async function collect(env){');
const collectTo=workerCode.indexOf('export default {',collectFrom);
truth(collectFrom>=0&&collectTo>collectFrom,
 'Finnhub subrequest worker function can be executed against mock Cloudflare fetch');
function mockFinnhub(responseStatus){
 const calls=[];
 const sandbox=vm.createContext({
  SYMBOLS:{schd:'SCHD',agnc:'AGNC',spym:'SPYM',cony:'CONY'},
  WORKER_VERSION:'20261114-quote-transport-2',
  URL,Date,Number,Math,Promise,Object,AbortSignal,
  fetch:async(u,options)=>{
   // Match documented Cloudflare Worker input shape: URL strings or Request objects.
   if(typeof u!=='string')throw new TypeError('Cloudflare fetch expected a URL string');
   calls.push({url:u,redirect:options.redirect,
    auth:options.headers['X-Finnhub-Token']});
   // Simulate Cloudflare's documented incompatibility: error redirects reject before request.
   if(options.redirect==='error')throw new TypeError('Unsupported redirect mode');
   return {status:responseStatus,ok:responseStatus===200,
    json:async()=>({c:42.5,t:Math.floor(Date.now()/1000),pc:40})};
  }
 });
 vm.runInContext(workerCode.slice(collectFrom,collectTo)+'\nthis.collectForTest=collect;',sandbox);
 return {collect:sandbox.collectForTest,calls};
}
const liveMock=mockFinnhub(200),testFeed=await liveMock.collect({FINNHUB_API_KEY:'FAKE_TEST_ONLY'});
truth(Object.values(testFeed.quotes).every(q=>q.usd===42.5),
 'Worker collects all four finite Finnhub quote prices with Cloudflare-compatible fetch');
truth(liveMock.calls.length===4&&liveMock.calls.every(c=>c.redirect==='manual'&&c.auth==='FAKE_TEST_ONLY'),
 'four upstream calls use manual redirect policy and server-side token header');
truth(workerCode.includes("fetch(u.toString(),")&&
 liveMock.calls.every(c=>c.url.startsWith('https://finnhub.io/api/v1/quote?symbol=')),
 'Finnhub fetch always passes a canonical URL string to Cloudflare');
truth(testFeed.workerVersion==='20261114-quote-transport-2',
 'worker includes public non-secret version in authenticated quote reply');
truth(feedCode.includes("버전 표기 없음(구버전 Worker 가능)")&&
 feedCode.includes("workerVersion=/^20261114-quote-transport-2$/.test"),
 'mobile diagnosis can distinguish redeployed Cloudflare code from old runtime');
const redirectMock=mockFinnhub(302),blocked=await redirectMock.collect({FINNHUB_API_KEY:'FAKE_TEST_ONLY'});
truth(Object.values(blocked.quotes).every(q=>q.error==='upstream_redirect_blocked'),
 'Worker refuses upstream redirects rather than following them with a secret');
truth(diagCtx.diagnose({error:'upstream_redirect_blocked'},Date.now()).includes('차단'),
 'mobile diagnostic identifies Worker redirect refusal separately from network failure');
truth(diagCtx.diagnose({error:'upstream_type_error'},Date.now()).includes('TypeError'),
 'mobile diagnosis safely distinguishes Cloudflare runtime TypeError');
truth(diagCtx.diagnose({error:'upstream_timeout'},Date.now()).includes('시간 초과'),
 'mobile diagnosis safely distinguishes Finnhub timeout');
const typeCtx=vm.createContext({
 SYMBOLS:{schd:'SCHD',agnc:'AGNC',spym:'SPYM',cony:'CONY'},
 WORKER_VERSION:'20261114-quote-transport-2',
 URL,Date,Number,Math,Promise,Object,AbortSignal,
 fetch:async()=>{throw new TypeError('synthetic unsafe internal detail');}
});
vm.runInContext(workerCode.slice(collectFrom,collectTo)+'\nthis.collectForTest=collect;',typeCtx);
const exceptionFeed=await typeCtx.collectForTest({FINNHUB_API_KEY:'FAKE_TEST_ONLY'});
truth(Object.values(exceptionFeed.quotes).every(q=>q.error==='upstream_type_error'),
 'private worker safely reports request TypeError without leaking exception message');
truth(!JSON.stringify(exceptionFeed).includes('synthetic unsafe internal detail'),
 'upstream exception messages do not enter the client quote feed');
// USD/KRW discrepancy check: never present Finnhub USD × dated reference FX as Toss KRW.
truth(usDashboardCode.includes('function conversionLine(q){')&&
 usDashboardCode.includes("const calculation=conversionLine(chosenQuote)")&&
 usDashboardCode.includes("host.innerHTML=section;")&&
 html.includes('#us-panel .us-list-fx{'),
 'US card shows a concise USD-to-KRW reference, full conversion only in selected ticker detail');
truth(usDashboardCode.includes('function movingAverageCard(x,wonQuote){')&&
 usDashboardCode.includes('movingAverageCard(x,q)+holdingCard(f.id,px)')&&
 html.includes('#us-panel .us-card-ma20{'),
 'each US card matches domestic ETF layout with a central MA20 panel and holdings below');
truth(usKrwCode.includes("usd:Number(privateQuote.usd),fxRate:rate.rate,fxAt:rate.when")&&
 usKrwCode.includes("fxSource:rate.source,fxManual:rate.manual"),
 'personal Finnhub quote preserves calculation inputs and FX reference provenance');
const convStart=usDashboardCode.indexOf('function conversionLine(q){');
const convEnd=usDashboardCode.indexOf('function cards(){',convStart);
truth(convStart>=0&&convEnd>convStart,'unit-testable USD/KRW conversion explanation is available');
const convSandbox=vm.createContext({Number,Date});
vm.runInContext(usDashboardCode.slice(convStart,convEnd)+'\nthis.conversionLineForTest=conversionLine;',convSandbox);
const conv=convSandbox.conversionLineForTest({
 usd:35.92,fxRate:1336.26,amount:35.92*1336.26,fxManual:true,fxAt:'수동 입력'
});
truth(conv.includes('35.92 USD × 1,336.26원/USD')&&
 conv.includes('약 47,998원')&&conv.includes('토스 적용환율'),
 'shown USD price × FX yields numerically correct rounded KRW and distinguishes Toss source');
truth(convSandbox.conversionLineForTest({amount:48000})==='',
 'manual Toss KRW override is never mislabeled as a Finnhub USD×FX conversion');
const oldFx=convSandbox.conversionLineForTest({
 usd:8.21,fxRate:1336.26,amount:8.21*1336.26,
 fxManual:false,fxAt:new Date(Date.now()-3*86400000).toISOString()
});
truth(oldFx.includes('환율 기준 24시간 이상 경과'),
 'dated reference FX older than 24 hours is flagged rather than implied to be realtime');

const usCardStart=usDashboardCode.indexOf('function wonAmount(n,decimals=0){');
const usCardEnd=usDashboardCode.indexOf('function details(){',usCardStart);
truth(usCardStart>=0&&usCardEnd>usCardStart,
 'complete US card renderer and MA20 helper can be tested without broker connections');
const fakeCards={innerHTML:'',querySelectorAll:()=>[]};
const nowRecent=new Date(Date.now()-2*60000).toISOString();
const testUs={kind:'finnhub-private',usd:42,fxRate:1400,amount:58800,
 stamp:nowRecent};
const fakePosition={schd:{qty:24.330226,krwAvg:47864}};
const testItem={id:'schd',ticker:'SCHD',type:'미국 배당 ETF'};
const testBar={date:'20261112',close:40,trend:{ma20:40,ma5:41}};
const fakeWin={
 ISA_PERSONAL_US:{state:()=>({configured:true,fetching:false,error:''})},
 ISA_US_KRW:{
  fx:()=>({rate:1400}),
  priceKrw:()=>testUs,
  basisKrw:()=>({pnl:2800,rate:5,net:1000,inclusive:3800,inclusiveRate:6.78})
 }
};
const cardCtx=vm.createContext({
 FUNDS:[testItem],selected:'schd',window:fakeWin,document:{getElementById:()=>fakeCards},
 read:()=>fakePosition,market:()=>testBar,price:()=>42,date:s=>s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6),
 valid:v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>0,
 text:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 Intl,Number,Date,Math
});
vm.runInContext(usDashboardCode.slice(usCardStart,usCardEnd)+'\nthis.renderTestCards=cards;',cardCtx);
cardCtx.renderTestCards();
truth(fakeCards.innerHTML.includes('58,800원')&&
 fakeCards.innerHTML.includes('20일 이동평균선')&&
 fakeCards.innerHTML.includes('56,000.00원'),
 'US live card renders KRW current reference and converted MA20 like Korean ETF');
truth(fakeCards.innerHTML.includes('2,800원 (+5.00%)')&&
 fakeCards.innerHTML.includes('5일선 57,400.00원'),
 'US MA20 box renders price difference in KRW and percent plus MA5');
truth(fakeCards.innerHTML.includes('보유 24.330226주 · 평단 47,864.00원')&&
 fakeCards.innerHTML.includes('평가손익 +2,800원 (+5.00%)'),
 'US card shows local share count, KRW average price and evaluation return');
truth(fakeCards.innerHTML.includes('누적 세후 분배금 포함 +3,800원 (+6.78%)'),
 'known cumulative after-tax distributions remain visible and are not double counted');
truth(fakeCards.innerHTML.includes('Finnhub 장중 체결')&&
 !fakeCards.innerHTML.includes('직전 확정 종가'),
 'valid intraday quote is distinctly labeled without suggesting a completed close');
truth(fakeCards.innerHTML.includes('role="button" tabindex="0"')&&
 fakeCards.innerHTML.includes('aria-pressed="true"'),
 'new structured US card can be operated from keyboard and announces selected state');
const closeQuote={kind:'usd-close',amount:56000,usd:40,fxRate:1400};
fakeWin.ISA_US_KRW.priceKrw=()=>closeQuote;
fakeWin.ISA_PERSONAL_US.state=()=>({configured:true,fetching:false,error:''});
cardCtx.renderTestCards();
truth(fakeCards.innerHTML.includes('직전 확정 종가 2026-11-12 · 장중 시세 미수신·만료')&&
 !fakeCards.innerHTML.includes('Finnhub 장중 체결'),
 'stale live quotes are never mislabeled as live and are replaced by dated daily close');
fakeWin.ISA_US_KRW.priceKrw=()=>null;
cardCtx.renderTestCards();
truth(fakeCards.innerHTML.includes('원화 가격 미확인')&&
 fakeCards.innerHTML.includes('20일 이동평균선 · 확인 대기'),
 'missing FX/price never creates fabricated US current price or moving average');
truth(usDashboardCode.includes("const calculation=conversionLine(chosenQuote)")&&
 usDashboardCode.includes("host.innerHTML=section;"),
 'selected US ticker details include complete FX provenance and render visible content');

console.log('PASS: '+n+' contract checks. This gate does NOT certify actual live quote accuracy.');
