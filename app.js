// ---------- Configuración ----------
const DATA_URL = "data.json";
const REFRESH_MS = 60_000;

const el = (id) => document.getElementById(id);

// Graficas (Chart.js)
let tempHumChart = null;
let powerLightChart = null;

// ---------- Utilidades ----------
function log(message) {
  const logContainer = el("log");
  if (!logContainer) return;

  const time = new Date().toLocaleTimeString("es-ES", {
    hour12: false,
  });

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
  statusEl.classList.remove(
    "badge-gray",
    "badge-ok",
    "badge-danger",
    "badge-warn"
  );

  switch (type) {
    case "ok":
      statusEl.classList.add("badge-ok");
      break;
    case "error":
      statusEl.classList.add("badge-danger");
      break;
    case "warn":
      statusEl.classList.add("badge-warn");
      break;
    default:
      statusEl.classList.add("badge-gray");
  }
}

function formatTimestampUtc(ts) {
  if (
    !ts ||
    typeof ts.year !== "number" ||
    typeof ts.month !== "number" ||
    typeof ts.day !== "number"
  ) {
    return "--";
  }

  const pad = (n) => String(n).padStart(2, "0");

  const dateStr = `${ts.year}-${pad(ts.month)}-${pad(ts.day)}`;
  const timeStr = `${pad(ts.hour ?? 0)}:${pad(
    ts.minute ?? 0
  )}:${pad(ts.second ?? 0)}`;

  return `${dateStr} ${timeStr} UTC`;
}

// ---------- Panel de medidas ----------
function updateMetrics(data) {
  el("temperature").textContent =
    typeof data.temperature === "number"
      ? data.temperature.toFixed(1)
      : "--";

  el("humidity").textContent =
    typeof data.humidity === "number"
      ? data.humidity.toFixed(1)
      : "--";

  el("vbat").textContent =
    typeof data.vbat === "number"
      ? data.vbat.toFixed(2)
      : "--";

  el("vsolar").textContent =
    typeof data.vsolar === "number"
      ? data.vsolar.toFixed(2)
      : "--";

  el("ldr").textContent =
    data.ldr !== undefined ? String(data.ldr) : "--";

  el("timestamp-utc").textContent = formatTimestampUtc(
    data.timestamp_utc
  );

  el("last-refresh").textContent = new Date().toLocaleString(
    "es-ES"
  );

  setAlarm("alarm_temp_high", data.alarm_temp_high);
  setAlarm("alarm_vbat_high", data.alarm_vbat_high);
  setAlarm("alarm_vbat_low", data.alarm_vbat_low);
  setAlarm("alarm_vsolar_low", data.alarm_vsolar_low);
}

function setAlarm(id, value) {
  const container = el(id);
  if (!container) return;

  const badge =
    container.querySelector(".badge") ||
    document.createElement("span");

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

  if (!container.contains(badge)) {
    container.appendChild(badge);
  }
}

// ---------- Gráficas ----------
function buildLabelFromTs(ts) {
  if (!ts) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const d = `${ts.year}-${pad(ts.month)}-${pad(ts.day)}`;
  const t = `${pad(ts.hour ?? 0)}:${pad(ts.minute ?? 0)}`;
  return `${d} ${t}`;
}

function updateCharts(samples) {
  const labels = samples.map((s) =>
    buildLabelFromTs(s.timestamp_utc)
  );

  const temps = samples.map((s) =>
    typeof s.temperature === "number" ? s.temperature : null
  );
  const hums = samples.map((s) =>
    typeof s.humidity === "number" ? s.humidity : null
  );
  const vbats = samples.map((s) =>
    typeof s.vbat === "number" ? s.vbat : null
  );
  const vsolars = samples.map((s) =>
    typeof s.vsolar === "number" ? s.vsolar : null
  );
  const ldrs = samples.map((s) =>
    s.ldr !== undefined ? Number(s.ldr) : null
  );

  // --- Gráfico temperatura / humedad ---
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
            {
              label: "Temperatura (°C)",
              data: temps,
              yAxisID: "yTemp",
              tension: 0.25,
              pointRadius: 2,
            },
            {
              label: "Humedad (%)",
              data: hums,
              yAxisID: "yHum",
              tension: 0.25,
              pointRadius: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "index",
            intersect: false,
          },
          plugins: {
            legend: {
              position: "bottom",
            },
          },
          scales: {
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 0,
              },
            },
            yTemp: {
              position: "left",
              title: {
                display: true,
                text: "Temperatura (°C)",
              },
            },
            yHum: {
              position: "right",
              title: {
                display: true,
                text: "Humedad (%)",
              },
              grid: {
                drawOnChartArea: false,
              },
            },
          },
        },
      });
    }
  }

  // --- Gráfico Vbat / Vsolar / LDR ---
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
            {
              label: "Vbat (V)",
              data: vbats,
              yAxisID: "yVolt",
              tension: 0.25,
              pointRadius: 2,
            },
            {
              label: "Vsolar (V)",
              data: vsolars,
              yAxisID: "yVolt",
              tension: 0.25,
              pointRadius: 2,
            },
            {
              label: "LDR",
              data: ldrs,
              yAxisID: "yLdr",
              tension: 0.25,
              pointRadius: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "index",
            intersect: false,
          },
          plugins: {
            legend: {
              position: "bottom",
            },
          },
          scales: {
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 0,
              },
            },
            yVolt: {
              position: "left",
              title: {
                display: true,
                text: "Voltios (V)",
              },
            },
            yLdr: {
              position: "right",
              title: {
                display: true,
                text: "LDR (unidades)",
              },
              grid: {
                drawOnChartArea: false,
              },
            },
          },
        },
      });
    }
  }
}

// ---------- Fetch de datos ----------
async function fetchData() {
  const btn = el("refresh-btn");
  if (btn) btn.disabled = true;

  try {
    setConnectionStatus("warn", "Actualizando…");

    const url = `${DATA_URL}?_=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );
    }

    const raw = await response.json();

    // Soportar:
    // - { samples: [...] }
    // - [...] (array directo)
    // - { ... } (una sola muestra, formato viejo)
    let samples = [];
    if (Array.isArray(raw.samples)) {
      samples = raw.samples;
    } else if (Array.isArray(raw)) {
      samples = raw;
    } else if (raw && typeof raw === "object") {
      samples = [raw];
    }

    if (!samples.length) {
      throw new Error("data.json no contiene muestras");
    }

    const latest = samples[samples.length - 1];

    updateMetrics(latest);
    updateCharts(samples);

    setConnectionStatus("ok", "Datos recibidos");
    log(
      `Datos actualizados. Total muestras históricas: ${samples.length}`
    );
  } catch (err) {
    console.error(err);
    setConnectionStatus(
      "error",
      "Error leyendo data.json"
    );
    log(⚠️ Error al leer data.json: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------- Inicialización ----------
function init() {
  const btn = el("refresh-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      fetchData();
    });
  }

  setConnectionStatus("warn", "Esperando primera lectura…");
  log("Inicializando panel de telemetría…");

  fetchData();
  setInterval(fetchData, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", init);
