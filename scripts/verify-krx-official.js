/**
 * Korean ETF official-feed regression tests.
 * Synthetic fixtures ONLY; no real prices, personal holdings or API credentials.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('scripts/update-quotes.js');
const page=read('index.html');
const insights=read('insights.js');
const intraday=read('live-prices.js');
const snapshot=JSON.parse(read('quotes.json'));
const funds=[['reit','329200'],['robot','469070'],['space','0131V0'],
 ['sofr','455030'],['tr','278530'],['sol','0167B0']];
assert.deepEqual(snapshot.items.map(x=>[x.id,x.code]),funds,'all six codes retained');
assert.equal(snapshot.officialConfirmed,true,'official source required');
assert.ok(snapshot.source.startsWith('KRX'),'unofficial placeholder cannot be promoted to verified');

const section=(begin,end)=>{
 const start=source.indexOf(begin),stop=source.indexOf(end,start);
 assert.ok(start>=0&&stop>start,begin+' boundary');
 return source.slice(start,stop);
};
const parseText=section('function parseRows(', 'async function getDate(');
const calculateText=section('function compute(', 'const key=process.env');
const factory=new Function('cutoff',
 "const target=cutoff;const sourceUrl='https://openapi.krx.co.kr/';"+
 "const asNum=x=>x===null||x===undefined||String(x).trim()===''?null:Number(String(x).replaceAll(',',''));"+
 "const positive=x=>{const n=asNum(x);return Number.isFinite(n)&&n>0?n:null};"+
 "const positiveOrZero=x=>{const n=asNum(x);return Number.isFinite(n)&&n>=0?n:null};"+
 "const byCode=new Map("+JSON.stringify(funds.map(([id,code])=>[code,id]))+");"+
 parseText+"\n"+calculateText+"\nreturn {parseRows,compute};");
const {parseRows,compute}=factory('20261120');
const sample=(date,code,base,overrides={})=>({
 BAS_DD:date,ISU_CD:code,TDD_OPNPRC:String(base),
 TDD_HGPRC:String(base+60),TDD_LWPRC:String(base-60),
 TDD_CLSPRC:String(base+20),ACC_TRDVOL:'10,000',ACC_TRDVAL:'25,000,000',
 MKTCAP:'120,000,000,000',NAV:String(base+18),LIST_SHRS:'1,000,000',
 ...overrides
});
const mixed=parseRows({OutBlock_1:[
 sample('20261120','KR70131V0000',9600,{ISU_SRT_CD:'0131V0'}),
 sample('20261120','0167B0',9200),
 sample('20261119','329200',3900),
 sample('20261120','005930',77000),
 sample('20261120','329200',3900,{TDD_HGPRC:'3,500'})
]},'20261120');
assert.deepEqual(mixed.map(x=>x.id),['space','sol'],
 'match ETF ticker, including mixed letters; reject wrong dates, unlisted symbols and bad prices');
assert.equal(mixed[0].officialMetrics.nav,9618,'official KRX NAV correctly parsed');
assert.throws(()=>parseRows({error:'Unauthorized'},'20261120'),
 /OutBlock_1/,'unauthorized/malformed responses fail closed');

const bars=[];
for(let i=0;i<43;i++){
 const stamp=new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10).replaceAll('-','');
 const value=9000+i*12;
 bars.push(parseRows({OutBlock_1:[sample(stamp,'0131V0',value)]},stamp)[0]);
}
const signal=compute('space','0131V0',bars);
assert.equal(signal.bars.length,40,'exactly 40 completed bars');
assert.equal(signal.date,bars.at(-1).date,'actual last completed date retained');
assert.equal(signal.close,bars.at(-1).close,'close is from official bar');
assert.ok(signal.trend.ma5>signal.trend.ma20,'moving averages derived from bars');
assert.equal(signal.trend.volumeToday,10000,'volume retained from official KRX record');
assert.throws(()=>compute('space','0131V0',bars.slice(0,39)),
 /40거래일/,'insufficient historical data cannot create buy signal');
assert.ok(source.includes("if(date===target&&got.length>0)latestDayVerified=true"),
 'no empty response is stamped as latest close');
assert.ok(intraday.includes('official-only')&&
 intraday.includes("return {ok:false,quotes:{}"),
 'unapproved intraday feeds stay disabled');
assert.ok(insights.includes("metricHistory?.source!=='KRX OPEN API'")&&
 insights.includes('const important=allowed.filter'),
 'important changes use official history only and are de-duplicated');
assert.ok(!insights.includes('DIST_URL'),'unsupported third-party distribution source removed');
assert.ok(page.includes('KRX 공식 종가 확인 보류'),'data failure reason shown on cards');
const workflow=read('.github/workflows/pages.yml');
const privateCheck=read('.github/workflows/check-krx-connection.yml');
const secretReference='KRX_AUTH_KEY: '+String.fromCharCode(36)+'{{ secrets.KRX_AUTH_KEY }}';
assert.ok(privateCheck.includes(secretReference),
 'official KRX secret is used only in the private manual diagnostic');
assert.ok(!workflow.includes(secretReference),
 'public Pages deployment cannot fetch or publish licensed KRX data');
console.log('PASS: Korean official KRX price parser, snapshot, indicators, no unofficial trade signals');
