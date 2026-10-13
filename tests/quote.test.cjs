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
const avatar = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=', 'base64');
async function addQuote(page) {
  await page.locator('#quotePaletteButton').click();
  return page.evaluate(() => current().blocks.find(b => b.type === 'quote').id);
}
const quote = page => page.evaluate(() => state.screens.flatMap(s => s.blocks || []).find(b => b.type === 'quote'));
async function portrait(page) {
  await page.locator('[data-quote-photo]').setInputFiles({name: 'portrait.png', mimeType: 'image/png', buffer: avatar});
  await page.waitForFunction(() => current().blocks.find(b => b.type === 'quote').photoSrc.startsWith('data:image/'));
}

test('quote can be added from the palette, editor and drag/drop, and converted from text', async t => {
  const page = await editor(t);
  await addQuote(page);
  assert.equal(await page.locator('.quote-card').count(), 1);
  assert.equal(await page.locator('.quote-avatar').count(), 0);
  await page.locator('#addQuote').click();
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'new:quote');
    return transfer;
  });
  await page.locator('[data-drop-page]').dispatchEvent('drop', {dataTransfer: data});
  assert.equal(await page.locator('.quote-card').count(), 3);
  await page.locator('[data-b][data-k="type"]').first().selectOption('quote');
  assert.equal(await page.locator('.quote-card').count(), 4);
  await page.locator('[data-b][data-k="type"]').first().selectOption('paragraph');
  assert.equal(await page.locator('.quote-card').count(), 3);
});

test('quote uses Patient/HCP colors and inherits the slide role', async t => {
  const page = await editor(t);
  const id = await addQuote(page);
  async function colors() {
    return page.locator('.quote-topic').evaluate(el => ({
      mark: getComputedStyle(el.querySelector('.quote-mark')).color,
      credit: getComputedStyle(el.querySelector('.quote-author-role')).color,
      copy: getComputedStyle(el.querySelector('.quote-text')).color
    }));
  }
  assert.deepEqual(await colors(), {mark:'rgb(172, 184, 233)', credit:'rgb(144, 153, 207)', copy:'rgb(29, 30, 60)'});
  await page.locator(`[data-semantic-block="${id}"]`).selectOption('patient');
  assert.deepEqual(await colors(), {mark:'rgb(242, 207, 189)', credit:'rgb(217, 160, 129)', copy:'rgb(29, 30, 60)'});
  await page.locator(`[data-semantic-block="${id}"]`).selectOption('inherit');
  await page.locator('#semanticSlideStyle').selectOption('hcp');
  assert.equal((await colors()).mark, 'rgb(172, 184, 233)');
});

test('photo upload, hiding, showing, removal and Undo/Redo preserve the portrait', async t => {
  const page = await editor(t);
  await addQuote(page);
  await portrait(page);
  const src = (await quote(page)).photoSrc;
  assert.equal(await page.locator('.quote-avatar').count(), 1);
  assert.equal(await page.locator('.quote-avatar').evaluate(el => getComputedStyle(el).borderRadius), '50%');
  await page.locator('[data-quote-show-photo]').uncheck();
  assert.equal(await page.locator('.quote-avatar').count(), 0);
  assert.equal((await quote(page)).photoSrc, src);
  await shortcut(page, 'Control+z');
  assert.equal(await page.locator('.quote-avatar').count(), 1);
  await shortcut(page, 'Control+y');
  assert.equal(await page.locator('.quote-avatar').count(), 0);
  await page.locator('[data-quote-show-photo]').check();
  await page.locator('[data-quote-remove-photo]').click();
  assert.equal((await quote(page)).photoSrc, '');
  await shortcut(page, 'Control+z');
  assert.equal((await quote(page)).photoSrc, src);
});

test('quote copy and attribution edit in the sidebar and preview without HTML injection', async t => {
  const page = await editor(t);
  await addQuote(page);
  await page.locator('[data-quote-field="body"]').fill('First paragraph\nSecond paragraph <img src=x onerror=alert(1)>');
  await page.locator('[data-quote-field="author"]').fill('Example Author');
  await page.locator('[data-quote-field="authorRole"]').fill('Nurse, Clinic');
  assert.equal(await page.locator('.quote-text img').count(), 0);
  assert.equal(await page.locator('.quote-text p').count(), 2);
  await page.locator('.quote-text').fill('Edited directly in the preview.');
  assert.equal((await quote(page)).body, 'Edited directly in the preview.');
  assert.equal(await page.locator('[data-quote-field="body"]').inputValue(), 'Edited directly in the preview.');
  await page.locator('.quote-author-name').fill('Another Author');
  await page.locator('.quote-author-role').fill('Doctor');
  assert.equal((await quote(page)).author, 'Another Author');
  assert.equal((await quote(page)).authorRole, 'Doctor');
  const edited = await snapshot(page);
  await shortcut(page, 'Control+z');
  assert.notEqual(await snapshot(page), edited);
  await shortcut(page, 'Control+y');
  assert.equal(await snapshot(page), edited);
});

test('quote and portrait persist in saved projects, templates and editable PDF export', async t => {
  const page = await editor(t);
  await addQuote(page);
  await portrait(page);
  await page.locator('[data-quote-field="author"]').fill('Example Author');
  const original = await quote(page);
  await page.locator('#saveProject').click();
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Projekt zapisany:'));
  await page.locator('[data-quote-field="author"]').fill('Temporary');
  await page.locator('#loadProject').click();
  await page.waitForFunction(() => current().blocks.find(b => b.type === 'quote').author === 'Example Author');
  assert.deepEqual(await quote(page), original);
  await page.locator('#templateName').fill('Quote template');
  await page.locator('#saveAsTemplate').click();
  await page.locator('[data-use-template]').waitFor();
  await page.locator('[data-use-template]').click();
  await page.waitForFunction(() => state.name.includes('kopia'));
  const templated = await quote(page);
  assert.equal(templated.photoSrc, original.photoSrc);
  assert.equal(templated.author, original.author);
  const pdf = await page.evaluate(async () => {
    const bytes = await makeEditablePdf();
    const doc = await pdfjsLib.getDocument({data: bytes}).promise;
    const attachments = await doc.getAttachments();
    const attachment = Object.values(attachments).find(x => x.filename === 'pdf-mobile-generator-project.json');
    const project = JSON.parse(new TextDecoder().decode(attachment.content));
    return {pages:doc.numPages, block:project.screens.flatMap(s => s.blocks || []).find(b => b.type === 'quote')};
  });
  assert.equal(pdf.pages, 2);
  assert.deepEqual(pdf.block, templated);
});

for (const format of ['mobile','a4p','a4l']) {
  test(`quote wraps long text and attribution inside ${format}`, async t => {
    const page = await editor(t);
    await addQuote(page);
    await page.locator('#format').selectOption(format);
    await page.locator('[data-quote-field="author"]').fill('VeryLongAuthorNameWithoutSpaces'.repeat(4));
    await page.locator('[data-quote-field="body"]').fill('A readable quotation with enough text to check wrapping. '.repeat(5));
    assert.equal(await page.locator('.quote-card').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.locator('.quote-author-copy').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  });
}

test('capture the HCP and Patient quote layout for visual review', async t => {
  const page = await editor(t);
  await page.evaluate(() => {
    const make = role => {
      const p = contentScreen(); p.title = role === 'patient' ? 'Patient' : 'HCP / Clinical'; p.intro = '';
      const b = newBlock('quote'); b.semanticRole = role;
      b.body = 'Doctor.One has transformed the way we communicate with our patients. It enables seamless remote contact, improves the quality and continuity of care, and provides a single, consistent communication channel for our team.';
      b.author = 'Example Author'; b.authorRole = 'Nurse, Clinic';
      p.blocks = [b]; return p;
    };
    state.screens = [make('hcp'),make('patient')]; state.selected = state.screens[0].id; render();
  });
  await page.addStyleTag({content: '.sidebar{display:none}.app{display:block;height:auto;overflow:visible}.workspace{height:auto;overflow:visible}.canvas{flex-direction:row;align-items:flex-start;justify-content:center}html,body{height:auto;overflow:visible}'});
  await page.setViewportSize({width:1000,height:850});
  const dir = path.join(root, 'artifacts');
  await require('node:fs/promises').mkdir(dir, {recursive:true});
  await page.screenshot({path:path.join(dir,'quote-preview.png'),fullPage:true});
});

test('quote has rounded corners, the box shadow and the supplied role-specific icons', async t => {
  const page = await editor(t);
  const id = await addQuote(page);
  assert.deepEqual(await page.locator('.quote-card').evaluate(el => ({
    radius:getComputedStyle(el).borderRadius,
    shadow:getComputedStyle(el).boxShadow
  })), {radius:'16px', shadow:'rgba(174, 184, 229, 0.3) 0px 30px 40px 0px'});
  await page.waitForFunction(() => document.querySelector('.quote-mark-hcp').naturalWidth === 100);
  assert.equal(await page.locator('.quote-mark-hcp').isVisible(), true);
  assert.equal(await page.locator('.quote-mark-patient').isVisible(), false);
  assert.equal(await page.locator('.quote-mark-fallback').isVisible(), false);
  await page.locator(`[data-semantic-block="${id}"]`).selectOption('patient');
  await page.waitForFunction(() => document.querySelector('.quote-mark-patient').naturalWidth === 100);
  assert.equal(await page.locator('.quote-mark-patient').isVisible(), true);
  assert.equal(await page.locator('.quote-mark-hcp').isVisible(), false);
  await page.locator(`[data-semantic-block="${id}"]`).selectOption('inherit');
  await page.locator('#semanticSlideStyle').selectOption('hcp');
  assert.equal(await page.locator('.quote-mark-hcp').isVisible(), true);
  await page.locator('#semanticSlideStyle').selectOption('neutral');
  assert.equal(await page.locator('.quote-mark-fallback').isVisible(), true);
  assert.equal(await page.locator('.quote-mark-hcp').isVisible(), false);
});

test('supplied quote icons render even when separate image requests are unavailable', async t => {
  const page = await editor(t);
  await page.route('**/assets/quote-*.png', route => route.abort());
  const id = await addQuote(page);
  for (const [role, selector] of [['hcp','.quote-mark-hcp'],['patient','.quote-mark-patient']]) {
    await page.locator(`[data-semantic-block="${id}"]`).selectOption(role);
    await page.waitForFunction(selector => document.querySelector(selector).naturalWidth === 100, selector);
    assert.equal(await page.locator(selector).isVisible(), true);
    assert.equal(await page.locator(selector).getAttribute('src').then(src => src.startsWith('data:image/png;base64,')), true);
  }
});
