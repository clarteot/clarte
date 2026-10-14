const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),zlib=require('zlib'),crypto=require('crypto');
const root=__dirname,html=fs.readFileSync(root+'/src/app.html','utf8');
const script=html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];
function boot(initial={}) {
  const store=new Map(Object.entries(initial));
  const elements=new Map();
  const element=id=>{
    if(elements.has(id))return elements.get(id);
    const classes=new Set();
    const el={id,value:'',textContent:'',_html:'',disabled:false,checked:false,dataset:{},style:{setProperty(){}},options:[],selectedOptions:[],files:[],
      classList:{add:(...a)=>a.forEach(x=>classes.add(x)),remove:(...a)=>a.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,on)=>{if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);return on}},
      addEventListener(){},setAttribute(){},getAttribute(){return null},querySelectorAll(){return []},querySelector(){return null},focus(){},select(){},reset(){},remove(){},click(){},appendChild(){},getBoundingClientRect(){return {width:400,height:600}}};
    Object.defineProperty(el,'innerHTML',{get:()=>el._html,set:v=>{el._html=v;el.options=[...v.matchAll(/<option[^>]*value="([^"]*)"[^>]*>(.*?)<\/option>/g)].map(m=>({value:m[1],textContent:m[2],outerHTML:m[0]}));}});
    elements.set(id,el);return el;
  };
  for(const match of html.matchAll(/id="([^"]+)"/g))element(match[1]);
  for(const match of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))element(match[1]).innerHTML=match[2];
  const doc={getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[],querySelector:s=>s.includes('itemType')?{value:'活页'}:null,addEventListener(){},createElement:()=>element('created'+elements.size),body:element('body'),documentElement:element('documentElement')};
  const context=vm.createContext({document:doc,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),key:i=>[...store.keys()][i],get length(){return store.size}},console,structuredClone,Date,Math,Set,Map,JSON,URL,Blob,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,AbortController,atob,btoa,setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:f=>f(),window:{innerWidth:1200,addEventListener(){},scrollTo(){}},navigator:{},confirm:()=>true,alert(){}});
  vm.runInContext(script,context,{timeout:5000});
  return {context,store,element,run:code=>vm.runInContext(code,context,{timeout:5000})};
}
const empty=boot();
assert.equal(empty.run('papers.length+inks.length+pens.length'),0,'new users have no demo collection');
assert.equal(empty.run('Object.keys(journalBrandConfig.pen).length'),0);
assert.ok(empty.run('Object.keys(MASTER_BRAND_CATALOG.pen).length')>0,'public brand candidates retained');
const paper=[{id:'paper-test',itemType:'活页',brand:'自定义纸品牌',paperType:'特殊纸',quantity:100,remaining:37,tags:['收藏'],notes:'历史笔记',customField:'keep'}];
const ink=[{id:'ink-test',brand:'自定义墨水',name:'历史墨水',series:'旧系列',colorFamily:'绿色系',notes:'墨水笔记'}];
const pen=[{id:'pen-test',brand:'里莜',series:'517遇见奈良系列',color:'紫色',nibType:'品牌标配',nibSpec:'EF',inkStatus:'已灌墨',inkId:'ink-test',notes:'笔备注',customField:'keep'}];
const original={paper_keeper_v1:JSON.stringify(paper),ink_keeper_v1:JSON.stringify(ink),pen_keeper_v1:JSON.stringify(pen),clarte_beta_access_token_v2:'existing-token',clarte_today_swipe_history_v1:'{}',clarte_last_backup_time_v1:'2026-10-13T00:00:00Z'};
const used=boot(original);
assert.equal(used.run('papers[0].remaining'),37,'missing migration marker must not reset remaining');
assert.equal(used.run('papers[0].customField'), 'keep');
assert.equal(used.run('pens[0].inkId'),'ink-test');
assert.equal(used.run('pens[0].customField'),'keep');
assert.equal(used.store.get('clarte_beta_access_token_v2'),'existing-token');
assert.equal(used.store.get('clarte_last_backup_time_v1'),original.clarte_last_backup_time_v1);
used.run("syncRecordToMyBrands('pen',pens[0]);syncRecordToMyBrands('pen',pens[0])");
assert.equal(used.run("journalBrandConfig.pen['里莜'].length"),1,'sync de-duplicates');
assert.equal(used.run('papers.length+inks.length+pens.length'),3,'brand sync preserves collection counts');
assert.equal(used.run("Object.keys(journalBrandConfig.ink).length"),0,'brand sync only changes selected category');
used.element('penBrandFilter').value='里莜';used.run('refreshPenFilters();renderPens()');
assert.ok(used.element('penSeriesFilter').options.every(x=>x.value===''||x.value==='517遇见奈良系列'),'dependent series filter');
used.run("openPenDetail('pen-test');openPenForm('pen-test');openInkDetail('ink-test');openInkForm('ink-test');openDetail('paper-test');openForm('paper-test');openJournalBrandConfig('pen');navigate('profile');navigate('today')");
const restored=boot({'clarte_preview_paper_v2_20261012':JSON.stringify(paper),'clarte_preview_pen_v1_20261012':JSON.stringify(pen),'clarte_preview_ink_v2_20261012':JSON.stringify(ink)});
assert.equal(restored.run('papers[0].remaining'),37,'known legacy key migration');
const deleted=boot({paper_keeper_v1:'[]','clarte_preview_paper_v2_20261012':JSON.stringify(paper)});
assert.equal(deleted.run('papers.length'),0,'intentional empty collection stays empty');
const manifest=JSON.parse(fs.readFileSync(root+'/deployment/v26.3-manifest.json'));
const encoded=manifest.payloads.map(p=>fs.readFileSync(root+'/'+p,'utf8')).join('');
assert.equal(encoded.length,manifest.base64_length);
assert.equal(zlib.gunzipSync(Buffer.from(encoded,'base64')).toString(),html);
assert.equal(crypto.createHash('sha256').update(html).digest('hex'),manifest.app_sha256);
assert.ok(html.includes('/* V26.3 · 所有弹窗统一居中显示 */'));
assert.ok(!html.includes('clartePreviewBadge'));
const entry=fs.readFileSync(root+'/index.html','utf8');
assert.ok(entry.includes("const API='https://clarte-invite-api.13136138332.workers.dev'"));
assert.ok(entry.includes("apiPost('/redeem'"));assert.ok(entry.includes("apiPost('/verify'"));
assert.ok(!entry.includes('    ensureFreshAppStorage();'));
new vm.Script(entry.match(/<script>([\s\S]*?)<\/script>/)[1]);
async function checkInvite(existingToken,valid){
  const storage=new Map(existingToken?[['clarte_beta_access_token_v2',existingToken]]:[]),body={innerHTML:''},calls=[];
  let written='';
  const el={addEventListener(){},focus(){}};
  const context=vm.createContext({localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{body,getElementById:()=>el,open(){},write:s=>written=s,close(){}},console,AbortController,setTimeout:()=>0,clearTimeout(){},Uint8Array,TextDecoder,atob,pako:{ungzip:b=>zlib.gunzipSync(b)},fetch:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/verify'))return {ok:valid,status:valid?200:401,text:async()=>JSON.stringify(valid?{}:{error:'access_revoked'})};
    return {ok:true,status:200,text:async()=>fs.readFileSync(root+'/'+url,'utf8')};
  }});
  vm.runInContext(entry.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  await new Promise(r=>setImmediate(r));
  if(!existingToken){assert.equal(calls.length,0);assert.ok(body.innerHTML.includes('inviteForm'));assert.equal(written,'');}
  else if(valid){assert.equal(calls[0].options.headers.authorization,'Bearer '+existingToken);assert.equal(written,html);assert.equal(storage.get('clarte_beta_access_token_v2'),existingToken);}
  else{assert.equal(storage.has('clarte_beta_access_token_v2'),false);assert.equal(calls.length,1);assert.equal(written,'');assert.ok(body.innerHTML.includes('已被撤销'));}
}
Promise.resolve().then(()=>checkInvite('',false)).then(()=>checkInvite('existing-token',true)).then(()=>checkInvite('revoked-token',false)).then(()=>console.log('PASS: app boot, old collections, remaining quantity, pen/ink links, backup time, brand sync, linked filters, detail/form routes, legacy migration, empty collections, gzip/SHA-256, centered modal CSS, invite required/valid/revoked paths')).catch(e=>{console.error(e);process.exitCode=1;});
