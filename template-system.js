(function(){
  const INDEX_KEY='pdf-mobile-generator:templates:index:v1';
  const DATA_PREFIX='pdf-mobile-generator:templates:data:v1:';
  const SHARED_INDEX_URL='templates/index.json?v=20261008-1';

  const nameInput=document.getElementById('templateName');
  const saveFormat=document.getElementById('templateSaveFormat');
  const saveButton=document.getElementById('saveAsTemplate');
  const status=document.getElementById('templateStatus');
  const localFilter=document.getElementById('templateFilter');
  const localList=document.getElementById('templateLibraryList');
  const sharedFilter=document.getElementById('sharedTemplateFilter');
  const sharedList=document.getElementById('sharedTemplateLibraryList');
  const sharedStatus=document.getElementById('sharedTemplateStatus');
  const currentHint=document.getElementById('templateCurrentFormat');

  if(!nameInput||!saveFormat||!saveButton||!status||!localFilter||!localList||!sharedFilter||!sharedList) return;

  let sharedIndex=[];

  function escHtml(value){
    return String(value??'').replace(/[&<>"']/g,function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function deepClone(value){
    return JSON.parse(JSON.stringify(value));
  }
  function normalizedName(value){
    return String(value||'').trim().toLocaleLowerCase('pl-PL');
  }
  function formatLabel(format,w,h){
    if(format==='mobile') return 'Mobile · 390 × 844';
    if(format==='a4p') return 'A4 pion · 794 × 1123';
    if(format==='a4l') return 'A4 poziom · 1123 × 794';
    return 'Własny · '+Number(w||0)+' × '+Number(h||0);
  }
  function resolveSaveFormat(){
    const choice=saveFormat.value;
    if(choice==='current'){
      return {format:state.format||'mobile',w:Number(state.w)||390,h:Number(state.h)||844};
    }
    if(choice==='mobile') return {format:'mobile',w:390,h:844};
    if(choice==='a4p') return {format:'a4p',w:794,h:1123};
    if(choice==='a4l') return {format:'a4l',w:1123,h:794};

    const customW=document.getElementById('customW');
    const customH=document.getElementById('customH');
    return {
      format:'custom',
      w:Math.max(200,Number(customW&&customW.value)||Number(state.w)||390),
      h:Math.max(200,Number(customH&&customH.value)||Number(state.h)||844)
    };
  }
  function templateKey(name,meta){
    return normalizedName(name)+'::'+meta.format+'::'+meta.w+'x'+meta.h;
  }
  async function getIndex(){
    return (await localforage.getItem(INDEX_KEY))||[];
  }
  async function setIndex(items){
    await localforage.setItem(INDEX_KEY,items);
  }
  function setStatus(message,type){
    status.className='status'+(type?' '+type:'');
    status.textContent=message||'';
  }
  function setSharedStatus(message,type){
    if(!sharedStatus) return;
    sharedStatus.className='status'+(type?' '+type:'');
    sharedStatus.textContent=message||'';
  }
  function refreshCurrentHint(){
    if(!currentHint) return;
    currentHint.textContent='Aktualnie: '+formatLabel(state.format,state.w,state.h);
  }
  function freshenIds(project){
    const groupMap={};
    (project.screens||[]).forEach(function(screen){
      const oldGroup=screen.importGroup;
      screen.id=uid('p');
      if(oldGroup){
        if(!groupMap[oldGroup]) groupMap[oldGroup]=uid('group');
        screen.importGroup=groupMap[oldGroup];
      }
      (screen.blocks||[]).forEach(function(block){
        block.id=uid('b');
      });
    });
    project.selected=project.screens&&project.screens[0]?project.screens[0].id:'';
    return project;
  }
  function activateProject(project,name){
    if(window.pdfMobileUndo&&window.pdfMobileUndo.checkpoint) window.pdfMobileUndo.checkpoint();
    const copy=freshenIds(deepClone(project));
    copy.name=(name||copy.name||'Szablon')+' · kopia';
    state=copy;
    render();
    const projectName=document.getElementById('projectName');
    if(projectName) projectName.value=state.name;
    refreshCurrentHint();
    const workspace=document.querySelector('.workspace');
    if(workspace) workspace.scrollTo({top:0,behavior:'smooth'});
  }
  function downloadJson(filename,payload){
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1200);
  }
  function slug(value){
    return String(value||'template')
      .toLocaleLowerCase('pl-PL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-')
      .replace(/^-+|-+$/g,'')||'template';
  }

  async function saveTemplate(){
    const meta=resolveSaveFormat();
    const name=(nameInput.value.trim()||state.name||'Nowy szablon').trim();
    const key=templateKey(name,meta);
    const now=Date.now();

    let items=await getIndex();
    let item=items.find(function(x){return x.key===key;});
    if(!item) item={id:uid('template'),key:key,createdAt:now};

    const project=deepClone(state);
    project.name=name;
    project.format=meta.format;
    project.w=meta.w;
    project.h=meta.h;

    item.name=name;
    item.format=meta.format;
    item.w=meta.w;
    item.h=meta.h;
    item.screenCount=(project.screens||[]).length;
    item.updatedAt=now;

    await localforage.setItem(DATA_PREFIX+item.id,project);
    items=[item].concat(items.filter(function(x){return x.id!==item.id;}));
    await setIndex(items);

    nameInput.value=name;
    setStatus('Szablon zapisany w „Moje szablony”: '+name+' · '+formatLabel(meta.format,meta.w,meta.h)+'.','ok');
    await renderLocalTemplates();
  }

  async function useLocalTemplate(id){
    const items=await getIndex();
    const item=items.find(function(x){return x.id===id;});
    const saved=await localforage.getItem(DATA_PREFIX+id);
    if(!saved||!item){
      setStatus('Nie mogę znaleźć tego szablonu.','err');
      return;
    }
    activateProject(saved,item.name);
    setStatus('Użyto mojego szablonu „'+item.name+'”. Oryginał pozostał bez zmian.','ok');
  }

  async function exportLocalTemplate(id){
    const items=await getIndex();
    const item=items.find(function(x){return x.id===id;});
    const saved=await localforage.getItem(DATA_PREFIX+id);
    if(!saved||!item){
      setStatus('Nie mogę znaleźć tego szablonu.','err');
      return;
    }
    const payload={
      doctorOneTemplateVersion:1,
      meta:{
        name:item.name,
        format:item.format,
        w:item.w,
        h:item.h,
        screenCount:item.screenCount||((saved.screens||[]).length),
        description:'Szablon przygotowany do publikacji w bibliotece Doctor.One'
      },
      project:saved
    };
    downloadJson(slug(item.name)+'-'+item.format+'.doctor-one-template.json',payload);
    setStatus('Wyeksportowano plik do publikacji w „Szablony Doctor.One”.','ok');
  }

  async function deleteTemplate(id){
    const items=await getIndex();
    const item=items.find(function(x){return x.id===id;});
    if(!item) return;
    if(!confirm('Usunąć szablon „'+item.name+'” ('+formatLabel(item.format,item.w,item.h)+')?')) return;
    await localforage.removeItem(DATA_PREFIX+id);
    await setIndex(items.filter(function(x){return x.id!==id;}));
    setStatus('Szablon usunięty.','');
    await renderLocalTemplates();
  }

  async function renderLocalTemplates(){
    const items=await getIndex();
    const selectedFilter=localFilter.value||'all';
    const visible=items.filter(function(item){
      return selectedFilter==='all'||item.format===selectedFilter;
    });

    if(!visible.length){
      localList.innerHTML='<div class="template-library-empty">Brak własnych szablonów dla wybranego formatu.</div>';
      return;
    }

    localList.innerHTML=visible.map(function(item){
      return '<div class="template-library-item">'+
        '<div class="template-library-copy">'+
          '<div class="template-library-name">'+escHtml(item.name)+'</div>'+
          '<div class="template-library-meta">'+formatLabel(item.format,item.w,item.h)+' · '+Number(item.screenCount||0)+' stron</div>'+
        '</div>'+
        '<div class="template-library-actions">'+
          '<button type="button" class="primary" data-use-template="'+item.id+'">Użyj</button>'+
          '<button type="button" class="secondary" data-export-template="'+item.id+'">Do Doctor.One</button>'+
          '<button type="button" class="danger" data-delete-template="'+item.id+'">Usuń</button>'+
        '</div>'+
      '</div>';
    }).join('');

    document.querySelectorAll('[data-use-template]').forEach(function(btn){
      btn.onclick=function(){useLocalTemplate(btn.dataset.useTemplate);};
    });
    document.querySelectorAll('[data-export-template]').forEach(function(btn){
      btn.onclick=function(){exportLocalTemplate(btn.dataset.exportTemplate);};
    });
    document.querySelectorAll('[data-delete-template]').forEach(function(btn){
      btn.onclick=function(){deleteTemplate(btn.dataset.deleteTemplate);};
    });
  }

  async function loadSharedIndex(){
    setSharedStatus('Ładuję wspólną bibliotekę…','');
    try{
      const response=await fetch(SHARED_INDEX_URL,{cache:'no-store'});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const payload=await response.json();
      sharedIndex=Array.isArray(payload)?payload:(payload.templates||[]);
      setSharedStatus(sharedIndex.length?'Wspólna biblioteka Doctor.One · dostępna dla każdego.':'Biblioteka Doctor.One jest jeszcze pusta.','ok');
    }catch(error){
      console.error(error);
      sharedIndex=[];
      setSharedStatus('Nie udało się załadować wspólnych szablonów.','err');
    }
    renderSharedTemplates();
  }

  function renderSharedTemplates(){
    const selectedFilter=sharedFilter.value||'all';
    const visible=sharedIndex.filter(function(item){
      return selectedFilter==='all'||item.format===selectedFilter;
    });

    if(!visible.length){
      sharedList.innerHTML='<div class="template-library-empty">Brak wspólnych szablonów dla wybranego formatu.</div>';
      return;
    }

    sharedList.innerHTML=visible.map(function(item){
      return '<div class="template-library-item shared-template-item">'+
        '<div class="template-library-copy">'+
          '<div class="template-library-name"><span class="shared-template-badge">Doctor.One</span>'+escHtml(item.name)+'</div>'+
          '<div class="template-library-meta">'+formatLabel(item.format,item.w,item.h)+' · '+Number(item.screenCount||0)+' stron</div>'+
          (item.description?'<div class="template-library-description">'+escHtml(item.description)+'</div>':'')+
        '</div>'+
        '<div class="template-library-actions">'+
          '<button type="button" class="primary" data-use-shared-template="'+escHtml(item.id)+'">Użyj</button>'+
        '</div>'+
      '</div>';
    }).join('');

    document.querySelectorAll('[data-use-shared-template]').forEach(function(btn){
      btn.onclick=function(){useSharedTemplate(btn.dataset.useSharedTemplate);};
    });
  }

  async function useSharedTemplate(id){
    const item=sharedIndex.find(function(x){return x.id===id;});
    if(!item) return;
    setSharedStatus('Otwieram szablon „'+item.name+'”…','');
    try{
      const response=await fetch(item.file,{cache:'no-store'});
      if(!response.ok) throw new Error('HTTP '+response.status);
      const payload=await response.json();
      const project=payload.project||payload;
      if(!project||!Array.isArray(project.screens)) throw new Error('Nieprawidłowy format szablonu');
      activateProject(project,item.name);
      setSharedStatus('Użyto wspólnego szablonu „'+item.name+'”. Pracujesz na jego kopii.','ok');
    }catch(error){
      console.error(error);
      setSharedStatus('Nie udało się otworzyć tego szablonu.','err');
    }
  }

  saveButton.addEventListener('click',saveTemplate);
  localFilter.addEventListener('change',renderLocalTemplates);
  sharedFilter.addEventListener('change',renderSharedTemplates);
  saveFormat.addEventListener('change',refreshCurrentHint);
  document.getElementById('format')?.addEventListener('change',function(){setTimeout(refreshCurrentHint,0);});
  document.getElementById('customW')?.addEventListener('input',function(){setTimeout(refreshCurrentHint,0);});
  document.getElementById('customH')?.addEventListener('input',function(){setTimeout(refreshCurrentHint,0);});

  refreshCurrentHint();
  renderLocalTemplates();
  loadSharedIndex();
})();