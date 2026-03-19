/**
 * Photo management module.
 * Reads EXIF GPS + timestamp from image files, matches them to routes,
 * pins thumbnails on the map, and exposes data for the stats panel.
 */

import { haversine } from './gpx.js';
import { getAllRoutes } from './routes.js';
import { getMap } from './map.js';

// { id, url, lat, lon, time, routeId, name, marker }
const _photos = [];

/** Return all photos matched to a given routeId. */
export function getPhotosForRoute(routeId) {
  return _photos.filter(p => p.routeId === routeId);
}

/**
 * Process an array of image Files: extract EXIF, match to routes,
 * add map markers. Returns the number successfully added.
 */
export async function loadPhotos(files) {
  let added = 0;

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;

    try {
      let lat = null, lon = null, time = null;

      if (window.exifr) {
        const exif = await window.exifr.parse(file, { gps: true, pick: ['DateTimeOriginal'] });
        lat  = exif?.latitude  ?? null;
        lon  = exif?.longitude ?? null;
        time = exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : null;
      }

      const url     = URL.createObjectURL(file);
      const routeId = _matchToRoute(lat, lon, time);
      const photo   = { id: crypto.randomUUID(), url, lat, lon, time, routeId, name: file.name };

      _photos.push(photo);

      if (lat !== null && lon !== null) {
        _addMapMarker(photo);
      }

      added++;
      window.dispatchEvent(new CustomEvent('photos:updated', { detail: { routeId } }));
    } catch (err) {
      console.warn('Failed to process photo:', file.name, err);
    }
  }

  return added;
}

/** Remove all photos for a route and clean up markers + object URLs. */
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
