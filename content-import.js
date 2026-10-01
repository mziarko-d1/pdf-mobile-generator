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
    return /^(publikacja|aktualizacja|published|updated)\s*:/i.test(String(line||'').trim());
  }
  function isReferenceHeading(title){
    return /^(źródła|zrodla|references|bibliografia)$/i.test(String(title||'').trim());
  }
  function isStopHeading(title){
    return /^(chcesz zrobić kolejny krok\??|mogą cię zainteresować|może cię zainteresować|powiązane artykuły|related articles|kontakt|o autorze)$/i.test(String(title||'').trim());
  }
  function isNoise(text){
    return /^(spis treści|table of contents|tab\d*|sugerowane)$/i.test(String(text||'').trim());
  }
  function isMaterialCode(text){
    return /^[A-Z]{2}\d{2}[A-Z]{2}\d{4,}$/.test(String(text||'').trim());
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
    return {
      id:uid('b'),
      type:'image',
      src:image.src,
      alt:image.alt||'Obrazek',
      width:90,
      semanticRole:'inherit'
    };
  }
  function makeScreen(title,blocks,role,groupKey,continued){
    return {
      id:uid('p'),
      type:'content',
      title:(title||'Treść')+(continued?' · cd.':''),
      intro:'',
      blocks:blocks||[],
      semanticStyle:role,
      semanticAuto:true,
      importGroup:groupKey||uid('group'),
      importBaseTitle:title||'Treść'
    };
  }

  function parseReaderMarkdown(raw){
    let text=String(raw||'').replace(/\r/g,'');
    const marker=text.match(/^Markdown Content:\s*$/im);
    if(marker) text=text.slice(marker.index+marker[0].length);
    const lines=text.split('\n');

    let title='';
    let started=false;
    let sourceMode=false;
    let finalCode='';
    let current=null;
    let paragraph=[];
    let pendingTitle='';
    const groups=[];

    function ensureCurrent(){
      if(!current) current={heading:'Wprowadzenie',kind:'intro',blocks:[]};
      return current;
    }
    function flushParagraph(){
      const body=cleanInline(paragraph.join(' '));
      paragraph=[];
      if(!body) return;
      ensureCurrent().blocks.push(makeTextBlock('paragraph',pendingTitle,body));
      pendingTitle='';
    }
    function pushCurrent(){
      flushParagraph();
      if(current&&current.blocks.length) groups.push(current);
      current=null;
    }
    function startSection(heading,kind){
      current={heading:cleanInline(heading)||'Treść',kind:kind||'section',blocks:[]};
      pendingTitle='';
      paragraph=[];
    }
    function pushList(type,items){
      flushParagraph();
      const body=items.map(cleanInline).filter(Boolean).join('\n');
      if(body) ensureCurrent().blocks.push(makeTextBlock(type,pendingTitle,body));
      pendingTitle='';
    }

    for(let i=0;i<lines.length;i++){
      const rawLine=lines[i];
      const trimmed=rawLine.trim();

      if(/^(Title|URL Source|Published Time|Markdown Content):/i.test(trimmed)) continue;

      const h1=trimmed.match(/^#\s+(.+)$/);
      if(!started){
        if(!h1) continue;
        title=cleanInline(h1[1]);
        started=true;
        startSection('Wprowadzenie','intro');
        continue;
      }

      if(h1) continue;
      if(!trimmed){
        flushParagraph();
        continue;
      }
      if(isDateMeta(trimmed)||isNoise(trimmed)) continue;

      const h2=trimmed.match(/^##\s+(.+)$/);
      if(h2){
        const heading=cleanInline(h2[1]);
        if(isStopHeading(heading)) break;
        pushCurrent();
        sourceMode=isReferenceHeading(heading);
        startSection(heading,sourceMode?'sources':'section');
        continue;
      }

      const h3=trimmed.match(/^###\s+(.+)$/);
      if(h3){
        flushParagraph();
        pendingTitle=cleanInline(h3[1]);
        continue;
      }

      if(sourceMode&&isMaterialCode(trimmed)){
        flushParagraph();
        finalCode=trimmed;
        continue;
      }

      const image=imageFromLine(trimmed);
      if(image){
        flushParagraph();
        ensureCurrent().blocks.push(makeImageBlock(image));
        continue;
      }

      const bullet=trimmed.match(/^[-*+]\s+(.+)$/);
      if(bullet){
        const items=[bullet[1]];
        while(i+1<lines.length){
          const n=lines[i+1].trim().match(/^[-*+]\s+(.+)$/);
          if(!n) break;
          items.push(n[1]);
          i++;
        }
        pushList('bullets',items);
        continue;
      }

      const numbered=trimmed.match(/^\d+[.)]\s+(.+)$/);
      if(numbered){
        const items=[numbered[1]];
        while(i+1<lines.length){
          const n=lines[i+1].trim().match(/^\d+[.)]\s+(.+)$/);
          if(!n) break;
          items.push(n[1]);
          i++;
        }
        pushList('numbered',items);
        continue;
      }

      paragraph.push(trimmed);
    }

    pushCurrent();

    if(!title){
      const meta=String(raw||'').match(/^Title:\s*(.+)$/im);
      if(meta) title=cleanInline(meta[1]);
    }
    if(!title) title='Zaimportowany materiał';

    return {title:title,groups:groups,finalCode:finalCode};
  }

  function splitParagraph(text,maxChars){
    const src=String(text||'').trim();
    if(!src) return [];
    if(src.length<=maxChars) return [src];

    const sentences=src.split(/(?<=[.!?])\s+/);
    const chunks=[];
    let current='';

    sentences.forEach(function(sentence){
      const next=(current?current+' ':'')+sentence;
      if(next.length>maxChars&&current){
        chunks.push(current.trim());
        current=sentence;
      }else{
        current=next;
      }
    });
    if(current) chunks.push(current.trim());

    const safe=[];
    chunks.forEach(function(chunk){
      if(chunk.length<=maxChars*1.25){
        safe.push(chunk);
        return;
      }
      const words=chunk.split(/\s+/);
      let part='';
      words.forEach(function(word){
        const next=(part?part+' ':'')+word;
        if(next.length>maxChars&&part){
          safe.push(part.trim());
          part=word;
        }else{
          part=next;
        }
      });
      if(part) safe.push(part.trim());
    });

    return safe.filter(Boolean);
  }

  function expandBlock(block){
    if(!block) return [];
    if(block.type==='image') return [block];

    if(block.type==='bullets'||block.type==='numbered'){
      const items=String(block.body||'').split('\n').map(function(x){return x.trim();}).filter(Boolean);
      if(items.length<=7) return [block];

      const out=[];
      for(let i=0;i<items.length;i+=7){
        out.push(makeTextBlock(block.type,i===0?block.title:'',items.slice(i,i+7).join('\n')));
      }
      return out;
    }

    const chunks=splitParagraph(block.body,900);
    if(chunks.length<=1) return [block];
    return chunks.map(function(body,index){
      return makeTextBlock(block.type,index===0?block.title:'',body);
    });
  }

  function nextFrame(){
    return new Promise(function(resolve){
      requestAnimationFrame(function(){
        requestAnimationFrame(resolve);
      });
    });
  }

  async function waitForPageImages(page){
    if(!page) return;
    const images=[].slice.call(page.querySelectorAll('img'));
    if(!images.length) return;
    await Promise.race([
      Promise.all(images.map(function(img){
        if(img.complete) return Promise.resolve();
        return new Promise(function(resolve){
          img.addEventListener('load',resolve,{once:true});
          img.addEventListener('error',resolve,{once:true});
        });
      })),
      new Promise(function(resolve){setTimeout(resolve,1200);})
    ]);
  }

  function pageFits(screen){
    const page=document.querySelector('[data-select-page="'+screen.id+'"]');
    const inner=page&&page.querySelector('.page-inner');
    if(!inner) return true;
    return inner.scrollHeight<=inner.clientHeight+4;
  }

  async function renderAndMeasure(screen){
    render();
    await nextFrame();
    const page=document.querySelector('[data-select-page="'+screen.id+'"]');
    await waitForPageImages(page);
    await nextFrame();
    return pageFits(screen);
  }

  async function buildScreensToFit(parsed,role){
    const cover=coverScreen();
    cover.heading=parsed.title;

    const screens=[cover];
    state.screens=screens;
    state.selected=cover.id;

    for(let groupIndex=0;groupIndex<parsed.groups.length;groupIndex++){
      const group=parsed.groups[groupIndex];
      const groupKey='import_'+groupIndex+'_'+Date.now();
      const pieces=[];

      (group.blocks||[]).forEach(function(block){
        expandBlock(block).forEach(function(piece){pieces.push(piece);});
      });
      if(!pieces.length) continue;

      let current=makeScreen(group.heading,[],role,groupKey,false);
      screens.push(current);
      state.screens=screens;

      for(let pieceIndex=0;pieceIndex<pieces.length;pieceIndex++){
        const piece=pieces[pieceIndex];
        current.blocks.push(piece);
        state.selected=current.id;

        const fits=await renderAndMeasure(current);
        if(fits) continue;

        current.blocks.pop();

        if(!current.blocks.length){
          current.blocks.push(piece);
          continue;
        }

        const continued=screens.some(function(s){return s.importGroup===groupKey&&s!==current;});
        current=makeScreen(group.heading,[piece],role,groupKey,true||continued);
        screens.push(current);
        state.screens=screens;
        state.selected=current.id;
        await renderAndMeasure(current);
      }
    }

    if(parsed.finalCode){
      let target=screens[screens.length-1];
      if(!target||target.type==='cover'){
        target=makeScreen('Źródła',[],role,'sources_code',false);
        screens.push(target);
      }

      const codeBlock=makeTextBlock('paragraph','',parsed.finalCode);
      target.blocks.push(codeBlock);
      state.screens=screens;
      state.selected=target.id;

      if(!(await renderAndMeasure(target))){
        target.blocks.pop();
        const codeScreen=makeScreen('Źródła',[codeBlock],role,'sources_code',true);
        screens.push(codeScreen);
      }
    }

    state.screens=screens;
    state.selected=cover.id;
    render();
    await nextFrame();
    return screens;
  }

  function validatePublicUrl(value){
    let url;
    try{url=new URL(value);}
    catch(e){throw new Error('Wpisz pełny adres URL zaczynający się od https:// lub http://.');}

    if(!/^https?:$/.test(url.protocol)) throw new Error('Obsługiwane są tylko adresy http:// i https://.');

    const host=url.hostname.toLowerCase();
    const privateHost=
      host==='localhost'||
      host==='127.0.0.1'||
      host==='0.0.0.0'||
      host.endsWith('.local')||
      /^10\./.test(host)||
      /^192\.168\./.test(host)||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);

    if(privateHost) throw new Error('Importer URL obsługuje tylko publiczne strony.');
    return url.href;
  }

  async function fetchArticle(url){
    const publicUrl=validatePublicUrl(url);
    const readerUrl='https://r.jina.ai/'+publicUrl;
    const response=await fetch(readerUrl,{method:'GET',cache:'no-store'});

    if(!response.ok){
      throw new Error('Nie udało się pobrać artykułu ('+response.status+'). Spróbuj ponownie albo wgraj PDF.');
    }

    const text=await response.text();
    if(text.trim().length<120) throw new Error('Artykuł zwrócił zbyt mało treści do importu.');
    return parseReaderMarkdown(text);
  }

  function pdfBlocks(lines){
    const blocks=[];
    let paragraph=[];

    function flush(){
      const body=paragraph.join(' ').replace(/\s+/g,' ').trim();
      paragraph=[];
      if(body) blocks.push(makeTextBlock('paragraph','',body));
    }

    lines.forEach(function(line){
      const t=String(line||'').trim();
      if(!t||isDateMeta(t)){
        flush();
        return;
      }
      paragraph.push(t);
    });

    flush();
    return blocks;
  }

  async function readPdf(file){
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const groups=[];
    let firstLine='';

    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
      const page=await pdf.getPage(pageNo);
      const content=await page.getTextContent();
      const lines=[];
      let line='';

      content.items.forEach(function(item){
        const s=String(item.str||'').trim();
        if(!s) return;
        line+=(line?' ':'')+s;
        if(item.hasEOL){
          lines.push(line);
          line='';
        }
      });

      if(line) lines.push(line);

      const cleanLines=lines.filter(function(x){return x&&!isDateMeta(x);});
      if(pageNo===1) firstLine=cleanLines[0]||'';

      const blocks=pdfBlocks(cleanLines);
      if(blocks.length){
        groups.push({
          heading:pdf.numPages>1?'Strona '+pageNo:'Treść',
          kind:'pdf',
          blocks:blocks
        });
      }
    }

    const fileTitle=file.name.replace(/\.pdf$/i,'').replace(/[_-]+/g,' ').trim();
    const title=(firstLine&&firstLine.length<150)?firstLine:(fileTitle||'Zaimportowany PDF');

    if(groups[0]&&groups[0].blocks[0]&&groups[0].blocks[0].body===title){
      groups[0].blocks.shift();
    }

    return {title:title,groups:groups,finalCode:''};
  }

  async function runImport(){
    const file=pdfInput.files&&pdfInput.files[0];
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

    try{
      setStatus(file?'Czytam pełną treść PDF…':'Pobieram wyłącznie treść artykułu…','');
      const parsed=file?await readPdf(file):await fetchArticle(url);

      state.name=parsed.title||'Zaimportowany materiał';
      state.w=390;
      state.h=844;
      state.format='mobile';
      state.preset='doctor';
      state.palette={...doctorPalette};

      setStatus('Układam treść tak, aby strony były wypełnione, ale nic nie wychodziło poza ekran…','');
      const screens=await buildScreensToFit(parsed,role);

      if(screens.length<2){
        throw new Error('Nie udało się znaleźć wystarczającej treści artykułu do zbudowania materiału.');
      }

      state.selected=screens[0].id;
      render();

      document.getElementById('projectName').value=state.name;
      const contentScreens=state.screens.filter(function(s){return s.type!=='cover';}).length;
      setStatus('Gotowe: '+contentScreens+' ekranów treści + okładka. Importuję tylko artykuł, źródła i kod końcowy.','ok');

      const workspace=document.querySelector('.workspace');
      if(workspace) workspace.scrollTo({top:0,behavior:'smooth'});
    }catch(err){
      console.error(err);
      setStatus((err&&err.message)||'Import nie powiódł się.','err');
    }finally{
      button.textContent=oldText;
      button.disabled=false;
      syncButton();
    }
  }

  button.addEventListener('click',runImport);
})();