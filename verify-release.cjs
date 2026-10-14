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

assert.ok(!/workers\.dev|apiPost|\/redeem|\/verify/.test(entry));
assert.ok(entry.includes('vendor/pako.min.js'));
const policyContext={window:{}};
vm.runInNewContext(fs.readFileSync(root+'/invite-policy.js','utf8'),policyContext);
const livePolicy=policyContext.window.CLARTE_INVITE_POLICY;
assert.equal(livePolicy.hashes.length,51);
assert.equal(new Set(livePolicy.hashes).size,51);
assert.equal(livePolicy.expiresAt,'2027-04-14T13:18:31+08:00');
const gateScript=entry.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(gateScript);
const testCode='CLARTE-TESTAB-TESTCD';
const hash=crypto.createHash('sha256').update(testCode).digest('hex');
async function checkInvite({saved,code,expired=false,badPolicy=false,denyStorage=false}={}){
  const policy={version:'test',expiresAt:expired?'2020-01-01T00:00:00Z':'2099-01-01T00:00:00Z',hashes:[hash]};
  const storage=new Map(Object.entries(original));
  if(saved)storage.set('clarte_frontend_access_v1',saved);
  let written='';const calls=[],els={};
  for(const id of ['inviteForm','inviteCode','inviteBtn','inviteMsg'])els[id]={value:'',textContent:'',addEventListener(type,fn){this[type]=fn},focus(){},select(){}};
  const body={innerHTML:''};
  const context=vm.createContext({window:{CLARTE_INVITE_POLICY:badPolicy?null:policy,addEventListener(){}},crypto:crypto.webcrypto,localStorage:{getItem:k=>{if(denyStorage)throw Error('blocked');return storage.get(k)||null},setItem:(k,v)=>{if(denyStorage)throw Error('blocked');storage.set(k,v)},removeItem:k=>storage.delete(k)},document:{body,getElementById:id=>els[id],open(){},write:s=>written=s,close(){},addEventListener(){}},console,AbortController,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},Uint8Array,TextDecoder,TextEncoder,atob,pako:{ungzip:b=>zlib.gunzipSync(b)},fetch:async(url)=>{calls.push(url);assert.ok(!url.includes('://'));return {ok:true,status:200,text:async()=>fs.readFileSync(root+'/'+url,'utf8')};}});
  vm.runInContext(gateScript,context);
  await new Promise(r=>setImmediate(r));
  if(code){els.inviteCode.value=code;await els.inviteForm.submit({preventDefault(){}});}
  const valid=!badPolicy&&!expired&&(code?.trim().toUpperCase()===testCode||saved===JSON.stringify({version:'test',hash}));
  if(valid){assert.equal(written,html);assert.equal(calls.length,manifest.payloads.length);}
  else{assert.equal(written,'');assert.equal(calls.length,0);assert.ok(body.innerHTML.includes('inviteForm'));}
  for(const [k,v] of Object.entries(original))assert.equal(storage.get(k),v,'preserve '+k);
}
(async()=>{
  await checkInvite(); // old server token must not silently grant front-end access
  await checkInvite({code:testCode});
  await checkInvite({code:'  '+testCode.toLowerCase()+'  '});
  await checkInvite({code:'CLARTE-INVALID-CODE'});
  await checkInvite({saved:JSON.stringify({version:'test',hash})});
  await checkInvite({saved:'broken json'});
  await checkInvite({saved:JSON.stringify({version:'previous',hash})});
  await checkInvite({code:testCode,expired:true});
  await checkInvite({saved:JSON.stringify({version:'test',hash}),expired:true});
  await checkInvite({code:testCode,badPolicy:true});
  await checkInvite({code:testCode,denyStorage:true});
  console.log('PASS: app/data regressions, 51 unique hashes, local valid/invalid/expired/missing-policy gates, repeated use, remembered access, old-token isolation, blocked storage, no external validation calls');
})().catch(e=>{console.error(e);process.exitCode=1});
