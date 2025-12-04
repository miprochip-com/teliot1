// Configuración
const DATA_URL = "data.json"; // mismo directorio que index.html
const REFRESH_MS = 60_000; // 60s

const el = (id) => document.getElementById(id);

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

  logContainer.prepend(entry); // entradas nuevas arriba

  // limitar nº de líneas
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

function updateMetrics(data) {
  // Valores básicos
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

  // Timestamp del nodo
  el("timestamp-utc").textContent = formatTimestampUtc(
    data.timestamp_utc
  );

  // Marca de tiempo local de actualización
  el("last-refresh").textContent = new Date().toLocaleString(
    "es-ES"
  );

  // Alarmas
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

async function fetchData() {
  const btn = el("refresh-btn");
  if (btn) btn.disabled = true;

  try {
    setConnectionStatus("warn", "Actualizando…");

    // cache-busting para que GitHub no sirva contenido cacheado
    const url = `${DATA_URL}?_=${Date.now()}`;
    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    updateMetrics(data);
    setConnectionStatus("ok", "Datos recibidos");
    log("Datos actualizados correctamente.");
  } catch (err) {
    console.error(err);
    setConnectionStatus(
      "error",
      "Error leyendo data.json"
    );
    log("⚠️ Error al leer data.json: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function init() {
  const btn = el("refresh-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      fetchData();
    });
  }

  setConnectionStatus("warn", "Esperando primera lectura…");
  log("Inicializando panel de telemetría…");

  // Primera lectura inmediata
  fetchData();

  // Refresco periódico
  setInterval(fetchData, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", init);

