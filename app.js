/* ==========================================================================
 *  ESMI · Modificaciones Mecánicas — Control, Préstamo, QR y Auditoría
 *  Frontend (PWA) — habla con la Aplicación Web de Google Apps Script.
 *  Administrador de Bodega: OMAR QUISPE CHECA
 * ========================================================================== */
'use strict';

const CFG = Object.assign({ API_URL: '', POLL_MS: 6000 }, window.ESMI_CONFIG || {});
const DEMO = !CFG.API_URL;
const FIRMA = 'OMAR QUISPE CHECA';
const EMPRESA_FULL = 'Empresa de Servicios de Mantenimiento Industrial S.R.L.';
const cliente = () => S.config.CLIENTE || 'Minera San Cristóbal';

/* ----------------------------- estado ----------------------------- */
const S = {
  token: null, user: null, config: { EMPRESA: 'ESMI', AREA: 'Modificaciones Mecánicas', ADMIN_BODEGA: FIRMA, WEB_URL: '', PLAZO_HORAS: 12, CLIENTE: 'Minera San Cristóbal' },
  data: null, version: 0, view: 'operacion', online: true, lastSync: null,
  tool: new Map(), person: new Map(), loansByWorker: new Map(), loansByTool: new Map(),
  op: { mode: 'out', worker: null, cart: [], retSel: new Map(), retFilter: null },
  kardexId: null, inv: { q: '', cat: '', st: '', limit: 80 }, pers: { q: '' },
  hist: { rows: null, tipo: '', q: '', desde: '', hasta: '' },
  audit: null, audits: null, labels: { src: 'tools', cat: '', q: '', sel: new Set() },
  scanHandler: null
};

/* ----------------------------- utilidades ----------------------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const U = v => String(v ?? '').trim().toUpperCase();
const n0 = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
function parseD(v) { if (!v) return null; if (v instanceof Date) return v; const d = new Date(String(v).length <= 19 && /T/.test(v) ? v + '-04:00' : v); return isNaN(d) ? null : d; }
function fdt(v, withTime = true) {
  const d = parseD(v); if (!d) return v ? esc(v) : '—';
  const o = { timeZone: 'America/La_Paz', day: '2-digit', month: '2-digit', year: 'numeric' };
  if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toLocaleString('es-BO', o).replace(',', '');
}
function initials(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
function toLocalInput(d) { const x = new Date(d.getTime() - 4 * 3600e3); return x.toISOString().slice(0, 16); }
function fromLocalInput(s) { return s ? new Date(s + ':00-04:00') : null; }
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

const I = {
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4M20 17v3"/>',
  out: '<path d="M7 17 17 7M8 7h9v9"/>', in: '<path d="M17 7 7 17M16 17H7V8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  alert: '<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  card: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h3M15 12h3M6 16h12"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15h6M9 11h2"/>',
  xls: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>', trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M15 8l2 2"/>', print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  flash: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'
};
const ic = (k, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${I[k] || ''}</svg>`;

function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t); while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove(); setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, type === 'err' ? 5200 : 3200);
}

/* ----------------------------- QR ----------------------------- */
function qrSVG(text, px = 120, level = 'M') {
  const m = window.QRMatrix(String(text), level), n = m.length, q = 2, N = n + q * 2;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + q} ${r + q}h1v1h-1z`; }));
  return `<svg viewBox="0 0 ${N} ${N}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${N}" height="${N}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
function qrCanvas(text, caption, scale = 10) {
  const m = window.QRMatrix(String(text)), n = m.length, q = 4, size = (n + q * 2) * scale, capH = caption ? Math.round(scale * 5) : 0;
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size + capH;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) g.fillRect((c + q) * scale, (r + q) * scale, scale, scale); }));
  if (caption) { g.font = `bold ${Math.round(scale * 2.4)}px "JetBrains Mono", monospace`; g.textAlign = 'center'; g.fillText(caption, size / 2, size + capH * 0.45); }
  return cv;
}
function downloadQR(text, caption, filename) {
  const a = document.createElement('a'); a.href = qrCanvas(text, caption).toDataURL('image/png'); a.download = filename || (caption || text) + '.png'; a.click();
}
function pdfQR(doc, text, x, y, size) {
  const m = window.QRMatrix(String(text)), n = m.length, cell = size / n;
  doc.setFillColor(0, 0, 0);
  m.forEach((row, r) => row.forEach((on, c) => { if (on) doc.rect(x + c * cell, y + r * cell, cell + 0.02, cell + 0.02, 'F'); }));
}
function webBase() {
  const cfg = String(S.config.WEB_URL || '').trim();
  if (cfg) return cfg.replace(/[?#].*$/, '');
  return location.href.replace(/[?#].*$/, '');
}
const workerQRText = id => webBase() + '?w=' + encodeURIComponent(id);
/** Interpreta lo leído: URL con ?w= / ?t= / #w-, o código directo */
function parseScan(raw) {
  let s = String(raw || '').trim();
  const m = s.match(/[?&#]w[=-]([^&#]+)/i); if (m) return { type: 'worker', code: U(decodeURIComponent(m[1])) };
  const t = s.match(/[?&#]t[=-]([^&#]+)/i); if (t) return { type: 'tool', code: U(decodeURIComponent(t[1])) };
  s = U(s);
  if (S.person.has(s)) return { type: 'worker', code: s };
  if (S.tool.has(s)) return { type: 'tool', code: s };
  // tolera ítems escritos sin prefijo: 1 -> HYE-0001, 1001 -> IZ-1001...
  if (/^\d+$/.test(s)) {
    const cands = ['HYE-' + s.padStart(4, '0'), 'CAJ-' + s.padStart(4, '0'), 'ESC-' + s, 'RAD-' + s, 'EXT-' + s, 'IZ-' + s];
    for (const c of cands) if (S.tool.has(c)) return { type: 'tool', code: c };
    const iz = S.data && S.data.herramientas.find(t => String(t.Observaciones || '') === 'Ítem lista maestra: ' + s);
    if (iz) return { type: 'tool', code: U(iz.Codigo) };
    if (S.person.has('ID-MEC-' + s)) return { type: 'worker', code: 'ID-MEC-' + s };
  }
  return { type: 'unknown', code: s };
}

/* ----------------------------- API ----------------------------- */
let demoReady = null;
function loadScript(src) { return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); }); }
async function bootDemo() {
  await loadScript('demo/gas-mock.js'); await loadScript('demo/demo-data.js'); await loadScript('demo/backend.js');
  const fresh = window.GASMock.load(window.ESMI_DEMO_SEED);
  if (fresh) {
    window.configurarSistema();
    // préstamos de ejemplo para que el demo muestre movimiento real
    const call = r => JSON.parse(window.handle_(r).getContent());
    const L = call({ action: 'login', usuario: 'oquispe', clave: 'esmi2026' });
    const now = Date.now(), H = 3600e3;
    const ej = [
      ['ID-MEC-1002', ['HYE-0001', 'CAJ-0008', '508-A-0001'], -30], ['ID-MEC-1011', ['IZ-16214107', 'IZ-166602', 'ESC-86'], 6],
      ['ID-MEC-1020', ['HYE-0011', 'RAD-2886'], -4], ['ID-MEC-1004', ['508-D-0001', 'CAJ-0082', 'HYE-0004'], 9], ['ID-MEC-1022', ['RAD-2887', 'HYE-0007'], 10]
    ];
    ej.forEach(([w, items, h]) => call({ action: 'prestar', token: L.token, idTrabajador: w, items: items.map(c => ({ codigo: c, cantidad: 1 })), fecha: h < 0 ? new Date(now + (h - 12) * H).toISOString() : '', prevista: new Date(now + h * H).toISOString(), obs: 'Préstamo de ejemplo (demo)' }));
    const d = call({ action: 'getData', token: L.token });
    const ln = d.prestamos.find(p => p.Codigo_Herramienta === 'CAJ-0082');
    if (ln) call({ action: 'devolver', token: L.token, devoluciones: [{ idPrestamo: ln.ID_Mov, estado: 'Dañado', obs: 'Mordaza desgastada (demo)' }] });
    call({ action: 'logout', token: L.token });
  }
}
async function api(action, payload = {}, pub = false) {
  const body = Object.assign({ action }, payload); if (!pub) body.token = S.token;
  let res;
  try {
    if (DEMO) {
      if (!demoReady) demoReady = bootDemo(); await demoReady; await sleep(90);
      res = JSON.parse(window.handle_(JSON.parse(JSON.stringify(body))).getContent());
    } else {
      const r = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' });
      res = await r.json();
    }
    setOnline(true);
  } catch (e) { setOnline(false); throw new Error('Sin conexión con el servidor. Revise internet.'); }
  if (!res.ok) {
    if (res.error === 'SESION_EXPIRADA') { logout(true); throw new Error('Su sesión expiró. Ingrese de nuevo.'); }
    throw new Error(res.error || 'Error');
  }
  return res;
}
async function guard(fn, btn) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.innerHTML; btn.innerHTML = '<span class="dot busy"></span> Procesando…'; }
  try { return await fn(); } catch (e) { toast(e.message, 'err'); } finally { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.t; } }
}

/* ----------------------------- datos ----------------------------- */
function index(d) {
  S.data = d; S.version = d.version; if (d.config) S.config = d.config;
  S.tool = new Map(d.herramientas.map(t => [U(t.Codigo), t]));
  S.person = new Map(d.personal.map(p => [U(p.ID_Ficha), p]));
  S.loansByWorker = new Map(); S.loansByTool = new Map();
  d.prestamos.forEach(l => {
    const w = U(l.ID_Trabajador), c = U(l.Codigo_Herramienta);
    if (!S.loansByWorker.has(w)) S.loansByWorker.set(w, []); S.loansByWorker.get(w).push(l);
    if (!S.loansByTool.has(c)) S.loansByTool.set(c, []); S.loansByTool.get(c).push(l);
  });
  S.lastSync = new Date();
}
async function loadData(silent) {
  const d = await api('getData'); const first = !S.data; index(d);
  if (first) renderShell(); else { renderKPIs(); refreshView(); if (!silent) toast('Datos actualizados', 'ok'); }
  renderSync();
}
let pollTimer = null;
function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!S.token || document.hidden) return;
    try { const p = await api('ping', {}, true); if (String(p.version) !== String(S.version)) { await loadData(true); flashSync(); } else { S.lastSync = new Date(); renderSync(); } } catch (e) { renderSync(); }
  }, CFG.POLL_MS);
}
function setOnline(v) { S.online = v; renderSync(); }
function renderSync() {
  const el = $('#sync'); if (!el) return;
  const t = S.lastSync ? S.lastSync.toLocaleTimeString('es-BO', { hour12: false, timeZone: 'America/La_Paz' }) : '—';
  el.innerHTML = `<span class="dot ${S.online ? '' : 'off'}"></span><span class="hide-sm">${S.online ? (DEMO ? 'DEMO local' : 'En vivo') : 'Sin conexión'} · ${t}</span>`;
}
function flashSync() { const el = $('#sync'); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }

/* ----------------------------- arranque ----------------------------- */
document.addEventListener('DOMContentLoaded', start);
async function start() {
  const qs = new URLSearchParams(location.search), h = location.hash;
  const w = qs.get('w') || (h.match(/^#w-(.+)$/) || [])[1];
  const t = qs.get('t') || (h.match(/^#t-(.+)$/) || [])[1];
  if (qs.has('sup') || h === '#supervisor') return renderSupervisor();
  if (w) return renderPortal(U(decodeURIComponent(w)));
  if (t) return renderToolPublic(U(decodeURIComponent(t)));
  const ses = store.get('esmi_session');
  if (ses && ses.token) {
    S.token = ses.token; S.user = ses.user;
    try { await loadData(true); startPolling(); return; } catch (e) { S.token = null; }
  }
  renderLogin();
}
function logout(expired) {
  if (S.token && !expired) api('logout').catch(() => {});
  S.token = null; S.data = null; store.del('esmi_session'); clearInterval(pollTimer); stopScanner(); renderLogin();
}

/* ----------------------------- LOGIN ----------------------------- */
function renderLogin() {
  $('#app').innerHTML = `
  <div class="login">
    <section class="login-art">
      <div class="row"><div class="logo" style="width:84px;height:84px"><img src="logo.png" alt="ESMI"></div><div><div class="brand-s">ESMI · ${EMPRESA_FULL}</div><div class="brand-t">Área Modificaciones Mecánicas</div><div class="muted" style="font-size:13px;margin-top:2px">Servicio a <b style="color:var(--brand2)">${esc(cliente())}</b></div></div></div>
      <div>
        <div class="hazard" style="margin-bottom:22px"></div>
        <div class="big">Control de<br><span>herramientas</span><br>en tiempo real</div>
        <p class="muted" style="max-width:520px;font-size:17px;margin-top:16px">Préstamos y devoluciones con escaneo QR, kardex por trabajador, inventario de bodega y auditorías oficiales, sincronizado al instante con Google Sheets.</p>
        <div class="feat" style="margin-top:22px">
          <div>${ic('scan')} Escaneo QR con cámara</div><div>${ic('users')} Kardex por trabajador</div>
          <div>${ic('shield')} Auditoría física + PDF</div><div>${ic('refresh')} Sincronización en vivo</div>
        </div>
      </div>
      <div class="muted" style="font-size:13px">Administrador de Bodega: <b style="color:var(--text)">${FIRMA}</b></div>
    </section>
    <section class="login-form">
      <form class="login-box" id="loginForm" autocomplete="on">
        ${DEMO ? `<div class="demo-banner" style="margin-bottom:16px">MODO DEMO · datos de prueba en este navegador.<br>Usuario <b class="mono">oquispe</b> · clave <b class="mono">esmi2026</b></div>` : ''}
        <h2 class="cond" style="font-size:30px;margin:0 0 4px;text-transform:uppercase">Acceso de encargados</h2>
        <p class="muted" style="margin:0 0 20px">Solo los 4 administradores de bodega registran movimientos.</p>
        <div class="field" style="margin-bottom:12px"><label>Usuario</label><input class="inp" name="u" autocomplete="username" required autocapitalize="off" ${DEMO ? 'value="oquispe"' : ''}></div>
        <div class="field" style="margin-bottom:18px"><label>Contraseña</label><input class="inp" type="password" name="p" autocomplete="current-password" required></div>
        <button class="btn primary lg" style="width:100%" id="loginBtn">${ic('key')} Ingresar</button>
        <div style="margin:26px 0 12px;display:flex;align-items:center;gap:10px;color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.1em"><span style="flex:1;height:1px;background:var(--line)"></span>¿Eres trabajador?<span style="flex:1;height:1px;background:var(--line)"></span></div>
        <div class="card" style="padding:14px">
          <div class="row" style="margin-bottom:10px"><b>Consulta tu kardex sin contraseña</b></div>
          <div class="row">
            <input class="inp grow" id="pubId" placeholder="Tu código, ej. ID-MEC-1002" autocapitalize="characters">
            <button type="button" class="btn blue" id="pubGo">Ver</button>
            <button type="button" class="btn icon" id="pubScan" title="Escanear mi credencial">${ic('scan')}</button>
          </div>
        </div>
        <button type="button" class="btn ghost" id="goSup" style="width:100%;margin-top:12px">${ic('shield')} Panel del supervisor (solo lectura)</button>
      </form>
    </section>
  </div>`;
  $('#loginForm').onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    guard(async () => {
      const r = await api('login', { usuario: f.u.value.trim(), clave: f.p.value }, true);
      S.token = r.token; S.user = r.user; S.config = r.config || S.config;
      store.set('esmi_session', { token: r.token, user: r.user });
      await loadData(true); startPolling(); toast('Bienvenido, ' + r.user.nombre, 'ok');
    }, $('#loginBtn'));
  };
  const goPub = v => { v = String(v || '').trim(); if (!v) return; const p = parseScan(v); renderPortal(p.code); };
  $('#pubGo').onclick = () => goPub($('#pubId').value);
  $('#pubId').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); goPub(e.target.value); } };
  $('#goSup').onclick = () => renderSupervisor();
  $('#pubScan').onclick = () => openScanner({ title: 'Escanea tu credencial', onScan: txt => { closeModal(); goPub(txt); } });
}

/* ----------------------------- SHELL ----------------------------- */
const TABS = [
  ['operacion', 'Préstamo / Devolución', 'hand'], ['kardex', 'Kardex', 'card'], ['inventario', 'Inventario', 'wrench'],
  ['personal', 'Personal', 'users'], ['historial', 'Historial', 'history'], ['auditoria', 'Auditorías', 'shield'], ['etiquetas', 'Etiquetas QR', 'qr']
];
function renderShell() {
  $('#app').innerHTML = `
  <header class="top"><div class="top-in">
    <div class="logo"><img src="logo.png" alt="ESMI"></div>
    <div style="min-width:0">
      <div class="brand-s">${esc(S.config.EMPRESA)} · ${esc(S.config.AREA)} · ${esc(cliente())}</div>
      <div class="brand-t">Panel de Herramientas · Bodega</div>
      <div class="brand-a">Administrador de Bodega: <b style="color:var(--text)">${esc(S.config.ADMIN_BODEGA || FIRMA)}</b></div>
    </div>
    <div class="top-actions">
      <button class="btn primary hide-sm" id="hdrScan">${ic('scan')} Escanear QR</button>
      <button class="btn green hide-md" id="hdrNewTool">${ic('plus')} Herramienta</button>
      <button class="btn blue hide-md" id="hdrNewPerson">${ic('plus')} Personal</button>
      <div class="sync" id="sync" title="Estado de sincronización"></div>
      <div class="clock hide-sm" id="clock"></div>
      <button class="btn icon" id="hdrRefresh" title="Actualizar">${ic('refresh')}</button>
      <div class="userchip" id="userchip" title="Mi cuenta"><div class="avatar">${initials(S.user.nombre)}</div><div class="hide-md" style="font-size:13px;line-height:1.1;padding-right:6px"><b>${esc(S.user.nombre)}</b><br><span class="muted">${esc(S.user.rol)}</span></div></div>
    </div>
  </div></header>
  <main class="main">
    ${DEMO ? '<div class="demo-banner" style="margin-bottom:12px">MODO DEMO — pegue la URL de su Apps Script en <b>config.js</b> para trabajar con Google Sheets en tiempo real.</div>' : ''}
    <section class="kpis" id="kpis"></section>
    <nav class="tabs" id="tabs">${TABS.map(([k, l, i]) => `<button class="tab" data-v="${k}">${ic(i)} ${l}<span class="badge hidden" data-badge="${k}"></span></button>`).join('')}</nav>
    <section id="view"></section>
  </main>
  <nav class="bnav"><div class="bnav-in">
    <button class="bn" data-v="operacion">${ic('hand')}Operar</button>
    <button class="bn" data-v="kardex">${ic('card')}Kardex</button>
    <button class="bn scan" id="bnScan"><span class="fab">${ic('scan')}</span></button>
    <button class="bn" data-v="inventario">${ic('wrench')}Inventario</button>
    <button class="bn" id="bnMore">${ic('more')}Más</button>
  </div></nav>`;
  $$('[data-v]').forEach(b => b.onclick = () => go(b.dataset.v));
  $('#hdrScan').onclick = $('#bnScan').onclick = () => globalScan();
  $('#hdrNewTool').onclick = () => toolForm();
  $('#hdrNewPerson').onclick = () => personForm();
  $('#hdrRefresh').onclick = () => guard(() => loadData());
  $('#userchip').onclick = accountMenu;
  $('#bnMore').onclick = moreMenu;
  tickClock(); setInterval(tickClock, 1000);
  renderKPIs(); renderSync(); go(store.get('esmi_view') || 'operacion');
}
function tickClock() { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleTimeString('es-BO', { hour12: false, timeZone: 'America/La_Paz' }); }
function go(v) {
  S.view = v; store.set('esmi_view', v);
  $$('.tab,.bn[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  S.scanHandler = null; renderView(); window.scrollTo({ top: 0 });
}
function renderView() { const f = VIEWS[S.view] || VIEWS.operacion; $('#view').innerHTML = ''; f.render($('#view')); }
function refreshView() { const f = VIEWS[S.view]; if (f && f.update) f.update(); else renderView(); }

function kpiData() {
  const T = S.data.herramientas, P = S.data.personal.filter(p => U(p.Activo) !== 'NO');
  const total = T.reduce((a, t) => a + n0(t.Stock_Total), 0);
  const disp = T.reduce((a, t) => a + n0(t.Stock_Disponible), 0);
  const prest = T.reduce((a, t) => a + n0(t.Prestado), 0);
  const dan = T.reduce((a, t) => a + n0(t.Cant_Danada), 0);
  const venc = S.data.prestamos.filter(l => l.Vencido).length;
  return { P: P.length, reg: T.length, total, disp, prest, dan, venc, conCustodia: S.loansByWorker.size };
}
function renderKPIs() {
  const k = kpiData();
  const box = (l, v, s, c, i, go) => `<div class="kpi" style="--c:${c}" data-go="${go}">${ic(i)}<div class="k-l">${l}</div><div class="k-v" style="color:${c}">${v}</div><div class="k-s">${s}</div></div>`;
  $('#kpis').innerHTML =
    box('Personal', k.P, 'Kardex activos', 'var(--violet)', 'users', 'personal') +
    box('Inventario', k.total, k.reg + ' registros', 'var(--blue)', 'box', 'inventario') +
    box('Disponibles', k.disp, 'En pañol', 'var(--green)', 'circleCheck', 'inventario:disp') +
    box('En custodia', k.prest, k.conCustodia + ' trabajadores', 'var(--brand)', 'hand', 'operacion:in') +
    box('Vencidos', k.venc, 'Préstamos fuera de plazo', k.venc ? 'var(--red)' : 'var(--dim)', 'clock', 'operacion:venc') +
    box('Dañados', k.dan, 'Unidades fuera de servicio', k.dan ? 'var(--amber)' : 'var(--dim)', 'alert', 'inventario:dan');
  $$('.kpi').forEach(el => el.onclick = () => {
    const [v, f] = el.dataset.go.split(':');
    if (v === 'inventario') { S.inv.st = f || ''; S.inv.cat = ''; S.inv.q = ''; }
    if (v === 'operacion' && f) { S.op.mode = 'in'; S.op.retFilter = f === 'venc' ? { venc: true } : null; }
    go(v);
  });
  const b = $('[data-badge="operacion"]'); if (b) { b.textContent = k.venc; b.classList.toggle('hidden', !k.venc); }
}

/* ----------------------------- modal ----------------------------- */
function modal(title, body, foot = '', cls = '') {
  closeModal();
  const ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'ov';
  ov.innerHTML = `<div class="modal ${cls}"><div class="m-h"><h3>${title}</h3><button class="btn icon ghost" data-close>${ic('x')}</button></div><div class="m-b">${body}</div>${foot ? `<div class="m-f">${foot}</div>` : ''}</div>`;
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
  $$('[data-close]', ov).forEach(b => b.onclick = closeModal);
  document.body.appendChild(ov); return ov;
}
function closeModal() { stopScanner(); const o = $('#ov'); if (o) o.remove(); }
function confirmBox(title, msg, okLabel = 'Confirmar', danger = false) {
  return new Promise(res => {
    const ov = modal(title, `<p style="margin:0">${msg}</p>`, `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'red' : 'primary'}" id="cOk">${okLabel}</button>`);
    $$('[data-close]', ov).forEach(b => b.onclick = () => { closeModal(); res(false); });
    $('#cOk').onclick = () => { closeModal(); res(true); };
  });
}
function accountMenu() {
  const ov = modal('Mi cuenta', `
    <div class="row" style="margin-bottom:14px"><div class="avatar" style="width:48px;height:48px">${initials(S.user.nombre)}</div><div><b>${esc(S.user.nombre)}</b><div class="muted">${esc(S.user.usuario)} · ${esc(S.user.rol)}</div></div></div>
    <div class="grid g2">
      <div class="field"><label>Clave actual</label><input class="inp" type="password" id="pa"></div>
      <div class="field"><label>Nueva clave (mín. 6)</label><input class="inp" type="password" id="pn"></div>
    </div>`, `<button class="btn red" id="lo">${ic('logout')} Cerrar sesión</button><button class="btn primary" id="cp">${ic('key')} Cambiar clave</button>`);
  $('#lo').onclick = () => { closeModal(); logout(); };
  $('#cp').onclick = e => guard(async () => { await api('cambiarClave', { actual: $('#pa').value, nueva: $('#pn').value }); closeModal(); toast('Clave actualizada', 'ok'); }, e.currentTarget);
}
function moreMenu() {
  const ov = modal('Más opciones', `<div class="grid g2">${TABS.map(([k, l, i]) => `<button class="btn lg" data-mv="${k}" style="justify-content:flex-start">${ic(i)} ${l}</button>`).join('')}
    <button class="btn lg green" id="mmT" style="justify-content:flex-start">${ic('plus')} Nueva herramienta</button><button class="btn lg blue" id="mmP" style="justify-content:flex-start">${ic('plus')} Nuevo trabajador</button>
    <button class="btn lg" id="mmA" style="justify-content:flex-start">${ic('user')} Mi cuenta</button></div>`);
  $$('[data-mv]', ov).forEach(b => b.onclick = () => { closeModal(); go(b.dataset.mv); });
  $('#mmT').onclick = () => toolForm(); $('#mmP').onclick = () => personForm(); $('#mmA').onclick = accountMenu;
}

/* ----------------------------- escáner ----------------------------- */
let scanner = null, lastScan = { t: '', at: 0 };
function beep(ok = true) {
  try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = ok ? 1250 : 320; o.connect(g); g.connect(a.destination); g.gain.value = .08; o.start(); o.stop(a.currentTime + (ok ? .09 : .25)); } catch (e) {}
  try { navigator.vibrate && navigator.vibrate(ok ? 40 : [60, 40, 60]); } catch (e) {}
}
/** Abre el escáner de cámara. onScan(texto) se llama por cada lectura. continuous=true lo deja abierto. */
function openScanner({ title = 'Escanear código QR', onScan, continuous = false, hint = '' }) {
  const ov = modal(title, `
    ${hint ? `<p class="muted" style="margin:0 0 10px">${hint}</p>` : ''}
    <div class="scanner" id="scanBox"><div id="qr-reader"></div><div class="scan-frame"><i></i></div><div class="scan-line"></div>
      <div id="camMsg" class="empty" style="position:absolute;inset:0;display:grid;place-items:center;color:#ccc">Iniciando cámara…</div></div>
    <div class="row wrap" style="margin-top:10px"><select class="inp grow" id="camSel" style="max-width:340px"></select><button class="btn" id="torch">${ic('flash')} Linterna</button></div>
    <div class="row" style="margin-top:10px"><input class="inp grow" id="manual" placeholder="O escriba / use lector USB: código y Enter" autocapitalize="characters"><button class="btn blue" id="manGo">Agregar</button></div>
    <div id="scanLog" class="list" style="margin-top:10px"></div>`,
    `<button class="btn" data-close>${continuous ? 'Listo' : 'Cerrar'}</button>`);
  const handle = txt => {
    const now = Date.now(); if (txt === lastScan.t && now - lastScan.at < 2200) return; lastScan = { t: txt, at: now };
    const box = $('#scanBox'); if (box) { box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); }
    const r = onScan(txt);
    beep(r !== false);
    if (continuous && $('#scanLog')) { const p = parseScan(txt); const d = document.createElement('div'); d.className = 'item'; d.innerHTML = `<span class="code">${esc(p.code)}</span><span class="grow s">${esc(describe(p))}</span>${r === false ? '<span class="pill p-red">rechazado</span>' : '<span class="pill p-green">ok</span>'}`; $('#scanLog').prepend(d); }
  };
  $('#manGo').onclick = () => { const v = $('#manual').value.trim(); if (v) { lastScan.t = ''; handle(v); $('#manual').value = ''; $('#manual').focus(); } };
  $('#manual').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#manGo').click(); } };
  startCamera(handle);
  return ov;
}
function describe(p) {
  if (p.type === 'tool') { const t = S.tool.get(p.code); return t ? t.Descripcion : ''; }
  if (p.type === 'worker') { const w = S.person.get(p.code); return w ? w.Nombre_Completo : ''; }
  return 'Código no registrado';
}
async function startCamera(handle) {
  const msg = $('#camMsg');
  if (!window.Html5Qrcode) { if (msg) msg.innerHTML = 'Cámara no disponible en este navegador.<br>Use el campo manual o un lector USB.'; return; }
  try {
    const cams = await Html5Qrcode.getCameras();
    if (!cams || !cams.length) throw new Error('Sin cámaras');
    const sel = $('#camSel'); const pref = store.get('esmi_cam');
    const back = cams.find(c => /back|trás|rear|environment/i.test(c.label));
    sel.innerHTML = cams.map(c => `<option value="${c.id}">${esc(c.label || 'Cámara')}</option>`).join('');
    sel.value = (cams.find(c => c.id === pref) || back || cams[cams.length - 1]).id;
    const run = async id => {
      await stopScanner(true);
      scanner = new Html5Qrcode('qr-reader', { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39] });
      await scanner.start(id, { fps: 12, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: s }; }, aspectRatio: 1.333 }, txt => handle(txt), () => {});
      if (msg) msg.remove();
    };
    sel.onchange = () => { store.set('esmi_cam', sel.value); run(sel.value).catch(e => toast(e.message, 'err')); };
    $('#torch').onclick = async () => { try { const on = !scanner._torch; await scanner.applyVideoConstraints({ advanced: [{ torch: on }] }); scanner._torch = on; } catch (e) { toast('Linterna no soportada en este equipo', 'warn'); } };
    await run(sel.value);
  } catch (e) {
    if (msg) msg.innerHTML = 'No se pudo abrir la cámara (' + esc(e.message || e) + ').<br>Permita el acceso a la cámara (requiere HTTPS) o use el campo manual.';
  }
}
async function stopScanner(keepModal) { if (scanner) { const s = scanner; scanner = null; try { await s.stop(); s.clear(); } catch (e) {} } }

/* lector USB / Bluetooth tipo teclado: ráfaga rápida + Enter */
(function () {
  let buf = '', last = 0;
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const now = Date.now(); if (now - last > 60) buf = ''; last = now;
    if (e.key === 'Enter') { if (buf.length >= 3 && S.token && S.data) { e.preventDefault(); (S.scanHandler || routeScan)(buf); beep(); } buf = ''; return; }
    if (e.key.length === 1) buf += e.key;
  });
})();

/** Escaneo global: decide qué hacer según lo leído y la vista actual */
function globalScan() {
  openScanner({ title: 'Escanear QR', hint: 'Trabajador → abre su ficha / inicia préstamo · Herramienta → carrito, devolución o ficha', continuous: S.view === 'operacion' || S.view === 'auditoria', onScan: txt => (S.scanHandler || routeScan)(txt) });
}
function routeScan(txt) {
  const p = parseScan(txt);
  if (p.type === 'unknown') { toast('Código no registrado: ' + p.code, 'err'); return false; }
  if (S.view === 'operacion') return opScan(txt);
  if (S.view === 'auditoria' && S.audit) return auditScan(txt);
  closeModal();
  if (p.type === 'worker') { S.kardexId = p.code; go('kardex'); }
  else toolDrawer(p.code);
}

/* ======================================================================
 *  VISTAS
 * ====================================================================== */
const VIEWS = {};

/* ---------- autocompletar reutilizable ---------- */
function autocomplete(input, listEl, source, onPick, render, exact) {
  let opts = [], idx = -1;
  const draw = () => {
    const q = norm(input.value.trim());
    if (!q) { listEl.classList.add('hidden'); return; }
    opts = source(q).slice(0, 30); idx = -1;
    listEl.innerHTML = opts.length ? opts.map((o, i) => `<div class="ac-opt" data-i="${i}">${render(o)}</div>`).join('') : '<div class="empty">Sin resultados</div>';
    listEl.classList.remove('hidden');
    $$('.ac-opt', listEl).forEach(el => el.onmousedown = e => { e.preventDefault(); pick(+el.dataset.i); });
  };
  const pick = i => { const o = opts[i]; if (!o) return; listEl.classList.add('hidden'); input.value = ''; onPick(o); };
  input.oninput = draw;
  input.onblur = () => setTimeout(() => listEl.classList.add('hidden'), 150);
  input.onkeydown = e => {
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, opts.length - 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); mark(); e.preventDefault(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const raw = input.value.trim(); const ex = exact && raw ? exact(raw) : null;
      if (idx >= 0) pick(idx); else if (ex) { input.value = ''; listEl.classList.add('hidden'); onPick(ex); } else if (opts.length) pick(0);
    }
  };
  const mark = () => $$('.ac-opt', listEl).forEach((el, i) => el.classList.toggle('on', i === idx));
}
const searchTools = q => S.data.herramientas.filter(t => norm(t.Codigo + ' ' + t.Descripcion + ' ' + t.Marca + ' ' + t.Modelo + ' ' + t.Serie + ' ' + t.Medida + ' ' + t.Subcategoria + ' ' + t.Observaciones).includes(q))
  .sort((a, b) => (norm(a.Codigo).startsWith(q) ? -1 : 0) - (norm(b.Codigo).startsWith(q) ? -1 : 0));
const exactTool = raw => { const p = parseScan(raw); return p.type === 'tool' ? S.tool.get(p.code) : null; };
const exactPerson = raw => { const p = parseScan(raw); return p.type === 'worker' ? S.person.get(p.code) : null; };
const searchPeople = q => S.data.personal.filter(p => norm(p.ID_Ficha + ' ' + p.Nombre_Completo + ' ' + p.Cargo + ' ' + p.Grupo).includes(q));
const toolOpt = t => `<span class="code">${esc(t.Codigo)}</span><div class="grow"><div class="t">${esc(t.Descripcion)}</div><div class="s muted">${esc([t.Marca, t.Modelo, t.Medida].filter(Boolean).join(' · '))}</div></div>${availPill(t)}`;
const personOpt = p => `<div class="avatar" style="width:30px;height:30px;font-size:12px">${initials(p.Nombre_Completo)}</div><div class="grow"><div class="t">${esc(p.Nombre_Completo)}</div><div class="s muted">${esc(p.ID_Ficha)} · ${esc(p.Cargo || '')} ${p.Grupo ? '· ' + esc(p.Grupo) : ''}</div></div>${(S.loansByWorker.get(U(p.ID_Ficha)) || []).length ? `<span class="pill p-amber">${(S.loansByWorker.get(U(p.ID_Ficha)) || []).length} en custodia</span>` : ''}`;
function availPill(t) {
  if (U(t.Prestable) === 'NO') return '<span class="pill p-gray">No prestable</span>';
  if (n0(t.Stock_Disponible) > 0) return `<span class="pill p-green">${t.Stock_Disponible}/${t.Stock_Total} disp.</span>`;
  if (n0(t.Prestado) > 0) return '<span class="pill p-amber">Prestada</span>';
  if (n0(t.Cant_Danada) > 0) return '<span class="pill p-red">Dañada</span>';
  return '<span class="pill p-red">Sin stock</span>';
}
function estadoPill(e) {
  const v = norm(e);
  const c = v.includes('bueno') || v.includes('nuevo') ? 'p-green' : v.includes('regular') ? 'p-amber' : v.includes('dan') || v.includes('perd') || v.includes('baja') ? 'p-red' : 'p-gray';
  return `<span class="pill ${c}">${esc(e || '—')}</span>`;
}

/* ===================== OPERACIÓN: PRÉSTAMO / DEVOLUCIÓN ===================== */
VIEWS.operacion = {
  render(root) {
    root.innerHTML = `
      <div class="row between wrap" style="margin-bottom:12px">
        <div class="seg"><button data-m="out" class="${S.op.mode === 'out' ? 'on out' : ''}">${ic('out')} Préstamo</button><button data-m="in" class="${S.op.mode === 'in' ? 'on in' : ''}">${ic('in')} Devolución</button></div>
        <div class="muted" style="font-size:13px">Flujo: escanear trabajador → escanear herramientas → confirmar</div>
      </div><div id="opBody"></div>`;
    $$('[data-m]', root).forEach(b => b.onclick = () => { S.op.mode = b.dataset.m; S.op.retFilter = null; renderView(); });
    S.scanHandler = opScan;
    S.op.mode === 'out' ? renderLoan($('#opBody')) : renderReturn($('#opBody'));
  },
  update() { S.op.mode === 'out' ? (drawLoanWorker(), drawCart()) : drawReturnList(); }
};
function opScan(txt) {
  const p = parseScan(txt);
  if (p.type === 'unknown') { toast('Código no registrado: ' + p.code, 'err'); return false; }
  if (S.op.mode === 'out') {
    if (p.type === 'worker') { setLoanWorker(p.code); return true; }
    if (!S.op.worker) { toast('Primero escanee el QR del trabajador', 'warn'); return false; }
    return addToCart(p.code);
  }
  // devolución
  if (p.type === 'worker') { S.op.retFilter = { worker: p.code }; drawReturnList(); toast('Préstamos de ' + (S.person.get(p.code) || {}).Nombre_Completo); return true; }
  const loans = (S.loansByTool.get(p.code) || []);
  if (!loans.length) { toast(p.code + ' no tiene préstamos abiertos', 'warn'); return false; }
  loans.forEach(l => S.op.retSel.set(l.ID_Mov, S.op.retSel.get(l.ID_Mov) || { cant: n0(l.Pendiente), estado: 'Bueno', obs: '' }));
  S.op.retFilter = null; drawReturnList(); toast('Seleccionada para devolución: ' + p.code, 'ok'); return true;
}

/* -------- fecha y hora del registro (manual opcional) -------- */
function dtField(id, label) {
  return `<div class="field"><label>${label}</label><div class="dtwrap"><input class="inp" type="datetime-local" id="${id}" value="${toLocalInput(new Date())}" max="${toLocalInput(new Date(Date.now() + 5 * 60e3))}"><button type="button" class="btn sm" data-now="${id}" title="Poner fecha y hora actual">Ahora</button></div>
    <div class="dim" style="font-size:11.5px">Déjelo así para usar la hora actual. Cámbielo solo para registrar un vale en papel de otra fecha u hora.</div></div>`;
}
function bindDt(id) {
  const el = $('#' + id); if (!el) return;
  el.dataset.dirty = '';
  el.oninput = () => { el.dataset.dirty = '1'; };
  const b = $(`[data-now="${id}"]`); if (b) b.onclick = () => { el.value = toLocalInput(new Date()); el.dataset.dirty = ''; };
  // mantiene la hora "actual" al día mientras no se edite
  clearInterval(el._t); el._t = setInterval(() => { if (!document.body.contains(el)) return clearInterval(el._t); if (!el.dataset.dirty) el.value = toLocalInput(new Date()); }, 30000);
}
/** Devuelve la fecha manual (ISO) o '' si es "ahora" */
function dtValue(id) {
  const el = $('#' + id); if (!el || !el.dataset.dirty || !el.value) return '';
  const d = fromLocalInput(el.value); if (!d) return '';
  if (d.getTime() > Date.now() + 5 * 60e3) throw new Error('La fecha y hora no puede ser futura');
  return d.toISOString();
}

/* -------- herramienta NO inventariada (formulario) -------- */
function niForm(onAdd, opts = {}) {
  const ov = modal(opts.title || 'Herramienta no inventariada', `
    <div class="demo-banner" style="margin-bottom:12px">La herramienta no está en el catálogo. Al confirmar se crea automáticamente con código <b class="mono">NI-0001</b>, <b class="mono">NI-0002</b>… y su QR, para que quede trazada y luego pueda devolverse o etiquetarse.</div>
    <form id="nif" class="grid g2">
      <div class="field" style="grid-column:1/-1"><label>Descripción *</label><input class="inp" name="Descripcion" required placeholder="Ej. Llave stillson 24&quot;"></div>
      <div class="field"><label>Marca</label><input class="inp" name="Marca"></div><div class="field"><label>Modelo</label><input class="inp" name="Modelo"></div>
      <div class="field"><label>Serie / N°</label><input class="inp" name="Serie"></div><div class="field"><label>Medida / Capacidad</label><input class="inp" name="Medida"></div>
      <div class="field"><label>Cantidad</label><input class="inp" name="cantidad" type="number" min="1" value="1"></div>
      ${opts.estado ? `<div class="field"><label>Estado</label><select class="inp" name="estado"><option>Bueno</option><option>Regular</option><option>Dañado</option></select></div>` : '<div></div>'}
      <div class="field" style="grid-column:1/-1"><label>Observaciones</label><input class="inp" name="Observaciones" placeholder="Procedencia, dueño, motivo…"></div>
    </form>`, `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="niOk">${ic('plus')} ${opts.okLabel || 'Agregar'}</button>`);
  $('#nif').Descripcion.focus();
  $('#niOk').onclick = () => {
    const f = $('#nif'); if (!f.reportValidity()) return;
    const d = Object.fromEntries(new FormData(f).entries()); d.cantidad = Math.max(1, n0(d.cantidad)); d.Descripcion = d.Descripcion.trim();
    closeModal(); onAdd(d);
  };
}

/* -------- préstamo -------- */
function renderLoan(el) {
  const prev = new Date(Date.now() + (n0(S.config.PLAZO_HORAS) || 12) * 3600e3);
  el.innerHTML = `
  <div class="grid" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)" id="loanGrid">
    <div class="grid">
      <div class="card">
        <div class="card-h"><div class="row"><span class="step" id="st1">1</span><div><h3>Trabajador que recibe</h3><div class="sub">Escanee su credencial QR o búsquelo por nombre / ID</div></div></div>
          <div class="row wrap"><button class="btn primary" id="scanW">${ic('scan')} Escanear QR</button><button class="btn blue" id="newW">${ic('plus')} Nuevo personal</button></div></div>
        <div class="ac"><input class="inp" id="wSearch" placeholder="Buscar trabajador: nombre, ID-MEC-…, grupo"><div class="ac-list hidden" id="wList"></div></div>
        <div id="wBox" style="margin-top:12px"></div>
      </div>
      <div class="card">
        <div class="card-h"><div class="row"><span class="step" id="st2">2</span><div><h3>Herramientas a entregar</h3><div class="sub">Escaneo continuo: cada QR leído entra al carrito</div></div></div>
          <div class="row wrap"><button class="btn primary" id="scanT">${ic('scan')} Escanear herramientas</button><button class="btn" id="niT" style="border-color:rgba(245,195,48,.6);color:#ffdd75">${ic('plus')} No inventariada</button></div></div>
        <div class="ac"><input class="inp" id="tSearch" placeholder="Buscar: código, ítem (1, 25, 1001, 508-A-0001), descripción, marca…"><div class="ac-list hidden" id="tList"></div></div>
        <div id="cart" style="margin-top:12px"></div>
      </div>
    </div>
    <div class="card" style="align-self:start;position:sticky;top:86px">
      <div class="card-h"><div class="row"><span class="step" id="st3">3</span><div><h3>Confirmar entrega</h3><div class="sub">Se registra con fecha, hora y su usuario</div></div></div></div>
      <div class="grid">
        ${dtField('fPrest', 'Fecha y hora del préstamo')}
        <div class="field"><label>Devolución prevista</label><input class="inp" type="datetime-local" id="prev" value="${toLocalInput(prev)}"></div>
        <div class="field"><label>Estado de salida (general)</label><select class="inp" id="estSal"><option>Bueno</option><option>Regular</option><option>Nuevo</option></select></div>
        <div class="field"><label>Observaciones / Orden de trabajo</label><textarea class="inp" id="obs" placeholder="Ej. OT-2026-118, trabajo en molino SAG"></textarea></div>
        <div class="stat"><div class="l">Entrega</div><div style="font-weight:700">${esc(S.user.nombre)}</div><div class="muted" style="font-size:12px">${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz', hour12: false })}</div></div>
        <button class="btn primary lg" id="confirmLoan">${ic('check')} Confirmar préstamo</button>
        <label class="row muted" style="font-size:13px"><input type="checkbox" id="vale" checked> Generar vale de salida en PDF</label>
      </div>
    </div>
  </div>`;
  if (innerWidth < 900) $('#loanGrid').style.gridTemplateColumns = '1fr';
  autocomplete($('#wSearch'), $('#wList'), searchPeople, p => setLoanWorker(U(p.ID_Ficha)), personOpt, exactPerson);
  autocomplete($('#tSearch'), $('#tList'), searchTools, t => { if (!S.op.worker) return toast('Primero seleccione el trabajador', 'warn'); addToCart(U(t.Codigo)); }, toolOpt, exactTool);
  $('#scanW').onclick = () => openScanner({ title: 'Escanear credencial del trabajador', onScan: txt => { const r = opScan(txt); if (r !== false && parseScan(txt).type === 'worker') closeModal(); return r; } });
  $('#scanT').onclick = () => { if (!S.op.worker) return toast('Primero escanee el QR del trabajador', 'warn'); openScanner({ title: 'Escanear herramientas', continuous: true, hint: 'Apunte a cada etiqueta QR. Las repetidas suman cantidad.', onScan: opScan }); };
  $('#confirmLoan').onclick = e => confirmLoan(e.currentTarget);
  $('#newW').onclick = () => personForm(null, w => setLoanWorker(U(w.ID_Ficha)));
  $('#niT').onclick = () => { if (!S.op.worker) return toast('Primero seleccione o registre al trabajador', 'warn'); niForm(d => { S.op.cart.push({ ni: true, code: 'NI-' + (S.op.cart.filter(l => l.ni).length + 1), cant: d.cantidad, data: d }); drawCart(); toast('+ ' + d.Descripcion + ' (no inventariada)', 'ok'); }); };
  bindDt('fPrest');
  drawLoanWorker(); drawCart();
}
function setLoanWorker(id) {
  const p = S.person.get(id); if (!p) { toast('Trabajador no registrado: ' + id, 'err'); return false; }
  if (U(p.Activo) === 'NO') { toast('Trabajador inactivo', 'err'); return false; }
  S.op.worker = id; drawLoanWorker(); toast('Trabajador: ' + p.Nombre_Completo, 'ok'); return true;
}
function drawLoanWorker() {
  const box = $('#wBox'); if (!box) return;
  const p = S.op.worker && S.person.get(S.op.worker);
  $('#st1') && $('#st1').classList.toggle('done', !!p);
  if (!p) { box.innerHTML = '<div class="empty" style="border:1px dashed var(--line2);border-radius:12px">Ningún trabajador seleccionado</div>'; return; }
  const loans = S.loansByWorker.get(U(p.ID_Ficha)) || [], venc = loans.filter(l => l.Vencido).length;
  box.innerHTML = `<div class="worker"><div class="avatar">${initials(p.Nombre_Completo)}</div><div class="grow"><div class="nm">${esc(p.Nombre_Completo)}</div>
    <div class="muted" style="font-size:13px"><span class="mono" style="color:var(--blue)">${esc(p.ID_Ficha)}</span> · ${esc(p.Cargo || '')} ${p.Grupo ? '· ' + esc(p.Grupo) : ''} · Turno ${esc(p.Turno || '—')}</div>
    <div class="row wrap" style="margin-top:6px"><span class="pill p-amber">${loans.reduce((a, l) => a + n0(l.Pendiente), 0)} en custodia</span>${venc ? `<span class="pill p-red">${venc} vencido(s)</span>` : ''}</div></div>
    <button class="btn sm ghost" id="wClear">${ic('x')} Cambiar</button></div>
    ${venc ? `<div class="demo-banner" style="margin-top:8px;border-color:rgba(255,93,93,.5);color:#ff9d9d;background:rgba(255,93,93,.08)">Atención: este trabajador tiene préstamos vencidos sin devolver.</div>` : ''}`;
  $('#wClear').onclick = () => { S.op.worker = null; drawLoanWorker(); };
}
function addToCart(code) {
  const t = S.tool.get(code); if (!t) { toast('Herramienta no registrada', 'err'); return false; }
  if (U(t.Prestable) === 'NO') { toast(code + ' no es prestable (' + t.Categoria + ')', 'err'); return false; }
  const line = S.op.cart.find(l => l.code === code);
  const want = (line ? line.cant : 0) + 1;
  if (want > n0(t.Stock_Disponible)) {
    const who = (S.loansByTool.get(code) || []).map(l => l.Nombre_Trabajador).join(', ');
    toast(`${code} sin stock disponible${who ? ' — la tiene: ' + who : ''}`, 'err'); return false;
  }
  if (line) line.cant = want; else S.op.cart.push({ code, cant: 1, estado: '' });
  drawCart(); toast('+ ' + t.Descripcion, 'ok'); return true;
}
function drawCart() {
  const el = $('#cart'); if (!el) return;
  $('#st2') && $('#st2').classList.toggle('done', S.op.cart.length > 0);
  const btn = $('#confirmLoan');
  if (btn) { const n = S.op.cart.reduce((a, l) => a + l.cant, 0); btn.innerHTML = `${ic('check')} Confirmar préstamo${n ? ` (${n})` : ''}`; btn.disabled = !(n && S.op.worker); }
  if (!S.op.cart.length) { el.innerHTML = '<div class="empty" style="border:1px dashed var(--line2);border-radius:12px">Carrito vacío — escanee o busque herramientas</div>'; return; }
  el.innerHTML = `<div class="list">${S.op.cart.map((l, i) => {
    if (l.ni) return `<div class="item" style="border-color:rgba(245,195,48,.45)"><div class="qrbox" style="padding:3px;width:46px;height:46px;font-size:10px;color:#333;text-align:center">QR al<br>guardar</div>
      <div class="grow"><div class="row wrap"><span class="ni-badge">NO INVENTARIADA</span><span class="t">${esc(l.data.Descripcion)}</span></div>
      <div class="s">${esc([l.data.Marca, l.data.Modelo, l.data.Medida, l.data.Serie].filter(Boolean).join(' · ') || 'Se registrará en el catálogo como NI-xxxx')}</div></div>
      <div class="qty"><button data-dec="${i}">−</button><input value="${l.cant}" data-q="${i}" inputmode="numeric"><button data-inc="${i}">+</button></div>
      <button class="btn icon ghost" data-rm="${i}" title="Quitar">${ic('trash')}</button></div>`;
    const t = S.tool.get(l.code) || {}; const over = l.cant > n0(t.Stock_Disponible);
    return `<div class="item" style="${over ? 'border-color:rgba(255,93,93,.5)' : ''}"><div class="qrbox" style="padding:3px">${qrSVG(l.code, 40)}</div>
      <div class="grow"><div class="row wrap"><span class="code">${esc(l.code)}</span><span class="t">${esc(t.Descripcion)}</span></div>
      <div class="s">${esc([t.Marca, t.Modelo, t.Medida, t.Ubicacion].filter(Boolean).join(' · '))} · Disp. ${t.Stock_Disponible}/${t.Stock_Total}</div></div>
      <div class="qty"><button data-dec="${i}">−</button><input value="${l.cant}" data-q="${i}" inputmode="numeric"><button data-inc="${i}">+</button></div>
      <button class="btn icon ghost" data-rm="${i}" title="Quitar">${ic('trash')}</button></div>`;
  }).join('')}</div>`;
  $$('[data-rm]', el).forEach(b => b.onclick = () => { S.op.cart.splice(+b.dataset.rm, 1); drawCart(); });
  const setQ = (i, v) => { const l = S.op.cart[i]; v = Math.max(1, n0(v) || 1); if (!l.ni) v = Math.min(v, n0(S.tool.get(l.code).Stock_Disponible)); l.cant = v; drawCart(); };
  $$('[data-inc]', el).forEach(b => b.onclick = () => setQ(+b.dataset.inc, S.op.cart[+b.dataset.inc].cant + 1));
  $$('[data-dec]', el).forEach(b => b.onclick = () => setQ(+b.dataset.dec, S.op.cart[+b.dataset.dec].cant - 1));
  $$('[data-q]', el).forEach(b => b.onchange = () => setQ(+b.dataset.q, b.value));
}
async function confirmLoan(btn) {
  if (!S.op.worker || !S.op.cart.length) return;
  const p = S.person.get(S.op.worker), prev = fromLocalInput($('#prev').value);
  let fecha; try { fecha = dtValue('fPrest'); } catch (e) { return toast(e.message, 'err'); }
  const base = fecha ? new Date(fecha) : new Date();
  if (prev && prev < base) return toast('La devolución prevista no puede ser anterior a la fecha del préstamo', 'err');
  const items = S.op.cart.map(l => l.ni ? { nuevo: l.data, cantidad: l.cant, estado: $('#estSal').value } : { codigo: l.code, cantidad: l.cant, estado: $('#estSal').value });
  const snapshot = { worker: p, items: S.op.cart.map(l => ({ ...l, t: l.ni ? l.data : S.tool.get(l.code) })), prev, obs: $('#obs').value, estado: $('#estSal').value, at: base };
  await guard(async () => {
    const r = await api('prestar', { idTrabajador: S.op.worker, items, fecha, prevista: prev ? prev.toISOString() : '', obs: $('#obs').value, estadoSalida: $('#estSal').value });
    if (r.codigos) snapshot.items.forEach((l, i) => { l.code = r.codigos[i] || l.code; });
    toast(`Préstamo registrado (${r.registrados} ítems) · ${r.lote}`, 'ok');
    if ($('#vale').checked) valePDF(snapshot, r.lote);
    S.op.cart = []; S.op.worker = null; await loadData(true); renderView();
    const nis = snapshot.items.filter(l => l.ni).map(l => S.tool.get(U(l.code))).filter(Boolean);
    if (nis.length) niCreated(nis);
  }, btn);
}

function niCreated(tools) {
  const ov = modal('Herramientas no inventariadas registradas', `<p class="muted" style="margin-top:0">Quedaron en el catálogo (categoría <b>No inventariada</b>) con su propio QR. Imprima y pegue la etiqueta para que la próxima vez se escaneen.</p>
    <div class="label-prev">${tools.map(t => `<div class="label">${qrSVG(t.Codigo, 54)}<div><b>${esc(t.Codigo)}</b><div>${esc(t.Descripcion)}</div></div></div>`).join('')}</div>`,
    `<button class="btn" data-close>Después</button><button class="btn primary" id="niLbl">${ic('print')} Imprimir etiquetas</button>`);
  $('#niLbl').onclick = () => labelsPDF(tools.map(t => ({ type: 'tool', t })), 'tool');
}

/* -------- devolución -------- */
function renderReturn(el) {
  el.innerHTML = `
  <div class="card">
    <div class="card-h"><div class="row"><span class="step">↩</span><div><h3>Registrar devolución</h3><div class="sub">Escanee la herramienta (o la credencial del trabajador) y marque el estado de retorno</div></div></div>
      <div class="row wrap"><button class="btn green" id="scanR">${ic('scan')} Escanear</button><button class="btn" id="niR" style="border-color:rgba(245,195,48,.6);color:#ffdd75">${ic('plus')} Recibir no inventariada</button></div></div>
    <div class="row wrap">
      <div class="ac grow" style="min-width:240px"><input class="inp" id="rSearch" placeholder="Filtrar por trabajador, código o descripción…"><div class="ac-list hidden" id="rList"></div></div>
      <div class="chips" id="rChips"></div>
    </div>
    <div id="retList" style="margin-top:12px"></div>
  </div>
  <div class="card" style="margin-top:14px;position:sticky;bottom:${innerWidth < 700 ? 78 : 10}px;z-index:5;box-shadow:var(--shadow)">
    <div class="row wrap between"><div><b id="retCount">0 seleccionados</b><div class="muted" style="font-size:13px">Recibe: ${esc(S.user.nombre)}</div></div>
    <div style="min-width:260px;flex:1;max-width:420px">${dtField('fRet', 'Fecha y hora de recepción')}</div>
    <div class="row"><label class="row muted" style="font-size:13px"><input type="checkbox" id="valeR" checked> Comprobante PDF</label><button class="btn green lg" id="confirmRet">${ic('check')} Confirmar devolución</button></div></div>
  </div>`;
  autocomplete($('#rSearch'), $('#rList'), q => [...searchPeople(q).filter(p => S.loansByWorker.has(U(p.ID_Ficha))).map(p => ({ k: 'w', p })), ...searchTools(q).filter(t => S.loansByTool.has(U(t.Codigo))).map(t => ({ k: 't', t }))],
    o => { if (o.k === 'w') S.op.retFilter = { worker: U(o.p.ID_Ficha) }; else opScan(o.t.Codigo); drawReturnList(); },
    o => o.k === 'w' ? personOpt(o.p) : toolOpt(o.t));
  $('#scanR').onclick = () => openScanner({ title: 'Escanear para devolución', continuous: true, hint: 'Escanee cada herramienta que llega a bodega.', onScan: opScan });
  $('#confirmRet').onclick = e => confirmReturn(e.currentTarget);
  $('#niR').onclick = () => receiveNIForm();
  bindDt('fRet');
  drawReturnList();
}
function drawReturnList() {
  const el = $('#retList'); if (!el) return;
  let loans = S.data.prestamos.slice();
  const f = S.op.retFilter;
  const chips = [['all', 'Todos (' + loans.length + ')'], ['venc', 'Vencidos (' + loans.filter(l => l.Vencido).length + ')'], ['sel', 'Seleccionados']];
  $('#rChips').innerHTML = chips.map(([k, l]) => `<button class="chip ${(!f && k === 'all') || (f && f.venc && k === 'venc') || (f && f.sel && k === 'sel') ? 'on' : ''}" data-c="${k}">${l}</button>`).join('') +
    (f && f.worker ? `<button class="chip on" data-c="all">${esc((S.person.get(f.worker) || {}).Nombre_Completo || f.worker)} ✕</button>` : '');
  $$('[data-c]', $('#rChips')).forEach(b => b.onclick = () => { S.op.retFilter = b.dataset.c === 'venc' ? { venc: true } : b.dataset.c === 'sel' ? { sel: true } : null; drawReturnList(); });
  if (f && f.worker) loans = loans.filter(l => U(l.ID_Trabajador) === f.worker);
  if (f && f.venc) loans = loans.filter(l => l.Vencido);
  if (f && f.sel) loans = loans.filter(l => S.op.retSel.has(l.ID_Mov));
  loans.sort((a, b) => (S.op.retSel.has(b.ID_Mov) - S.op.retSel.has(a.ID_Mov)) || (b.Vencido - a.Vencido) || String(a.Nombre_Trabajador).localeCompare(b.Nombre_Trabajador));
  // limpia selecciones de préstamos ya cerrados
  const open = new Set(S.data.prestamos.map(l => l.ID_Mov)); [...S.op.retSel.keys()].forEach(k => { if (!open.has(k)) S.op.retSel.delete(k); });
  if (!loans.length) el.innerHTML = '<div class="empty">No hay préstamos abiertos para este filtro 🎉</div>';
  else el.innerHTML = `<div class="list">${loans.map(l => {
    const sel = S.op.retSel.get(l.ID_Mov);
    return `<div class="item ret-row" style="${sel ? 'border-color:rgba(31,201,141,.55);background:rgba(31,201,141,.05)' : ''}">
      <input type="checkbox" data-sel="${l.ID_Mov}" ${sel ? 'checked' : ''} style="width:20px;height:20px">
      <div style="min-width:0"><div class="row wrap"><span class="code">${esc(l.Codigo_Herramienta)}</span><span class="t">${esc(l.Descripcion)}</span>${l.Vencido ? '<span class="pill p-red">VENCIDO</span>' : ''}</div>
        <div class="s">${ic('user', 'width="13" height="13" style="vertical-align:-2px"')} <b style="color:var(--text)">${esc(l.Nombre_Trabajador)}</b> · ${esc(l.ID_Trabajador)} · Salió ${fdt(l.Fecha_Hora)} · Prevista ${fdt(l.Fecha_Devolucion_Prevista)} · Pend. ${l.Pendiente}</div></div>
      ${sel ? `<div class="ret-ctrl row"><div class="qty"><button data-rd="${l.ID_Mov}">−</button><input value="${sel.cant}" data-rq="${l.ID_Mov}"><button data-ri="${l.ID_Mov}">+</button></div>
        <select class="inp" data-re="${l.ID_Mov}" style="width:140px;min-height:34px;padding:5px 30px 5px 10px">${['Bueno', 'Dañado', 'Perdido'].map(o => `<option ${sel.estado === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <input class="inp ret-ctrl" data-ro="${l.ID_Mov}" placeholder="Obs." value="${esc(sel.obs)}" style="min-height:34px;padding:5px 10px;max-width:180px">` : ''}
    </div>`;
  }).join('')}</div>`;
  $$('[data-sel]', el).forEach(c => c.onchange = () => { const l = S.data.prestamos.find(x => x.ID_Mov === c.dataset.sel); c.checked ? S.op.retSel.set(l.ID_Mov, { cant: n0(l.Pendiente), estado: 'Bueno', obs: '' }) : S.op.retSel.delete(l.ID_Mov); drawReturnList(); });
  const setc = (id, v) => { const l = S.data.prestamos.find(x => x.ID_Mov === id); const s = S.op.retSel.get(id); s.cant = Math.max(1, Math.min(n0(v) || 1, n0(l.Pendiente))); drawReturnList(); };
  $$('[data-ri]', el).forEach(b => b.onclick = () => setc(b.dataset.ri, S.op.retSel.get(b.dataset.ri).cant + 1));
  $$('[data-rd]', el).forEach(b => b.onclick = () => setc(b.dataset.rd, S.op.retSel.get(b.dataset.rd).cant - 1));
  $$('[data-rq]', el).forEach(b => b.onchange = () => setc(b.dataset.rq, b.value));
  $$('[data-re]', el).forEach(b => b.onchange = () => { S.op.retSel.get(b.dataset.re).estado = b.value; });
  $$('[data-ro]', el).forEach(b => b.oninput = () => { S.op.retSel.get(b.dataset.ro).obs = b.value; });
  const n = S.op.retSel.size; $('#retCount').textContent = n + ' seleccionado' + (n === 1 ? '' : 's'); $('#confirmRet').disabled = !n;
}
async function confirmReturn(btn) {
  const sel = [...S.op.retSel.entries()]; if (!sel.length) return;
  const bad = sel.filter(([, s]) => s.estado !== 'Bueno');
  if (bad.length && !(await confirmBox('Confirmar estados', `${bad.length} herramienta(s) se registrarán como <b>Dañado/Perdido</b>. Las dañadas quedan fuera de stock hasta repararlas; las perdidas se descuentan del stock total.`, 'Sí, registrar'))) return;
  const snap = sel.map(([id, s]) => ({ ...s, l: S.data.prestamos.find(x => x.ID_Mov === id) }));
  let fecha; try { fecha = dtValue('fRet'); } catch (e) { return toast(e.message, 'err'); }
  await guard(async () => {
    const r = await api('devolver', { fecha, devoluciones: sel.map(([id, s]) => ({ idPrestamo: id, cantidad: s.cant, estado: s.estado, obs: s.obs })) });
    toast(`Devolución registrada (${r.registrados})`, 'ok');
    if ($('#valeR').checked) devolucionPDF(snap, r.lote);
    S.op.retSel.clear(); S.op.retFilter = null; await loadData(true); renderView();
  }, btn);
}

/** Recepción en bodega de herramientas que no estaban inventariadas (con trabajador existente, nuevo o sin trabajador) */
function receiveNIForm() {
  const st = { worker: null, items: [] };
  const ov = modal('Recepción de herramienta no inventariada', `
    <div class="demo-banner" style="margin-bottom:12px">Use esto cuando llega a bodega una herramienta que no figura en el inventario (la trae un trabajador, viene de otra área, se encontró, etc.). Se crea en el catálogo como <b class="mono">NI-xxxx</b> con su QR y queda registrado quién la entregó.</div>
    <h4 class="cond" style="margin:0 0 8px;font-size:16px;text-transform:uppercase">1 · ¿Quién la entrega? <span class="muted" style="text-transform:none;font-family:Barlow">(opcional)</span></h4>
    <div class="seg" style="margin-bottom:10px"><button type="button" data-wm="exist" class="on in">Trabajador registrado</button><button type="button" data-wm="new">${ic('plus')} Nuevo personal</button><button type="button" data-wm="none">Sin trabajador</button></div>
    <div id="rnW"></div>
    <h4 class="cond" style="margin:16px 0 8px;font-size:16px;text-transform:uppercase">2 · Herramientas recibidas</h4>
    <div id="rnItems" class="list"></div>
    <button type="button" class="btn" id="rnAdd" style="margin-top:8px">${ic('plus')} Agregar herramienta</button>
    <div style="margin-top:16px">${dtField('fRn', 'Fecha y hora de recepción')}</div>`,
    `<button class="btn" data-close>Cancelar</button><button class="btn green" id="rnOk">${ic('check')} Registrar recepción</button>`, 'wide');
  let mode = 'exist';
  const drawW = () => {
    const el = $('#rnW');
    if (mode === 'none') { st.worker = null; el.innerHTML = '<div class="muted">Se registrará sin trabajador asociado.</div>'; return; }
    if (mode === 'new') {
      el.innerHTML = `<div class="grid g2"><div class="field"><label>ID / Ficha</label><input class="inp mono" id="rnId" value="${nextWorkerId()}"></div><div class="field"><label>Nombre completo *</label><input class="inp" id="rnNom"></div>
        <div class="field"><label>Cargo</label><input class="inp" id="rnCar" value="Mecánico"></div><div class="field"><label>Grupo</label><input class="inp" id="rnGru"></div>
        <div class="field"><label>Celular</label><input class="inp" id="rnTel" placeholder="+591 7xxxxxxx"></div><div class="field"><label>Turno</label><select class="inp" id="rnTur"><option>Día</option><option>Noche</option><option>Rotativo</option></select></div></div>`;
      return;
    }
    const p = st.worker && S.person.get(st.worker);
    el.innerHTML = p ? `<div class="worker"><div class="avatar">${initials(p.Nombre_Completo)}</div><div class="grow"><div class="nm">${esc(p.Nombre_Completo)}</div><div class="muted mono" style="font-size:13px">${esc(p.ID_Ficha)}</div></div><button type="button" class="btn sm ghost" id="rnWc">${ic('x')} Cambiar</button></div>`
      : `<div class="ac"><input class="inp" id="rnWs" placeholder="Buscar trabajador o escanear su credencial con lector…"><div class="ac-list hidden" id="rnWl"></div></div>`;
    if (p) $('#rnWc').onclick = () => { st.worker = null; drawW(); };
    else autocomplete($('#rnWs'), $('#rnWl'), searchPeople, w => { st.worker = U(w.ID_Ficha); drawW(); }, personOpt, exactPerson);
  };
  const drawItems = () => {
    $('#rnItems').innerHTML = st.items.length ? st.items.map((d, i) => `<div class="item"><span class="ni-badge">NI</span><div class="grow"><div class="t">${esc(d.Descripcion)} ×${d.cantidad}</div><div class="s">${esc([d.Marca, d.Modelo, d.Serie, d.Medida].filter(Boolean).join(' · '))}</div></div>${estadoPill(d.estado || 'Bueno')}<button type="button" class="btn icon ghost" data-rni="${i}">${ic('trash')}</button></div>`).join('')
      : '<div class="empty" style="border:1px dashed var(--line2);border-radius:12px;padding:16px">Agregue al menos una herramienta</div>';
    $$('[data-rni]', $('#rnItems')).forEach(b => b.onclick = () => { st.items.splice(+b.dataset.rni, 1); drawItems(); });
  };
  // formulario de ítem embebido (sin cerrar este modal)
  $('#rnAdd').onclick = () => {
    if ($('#rnForm')) return;
    const box = document.createElement('div'); box.id = 'rnForm'; box.className = 'card'; box.style.marginTop = '8px';
    box.innerHTML = `<div class="grid g2"><div class="field" style="grid-column:1/-1"><label>Descripción *</label><input class="inp" id="rnD"></div>
      <div class="field"><label>Marca</label><input class="inp" id="rnMa"></div><div class="field"><label>Modelo</label><input class="inp" id="rnMo"></div>
      <div class="field"><label>Serie / N°</label><input class="inp" id="rnSe"></div><div class="field"><label>Medida</label><input class="inp" id="rnMe"></div>
      <div class="field"><label>Cantidad</label><input class="inp" id="rnC" type="number" min="1" value="1"></div><div class="field"><label>Estado</label><select class="inp" id="rnE"><option>Bueno</option><option>Regular</option><option>Dañado</option></select></div>
      <div class="field" style="grid-column:1/-1"><label>Observaciones</label><input class="inp" id="rnO"></div></div>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn" id="rnX">Cancelar</button><button type="button" class="btn primary" id="rnY">${ic('check')} Agregar a la lista</button></div>`;
    $('#rnAdd').after(box); $('#rnD').focus();
    $('#rnX').onclick = () => box.remove();
    $('#rnY').onclick = () => {
      const D = $('#rnD').value.trim(); if (!D) return toast('Escriba la descripción', 'warn');
      st.items.push({ Descripcion: D, Marca: $('#rnMa').value, Modelo: $('#rnMo').value, Serie: $('#rnSe').value, Medida: $('#rnMe').value, cantidad: Math.max(1, n0($('#rnC').value)), estado: $('#rnE').value, obs: $('#rnO').value, Observaciones: $('#rnO').value });
      box.remove(); drawItems();
    };
  };
  $$('[data-wm]', ov).forEach(b => b.onclick = () => { mode = b.dataset.wm; $$('[data-wm]', ov).forEach(x => x.className = x === b ? 'on in' : ''); drawW(); });
  $('#rnOk').onclick = e => {
    if (!st.items.length) return toast('Agregue al menos una herramienta', 'warn');
    let fecha; try { fecha = dtValue('fRn'); } catch (er) { return toast(er.message, 'err'); }
    guard(async () => {
      let idT = mode === 'exist' ? st.worker : '';
      if (mode === 'new') {
        const w = { ID_Ficha: U($('#rnId').value), Nombre_Completo: $('#rnNom').value.trim().toUpperCase(), Cargo: $('#rnCar').value, Grupo: $('#rnGru').value, Telefono: $('#rnTel').value, Turno: $('#rnTur').value };
        if (!w.Nombre_Completo) throw new Error('Escriba el nombre del nuevo trabajador');
        await api('guardarTrabajador', { trabajador: w, nuevo: true }); idT = w.ID_Ficha;
      }
      const r = await api('recibirNoInventariada', { idTrabajador: idT || '', items: st.items, fecha });
      closeModal(); toast(`Recepción registrada: ${r.codigos.join(', ')}`, 'ok');
      await loadData(true); refreshView();
      niCreated(r.codigos.map(c => S.tool.get(U(c))).filter(Boolean));
    }, e.currentTarget);
  };
  drawW(); drawItems(); bindDt('fRn');
}

/* ===================== KARDEX ===================== */
VIEWS.kardex = {
  render(root) {
    root.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="row wrap">
      <div class="row grow" style="min-width:240px"><div class="logo box">${ic('users', 'width="22" height="22"')}</div>
      <div><div class="brand-s" style="color:var(--blue)">Mecánico activo</div><b class="cond" style="font-size:20px">Selecciona el trabajador</b></div></div>
      <div class="ac" style="flex:1;min-width:260px"><input class="inp" id="kSearch" placeholder="Buscar por nombre, ID o grupo…"><div class="ac-list hidden" id="kList"></div></div>
      <button class="btn primary" id="kScan">${ic('scan')} Escanear credencial</button></div></div><div id="kBody"></div>`;
    autocomplete($('#kSearch'), $('#kList'), searchPeople, p => { S.kardexId = U(p.ID_Ficha); drawKardex(); }, personOpt, exactPerson);
    $('#kScan').onclick = () => openScanner({ title: 'Escanear credencial', onScan: txt => { const p = parseScan(txt); if (p.type !== 'worker') { toast('No es un QR de trabajador', 'err'); return false; } closeModal(); S.kardexId = p.code; drawKardex(); } });
    S.scanHandler = txt => { const p = parseScan(txt); if (p.type === 'worker') { S.kardexId = p.code; drawKardex(); } else routeScan(txt); };
    if (!S.kardexId) { const first = [...S.loansByWorker.keys()][0]; S.kardexId = first || (S.data.personal[0] && U(S.data.personal[0].ID_Ficha)); }
    drawKardex();
  },
  update() { drawKardex(); }
};
async function drawKardex() {
  const el = $('#kBody'); if (!el) return;
  const p = S.person.get(S.kardexId);
  if (!p) { el.innerHTML = '<div class="empty card">Seleccione un trabajador</div>'; return; }
  const loans = S.loansByWorker.get(U(p.ID_Ficha)) || [];
  const units = loans.reduce((a, l) => a + n0(l.Pendiente), 0), venc = loans.filter(l => l.Vencido).length;
  el.innerHTML = `
  <div class="card" style="margin-bottom:14px"><div class="row wrap" style="gap:18px">
    <div class="qrbox">${qrSVG(workerQRText(p.ID_Ficha), 92)}</div>
    <div style="min-width:200px;flex:1.3"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em">Trabajador</div><div class="cond" style="font-size:24px;font-weight:800;line-height:1.1">${esc(p.Nombre_Completo)}</div>
      <div class="mono" style="color:var(--blue);font-size:13px">${esc(p.ID_Ficha)}</div><div class="muted" style="font-size:13px">${esc(p.Cargo || '')} ${p.Grupo ? '· ' + esc(p.Grupo) : ''} · Turno ${esc(p.Turno || '—')} ${p.Telefono ? '· ' + esc(p.Telefono) : ''}</div></div>
    <div class="stat" style="flex:1;min-width:130px"><div class="l">Empresa</div><div style="font-weight:700">${esc(p.Empresa || 'ESMI')}</div><div class="muted" style="font-size:12px">${esc(p.Area || '')}</div></div>
    <div class="stat" style="flex:1;min-width:120px"><div class="l">En custodia</div><div class="v" style="color:var(--brand)">${units} <span style="font-size:15px">herr.</span></div></div>
    <div class="stat" style="flex:1;min-width:120px"><div class="l">Vencidos</div><div class="v" style="color:${venc ? 'var(--red)' : 'var(--dim)'}">${venc}</div></div>
    <div class="stat" style="flex:1;min-width:120px"><div class="l">Total histórico</div><div class="v" style="color:var(--green)" id="kTot">…</div></div>
  </div></div>
  <div class="card" style="margin-bottom:14px"><div class="row wrap between"><div class="row"><span class="dot"></span><div><b>Servicios digitales del colaborador</b><div class="muted" style="font-size:13px">Portal con fotocheck QR, reporte por WhatsApp y documento oficial</div></div></div>
    <div class="row wrap"><a class="btn blue" id="kPortal" href="${esc(workerQRText(p.ID_Ficha))}" target="_blank" rel="noopener">${ic('phone')} Portal trabajador</a>
    <a class="btn green" id="kWa" target="_blank" rel="noopener">${ic('share')} WhatsApp</a>
    <button class="btn" id="kPdf">${ic('pdf')} Exportar PDF</button><button class="btn" id="kFoto">${ic('card')} Fotocheck</button>
    <button class="btn" id="kEdit">${ic('edit')} Editar</button><button class="btn primary" id="kLend">${ic('out')} Prestar</button></div></div></div>
  <div class="grid g2">
    <div class="card"><div class="card-h"><h3>Herramientas a su cargo</h3>${loans.length ? `<button class="btn sm green" id="kRetAll">${ic('in')} Devolver todo</button>` : ''}</div>
      ${loans.length ? `<div class="list">${loans.map(l => `<div class="item"><span class="code">${esc(l.Codigo_Herramienta)}</span><div class="grow"><div class="t">${esc(l.Descripcion)} ${n0(l.Pendiente) > 1 ? `×${l.Pendiente}` : ''}</div><div class="s">Desde ${fdt(l.Fecha_Hora)} · Prevista ${fdt(l.Fecha_Devolucion_Prevista)}</div></div>${l.Vencido ? '<span class="pill p-red">Vencido</span>' : '<span class="pill p-blue">En uso</span>'}<button class="btn sm" data-ret="${l.ID_Mov}">${ic('in')}</button></div>`).join('')}</div>` : '<div class="empty">Sin herramientas en custodia ✔</div>'}
    </div>
    <div class="card"><div class="card-h"><h3>Historial de movimientos</h3></div><div id="kHist"><div class="skel" style="height:120px"></div></div></div>
  </div>`;
  const wa = `*ESMI · Modificaciones Mecánicas*%0AKardex de ${encodeURIComponent(p.Nombre_Completo)} (${p.ID_Ficha})%0AHerramientas a cargo: ${units}${venc ? `%0A⚠ Vencidas: ${venc}` : ''}%0A${loans.map(l => '• ' + encodeURIComponent(l.Codigo_Herramienta + ' ' + l.Descripcion)).join('%0A')}%0A%0AConsulta tu kardex: ${encodeURIComponent(workerQRText(p.ID_Ficha))}`;
  const tel = String(p.Telefono || '').replace(/\D/g, '');
  $('#kWa').href = `https://wa.me/${tel}?text=${wa}`;
  $('#kPdf').onclick = () => kardexPDF(p, loans);
  $('#kFoto').onclick = () => labelsPDF([{ type: 'worker', p }], 'foto');
  $('#kEdit').onclick = () => personForm(p);
  $('#kLend').onclick = () => { S.op.mode = 'out'; S.op.worker = U(p.ID_Ficha); go('operacion'); };
  $$('[data-ret]', el).forEach(b => b.onclick = () => { const l = loans.find(x => x.ID_Mov === b.dataset.ret); S.op.retSel.set(l.ID_Mov, { cant: n0(l.Pendiente), estado: 'Bueno', obs: '' }); S.op.mode = 'in'; S.op.retFilter = { sel: true }; go('operacion'); });
  if ($('#kRetAll')) $('#kRetAll').onclick = () => { loans.forEach(l => S.op.retSel.set(l.ID_Mov, { cant: n0(l.Pendiente), estado: 'Bueno', obs: '' })); S.op.mode = 'in'; S.op.retFilter = { worker: U(p.ID_Ficha) }; go('operacion'); };
  try {
    const h = await api('getHistorial', { trabajador: p.ID_Ficha, limite: 300 });
    if (S.kardexId !== U(p.ID_Ficha) || !$('#kHist')) return;
    $('#kTot').textContent = h.movimientos.length;
    $('#kHist').innerHTML = movTable(h.movimientos, false, 'max-height:420px');
    S._kHist = h.movimientos;
  } catch (e) { if ($('#kHist')) $('#kHist').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
const TIPO_PILL = { RECEPCION: 'p-blue', PRESTAMO: 'p-amber', DEVOLUCION: 'p-green', PERDIDA: 'p-red', BAJA: 'p-red', ALTA: 'p-blue', AJUSTE: 'p-gray', REPARACION: 'p-violet', AUDITORIA: 'p-violet' };
function movTable(rows, full, style = '') {
  if (!rows.length) return '<div class="empty">Sin movimientos</div>';
  return `<div class="tbl-wrap" style="${style}"><table class="tbl"><thead><tr><th>Fecha</th><th>Tipo</th>${full ? '<th>Trabajador</th>' : ''}<th>Herramienta</th><th class="num">Cant.</th><th>Estado</th><th>Registró</th>${full ? '<th>Obs.</th>' : ''}</tr></thead><tbody>
  ${rows.map(m => `<tr><td class="mono" style="font-size:12px;white-space:nowrap">${fdt(m.Fecha_Hora)}</td><td><span class="pill ${TIPO_PILL[m.Tipo] || 'p-gray'}">${esc(m.Tipo)}</span></td>
    ${full ? `<td>${esc(m.Nombre_Trabajador || '—')}</td>` : ''}<td>${m.Codigo_Herramienta ? `<span class="code">${esc(m.Codigo_Herramienta)}</span> ` : ''}${esc(m.Descripcion || '')}</td>
    <td class="num">${esc(m.Cantidad)}</td><td>${m.Estado ? estadoPill(m.Estado) : ''}</td><td class="muted" style="font-size:12.5px">${esc(String(m.Admin || '').replace(/\s*\(.*\)/, ''))}</td>${full ? `<td class="muted" style="font-size:12.5px">${esc(m.Observaciones || '')}</td>` : ''}</tr>`).join('')}
  </tbody></table></div>`;
}

/* ===================== INVENTARIO ===================== */
VIEWS.inventario = {
  render(root) {
    const cats = [...new Set(S.data.herramientas.map(t => t.Categoria).filter(Boolean))].sort();
    root.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="row wrap">
      <div class="grow" style="min-width:220px;position:relative"><input class="inp" id="iq" placeholder="Buscar código, descripción, marca, serie, medida…" value="${esc(S.inv.q)}"></div>
      <select class="inp" id="icat" style="width:auto;min-width:200px"><option value="">Todas las categorías</option>${cats.map(c => `<option ${S.inv.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <select class="inp" id="ist" style="width:auto"><option value="">Todos los estados</option>${[['disp', 'Con stock disponible'], ['prest', 'En préstamo'], ['dan', 'Con unidades dañadas'], ['sin', 'Sin stock']].map(([k, l]) => `<option value="${k}" ${S.inv.st === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn" id="iScan">${ic('scan')}</button><button class="btn" id="iXls">${ic('xls')} Excel</button><button class="btn green" id="iNew">${ic('plus')} Nueva</button></div>
      <div id="iCats" class="chips" style="margin-top:10px"></div></div>
      <div id="iBody"></div>`;
    const upd = () => { S.inv.limit = 80; drawInv(); };
    $('#iq').oninput = e => { S.inv.q = e.target.value; upd(); };
    $('#icat').onchange = e => { S.inv.cat = e.target.value; upd(); };
    $('#ist').onchange = e => { S.inv.st = e.target.value; upd(); };
    $('#iNew').onclick = () => toolForm();
    $('#iXls').onclick = () => inventoryXLSX(filteredTools());
    $('#iScan').onclick = () => openScanner({ title: 'Buscar herramienta por QR', onScan: txt => { const p = parseScan(txt); if (p.type !== 'tool') { toast('No es una herramienta', 'err'); return false; } closeModal(); toolDrawer(p.code); } });
    S.scanHandler = txt => { const p = parseScan(txt); p.type === 'tool' ? toolDrawer(p.code) : routeScan(txt); };
    drawInv();
  },
  update() { drawInv(); }
};
function filteredTools() {
  const q = norm(S.inv.q);
  return S.data.herramientas.filter(t => {
    if (S.inv.cat && t.Categoria !== S.inv.cat) return false;
    if (S.inv.st === 'disp' && !(n0(t.Stock_Disponible) > 0)) return false;
    if (S.inv.st === 'prest' && !(n0(t.Prestado) > 0)) return false;
    if (S.inv.st === 'dan' && !(n0(t.Cant_Danada) > 0)) return false;
    if (S.inv.st === 'sin' && n0(t.Stock_Disponible) > 0) return false;
    return !q || norm([t.Codigo, t.Descripcion, t.Marca, t.Modelo, t.Serie, t.Medida, t.Subcategoria, t.Ubicacion].join(' ')).includes(q);
  });
}
function drawInv() {
  const el = $('#iBody'); if (!el) return;
  const rows = filteredTools();
  const byCat = {}; S.data.herramientas.forEach(t => { byCat[t.Categoria] = (byCat[t.Categoria] || 0) + 1; });
  $('#iCats').innerHTML = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button class="chip ${S.inv.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)} · ${n}</button>`).join('');
  $$('[data-cat]', $('#iCats')).forEach(b => b.onclick = () => { S.inv.cat = S.inv.cat === b.dataset.cat ? '' : b.dataset.cat; $('#icat').value = S.inv.cat; S.inv.limit = 80; drawInv(); });
  const tot = rows.reduce((a, t) => a + n0(t.Stock_Total), 0), disp = rows.reduce((a, t) => a + n0(t.Stock_Disponible), 0);
  el.innerHTML = `<div class="row between" style="margin:0 2px 8px"><div class="muted">${rows.length} registros · ${tot} unidades · <span style="color:var(--green)">${disp} disponibles</span></div></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>QR</th><th>Código</th><th>Descripción</th><th class="hide-sm">Marca / Modelo</th><th class="hide-md">Categoría</th><th class="hide-md">Ubicación</th><th>Stock</th><th>Estado</th></tr></thead><tbody>
  ${rows.slice(0, S.inv.limit).map(t => {
    const tot = Math.max(1, n0(t.Stock_Total)), d = n0(t.Stock_Disponible) / tot * 100, p = n0(t.Prestado) / tot * 100, dn = n0(t.Cant_Danada) / tot * 100;
    return `<tr class="click" data-code="${esc(t.Codigo)}"><td><div class="qrbox" style="padding:2px;border-radius:5px">${qrSVG(t.Codigo, 34)}</div></td><td><span class="code">${esc(t.Codigo)}</span></td>
    <td><div style="font-weight:600">${esc(t.Descripcion)}</div><div class="muted" style="font-size:12px">${esc([t.Medida, t.Serie && 'S/N ' + t.Serie].filter(Boolean).join(' · '))}</div></td>
    <td class="hide-sm">${esc([t.Marca, t.Modelo].filter(Boolean).join(' / '))}</td><td class="hide-md muted" style="font-size:13px">${esc(t.Categoria)}<br><span class="dim">${esc(t.Subcategoria || '')}</span></td><td class="hide-md muted" style="font-size:13px">${esc(t.Ubicacion)}</td>
    <td style="min-width:110px"><div class="row" style="gap:6px;font-weight:700"><span style="color:var(--green)">${t.Stock_Disponible}</span><span class="dim">/ ${t.Stock_Total}</span></div><div class="bar" style="margin-top:4px"><i style="width:${d}%;background:var(--green)"></i><i style="width:${p}%;background:var(--brand)"></i><i style="width:${dn}%;background:var(--red)"></i></div></td>
    <td>${availPill(t)}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">Sin resultados</td></tr>'}</tbody></table></div>
  ${rows.length > S.inv.limit ? `<div style="text-align:center;margin-top:12px"><button class="btn" id="iMore">Ver más (${rows.length - S.inv.limit} restantes)</button></div>` : ''}`;
  $$('tr[data-code]', el).forEach(r => r.onclick = () => toolDrawer(r.dataset.code));
  if ($('#iMore')) $('#iMore').onclick = () => { S.inv.limit += 150; drawInv(); };
}
async function toolDrawer(code) {
  const t = S.tool.get(U(code)); if (!t) return toast('Herramienta no encontrada', 'err');
  const loans = S.loansByTool.get(U(code)) || [];
  const ov = modal(`<span class="code" style="font-size:15px">${esc(t.Codigo)}</span> ${esc(t.Descripcion)}`, `
    <div class="drawer-qr">
      <div style="text-align:center"><div class="qrbox" style="padding:10px">${qrSVG(t.Codigo, 160)}</div><div class="mono" style="margin-top:6px;font-weight:700">${esc(t.Codigo)}</div>
        <div class="row" style="justify-content:center;margin-top:8px"><button class="btn sm" id="dPng">${ic('download')} PNG</button><button class="btn sm" id="dLbl">${ic('print')} Etiqueta</button></div></div>
      <div class="grow" style="min-width:260px"><div class="kv">
        <div>Descripción</div><div><b>${esc(t.Descripcion)}</b></div><div>Marca / Modelo</div><div>${esc([t.Marca, t.Modelo].filter(Boolean).join(' / ') || '—')}</div>
        <div>Serie</div><div class="mono">${esc(t.Serie || '—')}</div><div>Medida / Cap.</div><div>${esc(t.Medida || '—')}</div>
        <div>Categoría</div><div>${esc(t.Categoria)} ${t.Subcategoria ? '· ' + esc(t.Subcategoria) : ''}</div><div>Ubicación</div><div>${esc(t.Ubicacion || '—')}</div>
        <div>Estado</div><div>${estadoPill(t.Estado)} ${U(t.Prestable) === 'NO' ? '<span class="pill p-gray">No prestable</span>' : ''}</div>
        <div>Stock</div><div><b style="color:var(--green)">${t.Stock_Disponible} disponibles</b> · ${t.Prestado} prestadas · ${t.Cant_Danada} dañadas · ${t.Stock_Total} total</div>
        <div>Últ. inspección</div><div>${esc(t.Fecha_Ult_Inspeccion || '—')} ${t.Resultado_Inspeccion ? '· ' + esc(t.Resultado_Inspeccion) : ''}</div>
        <div>Observaciones</div><div class="muted">${esc(t.Observaciones || '—')}</div><div>Origen</div><div class="dim">${esc(t.Origen || '')}</div>
      </div></div>
    </div>
    ${loans.length ? `<h4 class="cond" style="margin:18px 0 8px;font-size:17px;text-transform:uppercase">La tienen ahora</h4><div class="list">${loans.map(l => `<div class="item"><div class="avatar" style="width:30px;height:30px;font-size:12px">${initials(l.Nombre_Trabajador)}</div><div class="grow"><div class="t">${esc(l.Nombre_Trabajador)} ×${l.Pendiente}</div><div class="s">${esc(l.ID_Trabajador)} · desde ${fdt(l.Fecha_Hora)} · prevista ${fdt(l.Fecha_Devolucion_Prevista)}</div></div>${l.Vencido ? '<span class="pill p-red">Vencido</span>' : ''}</div>`).join('')}</div>` : ''}
    <h4 class="cond" style="margin:18px 0 8px;font-size:17px;text-transform:uppercase">Historial de uso — quién la usó y cuándo</h4><div id="dHist"><div class="skel" style="height:90px"></div></div>`,
    `<button class="btn red" id="dBaja">${ic('trash')} Baja</button>${n0(t.Cant_Danada) ? `<button class="btn" id="dRep">${ic('wrench')} Reparada (${t.Cant_Danada})</button>` : ''}<button class="btn" id="dEdit">${ic('edit')} Editar</button>${loans.length ? `<button class="btn green" id="dRet">${ic('in')} Devolver</button>` : ''}`, 'wide');
  $('#dPng').onclick = () => downloadQR(t.Codigo, t.Codigo, 'QR_' + t.Codigo + '.png');
  $('#dLbl').onclick = () => labelsPDF([{ type: 'tool', t }], 'tool');
  $('#dEdit').onclick = () => toolForm(t);
  if ($('#dRet')) $('#dRet').onclick = () => { closeModal(); loans.forEach(l => S.op.retSel.set(l.ID_Mov, { cant: n0(l.Pendiente), estado: 'Bueno', obs: '' })); S.op.mode = 'in'; S.op.retFilter = { sel: true }; go('operacion'); };
  if ($('#dRep')) $('#dRep').onclick = e => guard(async () => { await api('repararHerramienta', { codigo: t.Codigo, cantidad: t.Cant_Danada }); closeModal(); toast('Herramienta reintegrada al stock', 'ok'); await loadData(true); }, e.currentTarget);
  $('#dBaja').onclick = () => bajaForm(t);
  try { const h = await api('getHistorial', { codigo: t.Codigo, limite: 200 }); if ($('#dHist')) $('#dHist').innerHTML = movTable(h.movimientos, true, 'max-height:300px'); } catch (e) { if ($('#dHist')) $('#dHist').innerHTML = esc(e.message); }
}
function bajaForm(t) {
  const max = n0(t.Stock_Total) - n0(t.Prestado);
  modal('Dar de baja · ' + esc(t.Codigo), `<p class="muted" style="margin-top:0">${esc(t.Descripcion)} — puede dar de baja hasta <b>${max}</b> unidad(es) (las prestadas no).</p>
    <div class="grid g2"><div class="field"><label>Cantidad</label><input class="inp" type="number" id="bq" min="1" max="${max}" value="1"></div>
    <div class="field"><label>Motivo</label><select class="inp" id="bm"><option>Desgaste / fin de vida útil</option><option>Rotura irreparable</option><option>Inspección no apta</option><option>Extravío</option><option>Transferencia a otra área</option><option>Otro</option></select></div></div>
    <div class="field" style="margin-top:10px"><label>Detalle</label><input class="inp" id="bd"></div>`,
    `<button class="btn" data-close>Cancelar</button><button class="btn red" id="bOk">${ic('trash')} Registrar baja</button>`);
  $('#bOk').onclick = e => guard(async () => { await api('bajaHerramienta', { codigo: t.Codigo, cantidad: n0($('#bq').value), motivo: $('#bm').value + ($('#bd').value ? ' — ' + $('#bd').value : '') }); closeModal(); toast('Baja registrada', 'ok'); await loadData(true); }, e.currentTarget);
}
const PREFIX = { 'No inventariada': 'NI-', 'Herramientas y Equipos': 'HYE-', 'Cajas Técnicas y Maniobra': 'CAJ-', 'Elementos de Izaje': 'IZ-', 'Escaleras': 'ESC-', 'Radios': 'RAD-', 'Extintores': 'EXT-', 'SPCC - Protección contra caídas': '508-' };
function nextCode(cat) {
  const pre = PREFIX[cat] || 'HER-';
  if (pre === 'HYE-' || pre === 'CAJ-' || pre === 'HER-' || pre === 'NI-') {
    const max = S.data.herramientas.filter(t => t.Codigo.startsWith(pre)).reduce((m, t) => Math.max(m, n0(t.Codigo.slice(pre.length))), 0);
    return pre + String(max + 1).padStart(4, '0');
  }
  return pre;
}
function toolForm(t) {
  const isNew = !t; t = t || { Categoria: 'Herramientas y Equipos', Stock_Total: 1, Estado: 'Bueno', Prestable: 'SI', Ubicacion: 'Bodega' };
  const cats = [...new Set([...Object.keys(PREFIX), ...S.data.herramientas.map(x => x.Categoria)])].filter(Boolean);
  const f = (k, l, type = 'text', extra = '') => `<div class="field"><label>${l}</label><input class="inp" name="${k}" type="${type}" value="${esc(t[k] ?? '')}" ${extra}></div>`;
  const ov = modal(isNew ? 'Registrar nueva herramienta' : 'Editar herramienta ' + esc(t.Codigo), `
    <form id="tf" class="grid g2">
      <div class="field"><label>Categoría</label><select class="inp" name="Categoria">${cats.map(c => `<option ${c === t.Categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label>Código único (QR)</label><input class="inp mono" name="Codigo" value="${esc(isNew ? nextCode(t.Categoria) : t.Codigo)}" ${isNew ? '' : 'readonly'} required autocapitalize="characters"></div>
      <div class="field" style="grid-column:1/-1"><label>Descripción</label><input class="inp" name="Descripcion" value="${esc(t.Descripcion || '')}" required></div>
      ${f('Marca', 'Marca')}${f('Modelo', 'Modelo')}${f('Serie', 'Serie / N° fábrica')}${f('Medida', 'Medida / Capacidad')}
      ${f('Subcategoria', 'Subcategoría / Tipo')}${f('Stock_Total', 'Stock total', 'number', 'min="0"')}${f('Ubicacion', 'Ubicación en bodega')}
      <div class="field"><label>Estado</label><select class="inp" name="Estado">${['Bueno', 'Regular', 'Nuevo', 'Dañado', 'En reparación'].map(o => `<option ${o === t.Estado ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="field"><label>¿Prestable?</label><select class="inp" name="Prestable"><option ${U(t.Prestable) !== 'NO' ? 'selected' : ''}>SI</option><option ${U(t.Prestable) === 'NO' ? 'selected' : ''}>NO</option></select></div>
      ${f('Fecha_Ult_Inspeccion', 'Fecha última inspección', 'text', 'placeholder="dd/mm/aaaa"')}${f('Resultado_Inspeccion', 'Resultado inspección')}
      <div class="field" style="grid-column:1/-1"><label>Observaciones</label><input class="inp" name="Observaciones" value="${esc(t.Observaciones || '')}"></div>
      <div style="grid-column:1/-1" class="row"><div class="qrbox" id="tfQr">${qrSVG(isNew ? nextCode(t.Categoria) : t.Codigo, 90)}</div><div class="muted" style="font-size:13px">El QR se genera automáticamente con el código. Al guardar podrá descargarlo o imprimir su etiqueta.</div></div>
    </form>`, `<button class="btn" data-close>Cancelar</button><button class="btn green" id="tfOk">${ic('check')} Guardar</button>`, 'wide');
  const form = $('#tf');
  form.Categoria.onchange = () => { if (isNew) { form.Codigo.value = nextCode(form.Categoria.value); $('#tfQr').innerHTML = qrSVG(form.Codigo.value || '-', 90); } };
  form.Codigo.oninput = () => { $('#tfQr').innerHTML = qrSVG(U(form.Codigo.value) || '-', 90); };
  $('#tfOk').onclick = e => {
    if (!form.reportValidity()) return;
    const h = Object.fromEntries(new FormData(form).entries()); h.Codigo = U(h.Codigo); h.Stock_Total = n0(h.Stock_Total);
    guard(async () => {
      await api('guardarHerramienta', { herramienta: h, nuevo: isNew }); await loadData(true);
      toast(isNew ? 'Herramienta registrada: ' + h.Codigo : 'Cambios guardados', 'ok');
      if (isNew) labelReady('tool', S.tool.get(h.Codigo)); else closeModal();
    }, e.currentTarget);
  };
}
function labelReady(type, obj) {
  const code = type === 'tool' ? obj.Codigo : obj.ID_Ficha, txt = type === 'tool' ? obj.Codigo : workerQRText(obj.ID_Ficha);
  const ov = modal('QR listo para imprimir', `<div style="text-align:center"><div class="qrbox" style="padding:12px">${qrSVG(txt, 200)}</div><div class="mono" style="font-size:18px;margin-top:8px;font-weight:700">${esc(code)}</div><div class="muted">${esc(type === 'tool' ? obj.Descripcion : obj.Nombre_Completo)}</div></div>`,
    `<button class="btn" data-close>Cerrar</button><button class="btn" id="lPng">${ic('download')} PNG</button><button class="btn primary" id="lPdf">${ic('pdf')} ${type === 'tool' ? 'Etiqueta PDF' : 'Fotocheck PDF'}</button>`);
  $('#lPng').onclick = () => downloadQR(txt, code, 'QR_' + code + '.png');
  $('#lPdf').onclick = () => labelsPDF([type === 'tool' ? { type, t: obj } : { type: 'worker', p: obj }], type === 'tool' ? 'tool' : 'foto');
}

/* ===================== PERSONAL ===================== */
VIEWS.personal = {
  render(root) {
    root.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="row wrap"><input class="inp grow" id="pq" placeholder="Buscar trabajador…" value="${esc(S.pers.q)}" style="min-width:200px">
      <button class="btn" id="pFoto">${ic('card')} Fotochecks PDF</button><button class="btn" id="pXls">${ic('xls')} Excel</button><button class="btn blue" id="pNew">${ic('plus')} Nuevo trabajador</button></div></div><div id="pBody"></div>`;
    $('#pq').oninput = e => { S.pers.q = e.target.value; drawPeople(); };
    $('#pNew').onclick = () => personForm();
    $('#pFoto').onclick = () => labelsPDF(peopleFiltered().map(p => ({ type: 'worker', p })), 'foto');
    $('#pXls').onclick = () => xlsx('Personal_ESMI', 'Personal', ['ID_Ficha', 'Nombre_Completo', 'Cargo', 'Grupo', 'Turno', 'Area', 'Telefono', 'Activo'], peopleFiltered().map(p => ({ ...p, EnCustodia: (S.loansByWorker.get(U(p.ID_Ficha)) || []).length })));
    drawPeople();
  },
  update() { drawPeople(); }
};
const peopleFiltered = () => { const q = norm(S.pers.q); return S.data.personal.filter(p => !q || norm(p.ID_Ficha + ' ' + p.Nombre_Completo + ' ' + p.Cargo + ' ' + p.Grupo).includes(q)); };
function drawPeople() {
  const el = $('#pBody'); if (!el) return;
  const ps = peopleFiltered();
  el.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${ps.map(p => {
    const ls = S.loansByWorker.get(U(p.ID_Ficha)) || [], v = ls.filter(l => l.Vencido).length;
    return `<div class="item" style="cursor:pointer;align-items:flex-start" data-p="${esc(p.ID_Ficha)}"><div class="qrbox" style="padding:3px">${qrSVG(workerQRText(p.ID_Ficha), 56)}</div>
      <div class="grow"><div class="t" style="line-height:1.15">${esc(p.Nombre_Completo)}</div><div class="s"><span class="mono" style="color:var(--blue)">${esc(p.ID_Ficha)}</span> · ${esc(p.Cargo || '')}</div><div class="s">${esc(p.Grupo || '')} · ${esc(p.Turno || '')} ${p.Telefono ? '· ' + esc(p.Telefono) : ''}</div>
      <div class="row wrap" style="margin-top:4px;gap:6px">${ls.length ? `<span class="pill p-amber">${ls.length} en custodia</span>` : '<span class="pill p-gray">Sin herramientas</span>'}${v ? `<span class="pill p-red">${v} vencido</span>` : ''}${U(p.Activo) === 'NO' ? '<span class="pill p-red">Inactivo</span>' : ''}</div></div></div>`;
  }).join('')}</div>`;
  $$('[data-p]', el).forEach(c => c.onclick = () => { S.kardexId = U(c.dataset.p); go('kardex'); });
}
function nextWorkerId() { const m = S.data.personal.reduce((a, p) => Math.max(a, n0(String(p.ID_Ficha).replace(/\D/g, ''))), 1000); return 'ID-MEC-' + (m + 1); }
function personForm(p, onSaved) {
  const isNew = !p; p = p || { ID_Ficha: nextWorkerId(), Turno: 'Día', Cargo: 'Mecánico', Area: 'Ingeniería de Planta - Modificaciones Mecánicas', Empresa: 'ESMI', Activo: 'SI' };
  const f = (k, l, extra = '') => `<div class="field"><label>${l}</label><input class="inp" name="${k}" value="${esc(p[k] ?? '')}" ${extra}></div>`;
  modal(isNew ? 'Registrar nuevo trabajador' : 'Editar trabajador', `<form id="pf" class="grid g2">
    ${f('ID_Ficha', 'ID / Ficha (QR)', (isNew ? '' : 'readonly ') + 'required class="inp mono"')}${f('Nombre_Completo', 'Nombre completo', 'required')}
    ${f('Cargo', 'Cargo')}${f('Grupo', 'Grupo (ej. MEC 01-02)')}
    <div class="field"><label>Turno</label><select class="inp" name="Turno">${['Día', 'Noche', 'Rotativo'].map(o => `<option ${o === p.Turno ? 'selected' : ''}>${o}</option>`).join('')}</select></div>${f('Telefono', 'Celular (WhatsApp)', 'placeholder="+591 7xxxxxxx"')}
    ${f('Area', 'Área')}<div class="field"><label>Activo</label><select class="inp" name="Activo"><option ${U(p.Activo) !== 'NO' ? 'selected' : ''}>SI</option><option ${U(p.Activo) === 'NO' ? 'selected' : ''}>NO</option></select></div>
  </form>`, `<button class="btn" data-close>Cancelar</button><button class="btn blue" id="pfOk">${ic('check')} Guardar</button>`);
  $('#pfOk').onclick = e => {
    const form = $('#pf'); if (!form.reportValidity()) return;
    const w = Object.fromEntries(new FormData(form).entries()); w.ID_Ficha = U(w.ID_Ficha); w.Nombre_Completo = String(w.Nombre_Completo).toUpperCase();
    guard(async () => {
      await api('guardarTrabajador', { trabajador: w, nuevo: isNew }); await loadData(true); toast(isNew ? 'Trabajador registrado: ' + w.ID_Ficha : 'Datos actualizados', 'ok');
      if (onSaved) { closeModal(); onSaved(S.person.get(w.ID_Ficha) || w); } else if (isNew) labelReady('worker', S.person.get(w.ID_Ficha)); else closeModal();
    }, e.currentTarget);
  };
}

/* ===================== HISTORIAL ===================== */
VIEWS.historial = {
  render(root) {
    root.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="row wrap">
      <input class="inp grow" id="hq" placeholder="Buscar trabajador, código, administrador…" value="${esc(S.hist.q)}" style="min-width:200px">
      <select class="inp" id="ht" style="width:auto"><option value="">Todos los tipos</option>${Object.keys(TIPO_PILL).map(t => `<option ${S.hist.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input class="inp" type="date" id="hd" value="${S.hist.desde}" style="width:auto"><input class="inp" type="date" id="hh" value="${S.hist.hasta}" style="width:auto">
      <button class="btn" id="hX">${ic('xls')} Excel</button><button class="btn" id="hP">${ic('pdf')} PDF</button></div></div><div id="hBody"><div class="skel" style="height:200px"></div></div>`;
    const bind = (id, k) => $(id).oninput = e => { S.hist[k] = e.target.value; drawHist(); };
    bind('#hq', 'q'); bind('#ht', 'tipo'); bind('#hd', 'desde'); bind('#hh', 'hasta');
    $('#hX').onclick = () => xlsx('Historial_Movimientos', 'Historial', ['Fecha_Hora', 'Tipo', 'ID_Trabajador', 'Nombre_Trabajador', 'Codigo_Herramienta', 'Descripcion', 'Cantidad', 'Estado', 'Admin', 'Observaciones', 'Estado_Prestamo'], histFiltered());
    $('#hP').onclick = () => histPDF(histFiltered());
    this.update();
  },
  async update() { try { const h = await api('getHistorial', { limite: 3000 }); S.hist.rows = h.movimientos; drawHist(); } catch (e) { toast(e.message, 'err'); } }
};
function histFiltered() {
  const q = norm(S.hist.q), d1 = S.hist.desde ? new Date(S.hist.desde + 'T00:00:00-04:00') : null, d2 = S.hist.hasta ? new Date(S.hist.hasta + 'T23:59:59-04:00') : null;
  return (S.hist.rows || []).filter(m => {
    if (S.hist.tipo && m.Tipo !== S.hist.tipo) return false;
    const d = parseD(m.Fecha_Hora); if (d1 && d < d1) return false; if (d2 && d > d2) return false;
    return !q || norm([m.Nombre_Trabajador, m.ID_Trabajador, m.Codigo_Herramienta, m.Descripcion, m.Admin, m.Observaciones].join(' ')).includes(q);
  });
}
function drawHist() { const el = $('#hBody'); if (!el || !S.hist.rows) return; const r = histFiltered(); el.innerHTML = `<div class="muted" style="margin:0 2px 8px">${r.length} movimientos</div>` + movTable(r.slice(0, 600), true, 'max-height:70vh'); }

/* ===================== AUDITORÍA ===================== */
VIEWS.auditoria = {
  render(root) {
    S.scanHandler = txt => S.audit ? auditScan(txt) : routeScan(txt);
    if (S.audit) return drawAuditRun(root);
    const cats = [...new Set(S.data.herramientas.map(t => t.Categoria))].sort(), locs = [...new Set(S.data.herramientas.map(t => t.Ubicacion).filter(Boolean))].sort();
    const k = kpiData();
    root.innerHTML = `<div class="grid g2">
      <div class="card"><div class="card-h"><h3>Nueva auditoría física</h3></div>
        <p class="muted" style="margin-top:0">Compare el stock teórico del sistema con el conteo real escaneando los QR en estantería. Al finalizar se genera el reporte oficial con firma del Administrador de Bodega.</p>
        <div class="grid g2"><div class="field"><label>Alcance — categoría</label><select class="inp" id="aCat"><option value="">Todo el inventario</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label>Ubicación</label><select class="inp" id="aLoc"><option value="">Todas</option>${locs.map(c => `<option>${esc(c)}</option>`).join('')}</select></div></div>
        <button class="btn primary lg" id="aStart" style="margin-top:14px;width:100%">${ic('shield')} Iniciar auditoría</button></div>
      <div class="card"><div class="card-h"><h3>Reportes oficiales al instante</h3></div><div class="grid">
        <button class="btn lg" id="rVenc" style="justify-content:flex-start">${ic('clock')} Préstamos vencidos <span class="pill ${k.venc ? 'p-red' : 'p-gray'}" style="margin-left:auto">${k.venc}</span></button>
        <button class="btn lg" id="rDan" style="justify-content:flex-start">${ic('alert')} Herramientas dañadas <span class="pill ${k.dan ? 'p-amber' : 'p-gray'}" style="margin-left:auto">${k.dan}</span></button>
        <button class="btn lg" id="rCust" style="justify-content:flex-start">${ic('hand')} Herramientas en custodia <span class="pill p-amber" style="margin-left:auto">${k.prest}</span></button>
        <button class="btn lg" id="rInv" style="justify-content:flex-start">${ic('xls')} Inventario general (Excel)</button></div></div>
    </div>
    <div class="card" style="margin-top:14px"><div class="card-h"><h3>Auditorías anteriores</h3></div><div id="aList"><div class="skel" style="height:80px"></div></div></div>`;
    $('#aStart').onclick = () => {
      const cat = $('#aCat').value, loc = $('#aLoc').value;
      const scope = S.data.herramientas.filter(t => (!cat || t.Categoria === cat) && (!loc || t.Ubicacion === loc));
      S.audit = { cat, loc, started: new Date(), counts: new Map(), extra: new Map(), scope: scope.map(t => t.Codigo), q: '' };
      renderView(); toast('Auditoría iniciada: ' + scope.length + ' ítems en alcance', 'ok');
    };
    $('#rVenc').onclick = () => statusPDF('venc'); $('#rDan').onclick = () => statusPDF('dan'); $('#rCust').onclick = () => statusPDF('cust'); $('#rInv').onclick = () => inventoryXLSX(S.data.herramientas);
    api('getAuditorias').then(r => {
      S.audits = r.auditorias; const el = $('#aList'); if (!el) return;
      el.innerHTML = r.auditorias.length ? `<div class="list">${r.auditorias.map(a => `<div class="item"><span class="code">${esc(a.id)}</span><div class="grow"><div class="t">${fdt(a.fecha)} · ${esc(String(a.admin).replace(/\s*\(.*\)/, ''))}</div><div class="s">${a.items} ítems auditados · ${a.dif ? `<b style="color:var(--red)">${a.dif} diferencias</b>` : 'sin diferencias'}</div></div><button class="btn sm" data-ap="${a.id}">${ic('pdf')} PDF</button><button class="btn sm" data-ax="${a.id}">${ic('xls')}</button></div>`).join('')}</div>` : '<div class="empty">Aún no hay auditorías registradas</div>';
      $$('[data-ap]', el).forEach(b => b.onclick = async () => { const d = await api('getAuditorias', { id: b.dataset.ap }); auditPDF(d.detalle, b.dataset.ap); });
      $$('[data-ax]', el).forEach(b => b.onclick = async () => { const d = await api('getAuditorias', { id: b.dataset.ax }); xlsx('Auditoria_' + b.dataset.ax, 'Auditoría', ['Codigo', 'Descripcion', 'Stock_Teorico', 'Conteo_Fisico', 'Diferencia', 'Resultado', 'Observaciones'], d.detalle, 'Auditoría ' + b.dataset.ax); });
    }).catch(e => toast(e.message, 'err'));
  },
  update() { if (S.audit) drawAuditTable(); }
};
const teorico = t => n0(t.Stock_Total) - n0(t.Prestado);
function auditScan(txt) {
  const p = parseScan(txt), A = S.audit;
  if (p.type === 'worker') { toast('Eso es un trabajador, escanee herramientas', 'warn'); return false; }
  if (p.type === 'unknown') { A.extra.set(p.code, (A.extra.get(p.code) || 0) + 1); toast('No registrado (se reporta): ' + p.code, 'warn'); drawAuditTable(); return false; }
  if (!A.scope.includes(p.code)) { A.scope.push(p.code); toast(p.code + ' estaba fuera del alcance — se agrega', 'warn'); }
  A.counts.set(p.code, (A.counts.get(p.code) || 0) + 1); A.last = p.code; drawAuditTable(); return true;
}
function drawAuditRun(root) {
  root.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="row wrap between">
    <div><h3 class="cond" style="margin:0;font-size:22px;text-transform:uppercase">Auditoría en curso</h3><div class="muted" style="font-size:13px">${esc(S.audit.cat || 'Todo el inventario')} ${S.audit.loc ? '· ' + esc(S.audit.loc) : ''} · iniciada ${fdt(S.audit.started)}</div></div>
    <div class="row wrap"><button class="btn primary lg" id="auScan">${ic('scan')} Escanear estantería</button><button class="btn red" id="auCancel">${ic('x')} Cancelar</button><button class="btn green lg" id="auEnd">${ic('check')} Finalizar y generar reporte</button></div></div>
    <div class="grid" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-top:12px" id="auStats"></div></div>
    <div class="card"><div class="row wrap" style="margin-bottom:10px"><input class="inp grow" id="auQ" placeholder="Filtrar o escribir código y Enter para contar…"><div class="chips" id="auF"></div></div><div id="auTbl"></div></div>`;
  $('#auScan').onclick = () => openScanner({ title: 'Conteo físico', continuous: true, hint: 'Cada lectura suma 1 unidad al conteo físico.', onScan: auditScan });
  $('#auCancel').onclick = async () => { if (await confirmBox('Cancelar auditoría', 'Se perderá el conteo actual.', 'Sí, cancelar', true)) { S.audit = null; renderView(); } };
  $('#auEnd').onclick = e => finishAudit(e.currentTarget);
  $('#auQ').oninput = e => { S.audit.q = e.target.value; drawAuditTable(); };
  $('#auQ').onkeydown = e => { if (e.key === 'Enter' && e.target.value.trim()) { const v = e.target.value; e.target.value = ''; S.audit.q = ''; auditScan(v); drawAuditTable(); } };
  drawAuditTable();
}
function drawAuditTable() {
  const A = S.audit, el = $('#auTbl'); if (!el) return;
  const rows = A.scope.map(c => S.tool.get(c)).filter(Boolean).map(t => ({ t, teo: teorico(t), fis: A.counts.get(t.Codigo) || 0 }));
  const cont = rows.filter(r => A.counts.has(r.t.Codigo)), ok = cont.filter(r => r.fis === r.teo).length, falt = cont.filter(r => r.fis < r.teo).length, sob = cont.filter(r => r.fis > r.teo).length;
  $('#auStats').innerHTML = [['Contados', cont.length + ' / ' + rows.length, 'var(--blue)'], ['Conformes', ok, 'var(--green)'], ['Faltantes', falt, 'var(--red)'], ['Sobrantes / no reg.', sob + A.extra.size, 'var(--amber)']]
    .map(([l, v, c]) => `<div class="stat"><div class="l">${l}</div><div class="v" style="color:${c}">${v}</div></div>`).join('');
  const f = A.filter || 'all';
  $('#auF').innerHTML = [['all', 'Todos'], ['pend', 'Sin contar'], ['dif', 'Con diferencia']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-af="${k}">${l}</button>`).join('');
  $$('[data-af]', $('#auF')).forEach(b => b.onclick = () => { A.filter = b.dataset.af; drawAuditTable(); });
  const q = norm(A.q);
  let vis = rows.filter(r => !q || norm(r.t.Codigo + ' ' + r.t.Descripcion).includes(q));
  if (f === 'pend') vis = vis.filter(r => !A.counts.has(r.t.Codigo)); if (f === 'dif') vis = vis.filter(r => A.counts.has(r.t.Codigo) && r.fis !== r.teo);
  vis.sort((a, b) => (b.t.Codigo === A.last) - (a.t.Codigo === A.last) || A.counts.has(b.t.Codigo) - A.counts.has(a.t.Codigo));
  el.innerHTML = `<div class="tbl-wrap" style="max-height:60vh"><table class="tbl"><thead><tr><th>Código</th><th>Descripción</th><th class="num">Teórico en bodega</th><th class="num">Conteo físico</th><th class="num">Dif.</th><th>Resultado</th></tr></thead><tbody>
  ${vis.slice(0, 400).map(r => { const c = A.counts.has(r.t.Codigo), d = r.fis - r.teo; return `<tr style="${r.t.Codigo === A.last ? 'background:rgba(31,201,141,.08)' : ''}"><td><span class="code">${esc(r.t.Codigo)}</span></td><td>${esc(r.t.Descripcion)}<div class="dim" style="font-size:12px">${esc(r.t.Ubicacion || '')}${n0(r.t.Prestado) ? ' · ' + r.t.Prestado + ' en préstamo (no se cuentan)' : ''}</div></td><td class="num">${r.teo}</td>
    <td class="num"><input class="inp" style="width:74px;min-height:32px;padding:4px 8px;text-align:right" type="number" min="0" data-ac="${esc(r.t.Codigo)}" value="${c ? r.fis : ''}" placeholder="—"></td>
    <td class="num" style="font-weight:800;color:${!c ? 'var(--dim)' : d === 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--amber)'}">${c ? (d > 0 ? '+' : '') + d : ''}</td>
    <td>${!c ? '<span class="pill p-gray">Pendiente</span>' : d === 0 ? '<span class="pill p-green">Conforme</span>' : d < 0 ? '<span class="pill p-red">Faltante</span>' : '<span class="pill p-amber">Sobrante</span>'}</td></tr>`; }).join('')}
  ${[...A.extra.entries()].map(([c, n]) => `<tr><td><span class="code">${esc(c)}</span></td><td class="muted">Código no registrado en el sistema</td><td class="num">0</td><td class="num">${n}</td><td class="num" style="color:var(--amber)">+${n}</td><td><span class="pill p-amber">No registrada</span></td></tr>`).join('')}
  </tbody></table></div>`;
  $$('[data-ac]', el).forEach(i => i.onchange = () => { i.value === '' ? A.counts.delete(i.dataset.ac) : A.counts.set(i.dataset.ac, Math.max(0, n0(i.value))); A.last = i.dataset.ac; drawAuditTable(); });
}
async function finishAudit(btn) {
  const A = S.audit, pend = A.scope.filter(c => !A.counts.has(c)).length;
  let zero = false;
  if (pend) {
    const ov = modal('Finalizar auditoría', `<p style="margin-top:0">Hay <b>${pend}</b> ítems del alcance sin contar.</p><label class="row"><input type="radio" name="z" value="1" checked> Registrarlos con conteo <b>0</b> (faltantes)</label><label class="row" style="margin-top:6px"><input type="radio" name="z" value="0"> Auditar solo los contados</label>`,
      `<button class="btn" data-close>Volver</button><button class="btn green" id="fOk">${ic('check')} Guardar auditoría</button>`);
    const ok = await new Promise(r => { $('#fOk').onclick = () => { zero = $('input[name=z]:checked').value === '1'; closeModal(); r(true); }; $$('[data-close]', ov).forEach(b => b.onclick = () => { closeModal(); r(false); }); });
    if (!ok) return;
  }
  const conteos = A.scope.filter(c => A.counts.has(c) || zero).map(c => ({ codigo: c, fisico: A.counts.get(c) || 0 }));
  [...A.extra.entries()].forEach(([c, n]) => conteos.push({ codigo: c, fisico: n, obs: 'Código leído no registrado' }));
  if (!conteos.length) return toast('No hay conteos para guardar', 'warn');
  await guard(async () => {
    const r = await api('guardarAuditoria', { conteos });
    S.audit = null; toast('Auditoría guardada: ' + r.id, 'ok'); auditPDF(r.filas, r.id); renderView();
  }, btn);
}

/* ===================== ETIQUETAS QR ===================== */
VIEWS.etiquetas = {
  render(root) {
    const L = S.labels, cats = [...new Set(S.data.herramientas.map(t => t.Categoria))].sort();
    root.innerHTML = `<div class="card" style="margin-bottom:14px"><div class="row wrap">
      <div class="seg"><button data-ls="tools" class="${L.src === 'tools' ? 'on out' : ''}">${ic('wrench')} Herramientas</button><button data-ls="people" class="${L.src === 'people' ? 'on in' : ''}">${ic('users')} Personal</button></div>
      ${L.src === 'tools' ? `<select class="inp" id="lc" style="width:auto"><option value="">Todas las categorías</option>${cats.map(c => `<option ${L.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
      <input class="inp grow" id="lq" placeholder="Filtrar…" value="${esc(L.q)}" style="min-width:160px">
      <button class="btn" id="lAll">Seleccionar visibles</button><button class="btn" id="lNone">Limpiar</button>
      <button class="btn primary" id="lPdf">${ic('print')} Generar PDF (<span id="lN">0</span>)</button></div>
      <div class="muted" style="font-size:13px;margin-top:8px">${L.src === 'tools' ? 'Etiquetas 63×38 mm (3×7 por hoja A4), QR vectorial nítido + código + descripción. Plastifíquelas o use papel adhesivo.' : 'Fotochecks 85×54 mm (formato credencial, 2×5 por A4) con QR que abre el kardex del trabajador.'}</div></div>
      <div id="lBody"></div>`;
    $$('[data-ls]', root).forEach(b => b.onclick = () => { L.src = b.dataset.ls; L.sel.clear(); renderView(); });
    if ($('#lc')) $('#lc').onchange = e => { L.cat = e.target.value; drawLabels(); };
    $('#lq').oninput = e => { L.q = e.target.value; drawLabels(); };
    $('#lAll').onclick = () => { labelItems().forEach(i => L.sel.add(i.k)); drawLabels(); };
    $('#lNone').onclick = () => { L.sel.clear(); drawLabels(); };
    $('#lPdf').onclick = () => { const it = labelItems(true).filter(i => L.sel.has(i.k)); if (!it.length) return toast('Seleccione al menos una etiqueta', 'warn'); labelsPDF(it.map(i => i.o), L.src === 'tools' ? 'tool' : 'foto'); };
    drawLabels();
  }
};
function labelItems(all) {
  const L = S.labels, q = norm(L.q);
  if (L.src === 'tools') return S.data.herramientas.filter(t => (!L.cat || t.Categoria === L.cat) && (!q || norm(t.Codigo + ' ' + t.Descripcion + ' ' + t.Marca).includes(q))).map(t => ({ k: t.Codigo, o: { type: 'tool', t } }));
  return S.data.personal.filter(p => !q || norm(p.ID_Ficha + ' ' + p.Nombre_Completo).includes(q)).map(p => ({ k: p.ID_Ficha, o: { type: 'worker', p } }));
}
function drawLabels() {
  const el = $('#lBody'), L = S.labels; if (!el) return;
  const items = labelItems();
  $('#lN').textContent = L.sel.size;
  el.innerHTML = `<div class="label-prev">${items.slice(0, 240).map(i => {
    const tool = i.o.type === 'tool', txt = tool ? i.o.t.Codigo : workerQRText(i.o.p.ID_Ficha);
    return `<label class="label" style="cursor:pointer;outline:${L.sel.has(i.k) ? '3px solid var(--brand)' : 'none'}"><input type="checkbox" data-lk="${esc(i.k)}" ${L.sel.has(i.k) ? 'checked' : ''} style="display:none">${qrSVG(txt, 54)}<div style="min-width:0"><b>${esc(i.k)}</b><div style="overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical">${esc(tool ? i.o.t.Descripcion : i.o.p.Nombre_Completo)}</div></div></label>`;
  }).join('')}</div>${items.length > 240 ? `<div class="muted" style="margin-top:10px">Mostrando 240 de ${items.length}. «Seleccionar visibles» incluye todos los filtrados.</div>` : ''}`;
  $$('[data-lk]', el).forEach(c => c.onchange = () => { c.checked ? L.sel.add(c.dataset.lk) : L.sel.delete(c.dataset.lk); drawLabels(); });
}

/* ======================================================================
 *  PDF / EXCEL — encabezado ESMI y firma del Administrador de Bodega
 * ====================================================================== */
function jsPDFReady() { if (!window.jspdf) { toast('La librería PDF aún no cargó (revise internet)', 'err'); return null; } return window.jspdf.jsPDF; }
function pdfLogo(doc, x, y, h) { if (window.ESMI_LOGO) { try { doc.addImage(window.ESMI_LOGO, 'PNG', x, y, h * (window.ESMI_LOGO_RATIO || 1), h); } catch (e) {} } }
function pdfHeader(doc, title, sub) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(20, 32, 128); doc.rect(0, 0, W, 27, 'F');
  doc.setFillColor(56, 198, 244); doc.rect(0, 27, W, 1.4, 'F');
  pdfLogo(doc, 7, 2.5, 23);
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.text(U(S.config.EMPRESA || 'ESMI') + ' · ' + EMPRESA_FULL.toUpperCase(), 33, 9.5);
  doc.setFontSize(9.5); doc.setTextColor(155, 227, 251); doc.text('ÁREA ' + U(S.config.AREA || 'MODIFICACIONES MECÁNICAS') + '  ·  SERVICIO A ' + U(cliente()) + '  ·  CONTROL DE HERRAMIENTAS', 33, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(215, 228, 250);
  doc.text('Administrador de Bodega: ' + (S.config.ADMIN_BODEGA || FIRMA) + '   ·   Emitido: ' + new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz', hour12: false }) + (S.user ? '  ·  por ' + S.user.nombre : ''), 33, 21.5);
  doc.setTextColor(20, 32, 128); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(title, 10, 36);
  if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90, 105, 125); doc.text(doc.splitTextToSize(sub, W - 20), 10, 42); }
  doc.setDrawColor(56, 198, 244); doc.setLineWidth(.8); doc.line(10, sub ? 46 : 39, 60, sub ? 46 : 39);
  return sub ? 51 : 44;
}
function pdfFooter(doc) {
  const n = doc.internal.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(130); doc.setFont('helvetica', 'normal'); doc.text(`ESMI · Modificaciones Mecánicas · Servicio a ${cliente()} · Documento generado por el Sistema de Control de Herramientas`, 10, H - 6); doc.text(`Pág. ${i}/${n}`, W - 10, H - 6, { align: 'right' }); }
}
/** Firmas: siempre incluye al Administrador de Bodega con sello */
function pdfSign(doc, y, others = []) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  if (y > H - 52) { doc.addPage(); y = 24; }
  const sigs = [{ n: S.config.ADMIN_BODEGA || FIRMA, r: 'Administrador de Bodega', seal: true }, ...others];
  const colW = (W - 20) / sigs.length;
  sigs.forEach((s, i) => {
    const cx = 10 + colW * i + colW / 2, ly = y + 26;
    if (s.seal) { doc.setDrawColor(26, 42, 156); doc.setLineWidth(.6); doc.circle(cx + 26, y + 12, 11); doc.circle(cx + 26, y + 12, 9); doc.setTextColor(26, 42, 156); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold'); doc.text('ESMI', cx + 26, y + 10.5, { align: 'center' }); doc.text('BODEGA', cx + 26, y + 13.2, { align: 'center' }); doc.text('MOD. MEC.', cx + 26, y + 15.9, { align: 'center' }); }
    doc.setDrawColor(60); doc.setLineWidth(.3); doc.line(cx - 32, ly, cx + 32, ly);
    doc.setTextColor(20); doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text(String(s.n), cx, ly + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90); doc.text(String(s.r), cx, ly + 8.5, { align: 'center' });
  });
  return y + 40;
}
function table(doc, y, head, body, opts = {}) {
  if (!doc.autoTable) { toast('Complemento de tablas PDF no cargó', 'err'); return y; }
  doc.autoTable(Object.assign({ startY: y, head: [head], body, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6, lineColor: [210, 218, 228] }, headStyles: { fillColor: [20, 32, 128], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 248, 252] }, margin: { left: 10, right: 10, top: 14 } }, opts));
  return doc.lastAutoTable.finalY + 6;
}
const fnow = () => new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz', hour12: false });
const fname = s => s.replace(/[^\w\-]+/g, '_') + '_' + new Date().toISOString().slice(0, 10);

function valePDF(s, lote) {
  const J = jsPDFReady(); if (!J) return; const doc = new J();
  let y = pdfHeader(doc, 'VALE DE SALIDA DE HERRAMIENTAS', 'N° ' + lote + ' · ' + s.at.toLocaleString('es-BO', { timeZone: 'America/La_Paz', hour12: false }));
  pdfQR(doc, workerQRText(s.worker.ID_Ficha), 172, 30, 26);
  doc.setFontSize(10); doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.text('Trabajador: ' + s.worker.Nombre_Completo, 10, y); doc.setFont('helvetica', 'normal');
  doc.text(`ID: ${s.worker.ID_Ficha}   ·   ${s.worker.Cargo || ''}   ·   ${s.worker.Grupo || ''}   ·   Turno ${s.worker.Turno || ''}`, 10, y + 5);
  doc.text(`Devolución prevista: ${s.prev ? s.prev.toLocaleString('es-BO', { timeZone: 'America/La_Paz', hour12: false }) : '—'}   ·   Estado de salida: ${s.estado}`, 10, y + 10);
  if (s.obs) doc.text('Obs.: ' + s.obs, 10, y + 15);
  y = table(doc, y + 20, ['#', 'Código', 'Descripción', 'Marca / Modelo', 'Cant.'], s.items.map((l, i) => [i + 1, l.code, l.t.Descripcion, [l.t.Marca, l.t.Modelo].filter(Boolean).join(' / '), l.cant]));
  doc.setFontSize(8.5); doc.setTextColor(70); doc.text(doc.splitTextToSize('El trabajador declara recibir las herramientas en el estado indicado y se compromete a devolverlas en la fecha prevista. Cualquier daño o pérdida debe reportarse de inmediato a la bodega.', 190), 10, y); y += 12;
  pdfSign(doc, y, [{ n: S.user.nombre, r: 'Entregado por' }, { n: s.worker.Nombre_Completo, r: 'Recibido por (trabajador)' }]);
  pdfFooter(doc); doc.save(fname('Vale_' + lote) + '.pdf');
}
function devolucionPDF(snap, lote) {
  const J = jsPDFReady(); if (!J) return; const doc = new J();
  let y = pdfHeader(doc, 'COMPROBANTE DE DEVOLUCIÓN', 'N° ' + lote + ' · ' + fnow());
  y = table(doc, y, ['#', 'Trabajador', 'Código', 'Descripción', 'Cant.', 'Estado retorno', 'Obs.'], snap.map((s, i) => [i + 1, s.l.Nombre_Trabajador, s.l.Codigo_Herramienta, s.l.Descripcion, s.cant, s.estado, s.obs || '']),
    { didParseCell: d => { if (d.section === 'body' && d.column.index === 5 && d.cell.raw !== 'Bueno') d.cell.styles.textColor = [200, 30, 30]; } });
  const ws = [...new Set(snap.map(s => s.l.Nombre_Trabajador))];
  pdfSign(doc, y + 4, [{ n: S.user.nombre, r: 'Recibido en bodega por' }, { n: ws.length === 1 ? ws[0] : 'Trabajador(es)', r: 'Entregado por' }]);
  pdfFooter(doc); doc.save(fname('Devolucion_' + lote) + '.pdf');
}
function kardexPDF(p, loans) {
  const J = jsPDFReady(); if (!J) return; const doc = new J();
  let y = pdfHeader(doc, 'KARDEX PERSONAL DE HERRAMIENTAS', p.Nombre_Completo + ' · ' + p.ID_Ficha + ' · ' + (p.Cargo || '') + ' ' + (p.Grupo ? '· ' + p.Grupo : ''));
  pdfQR(doc, workerQRText(p.ID_Ficha), 172, 30, 26);
  doc.setFontSize(11); doc.setTextColor(20, 32, 128); doc.setFont('helvetica', 'bold'); doc.text('Herramientas a cargo (' + loans.reduce((a, l) => a + n0(l.Pendiente), 0) + ')', 10, y); y += 3;
  y = table(doc, y, ['Código', 'Descripción', 'Cant.', 'Fecha salida', 'Prevista', 'Situación'], loans.map(l => [l.Codigo_Herramienta, l.Descripcion, l.Pendiente, fdt(l.Fecha_Hora), fdt(l.Fecha_Devolucion_Prevista), l.Vencido ? 'VENCIDO' : 'En uso']));
  if (!loans.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text('Sin herramientas en custodia.', 10, y); y += 8; }
  doc.setFontSize(11); doc.setTextColor(20, 32, 128); doc.setFont('helvetica', 'bold'); doc.text('Historial de movimientos', 10, y); y += 3;
  y = table(doc, y, ['Fecha', 'Tipo', 'Código', 'Descripción', 'Cant.', 'Estado', 'Registró'], (S._kHist || []).slice(0, 300).map(m => [fdt(m.Fecha_Hora), m.Tipo, m.Codigo_Herramienta, m.Descripcion, m.Cantidad, m.Estado, String(m.Admin || '').replace(/\s*\(.*\)/, '')]));
  pdfSign(doc, y + 4, [{ n: p.Nombre_Completo, r: 'Trabajador' }]); pdfFooter(doc); doc.save(fname('Kardex_' + p.ID_Ficha) + '.pdf');
}
function histPDF(rows) {
  const J = jsPDFReady(); if (!J) return; const doc = new J({ orientation: 'landscape' });
  let y = pdfHeader(doc, 'HISTORIAL DE MOVIMIENTOS', rows.length + ' registros' + (S.hist.tipo ? ' · ' + S.hist.tipo : '') + (S.hist.desde ? ' · desde ' + S.hist.desde : '') + (S.hist.hasta ? ' · hasta ' + S.hist.hasta : ''));
  y = table(doc, y, ['Fecha', 'Tipo', 'Trabajador', 'Código', 'Descripción', 'Cant.', 'Estado', 'Registró', 'Obs.'], rows.map(m => [fdt(m.Fecha_Hora), m.Tipo, m.Nombre_Trabajador, m.Codigo_Herramienta, m.Descripcion, m.Cantidad, m.Estado, String(m.Admin || '').replace(/\s*\(.*\)/, ''), m.Observaciones]));
  pdfSign(doc, y); pdfFooter(doc); doc.save(fname('Historial') + '.pdf');
}
function statusPDF(kind) {
  const J = jsPDFReady(); if (!J) return; const doc = new J();
  let y;
  if (kind === 'venc') {
    const r = S.data.prestamos.filter(l => l.Vencido);
    y = pdfHeader(doc, 'REPORTE DE PRÉSTAMOS VENCIDOS', r.length + ' préstamos fuera de plazo al ' + fnow());
    y = table(doc, y, ['Trabajador', 'ID', 'Código', 'Descripción', 'Cant.', 'Salida', 'Prevista', 'Días'], r.map(l => [l.Nombre_Trabajador, l.ID_Trabajador, l.Codigo_Herramienta, l.Descripcion, l.Pendiente, fdt(l.Fecha_Hora), fdt(l.Fecha_Devolucion_Prevista), Math.max(0, Math.floor((Date.now() - parseD(l.Fecha_Devolucion_Prevista)) / 864e5))]));
  } else if (kind === 'dan') {
    const r = S.data.herramientas.filter(t => n0(t.Cant_Danada) > 0 || /da[ñn]|perd|repar/i.test(t.Estado));
    y = pdfHeader(doc, 'REPORTE DE HERRAMIENTAS DAÑADAS', r.length + ' registros con unidades dañadas o fuera de servicio');
    y = table(doc, y, ['Código', 'Descripción', 'Marca', 'Categoría', 'Dañadas', 'Total', 'Estado'], r.map(t => [t.Codigo, t.Descripcion, t.Marca, t.Categoria, t.Cant_Danada, t.Stock_Total, t.Estado]));
  } else {
    const r = S.data.prestamos.slice().sort((a, b) => String(a.Nombre_Trabajador).localeCompare(b.Nombre_Trabajador));
    y = pdfHeader(doc, 'HERRAMIENTAS EN CUSTODIA DE PERSONAL', r.length + ' préstamos abiertos al ' + fnow());
    y = table(doc, y, ['Trabajador', 'Código', 'Descripción', 'Cant.', 'Salida', 'Prevista', 'Situación'], r.map(l => [l.Nombre_Trabajador, l.Codigo_Herramienta, l.Descripcion, l.Pendiente, fdt(l.Fecha_Hora), fdt(l.Fecha_Devolucion_Prevista), l.Vencido ? 'VENCIDO' : 'En plazo']));
  }
  pdfSign(doc, y); pdfFooter(doc); doc.save(fname('Reporte_' + kind) + '.pdf');
}
function auditPDF(filas, id) {
  const J = jsPDFReady(); if (!J) return; const doc = new J();
  const dif = filas.filter(f => f.Resultado !== 'CONFORME'), falt = filas.filter(f => f.Resultado === 'FALTANTE'), sob = filas.filter(f => f.Resultado === 'SOBRANTE' || f.Resultado === 'NO REGISTRADA');
  let y = pdfHeader(doc, 'REPORTE OFICIAL DE AUDITORÍA DE INVENTARIO', `Auditoría ${id} · ${filas[0] ? fdt(filas[0].Fecha_Hora) : ''} · Auditor: ${filas[0] ? String(filas[0].Admin).replace(/\s*\(.*\)/, '') : ''}`);
  const box = (x, l, v, c) => { doc.setDrawColor(210); doc.setFillColor(248, 250, 253); doc.roundedRect(x, y, 44, 16, 2, 2, 'FD'); doc.setFontSize(7.5); doc.setTextColor(100); doc.setFont('helvetica', 'normal'); doc.text(l, x + 3, y + 5); doc.setFontSize(14); doc.setTextColor(...c); doc.setFont('helvetica', 'bold'); doc.text(String(v), x + 3, y + 13); };
  box(10, 'ÍTEMS AUDITADOS', filas.length, [20, 32, 128]); box(57, 'CONFORMES', filas.length - dif.length, [20, 150, 100]); box(104, 'FALTANTES', falt.length, [200, 30, 30]); box(151, 'SOBRANTES / NO REG.', sob.length, [200, 130, 0]); y += 24;
  const sec = t => { doc.setFontSize(11); doc.setTextColor(20, 32, 128); doc.setFont('helvetica', 'bold'); doc.text(t, 10, y); y += 3; };
  sec('1. Diferencias encontradas (faltantes / sobrantes)');
  y = dif.length ? table(doc, y, ['Código', 'Descripción', 'Teórico', 'Físico', 'Dif.', 'Resultado'], dif.map(f => [f.Codigo, f.Descripcion, f.Stock_Teorico, f.Conteo_Fisico, f.Diferencia, f.Resultado]), { didParseCell: d => { if (d.section === 'body' && d.column.index >= 4) d.cell.styles.textColor = d.row.raw[5] === 'FALTANTE' ? [200, 30, 30] : [190, 120, 0]; } }) : (doc.setFont('helvetica', 'normal'), doc.setFontSize(9), doc.text('Sin diferencias: el conteo físico coincide con el sistema.', 10, y + 4), y + 10);
  const dan = S.data.herramientas.filter(t => n0(t.Cant_Danada) > 0);
  sec('2. Herramientas dañadas (fuera de servicio)');
  y = dan.length ? table(doc, y, ['Código', 'Descripción', 'Dañadas', 'Total', 'Estado'], dan.map(t => [t.Codigo, t.Descripcion, t.Cant_Danada, t.Stock_Total, t.Estado])) : (doc.setFont('helvetica', 'normal'), doc.setFontSize(9), doc.text('Ninguna.', 10, y + 4), y + 10);
  const venc = S.data.prestamos.filter(l => l.Vencido);
  sec('3. Préstamos vencidos');
  y = venc.length ? table(doc, y, ['Trabajador', 'Código', 'Descripción', 'Cant.', 'Prevista'], venc.map(l => [l.Nombre_Trabajador, l.Codigo_Herramienta, l.Descripcion, l.Pendiente, fdt(l.Fecha_Devolucion_Prevista)])) : (doc.setFont('helvetica', 'normal'), doc.setFontSize(9), doc.text('Ninguno.', 10, y + 4), y + 10);
  sec('4. Detalle completo del conteo');
  y = table(doc, y, ['Código', 'Descripción', 'Teórico', 'Físico', 'Dif.', 'Resultado'], filas.map(f => [f.Codigo, f.Descripcion, f.Stock_Teorico, f.Conteo_Fisico, f.Diferencia, f.Resultado]), { styles: { fontSize: 7, cellPadding: 1.2 } });
  pdfSign(doc, y + 4, [{ n: filas[0] ? String(filas[0].Admin).replace(/\s*\(.*\)/, '') : '', r: 'Auditor responsable' }]); pdfFooter(doc); doc.save(fname('Auditoria_' + id) + '.pdf');
  // también Excel
  xlsx('Auditoria_' + id, 'Auditoría', ['Codigo', 'Descripcion', 'Stock_Teorico', 'Conteo_Fisico', 'Diferencia', 'Resultado', 'Observaciones'], filas, 'Auditoría ' + id);
}
/** Etiquetas: kind 'tool' (63×38 mm, 3×7) o 'foto' (fotocheck 85×54 mm, 2×5) */
function labelsPDF(items, kind) {
  const J = jsPDFReady(); if (!J) return; const doc = new J({ unit: 'mm', format: 'a4' });
  const foto = kind === 'foto', W = foto ? 85 : 63.5, H = foto ? 54 : 38.1, cols = foto ? 2 : 3, rows = foto ? 5 : 7, mx = foto ? 15 : 7.2, my = foto ? 13.5 : 15.15, gx = foto ? 10 : 2.5, gy = 0;
  items.forEach((it, i) => {
    const k = i % (cols * rows); if (i && !k) doc.addPage();
    const x = mx + (k % cols) * (W + gx), y = my + Math.floor(k / cols) * (H + gy);
    doc.setDrawColor(200); doc.setLineWidth(.2); doc.roundedRect(x, y, W, H, 2, 2);
    if (!foto) {
      const t = it.t; pdfQR(doc, t.Codigo, x + 3, y + 4, 30);
      doc.setFillColor(20, 32, 128); doc.rect(x + 35, y + 3.5, 25.5, 6, 'F'); pdfLogo(doc, x + 35.4, y + 3.7, 5.6); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.text('ESMI · MOD. MEC.', x + 41.5, y + 7.6);
      doc.setFillColor(56, 198, 244); doc.rect(x, y + H - 1.8, W, 1.8, 'F');
      doc.setTextColor(0); doc.setFont('courier', 'bold'); doc.setFontSize(t.Codigo.length > 11 ? 8 : 10); doc.text(t.Codigo, x + 35, y + 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.text(doc.splitTextToSize(t.Descripcion || '', 25).slice(0, 4), x + 35, y + 18.5);
      doc.setFontSize(5.8); doc.setTextColor(90); doc.text(doc.splitTextToSize([t.Marca, t.Medida].filter(Boolean).join(' · '), 25).slice(0, 2), x + 35, y + 31.5);
    } else {
      const p = it.p;
      doc.setFillColor(20, 32, 128); doc.roundedRect(x, y, W, 13, 2, 2, 'F'); doc.rect(x, y + 8, W, 5, 'F'); doc.setFillColor(56, 198, 244); doc.rect(x, y + 13, W, 1, 'F');
      pdfLogo(doc, x + 2.5, y + 1, 11);
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.text('ESMI · MODIFICACIONES MECÁNICAS', x + 15, y + 5.5); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text(('Servicio a ' + cliente() + ' · Credencial de herramientas').toUpperCase(), x + 15, y + 9.6);
      pdfQR(doc, workerQRText(p.ID_Ficha), x + W - 35, y + 15, 32);
      doc.setTextColor(20, 32, 128); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(doc.splitTextToSize(p.Nombre_Completo, 45).slice(0, 3), x + 4, y + 20);
      doc.setFont('courier', 'bold'); doc.setFontSize(10); doc.setTextColor(26, 42, 156); doc.text(p.ID_Ficha, x + 4, y + 37);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(70); doc.text([(p.Cargo || '') + (p.Grupo ? ' · ' + p.Grupo : ''), 'Turno ' + (p.Turno || '—')], x + 4, y + 42);
      doc.setFillColor(56, 198, 244); doc.rect(x, y + H - 2.5, W, 2.5, 'F');
    }
  });
  doc.save(fname(foto ? 'Fotochecks' : 'Etiquetas_QR') + '.pdf'); toast(`PDF con ${items.length} ${foto ? 'fotochecks' : 'etiquetas'} generado`, 'ok');
}
function xlsx(file, sheetName, cols, rows, title) {
  if (!window.XLSX) return toast('La librería Excel aún no cargó (revise internet)', 'err');
  const head = [[U(S.config.EMPRESA) + ' · ' + EMPRESA_FULL.toUpperCase() + ' · ÁREA ' + U(S.config.AREA) + ' · SERVICIO A ' + U(cliente())], [(title || sheetName) + ' · emitido ' + fnow() + (S.user ? ' por ' + S.user.nombre : '')], ['Administrador de Bodega: ' + (S.config.ADMIN_BODEGA || FIRMA)], [], cols.map(c => c.replace(/_/g, ' '))];
  const body = rows.map(r => cols.map(c => { const v = r[c]; return /Fecha/.test(c) && v ? fdt(v) : v ?? ''; }));
  const foot = [[], [], ['_______________________________'], [S.config.ADMIN_BODEGA || FIRMA], ['Administrador de Bodega']];
  const ws = XLSX.utils.aoa_to_sheet([...head, ...body, ...foot]);
  ws['!cols'] = cols.map(c => ({ wch: /Descrip|Nombre|Obs/.test(c) ? 42 : /Fecha|Admin/.test(c) ? 20 : 14 }));
  ws['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: Math.max(3, cols.length - 1) } }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); XLSX.writeFile(wb, fname(file) + '.xlsx');
}
function inventoryXLSX(rows) {
  xlsx('Inventario_Herramientas', 'Inventario', ['Codigo', 'Descripcion', 'Marca', 'Modelo', 'Serie', 'Medida', 'Categoria', 'Subcategoria', 'Ubicacion', 'Stock_Total', 'Stock_Disponible', 'Prestado', 'Cant_Danada', 'Estado', 'Prestable', 'Fecha_Ult_Inspeccion', 'Resultado_Inspeccion', 'Observaciones'], rows, 'Inventario general de herramientas');
}

/* ======================================================================
 *  PORTAL PÚBLICO DEL TRABAJADOR (solo lectura, sin contraseña)
 * ====================================================================== */
let portalTimer = null;
/** Mantiene una vista pública "en vivo": consulta la versión y recarga solo si hubo cambios */
function liveLoop(getVersion, reload) {
  clearInterval(portalTimer);
  portalTimer = setInterval(async () => {
    if (document.hidden) return;
    try { const p = await api('ping', {}, true); if (String(p.version) !== String(getVersion())) await reload(); else liveStamp(); } catch (e) { liveStamp(true); }
  }, CFG.POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload().catch(() => {}); });
}
function liveStamp(off) { const el = $('#live'); if (el) el.innerHTML = `<span class="dot ${off ? 'off' : ''}"></span> ${off ? 'Sin conexión — reintentando…' : 'En vivo · actualizado ' + new Date().toLocaleTimeString('es-BO', { hour12: false, timeZone: 'America/La_Paz' })}`; }

async function renderPortal(id) {
  let ver = 0;
  const reload = async () => { const r = await api('kardexPublico', { id }, true); ver = (await api('ping', {}, true)).version; drawPortal(r); liveStamp(); };
  $('#app').innerHTML = `<div class="portal"><div class="row" style="margin-bottom:14px"><div class="logo"><img src="logo.png" alt="ESMI"></div><div><div class="brand-s">ESMI · Modificaciones Mecánicas · ${esc(cliente())}</div><div class="brand-t">Mi kardex de herramientas</div></div></div><div id="pt"><div class="skel" style="height:140px"></div></div></div>`;
  try { await reload(); liveLoop(() => ver, reload); }
  catch (e) { $('#pt').innerHTML = `<div class="card empty">${esc(e.message)}<br><br><a class="btn" href="${esc(webBase())}">Volver</a></div>`; }
}
function drawPortal(r) {
  {
    if (r.config) S.config = r.config;
    const w = r.trabajador, units = r.enPoder.reduce((a, l) => a + n0(l.Cantidad), 0), venc = r.enPoder.filter(l => l.Vencido).length;
    $('#pt').innerHTML = `
      <div class="sync" id="live" style="justify-content:center;margin-bottom:10px"></div>
      <div class="fotocheck"><div class="qrbox" style="padding:6px">${qrSVG(workerQRText(w.ID_Ficha), 96)}</div><div style="position:relative;z-index:1"><div class="cond" style="font-size:24px;font-weight:800;line-height:1.05">${esc(w.Nombre_Completo)}</div><div class="mono" style="color:var(--blue)">${esc(w.ID_Ficha)}</div><div class="muted" style="font-size:13px">${esc(w.Cargo || '')} ${w.Grupo ? '· ' + esc(w.Grupo) : ''} · Turno ${esc(w.Turno || '—')}</div></div></div>
      <div class="grid g2" style="margin:12px 0;grid-template-columns:1fr 1fr"><div class="stat"><div class="l">A mi cargo</div><div class="v" style="color:var(--brand)">${units}</div></div><div class="stat"><div class="l">Vencidas</div><div class="v" style="color:${venc ? 'var(--red)' : 'var(--dim)'}">${venc}</div></div></div>
      ${venc ? '<div class="demo-banner" style="border-color:rgba(255,93,93,.5);color:#ff9d9d;background:rgba(255,93,93,.08);margin-bottom:12px">Tienes herramientas con plazo vencido. Devuélvelas en bodega lo antes posible.</div>' : ''}
      <div class="card" style="margin-bottom:12px"><div class="card-h"><h3>Herramientas a mi cargo</h3></div>${r.enPoder.length ? `<div class="list">${r.enPoder.map(l => `<div class="item"><span class="code">${esc(l.Codigo)}</span><div class="grow"><div class="t">${esc(l.Descripcion)} ${l.Cantidad > 1 ? '×' + l.Cantidad : ''}</div><div class="s">Desde ${fdt(l.Fecha)} · Devolver: ${fdt(l.Prevista)}</div></div>${l.Vencido ? '<span class="pill p-red">Vencido</span>' : '<span class="pill p-blue">En uso</span>'}</div>`).join('')}</div>` : '<div class="empty">No tienes herramientas a tu cargo ✔</div>'}</div>
      <div class="card"><div class="card-h"><h3>Mi historial</h3></div>${r.historial.length ? `<div class="list">${r.historial.map(m => `<div class="item"><span class="pill ${TIPO_PILL[m.Tipo] || 'p-gray'}">${esc(m.Tipo)}</span><div class="grow"><div class="t">${esc(m.Descripcion || '')}</div><div class="s">${fdt(m.Fecha)} · <span class="mono">${esc(m.Codigo)}</span> · ${esc(m.Estado || '')}</div></div></div>`).join('')}</div>` : '<div class="empty">Sin movimientos</div>'}</div>
      <div class="row" style="justify-content:center;margin-top:16px"><a class="btn ghost" href="${esc(webBase())}">Ir al acceso</a></div>
      <p class="dim" style="text-align:center;font-size:12px;margin-top:14px">Vista de solo lectura · Se actualiza sola cuando bodega registra un movimiento · Administrador de Bodega: ${esc(S.config.ADMIN_BODEGA || FIRMA)}</p>`;
  }
}
/* ======================================================================
 *  PANEL DEL SUPERVISOR (solo lectura, clave Config > SUPERVISOR_CLAVE)
 * ====================================================================== */
const SUP = { r: null, ver: 0, q: '', grupo: '', venc: false, rec: false };
function supShell(inner) {
  return `<div class="portal" style="max-width:1100px"><div class="row wrap between" style="margin-bottom:14px"><div class="row"><div class="logo"><img src="logo.png" alt="ESMI"></div><div><div class="brand-s">ESMI · Modificaciones Mecánicas · ${esc(cliente())}</div><div class="brand-t">Panel del supervisor</div><div class="muted" style="font-size:12px">Solo lectura · herramientas en poder del personal</div></div></div>
    <div class="row"><div class="sync" id="live"></div>${store.get('esmi_sup') ? `<button class="btn sm" id="supOut">${ic('logout')} Salir</button>` : ''}</div></div>${inner}</div>`;
}
async function renderSupervisor() {
  history.replaceState(null, '', location.pathname + '?sup');
  const key = store.get('esmi_sup');
  if (!key) return supLogin();
  $('#app').innerHTML = supShell('<div id="supBody"><div class="skel" style="height:200px"></div></div>');
  const reload = async () => { SUP.r = await api('panelSupervisor', { clave: store.get('esmi_sup') }, true); SUP.ver = SUP.r.version; if (SUP.r.config) S.config = SUP.r.config; drawSup(); liveStamp(); };
  try { await reload(); liveLoop(() => SUP.ver, reload); }
  catch (e) { if (/clave/i.test(e.message)) { store.del('esmi_sup'); return supLogin(e.message); } $('#supBody').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
  if ($('#supOut')) $('#supOut').onclick = () => { store.del('esmi_sup'); clearInterval(portalTimer); supLogin(); };
}
function supLogin(err) {
  clearInterval(portalTimer);
  $('#app').innerHTML = supShell(`<div class="card" style="max-width:420px;margin:30px auto">
    ${DEMO ? '<div class="demo-banner" style="margin-bottom:12px">MODO DEMO · clave de supervisor: <b class="mono">sup2026</b></div>' : ''}
    <h3>Acceso del supervisor</h3><p class="muted">Ingrese la clave de supervisor que le dio bodega. No permite registrar ni modificar nada.</p>
    ${err ? `<div class="demo-banner" style="border-color:rgba(255,93,108,.5);color:#ffb0b8;background:rgba(255,93,108,.08);margin-bottom:10px">${esc(err)}</div>` : ''}
    <form id="supF" class="grid"><input class="inp" type="password" id="supK" placeholder="Clave de supervisor" required autocomplete="current-password"><button class="btn primary lg">${ic('shield')} Ver panel</button></form>
    <a class="btn ghost" style="width:100%;margin-top:10px" href="${esc(webBase())}">Volver al inicio</a></div>`);
  $('#supF').onsubmit = e => { e.preventDefault(); store.set('esmi_sup', $('#supK').value); renderSupervisor(); };
}
function drawSup() {
  const r = SUP.r, el = $('#supBody'); if (!el || !r) return;
  const grupos = [...new Set(r.trabajadores.map(w => w.Grupo).filter(Boolean))].sort();
  const q = norm(SUP.q);
  const list = r.trabajadores.filter(w => (!SUP.grupo || w.Grupo === SUP.grupo) && (!SUP.venc || w.vencidos) &&
    (!q || norm(w.Nombre_Completo + ' ' + w.ID_Ficha + ' ' + w.items.map(i => i.Codigo + ' ' + i.Descripcion).join(' ')).includes(q)));
  const st = (l, v, c) => `<div class="stat"><div class="l">${l}</div><div class="v" style="color:${c}">${v}</div></div>`;
  el.innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:12px">
      ${st('Trabajadores con herramientas', r.resumen.trabajadores, 'var(--brand)')}${st('Herramientas en campo', r.resumen.unidades, 'var(--amber)')}
      ${st('Préstamos vencidos', r.resumen.vencidos, r.resumen.vencidos ? 'var(--red)' : 'var(--dim)')}${st('Personal registrado', r.resumen.personal, 'var(--violet)')}</div>
    <div class="card" style="margin-bottom:12px"><div class="row wrap"><input class="inp grow" id="supQ" placeholder="Buscar trabajador, código o herramienta…" value="${esc(SUP.q)}" style="min-width:200px">
      <div class="chips"><button class="chip ${!SUP.grupo && !SUP.venc ? 'on' : ''}" data-g="">Todos</button><button class="chip ${SUP.venc ? 'on' : ''}" data-v="1" style="${r.resumen.vencidos ? 'border-color:rgba(255,93,108,.5)' : ''}">Solo vencidos</button>${grupos.map(g => `<button class="chip ${SUP.grupo === g ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div></div></div>
    ${list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">${list.map(w => {
      const wa = `*ESMI · Bodega Modificaciones Mecánicas*%0AHola ${encodeURIComponent(w.Nombre_Completo)}, tienes a tu cargo:%0A${w.items.map(i => encodeURIComponent('• ' + i.Codigo + ' ' + i.Descripcion + (i.Cantidad > 1 ? ' x' + i.Cantidad : '') + (i.Vencido ? ' (VENCIDA)' : ''))).join('%0A')}%0A%0ARevisa tu kardex: ${encodeURIComponent(workerQRText(w.ID_Ficha))}`;
      const tel = String(w.Telefono || '').replace(/\D/g, '');
      return `<div class="card" style="${w.vencidos ? 'border-color:rgba(255,93,108,.55)' : ''}"><div class="row" style="margin-bottom:8px"><div class="avatar">${initials(w.Nombre_Completo)}</div><div class="grow"><b>${esc(w.Nombre_Completo)}</b><div class="muted" style="font-size:12.5px"><span class="mono">${esc(w.ID_Ficha)}</span> · ${esc(w.Cargo)} ${w.Grupo ? '· ' + esc(w.Grupo) : ''}</div></div>
        <div style="text-align:right"><span class="pill p-amber">${w.unidades} herr.</span>${w.vencidos ? `<div style="margin-top:4px"><span class="pill p-red">${w.vencidos} vencida(s)</span></div>` : ''}</div></div>
        <div class="list">${w.items.map(i => `<div class="item" style="padding:8px 10px"><span class="code">${esc(i.Codigo)}</span><div class="grow"><div class="t" style="font-size:14px">${esc(i.Descripcion)} ${i.Cantidad > 1 ? '×' + i.Cantidad : ''}</div><div class="s">Desde ${fdt(i.Fecha)} · devolver ${fdt(i.Prevista)}</div></div>${i.Vencido ? '<span class="pill p-red">Vencida</span>' : ''}</div>`).join('')}</div>
        <div class="row" style="margin-top:10px">${tel ? `<a class="btn sm green" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${wa}">${ic('share')} Recordar por WhatsApp</a>` : `<span class="dim" style="font-size:12px">Sin celular registrado</span>`}</div></div>`;
    }).join('')}</div>` : '<div class="card empty">Nadie tiene herramientas pendientes con este filtro ✔</div>'}
    <div class="card" style="margin-top:12px"><div class="card-h"><h3>Movimientos recientes</h3><button class="btn sm" id="supRec">${SUP.rec ? 'Ocultar' : 'Mostrar'}</button></div>
      ${SUP.rec ? `<div class="list">${r.recientes.map(m => `<div class="item" style="padding:8px 10px"><span class="pill ${TIPO_PILL[m.Tipo] || 'p-gray'}">${esc(m.Tipo)}</span><div class="grow"><div class="t" style="font-size:14px">${esc(m.Trabajador || '—')} · ${esc(m.Descripcion || '')}</div><div class="s">${fdt(m.Fecha)} · <span class="mono">${esc(m.Codigo)}</span> · ${esc(m.Estado || '')} · registró ${esc(m.Admin)}</div></div></div>`).join('')}</div>` : ''}</div>`;
  $('#supQ').oninput = e => { SUP.q = e.target.value; const pos = e.target.selectionStart; drawSup(); const n = $('#supQ'); n.focus(); n.setSelectionRange(pos, pos); };
  $$('[data-g]', el).forEach(b => b.onclick = () => { SUP.grupo = b.dataset.g; SUP.venc = false; drawSup(); });
  $$('[data-v]', el).forEach(b => b.onclick = () => { SUP.venc = !SUP.venc; SUP.grupo = ''; drawSup(); });
  $('#supRec').onclick = () => { SUP.rec = !SUP.rec; drawSup(); };
}

async function renderToolPublic(code) {
  $('#app').innerHTML = `<div class="portal"><div class="row" style="margin-bottom:14px"><div class="logo"><img src="logo.png" alt="ESMI"></div><div><div class="brand-s">ESMI · Modificaciones Mecánicas · ${esc(cliente())}</div><div class="brand-t">Ficha de herramienta</div></div></div><div id="pt"><div class="skel" style="height:140px"></div></div></div>`;
  try {
    const t = (await api('herramientaPublica', { codigo: code }, true)).herramienta;
    $('#pt').innerHTML = `<div class="card"><div class="drawer-qr"><div class="qrbox" style="padding:8px">${qrSVG(t.Codigo, 120)}</div><div class="grow"><span class="code">${esc(t.Codigo)}</span><div class="cond" style="font-size:22px;font-weight:800;margin-top:6px">${esc(t.Descripcion)}</div><div class="muted">${esc([t.Marca, t.Modelo].filter(Boolean).join(' / '))}</div>
      <div class="kv" style="margin-top:10px"><div>Categoría</div><div>${esc(t.Categoria)}</div><div>Ubicación</div><div>${esc(t.Ubicacion)}</div><div>Estado</div><div>${estadoPill(t.Estado)}</div><div>Disponibles</div><div><b>${t.Stock_Disponible}</b> de ${t.Stock_Total}</div><div>Últ. inspección</div><div>${esc(t.Fecha_Ult_Inspeccion || '—')} ${esc(t.Resultado_Inspeccion || '')}</div></div></div></div></div>
      <div class="row" style="justify-content:center;margin-top:16px"><a class="btn" href="${esc(webBase())}">Ir al acceso</a></div>`;
  } catch (e) { $('#pt').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}

/* PWA: caché básica para abrir rápido (la información siempre viene en vivo del servidor) */
if ('serviceWorker' in navigator && location.protocol === 'https:') { navigator.serviceWorker.register('sw.js').catch(() => {}); }
