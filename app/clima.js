'use strict';
/* Clima con Open-Meteo (https://open-meteo.com). Datos CC BY 4.0: hay que mostrar la atribución.
   Uso gratuito: solo no comercial según sus términos; para uso comercial ofrecen plan pagado con API key
   (si se contrata, se agrega &apikey=... y el dominio customer-api.open-meteo.com). */

// Códigos WMO que usa Open-Meteo → texto y la opción de "Clima" de la jornada (Soleado / Nublado / Lluvia).
const WMO = {
  0: ['Despejado', '☀️', 'Soleado'], 1: ['Mayormente despejado', '🌤️', 'Soleado'], 2: ['Parcialmente nublado', '⛅', 'Nublado'],
  3: ['Nublado', '☁️', 'Nublado'], 45: ['Niebla', '🌫️', 'Nublado'], 48: ['Niebla con escarcha', '🌫️', 'Nublado'],
  51: ['Llovizna ligera', '🌦️', 'Lluvia'], 53: ['Llovizna', '🌦️', 'Lluvia'], 55: ['Llovizna intensa', '🌧️', 'Lluvia'],
  56: ['Llovizna helada', '🌧️', 'Lluvia'], 57: ['Llovizna helada', '🌧️', 'Lluvia'],
  61: ['Lluvia ligera', '🌦️', 'Lluvia'], 63: ['Lluvia', '🌧️', 'Lluvia'], 65: ['Lluvia fuerte', '🌧️', 'Lluvia'],
  66: ['Lluvia helada', '🌧️', 'Lluvia'], 67: ['Lluvia helada', '🌧️', 'Lluvia'],
  71: ['Nieve', '🌨️', 'Nublado'], 73: ['Nieve', '🌨️', 'Nublado'], 75: ['Nieve', '🌨️', 'Nublado'], 77: ['Granizo fino', '🌨️', 'Nublado'],
  80: ['Chubascos', '🌦️', 'Lluvia'], 81: ['Chubascos', '🌧️', 'Lluvia'], 82: ['Chubascos fuertes', '⛈️', 'Lluvia'],
  85: ['Chubascos de nieve', '🌨️', 'Nublado'], 86: ['Chubascos de nieve', '🌨️', 'Nublado'],
  95: ['Tormenta', '⛈️', 'Lluvia'], 96: ['Tormenta con granizo', '⛈️', 'Lluvia'], 99: ['Tormenta con granizo', '⛈️', 'Lluvia'],
};
const wmo = c => WMO[c] || ['—', '🌡️', ''];

/** Pide clima actual, lluvia de las últimas 24 h y pronóstico de 4 días. Guarda copia para verla sin señal. */
async function obtenerClima(forzar) {
  const s = await getSettings();
  const cache = await DB.kv('clima', null);
  const mismaUbic = cache && cache.lat === s.climaLat && cache.lng === s.climaLng;
  if (!forzar && mismaUbic && Date.now() - cache.at < 30 * 60 * 1000) return cache;
  if (!navigator.onLine) return mismaUbic ? cache : null;
  const q = new URLSearchParams({
    latitude: s.climaLat, longitude: s.climaLng, timezone: 'America/Bogota', past_days: 1, forecast_days: 4,
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
    hourly: 'precipitation', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    const j = await res.json();
    if (!res.ok || j.error) throw new Error(j.reason || `HTTP ${res.status}`);
    // Lluvia de las últimas 24 h: suma de las horas entre (ahora − 24 h) y ahora, en hora local de la finca.
    const ahora = j.current.time; // "YYYY-MM-DDTHH:MM" local
    const desde = new Date(new Date(ahora + ':00Z').getTime() - 24 * 3600 * 1000).toISOString().slice(0, 16);
    let lluvia24 = 0;
    j.hourly.time.forEach((t, i) => { if (t > desde && t <= ahora) lluvia24 += j.hourly.precipitation[i] || 0; });
    const hoy = ahora.slice(0, 10);
    const dias = j.daily.time.map((t, i) => ({ fecha: t, code: j.daily.weather_code[i], tmax: j.daily.temperature_2m_max[i],
      tmin: j.daily.temperature_2m_min[i], lluvia: j.daily.precipitation_sum[i], prob: j.daily.precipitation_probability_max[i] }))
      .filter(d => d.fecha >= hoy);
    const out = { at: Date.now(), lat: s.climaLat, lng: s.climaLng, hora: ahora,
      temp: j.current.temperature_2m, hum: j.current.relative_humidity_2m, viento: j.current.wind_speed_10m,
      code: j.current.weather_code, lluvia24: Math.round(lluvia24 * 10) / 10, dias };
    await DB.setKv('clima', out);
    return out;
  } catch (err) {
    if (mismaUbic) return Object.assign({}, cache, { error: err.message });
    throw err;
  }
}

function tarjetaClima(c) {
  if (!c) return `<div class="card clima vacio-clima small muted">☁️ Sin datos de clima todavía. Se cargan cuando haya señal.</div>`;
  const [txt, ico] = wmo(c.code);
  const dia = f => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '');
  const edad = Math.round((Date.now() - c.at) / 60000);
  return `<div class="card clima">
    <div class="clima-ahora">
      <div class="clima-ico" aria-hidden="true">${ico}</div>
      <div><b class="clima-temp">${fmt(c.temp, 0)}°C</b><div>${esc(txt)}</div></div>
      <div class="clima-datos small">💧 ${fmt(c.hum, 0)} % humedad<br>🌧️ ${fmt(c.lluvia24, 1)} mm últimas 24 h<br>💨 ${fmt(c.viento, 0)} km/h</div>
    </div>
    <div class="clima-dias">${c.dias.slice(0, 4).map((d, i) => `<div><span>${i === 0 ? 'Hoy' : esc(dia(d.fecha))}</span>
      <i aria-hidden="true">${wmo(d.code)[1]}</i><b>${fmt(d.tmax, 0)}° / ${fmt(d.tmin, 0)}°</b>
      <small>${fmt(d.lluvia, 1)} mm${d.prob != null ? ` · ${fmt(d.prob, 0)} %` : ''}</small></div>`).join('')}</div>
    <div class="small muted clima-pie">${c.error ? '⚠️ Sin conexión, último dato guardado · ' : ''}Actualizado hace ${edad < 1 ? 'menos de 1' : edad} min ·
      Datos: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)</div>
  </div>`;
}
