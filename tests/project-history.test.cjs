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
async function history(page, redo = false) {
  await page.locator('#projectName').fill('Projekt A');
  await page.locator('#addContent').click();
  if (redo) await shortcut(page, 'Control+z');
}
async function saveB(page) {
  await page.evaluate(async () => {
    const project = initialState();
    project.name = 'Projekt B';
    project.pageFooter.enabled = true;
    project.pageFooter.text = 'Stopka B';
    await localforage.setItem(PROJECT_DATA_PREFIX + 'B', project);
    await setProjectIndex([{id: 'B', name: project.name}]);
    await refreshSaved();
  });
}
async function pdfBytes(page, editable = true) {
  return page.evaluate(async editable => {
    const doc = await PDFLib.PDFDocument.create();
    doc.addPage([390, 844]);
    if (editable) {
      const project = initialState();
      project.name = 'Projekt PDF';
      project.pageFooter.enabled = true;
      project.pageFooter.text = 'Stopka PDF';
      await doc.attach(new TextEncoder().encode(JSON.stringify(project)), 'pdf-mobile-generator-project.json');
    }
    return Array.from(await doc.save());
  }, editable);
}
const boundaries = {
  'saved project': async page => {
    await saveB(page);
    await page.locator('#savedProjects').selectOption('B');
    await page.locator('#loadProject').click();
    await page.waitForFunction(() => state.name === 'Projekt B');
  },
  'new project': async page => {
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#newProject').click();
  },
  'editable PDF file': async page => {
    await page.locator('#openDocument').setInputFiles({name: 'Projekt PDF.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdfBytes(page))});
    await page.waitForFunction(() => document.querySelector('#importStatus').textContent.includes('pełnej edycji'));
  },
  'saved editable PDF': async page => {
    const bytes = await pdfBytes(page);
    await page.evaluate(async bytes => {
      await localforage.setItem(PDF_DATA_PREFIX + 'pdfB', new Blob([new Uint8Array(bytes)], {type: 'application/pdf'}));
      await setPdfIndex([{id: 'pdfB', name: 'Projekt PDF'}]);
      await renderPdfLibrary();
    }, bytes);
    await page.locator('[data-edit-pdf="pdfB"]').click();
    await page.waitForFunction(() => state.name === 'Projekt PDF');
  },
  'DOCX': async page => {
    const fixture = await readFile(path.join(__dirname, 'fixtures/document.docx.base64'), 'utf8');
    await page.locator('#openDocument').setInputFiles({name: 'Dokument.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(fixture.trim(), 'base64')});
    await page.waitForFunction(() => document.querySelector('#importStatus').textContent.includes('DOCX zaimportowany'));
  },
  'PDF background': async page => {
    await page.locator('#pdfImportMode').selectOption('background');
    await page.locator('#openDocument').setInputFiles({name: 'Tlo.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdfBytes(page, false))});
    await page.waitForFunction(() => document.querySelector('#importStatus').textContent.includes('PDF zaimportowany'));
  },
  'ordinary PDF': async page => {
    await page.locator('#pdfImportMode').selectOption('rebuild');
    await page.locator('#openDocument').setInputFiles({name: 'Zwykly.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdfBytes(page, false))});
    await page.waitForFunction(() => document.querySelector('#importStatus').textContent.includes('PDF zaimportowany'));
  }
};
for (const [name, open] of Object.entries(boundaries)) {
  for (const redo of [false, true]) {
    test(`${name} clears ${redo ? 'Redo' : 'Undo'} and retains editing history in the new document`, async t => {
      const page = await editor(t);
      await history(page, redo);
      await open(page);
      const baseline = await snapshot(page);
      await shortcut(page, redo ? 'Control+y' : 'Control+z');
      assert.equal(await snapshot(page), baseline, 'History cannot restore a different project');
      await shortcut(page, redo ? 'Control+z' : 'Control+y');
      assert.equal(await snapshot(page), baseline, 'Both history stacks must be empty');
      await page.locator('#addContent').click();
      const edited = await snapshot(page);
      assert.notEqual(edited, baseline);
      await shortcut(page, 'Control+z');
      assert.equal(await snapshot(page), baseline);
      await shortcut(page, 'Control+Shift+z');
      assert.equal(await snapshot(page), edited);
    });
  }
}

test('cancelled new project preserves both stacks', async t => {
  const page = await editor(t);
  await history(page);
  const edited = await snapshot(page);
  await shortcut(page, 'Control+z');
  const baseline = await snapshot(page);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#newProject').click();
  assert.equal(await snapshot(page), baseline);
  await shortcut(page, 'Control+y');
  assert.equal(await snapshot(page), edited);
  await shortcut(page, 'Control+z');
  assert.equal(await snapshot(page), baseline);
});

test('missing project and unreadable editable PDF preserve history', async t => {
  const page = await editor(t);
  await history(page);
  const edited = await snapshot(page);
  await shortcut(page, 'Control+z');
  const baseline = await snapshot(page);
  page.once('dialog', dialog => dialog.accept());
  await page.evaluate(() => loadProject('missing'));
  assert.equal(await page.evaluate(() => openProjectPdfBytes(new Uint8Array([1, 2, 3]).buffer)), false);
  assert.equal(await snapshot(page), baseline);
  await shortcut(page, 'Control+y');
  assert.equal(await snapshot(page), edited);
});

test('footer, page/block moves, deletion and save preserve document Undo/Redo', async t => {
  const page = await editor(t);
  await boundaries['saved project'](page);
  async function reversible(action) {
    const before = await snapshot(page);
    await action();
    const after = await snapshot(page);
    assert.notEqual(after, before);
    await shortcut(page, 'Control+z');
    assert.equal(await snapshot(page), before);
    await shortcut(page, 'Control+y');
    assert.equal(await snapshot(page), after);
  }
  await reversible(() => page.locator('#pageFooterToggle').click());
  await reversible(() => page.locator('#pageFooterToggle').click());
  await reversible(() => page.locator('#pageFooterShowCover').check());
  await reversible(() => page.locator('#pageFooterNumberMode').selectOption('label'));
  await reversible(() => page.locator('#pageFooterShowNumber').uncheck());
  await reversible(() => page.locator('#addContent').click());
  await reversible(() => page.evaluate(() => movePage(state.screens[1].id, state.screens[0].id)));
  await reversible(() => page.evaluate(() => addBlockAt('paragraph', state.screens[0].id)));
  await reversible(() => page.evaluate(() => moveBlock(state.screens[0].blocks[0].id, state.screens[2].id)));
  await reversible(() => page.evaluate(() => removeScreen(state.screens[0].id)));
  const saved = await snapshot(page);
  await page.locator('#saveProject').click();
  await page.waitForFunction(() => document.querySelector('#saveStatus').textContent.startsWith('Projekt zapisany:'));
  await shortcut(page, 'Control+z');
  assert.notEqual(await snapshot(page), saved, 'Saving does not reset history');
  await shortcut(page, 'Control+y');
  assert.equal(await snapshot(page), saved);
});

test('failed imports leave the active document and Redo untouched', async t => {
  const page = await editor(t);
  await history(page);
  const edited = await snapshot(page);
  await shortcut(page, 'Control+z');
  const baseline = await snapshot(page);
  // Fail after ordinary PDF dimensions have been read: no partial state commit.
  await page.evaluate(() => {
    pdfjsLib.getDocument = () => ({promise: Promise.resolve({
      getAttachments: async () => null,
      numPages: 1,
      getPage: async () => ({getViewport: () => ({width: 800, height: 400}), getTextContent: async () => {throw new Error('test read failure');}})
    })});
  });
  assert.equal(await page.evaluate(async () => {
    try { await importPdf(new File(['test'], 'broken.pdf')); return false; }
    catch { return true; }
  }), true);
  assert.equal(await snapshot(page), baseline);
  await page.locator('#openDocument').setInputFiles({name: 'broken.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid DOCX')});
  await page.waitForFunction(() => document.querySelector('#importStatus').classList.contains('err'));
  assert.equal(await snapshot(page), baseline);
  await shortcut(page, 'Control+y');
  assert.equal(await snapshot(page), edited);
});

test('applying a template remains undoable inside the current project', async t => {
  const page = await editor(t);
  await history(page);
  const baseline = await snapshot(page);
  await page.locator('[data-use-shared-template]').first().waitFor();
  await page.locator('[data-use-shared-template]').first().click();
  await page.waitForFunction(() => state.name.includes('kopia'));
  const templated = await snapshot(page);
  await shortcut(page, 'Control+z');
  assert.equal(await snapshot(page), baseline);
  await shortcut(page, 'Control+y');
  assert.equal(await snapshot(page), templated);
});

test('a fresh edit after Undo discards Redo within the current project', async t => {
  const page = await editor(t);
  await boundaries['saved project'](page);
  await page.locator('#addContent').click();
  await shortcut(page, 'Control+z');
  await page.locator('#pageFooterShowCover').check();
  const changed = await snapshot(page);
  await shortcut(page, 'Control+y');
  assert.equal(await snapshot(page), changed);
});

test('Ctrl+Z in a text field does not consume document history', async t => {
  const page = await editor(t);
  await page.locator('#addContent').click();
  const changed = await snapshot(page);
  await page.locator('#pageTitle').press('Control+z');
  assert.equal(await snapshot(page), changed);
  await shortcut(page, 'Control+z');
  assert.notEqual(await snapshot(page), changed);
});

test('filling a template from PDF content retains the current document checkpoint', async t => {
  const page = await editor(t);
  await history(page);
  const baseline = await snapshot(page);
  const bytes = await page.evaluate(async () => {
    const doc = await PDFLib.PDFDocument.create();
    const sheet = doc.addPage([600, 800]);
    sheet.drawText('Article for regression test', {x: 30, y: 750, size: 18});
    for (let i = 0; i < 8; i++) {
      sheet.drawText('This paragraph contains useful educational content for the reader.', {x: 30, y: 700 - i * 45, size: 12});
    }
    return Array.from(await doc.save());
  });
  await page.locator('#articleImportPdf').setInputFiles({name: 'article.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes)});
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#fillTemplateFromContent').click();
  await page.waitForFunction(() => document.querySelector('#contentImportStatus').textContent.startsWith('Gotowe:'));
  const filled = await snapshot(page);
  assert.notEqual(filled, baseline);
  await shortcut(page, 'Control+z');
  assert.equal(await snapshot(page), baseline);
  await shortcut(page, 'Control+y');
  assert.equal(await snapshot(page), filled);
});
