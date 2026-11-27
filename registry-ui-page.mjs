import {ACCOUNT_NAMES,initialPreview,previewAdd,previewRows,previewCounts} from './registry-ui-preview.mjs';
const $=id=>document.getElementById(id);
let model=initialPreview();
const el=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e};
function message(value,error=false){$('message').textContent=value;$('message').dataset.error=String(error)}
function adjust(){const us=$('account').value==='toss-us';$('venue-label').hidden=us;$('venue').disabled=us;$('symbol').maxLength=us?15:6;$('symbol').placeholder=us?'예: QQQM':'예: 329200';}
function render(){
 const count=previewCounts(model);
 $('counts').textContent='고유 종목 '+count.instruments+'/100 · 계좌별 등록 '+count.positions+'건 · 미국 수집 대상 '+count.usSymbols+'개';
 const list=$('list');list.replaceChildren();
 for(const [account,name] of Object.entries(ACCOUNT_NAMES)){
  if($('filter').value!=='all'&&$('filter').value!==account)continue;
  const rows=previewRows(model,account);
  list.append(el('h3',name+' ('+rows.length+')'));
  for(const r of rows){
   const row=el('article','','row');
   row.append(el('strong',r.name+' ('+r.symbol+')'),el('p',r.venue+' · '+r.status,r.added?'wait':'sub'),el('p','수량 미확인 · 평단 미확인 · '+r.priceStatus,'sub'));
   list.append(row);
  }
 }
}
$('account').addEventListener('change',adjust);
$('filter').addEventListener('change',render);
$('registration').addEventListener('submit',e=>{
 e.preventDefault();
 try{
  const result=previewAdd(model,{account:$('account').value,venue:$('venue').value,symbol:$('symbol').value,name:$('name').value});
  model=result.model;
  $('filter').value=$('account').value;render();
  message(result.duplicate?'이미 해당 계좌에 등록된 종목입니다.':'테스트 등록 완료 · 실제 시세와 투자 규칙 확인 전 보류');
  if(!result.duplicate){$('symbol').value='';$('name').value='';$('symbol').focus()}
 }catch(_){message('입력한 계좌·시장·종목코드·종목명을 확인하세요. 최대 고유 종목 100개입니다.',true)}
});
adjust();render();$('add').disabled=false;message('등록 테스트 가능');
