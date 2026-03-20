/**
 * MapLibre GL JS map module.
 * Manages map state: terrain, OSM overlay, per-route layers, hover markers.
 */

import { CONFIG } from './config.js';

let _map = null;
let _mapReady = false;
let _readyCallbacks = [];

// Map of routeId → array of layer IDs
const _routeLayers = new Map();

/** Initialize MapLibre map. Returns the map instance. */
export function initMap(containerId) {
  _map = new maplibregl.Map({
    container: containerId,
    style: CONFIG.MAP_STYLE,
    center: CONFIG.INITIAL_CENTER,
    zoom: CONFIG.INITIAL_ZOOM,
    pitch: CONFIG.INITIAL_PITCH,
    antialias: true,
    maxPitch: 85,
    attributionControl: false,
  });

  _map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '' }), 'bottom-right');
  _map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  _map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  _map.on('style.load', _onStyleLoad);
  return _map;
}

let _is3D = false;
let _isSatellite = false;

function _onStyleLoad() {
  // 3D terrain DEM (loaded but not activated by default — starts in 2D mode)
  _map.addSource('terrain-dem', {
    type: 'raster-dem',
    tiles: [CONFIG.TERRAIN_TILES],
    tileSize: 256,
    encoding: CONFIG.TERRAIN_ENCODING,
    maxzoom: CONFIG.TERRAIN_MAX_ZOOM,
  });

  _map.addLayer({
    id: 'hillshade',
    type: 'hillshade',
    source: 'terrain-dem',
    layout: { visibility: 'none' },
    paint: {
      'hillshade-exaggeration': 0.4,
      'hillshade-shadow-color': 'rgba(0,0,0,0.5)',
      'hillshade-highlight-color': 'rgba(255,255,255,0.15)',
      'hillshade-illumination-direction': 315,
    },
  });

  // Satellite imagery (ESRI World Imagery — free, no API key)
  _map.addSource('satellite', {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    attribution: 'Tiles © Esri — Source: Esri, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN',
    maxzoom: 18,
  });

  _map.addLayer({
    id: 'satellite-layer',
    type: 'raster',
    source: 'satellite',
    layout: { visibility: 'none' },
  });

  // OSM raster base map — visible in 2D mode, hidden in 3D mode
  _map.addSource('osm-base', {
    type: 'raster',
    tiles: [CONFIG.OSM_TILES],
    tileSize: 256,
    attribution: '© OpenStreetMap contributors',
  });

  _map.addLayer({
    id: 'osm-base-layer',
    type: 'raster',
    source: 'osm-base',
    paint: { 'raster-opacity': 1 },
    layout: { visibility: 'visible' },
  });

  // OSM Waymarked hiking trails overlay
  _map.addSource('osm-hiking', {
    type: 'raster',
    tiles: [CONFIG.HIKING_TILES],
    tileSize: 256,
    attribution: '© Waymarked Trails | © OpenStreetMap contributors',
  });

  _map.addLayer({
    id: 'osm-hiking-layer',
    type: 'raster',
    source: 'osm-hiking',
    paint: { 'raster-opacity': 0.65 },
    layout: { visibility: 'none' },
  });

  // Shared chart-hover dot (orange) — triggered by chart hover
  _map.addSource('chart-hover', { type: 'geojson', data: _emptyFC() });
  _map.addLayer({
    id: 'chart-hover-dot',
    type: 'circle',
    source: 'chart-hover',
    paint: {
      'circle-radius': 9,
      'circle-color': CONFIG.TRAIL_COLORS[0],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  });

  // Shared map-hover dot (white) — triggered by map trail hover
  _map.addSource('map-hover', { type: 'geojson', data: _emptyFC() });
  _map.addLayer({
    id: 'map-hover-dot',
    type: 'circle',
    source: 'map-hover',
    paint: {
      'circle-radius': 7,
      'circle-color': '#ffffff',
      'circle-stroke-width': 2.5,
      'circle-stroke-color': CONFIG.TRAIL_COLORS[0],
    },
  });

  _mapReady = true;
  _readyCallbacks.forEach(cb => cb());
  _readyCallbacks = [];
  window.dispatchEvent(new CustomEvent('map:ready'));
}

/** Call cb immediately if map is ready, otherwise queue it. */
export function onMapReady(cb) {
  if (_mapReady) { cb(); return; }
  _readyCallbacks.push(cb);
}

/** Add a complete set of layers for a route. */
export function addRouteLayer(routeId, color, geojson) {
  if (!_mapReady) { onMapReady(() => addRouteLayer(routeId, color, geojson)); return; }

  const src = `route-${routeId}`;
  if (_map.getSource(src)) removeRouteLayer(routeId);

  _map.addSource(src, { type: 'geojson', data: geojson });

  const layerDefs = [
    // Soft outer glow
    {
      id: `${src}-glow`,
      type: 'line',
      paint: { 'line-color': color, 'line-width': 20, 'line-opacity': 0.15, 'line-blur': 6 },
    },
    // Dark casing for contrast
    {
      id: `${src}-casing`,
      type: 'line',
      paint: {
        'line-color': 'rgba(0,0,0,0.45)',
        'line-width': CONFIG.TRAIL_WIDTH + 3,
        'line-opacity': 0.8,
      },
    },
    // Main coloured line
    {
      id: `${src}-line`,
      type: 'line',
      paint: { 'line-color': color, 'line-width': CONFIG.TRAIL_WIDTH, 'line-opacity': 1 },
    },
    // Wide invisible hit area for easier hovering
    {
      id: `${src}-hit`,
      type: 'line',
      paint: { 'line-color': 'transparent', 'line-width': 32, 'line-opacity': 0 },
    },
  ];

  layerDefs.forEach(def => {
    _map.addLayer(
      {
        id: def.id,
        type: def.type,
        source: src,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: def.paint,
      },
      'chart-hover-dot', // insert below hover dots
    );
  });

  _routeLayers.set(routeId, layerDefs.map(d => d.id));
}

/** Remove all layers and source for a route. */
export function removeRouteLayer(routeId) {
  const src = `route-${routeId}`;
  (_routeLayers.get(routeId) ?? []).forEach(lid => {
    if (_map.getLayer(lid)) _map.removeLayer(lid);
  });
  if (_map.getSource(src)) _map.removeSource(src);
  _routeLayers.delete(routeId);
}

/** Show or hide all layers for a route. */
export function setRouteVisibility(routeId, visible) {
  const vis = visible ? 'visible' : 'none';
  (_routeLayers.get(routeId) ?? []).forEach(lid => {
    if (_map.getLayer(lid)) _map.setLayoutProperty(lid, 'visibility', vis);
  });
}

/** Change the colour of an existing route's layers. */
export function setRouteColor(routeId, color) {
  const src = `route-${routeId}`;
  if (_map.getLayer(`${src}-glow`)) {
    _map.setPaintProperty(`${src}-glow`, 'line-color', color);
    _map.setPaintProperty(`${src}-line`, 'line-color', color);
  }
}

/** Toggle the OSM hiking trails overlay on/off. */
export function setHikingLayerVisible(visible) {
  if (!_mapReady) return;
  if (!_map.getLayer('osm-hiking-layer')) return;
  _map.setLayoutProperty('osm-hiking-layer', 'visibility', visible ? 'visible' : 'none');
}

/** Fly camera to fit the given LngLat bounds. */
export function fitBounds(bounds, opts = {}) {
  _map.fitBounds(bounds, {
    padding: { top: 60, bottom: 220, left: 40, right: 60 },
    pitch: _is3D ? 55 : 0,
    duration: 2000,
    ...opts,
  });
}

/** Move the orange chart-hover dot to coord, or hide it if coord is null. */
export function updateChartHoverPoint(coord) {
  if (!_mapReady) return;
  const src = _map.getSource('chart-hover');
  if (!src) return;
  src.setData(
    coord
      ? { type: 'Feature', geometry: { type: 'Point', coordinates: coord } }
      : _emptyFC()
  );
}

/** Move the white map-hover dot to coord, or hide it if coord is null. */
export function updateMapHoverPoint(coord) {
  if (!_mapReady) return;
  const src = _map.getSource('map-hover');
  if (!src) return;
  src.setData(
    coord
      ? { type: 'Feature', geometry: { type: 'Point', coordinates: coord } }
      : _emptyFC()
  );
}

/** Return the raw MapLibre map instance. */
export function getMap() { return _map; }

/** Return all hit layer IDs (for queryRenderedFeatures hover detection). */
export function getHitLayerIds() {
  const ids = [];
  _routeLayers.forEach(layers => {
    const hit = layers.find(l => l.endsWith('-hit'));
    if (hit && _map.getLayer(hit)) ids.push(hit);
  });
  return ids;
}

/** Switch between 2D (flat OSM) and 3D (terrain) modes. */
export function set3DMode(enable) {
  if (!_mapReady) return;
  _is3D = enable;

  if (enable) {
    _map.setLayoutProperty('osm-base-layer', 'visibility', 'none');
    _map.setTerrain({ source: 'terrain-dem', exaggeration: CONFIG.TERRAIN_EXAGGERATION });
    _map.setLayoutProperty('hillshade', 'visibility', 'visible');
    _map.easeTo({ pitch: 55, duration: 600 });
  } else {
    _map.setTerrain(null);
    _map.setLayoutProperty('hillshade', 'visibility', 'none');
    // Restore OSM base only if satellite is off
    if (!_isSatellite) {
      _map.setLayoutProperty('osm-base-layer', 'visibility', 'visible');
    }
    _map.easeTo({ pitch: 0, duration: 600 });
  }
}

/** Show or hide the satellite imagery layer. */
export function setSatelliteVisible(enable) {
  if (!_mapReady) return;
  _isSatellite = enable;
  _map.setLayoutProperty('satellite-layer', 'visibility', enable ? 'visible' : 'none');
  // Hide OSM base when satellite is on (satellite replaces it)
  _map.setLayoutProperty('osm-base-layer', 'visibility', enable || _is3D ? 'none' : 'visible');
}

/** Return whether the map is currently in 3D mode. */
export function is3DMode() { return _is3D; }

function _emptyFC() {
  return { type: 'FeatureCollection', features: [] };
}
