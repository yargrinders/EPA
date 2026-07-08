(() => {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const els = {
    drop: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    editor: document.getElementById('editor'),
    fields: document.getElementById('fields'),
    sourceName: document.getElementById('sourceName'),
    generateBtn: document.getElementById('generateBtn'),
    resetBtn: document.getElementById('resetBtn'),
    error: document.getElementById('error'),
    loader: document.getElementById('loader'),
    steps: document.getElementById('steps'),
    result: document.getElementById('result'),
    downloadLink: document.getElementById('downloadLink'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    againBtn: document.getElementById('againBtn'),
  };

  let RULES = null;
  let state = null; // { fileName, pdfBytes, fields, lines }

  const STEP_DEFS = [
    'PDF wird gelesen',
    'Felder werden erkannt',
    'Tabellen werden befüllt',
    'PDF wird aktualisiert',
    'Archiv wird gepackt',
  ];

  init();

  async function init() {
    RULES = await fetch('json/rules.json').then(r => r.json());
    wireDropzone();
    els.generateBtn.addEventListener('click', onGenerate);
    els.resetBtn.addEventListener('click', resetApp);
    els.againBtn.addEventListener('click', resetApp);
  }

  function wireDropzone() {
    const drop = els.drop;
    ['dragenter', 'dragover'].forEach(evt =>
      drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('drop--active'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('drop--active'); })
    );
    drop.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    drop.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', e => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });
  }

  async function handleFile(file) {
    hideError();
    if (!/\.pdf$/i.test(file.name)) {
      showError('Bitte ein PDF-Einblas-Protokoll ablegen.');
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      // Важно: pdf.js может забрать/отсоединить ArrayBuffer при чтении.
      // Поэтому для парсинга и для последующего pdf-lib редактирования держим разные копии.
      const bytesForParsing = new Uint8Array(buf.slice(0));
      const bytesForArchive = new Uint8Array(buf.slice(0));
      const { lines, fields } = await PdfFields.extractFromPdf(bytesForParsing);

      if (!fields.bauvorhaben_nr && !fields.firma) {
        showError('Im PDF wurden keine bekannten Felder gefunden. Ist es ein Einblas-Protokoll?');
        return;
      }

      state = { fileName: file.name, pdfBytes: bytesForArchive, fields, lines };
      renderEditor();
    } catch (err) {
      console.error(err);
      showError('Die PDF-Datei konnte nicht gelesen werden: ' + err.message);
    }
  }

  function renderEditor() {
    els.sourceName.textContent = state.fileName;
    els.fields.innerHTML = '';

    for (const def of RULES.pdf_fields) {
      const f = state.fields[def.key];
      const row = document.createElement('div');
      row.className = 'field';
      const label = document.createElement('label');
      label.textContent = def.label;
      label.setAttribute('for', 'f_' + def.key);
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'f_' + def.key;
      input.className = 'field__input field__input--marked';
      input.value = f ? f.value : '';
      input.dataset.key = def.key;
      if (!f) input.placeholder = 'nicht erkannt – bitte eintragen';
      row.appendChild(label);
      row.appendChild(input);
      els.fields.appendChild(row);
    }

    for (const def of RULES.manual_fields) {
      const row = document.createElement('div');
      row.className = 'field';
      const label = document.createElement('label');
      label.textContent = def.label;
      label.setAttribute('for', 'f_' + def.key);
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'f_' + def.key;
      input.className = 'field__input';
      input.dataset.key = def.key;
      row.appendChild(label);
      row.appendChild(input);
      els.fields.appendChild(row);
    }

    els.drop.hidden = true;
    els.editor.hidden = false;
    els.result.hidden = true;
  }

  function readFormValues() {
    const values = {};
    els.fields.querySelectorAll('input').forEach(inp => {
      values[inp.dataset.key] = inp.value.trim();
    });
    return values;
  }

  function parseGermanNumber(str) {
    if (!str) return NaN;
    return parseFloat(str.replace(/[^\d,.\-]/g, '').replace(',', '.'));
  }

  function reformatDatumFull(raw) {
    // "27.04.26" -> "27.04.2026" ; leaves already-4-digit years alone
    const m = /^(\d{2})\.(\d{2})\.(\d{2,4})$/.exec(raw.trim());
    if (!m) return raw;
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) < 70 ? '20' : '19') + y;
    return `${d}.${mo}.${y}`;
  }

  async function onGenerate() {
    hideError();
    const values = readFormValues();

    const fasern = values.fasern;
    if (!RULES.fasern_allowed.map(String).includes(fasern)) {
      showError(`Fasern muss einer von ${RULES.fasern_allowed.join(', ')} sein (gelesen: "${fasern}").`);
      return;
    }
    const streckeNum = parseGermanNumber(values.strecke);
    if (Number.isNaN(streckeNum)) {
      showError(`Strecke ist keine gültige Zahl ("${values.strecke}").`);
      return;
    }

    showLoader();
    try {
      setStep(0, 'done'); // pdf already read at drop time

      setStep(1, 'active');
      const bediener = values.bediener.split(',').map(s => s.trim()).filter(Boolean);
      const bedienerFirst = bediener[0] || '';
      const bedienerRest = bediener.slice(1).join(', ');
      const datumFull = reformatDatumFull(values.datum);
      const ortStrCombined = values.ort ? `${values.ort}, ${values.adresse}` : values.adresse;
      setStep(1, 'done');

      setStep(2, 'active');
      const computed = {
        firma: values.firma,
        bauvorhaben_nr: values.bauvorhaben_nr,
        datum: values.datum,
        nvt: values.nvt,
        adresse: values.adresse,
        ort: values.ort,
        ort_str_combined: ortStrCombined,
        bediener_1: bedienerFirst,
        bediener_rest: bedienerRest,
      };
      // datum target for matliste needs the reformatted 4-digit year; handled per-target below

      const editsByFile = { aufmass: [], matliste: [] };

      for (const [key, targets] of Object.entries(RULES.targets)) {
        if (key === 'strecke') continue; // handled separately (conditional row)
        const raw = computed[key];
        if (raw === undefined) continue;
        for (const t of targets) {
          let val = t.reformat === 'DD.MM.YYYY' ? datumFull : raw;
          const prefix = t.prefix || '';
          const finalVal = prefix ? (prefix + (val || '')) : (val === '' ? null : val);
          editsByFile[t.file].push({ sheet: t.sheet, ref: t.cell, value: finalVal });
        }
      }

      // Strecke: goes to Aufmaß!D7 always, and to exactly one row in Mat-Liste
      // depending on Fasern; the other four rows are cleared.
      const streckeTargets = RULES.targets.strecke;
      const aufmassTarget = streckeTargets.find(t => t.file === 'aufmass');
      editsByFile.aufmass.push({ sheet: aufmassTarget.sheet, ref: aufmassTarget.cell, value: streckeNum });

      const matTarget = streckeTargets.find(t => t.file === 'matliste');
      const row = RULES.fasern_rows[fasern];
      for (const sibling of matTarget.clear_siblings) {
        editsByFile.matliste.push({ sheet: matTarget.sheet, ref: sibling, value: null });
      }
      editsByFile.matliste.push({ sheet: matTarget.sheet, ref: 'D' + row, value: streckeNum });

      // Always clear the stale example hours in Zeiten (no PDF field feeds these)
      editsByFile.aufmass.push({ sheet: 'Zeiten', ref: 'D5', value: null });
      editsByFile.aufmass.push({ sheet: 'Zeiten', ref: 'G5', value: null });

      const aufmassMeta = RULES.files.aufmass;
      const matlisteMeta = RULES.files.matliste;
      const [aufmassTplBytes, matlisteTplBytes] = await Promise.all([
        fetch(aufmassMeta.path).then(r => r.arrayBuffer()),
        fetch(matlisteMeta.path).then(r => r.arrayBuffer()),
      ]);

      const [aufmassOut, matlisteOut] = await Promise.all([
        XlsxPatch.patch(aufmassTplBytes, aufmassMeta.sheets, editsByFile.aufmass),
        XlsxPatch.patch(matlisteTplBytes, matlisteMeta.sheets, editsByFile.matliste),
      ]);
      setStep(2, 'done');

      setStep(3, 'active');
      const overlays = [];
      for (const def of RULES.pdf_fields) {
        const original = state.fields[def.key];
        if (!original) continue;
        const newVal = values[def.key];
        if (newVal !== original.value && original.bbox) {
          overlays.push({ bbox: original.bbox, text: newVal });
        }
      }
      const finalPdfBytes = await PdfEdit.applyOverlays(state.pdfBytes, overlays);
      setStep(3, 'done');

      setStep(4, 'active');
      const zip = new JSZip();
      const baseName = state.fileName.replace(/\.pdf$/i, '');
      zip.file(baseName + '.pdf', finalPdfBytes);
      zip.file(aufmassMeta.name, aufmassOut);
      zip.file(matlisteMeta.name, matlisteOut);
      const zipBlob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE' },
        meta => setProgress(meta.percent || 0)
      );
      setStep(4, 'done');

      const url = URL.createObjectURL(zipBlob);
      els.downloadLink.href = url;
      els.downloadLink.download = baseName + '.zip';
      els.downloadLink.textContent = baseName + '.zip herunterladen';

      hideLoader();
      els.editor.hidden = true;
      els.result.hidden = false;

      // Try automatic download; the visible button remains as fallback if the browser blocks it.
      setTimeout(() => els.downloadLink.click(), 100);
    } catch (err) {
      console.error(err);
      hideLoader();
      showError('Fehler beim Erstellen des Archivs: ' + err.message);
    }
  }

  function showLoader() {
    els.steps.innerHTML = '';
    setProgress(0);
    STEP_DEFS.forEach((label, i) => {
      const li = document.createElement('li');
      li.id = 'step_' + i;
      li.textContent = label;
      els.steps.appendChild(li);
    });
    els.loader.hidden = false;
  }
  function setStep(i, status) {
    const li = document.getElementById('step_' + i);
    if (li) li.className = 'step--' + status;
  }
  function setProgress(percent) {
    if (!els.progressBar || !els.progressText) return;
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    els.progressBar.style.width = p + '%';
    els.progressText.textContent = p + '%';
  }

  function hideLoader() { els.loader.hidden = true; }

  function showError(msg) { els.error.textContent = msg; els.error.hidden = false; }
  function hideError() { els.error.hidden = true; els.error.textContent = ''; }

  function resetApp() {
    state = null;
    els.fileInput.value = '';
    els.drop.hidden = false;
    els.editor.hidden = true;
    els.result.hidden = true;
    hideError();
  }
})();
