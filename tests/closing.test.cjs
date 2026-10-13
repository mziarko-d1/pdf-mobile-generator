const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {readFile} = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

let server, browser, origin;
const root = path.resolve(__dirname, '..');
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
const ending = page => page.evaluate(() => state.screens.find(s => s.type === 'closing'));
async function addClosing(page) { await page.locator('#addClosing').click(); return (await ending(page)).id; }

test('closing page is appended, centered and logo-free even when the cover has a logo', async t => {
  const page = await editor(t);
  await page.evaluate(() => { state.materialLogo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=';render(); });
  const id = await addClosing(page);
  assert.equal(await page.evaluate(() => state.screens.at(-1).type), 'closing');
  assert.equal(await page.locator('.closing-title').textContent(), 'Dziękujemy!');
  assert.equal(await page.locator('.closing .material-logo,.closing img,.closing [data-drop-page]').count(), 0);
  assert.equal(await page.locator('.cover .material-logo img').count(), 1);
  assert.equal(await page.locator('#addText').count(), 0);
  const centered = await page.locator('.closing-title').evaluate(el => {
    const page=el.closest('.page').getBoundingClientRect(), title=el.getBoundingClientRect();
    return Math.abs(title.x+title.width/2-page.x-page.width/2)<1 && Math.abs(title.y+title.height/2-page.y-page.height/2)<1;
  });
  assert.equal(centered, true);
  await page.evaluate(id => addBlockAt('paragraph',id), id);
  assert.equal((await ending(page)).blocks.length, 0);
});

test('new content and covers are inserted before the closing page', async t => {
  const page = await editor(t);
  const id = await addClosing(page);
  await page.locator('#addContent').click();
  await page.locator('#addCover').click();
  assert.equal(await page.evaluate(() => state.screens.at(-1).id), id);
  assert.equal(await page.evaluate(() => state.screens.length), 5);
});

test('closing page addition, editing and deletion support Undo/Redo', async t => {
  const page = await editor(t);
  const baseline = await snapshot(page);
  const id = await addClosing(page), added = await snapshot(page);
  await shortcut(page,'Control+z');assert.equal(await snapshot(page),baseline);
  await shortcut(page,'Control+y');assert.equal(await snapshot(page),added);
  await page.locator('#closingHeading').fill('Dziękujemy za uwagę!');
  await page.locator('#closingText').fill('Do zobaczenia.');
  await page.locator('.closing-title').fill('Dziękujemy za rozmowę!');
  assert.equal((await ending(page)).heading,'Dziękujemy za rozmowę!');
  assert.equal(await page.locator('#closingHeading').inputValue(),'Dziękujemy za rozmowę!');
  await page.locator('.closing-text').fill('Życzymy dobrego dnia.');
  assert.equal((await ending(page)).text,'Życzymy dobrego dnia.');
  const edited = await snapshot(page);
  await shortcut(page,'Control+z');assert.notEqual(await snapshot(page),edited);
  await shortcut(page,'Control+y');assert.equal(await snapshot(page),edited);
  await page.locator(`[data-remove-screen="${id}"]`).click();
  assert.equal(await page.locator('.closing').count(),0);
  await shortcut(page,'Control+z');assert.equal(await snapshot(page),edited);
});

test('closing page is saved in projects, templates and the final editable PDF page', async t => {
  const page = await editor(t);
  await addClosing(page);
  await page.locator('#closingHeading').fill('Dziękujemy za uwagę!');
  await page.locator('#closingText').fill('Do zobaczenia.');
  const saved = await ending(page);
  await page.locator('#saveProject').click();
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Projekt zapisany:'));
  await page.locator('#closingHeading').fill('Temporary');
  await page.locator('#loadProject').click();
  await page.waitForFunction(() => state.screens.at(-1).heading==='Dziękujemy za uwagę!');
  assert.deepEqual(await ending(page),saved);
  await page.locator('#templateName').fill('Template with closing');await page.locator('#saveAsTemplate').click();
  await page.locator('[data-use-template]').waitFor();await page.locator('[data-use-template]').click();
  await page.waitForFunction(() => state.name.includes('kopia'));
  const pdf = await page.evaluate(async () => {
    const bytes=await makeEditablePdf(),doc=await pdfjsLib.getDocument({data:bytes}).promise;
    const attachment=Object.values(await doc.getAttachments()).find(x=>x.filename==='pdf-mobile-generator-project.json');
    const project=JSON.parse(new TextDecoder().decode(attachment.content));
    return {pages:doc.numPages,last:project.screens.at(-1)};
  });
  assert.equal(pdf.pages,3);assert.equal(pdf.last.type,'closing');assert.equal(pdf.last.heading,saved.heading);assert.equal(pdf.last.text,saved.text);
});

test('closing stays last when a template is filled with imported PDF content', async t => {
  const page = await editor(t);await addClosing(page);
  const bytes=await page.evaluate(async()=>{
    const doc=await PDFLib.PDFDocument.create(),sheet=doc.addPage([600,800]);
    sheet.drawText('Article for test',{x:30,y:750,size:18});
    for(let i=0;i<8;i++)sheet.drawText('Educational content that fills the current layout.',{x:30,y:700-i*45,size:12});
    return Array.from(await doc.save());
  });
  await page.locator('#articleImportPdf').setInputFiles({name:'article.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
  page.once('dialog',dialog=>dialog.accept());await page.locator('#fillTemplateFromContent').click();
  await page.waitForFunction(()=>document.querySelector('#contentImportStatus').textContent.startsWith('Gotowe:'));
  assert.equal(await page.evaluate(()=>state.screens.at(-1).type),'closing');
  assert.equal(await page.evaluate(()=>state.screens.filter(s=>s.type==='closing').length),1);
  assert.equal((await ending(page)).heading,'Dziękujemy!');
});

test('closing text escapes HTML and wraps in Mobile and A4', async t => {
  const page = await editor(t);await addClosing(page);
  await page.locator('#closingHeading').fill('Dziękujemyzaudział'.repeat(6));
  await page.locator('#closingText').fill('<img src=x onerror=alert(1)>');
  for(const format of ['mobile','a4p','a4l']){
    await page.locator('#format').selectOption(format);
    assert.equal(await page.locator('.closing img').count(),0);
    assert.equal(await page.locator('.closing-title').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  }
});

test('capture the logo-free closing page for visual review', async t => {
  const page = await editor(t);await addClosing(page);
  await page.evaluate(()=>{state.screens=[state.screens.at(-1)];render();});
  await page.addStyleTag({content:'.sidebar{display:none}.app{display:block;height:auto;overflow:visible}.workspace{height:auto;overflow:visible}html,body{height:auto;overflow:visible}'});
  await page.setViewportSize({width:500,height:850});
  const dir=path.join(root,'artifacts');await require('node:fs/promises').mkdir(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,'closing-preview.png'),fullPage:true});
});
