/**
 * Route manager.
 * Manages an in-memory Map of loaded route objects and syncs with the map.
 */

import { CONFIG } from './config.js';
import { parseGPX, buildRouteData } from './gpx.js';
import { calculateSpeedAnalytics } from './analytics.js';
import { addRouteLayer, removeRouteLayer, setRouteVisibility, fitBounds, onMapReady } from './map.js';
import { saveRoute, deleteRoute, deleteAllUserRoutes, fetchUserRoutes } from './db.js';
import { getUser } from './auth.js';

// In-memory store: routeId → route object
const _routes = new Map();
let _activeRouteId = null;
let _colorIdx = 0;

/**
 * Return the next trail colour, cycling through TRAIL_COLORS.
 */
export function nextColor() {
  const color = CONFIG.TRAIL_COLORS[_colorIdx % CONFIG.TRAIL_COLORS.length];
  _colorIdx++;
  return color;
}

/**
 * Read a .gpx File, parse it, add it to the map, and dispatch events.
 *
 * @param {File} file
 * @returns {Promise<Object>} The newly created route object
 */
export async function processGPXFile(file) {
  const text = await file.text();
  const user = await getUser();
  return _processGPXText(text, crypto.randomUUID(), nextColor(), user?.id ?? null, true);
}

async function _processGPXText(text, id, color, userId = null, persist = false) {
  const { name, points } = parseGPX(text);
  const routeData = buildRouteData(points);
  const speed = calculateSpeedAnalytics(points);

  const route = {
    id,
    name,
    color,
    visible: true,
    points,
    speed,
    gpxText: text,
    ...routeData,
  };

  _routes.set(id, route);

  const geojson = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: route.coords },
    properties: { id, name },
  };

  addRouteLayer(id, color, geojson);
  fitBounds(route.bounds);
  setActiveRoute(id);

  window.dispatchEvent(new CustomEvent('route:added', { detail: route }));

  if (persist && userId) {
    const stats = {
      totalDist: route.totalDist ?? 0,
      elevGain: route.elevGain ?? 0,
      movTimeSec: route.speed?.movTimeSec ?? 0,
      rstTimeSec: route.speed?.rstTimeSec ?? 0,
      maxSpeedKmh: route.speed?.maxSpeed ?? 0,
    };
    const firstTime = points.find(p => p.time)?.time;
    const hikeDate = firstTime
      ? firstTime.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    saveRoute(id, userId, name, color, text, stats, hikeDate).catch(err =>
      console.warn('Failed to save route:', err)
    );
  }

  return route;
}

/**
 * Load all routes saved in Supabase for the current user.
 * Backfills stats for any route that was saved before the stats migration.
 * Waits for the map to be ready before adding layers.
 */
export async function loadSavedRoutes() {
  const saved = await fetchUserRoutes();
  if (saved.length === 0) return;

  await new Promise(resolve => onMapReady(resolve));

  const user = await getUser();

  for (const row of saved) {
    const route = await _processGPXText(row.gpx_content, row.id, row.color);

    // Backfill stats for routes saved before the stats migration
    if (!row.stats && user) {
      const stats = {
        totalDist:   route.totalDist ?? 0,
        elevGain:    route.elevGain ?? 0,
        movTimeSec:  route.speed?.movTimeSec ?? 0,
        rstTimeSec:  route.speed?.rstTimeSec ?? 0,
        maxSpeedKmh: route.speed?.maxSpeed ?? 0,
      };
      const firstTime = route.points.find(p => p.time)?.time;
      const hikeDate  = firstTime
        ? firstTime.toISOString().split('T')[0]
        : (row.created_at?.split('T')[0] ?? new Date().toISOString().split('T')[0]);

      saveRoute(row.id, user.id, row.name, row.color, row.gpx_content, stats, hikeDate)
        .catch(err => console.warn('Failed to backfill route stats:', err));
    }
  }
}

/**
 * Remove a route from the map and internal store.
 *
 * @param {string} id
 */
export function removeRoute(id) {
  if (!_routes.has(id)) return;
  removeRouteLayer(id);
  _routes.delete(id);
  deleteRoute(id).catch(err => console.warn('Failed to delete route:', err));

  if (_activeRouteId === id) {
    _activeRouteId = null;
    // Activate the most recently added remaining route, if any
    const remaining = [..._routes.keys()];
    if (remaining.length > 0) {
      setActiveRoute(remaining[remaining.length - 1]);
    } else {
      window.dispatchEvent(new CustomEvent('route:activated', { detail: null }));
    }
  }

  window.dispatchEvent(new CustomEvent('route:removed', { detail: { id } }));
}

/**
 * Toggle the visibility of a route.
 *
 * @param {string} id
 */
export function toggleRouteVisibility(id) {
  const route = _routes.get(id);
  if (!route) return;
  route.visible = !route.visible;
  setRouteVisibility(id, route.visible);
  window.dispatchEvent(new CustomEvent('route:updated', { detail: route }));
}

/**
 * Set the active route (shown in stats panel, synced with chart).
 *
 * @param {string} id
 */
export function setActiveRoute(id) {
  const route = _routes.get(id);
  if (!route) return;
  _activeRouteId = id;
  window.dispatchEvent(new CustomEvent('route:activated', { detail: route }));
}

/**
 * Get a single route by ID.
 *
 * @param {string} id
 * @returns {Object|null}
 */
export function getRoute(id) {
  return _routes.get(id) ?? null;
}

/**
 * Get all routes as an array.
 *
 * @returns {Object[]}
 */
export function getAllRoutes() {
  return [..._routes.values()];
}

/**
 * Get the currently active route.
 *
 * @returns {Object|null}
 */
export function getActiveRoute() {
  return _activeRouteId ? (_routes.get(_activeRouteId) ?? null) : null;
}

/**
 * Remove all routes from map and internal store. Reset color cycling.
 */
export function clearAllRoutes() {
  _routes.forEach((_, id) => removeRouteLayer(id));
  _routes.clear();
  _activeRouteId = null;
  _colorIdx = 0;
  window.dispatchEvent(new CustomEvent('routes:cleared'));
  getUser().then(user => {
    if (user) deleteAllUserRoutes(user.id).catch(err => console.warn('Failed to clear routes:', err));
  });
}
