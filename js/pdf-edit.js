/* pdf-edit.js
 * If the operator corrects a field in the editor, this draws over the
 * original printed value on page 1 of the PDF and writes the new value
 * in the same spot, so the archived PDF matches the corrected reports.
 *
 * Caveat: this only changes what the page LOOKS like. The original text
 * stays present (now hidden under a white box) in the PDF's invisible
 * text layer, since rewriting the underlying content stream of a
 * non-form PDF isn't something a static, browser-only tool can do
 * reliably. Anyone copy-pasting text straight off that spot could still
 * find the old value. If the field wasn't changed, the PDF is left
 * completely untouched (byte-for-byte).
 */

const PdfEdit = (() => {
  async function applyOverlays(pdfBytes, overlays) {
    // overlays: [{ bbox: {x,y,width,height}, text }]
    if (!overlays.length) return pdfBytes;

    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const data = pdfBytes instanceof Uint8Array ? pdfBytes.slice() : new Uint8Array(pdfBytes);
    const doc = await PDFDocument.load(data);
    const page = doc.getPage(0);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pad = 1.5;

    for (const { bbox, text } of overlays) {
      if (!bbox) continue;
      page.drawRectangle({
        x: bbox.x - pad,
        y: bbox.y - pad,
        width: bbox.width + pad * 2,
        height: bbox.height + pad * 2,
        color: rgb(1, 1, 1),
      });
      const size = Math.max(8, bbox.height * 0.92);
      page.drawText(text, {
        x: bbox.x,
        y: bbox.y,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    }

    return doc.save();
  }

  return { applyOverlays };
})();
