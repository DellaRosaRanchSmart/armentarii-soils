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
function render() {
  if (!DATA) return;
  const d = filtrado();
  if (tabActual === 'suelos') renderSuelos(d);
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

function renderForrajes(d) {
  const c = C(), ult = ultimoPorPotrero(d.aforos);
  const prom = avg(ult.map(a => a.Kg_Ha_FV));
  const conArea = ult.filter(a => num(a.Oferta_Total_Kg) !== '');
  tiles('#tilesForraje', [
    ['Potreros aforados', ult.length, `${d.aforos.length} aforos en el periodo`],
    ['Forraje verde promedio', fmt(prom, 0), 'kg FV/ha'],
    ['Oferta total disponible', fmt(sum(conArea.map(a => a.Oferta_Total_Kg)), 0), `kg FV · ${conArea.length} potreros con área`],
    ['Potreros sin área', ult.length - conArea.length, 'solo se reporta kg/ha'],
    ['Meta', fmt(S.metaKgHa, 0), 'kg FV/ha'],
  ]);

  // Medidor (semicírculo) vs meta
  const max = Math.max(S.metaKgHa * 1.5, prom || 0);
  const val = prom === '' ? 0 : prom;
  draw('cGauge', {
    type: 'doughnut',
    data: { labels: ['Promedio', 'Resto'], datasets: [{ data: [val, Math.max(max - val, 0)], backgroundColor: [val >= S.metaKgHa ? '#0ca30c' : c.s1, c.grid], borderWidth: 0 }] },
    options: { maintainAspectRatio: false, rotation: -90, circumference: 180, cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    plugins: [{
      id: 'centro', afterDraw(ch) {
        const { ctx, chartArea: a } = ch; const x = (a.left + a.right) / 2, y = a.bottom - 10;
        ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = dark() ? '#f0efec' : '#0b0b0b'; ctx.font = '600 26px system-ui';
        ctx.fillText(prom === '' ? '—' : `${fmt(prom, 0)} kg/ha`, x, y - 22);
        ctx.font = '13px system-ui'; ctx.fillStyle = c.ink;
        ctx.fillText(prom === '' ? 'sin aforos' : `${fmt((prom / S.metaKgHa) * 100, 0)} % de la meta (${fmt(S.metaKgHa, 0)})`, x, y);
        ctx.restore();
      },
    }],
  });

  const orden = ult.filter(a => num(a.Kg_Ha_FV) !== '').sort((a, b) => num(b.Kg_Ha_FV) - num(a.Kg_Ha_FV));
  draw('cKgHa', {
    type: 'bar',
    data: { labels: orden.map(a => a.Potrero), datasets: [{ label: 'kg FV/ha', data: orden.map(a => num(a.Kg_Ha_FV)), backgroundColor: c.s1, borderRadius: 4, maxBarThickness: 28 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false },
      tooltip: { callbacks: { label: x => `${fmt(x.raw, 0)} kg FV/ha · ${orden[x.dataIndex]._fecha}` } },
      refLine: { axis: 'x', value: S.metaKgHa, color: '#0ca30c', label: 'Meta' } },
      scales: { x: { beginAtZero: true, suggestedMax: S.metaKgHa * 1.1, grid: { color: c.grid } }, y: { grid: { display: false } } } },
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
  $$('[role=tab]').forEach(b => b.onclick = () => {
    tabActual = b.dataset.tab;
    $$('[role=tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    ['suelos', 'forrajes', 'botanica'].forEach(t => ($(`#tab-${t}`).hidden = t !== tabActual));
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
