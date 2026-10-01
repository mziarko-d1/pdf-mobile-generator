(function(){
  const urlInput=document.getElementById('articleImportUrl');
  const pdfInput=document.getElementById('articleImportPdf');
  const templateSelect=document.getElementById('articleImportTemplate');
  const button=document.getElementById('fillTemplateFromContent');
  const status=document.getElementById('contentImportStatus');
  if(!urlInput||!pdfInput||!templateSelect||!button||!status) return;

  const roleByTemplate={
    'patient-article':'patient',
    'hcp-article':'hcp',
    'product-article':'product'
  };

  function setStatus(message,type){
    status.className='status'+(type?' '+type:'');
    status.textContent=message||'';
  }
  function syncButton(){
    button.disabled=false;
    button.className='primary full';
  }
  urlInput.addEventListener('input',syncButton);
  pdfInput.addEventListener('change',syncButton);
  syncButton();
  setStatus('Importer gotowy. Wklej URL albo wybierz PDF.','ok');

  function cleanInline(text){
    return String(text||'')
      .replace(/!\[[^\]]*\]\([^)]+\)/g,'')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1')
      .replace(/\*\*([^*]+)\*\*/g,'$1')
      .replace(/__([^_]+)__/g,'$1')
      .replace(/<[^>]+>/g,'')
      .replace(/[ \t]+/g,' ')
      .trim();
  }
  function isDateMeta(line){
    return /^(publikacja|aktualizacja|published|updated)\s*:/i.test(line.trim());
  }
  function isNoiseLine(line){
    const t=line.trim();
    return !t || /^(spis treści|table of contents|tab\d*|sugerowane)$/i.test(t);
  }
  function isNoiseHeading(title){
    return /^(chcesz zrobić kolejny krok\??|mogą cię zainteresować|może cię zainteresować|powiązane artykuły|related articles|kontakt|o autorze)$/i.test(title.trim());
  }
  function isReferenceHeading(title){
    return /^(źródła|zrodla|references|bibliografia)$/i.test(title.trim());
  }
  function isMaterialCode(text){
    return /^[A-Z]{2}\d{2}[A-Z]{2}\d{4,}$/.test(text.trim());
  }
  function imageFromLine(line){
    const m=String(line||'').match(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/);
    return m?{alt:cleanInline(m[1])||'Obrazek',src:m[2]}:null;
  }
  function makeTextBlock(type,title,body){
    const b=newBlock(type||'paragraph');
    b.type=type||'paragraph';
    b.title=title||'';
    b.body=body||'';
    b.semanticRole='inherit';
    return b;
  }
  function makeImageBlock(image){
    return {id:uid('b'),type:'image',src:image.src,alt:image.alt||'Obrazek',width:100,semanticRole:'inherit'};
  }

  function parseReaderMarkdown(raw){
    let text=String(raw||'').replace(/\r/g,'');
    const marker=text.match(/^Markdown Content:\s*$/im);
    if(marker) text=text.slice(marker.index+marker[0].length);
    const lines=text.split('\n');

    let title='';
    let introBlocks=[];
    let sections=[];
    let current=null;
    let pendingTitle='';
    let para=[];
    let sourceMode=false;
    let finalCode='';

    function targetBlocks(){
      if(current) return current.blocks;
      return introBlocks;
    }
    function flushPara(){
      const body=cleanInline(para.join(' '));
      para=[];
      if(!body) return;
      targetBlocks().push(makeTextBlock('paragraph',pendingTitle,body));
      pendingTitle='';
    }
    function pushList(type,items){
      if(!items.length) return;
      targetBlocks().push(makeTextBlock(type,pendingTitle,items.map(cleanInline).filter(Boolean).join('\n')));
      pendingTitle='';
    }
    function startSection(sectionTitle){
      flushPara();
      if(current) sections.push(current);
      current={title:cleanInline(sectionTitle)||'Treść',blocks:[]};
    }

    for(let i=0;i<lines.length;i++){
      const rawLine=lines[i];
      const trimmed=rawLine.trim();
      if(/^(Title|URL Source|Published Time|Markdown Content):/i.test(trimmed)) continue;
      if(isDateMeta(trimmed)||isNoiseLine(trimmed)) continue;

      const h1=trimmed.match(/^#\s+(.+)$/);
      if(h1){
        flushPara();
        if(!title) title=cleanInline(h1[1]);
        continue;
      }
      const h2=trimmed.match(/^##\s+(.+)$/);
      if(h2){
        const heading=cleanInline(h2[1]);
        if(sourceMode && !isReferenceHeading(heading)) break;
        if(isNoiseHeading(heading)) break;
        sourceMode=isReferenceHeading(heading);
        startSection(heading);
        continue;
      }
      const h3=trimmed.match(/^###\s+(.+)$/);
      if(h3){
        flushPara();
        pendingTitle=cleanInline(h3[1]);
        continue;
      }

      if(sourceMode && isMaterialCode(trimmed)){
        flushPara();
        finalCode=trimmed;
        continue;
      }

      const image=imageFromLine(trimmed);
      if(image){
        flushPara();
        targetBlocks().push(makeImageBlock(image));
        continue;
      }

      const bullet=trimmed.match(/^[-*+]\s+(.+)$/);
      if(bullet){
        flushPara();
        const items=[bullet[1]];
        while(i+1<lines.length){
          const n=lines[i+1].trim().match(/^[-*+]\s+(.+)$/);
          if(!n) break;
          items.push(n[1]); i++;
        }
        pushList('bullets',items);
        continue;
      }

      const numbered=trimmed.match(/^\d+[.)]\s+(.+)$/);
      if(numbered){
        flushPara();
        const items=[numbered[1]];
        while(i+1<lines.length){
          const n=lines[i+1].trim().match(/^\d+[.)]\s+(.+)$/);
          if(!n) break;
          items.push(n[1]); i++;
        }
        pushList('numbered',items);
        continue;
      }

      if(trimmed) para.push(trimmed);
      else flushPara();
    }
    flushPara();
    if(current) sections.push(current);

    if(!title){
      const meta=String(raw||'').match(/^Title:\s*(.+)$/im);
      if(meta) title=cleanInline(meta[1]);
    }
    if(!title) title='Zaimportowany materiał';

    return {title,introBlocks,sections,finalCode};
  }

  function splitLongText(text,maxChars){
    const src=String(text||'').trim();
    if(src.length<=maxChars) return [src];
    const sentences=src.split(/(?<=[.!?])\s+/);
    const chunks=[];
    let current='';
    for(const sentence of sentences){
      if(sentence.length>maxChars){
        if(current){chunks.push(current.trim());current=''}
        const words=sentence.split(/\s+/);
        let part='';
        for(const word of words){
          const next=(part?part+' ':'')+word;
          if(next.length>maxChars&&part){chunks.push(part.trim());part=word}
          else part=next;
        }
        if(part) chunks.push(part.trim());
        continue;
      }
      const next=(current?current+' ':'')+sentence;
      if(next.length>maxChars&&current){chunks.push(current.trim());current=sentence}
      else current=next;
    }
    if(current) chunks.push(current.trim());
    return chunks.filter(Boolean);
  }
  function expandBlock(block){
    if(block.type==='image') return [block];
    if(block.type==='bullets'||block.type==='numbered'){
      const items=String(block.body||'').split('\n').filter(Boolean);
      const out=[];
      let pack=[];
      let chars=0;
      for(const item of items){
        if(pack.length>=6 || (chars+item.length)>650){
          out.push(makeTextBlock(block.type,out.length?'':block.title,pack.join('\n')));
          pack=[];chars=0;
        }
        pack.push(item);chars+=item.length;
      }
      if(pack.length) out.push(makeTextBlock(block.type,out.length?'':block.title,pack.join('\n')));
      return out.length?out:[block];
    }
    const chunks=splitLongText(block.body,680);
    return chunks.map((body,index)=>makeTextBlock(block.type,index===0?block.title:'',body));
  }
  function blockWeight(block){
    if(block.type==='image') return 360;
    return (block.title||'').length*1.5+(block.body||'').length;
  }
  function makeScreen(title,blocks,role){
    return {
      id:uid('p'),
      type:'content',
      title:title||'Treść',
      intro:'',
      blocks,
      semanticStyle:role,
      semanticAuto:true
    };
  }
  function packSection(title,blocks,role){
    const expanded=blocks.flatMap(expandBlock);
    const screens=[];
    let pack=[];
    let weight=0;
    for(const block of expanded){
      const w=blockWeight(block);
      if(pack.length && weight+w>920){
        screens.push(makeScreen(screens.length?title+' · cd.':title,pack,role));
        pack=[];weight=0;
      }
      pack.push(block);weight+=w;
    }
    if(pack.length) screens.push(makeScreen(screens.length?title+' · cd.':title,pack,role));
    if(!screens.length) screens.push(makeScreen(title,[makeTextBlock('paragraph','','')],role));
    return screens;
  }
  function buildStateFromParsed(parsed,role){
    const cover=coverScreen();
    cover.heading=parsed.title;

    const screens=[cover];
    if(parsed.introBlocks.length){
      screens.push(...packSection('Wprowadzenie',parsed.introBlocks,role));
    }
    parsed.sections.forEach(section=>{
      screens.push(...packSection(section.title,section.blocks,role));
    });
    if(parsed.finalCode){
      let last=screens[screens.length-1];
      if(!last || last.type==='cover'){
        last=makeScreen('Źródła',[],role);
        screens.push(last);
      }
      const codeBlock=makeTextBlock('paragraph','',parsed.finalCode);
      const used=(last.blocks||[]).reduce((n,b)=>n+blockWeight(b),0);
      if(used>760){
        screens.push(makeScreen('Źródła · kod materiału',[codeBlock],role));
      }else{
        last.blocks.push(codeBlock);
      }
    }
    return screens;
  }

  function validatePublicUrl(value){
    let url;
    try{url=new URL(value)}catch{throw new Error('Wpisz pełny adres URL zaczynający się od https:// lub http://.')}
    if(!/^https?:$/.test(url.protocol)) throw new Error('Obsługiwane są tylko adresy http:// i https://.');
    const host=url.hostname.toLowerCase();
    const privateHost=host==='localhost'||host==='127.0.0.1'||host==='0.0.0.0'||host.endsWith('.local')||
      /^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if(privateHost) throw new Error('Importer URL obsługuje tylko publiczne strony.');
    return url.href;
  }

  async function fetchArticle(url){
    const publicUrl=validatePublicUrl(url);
    const readerUrl='https://r.jina.ai/'+publicUrl;
    const response=await fetch(readerUrl,{method:'GET',cache:'no-store'});
    if(!response.ok) throw new Error('Nie udało się pobrać artykułu ('+response.status+'). Spróbuj ponownie albo wgraj PDF.');
    const text=await response.text();
    if(text.trim().length<120) throw new Error('Artykuł zwrócił zbyt mało treści do importu.');
    return parseReaderMarkdown(text);
  }

  function cleanPdfText(text){
    return String(text||'')
      .replace(/\r/g,'')
      .split('\n')
      .map(x=>x.trim())
      .filter(x=>x&&!isDateMeta(x))
      .join('\n');
  }
  function plainBlocks(text){
    const paragraphs=cleanPdfText(text).split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
    if(!paragraphs.length) return [];
    return paragraphs.map(p=>makeTextBlock('paragraph','',p));
  }
  async function readPdf(file){
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const sections=[];
    let firstLine='';
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      const page=await pdf.getPage(pageNo);
      const content=await page.getTextContent();
      const lines=[];
      let line='';
      for(const item of content.items){
        const s=String(item.str||'').trim();
        if(!s) continue;
        line+=(line?' ':'')+s;
        if(item.hasEOL){lines.push(line);line=''}
      }
      if(line) lines.push(line);
      const cleaned=lines.filter(x=>!isDateMeta(x)).join('\n\n');
      if(pageNo===1) firstLine=lines.find(x=>x&&!isDateMeta(x))||'';
      sections.push({title:pdf.numPages>1?'Strona '+pageNo:'Treść',blocks:plainBlocks(cleaned)});
    }
    const fileTitle=file.name.replace(/\.pdf$/i,'').replace(/[_-]+/g,' ').trim();
    const title=firstLine&&firstLine.length<150?firstLine:fileTitle||'Zaimportowany PDF';
    if(sections[0]?.blocks?.[0]?.body===title) sections[0].blocks.shift();
    return {title,introBlocks:[],sections,finalCode:''};
  }

  async function runImport(){
    const file=pdfInput.files?.[0];
    const url=urlInput.value.trim();
    if(!file&&!url){
      setStatus('Wklej URL artykułu albo wybierz plik PDF.','err');
      return;
    }

    const role=roleByTemplate[templateSelect.value]||'neutral';
    if(!confirm('Wypełnić generator zaimportowaną treścią?\n\nBieżące strony projektu zostaną zastąpione.')) return;

    const oldText=button.textContent;
    button.disabled=true;
    button.textContent=file?'Czytam PDF…':'Pobieram artykuł…';
    setStatus(file?'Analizuję pełną treść PDF…':'Pobieram i oczyszczam publiczny artykuł…','');

    try{
      const parsed=file?await readPdf(file):await fetchArticle(url);
      const screens=buildStateFromParsed(parsed,role);
      if(screens.length<2) throw new Error('Nie udało się znaleźć wystarczającej treści do zbudowania materiału.');

      state.name=parsed.title||'Zaimportowany materiał';
      state.w=390;
      state.h=844;
      state.format='mobile';
      state.preset='doctor';
      state.palette={...doctorPalette};
      state.screens=screens;
      state.selected=screens[0].id;

      render();
      document.getElementById('projectName').value=state.name;
      setStatus('Gotowe: '+screens.length+' ekranów. Treść możesz dalej edytować w panelu i bezpośrednio na materiale.','ok');
      document.querySelector('.workspace')?.scrollTo({top:0,behavior:'smooth'});
    }catch(err){
      console.error(err);
      setStatus(err?.message||'Import nie powiódł się.','err');
    }finally{
      button.textContent=oldText;
      syncButton();
    }
  }

  button.addEventListener('click',runImport);
})();