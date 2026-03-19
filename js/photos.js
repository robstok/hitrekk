/**
 * Photo management module.
 * Reads EXIF GPS + timestamp from image files, matches them to routes,
 * pins thumbnails on the map, exposes data for the stats panel,
 * and persists photos to Supabase Storage + a photos table.
 */

import { haversine } from './gpx.js';
import { getAllRoutes } from './routes.js';
import { getMap, onMapReady } from './map.js';
import { getUser } from './auth.js';
import {
  uploadPhotoFile,
  getPhotoPublicUrl,
  savePhotoRecord,
  fetchUserPhotos,
  deletePhotosForRoute as dbDeletePhotosForRoute,
  deleteAllUserPhotos,
} from './db.js';

// { id, url, lat, lon, time, routeId, name, storagePath, marker }
const _photos = [];

/** Return all photos matched to a given routeId. */
export function getPhotosForRoute(routeId) {
  return _photos.filter(p => p.routeId === routeId);
}

/**
 * Set up event listeners so photos are cleared automatically when routes are removed.
 * Call once at app startup.
 */
export function initPhotos() {
  window.addEventListener('route:removed', e => clearPhotosForRoute(e.detail.id));
  window.addEventListener('routes:cleared', () => clearAllPhotos());
}

/**
 * Process an array of image Files: extract EXIF, match to routes,
 * add map markers, upload to Supabase Storage.
 * Returns { added, noGps, unmatched }.
 */
export async function loadPhotos(files) {
  let added = 0, noGps = 0, unmatched = 0;

  const imageExts = /\.(jpe?g|png|gif|webp|heic|heif|tiff?|avif)$/i;
  const user = await getUser();

  for (const file of files) {
    const isImage = file.type.startsWith('image/') || imageExts.test(file.name);
    if (!isImage) continue;

    try {
      let lat = null, lon = null, time = null;

      if (window.exifr?.parse) {
        const exif = await window.exifr.parse(file, { gps: true, tiff: true });
        lat  = exif?.latitude  ?? null;
        lon  = exif?.longitude ?? null;
        time = exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : null;
      } else {
        throw new Error('EXIF library not loaded — refresh the page and try again');
      }

      if (lat === null || lon === null) {
        noGps++;
        continue;
      }

      const id      = crypto.randomUUID();
      const url     = URL.createObjectURL(file);
      const routeId = _matchToRoute(lat, lon, time);
      if (routeId === null) unmatched++;

      const photo = { id, url, lat, lon, time, routeId, name: file.name, storagePath: null };
      _photos.push(photo);
      _addMapMarker(photo);
      added++;
      window.dispatchEvent(new CustomEvent('photos:updated', { detail: { routeId } }));

      // Persist to Supabase in the background
      if (user) {
        const storagePath = `${user.id}/${id}`;
        uploadPhotoFile(storagePath, file)
          .then(() => savePhotoRecord(id, user.id, routeId, file.name, lat, lon, time, storagePath))
          .then(() => { photo.storagePath = storagePath; })
          .catch(err => console.warn('Failed to persist photo:', file.name, err));
      }
    } catch (err) {
      console.warn('Failed to process photo:', file.name, err);
      window.dispatchEvent(new CustomEvent('app:error', { detail: err.message }));
    }
  }

  return { added, noGps, unmatched };
}

/**
 * Load photos saved from previous sessions.
 * Fetches metadata from Supabase, rebuilds public URLs, adds map markers.
 */
export async function loadSavedPhotos() {
  let records;
  try {
    records = await fetchUserPhotos();
  } catch (err) {
    // photos table may not exist yet
    console.warn('Failed to load saved photos:', err.message);
    return;
  }

  if (!records.length) return;

  await new Promise(resolve => onMapReady(resolve));

  for (const row of records) {
    // Skip if already in memory (e.g. just uploaded this session)
    if (_photos.find(p => p.id === row.id)) continue;

    const url  = getPhotoPublicUrl(row.storage_path);
    const time = row.photo_time ? new Date(row.photo_time) : null;
    const photo = {
      id: row.id,
      url,
      lat: row.lat,
      lon: row.lon,
      time,
      routeId: row.route_id,
      name: row.name,
      storagePath: row.storage_path,
    };
    _photos.push(photo);
    _addMapMarker(photo);
    window.dispatchEvent(new CustomEvent('photos:updated', { detail: { routeId: row.route_id } }));
  }
}

/** Remove all photos for a route: clean up markers, URLs, and Supabase records. */
export function clearPhotosForRoute(routeId) {
  const indices = [];
  _photos.forEach((p, i) => {
    if (p.routeId === routeId) {
      p.marker?.remove();
      URL.revokeObjectURL(p.url);
      indices.push(i);
    }
  });
  for (let i = indices.length - 1; i >= 0; i--) _photos.splice(indices[i], 1);
  dbDeletePhotosForRoute(routeId).catch(err => console.warn('Failed to delete photos from DB:', err));
}

/** Remove ALL photos: called when routes:cleared fires. */
export function clearAllPhotos() {
  _photos.forEach(p => {
    p.marker?.remove();
    URL.revokeObjectURL(p.url);
  });
  _photos.length = 0;
  getUser().then(user => {
    if (user) deleteAllUserPhotos(user.id).catch(err => console.warn('Failed to delete photos:', err));
  });
}

/** Show a photo in a full-screen lightbox. */
export function showLightbox(url, name) {
  let lb = document.getElementById('photo-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'photo-lightbox';
    lb.innerHTML = `
      <div class="lb-backdrop"></div>
      <div class="lb-content">
        <img class="lb-img" src="" alt="">
        <div class="lb-name"></div>
        <button class="lb-close" aria-label="Close">&#x2715;</button>
      </div>
    `;
    document.body.appendChild(lb);
    lb.querySelector('.lb-backdrop').addEventListener('click', () => lb.classList.remove('show'));
    lb.querySelector('.lb-close').addEventListener('click',    () => lb.classList.remove('show'));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') lb.classList.remove('show');
    });
  }
  lb.querySelector('.lb-img').src         = url;
  lb.querySelector('.lb-name').textContent = name ?? '';
  lb.classList.add('show');
}

// ── Private helpers ──────────────────────────────────────────────

function _matchToRoute(lat, lon, time) {
  const routes = getAllRoutes();
  if (!routes.length) return null;

  // GPS matching: find the route whose nearest point is within 200 m
  if (lat !== null && lon !== null) {
    let bestRouteId = null, bestDist = Infinity;
    for (const route of routes) {
      for (const pt of route.points) {
        const d = haversine(lat, lon, pt.lat, pt.lon);
        if (d < bestDist) { bestDist = d; bestRouteId = route.id; }
      }
    }
    if (bestDist < 0.2) return bestRouteId; // within 200 m
  }

  // Timestamp fallback: find a route whose time window contains the photo time
  if (time) {
    for (const route of routes) {
      const timedPts = route.points.filter(p => p.time instanceof Date);
      if (timedPts.length < 2) continue;
      const start = timedPts[0].time;
      const end   = timedPts[timedPts.length - 1].time;
      if (time >= start && time <= end) return route.id;
    }
  }

  return null;
}

function _addMapMarker(photo) {
  const map = getMap();
  if (!map) return;

  const el = document.createElement('div');
  el.className = 'photo-marker';
  el.style.backgroundImage = `url(${photo.url})`;
  el.title = photo.name;
  el.addEventListener('click', e => {
    e.stopPropagation();
    showLightbox(photo.url, photo.name);
  });

  photo.marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([photo.lon, photo.lat])
    .addTo(map);
}
