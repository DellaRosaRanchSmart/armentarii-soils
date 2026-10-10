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

const DEFAULT_SETTINGS = { url: '', token: '', metaKgHa: 15000, phCritico: 5.5 };
async function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, await DB.kv('settings', {})); }

// ---------------- API (Google Apps Script) ----------------
/* POST sin cabecera Content-Type => "simple request" (text/plain), así el navegador
   no hace preflight CORS, que Apps Script no soporta. */
async function apiPost(body) {
  const s = await getSettings();
  if (!s.url) throw new Error('Falta configurar la URL del Apps Script (Ajustes).');
  const res = await fetch(s.url, { method: 'POST', body: JSON.stringify(Object.assign({}, body, { token: s.token })) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Error del servidor');
  return j;
}

async function apiGet(params) {
  const s = await getSettings();
  if (!s.url) throw new Error('Falta configurar la URL del Apps Script (Ajustes).');
  const q = new URLSearchParams(Object.assign({}, params, { token: s.token }));
  const res = await fetch(`${s.url}${s.url.includes('?') ? '&' : '?'}${q}`);
  const j = await res.json();
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

const round = (v, d = 2) => (v === '' ? '' : Math.round(v * 10 ** d) / 10 ** d);
