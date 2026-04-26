/* =============================================
   CABLE CHECK VALIDATION TOOL — app.js
   ============================================= */

'use strict';

// ── State ──────────────────────────────────────
const state = {
  bedarfData: null,   // parsed rows from Bedarf file
  checkData:  null,   // parsed rows from Check file
  results:    [],     // validation output
  activeFilter: 'all'
};

// ── DOM References ─────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  pageUpload:   $('page-upload'),
  pageResults:  $('page-results'),
  stepIndicator: $('stepIndicator'),

  inputBedarf:  $('inputBedarf'),
  inputCheck:   $('inputCheck'),
  dropBedarf:   $('dropBedarf'),
  dropCheck:    $('dropCheck'),
  cardBedarf:   $('card-bedarf'),
  cardCheck:    $('card-check'),
  statusBedarf: $('statusBedarf'),
  statusCheck:  $('statusCheck'),

  btnRun:       $('btnRun'),
  runHint:      $('runHint'),
  btnBack:      $('btnBack'),

  sumTotal:     $('sumTotal'),
  sumOk:        $('sumOk'),
  sumWarn:      $('sumWarn'),
  sumErr:       $('sumErr'),
  resultsMeta:  $('resultsMeta'),

  resultsBody:  $('resultsBody'),
  noResults:    $('noResults'),
};

// ── Page Navigation ────────────────────────────
function showPage(name) {
  dom.pageUpload.classList.toggle('active', name === 'upload');
  dom.pageResults.classList.toggle('active', name === 'results');

  // Step indicator
  document.querySelectorAll('.step').forEach(el => {
    el.classList.toggle('active', el.dataset.step === (name === 'upload' ? '1' : '2'));
  });
}

// ── Excel Parsing ──────────────────────────────
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsArrayBuffer(file);
  });
}

// ── File Handling ──────────────────────────────
function formatFileName(name) {
  return name.length > 40 ? name.slice(0, 37) + '…' : name;
}

async function handleBedarfFile(file) {
  dom.statusBedarf.textContent = 'Reading…';
  dom.statusBedarf.className = 'file-status';
  try {
    const rows = await parseExcel(file);
    // Flexible column detection
    const sample = rows[0] || {};
    const keys = Object.keys(sample);

    // Find cable col: "Cable (Count Fpr)" or fallback to first col containing "cable"
    const cableKey  = keys.find(k => /cable/i.test(k)) || keys[0];
    const usageKey  = keys.find(k => /usage|verbrauch/i.test(k));
    const besoKey   = keys.find(k => /beso/i.test(k));

    if (!cableKey) throw new Error('Could not find Cable column');
    if (!usageKey) throw new Error('Could not find Usage % column');
    if (!besoKey)  throw new Error('Could not find BESO column');

    state.bedarfData = rows.map(r => ({
      cable: String(r[cableKey]).trim(),
      usage: parseFloat(r[usageKey]) || 0,
      beso:  parseFloat(r[besoKey])  || 0,
    }));

    dom.statusBedarf.textContent = `✔ ${formatFileName(file.name)} — ${rows.length} rows`;
    dom.statusBedarf.className = 'file-status ok';
    dom.cardBedarf.classList.add('loaded');
  } catch (err) {
    dom.statusBedarf.textContent = `✘ ${err.message}`;
    dom.statusBedarf.className = 'file-status err';
    state.bedarfData = null;
    dom.cardBedarf.classList.remove('loaded');
  }
  updateRunButton();
}

async function handleCheckFile(file) {
  dom.statusCheck.textContent = 'Reading…';
  dom.statusCheck.className = 'file-status';
  try {
    const rows = await parseExcel(file);
    const sample = rows[0] || {};
    const keys = Object.keys(sample);
    const cableKey = keys.find(k => /cable/i.test(k)) || keys[0];
    if (!cableKey) throw new Error('Could not find Cable column');

    state.checkData = rows.map(r => String(r[cableKey]).trim()).filter(Boolean);

    dom.statusCheck.textContent = `✔ ${formatFileName(file.name)} — ${rows.length} rows`;
    dom.statusCheck.className = 'file-status ok';
    dom.cardCheck.classList.add('loaded');
  } catch (err) {
    dom.statusCheck.textContent = `✘ ${err.message}`;
    dom.statusCheck.className = 'file-status err';
    state.checkData = null;
    dom.cardCheck.classList.remove('loaded');
  }
  updateRunButton();
}

function updateRunButton() {
  const ready = state.bedarfData && state.checkData;
  dom.btnRun.disabled = !ready;
  dom.runHint.textContent = ready
    ? `Ready — ${state.checkData.length} cables to validate against ${state.bedarfData.length} Bedarf entries.`
    : 'Upload both files to continue.';
}

// ── Validation Logic ───────────────────────────
function runValidation() {
  const bedarfMap = new Map();
  state.bedarfData.forEach(row => {
    bedarfMap.set(row.cable.toLowerCase(), row);
  });

  state.results = state.checkData.map(cable => {
    const key = cable.toLowerCase();
    const entry = bedarfMap.get(key);

    if (!entry) {
      return { cable, usage: '—', beso: '—', status: 'ERROR', reason: 'Not in Bedarf' };
    }

    if (entry.usage >= 50) {
      return { cable, usage: entry.usage, beso: entry.beso, status: 'ERROR', reason: 'Usage too high' };
    }

    if (entry.beso === 0) {
      return { cable, usage: entry.usage, beso: entry.beso, status: 'WARNING', reason: 'No besoin' };
    }

    return { cable, usage: entry.usage, beso: entry.beso, status: 'OK', reason: '—' };
  });
}

// ── Results Rendering ──────────────────────────
function renderSummary() {
  const total = state.results.length;
  const ok    = state.results.filter(r => r.status === 'OK').length;
  const warn  = state.results.filter(r => r.status === 'WARNING').length;
  const err   = state.results.filter(r => r.status === 'ERROR').length;

  dom.sumTotal.textContent = total;
  dom.sumOk.textContent    = ok;
  dom.sumWarn.textContent  = warn;
  dom.sumErr.textContent   = err;

  dom.resultsMeta.textContent =
    `Validated ${total} cable${total !== 1 ? 's' : ''} · ${err} error${err !== 1 ? 's' : ''} · ${warn} warning${warn !== 1 ? 's' : ''}`;
}

function renderTable() {
  const filter = state.activeFilter;
  const rows = filter === 'all'
    ? state.results
    : state.results.filter(r => r.status === filter);

  if (rows.length === 0) {
    dom.resultsBody.innerHTML = '';
    dom.noResults.style.display = 'block';
    return;
  }

  dom.noResults.style.display = 'none';

  dom.resultsBody.innerHTML = rows.map((r, i) => {
    const rowClass = r.status === 'OK' ? 'row-ok'
                   : r.status === 'WARNING' ? 'row-warning'
                   : 'row-error';

    const badgeClass = r.status === 'OK' ? 'badge-ok'
                     : r.status === 'WARNING' ? 'badge-warning'
                     : 'badge-error';

    const usageDisplay = r.usage === '—' ? '—'
      : `<span class="${r.usage >= 50 ? 'cell-high-usage' : ''}">${r.usage}%</span>`;

    const besoDisplay = r.beso === '—' ? '—'
      : `<span class="${r.beso === 0 ? 'cell-zero-beso' : ''}">${r.beso}</span>`;

    return `
      <tr class="${rowClass}">
        <td>${i + 1}</td>
        <td>${escHtml(r.cable)}</td>
        <td>${usageDisplay}</td>
        <td>${besoDisplay}</td>
        <td><span class="badge ${badgeClass}">${r.status}</span></td>
        <td class="reason-cell">${escHtml(r.reason)}</td>
      </tr>
    `;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Event Listeners ────────────────────────────

// File inputs
dom.inputBedarf.addEventListener('change', e => {
  if (e.target.files[0]) handleBedarfFile(e.target.files[0]);
});
dom.inputCheck.addEventListener('change', e => {
  if (e.target.files[0]) handleCheckFile(e.target.files[0]);
});

// Drag & drop — Bedarf
setupDragDrop(dom.dropBedarf, handleBedarfFile);
setupDragDrop(dom.dropCheck, handleCheckFile);

function setupDragDrop(zone, handler) {
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handler(file);
  });
}

// Run button
dom.btnRun.addEventListener('click', () => {
  runValidation();
  renderSummary();
  state.activeFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });
  renderTable();
  showPage('results');
});

// Back button
dom.btnBack.addEventListener('click', () => {
  showPage('upload');
});

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.activeFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
    renderTable();
  });
});

// ── Init ───────────────────────────────────────
showPage('upload');
