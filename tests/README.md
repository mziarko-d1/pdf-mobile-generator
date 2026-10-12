# Browser regression tests

Run on Node.js 24:

```sh
npm ci
npx playwright install --with-deps chromium
npm test
```

Tests serve the real editor locally and run in isolated Chromium contexts. They use
actual IndexedDB storage, keyboard shortcuts and generated PDFs containing the
editable JSON attachment; the DOCX fixture is a minimal OOXML archive stored as
base64. The editor's CDN scripts require internet access. In restricted environments
`TEST_ASSET_DIR` can point to a cache of the seven CDN scripts (including the PDF.js
worker), and `CHROMIUM_EXECUTABLE` can select an installed Chromium binary.

Coverage includes both Undo and Redo after saved-project loading, new-project
creation, editable PDF upload and library opening, ordinary PDF import in both
modes, and DOCX import. Each boundary also checks the first edit's Undo/Redo.
Cancellation and failed reads must preserve history. Footer settings, page and
block operations, saving and template application remain undoable within a session.
