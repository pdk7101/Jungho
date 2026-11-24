/**
 * Personal read-only Toss Securities gateway. Node.js 22+, private fixed-egress host.
 * This source MUST NOT be copied to the public GitHub Pages artifact.
 * Required env: TOSS_CLIENT_ID, TOSS_CLIENT_SECRET, TOSS_VIEW_TOKEN (32+ chars).
 * HTTPS termination (Caddy/nginx) is required before mobile/PC access.
 * No trading endpoints, no persistent account storage, no credential logging.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const TOSS='https://openapi.tossinvest.com';
const ORIGIN='https://pdk7101.github.io';
const num=v=>{
 if(v===null||v===undefined||String(v).trim()==='')return null;
 const n=Number(v);return Number.isFinite(n)&&Math.abs(n)<1e15?n:null;
};
const nonneg=v=>{const n=num(v);return n!==null&&n>=0?n:null};
const amount=v=>({krw:nonneg(v?.krw),usd:nonneg(v?.usd)});
const sumBuckets=(list,path)=>{
 const b={krw:0,usd:0};let count=0;
 for(const result of list){
  let v=result;for(const key of path)v=v?.[key];
  const p=amount(v);if(p.krw===null)throw Error('토스 계좌 금액 형식 확인 실패');
  b.krw+=p.krw;b.usd+=p.usd||0;count++;
 }
 return count?b:null;
};
function parsePortfolio(accounts,rateData,at=new Date().toISOString()){
 if(!Array.isArray(accounts)||!accounts.length)throw Error('조회 가능한 토스 종합매매 계좌가 없습니다');
 for(const a of accounts){
  if(!a||!Array.isArray(a.items)||!a.marketValue||!a.totalPurchaseAmount)
   throw Error('토스 보유잔고 필수 항목 누락');
 }
 const fx=num(rateData?.rate);
 const rate=rateData?.baseCurrency==='USD'&&rateData?.quoteCurrency==='KRW'&&
  fx!==null&&fx>100&&fx<10000&&
  Number.isFinite(Date.parse(rateData?.validFrom))&&
  Number.isFinite(Date.parse(rateData?.validUntil))&&
  new Date(rateData.validUntil).getTime()>=new Date(at).getTime()-120000?fx:null;
 const invested=sumBuckets(accounts,['totalPurchaseAmount']);
 const valued=sumBuckets(accounts,['marketValue','amount']);
 const after=sumBuckets(accounts,['marketValue','amountAfterCost']);
 const profit=sumBuckets(accounts,['profitLoss','amount']);
 const rows=[];
 for(const a of accounts){
  for(const item of a.items){
   if(!item||!['KR','US'].includes(item.marketCountry)||
    !['KRW','USD'].includes(item.currency))throw Error('토스 종목 시장/통화 형식 확인 실패');
   const quantity=nonneg(item.quantity),average=nonneg(item.averagePurchasePrice),
    last=nonneg(item.lastPrice),cost=nonneg(item.marketValue?.purchaseAmount),
    value=nonneg(item.marketValue?.amount),net=nonneg(item.marketValue?.amountAfterCost);
   if(quantity===null||average===null||last===null||cost===null||value===null||net===null)
    throw Error('토스 종목 평가자료 누락');
   rows.push({symbol:String(item.symbol||'').slice(0,24),
    name:String(item.name||'').slice(0,100),marketCountry:item.marketCountry,
    currency:item.currency,quantity,averagePurchasePrice:average,lastPrice:last,
    purchaseAmount:cost,marketValue:value,marketValueAfterCost:net,
    profitLoss:num(item.profitLoss?.amount)});
  }
 }
 // The official overview provides separate KRW and USD buckets. A single-WON
 // total is only a reference conversion at the official current rate;
 // it is NOT the Toss app's historical-FX / fee-inclusive displayed balance.
 const convert=b=>!b?null:b.usd===0?Math.round(b.krw):
  rate!==null?Math.round(b.krw+b.usd*rate):null;
 const result={
  ok:true,source:'토스증권 공식 Open API · 보유주식 (조회 전용)',
  fetchedAt:at,accountCount:accounts.length,holdingCount:rows.length,
  fx:rate!==null?{usdKrw:rate,validFrom:rateData.validFrom,validUntil:rateData.validUntil,
   description:'토스 공식 표시 환율 · 실제 앱 원화 평가액과 다를 수 있음'}:null,
  amounts:{invested,valued,afterCost:after,profit},
  totals:{investedKRW:convert(invested),valueKRW:convert(valued),
   afterCostKRW:convert(after),conversionApprox:invested.usd!==0||valued.usd!==0},
  holdings:rows
 };
 return result;
}
function constantTimeEqual(received,secret){
 if(typeof received!=='string'||typeof secret!=='string'||secret.length<32)return false;
 const a=Buffer.from(received),b=Buffer.from(secret);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function createGateway(config,upstream=fetch){
 const clientId=String(config.clientId||''),clientSecret=String(config.clientSecret||''),
  viewToken=String(config.viewToken||'');
 if(!clientId||!clientSecret||viewToken.length<32)throw Error('Toss gateway: required secrets are missing');
 let access='',expires=0,cache=null,pending=null;
 async function ask(path,options={}){
  const r=await upstream(TOSS+path,{
   method:options.method||'GET',headers:options.headers||{},
   body:options.body,redirect:'manual',signal:AbortSignal.timeout(12000)
  });
  if(r.status>=300&&r.status<400)throw Error('토스 API 리디렉션 거부');
  if(!r.ok){
   const e=new Error('토스 API '+r.status);
   e.status=r.status;throw e;
  }
  const raw=await r.text();if(raw.length>2000000)throw Error('토스 API 응답 크기 제한');
  let data;try{data=JSON.parse(raw)}catch(_){throw Error('토스 API JSON 오류')}
  return data;
 }
 async function token(force=false){
  if(!force&&access&&Date.now()<expires)return access;
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:clientId,
   client_secret:clientSecret});
  const response=await ask('/oauth2/token',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:body.toString()});
  if(!response?.access_token||!Number.isFinite(Number(response.expires_in)))
   throw Error('토스 액세스 토큰 발급 실패');
  access=response.access_token;
  expires=Date.now()+Math.max(60,Number(response.expires_in)-120)*1000;
  return access;
 }
 async function api(path,accountSeq=null){
  for(let retry=0;retry<2;retry++){
   const t=await token(retry===1);
   try{
    const headers={Authorization:'Bearer '+t,Accept:'application/json'};
    if(accountSeq!==null)headers['X-Tossinvest-Account']=String(accountSeq);
    const data=await ask(path,{headers});
    if(!data||data.result===undefined)throw Error('토스 API result 응답 누락');
    return data.result;
   }catch(e){
    if(e.status===401&&retry===0){access='';expires=0;continue;}
    throw e;
   }
  }
  throw Error('토스 API 인증 오류');
 }
 async function retrieve(){
  const ac=await api('/api/v1/accounts');
  if(!Array.isArray(ac))throw Error('토스 계좌목록 형식 오류');
  const selected=ac.filter(x=>x?.accountType==='BROKERAGE'&&
   Number.isSafeInteger(Number(x.accountSeq))&&Number(x.accountSeq)>0);
  if(!selected.length)throw Error('조회 가능한 토스 종합매매 계좌 없음');
  if(selected.length>5)throw Error('다수 계좌 자동 합산 보류');
  const results=[];
  for(const acc of selected){
   results.push(await api('/api/v1/holdings',Number(acc.accountSeq)));
  }
  let rate=null;
  try{rate=await api('/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW');}
  catch(_){/* Per-currency balances remain available; do not invent FX. */}
  const data=parsePortfolio(results,rate);
  cache={data,until:Date.now()+20000};return data;
 }
 const headers=origin=>{
  const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
   'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
   'Content-Security-Policy':"default-src 'none'",'Vary':'Origin'};
  if(origin===ORIGIN){
   h['Access-Control-Allow-Origin']=ORIGIN;
   h['Access-Control-Allow-Headers']='Authorization, Content-Type';
   h['Access-Control-Allow-Methods']='GET, OPTIONS';
   h['Access-Control-Max-Age']='600';
  }
  return h;
 };
 const reply=(res,status,data,origin)=>{
  res.writeHead(status,headers(origin));res.end(JSON.stringify(data));
 };
 async function handle(req,res){
  const origin=req.headers.origin||'';
  if(origin!==ORIGIN){
   reply(res,403,{error:'허용되지 않은 사이트'},origin);return;
  }
  if(req.method==='OPTIONS'){
   res.writeHead(204,headers(origin));res.end();return;
  }
  if(req.method!=='GET'||req.url!=='/api/toss/holdings'){
   reply(res,404,{error:'조회 전용 경로만 지원합니다'},origin);return;
  }
  const bearer=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!constantTimeEqual(bearer,viewToken)){
   reply(res,401,{error:'개인 접근 토큰 확인 실패'},origin);return;
  }
  try{
   if(cache&&Date.now()<cache.until){reply(res,200,cache.data,origin);return;}
   if(!pending)pending=retrieve().finally(()=>{pending=null;});
   reply(res,200,await pending,origin);
  }catch(err){
   const status=err.status===403?502:err.status===429?429:502;
   const message=err.status===403?'토스증권 허용 IP·API 이용 권한 확인 필요':
    err.status===429?'토스 API 호출 제한 · 잠시 후 재조회':
    '토스 공식 계좌 조회 실패 · 서버 설정 및 접근 권한 확인';
   reply(res,status,{error:message},origin);
  }
 }
 return {handle,parsePortfolio:()=>undefined};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const gateway=createGateway({
  clientId:process.env.TOSS_CLIENT_ID,clientSecret:process.env.TOSS_CLIENT_SECRET,
  viewToken:process.env.TOSS_VIEW_TOKEN
 });
 const port=Number(process.env.PORT||8788);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('PORT is invalid');
 http.createServer((req,res)=>void gateway.handle(req,res))
  .listen(port,'127.0.0.1',()=>{
   process.stdout.write('Toss read-only gateway bound to 127.0.0.1:'+port+'; HTTPS proxy required\n');
  });
}
export {parsePortfolio,constantTimeEqual,createGateway};
