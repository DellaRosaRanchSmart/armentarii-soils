'use strict';
/* Dashboard: lee las pestañas de Sistema_Agronomia_Digital a través del Apps Script
   (acción "data") y guarda la última copia para poder verla sin señal. */

const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const C = () => dark()
  ? { s1: '#3987e5', s2: '#d95926', ink: '#c3c2b7', grid: '#2c2c2a', axis: '#383835', other: '#6b6a64', surface: '#1a1a19' }
  : { s1: '#2a78d6', s2: '#eb6834', ink: '#52514e', grid: '#e1e0d9', axis: '#c3c2b7', other: '#b4b2a9', surface: '#fcfcfb' };
// Paleta categórica validada (orden fijo, nunca se recicla); la 8ª posición se reserva para "Otras".
const CAT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const CAT_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];

let DATA = null, S = null, map = null, capa = null;
const charts = {};

// ---------- Utilidades ----------
const avg = a => { const v = a.map(num).filter(x => x !== ''); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : ''; };
const sum = a => a.map(num).filter(x => x !== '').reduce((p, c) => p + c, 0);
const groupBy = (arr, k, fb = 'Sin potrero') => arr.reduce((m, r) => { const key = String(r[k] || fb); (m[key] = m[key] || []).push(r); return m; }, {});
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = 'toast'), 4000);
}
function parseLatLng(s) {
  const m = String(s || '').split(',').map(x => parseFloat(x));
  return m.length === 2 && isFinite(m[0]) && isFinite(m[1]) ? m : null;
}
function tabla(cols, rows) {
  if (!rows.length) return '<p class="muted">Sin datos para el filtro.</p>';
  return `<table><thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.map(r =>
    `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/** Línea de referencia horizontal o vertical (p. ej. pH 5,5 o la meta de kg/ha). */
const refLine = {
  id: 'refLine',
  afterDatasetsDraw(chart, _a, o) {
    if (o == null || o.value == null || o.value === '') return;
    const { ctx, chartArea: ar } = chart;
    const scale = chart.scales[o.axis || 'y'];
    const p = scale.getPixelForValue(o.value);
    ctx.save(); ctx.strokeStyle = o.color; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.beginPath();
    if ((o.axis || 'y') === 'y') { ctx.moveTo(ar.left, p); ctx.lineTo(ar.right, p); } else { ctx.moveTo(p, ar.top); ctx.lineTo(p, ar.bottom); }
    ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = o.color; ctx.font = '12px system-ui';
    if ((o.axis || 'y') === 'y') ctx.fillText(o.label, ar.left + 4, p - 5); else ctx.fillText(o.label, p + 4, ar.top + 12);
    ctx.restore();
  },
};

function draw(id, cfg) {
  if (charts[id]) charts[id].destroy();
  const c = C();
  Chart.defaults.color = c.ink;
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.borderColor = c.grid;
  charts[id] = new Chart(document.getElementById(id), Object.assign({ plugins: [refLine] }, cfg));
}

// ---------- Bandas de pH (colores de estado + etiqueta, nunca solo color) ----------
function bandasPh() {
  const crit = S.phCritico;
  return [
    { max: 5.0, label: 'Muy ácido (< 5,0)', color: '#d03b3b' },
    { max: crit, label: `Ácido (5,0 – ${fmt(crit, 1)})`, color: '#ec835a' },
    { max: 7.0, label: `Adecuado (${fmt(crit, 1)} – 7,0)`, color: '#0ca30c' },
    { max: Infinity, label: 'Alcalino (> 7,0)', color: '#2a78d6' },
  ];
}
const bandaPh = ph => bandasPh().find(b => ph < b.max);

// ---------- Datos ----------
/** Aviso visible: qué llegó de la hoja y qué falta por sincronizar en este dispositivo. */
async function pintarEstado(error) {
  const recs = await DB.all('records');
  const pend = recs.filter(r => r.sync !== 'synced');
  const n = k => (DATA && DATA[k] ? DATA[k].length : 0);
  const partes = [];
  if (error) partes.push(`<b>⚠️ No se pudo leer la hoja:</b> ${esc(error)}. Revise en Ajustes la URL y la clave, y pulse "Probar conexión".`);
  if (DATA) partes.push(`La hoja tiene <b>${n('jornadas')}</b> jornadas, <b>${n('puntos')}</b> puntos de suelo, <b>${n('aforos')}</b> aforos y <b>${n('detalles')}</b> marcos.`);
  if (pend.length) partes.push(`<b>📱 Hay ${pend.length} registro(s) en este dispositivo sin sincronizar</b> (no se ven en el dashboard hasta que lleguen a la hoja). <a href="index.html">Ir a ⟳ Sincronizar</a>.`);
  else if (DATA && !n('jornadas') && !n('puntos') && !n('aforos')) partes.push('La hoja todavía está vacía.');
  const el = $('#estado');
  el.innerHTML = partes.join('<br>');
  el.className = 'card small' + (error || pend.length ? ' aviso' : '');
}

async function cargar(forzar) {
  $('#fuente').textContent = 'Cargando…';
  const cache = await DB.kv('dashData', null);
  if (cache && !forzar) { DATA = cache.data; $('#fuente').textContent = `Copia del ${new Date(cache.at).toLocaleString('es-CO')}`; llenarFiltros(); render(); }
  try {
    const r = await apiGet({ action: 'data' });
    DATA = r;
    await DB.setKv('dashData', { data: r, at: Date.now() });
    $('#fuente').textContent = `Datos de Google Sheets · ${new Date().toLocaleString('es-CO')}`;
    try { const cat = await apiGet({ action: 'catalogos' }); await DB.setKv('catalogos', { items: cat.items || [], at: Date.now() }); aplicarRangos(cat.items); PP = await paramsPastoreo(); } catch (_) { /* rangos por defecto */ }
    llenarFiltros(); render(); pintarEstado();
  } catch (err) {
    if (!DATA) $('#fuente').textContent = 'Sin datos';
    else $('#fuente').textContent += ' (sin conexión)';
    pintarEstado(err.message);
  }
}

function llenarFiltros() {
  const jor = DATA.jornadas.slice().sort((a, b) => String(b.Fecha).localeCompare(String(a.Fecha)));
  const pots = [...new Set([...DATA.puntos, ...DATA.aforos].map(r => r.Potrero).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const sj = $('#fJornada').value, sp = $('#fPotrero').value;
  $('#fJornada').innerHTML = '<option value="">Todas</option>' + jor.map(j => `<option value="${esc(j.ID_Jornada)}">${esc(j.Fecha)} · ${esc(j.Responsable)}</option>`).join('');
  $('#fPotrero').innerHTML = '<option value="">Todos</option>' + pots.map(p => `<option>${esc(p)}</option>`).join('');
  $('#fJornada').value = sj; $('#fPotrero').value = sp;
}

function filtrado() {
  const fj = $('#fJornada').value, fp = $('#fPotrero').value, d1 = $('#fDesde').value, d2 = $('#fHasta').value;
  const fecha = {};
  DATA.jornadas.forEach(j => (fecha[j.ID_Jornada] = String(j.Fecha || '')));
  const ok = r => (!fj || r.ID_Jornada === fj) && (!fp || String(r.Potrero) === fp)
    && (!d1 || (fecha[r.ID_Jornada] || '') >= d1) && (!d2 || (fecha[r.ID_Jornada] || '') <= d2);
  const puntos = DATA.puntos.filter(ok).map(p => Object.assign({ _fecha: fecha[p.ID_Jornada] || '' }, p));
  const idsP = new Set(puntos.map(p => p.ID_Punto));
  const potDe = Object.fromEntries(puntos.map(p => [p.ID_Punto, p.Potrero]));
  const arvenses = DATA.arvenses.filter(a => idsP.has(a.ID_Punto)).map(a => Object.assign({ _potrero: potDe[a.ID_Punto] }, a));
  const aforos = DATA.aforos.filter(ok).map(a => Object.assign({ _fecha: fecha[a.ID_Jornada] || '' }, a));
  const idsA = new Set(aforos.map(a => a.ID_Aforo));
  const detalles = DATA.detalles.filter(d => idsA.has(d.ID_Aforo));
  return { puntos, arvenses, aforos, detalles };
}

// ---------- Render ----------
let tabActual = 'suelos';
// ---------- Diagnóstico de nutrientes ----------
let RANGOS = RANGOS_SUELO.map(r => r.slice());
const ESTADOS = {
  bajo: { label: 'Bajo', icon: '↓', color: '#d03b3b' },
  ok: { label: 'Adecuado', icon: '✓', color: '#0ca30c' },
  alto: { label: 'Alto', icon: '↑', color: '#fab219' },
  sinrango: { label: 'Sin rango', icon: '·', color: '#898781' },
};
/** "1.5-3" → [1.5, 3]; ">0.75" → [0.75, null]; "<2000" → [null, 2000] */
function parseRango(txt) {
  const t = String(txt || '').trim().replace(/\s/g, '');
  if (!t) return null;
  if (t[0] === '>') return [num(t.slice(1)), null];
  if (t[0] === '<') return [null, num(t.slice(1))];
  const m = t.split(/[;–]|-(?=\d)/);
  if (m.length === 2 && num(m[0]) !== '' && num(m[1]) !== '') return [num(m[0]), num(m[1])];
  return null;
}
/** Filas Categoria=Rango_Suelo de 5_Catalogos reemplazan los rangos por defecto. */
function aplicarRangos(items) {
  RANGOS = RANGOS_SUELO.map(r => r.slice());
  (items || []).filter(c => String(c.Categoria || '').toLowerCase().replace(/[\s_]/g, '') === 'rangosuelo').forEach(c => {
    const r = RANGOS.find(x => x[0].toLowerCase() === String(c.Nombre_Item || '').trim().toLowerCase());
    const v = parseRango(c.Descripcion_Cientifica);
    if (r && v) { r[4] = v[0] === '' ? null : v[0]; r[5] = v[1] === '' ? null : v[1]; r[6] = '5_Catalogos'; }
  });
}
function estadoDe(v, r) {
  if (v === '' || v == null) return null;
  if (r[4] == null && r[5] == null) return 'sinrango';
  if (r[4] != null && v < r[4]) return 'bajo';
  if (r[5] != null && v > r[5]) return 'alto';
  return 'ok';
}
function textoRango(r) {
  if (r[4] != null && r[5] != null) return `${fmt(r[4], 2)} – ${fmt(r[5], 2)}`;
  if (r[4] != null) return `> ${fmt(r[4], 2)}`;
  if (r[5] != null) return `< ${fmt(r[5], 2)}`;
  return '—';
}
const chip = (st, txt) => st ? `<span class="st st-${st}">${ESTADOS[st].icon} ${txt}</span>` : '<span class="muted">—</span>';

function renderDiagnostico(d) {
  const c = C(), P = d.puntos;
  const conRango = RANGOS.filter(r => r[4] != null || r[5] != null);
  const filas = RANGOS.map(r => {
    const vals = P.map(p => num(p[r[0]])).filter(v => v !== '');
    const cuenta = { bajo: 0, ok: 0, alto: 0 };
    vals.forEach(v => { const e = estadoDe(v, r); if (cuenta[e] !== undefined) cuenta[e]++; });
    const prom = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : '';
    return { r, n: vals.length, prom, min: vals.length ? Math.min(...vals) : '', max: vals.length ? Math.max(...vals) : '', cuenta, est: estadoDe(prom, r) };
  });
  const evaluadas = filas.filter(f => f.est && f.est !== 'sinrango');
  const lecturas = evaluadas.reduce((a, f) => a + f.cuenta.bajo + f.cuenta.ok + f.cuenta.alto, 0);
  const fuera = evaluadas.reduce((a, f) => a + f.cuenta.bajo + f.cuenta.alto, 0);
  const promFuera = evaluadas.filter(f => f.est !== 'ok');
  tiles('#tilesDiag', [
    ['Puntos analizados', P.filter(p => num(p.pH) !== '' || num(p.P_ppm) !== '').length, `de ${P.length} en el filtro`],
    ['Parámetros con rango', `${conRango.length} / ${RANGOS.length}`, conRango.length < RANGOS.length ? `${RANGOS.length - conRango.length} sin rango definido` : ''],
    ['Lecturas fuera de rango', lecturas ? `${fmt((fuera / lecturas) * 100, 0)} %` : '—', `${fuera} de ${lecturas} lecturas`],
    ['Promedios fuera de rango', promFuera.length, promFuera.map(f => `${f.r[1].split(' (')[0]} ${ESTADOS[f.est].icon}`).join(' · ')],
  ]);

  // Barras apiladas: % de puntos bajo / adecuado / alto por parámetro (solo parámetros con rango y datos)
  const g = filas.filter(f => f.n && (f.r[4] != null || f.r[5] != null));
  $('#boxDiag').style.height = `${Math.max(160, g.length * 38 + 60)}px`;
  $('#legDiag').innerHTML = ['bajo', 'ok', 'alto'].map(k => `<span><i style="background:${ESTADOS[k].color};border-radius:3px"></i>${ESTADOS[k].icon} ${ESTADOS[k].label}</span>`).join('');
  const pct = (f, k) => (f.n ? Math.round((f.cuenta[k] / f.n) * 1000) / 10 : 0);
  draw('cDiag', {
    type: 'bar',
    data: {
      labels: g.map(f => f.r[1]),
      datasets: ['bajo', 'ok', 'alto'].map(k => ({ label: `${ESTADOS[k].icon} ${ESTADOS[k].label}`, data: g.map(f => pct(f, k)),
        backgroundColor: ESTADOS[k].color, borderColor: c.surface, borderWidth: { left: 1, right: 1 }, maxBarThickness: 24 })),
    },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: x => `${x.dataset.label}: ${g[x.dataIndex].cuenta[['bajo', 'ok', 'alto'][x.datasetIndex]]} de ${g[x.dataIndex].n} puntos (${fmt(x.raw, 0)} %)` } } },
      scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + ' %' }, grid: { color: c.grid } }, y: { stacked: true, grid: { display: false } } } },
  });

  // Semáforo
  let grupo = '';
  $('#tDiag').innerHTML = !P.length ? '<p class="muted">Sin datos para el filtro.</p>' : `<table><thead><tr>
      <th>Parámetro</th><th>Rango ref.</th><th>Promedio</th><th>Mín – Máx</th><th>↓ Bajo</th><th>✓ Adec.</th><th>↑ Alto</th><th>Estado del promedio</th><th>Fuente</th>
    </tr></thead><tbody>${filas.map(f => {
      const cab = f.r[2] !== grupo ? `<tr class="grp"><td colspan="9">${esc(grupo = f.r[2])}</td></tr>` : '';
      const u = f.r[3] ? ` ${esc(f.r[3])}` : '';
      return cab + `<tr><td>${esc(f.r[1])}</td><td>${textoRango(f.r)}${f.r[4] != null || f.r[5] != null ? u : ''}</td>
        <td>${fmt(f.prom, 2)}${f.prom !== '' ? u : ''}</td><td>${f.n ? `${fmt(f.min, 2)} – ${fmt(f.max, 2)}` : '—'}</td>
        <td>${f.n && f.est !== 'sinrango' ? f.cuenta.bajo : '—'}</td><td>${f.n && f.est !== 'sinrango' ? f.cuenta.ok : '—'}</td><td>${f.n && f.est !== 'sinrango' ? f.cuenta.alto : '—'}</td>
        <td>${f.n ? chip(f.est, ESTADOS[f.est].label) : '<span class="muted">Sin lecturas</span>'}</td><td class="muted">${esc(f.r[6] || '—')}</td></tr>`;
    }).join('')}</tbody></table>`;

  // Matriz potrero × parámetro
  const pots = Object.entries(groupBy(P, 'Potrero')).sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
  $('#tMatriz').innerHTML = !pots.length ? '<p class="muted">Sin datos para el filtro.</p>' : `<table><thead><tr><th>Potrero</th>${RANGOS.map(r =>
      `<th class="vert" title="${esc(r[1])}">${esc(r[0].replace('_ppm', '').replace('_porc', ''))}</th>`).join('')}</tr></thead><tbody>${pots.map(([pot, ps]) =>
      `<tr><td>${esc(pot)} <span class="muted small">(${ps.length})</span></td>${RANGOS.map(r => {
        const v = avg(ps.map(p => p[r[0]]));
        return `<td class="cell">${v === '' ? '<span class="muted">—</span>' : chip(estadoDe(v, r), fmt(v, Math.abs(v) < 1 ? 2 : 1))}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;

  const sin = RANGOS.filter(r => r[4] == null && r[5] == null).map(r => r[1]);
  $('#notaRangos').innerHTML = `<b>Rangos de referencia.</b> Por defecto se usan los rangos óptimos que imprime el sensor SOILO para "Pasture Grass".
    ${sin.length ? `Sin rango definido (SOILO no los publica): ${esc(sin.join(', '))}.` : ''}
    Para definirlos o cambiarlos, agregue en <b>5_Catalogos</b> filas con <i>Categoria</i> = <code>Rango_Suelo</code>,
    <i>Nombre_Item</i> = la columna (p. ej. <code>Zn_ppm</code>) y <i>Descripcion_Cientifica</i> = <code>mín-máx</code>
    (p. ej. <code>1.5-3</code>, <code>&gt;0.75</code> o <code>&lt;2000</code>). Valide los rangos con el agrónomo o el laboratorio.`;
}

function render() {
  if (!DATA) return;
  const d = filtrado();
  if (tabActual === 'suelos') renderSuelos(d);
  if (tabActual === 'diagnostico') renderDiagnostico(d);
  if (tabActual === 'forrajes') renderForrajes(d);
  if (tabActual === 'botanica') renderBotanica(d);
}

function tiles(el, items) {
  $(el).innerHTML = items.map(([l, v, sub]) => `<div class="tile"><span>${esc(l)}</span><b>${v}</b>${sub ? `<br><small>${esc(sub)}</small>` : ''}</div>`).join('');
}

function renderSuelos(d) {
  const c = C(), P = d.puntos;
  const conLab = P.filter(p => num(p.pH) !== '');
  const bajoCrit = conLab.filter(p => num(p.pH) < S.phCritico).length;
  tiles('#tilesSuelo', [
    ['Puntos muestreados', P.length, `${conLab.length} con análisis de laboratorio`],
    ['pH promedio', fmt(avg(P.map(p => p.pH)), 2), conLab.length ? `${bajoCrit} puntos bajo ${fmt(S.phCritico, 1)}` : ''],
    ['Fósforo (P) promedio', fmt(avg(P.map(p => p.P_ppm)), 1), 'ppm'],
    ['Potasio (K) promedio', fmt(avg(P.map(p => p.K_ppm)), 1), 'ppm'],
    ['Materia orgánica', fmt(avg(P.map(p => p.MO_porc)), 1), '% promedio'],
  ]);

  // Mapa
  if (!map) {
    map = L.map('map', { scrollWheelZoom: false });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes © Esri' });
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    sat.addTo(map);
    L.control.layers({ 'Satélite': sat, 'Mapa': osm }).addTo(map);
    map.setView([4.6, -74.1], 6);
  }
  if (capa) capa.remove();
  capa = L.featureGroup().addTo(map);
  P.forEach(p => {
    const ll = parseLatLng(p.Ubicacion);
    if (!ll) return;
    const ph = num(p.pH), b = ph !== '' ? bandaPh(ph) : null;
    L.circleMarker(ll, { radius: 8, weight: 2, color: c.surface, fillColor: b ? b.color : '#898781', fillOpacity: 0.95 })
      .bindPopup(`<b>${esc(p.Potrero || 'Sin potrero')}</b><br>${esc(p._fecha)} ${esc(p.Hora || '')}<br>
        pH: ${ph !== '' ? fmt(ph, 2) + ' · ' + esc(b.label) : 'sin dato'}<br>P: ${fmt(num(p.P_ppm))} ppm · K: ${fmt(num(p.K_ppm))} ppm
        <br>MO: ${fmt(num(p.MO_porc))} %${p.Foto_Suelo ? `<br><a href="${esc(p.Foto_Suelo)}" target="_blank" rel="noopener">Foto del suelo</a>` : ''}`)
      .addTo(capa);
  });
  if (capa.getLayers().length) map.fitBounds(capa.getBounds().pad(0.2), { maxZoom: 17 });
  setTimeout(() => map.invalidateSize(), 50);
  $('#phLegend').innerHTML = bandasPh().map(b => `<span><i style="background:${b.color}"></i>${esc(b.label)}</span>`).join('')
    + '<span><i style="background:#898781"></i>Sin análisis</span>';

  // pH por potrero
  const g = Object.entries(groupBy(conLab, 'Potrero')).map(([k, v]) => [k, avg(v.map(p => p.pH))]).sort((a, b) => a[1] - b[1]);
  draw('cPh', {
    type: 'bar',
    data: { labels: g.map(x => x[0]), datasets: [{ label: 'pH promedio', data: g.map(x => round(x[1], 2)), backgroundColor: c.s1, borderRadius: 4, maxBarThickness: 28 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
      refLine: { axis: 'x', value: S.phCritico, color: '#d03b3b', label: `pH ${fmt(S.phCritico, 1)}` } },
      scales: { x: { min: Math.min(4, ...g.map(x => Math.floor(x[1]))), max: Math.max(8, ...g.map(x => Math.ceil(x[1]))), grid: { color: c.grid } }, y: { grid: { display: false } } } },
  });

  // MO vs N
  const pts = P.filter(p => num(p.MO_porc) !== '' && num(p.N_ppm) !== '').map(p => ({ x: num(p.MO_porc), y: num(p.N_ppm), pot: p.Potrero }));
  draw('cMoN', {
    type: 'scatter',
    data: { datasets: [{ label: 'Puntos', data: pts, backgroundColor: c.s1, borderColor: c.surface, borderWidth: 2, pointRadius: 6, pointHoverRadius: 8 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: x => `${x.raw.pot || ''}: MO ${fmt(x.raw.x)} % · N ${fmt(x.raw.y)} ppm` } } },
      scales: { x: { title: { display: true, text: 'Materia orgánica (%)' }, grid: { color: c.grid } }, y: { title: { display: true, text: 'N (ppm)' }, grid: { color: c.grid } } } },
  });

  // Tabla de nutrientes
  const cols = ['pH', 'N_ppm', 'P_ppm', 'K_ppm', 'Ca_ppm', 'Mg_ppm', 'S_ppm', 'B_ppm', 'Cu_ppm', 'Fe_ppm', 'Mn_ppm', 'Mo_ppm', 'Zn_ppm', 'MO_porc', 'Salinidad'];
  const filas = Object.entries(groupBy(P, 'Potrero')).sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }));
  $('#tNutr').innerHTML = tabla([['Potrero', r => esc(r[0])], ['Puntos', r => r[1].length],
    ...cols.map(k => [k.replace('_ppm', '').replace('_porc', ' %'), r => fmt(avg(r[1].map(p => p[k])), 2)])], filas);
}

function ultimoPorPotrero(aforos) {
  const m = {};
  aforos.forEach(a => {
    const k = String(a.Potrero || 'Sin potrero');
    if (!m[k] || String(a._fecha) > String(m[k]._fecha)) m[k] = a;
  });
  return Object.values(m);
}

let PP = null; // parámetros de pastoreo
function renderForrajes(d) {
  const c = C(), ult = ultimoPorPotrero(d.aforos);
  const prom = avg(ult.map(a => a.Kg_Ha_FV));
  const conArea = ult.filter(a => num(a.Oferta_Total_Kg) !== '');
  ult.forEach(a => (a._r = PP ? calcPastoreo(num(a.Oferta_Total_Kg), a.MS_Porc, PP, { animales: a.Animales_Lote, pesoTotal: a.Peso_Total_Lote_Kg }) : { listo: false, falta: [] }));
  const listos = ult.filter(a => a._r.listo);
  const periodo = PP && PP.periodoDias > 0 ? PP.periodoDias : 3;
  tiles('#tilesForraje', [
    ['Potreros aforados', ult.length, `${d.aforos.length} aforos en el periodo`],
    ['Forraje verde promedio', fmt(prom, 0), 'kg FV/ha'],
    ['Oferta total disponible', fmt(sum(conArea.map(a => a.Oferta_Total_Kg)), 0), `kg FV · ${conArea.length} potreros con área`],
    ['Capacidad de referencia', listos.length ? fmt(listos.reduce((t, a) => t + (PP.pesoKg > 0 ? Math.floor(a._r.capAnimales) : a._r.capKgPV), 0), 0) : '—',
      listos.length ? `${PP.pesoKg > 0 ? 'animales' : 'kg de peso vivo'} × ${fmt(periodo, 0)} días · ${fmt(PP.despPorc, 0)} % desperdicio` : 'faltan parámetros de pastoreo'],
    ['Potreros sin área', ult.length - conArea.length, 'no se calcula capacidad'],
  ]);

  // Capacidad de carga (animales que pueden entrar durante el período de referencia)
  const enAn = PP && PP.pesoKg > 0;
  const capVal = r => (enAn ? Math.floor(r.capAnimales) : Math.round(r.capKgPV));
  const cap = listos.slice().sort((a, b) => b._r.capKgPV - a._r.capKgPV);
  $('#tCap').textContent = `Capacidad de carga: ${enAn ? 'animales' : 'kg de peso vivo'} por ${fmt(periodo, 0)} días (último aforo)`;
  const faltan = ult.find(a => !a._r.listo && a._r.falta && a._r.falta.length);
  $('#notaCap').innerHTML = !cap.length ? (faltan ? `Para calcularla falta definir: ${esc(faltan._r.falta.join(', '))} (Ajustes de la app o 5_Catalogos).` : 'Sin potreros con área.')
    : `Consumo ${fmt(PP.consumoPorc, 1)} % del peso vivo en ${PP.baseConsumo === 'MS' ? 'materia seca' : 'forraje verde'}${enAn ? ` · peso promedio ${fmt(PP.pesoKg, 0)} kg` : ''} · desperdicio ${fmt(PP.despPorc, 0)} % · parámetros de ${esc(PP.fuente)}.`;
  draw('cCap', {
    type: 'bar',
    data: { labels: cap.map(a => a.Potrero), datasets: [{ label: enAn ? 'Animales' : 'kg PV', data: cap.map(a => capVal(a._r)), backgroundColor: c.s1, borderRadius: 4, maxBarThickness: 28 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: x => { const r = cap[x.dataIndex]._r; return [`${textoCapacidad(r)} × ${fmt(periodo, 0)} días`,
        `Aprovechable: ${fmt(r.aprovechable, 0)} ${r.unidad}`, r.dias !== '' ? `Días con ${textoLote(r)}: ${fmt(r.dias, 1)}` : ''].filter(Boolean); } } } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: c.grid } }, y: { grid: { display: false } } } },
  });

  const orden = ult.filter(a => num(a.Kg_Ha_FV) !== '').sort((a, b) => num(b.Kg_Ha_FV) - num(a.Kg_Ha_FV));
  draw('cKgHa', {
    type: 'bar',
    data: { labels: orden.map(a => a.Potrero), datasets: [{ label: 'kg FV/ha', data: orden.map(a => num(a.Kg_Ha_FV)), backgroundColor: c.s1, borderRadius: 4, maxBarThickness: 28 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: x => `${fmt(x.raw, 0)} kg FV/ha · ${orden[x.dataIndex]._fecha}` } } },
      scales: { x: { beginAtZero: true, grid: { color: c.grid } }, y: { grid: { display: false } } } },
  });

  const det = groupBy(d.detalles, 'ID_Aforo');
  $('#tVar').innerHTML = tabla([
    ['Potrero', a => esc(a.Potrero)], ['Fecha', a => esc(a._fecha)],
    ['Marcos', a => (det[a.ID_Aforo] || []).length],
    ['Mín (g)', a => fmt(Math.min(...(det[a.ID_Aforo] || []).map(x => num(x.Peso_g)).filter(x => x !== '')), 0)],
    ['Prom (g)', a => fmt(num(a.Promedio_Peso_g), 0)],
    ['Máx (g)', a => fmt(Math.max(...(det[a.ID_Aforo] || []).map(x => num(x.Peso_g)).filter(x => x !== '')), 0)],
    ['CV %', a => { const r = calcAforo((det[a.ID_Aforo] || []).map(x => x.Peso_g), 1, ''); return r.cv === '' ? '—' : (r.cv > 40 ? '⚠️ ' : '') + fmt(r.cv, 0); }],
  ], orden);

  const hist = d.aforos.slice().sort((a, b) => String(b._fecha).localeCompare(String(a._fecha)));
  $('#tAforos').innerHTML = tabla([
    ['Fecha', a => esc(a._fecha)], ['Potrero', a => esc(a.Potrero)], ['Área ha', a => fmt(num(a.Area_Ha), 2)],
    ['Marco m²', a => fmt(num(a.Metodo_M2), 2)], ['Prom g', a => fmt(num(a.Promedio_Peso_g), 0)],
    ['kg FV/ha', a => fmt(num(a.Kg_Ha_FV), 0)], ['Oferta kg', a => fmt(num(a.Oferta_Total_Kg), 0)],
    [`Capacidad (${fmt(PP && PP.periodoDias > 0 ? PP.periodoDias : 3, 0)} d)`, a => { const r = PP ? calcPastoreo(num(a.Oferta_Total_Kg), a.MS_Porc, PP, { animales: a.Animales_Lote, pesoTotal: a.Peso_Total_Lote_Kg }) : {}; return r.listo ? textoCapacidad(r) : '—'; }],
    ['Días pastoreo', a => { const r = PP ? calcPastoreo(num(a.Oferta_Total_Kg), a.MS_Porc, PP, { animales: a.Animales_Lote, pesoTotal: a.Peso_Total_Lote_Kg }) : {}; return r.listo && r.dias !== '' ? fmt(r.dias, 1) : '—'; }],
    ['Foto', a => a.Foto_General ? `<a href="${esc(a.Foto_General)}" target="_blank" rel="noopener">ver</a>` : ''],
  ], hist);
}

function renderBotanica(d) {
  const c = C(), A = d.arvenses;
  const g = Object.entries(groupBy(A, 'Nombre_Arvense')).map(([k, v]) => ({ k, n: v.length, cob: avg(v.map(a => a.Cobertura_Porc)),
    pots: new Set(v.map(a => a._potrero)).size, abund: Object.entries(groupBy(v, 'Abundancia', '—')).sort((a, b) => b[1].length - a[1].length)[0][0] }))
    .sort((a, b) => b.n - a.n);
  const puntosConArv = new Set(A.map(a => a.ID_Punto)).size;
  tiles('#tilesBot', [
    ['Especies registradas', g.length, ''],
    ['Registros', A.length, `en ${puntosConArv} de ${d.puntos.length} puntos`],
    ['Más frecuente', g[0] ? esc(g[0].k) : '—', g[0] ? `${g[0].n} registros` : ''],
  ]);
  const pal = dark() ? CAT_DARK : CAT_LIGHT;
  const top = g.slice(0, 7), resto = g.slice(7);
  const labels = top.map(x => x.k).concat(resto.length ? ['Otras'] : []);
  const vals = top.map(x => x.n).concat(resto.length ? [resto.reduce((s, x) => s + x.n, 0)] : []);
  const total = vals.reduce((a, b) => a + b, 0);
  draw('cPie', {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: top.map((_, i) => pal[i]).concat(resto.length ? [c.other] : []), borderColor: c.surface, borderWidth: 2 }] },
    options: { maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'right', labels: { boxWidth: 12,
      generateLabels: ch => Chart.overrides.doughnut.plugins.legend.labels.generateLabels(ch).map((l, i) => Object.assign(l, { text: `${labels[i]} · ${fmt((vals[i] / total) * 100, 0)} %` })) } },
      tooltip: { callbacks: { label: x => `${x.label}: ${x.raw} registros (${fmt((x.raw / total) * 100, 0)} %)` } } } },
  });
  const porCob = g.filter(x => x.cob !== '').sort((a, b) => b.cob - a.cob).slice(0, 15);
  draw('cCob', {
    type: 'bar',
    data: { labels: porCob.map(x => x.k), datasets: [{ label: 'Cobertura %', data: porCob.map(x => round(x.cob, 1)), backgroundColor: c.s1, borderRadius: 4, maxBarThickness: 24 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, max: 100, grid: { color: c.grid } }, y: { grid: { display: false } } } },
  });
  $('#tArv').innerHTML = tabla([['Arvense', x => esc(x.k)], ['Registros', x => x.n], ['% del total', x => fmt((x.n / (A.length || 1)) * 100, 0)],
    ['Cobertura prom. %', x => fmt(x.cob, 1)], ['Potreros', x => x.pots], ['Abundancia más común', x => esc(x.abund)]], g);
}

// ---------- Inicio ----------
(async function () {
  await DB.open();
  S = await getSettings();
  const catLocal = await DB.kv('catalogos', null);
  aplicarRangos(catLocal ? catLocal.items : []);
  PP = await paramsPastoreo();
  $$('[role=tab]').forEach(b => b.onclick = () => {
    tabActual = b.dataset.tab;
    $$('[role=tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    ['suelos', 'diagnostico', 'forrajes', 'botanica'].forEach(t => ($(`#tab-${t}`).hidden = t !== tabActual));
    render();
  });
  ['#fJornada', '#fPotrero', '#fDesde', '#fHasta'].forEach(s => $(s).addEventListener('change', render));
  $('#recargar').onclick = () => cargar(true);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  const cache = await DB.kv('dashData', null);
  if (cache) { DATA = cache.data; llenarFiltros(); }
  if (typeof Chart === 'undefined' || typeof L === 'undefined') toast('Las librerías de gráficos no cargaron (¿sin conexión la primera vez?).', true);
  cargar(false);
})();
