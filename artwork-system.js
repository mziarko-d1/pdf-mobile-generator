(function(){
  'use strict';
  let selectedId='';
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
  function linesFor(element){
    const width=number(element.width,200,4,10000),size=number(element.fontSize,12,1,300);
    measure.font=size+'px '+fontFamily(element);
    const out=[];
    for(const paragraph of String(element.text||'').split('\n')){
      if(element.fit){out.push(paragraph);continue;}
      let line='';
      for(const word of paragraph.split(/(\s+)/)){
        if(line&&measure.measureText(line+word).width>width){out.push(line.trimEnd());line=word.trimStart();}
        else line+=word;
      }
      out.push(line);
    }
    return out;
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
      if(element.kind==='image'){
        const src=imageData(element.src);
        if(src) body+='<image x="'+x+'" y="'+y+'" width="'+number(element.width,100,1)+'" height="'+number(element.height,100,1)+'" href="'+src+'"/>';
        continue;
      }
      const size=number(element.fontSize,12,1,300),lines=linesFor(element),font=fonts[element.font];
      const spans=lines.map((line,i)=>'<tspan x="'+x+'" y="'+(y+i*size*number(element.lineHeight,1.5,.5,5))+'"'+(element.fit&&line?' textLength="'+number(element.width,100,1)+'" lengthAdjust="spacingAndGlyphs"':'')+'>'+glyphMarkup(line,font)+'</tspan>').join('');
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
    basePreview();ensureFonts();
    document.querySelectorAll('.artwork-page').forEach(node=>{
      const page=state.screens.find(p=>p.id===node.dataset.selectPage),art=page.artwork;
      const sx=state.w/art.width,sy=state.h/art.height;
      node.querySelector('.artwork-hit-layer').innerHTML=art.elements.map(element=>{
        const fs=number(element.fontSize,12,1,300),height=element.kind==='image'?number(element.height,100,1):Math.max(fs*1.3,linesFor(element).length*fs*number(element.lineHeight,1.5,.5,5));
        return '<button type="button" class="artwork-hit '+(selectedId===element.id&&state.selected===page.id?'is-selected':'')+'" data-artwork-id="'+escapeXml(element.id)+'" aria-label="Edytuj: '+escapeXml((element.text||'Obrazek').slice(0,90))+'" style="left:'+(number(element.x)*sx)+'px;top:'+((number(element.y)-(element.kind==='image'?0:fs))*sy)+'px;width:'+(number(element.width,100,1)*sx)+'px;height:'+(height*sy)+'px"></button>';
      }).join('');
      node.querySelectorAll('.artwork-hit').forEach(hit=>{
        hit.onclick=e=>{e.stopPropagation();state.selected=page.id;selectedId=hit.dataset.artworkId;renderScreenList();renderEditor();renderPreview();};
        hit.ondragstart=e=>{e.preventDefault();e.stopPropagation();};
      });
    });
  };
  const baseEditor=renderEditor;
  renderEditor=function(){
    const page=current();
    if(!page?.artwork) return baseEditor();
    const fields=page.artwork.elements||[];
    if(!selected(page)) selectedId=fields[0]?.id||'';
    const el=selected(page);
    $('editor').innerHTML='<div class="brand-note">Teksty są edytowalne. Ilustracje, logo i dekoracje oryginału pozostają w tle. Kliknij tekst na stronie albo wybierz go poniżej. Zmiana długiego tekstu może wymagać korekty szerokości lub rozmiaru.</div><label>Element</label><select id="artworkSelect">'+fields.map((e,i)=>'<option value="'+escapeXml(e.id)+'" '+(e.id===selectedId?'selected':'')+'>'+(i+1)+'. '+escapeXml((e.text||'Obrazek').slice(0,80))+'</option>').join('')+'</select><div class="actions"><button type="button" id="artworkAddText" class="mini secondary">+ Tekst</button><button type="button" id="artworkDelete" class="mini danger" '+(!el?'disabled':'')+'>Usuń element</button></div><label>Dodaj obrazek</label><input type="file" id="artworkImage" accept="image/png,image/jpeg,image/webp">'+(el?'<label>'+(el.kind==='image'?'Opis obrazka':'Treść')+'</label><textarea id="artworkText">'+escapeXml(el.text||'')+'</textarea><div class="artwork-controls">'+[['x','X'],['y','Y'],['width','Szerokość'],...(el.kind==='image'?[['height','Wysokość']]:[['fontSize','Rozmiar tekstu'],['lineHeight','Interlinia']])].map(([key,label])=>'<label>'+label+'<input type="number" step="0.1" data-artwork-key="'+key+'" value="'+number(el[key],key==='lineHeight'?1.5:0)+'"></label>').join('')+'</div>'+(el.kind==='image'?'':'<label>Kolor tekstu <input type="color" id="artworkColor" value="'+color(el.color)+'"></label><label><input type="checkbox" id="artworkFit" '+(el.fit?'checked':'')+'> Zachowaj szerokość oryginalnego wiersza</label>'):'');
    $('artworkSelect').onchange=e=>{selectedId=e.target.value;renderEditor();renderPreview();};
    $('artworkAddText').onclick=()=>{checkpoint();const field={id:uid('art'),kind:'text',text:'Nowy tekst',x:32,y:60,width:300,fontSize:14,lineHeight:1.5,color:'#1d1e3c',fit:false};fields.push(field);selectedId=field.id;renderEditor();renderPreview();};
    $('artworkDelete').onclick=()=>{checkpoint();page.artwork.elements=fields.filter(e=>e.id!==selectedId);selectedId='';renderEditor();renderPreview();};
    $('artworkImage').onchange=async e=>{
      const file=e.target.files?.[0];if(!file) return;
      const src=await readImageFile(file);
      if(!imageData(src)||!state.screens.includes(page)) return;
      checkpoint();const field={id:uid('art'),kind:'image',src,text:file.name,x:32,y:60,width:150,height:150};fields.push(field);selectedId=field.id;renderEditor();renderPreview();
    };
    if(!el) return;
    $('artworkText').onbeforeinput=checkpoint;
    $('artworkText').oninput=e=>{el.text=e.target.value;el.fit=false;if($('artworkFit'))$('artworkFit').checked=false;renderPreview();};
    document.querySelectorAll('[data-artwork-key]').forEach(input=>{
      input.onfocus=checkpoint;
      input.oninput=()=>{el[input.dataset.artworkKey]=number(input.value);if(input.dataset.artworkKey==='fontSize') el.fit=false;renderPreview();};
    });
    if($('artworkColor'))$('artworkColor').oninput=e=>{checkpoint();el.color=e.target.value;renderPreview();};
    if($('artworkFit'))$('artworkFit').onchange=e=>{checkpoint();el.fit=e.target.checked;renderPreview();};
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
        screens.push({id:uid('p'),type:'artwork',title:'Strona '+pageNo,blocks:[],artwork:{version:1,width:viewport.width,height:viewport.height,background:canvas.toDataURL('image/png'),elements}});
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
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('.artwork-sheet')].map(image=>image.decode()));
    return baseMakePdf();
  };
  window.PdfArtwork={pageHtml,svgFor,importFile};
  render();
})();
