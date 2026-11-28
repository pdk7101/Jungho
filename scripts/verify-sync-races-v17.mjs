import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../portfolio-sync.js',import.meta.url),'utf8');
const CONFIG='isa-portfolio-sync-config-v1',BASE='isa-portfolio-sync-base-v1';
const url='https://jungho-portfolio-sync.pdk7101.workers.dev/sync',token='synthetic-long-token-never-real-secret';
function device(){
 const data=new Map(),nodes=new Map(),calls=[];
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:true});return nodes.get(id)};
 let responder=null,reloads=0;
 const ctx={localStorage:storage,sessionStorage:storage,document:{visibilityState:'visible',activeElement:null,getElementById:el},window:{},location:{reload:()=>reloads++},Date,JSON,URL,AbortController,setTimeout,clearTimeout,
 fetch:async(u,opt)=>{calls.push(opt.method);return {ok:true,json:async()=>responder(u,opt)}}};
 vm.runInNewContext(source.replace(/\nmount\(\);\n\}\)\(\);\s*$/,'\nwindow.test={KEYS,sync,snapshot};\n})();'),ctx);
 const {KEYS,sync,snapshot}=ctx.window.test;
 const blank=Object.fromEntries(KEYS.map(k=>[k,null]));
 const cfg={url,token};storage.setItem(CONFIG,JSON.stringify(cfg));
 const local=(d)=>{for(const k of KEYS)d[k]===null?storage.removeItem(k):storage.setItem(k,d[k]);};
 const base=(revision,d)=>storage.setItem(BASE,JSON.stringify({url,revision,data:d}));
 const readBase=()=>JSON.parse(storage.getItem(BASE)||'null');
 return {storage,blank,sync,snapshot,local,base,readBase,el,calls,setResponder:f=>responder=f,reloads:()=>reloads};
}
let d=device(),key=Object.keys(d.blank)[0],remote={...d.blank,[key]:'{"reit":{"qty":2}}'};
d.setResponder(async()=>({revision:1,data:remote}));
await d.sync();assert.equal(d.calls.join(','),'GET');assert.equal(d.el('portfolio-sync-choices').hidden,false);assert.equal(d.snapshot()[key],null);
await d.sync('cloud');assert.equal(d.snapshot()[key],remote[key]);assert.equal(d.readBase().revision,1);assert.equal(d.reloads(),1);assert.equal(d.calls.join(','),'GET,GET');
d=device();d.local(remote);d.base(1,remote);
d.setResponder(async()=>{d.storage.setItem(CONFIG,JSON.stringify({url,token:token+'changed'}));return {revision:2,data:{...remote,[key]:'{"reit":{"qty":3}}'}}});
await d.sync();assert.equal(d.snapshot()[key],remote[key]);assert.equal(d.readBase().revision,1);assert.equal(d.calls.join(','),'GET');
d=device();d.local(remote);d.base(1,remote);
d.setResponder(async()=>{d.base(3,remote);return {revision:2,data:remote}});
await d.sync();assert.equal(d.readBase().revision,3);assert.equal(d.reloads(),0);
d=device();d.local(remote);d.base(1,remote);const changed={...remote,[key]:'{"reit":{"qty":4}}'};d.local(changed);
d.setResponder(async(u,opt)=>{if(opt.method==='GET')return {revision:1,data:remote};d.storage.removeItem(CONFIG);return {revision:2,data:changed}});
await d.sync();assert.equal(d.readBase().revision,1);assert.equal(d.snapshot()[key],changed[key]);assert.deepEqual(d.calls,['GET','PUT']);
console.log('PASS: first cloud restore without overwrite, delayed credential change, newer tab base, and disconnect during upload');
