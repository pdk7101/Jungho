// Compact status surface; existing refresh loops own network requests.
export function autoStatus({sync='',kr='',us='',choices=false,configured=false}={}){
 const repair=choices||!configured||/실패|401|403|오류|중단|충돌|확인하세요/.test(sync);
 return {sync:sync||'투자기록 연결 확인 중',kr:kr||'공식 종가 확인 중',us:us||'미국 시세 확인 중',repair};
}
export function mountAuto(doc,win){
 const $=id=>doc.getElementById(id);
 if(!$('v17-auto-status'))return;
 const render=()=>{
  const choices=$('portfolio-sync-choices'),url=$('portfolio-sync-url');
  const v=autoStatus({sync:$('portfolio-sync-status')?.textContent,kr:$('alert')?.textContent,us:$('us-personal-status')?.textContent,choices:!!choices&&!choices.hidden,configured:!!url?.value});
  $('v17-auto-sync').textContent='투자기록 · '+v.sync;
  $('v17-auto-kr').textContent='국내 · '+v.kr;
  $('v17-auto-us').textContent='미국 · '+v.us;
  $('v17-auto-repair').hidden=!v.repair;
 };
 $('v17-auto-repair').addEventListener('click',()=>{
  const settings=$('dashboard-settings'),sync=$('portfolio-sync-panel');
  if(settings)settings.open=true;if(sync)sync.open=true;
  sync?.scrollIntoView?.({block:'start'});
 });
 const observer=new win.MutationObserver(render);
 for(const id of ['portfolio-sync-status','portfolio-sync-choices','alert','us-personal-status']){
  const node=$(id);if(node)observer.observe(node,{childList:true,subtree:true,characterData:true,attributes:id==='portfolio-sync-choices',attributeFilter:id==='portfolio-sync-choices'?['hidden']:undefined});
 }
 win.addEventListener('pageshow',render);
 win.addEventListener('isa-personal-us-quote-refreshed',render);
 win.setInterval(render,15000);render();
}
if(typeof document!=='undefined'&&typeof window!=='undefined')mountAuto(document,window);
