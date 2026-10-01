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
      if(!page || screen.type!=='content') return;
      const slideRole=semanticNormalizeStyle(screen.semanticStyle)==='mixed'?'neutral':semanticNormalizeStyle(screen.semanticStyle);
      page.dataset.semantic=slideRole;
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