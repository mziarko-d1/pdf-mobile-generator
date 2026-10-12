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
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'text/html');
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
async function addMetric(page) {
  await page.locator('#metricPaletteButton').click();
  return page.evaluate(() => current().blocks.find(b => b.type === 'metric').id);
}
const metric = page => page.evaluate(() => state.screens.flatMap(s => s.blocks || []).find(b => b.type === 'metric'));

test('rating matches the reference and represents the fractional tenth star', async t => {
  const page = await editor(t);
  await addMetric(page);
  assert.equal(await page.locator('.metric-number').textContent(), '9,47');
  assert.equal(await page.locator('.metric-unit').textContent(), '/10');
  assert.equal(await page.locator('.metric-stars svg').count(), 10);
  const fills = await page.locator('.metric-stars svg').evaluateAll(els => els.map(el => Number(el.dataset.starFill)));
  assert.deepEqual(fills.slice(0,9), Array(9).fill(1));
  assert.ok(Math.abs(fills[9] - .47) < .00001);
  assert.equal(await page.locator('.metric-emphasis').textContent(), '74% ocen to maksymalne 10/10.');
});

test('rating accepts commas/dots, five-star scales and handles invalid ratings', async t => {
  const page = await editor(t);
  await addMetric(page);
  await page.locator('[data-metric-field="value"]').fill('4.6');
  await page.locator('[data-metric-scale]').selectOption('5');
  assert.equal(await page.locator('.metric-number').textContent(), '4,6');
  assert.equal(await page.locator('.metric-unit').textContent(), '/5');
  assert.equal(await page.locator('.metric-stars svg').count(), 5);
  const last = Number(await page.locator('.metric-stars svg').last().getAttribute('data-star-fill'));
  assert.ok(Math.abs(last-.6) < .00001);
  for (const value of ['6','-1','not a rating','']) {
    await page.locator('[data-metric-field="value"]').fill(value);
    assert.equal(await page.locator('.metric-number').textContent(), '—');
    assert.equal(await page.locator('.metric-stars svg').evaluateAll(els => els.every(el => el.dataset.starFill === '0')), true);
  }
  await page.locator('[data-metric-field="value"]').fill('0');
  assert.equal(await page.locator('.metric-number').textContent(), '0');
});

test('statistics show arbitrary values and optional units without stars', async t => {
  const page = await editor(t);
  await addMetric(page);
  await page.locator('[data-metric-mode]').selectOption('stat');
  await page.locator('[data-metric-field="value"]').fill('74');
  assert.equal(await page.locator('.metric-stars').count(), 0);
  assert.equal(await page.locator('.metric-number').textContent(), '74');
  assert.equal(await page.locator('.metric-unit').textContent(), '%');
  await page.locator('[data-metric-field="unit"]').fill('osób');
  await page.locator('[data-metric-field="value"]').fill('1 200');
  assert.equal(await page.locator('.metric-number').textContent(), '1 200');
  assert.equal(await page.locator('.metric-unit').textContent(), 'osób');
  await page.locator('[data-metric-field="unit"]').fill('');
  assert.equal(await page.locator('.metric-unit').count(), 0);
});

test('Patient/HCP colors, mode, scale and edits support Undo/Redo', async t => {
  const page = await editor(t);
  const id = await addMetric(page);
  const color = () => page.locator('.metric-value').evaluate(el => getComputedStyle(el).color);
  assert.equal(await color(), 'rgb(217, 160, 129)');
  await page.locator(`[data-semantic-block="${id}"]`).selectOption('hcp');
  assert.equal(await color(), 'rgb(144, 153, 207)');
  await shortcut(page, 'Control+z');
  assert.equal(await color(), 'rgb(217, 160, 129)');
  await shortcut(page, 'Control+y');
  assert.equal(await color(), 'rgb(144, 153, 207)');
  async function reversible(action) {
    const before = await snapshot(page); await action(); const after = await snapshot(page);
    assert.notEqual(before, after);
    await shortcut(page, 'Control+z'); assert.equal(await snapshot(page), before);
    await shortcut(page, 'Control+y'); assert.equal(await snapshot(page), after);
  }
  await reversible(() => page.locator('[data-metric-mode]').selectOption('stat'));
  await reversible(() => page.locator('[data-metric-field="value"]').fill('74'));
  await reversible(() => page.locator('.metric-description').fill('New description'));
  await reversible(() => page.locator('.metric-emphasis').fill('Important summary'));
  await page.locator('[data-metric-mode]').selectOption('rating');
  await page.locator('[data-metric-field="value"]').fill('4,6');
  await reversible(() => page.locator('[data-metric-scale]').selectOption('5'));
});

test('metric can be added from editor, dragged, converted, moved and deleted', async t => {
  const page = await editor(t);
  const id = await addMetric(page);
  await page.locator('#addMetric').click();
  const data = await page.evaluateHandle(() => { const transfer = new DataTransfer(); transfer.setData('text/plain','new:metric'); return transfer; });
  await page.locator('[data-drop-page]').dispatchEvent('drop', {dataTransfer:data});
  assert.equal(await page.locator('.metric-card').count(), 3);
  await page.locator('[data-b][data-k="type"]').first().selectOption('metric');
  assert.equal(await page.locator('.metric-card').count(), 4);
  await page.locator('[data-b][data-k="type"]').first().selectOption('paragraph');
  await page.locator('#addContent').click();
  await page.evaluate(id => moveBlock(id, current().id), id);
  assert.equal(await page.evaluate(id => current().blocks.some(b => b.id === id), id), true);
  await page.locator(`[data-r="${id}"]`).click();
  await shortcut(page, 'Control+z');
  assert.equal(await page.evaluate(id => current().blocks.some(b => b.id === id), id), true);
});

test('metric persists through project/template saving and editable PDF export', async t => {
  const page = await editor(t);
  await addMetric(page);
  const original = await metric(page);
  await page.locator('#saveProject').click();
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Projekt zapisany:'));
  await page.locator('[data-metric-field="value"]').fill('1');
  await page.locator('#loadProject').click();
  await page.waitForFunction(() => current().blocks.find(b => b.type === 'metric').value === '9,47');
  assert.deepEqual(await metric(page), original);
  await page.locator('#templateName').fill('Rating template');
  await page.locator('#saveAsTemplate').click();
  await page.locator('[data-use-template]').waitFor();
  await page.locator('[data-use-template]').click();
  await page.waitForFunction(() => state.name.includes('kopia'));
  assert.equal((await metric(page)).value, original.value);
  const block = await page.evaluate(async () => {
    const bytes = await makeEditablePdf();
    const doc = await pdfjsLib.getDocument({data:bytes}).promise;
    const attachment = Object.values(await doc.getAttachments()).find(x => x.filename === 'pdf-mobile-generator-project.json');
    const project = JSON.parse(new TextDecoder().decode(attachment.content));
    return project.screens.flatMap(s => s.blocks || []).find(b => b.type === 'metric');
  });
  assert.deepEqual(block, await metric(page));
});

test('metric copy escapes HTML and long values wrap in Mobile and A4', async t => {
  const page = await editor(t);
  await addMetric(page);
  await page.locator('[data-metric-mode]').selectOption('stat');
  await page.locator('[data-metric-field="value"]').fill('12345678901234567890');
  await page.locator('[data-metric-field="unit"]').fill('<img src=x>');
  await page.locator('[data-metric-field="body"]').fill('<img src=x onerror=alert(1)>');
  for (const format of ['mobile','a4p','a4l']) {
    await page.locator('#format').selectOption(format);
    assert.equal(await page.locator('.metric-card img').count(), 0);
    assert.equal(await page.locator('.metric-card').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  }
});

test('capture rating/statistic preview for visual review', async t => {
  const page = await editor(t);
  await page.evaluate(() => {
    function screen(role,mode,value,scale=10) {
      const p=contentScreen(); p.title=mode==='stat'?'Statystyka':role==='patient'?'Ocena · Patient':'Ocena · HCP';p.intro='';
      const b=newBlock('metric');b.semanticRole=role;b.mode=mode;b.value=value;b.ratingScale=scale;
      if(mode==='stat'){b.body='Pacjenci oceniający kontakt maksymalnie.';b.emphasis='Ocena 10/10.';}
      if(scale===5){b.body='Średnia ocena konsultacji.';b.emphasis='Skala pięciogwiazdkowa.';}
      p.blocks=[b];return p;
    }
    state.screens=[screen('patient','rating','9,47'),screen('hcp','rating','4,6',5),screen('patient','stat','74')];state.selected=state.screens[0].id;render();
  });
  await page.addStyleTag({content: '.sidebar{display:none}.app{display:block;height:auto;overflow:visible}.workspace{height:auto;overflow:visible}.canvas{flex-direction:row;align-items:flex-start;justify-content:center}html,body{height:auto;overflow:visible}'});
  await page.setViewportSize({width:1200,height:850});
  const dir=path.join(root,'artifacts');await require('node:fs/promises').mkdir(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,'metric-preview.png'),fullPage:true});
});
