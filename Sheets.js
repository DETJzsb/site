/**
 * sheets.js
 * ACS Tracker — Google Sheets Integration Layer
 *
 * Uses the public CSV export URL of Google Sheets.
 * No API key required — sheets must be published to web.
 *
 * URL format:
 *   https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={SHEET_NAME}
 *
 * How to publish:
 *   File → Share → Publish to web → CSV → Publish
 */

const Sheets = (() => {

  /* ── URL helpers ──────────────────────────────────── */

  /**
   * Extract spreadsheet ID from a Google Sheets URL.
   * Supports both /d/{id}/ and ?id= formats.
   */
  function extractSheetId(url) {
    if (!url) return null;
    // Standard: /spreadsheets/d/{ID}/
    let m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    // Query string: ?id={ID}
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    // Already just the ID (40 chars alphanumeric)
    if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
    return null;
  }

  /**
   * Build a CSV export URL for a specific tab (gid or name).
   */
  function buildCsvUrl(sheetId, tabName) {
    const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    if (tabName) return `${base}&sheet=${encodeURIComponent(tabName)}`;
    return base;
  }

  /**
   * Build a JSON feed URL to list all sheet tabs.
   */
  function buildTabsUrl(sheetId) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  }

  /* ── CSV parser ───────────────────────────────────── */

  /**
   * Parse raw CSV text → array of row objects keyed by header.
   * Handles quoted fields, commas inside quotes, newlines.
   */
  function parseCsv(raw) {
    if (!raw || !raw.trim()) return [];

    const rows = [];
    const lines = splitCsvLines(raw.trim());
    if (lines.length < 2) return [];

    const headers = parseRow(lines[0]).map(h => h.trim());

    for (let i = 1; i < lines.length; i++) {
      const cols = parseRow(lines[i]);
      if (cols.every(c => !c.trim())) continue; // skip blank rows
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (cols[idx] || '').trim();
      });
      rows.push(obj);
    }
    return rows;
  }

  function splitCsvLines(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { inQuotes = !inQuotes; current += ch; }
      else if (ch === '\n' && !inQuotes) { lines.push(current); current = ''; }
      else if (ch === '\r' && !inQuotes) { /* skip */ }
      else { current += ch; }
    }
    if (current) lines.push(current);
    return lines;
  }

  function parseRow(line) {
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        cols.push(current); current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current);
    return cols;
  }

  /* ── Tab discovery ────────────────────────────────── */

  /**
   * Fetch list of tab names from a Google Sheet.
   * Uses the JSON feed (no API key needed).
   */
  async function fetchTabNames(sheetId) {
    const url = buildTabsUrl(sheetId);
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const text = await resp.text();
    // Response is wrapped: google.visualization.Query.setResponse({...})
    const jsonStr = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    const json = JSON.parse(jsonStr);

    const sheets = json?.table?.cols ? [] : [];

    // The tabs are in json.table... but a more reliable approach:
    // Parse the "sheets" list from the wrapper
    const tabMatch = text.match(/"sheetNames":\s*\[([^\]]+)\]/);
    if (tabMatch) {
      const names = tabMatch[1].split(',').map(n => n.replace(/"/g, '').trim());
      return names.filter(Boolean);
    }

    // Fallback — try to find sheet names via another pattern
    const sheetPattern = /"sheets":\s*\[([^\]]+)\]/;
    const sm = text.match(sheetPattern);
    if (sm) {
      const names = [...sm[1].matchAll(/"label":"([^"]+)"/g)].map(m => m[1]);
      if (names.length) return names;
    }

    // Last resort — return first tab only
    return ['Sheet1'];
  }

  /* ── Fetch single tab ─────────────────────────────── */

  /**
   * Fetch and parse a single tab as array of row objects.
   * Uses cache if available.
   */
  async function fetchTab(sheetId, tabName) {
    const url = buildCsvUrl(sheetId, tabName);

    // Check cache first
    const cached = Storage.getCachedSheet(url);
    if (cached) {
      console.debug('[Sheets] Cache hit:', url);
      return { rows: cached, fromCache: true };
    }

    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching tab "${tabName}"`);

    const text = await resp.text();
    if (!text.trim()) return { rows: [], fromCache: false };

    const rows = parseCsv(text);
    Storage.setCachedSheet(url, rows);
    return { rows, fromCache: false };
  }

  /* ── Fetch all tabs ───────────────────────────────── */

  /**
   * Fetch ALL tabs of a sheet and return { tabName → rows[] }.
   */
  async function fetchAllTabs(sheetId, onProgress) {
    let tabNames;
    try {
      tabNames = await fetchTabNames(sheetId);
    } catch (e) {
      console.warn('[Sheets] Tab discovery failed, using default:', e);
      tabNames = ['Sheet1'];
    }

    const result = {};
    for (let i = 0; i < tabNames.length; i++) {
      const tab = tabNames[i];
      if (onProgress) onProgress(tab, i + 1, tabNames.length);
      try {
        const { rows } = await fetchTab(sheetId, tab);
        result[tab] = rows;
      } catch (e) {
        console.warn(`[Sheets] Failed tab "${tab}":`, e.message);
        result[tab] = [];
      }
    }
    return result;
  }

  /* ── Buffer sheet parser ──────────────────────────── */

  /**
   * Parse a buffer sheet.
   * Expected columns: ORT | Articles (or variations)
   * Returns: [{ ort, matnr }]
   */
  function parseBufferSheet(rows) {
    return rows
      .map(row => {
        const keys = Object.keys(row);
        // Column detection — flexible
        const ortKey  = keys.find(k => /^ort$/i.test(k) || /location/i.test(k)) || keys[0];
        const artKey  = keys.find(k => /article/i.test(k) || /matnr/i.test(k) || /mat/i.test(k)) || keys[1];
        return {
          ort:   (row[ortKey] || '').trim(),
          matnr: normalizeMatnr(row[artKey] || ''),
        };
      })
      .filter(r => r.matnr);
  }

  /* ── Production line parser ───────────────────────── */

  /**
   * Parse a production line tab.
   * Expected columns: Accessoire | Regale/Rack | Position (or similar)
   * Also extracts TAKT and Rack from tab name if not in columns.
   *
   * Tab name examples: "Takt1 Regale6", "Takt2 Rack1"
   *
   * Returns: [{ matnr, accessoire, position, rack, takt }]
   */
  function parseLineTab(rows, tabName) {
    // Try to extract TAKT and Rack from tab name
    const taktFromTab = extractTaktFromName(tabName);
    const rackFromTab = extractRackFromName(tabName);

    return rows
      .map(row => {
        const keys = Object.keys(row);

        // Find accessoire / MATNR column
        const accKey  = keys.find(k => /accessoire/i.test(k) || /article/i.test(k) || /matnr/i.test(k) || /mat/i.test(k) || /benennung/i.test(k)) || keys[0];
        const rackKey = keys.find(k => /regale|rack|regal/i.test(k)) || keys[1];
        const posKey  = keys.find(k => /position|pos|takt/i.test(k)) || keys[2];

        // Some sheets put MATNR and name in the same first column separated by space or in two cols
        const rawAcc  = (row[accKey]  || '').trim();
        const rawRack = (row[rackKey] || '').trim();
        const rawPos  = (row[posKey]  || '').trim();

        // Try to detect if rawAcc is a MATNR (starts with G or is all numbers)
        const matnr      = normalizeMatnr(rawAcc);
        const accessoire = rawAcc; // Keep original for display

        // Extract TAKT from position column or tab name
        const takt = extractTaktFromName(rawPos) || taktFromTab;
        const rack = rawRack || rackFromTab;

        return {
          matnr,
          accessoire,
          position: rawPos || taktFromTab,
          rack,
          takt,
        };
      })
      .filter(r => r.matnr || r.accessoire);
  }

  /* ── Normalize helpers ────────────────────────────── */

  function normalizeMatnr(val) {
    if (!val) return '';
    return val.trim().toUpperCase().replace(/\s+/g, '');
  }

  function extractTaktFromName(name) {
    if (!name) return '';
    const m = name.match(/takt\s*(\d+)/i);
    return m ? `TAKT ${m[1]}` : '';
  }

  function extractRackFromName(name) {
    if (!name) return '';
    let m = name.match(/regale?\s*(\d+)/i);
    if (m) return `REGALE ${m[1]}`;
    m = name.match(/rack\s*(\d+)/i);
    if (m) return `RACK ${m[1]}`;
    return '';
  }

  /* ── Connection tester ────────────────────────────── */

  async function testConnection(url) {
    try {
      const sheetId = extractSheetId(url);
      if (!sheetId) return { ok: false, error: 'Cannot extract Sheet ID from URL' };

      const csvUrl = buildCsvUrl(sheetId);
      const resp = await fetch(csvUrl, { cache: 'no-store' });
      if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };

      const text = await resp.text();
      if (!text.trim()) return { ok: false, error: 'Sheet is empty or not published' };

      return { ok: true, rowCount: parseCsv(text).length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ── Public API ───────────────────────────────────── */
  return {
    extractSheetId,
    buildCsvUrl,
    fetchTab,
    fetchAllTabs,
    fetchTabNames,
    parseCsv,
    parseBufferSheet,
    parseLineTab,
    normalizeMatnr,
    extractTaktFromName,
    extractRackFromName,
    testConnection,
  };

})();
