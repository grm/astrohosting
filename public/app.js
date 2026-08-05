/* Astrohosting — logique frontend, 100% statique (aucun backend).
 *
 * - Les sites sont définis dans sites.yaml (chargé et parsé ici avec js-yaml).
 * - Les prévisions détaillées (nuages par altitude, vent, humidité) viennent
 *   d'Open-Meteo, qui autorise les appels directs depuis le navigateur (CORS).
 * - Le seeing / la transparence atmosphérique viennent du graphique officiel
 *   7Timer! ASTRO, intégré comme simple image (pas de souci CORS pour un <img>).
 * - La carte des nuages est le widget embarqué Windy.
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

  const instruments = getInstruments(site);
  els.instrumentsSection.classList.toggle("hidden", instruments.length === 0);
  instrumentPanel.render(instruments, site, "Instrument");

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

/* ---------------- Caméras & instruments (panneaux à onglets) ---------------- */

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

  return { render };
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
