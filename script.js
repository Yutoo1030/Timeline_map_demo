// 初始化地图
const map = L.map('map').setView([20, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18
}).addTo(map);

// 载入事件数据
fetch('data/events.json')
  .then(res => res.json())
  .then(events => {
    window.events = events;
    setupSlider();
    renderMarkers(0);
  });

// 存放 marker
const markers = [];

// 设置滑块
function setupSlider() {
  const slider = document.getElementById('timeSlider');
  const tv = document.getElementById('timeValue');
  // 假设我们用时间范围由最小到最大，从 JSON 里推算
  const times = window.events.map(ev => ev.time);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  slider.min = minT;
  slider.max = maxT;
  slider.value = minT;
  tv.textContent = `Year: ${slider.value}`;

  slider.addEventListener('input', () => {
    const t = parseInt(slider.value);
    tv.textContent = `Year: ${t}`;
    renderMarkers(t);
  });
}

// 渲染 / 显示 marker
function renderMarkers(currentTime) {
  // 清空已有 marker（先移除）
  markers.forEach(m => map.removeLayer(m));
  markers.length = 0;

  window.events.forEach(ev => {
    // 简单逻辑：如果 ev.time === currentTime，就画 marker
    if (ev.time === currentTime) {
      const m = L.circleMarker([ev.lat, ev.lon], {
        radius: 6,
        fillColor: "#f00",
        color: "#000",
        weight: 1,
        fillOpacity: 0.8
      }).bindPopup(`<b>${ev.title}</b><br>Time: ${ev.time}<br>${ev.desc}`);
      m.addTo(map);
      markers.push(m);
    }
  });
}
