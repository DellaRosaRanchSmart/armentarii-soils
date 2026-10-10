/**
 * Backend de la app de Agronomía – Ganadería El Rosario.
 * Se pega como script VINCULADO a la hoja "Sistema_Agronomia_Digital"
 * (Extensiones > Apps Script) y se publica como aplicación web. Ver docs/INSTALACION.md.
 *
 * - doPost {action:'sync'}  : inserta/actualiza filas por ID (se puede reenviar sin duplicar).
 * - doPost {action:'foto'}  : guarda una foto en Drive y devuelve su URL.
 * - doGet  ?action=catalogos: devuelve 5_Catalogos para usar offline en la app.
 * - doGet  ?action=data     : devuelve todas las pestañas (para el dashboard de la app).
 */

// Nombres de las pestañas. Para arvenses se acepta cualquiera de los dos nombres.
var SHEETS = {
  jornadas: ['0_Jornadas'],
  puntos: ['1_Puntos_Muestreo'],
  arvenses: ['2_Arvenses', '2_Arvenses_Punto'],
  aforos: ['3_Aforos_Cabecera'],
  detalles: ['4_Aforos_Detalle'],
  catalogos: ['5_Catalogos']
};

// Encabezados que la app necesita. setup() solo AGREGA los que falten al final; no borra ni reordena.
var HEADERS = {
  jornadas: ['ID_Jornada', 'Fecha', 'Responsable', 'Clima', 'Lluvia_24h', 'Estado', 'Notas'],
  puntos: ['ID_Punto', 'ID_Jornada', 'Hora', 'Ubicacion', 'Potrero', 'pH', 'N_ppm', 'P_ppm', 'K_ppm', 'Ca_ppm', 'Mg_ppm',
    'S_ppm', 'B_ppm', 'Cu_ppm', 'Fe_ppm', 'Mn_ppm', 'Mo_ppm', 'Zn_ppm', 'MO_porc', 'Salinidad', 'Color', 'Humedad_Porc',
    'Compactacion', 'Erosion', 'Encharcamiento', 'Costra_Superficial', 'Suelo_Desnudo_Porc', 'Actividad_Bio', 'Pisoteo',
    'Pedregosidad', 'Pasto_Predominante', 'Cobertura_Pasto_Porc', 'Foto_Suelo', 'Foto_Panoramica', 'Observaciones',
    // columnas agregadas: facilitan Looker Studio y recogen lo que piden las fichas de campo
    'Fecha', 'Precision_GPS_m', 'Humedad_Aparente'],
  arvenses: ['ID_Arvense', 'ID_Punto', 'Nombre_Arvense', 'Cobertura_Porc', 'Abundancia', 'Foto_Arvense', 'Fecha', 'Potrero'],
  aforos: ['ID_Aforo', 'ID_Jornada', 'Potrero', 'Area_Ha', 'Metodo_M2', 'Promedio_Peso_g', 'Kg_Ha_FV', 'Oferta_Total_Kg', 'Foto_General',
    'Fecha', 'Ubicacion', 'Pasto_Predominante', 'Estado_Potrero', 'Dias_Descanso', 'N_Muestras', 'CV_Porc', 'MS_Porc', 'Kg_MS_Ha', 'Observaciones'],
  detalles: ['ID_Detalle', 'ID_Aforo', 'Peso_g', 'LatLong_Muestra', 'Fecha', 'Potrero', 'Altura_cm', 'Arvenses_Marco'],
  catalogos: ['Categoria', 'Nombre_Item', 'Descripcion_Cientifica', 'Area_Ha']
};

// Columnas que se guardan como texto (si no, Sheets puede interpretar "4.5,-74.1" como número).
var TEXT_COLS = ['ubicacion', 'latlong_muestra', 'hora'];
var PHOTOS_FOLDER = 'Sistema_Agronomia_Digital_Fotos';
// true = cualquiera con el enlace puede ver las fotos (necesario si quiere mostrarlas como imagen en Looker Studio).
var PHOTOS_PUBLIC = false;

// ---------------------------------------------------------------- Entrada web
function doGet(e) {
  return handle_(function () {
    var p = (e && e.parameter) || {};
    checkToken_(p.token);
    if (p.action === 'ping') return { spreadsheet: ss_().getName() };
    if (p.action === 'catalogos') return { items: Table_('catalogos').objects() };
    if (p.action === 'data') {
      var out = {};
      ['jornadas', 'puntos', 'arvenses', 'aforos', 'detalles'].forEach(function (k) { out[k] = Table_(k).objects(); });
      return out;
    }
    throw new Error('Acción desconocida');
  });
}

function doPost(e) {
  return handle_(function () {
    var body = JSON.parse(e.postData.contents);
    checkToken_(body.token);
    if (body.action === 'foto') return savePhoto_(body);
    if (body.action === 'sync') {
      var lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try { return sync_(body); } finally { lock.releaseLock(); }
    }
    throw new Error('Acción desconocida');
  });
}

function handle_(fn) {
  var out;
  try { out = fn(); out.ok = true; } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (expected && token !== expected) throw new Error('Clave (token) incorrecta');
}

// ---------------------------------------------------------------- Sincronización
function sync_(b) {
  var res = {};
  var J = Table_('jornadas'), P = Table_('puntos'), A = Table_('arvenses'), F = Table_('aforos'), D = Table_('detalles');

  // Borrados (incluye hijos)
  (b.deletes || []).forEach(function (d) {
    if (d.tipo === 'jornada') {
      var pts = P.idsWhere('ID_Jornada', d.id, 'ID_Punto'), afs = F.idsWhere('ID_Jornada', d.id, 'ID_Aforo');
      A.removeWhere('ID_Punto', pts); P.removeWhere('ID_Punto', pts);
      D.removeWhere('ID_Aforo', afs); F.removeWhere('ID_Aforo', afs);
      J.removeWhere('ID_Jornada', [d.id]);
    } else if (d.tipo === 'punto') {
      A.removeWhere('ID_Punto', [d.id]); P.removeWhere('ID_Punto', [d.id]);
    } else if (d.tipo === 'aforo') {
      D.removeWhere('ID_Aforo', [d.id]); F.removeWhere('ID_Aforo', [d.id]);
    }
  });

  res.jornadas = J.upsert('ID_Jornada', b.jornadas || []);
  res.puntos = P.upsert('ID_Punto', b.puntos || []);
  // Los hijos de cada punto/aforo enviado se reemplazan completos (si quitó un marco o una arvense, desaparece).
  A.removeWhere('ID_Punto', (b.puntos || []).map(function (r) { return r.ID_Punto; }));
  res.arvenses = A.upsert('ID_Arvense', b.arvenses || []);
  res.aforos = F.upsert('ID_Aforo', b.aforos || []);
  D.removeWhere('ID_Aforo', (b.aforos || []).map(function (r) { return r.ID_Aforo; }));
  res.detalles = D.upsert('ID_Detalle', b.detalles || []);

  [J, P, A, F, D].forEach(function (t) { t.save(); });
  return { escritos: res };
}

// ---------------------------------------------------------------- Fotos
function savePhoto_(b) {
  var root = getFolder_(DriveApp.getRootFolder(), PHOTOS_FOLDER);
  var folder = getFolder_(root, String(b.jornada || 'sin_jornada'));
  var name = String(b.nombre || (b.id + '.jpg')).replace(/[\\/:*?"<>|]/g, '_');
  var existing = folder.getFilesByName(name); // reintento: no duplicar
  var file = existing.hasNext() ? existing.next()
    : folder.createFile(Utilities.newBlob(Utilities.base64Decode(b.data), b.mime || 'image/jpeg', name));
  if (PHOTOS_PUBLIC) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: 'https://drive.google.com/file/d/' + file.getId() + '/view', id: file.getId() };
}

function getFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ---------------------------------------------------------------- Tabla en memoria
function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(key) {
  var ss = ss_();
  for (var i = 0; i < SHEETS[key].length; i++) {
    var sh = ss.getSheetByName(SHEETS[key][i]);
    if (sh) return sh;
  }
  throw new Error('No existe la pestaña ' + SHEETS[key][0] + '. Ejecute setup() en el editor de Apps Script.');
}

function key_(s) { return String(s || '').trim().toLowerCase(); }

/** Carga una pestaña completa en memoria; los cambios se escriben con save(). */
function Table_(key) {
  var sh = sheet_(key);
  var lastRow = sh.getLastRow(), lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var loaded = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  // Las filas vacías se descartan: así Looker Studio no ve huecos.
  var rows = loaded.filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); });
  var col = {};
  headers.forEach(function (h, i) { if (h) col[key_(h)] = i; });
  var dirty = rows.length !== loaded.length;
  var tz = ss_().getSpreadsheetTimeZone();

  function idx(name) {
    var i = col[key_(name)];
    if (i === undefined) throw new Error('Falta la columna ' + name + ' en ' + sh.getName());
    return i;
  }

  return {
    idsWhere: function (colName, value, idCol) {
      var i = idx(colName), id = idx(idCol);
      return rows.filter(function (r) { return String(r[i]) === String(value); }).map(function (r) { return String(r[id]); });
    },
    removeWhere: function (colName, values) {
      if (!values || !values.length) return;
      var set = {}, i = idx(colName);
      values.forEach(function (v) { set[String(v)] = true; });
      var before = rows.length;
      rows = rows.filter(function (r) { return !set[String(r[i])]; });
      if (rows.length !== before) dirty = true;
    },
    upsert: function (idCol, objs) {
      if (!objs.length) return 0;
      var i = idx(idCol), pos = {};
      rows.forEach(function (r, n) { pos[String(r[i])] = n; });
      objs.forEach(function (o) {
        var lower = {};
        Object.keys(o).forEach(function (k) { lower[key_(k)] = o[k]; });
        var id = String(lower[key_(idCol)]);
        var row = pos[id] !== undefined ? rows[pos[id]] : headers.map(function () { return ''; });
        headers.forEach(function (h, c) {
          var k = key_(h);
          if (k in lower) row[c] = cell_(k, lower[k]); // columnas que la app no envía se conservan
        });
        if (pos[id] === undefined) { pos[id] = rows.length; rows.push(row); }
      });
      dirty = true;
      return objs.length;
    },
    save: function () {
      if (!dirty) return;
      var total = Math.max(lastRow - 1, rows.length);
      if (total > 0) sh.getRange(2, 1, total, headers.length).clearContent();
      if (rows.length) {
        headers.forEach(function (h, c) {
          if (TEXT_COLS.indexOf(key_(h)) >= 0) sh.getRange(2, c + 1, rows.length, 1).setNumberFormat('@');
        });
        sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
      }
      dirty = false;
    },
    objects: function () {
      return rows.map(function (r) {
        var o = {};
        headers.forEach(function (h, c) {
          if (!h) return;
          var v = r[c];
          if (v instanceof Date) v = v.getFullYear() < 1900 ? Utilities.formatDate(v, tz, 'HH:mm') : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
          o[h] = v;
        });
        return o;
      });
    }
  };
}

/** Normaliza un valor antes de escribirlo en la hoja. */
function cell_(k, v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  v = String(v);
  if (k === 'fecha' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    var p = v.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  // Evita que un texto que empiece por = + - @ se interprete como fórmula.
  if (/^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

// ---------------------------------------------------------------- Instalación
/** Ejecutar UNA vez desde el editor: crea pestañas/columnas faltantes, la clave y la carpeta de fotos. */
function setup() {
  var ss = ss_();
  Object.keys(HEADERS).forEach(function (key) {
    var sh = null;
    SHEETS[key].forEach(function (n) { sh = sh || ss.getSheetByName(n); });
    if (!sh) sh = ss.insertSheet(SHEETS[key][0]);
    var lastCol = sh.getLastColumn();
    var current = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(key_) : [];
    var missing = HEADERS[key].filter(function (h) { return current.indexOf(key_(h)) < 0; });
    if (missing.length) sh.getRange(1, (current.filter(String).length ? lastCol : 0) + 1, 1, missing.length).setValues([missing]);
    sh.setFrozenRows(1);
  });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_TOKEN')) props.setProperty('API_TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  getFolder_(DriveApp.getRootFolder(), PHOTOS_FOLDER);
  Logger.log('Listo. Clave (token) para la app: ' + props.getProperty('API_TOKEN'));
  try { SpreadsheetApp.getUi().alert('Configuración lista.\n\nClave (token) para la app:\n' + props.getProperty('API_TOKEN')); } catch (e) { /* ejecutado sin interfaz */ }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Agronomía Digital')
    .addItem('Configurar / revisar columnas', 'setup')
    .addItem('Ver clave (token) de la app', 'mostrarToken')
    .addToUi();
}

function mostrarToken() {
  SpreadsheetApp.getUi().alert('Clave (token) para la app:\n' + (PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '(no configurada, ejecute Configurar)'));
}
