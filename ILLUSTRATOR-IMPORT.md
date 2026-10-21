# Editable Illustrator / PDF layouts

The fixed-layout importer supports PDF-compatible AI and PDF files. Real text is reconstructed as individually editable fields; illustrations, logos and ornaments remain in the page background. Outlined or raster text remains graphical. A source AI file without a PDF layer is rejected with export instructions.

The editor supports field selection on the page, text/color/size/position changes, added text and raster images, deletion, Undo/Redo, local template copies, administrator publication, and editable-project PDF export/reopen. Automatic article fill is blocked on fixed layouts to prevent losing the original design.

`scripts/convert-illustrator-template.py` converts owner-supplied files locally. It removes real text from a background render, preserves PDF text runs and positions, and normalizes embedded subset fonts into browser-compatible WOFF. Supported glyph ranges permit fallback for newly typed characters absent from a PDF subset. Requirements: PyMuPDF, pypdf, fontTools.

Source artwork, derived template payloads, contact details, embedded source fonts and screenshots are intentionally excluded from this public branch. Two converted one-pagers are delivered only through the existing owner-private preview. Do not add those assets to public Git history without explicit owner approval of that disclosure. The browser tests run the source-fixture checks when the private fixtures exist locally; otherwise those checks are marked skipped. Public CI uses synthetic fixtures for import, editing, templates and PDF round-trip tests. Existing editor regressions run normally.
