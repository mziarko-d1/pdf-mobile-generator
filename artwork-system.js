(function(){
  'use strict';
  let selectedId='',gesture=null;
  const loadedFonts=new Map();
  const escapeXml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=(value,fallback=0,min=-10000,max=10000)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):fallback));
  const color=value=>/^#[a-f\d]{6}$/i.test(value)?value:'#1d1e3c';
  const imageData=value=>/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=\s]+$/i.test(value||'')?value:'';
  const fontData=value=>/^data:font\/(ttf|otf|woff2?);base64,[a-z\d+/=\s]+$/i.test(value||'')?value:'';
  const unicodeRange=value=>/^(U\+[a-f\d]+(?:-[a-f\d]+)?)(,U\+[a-f\d]+(?:-[a-f\d]+)?)*$/i.test(value||'')?value:'';
  const family=key=>'Artwork_'+String(key||'').replace(/[^a-z\d_]/gi,'');
  const checkpoint=()=>window.pdfMobileUndo?.checkpoint();
  const selected=page=>(page.artwork.elements||[]).find(e=>e.id===selectedId);
  const fontFamily=element=>element.font?family(element.font):'Arial';
  const measure=document.createElement('canvas').getContext('2d');
  const {safeLink,groupElements,linkRect,bounds,resizeElement,removalPlan}=window.ArtworkLayout;
  const originalLayout=element=>element.originalLines?.length&&element.text===element.originalText&&!element.layoutEdited;
  const {applyStyle,remapStyles,runs,originalOffsets,sourceStyles,cells}=window.ArtworkText;
  function rememberSourceStyles(element){
    if(!element.sourceStyles&&element.text===element.originalText)element.sourceStyles=sourceStyles(element);
  }
  function styledRuns(element){
    let styles=element.sourceStyles||[];
    if(element.colorOverride)styles=styles.map(({color,...rest})=>rest);
    return runs(String(element.text||''),[...styles,...(element.textStyles||[])]);
  }
  function flowLines(element){
    const text=String(element.text||''),width=number(element.width,200,4,10000),size=number(element.fontSize,12,1,300),styles=styledRuns(element);
    function widthOf(start,end){
      let total=0;
      for(const run of styles){
        const left=Math.max(start,run.start),right=Math.min(end,run.end);if(right<=left)continue;
        const font=run.style.font??element.font;
        measure.font=(run.style.bold?'bold ':'')+size+'px '+fontFamily({font})+',Arial';
        total+=measure.measureText(glyphText(text.slice(left,right),(state.artworkFonts||{})[font])).width;
      }
      return total+Math.max(0,[...text.slice(start,end)].length-1)*number(element.letterSpacing,0,-20,100);
    }
    const out=[];let offset=0;
    for(const paragraph of text.split('\n')){
      const end=offset+paragraph.length;
      if(element.fit||!paragraph){out.push({text:paragraph,start:offset,end});offset=end+1;continue;}
      let start=offset;
      while(start<end){
        let limit=start;
        for(const char of text.slice(start,end)){
          const next=limit+char.length;
          if(limit>start&&widthOf(start,next)>width)break;
          limit=next;
        }
        if(limit===end){out.push({text:text.slice(start,end),start,end});break;}
        // Break at a word boundary, otherwise split an overlong word by code point.
        const part=text.slice(start,limit),spaces=[...part.matchAll(/\s+/gu)];
        const space=spaces.filter(m=>m.index>0).at(-1);
        let stop=space?start+space.index:limit;
        if(/\s/u.test(text[limit]||''))stop=limit;
        const line=text.slice(start,stop).trimEnd();out.push({text:line,start,end:start+line.length});
        start=stop;while(start<end&&/\s/u.test(text[start]))start++;
      }
      offset=end+1;
    }
    return out;
  }
  function linesFor(element){
    return originalLayout(element)?element.originalLines.map(l=>l.text):flowLines(element).map(l=>l.text);
  }
  function formattedMarkup(text,element,start){
    const end=start+text.length;
    return styledRuns(element).filter(run=>run.end>start&&run.start<end).map(run=>{
      const font=run.style.font??element.font;
      return '<tspan font-family="'+fontFamily({font})+',Arial" font-weight="'+(run.style.bold?'700':'400')+'" fill="'+color(run.style.color||element.color)+'">'+glyphMarkup(String(element.text).slice(Math.max(start,run.start),Math.min(end,run.end)),(state.artworkFonts||{})[font])+'</tspan>';
    }).join('');
  }
  function originalMarkup(element,line,index,offsets){
    if(!offsets||!element.textStyles?.length)return glyphMarkup(line.text,(state.artworkFonts||{})[line.font]);
    const styles=cells(element.text,element.textStyles);
    return [...line.text].map((char,i)=>{
      const style=styles[offsets[index][i]]||{};
      return '<tspan'+(style.color?' fill="'+color(style.color)+'"':'')+(typeof style.bold==='boolean'?' font-weight="'+(style.bold?'700':'400')+'"':'')+'>'+glyphMarkup(char,(state.artworkFonts||{})[line.font])+'</tspan>';
    }).join('');
  }
  function elementHeight(element){
    if(element.kind!=='text')return number(element.height,32,1);
    if(originalLayout(element))return Math.max(number(element.boxHeight,0,0),...element.originalLines.map(l=>number(l.y)+number(l.fontSize,12)*1.3));
    return Math.max(number(element.boxHeight,0,0),number(element.fontSize,12)*1.3,linesFor(element).length*number(element.fontSize,12)*number(element.lineHeight,1.5,.5,5));
  }
  function glyphText(text,font){
    return [...text].map(ch=>(font?.map||{})[ch]||ch).join('');
  }
  function glyphMarkup(text,font){
    if(!font||!Object.keys(font.map||{}).length) return escapeXml(text);
    return [...text].map(ch=>font.map[ch]?escapeXml(font.map[ch]):'<tspan font-family="Arial">'+escapeXml(ch)+'</tspan>').join('');
  }
  function svgFor(page){
    const artwork=page.artwork,fonts=state.artworkFonts||{};
    let css='';
    for(const [key,font] of Object.entries(fonts)){
      const data=fontData(font.data);
      if(data) css+='@font-face{font-family:'+family(key)+';src:url('+data+');'+(unicodeRange(font.unicodeRange)?'unicode-range:'+font.unicodeRange+';':'')+'}';
    }
    let body='';
    const background=imageData(artwork.background);
    if(background) body+='<image width="100%" height="100%" href="'+background+'"/>';
    for(const element of artwork.elements||[]){
      const x=number(element.x),y=number(element.y);
      if(element.kind==='link')continue;
      if(element.kind==='image'){
        const src=imageData(element.src);
        if(src) body+='<image x="'+x+'" y="'+y+'" width="'+number(element.width,100,1)+'" height="'+number(element.height,100,1)+'" href="'+src+'"/>';
        continue;
      }
      const size=number(element.fontSize,12,1,300),font=fonts[element.font];
      let spans;
      if(originalLayout(element)){
        const offsets=originalOffsets(element);
        spans=element.originalLines.map((line,index)=>{
          const left=x+number(line.x),baseline=y+number(line.y);
          const positions=Array.isArray(line.charX)?line.charX.map(dx=>left+number(dx)).join(' '):String(left);
          return '<tspan x="'+positions+'" y="'+baseline+'" font-family="'+fontFamily(line)+',Arial" font-size="'+number(line.fontSize,size,1,300)+'" fill="'+color(element.colorOverride?element.color:line.color)+'"'+(!line.charX?' letter-spacing="'+number(line.letterSpacing,0,-20,100)+'"'+(line.fit&&line.text?' textLength="'+number(line.width,100,1)+'" lengthAdjust="spacingAndGlyphs"':''):'')+'>'+originalMarkup(element,line,index,offsets)+'</tspan>';
        }).join('');
      }else{
        spans=flowLines(element).map((line,i)=>'<tspan x="'+x+'" y="'+(y+i*size*number(element.lineHeight,1.5,.5,5))+'" letter-spacing="'+number(element.letterSpacing,0,-20,100)+'"'+(element.fit&&line.text?' textLength="'+number(element.width,100,1)+'" lengthAdjust="spacingAndGlyphs"':'')+'>'+formattedMarkup(line.text,element,line.start)+'</tspan>').join('');
      }
      body+='<text xml:space="preserve" fill="'+color(element.color)+'" font-family="'+fontFamily(element)+',Arial" font-size="'+size+'"'+(element.rotation?' transform="rotate('+number(element.rotation,0,-360,360)+' '+x+' '+y+')"':'')+'>'+spans+'</text>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+number(artwork.width,595,1)+'" height="'+number(artwork.height,842,1)+'" viewBox="0 0 '+number(artwork.width,595,1)+' '+number(artwork.height,842,1)+'"><style>'+css+'</style>'+body+'</svg>';
  }
  function svgUrl(page){return 'data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svgFor(page))));}
  function ensureFonts(){
    for(const [key,font] of Object.entries(state.artworkFonts||{})){
      const data=fontData(font.data),name=family(key);
      if(!data||loadedFonts.get(name)===data) continue;
      loadedFonts.set(name,data);
      const face=new FontFace(name,'url('+data+')',unicodeRange(font.unicodeRange)?{unicodeRange:font.unicodeRange}:{});
      face.load().then(loaded=>{document.fonts.add(loaded);renderPreview();}).catch(()=>{});
    }
  }
  function pageHtml(page,index,scale){
    const w=number(state.w,794,1),h=number(state.h,1123,1);
    return '<div class="page-wrap" draggable="true" data-page-id="'+escapeXml(page.id)+'"><div class="page-dragbar"><span>Strona '+(index+1)+' · szablon z Illustratora / PDF</span><span>⠿</span></div><div class="page-stage" style="width:'+(w*scale)+'px;height:'+(h*scale)+'px"><section class="page artwork-page '+(page.id===state.selected?'selected-page':'')+'" data-select-page="'+escapeXml(page.id)+'" style="width:'+w+'px;height:'+h+'px;transform:scale('+scale+')"><img class="artwork-sheet" alt="Podgląd edytowalnego szablonu" src="'+svgUrl(page)+'"><div class="artwork-hit-layer" data-html2canvas-ignore="true"></div></section></div></div>';
  }
  const basePreview=renderPreview;
  renderPreview=function(){
    if(gesture)return;
    basePreview();ensureFonts();
    document.querySelectorAll('.artwork-page').forEach(node=>{
      const page=state.screens.find(p=>p.id===node.dataset.selectPage),art=page.artwork;
      const sx=state.w/art.width,sy=state.h/art.height;
      node.querySelector('.artwork-hit-layer').innerHTML=art.elements.map(element=>{
        const fs=number(element.fontSize,12,1,300),height=elementHeight(element);
        return '<button type="button" class="artwork-hit '+(selectedId===element.id&&state.selected===page.id?'is-selected':'')+(element.kind==='link'?' is-link':'')+'" data-artwork-id="'+escapeXml(element.id)+'" aria-label="Edytuj: '+escapeXml((element.text||'Obrazek').slice(0,90))+'" style="left:'+(number(element.x)*sx)+'px;top:'+((number(element.y)-(element.kind==='text'?fs:0))*sy)+'px;width:'+(number(element.width,100,1)*sx)+'px;height:'+(height*sy)+'px"></button>';
      }).join('');
      const active=selected(page);
      if(active&&state.selected===page.id)drawHandles(node,active,art);
      node.querySelectorAll('.artwork-hit').forEach(hit=>{
        hit.onclick=e=>{e.stopPropagation();state.selected=page.id;selectedId=hit.dataset.artworkId;renderScreenList();renderEditor();renderPreview();};
        hit.onpointerdown=e=>startGesture(e,page,hit.dataset.artworkId,'move');
        hit.ondragstart=e=>{e.preventDefault();e.stopPropagation();};
      });
    });
  };
  function drawHandles(node,element,art){
    node.querySelector('.artwork-selection')?.remove();
    const box=bounds(element,elementHeight(element)),sx=state.w/art.width,sy=state.h/art.height;
    const overlay=document.createElement('div');overlay.className='artwork-selection';
    Object.assign(overlay.style,{left:box.x*sx+'px',top:box.y*sy+'px',width:box.width*sx+'px',height:box.height*sy+'px'});
    const handles=element.rotation?[]:[['w','Zmień szerokość z lewej'],['e','Zmień szerokość z prawej'],['s','Zmień wysokość ramki'],['se','Zmień rozmiar ramki']];
    overlay.innerHTML=handles.map(([handle,label])=>'<button type="button" class="artwork-resize artwork-resize-'+handle+'" data-artwork-resize="'+handle+'" aria-label="'+label+'" title="'+label+'"></button>').join('');
    node.querySelector('.artwork-hit-layer').append(overlay);
    overlay.querySelectorAll('button').forEach(button=>{
      button.onpointerdown=e=>startGesture(e,state.screens.find(p=>p.id===node.dataset.selectPage),element.id,button.dataset.artworkResize);
      button.onclick=e=>e.stopPropagation();button.ondragstart=e=>{e.preventDefault();e.stopPropagation();};
      button.onkeydown=e=>{
        const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
        if(!delta)return;e.preventDefault();e.stopPropagation();checkpoint();
        Object.assign(element,resizeElement(element,button.dataset.artworkResize,delta[0]*(e.shiftKey?10:1),delta[1]*(e.shiftKey?10:1),art,elementHeight(element)));
        renderEditor();renderPreview();
        document.querySelector('[data-select-page="'+CSS.escape(state.selected)+'"] [data-artwork-resize="'+button.dataset.artworkResize+'"]')?.focus();
      };
    });
  }
  function startGesture(event,page,id,handle){
    if(event.button!==0||gesture||!page)return;
    event.preventDefault();event.stopPropagation();
    state.selected=page.id;selectedId=id;renderScreenList();renderEditor();renderPreview();
    const element=selected(page),art=page.artwork,originalState=state;
    if(!element||element.rotation)return;
    const node=[...document.querySelectorAll('.artwork-page')].find(n=>n.dataset.selectPage===page.id);
    const rect=node.getBoundingClientRect(),origin={x:event.clientX,y:event.clientY},original={...element};
    const height=elementHeight(element),pointerId=event.pointerId;
    let draft=original,moved=false;
    gesture={cancel:()=>finish(false)};
    node.setPointerCapture(pointerId);
    function move(e){
      if(e.pointerId!==pointerId)return;
      const px=e.clientX-origin.x,py=e.clientY-origin.y;
      if(!moved&&Math.hypot(px,py)<3)return;
      moved=true;e.preventDefault();
      draft=resizeElement(original,handle,px*art.width/rect.width,py*art.height/rect.height,art,height);
      node.querySelector('.artwork-sheet').src=svgUrl({...page,artwork:{...art,elements:art.elements.map(el=>el===element?draft:el)}});
      const hit=[...node.querySelectorAll('.artwork-hit')].find(n=>n.dataset.artworkId===id),box=bounds(draft,elementHeight(draft));
      Object.assign(hit.style,{left:box.x*state.w/art.width+'px',top:box.y*state.h/art.height+'px',width:box.width*state.w/art.width+'px',height:box.height*state.h/art.height+'px'});
      drawHandles(node,draft,art);
    }
    function finish(commit){
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',key,true);window.removeEventListener('blur',cancel);
      if(node.hasPointerCapture(pointerId))node.releasePointerCapture(pointerId);
      gesture=null;
      if(commit&&moved&&state===originalState&&art.elements.includes(element)&&JSON.stringify(draft)!==JSON.stringify(original)){checkpoint();Object.assign(element,draft);}
      renderEditor();renderPreview();
      // Pointer capture ends before click dispatch: don't select an underlying block.
      const suppress=e=>{e.stopPropagation();e.preventDefault();};
      document.addEventListener('click',suppress,true);setTimeout(()=>document.removeEventListener('click',suppress,true),0);
    }
    function up(e){if(e.pointerId===pointerId)finish(true);}
    function cancel(){finish(false);}
    function key(e){if(e.key==='Escape'||((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase()))){e.preventDefault();e.stopImmediatePropagation();finish(false);}}
    document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);document.addEventListener('keydown',key,true);window.addEventListener('blur',cancel);
  }
  const baseEditor=renderEditor;
  renderEditor=function(){
    const page=current();
    if(!page?.artwork) return baseEditor();
    const fields=page.artwork.elements||[];
    if(!selected(page)) selectedId=fields[0]?.id||'';
    const el=selected(page);
    const compact=el?removalPlan(fields,el.id,elementHeight):{shift:0,ids:[]};
    $('editor').innerHTML='<div class="brand-note">Kliknij blok na stronie. Przeciągnij jego środek, aby go przesunąć, lub uchwyt ramki, aby zmienić rozmiar. Tekst zawija się do szerokości ramki; jej wysokość rośnie, jeśli treść potrzebuje więcej miejsca. Esc anuluje przeciąganie. Ilustracje i dekoracje oryginału są częścią wspólnego tła.</div><label>Element</label><select id="artworkSelect">'+fields.map((e,i)=>'<option value="'+escapeXml(e.id)+'" '+(e.id===selectedId?'selected':'')+'>'+(i+1)+'. '+escapeXml((e.text||'Obrazek').slice(0,80))+'</option>').join('')+'</select><div class="actions"><button type="button" id="artworkAddText" class="mini secondary">+ Tekst</button><button type="button" id="artworkAddLink" class="mini secondary">+ Obszar linku</button><button type="button" id="artworkDelete" class="mini danger" '+(!el?'disabled':'')+'>Usuń element</button><button type="button" id="artworkDeleteCompact" class="mini secondary" '+(!compact.ids.length?'disabled':'')+'>Usuń i dosuń poniżej ('+compact.ids.length+')</button></div><p class="import-note">Dosuwanie obejmuje osobne elementy w tej samej kolumnie, do najbliższego bloku przecinającego kolumnę. Wspólne tło pozostaje nieruchome. Ilustracji zapisanych w tle nie usuniesz osobno; obrazki dodane tutaj możesz usuwać.</p><label>Dodaj obrazek</label><input type="file" id="artworkImage" accept="image/png,image/jpeg,image/webp">'+(el?'<label>'+(el.kind==='text'?'Treść całego bloku':'Nazwa elementu')+'</label><textarea id="artworkText">'+escapeXml(el.text||'')+'</textarea>'+(el.kind==='text'?'<div class="artwork-format-toolbar" role="group" aria-label="Formatowanie zaznaczenia"><button type="button" id="artworkBold" class="mini secondary" aria-label="Pogrub zaznaczenie" aria-pressed="false"><b>B</b></button><label>Kolor zaznaczenia<input type="color" id="artworkSelectionColor" value="#1d1e3c"></label><button type="button" id="artworkApplyColor" class="mini secondary">Zastosuj kolor</button><button type="button" id="artworkClearFormat" class="mini ghost">Wyczyść formatowanie</button></div><p id="artworkSelectionNote" class="import-note" aria-live="polite">Zaznacz fragment tekstu powyżej, a następnie wybierz formatowanie. Efekt zobaczysz na stronie.</p>':'')+(el.kind==='image'?'<label>Podmień wybrany obrazek<input type="file" id="artworkReplaceImage" accept="image/png,image/jpeg,image/webp"></label><p class="import-note">Nowy obrazek zachowa ramkę, położenie i link wybranego elementu.</p><p id="artworkImageStatus" class="status" role="status"></p>':'')+'<div class="artwork-controls">'+[['x','X'],['y','Y'],['width','Szerokość'],...(el.kind!=='text'?[['height','Wysokość']]:[['boxHeight','Wysokość ramki (min.)'],['fontSize','Rozmiar tekstu'],['lineHeight','Interlinia'],['letterSpacing','Odstęp między literami']])].map(([key,label])=>'<label>'+label+'<input type="number" step="0.1" data-artwork-key="'+key+'" value="'+number(el[key],key==='lineHeight'?1.5:0)+'"></label>').join('')+'</div>'+(el.kind!=='text'?'':'<label>Kolor bazowy tekstu <input type="color" id="artworkColor" value="'+color(el.color)+'"></label><label><input type="checkbox" id="artworkFit" '+(el.fit?'checked':'')+'> Zachowaj szerokość oryginalnego wiersza</label>')+'<label>Link (opcjonalnie)</label><input id="artworkLink" type="text" placeholder="https://www.doctor.one" value="'+escapeXml(el.link||'')+'"><div id="artworkLinkNote" class="status"></div><label>Margines obszaru linku <input id="artworkLinkPadding" type="number" min="0" max="100" value="'+number(el.linkPadding,0,0,100)+'"></label><p class="import-note">Link będzie klikalny w wyeksportowanym PDF-ie. Dla przycisku w tle dodaj obszar linku i ustaw jego położenie oraz rozmiar.</p>':'');
    $('artworkSelect').onchange=e=>{selectedId=e.target.value;renderEditor();renderPreview();};
    $('artworkAddText').onclick=()=>{checkpoint();const field={id:uid('art'),kind:'text',text:'Nowy tekst',x:32,y:60,width:300,fontSize:14,lineHeight:1.5,color:'#1d1e3c',fit:false};fields.push(field);selectedId=field.id;renderEditor();renderPreview();};
    $('artworkAddLink').onclick=()=>{checkpoint();const field={id:uid('link'),kind:'link',text:'Obszar linku',link:'',x:32,y:page.artwork.height-70,width:240,height:32};fields.push(field);selectedId=field.id;renderEditor();renderPreview();};
    $('artworkDelete').onclick=()=>{checkpoint();page.artwork.elements=fields.filter(e=>e.id!==selectedId);selectedId='';renderEditor();renderPreview();};
    $('artworkDeleteCompact').onclick=()=>{
      const plan=removalPlan(fields,selectedId,elementHeight);if(!plan.ids.length)return;
      checkpoint();page.artwork.elements=fields.filter(e=>e.id!==selectedId);
      page.artwork.elements.forEach(e=>{if(plan.ids.includes(e.id))e.y-=plan.shift;});
      selectedId='';renderEditor();renderPreview();
    };
    $('artworkImage').onchange=async e=>{
      const file=e.target.files?.[0];if(!file) return;
      const src=await readImageFile(file);
      if(!imageData(src)||!state.screens.includes(page)) return;
      checkpoint();const field={id:uid('art'),kind:'image',src,text:file.name,x:32,y:60,width:150,height:150};fields.push(field);selectedId=field.id;renderEditor();renderPreview();
    };
    if(!el) return;
    $('artworkText').onbeforeinput=checkpoint;
    $('artworkText').oninput=e=>{
      if(el.kind==='text'){
        rememberSourceStyles(el);
        if(el.textStyles)el.textStyles=remapStyles(el.text,e.target.value,el.textStyles);
        if(el.sourceStyles)el.sourceStyles=remapStyles(el.text,e.target.value,el.sourceStyles);
      }
      el.text=e.target.value;el.fit=false;if($('artworkFit'))$('artworkFit').checked=false;renderPreview();
    };
    if(el.kind==='text'){
      const input=$('artworkText'),bold=$('artworkBold'),apply=$('artworkApplyColor'),clear=$('artworkClearFormat');
      function selection(){return {start:input.selectionStart,end:input.selectionEnd};}
      function updateFormat(){
        const {start,end}=selection(),has=end>start;
        bold.disabled=apply.disabled=clear.disabled=!has;
        const styles=cells(el.text,el.textStyles);
        bold.setAttribute('aria-pressed',String(has&&styles.slice(start,end).every(s=>s.bold===true)));
        $('artworkSelectionNote').textContent=has?'Formatowanie dotyczy zaznaczonego fragmentu. Efekt zobaczysz na stronie.':'Zaznacz fragment tekstu powyżej, a następnie wybierz formatowanie. Efekt zobaczysz na stronie.';
      }
      function format(patch){
        const {start,end}=selection();if(end<=start)return;
        checkpoint();
        if(Object.hasOwn(patch,'bold')){rememberSourceStyles(el);el.layoutEdited=true;el.fit=false;$('artworkFit').checked=false;}
        el.textStyles=applyStyle(el.text,el.textStyles,start,end,patch);
        // If source text cannot be aligned, use the paragraph renderer for exact selection offsets.
        if(originalLayout(el)&&!originalOffsets(el)){rememberSourceStyles(el);el.layoutEdited=true;el.fit=false;}
        renderPreview();input.focus({preventScroll:true});input.setSelectionRange(start,end);updateFormat();
      }
      input.addEventListener('select',updateFormat);input.addEventListener('keyup',updateFormat);input.addEventListener('mouseup',updateFormat);input.addEventListener('input',updateFormat);
      for(const button of [bold,apply,clear])button.onmousedown=e=>e.preventDefault();
      bold.onclick=()=>format({bold:bold.getAttribute('aria-pressed')!=='true'});
      apply.onclick=()=>format({color:$('artworkSelectionColor').value});
      clear.onclick=()=>format({bold:null,color:null});
      input.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='b'){e.preventDefault();updateFormat();bold.click();}});
      updateFormat();
    }
    if($('artworkReplaceImage'))$('artworkReplaceImage').onchange=async e=>{
      const file=e.target.files?.[0];if(!file)return;
      const status=$('artworkImageStatus'),originalState=state,originalSrc=el.src;
      status.textContent='Wczytuję obrazek…';
      try{
        if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Wybierz plik PNG, JPG lub WebP.');
        if(file.size>20*1024*1024)throw Error('Wybierz obrazek mniejszy niż 20 MB.');
        const src=await readImageFile(file);if(!imageData(src))throw Error('Nie udało się odczytać obrazka.');
        const image=new Image();image.src=src;await image.decode();
        if(!image.naturalWidth||!image.naturalHeight)throw Error('Plik nie zawiera poprawnego obrazka.');
        if(state!==originalState||!state.screens.includes(page)||!page.artwork.elements.includes(el)||el.src!==originalSrc)return;
        checkpoint();el.src=src;
        status.textContent='Obrazek podmieniony. Położenie, rozmiar i link pozostały bez zmian.';renderPreview();
      }catch(error){status.textContent=error.message||'Nie udało się podmienić obrazka.';}
      finally{e.target.value='';}
    };

    document.querySelectorAll('[data-artwork-key]').forEach(input=>{
      input.onfocus=checkpoint;
      input.oninput=()=>{el[input.dataset.artworkKey]=number(input.value);if(['fontSize','width','lineHeight','letterSpacing'].includes(input.dataset.artworkKey)){el.fit=false;el.layoutEdited=true;}renderPreview();};
    });
    $('artworkLink').onbeforeinput=checkpoint;
    $('artworkLink').oninput=e=>{el.link=e.target.value;updateLinkNote();};
    $('artworkLinkPadding').onfocus=checkpoint;
    $('artworkLinkPadding').oninput=e=>{el.linkPadding=number(e.target.value,0,0,100);};
    function updateLinkNote(){
      const url=safeLink(el.link),note=$('artworkLinkNote');
      $('artworkLink').setCustomValidity(el.link&&!url?'Podaj pełny adres https://, http://, mailto: lub tel:.':'');
      note.innerHTML=url?'<a href="'+escapeXml(url)+'" target="_blank" rel="noopener noreferrer">Sprawdź link ↗</a>':(el.link?'Niepoprawny adres linku.':'Bez linku.');
    }
    updateLinkNote();
    if($('artworkColor'))$('artworkColor').oninput=e=>{checkpoint();el.color=e.target.value;el.colorOverride=true;renderPreview();};
    if($('artworkFit'))$('artworkFit').onchange=e=>{checkpoint();el.fit=e.target.checked;el.layoutEdited=true;renderPreview();};
  };
  async function importFile(file){
    const original=state,snapshot=JSON.stringify(state),data=new Uint8Array(await file.arrayBuffer());
    if(new TextDecoder().decode(data.slice(0,5))!=='%PDF-') throw Error('Ten plik AI nie zawiera warstwy PDF. Zapisz go w Illustratorze z opcją zgodności z PDF lub wyeksportuj PDF.');
    $('importStatus').textContent='Odtwarzam układ PDF / Illustratora…';
    const pdf=await pdfjsLib.getDocument({data,fontExtraProperties:true,isEvalSupported:false}).promise;
    try{
      if(pdf.numPages>30) throw Error('Wybierz materiał zawierający do 30 stron.');
      const screens=[],fonts={},prefix=uid('font').replace(/[^a-z\d_]/gi,'');
      for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
        const page=await pdf.getPage(pageNo),viewport=page.getViewport({scale:1});
        if(viewport.width*viewport.height>4000000) throw Error('Strona jest zbyt duża do importu edytowalnego układu.');
        const canvas=document.createElement('canvas'),vp=page.getViewport({scale:2});canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
        const ctx=canvas.getContext('2d');
        // PDF.js renders real PDF text with these calls. Paths, images and shadows remain.
        ctx.fillText=()=>{};ctx.strokeText=()=>{};
        await page.render({canvasContext:ctx,viewport:vp}).promise;
        const content=await page.getTextContent(),ops=await page.getOperatorList(),OPS=pdfjsLib.OPS;
        const runs=[];let ink='#000000',fontName='';
        const colorStack=[];
        ops.fnArray.forEach((fn,i)=>{
          const args=ops.argsArray[i];
          if(fn===OPS.save)colorStack.push({ink,fontName});
          if(fn===OPS.restore&&colorStack.length){const saved=colorStack.pop();ink=saved.ink;fontName=saved.fontName;}
          if(fn===OPS.setFillRGBColor)ink='#'+Array.from(args).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
          if(fn===OPS.setFont)fontName=args[0];
          if(fn===OPS.showText){
            const glyphs=(args[0]||[]).filter(g=>typeof g==='object'&&g),key=prefix+'_'+fontName;
            if(!fonts[key]){
              const f=page.commonObjs.get(fontName);
              if(f?.data){let binary='';for(const b of f.data)binary+=String.fromCharCode(b);fonts[key]={data:'data:font/ttf;base64,'+btoa(binary),map:{}};}
            }
            if(fonts[key])glyphs.forEach(g=>{if(g.unicode&&g.fontChar)fonts[key].map[g.unicode]=g.fontChar;});
            runs.push({text:glyphs.map(g=>g.unicode||'').join('').normalize('NFKC').trim(),color:ink,font:fontName});
          }
        });
        const elements=[];
        for(const item of content.items){
          if(!item.str?.trim())continue;
          const tx=pdfjsLib.Util.transform(viewport.transform,item.transform),size=Math.hypot(tx[2],tx[3]);
          const run=runs.find(r=>r.font===item.fontName&&r.text===item.str.normalize('NFKC').trim());
          elements.push({id:uid('art'),kind:'text',text:item.str,x:tx[4],y:tx[5],width:Math.max(4,item.width),fontSize:size,lineHeight:1.4,color:run?.color||'#1d1e3c',font:fonts[prefix+'_'+item.fontName]?prefix+'_'+item.fontName:'',rotation:Math.atan2(tx[1],tx[0])*180/Math.PI,fit:true});
        }
        screens.push({id:uid('p'),type:'artwork',title:'Strona '+pageNo,blocks:[],artwork:{version:2,width:viewport.width,height:viewport.height,background:canvas.toDataURL('image/png'),elements:groupElements(elements)}});
      }
      if(state!==original||JSON.stringify(state)!==snapshot) throw Error('Projekt zmienił się w trakcie importu. Wgraj plik ponownie.');
      checkpoint();const first=screens[0].artwork;
      state={...initialState(),name:file.name.replace(/\.(ai|pdf)$/i,''),format:'custom',w:first.width*4/3,h:first.height*4/3,screens,selected:screens[0].id,artworkFonts:fonts};
      selectedId='';render();
      const count=screens.reduce((n,p)=>n+p.artwork.elements.length,0);
      $('importStatus').className='status ok';$('importStatus').textContent='Zaimportowano '+screens.length+' stron i '+count+' edytowalnych pól tekstowych. Grafiki i dekoracje pozostają w tle.'+(count?'':' Brak tekstu do edycji: może być zamieniony na krzywe lub zapisany jako obraz.');
      return state;
    }finally{await pdf.destroy();}
  }
  const baseMakePdf=makeEditablePdf;
  makeEditablePdf=async function(){
    for(const page of state.screens)for(const el of page.artwork?.elements||[]){
      if(el.link&&!safeLink(el.link))throw Error('Popraw nieprawidłowy link w elemencie „'+String(el.text||'').slice(0,50)+'”.');
    }
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('.artwork-sheet')].map(image=>image.decode()));
    const bytes=await baseMakePdf();
    const doc=await PDFLib.PDFDocument.load(bytes);
    for(let i=0;i<state.screens.length;i++){
      const source=state.screens[i],art=source.artwork;
      if(!art)continue;
      const page=doc.getPage(i),sx=page.getWidth()/art.width,sy=page.getHeight()/art.height;
      for(const element of art.elements){
        const url=safeLink(element.link);if(!url)continue;
        const rect=linkRect(element,elementHeight(element));
        const left=Math.max(0,rect.x),top=Math.max(0,rect.y),right=Math.min(art.width,rect.x+rect.width),bottom=Math.min(art.height,rect.y+rect.height);
        if(right<=left||bottom<=top)continue;
        const annotation=doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[left*sx,page.getHeight()-bottom*sy,right*sx,page.getHeight()-top*sy],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFLib.PDFString.of(url)}});
        page.node.addAnnot(doc.context.register(annotation));
      }
    }
    return doc.save();
  };
  window.PdfArtwork={pageHtml,svgFor,importFile,linesFor,elementHeight};
  render();
})();
