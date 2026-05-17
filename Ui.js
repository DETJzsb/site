/**
 * ui.js
 * ACS Tracker — UI Utility Layer
 * Toast notifications, modal control, table rendering, DOM helpers.
 */

const UI = (() => {

  /* ── Toast ────────────────────────────────────────── */
  let _toastContainer = null;

  function _getToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.getElementById('toast-container');
      if (!_toastContainer) {
        _toastContainer = document.createElement('div');
        _toastContainer.id = 'toast-container';
        _toastContainer.className = 'toast-container';
        document.body.appendChild(_toastContainer);
      }
    }
    return _toastContainer;
  }

  function toast(message, type = 'info', duration = 3500) {
    const container = _getToastContainer();
    const el = document.createElement('div');
    el.className = `toast ${type}`;

    const icon = { success: '✓', error: '✕', info: 'ℹ' }[type] || '•';
    el.innerHTML = `<span style="opacity:0.7;font-size:0.9em;">${icon}</span><span>${message}</span>`;

    container.appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  }

  /* ── Loading overlay ──────────────────────────────── */
  function showLoading(text = 'LOADING DATA...', detail = '') {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    const textEl   = overlay.querySelector('.loading-text');
    const detailEl = overlay.querySelector('.loading-detail');
    if (textEl)   textEl.textContent   = text;
    if (detailEl) detailEl.textContent = detail;
    overlay.classList.add('visible');
  }

  function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('visible');
  }

  function updateLoadingDetail(detail) {
    const detailEl = document.querySelector('#loading-overlay .loading-detail');
    if (detailEl) detailEl.textContent = detail;
  }

  /* ── Status dot ───────────────────────────────────── */
  function setStatus(state, label) {
    const dot  = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (dot) {
      dot.className = 'status-dot ' + state;
    }
    if (text && label) text.textContent = label;
  }

  /* ── Modal ────────────────────────────────────────── */
  let _activeModal = null;

  function openModal(id) {
    const backdrop = document.getElementById(id);
    if (!backdrop) return;
    backdrop.classList.add('visible');
    _activeModal = backdrop;

    const firstInput = backdrop.querySelector('input, select, textarea');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(id);
    }, { once: true });
  }

  function closeModal(id) {
    const backdrop = id
      ? document.getElementById(id)
      : _activeModal;
    if (backdrop) backdrop.classList.remove('visible');
    _activeModal = null;
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop.visible').forEach(el => el.classList.remove('visible'));
    _activeModal = null;
  }

  // ESC key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  /* ── Stats cards ──────────────────────────────────── */
  function updateStatCard(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  /* ── Results table ────────────────────────────────── */

  /**
   * Render search results into the table.
   * @param {Array} records - unified record objects
   * @param {string} query  - search query for highlighting
   */
  function renderResultsTable(records, query) {
    const section = document.getElementById('results-section');
    const tbody   = document.getElementById('results-tbody');
    const countEl = document.getElementById('results-count');
    const emptyEl = document.getElementById('results-empty');

    if (!section || !tbody) return;

    section.classList.remove('hidden');

    if (countEl) countEl.textContent = records.length + ' RESULT' + (records.length !== 1 ? 'S' : '');

    tbody.innerHTML = '';

    if (records.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    const frag = document.createDocumentFragment();

    records.forEach((rec, i) => {
      const tr = document.createElement('tr');
      tr.style.animationDelay = Math.min(i * 20, 300) + 'ms';

      tr.innerHTML = `
        <td class="cell-matnr">${hl(rec.matnr, query)}</td>
        <td class="cell-accessoire">${hl(rec.accessoire || '—', query)}</td>
        <td>${rec.buffer ? `<span class="badge badge-buffer">${esc(rec.buffer)}</span>` : '<span class="text-muted">—</span>'}</td>
        <td>${rec.section ? `<span class="badge badge-section">${esc(rec.section)}</span>` : '<span class="text-muted">—</span>'}</td>
        <td>${rec.ligne  ? `<span class="badge badge-ligne">${esc(rec.ligne)}</span>` : '<span class="text-muted">—</span>'}</td>
        <td class="cell-position">${esc(rec.position || '—')}</td>
        <td class="cell-rack">${esc(rec.rack || '—')}</td>
        <td class="cell-bg">${esc(rec.bg || '—')}</td>
      `;

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  function clearResultsTable() {
    const section = document.getElementById('results-section');
    if (section) section.classList.add('hidden');
    const tbody = document.getElementById('results-tbody');
    if (tbody) tbody.innerHTML = '';
  }

  /* ── Highlighting ─────────────────────────────────── */
  function hl(text, query) {
    if (!query || !text) return esc(text || '');
    const safe   = esc(text);
    const safeQ  = esc(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${safeQ})`, 'gi'),
      '<mark style="background:rgba(26,108,245,0.25);color:var(--cyan);border-radius:2px;padding:0 2px;">$1</mark>');
  }

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Recent search chips ──────────────────────────── */
  function renderRecentSearches(terms, onSelect, onClear) {
    const section = document.getElementById('recent-section');
    const chips   = document.getElementById('recent-chips');
    if (!section || !chips) return;

    if (!terms || terms.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    chips.innerHTML = '';

    terms.slice(0, 8).forEach(term => {
      const chip = document.createElement('button');
      chip.className = 'recent-chip';
      chip.innerHTML = `<span style="color:var(--text-dim);font-size:0.65em;">↺</span>${esc(term)}`;
      chip.addEventListener('click', () => onSelect(term));
      chips.appendChild(chip);
    });

    if (onClear) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'recent-chip';
      clearBtn.innerHTML = `<span style="color:var(--red);font-size:0.65em;">✕</span>Clear`;
      clearBtn.style.borderColor = 'rgba(224,53,53,0.2)';
      clearBtn.addEventListener('click', onClear);
      chips.appendChild(clearBtn);
    }
  }

  /* ── Message bar ──────────────────────────────────── */
  function showMessage(containerId, type, text) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const bar = document.createElement('div');
    bar.className = `message-bar ${type}`;
    const icons = { error: '⚠', warning: '⚡', info: 'ℹ', success: '✓' };
    bar.innerHTML = `<span>${icons[type] || '•'}</span><span>${esc(text)}</span>`;

    container.innerHTML = '';
    container.appendChild(bar);

    if (type !== 'error') {
      setTimeout(() => { if (bar.parentNode) bar.remove(); }, 5000);
    }
  }

  function clearMessage(containerId) {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  }

  /* ── Config list item ─────────────────────────────── */
  function buildConfigItem(title, subtitle, actions) {
    const item = document.createElement('div');
    item.className = 'config-item';

    const info = document.createElement('div');
    info.className = 'config-item-info';
    info.innerHTML = `
      <div class="config-item-title">${esc(title)}</div>
      ${subtitle ? `<div class="config-item-sub">${esc(subtitle)}</div>` : ''}
    `;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'config-item-actions';

    actions.forEach(({ label, cls, onClick }) => {
      const btn = document.createElement('button');
      btn.className = `btn btn-sm ${cls}`;
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      actionsDiv.appendChild(btn);
    });

    item.appendChild(info);
    item.appendChild(actionsDiv);
    return item;
  }

  /* ── Suggestions dropdown ─────────────────────────── */
  function renderSuggestions(items, onSelect) {
    const dropdown = document.getElementById('search-suggestions');
    if (!dropdown) return;

    if (!items || items.length === 0) {
      dropdown.classList.remove('visible');
      return;
    }

    dropdown.innerHTML = '';
    items.slice(0, 8).forEach(item => {
      const el = document.createElement('div');
      el.className = 'suggestion-item';
      el.innerHTML = `
        <span class="suggestion-matnr">${esc(item.matnr)}</span>
        <span class="suggestion-name">${esc(item.accessoire || '')}</span>
      `;
      el.addEventListener('click', () => {
        onSelect(item.matnr);
        dropdown.classList.remove('visible');
      });
      dropdown.appendChild(el);
    });

    dropdown.classList.add('visible');
  }

  function hideSuggestions() {
    const dropdown = document.getElementById('search-suggestions');
    if (dropdown) dropdown.classList.remove('visible');
  }

  /* ── Export CSV ───────────────────────────────────── */
  function exportToCsv(records, filename) {
    if (!records || records.length === 0) {
      toast('No results to export', 'error');
      return;
    }

    const headers = ['MATNR', 'Accessoire', 'Buffer', 'Section', 'Ligne', 'Position', 'Rack', 'BG'];
    const rows = records.map(r => [
      r.matnr, r.accessoire, r.buffer, r.section, r.ligne, r.position, r.rack, r.bg
    ].map(v => `"${(v || '').replace(/"/g, '""')}"`));

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `acs_results_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast('Export successful', 'success');
  }

  /* ── Sortable table ───────────────────────────────── */
  let _sortState = { col: null, dir: 'asc' };

  function initSortableHeaders(onSort) {
    document.querySelectorAll('.results-table th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (_sortState.col === col) {
          _sortState.dir = _sortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
          _sortState.col = col;
          _sortState.dir = 'asc';
        }

        document.querySelectorAll('.results-table th').forEach(h => {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(_sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');

        if (onSort) onSort(_sortState.col, _sortState.dir);
      });
    });
  }

  function sortRecords(records, col, dir) {
    if (!col) return records;
    return [...records].sort((a, b) => {
      const va = (a[col] || '').toLowerCase();
      const vb = (b[col] || '').toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  /* ── Public API ───────────────────────────────────── */
  return {
    toast,
    showLoading, hideLoading, updateLoadingDetail,
    setStatus,
    openModal, closeModal, closeAllModals,
    updateStatCard,
    renderResultsTable, clearResultsTable,
    renderRecentSearches,
    showMessage, clearMessage,
    buildConfigItem,
    renderSuggestions, hideSuggestions,
    exportToCsv,
    initSortableHeaders, sortRecords,
    esc,
  };

})();
