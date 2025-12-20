// ---------- Configuración ----------
const DATA_URL = "data.json";
const REFRESH_MS = 60_000;
const el = (id) => document.getElementById(id);

// Graficas (Chart.js)
let tempHumChart = null;
let powerLightChart = null;
let pressureChart = null;

// Histórico en memoria para el CSV
let lastSamples = [];

// ---------- Utilidades ----------
function log(message) {
  const logContainer = el("log");
  if (!logContainer) return;

  const time = new Date().toLocaleTimeString("es-ES", { hour12: false });

  const entry = document.createElement("div");
  entry.className = "log-entry";

  const spanTime = document.createElement("span");
  spanTime.className = "log-entry-time";
  spanTime.textContent = `[${time}]`;

  const spanMsg = document.createElement("span");
  spanMsg.className = "log-entry-msg";
  spanMsg.textContent = message;

  entry.appendChild(spanTime);
  entry.appendChild(spanMsg);
  logContainer.prepend(entry);

  const maxLines = 100;
  while (logContainer.children.length > maxLines) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

function setConnectionStatus(type, text) {
  const statusEl = el("connection-status");
  if (!statusEl) return;

  statusEl.textContent = text;
  statusEl.className = "badge";

  if (type === "ok") statusEl.classList.add("badge-ok");
  else if (type === "error") statusEl.classList.add("badge-danger");
  else if (type === "warn") statusEl.classList.add("badge-warn");
  else statusEl.classList.add("badge-gray");
}

// OJO: en tu flujo Node-RED guardas timestamp_utc como HORA LOCAL (no UTC)
// Por eso NO añadimos "UTC" al final.
function formatTimestamp(ts) {
  if (!ts || typeof ts.year !== "number") return "--";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${ts.year}-${pad(ts.month)}-${pad(ts.day)} ` +
    `${pad(ts.hour ?? 0)}:${pad(ts.minute ?? 0)}:${pad(ts.second ?? 0)}`
  );
}

function setAlarm(id, value) {
  const container = el(id);
  if (!container) return;

  const badge = container.querySelector(".badge") || document.createElement("span");
  badge.className = "badge";

  if (value === true) {
    badge.classList.add("badge-danger");
    badge.textContent = "ACTIVA";
  } else if (value === false) {
    badge.classList.add("badge-ok");
    badge.textContent = "OK";
  } else {
    badge.classList.add("badge-gray");
    badge.textContent = "Sin datos";
  }

  if (!container.contains(badge)) container.appendChild(badge);
}

// Helpers para soportar nombres nuevos/viejos
function pickNumber(sample, keys) {
  for (const k of keys) {
    if (typeof sample[k] === "number" && !isNaN(sample[k])) return sample[k];
  }
  return null;
}

// ---------- Panel de medidas ----------
function updateMetrics(sample) {
  const temp = pickNumber(sample, ["temperature", "temperature_c"]);
  const hum = pickNumber(sample, ["humidity", "humidity_percent"]);
  const vbat = pickNumber(sample, ["vbat", "vbat_v"]);
  const vsolar = pickNumber(sample, ["vsolar", "vsolar_v"]);
  const ldr = pickNumber(sample, ["ldr", "ldr_percent"]);          // 0..100
  const pressure = pickNumber(sample, ["pressure_at", "pressure_hpa", "pressure"]);

  el("temperature").textContent = temp !== null ? temp.toFixed(1) : "--";
  el("humidity").textContent = hum !== null ? hum.toFixed(1) : "--";
  el("vbat").textContent = vbat !== null ? vbat.toFixed(3) : "--";
  el("vsolar").textContent = vsolar !== null ? vsolar.toFixed(3) : "--";
  el("ldr").textContent = ldr !== null ? ldr.toFixed(1) : "--";

  const pressureEl = el("pressure");
  if (pressureEl) pressureEl.textContent = pressure !== null ? pressure.toFixed(1) : "--";

  el("timestamp-utc").textContent = formatTimestamp(sample.timestamp_utc);
  el("last-refresh").textContent = new Date().toLocaleString("es-ES");

  setAlarm("alarm_temp_high", sample.alarm_temp_high);
  setAlarm("alarm_vbat_high", sample.alarm_vbat_high);
  setAlarm("alarm_vbat_low", sample.alarm_vbat_low);
  setAlarm("alarm_vsolar_low", sample.alarm_vsolar_low);
  setAlarm("alarm_pressure_low", sample.alarm_pressure_low);
}

// ---------- Gráficas ----------
function buildLabelFromTs(ts) {
  if (!ts) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${ts.year}-${pad(ts.month)}-${pad(ts.day)} ${pad(ts.hour ?? 0)}:${pad(ts.minute ?? 0)}`;
}

function updateCharts(samples) {
  if (!Array.isArray(samples) || !samples.length) return;

  const clean = samples
    .map((s) => {
      if (!s) return null;

      const temperature = pickNumber(s, ["temperature", "temperature_c"]);
      const humidity = pickNumber(s, ["humidity", "humidity_percent"]);
      const vbat = pickNumber(s, ["vbat", "vbat_v"]);
      const vsolar = pickNumber(s, ["vsolar", "vsolar_v"]);
      const ldr = pickNumber(s, ["ldr", "ldr_percent"]);
      const pressure = pickNumber(s, ["pressure_at", "pressure_hpa", "pressure"]);

      // no descartamos por humedad/otros, solo pedimos timestamp + temp al menos
      if (!s.timestamp_utc || typeof s.timestamp_utc.year !== "number") return null;
      if (temperature === null) return null;

      return { ts: s.timestamp_utc, temperature, humidity, vbat, vsolar, ldr, pressure };
    })
    .filter(Boolean);

  if (!clean.length) return;

  const labels = clean.map((s) => buildLabelFromTs(s.ts));
  const temps = clean.map((s) => s.temperature);
  const hums = clean.map((s) => s.humidity);
  const vbats = clean.map((s) => s.vbat);
  const vsolars = clean.map((s) => s.vsolar);
  const ldrs = clean.map((s) => s.ldr);
  const pressures = clean.map((s) => s.pressure);

  // Temp/Hum
  const ctx1 = el("chart-temp-hum");
  if (ctx1) {
    if (tempHumChart) {
      tempHumChart.data.labels = labels;
      tempHumChart.data.datasets[0].data = temps;
      tempHumChart.data.datasets[1].data = hums;
      tempHumChart.update();
    } else {
      tempHumChart = new Chart(ctx1, {
        type: "line",
        data: {
          labels,
          datasets: [
            { label: "Temperatura (°C)", data: temps, yAxisID: "yTemp", tension: 0.25, pointRadius: 2 },
            { label: "Humedad (%)", data: hums, yAxisID: "yHum", tension: 0.25, pointRadius: 2 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "bottom" } },
          scales: {
            x: { ticks: { maxRotation: 45 } },
            yTemp: { position: "left", title: { display: true, text: "°C" } },
            yHum: { position: "right", title: { display: true, text: "%" }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }
  }

  // Vbat/Vsolar/LDR
  const ctx2 = el("chart-power-light");
  if (ctx2) {
    if (powerLightChart) {
      powerLightChart.data.labels = labels;
      powerLightChart.data.datasets[0].data = vbats;
      powerLightChart.data.datasets[1].data = vsolars;
      powerLightChart.data.datasets[2].data = ldrs;
      powerLightChart.update();
    } else {
      powerLightChart = new Chart(ctx2, {
        type: "line",
        data: {
          labels,
          datasets: [
            { label: "Vbat (V)", data: vbats, yAxisID: "yVolt", tension: 0.25, pointRadius: 2 },
            { label: "Vsolar (V)", data: vsolars, yAxisID: "yVolt", tension: 0.25, pointRadius: 2 },
            { label: "Luz (%)", data: ldrs, yAxisID: "yLdr", tension: 0.25, pointRadius: 2 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "bottom" } },
          scales: {
            x: { ticks: { maxRotation: 45 } },
            yVolt: { position: "left", title: { display: true, text: "Voltios (V)" } },
            yLdr: { position: "right", title: { display: true, text: "%" }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }
  }

  // Presión
  const ctx3 = el("chart-pressure");
  if (ctx3) {
    if (pressureChart) {
      pressureChart.data.labels = labels;
      pressureChart.data.datasets[0].data = pressures;
      pressureChart.update();
    } else {
      pressureChart = new Chart(ctx3, {
        type: "line",
        data: { labels, datasets: [{ label: "Presión (hPa)", data: pressures, tension: 0.25, pointRadius: 2 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: { legend: { position: "bottom" } },
          scales: { x: { ticks: { maxRotation: 45 } }, y: { title: { display: true, text: "hPa" } } },
        },
      });
    }
  }
}

// ---------- CSV ----------
function downloadCsv() {
  const clean = (lastSamples || []).filter(
    (s) => s && (typeof s.temperature === "number" || typeof s.temperature_c === "number")
  );

  if (!clean.length) {
    alert("No hay datos suficientes para generar el CSV.");
    return;
  }

  const subset = clean.slice(-50);

  const headerText =
    "Informe Teliot1 en ubicación desconocida. Informe y web desarrollado por http://www.miprochip.com";

  const now = new Date();
  const fechaInforme = now.toLocaleString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const headerCols = [
    "timestamp",
    "temperature",
    "humidity",
    "pressure_at",
    "vbat",
    "vsolar",
    "ldr",
    "alarm_temp_high",
    "alarm_vbat_high",
    "alarm_vbat_low",
    "alarm_vsolar_low",
    "alarm_pressure_low",
  ];

  const lines = [];
  lines.push(headerText);
  lines.push(`Fecha y hora del informe: ${fechaInforme}`);
  lines.push("");
  lines.push(headerCols.join(";"));

  for (const s of subset) {
    const temp = pickNumber(s, ["temperature", "temperature_c"]);
    const hum = pickNumber(s, ["humidity", "humidity_percent"]);
    const pressure = pickNumber(s, ["pressure_at", "pressure_hpa", "pressure"]);
    const vbat = pickNumber(s, ["vbat", "vbat_v"]);
    const vsolar = pickNumber(s, ["vsolar", "vsolar_v"]);
    const ldr = pickNumber(s, ["ldr", "ldr_percent"]);

    const row = [
      formatTimestamp(s.timestamp_utc),
      temp ?? "",
      hum ?? "",
      pressure ?? "",
      vbat ?? "",
      vsolar ?? "",
      ldr ?? "",
      s.alarm_temp_high ? 1 : 0,
      s.alarm_vbat_high ? 1 : 0,
      s.alarm_vbat_low ? 1 : 0,
      s.alarm_vsolar_low ? 1 : 0,
      s.alarm_pressure_low ? 1 : 0,
    ].join(";");

    lines.push(row);
  }

  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "teliot1_informe.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  log(`CSV generado con ${subset.length} muestras.`);
}

// ---------- Fetch ----------
async function fetchData() {
  const btn = el("refresh-btn");
  if (btn) btn.disabled = true;

  try {
    setConnectionStatus("warn", "Actualizando…");
    const url = `${DATA_URL}?_=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();

    let samples = [];
    if (Array.isArray(raw.samples)) samples = raw.samples;
    else if (Array.isArray(raw)) samples = raw;
    else samples = [raw];

    if (!samples.length) throw new Error("data.json vacío");

    lastSamples = samples;

    const latest = samples[samples.length - 1];
    updateMetrics(latest);
    updateCharts(samples);

    setConnectionStatus("ok", "Datos recibidos");
    log(`Histórico actualizado: ${samples.length} muestras.`);
  } catch (err) {
    console.error(err);
    setConnectionStatus("error", "Error cargando datos");
    log("⚠️ " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- Inicialización ----------
function init() {
  const btn = el("refresh-btn");
  if (btn) btn.addEventListener("click", fetchData);

  const btnCsv = el("download-csv");
  if (btnCsv) btnCsv.addEventListener("click", downloadCsv);

  setConnectionStatus("warn", "Esperando primera lectura…");
  log("Inicializando panel…");

  fetchData();
  setInterval(fetchData, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", init);
