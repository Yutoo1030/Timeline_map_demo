// =========================
// Map init with EN basemap
// =========================
const map = L.map('map').setView([20, 0], 2);

// English-first basemap (Carto)
const cartoEN = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }
).addTo(map);

// Local-language OSM
const osmLocal = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
);

// Overlays
const eventLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);

L.control.layers(
  { 'Carto Light (EN)': cartoEN, 'OSM (Local labels)': osmLocal },
  { 'Events': eventLayer, 'Migration routes': routeLayer },
  { position: 'topleft' }
).addTo(map);

// Legend
const legend = L.control({ position: 'topright' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  Object.assign(div.style, {
    background: 'white', padding: '8px 10px', borderRadius: '8px',
    boxShadow: '0 1px 4px rgba(0,0,0,.2)'
  });
  div.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;">Legend</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#e74c3c;margin-right:6px;border:1px solid #000"></span> Humans & routes</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#27ae60;margin-right:6px;border:1px solid #000"></span> Animals</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#2980b9;margin-right:6px;border:1px solid #000"></span> Plants</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#8e44ad;margin-right:6px;border:1px solid #000"></span> Pathogens</div>
  `;
  return div;
};
legend.addTo(map);

// =========================
// Load data
// =========================
Promise.all([
  fetch('data/events.json').then(r => r.json()).catch(() => []),
  fetch('data/routes.json').then(r => r.json()).catch(() => [])
]).then(([events, routes]) => {
  // Build discrete timeline only from available time values
  const times = Array.from(new Set([
    ...events.map(e => e.time).filter(Number.isFinite),
    ...routes.map(r => r.time).filter(Number.isFinite),
  ])).sort((a, b) => a - b);

  if (times.length === 0) {
    console.warn('No time points found in events/routes.');
    return;
  }
  setupDiscreteSlider(times, events, routes);
  renderAll(events, routes, times[0]);
});

// =========================
// Discrete slider
// =========================
const HUMAN_COLOR = '#e74c3c';
const markers = [];
let polylines = [];

function setupDiscreteSlider(timeline, events, routes) {
  const slider = document.getElementById('timeSlider');
  const tv = document.getElementById('timeValue');

  slider.min = '0';
  slider.max = String(timeline.length - 1);
  slider.step = '1';
  slider.value = '0';
  tv.textContent = `Year: ${timeline[0]}`;

  slider.addEventListener('input', () => {
    const idx = Math.max(0, Math.min(timeline.length - 1, parseInt(slider.value)));
    const year = timeline[idx];
    tv.textContent = `Year: ${year}`;
    renderAll(events, routes, year);
  });

  // 可选：方向键微调
  slider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      slider.value = String(Math.max(0, parseInt(slider.value) - 1));
      slider.dispatchEvent(new Event('input'));
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      slider.value = String(Math.min(timeline.length - 1, parseInt(slider.value) + 1));
      slider.dispatchEvent(new Event('input'));
    }
  });
}

function renderAll(events, routes, currentTime) {
  renderMarkers(events, currentTime);
  renderRoutes(routes, currentTime);
}

// ============ Events (points)
function renderMarkers(events, currentTime) {
  markers.forEach(m => eventLayer.removeLayer(m));
  markers.length = 0;

  events.forEach(ev => {
    if (!Number.isFinite(ev.time) || ev.time !== currentTime) return;

    const color =
      ev.type && /人/.test(ev.type) ? HUMAN_COLOR :
      ev.type && /动/.test(ev.type) ? '#27ae60' :
      ev.type && /植/.test(ev.type) ? '#2980b9' :
      ev.type && /病|病原|病菌|病体/.test(ev.type) ? '#8e44ad' :
      '#f39c12';

    const m = L.circleMarker([ev.lat, ev.lon], {
      radius: 6, fillColor: color, color: '#000', weight: 1, fillOpacity: 0.9
    }).bindPopup(itemPopupHTML(ev));

    m.addTo(eventLayer);
    markers.push(m);
  });
}

// ============ Routes (lines) — with dateline unwrapping
function renderRoutes(routes, currentTime) {
  polylines.forEach(p => routeLayer.removeLayer(p));
  polylines = [];

  routes.forEach(rt => {
    if (!Number.isFinite(rt.time) || rt.time !== currentTime) return;
    if (!Array.isArray(rt.path) || rt.path.length < 2) return;

    // 🔧 展开经度，避免跨 ±180° 经线时“抄近路”
    const latlngs = unwrapPath(rt.path);

    const line = L.polyline(latlngs, {
      color: HUMAN_COLOR,
      weight: 3.5,
      opacity: 0.95,
      noClip: true
    }).bindPopup(itemPopupHTML(rt));

    line.addTo(routeLayer);
    polylines.push(line);
  });
}

/**
 * 将路径中的经度“拆环”，避免跨越 ±180° 时走反方向。
 * 若相邻点经度差的绝对值 > 180°，对当前点经度加/减 360° 直到差值 ≤ 180°。
 */
function unwrapPath(path) {
  const out = [];
  let prevLon = null;
  for (const p of path) {
    const lat = Number(p.lat);
    let lon = Number(p.lon);
    if (prevLon !== null && Number.isFinite(prevLon)) {
      while (Math.abs(lon - prevLon) > 180) {
        lon += (lon > prevLon) ? -360 : 360;
      }
    }
    out.push([lat, lon]);
    prevLon = lon;
  }
  return out;
}

// ============ Shared popup renderer (images + refs)
function itemPopupHTML(item) {
  const title = `<b>${escapeHTML(item.title || 'Untitled')}</b>`;
  const type = item.type ? `<br/><i>${escapeHTML(item.type)}</i>` : '<br/><i>route</i>';
  const time = Number.isFinite(item.time) ? `<br/>Time: ${item.time}` : '';
  const desc = item.desc ? `<br/>${escapeHTML(item.desc)}` : '';

  let imgs = '';
  if (Array.isArray(item.images) && item.images.length) {
    const imgTags = item.images.map(src =>
      `<img class="popup-img" src="${escapeAttr(src)}" alt="image"/>`
    ).join('');
    imgs = `<div class="img-row">${imgTags}</div>`;
  }

  let refs = '';
  if (Array.isArray(item.harvard_refs) && item.harvard_refs.length) {
    refs = `<div class="refs"><b>References</b><br/>${
      item.harvard_refs.map(r => escapeHTML(r)).join('<br/>')
    }</div>`;
  }

  return `${title}${type}${time}${desc}${imgs}${refs}`;
}

function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function escapeAttr(str) {
  return String(str).replaceAll('"', '&quot;');
}
