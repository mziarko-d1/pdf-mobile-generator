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
const article='# Materiał\n\n## Zalecenia\n\nZapisuj wyniki w dzienniczku.\n\nOpis metody oraz jej historii jest zwykłym tłem edukacyjnym. Ten akapit pozwala czytelnikowi zrozumieć kontekst.';
async function prepareAI(page,fail=false){
  await page.route('https://r.jina.ai/**',route=>route.fulfill({body:article}));
  await page.evaluate(fail=>{
    const toggle=document.getElementById('articleImportAI');toggle.disabled=false;toggle.checked=true;
    window.DoctorOneAdmin.analyzeContent=async payload=>{
      if(fail) throw Error('AI offline');
      return {classifications:payload.blocks.map((b,i)=>({id:b.id,label:i===0?'remember':'none'}))};
    };
  },fail);
  await page.locator('#articleImportUrl').fill('https://example.com/article');
}
test('AI importer keeps template style, applies semantic boxes and supports Undo/Redo',async t=>{
  const page=await editor(t);
  await page.evaluate(()=>{state.screens=[coverScreen(),contentScreen()];state.screens[1].blocks=[newBlock('paragraph')];render();});
  const before=await snapshot(page),preset=await page.evaluate(()=>state.preset);
  await prepareAI(page);
  page.once('dialog',d=>d.accept());await page.locator('#fillTemplateFromContent').click();
  await page.waitForFunction(()=>document.getElementById('contentImportStatus').textContent.startsWith('Gotowe:'));
  const blocks=await page.evaluate(()=>state.screens.flatMap(p=>p.blocks||[]));
  assert.ok(blocks.some(b=>b.type==='remember'&&b.body==='Zapisuj wyniki w dzienniczku.'));
  assert.equal(await page.evaluate(()=>state.preset),preset);
  assert.match(await page.locator('#contentImportStatus').textContent(),/AI zastosowało wyróżnienia: 1/);
  const after=await snapshot(page);
  await shortcut(page,'Control+z');assert.equal(await snapshot(page),before);
  await shortcut(page,'Control+y');assert.equal(await snapshot(page),after);
});
test('AI failure leaves the active project and history intact',async t=>{
  const page=await editor(t),before=await snapshot(page);
  await prepareAI(page,true);
  page.once('dialog',d=>d.accept());await page.locator('#fillTemplateFromContent').click();
  await page.waitForFunction(()=>document.getElementById('contentImportStatus').textContent==='AI offline');
  assert.equal(await snapshot(page),before);
});
test('unconfigured AI is clearly unavailable and ordinary import still works',async t=>{
  const page=await editor(t);
  assert.equal(await page.locator('#articleImportAI').isDisabled(),true);
  await page.route('https://r.jina.ai/**',route=>route.fulfill({body:article}));
  await page.locator('#articleImportUrl').fill('https://example.com/article');
  page.once('dialog',d=>d.accept());await page.locator('#fillTemplateFromContent').click();
  await page.waitForFunction(()=>document.getElementById('contentImportStatus').textContent.startsWith('Gotowe:'));
  assert.ok(!(await page.locator('#contentImportStatus').textContent()).includes('AI zastosowało'));
});
