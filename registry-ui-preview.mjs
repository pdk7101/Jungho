// Isolated preview model: no network, storage, or writes to legacy holdings.
import {aliases,registerForReview} from './legacy-registry-preview.mjs';
import {addHolding,holdingId,instrument,planQuotes} from './instrument-registry.mjs';
export const ACCOUNT_NAMES=Object.freeze({'kiwoom-isa':'키움 ISA','toss-kr':'토스 국내','toss-us':'토스 미국'});
export function initialPreview(){
 let state={catalog:{},holdings:{}};
 for(const a of aliases)state=addHolding(state,a.account,a);
 return {state,added:[]};
}
export function previewAdd(model,{account,venue,symbol,name}){
 if(!Object.hasOwn(ACCOUNT_NAMES,account))throw Error('계좌를 선택하세요.');
 const market=account==='toss-us'?'US':'KR';
 const i=instrument({market,venue:market==='US'?'US':venue,symbol,name});
 const id=holdingId(account,i);
 if(Object.hasOwn(model.state.holdings,id))return {model,id,duplicate:true};
 const r=registerForReview(model.state,account,i);
 return {model:{state:r.state,added:[...model.added,id]},id,duplicate:false};
}
export function previewRows(model,account){
 return Object.values(model.state.holdings).filter(h=>h.account===account).map(h=>{
  const i=model.state.catalog[h.instrumentId],added=model.added.includes(h.id);
  return {id:h.id,name:i.name,symbol:i.symbol,venue:i.venue,account,added,qty:h.qty,avgKRW:h.avgKRW,
   status:added?'보류':'기존 종목 · 읽기 전용',
   priceStatus:added?(i.market==='US'?'예약 수집 연결 대기':'KRX 신규 종목 연결 대기'):'실제 시세 미조회'};
 });
}
export function previewCounts(model){
 const p=planQuotes(model.state.catalog,model.state.holdings,'2026-01-01',100);
 return {instruments:Object.keys(model.state.catalog).length,positions:Object.keys(model.state.holdings).length,krRequests:p.kr.length,usSymbols:p.us.length};
}
