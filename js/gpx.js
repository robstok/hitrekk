/**
 * GPX file parsing and route geometry processing.
 * Pure functions — no side effects, no DOM access.
 */

/**
 * Parse raw GPX XML text into a structured object.
 * Supports <trkpt> (tracks) and <rtept> (routes).
 *
 * @param {string} text - Raw GPX XML
 * @returns {{ name: string, points: Array<{lat, lon, ele, time}> }}
 */
export function parseGPX(text) {
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  if (xml.querySelector('parsererror')) {
    throw new Error('Invalid GPX file — could not parse XML.');
  }

  const nameEl = xml.querySelector('trk > name, rte > name, name');
  const name = nameEl?.textContent?.trim() || 'Unnamed Track';

  const ptEls = xml.querySelectorAll('trkpt, rtept');
  if (ptEls.length === 0) throw new Error('No track points found in this GPX file.');

  const points = [];
  ptEls.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    if (isNaN(lat) || isNaN(lon)) return;

    const eleText = pt.querySelector('ele')?.textContent;
    const timeText = pt.querySelector('time')?.textContent;

    points.push({
      lat,
      lon,
      ele: eleText ? parseFloat(eleText) : null,
      time: timeText ? new Date(timeText) : null,
    });
  });

  if (points.length < 2) throw new Error('GPX file contains fewer than 2 valid track points.');

  return { name, points };
}

/**
 * Haversine great-circle distance in kilometres.
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Build a processed route object from raw GPX points.
 * Calculates cumulative distances, elevation stats, and bounding box.
 *
 * @param {Array} points - From parseGPX()
 * @returns {Object} Processed route data
 */
export function buildRouteData(points) {
  const coords = [];
  const distances = [0];   // cumulative km
  const elevations = [];
  let totalDist = 0;
  let elevGain = 0;
  let elevLoss = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    coords.push([pt.lon, pt.lat]);
    elevations.push(pt.ele ?? 0);

    if (i > 0) {
      const d = haversine(points[i - 1].lat, points[i - 1].lon, pt.lat, pt.lon);
      totalDist += d;
      distances.push(totalDist);

      if (pt.ele !== null && points[i - 1].ele !== null) {
        const diff = pt.ele - points[i - 1].ele;
        if (diff > 0.5) elevGain += diff;
        else if (diff < -0.5) elevLoss += Math.abs(diff);
      }
    }
  }

  const validElevations = elevations.filter(e => e > 0);
  const hasElevation = validElevations.length > points.length * 0.5;

  const lons = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);

  return {
    coords,
    distances,
    elevations,
    totalDist,
    elevGain: Math.round(elevGain),
    elevLoss: Math.round(elevLoss),
    maxEle: hasElevation ? Math.round(Math.max(...validElevations)) : null,
    minEle: hasElevation ? Math.round(Math.min(...validElevations)) : null,
    hasElevation,
    pointCount: points.length,
    bounds: [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
  };
}
