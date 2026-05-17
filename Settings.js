/**
 * settings.js
 * ACS Tracker — Settings Page Controller
 *
 * Handles:
 * - BG management (add/edit/delete)
 * - Production line management (add/edit/delete)
 * - Buffer configuration
 * - Sheet connection testing
 * - Config export/import
 */

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Settings] Initializing...');

  renderBufferList();
  renderBGList();
  renderLineSummary();
  bindEvents();
  updateSettingsCounts();

  // Deep-link to section via hash
  const hash = location.hash.replace('#', '');
  if (hash) scrollToSection(hash);
});

/* ═══════════════════════════════════════════════════════════
   SECTIONS / CONSTANTS
═══════════════════════════════════════════════════════════ */
const SECTIONS = ['MM', 'BASIS', 'THS', 'COC', 'INR'];
const BUFFER_TYPES = ['Puffer MM', 'Puffer INR', 'Puffer Palette', 'Puffer BS'];

/* ═══════════════════════════════════════════════════════════
   BIND EVENTS
═══════════════════════════════════════════════════════════ */
function bindEvents() {
  /* ── Add Buffer ── */
  document.getElementById('btn-add-buffer')?.addEventListener('click', () => {
    openAddBufferModal();
  });

  /* ── Add BG ── */
  document.getElementById('btn-add-bg')?.addEventListener('click', () => {
    openAddBGModal();
  });

  /* ── Add Line ── */
  document.getElementById('btn-add-line')?.addEventListener('click', () => {
    openAddLineModal();
  });

  /* ── Export config ── */
  document.getElementById('btn-export-config')?.addEventListener('click', exportConfig);

  /* ── Import config ── */
  document.getElementById('btn-import-config')?.addEventListener('click', () => {
    document.getElementById('import-file-input')?.click();
  });
  document.getElementById('import-file-input')?.addEventListener('change', importConfig);

  /* ── Reset config ── */
  document.getElementById('btn-reset-config')?.addEventListener('click', () => {
    if (confirm('⚠ Reset ALL configuration? This cannot be undone.')) {
      Storage.resetConfig();
      UI.toast('Configuration reset', 'info');
      location.reload();
    }
  });

  /* ── Clear cache ── */
  document.getElementById('btn-clear-cache')?.addEventListener('click', () => {
    Storage.clearCache();
    UI.toast('Sheet cache cleared', 'success');
  });

  /* ── Sidebar nav ── */
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.section;
      if (target) scrollToSection(target);
      document.querySelectorAll('.sidebar-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  /* ── Modal close buttons ── */
  document.querySelectorAll('.modal-close, [data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => UI.closeAllModals());
  });

  /* ── Buffer modal ── */
  document.getElementById('buffer-modal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveBuffer();
  });

  /* ── BG modal ── */
  document.getElementById('bg-modal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveBG();
  });

  /* ── Line modal ── */
  document.getElementById('line-modal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveLine();
  });

  /* ── Test connection buttons ── */
  document.getElementById('btn-test-buffer-url')?.addEventListener('click', () => {
    testUrl('buffer-url-input', 'buffer-test-result');
  });
  document.getElementById('btn-test-line-url')?.addEventListener('click', () => {
    testUrl('line-url-input', 'line-test-result');
  });

  /* ── URL preview live update ── */
  document.getElementById('buffer-url-input')?.addEventListener('input', (e) => {
    updateUrlPreview('buffer-url-preview', e.target.value);
  });
  document.getElementById('line-url-input')?.addEventListener('input', (e) => {
    updateUrlPreview('line-url-preview', e.target.value);
  });
}

/* ═══════════════════════════════════════════════════════════
   BUFFER MANAGEMENT
═══════════════════════════════════════════════════════════ */
let _editingBufferId = null;

function openAddBufferModal(existingId = null) {
  _editingBufferId = existingId;
  const cfg = Storage.getConfig();

  const nameInput = document.getElementById('buffer-name-select');
  const urlInput  = document.getElementById('buffer-url-input');
  const testEl    = document.getElementById('buffer-test-result');
  const preview   = document.getElementById('buffer-url-preview');
  const title     = document.getElementById('buffer-modal-title');

  if (testEl)   testEl.innerHTML = '';
  if (preview)  preview.textContent = '';

  // Populate buffer name dropdown
  if (nameInput) {
    nameInput.innerHTML = BUFFER_TYPES.map(t =>
      `<option value="${t}">${t}</option>`
    ).join('');
  }

  if (existingId) {
    const buf = cfg.buffers.find(b => b.id === existingId);
    if (buf) {
      if (nameInput) nameInput.value = buf.name;
      if (urlInput)  urlInput.value  = buf.sheetUrl || '';
      if (title)     title.textContent = 'EDIT BUFFER';
      updateUrlPreview('buffer-url-preview', buf.sheetUrl);
    }
  } else {
    if (urlInput)  urlInput.value  = '';
    if (title)     title.textContent = 'ADD BUFFER';
  }

  UI.openModal('buffer-modal');
}

function saveBuffer() {
  const name     = document.getElementById('buffer-name-select')?.value;
  const sheetUrl = document.getElementById('buffer-url-input')?.value.trim();

  if (!name || !sheetUrl) {
    UI.toast('Please fill all fields', 'error');
    return;
  }

  if (_editingBufferId) {
    Storage.updateBuffer(_editingBufferId, { name, sheetUrl });
    UI.toast('Buffer updated', 'success');
  } else {
    Storage.addBuffer({ name, sheetUrl });
    UI.toast('Buffer added', 'success');
  }

  UI.closeAllModals();
  renderBufferList();
  updateSettingsCounts();
}

function renderBufferList() {
  const container = document.getElementById('buffer-list');
  if (!container) return;

  const cfg = Storage.getConfig();
  container.innerHTML = '';

  if (cfg.buffers.length === 0) {
    container.innerHTML = `<p class="text-muted mono" style="font-size:0.75rem;letter-spacing:1px;">No buffers configured yet.</p>`;
    return;
  }

  cfg.buffers.forEach(buf => {
    const item = UI.buildConfigItem(
      buf.name,
      buf.sheetUrl ? shortenUrl(buf.sheetUrl) : '— No URL configured —',
      [
        { label: 'Edit',   cls: 'btn-secondary', onClick: () => openAddBufferModal(buf.id) },
        { label: 'Delete', cls: 'btn-danger',    onClick: () => deleteBuffer(buf.id) },
      ]
    );
    container.appendChild(item);
  });
}

function deleteBuffer(id) {
  if (!confirm('Delete this buffer configuration?')) return;
  Storage.removeBuffer(id);
  renderBufferList();
  updateSettingsCounts();
  UI.toast('Buffer removed', 'info');
}

/* ═══════════════════════════════════════════════════════════
   BG MANAGEMENT
═══════════════════════════════════════════════════════════ */
let _editingBGId = null;

function openAddBGModal(existingId = null) {
  _editingBGId = existingId;
  const cfg = Storage.getConfig();
  const nameInput = document.getElementById('bg-name-input');
  const title     = document.getElementById('bg-modal-title');

  if (existingId) {
    const bg = cfg.bgs.find(b => b.id === existingId);
    if (bg && nameInput) nameInput.value = bg.name;
    if (title) title.textContent = 'EDIT BG';
  } else {
    if (nameInput) nameInput.value = '';
    if (title) title.textContent = 'ADD BG';
  }

  UI.openModal('bg-modal');
}

function saveBG() {
  const name = document.getElementById('bg-name-input')?.value.trim();
  if (!name) {
    UI.toast('Please enter a BG name', 'error');
    return;
  }

  if (_editingBGId) {
    Storage.updateBG(_editingBGId, { name });
    UI.toast('BG updated', 'success');
  } else {
    Storage.addBG({ name, lines: [] });
    UI.toast(`BG "${name}" added`, 'success');
  }

  UI.closeAllModals();
  renderBGList();
  refreshBGDropdown();
  renderLineSummary();
  updateSettingsCounts();
}

function renderBGList() {
  const container = document.getElementById('bg-list');
  if (!container) return;

  const cfg = Storage.getConfig();
  container.innerHTML = '';

  if (cfg.bgs.length === 0) {
    container.innerHTML = `<p class="text-muted mono" style="font-size:0.75rem;letter-spacing:1px;">No BGs configured yet.</p>`;
    return;
  }

  cfg.bgs.forEach(bg => {
    const lineCount = (bg.lines || []).length;
    const item = UI.buildConfigItem(
      bg.name,
      `${lineCount} production line${lineCount !== 1 ? 's' : ''}`,
      [
        { label: 'Edit',   cls: 'btn-secondary', onClick: () => openAddBGModal(bg.id) },
        { label: 'Delete', cls: 'btn-danger',    onClick: () => deleteBG(bg.id) },
      ]
    );
    container.appendChild(item);
  });
}

function deleteBG(id) {
  const cfg = Storage.getConfig();
  const bg  = cfg.bgs.find(b => b.id === id);
  if (!bg) return;
  if (!confirm(`Delete BG "${bg.name}" and ALL its lines?`)) return;

  Storage.removeBG(id);
  renderBGList();
  refreshBGDropdown();
  renderLineSummary();
  updateSettingsCounts();
  UI.toast('BG removed', 'info');
}

/* ═══════════════════════════════════════════════════════════
   LINE MANAGEMENT
═══════════════════════════════════════════════════════════ */
let _editingLineId   = null;
let _editingLineBGId = null;

function openAddLineModal(bgId = null, lineId = null) {
  _editingLineId   = lineId;
  _editingLineBGId = bgId;

  const cfg = Storage.getConfig();

  // Populate BG dropdown
  const bgSelect = document.getElementById('line-bg-select');
  if (bgSelect) {
    bgSelect.innerHTML = cfg.bgs.map(bg =>
      `<option value="${bg.id}">${bg.name}</option>`
    ).join('');
    if (bgId) bgSelect.value = bgId;
  }

  // Populate section dropdown
  const sectionSelect = document.getElementById('line-section-select');
  if (sectionSelect) {
    sectionSelect.innerHTML = SECTIONS.map(s =>
      `<option value="${s}">${s}</option>`
    ).join('');
  }

  const nameInput = document.getElementById('line-name-input');
  const urlInput  = document.getElementById('line-url-input');
  const testEl    = document.getElementById('line-test-result');
  const preview   = document.getElementById('line-url-preview');
  const title     = document.getElementById('line-modal-title');

  if (testEl)  testEl.innerHTML   = '';
  if (preview) preview.textContent = '';

  if (lineId && bgId) {
    const bg   = cfg.bgs.find(b => b.id === bgId);
    const line = (bg?.lines || []).find(l => l.id === lineId);
    if (line) {
      if (nameInput)    nameInput.value    = line.name    || '';
      if (urlInput)     urlInput.value     = line.sheetUrl || '';
      if (sectionSelect) sectionSelect.value = line.section || SECTIONS[0];
      if (title) title.textContent = 'EDIT LINE';
      updateUrlPreview('line-url-preview', line.sheetUrl);
    }
  } else {
    if (nameInput)  nameInput.value  = '';
    if (urlInput)   urlInput.value   = '';
    if (title) title.textContent = 'ADD PRODUCTION LINE';
  }

  UI.openModal('line-modal');
}

function saveLine() {
  const bgId     = document.getElementById('line-bg-select')?.value;
  const section  = document.getElementById('line-section-select')?.value;
  const name     = document.getElementById('line-name-input')?.value.trim();
  const sheetUrl = document.getElementById('line-url-input')?.value.trim();

  if (!bgId || !name || !sheetUrl) {
    UI.toast('Please fill all required fields', 'error');
    return;
  }

  if (_editingLineId && _editingLineBGId) {
    Storage.updateLine(_editingLineBGId, _editingLineId, { section, name, sheetUrl });
    UI.toast('Line updated', 'success');
  } else {
    Storage.addLine(bgId, { section, name, sheetUrl });
    UI.toast(`Line "${name}" added`, 'success');
  }

  UI.closeAllModals();
  renderLineSummary();
  renderBGList();
  updateSettingsCounts();
}

function renderLineSummary() {
  const container = document.getElementById('lines-list');
  if (!container) return;

  const cfg = Storage.getConfig();
  container.innerHTML = '';

  let anyLines = false;

  cfg.bgs.forEach(bg => {
    (bg.lines || []).forEach(line => {
      anyLines = true;
      const item = UI.buildConfigItem(
        `${bg.name} › ${line.section} › ${line.name}`,
        line.sheetUrl ? shortenUrl(line.sheetUrl) : '— No URL configured —',
        [
          { label: 'Edit',   cls: 'btn-secondary', onClick: () => openAddLineModal(bg.id, line.id) },
          { label: 'Delete', cls: 'btn-danger',    onClick: () => deleteLine(bg.id, line.id) },
        ]
      );
      container.appendChild(item);
    });
  });

  if (!anyLines) {
    container.innerHTML = `<p class="text-muted mono" style="font-size:0.75rem;letter-spacing:1px;">No production lines configured yet.</p>`;
  }
}

function deleteLine(bgId, lineId) {
  if (!confirm('Delete this production line?')) return;
  Storage.removeLine(bgId, lineId);
  renderLineSummary();
  renderBGList();
  updateSettingsCounts();
  UI.toast('Line removed', 'info');
}

/* ═══════════════════════════════════════════════════════════
   HELPER: Refresh BG dropdown in line modal
═══════════════════════════════════════════════════════════ */
function refreshBGDropdown() {
  const bgSelect = document.getElementById('line-bg-select');
  if (!bgSelect) return;
  const cfg = Storage.getConfig();
  bgSelect.innerHTML = cfg.bgs.map(bg =>
    `<option value="${bg.id}">${bg.name}</option>`
  ).join('');
}

/* ═══════════════════════════════════════════════════════════
   CONNECTION TESTER
═══════════════════════════════════════════════════════════ */
async function testUrl(inputId, resultId) {
  const url     = document.getElementById(inputId)?.value.trim();
  const resultEl = document.getElementById(resultId);

  if (!url || !resultEl) return;

  resultEl.innerHTML = `<div class="test-result"><span style="color:var(--orange)">⟳ Testing connection...</span></div>`;

  const result = await Sheets.testConnection(url);

  if (result.ok) {
    resultEl.innerHTML = `<div class="test-result success">✓ Connected — ${result.rowCount} rows detected</div>`;
  } else {
    resultEl.innerHTML = `<div class="test-result error">✕ Failed: ${UI.esc(result.error)}</div>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   URL PREVIEW
═══════════════════════════════════════════════════════════ */
function updateUrlPreview(previewId, url) {
  const el = document.getElementById(previewId);
  if (!el) return;

  if (!url) { el.textContent = ''; return; }

  const sheetId = Sheets.extractSheetId(url);
  if (sheetId) {
    el.textContent = `→ CSV: https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  } else {
    el.textContent = '⚠ Could not extract Sheet ID from URL';
  }
}

/* ═══════════════════════════════════════════════════════════
   COUNTS
═══════════════════════════════════════════════════════════ */
function updateSettingsCounts() {
  const cfg = Storage.getConfig();
  const lineCount = cfg.bgs.reduce((acc, bg) => acc + (bg.lines || []).length, 0);

  const el = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  el('count-bgs',     cfg.bgs.length);
  el('count-buffers', cfg.buffers.length);
  el('count-lines',   lineCount);
}

/* ═══════════════════════════════════════════════════════════
   EXPORT / IMPORT CONFIG
═══════════════════════════════════════════════════════════ */
function exportConfig() {
  const cfg  = Storage.getConfig();
  const json = JSON.stringify(cfg, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `acs_config_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  UI.toast('Configuration exported', 'success');
}

function importConfig(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const cfg = JSON.parse(e.target.result);
      if (!cfg.bgs || !cfg.buffers) throw new Error('Invalid config format');

      if (confirm('This will REPLACE your current configuration. Proceed?')) {
        Storage.saveConfig(cfg);
        UI.toast('Configuration imported', 'success');
        location.reload();
      }
    } catch (err) {
      UI.toast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);

  // Reset input
  event.target.value = '';
}

/* ═══════════════════════════════════════════════════════════
   SCROLL TO SECTION
═══════════════════════════════════════════════════════════ */
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ═══════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════ */
function shortenUrl(url) {
  if (!url) return '';
  const id = Sheets.extractSheetId(url);
  return id ? `sheets.google.com/…/${id.substring(0, 12)}…` : url.substring(0, 60) + '…';
}
