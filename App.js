/**
 * app.js
 * ACS Tracker — Main Application Controller
 *
 * Responsibilities:
 * - Load all Google Sheets at startup
 * - Parse and normalize all data into unified records
 * - Build fast search index
 * - Drive instant search UI
 * - Manage recent searches and stats
 */

/* ═══════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════ */
const App = {
  records: [],       // All unified records [{matnr, accessoire, buffer, section, ligne, position, rack, bg}]
  index: [],         // Search index tokens [{tokens[], rec}]
  currentResults: [], // Last search results (for export/sort)
  currentQuery: '',
  sortCol: null,
  sortDir: 'asc',
  isLoading: false,
  stats: {
    totalRecords: 0,
    totalSheets: 0,
    totalBuffers: 0,
    lastSync: null,
  },
};

/* ═══════════════════════════════════════════════════════════
   STARTUP
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[ACS] Initializing...');

  initUI();
  renderRecentSearches();

  const config = Storage.getConfig();
  const hasData = config.bgs.length > 0 || config.buffers.length > 0;

  if (!hasData) {
    showSetupHint();
    UI.setStatus('error', 'NO CONFIG');
    return;
  }

  await loadAllData();
  renderStats();
});

/* ═══════════════════════════════════════════════════════════
   UI INITIALIZATION
═══════════════════════════════════════════════════════════ */
function initUI() {
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const exportBtn   = document.getElementById('export-btn');
  const reloadBtn   = document.getElementById('reload-btn');

  if (searchInput) {
    // Debounced search
    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
      const val = searchInput.value;
      searchClear?.classList.toggle('visible', val.length > 0);

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performSearch(val), 180);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        performSearch(searchInput.value);
        UI.hideSuggestions();
        UI.hideSuggestions();
      }
      if (e.key === 'Escape') {
        UI.hideSuggestions();
      }
    });

    // Hide suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target)) UI.hideSuggestions();
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchClear.classList.remove('visible');
      UI.clearResultsTable();
      UI.hideSuggestions();
      App.currentQuery = '';
      App.currentResults = [];
      renderRecentSearches();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      UI.exportToCsv(App.currentResults, `acs_${App.currentQuery}_${Date.now()}.csv`);
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      Storage.clearCache();
      await loadAllData();
      UI.toast('Data reloaded from Google Sheets', 'success');
    });
  }

  // Sortable table headers
  UI.initSortableHeaders((col, dir) => {
    App.sortCol = col;
    App.sortDir = dir;
    const sorted = UI.sortRecords(App.currentResults, col, dir);
    UI.renderResultsTable(sorted, App.currentQuery);
  });
}

/* ═══════════════════════════════════════════════════════════
   SETUP HINT (no config)
═══════════════════════════════════════════════════════════ */
function showSetupHint() {
  const container = document.getElementById('search-results-area');
  if (!container) return;

  container.innerHTML = `
    <div class="setup-hint">
      <div class="setup-hint-title">⚙ Setup Required</div>
      <p class="setup-hint-text">
        No configuration found. Go to the <strong>Settings</strong> page to add your Google Sheet URLs,
        production lines, and buffer configurations.<br><br>
        ACS Tracker requires no backend — all data is loaded directly from Google Sheets.
      </p>
      <a href="settings.html" class="btn btn-primary">Go to Settings →</a>
    </div>
  `;
}

/* ═══════════════════════════════════════════════════════════
   DATA LOADING
═══════════════════════════════════════════════════════════ */
async function loadAllData() {
  if (App.isLoading) return;
  App.isLoading = true;
  App.records = [];
  App.index   = [];

  UI.showLoading('LOADING SHEETS...', 'Connecting to Google Sheets data sources');
  UI.setStatus('loading', 'SYNCING');

  const config = Storage.getConfig();
  let totalSheets = 0;
  const errors   = [];

  try {
    /* ── Load Buffers ──────────────────────────── */
    for (const buf of config.buffers) {
      if (!buf.sheetUrl) continue;

      UI.updateLoadingDetail(`Loading buffer: ${buf.name}`);
      try {
        const sheetId = Sheets.extractSheetId(buf.sheetUrl);
        if (!sheetId) throw new Error('Invalid URL');

        const allTabs = await Sheets.fetchAllTabs(sheetId, (tab, i, total) => {
          UI.updateLoadingDetail(`Buffer "${buf.name}" — tab ${i}/${total}: ${tab}`);
        });

        for (const [tabName, rows] of Object.entries(allTabs)) {
          const parsed = Sheets.parseBufferSheet(rows);
          parsed.forEach(item => {
            if (!item.matnr) return;
            App.records.push({
              matnr:      item.matnr,
              accessoire: item.matnr, // buffers often only have MATNR
              buffer:     buf.name,
              section:    '',
              ligne:      '',
              position:   item.ort || '',
              rack:       tabName !== 'Sheet1' ? tabName : '',
              bg:         '',
              _source:    'buffer',
            });
          });
          totalSheets++;
        }
      } catch (e) {
        console.error(`[App] Buffer "${buf.name}":`, e);
        errors.push(`Buffer "${buf.name}": ${e.message}`);
      }
    }

    /* ── Load Production Lines ─────────────────── */
    for (const bg of config.bgs) {
      for (const line of (bg.lines || [])) {
        if (!line.sheetUrl) continue;

        UI.updateLoadingDetail(`Loading: ${bg.name} › ${line.section} › ${line.name}`);
        try {
          const sheetId = Sheets.extractSheetId(line.sheetUrl);
          if (!sheetId) throw new Error('Invalid URL');

          const allTabs = await Sheets.fetchAllTabs(sheetId, (tab, i, total) => {
            UI.updateLoadingDetail(`${line.name} — tab ${i}/${total}: ${tab}`);
          });

          for (const [tabName, rows] of Object.entries(allTabs)) {
            const parsed = Sheets.parseLineTab(rows, tabName);
            parsed.forEach(item => {
              if (!item.matnr && !item.accessoire) return;
              App.records.push({
                matnr:      item.matnr,
                accessoire: item.accessoire,
                buffer:     '',
                section:    line.section || '',
                ligne:      line.name    || '',
                position:   item.position || item.takt || '',
                rack:       item.rack    || '',
                bg:         bg.name      || '',
                _source:    'line',
              });
            });
            totalSheets++;
          }
        } catch (e) {
          console.error(`[App] Line "${line.name}":`, e);
          errors.push(`Line "${line.name}": ${e.message}`);
        }
      }
    }

    /* ── Build search index ────────────────────── */
    buildSearchIndex();

    App.stats.totalRecords = App.records.length;
    App.stats.totalSheets  = totalSheets;
    App.stats.totalBuffers = config.buffers.length;
    App.stats.lastSync     = new Date().toISOString();
    Storage.updateStats(App.stats);

    UI.setStatus('online', 'ONLINE');
    UI.toast(`Loaded ${App.records.length} records from ${totalSheets} sheets`, 'success');

    if (errors.length > 0) {
      UI.toast(`${errors.length} sheet(s) had errors — check console`, 'error');
    }

  } catch (e) {
    console.error('[App] Fatal load error:', e);
    UI.setStatus('error', 'ERROR');
    UI.toast('Failed to load data: ' + e.message, 'error');
  }

  App.isLoading = false;
  UI.hideLoading();
  renderStats();
}

/* ═══════════════════════════════════════════════════════════
   SEARCH INDEX
═══════════════════════════════════════════════════════════ */
function buildSearchIndex() {
  App.index = App.records.map(rec => {
    // Build a token string of all searchable fields
    const tokens = [
      rec.matnr,
      rec.accessoire,
      rec.buffer,
      rec.section,
      rec.ligne,
      rec.position,
      rec.rack,
      rec.bg,
    ]
      .filter(Boolean)
      .map(v => v.toLowerCase())
      .join(' ');

    return { tokens, rec };
  });

  console.log(`[App] Search index built: ${App.index.length} entries`);
}

/* ═══════════════════════════════════════════════════════════
   SEARCH ENGINE
═══════════════════════════════════════════════════════════ */
function performSearch(query) {
  query = (query || '').trim();
  App.currentQuery = query;

  if (query.length < 1) {
    UI.clearResultsTable();
    UI.hideSuggestions();
    renderRecentSearches();
    return;
  }

  // Show inline loading
  const loader = document.getElementById('search-loading');
  if (loader) loader.classList.add('visible');

  // Run search (synchronous but wrapped in rAF for UI responsiveness)
  requestAnimationFrame(() => {
    const results = searchRecords(query);
    App.currentResults = results;

    // Sort if active
    const sorted = App.sortCol
      ? UI.sortRecords(results, App.sortCol, App.sortDir)
      : results;

    UI.renderResultsTable(sorted, query);
    updateResultsCount(sorted.length);

    // Autocomplete suggestions (unique MATNRs)
    if (query.length >= 2) {
      const suggestions = buildSuggestions(query, 8);
      UI.renderSuggestions(suggestions, (matnr) => {
        const inp = document.getElementById('search-input');
        if (inp) { inp.value = matnr; inp.focus(); }
        performSearch(matnr);
      });
    }

    if (loader) loader.classList.remove('visible');

    // Save to recent searches if meaningful
    if (query.length >= 3 && results.length > 0) {
      Storage.addRecentSearch(query);
      Storage.incrementSearchCount(results.length);
    }
  });
}

function searchRecords(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const terms = q.split(/\s+/);

  return App.index
    .filter(({ tokens }) => terms.every(t => tokens.includes(t) || tokens.indexOf(t) !== -1 || tokens.split(' ').some(tok => tok.startsWith(t))))
    .map(({ rec }) => rec);
}

function buildSuggestions(query, limit) {
  const q = query.toLowerCase();
  const seen = new Set();
  const suggestions = [];

  for (const { rec } of App.index) {
    if (suggestions.length >= limit) break;
    const key = rec.matnr || rec.accessoire;
    if (!key || seen.has(key)) continue;
    if (
      (rec.matnr && rec.matnr.toLowerCase().includes(q)) ||
      (rec.accessoire && rec.accessoire.toLowerCase().includes(q))
    ) {
      seen.add(key);
      suggestions.push({ matnr: rec.matnr, accessoire: rec.accessoire });
    }
  }

  return suggestions;
}

/* ═══════════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════════ */
function renderStats() {
  const stats = Storage.getStats();
  const cfg   = Storage.getConfig();

  UI.updateStatCard('stat-records',  App.records.length.toLocaleString());
  UI.updateStatCard('stat-sheets',   App.stats.totalSheets);
  UI.updateStatCard('stat-lines',    cfg.bgs.reduce((acc, bg) => acc + (bg.lines || []).length, 0));
  UI.updateStatCard('stat-buffers',  cfg.buffers.length);
  UI.updateStatCard('stat-searches', (stats.totalSearches || 0).toLocaleString());
}

function updateResultsCount(count) {
  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = count + ' RESULT' + (count !== 1 ? 'S' : '');
}

/* ═══════════════════════════════════════════════════════════
   RECENT SEARCHES
═══════════════════════════════════════════════════════════ */
function renderRecentSearches() {
  const recent = Storage.getRecentSearches();
  UI.renderRecentSearches(
    recent,
    (term) => {
      const inp = document.getElementById('search-input');
      if (inp) { inp.value = term; inp.focus(); }
      const clearBtn = document.getElementById('search-clear');
      if (clearBtn) clearBtn.classList.add('visible');
      performSearch(term);
    },
    () => {
      Storage.clearRecentSearches();
      renderRecentSearches();
    }
  );
}
