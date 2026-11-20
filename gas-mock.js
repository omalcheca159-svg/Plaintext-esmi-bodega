/* Simulador mínimo de Google Apps Script para el MODO DEMO (y pruebas).
 * Permite ejecutar el mismo Code.gs del backend en el navegador, con las hojas en memoria/localStorage.
 * En producción NO se usa: la web habla con la Aplicación Web real de Apps Script. */
(function (G) {
  const STORE_KEY = 'esmi_demo_db_v1';

  // ---------- SHA-256 síncrono (bytes con signo, como Utilities.computeDigest) ----------
  function sha256Bytes(str) {
    const bytes = new TextEncoder().encode(str);
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length, withPad = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(withPad);
    m.set(bytes); m[l] = 0x80; const bits = l * 8;
    m[withPad - 4] = bits >>> 24; m[withPad - 3] = bits >>> 16; m[withPad - 2] = bits >>> 8; m[withPad - 1] = bits;
    const w = new Uint32Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let i = 0; i < withPad; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = (m[i+4*t] << 24) | (m[i+4*t+1] << 16) | (m[i+4*t+2] << 8) | m[i+4*t+3];
      for (let t = 16; t < 64; t++) { const s0 = rotr(w[t-15],7)^rotr(w[t-15],18)^(w[t-15]>>>3), s1 = rotr(w[t-2],17)^rotr(w[t-2],19)^(w[t-2]>>>10); w[t] = (w[t-16]+s0+w[t-7]+s1)|0; }
      let [a,b,c,d,e,f,g,h] = H;
      for (let t = 0; t < 64; t++) { const S1 = rotr(e,6)^rotr(e,11)^rotr(e,25), ch = (e&f)^(~e&g), t1 = (h+S1+ch+K[t]+w[t])|0, S0 = rotr(a,2)^rotr(a,13)^rotr(a,22), mj = (a&b)^(a&c)^(b&c), t2 = (S0+mj)|0; h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0; }
      H = H.map((x, k) => (x + [a,b,c,d,e,f,g,h][k]) | 0);
    }
    const out = [];
    H.forEach(x => { for (let s = 24; s >= 0; s -= 8) { const v = (x >>> s) & 0xff; out.push(v > 127 ? v - 256 : v); } });
    return out;
  }

  // ---------- Persistencia ----------
  let DB = null; // {sheetName: [[...row], ...]}
  let TZ = 'America/La_Paz';
  const props = {};
  const cache = new Map();
  const reviver = (k, v) => (v && v.__d ? new Date(v.__d) : v);
  function save() {
    try {
      const s = JSON.stringify({ DB, props }, function (k, v) { const raw = this[k]; return raw instanceof Date ? { __d: raw.toISOString() } : v; });
      if (G.localStorage) G.localStorage.setItem(STORE_KEY, s);
    } catch (e) { /* almacenamiento lleno o no disponible */ }
  }
  function load(seed) {
    try {
      const s = G.localStorage && G.localStorage.getItem(STORE_KEY);
      if (s) { const o = JSON.parse(s, reviver); DB = o.DB; Object.assign(props, o.props || {}); return false; }
    } catch (e) {}
    DB = JSON.parse(JSON.stringify(seed));
    return true;
  }

  // ---------- Range / Sheet ----------
  function Range(sheet, r, c, nr, nc) { this.s = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  Range.prototype.getValues = function () {
    const out = [];
    for (let i = 0; i < this.nr; i++) { const row = this.s.rows()[this.r - 1 + i] || []; const o = []; for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined || v === null ? '' : v); } out.push(o); }
    return out;
  };
  Range.prototype.setValues = function (vals) { vals.forEach((row, i) => row.forEach((v, j) => this.s.set(this.r + i, this.c + j, v))); return this; };
  Range.prototype.setValue = function (v) { this.s.set(this.r, this.c, v); return this; };
  Range.prototype.setFormula = function (f) { return this.setValue(f); };
  Range.prototype.setFormulas = function (f) { return this.setValues(f); };
  ['setFontWeight','setNumberFormat','setBackground'].forEach(n => Range.prototype[n] = function () { return this; });

  function Sheet(name) { this.name = name; }
  Sheet.prototype.rows = function () { return DB[this.name]; };
  Sheet.prototype.set = function (r, c, v) { const rows = this.rows(); while (rows.length < r) rows.push([]); const row = rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
  Sheet.prototype.getLastRow = function () { const rows = this.rows(); let n = rows.length; while (n > 0 && rows[n-1].every(v => v === '' || v === null || v === undefined)) n--; return n; };
  Sheet.prototype.getLastColumn = function () { return this.rows().reduce((m, r) => { let n = r.length; while (n > 0 && (r[n-1] === '' || r[n-1] == null)) n--; return Math.max(m, n); }, 0); };
  Sheet.prototype.getDataRange = function () { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };
  Sheet.prototype.getRange = function (r, c, nr, nc) { if (typeof r === 'string') return new Range(this, 1, 1, 0, 0); return new Range(this, r, c, nr || 1, nc || 1); };
  Sheet.prototype.appendRow = function (vals) { this.rows().splice(this.getLastRow(), 0, vals.slice()); return this; };
  Sheet.prototype.setFrozenRows = function () {}; Sheet.prototype.setRowHeights = function () {};

  const SS = {
    getSheetByName: n => (DB[n] ? new Sheet(n) : null),
    insertSheet: n => { DB[n] = []; return new Sheet(n); },
    getSpreadsheetTimeZone: () => TZ, setSpreadsheetTimeZone: t => { TZ = t; }, toast: () => {}
  };

  function pad(n, l) { return String(n).padStart(l || 2, '0'); }
  function laPaz(d) { return new Date(d.getTime() - 4 * 3600 * 1000); } // UTC-4 fijo
  function formatDate(d, tz, f) {
    const x = laPaz(d), Y = x.getUTCFullYear(), M = x.getUTCMonth() + 1, D = x.getUTCDate(), h = x.getUTCHours(), mi = x.getUTCMinutes(), s = x.getUTCSeconds();
    return f.replace("'T'", 'T').replace('yyyy', Y).replace('yy', String(Y).slice(2)).replace('MM', pad(M)).replace('dd', pad(D)).replace('HH', pad(h)).replace('mm', pad(mi)).replace('ss', pad(s));
  }

  G.SpreadsheetApp = { getActiveSpreadsheet: () => SS, getActive: () => SS, flush: () => save(), getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }) }) };
  G.LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => true, releaseLock: () => save() }) };
  G.CacheService = { getScriptCache: () => ({ get: k => { const e = cache.get(k); return e && e.exp > Date.now() ? e.v : null; }, put: (k, v, ttl) => cache.set(k, { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }), remove: k => cache.delete(k) }) };
  G.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); save(); } }) };
  G.Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: (alg, s) => sha256Bytes(s), formatDate,
    getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })
  };
  G.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } }) };
  G.ScriptApp = { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ forSpreadsheet() { return this; }, onEdit() { return this; }, onChange() { return this; }, create() {} }) };

  G.GASMock = { load, save, reset: () => { if (G.localStorage) G.localStorage.removeItem(STORE_KEY); }, db: () => DB, sha256Bytes };
})(typeof window !== 'undefined' ? window : globalThis);
