'use strict';
/* App de captura offline – Ganadería El Rosario.
   Registros locales (IndexedDB, store "records"):
     jornada: { id, tipo:'jornada', f:{Fecha,Responsable,Clima,Lluvia_24h,Estado,Notas}, sync, updatedAt }
     punto:   { id, tipo:'punto', jornadaId, f:{...columnas 1_Puntos_Muestreo}, lat, lng, acc,
                fotoSuelo, fotoPano, arvenses:[{id,nombre,cobertura,abundancia,foto}], sync, updatedAt }
     aforo:   { id, tipo:'aforo', jornadaId, potrero, area, metodo, foto,
                muestras:[{id,peso,lat,lng}], sync, updatedAt }
   sync: 'pending' | 'synced'. Las fotos van en el store "fotos" y se suben a Drive al sincronizar. */

// ---------------- Definición de campos ----------------
const QUIMICOS = [
  ['pH', 'pH', ''], ['N_ppm', 'N', 'ppm'], ['P_ppm', 'P', 'ppm'], ['K_ppm', 'K', 'ppm'],
  ['Ca_ppm', 'Ca', 'ppm'], ['Mg_ppm', 'Mg', 'ppm'], ['S_ppm', 'S', 'ppm'], ['B_ppm', 'B', 'ppm'],
  ['Cu_ppm', 'Cu', 'ppm'], ['Fe_ppm', 'Fe', 'ppm'], ['Mn_ppm', 'Mn', 'ppm'], ['Mo_ppm', 'Mo', 'ppm'],
  ['Zn_ppm', 'Zn', 'ppm'], ['MO_porc', 'Materia orgánica', '%'], ['Salinidad', 'Salinidad (CE)', 'µS/cm'],
];
// Valores por defecto de las listas. Si en 5_Catalogos existe una Categoria con el mismo nombre
// (p. ej. "Compactacion"), se usan los Nombre_Item de la hoja en su lugar.
// Opciones tomadas de las fichas de campo del voluntariado (Grupo Della Rosa).
const LISTAS = {
  Clima: ['Soleado', 'Nublado', 'Lluvia'],
  Estado: ['Abierta', 'En laboratorio', 'Cerrada'],
  Color: ['Oscuro', 'Pardo', 'Claro', 'Rojizo', 'Gris / moteado'],
  Humedad_Aparente: ['Seco', 'Húmedo', 'Saturado', 'Seco / Húmedo / Saturado (variable)'],
  Compactacion: ['Baja', 'Media', 'Alta'],
  Encharcamiento: ['No', 'Sí'],
  Erosion: ['Ninguna', 'Leve', 'Moderada', 'Severa'],
  Costra_Superficial: ['No', 'Sí'],
  Actividad_Bio: ['Lombrices', 'Hormigas', 'Termitas', 'Estiércol en descomposición', 'Ninguna'],
  Pisoteo: ['No', 'Poco', 'Mucho'],
  Pedregosidad: ['No', 'Poca', 'Mucha'],
  Abundancia: ['Dominante', 'Frecuente', 'Escasa'],
  Estado_Potrero: ['Recién pastoreado', 'En descanso', 'Listo para pastoreo'],
};
const CAMPO_SELECTS = [
  ['Humedad_Aparente', 'Humedad aparente'], ['Compactacion', 'Dureza / compactación'], ['Erosion', 'Erosión'], ['Encharcamiento', 'Encharcamiento'],
  ['Costra_Superficial', 'Costra superficial'], ['Actividad_Bio', 'Actividad biológica'],
  ['Pisoteo', 'Pisoteo / caminos de ganado'], ['Pedregosidad', 'Pedregosidad'],
];
const NUMERICOS = new Set([...QUIMICOS.map(q => q[0]), 'Humedad_Porc', 'Suelo_Desnudo_Porc', 'Cobertura_Pasto_Porc', 'Lluvia_24h', 'Precision_GPS_m']);

let CATALOGO = []; // [{Categoria, Nombre_Item, Descripcion_Cientifica, Area_Ha}]
let dirty = false;

function lista(cat) {
  const desdeHoja = CATALOGO.filter(c => norm(c.Categoria) === norm(cat)).map(c => c.Nombre_Item).filter(Boolean);
  // Potreros y pastos: listado de la finca (potreros.js) + lo que se agregue en 5_Catalogos.
  if (norm(cat) === 'potrero') return [...new Set([...POTREROS.map(p => p[0]), ...desdeHoja])];
  if (norm(cat) === 'pasto') return [...new Set([...POTREROS.map(p => p[4]).filter(x => x !== 'Sin especificar'), ...desdeHoja])].sort();
  return desdeHoja.length ? desdeHoja : (LISTAS[cat] || []);
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_]+/g, '');
const potreroFinca = nombre => POTREROS.find(p => norm(p[0]) === norm(nombre) || norm(p[1]) === norm(nombre));
/** Área para calcular la oferta: la de 5_Catalogos si existe; si no, el área de PASTOREO del listado de la finca. */
function areaPotrero(nombre) {
  const it = CATALOGO.find(c => norm(c.Categoria) === 'potrero' && norm(c.Nombre_Item) === norm(nombre));
  const a = it ? num(it.Area_Ha) : '';
  if (a !== '') return a;
  const p = potreroFinca(nombre);
  return p ? p[3] : '';
}
function pastoPotrero(nombre) {
  const p = potreroFinca(nombre);
  return p && p[4] !== 'Sin especificar' ? p[4] : '';
}
/** Texto de ayuda bajo el campo potrero. */
function infoPotrero(nombre) {
  if (!String(nombre || '').trim()) return '';
  const p = potreroFinca(nombre);
  if (p) return `✓ ${esc(p[0])} · ${esc(p[4])} · ${fmt(p[3], 2)} ha de pastoreo (${fmt(p[2], 2)} ha totales)`;
  if (lista('Potrero').some(x => norm(x) === norm(nombre))) return '✓ Potrero del catálogo de la hoja';
  return '⚠️ No está en el listado de potreros de la finca';
}
/** Al escribir el potrero: corrige mayúsculas, muestra su info y rellena área/pasto si no los escribió el usuario. */
function enlazarPotrero(frm, campoPot, campoArea, campoPasto) {
  const info = document.createElement('div');
  info.className = 'small muted potinfo';
  frm[campoPot].closest('.fld').appendChild(info);
  const pintar = () => (info.innerHTML = infoPotrero(frm[campoPot].value));
  const rellenar = () => {
    const p = potreroFinca(frm[campoPot].value);
    if (p && frm[campoPot].value !== p[0]) frm[campoPot].value = p[0];
    for (const [campo, valor] of [[campoArea, areaPotrero(frm[campoPot].value)], [campoPasto, pastoPotrero(frm[campoPot].value)]]) {
      if (!campo || !frm[campo]) continue;
      const el = frm[campo];
      if (el.value === '' || el.dataset.auto === '1') { el.value = valor === '' ? '' : String(valor); el.dataset.auto = valor === '' ? '' : '1'; }
    }
    pintar();
  };
  frm[campoPot].addEventListener('input', () => { if (potreroFinca(frm[campoPot].value)) rellenar(); else pintar(); });
  frm[campoPot].addEventListener('change', rellenar);
  for (const campo of [campoArea, campoPasto]) if (campo && frm[campo]) frm[campo].addEventListener('input', e => { if (e.isTrusted) frm[campo].dataset.auto = ''; });
  pintar();
}
async function confirmarPotrero(nombre) {
  if (!nombre || lista('Potrero').some(x => norm(x) === norm(nombre))) return true;
  return confirm(`"${nombre}" no está en el listado de potreros de la finca. ¿Guardar igual?`);
}

// ---------------- Componentes HTML ----------------
const opt = (vals, sel) => '<option value=""></option>' + vals.map(v => `<option${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('')
  + (sel && !vals.includes(sel) ? `<option selected>${esc(sel)}</option>` : '');
const datalist = (id, vals) => `<datalist id="${id}">${vals.map(v => {
  const p = id === 'dlPot' ? potreroFinca(v) : null;
  return `<option value="${esc(v)}"${p ? ` label="${esc(`${p[4]} · ${fmt(p[3], 2)} ha`)}"` : ''}>`;
}).join('')}</datalist>`;
const fNum = (name, label, val, unit = '', extra = '') =>
  `<label class="fld"><span>${esc(label)}${unit ? ` <small>(${esc(unit)})</small>` : ''}</span>
   <input name="${name}" type="text" inputmode="decimal" value="${esc(val)}" ${extra}></label>`;
const fSel = (name, label, vals, val) => `<label class="fld"><span>${esc(label)}</span><select name="${name}">${opt(vals, val)}</select></label>`;
const fTxt = (name, label, val, list = '') => `<label class="fld"><span>${esc(label)}</span><input name="${name}" value="${esc(val)}" ${list ? `list="${list}"` : ''} autocomplete="off"></label>`;

function fotoWidget(slot, fotoId, label) {
  return `<div class="foto" data-slot="${slot}">
    <input type="hidden" name="${slot}" value="${esc(fotoId || '')}">
    <div class="foto-prev" data-prev="${esc(fotoId || '')}"></div>
    <label class="btn sec small">📷 ${esc(label)}<input type="file" accept="image/*" capture="environment" hidden data-foto-input="${slot}"></label>
    <button type="button" class="btn ghost small" data-foto-del="${slot}" ${fotoId ? '' : 'hidden'}>Quitar</button>
  </div>`;
}

async function pintarPrevias(root) {
  for (const el of $$('.foto-prev', root)) {
    const id = el.dataset.prev;
    if (!id) { el.innerHTML = ''; continue; }
    const f = await DB.get('fotos', id);
    if (f && f.dataUrl) el.innerHTML = `<img src="${f.dataUrl}" alt="">`;
    else if (f && f.url) el.innerHTML = `<a href="${esc(f.url)}" target="_blank" rel="noopener">☁️ Ver en Drive</a>`;
    else el.innerHTML = '';
  }
}

/** Redimensiona a máx. 1280 px y JPEG 0.7 para que suba rápido con poca señal. */
function comprimir(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

function activarFotos(root, jornadaId, nombreBase) {
  root.addEventListener('change', async e => {
    const slot = e.target.dataset && e.target.dataset.fotoInput;
    if (!slot || !e.target.files[0]) return;
    try {
      const dataUrl = await comprimir(e.target.files[0]);
      const id = uid('F');
      await DB.put('fotos', { id, jornadaId, nombre: `${nombreBase()}_${slot}_${id}.jpg`, dataUrl, url: '' });
      const w = e.target.closest('.foto');
      $('input[type=hidden]', w).value = id;
      $('.foto-prev', w).dataset.prev = id;
      $('[data-foto-del]', w).hidden = false;
      dirty = true;
      await pintarPrevias(w);
    } catch (err) { toast(err.message, true); }
    e.target.value = '';
  });
  root.addEventListener('click', e => {
    const slot = e.target.dataset && e.target.dataset.fotoDel;
    if (!slot) return;
    const w = e.target.closest('.foto');
    $('input[type=hidden]', w).value = '';
    $('.foto-prev', w).dataset.prev = '';
    $('.foto-prev', w).innerHTML = '';
    e.target.hidden = true;
    dirty = true;
  });
}

// ---------------- GPS ----------------
/** Lee el GPS hasta 25 s o hasta precisión ≤ 8 m y devuelve la mejor lectura. Funciona sin internet. */
function leerGPS(onProgress) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Este dispositivo no tiene GPS disponible'));
    let best = null;
    const fin = () => { navigator.geolocation.clearWatch(w); clearTimeout(t); best ? res(best) : rej(new Error('No se obtuvo señal GPS. Intente a cielo abierto.')); };
    const w = navigator.geolocation.watchPosition(p => {
      const c = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      if (!best || c.acc < best.acc) best = c;
      onProgress && onProgress(best);
      if (best.acc <= 8) fin();
    }, err => { if (!best) { navigator.geolocation.clearWatch(w); clearTimeout(t); rej(new Error('GPS: ' + err.message)); } },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 });
    const t = setTimeout(fin, 25000);
  });
}
const coordTxt = (lat, lng) => (lat !== '' && lat != null && lng !== '' && lng != null ? `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}` : '');

// ---------------- UI general ----------------
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = 'toast'), 3500);
}
function setTitle(t, back) {
  $('#title').textContent = t;
  $('.status').hidden = !back;
  $('#back').hidden = !back;
  $('#back').onclick = () => { if (!dirty || confirm('Hay cambios sin guardar. ¿Salir?')) { dirty = false; location.hash = back; } };
}
const view = () => $('#view');

async function actualizarEstado() {
  const recs = await DB.all('records');
  const fotos = await DB.all('fotos');
  const deletes = await DB.kv('deletes', []);
  const pend = recs.filter(r => r.sync !== 'synced').length + fotos.filter(f => !f.url && f.dataUrl).length + deletes.length;
  $('#net').textContent = navigator.onLine ? 'En línea' : 'Sin conexión';
  $('#net').className = 'pill ' + (navigator.onLine ? 'on' : 'off');
  $('#pend').textContent = pend ? `${pend} pendiente${pend > 1 ? 's' : ''}` : 'Todo sincronizado';
  $('#pend').className = 'pill ' + (pend ? 'warn' : 'ok');
  return pend;
}

// ---------------- Vistas ----------------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

async function vistaInicio() {
  setTitle('Agronomía · El Rosario');
  const recs = await DB.all('records');
  const jornadas = recs.filter(r => r.tipo === 'jornada').sort((a, b) => (b.f.Fecha || '').localeCompare(a.f.Fecha || '') || b.updatedAt - a.updatedAt);
  const cuenta = (id, t) => recs.filter(r => r.tipo === t && r.jornadaId === id).length;
  const total = t => recs.filter(r => r.tipo === t).length;
  const fotos = await DB.all('fotos');
  const pend = recs.filter(r => r.sync !== 'synced').length + fotos.filter(f => !f.url && f.dataUrl).length + (await DB.kv('deletes', [])).length;
  const ultima = await DB.kv('ultimaSync', null);
  const hoy = new Date();
  const fl = hoy.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const fechaLarga = fl.charAt(0).toUpperCase() + fl.slice(1);
  const saludo = hoy.getHours() < 12 ? 'Buenos días' : hoy.getHours() < 18 ? 'Buenas tardes' : 'Buenas noches';
  const resp = await DB.kv('ultimoResponsable', '');
  const fechaChip = f => { const [y, m, d] = String(f || '').split('-'); return d ? `<div class="fchip"><b>${+d}</b><span>${MESES[+m - 1] || ''}</span><small>${y}</small></div>` : '<div class="fchip">—</div>'; };
  view().innerHTML = `
    <section class="hero">
      <div class="hero-txt">
        <div class="hero-kicker">${esc(saludo)}${resp ? `, ${esc(resp.split(' ')[0])}` : ''} · ${esc(fechaLarga)}</div>
        <div class="hero-title">Ganadería El Rosario</div>
        <div class="hero-sub">Suelos, arvenses y aforos de forraje — funciona sin señal</div>
      </div>
      <svg class="hero-art" viewBox="0 0 120 80" aria-hidden="true"><path d="M0 62 C30 50 50 70 80 58 S110 50 120 54 V80 H0Z" fill="rgba(255,255,255,.18)"/>
        <path d="M0 70 C35 60 60 78 120 64 V80 H0Z" fill="rgba(255,255,255,.28)"/><circle cx="96" cy="20" r="10" fill="rgba(255,236,170,.9)"/>
        <path d="M30 60 V40 M30 46 C24 42 22 36 23 32 C28 34 31 39 30 46 M30 50 C36 46 39 40 38 35 C33 37 30 43 30 50" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
    </section>

    <div class="acciones">
      <a class="accion primaria" href="#/jornada/nueva"><span class="ico">🗓️</span><b>Nueva jornada</b><small>Fecha, clima y responsable</small></a>
      <a class="accion" href="#/rapido/punto"><span class="ico">🧪</span><b>Punto de suelo</b><small>GPS, campo y laboratorio</small></a>
      <a class="accion" href="#/rapido/aforo"><span class="ico">🌾</span><b>Aforo</b><small>Marcos y oferta del potrero</small></a>
      <a class="accion" href="dashboard.html"><span class="ico">📊</span><b>Dashboard</b><small>Fertilidad, nutrientes, forraje</small></a>
    </div>

    <div class="sync ${pend ? 'pendiente' : 'aldia'}">
      <div><b>${pend ? `${pend} registro${pend > 1 ? 's' : ''} por sincronizar` : 'Todo sincronizado'}</b>
        <small>${ultima ? `Última sincronización: ${new Date(ultima).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Aún no se ha sincronizado desde este dispositivo'}</small></div>
      <button class="btn ${pend ? '' : 'sec'}" id="btnSync">⟳ Sincronizar</button>
    </div>

    <div class="stats">
      <div><b>${total('jornada')}</b><span>Jornadas</span></div>
      <div><b>${total('punto')}</b><span>Puntos de suelo</span></div>
      <div><b>${total('aforo')}</b><span>Aforos</span></div>
      <div><b>${POTREROS.length}</b><span>Potreros</span></div>
    </div>

    <div class="row between"><h2>Jornadas recientes</h2><a class="small linkbtn" href="#/ajustes">⚙️ Ajustes</a></div>
    ${jornadas.length ? jornadas.slice(0, 30).map(j => `
      <a class="card link jcard" href="#/jornada/${encodeURIComponent(j.id)}">
        ${fechaChip(j.f.Fecha)}
        <div class="jinfo">
          <div class="row between"><strong>${esc(j.f.Responsable || 'Sin responsable')}</strong>
            <span class="pill ${j.sync === 'synced' ? 'ok' : 'warn'}">${j.sync === 'synced' ? '✓ En la hoja' : '● Pendiente'}</span></div>
          <div class="muted small">🧪 ${cuenta(j.id, 'punto')} puntos · 🌾 ${cuenta(j.id, 'aforo')} aforos${j.f.Clima ? ` · ${esc(j.f.Clima)}` : ''}${j.f.Estado ? ` · ${esc(j.f.Estado)}` : ''}</div>
        </div>
      </a>`).join('') : `<div class="card vacio"><span class="ico">🌱</span><b>Aún no hay jornadas en este dispositivo</b>
        <small>Cree una jornada para empezar a capturar, o importe datos desde ⚙️ Ajustes.</small></div>`}`;
  $('#btnSync').onclick = sincronizar;
}

/** Acceso rápido: usa la jornada de hoy (o la crea) y abre el formulario. */
async function rapido(tipo) {
  const hoy = ymd(new Date());
  const recs = await DB.all('records');
  let j = recs.filter(r => r.tipo === 'jornada' && r.f.Fecha === hoy).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!j) {
    j = { id: uid('J'), tipo: 'jornada', f: { Fecha: hoy, Responsable: await DB.kv('ultimoResponsable', ''), Clima: '', Lluvia_24h: '', Estado: 'Abierta', Notas: '' },
      sync: 'pending', updatedAt: Date.now() };
    await DB.put('records', j);
    toast('Se creó la jornada de hoy');
  }
  location.replace(`#/${tipo}/nuevo/${encodeURIComponent(j.id)}`);
}

async function vistaJornada(id) {
  const nueva = id === 'nueva';
  const j = nueva
    ? { id: uid('J'), tipo: 'jornada', f: { Fecha: ymd(new Date()), Responsable: await DB.kv('ultimoResponsable', ''), Clima: '', Lluvia_24h: '', Estado: 'Abierta', Notas: '' } }
    : await DB.get('records', id);
  if (!j) { location.hash = '#/'; return; }
  setTitle(nueva ? 'Nueva jornada' : 'Jornada', '#/');
  const recs = nueva ? [] : (await DB.all('records')).filter(r => r.jornadaId === j.id);
  const puntos = recs.filter(r => r.tipo === 'punto').sort((a, b) => (a.f.Hora || '').localeCompare(b.f.Hora || ''));
  const aforos = recs.filter(r => r.tipo === 'aforo');
  view().innerHTML = `
    <form id="frm" class="card">
      <div class="muted small">${esc(j.id)}</div>
      <div class="grid2">
        <label class="fld"><span>Fecha</span><input type="date" name="Fecha" value="${esc(j.f.Fecha)}" required></label>
        ${fTxt('Responsable', 'Responsable', j.f.Responsable, 'dlResp')}
        ${fSel('Clima', 'Clima', lista('Clima'), j.f.Clima)}
        ${fNum('Lluvia_24h', 'Lluvia últimas 24 h', j.f.Lluvia_24h, 'mm')}
        ${fSel('Estado', 'Estado', lista('Estado'), j.f.Estado)}
      </div>
      <label class="fld"><span>Notas</span><textarea name="Notas" rows="2">${esc(j.f.Notas)}</textarea></label>
      ${datalist('dlResp', lista('Responsable'))}
      <div class="row gap"><button class="btn">Guardar jornada</button>
      ${nueva ? '' : '<button type="button" class="btn danger ghost" id="btnDel">Eliminar</button>'}</div>
    </form>
    ${nueva ? '<p class="muted">Guarde la jornada para agregar puntos de suelo y aforos.</p>' : `
    <h2>Puntos de muestreo de suelo (${puntos.length})</h2>
    <a class="btn sec" href="#/punto/nuevo/${encodeURIComponent(j.id)}">＋ Punto de suelo</a>
    ${puntos.map(p => `<a class="card link" href="#/punto/${encodeURIComponent(p.id)}">
      <div class="row between"><strong>${esc(p.f.Potrero || 'Sin potrero')} · ${esc(p.f.Hora)}</strong>
      <span class="pill ${p.sync === 'synced' ? 'ok' : 'warn'}">${p.sync === 'synced' ? '✓' : '●'}</span></div>
      <div class="muted small">${p.lat != null && p.lat !== '' ? `📍 ${coordTxt(p.lat, p.lng)} (±${Math.round(p.acc || 0)} m)` : '⚠️ Sin ubicación'}
      ${p.f.pH !== '' && p.f.pH != null ? ` · pH ${esc(p.f.pH)}` : ' · sin análisis de laboratorio'} · ${(p.arvenses || []).length} arvenses</div></a>`).join('')}
    <h2>Aforos por potrero (${aforos.length})</h2>
    <a class="btn sec" href="#/aforo/nuevo/${encodeURIComponent(j.id)}">＋ Aforo</a>
    ${aforos.map(a => { const c = calcAforo(a.muestras.map(m => m.peso), a.metodo, a.area); return `<a class="card link" href="#/aforo/${encodeURIComponent(a.id)}">
      <div class="row between"><strong>${esc(a.potrero || 'Sin potrero')}</strong>
      <span class="pill ${a.sync === 'synced' ? 'ok' : 'warn'}">${a.sync === 'synced' ? '✓' : '●'}</span></div>
      <div class="muted small">${c.n} marcos · ${fmt(c.kgHa, 0)} kg FV/ha · ${c.oferta !== '' ? `oferta ${fmt(c.oferta, 0)} kg` : 'sin área'}</div></a>`; }).join('')}`}`;

  $('#frm').addEventListener('input', () => (dirty = true));
  $('#frm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    j.f = Object.fromEntries(['Fecha', 'Responsable', 'Clima', 'Lluvia_24h', 'Estado', 'Notas'].map(k => [k, String(fd.get(k) || '').trim()]));
    j.f.Lluvia_24h = num(j.f.Lluvia_24h);
    j.sync = 'pending'; j.updatedAt = Date.now();
    await DB.put('records', j);
    await DB.setKv('ultimoResponsable', j.f.Responsable);
    dirty = false;
    toast('Jornada guardada');
    actualizarEstado();
    if (nueva) location.hash = `#/jornada/${encodeURIComponent(j.id)}`; else vistaJornada(j.id);
  };
  const del = $('#btnDel');
  if (del) del.onclick = async () => {
    if (!confirm('¿Eliminar la jornada con TODOS sus puntos y aforos? Si ya estaba sincronizada, también se borrará de la hoja.')) return;
    for (const r of recs) await eliminarRegistro(r, false);
    await eliminarRegistro(j, true);
    location.hash = '#/';
  };
}

async function eliminarRegistro(r, encolar = true) {
  await DB.del('records', r.id);
  const fotoIds = [r.fotoSuelo, r.fotoPano, r.foto, ...((r.arvenses || []).map(a => a.foto))].filter(Boolean);
  for (const f of fotoIds) await DB.del('fotos', f);
  // Solo si ya existía en la hoja hay que borrarlo allá (al borrar la jornada el servidor borra sus hijos).
  if (encolar && r.everSynced) {
    const d = await DB.kv('deletes', []);
    d.push({ tipo: r.tipo, id: r.id });
    await DB.setKv('deletes', d);
  }
  dirty = false;
  actualizarEstado();
}

// ----- Punto de muestreo de suelo -----
async function vistaPunto(id, jornadaId) {
  const nuevo = id === 'nuevo';
  const p = nuevo
    ? { id: uid('P'), tipo: 'punto', jornadaId, f: { Hora: hm(new Date()) }, lat: '', lng: '', acc: '', fotoSuelo: '', fotoPano: '', arvenses: [] }
    : await DB.get('records', id);
  if (!p) { location.hash = '#/'; return; }
  const j = await DB.get('records', p.jornadaId);
  setTitle(nuevo ? 'Nuevo punto de suelo' : 'Punto de suelo', `#/jornada/${encodeURIComponent(p.jornadaId)}`);
  const f = p.f;
  view().innerHTML = `
  <form id="frm">
    <div class="card">
      <div class="muted small">${esc(p.id)} · Jornada ${esc(j ? j.f.Fecha : '')}</div>
      <div class="grid2">
        ${fTxt('Potrero', 'Potrero', f.Potrero, 'dlPot')}
        <label class="fld"><span>Hora</span><input type="time" name="Hora" value="${esc(f.Hora)}"></label>
      </div>
      <div class="gps">
        <button type="button" class="btn sec" id="btnGps">📍 Capturar ubicación GPS</button>
        <div id="gpsTxt" class="muted">${p.lat !== '' ? `${coordTxt(p.lat, p.lng)} · ±${Math.round(p.acc || 0)} m` : 'Sin ubicación'}</div>
        <details><summary class="small muted">Ingresar coordenadas a mano</summary>
          <div class="grid2">${fNum('lat', 'Latitud', p.lat)}${fNum('lng', 'Longitud', p.lng)}</div></details>
      </div>
    </div>

    <details class="card" open><summary><h3>Observación de campo</h3></summary>
      <div class="grid2">
        ${fTxt('Color', 'Color del suelo', f.Color, 'dlColor')}
        ${fNum('Humedad_Porc', 'Humedad', f.Humedad_Porc, '%')}
        ${CAMPO_SELECTS.map(([k, l]) => fSel(k, l, lista(k), f[k])).join('')}
        ${fNum('Suelo_Desnudo_Porc', 'Suelo desnudo', f.Suelo_Desnudo_Porc, '%')}
      </div>
    </details>

    <details class="card" open><summary><h3>Pasto</h3></summary>
      <div class="grid2">
        ${fTxt('Pasto_Predominante', 'Pasto predominante', f.Pasto_Predominante, 'dlPasto')}
        ${fNum('Cobertura_Pasto_Porc', 'Cobertura de pasto', f.Cobertura_Pasto_Porc, '%')}
      </div>
    </details>

    <details class="card" ${QUIMICOS.some(([k]) => f[k] !== '' && f[k] != null) ? 'open' : ''}><summary><h3>Análisis de laboratorio</h3></summary>
      <p class="muted small">Puede dejarlo vacío y completarlo cuando lleguen los resultados; al guardar se vuelve a sincronizar.</p>
      <div class="grid3">${QUIMICOS.map(([k, l, u]) => fNum(k, l, f[k], u)).join('')}</div>
    </details>

    <details class="card" open><summary><h3>Arvenses (${(p.arvenses || []).length})</h3></summary>
      <div id="arvs"></div>
      <button type="button" class="btn sec small" id="addArv">＋ Arvense</button>
    </details>

    <details class="card" open><summary><h3>Fotos y observaciones</h3></summary>
      <div class="grid2">${fotoWidget('fotoSuelo', p.fotoSuelo, 'Foto suelo')}${fotoWidget('fotoPano', p.fotoPano, 'Foto panorámica')}</div>
      <label class="fld"><span>Observaciones</span><textarea name="Observaciones" rows="3">${esc(f.Observaciones)}</textarea></label>
    </details>

    ${datalist('dlPot', lista('Potrero'))}${datalist('dlColor', lista('Color'))}${datalist('dlPasto', lista('Pasto'))}${datalist('dlArv', lista('Arvense'))}
    <div class="row gap sticky"><button class="btn">Guardar punto</button>
      ${nuevo ? '' : '<button type="button" class="btn danger ghost" id="btnDel">Eliminar</button>'}</div>
  </form>`;

  const frm = $('#frm');
  const arvRow = a => `<div class="arv card inner" data-id="${esc(a.id)}">
      <div class="grid3">
        ${fTxt('nombre', 'Arvense', a.nombre, 'dlArv')}
        ${fNum('cobertura', 'Cobertura', a.cobertura, '%')}
        ${fSel('abundancia', 'Abundancia', lista('Abundancia'), a.abundancia)}
      </div>
      <div class="row between">${fotoWidget('arv_' + a.id, a.foto, 'Foto')}
      <button type="button" class="btn ghost small danger" data-del-arv>✕ Quitar arvense</button></div>
    </div>`;
  $('#arvs').innerHTML = (p.arvenses || []).map(arvRow).join('');
  $('#addArv').onclick = () => { $('#arvs').insertAdjacentHTML('beforeend', arvRow({ id: uid('A') })); dirty = true; };
  $('#arvs').addEventListener('click', e => { if (e.target.dataset.delArv !== undefined) { e.target.closest('.arv').remove(); dirty = true; } });
  activarFotos(frm, p.jornadaId, () => `${p.id}_${(frm.Potrero.value || 'SP').replace(/[^\w-]+/g, '')}`);
  pintarPrevias(frm);
  frm.addEventListener('input', () => (dirty = true));
  enlazarPotrero(frm, 'Potrero', null, 'Pasto_Predominante');

  $('#btnGps').onclick = async () => {
    const b = $('#btnGps'); b.disabled = true; b.textContent = 'Buscando señal…';
    try {
      const c = await leerGPS(c => ($('#gpsTxt').textContent = `${coordTxt(c.lat, c.lng)} · ±${Math.round(c.acc)} m (afinando…)`));
      frm.lat.value = c.lat.toFixed(6); frm.lng.value = c.lng.toFixed(6);
      p.lat = num(frm.lat.value); p.lng = num(frm.lng.value); p.acc = c.acc;
      $('#gpsTxt').textContent = `${coordTxt(c.lat, c.lng)} · ±${Math.round(c.acc)} m`;
      dirty = true;
    } catch (err) { toast(err.message, true); }
    b.disabled = false; b.textContent = '📍 Capturar ubicación GPS';
  };

  frm.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(frm);
    const g = k => String(fd.get(k) ?? '').trim();
    const campos = ['Potrero', 'Hora', 'Color', 'Humedad_Porc', ...CAMPO_SELECTS.map(c => c[0]), 'Suelo_Desnudo_Porc',
      'Pasto_Predominante', 'Cobertura_Pasto_Porc', ...QUIMICOS.map(q => q[0]), 'Observaciones'];
    p.f = Object.fromEntries(campos.map(k => [k, NUMERICOS.has(k) ? num(g(k)) : g(k)]));
    const lat = num(g('lat'));
    let lng = num(g('lng'));
    if ((lat === '') !== (lng === '')) return toast('Complete latitud y longitud', true);
    if (lat !== '' && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) return toast('Coordenadas inválidas', true);
    // Colombia está al oeste: la longitud es negativa. Los informes SOILO la escriben sin el signo (75.89 en vez de -75.89).
    if (lng > 0 && lat > -5 && lat < 15 && confirm(`La longitud ${lng} es positiva (quedaría en Asia). ¿Cambiarla a -${lng} (Oeste)?`)) {
      lng = -lng; frm.lng.value = String(lng);
    }
    if (lat !== p.lat || lng !== p.lng) p.acc = ''; // coordenadas editadas a mano: precisión desconocida
    p.lat = lat; p.lng = lng;
    if (p.f.pH !== '' && (p.f.pH < 0 || p.f.pH > 14)) return toast('pH fuera de rango (0–14)', true);
    for (const k of ['Humedad_Porc', 'Suelo_Desnudo_Porc', 'Cobertura_Pasto_Porc', 'MO_porc'])
      if (p.f[k] !== '' && (p.f[k] < 0 || p.f[k] > 100)) return toast(`${k}: debe estar entre 0 y 100`, true);
    p.fotoSuelo = g('fotoSuelo'); p.fotoPano = g('fotoPano');
    p.arvenses = $$('.arv', frm).map(el => {
      const aid = el.dataset.id;
      return { id: aid, nombre: $('[name=nombre]', el).value.trim(), cobertura: num($('[name=cobertura]', el).value),
        abundancia: $('[name=abundancia]', el).value, foto: $(`[name="arv_${CSS.escape(aid)}"]`, el).value };
    }).filter(a => a.nombre);
    if (!p.f.Potrero && !confirm('No indicó potrero. ¿Guardar igual?')) return;
    if (!(await confirmarPotrero(p.f.Potrero))) return;
    if (p.lat === '' && !confirm('El punto no tiene ubicación GPS. ¿Guardar igual?')) return;
    p.sync = 'pending'; p.updatedAt = Date.now();
    await DB.put('records', p);
    dirty = false;
    toast('Punto guardado');
    actualizarEstado();
    location.hash = `#/jornada/${encodeURIComponent(p.jornadaId)}`;
  };
  const del = $('#btnDel');
  if (del) del.onclick = async () => { if (confirm('¿Eliminar este punto y sus arvenses?')) { await eliminarRegistro(p); location.hash = `#/jornada/${encodeURIComponent(p.jornadaId)}`; } };
}

// ----- Aforo por potrero -----
async function vistaAforo(id, jornadaId) {
  const nuevo = id === 'nuevo';
  const a = nuevo
    ? { id: uid('AF'), tipo: 'aforo', jornadaId, potrero: '', area: '', metodo: await DB.kv('ultimoMetodo', 1), foto: '', muestras: [{ id: uid('D'), peso: '' }, { id: uid('D'), peso: '' }, { id: uid('D'), peso: '' }] }
    : await DB.get('records', id);
  if (!a) { location.hash = '#/'; return; }
  setTitle(nuevo ? 'Nuevo aforo' : 'Aforo', `#/jornada/${encodeURIComponent(a.jornadaId)}`);
  a.x = Object.assign({ lat: '', lng: '', acc: '', pasto: '', estado: '', dias: '', ms: '', obs: '' }, a.x);
  view().innerHTML = `
  <form id="frm">
    <div class="card">
      <div class="muted small">${esc(a.id)}</div>
      <div class="grid2">
        ${fTxt('potrero', 'Potrero', a.potrero, 'dlPot')}
        ${fNum('area', 'Área de pastoreo', a.area, 'ha', 'placeholder="Opcional"')}
      </div>
      <div class="fld"><span>Tamaño del marco <small>(m²)</small></span>
        <div class="row gap">
          <input name="metodo" type="text" inputmode="decimal" value="${esc(a.metodo)}" style="max-width:7em">
          ${[1, 0.5, 0.25].map(v => `<button type="button" class="btn ghost small" data-m2="${v}">${String(v).replace('.', ',')} m²</button>`).join('')}
        </div></div>
      <div class="gps">
        <button type="button" class="btn sec" id="btnGpsC">📍 Ubicación del centro del potrero</button>
        <div id="gpsC" class="muted small">${a.x.lat !== '' ? `${coordTxt(a.x.lat, a.x.lng)}${a.x.acc ? ` · ±${Math.round(a.x.acc)} m` : ''}` : 'Sin ubicación'}</div>
        <details><summary class="small muted">Ingresar coordenadas a mano</summary>
          <div class="grid2">${fNum('clat', 'Latitud', a.x.lat)}${fNum('clng', 'Longitud', a.x.lng)}</div></details>
      </div>
      <div class="grid2">
        ${fTxt('pasto', 'Pasto predominante', a.x.pasto, 'dlPasto')}
        ${fSel('estado', 'Estado del potrero', lista('Estado_Potrero'), a.x.estado)}
        ${fNum('dias', 'Días de descanso', a.x.dias, '', 'placeholder="Si se sabe"')}
        ${fNum('ms', 'Materia seca', a.x.ms, '% MS', 'placeholder="Si se mide"')}
      </div>
      ${datalist('dlPot', lista('Potrero'))}${datalist('dlPasto', lista('Pasto'))}${datalist('dlArv', lista('Arvense'))}
    </div>

    <div class="card">
      <h3>Marcos pesados</h3>
      <p class="muted small">Agregue tantos marcos como lance (2, 3, 10…). Se promedian solo los que tienen peso.</p>
      <div class="mhead small muted"><span>N°</span><span>Peso verde (g)</span><span>Altura (cm)</span></div>
      <div id="muestras"></div>
      <button type="button" class="btn sec" id="addM">＋ Agregar marco</button>
    </div>

    <div class="card result" id="res"></div>

    <div class="card">${fotoWidget('foto', a.foto, 'Foto general del potrero')}
      <label class="fld"><span>Observaciones (arvenses predominantes, indicadores del suelo, otras)</span>
      <textarea name="obs" rows="3">${esc(a.x.obs)}</textarea></label></div>

    <div class="row gap sticky"><button class="btn">Guardar aforo</button>
      ${nuevo ? '' : '<button type="button" class="btn danger ghost" id="btnDel">Eliminar</button>'}</div>
  </form>`;
  const frm = $('#frm');
  const mRow = (m, i) => `<div class="muestra" data-id="${esc(m.id)}">
      <span class="n">#${i + 1}</span>
      <input name="peso" type="text" inputmode="decimal" placeholder="Peso (g)" value="${esc(m.peso)}" aria-label="Peso marco ${i + 1} en gramos">
      <input name="altura" type="text" inputmode="decimal" placeholder="Altura (cm)" value="${esc(m.altura ?? '')}" aria-label="Altura del pasto marco ${i + 1} en cm">
      <button type="button" class="btn ghost small" data-gps title="Ubicación de este marco">📍</button>
      <button type="button" class="btn ghost small danger" data-del aria-label="Quitar marco">✕</button>
      <input name="arvm" class="arvm" value="${esc(m.arvenses ?? '')}" placeholder="Arvenses en el marco (opcional)" list="dlArv" autocomplete="off">
      <span class="small muted coord" data-lat="${esc(m.lat ?? '')}" data-lng="${esc(m.lng ?? '')}">${m.lat != null && m.lat !== '' ? '✓ GPS' : ''}</span>
    </div>`;
  const renum = () => $$('.muestra', frm).forEach((el, i) => ($('.n', el).textContent = `#${i + 1}`));
  $('#muestras').innerHTML = a.muestras.map(mRow).join('');

  const recalcular = () => {
    const pesos = $$('[name=peso]', frm).map(i => i.value);
    const c = calcAforo(pesos, frm.metodo.value, frm.area.value);
    $('#res').innerHTML = `
      <div class="kpis">
        <div><span>Marcos válidos</span><b>${c.n}</b></div>
        <div><span>Promedio por marco</span><b>${fmt(c.prom, 1)} g</b></div>
        <div><span>Forraje verde</span><b>${fmt(c.kgHa, 0)} kg/ha</b></div>
        <div><span>Oferta total del potrero</span><b>${c.oferta !== '' ? fmt(c.oferta, 0) + ' kg' : '—'}</b></div>
      </div>
      ${num(frm.ms.value) !== '' && c.kgHa !== '' ? `<p class="small">Materia seca: <b>${fmt(c.kgHa * num(frm.ms.value) / 100, 0)} kg MS/ha</b>${c.oferta !== '' ? ` · ${fmt(c.oferta * num(frm.ms.value) / 100, 0)} kg MS en el potrero` : ''}</p>` : ''}
      ${c.oferta === '' && c.kgHa !== '' ? '<p class="muted small">Sin área del potrero: se reporta solo kg/ha.</p>' : ''}
      ${c.cv !== '' ? `<p class="muted small">Variabilidad entre marcos (CV): ${fmt(c.cv, 0)} %${c.cv > 40 ? ' — alta, conviene lanzar más marcos.' : ''}</p>` : ''}`;
  };
  recalcular();

  frm.addEventListener('input', e => {
    dirty = true;
    recalcular();
  });
  frm.addEventListener('click', async e => {
    const t = e.target;
    if (t.dataset.m2) { frm.metodo.value = t.dataset.m2; dirty = true; recalcular(); }
    if (t.dataset.del !== undefined && t.closest('.muestra')) { t.closest('.muestra').remove(); renum(); dirty = true; recalcular(); }
    if (t.dataset.gps !== undefined) {
      const sp = $('.coord', t.closest('.muestra'));
      sp.textContent = '…';
      try { const c = await leerGPS(); sp.dataset.lat = c.lat.toFixed(6); sp.dataset.lng = c.lng.toFixed(6); sp.textContent = `✓ ±${Math.round(c.acc)} m`; dirty = true; }
      catch (err) { sp.textContent = ''; toast(err.message, true); }
    }
  });
  $('#btnGpsC').onclick = async () => {
    const b = $('#btnGpsC'); b.disabled = true; b.textContent = 'Buscando señal…';
    try {
      const c = await leerGPS(c => ($('#gpsC').textContent = `${coordTxt(c.lat, c.lng)} · ±${Math.round(c.acc)} m (afinando…)`));
      frm.clat.value = c.lat.toFixed(6); frm.clng.value = c.lng.toFixed(6);
      a.x.lat = num(frm.clat.value); a.x.lng = num(frm.clng.value); a.x.acc = c.acc;
      $('#gpsC').textContent = `${coordTxt(c.lat, c.lng)} · ±${Math.round(c.acc)} m`; dirty = true;
    } catch (err) { toast(err.message, true); }
    b.disabled = false; b.textContent = '📍 Ubicación del centro del potrero';
  };
  $('#addM').onclick = () => {
    $('#muestras').insertAdjacentHTML('beforeend', mRow({ id: uid('D'), peso: '' }, $$('.muestra', frm).length));
    $$('[name=peso]', frm).pop().focus();
  };
  enlazarPotrero(frm, 'potrero', 'area', 'pasto');
  frm.potrero.addEventListener('change', recalcular);
  activarFotos(frm, a.jornadaId, () => `${a.id}_${(frm.potrero.value || 'SP').replace(/[^\w-]+/g, '')}`);
  pintarPrevias(frm);

  frm.onsubmit = async e => {
    e.preventDefault();
    a.potrero = frm.potrero.value.trim();
    a.area = num(frm.area.value);
    a.metodo = num(frm.metodo.value);
    a.foto = frm.foto.value;
    let clat = num(frm.clat.value), clng = num(frm.clng.value);
    if ((clat === '') !== (clng === '')) return toast('Complete latitud y longitud del centro', true);
    if (clng > 0 && clat > -5 && clat < 15 && confirm(`La longitud ${clng} es positiva (quedaría en Asia). ¿Cambiarla a -${clng} (Oeste)?`)) { clng = -clng; frm.clng.value = String(clng); }
    if (clat !== a.x.lat || clng !== a.x.lng) a.x.acc = '';
    a.x = { lat: clat, lng: clng, acc: a.x.acc, pasto: frm.pasto.value.trim(), estado: frm.estado.value, dias: num(frm.dias.value),
      ms: num(frm.ms.value), obs: frm.obs.value.trim() };
    if (a.x.ms !== '' && (a.x.ms <= 0 || a.x.ms > 100)) return toast('% de materia seca debe estar entre 0 y 100', true);
    if (!a.potrero) return toast('Indique el potrero', true);
    if (!(await confirmarPotrero(a.potrero))) return;
    if (!(a.metodo > 0)) return toast('Indique el tamaño del marco en m²', true);
    a.muestras = $$('.muestra', frm).map(el => {
      const c = $('.coord', el);
      return { id: el.dataset.id, peso: num($('[name=peso]', el).value), altura: num($('[name=altura]', el).value),
        arvenses: $('[name=arvm]', el).value.trim(), lat: num(c.dataset.lat), lng: num(c.dataset.lng) };
    }).filter(m => m.peso !== '');
    if (!a.muestras.length) return toast('Ingrese al menos un peso', true);
    if (a.muestras.some(m => m.peso < 0)) return toast('Hay pesos negativos', true);
    a.sync = 'pending'; a.updatedAt = Date.now();
    await DB.put('records', a);
    await DB.setKv('ultimoMetodo', a.metodo);
    dirty = false;
    toast('Aforo guardado');
    actualizarEstado();
    location.hash = `#/jornada/${encodeURIComponent(a.jornadaId)}`;
  };
  const del = $('#btnDel');
  if (del) del.onclick = async () => { if (confirm('¿Eliminar este aforo?')) { await eliminarRegistro(a); location.hash = `#/jornada/${encodeURIComponent(a.jornadaId)}`; } };
}

// ----- Ajustes -----
async function vistaAjustes() {
  setTitle('Ajustes', '#/');
  const s = await getSettings();
  const fotos = await DB.all('fotos');
  const liberables = fotos.filter(f => f.url && f.dataUrl).length;
  const cat = await DB.kv('catalogos', null);
  view().innerHTML = `
    <form id="frm" class="card">
      <label class="fld"><span>URL del Apps Script (termina en /exec)</span><input name="url" value="${esc(s.url)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
      <label class="fld"><span>Clave (token)</span><input name="token" value="${esc(s.token)}" autocomplete="off"></label>
      <div class="grid2">
        ${fNum('metaKgHa', 'Meta de forraje para el dashboard', s.metaKgHa, 'kg FV/ha')}
        ${fNum('phCritico', 'pH crítico (línea de referencia)', s.phCritico)}
      </div>
      <div class="row gap"><button class="btn">Guardar</button><button type="button" class="btn sec" id="probar">Probar conexión</button></div>
    </form>
    <div class="card">
      <h3>Catálogos (potreros, pastos, arvenses…)</h3>
      <p class="muted small">${cat ? `${cat.items.length} ítems descargados el ${new Date(cat.at).toLocaleString('es-CO')}.` : 'Aún no descargados.'}
       Se guardan en el teléfono para usarlos sin señal.</p>
      <button class="btn sec" id="cat">⟳ Actualizar catálogos</button>
    </div>
    <div class="card">
      <h3>Importar históricos (CSV)</h3>
      <p class="muted small">Archivos con los encabezados de las pestañas (punto decimal). Orden: <b>0_Jornadas</b> →
        <b>1_Puntos_Muestreo</b> → <b>3_Aforos_Cabecera</b> → <b>4_Aforos_Detalle</b>; después pulse ⟳ Sincronizar.
        Volver a importar el mismo archivo actualiza, no duplica.</p>
      <label class="btn sec">⤒ Elegir CSV<input type="file" accept=".csv,text/csv" hidden id="imp"></label>
    </div>
    <div class="card">
      <h3>Respaldo</h3>
      <p class="muted small">Descarga todo lo capturado en este teléfono (incluye fotos) en un archivo JSON.</p>
      <button class="btn sec" id="exp">⤓ Exportar respaldo</button>
      <p class="muted small">${liberables} fotos ya están en Drive y siguen ocupando espacio en el teléfono.</p>
      <button class="btn ghost" id="lib" ${liberables ? '' : 'disabled'}>Liberar espacio de fotos subidas</button>
    </div>
    <p class="muted small">Versión ${APP_VERSION}</p>`;
  const guardar = async () => {
    const fd = new FormData($('#frm'));
    await DB.setKv('settings', { url: String(fd.get('url')).trim(), token: String(fd.get('token')).trim(),
      metaKgHa: num(fd.get('metaKgHa')) || DEFAULT_SETTINGS.metaKgHa, phCritico: num(fd.get('phCritico')) || DEFAULT_SETTINGS.phCritico });
  };
  $('#frm').onsubmit = async e => { e.preventDefault(); await guardar(); toast('Ajustes guardados'); };
  $('#probar').onclick = async () => {
    await guardar();
    try { const r = await apiGet({ action: 'ping' }); toast(`Conectado a "${r.spreadsheet}"`); } catch (err) { toast(err.message, true); }
  };
  $('#cat').onclick = async () => { try { await bajarCatalogos(); toast('Catálogos actualizados'); vistaAjustes(); } catch (err) { toast(err.message, true); } };
  $('#imp').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { toast(await importarCSV(await file.text())); actualizarEstado(); } catch (err) { toast(err.message, true); }
  };
  $('#exp').onclick = async () => {
    const data = { app: 'agronomia-el-rosario', version: APP_VERSION, exportado: new Date().toISOString(),
      records: await DB.all('records'), fotos: await DB.all('fotos'), deletes: await DB.kv('deletes', []) };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `respaldo_agronomia_${ymd(new Date())}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  };
  $('#lib').onclick = async () => {
    if (!confirm('Las fotos ya subidas dejarán de verse sin internet en el teléfono (siguen en Drive). ¿Continuar?')) return;
    for (const f of fotos) if (f.url && f.dataUrl) { delete f.dataUrl; await DB.put('fotos', f); }
    toast('Espacio liberado'); vistaAjustes();
  };
}

/** CSV simple (RFC 4180): comas, comillas dobles y saltos de línea dentro de comillas. */
function parseCSV(txt) {
  const rows = []; let row = [], cell = '', q = false;
  txt = txt.replace(/^\uFEFF/, '');
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

async function importarCSV(txt) {
  const [head, ...data] = parseCSV(txt);
  if (!head) throw new Error('Archivo vacío');
  const H = head.map(h => h.trim());
  const objs = data.map(r => Object.fromEntries(H.map((h, i) => [h, (r[i] ?? '').trim()])));
  const ahora = Date.now();
  if (H[0] === 'ID_Jornada') {
    for (const o of objs) {
      await DB.put('records', { id: o.ID_Jornada, tipo: 'jornada', sync: 'pending', updatedAt: ahora,
        f: { Fecha: o.Fecha, Responsable: o.Responsable, Clima: o.Clima, Lluvia_24h: num(o.Lluvia_24h), Estado: o.Estado, Notas: o.Notas } });
    }
    return `${objs.length} jornadas importadas. Pulse ⟳ Sincronizar.`;
  }
  if (H[0] === 'ID_Punto') {
    const jornadas = new Set((await DB.all('records')).filter(r => r.tipo === 'jornada').map(r => r.id));
    const faltan = [...new Set(objs.map(o => o.ID_Jornada))].filter(j => !jornadas.has(j));
    if (faltan.length) throw new Error(`Primero importe las jornadas: ${faltan.join(', ')}`);
    let alertas = 0;
    for (const o of objs) {
      const [la, lo] = (o.Ubicacion || '').split(',').map(num);
      let lng = lo === undefined ? '' : lo;
      if (lng > 0 && la > -5 && la < 15) { lng = -lng; alertas++; } // longitud Oeste sin signo
      const f = {};
      for (const k of H) if (!['ID_Punto', 'ID_Jornada', 'Ubicacion', 'Foto_Suelo', 'Foto_Panoramica'].includes(k)) f[k] = NUMERICOS.has(k) ? num(o[k]) : o[k];
      await DB.put('records', { id: o.ID_Punto, tipo: 'punto', jornadaId: o.ID_Jornada, f, lat: la === undefined ? '' : la, lng, acc: num(o.Precision_GPS_m),
        fotoSuelo: '', fotoPano: '', arvenses: [], sync: 'pending', updatedAt: ahora });
    }
    return `${objs.length} puntos importados${alertas ? ` (${alertas} longitudes corregidas a Oeste)` : ''}. Pulse ⟳ Sincronizar.`;
  }
  if (H[0] === 'ID_Aforo') {
    const all = await DB.all('records');
    const jornadas = new Set(all.filter(r => r.tipo === 'jornada').map(r => r.id));
    const faltan = [...new Set(objs.map(o => o.ID_Jornada))].filter(j => !jornadas.has(j));
    if (faltan.length) throw new Error(`Primero importe las jornadas: ${faltan.join(', ')}`);
    for (const o of objs) {
      const prev = all.find(r => r.id === o.ID_Aforo);
      const [la, lo] = (o.Ubicacion || '').split(',').map(num);
      let lng = lo === undefined ? '' : lo;
      if (lng > 0 && la > -5 && la < 15) lng = -lng;
      await DB.put('records', { id: o.ID_Aforo, tipo: 'aforo', jornadaId: o.ID_Jornada, potrero: o.Potrero, area: num(o.Area_Ha),
        metodo: num(o.Metodo_M2) || 1, foto: '', muestras: prev ? prev.muestras : [],
        x: { lat: la === undefined ? '' : la, lng, acc: '', pasto: o.Pasto_Predominante || '', estado: o.Estado_Potrero || '',
          dias: num(o.Dias_Descanso), ms: num(o.MS_Porc), obs: o.Observaciones || '' },
        sync: 'pending', updatedAt: ahora });
    }
    return `${objs.length} aforos importados. Ahora importe sus marcos (4_Aforos_Detalle).`;
  }
  if (H[0] === 'ID_Detalle') {
    const porAforo = {};
    objs.forEach(o => (porAforo[o.ID_Aforo] = porAforo[o.ID_Aforo] || []).push(o));
    for (const [idA, filas] of Object.entries(porAforo)) {
      const a = await DB.get('records', idA);
      if (!a) throw new Error(`Primero importe el aforo ${idA}`);
      a.muestras = filas.map(o => {
        const [la, lo] = (o.LatLong_Muestra || '').split(',').map(num);
        return { id: o.ID_Detalle, peso: num(o.Peso_g), altura: num(o.Altura_cm), arvenses: o.Arvenses_Marco || '',
          lat: la === undefined ? '' : la, lng: lo === undefined ? '' : (lo > 0 && la > -5 && la < 15 ? -lo : lo) };
      }).filter(m => m.peso !== '');
      a.sync = 'pending'; a.updatedAt = ahora;
      await DB.put('records', a);
    }
    return `${objs.length} marcos importados en ${Object.keys(porAforo).length} aforos. Pulse ⟳ Sincronizar.`;
  }
  throw new Error('La primera columna debe ser ID_Jornada, ID_Punto, ID_Aforo o ID_Detalle');
}

async function bajarCatalogos() {
  const r = await apiGet({ action: 'catalogos' });
  CATALOGO = r.items || [];
  await DB.setKv('catalogos', { items: CATALOGO, at: Date.now() });
}

// ---------------- Sincronización ----------------
let sincronizando = false;
async function sincronizar() {
  if (sincronizando) return;
  if (!navigator.onLine) return toast('Sin conexión. Los datos quedan guardados en el teléfono.', true);
  sincronizando = true;
  const btn = $('#btnSync'); if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando…'; }
  try {
    // 1. Fotos -> Drive
    const fotos = await DB.all('fotos');
    const pendFotos = fotos.filter(f => !f.url && f.dataUrl);
    let i = 0;
    for (const f of pendFotos) {
      if (btn) btn.textContent = `Subiendo fotos ${++i}/${pendFotos.length}…`;
      const r = await apiPost({ action: 'foto', id: f.id, jornada: f.jornadaId, nombre: f.nombre, mime: 'image/jpeg', data: f.dataUrl.split(',')[1] });
      f.url = r.url;
      await DB.put('fotos', f);
    }
    const urlFoto = Object.fromEntries((await DB.all('fotos')).map(f => [f.id, f.url || '']));

    // 2. Borrados
    const deletes = await DB.kv('deletes', []);
    if (deletes.length) { await apiPost({ action: 'sync', deletes }); await DB.setKv('deletes', []); }

    // 3. Registros (jornadas primero), en lotes
    const all = await DB.all('records');
    const jornadas = Object.fromEntries(all.filter(r => r.tipo === 'jornada').map(r => [r.id, r]));
    const orden = { jornada: 0, punto: 1, aforo: 2 };
    const pend = all.filter(r => r.sync !== 'synced').sort((a, b) => orden[a.tipo] - orden[b.tipo]);
    for (let k = 0; k < pend.length; k += 25) {
      const lote = pend.slice(k, k + 25);
      if (btn) btn.textContent = `Enviando datos ${Math.min(k + 25, pend.length)}/${pend.length}…`;
      await apiPost(Object.assign({ action: 'sync' }, construirFilas(lote, jornadas, urlFoto)));
      for (const r of lote) {
        const actual = await DB.get('records', r.id);
        if (actual && actual.updatedAt === r.updatedAt) { actual.sync = 'synced'; actual.everSynced = true; await DB.put('records', actual); }
      }
    }
    await DB.setKv('ultimaSync', Date.now());
    try { await bajarCatalogos(); } catch (_) { /* los catálogos no son críticos */ }
    toast(pend.length || pendFotos.length || deletes.length ? 'Sincronización completa ✓' : 'No había nada pendiente');
  } catch (err) {
    toast('Error al sincronizar: ' + err.message + '. Los datos siguen guardados; reintente.', true);
  } finally {
    sincronizando = false;
    await actualizarEstado();
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Sincronizar'; }
    if (location.hash === '' || location.hash === '#/') vistaInicio();
  }
}

/** Convierte registros locales en filas con los nombres EXACTOS de las columnas de la hoja.
    Columnas extra (Fecha, Precision_GPS_m, N_Muestras, CV_Porc) solo se escriben si existen en la hoja. */
function construirFilas(lote, jornadas, urlFoto) {
  const out = { jornadas: [], puntos: [], arvenses: [], aforos: [], detalles: [] };
  for (const r of lote) {
    const fecha = jornadas[r.jornadaId] ? jornadas[r.jornadaId].f.Fecha : '';
    if (r.tipo === 'jornada') out.jornadas.push(Object.assign({ ID_Jornada: r.id }, r.f));
    if (r.tipo === 'punto') {
      out.puntos.push(Object.assign({ ID_Punto: r.id, ID_Jornada: r.jornadaId, Fecha: fecha, Ubicacion: coordTxt(r.lat, r.lng),
        Precision_GPS_m: r.acc !== '' && r.acc != null ? Math.round(r.acc) : '' }, r.f,
        { Foto_Suelo: urlFoto[r.fotoSuelo] || '', Foto_Panoramica: urlFoto[r.fotoPano] || '' }));
      for (const a of r.arvenses || [])
        out.arvenses.push({ ID_Arvense: a.id, ID_Punto: r.id, Nombre_Arvense: a.nombre, Cobertura_Porc: a.cobertura,
          Abundancia: a.abundancia, Foto_Arvense: urlFoto[a.foto] || '', Potrero: r.f.Potrero, Fecha: fecha });
    }
    if (r.tipo === 'aforo') {
      const c = calcAforo(r.muestras.map(m => m.peso), r.metodo, r.area);
      const x = r.x || {};
      out.aforos.push({ ID_Aforo: r.id, ID_Jornada: r.jornadaId, Fecha: fecha, Potrero: r.potrero, Area_Ha: r.area,
        Metodo_M2: r.metodo, Promedio_Peso_g: round(c.prom, 1), Kg_Ha_FV: round(c.kgHa, 0), Oferta_Total_Kg: round(c.oferta, 0),
        Foto_General: urlFoto[r.foto] || '', N_Muestras: c.n, CV_Porc: round(c.cv, 1),
        Ubicacion: coordTxt(x.lat, x.lng), Pasto_Predominante: x.pasto || '', Estado_Potrero: x.estado || '', Dias_Descanso: x.dias ?? '',
        MS_Porc: x.ms ?? '', Kg_MS_Ha: x.ms !== '' && x.ms != null && c.kgHa !== '' ? round(c.kgHa * x.ms / 100, 0) : '', Observaciones: x.obs || '' });
      for (const m of r.muestras)
        out.detalles.push({ ID_Detalle: m.id, ID_Aforo: r.id, Peso_g: m.peso, LatLong_Muestra: coordTxt(m.lat, m.lng), Potrero: r.potrero, Fecha: fecha,
          Altura_cm: m.altura ?? '', Arvenses_Marco: m.arvenses || '' });
    }
  }
  return out;
}

// ---------------- Router ----------------
async function router() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
  window.scrollTo(0, 0);
  try {
    if (parts[0] === 'jornada' && parts[1]) return await vistaJornada(parts[1]);
    if (parts[0] === 'punto' && parts[1]) return await vistaPunto(parts[1], parts[2]);
    if (parts[0] === 'aforo' && parts[1]) return await vistaAforo(parts[1], parts[2]);
    if (parts[0] === 'ajustes') return await vistaAjustes();
    if (parts[0] === 'rapido' && ['punto', 'aforo'].includes(parts[1])) return await rapido(parts[1]);
    return await vistaInicio();
  } catch (err) { view().innerHTML = `<p class="card">Error: ${esc(err.message)}</p>`; }
}

const APP_VERSION = '1.3.0';
(async function init() {
  await DB.open();
  const cat = await DB.kv('catalogos', null);
  CATALOGO = cat ? cat.items : [];
  window.addEventListener('hashchange', () => { dirty = false; router(); });
  window.addEventListener('online', () => { actualizarEstado(); sincronizar(); });
  window.addEventListener('offline', actualizarEstado);
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await actualizarEstado();
  router();
  const s = await getSettings();
  if (!s.url) toast('Configure la URL del Apps Script en Ajustes para poder sincronizar.');
  else if (navigator.onLine && !cat) bajarCatalogos().catch(() => {});
})();
