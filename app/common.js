'use strict';
/* Código compartido entre la app de captura (index.html) y el dashboard (dashboard.html):
   almacenamiento local (IndexedDB), ajustes y llamadas al Apps Script. */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Convierte texto a número aceptando coma o punto decimal. Devuelve '' si está vacío o no es número. */
function num(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return isFinite(n) ? n : '';
}

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** ID legible y único sin servidor: PREFIJO-AAAAMMDD-XXXXXX */
function uid(prefix) {
  const rnd = (crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(36)).join('') : Math.random().toString(36).slice(2))
    .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0');
  return `${prefix}-${ymd(new Date()).replace(/-/g, '')}-${rnd}`;
}

function fmt(n, dec = 1) {
  if (n === '' || n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

// ---------------- IndexedDB ----------------
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve();
    return new Promise((res, rej) => {
      const r = indexedDB.open('agronomia_el_rosario', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('records', { keyPath: 'id' }); // jornadas, puntos, aforos
        db.createObjectStore('fotos', { keyPath: 'id' });
        db.createObjectStore('kv', { keyPath: 'k' });
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  _req(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },
  get(store, id) { return this._req(store, 'readonly', s => s.get(id)); },
  put(store, obj) { return this._req(store, 'readwrite', s => s.put(obj)); },
  del(store, id) { return this._req(store, 'readwrite', s => s.delete(id)); },
  all(store) { return this._req(store, 'readonly', s => s.getAll()); },
  async kv(k, def) { const r = await this.get('kv', k); return r ? r.v : def; },
  setKv(k, v) { return this.put('kv', { k, v }); },
};

// climaLat/climaLng: punto medio aproximado entre los sectores C4 y H2 (editable en Ajustes).
const DEFAULT_SETTINGS = { url: '', token: '', metaKgHa: 15000, phCritico: 5.5, climaLat: 8.69, climaLng: -75.89,
  // Pastoreo: 30 % de desperdicio y 3 días de referencia los definió la finca. Peso, consumo y lote los define el equipo técnico.
  despPorc: 30, periodoDias: 3, pesoKg: '', consumoPorc: '', baseConsumo: 'FV', msDefecto: '', loteAnimales: '', pesoTotal: '' };
async function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, await DB.kv('settings', {})); }

// ---------------- API (Google Apps Script) ----------------
/* POST sin cabecera Content-Type => "simple request" (text/plain), así el navegador
   no hace preflight CORS, que Apps Script no soporta. */
/** Apps Script a veces responde con una página HTML (error, inicio de sesión, permisos) en vez de JSON. */
async function leerRespuesta(res) {
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (_) { /* no es JSON */ }
  const doc = new DOMParser().parseFromString(txt, 'text/html');
  const titulo = (doc.title || '').trim();
  const cuerpo = (doc.body ? doc.body.innerText : txt).replace(/\s+/g, ' ').trim().slice(0, 160);
  throw new Error(`Google respondió con una página en vez de datos (HTTP ${res.status}${titulo ? ` · "${titulo}"` : ''}): ${cuerpo}`);
}

async function apiPost(body) {
  const s = await getSettings();
  if (!s.url) throw new Error('Falta configurar la URL del Apps Script (Ajustes).');
  const res = await fetch(s.url, { method: 'POST', body: JSON.stringify(Object.assign({}, body, { token: s.token })) });
  const j = await leerRespuesta(res);
  if (!j.ok) throw new Error(j.error || 'Error del servidor');
  return j;
}

async function apiGet(params) {
  const s = await getSettings();
  if (!s.url) throw new Error('Falta configurar la URL del Apps Script (Ajustes).');
  const q = new URLSearchParams(Object.assign({}, params, { token: s.token }));
  const res = await fetch(`${s.url}${s.url.includes('?') ? '&' : '?'}${q}`);
  const j = await leerRespuesta(res);
  if (!j.ok) throw new Error(j.error || 'Error del servidor');
  return j;
}

// ---------------- Cálculo de aforo ----------------
/** promedio g/marco -> kg/ha forraje verde: (g / m²) × 10 000 m²/ha ÷ 1000 g/kg = g/m² × 10 */
function calcAforo(pesos, metodoM2, areaHa) {
  const v = pesos.map(num).filter(p => p !== '' && p >= 0);
  const n = v.length;
  const prom = n ? v.reduce((a, b) => a + b, 0) / n : '';
  const m2 = num(metodoM2);
  const kgHa = prom !== '' && m2 > 0 ? (prom / m2) * 10 : '';
  const area = num(areaHa);
  const oferta = kgHa !== '' && area > 0 ? kgHa * area : '';
  let cv = '';
  if (n > 1 && prom > 0) {
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - prom) ** 2, 0) / (n - 1));
    cv = (sd / prom) * 100;
  }
  return { n, prom, kgHa, oferta, cv };
}

// ---------------- Pastoreo: capacidad de carga y días ----------------
const PARAM_HOJA = { desperdicio_porc: 'despPorc', periodo_dias: 'periodoDias', peso_kg: 'pesoKg', consumo_porc_pv: 'consumoPorc',
  base_consumo: 'baseConsumo', ms_porc_defecto: 'msDefecto', animales_lote: 'loteAnimales', peso_total_lote_kg: 'pesoTotal' };
/** Parámetros de pastoreo: los de Ajustes de este dispositivo, reemplazados por los de 5_Catalogos
    (Categoria = Parametro_Pastoreo) para que todos los dispositivos calculen igual. */
async function paramsPastoreo() {
  const s = await getSettings();
  const P = { despPorc: s.despPorc, periodoDias: s.periodoDias, pesoKg: s.pesoKg, consumoPorc: s.consumoPorc,
    baseConsumo: s.baseConsumo, msDefecto: s.msDefecto, loteAnimales: s.loteAnimales, pesoTotal: s.pesoTotal, fuente: 'Ajustes' };
  const cat = await DB.kv('catalogos', null);
  (cat ? cat.items : []).filter(c => String(c.Categoria || '').toLowerCase().replace(/[\s_]/g, '') === 'parametropastoreo').forEach(c => {
    const k = PARAM_HOJA[String(c.Nombre_Item || '').trim().toLowerCase()];
    if (!k) return;
    const v = String(c.Descripcion_Cientifica ?? '').trim();
    P[k] = k === 'baseConsumo' ? (/^ms|seca/i.test(v) ? 'MS' : 'FV') : num(v);
    P.fuente = '5_Catalogos';
  });
  ['despPorc', 'periodoDias', 'pesoKg', 'consumoPorc', 'msDefecto', 'loteAnimales', 'pesoTotal'].forEach(k => (P[k] = num(P[k])));
  return P;
}

/** cantidadFV: kg de forraje verde (oferta del potrero, o kg/ha para el cálculo por hectárea).
    lote: { animales, pesoTotal } del aforo; si faltan se usan los de Ajustes / 5_Catalogos.
    Base FV: consumo en % del peso vivo como forraje verde. Base MS: la oferta se pasa a materia seca con el % MS.
    aprovechable = cantidad × (1 − desperdicio)
    capacidad (kg de peso vivo por N días) = aprovechable ÷ (consumo% × N); en animales = ÷ peso promedio
    días de pastoreo = aprovechable ÷ (peso total del lote × consumo%) */
function calcPastoreo(cantidadFV, msPorc, P, lote = {}) {
  const falta = [];
  if (!(P.consumoPorc > 0)) falta.push('consumo (% del peso vivo)');
  const ms = num(msPorc) !== '' ? num(msPorc) : P.msDefecto;
  if (P.baseConsumo === 'MS' && !(ms > 0)) falta.push('% de materia seca');
  if (cantidadFV === '' || cantidadFV == null || falta.length) return { listo: false, falta };
  const base = P.baseConsumo === 'MS' ? cantidadFV * ms / 100 : cantidadFV;
  const aprovechable = base * (1 - (P.despPorc || 0) / 100);
  const periodo = P.periodoDias > 0 ? P.periodoDias : 3;
  const cons = P.consumoPorc / 100;
  // Peso del lote: lo del aforo primero; si no, lo de Ajustes. Animales × peso promedio cuando no hay peso total.
  const an = num(lote.animales), pt = num(lote.pesoTotal);
  let pesoTotal = pt > 0 ? pt : (an > 0 && P.pesoKg > 0 ? an * P.pesoKg : '');
  let animales = an > 0 ? an : '';
  if (pesoTotal === '' && !(an > 0)) {
    pesoTotal = P.pesoTotal > 0 ? P.pesoTotal : (P.loteAnimales > 0 && P.pesoKg > 0 ? P.loteAnimales * P.pesoKg : '');
    animales = P.loteAnimales > 0 ? P.loteAnimales : '';
  }
  if (animales === '' && pesoTotal !== '' && P.pesoKg > 0) animales = pesoTotal / P.pesoKg;
  const capKgPV = aprovechable / (cons * periodo);
  return { listo: true, unidad: P.baseConsumo === 'MS' ? 'kg MS' : 'kg FV', aprovechable, periodo, capKgPV,
    capAnimales: P.pesoKg > 0 ? capKgPV / P.pesoKg : '', demandaAnimal: P.pesoKg > 0 ? P.pesoKg * cons : '',
    pesoTotal, animales, demandaLote: pesoTotal !== '' ? pesoTotal * cons : '', dias: pesoTotal !== '' ? aprovechable / (pesoTotal * cons) : '' };
}
/** "22 animales" si hay peso promedio; si no, "8.800 kg PV". */
function textoCapacidad(r, porHa) {
  if (!r || !r.listo) return '—';
  return r.capAnimales !== '' ? `${fmt(Math.floor(r.capAnimales), 0)} animales${porHa ? '/ha' : ''}` : `${fmt(r.capKgPV, 0)} kg PV${porHa ? '/ha' : ''}`;
}
function textoLote(r) {
  if (!r.pesoTotal) return '';
  return r.animales !== '' && r.animales ? `${fmt(r.animales, 0)} animales (${fmt(r.pesoTotal, 0)} kg PV)` : `${fmt(r.pesoTotal, 0)} kg PV`;
}

const round = (v, d = 2) => (v === '' ? '' : Math.round(v * 10 ** d) / 10 ** d);
