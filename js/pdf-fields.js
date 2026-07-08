/* pdf-fields.js
 * Reads page 1 of an Einblas-Protokoll PDF, reconstructs text lines from
 * pdf.js text items (keeping each item's on-page position), and extracts
 * the handful of fields the team marks in green on the printout.
 * Coordinates are kept in raw PDF user-space points, which is exactly the
 * coordinate system pdf-lib draws in later, so no conversion is needed.
 */

const PdfFields = (() => {
  async function getLines(pdfBytes) {
    // pdf.js иногда detaches/consumes переданный buffer.
    // Передаем копию, чтобы оригинальный PDF потом нормально ушел в ZIP/pdf-lib.
    const data = pdfBytes instanceof Uint8Array ? pdfBytes.slice() : new Uint8Array(pdfBytes);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();

    const items = content.items
      .map(it => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        width: it.width,
        height: Math.abs(it.transform[3]) || 10,
      }))
      .filter(it => it.str.length > 0);

    // cluster items into lines by rounded y position
    const rows = [];
    for (const it of items) {
      let bucket = rows.find(r => Math.abs(r.y - it.y) <= 2);
      if (!bucket) { bucket = { y: it.y, items: [] }; rows.push(bucket); }
      bucket.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y); // top of page first

    const lines = rows.map(row => {
      row.items.sort((a, b) => a.x - b.x);
      let text = '';
      const spans = [];
      row.items.forEach((it, i) => {
        if (i > 0) {
          const prev = row.items[i - 1];
          const gap = it.x - (prev.x + prev.width);
          if (gap > 1.5) text += ' ';
        }
        const start = text.length;
        text += it.str;
        spans.push({ start, end: text.length, item: it });
      });
      return { y: row.y, text, spans };
    });

    // stop before the process chart - everything after is out of scope
    const cutIdx = lines.findIndex(l => /Prozess\s*Diagramm/i.test(l.text));
    return cutIdx === -1 ? lines : lines.slice(0, cutIdx);
  }

  function bboxForRange(line, start, end) {
    const covering = line.spans.filter(s => s.end > start && s.start < end);
    if (covering.length === 0) return null;
    const minX = Math.min(...covering.map(s => s.item.x));
    const maxX = Math.max(...covering.map(s => s.item.x + s.item.width));
    const minY = Math.min(...covering.map(s => s.item.y));
    const maxH = Math.max(...covering.map(s => s.item.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxH };
  }

  function firstMatch(lines, re, filter) {
    for (const line of lines) {
      if (filter && !filter(line.text)) continue;
      const m = re.exec(line.text);
      if (m) return { m, line };
    }
    return null;
  }

  function extract(lines) {
    const fields = {};

    if (lines.length) {
      fields.firma = {
        value: lines[0].text.trim(),
        bbox: bboxForRange(lines[0], 0, lines[0].text.length),
      };
    }

    let r = firstMatch(lines, /Bauvorhaben-Nr\.?\s*(\S+)/, t => t.includes('Bauvorhaben-Nr'));
    if (r) {
      const val = r.m[1];
      const start = r.m.index + r.m[0].length - val.length;
      fields.bauvorhaben_nr = { value: val, bbox: bboxForRange(r.line, start, start + val.length) };
    }

    r = firstMatch(lines, /Datum:\s*([\d.]+)/, t => t.includes('Datum:'));
    if (r) {
      const val = r.m[1];
      const start = r.m.index + r.m[0].length - val.length;
      fields.datum = { value: val, bbox: bboxForRange(r.line, start, start + val.length) };
    }

    r = firstMatch(lines, /Streckenabschnitt\s+Von\s+(\S+)\s+nach\s+(.+)$/, t => t.includes('Streckenabschnitt'));
    if (r) {
      const nvt = r.m[1];
      const addr = r.m[2].trim();
      const nvtStart = r.m.index + r.m[0].indexOf('Von') + 4;
      fields.nvt = { value: nvt, bbox: bboxForRange(r.line, nvtStart, nvtStart + nvt.length) };
      const addrStart = r.line.text.lastIndexOf(addr);
      fields.adresse = { value: addr, bbox: bboxForRange(r.line, addrStart, addrStart + addr.length) };
    }

    r = firstMatch(lines, /Bediener:\s*(.+)$/, t => t.includes('Bediener:'));
    if (r) {
      const val = r.m[1].trim();
      const start = r.line.text.lastIndexOf(val);
      fields.bediener = { value: val, bbox: bboxForRange(r.line, start, start + val.length) };
    }

    r = firstMatch(lines, /Fasern:\s*(\d+)/, t => t.includes('Fasern:'));
    if (r) {
      const val = r.m[1];
      const start = r.m.index + r.m[0].length - val.length;
      fields.fasern = { value: val, bbox: bboxForRange(r.line, start, start + val.length) };
    }

    r = firstMatch(lines, /Strecke:\s*([\d,]+)\s*m/, t => t.includes('Strecke:'));
    if (r) {
      const val = r.m[1];
      const start = r.m.index + r.m[0].indexOf(val);
      fields.strecke = { value: val, bbox: bboxForRange(r.line, start, start + val.length) };
    }

    return fields;
  }

  async function extractFromPdf(pdfBytes) {
    const lines = await getLines(pdfBytes);
    return { lines, fields: extract(lines) };
  }

  return { extractFromPdf };
})();
