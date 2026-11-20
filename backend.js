/**
 * ESMI · Modificaciones Mecánicas — Control de Herramientas
 * Backend Google Apps Script (API JSON) sobre Google Sheets.
 * Administrador de Bodega: OMAR QUISPE CHECA
 *
 * Hojas: Herramientas · Personal · Historial_Movimientos · Usuarios_Admin · Auditorias · Config
 * Las columnas se leen POR NOMBRE de encabezado: puede reordenarlas o agregar columnas propias.
 *
 * Despliegue: Implementar > Nueva implementación > Aplicación web
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
 */

const SH = {
  TOOLS: 'Herramientas', PEOPLE: 'Personal', MOVES: 'Historial_Movimientos',
  ADMINS: 'Usuarios_Admin', AUDITS: 'Auditorias', CONFIG: 'Config'
};
const HEADERS = {
  Herramientas: ['Codigo','Descripcion','Marca','Modelo','Serie','Categoria','Subcategoria','Medida','Stock_Total','Cant_Danada','Stock_Disponible','Ubicacion','Estado','Prestable','Fecha_Ult_Inspeccion','Resultado_Inspeccion','Observaciones','Origen','Fecha_Alta','Activo','QR'],
  Personal: ['ID_Ficha','Nombre_Completo','Cargo','Grupo','Turno','Area','Empresa','Telefono','Activo','Fecha_Alta','QR'],
  Historial_Movimientos: ['ID_Mov','Tipo','Fecha_Hora','ID_Trabajador','Nombre_Trabajador','Codigo_Herramienta','Descripcion','Cantidad','Estado','Admin','Observaciones','ID_Prestamo_Ref','Pendiente','Estado_Prestamo','Fecha_Devolucion_Prevista','Lote'],
  Usuarios_Admin: ['Usuario','Nombre','Rol','Clave_Temporal','Hash','Salt','Activo','Ultimo_Acceso'],
  Auditorias: ['ID_Auditoria','Fecha_Hora','Admin','Codigo','Descripcion','Stock_Teorico','Conteo_Fisico','Diferencia','Resultado','Observaciones'],
  Config: ['Clave','Valor','Descripcion']
};
const TOKEN_TTL = 6 * 60 * 60;      // 6 h de sesión
const HASH_ROUNDS = 300;
const QR_API = 'https://quickchart.io/qr?size=180&margin=1&text=';

/* ============================ ENTRADA HTTP ============================ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action) return handle_(p);
  return json_({ ok: true, app: 'ESMI Control de Herramientas', version: getVersion_() });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); }
  catch (err) { return json_({ ok: false, error: 'JSON inválido' }); }
  return handle_(body);
}

function handle_(req) {
  try {
    const a = String(req.action || '');
    const pub = { login: login_, ping: ping_, kardexPublico: kardexPublico_, herramientaPublica: herramientaPublica_, config: publicConfig_, panelSupervisor: panelSupervisor_ };
    if (pub[a]) return json_(Object.assign({ ok: true }, pub[a](req)));

    const priv = {
      getData: getData_, getHistorial: getHistorial_, prestar: prestar_, devolver: devolver_,
      guardarHerramienta: guardarHerramienta_, guardarTrabajador: guardarTrabajador_,
      bajaHerramienta: bajaHerramienta_, repararHerramienta: repararHerramienta_, recibirNoInventariada: recibirNoInventariada_,
      guardarAuditoria: guardarAuditoria_, getAuditorias: getAuditorias_,
      cambiarClave: cambiarClave_, logout: logout_
    };
    if (!priv[a]) throw new Error('Acción desconocida: ' + a);
    const user = auth_(req.token);
    return json_(Object.assign({ ok: true }, priv[a](req, user)));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================ UTILIDADES HOJA ============================ */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz_() { return ss_().getSpreadsheetTimeZone() || 'America/La_Paz'; }

function sheet_(name) {
  let sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Lee una hoja como lista de objetos {Encabezado: valor, _row: n} */
function read_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(h => String(h).trim());
  const rows = [];
  values.forEach((v, i) => {
    if (v.every(c => c === '' || c === null)) return;
    const o = { _row: i + 2 };
    headers.forEach((h, j) => { if (h) o[h] = v[j]; });
    rows.push(o);
  });
  return { sh, headers, rows };
}

function col_(headers, name) {
  const i = headers.indexOf(name);
  if (i < 0) throw new Error('Falta la columna "' + name + '"');
  return i + 1;
}

function append_(name, obj) {
  const sh = sheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = headers.map(h => (h in obj ? obj[h] : ''));
  sh.appendRow(row);
  return sh.getLastRow();
}

function appendMany_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const data = objs.map(o => headers.map(h => (h in o ? o[h] : '')));
  sh.getRange(sh.getLastRow() + 1, 1, data.length, headers.length).setValues(data);
}

function setCell_(t, row, name, value) { t.sh.getRange(row, col_(t.headers, name)).setValue(value); }

function fmt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), "yyyy-MM-dd'T'HH:mm:ss");
  return v;
}
function clean_(o) {
  const r = {};
  Object.keys(o).forEach(k => { if (k !== 'QR' && k !== 'Hash' && k !== 'Salt' && k !== 'Clave_Temporal') r[k] = fmt_(o[k]); });
  return r;
}
function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function str_(v) { return String(v === null || v === undefined ? '' : v).trim(); }
function id_(p) { return p + Utilities.formatDate(new Date(), tz_(), 'yyMMddHHmmss') + Math.floor(Math.random() * 900 + 100); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('El sistema está ocupado, intente de nuevo en unos segundos');
  try { const r = fn(); SpreadsheetApp.flush(); bumpVersion_(); return r; }
  finally { lock.releaseLock(); }
}

/* ============================ SINCRONIZACIÓN ============================ */

function getVersion_() { return Number(PropertiesService.getScriptProperties().getProperty('VERSION') || 1); }
function bumpVersion_() {
  const v = Date.now();
  PropertiesService.getScriptProperties().setProperty('VERSION', String(v));
  CacheService.getScriptCache().remove('DATA');
  return v;
}
/** Disparador instalable: cualquier edición manual en las hojas avisa a todas las pantallas */
function onSheetChange(e) { bumpVersion_(); }

function ping_() { return { version: getVersion_(), server: fmt_(new Date()) }; }

function config_() {
  const c = {};
  read_(SH.CONFIG).rows.forEach(r => { c[str_(r.Clave)] = r.Valor; });
  return {
    EMPRESA: c.EMPRESA || 'ESMI', AREA: c.AREA || 'Modificaciones Mecánicas',
    ADMIN_BODEGA: c.ADMIN_BODEGA || 'OMAR QUISPE CHECA', WEB_URL: c.WEB_URL || '',
    CLIENTE: c.CLIENTE || 'Minera San Cristóbal',
    PLAZO_HORAS: num_(c.PLAZO_HORAS) || 12
  };
}
function publicConfig_() { return { config: config_() }; }

/* ============================ SEGURIDAD ============================ */

function hash_(pw, salt) {
  let h = salt + '|' + pw;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8)
      .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  }
  return h;
}

/** Convierte las claves temporales escritas en la hoja en Hash+Salt y las borra */
function procesarClavesTemporales_() {
  const t = read_(SH.ADMINS);
  t.rows.forEach(r => {
    const tmp = str_(r.Clave_Temporal);
    if (!tmp) return;
    const salt = Utilities.getUuid();
    setCell_(t, r._row, 'Salt', salt);
    setCell_(t, r._row, 'Hash', hash_(tmp, salt));
    setCell_(t, r._row, 'Clave_Temporal', '');
  });
}

function login_(req) {
  const u = str_(req.usuario).toLowerCase();
  const cache = CacheService.getScriptCache();
  const fails = num_(cache.get('fail_' + u));
  if (fails >= 5) throw new Error('Usuario bloqueado 15 minutos por intentos fallidos');
  procesarClavesTemporales_();
  const t = read_(SH.ADMINS);
  const r = t.rows.find(x => str_(x.Usuario).toLowerCase() === u);
  const okUser = r && str_(r.Activo).toUpperCase() !== 'NO' && r.Hash && hash_(String(req.clave || ''), str_(r.Salt)) === str_(r.Hash);
  if (!okUser) {
    cache.put('fail_' + u, String(fails + 1), 900);
    throw new Error('Usuario o contraseña incorrectos');
  }
  cache.remove('fail_' + u);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const user = { usuario: str_(r.Usuario), nombre: str_(r.Nombre), rol: str_(r.Rol) };
  cache.put('tok_' + token, JSON.stringify(user), TOKEN_TTL);
  setCell_(t, r._row, 'Ultimo_Acceso', new Date());
  return { token, user, config: config_() };
}

function auth_(token) {
  const raw = token && CacheService.getScriptCache().get('tok_' + token);
  if (!raw) throw new Error('SESION_EXPIRADA');
  CacheService.getScriptCache().put('tok_' + token, raw, TOKEN_TTL); // renueva
  return JSON.parse(raw);
}
function logout_(req) { CacheService.getScriptCache().remove('tok_' + req.token); return {}; }

function cambiarClave_(req, user) {
  if (String(req.nueva || '').length < 6) throw new Error('La nueva clave debe tener al menos 6 caracteres');
  const t = read_(SH.ADMINS);
  const r = t.rows.find(x => str_(x.Usuario) === user.usuario);
  if (hash_(String(req.actual || ''), str_(r.Salt)) !== str_(r.Hash)) throw new Error('La clave actual no coincide');
  const salt = Utilities.getUuid();
  setCell_(t, r._row, 'Salt', salt);
  setCell_(t, r._row, 'Hash', hash_(String(req.nueva), salt));
  return {};
}

/* ============================ LECTURA ============================ */

function prestadoPorCodigo_(moves) {
  const m = {};
  moves.forEach(x => {
    if (str_(x.Tipo) === 'PRESTAMO' && str_(x.Estado_Prestamo) === 'ABIERTO')
      m[str_(x.Codigo_Herramienta)] = (m[str_(x.Codigo_Herramienta)] || 0) + num_(x.Pendiente);
  });
  return m;
}

function toolView_(r, prestado) {
  const o = clean_(r);
  o.Codigo = str_(r.Codigo);
  o.Stock_Total = num_(r.Stock_Total);
  o.Cant_Danada = num_(r.Cant_Danada);
  o.Prestado = prestado[o.Codigo] || 0;
  o.Stock_Disponible = Math.max(0, o.Stock_Total - o.Cant_Danada - o.Prestado);
  delete o._row;
  return o;
}

function getData_(req, user) {
  const tools = read_(SH.TOOLS).rows.filter(r => str_(r.Codigo) && str_(r.Activo).toUpperCase() !== 'NO');
  const people = read_(SH.PEOPLE).rows.filter(r => str_(r.ID_Ficha));
  const moves = read_(SH.MOVES).rows;
  const prestado = prestadoPorCodigo_(moves);
  const now = new Date();
  const abiertos = moves.filter(x => str_(x.Tipo) === 'PRESTAMO' && str_(x.Estado_Prestamo) === 'ABIERTO')
    .map(x => { const o = clean_(x); delete o._row; o.Vencido = x.Fecha_Devolucion_Prevista instanceof Date && x.Fecha_Devolucion_Prevista < now; return o; });
  return {
    version: getVersion_(), user, config: config_(),
    herramientas: tools.map(r => toolView_(r, prestado)),
    personal: people.map(r => { const o = clean_(r); o.ID_Ficha = str_(r.ID_Ficha); delete o._row; return o; }),
    prestamos: abiertos,
    recientes: moves.slice(-40).reverse().map(x => { const o = clean_(x); delete o._row; return o; })
  };
}

function getHistorial_(req) {
  let rows = read_(SH.MOVES).rows;
  if (req.codigo) rows = rows.filter(x => str_(x.Codigo_Herramienta) === str_(req.codigo));
  if (req.trabajador) rows = rows.filter(x => str_(x.ID_Trabajador) === str_(req.trabajador));
  const lim = Math.min(num_(req.limite) || 500, 5000);
  return { movimientos: rows.slice(-lim).reverse().map(x => { const o = clean_(x); delete o._row; return o; }) };
}

function kardexPublico_(req) {
  const id = str_(req.id).toUpperCase();
  const p = read_(SH.PEOPLE).rows.find(r => str_(r.ID_Ficha).toUpperCase() === id);
  if (!p) throw new Error('Código de trabajador no encontrado');
  const moves = read_(SH.MOVES).rows.filter(x => str_(x.ID_Trabajador).toUpperCase() === id);
  const now = new Date();
  const enPoder = moves.filter(x => str_(x.Tipo) === 'PRESTAMO' && str_(x.Estado_Prestamo) === 'ABIERTO')
    .map(x => ({ Codigo: str_(x.Codigo_Herramienta), Descripcion: x.Descripcion, Cantidad: num_(x.Pendiente), Fecha: fmt_(x.Fecha_Hora), Prevista: fmt_(x.Fecha_Devolucion_Prevista), Vencido: x.Fecha_Devolucion_Prevista instanceof Date && x.Fecha_Devolucion_Prevista < now, Admin: x.Admin }));
  return {
    trabajador: { ID_Ficha: str_(p.ID_Ficha), Nombre_Completo: p.Nombre_Completo, Cargo: p.Cargo, Grupo: p.Grupo, Area: p.Area, Turno: p.Turno, Empresa: p.Empresa },
    enPoder,
    historial: moves.slice(-150).reverse().map(x => ({ Tipo: x.Tipo, Fecha: fmt_(x.Fecha_Hora), Codigo: str_(x.Codigo_Herramienta), Descripcion: x.Descripcion, Cantidad: x.Cantidad, Estado: x.Estado, Admin: x.Admin })),
    config: config_()
  };
}

/** Panel del SUPERVISOR: solo lectura, protegido con la clave Config > SUPERVISOR_CLAVE.
 *  Muestra quién debe qué herramientas, vencidas y movimientos recientes. */
function panelSupervisor_(req) {
  const cache = CacheService.getScriptCache();
  const fails = num_(cache.get('fail_sup'));
  if (fails >= 10) throw new Error('Demasiados intentos. Espere 15 minutos.');
  const raw = {};
  read_(SH.CONFIG).rows.forEach(r => { raw[str_(r.Clave)] = str_(r.Valor); });
  if (!raw.SUPERVISOR_CLAVE || String(req.clave || '') !== raw.SUPERVISOR_CLAVE) {
    cache.put('fail_sup', String(fails + 1), 900);
    throw new Error('Clave de supervisor incorrecta');
  }
  const people = {};
  read_(SH.PEOPLE).rows.forEach(p => { people[str_(p.ID_Ficha).toUpperCase()] = p; });
  const moves = read_(SH.MOVES).rows;
  const now = new Date();
  const byW = {};
  moves.forEach(x => {
    if (str_(x.Tipo) !== 'PRESTAMO' || str_(x.Estado_Prestamo) !== 'ABIERTO') return;
    const id = str_(x.ID_Trabajador).toUpperCase();
    const p = people[id] || {};
    const w = byW[id] = byW[id] || { ID_Ficha: id, Nombre_Completo: p.Nombre_Completo || x.Nombre_Trabajador, Cargo: p.Cargo || '', Grupo: p.Grupo || '', Telefono: str_(p.Telefono), items: [], unidades: 0, vencidos: 0 };
    const venc = x.Fecha_Devolucion_Prevista instanceof Date && x.Fecha_Devolucion_Prevista < now;
    w.items.push({ Codigo: str_(x.Codigo_Herramienta), Descripcion: x.Descripcion, Cantidad: num_(x.Pendiente), Fecha: fmt_(x.Fecha_Hora), Prevista: fmt_(x.Fecha_Devolucion_Prevista), Vencido: venc, Admin: String(x.Admin || '').replace(/\s*\(.*\)/, '') });
    w.unidades += num_(x.Pendiente); if (venc) w.vencidos++;
  });
  const trabajadores = Object.keys(byW).map(k => byW[k]).sort((a, b) => b.vencidos - a.vencidos || b.unidades - a.unidades);
  const recientes = moves.filter(x => ['PRESTAMO', 'DEVOLUCION', 'RECEPCION', 'PERDIDA'].indexOf(str_(x.Tipo)) >= 0).slice(-40).reverse()
    .map(x => ({ Tipo: x.Tipo, Fecha: fmt_(x.Fecha_Hora), Trabajador: x.Nombre_Trabajador, Codigo: str_(x.Codigo_Herramienta), Descripcion: x.Descripcion, Cantidad: x.Cantidad, Estado: x.Estado, Admin: String(x.Admin || '').replace(/\s*\(.*\)/, '') }));
  cache.remove('fail_sup');
  return {
    version: getVersion_(), config: config_(), trabajadores, recientes,
    resumen: { trabajadores: trabajadores.length, unidades: trabajadores.reduce((a, w) => a + w.unidades, 0), vencidos: trabajadores.reduce((a, w) => a + w.vencidos, 0), personal: Object.keys(people).length }
  };
}

function herramientaPublica_(req) {
  const code = str_(req.codigo).toUpperCase();
  const r = read_(SH.TOOLS).rows.find(x => str_(x.Codigo).toUpperCase() === code);
  if (!r) throw new Error('Herramienta no encontrada');
  const v = toolView_(r, prestadoPorCodigo_(read_(SH.MOVES).rows));
  return { herramienta: { Codigo: v.Codigo, Descripcion: v.Descripcion, Marca: v.Marca, Modelo: v.Modelo, Categoria: v.Categoria, Ubicacion: v.Ubicacion, Estado: v.Estado, Stock_Total: v.Stock_Total, Stock_Disponible: v.Stock_Disponible, Fecha_Ult_Inspeccion: v.Fecha_Ult_Inspeccion, Resultado_Inspeccion: v.Resultado_Inspeccion }, config: config_() };
}

/* ============================ PRÉSTAMOS ============================ */

/** Fecha/hora manual opcional (registro de vales en papel). Nunca futura. */
function fechaMov_(req) {
  if (!req.fecha) return new Date();
  const d = new Date(req.fecha);
  if (isNaN(d.getTime())) throw new Error('Fecha y hora no válidas');
  if (d.getTime() > Date.now() + 10 * 60 * 1000) throw new Error('La fecha y hora no puede ser futura');
  return d;
}

/** Crea en el catálogo una herramienta NO INVENTARIADA (código NI-0001...) y devuelve su fila */
function crearNoInventariada_(tl, datos, cantidad, estado, user, fecha, nota) {
  const max = tl.rows.reduce((m, r) => { const x = str_(r.Codigo).match(/^NI-(\d+)$/i); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  const code = 'NI-' + ('000' + (max + 1)).slice(-4);
  if (!str_(datos.Descripcion)) throw new Error('Indique la descripción de la herramienta no inventariada');
  const o = {
    Codigo: code, Descripcion: str_(datos.Descripcion), Marca: str_(datos.Marca), Modelo: str_(datos.Modelo), Serie: str_(datos.Serie),
    Medida: str_(datos.Medida), Categoria: 'No inventariada', Subcategoria: str_(datos.Subcategoria) || 'Registro manual',
    Stock_Total: cantidad, Cant_Danada: estado === 'Dañado' ? cantidad : 0, Ubicacion: str_(datos.Ubicacion) || 'Bodega',
    Estado: estado === 'Dañado' ? 'Dañado' : 'Bueno', Prestable: 'SI', Observaciones: str_(datos.Observaciones),
    Origen: 'No inventariada · ' + nota, Fecha_Alta: fecha, Activo: 'SI'
  };
  const row = append_(SH.TOOLS, o);
  writeToolFormulas_(tl.sh, tl.headers, row);
  o._row = row; tl.rows.push(o);
  append_(SH.MOVES, { ID_Mov: id_('A'), Tipo: 'ALTA', Fecha_Hora: fecha, Codigo_Herramienta: code, Descripcion: o.Descripcion, Cantidad: cantidad, Estado: o.Estado, Admin: user.nombre + ' (' + user.usuario + ')', Observaciones: 'Alta automática de herramienta no inventariada (' + nota + ')' });
  return o;
}

function prestar_(req, user) {
  return withLock_(() => {
    const idT = str_(req.idTrabajador).toUpperCase();
    const p = read_(SH.PEOPLE).rows.find(r => str_(r.ID_Ficha).toUpperCase() === idT);
    if (!p) throw new Error('Trabajador no registrado: ' + idT);
    if (str_(p.Activo).toUpperCase() === 'NO') throw new Error('El trabajador está inactivo');
    const items = (req.items || []).filter(i => num_(i.cantidad) > 0);
    if (!items.length) throw new Error('No hay herramientas en el préstamo');

    const tl = read_(SH.TOOLS);
    const tools = tl.rows;
    const prestado = prestadoPorCodigo_(read_(SH.MOVES).rows);
    const now = fechaMov_(req);
    items.forEach(it => { if (it.nuevo) it.codigo = crearNoInventariada_(tl, it.nuevo, num_(it.cantidad), 'Bueno', user, now, 'préstamo').Codigo; });
    const horas = num_(req.horas) || config_().PLAZO_HORAS;
    const prevista = req.prevista ? new Date(req.prevista) : new Date(now.getTime() + horas * 3600 * 1000);
    if (prevista.getTime() < now.getTime()) throw new Error('La devolución prevista no puede ser anterior a la fecha del préstamo');
    const lote = id_('L');
    const rows = items.map((it, k) => {
      const code = str_(it.codigo).toUpperCase();
      const t = tools.find(x => str_(x.Codigo).toUpperCase() === code);
      if (!t) throw new Error('Herramienta no registrada: ' + code);
      if (str_(t.Prestable).toUpperCase() === 'NO') throw new Error(code + ' no es prestable');
      const v = toolView_(t, prestado);
      if (num_(it.cantidad) > v.Stock_Disponible)
        throw new Error(code + ': solo hay ' + v.Stock_Disponible + ' disponible(s)');
      prestado[v.Codigo] = (prestado[v.Codigo] || 0) + num_(it.cantidad);
      const idm = lote.replace('L', 'P') + '-' + (k + 1);
      return {
        ID_Mov: idm, Tipo: 'PRESTAMO', Fecha_Hora: now, ID_Trabajador: str_(p.ID_Ficha), Nombre_Trabajador: p.Nombre_Completo,
        Codigo_Herramienta: v.Codigo, Descripcion: v.Descripcion, Cantidad: num_(it.cantidad),
        Estado: it.estado || req.estadoSalida || 'Bueno', Admin: user.nombre + ' (' + user.usuario + ')',
        Observaciones: str_(it.obs || req.obs), ID_Prestamo_Ref: idm, Pendiente: num_(it.cantidad),
        Estado_Prestamo: 'ABIERTO', Fecha_Devolucion_Prevista: prevista, Lote: lote
      };
    });
    appendMany_(SH.MOVES, rows);
    return { lote, registrados: rows.length, codigos: rows.map(r => r.Codigo_Herramienta) };
  });
}

function devolver_(req, user) {
  return withLock_(() => {
    const mv = read_(SH.MOVES);
    const tl = read_(SH.TOOLS);
    const now = fechaMov_(req);
    const lote = id_('D');
    const out = [];
    (req.devoluciones || []).forEach((d, k) => {
      const loan = mv.rows.find(x => str_(x.ID_Mov) === str_(d.idPrestamo));
      if (!loan || str_(loan.Estado_Prestamo) !== 'ABIERTO') throw new Error('Préstamo no abierto: ' + d.idPrestamo);
      const cant = num_(d.cantidad) || num_(loan.Pendiente);
      if (cant > num_(loan.Pendiente)) throw new Error('Cantidad mayor a la pendiente en ' + loan.Codigo_Herramienta);
      const pend = num_(loan.Pendiente) - cant;
      loan.Pendiente = pend;
      setCell_(mv, loan._row, 'Pendiente', pend);
      if (pend === 0) { setCell_(mv, loan._row, 'Estado_Prestamo', 'CERRADO'); loan.Estado_Prestamo = 'CERRADO'; }

      const estado = d.estado || 'Bueno';
      const t = tl.rows.find(x => str_(x.Codigo) === str_(loan.Codigo_Herramienta));
      if (t && estado === 'Dañado') {
        t.Cant_Danada = num_(t.Cant_Danada) + cant;
        setCell_(tl, t._row, 'Cant_Danada', t.Cant_Danada);
        if (t.Cant_Danada >= num_(t.Stock_Total)) setCell_(tl, t._row, 'Estado', 'Dañado');
      }
      if (t && estado === 'Perdido') {
        t.Stock_Total = Math.max(0, num_(t.Stock_Total) - cant);
        setCell_(tl, t._row, 'Stock_Total', t.Stock_Total);
        if (t.Stock_Total === 0) setCell_(tl, t._row, 'Estado', 'Perdido');
      }
      out.push({
        ID_Mov: lote + '-' + (k + 1), Tipo: estado === 'Perdido' ? 'PERDIDA' : 'DEVOLUCION', Fecha_Hora: now,
        ID_Trabajador: loan.ID_Trabajador, Nombre_Trabajador: loan.Nombre_Trabajador,
        Codigo_Herramienta: loan.Codigo_Herramienta, Descripcion: loan.Descripcion, Cantidad: cant, Estado: estado,
        Admin: user.nombre + ' (' + user.usuario + ')', Observaciones: str_(d.obs), ID_Prestamo_Ref: loan.ID_Mov, Lote: lote
      });
    });
    appendMany_(SH.MOVES, out);
    return { lote, registrados: out.length };
  });
}

/** Recepción en bodega de herramientas que no estaban inventariadas (las entrega un trabajador o llegan sin registro) */
function recibirNoInventariada_(req, user) {
  return withLock_(() => {
    const fecha = fechaMov_(req);
    let p = null;
    if (str_(req.idTrabajador)) {
      p = read_(SH.PEOPLE).rows.find(r => str_(r.ID_Ficha).toUpperCase() === str_(req.idTrabajador).toUpperCase());
      if (!p) throw new Error('Trabajador no registrado: ' + req.idTrabajador);
    }
    const tl = read_(SH.TOOLS);
    const lote = id_('R');
    const out = [];
    (req.items || []).forEach((it, k) => {
      const cant = Math.max(1, num_(it.cantidad));
      const estado = it.estado || 'Bueno';
      const o = crearNoInventariada_(tl, it, cant, estado, user, fecha, 'recepción');
      out.push({
        ID_Mov: lote + '-' + (k + 1), Tipo: 'RECEPCION', Fecha_Hora: fecha, ID_Trabajador: p ? str_(p.ID_Ficha) : '', Nombre_Trabajador: p ? p.Nombre_Completo : '',
        Codigo_Herramienta: o.Codigo, Descripcion: o.Descripcion, Cantidad: cant, Estado: estado, Admin: user.nombre + ' (' + user.usuario + ')',
        Observaciones: str_(it.obs) || 'Recepción de herramienta no inventariada', Lote: lote
      });
    });
    if (!out.length) throw new Error('No hay herramientas para recibir');
    appendMany_(SH.MOVES, out);
    return { lote, codigos: out.map(o => o.Codigo_Herramienta) };
  });
}

/* ============================ ALTAS / BAJAS ============================ */

function guardarHerramienta_(req, user) {
  return withLock_(() => {
    const h = req.herramienta || {};
    const code = str_(h.Codigo).toUpperCase();
    if (!code || !str_(h.Descripcion)) throw new Error('Código y descripción son obligatorios');
    const t = read_(SH.TOOLS);
    const ex = t.rows.find(x => str_(x.Codigo).toUpperCase() === code);
    const editable = ['Descripcion','Marca','Modelo','Serie','Categoria','Subcategoria','Medida','Stock_Total','Ubicacion','Estado','Prestable','Fecha_Ult_Inspeccion','Resultado_Inspeccion','Observaciones'];
    if (req.nuevo) {
      if (ex) throw new Error('Ya existe una herramienta con código ' + code);
      const o = { Codigo: code, Cant_Danada: 0, Activo: 'SI', Fecha_Alta: new Date(), Origen: 'Sistema web' };
      editable.forEach(k => { if (k in h) o[k] = h[k]; });
      o.Stock_Total = num_(o.Stock_Total) || 1; o.Estado = o.Estado || 'Bueno'; o.Prestable = o.Prestable || 'SI';
      const row = append_(SH.TOOLS, o);
      writeToolFormulas_(t.sh, t.headers, row);
      append_(SH.MOVES, { ID_Mov: id_('A'), Tipo: 'ALTA', Fecha_Hora: new Date(), Codigo_Herramienta: code, Descripcion: o.Descripcion, Cantidad: o.Stock_Total, Estado: o.Estado, Admin: user.nombre + ' (' + user.usuario + ')', Observaciones: 'Alta de herramienta' });
    } else {
      if (!ex) throw new Error('No existe la herramienta ' + code);
      editable.forEach(k => { if (k in h && t.headers.indexOf(k) >= 0) setCell_(t, ex._row, k, h[k]); });
      append_(SH.MOVES, { ID_Mov: id_('E'), Tipo: 'AJUSTE', Fecha_Hora: new Date(), Codigo_Herramienta: code, Descripcion: h.Descripcion, Cantidad: num_(h.Stock_Total), Estado: h.Estado, Admin: user.nombre + ' (' + user.usuario + ')', Observaciones: 'Edición de ficha' });
    }
    return { codigo: code };
  });
}

function writeToolFormulas_(sh, headers, r) {
  const L = n => columnLetter_(col_(headers, n));
  if (headers.indexOf('Stock_Disponible') >= 0) {
    sh.getRange(r, col_(headers, 'Stock_Disponible')).setFormula(
      '=IF(' + L('Codigo') + r + '="","",' + L('Stock_Total') + r + '-' + L('Cant_Danada') + r +
      '-SUMIFS(Historial_Movimientos!$M:$M,Historial_Movimientos!$F:$F,' + L('Codigo') + r +
      ',Historial_Movimientos!$B:$B,"PRESTAMO",Historial_Movimientos!$N:$N,"ABIERTO"))');
  }
  if (headers.indexOf('QR') >= 0)
    sh.getRange(r, col_(headers, 'QR')).setFormula('=IF(' + L('Codigo') + r + '="","",IMAGE("' + QR_API + '"&ENCODEURL(' + L('Codigo') + r + ')))');
}

function columnLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function guardarTrabajador_(req, user) {
  return withLock_(() => {
    const w = req.trabajador || {};
    const id = str_(w.ID_Ficha).toUpperCase();
    if (!id || !str_(w.Nombre_Completo)) throw new Error('ID y nombre son obligatorios');
    const t = read_(SH.PEOPLE);
    const ex = t.rows.find(x => str_(x.ID_Ficha).toUpperCase() === id);
    const editable = ['Nombre_Completo','Cargo','Grupo','Turno','Area','Empresa','Telefono','Activo'];
    if (req.nuevo) {
      if (ex) throw new Error('Ya existe el ID ' + id);
      const o = { ID_Ficha: id, Activo: 'SI', Fecha_Alta: new Date(), Empresa: 'ESMI', Area: 'Modificaciones Mecánicas' };
      editable.forEach(k => { if (w[k]) o[k] = w[k]; });
      const row = append_(SH.PEOPLE, o);
      writePersonQR_(t.sh, t.headers, row);
    } else {
      if (!ex) throw new Error('No existe el ID ' + id);
      editable.forEach(k => { if (k in w) setCell_(t, ex._row, k, w[k]); });
    }
    return { id };
  });
}

function writePersonQR_(sh, headers, r) {
  if (headers.indexOf('QR') < 0) return;
  const c = columnLetter_(col_(headers, 'ID_Ficha'));
  sh.getRange(r, col_(headers, 'QR')).setFormula(
    '=IF(' + c + r + '="","",IMAGE("' + QR_API + '"&ENCODEURL(IF(Config!$B$5="",' + c + r + ',Config!$B$5&"?w="&' + c + r + '))))');
}

function bajaHerramienta_(req, user) {
  return withLock_(() => {
    const t = read_(SH.TOOLS);
    const r = t.rows.find(x => str_(x.Codigo) === str_(req.codigo));
    if (!r) throw new Error('No existe ' + req.codigo);
    const prest = prestadoPorCodigo_(read_(SH.MOVES).rows)[str_(r.Codigo)] || 0;
    const cant = num_(req.cantidad) || 1;
    if (cant > num_(r.Stock_Total) - prest) throw new Error('No se pueden dar de baja unidades que están prestadas');
    const nuevo = num_(r.Stock_Total) - cant;
    setCell_(t, r._row, 'Stock_Total', nuevo);
    if (num_(r.Cant_Danada) > 0) setCell_(t, r._row, 'Cant_Danada', Math.max(0, Math.min(num_(r.Cant_Danada), nuevo)));
    if (nuevo === 0) setCell_(t, r._row, 'Estado', 'Baja');
    append_(SH.MOVES, { ID_Mov: id_('B'), Tipo: 'BAJA', Fecha_Hora: new Date(), Codigo_Herramienta: r.Codigo, Descripcion: r.Descripcion, Cantidad: cant, Estado: 'Baja', Admin: user.nombre + ' (' + user.usuario + ')', Observaciones: str_(req.motivo) });
    return {};
  });
}

function repararHerramienta_(req, user) {
  return withLock_(() => {
    const t = read_(SH.TOOLS);
    const r = t.rows.find(x => str_(x.Codigo) === str_(req.codigo));
    if (!r) throw new Error('No existe ' + req.codigo);
    const cant = Math.min(num_(req.cantidad) || num_(r.Cant_Danada), num_(r.Cant_Danada));
    setCell_(t, r._row, 'Cant_Danada', num_(r.Cant_Danada) - cant);
    setCell_(t, r._row, 'Estado', 'Bueno');
    append_(SH.MOVES, { ID_Mov: id_('R'), Tipo: 'REPARACION', Fecha_Hora: new Date(), Codigo_Herramienta: r.Codigo, Descripcion: r.Descripcion, Cantidad: cant, Estado: 'Bueno', Admin: user.nombre + ' (' + user.usuario + ')', Observaciones: str_(req.obs) || 'Reparada / vuelve a stock' });
    return {};
  });
}

/* ============================ AUDITORÍA ============================ */

function guardarAuditoria_(req, user) {
  return withLock_(() => {
    const tools = read_(SH.TOOLS).rows;
    const prestado = prestadoPorCodigo_(read_(SH.MOVES).rows);
    const now = new Date();
    const idA = id_('AUD');
    const rows = (req.conteos || []).map(c => {
      const t = tools.find(x => str_(x.Codigo) === str_(c.codigo));
      const teorico = t ? num_(t.Stock_Total) - (prestado[str_(t.Codigo)] || 0) : 0; // lo que debe estar físicamente en bodega
      const fisico = num_(c.fisico);
      const dif = fisico - teorico;
      return {
        ID_Auditoria: idA, Fecha_Hora: now, Admin: user.nombre + ' (' + user.usuario + ')', Codigo: str_(c.codigo),
        Descripcion: t ? t.Descripcion : '(no registrada)', Stock_Teorico: teorico, Conteo_Fisico: fisico, Diferencia: dif,
        Resultado: !t ? 'NO REGISTRADA' : dif === 0 ? 'CONFORME' : dif < 0 ? 'FALTANTE' : 'SOBRANTE', Observaciones: str_(c.obs)
      };
    });
    appendMany_(SH.AUDITS, rows);
    append_(SH.MOVES, { ID_Mov: idA, Tipo: 'AUDITORIA', Fecha_Hora: now, Admin: user.nombre + ' (' + user.usuario + ')', Cantidad: rows.length, Observaciones: 'Auditoría física: ' + rows.filter(r => r.Resultado !== 'CONFORME').length + ' diferencias' });
    return { id: idA, filas: rows.map(r => { const o = clean_(r); return o; }) };
  });
}

function getAuditorias_(req) {
  const rows = read_(SH.AUDITS).rows;
  const ids = {};
  rows.forEach(r => { const k = str_(r.ID_Auditoria); ids[k] = ids[k] || { id: k, fecha: fmt_(r.Fecha_Hora), admin: r.Admin, items: 0, dif: 0 }; ids[k].items++; if (str_(r.Resultado) !== 'CONFORME') ids[k].dif++; });
  const out = { auditorias: Object.keys(ids).map(k => ids[k]).reverse() };
  if (req.id) out.detalle = rows.filter(r => str_(r.ID_Auditoria) === str_(req.id)).map(r => { const o = clean_(r); delete o._row; return o; });
  return out;
}

/* ============================ CONFIGURACIÓN INICIAL ============================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙️ ESMI Bodega')
    .addItem('1. Configurar sistema (ejecutar una vez)', 'configurarSistema')
    .addItem('Cifrar claves temporales', 'procesarClavesTemporales')
    .addItem('Regenerar fórmulas QR y stock', 'regenerarFormulas')
    .addToUi();
}

function procesarClavesTemporales() { procesarClavesTemporales_(); SpreadsheetApp.getActive().toast('Claves cifradas'); }

function configurarSistema() {
  Object.keys(HEADERS).forEach(n => {
    const sh = sheet_(n);
    const have = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    HEADERS[n].forEach(h => { if (have.indexOf(h) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold'); } });
  });
  ss_().setSpreadsheetTimeZone('America/La_Paz');
  regenerarFormulas();
  procesarClavesTemporales_();
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'onSheetChange') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss_()).onEdit().create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss_()).onChange().create();
  sheet_(SH.MOVES).getRange('C:C').setNumberFormat('dd/MM/yyyy HH:mm');
  sheet_(SH.MOVES).getRange('O:O').setNumberFormat('dd/MM/yyyy HH:mm');
  sheet_(SH.AUDITS).getRange('B:B').setNumberFormat('dd/MM/yyyy HH:mm');
  bumpVersion_();
  SpreadsheetApp.getActive().toast('Sistema configurado ✔  Ahora: Implementar > Nueva implementación > Aplicación web', 'ESMI', 8);
}

function regenerarFormulas() {
  const t = read_(SH.TOOLS);
  const last = t.sh.getLastRow();
  if (last >= 2) {
    const L = n => columnLetter_(col_(t.headers, n));
    const c = L('Codigo');
    const f1 = [], f2 = [];
    for (let r = 2; r <= last; r++) {
      f1.push(['=IF(' + c + r + '="","",' + L('Stock_Total') + r + '-' + L('Cant_Danada') + r + '-SUMIFS(Historial_Movimientos!$M:$M,Historial_Movimientos!$F:$F,' + c + r + ',Historial_Movimientos!$B:$B,"PRESTAMO",Historial_Movimientos!$N:$N,"ABIERTO"))']);
      f2.push(['=IF(' + c + r + '="","",IMAGE("' + QR_API + '"&ENCODEURL(' + c + r + ')))']);
    }
    t.sh.getRange(2, col_(t.headers, 'Stock_Disponible'), f1.length, 1).setFormulas(f1);
    t.sh.getRange(2, col_(t.headers, 'QR'), f2.length, 1).setFormulas(f2);
    t.sh.setRowHeights(2, last - 1, 70);
  }
  const p = read_(SH.PEOPLE);
  const lp = p.sh.getLastRow();
  for (let r = 2; r <= lp; r++) writePersonQR_(p.sh, p.headers, r);
  if (lp >= 2) p.sh.setRowHeights(2, lp - 1, 90);
}
