/* ═══════════════════════════════════════════════════
   CABLECHECK — app.js
   ═══════════════════════════════════════════════════ */
'use strict';

// ── State ────────────────────────────────────────
const state = {
  bedarfData: null,
  checkData:  null,
  results:    [],
  filter:     'all'
};

// ── DOM helpers ──────────────────────────────────
const $ = id => document.getElementById(id);

// ── Page switch ──────────────────────────────────
function showPage(name) {
  $('page-upload').classList.toggle('active', name === 'upload');
  $('page-results').classList.toggle('active', name === 'results');

  // Step indicator
  $('sn1').classList.toggle('active', name === 'upload');
  $('sn2').classList.toggle('active', name === 'results');
}

// ── Excel parser ─────────────────────────────────
function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Status row helper ─────────────────────────────
function setStatus(elId, type, text) {
  const el = $(elId);
  const iconWrap = el.querySelector('.fsr-icon');
  const textEl = el.querySelector('.fsr-text');
  textEl.textContent = text;
  iconWrap.className = 'fsr-icon fsr-' + type;

  const icons = {
    idle: `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/><line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="11.5" r=".8" fill="currentColor"/></svg>`,
    ok:   `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/><path d="M5 8l2.5 2.5L11 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    err:  `<svg viewBox="0 0 16 16" fill="none" width="14" height="14"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/><line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
  };
  iconWrap.innerHTML = icons[type] || icons.idle;
}

// ── Update readiness ──────────────────────────────
function updateReady() {
  const bothReady = state.bedarfData && state.checkData;
  const half = state.bedarfData || state.checkData;
  $('progressFill').style.width = bothReady ? '100%' : (half ? '50%' : '0%');
  $('btnRun').disabled = !bothReady;
  $('runHint').textContent = bothReady
    ? `✓ ${state.checkData.length} cables to validate against ${state.bedarfData.length} Bedarf entries — ready!`
    : (half ? 'One more file needed.' : 'Upload both files to unlock validation.');
}

// ── File handlers ─────────────────────────────────
async function handleBedarf(file) {
  setStatus('statusBedarf', 'idle', 'Reading…');
  try {
    const rows = await parseExcel(file);
    if (!rows.length) throw new Error('No data found');
    const keys = Object.keys(rows[0]);
    const cableKey = keys.find(k => /cable/i.test(k));
    const usageKey = keys.find(k => /usage|verbrauch/i.test(k));
    const besoKey  = keys.find(k => /beso/i.test(k));
    if (!cableKey) throw new Error('Cable column not found');
    if (!usageKey) throw new Error('Usage % column not found');
    if (!besoKey)  throw new Error('BESO column not found');

    state.bedarfData = rows.map(r => ({
      cable: String(r[cableKey]).trim(),
      usage: parseFloat(r[usageKey]) || 0,
      beso:  parseFloat(r[besoKey])  ?? 0,
    }));

    const name = file.name.length > 36 ? file.name.slice(0, 33) + '…' : file.name;
    setStatus('statusBedarf', 'ok', `✔ ${name} — ${rows.length} rows loaded`);
    $('card-bedarf').classList.add('loaded');
  } catch (err) {
    setStatus('statusBedarf', 'err', `✘ ${err.message}`);
    state.bedarfData = null;
    $('card-bedarf').classList.remove('loaded');
  }
  updateReady();
}

async function handleCheck(file) {
  setStatus('statusCheck', 'idle', 'Reading…');
  try {
    const rows = await parseExcel(file);
    if (!rows.length) throw new Error('No data found');
    const keys = Object.keys(rows[0]);
    const cableKey = keys.find(k => /cable/i.test(k)) || keys[0];
    if (!cableKey) throw new Error('Cable column not found');

    state.checkData = rows.map(r => String(r[cableKey]).trim()).filter(Boolean);

    const name = file.name.length > 36 ? file.name.slice(0, 33) + '…' : file.name;
    setStatus('statusCheck', 'ok', `✔ ${name} — ${rows.length} rows loaded`);
    $('card-check').classList.add('loaded');
  } catch (err) {
    setStatus('statusCheck', 'err', `✘ ${err.message}`);
    state.checkData = null;
    $('card-check').classList.remove('loaded');
  }
  updateReady();
}

// ── Drag & Drop ───────────────────────────────────
function setupDrop(zoneId, handler) {
  const zone = $(zoneId);
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

// ── Validation logic ──────────────────────────────
function runValidation() {
  const map = new Map();
  state.bedarfData.forEach(r => map.set(r.cable.toLowerCase(), r));

  state.results = state.checkData.map(cable => {
    const entry = map.get(cable.toLowerCase());
    if (!entry)        return { cable, usage: '—', beso: '—', status: 'ERROR',   reason: 'Not in Bedarf' };
    if (entry.usage >= 50) return { cable, usage: entry.usage, beso: entry.beso, status: 'ERROR',   reason: 'Usage too high' };
    if (entry.beso === 0)  return { cable, usage: entry.usage, beso: entry.beso, status: 'WARNING', reason: 'No besoin' };
    return                        { cable, usage: entry.usage, beso: entry.beso, status: 'OK',      reason: '—' };
  });
}

// ── Donut chart ───────────────────────────────────
function updateDonut(ok, warn, err, total) {
  const circ = 2 * Math.PI * 40; // 251.2
  const pct  = total > 0 ? Math.round((ok / total) * 100) : 0;
  $('donutPct').textContent = total > 0 ? pct + '%' : '—';

  if (total === 0) return;
  const okSlice   = (ok   / total) * circ;
  const warnSlice = (warn / total) * circ;
  const errSlice  = (err  / total) * circ;

  // Each circle stacks: use dashoffset to position
  const dOk   = $('d-ok');
  const dWarn = $('d-warn');
  const dErr  = $('d-err');

  // offset starts at 0 (top, since transform:rotate(-90deg))
  dOk.style.strokeDasharray   = `${okSlice} ${circ - okSlice}`;
  dOk.style.strokeDashoffset  = '0';

  const warnOffset = -(okSlice);
  dWarn.style.strokeDasharray  = `${warnSlice} ${circ - warnSlice}`;
  dWarn.style.strokeDashoffset = warnOffset;

  const errOffset = -(okSlice + warnSlice);
  dErr.style.strokeDasharray  = `${errSlice} ${circ - errSlice}`;
  dErr.style.strokeDashoffset = errOffset;
}

// ── Summary ───────────────────────────────────────
function renderSummary() {
  const total = state.results.length;
  const ok    = state.results.filter(r => r.status === 'OK').length;
  const warn  = state.results.filter(r => r.status === 'WARNING').length;
  const err   = state.results.filter(r => r.status === 'ERROR').length;

  $('sumTotal').textContent = total;
  $('sumOk').textContent    = ok;
  $('sumWarn').textContent  = warn;
  $('sumErr').textContent   = err;

  $('resultsMeta').textContent = `${total} cable${total !== 1 ? 's' : ''} validated · ${err} error${err !== 1 ? 's' : ''} · ${warn} warning${warn !== 1 ? 's' : ''}`;

  setTimeout(() => updateDonut(ok, warn, err, total), 80);
}

// ── Table ─────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function badgeHtml(status) {
  const icons = {
    OK:      `<svg viewBox="0 0 12 12" fill="none" width="11" height="11"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 6l2 2L8.5 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    WARNING: `<svg viewBox="0 0 12 12" fill="none" width="11" height="11"><path d="M6 1L1 11h10L6 1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><line x1="6" y1="5" x2="6" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    ERROR:   `<svg viewBox="0 0 12 12" fill="none" width="11" height="11"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><line x1="4" y1="4" x2="8" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><line x1="8" y1="4" x2="4" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`
  };
  const cls = { OK: 'badge-ok', WARNING: 'badge-warn', ERROR: 'badge-err' };
  return `<span class="badge ${cls[status]}">${icons[status]}${status}</span>`;
}

function renderTable() {
  const rows = state.filter === 'all'
    ? state.results
    : state.results.filter(r => r.status === state.filter);

  const noRows = $('noResults');
  const body   = $('resultsBody');

  if (!rows.length) {
    body.innerHTML = '';
    noRows.style.display = 'flex';
    return;
  }
  noRows.style.display = 'none';

  body.innerHTML = rows.map((r, i) => {
    const rowCls = r.status === 'OK' ? 'row-ok' : r.status === 'WARNING' ? 'row-warn' : 'row-err';
    const usageTd = r.usage === '—'
      ? '<td>—</td>'
      : `<td class="${r.usage >= 50 ? 'row-usage-high' : ''}">${r.usage}%</td>`;
    const besoTd = r.beso === '—'
      ? '<td>—</td>'
      : `<td class="${r.beso === 0 ? 'row-beso-zero' : ''}">${r.beso}</td>`;

    return `
      <tr class="${rowCls}">
        <td class="row-num">${i + 1}</td>
        <td class="row-cable">${esc(r.cable)}</td>
        ${usageTd}
        ${besoTd}
        <td>${badgeHtml(r.status)}</td>
        <td class="row-reason">${esc(r.reason)}</td>
      </tr>`;
  }).join('');
}

// ── Events ────────────────────────────────────────
$('inputBedarf').addEventListener('change', e => { if (e.target.files[0]) handleBedarf(e.target.files[0]); });
$('inputCheck').addEventListener('change',  e => { if (e.target.files[0]) handleCheck(e.target.files[0]); });

setupDrop('dropBedarf', handleBedarf);
setupDrop('dropCheck',  handleCheck);

$('btnRun').addEventListener('click', () => {
  runValidation();
  renderSummary();
  state.filter = 'all';
  document.querySelectorAll('.fbtn').forEach(b => b.classList.toggle('fbtn-active', b.dataset.filter === 'all'));
  renderTable();
  showPage('results');
});

$('btnBack').addEventListener('click', () => showPage('upload'));

document.querySelectorAll('.fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    document.querySelectorAll('.fbtn').forEach(b => b.classList.toggle('fbtn-active', b === btn));
    renderTable();
  });
});

// ── Init ──────────────────────────────────────────
showPage('upload');
