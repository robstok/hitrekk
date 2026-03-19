/**
 * UI controller.
 * Wires together DOM events and module calls.
 */

import { processGPXFile, removeRoute, toggleRouteVisibility, setActiveRoute, getAllRoutes, getActiveRoute } from './routes.js';
import { renderElevationChart, syncChartToMapHover, clearHoverState } from './elevation.js';
import { setHikingLayerVisible, setSatelliteVisible, set3DMode, getMap, getHitLayerIds, updateMapHoverPoint } from './map.js';
import { loadPhotos, getPhotosForRoute, showLightbox } from './photos.js';

/** Initialise all UI event bindings. Call once on startup. */
export function initUI() {
  setupDropzone();
  setupFileInput();
  setupPhotoInput();
  setupLayerToggle();
  setupMobileMenu();
  setupMapHover();
  setupRouteEvents();
  window.addEventListener('app:error', e => showToast(e.detail, 'error'));
}

// ── Dropzone ───────────────────────────────────────────────────

function setupDropzone() {
  const overlay = document.getElementById('drop-overlay');

  // Prevent default for all drag events on window
  window.addEventListener('dragenter', e => {
    e.preventDefault();
    if (overlay) overlay.classList.remove('hidden');
  });

  window.addEventListener('dragover', e => {
    e.preventDefault();
  });

  window.addEventListener('dragleave', e => {
    // Only hide when leaving the window entirely
    if (e.relatedTarget === null) {
      if (overlay) overlay.classList.add('hidden');
    }
  });

  window.addEventListener('drop', async e => {
    e.preventDefault();
    if (overlay) overlay.classList.add('hidden');

    const all    = [...(e.dataTransfer?.files ?? [])];
    const gpxs   = all.filter(f => f.name.toLowerCase().endsWith('.gpx'));
    const images = all.filter(f => f.type.startsWith('image/'));

    if (gpxs.length === 0 && images.length === 0) {
      showToast('Please drop a .gpx file or photos', 'error');
      return;
    }

    gpxs.forEach(f => handleFile(f));

    if (images.length > 0) {
      const { added } = await loadPhotos(images);
      if (added > 0) showToast(`${added} photo${added === 1 ? '' : 's'} added`, 'success');
    }
  });

  // Dropzone div hover state
  const dropzone = document.getElementById('dropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const files = [...(e.dataTransfer?.files ?? [])].filter(f =>
        f.name.toLowerCase().endsWith('.gpx')
      );
      files.forEach(f => handleFile(f));
    });
  }
}

// ── File input ─────────────────────────────────────────────────

function setupFileInput() {
  const input = document.getElementById('file-input');
  if (!input) return;

  input.addEventListener('change', e => {
    const files = [...(e.target.files ?? [])].filter(f =>
      f.name.toLowerCase().endsWith('.gpx')
    );
    files.forEach(f => handleFile(f));
    // Reset so the same file can be loaded again
    input.value = '';
  });
}

// ── Photo upload ────────────────────────────────────────────────

function setupPhotoInput() {
  const btn   = document.getElementById('photo-btn');
  const input = document.getElementById('photo-input');
  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());

  input.addEventListener('change', async e => {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    input.value = '';
    const { added, noGps } = await loadPhotos(files);
    if (added === 0 && noGps > 0) {
      showToast(`${noGps} photo${noGps === 1 ? '' : 's'} had no GPS data — cannot place on map`, 'error');
    } else if (added === 0) {
      showToast('No supported photos found', 'error');
    } else if (noGps > 0) {
      showToast(`${added} photo${added === 1 ? '' : 's'} added (${noGps} had no GPS)`, 'info');
    } else {
      showToast(`${added} photo${added === 1 ? '' : 's'} added`, 'success');
    }
  });
}

// ── Layer toggle ────────────────────────────────────────────────

function setupLayerToggle() {
  const hikingToggle = document.getElementById('hiking-layer-toggle');
  if (hikingToggle) {
    hikingToggle.addEventListener('change', e => {
      setHikingLayerVisible(e.target.checked);
    });
  }

  const terrainToggle = document.getElementById('terrain-3d-toggle');
  if (terrainToggle) {
    terrainToggle.addEventListener('change', e => {
      set3DMode(e.target.checked);
    });
  }

  const satelliteToggle = document.getElementById('satellite-layer-toggle');
  if (satelliteToggle) {
    satelliteToggle.addEventListener('change', e => {
      setSatelliteVisible(e.target.checked);
    });
  }
}

// ── Mobile menu ─────────────────────────────────────────────────

function setupMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const openBtn = document.getElementById('mob-open');
  const closeBtn = document.getElementById('mob-close');

  openBtn?.addEventListener('click', () => {
    sidebar?.classList.add('open');
  });

  closeBtn?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
  });

  // Tap on map area closes sidebar on mobile
  document.getElementById('map-container')?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
  });
}

// ── Map hover ───────────────────────────────────────────────────

function setupMapHover() {
  window.addEventListener('map:ready', () => {
    const map = getMap();
    if (!map) return;

    map.on('mousemove', e => {
      const hitIds = getHitLayerIds();
      if (hitIds.length === 0) return;

      const features = map.queryRenderedFeatures(e.point, { layers: hitIds });
      if (!features.length) {
        clearHoverState();
        updateMapHoverPoint(null);
        map.getCanvas().style.cursor = '';
        return;
      }

      map.getCanvas().style.cursor = 'crosshair';

      const activeRoute = getActiveRoute();
      if (!activeRoute) return;

      // Find nearest point on active route to mouse position
      const lngLat = e.lngLat;
      const nearestIdx = _findNearestPointIndex(activeRoute.coords, lngLat.lng, lngLat.lat);

      updateMapHoverPoint(activeRoute.coords[nearestIdx]);

      if (activeRoute.hasElevation) {
        syncChartToMapHover(activeRoute, nearestIdx);
      }
    });

    map.on('mouseleave', () => {
      clearHoverState();
      updateMapHoverPoint(null);
      map.getCanvas().style.cursor = '';
    });
  });
}

/**
 * Find the index of the closest point in a coords array to a given lng/lat.
 *
 * @param {Array<[number, number]>} coords
 * @param {number} lng
 * @param {number} lat
 * @returns {number}
 */
function _findNearestPointIndex(coords, lng, lat) {
  let nearestIdx = 0;
  let nearestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const dx = coords[i][0] - lng;
    const dy = coords[i][1] - lat;
    const dist = dx * dx + dy * dy;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

// ── Route events ────────────────────────────────────────────────

function setupRouteEvents() {
  window.addEventListener('photos:updated', e => {
    const activeRoute = getActiveRoute();
    if (activeRoute && activeRoute.id === e.detail?.routeId) {
      renderRouteStats(activeRoute);
    }
  });
  window.addEventListener('route:added', () => {
    _rebuildRouteList();
    _updateEmptyState();
  });

  window.addEventListener('route:removed', () => {
    _rebuildRouteList();
    _updateEmptyState();
  });

  window.addEventListener('route:updated', e => {
    const route = e.detail;
    _updateRouteItem(route);
  });

  window.addEventListener('routes:cleared', () => {
    _rebuildRouteList();
    _updateEmptyState();
    _clearStatsPanel();
  });

  window.addEventListener('route:activated', e => {
    const route = e.detail;
    // Update active highlight in list
    document.querySelectorAll('.route-item').forEach(el => el.classList.remove('active'));
    if (route) {
      document.getElementById(`ri-${route.id}`)?.classList.add('active');
      renderRouteStats(route);
      renderElevationChart(route);
    } else {
      _clearStatsPanel();
    }
  });
}

// ── Route list rendering ─────────────────────────────────────────

// Years the user has manually collapsed
const _collapsedYears = new Set();

function _rebuildRouteList() {
  const list = document.getElementById('route-list');
  if (!list) return;

  const routes = [...getAllRoutes()].sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return b.startDate - a.startDate; // newest first
  });

  // Group by year
  const byYear = new Map();
  for (const route of routes) {
    const year = route.startDate ? route.startDate.getFullYear() : 'Unknown';
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(route);
  }

  // Preserve active route id
  const activeId = document.querySelector('.route-item.active')?.id?.replace('ri-', '');

  list.innerHTML = '';

  for (const [year, yearRoutes] of byYear) {
    const collapsed = _collapsedYears.has(year);

    const group = document.createElement('div');
    group.className = 'year-group';
    group.dataset.year = year;

    const header = document.createElement('div');
    header.className = 'year-header';
    header.innerHTML = `
      <span class="year-label">${year}</span>
      <span class="year-count">${yearRoutes.length} ${yearRoutes.length === 1 ? 'hike' : 'hikes'}</span>
      <svg class="year-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    `;

    const content = document.createElement('div');
    content.className = 'year-routes';

    if (collapsed) {
      group.classList.add('collapsed');
    }

    header.addEventListener('click', () => {
      const isCollapsed = group.classList.toggle('collapsed');
      if (isCollapsed) _collapsedYears.add(year);
      else _collapsedYears.delete(year);
    });

    for (const route of yearRoutes) {
      const item = _buildRouteItem(route);
      if (route.id === activeId) item.classList.add('active');
      content.appendChild(item);
    }

    group.appendChild(header);
    group.appendChild(content);
    list.appendChild(group);
  }
}

function _buildRouteItem(route) {
  const item = document.createElement('div');
  item.className = 'route-item';
  item.id = `ri-${route.id}`;
  if (!route.visible) item.classList.add('hidden-route');

  const distStr = route.totalDist ? route.totalDist.toFixed(1) + ' km' : '';
  const eleStr  = route.elevGain  ? '+' + route.elevGain + 'm'         : '';
  const dateStr = route.startDate
    ? route.startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  item.innerHTML = `
    <div class="route-item-header">
      <div class="route-dot" style="background: ${route.color}"></div>
      <span class="route-name" title="${_escHtml(route.name)}">${_escHtml(route.name)}</span>
      <div class="route-actions">
        <button class="btn-zoom" title="Zoom to route">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            <circle cx="12" cy="9" r="2.5"/>
          </svg>
        </button>
        <button class="btn-toggle-vis" title="${route.visible ? 'Hide' : 'Show'} route">
          ${route.visible ? _eyeIcon() : _eyeOffIcon()}
        </button>
        <button class="btn-delete btn-ghost-sm" title="Remove route">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="route-meta">
      ${dateStr ? `<span class="route-date">${dateStr}</span>` : ''}
      ${distStr ? `<span>${distStr}</span>` : ''}
      ${eleStr  ? `<span>${eleStr}</span>`  : ''}
    </div>
  `;

  // Event bindings
  item.addEventListener('click', () => {
    setActiveRoute(route.id);
    const r = getAllRoutes().find(r => r.id === route.id);
    if (r) import('./map.js').then(({ fitBounds }) => fitBounds(r.bounds));
  });

  item.querySelector('.btn-zoom')?.addEventListener('click', e => {
    e.stopPropagation();
    const r = getAllRoutes().find(r => r.id === route.id);
    if (r) {
      import('./map.js').then(({ fitBounds }) => fitBounds(r.bounds));
    }
  });

  item.querySelector('.btn-toggle-vis')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleRouteVisibility(route.id);
  });

  item.querySelector('.btn-delete')?.addEventListener('click', e => {
    e.stopPropagation();
    removeRoute(route.id);
  });

  return item;
}

function _updateRouteItem(route) {
  const item = document.getElementById(`ri-${route.id}`);
  if (!item) return;

  if (route.visible) {
    item.classList.remove('hidden-route');
  } else {
    item.classList.add('hidden-route');
  }

  const visBtn = item.querySelector('.btn-toggle-vis');
  if (visBtn) {
    visBtn.innerHTML = route.visible ? _eyeIcon() : _eyeOffIcon();
    visBtn.title = route.visible ? 'Hide route' : 'Show route';
  }
}

function _updateEmptyState() {
  const empty = document.getElementById('route-list-empty');
  if (!empty) return;
  empty.style.display = getAllRoutes().length === 0 ? '' : 'none';
}

// ── Route stats panel ────────────────────────────────────────────

/**
 * Render per-route statistics in the sidebar stats panel.
 *
 * @param {Object} route
 */
export function renderRouteStats(route) {
  const panel = document.getElementById('route-stats-panel');
  if (!panel) return;

  panel.style.display = 'block';

  let speedHtml = '';
  if (route.speed) {
    const s = route.speed;
    const totalSec = s.movTimeSec + s.rstTimeSec;
    const movPct = totalSec > 0 ? Math.round((s.movTimeSec / totalSec) * 100) : 0;
    const rstPct = 100 - movPct;

    speedHtml = `
      <div class="stats-section-label" style="margin-top: 4px">Speed & Time</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-val">${fmtDur(s.movTimeSec)}</div>
          <div class="stat-lbl">Moving Time</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${fmtDur(s.rstTimeSec)}</div>
          <div class="stat-lbl">Rest Time</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${s.avgMovingSpeed.toFixed(1)}<span class="stat-unit">km/h</span></div>
          <div class="stat-lbl">Avg Speed</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${s.maxSpeed.toFixed(1)}<span class="stat-unit">km/h</span></div>
          <div class="stat-lbl">Max Speed</div>
        </div>
      </div>
      <div class="time-bar">
        <div class="time-bar-mv" style="width: ${movPct}%"></div>
        <div class="time-bar-rs" style="width: ${rstPct}%"></div>
      </div>
      <div class="time-legend">
        <span><span class="ldot" style="background: var(--green)"></span>Moving ${movPct}%</span>
        <span>Rest ${rstPct}%<span class="ldot" style="background: #F59E0B; margin-left: 4px; margin-right: 0"></span></span>
      </div>
    `;
  }

  const photos = getPhotosForRoute(route.id);
  const photosHtml = photos.length > 0 ? `
    <div class="stats-section-label" style="margin-top: 8px">Photos</div>
    <div class="photo-strip" id="photo-strip-${route.id}">
      ${photos.map(p => `
        <button class="photo-thumb" data-url="${p.url}" data-name="${_escHtml(p.name)}" title="${_escHtml(p.name)}">
          <img src="${p.url}" alt="${_escHtml(p.name)}">
        </button>
      `).join('')}
    </div>
  ` : '';

  panel.innerHTML = `
    <div class="section-title">
      <span style="color: ${route.color}">${_escHtml(route.name)}</span>
    </div>
    <div class="route-stats">
      <div class="stats-grid">
        <div class="stat-card accent">
          <div class="stat-val">${route.totalDist.toFixed(1)}<span class="stat-unit">km</span></div>
          <div class="stat-lbl">Distance</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${route.pointCount}</div>
          <div class="stat-lbl">Track Points</div>
        </div>
        ${route.hasElevation ? `
        <div class="stat-card">
          <div class="stat-val">+${route.elevGain}<span class="stat-unit">m</span></div>
          <div class="stat-lbl">Elevation Gain</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">-${route.elevLoss}<span class="stat-unit">m</span></div>
          <div class="stat-lbl">Elevation Loss</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${route.maxEle}<span class="stat-unit">m</span></div>
          <div class="stat-lbl">Max Elevation</div>
        </div>
        <div class="stat-card">
          <div class="stat-val">${route.minEle}<span class="stat-unit">m</span></div>
          <div class="stat-lbl">Min Elevation</div>
        </div>
        ` : ''}
      </div>
      ${speedHtml}
      ${photosHtml}
    </div>
  `;

  panel.querySelectorAll('.photo-thumb').forEach(btn => {
    btn.addEventListener('click', () => showLightbox(btn.dataset.url, btn.dataset.name));
  });
}

function _clearStatsPanel() {
  const panel = document.getElementById('route-stats-panel');
  if (panel) {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }
}

// ── Toast notifications ─────────────────────────────────────────

/**
 * Display a toast notification.
 *
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') toast.classList.add('toast-error');
  if (type === 'success') toast.classList.add('toast-success');
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  // Auto-remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── File handler ────────────────────────────────────────────────

/**
 * Process a single GPX file.
 *
 * @param {File} file
 */
export async function handleFile(file) {
  try {
    const route = await processGPXFile(file);
    showToast(`Loaded: ${route.name}`, 'success');
  } catch (err) {
    console.error('GPX load error:', err);
    showToast(err.message || `Failed to load ${file.name}`, 'error');
  }
}

// ── Duration formatting (also used in stats panel) ──────────────

function fmtDur(sec) {
  if (!sec || sec <= 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── SVG helpers ─────────────────────────────────────────────────

function _eyeIcon() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`;
}

function _eyeOffIcon() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>`;
}

function _escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
