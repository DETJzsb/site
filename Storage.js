/**
 * storage.js
 * ACS Tracker — Configuration & Cache Storage Layer
 * All persistence uses localStorage. No backend required.
 */

const Storage = (() => {

  /* ── Keys ─────────────────────────────────────────── */
  const KEYS = {
    CONFIG:         'acs_config',
    CACHE:          'acs_sheet_cache',
    RECENT_SEARCH:  'acs_recent_searches',
    STATS:          'acs_stats',
  };

  /* ── Default configuration skeleton ──────────────── */
  const DEFAULT_CONFIG = {
    version: 2,
    buffers: [
      /* Example — user fills real URLs in settings
      {
        id: 'buf_mm',
        name: 'Puffer MM',
        sheetUrl: '',
        csvUrl: ''
      }
      */
    ],
    bgs: [
      /* Example:
      {
        id: 'bg_1',
        name: 'BG1',
        sections: ['MM','BASIS','THS','COC','INR'],
        lines: [
          {
            id: 'line_1',
            name: 'Linie 1',
            section: 'MM',
            sheetUrl: '',
            csvUrl: ''
          }
        ]
      }
      */
    ],
  };

  /* ── Helpers ──────────────────────────────────────── */
  function _read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[Storage] Read error:', key, e);
      return null;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[Storage] Write error:', key, e);
      return false;
    }
  }

  function _remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ── Config API ───────────────────────────────────── */
  function getConfig() {
    const saved = _read(KEYS.CONFIG);
    if (!saved) return structuredClone(DEFAULT_CONFIG);
    // Merge with defaults to ensure new fields exist
    return Object.assign({}, structuredClone(DEFAULT_CONFIG), saved);
  }

  function saveConfig(config) {
    return _write(KEYS.CONFIG, config);
  }

  function resetConfig() {
    _remove(KEYS.CONFIG);
    _remove(KEYS.CACHE);
  }

  /* ── BG management ────────────────────────────────── */
  function addBG(bg) {
    const cfg = getConfig();
    bg.id = bg.id || 'bg_' + Date.now();
    if (!bg.lines) bg.lines = [];
    cfg.bgs.push(bg);
    saveConfig(cfg);
    return bg;
  }

  function updateBG(id, updates) {
    const cfg = getConfig();
    const idx = cfg.bgs.findIndex(b => b.id === id);
    if (idx === -1) return false;
    cfg.bgs[idx] = Object.assign({}, cfg.bgs[idx], updates);
    saveConfig(cfg);
    return true;
  }

  function removeBG(id) {
    const cfg = getConfig();
    cfg.bgs = cfg.bgs.filter(b => b.id !== id);
    saveConfig(cfg);
  }

  /* ── Line management ──────────────────────────────── */
  function addLine(bgId, line) {
    const cfg = getConfig();
    const bg = cfg.bgs.find(b => b.id === bgId);
    if (!bg) return false;
    line.id = line.id || 'line_' + Date.now();
    bg.lines = bg.lines || [];
    bg.lines.push(line);
    saveConfig(cfg);
    return line;
  }

  function updateLine(bgId, lineId, updates) {
    const cfg = getConfig();
    const bg = cfg.bgs.find(b => b.id === bgId);
    if (!bg) return false;
    const idx = (bg.lines || []).findIndex(l => l.id === lineId);
    if (idx === -1) return false;
    bg.lines[idx] = Object.assign({}, bg.lines[idx], updates);
    saveConfig(cfg);
    return true;
  }

  function removeLine(bgId, lineId) {
    const cfg = getConfig();
    const bg = cfg.bgs.find(b => b.id === bgId);
    if (!bg) return false;
    bg.lines = (bg.lines || []).filter(l => l.id !== lineId);
    saveConfig(cfg);
    return true;
  }

  /* ── Buffer management ────────────────────────────── */
  function addBuffer(buffer) {
    const cfg = getConfig();
    buffer.id = buffer.id || 'buf_' + Date.now();
    cfg.buffers.push(buffer);
    saveConfig(cfg);
    return buffer;
  }

  function updateBuffer(id, updates) {
    const cfg = getConfig();
    const idx = cfg.buffers.findIndex(b => b.id === id);
    if (idx === -1) return false;
    cfg.buffers[idx] = Object.assign({}, cfg.buffers[idx], updates);
    saveConfig(cfg);
    return true;
  }

  function removeBuffer(id) {
    const cfg = getConfig();
    cfg.buffers = cfg.buffers.filter(b => b.id !== id);
    saveConfig(cfg);
  }

  /* ── Sheet cache ──────────────────────────────────── */
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  function getCachedSheet(url) {
    const cache = _read(KEYS.CACHE) || {};
    const entry = cache[url];
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) {
      // expired
      delete cache[url];
      _write(KEYS.CACHE, cache);
      return null;
    }
    return entry.data;
  }

  function setCachedSheet(url, data) {
    const cache = _read(KEYS.CACHE) || {};
    cache[url] = { ts: Date.now(), data };
    // Limit cache size to avoid localStorage overflow
    const keys = Object.keys(cache);
    if (keys.length > 50) {
      // Remove oldest entries
      keys.sort((a, b) => cache[a].ts - cache[b].ts)
          .slice(0, keys.length - 50)
          .forEach(k => delete cache[k]);
    }
    _write(KEYS.CACHE, cache);
  }

  function clearCache() {
    _remove(KEYS.CACHE);
  }

  /* ── Recent searches ──────────────────────────────── */
  const MAX_RECENT = 10;

  function getRecentSearches() {
    return _read(KEYS.RECENT_SEARCH) || [];
  }

  function addRecentSearch(term) {
    if (!term || term.trim().length < 2) return;
    let recent = getRecentSearches();
    // Remove duplicates
    recent = recent.filter(r => r.toLowerCase() !== term.toLowerCase());
    recent.unshift(term.trim());
    if (recent.length > MAX_RECENT) recent = recent.slice(0, MAX_RECENT);
    _write(KEYS.RECENT_SEARCH, recent);
  }

  function clearRecentSearches() {
    _remove(KEYS.RECENT_SEARCH);
  }

  /* ── Stats ────────────────────────────────────────── */
  function getStats() {
    return _read(KEYS.STATS) || {
      totalSearches: 0,
      totalResults: 0,
      lastSync: null,
      totalRecords: 0,
    };
  }

  function updateStats(updates) {
    const stats = getStats();
    Object.assign(stats, updates);
    _write(KEYS.STATS, stats);
  }

  function incrementSearchCount(resultCount) {
    const stats = getStats();
    stats.totalSearches = (stats.totalSearches || 0) + 1;
    stats.totalResults  = (stats.totalResults  || 0) + resultCount;
    _write(KEYS.STATS, stats);
  }

  /* ── Public API ───────────────────────────────────── */
  return {
    getConfig, saveConfig, resetConfig,
    addBG, updateBG, removeBG,
    addLine, updateLine, removeLine,
    addBuffer, updateBuffer, removeBuffer,
    getCachedSheet, setCachedSheet, clearCache,
    getRecentSearches, addRecentSearch, clearRecentSearches,
    getStats, updateStats, incrementSearchCount,
  };

})();
