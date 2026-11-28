import {previewKRCloseFiles,decodeKRCloseCSV} from './kr-close-file-preview-v17.mjs';
// No persistent storage, price feeds, account writes, or signal integration.
export function mountKRClosePreview(getSymbols){
 const $=id=>document.getElementById(id);
 const form=$('kr-file-form'),input=$('kr-file-input'),day=$('kr-file-date'),status=$('kr-file-status'),out=$('kr-file-results'),button=$('kr-file-check');
 let generation=0;
 const clear=()=>{generation++;out.replaceChildren();status.textContent='파일 선택 후 검증 · 참고용';button.disabled=false};
 const datestr=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 day.max=datestr;day.value=datestr;
 input.addEventListener('change',clear);day.addEventListener('change',clear);
 form.addEventListener('submit',async e=>{
  e.preventDefault();clear();const attempt=generation;button.disabled=true;
  try{
   const files=Array.from(input.files||[]),selectedDate=day.value,symbols=[...new Set(getSymbols())].sort();
   if(!symbols.length||files.length<1||files.length>4||files.some(f=>f.size>8_000_000)||files.reduce((s,f)=>s+f.size,0)>16_000_000)throw Error('CSV 1~4개, 파일당 8MB 이하, 전체 16MB 이하인지 확인');
   const texts=await Promise.all(files.map(async f=>decodeKRCloseCSV(await f.arrayBuffer())));
   if(attempt!==generation)return;
   if(JSON.stringify(symbols)!==JSON.stringify([...new Set(getSymbols())].sort()))throw Error('종목 목록이 변경되었습니다. 다시 검증하세요.');
   const result=previewKRCloseFiles({files:texts,symbols,selectedDate});
   status.textContent='대조 '+result.matched+'/'+result.requested+' · 선택 기준일 '+selectedDate+' · 정규장 종가 미확정 · 분석 미반영';
   for(const item of result.items){
    const p=document.createElement('p');p.className='sub';
    p.textContent=item.symbol+' · '+(item.close===null?(item.error==='missing'?'파일에 없음':'중복/가격/날짜 오류'):item.close.toLocaleString('ko-KR')+'원 · '+(item.rowDate?'파일 날짜 '+item.rowDate:'파일 날짜 없음'));
    out.append(p);
   }
  }catch(_){if(attempt===generation)status.textContent='검증 실패 · CSV 형식, 용량, 종목 목록 및 조회일 확인';}
  finally{if(attempt===generation)button.disabled=false;}
 });
 $('kr-file-clear').addEventListener('click',()=>{input.value='';clear()});
 let key='';
 return ()=>{const next=[...new Set(getSymbols())].sort().join(',');if(next!==key){key=next;clear();}};
}
