import {readRecords,createBackup,verifyBackup,stageRecovery,LEGACY_KEYS} from './portfolio-recovery-v17.mjs';
const $=id=>document.getElementById(id);
let current=null,busy=false;
const count=data=>LEGACY_KEYS.filter(k=>data[k]!==null).length;
function controls(){
 $('read').disabled=busy;$('export').disabled=busy||!current||count(current)===0;
 $('file').disabled=busy;$('inspect').disabled=busy||!$('file').files?.length;
}
function localStatus(t){$('local-status').textContent=t}
$('read').addEventListener('click',()=>{
 try{current=readRecords(localStorage);localStatus('기존 기록 '+count(current)+'/18개 확인'+(count(current)===0?' · 이 주소에서 실제 기록을 찾지 못했습니다.':''));}
 catch(_){current=null;localStatus('기존 기록 형식 또는 접근 확인 필요 · 변경 없음');}
 controls();
});
$('export').addEventListener('click',async()=>{
 if(!current||busy||count(current)===0)return;
 busy=true;controls();
 try{
  const latest=readRecords(localStorage);
  if(JSON.stringify(latest)!==JSON.stringify(current))throw Error('current_changed');
  const backup=await createBackup(latest);
  await verifyBackup(backup);
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
  link.href=url;link.download='portfolio-backup-'+backup.createdAt.slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  localStatus('백업 파일 생성 · 실제 다운로드 여부와 보관 위치를 확인하세요.');
 }catch(_){localStatus('백업 생성 실패 또는 기록 변경 감지 · 다시 읽어주세요.');}
 finally{busy=false;controls();}
});
$('file').addEventListener('change',()=>{$('changes').replaceChildren();$('result').textContent='';controls()});
$('inspect').addEventListener('click',async()=>{
 if(busy||!$('file').files?.length)return;busy=true;controls();$('changes').replaceChildren();
 try{
  const file=$('file').files[0];if(file.size>6*1024*1024)throw Error('file_too_large');
  const verified=await verifyBackup(JSON.parse(await file.text()));
  if(!current){$('result').textContent='무결성 확인 · 백업 기록 '+count(verified.records)+'/18개. 현재 기록 비교는 이 기기 기록을 읽은 뒤 가능합니다.';return;}
  const latest=readRecords(localStorage);
  const stage=await stageRecovery({current:latest,expectedCurrent:current,backup:verified});
  $('result').textContent='무결성 확인 · 변경 예상 '+stage.changes.filter(x=>x.status!=='same').length+'개 · 실제 복구 미실행';
  const labels={would_add:'추가 예정',would_replace:'교체 예정',would_remove:'제거 예정'};
  for(const c of stage.changes.filter(x=>x.status!=='same')){const li=document.createElement('li');li.textContent=c.key+' · '+labels[c.status];$('changes').append(li)}
 }catch(_){$('result').textContent='백업 형식·무결성 또는 현재 기록 변경 확인 필요 · 복구하지 않았습니다.'}
 finally{busy=false;controls();}
});
controls();
