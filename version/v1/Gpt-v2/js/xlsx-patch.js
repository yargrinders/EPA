/* xlsx-patch.js
 * Surgically writes values into specific cells of an existing .xlsx file
 * without touching styles, fonts, images or anything else in the workbook.
 * Works directly on the OOXML sheet XML inside the .xlsx zip container.
 */

const XlsxPatch = (() => {
  const SS_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

  function findCell(sheetDoc, ref) {
    const cells = sheetDoc.getElementsByTagNameNS(SS_NS, 'c');
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('r') === ref) return cells[i];
    }
    return null;
  }

  function isNumericString(v) {
    return typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim());
  }

  /**
   * Set a single cell's value, keeping its existing style (`s` attribute).
   * value === null | undefined | '' clears the cell to blank (keeps style, drops value/type).
   * Formula cells (containing <f>) keep their formula; only the cached <v> is refreshed.
   */
  function setCell(sheetDoc, ref, value) {
    const target = findCell(sheetDoc, ref);
    if (!target) {
      console.warn(`[xlsx-patch] cell ${ref} not found in sheet, skipping`);
      return;
    }

    const hasFormula = target.getElementsByTagNameNS(SS_NS, 'f').length > 0;

    ['v', 'is'].forEach(tag => {
      const nodes = target.getElementsByTagNameNS(SS_NS, tag);
      for (let i = nodes.length - 1; i >= 0; i--) nodes[i].parentNode.removeChild(nodes[i]);
    });

    if (value === null || value === undefined || value === '') {
      if (!hasFormula) target.removeAttribute('t');
      return;
    }

    if (hasFormula) {
      const v = sheetDoc.createElementNS(SS_NS, 'v');
      v.textContent = String(value);
      target.appendChild(v);
      return;
    }

    if (typeof value === 'number' || isNumericString(value)) {
      target.removeAttribute('t');
      const v = sheetDoc.createElementNS(SS_NS, 'v');
      v.textContent = String(value);
      target.appendChild(v);
    } else {
      target.setAttribute('t', 'inlineStr');
      const is = sheetDoc.createElementNS(SS_NS, 'is');
      const t = sheetDoc.createElementNS(SS_NS, 't');
      t.setAttribute('xml:space', 'preserve');
      t.textContent = String(value);
      is.appendChild(t);
      target.appendChild(is);
    }
  }

  /**
   * Apply a batch of edits to an in-memory .xlsx (ArrayBuffer/Uint8Array).
   * sheetPathMap: { SheetName: 'xl/worksheets/sheetN.xml' }
   * edits: [{ sheet, ref, value }]
   * Returns a Blob (application/vnd.openxmlformats...) ready for download.
   */
  async function patch(bytes, sheetPathMap, edits) {
    const zip = await JSZip.loadAsync(bytes);
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const docs = {};

    for (const e of edits) {
      const path = sheetPathMap[e.sheet];
      if (!path) throw new Error(`[xlsx-patch] unknown sheet "${e.sheet}"`);
      if (!docs[path]) {
        const xml = await zip.file(path).async('string');
        docs[path] = parser.parseFromString(xml, 'application/xml');
      }
      setCell(docs[path], e.ref, e.value);
    }

    for (const path of Object.keys(docs)) {
      zip.file(path, serializer.serializeToString(docs[path]));
    }

    return zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }

  return { patch, setCell };
})();
