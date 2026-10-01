(function(){
  const SEMANTIC_SYSTEM = {
    product:{label:'Product / Doctor.One',main:'#3F506E',icon:'#3F506E',altIcon:'#838DBC',tint:'#EFF1F5',text:'#FFFFFF'},
    patient:{label:'Patient',main:'#F2CFBD',icon:'#D9A081',tint:'#FBF2ED',text:'#1D1E3C'},
    hcp:{label:'HCP / Clinical',main:'#ACB8E9',icon:'#9099CF',tint:'#F0F2FB',text:'#1D1E3C'},
    neutral:{label:'Neutral',main:'#E8EAF0',icon:'#3F506E',tint:'#F7F8FB',text:'#1D1E3C'}
  };

  function semanticNormalizeRole(value){
    return ['inherit','product','patient','hcp','neutral'].includes(value)?value:'inherit';
  }
  function semanticNormalizeStyle(value){
    return ['product','patient','hcp','mixed','neutral'].includes(value)?value:'neutral';
  }
  function semanticEnsureState(){
    if(!state || !Array.isArray(state.screens)) return;
    state.screens.forEach((screen)=>{
      if(screen.type!=='content') return;
      screen.semanticStyle=semanticNormalizeStyle(screen.semanticStyle || 'neutral');
      if(typeof screen.semanticAuto!=='boolean') screen.semanticAuto=true;
      (screen.blocks||[]).forEach((block)=>{
        block.semanticRole=semanticNormalizeRole(block.semanticRole || 'inherit');
      });
    });
  }
  function semanticEffectiveRole(screen,block){
    const local=semanticNormalizeRole(block && block.semanticRole);
    if(local!=='inherit') return local;
    const style=semanticNormalizeStyle(screen && screen.semanticStyle);
    return style==='mixed'?'neutral':style;
  }
  function semanticVars(role){
    const s=SEMANTIC_SYSTEM[role]||SEMANTIC_SYSTEM.neutral;
    return {
      '--semantic-main':s.main,
      '--semantic-icon':s.icon,
      '--semantic-tint':s.tint,
      '--semantic-text':s.text
    };
  }
  function semanticApplyVars(el,role){
    if(!el) return;
    const vars=semanticVars(role);
    Object.entries(vars).forEach(([k,v])=>el.style.setProperty(k,v));
  }
  function semanticStyleOptions(value){
    const opts=[
      ['neutral','Neutral / shared'],
      ['product','Product / Doctor.One'],
      ['patient','Patient'],
      ['hcp','HCP / Clinical'],
      ['mixed','Mixed roles']
    ];
    return opts.map(([v,l])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+l+'</option>').join('');
  }
  function semanticRoleOptions(value){
    const opts=[
      ['inherit','Dziedzicz ze slajdu'],
      ['product','Product / Doctor.One'],
      ['patient','Patient'],
      ['hcp','HCP / Clinical'],
      ['neutral','Neutral']
    ];
    return opts.map(([v,l])=>'<option value="'+v+'" '+(v===value?'selected':'')+'>'+l+'</option>').join('');
  }
  function semanticMountScreenControls(screen){
    const editor=document.getElementById('editor');
    if(!editor || !screen || screen.type!=='content') return;
    const wrap=document.createElement('div');
    wrap.className='semantic-screen-controls';
    wrap.innerHTML='<div class="semantic-control-title">Warstwa semantyczna slajdu</div>'+
      '<label>Styl slajdu</label><select id="semanticSlideStyle">'+semanticStyleOptions(screen.semanticStyle)+'</select>'+
      '<label class="checkbox semantic-auto-check"><input id="semanticAutoColors" type="checkbox" '+(screen.semanticAuto!==false?'checked':'')+'> Użyj automatycznych kolorów semantycznych</label>'+
      '<div class="semantic-helper">Kolor opisuje warstwę znaczeniową treści, nie tylko wyróżnienie. Mixed pozwala ustawić role osobno na blokach.</div>';
    editor.insertBefore(wrap,editor.firstChild);
    document.getElementById('semanticSlideStyle').onchange=(e)=>{
      screen.semanticStyle=semanticNormalizeStyle(e.target.value);
      renderPreview();
    };
    document.getElementById('semanticAutoColors').onchange=(e)=>{
      screen.semanticAuto=!!e.target.checked;
      renderPreview();
    };
  }
  function semanticMountBlockControls(screen){
    if(!screen || screen.type!=='content') return;
    const cards=[...document.querySelectorAll('#blocks .block-card')];
    (screen.blocks||[]).forEach((block,index)=>{
      const card=cards[index];
      if(!card) return;
      const field=document.createElement('div');
      field.className='semantic-block-control';
      field.innerHTML='<label>Rola semantyczna</label><select data-semantic-block="'+block.id+'">'+semanticRoleOptions(block.semanticRole)+'</select>';
      const head=card.querySelector('.block-head');
      if(head && head.nextSibling) card.insertBefore(field,head.nextSibling); else card.appendChild(field);
      const select=field.querySelector('select');
      select.onchange=(e)=>{
        block.semanticRole=semanticNormalizeRole(e.target.value);
        renderPreview();
      };
    });
  }
  function semanticDecoratePreview(){
    if(!state || !Array.isArray(state.screens)) return;
    state.screens.forEach((screen)=>{
      const page=document.querySelector('[data-select-page="'+screen.id+'"]');
      if(!page) return;
      page.dataset.format=state.format||'mobile';
      if(screen.type!=='content') return;
      const slideRole=semanticNormalizeStyle(screen.semanticStyle)==='mixed'?'neutral':semanticNormalizeStyle(screen.semanticStyle);
      page.dataset.semantic=slideRole;
      page.classList.toggle('imported-content',!!screen.importedContent||!!screen.importGroup);
      page.classList.toggle('hide-page-title',!!screen.hidePageTitle);
      page.classList.toggle('semantic-page-auto',screen.semanticAuto!==false && slideRole!=='neutral');
      semanticApplyVars(page,slideRole);
      (screen.blocks||[]).forEach((block)=>{
        const el=page.querySelector('[data-block-id="'+block.id+'"]');
        if(!el) return;
        const effective=semanticEffectiveRole(screen,block);
        el.dataset.semantic=effective;
        el.dataset.semanticSource=(block.semanticRole&&block.semanticRole!=='inherit')?'local':'slide';
        el.classList.toggle('semantic-auto',screen.semanticAuto!==false && effective!=='neutral');
        semanticApplyVars(el,effective);
      });
    });
  }

  const semanticBaseRenderEditor=renderEditor;
  renderEditor=function(){
    semanticEnsureState();
    semanticBaseRenderEditor();
    const screen=current();
    semanticMountScreenControls(screen);
    semanticMountBlockControls(screen);
  };

  const semanticBaseRenderPreview=renderPreview;
  renderPreview=function(){
    semanticEnsureState();
    semanticBaseRenderPreview();
    semanticDecoratePreview();
  };

  semanticEnsureState();
  render();
})();

/* Inline preview editing v1: edit visible copy without re-rendering the canvas while typing. */
(function(){
  function inlineText(el){
    return String(el.innerText||'').replace(/\u00a0/g,' ').replace(/\r/g,'').trimEnd();
  }
  function inlineScreenFor(el){
    const page=el.closest('[data-select-page]');
    if(!page) return null;
    return state.screens.find(s=>s.id===page.dataset.selectPage)||null;
  }
  function inlineBlockFor(screen,el){
    const topic=el.closest('[data-block-id]');
    if(!screen||!topic) return null;
    return (screen.blocks||[]).find(b=>b.id===topic.dataset.blockId)||null;
  }
  function inlineSelectScreen(screen){
    if(!screen||state.selected===screen.id) return;
    state.selected=screen.id;
    renderScreenList();
    renderEditor();
  }
  function inlineSyncPageField(kind,value){
    const map={cover:'coverHeading',title:'pageTitle',intro:'pageIntro'};
    const input=document.getElementById(map[kind]);
    if(input) input.value=value;
  }
  function inlineSyncBlockField(block,key,value){
    if(!block) return;
    let input=null;
    if(block.type==='imageText'){
      input=document.querySelector(key==='title'?'[data-imgtitle="'+block.id+'"]':'[data-imgbody="'+block.id+'"]');
    }else{
      input=document.querySelector('[data-b="'+block.id+'"][data-k="'+key+'"]');
    }
    if(input) input.value=value;
  }
  function inlineDisableDrag(el){
    const topic=el.closest('.topic[draggable="true"]');
    const wrap=el.closest('.page-wrap[draggable="true"]');
    if(topic){topic.dataset.inlineWasDraggable='1';topic.draggable=false}
    if(wrap){wrap.dataset.inlineWasDraggable='1';wrap.draggable=false}
  }
  function inlineRestoreDrag(el){
    const topic=el.closest('.topic');
    const wrap=el.closest('.page-wrap');
    if(topic&&topic.dataset.inlineWasDraggable){topic.draggable=true;delete topic.dataset.inlineWasDraggable}
    if(wrap&&wrap.dataset.inlineWasDraggable){wrap.draggable=true;delete wrap.dataset.inlineWasDraggable}
  }
  function inlineBind(el,kind){
    if(!el||el.dataset.inlineBound==='1') return;
    el.dataset.inlineBound='1';
    el.setAttribute('contenteditable','true');
    el.setAttribute('spellcheck','true');
    el.setAttribute('role','textbox');
    el.dataset.inlineKind=kind;
    el.title='Kliknij i edytuj tekst bezpośrednio';

    el.addEventListener('pointerdown',e=>{
      e.stopPropagation();
      inlineDisableDrag(el);
    });
    el.addEventListener('click',e=>e.stopPropagation());
    el.addEventListener('dragstart',e=>{e.preventDefault();e.stopPropagation()});
    el.addEventListener('focus',()=>{
      const screen=inlineScreenFor(el);
      inlineSelectScreen(screen);
      inlineDisableDrag(el);
    });
    el.addEventListener('paste',e=>{
      e.preventDefault();
      const text=e.clipboardData?.getData('text/plain')||'';
      document.execCommand('insertText',false,text);
    });
    el.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();el.blur();return}
      if((kind==='cover'||kind==='title'||kind==='block-title')&&e.key==='Enter'){
        e.preventDefault();el.blur();
      }
    });
    el.addEventListener('input',()=>{
      const screen=inlineScreenFor(el);
      if(!screen) return;
      const value=inlineText(el);
      if(kind==='cover'){
        screen.heading=value;
        inlineSyncPageField('cover',value);
      }else if(kind==='title'){
        screen.title=value;
        inlineSyncPageField('title',value);
        renderScreenList();
      }else if(kind==='intro'){
        screen.intro=value;
        inlineSyncPageField('intro',value);
      }else{
        const block=inlineBlockFor(screen,el);
        if(!block) return;
        if(kind==='block-title'){
          block.title=value;
          inlineSyncBlockField(block,'title',value);
        }else if(kind==='block-body'){
          block.body=value;
          inlineSyncBlockField(block,'body',value);
        }
      }
    });
    el.addEventListener('blur',()=>{
      inlineRestoreDrag(el);
      const screen=inlineScreenFor(el);
      if(screen&&(kind==='cover'||kind==='title')) renderScreenList();
    });
  }
  function enableInlinePreviewEditing(){
    document.querySelectorAll('.cover-title').forEach(el=>inlineBind(el,'cover'));
    document.querySelectorAll('.page:not(.cover) .page-title').forEach(el=>inlineBind(el,'title'));
    document.querySelectorAll('.page:not(.cover) .page-intro').forEach(el=>inlineBind(el,'intro'));
    document.querySelectorAll('.topic[data-block-id] .topic-title').forEach(el=>inlineBind(el,'block-title'));
    document.querySelectorAll('.topic[data-block-id] .topic-body').forEach(el=>inlineBind(el,'block-body'));
  }

  const inlineBaseRenderPreview=renderPreview;
  renderPreview=function(){
    inlineBaseRenderPreview();
    enableInlinePreviewEditing();
  };

  ['exportPdf','saveAndExport'].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn) btn.addEventListener('pointerdown',()=>{
      const active=document.activeElement;
      if(active&&active.matches&&active.matches('[contenteditable="true"]')) active.blur();
    },true);
  });

  renderPreview();
})();


/* Import highlight suggestions v1 */
(function(){
  const labels={
    important:'Ważne',
    warning:'Uważaj',
    remember:'Pamiętaj'
  };

  function mountImportSuggestions(){
    const screen=current();
    if(!screen||screen.type!=='content') return;

    const cards=[...document.querySelectorAll('#blocks .block-card')];

    /* Imported block type helper v1 */
    if(screen.importedContent||screen.importGroup){
      (screen.blocks||[]).forEach((block,index)=>{
        if(!block||block.type==='image'||block.type==='imageText') return;
        const card=cards[index];
        if(!card) return;
        const typeSelect=card.querySelector('[data-b="'+block.id+'"][data-k="type"]');
        if(!typeSelect) return;
        const label=typeSelect.previousElementSibling;
        if(label&&label.tagName==='LABEL') label.textContent='Typ / wygląd bloku';
        if(!card.querySelector('.import-type-helper')){
          const helper=document.createElement('div');
          helper.className='import-type-helper';
          helper.textContent='Po imporcie możesz zmienić akapit np. na Ważne, Uważaj, Pamiętaj albo biały box.';
          typeSelect.insertAdjacentElement('afterend',helper);
        }
      });
    }
    (screen.blocks||[]).forEach((block,index)=>{
      if(!block||!block.suggestedBox||!labels[block.suggestedBox]) return;
      if(['important','warning','remember'].includes(block.type)) return;

      const card=cards[index];
      if(!card) return;

      const suggestion=document.createElement('div');
      suggestion.className='import-box-suggestion';
      suggestion.innerHTML=
        '<div><strong>Sugestia wyróżnienia: '+labels[block.suggestedBox]+'</strong>'+
        '<span>Treść wygląda na fragment, który warto wizualnie wyróżnić.</span></div>'+
        '<div class="import-suggestion-actions">'+
        '<button type="button" class="mini secondary" data-apply-suggestion="'+block.id+'">Zastosuj</button>'+
        '<button type="button" class="mini ghost" data-dismiss-suggestion="'+block.id+'">Pomiń</button>'+
        '</div>';

      card.appendChild(suggestion);
    });

    document.querySelectorAll('[data-apply-suggestion]').forEach(btn=>{
      btn.onclick=()=>{
        const block=(screen.blocks||[]).find(b=>b.id===btn.dataset.applySuggestion);
        if(!block||!block.suggestedBox) return;
        const type=block.suggestedBox;
        if(!block.title) block.title=labels[type]||'Ważne';
        block.type=type;
        delete block.suggestedBox;
        renderEditor();
        renderPreview();
      };
    });

    document.querySelectorAll('[data-dismiss-suggestion]').forEach(btn=>{
      btn.onclick=()=>{
        const block=(screen.blocks||[]).find(b=>b.id===btn.dataset.dismissSuggestion);
        if(!block) return;
        delete block.suggestedBox;
        renderEditor();
      };
    });
  }

  const suggestionBaseRenderEditor=renderEditor;
  renderEditor=function(){
    suggestionBaseRenderEditor();
    mountImportSuggestions();
  };

  renderEditor();
})();
