/* Astrohosting — logique frontend, 100% statique (aucun backend applicatif).
 *
 * - Les sites sont définis dans sites.yaml (chargé et parsé ici avec js-yaml).
 * - Les prévisions détaillées (nuages par altitude, vent, humidité) viennent
 *   d'Open-Meteo, qui autorise les appels directs depuis le navigateur (CORS).
 * - Le seeing / la transparence atmosphérique viennent du graphique officiel
 *   7Timer! ASTRO, intégré comme simple image (pas de souci CORS pour un <img>).
 * - La carte des nuages est le widget embarqué Windy.
 * - Les mesures OWLNET passent par le proxy Nginx /owlnet/ (l'API KASI
 *   n'autorise pas CORS).
 */

const state = {
  sites: [],
  activeSiteId: null,
};

const els = {
  siteList: document.getElementById("site-list"),
  emptyState: document.getElementById("empty-state"),
  siteView: document.getElementById("site-view"),
  siteName: document.getElementById("site-name"),
  siteMeta: document.getElementById("site-meta"),
  siteNotes: document.getElementById("site-notes"),
  lastUpdated: document.getElementById("last-updated"),
  weatherStatus: document.getElementById("weather-status"),
  weatherTable: document.getElementById("weather-table"),
  weatherBody: document.getElementById("weather-body"),
  cloudMap: document.getElementById("cloud-map"),
  satelliteMap: document.getElementById("satellite-map"),
  astroChart: document.getElementById("astro-chart"),
  owlnetSection: document.getElementById("owlnet-section"),
  owlnetStatus: document.getElementById("owlnet-status"),
  owlnetBody: document.getElementById("owlnet-body"),
  owlnetCurrent: document.getElementById("owlnet-current"),
  owlnetCharts: document.getElementById("owlnet-charts"),
  owlnetUpdated: document.getElementById("owlnet-updated"),
  owlnetRange: document.getElementById("owlnet-range"),
  owlnetToolbar: document.getElementById("owlnet-toolbar"),
  owlnetSourceLink: document.getElementById("owlnet-source-link"),
  instrumentsSection: document.getElementById("instruments-section"),
  instrumentTabs: document.getElementById("instrument-tabs"),
  instrumentContainer: document.getElementById("instrument-container"),
  cameraTabs: document.getElementById("camera-tabs"),
  cameraContainer: document.getElementById("camera-container"),
  sunTimesLocalLabel: document.getElementById("sun-times-local-label"),
  sunTimesLocal: document.getElementById("sun-times-local"),
  sunTimesBrowserLabel: document.getElementById("sun-times-browser-label"),
  sunTimesBrowser: document.getElementById("sun-times-browser"),
};

const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
els.sunTimesBrowserLabel.textContent = `Lever / coucher (votre heure – ${BROWSER_TIMEZONE})`;

init();

async function init() {
  try {
    const res = await fetch("sites.yaml", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = jsyaml.load(text) || {};
    state.sites = data.sites || [];
    renderSiteList();
    if (state.sites.length > 0) {
      selectSite(state.sites[0].id);
    }
  } catch (err) {
    els.siteList.innerHTML = `<li class="site-item error">Erreur de chargement de sites.yaml : ${escapeHtml(
      String(err.message || err)
    )}</li>`;
  }
}

function renderSiteList() {
  if (state.sites.length === 0) {
    els.siteList.innerHTML = `<li class="site-item error">Aucun site défini dans sites.yaml</li>`;
    return;
  }
  els.siteList.innerHTML = "";
  for (const site of state.sites) {
    const li = document.createElement("li");
    li.className = "site-item";
    li.dataset.siteId = site.id;
    li.innerHTML = `
      <div class="name">${escapeHtml(site.name || site.id)}</div>
      <div class="coords">${formatCoords(site)}${
      site.elevation_m != null ? ` · ${site.elevation_m} m` : ""
    }</div>
    `;
    li.addEventListener("click", () => selectSite(site.id));
    els.siteList.appendChild(li);
  }
}

function selectSite(siteId) {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site) return;
  state.activeSiteId = siteId;

  document.querySelectorAll(".site-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.siteId === siteId);
  });

  els.emptyState.classList.add("hidden");
  els.siteView.classList.remove("hidden");

  els.siteName.textContent = site.name || site.id;
  els.siteMeta.textContent = `${formatCoords(site)}${
    site.elevation_m != null ? ` · ${site.elevation_m} m d'altitude` : ""
  }${site.timezone ? ` · ${site.timezone}` : ""}`;
  els.siteNotes.textContent = site.notes ? site.notes.trim() : "";
  els.lastUpdated.textContent = "";

  els.sunTimesLocalLabel.textContent = `Lever / coucher (heure du site${
    site.timezone ? ` – ${site.timezone}` : ""
  })`;
  els.sunTimesLocal.textContent = "…";
  els.sunTimesBrowser.textContent = "…";

  renderCloudMap(site);
  renderSatelliteMap(site);
  renderAstroChart(site);
  loadOwlnet(site);
  renderInstrumentPanel(site);

  cameraPanel.render(getCameras(site), site, "Caméra");

  loadWeather(site);
}

/* ---------------- Carte des nuages (Windy) ---------------- */

function renderCloudMap(site) {
  const params = new URLSearchParams({
    lat: site.lat,
    lon: site.lon,
    detailLat: site.lat,
    detailLon: site.lon,
    width: "650",
    height: "650",
    zoom: "8",
    level: "surface",
    overlay: "clouds",
    product: "ecmwf",
    menu: "",
    message: "true",
    marker: "true",
    calendar: "now",
    pressure: "",
    type: "map",
    location: "coordinates",
    metricWind: "km/h",
    metricTemp: "°C",
    metricRain: "mm",
    radarRange: "-1",
  });
  els.cloudMap.src = `https://embed.windy.com/embed2.html?${params.toString()}`;
}

/* ---------------- Satellite temps réel (I'm Weather, nowcast) ---------------- */

function renderSatelliteMap(site) {
  // Widget d'embed dédié (via le bouton "Share & Embed" d'imweather.com),
  // beaucoup plus compact que l'appli complète (pas de menu/pub/panneau de
  // calques) : juste la carte, sa légende et le curseur temporel.
  const params = new URLSearchParams({
    lat: site.lat,
    lng: site.lon,
    z: "7.00",
    model: "nowcast",
    element: "satellite",
    hideLayers: "",
    autostart: "true",
    interactive: "true",
  });
  els.satelliteMap.src = `https://imweather.com/widget/map?${params.toString()}`;
}

/* ---------------- Graphique astro (7Timer!) ---------------- */

function renderAstroChart(site) {
  const params = new URLSearchParams({
    lon: site.lon,
    lat: site.lat,
    ac: "0",
    lang: "fr",
    unit: "metric",
    output: "internal",
    tzshift: "0",
  });
  els.astroChart.src = `https://www.7timer.info/bin/astro.php?${params.toString()}`;
}

/* ---------------- Prévisions détaillées (Open-Meteo) ---------------- */

async function loadWeather(site) {
  els.weatherStatus.textContent = "Chargement des prévisions…";
  els.weatherStatus.classList.remove("hidden");
  els.weatherTable.classList.add("hidden");

  const params = new URLSearchParams({
    latitude: site.lat,
    longitude: site.lon,
    hourly:
      "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,wind_speed_10m,temperature_2m,precipitation_probability",
    daily: "sunrise,sunset",
    timezone: "auto",
    forecast_days: "3",
    // Unités internationales explicites (le défaut d'Open-Meteo est déjà
    // métrique, mais on le fixe pour éviter toute surprise).
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderWeatherTable(data);
    renderSunTimes(data);
    els.lastUpdated.textContent = `Mis à jour à ${new Date().toLocaleTimeString(
      "fr-FR"
    )}`;
    els.weatherStatus.classList.add("hidden");
    els.weatherTable.classList.remove("hidden");
  } catch (err) {
    els.weatherStatus.textContent = `Erreur de chargement des prévisions : ${String(
      err.message || err
    )}`;
    els.sunTimesLocal.textContent = "Indisponible";
    els.sunTimesBrowser.textContent = "Indisponible";
  }
}

/* ---------------- Lever / coucher du soleil ---------------- */

function renderSunTimes(data) {
  const daily = data.daily;
  if (!daily || !daily.sunrise?.length || !daily.sunset?.length) {
    els.sunTimesLocal.textContent = "Indisponible";
    els.sunTimesBrowser.textContent = "Indisponible";
    return;
  }

  // Open-Meteo (avec timezone=auto) renvoie des heures "murales" locales au
  // site, sans indicatif de fuseau (ex: "2026-08-05T06:32"). On les affiche
  // telles quelles pour la colonne "heure du site", et on les convertit en
  // un instant UTC réel (via utc_offset_seconds) pour les reformater dans le
  // fuseau horaire du navigateur de l'utilisateur.
  const utcOffsetSeconds = data.utc_offset_seconds || 0;
  const sunriseLocalStr = daily.sunrise[0];
  const sunsetLocalStr = daily.sunset[0];

  els.sunTimesLocal.textContent = `${extractTime(sunriseLocalStr)} → ${extractTime(sunsetLocalStr)}`;

  const sunriseUtc = localWallTimeToDate(sunriseLocalStr, utcOffsetSeconds);
  const sunsetUtc = localWallTimeToDate(sunsetLocalStr, utcOffsetSeconds);
  els.sunTimesBrowser.textContent = `${formatTimeOnly(sunriseUtc)} → ${formatTimeOnly(sunsetUtc)}`;
}

function extractTime(isoLocalString) {
  return isoLocalString.split("T")[1] || isoLocalString;
}

function localWallTimeToDate(isoLocalString, utcOffsetSeconds) {
  const pretendUtcMs = Date.parse(`${isoLocalString}Z`);
  return new Date(pretendUtcMs - utcOffsetSeconds * 1000);
}

function formatTimeOnly(date) {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function renderWeatherTable(data) {
  const h = data.hourly;
  els.weatherBody.innerHTML = "";
  if (!h || !h.time) return;

  const now = new Date();
  const STEP_HOURS = 3;

  for (let i = 0; i < h.time.length; i++) {
    const t = new Date(h.time[i]);
    if (t < now) continue; // n'affiche pas les heures déjà passées
    if ((i % STEP_HOURS) !== 0) continue;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateTime(t)}</td>
      <td>${cloudBadge(h.cloud_cover?.[i])}</td>
      <td>${cloudBadge(h.cloud_cover_low?.[i])}</td>
      <td>${cloudBadge(h.cloud_cover_mid?.[i])}</td>
      <td>${cloudBadge(h.cloud_cover_high?.[i])}</td>
      <td>${percentBadge(h.relative_humidity_2m?.[i], [70, 90])}</td>
      <td>${windBadge(h.wind_speed_10m?.[i])}</td>
      <td>${h.temperature_2m?.[i] != null ? h.temperature_2m[i].toFixed(0) + "°C" : "—"}</td>
      <td>${percentBadge(h.precipitation_probability?.[i], [20, 60])}</td>
    `;
    els.weatherBody.appendChild(tr);
  }

  if (!els.weatherBody.children.length) {
    els.weatherBody.innerHTML = `<tr><td colspan="9">Pas de données à venir</td></tr>`;
  }
}

function cloudBadge(value) {
  return percentBadge(value, [20, 50]);
}

function percentBadge(value, [lowMax, midMax]) {
  if (value == null || Number.isNaN(value)) return "—";
  const cls = value <= lowMax ? "good" : value <= midMax ? "mid" : "bad";
  return `<span class="badge ${cls}">${Math.round(value)}%</span>`;
}

function windBadge(speedKmh) {
  if (speedKmh == null || Number.isNaN(speedKmh)) return "—";
  const cls = speedKmh <= 15 ? "good" : speedKmh <= 30 ? "mid" : "bad";
  return `<span class="badge ${cls}">${Math.round(speedKmh)} km/h</span>`;
}

function formatDateTime(date) {
  return date.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------------- Station OWLNET (mesures locales + historique) ---------------- */

const OWLNET_METRICS = [
  {
    key: "t",
    list: "t_list",
    label: "Température",
    unit: "°C",
    color: "#7c9cff",
    decimals: 1,
    classify: classifyOwlnetTemp,
  },
  {
    key: "h",
    list: "h_list",
    label: "Humidité",
    unit: "%",
    color: "#5ec8d8",
    decimals: 1,
    yMin: 0,
    yMax: 100,
    classify: classifyOwlnetHumidity,
  },
  {
    key: "c",
    list: "c_list",
    label: "Cloud",
    unit: "",
    color: "#b49cff",
    decimals: 1,
    classify: classifyOwlnetCloud,
  },
  {
    key: "w",
    list: "w_list",
    label: "Vent",
    unit: "m/s",
    color: "#52c77a",
    decimals: 1,
    yMin: 0,
    classify: classifyOwlnetWind,
  },
];

const owlnetState = {
  siteId: null,
  rangeHours: 24,
  refreshTimer: null,
  sinceTimer: null,
  latestUpdate: null,
  requestId: 0,
};

els.owlnetRange.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-hours]");
  if (!btn) return;
  const hours = Number(btn.dataset.hours);
  if (!hours || hours === owlnetState.rangeHours) return;
  owlnetState.rangeHours = hours;
  els.owlnetRange.querySelectorAll("[data-hours]").forEach((el) => {
    el.classList.toggle("active", el === btn);
  });
  const site = state.sites.find((s) => s.id === owlnetState.siteId);
  if (site) fetchOwlnet(site);
});

function classifyOwlnetTemp(_value, flag) {
  return flag === "N" ? "bad" : "";
}

function classifyOwlnetHumidity(value, flag) {
  if (flag === "N") return "bad";
  if (value == null) return "";
  if (value <= 70) return "good";
  if (value <= 90) return "mid";
  return "bad";
}

function classifyOwlnetCloud(value, flag) {
  if (flag === "N") return "bad";
  if (value == null) return "";
  // Cloudhood IR : plus négatif = ciel plus clair.
  if (value <= -15) return "good";
  if (value <= -5) return "mid";
  return "bad";
}

function classifyOwlnetWind(value, flag) {
  if (flag === "N") return "bad";
  if (value == null) return "";
  if (value <= 4) return "good";
  if (value <= 8) return "mid";
  return "bad";
}

function loadOwlnet(site) {
  clearOwlnetTimers();
  owlnetState.siteId = site.id;
  owlnetState.latestUpdate = null;
  owlnetState.requestId += 1;

  const cfg = site.owlnet;
  if (!cfg || cfg.obs_id == null) {
    return;
  }

  els.owlnetUpdated.textContent = "";
  els.owlnetBody.classList.add("hidden");
  els.owlnetStatus.textContent = "Chargement des mesures OWLNET…";
  els.owlnetStatus.classList.remove("hidden");
  if (cfg.source_url && els.owlnetSourceLink) {
    els.owlnetSourceLink.href = cfg.source_url;
  }

  fetchOwlnet(site);
  const refreshSeconds = Number(cfg.refresh_seconds) || 60;
  owlnetState.refreshTimer = setInterval(() => {
    if (state.activeSiteId === site.id) fetchOwlnet(site);
  }, refreshSeconds * 1000);
  owlnetState.sinceTimer = setInterval(updateOwlnetSince, 1000);
}

function clearOwlnetTimers() {
  if (owlnetState.refreshTimer) {
    clearInterval(owlnetState.refreshTimer);
    owlnetState.refreshTimer = null;
  }
  if (owlnetState.sinceTimer) {
    clearInterval(owlnetState.sinceTimer);
    owlnetState.sinceTimer = null;
  }
}

function formatOwlnetStamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

function parseOwlnetUtc(dateTimeStr) {
  if (!dateTimeStr) return null;
  const normalized = String(dateTimeStr).trim().replace(" ", "T");
  const parsed = Date.parse(`${normalized}Z`);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function parseOwlnetPoint(entry) {
  if (!Array.isArray(entry) || entry.length < 1) {
    return { value: null, flag: "O" };
  }
  const raw = entry[0];
  const flag = entry[1] === "N" ? "N" : "O";
  if (raw == null || raw === "N/A" || raw === "") {
    return { value: null, flag };
  }
  const value = Number(raw);
  return { value: Number.isFinite(value) ? value : null, flag };
}

async function fetchOwlnet(site) {
  const cfg = site.owlnet;
  if (!cfg || cfg.obs_id == null) return;
  if (state.activeSiteId !== site.id) return;

  const requestId = ++owlnetState.requestId;
  const now = new Date();
  const min = new Date(now.getTime() - owlnetState.rangeHours * 3600 * 1000);
  const params = new URLSearchParams({
    obs_id: String(cfg.obs_id),
    now: formatOwlnetStamp(now),
    min: formatOwlnetStamp(min),
  });
  const url = `owlnet/skyw/get_weather_data?${params.toString()}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "proxy Nginx OWLNET introuvable (lancez le site via Docker)"
          : `HTTP ${res.status}`
      );
    }
    const data = await res.json();
    if (requestId !== owlnetState.requestId || state.activeSiteId !== site.id) {
      return;
    }
    if (!data || data.result === false || !Array.isArray(data.time_list)) {
      throw new Error("réponse OWLNET invalide");
    }
    renderOwlnet(data, site);
    els.owlnetStatus.classList.add("hidden");
    els.owlnetBody.classList.remove("hidden");
  } catch (err) {
    if (requestId !== owlnetState.requestId || state.activeSiteId !== site.id) {
      return;
    }
    els.owlnetBody.classList.add("hidden");
    els.owlnetStatus.classList.remove("hidden");
    els.owlnetStatus.textContent = `Erreur de chargement OWLNET : ${String(
      err.message || err
    )}`;
    els.owlnetUpdated.textContent = "";
    owlnetState.latestUpdate = null;
  }
}

function renderOwlnet(data, site) {
  const times = data.time_list.map(parseOwlnetUtc);
  const series = OWLNET_METRICS.map((metric) => {
    const raw = data[metric.list] || [];
    const points = raw.map(parseOwlnetPoint);
    return {
      ...metric,
      values: points.map((p) => p.value),
      flags: points.map((p) => p.flag),
    };
  });

  const latest = series.map((metric) => {
    for (let i = metric.values.length - 1; i >= 0; i--) {
      if (metric.values[i] != null) {
        return { value: metric.values[i], flag: metric.flags[i] };
      }
    }
    return { value: null, flag: "O" };
  });

  els.owlnetCurrent.innerHTML = OWLNET_METRICS.map((metric, i) => {
    const { value, flag } = latest[i];
    const cls = metric.classify(value, flag);
    const text =
      value == null ? "—" : value.toFixed(metric.decimals);
    const unit = value == null || !metric.unit
      ? ""
      : `<span class="owlnet-metric-unit">${escapeHtml(metric.unit)}</span>`;
    return `
      <div class="owlnet-metric">
        <span class="owlnet-metric-label">${escapeHtml(metric.label)}</span>
        <span class="owlnet-metric-value ${cls}">${text}${unit}</span>
      </div>
    `;
  }).join("");

  const latestUpdate =
    parseOwlnetUtc(
      data.latest_update_date_time
        ? `${data.latest_update_date_time.date} ${data.latest_update_date_time.time}`
        : null
    ) || times.filter(Boolean).at(-1) || null;
  owlnetState.latestUpdate = latestUpdate;
  updateOwlnetSince();

  renderOwlnetCharts(times, series, site);
}

function updateOwlnetSince() {
  if (!owlnetState.latestUpdate) return;
  const ageMs = Date.now() - owlnetState.latestUpdate.getTime();
  const age = formatDuration(Math.max(0, ageMs));
  const stamp = formatOwlnetDisplayTime(
    owlnetState.latestUpdate,
    currentOwlnetTimezone()
  );
  els.owlnetUpdated.textContent = `${stamp} · + ${age}`;
}

function currentOwlnetTimezone() {
  const site = state.sites.find((s) => s.id === owlnetState.siteId);
  return site?.timezone || BROWSER_TIMEZONE;
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatOwlnetDisplayTime(date, timeZone) {
  return date.toLocaleString("fr-FR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downsampleIndices(length, maxPoints) {
  if (length <= maxPoints) {
    return Array.from({ length }, (_, i) => i);
  }
  const out = [];
  const step = (length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(Math.round(i * step));
  }
  return out;
}

function renderOwlnetCharts(times, series, site) {
  const validPairs = times
    .map((time, i) => ({ time, i }))
    .filter((p) => p.time);
  if (validPairs.length < 2) {
    els.owlnetCharts.innerHTML = `<p class="status-msg">Pas assez de points pour tracer l'historique.</p>`;
    return;
  }

  const maxPoints = owlnetState.rangeHours > 24 ? 520 : 420;
  const picked = downsampleIndices(validPairs.length, maxPoints).map(
    (idx) => validPairs[idx]
  );
  const chartTimes = picked.map((p) => p.time);
  const chartSeries = series.map((metric) => ({
    ...metric,
    values: picked.map((p) => metric.values[p.i]),
    flags: picked.map((p) => metric.flags[p.i]),
  }));

  const width = 860;
  const padL = 48;
  const padR = 14;
  const padT = 10;
  const padB = 26;
  const plotH = 92;
  const gap = 18;
  const plotW = width - padL - padR;
  const height = padT + chartSeries.length * plotH + (chartSeries.length - 1) * gap + padB;
  const xAt = (i) => padL + (i / (chartTimes.length - 1)) * plotW;

  const yTicks = 3;
  const xTickCount = owlnetState.rangeHours > 24 ? 7 : 8;
  const xTickIdx = downsampleIndices(chartTimes.length, xTickCount);
  const timeZone = site.timezone || BROWSER_TIMEZONE;

  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Historique OWLNET">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="#0e1320"/>`;

  chartSeries.forEach((metric, s) => {
    const top = padT + s * (plotH + gap);
    const nums = metric.values.filter((v) => v != null);
    let yMin = nums.length ? Math.min(...nums) : 0;
    let yMax = nums.length ? Math.max(...nums) : 1;
    if (metric.yMin != null) yMin = Math.min(yMin, metric.yMin);
    if (metric.yMax != null) yMax = Math.max(yMax, metric.yMax);
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const pad = (yMax - yMin) * 0.12;
    if (metric.yMin == null) yMin -= pad;
    if (metric.yMax == null) yMax += pad;
    const yAt = (v) => top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    const gid = `owlnet-fill-${metric.key}`;

    svg += `<rect x="${padL}" y="${top}" width="${plotW}" height="${plotH}" fill="#12182a"/>`;
    for (let t = 0; t < yTicks; t++) {
      const ratio = t / (yTicks - 1);
      const value = yMax - ratio * (yMax - yMin);
      const y = top + ratio * plotH;
      svg += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#262d42" stroke-width="1"/>`;
      svg += `<text x="${padL - 6}" y="${y + 3.5}" text-anchor="end" fill="#9aa3bd" font-size="10">${value.toFixed(
        metric.key === "w" && Math.abs(yMax - yMin) < 4 ? 1 : 0
      )}</text>`;
    }

    const segments = [];
    let current = [];
    metric.values.forEach((value, i) => {
      if (value == null) {
        if (current.length) segments.push(current);
        current = [];
        return;
      }
      current.push({ i, value });
    });
    if (current.length) segments.push(current);

    svg += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${metric.color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${metric.color}" stop-opacity="0.02"/>
    </linearGradient></defs>`;

    for (const seg of segments) {
      if (seg.length === 1) {
        const p = seg[0];
        svg += `<circle cx="${xAt(p.i)}" cy="${yAt(p.value)}" r="2.2" fill="${metric.color}"/>`;
        continue;
      }
      const line = seg
        .map((p, idx) => `${idx === 0 ? "M" : "L"}${xAt(p.i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
        .join(" ");
      const area = `${line} L${xAt(seg[seg.length - 1].i).toFixed(1)},${(top + plotH).toFixed(1)} L${xAt(seg[0].i).toFixed(1)},${(top + plotH).toFixed(1)} Z`;
      svg += `<path d="${area}" fill="url(#${gid})"/>`;
      svg += `<path d="${line}" fill="none" stroke="${metric.color}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    const lastIdx = metric.values.findLastIndex((v) => v != null);
    if (lastIdx >= 0) {
      svg += `<circle cx="${xAt(lastIdx)}" cy="${yAt(metric.values[lastIdx])}" r="3.4" fill="${metric.color}" stroke="#0e1320" stroke-width="1.5"/>`;
    }

    svg += `<text x="${padL + 6}" y="${top + 13}" fill="${metric.color}" font-size="11" font-weight="600">${escapeHtml(
      metric.label
    )}${metric.unit ? ` (${escapeHtml(metric.unit)})` : ""}</text>`;

    metric._yAt = yAt;
    metric._top = top;
  });

  for (const i of xTickIdx) {
    const x = xAt(i);
    svg += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${height - padB}" stroke="#262d42" stroke-width="1" stroke-dasharray="2 4"/>`;
    const label = chartTimes[i].toLocaleString("fr-FR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    svg += `<text x="${x}" y="${height - 8}" text-anchor="middle" fill="#9aa3bd" font-size="10">${label}</text>`;
  }

  svg += `<line class="owlnet-hover-line" x1="0" y1="${padT}" x2="0" y2="${height - padB}" stroke="#7c9cff" stroke-width="1" opacity="0"/>`;
  svg += `</svg><div class="owlnet-tooltip" hidden></div>`;
  els.owlnetCharts.innerHTML = svg;

  bindOwlnetChartHover(chartTimes, chartSeries, {
    width,
    padL,
    plotW,
    timeZone,
  });
}

function bindOwlnetChartHover(times, series, geom) {
  const svg = els.owlnetCharts.querySelector("svg");
  const tooltip = els.owlnetCharts.querySelector(".owlnet-tooltip");
  const hoverLine = els.owlnetCharts.querySelector(".owlnet-hover-line");
  if (!svg || !tooltip || !hoverLine) return;

  const nearestIndex = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const xSvg = ((clientX - rect.left) / rect.width) * geom.width;
    const ratio = (xSvg - geom.padL) / geom.plotW;
    return Math.max(0, Math.min(times.length - 1, Math.round(ratio * (times.length - 1))));
  };

  const hide = () => {
    tooltip.hidden = true;
    hoverLine.setAttribute("opacity", "0");
  };

  const show = (event) => {
    const i = nearestIndex(event.clientX);
    const x = geom.padL + (i / (times.length - 1)) * geom.plotW;
    hoverLine.setAttribute("x1", x);
    hoverLine.setAttribute("x2", x);
    hoverLine.setAttribute("opacity", "0.7");

    const rows = series
      .map((metric) => {
        const value = metric.values[i];
        const text = value == null ? "—" : `${value.toFixed(metric.decimals)}${metric.unit ? ` ${metric.unit}` : ""}`;
        return `<div class="owlnet-tooltip-row"><span style="color:${metric.color}">${escapeHtml(
          metric.label
        )}</span><span>${escapeHtml(text)}</span></div>`;
      })
      .join("");
    tooltip.innerHTML = `<div class="owlnet-tooltip-time">${escapeHtml(
      formatOwlnetDisplayTime(times[i], geom.timeZone)
    )}</div>${rows}`;
    tooltip.hidden = false;

    const wrap = els.owlnetCharts.getBoundingClientRect();
    const left = event.clientX - wrap.left + 14;
    const top = event.clientY - wrap.top + 14;
    const maxLeft = wrap.width - tooltip.offsetWidth - 8;
    const maxTop = wrap.height - tooltip.offsetHeight - 8;
    tooltip.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(top, maxTop))}px`;
  };

  svg.addEventListener("mousemove", show);
  svg.addEventListener("mouseleave", hide);
}

// Un site peut définir "camera"/"instrument" (objet unique) ou
// "cameras"/"instruments" (liste, affichée sous forme d'onglets si plus d'un
// élément) — on normalise en liste ici.
function getCameras(site) {
  if (Array.isArray(site.cameras)) return site.cameras;
  if (site.camera) return [site.camera];
  return [];
}

function getInstruments(site) {
  if (Array.isArray(site.instruments)) return site.instruments;
  if (site.instrument) return [site.instrument];
  return [];
}

function hasOwlnet(site) {
  return !!(site.owlnet && site.owlnet.obs_id != null);
}

function getInstrumentItems(site) {
  const items = getInstruments(site);
  if (hasOwlnet(site)) {
    return [{ name: "OWLNET", type: "owlnet" }, ...items];
  }
  return items;
}

function setOwlnetTabVisible(visible) {
  els.owlnetSection.classList.toggle("hidden", !visible);
  els.owlnetToolbar.classList.toggle("hidden", !visible);
  els.instrumentContainer.classList.toggle("hidden", visible);
}

function renderInstrumentPanel(site, activeIndex = 0) {
  const items = getInstrumentItems(site);
  if (items.length === 0) {
    els.instrumentsSection.classList.add("hidden");
    instrumentPanel.clearRefreshInterval();
    els.instrumentTabs.innerHTML = "";
    setOwlnetTabVisible(false);
    els.instrumentContainer.classList.add("hidden");
    return;
  }

  els.instrumentsSection.classList.remove("hidden");

  if (!hasOwlnet(site)) {
    setOwlnetTabVisible(false);
    els.instrumentContainer.classList.remove("hidden");
    instrumentPanel.render(items, site, "Instrument", activeIndex);
    return;
  }

  els.instrumentTabs.innerHTML = "";
  if (items.length > 1) {
    els.instrumentTabs.classList.remove("hidden");
    items.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "camera-tab" + (i === activeIndex ? " active" : "");
      btn.textContent = item.name || `Instrument ${i + 1}`;
      btn.addEventListener("click", () => renderInstrumentPanel(site, i));
      els.instrumentTabs.appendChild(btn);
    });
  } else {
    els.instrumentTabs.classList.add("hidden");
  }

  const item = items[activeIndex];
  if (item.type === "owlnet") {
    setOwlnetTabVisible(true);
    instrumentPanel.clearRefreshInterval();
    els.instrumentContainer.innerHTML = "";
    return;
  }

  setOwlnetTabVisible(false);
  els.instrumentContainer.classList.remove("hidden");
  instrumentPanel.renderMedia(item, site);
}

// Fabrique un panneau à onglets (utilisé pour les caméras et les instruments
// locaux) : chaque entrée est une image rafraîchie, une iframe ou un flux
// HLS. `tabsEl`/`containerEl` sont les éléments DOM cibles.
function createTabbedMediaPanel(tabsEl, containerEl, emptyMessage) {
  let refreshInterval = null;

  function clearRefreshInterval() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  function render(items, site, labelPrefix, activeIndex = 0) {
    tabsEl.innerHTML = "";

    if (items.length === 0) {
      tabsEl.classList.add("hidden");
      clearRefreshInterval();
      containerEl.innerHTML = `<p class="status-msg">${emptyMessage}</p>`;
      return;
    }

    if (items.length > 1) {
      tabsEl.classList.remove("hidden");
      items.forEach((item, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "camera-tab" + (i === activeIndex ? " active" : "");
        btn.textContent = item.name || `${labelPrefix} ${i + 1}`;
        btn.addEventListener("click", () => render(items, site, labelPrefix, i));
        tabsEl.appendChild(btn);
      });
    } else {
      tabsEl.classList.add("hidden");
    }

    renderMedia(items[activeIndex], site);
  }

  function renderMedia(item, site) {
    clearRefreshInterval();
    containerEl.innerHTML = "";

    if (!item || !item.url) {
      containerEl.innerHTML = `<p class="status-msg">${emptyMessage}</p>`;
      return;
    }

    if (item.type === "iframe") {
      const iframe = document.createElement("iframe");
      iframe.src = item.url;
      iframe.title = item.name || site.name;
      iframe.allowFullscreen = true;
      containerEl.appendChild(iframe);
      return;
    }

    if (item.type === "hls") {
      const video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      containerEl.appendChild(video);

      if (window.Hls && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(item.url);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = item.url;
      } else {
        containerEl.innerHTML = `<p class="status-msg">Flux HLS non supporté par ce navigateur.</p>`;
      }
      return;
    }

    // Par défaut : type "image" (snapshot statique/rafraîchi périodiquement)
    const img = document.createElement("img");
    img.alt = item.name || site.name;
    const refreshSeconds = item.refresh_seconds || 60;
    const setSrc = () => {
      const sep = item.url.includes("?") ? "&" : "?";
      img.src = `${item.url}${sep}t=${Date.now()}`;
    };
    setSrc();
    containerEl.appendChild(img);
    refreshInterval = setInterval(setSrc, refreshSeconds * 1000);
  }

  return { render, renderMedia, clearRefreshInterval };
}

const cameraPanel = createTabbedMediaPanel(
  els.cameraTabs,
  els.cameraContainer,
  "Aucune caméra configurée pour ce site."
);

const instrumentPanel = createTabbedMediaPanel(
  els.instrumentTabs,
  els.instrumentContainer,
  "Aucun instrument local configuré pour ce site."
);

/* ---------------- Utils ---------------- */

function formatCoords(site) {
  const lat = Number(site.lat).toFixed(4);
  const lon = Number(site.lon).toFixed(4);
  return `${lat}°, ${lon}°`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
