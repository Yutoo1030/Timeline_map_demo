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
    <div><span style="display:inline-block;width:10px;height:10px;background:#e74c3c;margin-right:6px;border:1px solid #000"></span> Humans & routes</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#27ae60;margin-right:6px;border:1px solid #000"></span> Animals</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#2980b9;margin-right:6px;border:1px solid #000"></span> Plants</div>
    <div><span style="display:inline-block;width:10px;height:10px;background:#8e44ad;margin-right:6px;border:1px solid #000"></span> Pathogens</div>
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

  // ---- Build discrete timeline (only years that actually have data)
  const timesFromEvents = events.map(e => e.time).filter(Number.isFinite);
  const timesFromRoutes  = routes.map(r => r.time).filter(Number.isFinite);
  const timeline = Array.from(new Set([...timesFromEvents, ...timesFromRoutes]))
    .sort((a, b) => a - b);

  if (timeline.length === 0) {
    console.warn('No time points found in events/routes.');
    return;
  }

  setupDiscreteSlider(timeline, events, routes);
  renderAll(events, routes, timeline[0]); // initial render at first available time
}).catch(err => {
  console.error('Data loading failed:', err);
});

// =========================
// Discrete slider + rendering
// =========================
const HUMAN_COLOR = '#e74c3c';   // humans & routes color
const markers = [];
let polylines = [];

function setupDiscreteSlider(timeline, events, routes) {
  const slider = document.getElementById('timeSlider');
  const tv = document.getElementById('timeValue');

  // Slider now represents INDEX in timeline, not raw year
  slider.min = '0';
  slider.max = String(timeline.length - 1);
  slider.step = '1';
  slider.value = '0';
  tv.textContent = `Year: ${timeline[0]}`;

  // Render on input (snaps to integer index)
  slider.addEventListener('input', () => {
    const idx = Math.max(0, Math.min(timeline.length - 1, parseInt(slider.value)));
    const year = timeline[idx];
    tv.textContent = `Year: ${year}`;
    renderAll(events, routes, year);
  });

  // Optional: arrow keys to move one tick
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

// Show ONLY items that match the current discrete time exactly
function renderMarkers(events, currentTime) {
  // clear previous
  markers.forEach(m => eventLayer.removeLayer(m));
  markers.length = 0;

  events.forEach(ev => {
    if (!Number.isFinite(ev.time)) return;
    if (ev.time === currentTime) {
      const color =
        ev.type && /人/.test(ev.type) ? HUMAN_COLOR :
        ev.type && /动/.test(ev.type) ? '#27ae60' :
        ev.type && /植/.test(ev.type) ? '#2980b9' :
        ev.type && /病|病原|病菌|病体/.test(ev.type) ? '#8e44ad' :
        '#f39c12';

      const m = L.circleMarker([ev.lat, ev.lon], {
        radius: 6,
        fillColor: color,
        color: '#000',
        weight: 1,
        fillOpacity: 0.9
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

function renderRoutes(routes, currentTime) {
  // clear previous
  polylines.forEach(p => routeLayer.removeLayer(p));
  polylines = [];

  routes.forEach(rt => {
    if (!Number.isFinite(rt.time)) return;
    if (rt.time === currentTime) {
      const latlngs = (rt.path || []).map(p => [p.lat, p.lon]);
      if (!latlngs.length) return;

      // Use human color for migration routes
      const line = L.polyline(latlngs, {
        color: HUMAN_COLOR,
        weight: 3.5,
        opacity: 0.9
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

// Basic HTML escaping
function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
