(function(){
  const fileInput=document.getElementById('svgImportFile');
  const demoButton=document.getElementById('svgImportDemo');
  const status=document.getElementById('svgImportStatus');
  if(!fileInput||!demoButton||!status) return;

  const originalRenderPreview=renderPreview;
  const originalRenderEditor=renderEditor;
  const EDIT_ATTR='data-doctorone-svg-id';

  function setStatus(message,type){
    status.className='status'+(type?' '+type:'');
    status.textContent=message||'';
  }

  function html(value){
    return String(value==null?'':value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  function readFileAsDataUrl(file){
    return new Promise(function(resolve,reject){
      const reader=new FileReader();
      reader.onload=function(){resolve(reader.result);};
      reader.onerror=reject;
      reader.readAsDataURL(file);
    });
  }

  function parseLength(value){
    const raw=String(value||'').trim();
    const match=raw.match(/^(-?\d+(?:\.\d+)?)(px|pt|mm|cm|in)?$/i);
    if(!match) return null;
    const n=Number(match[1]);
    const unit=(match[2]||'px').toLowerCase();
    if(unit==='pt') return n*96/72;
    if(unit==='mm') return n*96/25.4;
    if(unit==='cm') return n*96/2.54;
    if(unit==='in') return n*96;
    return n;
  }

  function cleanCssText(value){
    return String(value||'')
      .replace(/@import[^;]+;?/gi,'')
      .replace(/url\(\s*(['"]?)(?!#)(?!data:image\/)[^)]+\)/gi,'none');
  }

  function sanitizeSvgDocument(doc){
    const svg=doc.documentElement;
    const banned='script,foreignObject,iframe,object,embed,link,meta,audio,video,canvas';
    svg.querySelectorAll(banned).forEach(function(node){node.remove();});

    [svg].concat(Array.from(svg.querySelectorAll('*'))).forEach(function(node){
      Array.from(node.attributes||[]).forEach(function(attr){
        const name=String(attr.name||'').toLowerCase();
        const value=String(attr.value||'').trim();

        if(name.startsWith('on')){
          node.removeAttribute(attr.name);
          return;
        }

        if(name==='href'||name==='xlink:href'){
          const tag=String(node.tagName||'').toLowerCase();
          const allowedLocal=value.startsWith('#');
          const allowedImage=tag==='image'&&/^data:image\//i.test(value);
          if(!allowedLocal&&!allowedImage) node.removeAttribute(attr.name);
          return;
        }

        if(name==='style'){
          node.setAttribute(attr.name,cleanCssText(value));
          return;
        }

        if(/url\(/i.test(value)){
          node.setAttribute(attr.name,cleanCssText(value));
        }
      });
    });

    svg.querySelectorAll('style').forEach(function(style){
      style.textContent=cleanCssText(style.textContent||'');
    });

    if(!svg.getAttribute('xmlns')) svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
    return svg;
  }

  function inheritedPresentation(node,name,fallback){
    let current=node;
    while(current&&current.nodeType===1){
      const attr=current.getAttribute&&current.getAttribute(name);
      if(attr) return attr;
      try{
        const style=current.style&&current.style.getPropertyValue(name);
        if(style) return style;
      }catch{}
      current=current.parentElement;
    }
    return fallback||'';
  }

  function describeSvg(svg){
    let seq=0;
    const elements=[];

    function register(node,type,label){
      const editorId='d1svg'+(++seq);
      node.setAttribute(EDIT_ATTR,editorId);
      const descriptor={
        id:editorId,
        type:type,
        tag:String(node.tagName||'').toLowerCase(),
        label:label||type+' '+seq
      };
      if(type==='text'){
        descriptor.text=String(node.textContent||'').trim();
        descriptor.fill=inheritedPresentation(node,'fill','#1D1E3C');
        descriptor.fontSize=inheritedPresentation(node,'font-size','16');
      }
      if(type==='image'){
        descriptor.href=node.getAttribute('href')||node.getAttribute('xlink:href')||'';
      }
      if(type==='shape'){
        descriptor.fill=inheritedPresentation(node,'fill','none');
        descriptor.stroke=inheritedPresentation(node,'stroke','none');
      }
      elements.push(descriptor);
    }

    svg.querySelectorAll('text').forEach(function(textNode){
      const tspans=Array.from(textNode.querySelectorAll('tspan'));
      if(tspans.length){
        tspans.forEach(function(node,index){
          const copy=String(node.textContent||'').trim();
          register(node,'text',node.id||copy.slice(0,36)||('Tekst '+(index+1)));
        });
      }else{
        const copy=String(textNode.textContent||'').trim();
        register(textNode,'text',textNode.id||copy.slice(0,36)||'Tekst');
      }
    });

    svg.querySelectorAll('image').forEach(function(node,index){
      register(node,'image',node.id||('Obraz '+(index+1)));
    });

    svg.querySelectorAll('rect,circle,ellipse,path,polygon,polyline,line').forEach(function(node,index){
      register(node,'shape',node.id||String(node.tagName||'shape')+' '+(index+1));
    });

    return elements;
  }

  function svgDimensions(svg){
    const viewBox=String(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
    let width=null;
    let height=null;

    // Illustrator often writes width/height in pt or mm. The viewBox is a safer
    // representation of the actual artwork coordinate system, so prefer it.
    if(viewBox.length===4&&viewBox.every(Number.isFinite)&&viewBox[2]&&viewBox[3]){
      width=Math.abs(viewBox[2]);
      height=Math.abs(viewBox[3]);
    }else{
      width=parseLength(svg.getAttribute('width'));
      height=parseLength(svg.getAttribute('height'));
    }

    width=width||390;
    height=height||844;

    const max=3000;
    const min=160;
    const ratio=width/height||1;
    if(width>max||height>max){
      if(width>=height){width=max;height=max/ratio;}
      else{height=max;width=max*ratio;}
    }
    if(width<min||height<min){
      if(width<=height){width=min;height=min/ratio;}
      else{height=min;width=min*ratio;}
    }
    return {width:Math.round(width),height:Math.round(height)};
  }

  function projectSizeForSvg(width,height){
    const w=Number(width)||390;
    const h=Number(height)||844;
    const ratio=w/h;

    if(Math.abs(w-390)<=3&&Math.abs(h-844)<=3){
      return {format:'mobile',width:390,height:844,label:'Mobile'};
    }

    // Illustrator A4 artboards are commonly exported as ~595 × 842 pt.
    // Normalize A4-looking SVGs to the generator's A4 canvas.
    const a4Portrait=1/Math.sqrt(2);
    const a4Landscape=Math.sqrt(2);
    if(h>w&&Math.abs(ratio-a4Portrait)<0.025){
      return {format:'a4p',width:794,height:1123,label:'A4 pion'};
    }
    if(w>h&&Math.abs(ratio-a4Landscape)<0.025){
      return {format:'a4l',width:1123,height:794,label:'A4 poziom'};
    }

    return {format:'custom',width:Math.round(w),height:Math.round(h),label:'Własny'};
  }

  function parseSvg(source){
    const doc=new DOMParser().parseFromString(String(source||''),'image/svg+xml');
    if(doc.querySelector('parsererror')) throw new Error('Nie mogę odczytać tego SVG. Sprawdź, czy plik jest poprawnym SVG.');
    const svg=doc.documentElement;
    if(!svg||String(svg.tagName||'').toLowerCase()!=='svg') throw new Error('Ten plik nie zawiera głównego elementu SVG.');

    sanitizeSvgDocument(doc);
    const dimensions=svgDimensions(svg);
    const elements=describeSvg(svg);
    const serialized=new XMLSerializer().serializeToString(svg);
    const textCount=elements.filter(function(item){return item.type==='text';}).length;
    const pathCount=svg.querySelectorAll('path').length;
    return {
      source:serialized,
      elements:elements,
      width:dimensions.width,
      height:dimensions.height,
      textCount:textCount,
      pathCount:pathCount,
      textOutlinedLikely:textCount===0&&pathCount>=4
    };
  }

  function svgDataUrl(source){
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(String(source||''));
  }

  function currentSvgScreen(){
    const screen=current();
    return screen&&screen.type==='svg'&&screen.svg?screen:null;
  }

  function makeSvgScreen(parsed,name){
    const cleanName=String(name||'Edytowalny SVG').replace(/\.svg$/i,'').replace(/[_-]+/g,' ').trim()||'Edytowalny SVG';
    return {
      id:uid('p'),
      type:'svg',
      title:'SVG · '+cleanName,
      intro:'',
      blocks:[],
      svg:{
        source:parsed.source,
        elements:parsed.elements,
        originalName:name||'demo.svg',
        sourceWidth:parsed.width,
        sourceHeight:parsed.height,
        textOutlinedLikely:!!parsed.textOutlinedLikely
      }
    };
  }

  function summarizeProject(parsedList){
    return parsedList.reduce(function(acc,parsed){
      (parsed.elements||[]).forEach(function(item){acc[item.type]=(acc[item.type]||0)+1;});
      if(parsed.textOutlinedLikely) acc.outlined=(acc.outlined||0)+1;
      return acc;
    },{});
  }

  function applySvgProject(parsedList,names){
    if(!parsedList.length) throw new Error('Nie znaleziono żadnych plików SVG.');
    if(window.pdfMobileUndo&&window.pdfMobileUndo.checkpoint) window.pdfMobileUndo.checkpoint();

    const first=parsedList[0];
    const targetSize=projectSizeForSvg(first.width,first.height);
    const screens=parsedList.map(function(parsed,index){
      return makeSvgScreen(parsed,names[index]||('strona-'+(index+1)+'.svg'));
    });

    state.name=String((names[0]||'Edytowalny SVG')).replace(/\.svg$/i,'').replace(/[_-]+/g,' ').trim()||'Edytowalny SVG';
    state.format=targetSize.format;
    state.w=targetSize.width;
    state.h=targetSize.height;
    state.screens=screens;
    state.selected=screens[0].id;

    render();
    const projectName=document.getElementById('projectName');
    if(projectName) projectName.value=state.name;

    const counts=summarizeProject(parsedList);
    const mismatched=parsedList.some(function(parsed){
      const r1=parsed.width/parsed.height;
      const r2=first.width/first.height;
      return Math.abs(r1-r2)>0.02;
    });

    let message='SVG gotowy: '+screens.length+' '+(screens.length===1?'strona':'strony')+
      ' · format '+targetSize.label+' '+targetSize.width+' × '+targetSize.height+
      ' · teksty '+(counts.text||0)+' · obrazy '+(counts.image||0)+'.';

    if(counts.outlined){
      message+=' W '+counts.outlined+' pliku/plikuach nie znaleziono prawdziwego tekstu — prawdopodobnie został zamieniony na krzywe w Illustratorze.';
    }else{
      message+=' Teksty edytujesz w sekcji „Edytor aktywnego ekranu”.';
    }
    if(mismatched) message+=' Uwaga: pliki mają różne proporcje; są dopasowywane bez rozciągania.';

    setStatus(message,counts.outlined?'err':'ok');
  }

  function importSvgSource(source,name){
    const parsed=parseSvg(source);
    applySvgProject([parsed],[name||'demo.svg']);
  }

  async function importSvgFiles(files){
    const list=Array.from(files||[]);
    if(!list.length) return;
    const parsed=[];
    const names=[];
    for(let i=0;i<list.length;i++){
      const file=list[i];
      if(!/\.svg$/i.test(file.name)&&file.type!=='image/svg+xml') throw new Error('Wybierz pliki .svg.');
      parsed.push(parseSvg(await file.text()));
      names.push(file.name);
    }
    applySvgProject(parsed,names);
  }

  function parseScreenSvg(screen){
    return new DOMParser().parseFromString(screen.svg.source,'image/svg+xml');
  }

  function saveScreenSvg(screen,doc){
    screen.svg.source=new XMLSerializer().serializeToString(doc.documentElement);
  }

  function setPresentation(node,name,value){
    node.setAttribute(name,value);
    try{if(node.style) node.style.setProperty(name,value);}catch{}
  }

  function updateSvgNode(screen,id,callback){
    const doc=parseScreenSvg(screen);
    const node=doc.querySelector('['+EDIT_ATTR+'="'+id+'"]');
    if(!node) return false;
    callback(node,doc);
    saveScreenSvg(screen,doc);
    return true;
  }

  function descriptor(screen,id){
    return (screen.svg.elements||[]).find(function(item){return item.id===id;});
  }

  function renderSvgPreview(){
    originalRenderPreview();
    (state.screens||[]).forEach(function(screen){
      if(!screen||screen.type!=='svg'||!screen.svg) return;
      const page=document.querySelector('[data-select-page="'+screen.id+'"]');
      if(!page) return;
      page.classList.add('svg-page');
      page.removeAttribute('data-drop-page');
      page.innerHTML='<div class="svg-page-inner"><img class="svg-page-artwork" alt="'+html(screen.svg.originalName||'SVG')+'" src="'+html(svgDataUrl(screen.svg.source))+'"></div>';
    });
  }

  function textEditor(item){
    const fontValue=String(item.fontSize||'16').replace(/[^0-9.]/g,'')||'16';
    return '<div class="svg-editor-item">'+
      '<div class="svg-editor-head"><strong>'+html(item.label||'Tekst')+'</strong><span>TEKST</span></div>'+
      '<label>Treść</label><textarea data-svg-text="'+item.id+'">'+html(item.text||'')+'</textarea>'+
      '<div class="svg-editor-row"><div><label>Kolor</label><input data-svg-fill="'+item.id+'" value="'+html(item.fill||'#1D1E3C')+'"></div>'+
      '<div><label>Rozmiar</label><input data-svg-font-size="'+item.id+'" type="number" min="4" max="240" step="1" value="'+html(fontValue)+'"></div></div>'+
      '</div>';
  }

  function imageEditor(item){
    const preview=item.href&&/^data:image\//i.test(item.href)
      ?'<img class="svg-editor-image-preview" src="'+html(item.href)+'" alt="">'
      :'<div class="svg-editor-image-empty">Obraz jest pusty albo był linkowany zewnętrznie. Wgraj plik, aby go osadzić.</div>';
    return '<div class="svg-editor-item">'+
      '<div class="svg-editor-head"><strong>'+html(item.label||'Obraz')+'</strong><span>OBRAZ</span></div>'+
      preview+
      '<label>Podmień obraz</label><input data-svg-image="'+item.id+'" type="file" accept="image/*">'+
      '</div>';
  }

  function shapeEditor(item){
    return '<div class="svg-editor-item">'+
      '<div class="svg-editor-head"><strong>'+html(item.label||'Kształt')+'</strong><span>'+html(String(item.tag||'shape').toUpperCase())+'</span></div>'+
      '<div class="svg-editor-row"><div><label>Fill</label><input data-svg-fill="'+item.id+'" value="'+html(item.fill||'none')+'"></div>'+
      '<div><label>Stroke</label><input data-svg-stroke="'+item.id+'" value="'+html(item.stroke||'none')+'"></div></div>'+
      '</div>';
  }

  function renderSvgEditor(){
    const screen=currentSvgScreen();
    if(!screen){
      originalRenderEditor();
      return;
    }

    const items=screen.svg.elements||[];
    const editor=document.getElementById('editor');
    const body=items.map(function(item){
      if(item.type==='text') return textEditor(item);
      if(item.type==='image') return imageEditor(item);
      return shapeEditor(item);
    }).join('');

    const textItems=items.filter(function(item){return item.type==='text';});
    const editNotice=textItems.length
      ?'<div class="svg-editor-help">Tekst jest edytowalny poniżej. Zmiana pojawia się od razu w podglądzie.</div>'
      :'<div class="svg-editor-warning"><strong>Brak edytowalnego tekstu.</strong> Ten SVG wygląda tak, jakby Illustrator zamienił litery na krzywe. Wyeksportuj SVG ponownie z opcją czcionki <strong>SVG</strong>, a nie „Konwertuj na kontury”.</div>';

    editor.innerHTML=
      '<div class="svg-editor-banner"><strong>Edytowalny SVG</strong><span>'+html(screen.svg.originalName||'SVG')+' · docelowo '+state.w+' × '+state.h+' px</span></div>'+
      editNotice+
      (items.length?body:'<div class="brand-note">Nie znaleziono obsługiwanych elementów do edycji. Sam wygląd SVG nadal zostaje zachowany.</div>');

    editor.querySelectorAll('[data-svg-text]').forEach(function(input){
      input.oninput=function(){
        const item=descriptor(screen,input.dataset.svgText);
        if(!item) return;
        item.text=input.value;
        updateSvgNode(screen,item.id,function(node){node.textContent=input.value;});
        renderSvgPreview();
      };
    });

    editor.querySelectorAll('[data-svg-fill]').forEach(function(input){
      input.oninput=function(){
        const item=descriptor(screen,input.dataset.svgFill);
        if(!item) return;
        item.fill=input.value;
        updateSvgNode(screen,item.id,function(node){setPresentation(node,'fill',input.value);});
        renderSvgPreview();
      };
    });

    editor.querySelectorAll('[data-svg-stroke]').forEach(function(input){
      input.oninput=function(){
        const item=descriptor(screen,input.dataset.svgStroke);
        if(!item) return;
        item.stroke=input.value;
        updateSvgNode(screen,item.id,function(node){setPresentation(node,'stroke',input.value);});
        renderSvgPreview();
      };
    });

    editor.querySelectorAll('[data-svg-font-size]').forEach(function(input){
      input.oninput=function(){
        const item=descriptor(screen,input.dataset.svgFontSize);
        if(!item) return;
        const value=Math.max(4,Math.min(240,Number(input.value)||16));
        item.fontSize=String(value);
        updateSvgNode(screen,item.id,function(node){setPresentation(node,'font-size',String(value));});
        renderSvgPreview();
      };
    });

    editor.querySelectorAll('[data-svg-image]').forEach(function(input){
      input.onchange=async function(){
        const file=input.files&&input.files[0];
        if(!file) return;
        const item=descriptor(screen,input.dataset.svgImage);
        if(!item) return;
        const url=await readFileAsDataUrl(file);
        item.href=url;
        updateSvgNode(screen,item.id,function(node){
          node.setAttribute('href',url);
          node.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',url);
        });
        renderSvgEditor();
        renderSvgPreview();
      };
    });
  }

  renderPreview=renderSvgPreview;
  renderEditor=renderSvgEditor;

  fileInput.addEventListener('change',async function(){
    const files=fileInput.files;
    if(!files||!files.length) return;
    try{
      if(!confirm('Zaimportować '+files.length+' '+(files.length===1?'plik SVG':'pliki SVG')+' jako nowy edytowalny projekt?\n\nKażdy plik stanie się osobną stroną. Bieżące strony projektu zostaną zastąpione.')) return;
      setStatus('Czytam SVG…','');
      await importSvgFiles(files);
    }catch(error){
      console.error(error);
      setStatus(error.message||'Nie udało się zaimportować SVG.','err');
    }finally{
      fileInput.value='';
    }
  });

  const demoSvg='<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844">'+
    '<rect id="background" width="390" height="844" fill="#F5F6FA"/>'+
    '<rect id="patient_band" x="0" y="0" width="390" height="170" fill="#F2CFBD"/>'+
    '<circle id="accent" cx="332" cy="74" r="34" fill="#D9A081"/>'+
    '<text id="eyebrow" x="32" y="62" font-family="Libre Franklin, Arial" font-size="14" font-weight="700" fill="#3F506E">DOCTOR.ONE · PATIENT</text>'+
    '<text id="title" x="32" y="108" font-family="Libre Franklin, Arial" font-size="28" font-weight="800" fill="#1D1E3C">Tytuł materiału</text>'+
    '<text id="intro" x="32" y="220" font-family="Libre Franklin, Arial" font-size="15" font-weight="700" fill="#1D1E3C">Edytuj mnie w panelu po lewej</text>'+
    '<text id="body" x="32" y="252" font-family="Libre Franklin, Arial" font-size="12" fill="#3F506E">To jest przykładowy tekst zaimportowany z SVG.</text>'+
    '<rect id="important_box" x="32" y="300" width="326" height="104" rx="18" fill="#E6EAFF"/>'+
    '<text id="box_title" x="52" y="338" font-family="Libre Franklin, Arial" font-size="15" font-weight="700" fill="#1D1E3C">Ważne</text>'+
    '<text id="box_body" x="52" y="368" font-family="Libre Franklin, Arial" font-size="12" fill="#3F506E">Kolor boxu też możesz zmienić.</text>'+
    '<rect id="photo_placeholder" x="32" y="448" width="326" height="220" rx="18" fill="#FFFFFF" stroke="#ACB8E9" stroke-width="2"/>'+
    '<image id="photo" x="32" y="448" width="326" height="220" href="" preserveAspectRatio="xMidYMid slice"/>'+
    '<text id="photo_hint" x="86" y="566" font-family="Libre Franklin, Arial" font-size="12" fill="#3F506E">Tutaj możesz podmienić obraz</text>'+
    '<text id="footer" x="32" y="784" font-family="Libre Franklin, Arial" font-size="11" fill="#3F506E">SVG → generator → edycja → PDF</text>'+
    '</svg>';

  demoButton.addEventListener('click',function(){
    if(!confirm('Wczytać demo SVG jako nowy projekt?\n\nBieżące strony projektu zostaną zastąpione.')) return;
    try{
      importSvgSource(demoSvg,'demo-doctor-one.svg');
    }catch(error){
      console.error(error);
      setStatus(error.message||'Nie udało się wczytać demo.','err');
    }
  });

  window.DoctorOneSvgImport={
    importSource:importSvgSource,
    importFiles:importSvgFiles,
    parse:parseSvg
  };
})();