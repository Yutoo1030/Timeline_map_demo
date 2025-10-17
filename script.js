// ========== 初始化地图 ==========
const map = L.map('map').setView([20, 0], 2);

// --- 底图定义（英文 & 本地语言） ---
const cartoEN = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO (English base map)'
  }
).addTo(map); // 默认加载英文底图

const osmLocal = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors (Local labels)'
  }
);

// --- 底图切换控件 ---
L.control
  .layers({ 'Carto Light (EN)': cartoEN, 'OSM (Local labels)': osmLocal }, null, {
    position: 'topleft'
  })
  .addTo(map);

// ========== 加载事件数据 ==========
fetch('data/events.json')
  .then((res) => res.json())
  .then((events) => {
    window.events = events;
    setupSlider(events);
  })
  .catch((err) => {
    console.error('❌ Failed to load events.json:', err);
  });

// ========== 初始化滑块 ==========
function setupSlider(events) {
  const slider = document.getElementById('timeSlider');
  const tv = document.getElementById('timeValue');

  // 获取时间范围
  const times = events.map((ev) => ev.time);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  slider.min = minT;
  slider.max = maxT;
  slider.step = 100; // 步进（可改）
  slider.value = minT;
  tv.textContent = `Year: ${slider.value}`;

  // 监听滑动
  slider.addEventListener('input', () => {
    const t = parseInt(slider.value);
    tv.textContent = `Year: ${t}`;
    renderMarkers(events, t);
  });

  // 初始渲染
  renderMarkers(events, parseInt(slider.value));
}

// ========== 渲染事件点 ==========
const markers = [];

function renderMarkers(events, currentTime) {
  // 清除旧 marker
  markers.forEach((m) => map.removeLayer(m));
  markers.length = 0;

  const WINDOW = 1000; // 显示当前时间 ±1000 年的事件
  events.forEach((ev) => {
    if (ev.time >= currentTime - WINDOW && ev.time <= currentTime + WINDOW) {
      const color =
        ev.type && ev.type.includes('人')
          ? '#e74c3c'
          : ev.type.includes('动')
          ? '#27ae60'
          : ev.type.includes('植')
          ? '#2980b9'
          : ev.type.includes('病')
          ? '#8e44ad'
          : '#f39c12';

      const m = L.circleMarker([ev.lat, ev.lon], {
        radius: 6,
        fillColor: color,
        color: '#000',
        weight: 1,
        fillOpacity: 0.85
      }).bindPopup(
        `<b>${ev.title}</b><br>
         <i>${ev.type || ''}</i><br>
         Time: ${ev.time}<br>
         ${ev.desc || ''}`
      );

      m.addTo(map);
      markers.push(m);
    }
  });
}
