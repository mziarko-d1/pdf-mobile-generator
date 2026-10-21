const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {existsSync}=require('node:fs');
const {createServer} = require('node:http');
const {readFile,mkdir} = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

let server, browser, origin;
const root = path.resolve(__dirname, '..');
const privateFixtures=existsSync(path.join(root,'templates','onepager-sm-26.json'));
const privateOnly={skip:!privateFixtures?'Source artwork fixtures remain in the owner-private preview':false};
before(async () => {
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const content = await readFile(file);
      res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html');
      res.end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE});
});
after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

async function editor(t) {
  const context = await browser.newContext();
  t.after(() => context.close());
  // Optional offline CDN cache for restricted environments; production scripts remain unchanged.
  if (process.env.TEST_ASSET_DIR) {
    await context.route('https://cdnjs.cloudflare.com/**', async route => {
      const content = await readFile(path.join(process.env.TEST_ASSET_DIR, path.basename(new URL(route.request().url()).pathname)));
      await route.fulfill({contentType: 'text/javascript', body: content});
    });
  }
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({body: ''}));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'No uncaught browser errors'));
  await page.goto(origin);
  await page.waitForFunction(() => window.pdfMobileUndo && window.localforage && window.PDFLib && window.pdfjsLib);
  await page.waitForFunction(() => document.querySelector('#savedProjects option'));
  return page;
}
const snapshot = page => page.evaluate(() => JSON.stringify(state));
async function shortcut(page, key) {
  await page.locator('body').click({position: {x: 1, y: 1}});
  await page.keyboard.press(key);
}
async function useTemplate(page,slug='sm'){
  await page.locator('[data-use-shared-template="onepager-'+slug+'-26"]').click();
  await page.waitForFunction(()=>state.screens.every(p=>p.artwork)&&state.screens.length===2);
  await page.waitForFunction(()=>[...document.querySelectorAll('.artwork-sheet')].every(img=>img.complete&&img.naturalWidth>0));
  await page.evaluate(()=>document.fonts.ready);
  const fontStatus=await page.evaluate(async()=>Promise.all(Object.entries(state.artworkFonts).map(async([key,font])=>{
    try{await new FontFace('Probe_'+key,'url('+font.data+')').load();return {key,ok:true};}
    catch(error){return {key,ok:false,error:error.message};}
  })));
  assert.ok(fontStatus.every(f=>f.ok),JSON.stringify(fontStatus.filter(f=>!f.ok)));
}
for(const slug of ['sm','onko'])test(slug+' Illustrator template preserves two pages, editable text and embedded design',privateOnly,async t=>{
  const page=await editor(t);await useTemplate(page,slug);
  const data=await page.evaluate(()=>({count:state.screens.reduce((n,p)=>n+p.artwork.elements.length,0),fonts:Object.keys(state.artworkFonts).length,first:state.screens[0].artwork.elements.find(e=>e.text.startsWith('Pacjent kontaktuje')).text,svg:PdfArtwork.svgFor(state.screens[0])}));
  const styles=await page.evaluate(()=>{
    const fields=state.screens[0].artwork.elements;
    return {captions:fields.filter(e=>['PACJENT','KOORDYNATOR/PIELĘGNIARKA','LEKARZ PROWADZĄCY'].includes(e.text)),
      paragraph:fields.find(e=>e.text.startsWith('Pacjent kontaktuje'))};
  });
  assert.equal(styles.captions.length,3);
  assert.ok(styles.captions.every(e=>e.letterSpacing>1&&e.originalLines.length===1));
  assert.ok(styles.paragraph.originalLines.length>=4);
  assert.ok(data.count>60);assert.ok(data.fonts>=8);assert.match(data.first,/Pacjent kontaktuje/);assert.match(data.svg,/@font-face/);assert.match(data.svg,/x="[\d. -]+"/);
  await mkdir(path.join(root,'artifacts'),{recursive:true});
  await page.setViewportSize({width:1450,height:1500});
  await page.addStyleTag({content:'.workspace{height:auto!important;overflow:visible!important}.workspace-top{position:static!important}.artwork-hit{outline:0!important}'});
  for(let index=0;index<2;index++){
    await page.locator('.artwork-page').nth(index).screenshot({path:path.join(root,'artifacts','onepager-'+slug+'-'+(index+1)+'.png')});
  }
});
test('clicking an artwork text selects it; edits, position, color, deletion and Undo/Redo work',privateOnly,async t=>{
  const page=await editor(t);await useTemplate(page);
  await page.locator('.artwork-hit').first().click();
  const before=await snapshot(page);
  await page.locator('#artworkText').fill('Tekst testowy po zmianie.');
  const after=await snapshot(page);assert.notEqual(before,after);
  await shortcut(page,'Control+z');assert.equal(await snapshot(page),before);
  await shortcut(page,'Control+y');assert.equal(await snapshot(page),after);
  await page.locator('[data-artwork-key="x"]').fill('50');
  assert.equal(await page.evaluate(()=>state.screens[0].artwork.elements[0].x),50);
  await page.locator('#artworkColor').fill('#ff0000');
  assert.match(await page.evaluate(()=>PdfArtwork.svgFor(state.screens[0])),/fill="#ff0000"/);
  const count=await page.evaluate(()=>state.screens[0].artwork.elements.length);
  await page.locator('#artworkDelete').click();assert.equal(await page.evaluate(()=>state.screens[0].artwork.elements.length),count-1);
  await shortcut(page,'Control+z');assert.equal(await page.evaluate(()=>state.screens[0].artwork.elements.length),count);
});
test('artwork templates save locally as independent copies and survive editable PDF export/reopen',privateOnly,async t=>{
  const page=await editor(t);await useTemplate(page);
  await page.locator('#templateName').fill('SM edytowalny');await page.locator('#saveAsTemplate').click();
  await page.waitForFunction(()=>document.querySelector('[data-use-template]'));
  const original=await page.evaluate(()=>state.screens[0].artwork.elements[0].text);
  await page.locator('#artworkText').fill('Zmieniona kopia');
  await page.locator('[data-use-template]').first().click();
  await page.waitForFunction(text=>state.screens[0]?.artwork?.elements[0]?.text===text,original);
  await page.waitForFunction(()=>[...document.querySelectorAll('.artwork-sheet')].every(i=>i.complete));
  const result=await page.evaluate(async()=>{
    const expected=JSON.stringify(state),bytes=await makeEditablePdf(),doc=await PDFLib.PDFDocument.load(bytes);
    const count=doc.getPageCount();state=initialState();render();
    const ok=await openProjectPdfBytes(bytes.slice().buffer);
    return {count,ok,match:JSON.stringify(state)===expected};
  });
  assert.equal(result.count,2);assert.equal(result.ok,true);assert.equal(result.match,true);
});
test('PDF-compatible AI upload creates separate editable text without duplicating it in background',async t=>{
  const page=await editor(t);
  const bytes=await page.evaluate(async()=>{
    const doc=await PDFLib.PDFDocument.create(),p=doc.addPage([400,600]);
    p.drawRectangle({x:0,y:0,width:400,height:600,color:PDFLib.rgb(.8,.9,1)});
    p.drawText('Editable title',{x:40,y:500,size:24,color:PDFLib.rgb(.8,0,0)});
    return Array.from(await doc.save());
  });
  await page.locator('#pdfImportMode').selectOption('layout');
  await page.locator('#openDocument').setInputFiles({name:'sample.ai',mimeType:'application/postscript',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>document.getElementById('importStatus').textContent.startsWith('Zaimportowano'));
  assert.equal(await page.evaluate(()=>state.screens[0].artwork.elements[0].text),'Editable title');
  const b=await page.evaluate(async()=>{
    const img=new Image();img.src=state.screens[0].artwork.background;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    const px=ctx.getImageData(70,150,650,100).data;let red=0;for(let i=0;i<px.length;i+=4)if(px[i]>150&&px[i+1]<80&&px[i+2]<80)red++;return red;
  });
  assert.equal(b,0,'Original text must not remain underneath the editable text');
  assert.match(await page.evaluate(()=>state.screens[0].artwork.elements[0].color),/^#/);
});
test('non-PDF native AI is rejected without modifying the current document',async t=>{
  const page=await editor(t),before=await snapshot(page);
  await page.locator('#openDocument').setInputFiles({name:'legacy.ai',mimeType:'application/postscript',buffer:Buffer.from('%!PS-Adobe-3.0')});
  await page.waitForFunction(()=>document.getElementById('importStatus').textContent.includes('nie zawiera warstwy PDF'));
  assert.equal(await snapshot(page),before);
});
test('artwork SVG escapes text and ignores untrusted image URLs; article fill preserves fixed artwork',privateOnly,async t=>{
  const page=await editor(t);await useTemplate(page);
  const result=await page.evaluate(()=>{
    const p=state.screens[0];p.artwork.elements[0].text='<script>alert(1)</script>';
    p.artwork.elements.push({id:'image',kind:'image',src:'https://example.com/track.png'});
    return PdfArtwork.svgFor(p);
  });
  assert.ok(result.includes('&lt;script&gt;'));assert.ok(!result.includes('https://example.com/track.png'));
  const before=await snapshot(page);
  await page.locator('#articleImportUrl').fill('https://example.com/article');await page.locator('#fillTemplateFromContent').click();
  assert.match(await page.locator('#contentImportStatus').textContent(),/stały układ/);assert.equal(await snapshot(page),before);
});

test('synthetic fixed layout supports editing, independent template copies and editable PDF round trip',async t=>{
  const page=await editor(t);
  await page.evaluate(()=>{
    state={...initialState(),w:400,h:600,format:'custom',screens:[{id:'synthetic',type:'artwork',title:'Synthetic',blocks:[],artwork:{version:1,width:400,height:600,background:'',elements:[{id:'text',kind:'text',text:'Example text',x:30,y:70,width:250,fontSize:16,color:'#1d1e3c',fit:false,lineHeight:1.5}]}}],selected:'synthetic',artworkFonts:{}};
    render();
  });
  await page.locator('.artwork-hit').click();const before=await snapshot(page);
  await page.locator('#artworkText').fill('Changed text');const after=await snapshot(page);
  await shortcut(page,'Control+z');assert.equal(await snapshot(page),before);
  await shortcut(page,'Control+y');assert.equal(await snapshot(page),after);
  await page.locator('#templateName').fill('Synthetic layout');await page.locator('#saveAsTemplate').click();
  await page.waitForFunction(()=>document.querySelector('[data-use-template]'));
  await page.locator('#artworkText').fill('Later change');await page.locator('[data-use-template]').first().click();
  await page.waitForFunction(()=>state.screens[0].artwork.elements[0].text==='Changed text');
  const result=await page.evaluate(async()=>{
    const expected=JSON.stringify(state),bytes=await makeEditablePdf();state=initialState();render();
    return await openProjectPdfBytes(bytes.slice().buffer)&&JSON.stringify(state)===expected;
  });assert.equal(result,true);
});

test('paragraph block editing, tracking and whole-button links survive PDF export and Undo/Redo',async t=>{
 const page=await editor(t);
 await page.evaluate(()=>{
   const lines=[{id:'a',kind:'text',text:'First line of a paragraph',x:30,y:60,width:220,fontSize:14,color:'#1d1e3c',font:'',fit:true},{id:'b',kind:'text',text:'and its second line.',x:30,y:82,width:220,fontSize:14,color:'#1d1e3c',font:'',fit:true}];
   const elements=ArtworkLayout.groupElements(lines);
   elements.push({id:'caps',kind:'text',text:'EXAMPLE LABEL',x:30,y:150,width:250,fontSize:10,letterSpacing:2,color:'#1d1e3c',fit:false});
   state={...initialState(),w:400,h:600,format:'custom',screens:[{id:'test',type:'artwork',title:'Test',blocks:[],artwork:{version:2,width:400,height:600,background:'',elements}}],selected:'test',artworkFonts:{}};render();
 });
 await page.locator('#artworkSelect').selectOption('a');
 assert.equal(await page.locator('#artworkText').inputValue(),'First line of a paragraph and its second line.');
 const before=await snapshot(page);
 await page.locator('#artworkText').fill('A whole paragraph can be edited here and will wrap within its own text box.');
 assert.ok(await page.evaluate(()=>PdfArtwork.linesFor(state.screens[0].artwork.elements[0]).length>=2));
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),before);
 await shortcut(page,'Control+y');
 await page.locator('#artworkSelect').selectOption('caps');
 assert.equal(await page.locator('[data-artwork-key="letterSpacing"]').inputValue(),'2');
 assert.match(await page.evaluate(()=>PdfArtwork.svgFor(state.screens[0])),/letter-spacing="2"/);
 await page.locator('#artworkAddLink').click();
 await page.locator('[data-artwork-key="x"]').fill('30');await page.locator('[data-artwork-key="y"]').fill('480');
 await page.locator('[data-artwork-key="width"]').fill('300');await page.locator('[data-artwork-key="height"]').fill('40');
 await page.locator('#artworkLink').fill('https://example.com/learn');
 assert.equal(await page.locator('#artworkLinkNote a').getAttribute('href'),'https://example.com/learn');
 const linked=await snapshot(page);
 await shortcut(page,'Control+z');assert.notEqual(await snapshot(page),linked);
 await shortcut(page,'Control+y');assert.equal(await snapshot(page),linked);
 const annotation=await page.evaluate(async()=>{
   const bytes=await makeEditablePdf(),doc=await PDFLib.PDFDocument.load(bytes),p=doc.getPage(0);
   const ref=p.node.Annots().get(0),a=doc.context.lookup(ref);
   const action=doc.context.lookup(a.get(PDFLib.PDFName.of('A')));
   const result={type:a.get(PDFLib.PDFName.of('Subtype')).toString(),uri:action.get(PDFLib.PDFName.of('URI')).decodeText(),rect:a.get(PDFLib.PDFName.of('Rect')).asArray().map(n=>n.asNumber()),width:p.getWidth(),height:p.getHeight()};
   state=initialState();render();await openProjectPdfBytes(bytes.slice().buffer);
   result.restored=state.screens[0].artwork.elements.find(e=>e.kind==='link').link;return result;
 });
 assert.equal(annotation.type,'/Link');assert.equal(annotation.uri,'https://example.com/learn');assert.equal(annotation.restored,annotation.uri);
 assert.deepEqual(annotation.rect,[30*annotation.width/400,80*annotation.height/600,330*annotation.width/400,120*annotation.height/600]);
 await page.setViewportSize({width:1450,height:1500});
 await page.addStyleTag({content:'.workspace{height:auto!important;overflow:visible!important}.workspace-top{position:static!important}'});
 await mkdir(path.join(root,'artifacts'),{recursive:true});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.waitForFunction(()=>[...document.querySelectorAll('.artwork-sheet')].every(image=>image.complete));
 await page.screenshot({clip:await page.locator('.artwork-page').boundingBox(),path:path.join(root,'artifacts','artwork-blocks-tracking-links.png')});
});
test('unsafe artwork links cannot navigate or enter the exported PDF',async t=>{
 const page=await editor(t);
 await page.evaluate(()=>{state={...initialState(),screens:[{id:'test',type:'artwork',blocks:[],artwork:{version:2,width:400,height:600,elements:[{id:'link',kind:'link',text:'Test button',x:20,y:40,width:180,height:30,link:'javascript:alert(1)'}]}}],selected:'test'};render();});
 assert.equal(await page.locator('#artworkLinkNote a').count(),0);
 const message=await page.evaluate(async()=>{try{await makeEditablePdf();return '';}catch(error){return error.message;}});
 assert.match(message,/nieprawidłowy link/);
});

test('mouse resize and move use preview scale, cancel safely and create one Undo step; compact deletion preserves other columns',async t=>{
 const page=await editor(t);
 await page.setViewportSize({width:1450,height:1200});
 await page.evaluate(()=>{
   const text=(id,x,y,width=160)=>({id,kind:'text',text:'A paragraph that wraps when the text frame becomes narrower.',x,y,width,fontSize:12,lineHeight:1.5,color:'#1d1e3c',fit:false});
   state={...initialState(),w:400,h:600,format:'custom',screens:[{id:'dragtest',type:'artwork',title:'Drag test',blocks:[],artwork:{version:2,width:400,height:600,background:'',elements:[text('first',30,70),text('next',30,200),text('other',230,200,140),{id:'picture',kind:'image',x:30,y:290,width:160,height:50,src:'',text:'Image'},{...text('barrier',30,410,340)},text('footer',30,510)]}}],selected:'dragtest',artworkFonts:{}};render();
 });
 await page.locator('#artworkSelect').selectOption('first');
 await page.locator('.artwork-page').scrollIntoViewIfNeeded();
 const original=await snapshot(page);
 const scale=(await page.locator('.artwork-page').boundingBox()).width/400;
 async function drag(selector,dx,dy,cancel=false){
   const box=await page.locator(selector).boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
   await page.mouse.move(box.x+box.width/2+dx*scale,box.y+box.height/2+dy*scale,{steps:8});
   if(cancel)await page.keyboard.press('Escape');
   await page.mouse.up();
 }
 await drag('[data-artwork-resize="e"]',-60,0);
 const resized=await snapshot(page);
 assert.ok(Math.abs(await page.evaluate(()=>state.screens[0].artwork.elements[0].width)-100)<2);
 assert.ok(await page.evaluate(()=>PdfArtwork.linesFor(state.screens[0].artwork.elements[0]).length>=4));
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),original);
 await shortcut(page,'Control+y');assert.equal(await snapshot(page),resized);
 await drag('[data-artwork-resize="se"]',20,40,true);assert.equal(await snapshot(page),resized);
 await drag('[data-artwork-resize="s"]',0,50);
 assert.ok(await page.evaluate(()=>state.screens[0].artwork.elements[0].boxHeight>100));
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),resized);
 await drag('[data-artwork-id="first"]',15,20);
 assert.ok(Math.abs(await page.evaluate(()=>state.screens[0].artwork.elements[0].x)-45)<2);
 assert.ok(Math.abs(await page.evaluate(()=>state.screens[0].artwork.elements[0].y)-90)<2);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),resized);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),original);
 assert.match(await page.locator('#artworkDeleteCompact').textContent(),/\(2\)/);
 await page.locator('#artworkDeleteCompact').click();
 const compacted=await page.evaluate(()=>state.screens[0].artwork.elements);
 assert.equal(compacted.find(e=>e.id==='next').y,70);
 assert.equal(compacted.find(e=>e.id==='picture').y,160);
 assert.equal(compacted.find(e=>e.id==='other').y,200);
 assert.equal(compacted.find(e=>e.id==='barrier').y,410);
 assert.equal(compacted.find(e=>e.id==='footer').y,510);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),original);
 await shortcut(page,'Control+y');assert.equal(await page.evaluate(()=>state.screens[0].artwork.elements.length),5);
 await page.locator('#artworkSelect').selectOption('picture');
 const beforeDelete=await snapshot(page);
 await page.locator('#artworkDelete').click();assert.equal(await page.evaluate(()=>state.screens[0].artwork.elements.some(e=>e.id==='picture')),false);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),beforeDelete);
 await page.locator('#artworkSelect').selectOption('next');
 await page.addStyleTag({content:'.workspace{height:auto!important;overflow:visible!important}.workspace-top{position:static!important}'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.waitForFunction(()=>[...document.querySelectorAll('.artwork-sheet')].every(image=>image.complete));
 await mkdir(path.join(root,'artifacts'),{recursive:true});
 await page.screenshot({clip:await page.locator('.artwork-page').boundingBox(),path:path.join(root,'artifacts','artwork-resize-handles.png')});
 const roundTrip=await page.evaluate(async()=>{const expected=JSON.stringify(state),bytes=await makeEditablePdf();state=initialState();render();return await openProjectPdfBytes(bytes.slice().buffer)&&JSON.stringify(state)===expected;});
 assert.equal(roundTrip,true);
});

test('selected text supports bold and color, edits retain ranges, and PDF export retains styling and replaced images',async t=>{
 const page=await editor(t);
 await page.evaluate(()=>{
   const image=document.createElement('canvas');image.width=80;image.height=50;const ctx=image.getContext('2d');ctx.fillStyle='#246bad';ctx.fillRect(0,0,80,50);
   const text='A selected word and sentence can be emphasized.';
   state={...initialState(),w:400,h:600,format:'custom',screens:[{id:'rich',type:'artwork',title:'Rich text',blocks:[],artwork:{version:2,width:400,height:600,background:'',elements:[{id:'text',kind:'text',text,x:30,y:70,width:280,fontSize:16,lineHeight:1.5,color:'#1d1e3c',fit:false},{id:'photo',kind:'image',src:image.toDataURL(),text:'Photo',x:30,y:200,width:180,height:120,link:'https://example.com/photo'}]}}],selected:'rich',artworkFonts:{}};render();
 });
 async function select(start,end){await page.locator('#artworkText').evaluate((el,[a,b])=>{el.focus();el.setSelectionRange(a,b);el.dispatchEvent(new Event('select'));},[start,end]);}
 assert.equal(await page.locator('#artworkBold').isDisabled(),true);
 const plain=await snapshot(page);
 await select(2,15);await page.locator('#artworkBold').click();
 assert.deepEqual(await page.evaluate(()=>state.screens[0].artwork.elements[0].textStyles),[{start:2,end:15,bold:true}]);
 const bold=await snapshot(page);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),plain);
 await shortcut(page,'Control+y');assert.equal(await snapshot(page),bold);
 await select(2,15);await page.locator('#artworkSelectionColor').fill('#a92323');await page.locator('#artworkApplyColor').click();
 const formatted=await snapshot(page);
 const visual=await page.evaluate(()=>{
   const svg=new DOMParser().parseFromString(PdfArtwork.svgFor(state.screens[0]),'image/svg+xml');
   return {bold:[...svg.querySelectorAll('tspan[font-weight="700"]')].map(n=>n.textContent).join(''),color:[...svg.querySelectorAll('tspan[fill="#a92323"]')].map(n=>n.textContent).join('')};
 });
 assert.equal(visual.bold,'selected word');assert.equal(visual.color,'selected word');
 await select(0,0);await page.locator('#artworkText').press('Home');await page.keyboard.insertText('New ');
 assert.deepEqual(await page.evaluate(()=>state.screens[0].artwork.elements[0].textStyles),[{start:6,end:19,bold:true,color:'#a92323'}]);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),formatted);
 await select(2,15);await page.locator('#artworkClearFormat').click();
 assert.deepEqual(await page.evaluate(()=>state.screens[0].artwork.elements[0].textStyles),[]);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),formatted);
 await page.locator('#artworkSelect').selectOption('photo');
 const beforeSwap=await snapshot(page);
 const geometry=await page.evaluate(()=>{const {src,...rest}=state.screens[0].artwork.elements[1];return rest;});
 const replacement=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=100;c.height=60;const ctx=c.getContext('2d');ctx.fillStyle='#398a51';ctx.fillRect(0,0,100,60);ctx.fillStyle='white';ctx.font='14px Arial';ctx.fillText('New image',13,35);return c.toDataURL().split(',')[1];
 });
 await page.locator('#artworkReplaceImage').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:Buffer.from(replacement,'base64')});
 await page.waitForFunction(()=>document.querySelector('#artworkImageStatus').textContent.startsWith('Obrazek podmieniony'));
 assert.deepEqual(await page.evaluate(()=>{const {src,...rest}=state.screens[0].artwork.elements[1];return rest;}),geometry);
 assert.notEqual(await snapshot(page),beforeSwap);
 const swapped=await snapshot(page);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),beforeSwap);
 await shortcut(page,'Control+y');assert.equal(await snapshot(page),swapped);
 await page.locator('#artworkReplaceImage').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
 await page.waitForFunction(()=>!document.querySelector('#artworkImageStatus').textContent.startsWith('Wczytuję'));
 assert.equal(await snapshot(page),swapped);
 await page.locator('#artworkSelect').selectOption('text');
 await page.setViewportSize({width:1450,height:1200});
 await page.addStyleTag({content:'.workspace{height:auto!important;overflow:visible!important}.workspace-top{position:static!important}'});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.waitForFunction(()=>[...document.querySelectorAll('.artwork-sheet')].every(image=>image.complete));
 await mkdir(path.join(root,'artifacts'),{recursive:true});
 await page.screenshot({clip:await page.locator('.artwork-page').boundingBox(),path:path.join(root,'artifacts','artwork-rich-text-image.png')});
 const exported=await page.evaluate(async()=>{
   const expected=JSON.stringify(state),bytes=await makeEditablePdf();
   // Verify actual PDF pixels, not just the embedded project model.
   const pdf=await pdfjsLib.getDocument({data:bytes.slice()}).promise,p=await pdf.getPage(1),vp=p.getViewport({scale:1});
   const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
   const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let red=0,green=0;
   for(let i=0;i<pixels.length;i+=4){if(pixels[i]>100&&pixels[i]>pixels[i+1]*2&&pixels[i]>pixels[i+2]*2)red++;if(pixels[i+1]>pixels[i]*1.5&&pixels[i+1]>pixels[i+2]*1.3)green++;}
   await pdf.destroy();state=initialState();render();const restored=await openProjectPdfBytes(bytes.slice().buffer);
   return {restored:restored&&JSON.stringify(state)===expected,red,green};
 });
 assert.equal(exported.restored,true);assert.ok(exported.red>10);assert.ok(exported.green>200);
});
test('coloring tracked original text keeps glyph coordinates and selection boundaries',async t=>{
 const page=await editor(t);
 await page.evaluate(()=>{
   const text='TRACKED LABEL',charX=[...text].map((_,i)=>i*11);
   const element={id:'text',kind:'text',text,originalText:text,x:30,y:60,width:145,fontSize:12,color:'#1d1e3c',letterSpacing:2,originalLines:[{text,x:0,y:0,fontSize:12,color:'#1d1e3c',charX}]};
   state={...initialState(),w:400,h:600,format:'custom',screens:[{id:'original',type:'artwork',blocks:[],artwork:{version:2,width:400,height:600,elements:[element]}}],selected:'original'};render();
 });
 const x=await page.evaluate(()=>new DOMParser().parseFromString(PdfArtwork.svgFor(state.screens[0]),'image/svg+xml').querySelector('text > tspan').getAttribute('x'));
 await page.locator('#artworkText').evaluate(el=>{el.focus();el.setSelectionRange(8,13);el.dispatchEvent(new Event('select'));});
 await page.locator('#artworkSelectionColor').fill('#ff0000');await page.locator('#artworkApplyColor').click();
 const result=await page.evaluate(()=>{const svg=new DOMParser().parseFromString(PdfArtwork.svgFor(state.screens[0]),'image/svg+xml');return {x:svg.querySelector('text > tspan').getAttribute('x'),colored:[...svg.querySelectorAll('tspan[fill="#ff0000"]')].map(n=>n.textContent).join('')};});
 assert.equal(result.x,x);assert.equal(result.colored,'LABEL');
 await page.locator('#artworkClearFormat').click();
 assert.equal(await page.evaluate(()=>new DOMParser().parseFromString(PdfArtwork.svgFor(state.screens[0]),'image/svg+xml').querySelector('text > tspan').getAttribute('x')),x);
 assert.deepEqual(await page.evaluate(()=>state.screens[0].artwork.elements[0].textStyles),[]);
});

test('clicking a source graphic exposes an on-canvas replace action without moving the frame',async t=>{
 const page=await editor(t);
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=60;c.height=60;c.getContext('2d').fillRect(0,0,60,60);return c.toDataURL();});
 await page.evaluate(src=>{state={...initialState(),w:400,h:600,format:'custom',screens:[{id:'graphics',type:'artwork',blocks:[],artwork:{version:3,width:400,height:600,elements:[{id:'icon',kind:'image',text:'Ikona',src,x:60,y:120,width:50,height:50,sourceGraphic:true}]}}],selected:'graphics'};render();},image);
 await page.locator('[data-artwork-id="icon"]').click();
 assert.equal(await page.locator('.artwork-swap').textContent(),'Podmień');
 const before=await snapshot(page);
 const picker=page.waitForEvent('filechooser');await page.locator('.artwork-swap').click();const chooser=await picker;
 const next=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=70;const ctx=c.getContext('2d');ctx.fillStyle='#e35a20';ctx.fillRect(0,0,40,70);return c.toDataURL().split(',')[1];});
 await chooser.setFiles({name:'new-icon.png',mimeType:'image/png',buffer:Buffer.from(next,'base64')});
 await page.waitForFunction(()=>document.querySelector('#artworkImageStatus').textContent.startsWith('Obrazek podmieniony'));
 assert.deepEqual(await page.evaluate(()=>{const e=state.screens[0].artwork.elements[0];return [e.x,e.y,e.width,e.height];}),[60,120,50,50]);
 assert.notEqual(await snapshot(page),before);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),before);
});
test('graphics migration preserves edited text and custom images, matches exact backgrounds and supports Undo',async t=>{
 const page=await editor(t);
 const fixture=await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=100;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,100,100);const plain=c.toDataURL();ctx.fillStyle='red';ctx.fillRect(10,20,30,40);const original=c.toDataURL();
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(original)))].map(n=>n.toString(16).padStart(2,'0')).join('');
   state={...initialState(),w:400,h:600,format:'custom',screens:[{id:'old',type:'artwork',blocks:[],artwork:{version:2,width:400,height:600,background:original,elements:[{id:'edited',kind:'text',text:'Already edited',x:30,y:80,width:200,fontSize:14,color:'#1d1e3c',textStyles:[{start:0,end:7,bold:true}]},{id:'custom',kind:'image',src:plain,x:150,y:200,width:100,height:100}]}}],selected:'old'};render();
   return {project:{screens:[{artwork:{version:3,width:400,height:600,background:plain,previousBackgroundSha256:hash,elements:[{id:'source-icon',kind:'image',sourceGraphic:true,src:original,text:'Source icon',x:40,y:120,width:120,height:240}]}}]}};
 });
 await page.route('**/templates/index.json',route=>route.fulfill({json:{templates:[{file:'templates/synthetic-upgrade.json',graphicsVersion:1}]}}));
 await page.route('**/templates/synthetic-upgrade.json',route=>route.fulfill({json:fixture}));
 const before=await snapshot(page);
 await page.locator('#artworkEnableGraphics').click();
 await page.waitForFunction(()=>state.screens[0].artwork.version===3);
 const after=await snapshot(page),data=await page.evaluate(()=>state.screens[0].artwork.elements);
 assert.equal(data.length,3);assert.equal(data[0].text,'Already edited');assert.equal(data[0].textStyles[0].bold,true);assert.equal(data[1].id,'custom');assert.notEqual(data[2].id,'source-icon');
 assert.equal(await page.evaluate(()=>PdfArtwork.enableSourceGraphics()),0);
 await shortcut(page,'Control+z');assert.equal(await snapshot(page),before);
 await shortcut(page,'Control+y');assert.equal(await snapshot(page),after);
 await page.evaluate(()=>{state.screens[0].artwork.version=2;state.screens[0].artwork.background='';render();});
 const unmatched=await snapshot(page);assert.equal(await page.evaluate(()=>PdfArtwork.enableSourceGraphics()),0);assert.equal(await snapshot(page),unmatched);
});
