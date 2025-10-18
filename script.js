// =========================
// Map init with EN basemap
// =========================
const map = L.map('map').setView([20, 0], 2);

// English-first basemap (Carto)
const cartoEN = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }
).addTo(map);

// Local-language OSM (optional toggle)
const osmLocal = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }
);

// Overlay groups
const eventLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);

// Basemap + overlay controls
L.control
  .layers(
    { 'Carto Light (EN)': cartoEN, 'OSM (Local labels)': osmLocal },
    { 'Events': eventLayer, 'Migration routes': routeLayer },
    { position: 'topleft' }
  )
  .addTo(map);

// Small legend
const legend = L.control({ position: 'topright' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  div.style.background = 'white';
  div.style.padding = '8px 10px';
  div.style.borderRadius = '8px';
  div.style.boxShadow = '0 1px 4px rgba(0,0,0,.2)';
  div.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;">Legend</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#e74c3c;margin-right:6px;border:1px solid #000"></span> Humans</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#27ae60;margin-right:6px;border:1px solid #000"></span> Animals</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#2980b9;margin-right:6px;border:1px solid #000"></span> Plants</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#8e44ad;margin-right:6px;border:1px solid #000"></span> Pathogens</div>
    <div><span style="display:inline-block;width:18px;height:3px;background:#1f4dd8;display:inline-block;margin-right:6px;"></span> Migration route</div>
  `;
  return div;
};
legend.addTo(map);

// =========================
// Load data (events + routes)
// =========================
Promise.all([
  fetch('data/events.json').then(r => r.json()).catch(() => []),
  fetch('data/routes.json').then(r => r.json()).catch(() => [])
]).then(([events, routes]) => {
  window.aDNA_DATA = { events, routes };

  // Build slider domain from both events and routes
  const times = [
    ...events.map(e => e.time).filter(Number.isFinite),
    ...routes.map(r => r.time).filter(Number.isFinite)
  ];
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  setupSlider(minT, maxT, events, routes);
  // Initial render at min time
  renderAll(events, routes, minT);
}).catch(err => {
  console.error('Data loading failed:', err);
});

// =========================
// Slider + rendering
// =========================
const markers = [];
let polylines = [];

function setupSlider(minT, maxT, events, routes) {
  const slider = document.getElementById('timeSlider');
  const tv = document.getElementById('timeValue');

  slider.min = String(minT);
  slider.max = String(maxT);
  slider.step = 100; // adjust granularity
  slider.value = String(minT);
  tv.textContent = `Year: ${slider.value}`;

  slider.addEventListener('input', () => {
    const t = parseInt(slider.value);
    tv.textContent = `Year: ${t}`;
    renderAll(events, routes, t);
  });
}

function renderAll(events, routes, currentTime) {
  renderMarkers(events, currentTime);
  renderRoutes(routes, currentTime);
}

// Show events within a time window around currentTime
function renderMarkers(events, currentTime) {
  // clear previous
  markers.forEach(m => eventLayer.removeLayer(m));
  markers.length = 0;

  const WINDOW = 1000; // show events within ±1000 years
  events.forEach(ev => {
    if (!Number.isFinite(ev.time)) return;
    if (ev.time >= currentTime - WINDOW && ev.time <= currentTime + WINDOW) {
      const color =
        ev.type && /人/.test(ev.type) ? '#e74c3c' :
        ev.type && /动/.test(ev.type) ? '#27ae60' :
        ev.type && /植/.test(ev.type) ? '#2980b9' :
        ev.type && /病|病原|病菌|病体/.test(ev.type) ? '#8e44ad' :
        '#f39c12';

      const m = L.circleMarker([ev.lat, ev.lon], {
        radius: 6,
        fillColor: color,
        color: '#000',
        weight: 1,
        fillOpacity: 0.85
      }).bindPopup(
        `<b>${escapeHTML(ev.title || 'Untitled')}</b><br/>
         <i>${escapeHTML(ev.type || '')}</i><br/>
         Time: ${ev.time}<br/>
         ${ev.desc ? escapeHTML(ev.desc) : ''}`
      );

      m.addTo(eventLayer);
      markers.push(m);
    }
  });
}

// Draw routes within a time window; include Harvard refs
function renderRoutes(routes, currentTime) {
  // clear previous
  polylines.forEach(p => routeLayer.removeLayer(p));
  polylines = [];

  const WINDOW = 10000; // routes are coarse in time; wider window
  routes.forEach(rt => {
    if (!Number.isFinite(rt.time)) return;
    if (rt.time >= currentTime - WINDOW && rt.time <= currentTime + WINDOW) {
      const latlngs = (rt.path || []).map(p => [p.lat, p.lon]);
      if (!latlngs.length) return;

      const line = L.polyline(latlngs, {
        color: '#1f4dd8',
        weight: 3.5,
        opacity: 0.85
      }).bindPopup(routePopupHTML(rt));

      line.addTo(routeLayer);
      polylines.push(line);
    }
  });
}

function routePopupHTML(rt) {
  const refsHTML = Array.isArray(rt.harvard_refs) && rt.harvard_refs.length
    ? `<div style="margin-top:6px;"><b>References</b><br/>${rt.harvard_refs.map(r => escapeHTML(r)).join('<br/>')}</div>`
    : '';
  return `
    <b>${escapeHTML(rt.title || 'Route')}</b><br/>
    Time: ${rt.time}<br/>
    ${rt.desc ? escapeHTML(rt.desc) : '' }
    ${refsHTML}
  `;
}

// Basic HTML escaping to avoid accidental markup
function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
