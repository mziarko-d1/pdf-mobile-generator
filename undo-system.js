(function(){
  const MAX_HISTORY=50;
  const undoStack=[];
  const redoStack=[];
  let restoring=false;

  function snapshot(){
    try{return JSON.stringify(state)}catch{return ''}
  }
  function same(a,b){return !!a&&!!b&&a===b}
  function checkpoint(){
    if(restoring) return;
    const snap=snapshot();
    if(!snap) return;
    if(undoStack.length&&same(undoStack[undoStack.length-1],snap)) return;
    undoStack.push(snap);
    if(undoStack.length>MAX_HISTORY) undoStack.shift();
    redoStack.length=0;
  }
  function restore(snap,label){
    if(!snap) return;
    restoring=true;
    try{
      state=JSON.parse(snap);
      render();
      showToast(label);
    }finally{
      restoring=false;
    }
  }
  function undo(){
    if(!undoStack.length){
      showToast('Nie ma już ruchu do cofnięcia');
      return;
    }
    const current=snapshot();
    let previous=undoStack.pop();
    while(undoStack.length&&same(previous,current)) previous=undoStack.pop();
    if(current) redoStack.push(current);
    restore(previous,'Cofnięto ostatni ruch');
  }
  function redo(){
    if(!redoStack.length){
      showToast('Nie ma ruchu do ponowienia');
      return;
    }
    const current=snapshot();
    const next=redoStack.pop();
    if(current){
      undoStack.push(current);
      if(undoStack.length>MAX_HISTORY) undoStack.shift();
    }
    restore(next,'Ponowiono ruch');
  }
  function isTextEditingTarget(target){
    if(!target) return false;
    if(target.closest&&target.closest('[contenteditable="true"]')) return true;
    const tag=String(target.tagName||'').toLowerCase();
    if(tag==='textarea') return true;
    if(tag==='input'){
      const type=String(target.type||'text').toLowerCase();
      return ['text','search','url','email','tel','password','number'].includes(type);
    }
    return false;
  }
  function showToast(message){
    let el=document.getElementById('undoToast');
    if(!el){
      el=document.createElement('div');
      el.id='undoToast';
      el.className='undo-toast';
      document.body.appendChild(el);
    }
    el.textContent=message;
    el.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer=setTimeout(()=>el.classList.remove('show'),1300);
  }

  function wrapMutation(name){
    const original=window[name]||globalThis[name];
    if(typeof original!=='function') return;
    const wrapped=function(){
      checkpoint();
      return original.apply(this,arguments);
    };
    try{window[name]=wrapped}catch{}
    try{globalThis[name]=wrapped}catch{}
    try{
      if(name==='movePage') movePage=wrapped;
      if(name==='moveBlock') moveBlock=wrapped;
      if(name==='addBlockAt') addBlockAt=wrapped;
      if(name==='removeScreen') removeScreen=wrapped;
    }catch{}
  }

  ['movePage','moveBlock','addBlockAt','removeScreen'].forEach(wrapMutation);

  document.addEventListener('click',function(e){
    const t=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!t) return;
    if(t.matches('#addCover,#addContent,#newProject,#removeTemplate,#fillTemplateFromContent,[data-r],[data-apply-suggestion],[data-dismiss-suggestion]')){
      checkpoint();
    }
  },true);

  document.addEventListener('change',function(e){
    const t=e.target;
    if(!t||!t.matches) return;
    if(t.matches('#format,#doctorPreset,#customPreset,[data-b][data-k="type"],[data-b][data-k="showIcon"],[data-imgside],[data-column-count],[data-colkind],[data-colimage],[data-white-size],[data-white-media],[data-white-position],[data-white-align],[data-white-icon],[data-white-image],#pageFooterShowNumber,#pageFooterNumberMode,#pageFooterShowCover,[data-semantic-block],#semanticSlideStyle,#semanticAutoColors')){
      checkpoint();
    }
  },true);

  document.addEventListener('keydown',function(e){
    const mod=e.ctrlKey||e.metaKey;
    if(!mod) return;
    const key=String(e.key||'').toLowerCase();

    if(key==='z'){
      if(isTextEditingTarget(e.target)) return;
      e.preventDefault();
      if(e.shiftKey) redo();
      else undo();
      return;
    }
    if(key==='y'){
      if(isTextEditingTarget(e.target)) return;
      e.preventDefault();
      redo();
    }
  },true);

  window.pdfMobileUndo={checkpoint,undo,redo};
})();