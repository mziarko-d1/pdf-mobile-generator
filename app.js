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
    whitecard:{title:'',body:'Krótki opis lub doprecyzowanie.'},
    quote:{title:'',body:'Tutaj wpisz treść cytatu.'},
    metric:{title:'',body:'Średnia ocena jakości kontaktu z lekarzem.'}
  };
  const d=defaults[type]||defaults.paragraph;
  const block={id:uid('b'),type,title:d.title,body:d.body,showIcon:false,icon:'check'};
  if(type==='metric'){
    Object.assign(block,{mode:'rating',value:'9,47',unit:'%',ratingScale:10,emphasis:'74% ocen to maksymalne 10/10.',semanticRole:'patient'});
  }
  if(type==='quote'){
    Object.assign(block,{author:'Imię i nazwisko',authorRole:'Stanowisko · organizacja',showPhoto:true,photoSrc:'',photoAlt:'Zdjęcie autora',semanticRole:'hcp'});
  }
  if(type==='whitecard'){
    Object.assign(block,{
      bigText:'92%',
      smallText:d.body,
      mediaType:'none',
      mediaPosition:'top',
      mediaAlign:'left',
      mediaSrc:'',
      mediaAlt:'Obrazek',
      icon:'check',
      iconColor:'#3F506E',
      titleColor:'#1D1E3C',
      bigTextColor:'#3F506E',
      smallTextColor:'#3F506E',
      bigTextSize:'m'
    });
  }
  return block;
}
function normalizeMetric(block){
  if(!block||block.type!=='metric') return block;
  block.mode=block.mode==='stat'?'stat':'rating';
  block.value=String(block.value??'');
  block.unit=String(block.unit??'%');
  block.ratingScale=Number(block.ratingScale)===5?5:10;
  block.body=String(block.body??'');
  block.emphasis=String(block.emphasis??'');
  return block;
}
function metricRatingValue(block){
  const text=String(block.value??'').trim().replace(',','.');
  if(!text) return null;
  const value=Number(text);
  return Number.isFinite(value)&&value>=0&&value<=block.ratingScale?value:null;
}
function metricDisplayValue(block){
  if(block.mode==='stat') return block.value;
  const value=metricRatingValue(block);
  return value===null?'—':value.toLocaleString('pl-PL',{maximumFractionDigits:2});
}
function metricStarsHtml(block){
  const score=metricRatingValue(block)??0;
  const star='M12 2.4 15 8.5 21.7 9.5 16.9 14.2 18 21 12 17.8 6 21 7.1 14.2 2.3 9.5 9 8.5Z';
  return Array.from({length:block.ratingScale},(_,index)=>{
    const filled=Math.max(0,Math.min(1,score-index));
    const clip='metric-star-'+String(block.id).replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+index;
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-star-fill="'+filled+'"><defs><clipPath id="'+clip+'"><rect x="0" y="0" width="'+(24*filled)+'" height="24"/></clipPath></defs><path d="'+star+'" fill="currentColor" opacity=".28"/><path d="'+star+'" fill="currentColor" clip-path="url(#'+clip+')"/></svg>';
  }).join('');
}
function normalizeQuote(block){
  if(!block||block.type!=='quote') return block;
  block.body=String(block.body??'');
  block.author=String(block.author??'');
  block.authorRole=String(block.authorRole??'');
  block.showPhoto=block.showPhoto!==false;
  block.photoSrc=String(block.photoSrc||'');
  block.photoAlt=String(block.photoAlt||'Zdjęcie autora');
  return block;
}
// Keep supplied quote icons self-contained for hosted previews and PDF rendering.
const QUOTE_MARK_IMAGES={hcp:'data:image/png;base64,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',patient:'data:image/png;base64,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'};
function quoteMarkHtml(){
  return '<span class="quote-mark" aria-hidden="true"><img class="quote-mark-hcp" src="'+QUOTE_MARK_IMAGES.hcp+'" alt=""><img class="quote-mark-patient" src="'+QUOTE_MARK_IMAGES.patient+'" alt=""><svg class="quote-mark-fallback" viewBox="0 0 80 52" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M31 5C14 8 5 19 5 34c0 9 5 14 14 14s15-6 15-15-6-15-14-15c-2 0-5 1-7 2 4-6 9-11 18-15Z"/><path d="M72 5C55 8 46 19 46 34c0 9 5 14 14 14s15-6 15-15-6-15-14-15c-2 0-5 1-7 2 4-6 9-11 18-15Z"/></g></svg></span>';
}
function normalizeWhiteCard(block){
  if(!block||block.type!=='whitecard') return block;
  if(block.title==null) block.title='';
  if(block.body==null) block.body='';
  if(block.bigText==null) block.bigText='';
  if(block.smallText==null) block.smallText=String(block.body||'');
  block.body=String(block.smallText||'');
  if(!['none','icon','image'].includes(block.mediaType)) block.mediaType='none';
  if(!['top','left'].includes(block.mediaPosition)) block.mediaPosition='top';
  if(!['left','center'].includes(block.mediaAlign)) block.mediaAlign='left';
  if(!['s','m','l'].includes(block.bigTextSize)) block.bigTextSize='m';
  if(!['check','info'].includes(block.icon)) block.icon='check';
  block.mediaSrc=block.mediaSrc||'';
  block.mediaAlt=block.mediaAlt||'Obrazek';
  block.iconColor=/^#[0-9a-f]{6}$/i.test(String(block.iconColor||''))?block.iconColor:'#3F506E';
  block.titleColor=/^#[0-9a-f]{6}$/i.test(String(block.titleColor||''))?block.titleColor:'#1D1E3C';
  block.bigTextColor=/^#[0-9a-f]{6}$/i.test(String(block.bigTextColor||''))?block.bigTextColor:'#3F506E';
  block.smallTextColor=/^#[0-9a-f]{6}$/i.test(String(block.smallTextColor||''))?block.smallTextColor:'#3F506E';
  return block;
}
function newColumnsBlock(count=2){
  const columnCount=Math.max(1,Math.min(3,Number(count)||2));
  return {
    id:uid('b'),
    type:'columns',
    columnCount,
    columns:Array.from({length:columnCount},()=>({
      id:uid('col'),
      kind:'text',
      title:'Nagłówek',
      body:'Tutaj wpisz treść.',
      src:'',
      alt:'Obrazek'
    }))
  };
}
function normalizeColumnsBlock(block){
  block.columnCount=Math.max(1,Math.min(3,Number(block.columnCount)||2));
  if(!Array.isArray(block.columns)) block.columns=[];
  while(block.columns.length<block.columnCount){
    block.columns.push({id:uid('col'),kind:'text',title:'Nagłówek',body:'Tutaj wpisz treść.',src:'',alt:'Obrazek'});
  }
  if(block.columns.length>block.columnCount) block.columns=block.columns.slice(0,block.columnCount);
  block.columns.forEach(function(col){
    if(!col.id) col.id=uid('col');
    if(col.kind!=='image') col.kind='text';
    if(col.title==null) col.title='';
    if(col.body==null) col.body='';
    if(col.src==null) col.src='';
    if(col.alt==null) col.alt='Obrazek';
  });
  return block;
}
function defaultPageFooter(){
  return {
    enabled:false,
    text:'',
    showPageNumber:true,
    showOnCover:false,
    numberMode:'compact'
  };
}
function normalizePageFooter(){
  if(!state.pageFooter||typeof state.pageFooter!=='object') state.pageFooter=defaultPageFooter();
  const f=state.pageFooter;
  f.enabled=!!f.enabled;
  f.text=String(f.text||'');
  f.showPageNumber=f.showPageNumber!==false;
  f.showOnCover=!!f.showOnCover;
  if(!['compact','label','page'].includes(f.numberMode)) f.numberMode='compact';
  return f;
}
function pageFooterHtml(screen,index){
  const f=normalizePageFooter();
  if(!f.enabled) return '';
  if(screen.type==='cover'&&!f.showOnCover) return '';

  const eligible=state.screens.filter(function(item){
    return f.showOnCover||item.type!=='cover';
  });
  const pageIndex=eligible.findIndex(function(item){return item.id===screen.id;});
  const currentNumber=Math.max(1,pageIndex+1);
  const total=Math.max(1,eligible.length);
  let number='';
  if(f.showPageNumber){
    if(f.numberMode==='label') number='Strona '+currentNumber+' / '+total;
    else if(f.numberMode==='page') number='Strona '+currentNumber;
    else number=currentNumber+' / '+total;
  }
  const label=(f.text||state.name||'Materiał').trim();
  return '<div class="page-footer">'+
    '<div class="page-footer-rule"></div>'+
    '<div class="page-footer-row">'+
      '<span class="page-footer-label">'+esc(label)+'</span>'+
      (number?'<span class="page-footer-number">'+esc(number)+'</span>':'')+
    '</div>'+
  '</div>';
}
function coverScreen(){return{id:uid('p'),type:'cover',heading:'Tytuł materiału',blocks:[]}}
function closingScreen(){return{id:uid('p'),type:'closing',heading:'Dziękujemy!',text:'',blocks:[]}}
function contentScreen(){return{id:uid('p'),type:'content',title:'Tytuł ekranu',intro:'Krótki wstęp do treści.',blocks:[newBlock('paragraph')]}}
function initialState(){const c=coverScreen(),p=contentScreen();return{name:'Nowy materiał',w:390,h:844,format:'mobile',preset:'doctor',palette:{...doctorPalette},template:'',materialLogo:'',pageFooter:defaultPageFooter(),screens:[c,p],selected:c.id}}
let state=initialState();
let pendingImageData='',pendingImageName='',pendingImageTextData='',pendingImageTextName='';

function current(){return state.screens.find(s=>s.id===state.selected)||state.screens[0]}
function safeFileName(name){return String(name||'material').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').replace(/[. ]+$/,'')||'material'}
function keyName(name){return String(name||'Materiał').trim().toLocaleLowerCase('pl-PL')}
function fmtDate(ts){try{return new Intl.DateTimeFormat('pl-PL',{dateStyle:'short',timeStyle:'short'}).format(new Date(ts))}catch{return new Date(ts).toLocaleString()}}
function cloneState(){return JSON.parse(JSON.stringify(state))}

function applyTheme(){
  const p=state.palette;
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
  if(b.type==='metric'){
    normalizeMetric(b);
    const value=metricDisplayValue(b),unit=b.mode==='rating'?'/'+b.ratingScale:b.unit;
    const stars=b.mode==='rating'?'<div class="metric-stars" role="img" aria-label="'+esc('Ocena '+value+' na '+b.ratingScale)+'">'+metricStarsHtml(b)+'</div>':'';
    const copy=b.body||b.emphasis?'<div class="metric-caption">'+(b.body?'<div class="metric-description">'+bodyHtml(b.body,'paragraph')+'</div>':'')+(b.emphasis?'<div class="metric-emphasis">'+esc(b.emphasis)+'</div>':'')+'</div>':'';
    return '<div class="topic metric-topic" draggable="true" data-block-id="'+b.id+'"><section class="metric-card mode-'+b.mode+'" aria-label="'+(b.mode==='rating'?'Ocena':'Statystyka')+'">'+stars+'<div class="metric-value"><span class="metric-number">'+esc(value)+'</span>'+(unit?'<span class="metric-unit">'+esc(unit)+'</span>':'')+'</div>'+copy+'</section></div>';
  }
  if(b.type==='quote'){
    normalizeQuote(b);
    const photo=b.showPhoto&&b.photoSrc?'<img class="quote-avatar" src="'+esc(b.photoSrc)+'" alt="'+esc(b.photoAlt)+'">':'';
    const author=b.author?'<div class="quote-author-name">'+esc(b.author)+'</div>':'';
    const role=b.authorRole?'<div class="quote-author-role">'+esc(b.authorRole)+'</div>':'';
    const credit=photo||author||role?'<figcaption class="quote-credit">'+photo+'<div class="quote-author-copy">'+author+role+'</div></figcaption>':'';
    return '<div class="topic quote-topic" draggable="true" data-block-id="'+b.id+'"><figure class="quote-card">'+quoteMarkHtml()+'<blockquote class="quote-text">'+bodyHtml(b.body,'paragraph')+'</blockquote>'+credit+'</figure></div>';
  }
  if(b.type==='columns'){
    normalizeColumnsBlock(b);
    const cells=b.columns.map(function(col){
      if(col.kind==='image'){
        return '<div class="column-cell column-image">'+(col.src?'<img src="'+col.src+'" alt="'+esc(col.alt||'Obrazek')+'">':'<div class="column-image-placeholder">Dodaj obraz w edytorze</div>')+'</div>';
      }
      return '<div class="column-cell column-text"><h4 class="topic-title">'+esc(col.title||'')+'</h4><div class="topic-body">'+bodyHtml(col.body||'','paragraph')+'</div></div>';
    }).join('');
    return '<div class="topic columns-topic" draggable="true" data-block-id="'+b.id+'"><div class="columns-block" style="--column-count:'+b.columnCount+'">'+cells+'</div></div>';
  }
  if(b.type==='image'){const w=Math.max(20,Math.min(100,Number(b.width)||100));return '<div class="topic image-topic" draggable="true" data-block-id="'+b.id+'"><div class="image-block" style="width:'+w+'%"><img src="'+b.src+'" alt="'+esc(b.alt||'Obrazek')+'"></div></div>'}
  if(b.type==='imageText'){const w=Math.max(25,Math.min(70,Number(b.width)||45)),side=b.side==='right'?'right':'left';return '<div class="topic image-text-topic" draggable="true" data-block-id="'+b.id+'"><div class="image-text-block side-'+side+'" style="--image-col:'+w+'%"><div class="image-text-media"><img src="'+b.src+'" alt="'+esc(b.alt||'Obrazek')+'"></div><div class="image-text-copy"><h4 class="topic-title">'+esc(b.title||'Nagłówek')+'</h4><div class="topic-body">'+bodyHtml(b.body||'','paragraph')+'</div></div></div></div>'}
  if(b.type==='whitecard'){
    normalizeWhiteCard(b);
    const media=b.mediaType==='icon'
      ?'<div class="whitecard-media whitecard-icon" style="color:'+b.iconColor+'">'+(ICONS[b.icon]||ICONS.check)+'</div>'
      :(b.mediaType==='image'&&b.mediaSrc
        ?'<div class="whitecard-media whitecard-image"><img src="'+b.mediaSrc+'" alt="'+esc(b.mediaAlt||'Obrazek')+'"></div>'
        :'');
    const title=b.title?'<div class="whitecard-title" style="color:'+b.titleColor+'">'+esc(b.title)+'</div>':'';
    const big=b.bigText?'<div class="whitecard-big size-'+b.bigTextSize+'" style="color:'+b.bigTextColor+'">'+esc(b.bigText)+'</div>':'';
    const small=b.smallText?'<div class="whitecard-small" style="color:'+b.smallTextColor+'">'+bodyHtml(b.smallText,'paragraph')+'</div>':'';
    return '<div class="topic whitecard-topic" draggable="true" data-block-id="'+b.id+'"><div class="box whitecard whitecard-v2 media-'+b.mediaPosition+' align-'+b.mediaAlign+'">'+media+'<div class="whitecard-copy">'+title+big+small+'</div></div></div>';
  }
  const cls={important:'important',warning:'warning',remember:'remember',additional:'additional'}[b.type]||'';
  const box='<div class="'+(cls?'box '+cls:'')+'"><h4 class="topic-title">'+esc(b.title||'')+'</h4><div class="topic-body">'+bodyHtml(b.body||'',b.type)+'</div></div>';
  return '<div class="topic '+(b.showIcon?'has-icon':'')+'" draggable="true" data-block-id="'+b.id+'">'+(b.showIcon?'<div class="topic-icon">'+(ICONS[b.icon]||ICONS.check)+'</div>':'')+'<div>'+box+'</div></div>';
}
function renderPreview(){
  const sc=scaleForPreview();
  $('canvas').innerHTML=state.screens.map((p,i)=>{
    const stage='width:'+(state.w*sc)+'px;height:'+(state.h*sc)+'px';
    const pageStyle='width:'+state.w+'px;height:'+state.h+'px;transform:scale('+sc+');background:'+state.palette.bg+';--ink:'+state.palette.ink+';--body:'+state.palette.body+';--important:'+state.palette.important+';--warning:'+state.palette.warning+';--remember:'+state.palette.remember+';--additional:'+state.palette.additional+';';
    const baseBg=p.pdfBackground||state.template||'';
    const bg=baseBg?'<div class="page-bg" style="background-image:url(\''+baseBg+'\')"></div>':'';
    if(p.type==='closing'){
      const footer=pageFooterHtml(p,i),footerClass=footer?' has-page-footer':'';
      return '<div class="page-wrap" draggable="true" data-page-id="'+p.id+'"><div class="page-dragbar"><span>Strona '+(i+1)+' · '+state.w+' × '+state.h+'</span><span>⠿ przeciągnij stronę</span></div><div class="page-stage" style="'+stage+'"><section class="page closing'+footerClass+' '+(p.id===state.selected?'selected-page':'')+'" data-select-page="'+p.id+'" style="'+pageStyle+'"><div class="page-inner"><h2 class="closing-title">'+esc(p.heading||'')+'</h2>'+(p.text?'<div class="closing-text">'+bodyHtml(p.text,'paragraph')+'</div>':'')+'</div>'+footer+'</section></div></div>';
    }
    if(p.type==='cover'){
      const footer=pageFooterHtml(p,i);
      const footerClass=footer?' has-page-footer':'';
      return '<div class="page-wrap" draggable="true" data-page-id="'+p.id+'"><div class="page-dragbar"><span>Strona '+(i+1)+' · '+state.w+' × '+state.h+'</span><span>⠿ przeciągnij stronę</span></div><div class="page-stage" style="'+stage+'"><section class="page cover'+footerClass+' '+(p.id===state.selected?'selected-page':'')+'" data-select-page="'+p.id+'" style="'+pageStyle+'">'+bg+'<div class="page-inner"><div class="material-logo">'+(state.materialLogo?'<img src="'+state.materialLogo+'" alt="logo">':'<span class="muted">Dodaj logo</span>')+'</div><div class="cover-title">'+esc(p.heading||'')+'</div></div>'+footer+'</section></div></div>';
    }
    const blocks=(p.blocks||[]).map(blockHtml).join('');
    const footer=pageFooterHtml(p,i);
    const footerClass=footer?' has-page-footer':'';
    return '<div class="page-wrap" draggable="true" data-page-id="'+p.id+'"><div class="page-dragbar"><span>Strona '+(i+1)+' · '+state.w+' × '+state.h+'</span><span>⠿ przeciągnij stronę</span></div><div class="page-stage" style="'+stage+'"><section class="page'+footerClass+' '+(p.id===state.selected?'selected-page':'')+'" data-select-page="'+p.id+'" data-drop-page="'+p.id+'" style="'+pageStyle+'">'+bg+'<div class="page-inner">'+(p.pdfBackground?'':'<h3 class="page-title">'+esc(p.title||'')+'</h3><p class="page-intro">'+esc(p.intro||'')+'</p>')+'<div class="'+(p.pdfBackground?'overlay-list':'topic-list')+'">'+blocks+'</div></div>'+footer+'</section></div></div>';
  }).join('');
  bindPreviewDnD();
}
function renderScreenList(){
  $('screenList').innerHTML=state.screens.map((p,i)=>'<div class="screen-row '+(p.id===state.selected?'active':'')+'" draggable="true" data-screen-row="'+p.id+'"><span class="screen-drag">⠿</span><button class="screen-select" data-screen="'+p.id+'">'+(i+1)+'. '+esc(p.type==='closing'?(p.heading||'Zakończenie'):p.type==='cover'?(p.heading||'Okładka'):(p.title||'Treść'))+'</button><button class="danger mini" data-remove-screen="'+p.id+'">×</button></div>').join('');
  document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.screen;renderScreenList();renderEditor();renderPreview()});
  document.querySelectorAll('[data-remove-screen]').forEach(b=>b.onclick=()=>removeScreen(b.dataset.removeScreen));
  document.querySelectorAll('[data-screen-row]').forEach(row=>{row.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','page:'+row.dataset.screenRow);row.classList.add('dragging')});row.addEventListener('dragend',()=>row.classList.remove('dragging'));row.addEventListener('dragover',e=>e.preventDefault());row.addEventListener('drop',e=>{e.preventDefault();const d=e.dataTransfer.getData('text/plain');if(d.startsWith('page:'))movePage(d.slice(5),row.dataset.screenRow)})});
}
function renderEditor(){
  const p=current(); if(!p){$('editor').innerHTML='';return}
  if(p.type==='closing'){
    $('editor').innerHTML='<label for="closingHeading">Podziękowanie</label><textarea id="closingHeading">'+esc(p.heading||'')+'</textarea><label for="closingText">Dodatkowy tekst <span class="muted">opcjonalny</span></label><textarea id="closingText">'+esc(p.text||'')+'</textarea>';
    $('closingHeading').oninput=e=>{p.heading=e.target.value;renderPreview();renderScreenList()};
    $('closingText').oninput=e=>{p.text=e.target.value;renderPreview()};
    return;
  }
  if(p.type==='cover'){
    $('editor').innerHTML='<label>Tytuł okładki</label><textarea id="coverHeading">'+esc(p.heading||'')+'</textarea>';
    $('coverHeading').oninput=e=>{p.heading=e.target.value;renderPreview();renderScreenList()};return;
  }
  const bgHint=p.pdfBackground?'<div class="brand-note">Oryginalna strona PDF jest tłem. Edytujesz tylko nakładki.</div>':'';
  $('editor').innerHTML=bgHint+(p.pdfBackground?'':'<label>Tytuł ekranu</label><input id="pageTitle" value="'+esc(p.title||'')+'"><label>Wstęp</label><textarea id="pageIntro">'+esc(p.intro||'')+'</textarea>')+'<div class="block-head" style="margin-top:12px"><h4>Bloki</h4><div class="block-editor-tools"><button id="addText" class="mini secondary">+ Tekst</button><button id="addList" class="mini secondary">+ Lista</button><button id="addBox" class="mini secondary">+ Box</button><button id="addWhiteCard" class="mini secondary">+ Box ze zdjęciem</button><button id="addColumns" class="mini secondary">+ Kolumny</button><button id="addQuote" class="mini secondary">+ Cytat</button><button id="addMetric" class="mini secondary">+ Statystyka / ocena</button></div></div><div id="blocks"></div>';
  if(!p.pdfBackground){$('pageTitle').oninput=e=>{p.title=e.target.value;renderPreview();renderScreenList()};$('pageIntro').oninput=e=>{p.intro=e.target.value;renderPreview()}}
  $('addText').onclick=()=>{p.blocks.push(newBlock('paragraph'));renderEditor();renderPreview()};
  $('addList').onclick=()=>{p.blocks.push(newBlock('bullets'));renderEditor();renderPreview()};
  $('addBox').onclick=()=>{p.blocks.push(newBlock('important'));renderEditor();renderPreview()};
  $('addWhiteCard').onclick=()=>{p.blocks.push(newBlock('whitecard'));renderEditor();renderPreview()};
  $('addMetric').onclick=()=>addBlockAt('metric',p.id);
  $('addQuote').onclick=()=>addBlockAt('quote',p.id);
  $('addColumns').onclick=()=>{p.blocks.push(newColumnsBlock(2));renderEditor();renderPreview()};
  $('blocks').innerHTML=(p.blocks||[]).map((b,i)=>blockEditorHtml(b,i)).join('');
  bindBlockEditors(p);
}
function blockEditorHtml(b,i){
  if(b.type==='metric'){
    normalizeMetric(b);
    return '<div class="block-card metric-editor"><div class="block-head"><h4>Blok '+(i+1)+' · Statystyka / ocena</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div>'+
      '<label>Typ</label><select data-b="'+b.id+'" data-k="type"><option value="metric" selected>Statystyka / ocena</option><option value="paragraph">Akapit</option></select>'+
      '<label>Tryb</label><select data-metric-mode="'+b.id+'"><option value="rating" '+(b.mode==='rating'?'selected':'')+'>Ocena · gwiazdki</option><option value="stat" '+(b.mode==='stat'?'selected':'')+'>Statystyka · wartość i jednostka</option></select>'+
      '<label>Wartość</label><input data-metric-field="value" data-metric-id="'+b.id+'" inputmode="decimal" value="'+esc(b.value)+'">'+
      (b.mode==='rating'?'<label>Skala oceny</label><select data-metric-scale="'+b.id+'"><option value="5" '+(b.ratingScale===5?'selected':'')+'>5 gwiazdek</option><option value="10" '+(b.ratingScale===10?'selected':'')+'>10 gwiazdek</option></select><p class="muted">Ocena od 0 do '+b.ratingScale+'. Możesz użyć przecinka lub kropki.</p>':'<label>Jednostka <span class="muted">opcjonalna</span></label><input data-metric-field="unit" data-metric-id="'+b.id+'" value="'+esc(b.unit)+'" placeholder="np. %, tys., osób">')+
      '<label>Opis <span class="muted">opcjonalny</span></label><textarea data-metric-field="body" data-metric-id="'+b.id+'">'+esc(b.body)+'</textarea>'+
      '<label>Pogrubione podsumowanie <span class="muted">opcjonalne</span></label><input data-metric-field="emphasis" data-metric-id="'+b.id+'" value="'+esc(b.emphasis)+'">'+
      (b.mode==='rating'&&metricRatingValue(b)===null?'<p class="status err">Wpisz ocenę od 0 do '+b.ratingScale+'.</p>':'')+
      '</div>';
  }
  if(b.type==='quote'){
    normalizeQuote(b);
    return '<div class="block-card quote-editor"><div class="block-head"><h4>Blok '+(i+1)+' · Cytat</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div>'+
      '<label>Typ</label><select data-b="'+b.id+'" data-k="type"><option value="quote" selected>Cytat</option><option value="paragraph">Akapit</option></select>'+
      '<label>Treść cytatu</label><textarea data-quote-field="body" data-quote-id="'+b.id+'">'+esc(b.body)+'</textarea>'+
      '<label>Autor <span class="muted">opcjonalny</span></label><input data-quote-field="author" data-quote-id="'+b.id+'" value="'+esc(b.author)+'">'+
      '<label>Stanowisko / organizacja <span class="muted">opcjonalne</span></label><input data-quote-field="authorRole" data-quote-id="'+b.id+'" value="'+esc(b.authorRole)+'">'+
      '<label class="checkbox"><input type="checkbox" data-quote-show-photo="'+b.id+'" '+(b.showPhoto?'checked':'')+'> Pokaż zdjęcie autora</label>'+
      (b.showPhoto?'<label>Zdjęcie autora</label><input type="file" accept="image/*" data-quote-photo="'+b.id+'">'+(b.photoSrc?'<img class="quote-editor-avatar" src="'+esc(b.photoSrc)+'" alt="'+esc(b.photoAlt)+'"><button type="button" class="mini ghost" data-quote-remove-photo="'+b.id+'">Usuń zdjęcie</button>':'<p class="muted">Bez zdjęcia podpis pozostanie wyrównany do lewej.</p>'):'')+
      '</div>';
  }
  if(b.type==='columns'){
    normalizeColumnsBlock(b);
    const columns=b.columns.map(function(col,index){
      const key=b.id+':'+index;
      const body=col.kind==='image'
        ?(col.src?'<img class="image-editor-preview column-editor-preview" src="'+col.src+'">':'<div class="column-editor-empty">Brak obrazka</div>')+
          '<label>Obraz</label><input type="file" accept="image/*" data-colimage="'+key+'">'
        :'<label>Nagłówek</label><input data-coltitle="'+key+'" value="'+esc(col.title||'')+'"><label>Tekst</label><textarea data-colbody="'+key+'">'+esc(col.body||'')+'</textarea>';
      return '<div class="column-editor-card"><div class="column-editor-head"><strong>Kolumna '+(index+1)+'</strong></div><label>Zawartość</label><select data-colkind="'+key+'"><option value="text" '+(col.kind!=='image'?'selected':'')+'>Tekst</option><option value="image" '+(col.kind==='image'?'selected':'')+'>Obraz</option></select>'+body+'</div>';
    }).join('');
    return '<div class="block-card columns-editor"><div class="block-head"><h4>Blok '+(i+1)+' · Kolumny</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div><label>Liczba kolumn</label><select data-column-count="'+b.id+'"><option value="1" '+(b.columnCount===1?'selected':'')+'>1 kolumna</option><option value="2" '+(b.columnCount===2?'selected':'')+'>2 kolumny</option><option value="3" '+(b.columnCount===3?'selected':'')+'>3 kolumny</option></select><div class="column-editor-grid">'+columns+'</div></div>';
  }
  if(b.type==='whitecard'){
    normalizeWhiteCard(b);
    const mediaEditor=b.mediaType==='icon'
      ?'<label>Ikona</label><select data-white-icon="'+b.id+'"><option value="check" '+(b.icon==='check'?'selected':'')+'>Check</option><option value="info" '+(b.icon==='info'?'selected':'')+'>Info</option></select><label>Kolor ikony</label><input type="color" data-white-icon-color="'+b.id+'" value="'+b.iconColor+'">'
      :(b.mediaType==='image'
        ?(b.mediaSrc?'<img class="image-editor-preview whitecard-editor-image" src="'+b.mediaSrc+'">':'<div class="column-editor-empty">Brak obrazka</div>')+'<label>Obrazek</label><input type="file" accept="image/*" data-white-image="'+b.id+'">'
        :'');
    return '<div class="block-card whitecard-editor">'+
      '<div class="block-head"><h4>Blok '+(i+1)+' · Box ze zdjęciem</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div>'+
      '<label>Tytuł <span class="muted">opcjonalny</span></label><input data-white-title="'+b.id+'" value="'+esc(b.title||'')+'">'+
      '<label>Tekst duży</label><input data-white-big="'+b.id+'" value="'+esc(b.bigText||'')+'">'+
      '<label>Rozmiar dużego tekstu</label><select data-white-size="'+b.id+'"><option value="s" '+(b.bigTextSize==='s'?'selected':'')+'>Mały</option><option value="m" '+(b.bigTextSize==='m'?'selected':'')+'>Standard</option><option value="l" '+(b.bigTextSize==='l'?'selected':'')+'>Duży</option></select>'+
      '<label>Tekst mały</label><textarea data-white-small="'+b.id+'">'+esc(b.smallText||'')+'</textarea>'+
      '<div class="whitecard-editor-colors"><div><label>Kolor tytułu</label><input type="color" data-white-title-color="'+b.id+'" value="'+b.titleColor+'"></div><div><label>Kolor dużego tekstu</label><input type="color" data-white-big-color="'+b.id+'" value="'+b.bigTextColor+'"></div><div><label>Kolor małego tekstu</label><input type="color" data-white-small-color="'+b.id+'" value="'+b.smallTextColor+'"></div></div>'+
      '<label>Media</label><select data-white-media="'+b.id+'"><option value="none" '+(b.mediaType==='none'?'selected':'')+'>Brak</option><option value="icon" '+(b.mediaType==='icon'?'selected':'')+'>Ikona</option><option value="image" '+(b.mediaType==='image'?'selected':'')+'>Obrazek</option></select>'+
      (b.mediaType!=='none'?'<label>Pozycja media</label><select data-white-position="'+b.id+'"><option value="top" '+(b.mediaPosition==='top'?'selected':'')+'>Nad tekstem</option><option value="left" '+(b.mediaPosition==='left'?'selected':'')+'>Po lewej</option></select>':'')+
      mediaEditor+
      '<label>Wyrównanie treści</label><select data-white-align="'+b.id+'"><option value="left" '+(b.mediaAlign==='left'?'selected':'')+'>Do lewej</option><option value="center" '+(b.mediaAlign==='center'?'selected':'')+'>Wyśrodkowane</option></select>'+
      '</div>';
  }
  if(b.type==='image'){
    const w=Math.max(20,Math.min(100,Number(b.width)||100));
    return '<div class="block-card"><div class="block-head"><h4>Blok '+(i+1)+' · Obrazek</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div><img class="image-editor-preview" src="'+b.src+'"><label>Szerokość</label><div class="range-row"><input type="range" min="20" max="100" step="5" value="'+w+'" data-imgwidth="'+b.id+'"><span class="range-value" data-imgwidth-label="'+b.id+'">'+w+'%</span></div></div>';
  }
  if(b.type==='imageText'){
    const w=Math.max(25,Math.min(70,Number(b.width)||45));
    return '<div class="block-card"><div class="block-head"><h4>Blok '+(i+1)+' · Obrazek + tekst</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div><img class="image-editor-preview" src="'+b.src+'"><label>Układ</label><select data-imgside="'+b.id+'"><option value="left" '+(b.side!=='right'?'selected':'')+'>Obrazek po lewej</option><option value="right" '+(b.side==='right'?'selected':'')+'>Obrazek po prawej</option></select><label>Nagłówek</label><input data-imgtitle="'+b.id+'" value="'+esc(b.title||'')+'"><label>Tekst</label><textarea data-imgbody="'+b.id+'">'+esc(b.body||'')+'</textarea><label>Szerokość obrazka</label><div class="range-row"><input type="range" min="25" max="70" step="5" value="'+w+'" data-imgtextwidth="'+b.id+'"><span class="range-value" data-imgtextwidth-label="'+b.id+'">'+w+'%</span></div></div>';
  }
  return '<div class="block-card"><div class="block-head"><h4>Blok '+(i+1)+'</h4><button class="danger mini" data-r="'+b.id+'">Usuń</button></div><label>Typ</label><select data-b="'+b.id+'" data-k="type"><option value="paragraph" '+(b.type==='paragraph'?'selected':'')+'>Akapit</option><option value="bullets" '+(b.type==='bullets'?'selected':'')+'>Lista kropkowana</option><option value="numbered" '+(b.type==='numbered'?'selected':'')+'>Lista numerowana</option><option value="important" '+(b.type==='important'?'selected':'')+'>Ważne</option><option value="warning" '+(b.type==='warning'?'selected':'')+'>Uważaj</option><option value="remember" '+(b.type==='remember'?'selected':'')+'>Pamiętaj</option><option value="additional" '+(b.type==='additional'?'selected':'')+'>Dodatkowy</option><option value="metric" '+(b.type==='metric'?'selected':'')+'>Statystyka / ocena</option><option value="quote" '+(b.type==='quote'?'selected':'')+'>Cytat</option><option value="whitecard" '+(b.type==='whitecard'?'selected':'')+'>Box ze zdjęciem</option></select><label>Nagłówek</label><input data-b="'+b.id+'" data-k="title" value="'+esc(b.title||'')+'"><label>Treść</label><textarea data-b="'+b.id+'" data-k="body">'+esc(b.body||'')+'</textarea><label class="checkbox"><input data-b="'+b.id+'" data-k="showIcon" type="checkbox" '+(b.showIcon?'checked':'')+'> Ikona po lewej</label>'+(b.showIcon?'<label>Ikona</label><select data-b="'+b.id+'" data-k="icon"><option value="check" '+(b.icon==='check'?'selected':'')+'>Check</option><option value="info" '+(b.icon==='info'?'selected':'')+'>Info</option></select>':'')+'</div>';
}
function bindBlockEditors(p){
  document.querySelectorAll('[data-metric-field]').forEach(x=>x.oninput=()=>{
    const b=p.blocks.find(z=>z.id===x.dataset.metricId);
    if(!b||b.type!=='metric') return;
    b[x.dataset.metricField]=x.value;
    x.setCustomValidity(b.mode==='rating'&&x.dataset.metricField==='value'&&metricRatingValue(b)===null?'Wpisz ocenę od 0 do '+b.ratingScale+'.':'');
    renderPreview();
  });
  document.querySelectorAll('[data-metric-mode]').forEach(x=>x.onchange=()=>{
    const b=p.blocks.find(z=>z.id===x.dataset.metricMode);
    if(!b) return;
    b.mode=x.value;
    renderEditor();renderPreview();
  });
  document.querySelectorAll('[data-metric-scale]').forEach(x=>x.onchange=()=>{
    const b=p.blocks.find(z=>z.id===x.dataset.metricScale);
    if(!b) return;
    b.ratingScale=Number(x.value);
    renderEditor();renderPreview();
  });
  document.querySelectorAll('[data-quote-field]').forEach(x=>x.oninput=()=>{
    const b=p.blocks.find(z=>z.id===x.dataset.quoteId);
    if(!b||b.type!=='quote') return;
    b[x.dataset.quoteField]=x.value;
    renderPreview();
  });
  document.querySelectorAll('[data-quote-show-photo]').forEach(x=>x.onchange=()=>{
    const b=p.blocks.find(z=>z.id===x.dataset.quoteShowPhoto);
    if(!b) return;
    b.showPhoto=x.checked;
    renderEditor();renderPreview();
  });
  document.querySelectorAll('[data-quote-photo]').forEach(x=>x.onchange=async()=>{
    const file=x.files&&x.files[0],b=p.blocks.find(z=>z.id===x.dataset.quotePhoto);
    if(!file||!b) return;
    if(!file.type.startsWith('image/')){alert('Wybierz plik ze zdjęciem.');return;}
    try{
      const src=await readImageFile(file);
      // Ignore stale uploads after Undo, deletion, or a document switch.
      if(!state.screens.includes(p)||!p.blocks.includes(b)||b.type!=='quote') return;
      if(window.pdfMobileUndo) window.pdfMobileUndo.checkpoint();
      b.photoSrc=src;b.photoAlt=b.author?'Zdjęcie: '+b.author:'Zdjęcie autora';
      renderEditor();renderPreview();
    }catch(error){console.error(error);alert('Nie udało się wczytać zdjęcia.');}
  });
  document.querySelectorAll('[data-quote-remove-photo]').forEach(x=>x.onclick=()=>{
    const b=p.blocks.find(z=>z.id===x.dataset.quoteRemovePhoto);
    if(!b) return;
    if(window.pdfMobileUndo) window.pdfMobileUndo.checkpoint();
    b.photoSrc='';b.photoAlt='Zdjęcie autora';
    renderEditor();renderPreview();
  });
  document.querySelectorAll('[data-column-count]').forEach(function(x){
    x.onchange=function(){
      const b=p.blocks.find(function(z){return z.id===x.dataset.columnCount;});
      if(!b) return;
      b.columnCount=Math.max(1,Math.min(3,Number(x.value)||2));
      normalizeColumnsBlock(b);
      renderEditor();
      renderPreview();
    };
  });
  document.querySelectorAll('[data-colkind]').forEach(function(x){
    x.onchange=function(){
      const parts=x.dataset.colkind.split(':');
      const b=p.blocks.find(function(z){return z.id===parts[0];});
      if(!b) return;
      normalizeColumnsBlock(b);
      const col=b.columns[Number(parts[1])];
      if(!col) return;
      col.kind=x.value==='image'?'image':'text';
      renderEditor();
      renderPreview();
    };
  });
  document.querySelectorAll('[data-coltitle]').forEach(function(x){
    x.oninput=function(){
      const parts=x.dataset.coltitle.split(':');
      const b=p.blocks.find(function(z){return z.id===parts[0];});
      if(!b) return;
      normalizeColumnsBlock(b);
      const col=b.columns[Number(parts[1])];
      if(col){col.title=x.value;renderPreview();}
    };
  });
  document.querySelectorAll('[data-colbody]').forEach(function(x){
    x.oninput=function(){
      const parts=x.dataset.colbody.split(':');
      const b=p.blocks.find(function(z){return z.id===parts[0];});
      if(!b) return;
      normalizeColumnsBlock(b);
      const col=b.columns[Number(parts[1])];
      if(col){col.body=x.value;renderPreview();}
    };
  });
  document.querySelectorAll('[data-colimage]').forEach(function(x){
    x.onchange=async function(){
      const file=x.files&&x.files[0];
      if(!file) return;
      const parts=x.dataset.colimage.split(':');
      const b=p.blocks.find(function(z){return z.id===parts[0];});
      if(!b) return;
      normalizeColumnsBlock(b);
      const col=b.columns[Number(parts[1])];
      if(!col) return;
      col.src=await readImageFile(file);
      col.alt=file.name||'Obrazek';
      renderEditor();
      renderPreview();
    };
  });
  document.querySelectorAll('[data-white-title]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteTitle);if(b){normalizeWhiteCard(b);b.title=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-big]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteBig);if(b){normalizeWhiteCard(b);b.bigText=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-small]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteSmall);if(b){normalizeWhiteCard(b);b.smallText=x.value;b.body=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-size]').forEach(x=>x.onchange=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteSize);if(b){normalizeWhiteCard(b);b.bigTextSize=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-media]').forEach(x=>x.onchange=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteMedia);if(b){normalizeWhiteCard(b);b.mediaType=x.value;renderEditor();renderPreview()}});
  document.querySelectorAll('[data-white-position]').forEach(x=>x.onchange=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whitePosition);if(b){normalizeWhiteCard(b);b.mediaPosition=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-align]').forEach(x=>x.onchange=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteAlign);if(b){normalizeWhiteCard(b);b.mediaAlign=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-icon]').forEach(x=>x.onchange=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteIcon);if(b){normalizeWhiteCard(b);b.icon=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-icon-color]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteIconColor);if(b){normalizeWhiteCard(b);b.iconColor=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-title-color]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteTitleColor);if(b){normalizeWhiteCard(b);b.titleColor=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-big-color]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteBigColor);if(b){normalizeWhiteCard(b);b.bigTextColor=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-small-color]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.whiteSmallColor);if(b){normalizeWhiteCard(b);b.smallTextColor=x.value;renderPreview()}});
  document.querySelectorAll('[data-white-image]').forEach(x=>x.onchange=async()=>{const file=x.files&&x.files[0];if(!file)return;const b=p.blocks.find(z=>z.id===x.dataset.whiteImage);if(!b)return;normalizeWhiteCard(b);b.mediaSrc=await readImageFile(file);b.mediaAlt=file.name||'Obrazek';renderEditor();renderPreview()});
  document.querySelectorAll('[data-r]').forEach(x=>x.onclick=()=>{p.blocks=p.blocks.filter(b=>b.id!==x.dataset.r);renderEditor();renderPreview()});
  document.querySelectorAll('[data-imgwidth]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgwidth);if(!b)return;b.width=Number(x.value);const l=document.querySelector('[data-imgwidth-label="'+b.id+'"]');if(l)l.textContent=b.width+'%';renderPreview()});
  document.querySelectorAll('[data-imgtextwidth]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgtextwidth);if(!b)return;b.width=Number(x.value);const l=document.querySelector('[data-imgtextwidth-label="'+b.id+'"]');if(l)l.textContent=b.width+'%';renderPreview()});
  document.querySelectorAll('[data-imgside]').forEach(x=>x.onchange=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgside);if(b){b.side=x.value;renderPreview()}});
  document.querySelectorAll('[data-imgtitle]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgtitle);if(b){b.title=x.value;renderPreview()}});
  document.querySelectorAll('[data-imgbody]').forEach(x=>x.oninput=()=>{const b=p.blocks.find(z=>z.id===x.dataset.imgbody);if(b){b.body=x.value;renderPreview()}});
  document.querySelectorAll('[data-b]').forEach(x=>{const h=()=>{const b=p.blocks.find(z=>z.id===x.dataset.b);if(!b)return;const k=x.dataset.k;b[k]=x.type==='checkbox'?x.checked:x.value;if(k==='type'||k==='showIcon')renderEditor();renderPreview()};if(x.tagName==='TEXTAREA'||(x.tagName==='INPUT'&&x.type!=='checkbox'))x.oninput=h;else x.onchange=h});
}
function syncPageFooterControls(){
  const f=normalizePageFooter();
  const panel=$('pageFooterEditor');
  const toggle=$('pageFooterToggle');
  if(panel) panel.classList.toggle('hidden',!f.enabled);
  if(toggle){
    toggle.classList.toggle('ready',f.enabled);
    toggle.innerHTML=f.enabled?'Stopka strony<small>włączona · linia + opis + numer</small>':'Stopka strony<small>linia + opis + numer strony</small>';
  }
  const text=$('pageFooterText');
  const showNumber=$('pageFooterShowNumber');
  const mode=$('pageFooterNumberMode');
  const cover=$('pageFooterShowCover');
  if(text) text.value=f.text;
  if(showNumber) showNumber.checked=f.showPageNumber;
  if(mode) mode.value=f.numberMode;
  if(cover) cover.checked=f.showOnCover;
}
function render(){normalizePageFooter();applyTheme();$('projectName').value=state.name||'Nowy materiał';$('format').value=state.format||'mobile';$('customW').value=state.w;$('customH').value=state.h;$('customSize').classList.toggle('hidden',state.format!=='custom');renderScreenList();renderEditor();renderPreview();updateFormatMeta();syncPageFooterControls()}
function removeScreen(id){if(state.screens.length<=1){alert('Projekt musi mieć przynajmniej jeden ekran.');return}state.screens=state.screens.filter(s=>s.id!==id);if(!state.screens.some(s=>s.id===state.selected))state.selected=state.screens[0].id;render()}
function movePage(sourceId,targetId){if(sourceId===targetId)return;let from=state.screens.findIndex(s=>s.id===sourceId),to=state.screens.findIndex(s=>s.id===targetId);if(from<0||to<0)return;const [item]=state.screens.splice(from,1);if(from<to)to--;state.screens.splice(to,0,item);render()}
function findScreenAndBlock(blockId){for(const s of state.screens){const i=(s.blocks||[]).findIndex(b=>b.id===blockId);if(i>=0)return{screen:s,index:i,block:s.blocks[i]}}return null}
function moveBlock(blockId,targetScreenId,targetBlockId){const src=findScreenAndBlock(blockId),target=state.screens.find(s=>s.id===targetScreenId);if(!src||!target||target.type!=='content')return;src.screen.blocks.splice(src.index,1);let idx=targetBlockId?target.blocks.findIndex(b=>b.id===targetBlockId):target.blocks.length;if(idx<0)idx=target.blocks.length;target.blocks.splice(idx,0,src.block);state.selected=target.id;render()}
function addBlockAt(type,targetScreenId,targetBlockId){
  const target=state.screens.find(s=>s.id===targetScreenId);if(!target||target.type!=='content')return;
  let b;
  if(type==='image'){if(!pendingImageData)return;b={id:uid('b'),type:'image',src:pendingImageData,alt:pendingImageName||'Obrazek',width:100}}
  else if(type==='imageText'){if(!pendingImageTextData)return;b={id:uid('b'),type:'imageText',src:pendingImageTextData,alt:pendingImageTextName||'Obrazek',title:'Nagłówek',body:'Tutaj wpisz treść.',side:'left',width:45}}
  else if(type==='columns'){b=newColumnsBlock(2)}
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

$('projectName').oninput=e=>{state.name=e.target.value;const f=normalizePageFooter();if(f.enabled&&!f.text)renderPreview()};
$('saveProject').onclick=()=>saveProject();$('loadProject').onclick=()=>loadProject($('savedProjects').value);$('deleteProject').onclick=()=>deleteProject($('savedProjects').value);
$('newProject').onclick=()=>{if(!confirm('Utworzyć nowy projekt?\n\nNiezapisane zmiany zostaną utracone.'))return;state=initialState();render();$('saveStatus').className='status';$('saveStatus').textContent='Nowy projekt.'};
$('format').onchange=e=>setFormat(e.target.value);$('customW').oninput=()=>{if(state.format==='custom')setFormat('custom')};$('customH').oninput=()=>{if(state.format==='custom')setFormat('custom')};
$('doctorPreset').onclick=()=>{state.preset='doctor';state.palette={...doctorPalette};applyTheme();renderPreview()};$('customPreset').onclick=()=>{state.preset='custom';applyTheme();renderPreview()};
[['cInk','ink'],['cBody','body'],['cBg','bg'],['cImportant','important'],['cWarning','warning'],['cRemember','remember'],['cAdditional','additional']].forEach(([id,k])=>{$(id).oninput=e=>{if(state.preset==='doctor')return;state.palette[k]=e.target.value;applyTheme();renderPreview()}});
$('metricPaletteButton').onclick=()=>{const target=current()?.type==='content'?current():state.screens.find(s=>s.type==='content');if(target)addBlockAt('metric',target.id);else alert('Dodaj ekran treści, aby umieścić statystykę lub ocenę.');};
$('quotePaletteButton').onclick=()=>{const target=current()?.type==='content'?current():state.screens.find(s=>s.type==='content');if(target)addBlockAt('quote',target.id);else alert('Dodaj ekran treści, aby umieścić cytat.');};
function addEditorScreen(p){
  const closingIndex=state.screens.findIndex(s=>s.type==='closing');
  if(p.type!=='closing'&&closingIndex>=0) state.screens.splice(closingIndex,0,p);
  else state.screens.push(p);
  state.selected=p.id;render();
}
$('addCover').onclick=()=>addEditorScreen(coverScreen());
$('addContent').onclick=()=>addEditorScreen(contentScreen());
$('addClosing').onclick=()=>addEditorScreen(closingScreen());
$('materialLogo').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;state.materialLogo=await readImageFile(f);renderPreview()};
$('templateUpload').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;state.template=await templateFromFile(f);renderPreview()};$('removeTemplate').onclick=()=>{state.template='';renderPreview()};
$('pageFooterToggle').onclick=()=>{
  const f=normalizePageFooter();
  if(window.pdfMobileUndo&&window.pdfMobileUndo.checkpoint) window.pdfMobileUndo.checkpoint();
  f.enabled=!f.enabled;
  syncPageFooterControls();
  renderPreview();
};
$('pageFooterText').oninput=e=>{const f=normalizePageFooter();f.text=e.target.value;renderPreview()};
$('pageFooterShowNumber').onchange=e=>{const f=normalizePageFooter();f.showPageNumber=e.target.checked;renderPreview();syncPageFooterControls()};
$('pageFooterNumberMode').onchange=e=>{const f=normalizePageFooter();f.numberMode=e.target.value;renderPreview()};
$('pageFooterShowCover').onchange=e=>{const f=normalizePageFooter();f.showOnCover=e.target.checked;renderPreview()};
$('imagePaletteButton').onclick=()=>$('imageElementUpload').click();$('imageTextPaletteButton').onclick=()=>$('imageTextElementUpload').click();
$('imageElementUpload').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;pendingImageData=await readImageFile(f);pendingImageName=f.name;const b=$('imagePaletteButton');b.draggable=true;b.classList.add('ready');b.innerHTML='Obrazek<small>gotowy — przeciągnij</small><img class="palette-thumb" src="'+pendingImageData+'">'};
$('imageTextElementUpload').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;pendingImageTextData=await readImageFile(f);pendingImageTextName=f.name;const b=$('imageTextPaletteButton');b.draggable=true;b.classList.add('ready');b.innerHTML='Obrazek + tekst<small>gotowy — przeciągnij</small><img class="palette-thumb" src="'+pendingImageTextData+'">'};
$('openDocument').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(/\.pdf$/i.test(f.name)||f.type==='application/pdf')await importPdf(f);else await importDocx(f)}catch(err){console.error(err);$('importStatus').className='status err';$('importStatus').textContent='Nie udało się otworzyć pliku: '+(err.message||'błąd')}};
$('chooseFolder').onclick=()=>chooseFolder();$('disconnectFolder').onclick=async()=>{await localforage.removeItem(FOLDER_HANDLE_KEY);await updateFolderStatus()};
$('exportPdf').onclick=()=>exportProjectPdf(false);$('saveAndExport').onclick=()=>exportProjectPdf(true);
window.addEventListener('resize',()=>renderPreview());

(async function init(){render();await refreshSaved();await renderPdfLibrary();await updateFolderStatus()})();
