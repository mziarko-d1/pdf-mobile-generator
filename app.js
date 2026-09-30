'use strict';
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const uid=p=>(p||'id')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
const doctorPalette={ink:'#1D1E3C',body:'#3F506E',bg:'#F5F6FA',important:'#E6EAFF',warning:'#F7EAE4',remember:'#9AABDB',additional:'#F5F6FA'};
const PROJECT_INDEX_KEY='pdf-mobile-generator:projects:index:v1';
const PROJECT_DATA_PREFIX='pdf-mobile-generator:projects:data:v1:';
const PDF_INDEX_KEY='pdf-mobile-generator:saved-pdfs:index:v1';
const PDF_DATA_PREFIX='pdf-mobile-generator:saved-pdfs:data:v1:';
const FOLDER_HANDLE_KEY='pdf-mobile-generator:folder-handle:v1';
const ICONS={check:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',info:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5v5M12 7.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'};

function newBlock(type='paragraph'){
  const defaults={
    paragraph:{title:'Nagłówek',body:'Tutaj wpisz treść.'},
    bullets:{title:'Lista',body:'Pierwszy punkt\nDrugi punkt\nTrzeci punkt'},
    numbered:{title:'Kroki',body:'Pierwszy krok\nDrugi krok\nTrzeci krok'},
    important:{title:'Ważne',body:'Tutaj wpisz ważną informację.'},
    warning:{title:'Uważaj',body:'Tutaj wpisz ostrzeżenie.'},
    remember:{title:'Pamiętaj',body:'Tutaj wpisz informację do zapamiętania.'},
    additional:{title:'Dodatkowo',body:'Tutaj wpisz dodatkową informację.'},
    whitecard:{title:'Nagłówek',body:'Tutaj wpisz treść.'}
  };
  const d=defaults[type]||defaults.paragraph;
  return {id:uid('b'),type,title:d.title,body:d.body,showIcon:false,icon:'check'};
}
function coverScreen(){return{id:uid('p'),type:'cover',heading:'Tytuł materiału',blocks:[]}}
function contentScreen(){return{id:uid('p'),type:'content',title:'Tytuł ekranu',intro:'Krótki wstęp do treści.',blocks:[newBlock('paragraph')]}}
function initialState(){const c=coverScreen(),p=contentScreen();return{name:'Nowy materiał',w:390,h:844,format:'mobile',preset:'doctor',palette:{...doctorPalette},template:'',materialLogo:'',screens:[c,p],selected:c.id}}
let state=initialState();
let pendingImageData='',pendingImageName='',pendingImageTextData='',pendingImageTextName='';

function current(){return state.screens.find(s=>s.id===state.selected)||state.screens[0]}
function safeFileName(name){return String(name||'material').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').replace(/[. ]+$/,'')||'material'}
function keyName(name){return String(name||'Materiał').trim().toLocaleLowerCase('pl-PL')}
function fmtDate(ts){try{return new Intl.DateTimeFormat('pl-PL',{dateStyle:'short',timeStyle:'short'}).format(new Date(ts))}catch{return new Date(ts).toLocaleString()}}
function cloneState(){return JSON.parse(JSON.stringify(state))}

function applyTheme(){
  const r=document.documentElement,p=state.palette;
  r.style.setProperty('--ink',p.ink);r.style.setProperty('--body',p.body);r.style.setProperty('--bg',p.bg);r.style.setProperty('--important',p.important);r.style.setProperty('--warning',p.warning);r.style.setProperty('--remember',p.remember);r.style.setProperty('--additional',p.additional);
  const map={cInk:'ink',cBody:'body',cBg:'bg',cImportant:'important',cWarning:'warning',cRemember:'remember',cAdditional:'additional'};
  Object.entries(map).forEach(([id,k])=>{const el=$(id);if(el){el.value=p[k];el.disabled=state.preset==='doctor'}});
  $('doctorPreset').className=state.preset==='doctor'?'primary':'secondary';
  $('customPreset').className=state.preset==='custom'?'primary':'secondary';
  $('brandNote').textContent=state.preset==='doctor'?'Preset Doctor.One · Libre Franklin · ustalona paleta.':'Tryb własnego klienta · kolory materiału są edytowalne.';
}
function setFormat(v){
  state.format=v;
  if(v==='mobile'){state.w=390;state.h=844}
  if(v==='a4p'){state.w=794;state.h=1123}
  if(v==='a4l'){state.w=1123;state.h=794}
  if(v==='custom'){state.w=Math.max(200,Number($('customW').value)||390);state.h=Math.max(200,Number($('customH').value)||844)}
  $('customSize').classList.toggle('hidden',v!=='custom');
  renderPreview();updateFormatMeta();
}
function updateFormatMeta(){$('formatMeta').textContent=state.w+' × '+state.h+' px'}
function scaleForPreview(){const available=Math.max(280,window.innerWidth-(window.innerWidth>900?470:60));return Math.max(.32,Math.min(.82,available/state.w))}
function bodyHtml(body,type){
  const lines=String(body||'').split(/\n/).map(s=>s.trim()).filter(Boolean);
  if(type==='bullets')return '<ul>'+lines.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
  if(type==='numbered')return '<ol>'+lines.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>';
  return lines.length?lines.map(x=>'<p>'+esc(x)+'</p>').join(''):'<p></p>';
}
function blockHtml(b){
  if(b.type==='image'){const w=Math.max(20,Math.min(100,Number(b.width)||100));return '<div class="topic image-topic" draggable="true" data-block-id="'+b.id+'"><div class="image-block" style="width:'+w+'%"><img src="'+b.src+'" alt="'+esc(b.alt||'Obrazek')+'"></div></div>'}
  if(b.type==='imageText'){const w=Math.max(25,Math.min(70,Number(b.width)||45)),side=b.side==='right'?'right':'left';return '<div class="topic image-text-topic" draggable="true" data-block-id="'+b.id+'"><div class="image-text-block side-'+side+'" style="--image-col:'+w+'%"><div class="image-text-media"><img src="'+b.src+'" alt="'+esc(b.alt||'Obrazek')+'"></div><div class="image-text-copy"><h4 class="topic-title">'+esc(b.title||'Nagłówek')+'</h4><div class="topic-body">'+bodyHtml(b.body||'','paragraph')+'</div></div></div></div>'}
  const cls={important:'important',warning:'warning',remember:'remember',additional:'additional',whitecard:'whitecard'}[b.type]||'';
  const inline=b.type==='whitecard'?' style="background:#fff;box-shadow:0 30px 40px rgba(174,184,229,.30)!important;overflow:visible!important"':'';
  const box='<div class="'+(cls?'box '+cls:'')+'"'+inline+'><h4 class="topic-title">'+esc(b.title||'')+'</h4><div class="topic-body">'+bodyHtml(b.body||'',b.type)+'</div></div>';
  return '<div class="topic '+(b.showIcon?'has-icon':'')+'" draggable="true" data-block-id="'+b.id+'">'+(b.showIcon?'<div class="topic-icon">'+(ICONS[b.icon]||ICONS.check)+'</div>':'')+'<div>'+box+'</div></div>';
}
function renderPreview(){
  const sc=scaleForPreview();
  $('canvas').innerHTML=state.screens.map((p,i)=>{
    const stage='width:'+(state.w*sc)+'px;height:'+(state.h*sc)+'px';
    const pageStyle='width:'+state.w+'px;height:'+state.h+'px;transform:scale('+sc+');background:'+state.palette.bg+';';
    const baseBg=p.pdfBackground||state.template||'';
    const bg=baseBg?'<div class="page-bg" style="background-image:url(\''+baseBg+'\')"></div>':'';
    if(p.type==='cover')return '<div class="page-wrap" draggable="true" data-page-id="'+p.id+'"><div class="page-dragbar"><span>Strona '+(i+1)+' · '+state.w+' × '+state.h+'</span><span>⠿ przeciągnij stronę</span></div><div class="page-stage" style="'+stage+'"><section class="page cover '+(p.id===state.selected?'selected-page':'')+'" data-select-page="'+p.id+'" style="'+pageStyle+'">'+bg+'<div class="page-inner"><div class="material-logo">'+(state.materialLogo?'<img src="'+state.materialLogo+'" alt="logo">':'<span class="muted">Dodaj logo</span>')+'</div><div class="cover-title">'+esc(p.heading||'')+'</div></div></section></div></div>';
    const blocks=(p.blocks||[]).map(blockHtml).join('');
    return '<div class="page-wrap" draggable="true" data-page-id="'+p.id+'"><div class="page-dragbar"><span>Strona '+(i+1)+' · '+state.w+' × '+state.h+'</span><span>⠿ przeciągnij stronę</span></div><div class="page-stage" style="'+stage+'"><section class="page '+(p.id===state.selected?'selected-page':'')+'" data-select-page="'+p.id+'" data-drop-page="'+p.id+'" style="'+pageStyle+'">'+bg+'<div class="page-inner">'+(p.pdfBackground?'':'<h3 class="page-title">'+esc(p.title||'')+'</h3><p class="page-intro">'+esc(p.intro||'')+'</p>')+'<div class="'+(p.pdfBackground?'overlay-list':'topic-list')+'">'+blocks+'</div></div></section></div></div>';
  }).join('');
  bindPreviewDnD();
}
function renderScreenList(){
  $('screenList').innerHTML=state.screens.map((p,i)=>'<div class="screen-row '+(p.id===state.selected?'active':'')+'" draggable="true" data-screen-row="'+p.id+'"><span class="screen-drag">⠿</span><button class="screen-select" data-screen="'+p.id+'">'+(i+1)+'. '+esc(p.type==='cover'?(p.heading||'Okładka'):(p.title||'Treść'))+'</button><button class="danger mini" data-remove-screen="'+p.id+'">×</button></div>').join('');
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.screen;renderScreenList();renderEditor();renderPreview()});
  document.querySelectorAll('[data-remove-screen]').forEach(b=>b.onclick=()=>removeScreen(b.dataset.removeScreen));
  document.querySelectorAll('[data-screen-row]').forEach(row=>{row.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','page:'+row.dataset.screenRow);row.classList.add('dragging')});row.addEventListener('dragend',()=>row.classList.remove('dragging'));row.addEventListener('dragover',e=>e.preventDefault());row.addEventListener('drop',e=>{e.preventDefault();const d=e.dataTransfer.getData('text/plain');if(d.startsWith('page:'))movePage(d.slice(5),row.dataset.screenRow)})});
}
function renderEditor(){
  const p=current(); if(!p){$('editor').innerHTML='';return}
  if(p.type==='cover'){
    $('editor').innerHTML='<label>Tytuł okładki</label><textarea id="coverHeading">'+esc(p.heading||'')+'</textarea>';
    $('coverHeading').oninput=e=>{p.heading=e.target.value;renderPreview();renderScreenList()};return;
  }
  const bgHint=p.pdfBackground?'<div class="brand-note">Oryginalna strona PDF jest tłem. Edytujesz tylko nakładki.</div>':'';
  $('editor').innerHTML=bgHint+(p.pdfBackground?'':'<label>Tytuł ekranu</label><input id="pageTitle" value="'+esc(p.title||'')+'"><label>Wstęp</label><textarea id="pageIntro">'+esc(p.intro||'')+'</textarea>')+'<div class="block-head" style="margin-top:12px"><h4>Bloki</h4><div class="block-editor-tools"><button id="addText" class="mini secondary">+ Tekst</button><button id="addList" class="mini secondary">+ Lista</button><button id="addBox" class="mini secondary">+ Box</button></div></div><div id="blocks"></div>';
  if(!p.pdfBackground){$('pageTitle').oninput=e=>{p.title=e.target.value;renderPreview();renderScreenList()};$('pageIntro').oninput=e=>{p.intro=e.target.value;renderPreview()}}
  $('addText').onclick=()=>{p.blocks.push(newBlock('paragraph'));renderEditor();renderPreview()};
  $('addList').onclick=()=>{p.blocks.push(newBlock('bullets'));renderEditor();renderPreview()};
  $('addBox').onclick=()=>{p.blocks.push(newBlock('important'));renderEditor();renderPreview()};
  $('blocks').innerHTML=(p.blocks||[]).map((b,i)=>blockEditorHtml(b,i)).join('');
  bindBlockEditors(p);
}
function blockEditorHtml(b,i){
  if(b.type==='image'){
    const w=Math.max(20,Math.min(100,Number(b.width)||100));
    return '<div class="block-card"><div class="block-head"><h4>Blok '+(i+1)+' · Obrazek</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div><img class="image-editor-preview" src="'+b.src+'"><label>Szerokość</label><div class="range-row"><input type="range" min="20" max="100" step="5" value="'+w+'" data-imgwidth="'+b.id+'"><span class="range-value" data-imgwidth-label="'+b.id+'">'+w+'%</span></div></div>';
  }
  if(b.type==='imageText'){
    const w=Math.max(25,Math.min(70,Number(b.width)||45));
    return '<div class="block-card"><div class="block-head"><h4>Blok '+(i+1)+' · Obrazek + tekst</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div><img class="image-editor-preview" src="'+b.src+'"><label>Układ</label><select data-imgside="'+b.id+'"><option value="left" '+(b.side!=='right'?'selected':'')+'>Obrazek po lewej</option><option value="right" '+(b.side==='right'?'selected':'')+'>Obrazek po prawej</option></select><label>Nagłówek</label><input data-imgtitle="'+b.id+'" value="'+esc(b.title||'')+'"><label>Tekst</label><textarea data-imgbody="'+b.id+'">'+esc(b.body||'')+'</textarea><label>Szerokość obrazka</label><div class="range-row"><input type="range" min="25" max="70" step="5" value="'+w+'" data-imgtextwidth="'+b.id+'"><span class="range-value" data-imgtextwidth-label="'+b.id+'">'+w+'%</span></div></div>';
  }
  return '<div class="block-card"><div class="block-head"><h4>Blok '+(i+1)+'</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div><label>Typ</label><select data-b="'+b.id+'" data-k="type"><option value="paragraph" '+(b.type==='paragraph'?'selected':'')+'>Akapit</option><option value="bullets" '+(b.type==='bullets'?'selected':'')+'>Lista kropkowana</option><option value="numbered" '+(b.type==='numbered'?'selected':'')+'>Lista numerowana</option><option value="important" '+(b.type==='important'?'selected':'')+'>Ważne</option><option value="warning" '+(b.type==='warning'?'selected':'')+'>Uważaj</option><option value="remember" '+(b.type==='remember'?'selected':'')+'>Pamiętaj</option><option value="additional" '+(b.type==='additional'?'selected':'')+'>Dodatkowy</option><option value="whitecard" '+(b.type==='whitecard'?'selected':'')+'>Biały z cieniem</option></select><label>Nagłówek</label><input data-b="'+b.id+'" data-k="title" value="'+esc(b.title||'')+'"><label>Treść</label><textarea data-b="'+b.id+'" data-k="body">'+esc(b.body||'')+'</textarea><label class="checkbox"><input data-b="'+b.id+'" data-k="showIcon" type="checkbox" '+(b.showIcon?'checked':'')+'> Ikona po lewej</label>'+(b.showIcon?'<label>Ikona</label><select data-b="'+b.id+'" data-k="icon"><option value="check" '+(b.icon==='check'?'selected':'')+'>Check</option><option value="info" '+(b.icon==='info'?'selected':'')+'>Info</option></select>':'')+'</div>';
}
function bindBlockEditors(p){
  document.querySelectorAll('[data-r]').forEach(x=>x.onclick=()=>{p.blocks=p.blocks.filter(b=>b.id!==x.dataset.r);renderEditor();renderPreview()});
  document.querySelectorAll('[data-imgwidth]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgwidth);if(!b)return;b.width=Number(x.value);const l=document.querySelector('[data-imgwidth-label="'+b.id+'"]');if(l)l.textContent=b.width+'%';renderPreview()});
  document.querySelectorAll('[data-imgtextwidth]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgtextwidth);if(!b)return;b.width=Number(x.value);const l=document.querySelector('[data-imgtextwidth-label="'+b.id+'"]');if(l)l.textContent=b.width+'%';renderPreview()});
  document.querySelectorAll('[data-imgside]').forEach(x=>x.onchange=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgside);if(b){b.side=x.value;renderPreview()}});
  document.querySelectorAll('[data-imgtitle]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgtitle);if(b){b.title=x.value;renderPreview()}});
  document.querySelectorAll('[data-imgbody]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgbody);if(b){b.body=x.value;renderPreview()}});
  document.querySelectorAll('[data-b]').forEach(x=>{const h=()=>{const b=p.blocks.find(z=>z.id===x.dataset.b);if(!b)return;const k=x.dataset.k;b[k]=x.type==='checkbox'?x.checked:x.value;if(k==='type'||k==='showIcon')renderEditor();renderPreview()};if(x.tagName==='TEXTAREA'||(x.tagName==='INPUT'&&x.type!=='checkbox'))x.oninput=h;else x.onchange=h});
}
function render(){applyTheme();$('projectName').value=state.name||'Nowy materiał';$('format').value=state.format||'mobile';$('customW').value=state.w;$('customH').value=state.h;$('customSize').classList.toggle('hidden',state.format!=='custom');renderScreenList();renderEditor();renderPreview();updateFormatMeta()}
function removeScreen(id){if(state.screens.length<=1){alert('Projekt musi mieć przynajmniej jeden ekran.');return}state.screens=state.screens.filter(s=>s.id!==id);if(!state.screens.some(s=>s.id===state.selected))state.selected=state.screens[0].id;render()}
function movePage(sourceId,targetId){if(sourceId===targetId)return;let from=state.screens.findIndex(s=>s.id===sourceId),to=state.screens.findIndex(s=>s.id===targetId);if(from<0||to<0)return;const [item]=state.screens.splice(from,1);if(from<to)to--;state.screens.splice(to,0,item);render()}
function findScreenAndBlock(blockId){for(const s of state.screens){const i=(s.blocks||[]).findIndex(b=>b.id===blockId);if(i>=0)return{screen:s,index:i,block:s.blocks[i]}}return null}
function moveBlock(blockId,targetScreenId,targetBlockId){const src=findScreenAndBlock(blockId),target=state.screens.find(s=>s.id===targetScreenId);if(!src||!target||target.type==='cover')return;src.screen.blocks.splice(src.index,1);let idx=targetBlockId?target.blocks.findIndex(b=>b.id===targetBlockId):target.blocks.length;if(idx<0)idx=target.blocks.length;target.blocks.splice(idx,0,src.block);state.selected=target.id;render()}
function addBlockAt(type,targetScreenId,targetBlockId){
  const target=state.screens.find(s=>s.id===targetScreenId);if(!target||target.type==='cover')return;
  let b;
  if(type==='image'){if(!pendingImageData)return;b={id:uid('b'),type:'image',src:pendingImageData,alt:pendingImageName||'Obrazek',width:100}}
  else if(type==='imageText'){if(!pendingImageTextData)return;b={id:uid('b'),type:'imageText',src:pendingImageTextData,alt:pendingImageTextName||'Obrazek',title:'Nagłówek',body:'Tutaj wpisz treść.',side:'left',width:45}}
  else b=newBlock(type);
  let idx=targetBlockId?target.blocks.findIndex(x=>x.id===targetBlockId):target.blocks.length;if(idx<0)idx=target.blocks.length;target.blocks.splice(idx,0,b);state.selected=target.id;render();
}
function bindPreviewDnD(){
  document.querySelectorAll('[data-select-page]').forEach(el=>el.onclick=e=>{if(e.target.closest('.topic'))return;state.selected=el.dataset.selectPage;renderScreenList();renderEditor();renderPreview()});
  document.querySelectorAll('.page-wrap[data-page-id]').forEach(w=>{w.addEventListener('dragstart',e=>{if(e.target.closest('.topic'))return;e.dataTransfer.setData('text/plain','page:'+w.dataset.pageId);w.classList.add('dragging')});w.addEventListener('dragend',()=>w.classList.remove('dragging'));w.addEventListener('dragover',e=>{e.preventDefault();w.classList.add('drop-target')});w.addEventListener('dragleave',()=>w.classList.remove('drop-target'));w.addEventListener('drop',e=>{e.preventDefault();w.classList.remove('drop-target');const d=e.dataTransfer.getData('text/plain');if(d.startsWith('page:'))movePage(d.slice(5),w.dataset.pageId)})});
  document.querySelectorAll('.palette-item').forEach(el=>{el.ondragstart=e=>{const t=el.dataset.newType;if(t==='image'&&!pendingImageData){e.preventDefault();return}if(t==='imageText'&&!pendingImageTextData){e.preventDefault();return}e.dataTransfer.setData('text/plain','new:'+t);e.dataTransfer.effectAllowed='copy'}});
  document.querySelectorAll('.topic[data-block-id]').forEach(el=>{el.addEventListener('dragstart',e=>{e.stopPropagation();e.dataTransfer.setData('text/plain','block:'+el.dataset.blockId);el.classList.add('dragging')});el.addEventListener('dragend',()=>el.classList.remove('dragging'));el.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();el.classList.add('drop-target')});el.addEventListener('dragleave',()=>el.classList.remove('drop-target'));el.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();el.classList.remove('drop-target');const page=el.closest('[data-drop-page]');if(!page)return;const d=e.dataTransfer.getData('text/plain');if(d.startsWith('block:'))moveBlock(d.slice(6),page.dataset.dropPage,el.dataset.blockId);else if(d.startsWith('new:'))addBlockAt(d.slice(4),page.dataset.dropPage,el.dataset.blockId)})});
  document.querySelectorAll('[data-drop-page]').forEach(page=>{page.addEventListener('dragover',e=>e.preventDefault());page.addEventListener('drop',e=>{if(e.target.closest('.topic'))return;e.preventDefault();const d=e.dataTransfer.getData('text/plain');if(d.startsWith('block:'))moveBlock(d.slice(6),page.dataset.dropPage,null);else if(d.startsWith('new:'))addBlockAt(d.slice(4),page.dataset.dropPage,null)})});
}

async function getProjectIndex(){return(await localforage.getItem(PROJECT_INDEX_KEY))||[]}
async function setProjectIndex(v){await localforage.setItem(PROJECT_INDEX_KEY,v)}
async function refreshSaved(){const items=await getProjectIndex();$('savedProjects').innerHTML='<option value="">— wybierz —</option>'+items.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('')}
async function saveProject(){
  state.name=$('projectName').value.trim()||'Nowy materiał';const key=keyName(state.name);let items=await getProjectIndex();let item=items.find(x=>x.key===key);if(!item)item={id:uid('project'),key,createdAt:Date.now()};item.name=state.name;item.updatedAt=Date.now();await localforage.setItem(PROJECT_DATA_PREFIX+item.id,cloneState());items=[item,...items.filter(x=>x.id!==item.id)];await setProjectIndex(items);await refreshSaved();$('savedProjects').value=item.id;$('saveStatus').className='status ok';$('saveStatus').textContent='Projekt zapisany: '+state.name;return item;
}
async function loadProject(id){if(!id)return;const data=await localforage.getItem(PROJECT_DATA_PREFIX+id);if(!data){alert('Nie mogę znaleźć projektu.');return}state=data;if(!state.palette)state.palette={...doctorPalette};render();$('saveStatus').className='status ok';$('saveStatus').textContent='Projekt otwarty do edycji.'}
async function deleteProject(id){if(!id)return;const items=await getProjectIndex(),item=items.find(x=>x.id===id);if(!confirm('Usunąć projekt'+(item?' „'+item.name+'”':'')+'?'))return;await localforage.removeItem(PROJECT_DATA_PREFIX+id);await setProjectIndex(items.filter(x=>x.id!==id));await refreshSaved()}

async function getPdfIndex(){return(await localforage.getItem(PDF_INDEX_KEY))||[]}
async function setPdfIndex(v){await localforage.setItem(PDF_INDEX_KEY,v)}
async function savePdfToLibrary(name,bytes){const key=keyName(name);let items=await getPdfIndex();let item=items.find(x=>x.key===key);if(!item)item={id:uid('pdf'),key,createdAt:Date.now()};const blob=new Blob([bytes],{type:'application/pdf'});await localforage.setItem(PDF_DATA_PREFIX+item.id,blob);item.name=name;item.updatedAt=Date.now();item.size=blob.size;items=[item,...items.filter(x=>x.id!==item.id)];await setPdfIndex(items);await renderPdfLibrary()}
async function openSavedPdf(id){const blob=await localforage.getItem(PDF_DATA_PREFIX+id);if(!blob)return alert('Nie mogę znaleźć tego PDF-u.');const url=URL.createObjectURL(blob);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function downloadSavedPdf(id,name){const blob=await localforage.getItem(PDF_DATA_PREFIX+id);if(!blob)return alert('Nie mogę znaleźć tego PDF-u.');downloadBlob(blob,safeFileName(name)+'.pdf')}
async function deleteSavedPdf(id){let items=await getPdfIndex();const item=items.find(x=>x.id===id);if(!confirm('Usunąć zapisany PDF'+(item?' „'+item.name+'”':'')+'?'))return;await localforage.removeItem(PDF_DATA_PREFIX+id);items=items.filter(x=>x.id!==id);await setPdfIndex(items);await renderPdfLibrary()}
async function editSavedPdf(id){const items=await getPdfIndex(),item=items.find(x=>x.id===id),blob=await localforage.getItem(PDF_DATA_PREFIX+id);if(!blob)return alert('Nie mogę znaleźć tego PDF-u.');const ok=await openProjectPdfBytes(await blob.arrayBuffer(),item?.name);if(!ok)alert('Ten PDF nie zawiera projektu do pełnej edycji.')}
async function renderPdfLibrary(){const list=$('savedPdfLibraryList'),items=await getPdfIndex();if(!items.length){list.innerHTML='<div class="pdf-library-empty">Nie masz jeszcze zapisanych PDF-ów. Pojawią się tutaj po użyciu „Zapisz + PDF”.</div>';return}list.innerHTML=items.map(item=>'<div class="pdf-library-item"><div><div class="pdf-library-name">'+esc(item.name)+'.pdf</div><div class="pdf-library-date">Ostatni zapis: '+fmtDate(item.updatedAt||item.createdAt)+'</div></div><div class="pdf-library-actions"><button class="ghost" data-edit-pdf="'+item.id+'">Edytuj</button><button class="ghost" data-open-pdf="'+item.id+'">Otwórz</button><button class="ghost" data-download-pdf="'+item.id+'">Pobierz</button><button class="danger" data-delete-pdf="'+item.id+'">Usuń</button></div></div>').join('');document.querySelectorAll('[data-edit-pdf]').forEach(b=>b.onclick=()=>editSavedPdf(b.dataset.editPdf));document.querySelectorAll('[data-open-pdf]').forEach(b=>b.onclick=()=>openSavedPdf(b.dataset.openPdf));document.querySelectorAll('[data-download-pdf]').forEach(b=>b.onclick=()=>{const i=items.find(x=>x.id===b.dataset.downloadPdf);if(i)downloadSavedPdf(i.id,i.name)});document.querySelectorAll('[data-delete-pdf]').forEach(b=>b.onclick=()=>deleteSavedPdf(b.dataset.deletePdf))}

async function getFolderHandle(){try{return await localforage.getItem(FOLDER_HANDLE_KEY)}catch{return null}}
async function updateFolderStatus(){const el=$('folderStatus');if(!('showDirectoryPicker'in window)){el.className='folder-status';el.textContent='Ta przeglądarka nie obsługuje bezpośredniego zapisu do folderu. PDF nadal zapisze się w generatorze i pobierze normalnie.';return}const h=await getFolderHandle();if(h){el.className='folder-status connected';el.textContent='Folder: '+h.name+' · pliki o tej samej nazwie będą nadpisywane.'}else{el.className='folder-status';el.textContent='Nie wybrano folderu. Przy pierwszym „Zapisz + PDF” możesz wskazać folder.'}}
async function chooseFolder(){if(!('showDirectoryPicker'in window)){alert('Bezpośredni zapis do folderu działa w Chrome/Edge na komputerze.');return null}try{const h=await showDirectoryPicker({mode:'readwrite'});await localforage.setItem(FOLDER_HANDLE_KEY,h);await updateFolderStatus();return h}catch(e){if(e?.name!=='AbortError')alert('Nie udało się wybrać folderu.');return null}}
async function ensureFolderPermission(h){if(!h)return false;const o={mode:'readwrite'};if((await h.queryPermission(o))==='granted')return true;return (await h.requestPermission(o))==='granted'}
async function writePdfToFolder(name,bytes){let h=await getFolderHandle();if(!h)h=await chooseFolder();if(!h)return false;try{if(!(await ensureFolderPermission(h)))return false;const fh=await h.getFileHandle(safeFileName(name)+'.pdf',{create:true}),w=await fh.createWritable();await w.write(new Blob([bytes],{type:'application/pdf'}));await w.close();return true}catch(e){console.error(e);return false}}

function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
async function makeEditablePdf(){
  await document.fonts.ready;const J=window.jspdf.jsPDF,ori=state.w>=state.h?'landscape':'portrait',pdf=new J({orientation:ori,unit:'px',format:[state.w,state.h],hotfixes:['px_scaling']}),els=[...document.querySelectorAll('.page')];
  for(let i=0;i<els.length;i++){
    const el=els[i],oldTransform=el.style.transform,oldShadow=el.style.boxShadow,hadSelected=el.classList.contains('selected-page');el.style.transform='none';el.style.boxShadow='none';el.classList.remove('selected-page');
    const c=await html2canvas(el,{scale:4,useCORS:true,backgroundColor:null,logging:false});el.style.transform=oldTransform;el.style.boxShadow=oldShadow;if(hadSelected)el.classList.add('selected-page');
    if(i)pdf.addPage([state.w,state.h],ori);pdf.addImage(c.toDataURL('image/jpeg',.98),'JPEG',0,0,state.w,state.h,'','SLOW');
  }
  const base=new Uint8Array(pdf.output('arraybuffer')),doc=await PDFLib.PDFDocument.load(base),project=new TextEncoder().encode(JSON.stringify({...cloneState(),name:$('projectName').value.trim()||state.name}));await doc.attach(project,'pdf-mobile-generator-project.json',{mimeType:'application/json',description:'Editable project for PDF mobile generator'});doc.setTitle($('projectName').value.trim()||'Materiał');doc.setCreator('PDF mobile generator - Doctor.One');return await doc.save();
}
async function exportProjectPdf(saveFirst){const btn=saveFirst?$('saveAndExport'):$('exportPdf'),old=btn.textContent;btn.disabled=true;btn.textContent=saveFirst?'Zapisuję HQ…':'Generuję HQ…';try{state.name=$('projectName').value.trim()||state.name||'Materiał';if(saveFirst)await saveProject();const bytes=await makeEditablePdf();if(saveFirst){await savePdfToLibrary(state.name,bytes);const folderSaved=await writePdfToFolder(state.name,bytes);if(folderSaved){$('saveStatus').className='status ok';$('saveStatus').textContent='Zapisano projekt, PDF w „Moje PDF-y” i plik w wybranym folderze.'}else{downloadBlob(new Blob([bytes],{type:'application/pdf'}),safeFileName(state.name)+'.pdf');$('saveStatus').className='status ok';$('saveStatus').textContent='Zapisano projekt i PDF w generatorze. Plik został też pobrany.'}}else{downloadBlob(new Blob([bytes],{type:'application/pdf'}),safeFileName(state.name)+'.pdf');$('saveStatus').className='status ok';$('saveStatus').textContent='PDF HQ wyeksportowany.'}}catch(e){console.error(e);$('saveStatus').className='status err';$('saveStatus').textContent='Eksport nie powiódł się: '+(e.message||'błąd')}finally{btn.disabled=false;btn.textContent=old}}

async function openProjectPdfBytes(arrayBuffer,nameHint){try{const pdf=await pdfjsLib.getDocument({data:arrayBuffer}).promise,atts=await pdf.getAttachments();if(!atts)return false;let raw=null;for(const k of Object.keys(atts)){const a=atts[k];if((a.filename||k).includes('pdf-mobile-generator-project.json')){raw=a.content;break}}if(!raw)return false;const project=JSON.parse(new TextDecoder().decode(raw));if(!project?.screens)return false;state=project;if(!state.palette)state.palette={...doctorPalette};state.name=nameHint||state.name||'Materiał';render();$('saveStatus').className='status ok';$('saveStatus').textContent='PDF otwarty do edycji.';window.scrollTo({top:0,behavior:'smooth'});return true}catch(e){console.error(e);return false}}
async function renderPdfPageToDataUrl(page,targetW,targetH){const base=page.getViewport({scale:1}),scale=Math.max(targetW/base.width,targetH/base.height),vp=page.getViewport({scale}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;return c.toDataURL('image/jpeg',.94)}
async function importPdf(file){$('importStatus').textContent='Otwieram PDF…';const ab=await file.arrayBuffer();if(await openProjectPdfBytes(ab,file.name.replace(/\.pdf$/i,''))){$('importStatus').className='status ok';$('importStatus').textContent='PDF z generatora został otwarty do pełnej edycji.';return}const pdf=await pdfjsLib.getDocument({data:ab}).promise,first=await pdf.getPage(1),vp=first.getViewport({scale:1});state.w=vp.width>=vp.height?1123:794;state.h=vp.width>=vp.height?794:1123;state.format='custom';const screens=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);if($('pdfImportMode').value==='background'){const bg=await renderPdfPageToDataUrl(page,state.w,state.h);screens.push({id:uid('p'),type:'content',title:'',intro:'',blocks:[],pdfBackground:bg})}else{const txt=await page.getTextContent(),body=txt.items.map(x=>x.str).join(' ').replace(/\s+/g,' ').trim();screens.push({id:uid('p'),type:'content',title:'Strona '+i,intro:'',blocks:[{...newBlock('paragraph'),title:'',body}]})}}state.screens=screens.length?screens:[contentScreen()];state.selected=state.screens[0].id;state.name=file.name.replace(/\.pdf$/i,'');render();$('importStatus').className='status ok';$('importStatus').textContent='PDF zaimportowany ('+pdf.numPages+' stron).'}
async function importDocx(file){$('importStatus').textContent='Otwieram DOCX…';const out=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()}),paras=out.value.split(/\n+/).map(x=>x.trim()).filter(Boolean);const screens=[];for(let i=0;i<paras.length;i+=5){const chunk=paras.slice(i,i+5);screens.push({id:uid('p'),type:'content',title:chunk.shift()||'Treść',intro:'',blocks:chunk.map(t=>({...newBlock('paragraph'),title:'',body:t}))})}state.screens=screens.length?screens:[contentScreen()];state.selected=state.screens[0].id;state.name=file.name.replace(/\.docx$/i,'');render();$('importStatus').className='status ok';$('importStatus').textContent='DOCX zaimportowany do edycji.'}

function readImageFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
async function templateFromFile(file){if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,page=await pdf.getPage(1);return await renderPdfPageToDataUrl(page,state.w,state.h)}return await readImageFile(file)}

$('projectName').oninput=e=>{state.name=e.target.value};
$('saveProject').onclick=()=>saveProject();$('loadProject').onclick=()=>loadProject($('savedProjects').value);$('deleteProject').onclick=()=>deleteProject($('savedProjects').value);
$('newProject').onclick=()=>{if(!confirm('Utworzyć nowy projekt?\n\nNiezapisane zmiany zostaną utracone.'))return;state=initialState();render();$('saveStatus').className='status';$('saveStatus').textContent='Nowy projekt.'};
$('format').onchange=e=>setFormat(e.target.value);$('customW').oninput=()=>{if(state.format==='custom')setFormat('custom')};$('customH').oninput=()=>{if(state.format==='custom')setFormat('custom')};
$('doctorPreset').onclick=()=>{state.preset='doctor';state.palette={...doctorPalette};applyTheme();renderPreview()};$('customPreset').onclick=()=>{state.preset='custom';applyTheme();renderPreview()};
[['cInk','ink'],['cBody','body'],['cBg','bg'],['cImportant','important'],['cWarning','warning'],['cRemember','remember'],['cAdditional','additional']].forEach(([id,k])=>{$(id).oninput=e=>{if(state.preset==='doctor')return;state.palette[k]=e.target.value;applyTheme();renderPreview()}});
$('addCover').onclick=()=>{const p=coverScreen();state.screens.push(p);state.selected=p.id;render()};$('addContent').onclick=()=>{const p=contentScreen();state.screens.push(p);state.selected=p.id;render()};
$('materialLogo').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;state.materialLogo=await readImageFile(f);renderPreview()};
$('templateUpload').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;state.template=await templateFromFile(f);renderPreview()};$('removeTemplate').onclick=()=>{state.template='';renderPreview()};
$('imagePaletteButton').onclick=()=>$('imageElementUpload').click();$('imageTextPaletteButton').onclick=()=>$('imageTextElementUpload').click();
$('imageElementUpload').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;pendingImageData=await readImageFile(f);pendingImageName=f.name;const b=$('imagePaletteButton');b.draggable=true;b.classList.add('ready');b.innerHTML='Obrazek<small>gotowy — przeciągnij</small><img class="palette-thumb" src="'+pendingImageData+'">'};
$('imageTextElementUpload').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;pendingImageTextData=await readImageFile(f);pendingImageTextName=f.name;const b=$('imageTextPaletteButton');b.draggable=true;b.classList.add('ready');b.innerHTML='Obrazek + tekst<small>gotowy — przeciągnij</small><img class="palette-thumb" src="'+pendingImageTextData+'">'};
$('openDocument').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(/\.pdf$/i.test(f.name)||f.type==='application/pdf')await importPdf(f);else await importDocx(f)}catch(err){console.error(err);$('importStatus').className='status err';$('importStatus').textContent='Nie udało się otworzyć pliku: '+(err.message||'błąd')}};
$('chooseFolder').onclick=()=>chooseFolder();$('disconnectFolder').onclick=async()=>{await localforage.removeItem(FOLDER_HANDLE_KEY);await updateFolderStatus()};
$('exportPdf').onclick=()=>exportProjectPdf(false);$('saveAndExport').onclick=()=>exportProjectPdf(true);
window.addEventListener('resize',()=>renderPreview());

(async function init(){render();await refreshSaved();await renderPdfLibrary();await updateFolderStatus()})();