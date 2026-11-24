/** Synthetic read-only Toss gateway regression; never uses actual keys or account data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createGateway,parsePortfolio,constantTimeEqual} from '../toss-bridge/toss-readonly-server.mjs';
const source=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const record={
 totalPurchaseAmount:{krw:'1000000',usd:'250'},
 marketValue:{amount:{krw:'1100000',usd:'210'},
  amountAfterCost:{krw:'1098000',usd:'208'}},
 profitLoss:{amount:{krw:'100000',usd:'-40'},
  amountAfterCost:{krw:'98000',usd:'-42'},rate:'0.01'},
 dailyProfitLoss:{amount:{krw:'1000',usd:'-2'},rate:'0.003'},
 items:[
  {symbol:'329200',name:'TIGER 리츠부동산인프라',marketCountry:'KR',
   currency:'KRW',quantity:'3',averagePurchasePrice:'4000',
   lastPrice:'3900',marketValue:{purchaseAmount:'12000',
    amount:'11700',amountAfterCost:'11650'},profitLoss:{amount:'-300'}},
  {symbol:'SCHD',name:'Schwab US Dividend Equity ETF',marketCountry:'US',
   currency:'USD',quantity:'2.5',averagePurchasePrice:'50',
   lastPrice:'45',marketValue:{purchaseAmount:'125',
    amount:'112.5',amountAfterCost:'112'},profitLoss:{amount:'-12.5'}}
 ]
};
const now=new Date('2026-11-24T05:00:00.000Z');
const fx={baseCurrency:'USD',quoteCurrency:'KRW',rate:'1350',
 validFrom:'2026-11-24T04:59:00.000Z',validUntil:'2026-11-24T05:01:00.000Z'};
const parsed=parsePortfolio([record],fx,now.toISOString());
assert.equal(parsed.holdingCount,2);
assert.equal(parsed.amounts.profit.usd,-40,'negative US P/L allowed');
assert.equal(parsed.totals.valueKRW,1383500);
assert.equal(parsed.totals.investedKRW,1337500);
assert.equal(parsed.holdings[1].quantity,2.5,'fractional US quantity retained');
assert.equal(parsed.holdings[0].profitLoss,-300);
assert.equal(parsed.fx.usdKrw,1350);
assert.equal(parsePortfolio([record],null,now.toISOString()).totals.valueKRW,null,
 'missing official FX cannot fabricate a KRW combined figure');
assert.equal(parsePortfolio([record],{...fx,validUntil:'2026-11-22T00:00:00Z'},now.toISOString()).totals.valueKRW,null,
 'stale exchange rate invalidates combined KRW valuation');
assert.throws(()=>parsePortfolio([{...record,items:[{...record.items[0],quantity:'not-a-number'}]}],fx,now.toISOString()),
 /종목 평가자료/);
assert.equal(constantTimeEqual('u'.repeat(64),'u'.repeat(64)),true);
assert.equal(constantTimeEqual('u'.repeat(64),'t'.repeat(64)),false);
const password='a'.repeat(64);
const requests=[];
const upstream=async(url,options)=>{
 const u=new URL(url);requests.push({path:u.pathname,method:options.method||'GET',
  header:options.headers?.['X-Tossinvest-Account']??null,redirect:options.redirect});
 if(u.pathname==='/oauth2/token')return new Response(JSON.stringify({
  access_token:'mock-token',expires_in:3600}),{status:200});
 if(u.pathname==='/api/v1/accounts')return new Response(JSON.stringify({
  result:[{accountNo:'private-must-not-leak',accountSeq:7,accountType:'BROKERAGE'}]}),{status:200});
 if(u.pathname==='/api/v1/holdings')return new Response(JSON.stringify({result:record}),{status:200});
 if(u.pathname==='/api/v1/exchange-rate')return new Response(JSON.stringify({
  result:{...fx,validFrom:new Date(Date.now()-30000).toISOString(),
   validUntil:new Date(Date.now()+60000).toISOString()}
 }),{status:200});
 throw Error('unexpected upstream request '+u.pathname);
};
const gateway=createGateway({clientId:'fake-id',clientSecret:'fake-secret',viewToken:password},upstream);
async function invoke(method,site,key){
 const req={method,url:'/api/toss/holdings',headers:{
  origin:site,authorization:'Bearer '+key}};
 const res={status:null,headers:null,body:'',
  writeHead(code,headers){this.status=code;this.headers=headers;},
  end(body=''){this.body=body;}};
 await gateway.handle(req,res);return res;
}
assert.equal((await invoke('GET','https://untrusted.example',password)).status,403);
assert.equal((await invoke('GET','https://pdk7101.github.io','bad')).status,401);
assert.equal(requests.length,0,'no upstream call before viewer authorization');
const good=await invoke('GET','https://pdk7101.github.io',password);
assert.equal(good.status,200);
const payload=JSON.parse(good.body);
assert.equal(payload.holdings.length,2);
assert.equal(JSON.stringify(payload).includes('private-must-not-leak'),false,
 'account number must never reach a client');
assert.deepEqual(requests.map(x=>x.path),
 ['/oauth2/token','/api/v1/accounts','/api/v1/holdings','/api/v1/exchange-rate']);
assert.equal(requests[2].header,'7','AccountSeq header must use accountSeq, not accountNo');
assert.ok(requests.every(x=>x.method==='GET'||x.path==='/oauth2/token'));
assert.ok(requests.every(x=>x.redirect==='manual'));
assert.equal((await invoke('GET','https://pdk7101.github.io',password)).status,200);
assert.equal(requests.length,4,'short-lived server cache avoids repeated API traffic across mobile/PC');
const html=source('index.html'),account=source('account-summary.js'),
 client=source('personal-toss-client.js'),pages=source('.github/workflows/pages.yml'),
 stamps=source('scripts/stamp-assets.js');
assert.ok(html.includes('id="toss-broker-config"')&&
 html.includes('id="toss-broker-holdings"')&&
 html.includes('src="./personal-toss-client.js"'));
assert.ok(account.includes('toss:tossOfficial()||')&&
 account.includes('document.addEventListener(\'isa-toss-broker-data\',render)'));
assert.ok(pages.includes('personal-toss-client.js')&&
 !pages.includes('cp toss-bridge/toss-readonly-server.mjs'),
 'private server and Toss API credentials cannot enter GitHub Pages');
assert.ok(stamps.includes("'personal-toss-client.js'"));
assert.ok(!client.includes('TOSS_CLIENT_SECRET')&&!client.includes('TOSS_CLIENT_ID')&&
 !client.includes('openapi.tossinvest.com'), 'client must not have direct Toss API credentials or broker API calls');
assert.doesNotThrow(()=>new vm.Script(client));
assert.doesNotThrow(()=>new vm.Script(account));
console.log('PASS: Toss official mixed-currency holdings, private token-gated read-only gateway, FX fail closed and mobile/desktop UI');
