const REFRESH_INTERVAL_MS = 30000; // 30s
let charts = {};

const lastUpdateSpan = document.getElementById('last-update');
const refreshBtn = document.getElementById('refresh-btn');

refreshBtn.addEventListener('click', () => {
  loadData(true);
});

async function loadData(manual = false) {
  try {
    if (!manual) {
      lastUpdateSpan.textContent = 'Actualizando...';
    }

    const res = await fetch('data.json?_=' + Date.now());
    if (!res.ok) {
      console.error('No se pudo cargar data.json', res.status);
      lastUpdateSpan.textContent = 'Error cargando data.json';
      return;
    }

    const data = await res.json();
    const entries = Array.isArray(data.entries) ? data.entries : [];

    renderTable(entries);
    renderCharts(entries);

    const updatedText = data.updated_at
      ? new Date(data.updated_at).toLocaleString()
      : new Date().toLocaleString();

    lastUpdateSpan.textContent = 'Última actualización: ' + updatedText;
  } catch (e) {
    console.error('Error cargando data.json', e);
    lastUpdateSpan.textContent = 'Error de conexión';
  }
}

// Convierte el timestamp_utc del decoded a un string legible
function parseTimestampUtc(tsObj) {
  if (!tsObj) return 'N/A';
  const { year, month, day, hour, minute, second } = tsObj;

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(day)}/${pad(month)}/${year} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

// Tabla de últimos mensajes
function renderTable(entries) {
  const tbody = document.querySelector('#telemetry-table tbody');
  tbody.innerHTML = '';

  entries.slice().reverse().forEach((e) => {
    const decoded = e.decoded || {};
    const ts = parseTimestampUtc(decoded.timestamp_utc);
    const dev = e.device_id || 'N/A';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${ts}</td>
      <td>${dev}</td>
      <td><pre>${JSON.stringify(decoded, null, 2)}</pre></td>
    `;
    tbody.appendChild(row);
  });
}

// Construye todas las gráficas
function renderCharts(entries) {
  const sensors = [
    { key: 'temperature', label: 'Temperatura (°C)' },
    { key: 'humidity', label: 'Humedad (%)' },
    { key: 'ldr', label: 'LDR' },
    { key: 'vbat', label: 'VBAT (V)' },
    { key: 'vsolar', label: 'VSOLAR (V)' }
  ];

  sensors.forEach((sensor) => {
    const dataPoints = entries
      .filter((e) => e.decoded && typeof e.decoded[sensor.key] !== 'undefined')
      .map((e) => ({
        x: parseTimestampUtc(e.decoded.timestamp_utc),
        y: e.decoded[sensor.key]
      }));

    drawChart(sensor.key, sensor.label, dataPoints);
  });
}

function drawChart(canvasId, label, dataPoints) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn('No se encontró canvas con id', canvasId);
    return;
  }

  const ctx = canvas.getContext('2d');

  if (!charts[canvasId]) {
    charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dataPoints.map((p) => p.x),
        datasets: [
          {
            label,
            data: dataPoints.map((p) => p.y),
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: { display: true },
          y: { display: true }
        }
      }
    });
  } else {
    charts[canvasId].data.labels = dataPoints.map((p) => p.x);
    charts[canvasId].data.datasets[0].data = dataPoints.map((p) => p.y);
    charts[canvasId].update();
  }
}

// Carga inicial + refresco
loadData();
setInterval(() => loadData(), REFRESH_INTERVAL_MS);

