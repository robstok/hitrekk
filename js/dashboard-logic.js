/**
 * Pure dashboard logic — no DOM, no Supabase.
 * Exported for use by dashboard.js and unit tests.
 */

/**
 * Aggregate stats from an array of route rows (as returned by Supabase).
 * Routes with null stats are counted as hikes but contribute 0 to metrics.
 *
 * @param {Array} routes
 * @returns {{ hikeCount, totalDistKm, totalMovSec, totalRstSec,
 *             maxSpeedKmh, maxSpeedName, longestKm, longestName }}
 */
export function aggregateStats(routes) {
  let totalDistKm = 0;
  let totalMovSec = 0;
  let totalRstSec = 0;
  let maxSpeedKmh = 0;
  let maxSpeedName = '';
  let longestKm = 0;
  let longestName = '';

  for (const r of routes) {
    const s = r.stats ?? {};
    totalDistKm += s.totalDist ?? 0;
    totalMovSec += s.movTimeSec ?? 0;
    totalRstSec += s.rstTimeSec ?? 0;

    if ((s.maxSpeedKmh ?? 0) > maxSpeedKmh) {
      maxSpeedKmh = s.maxSpeedKmh;
      maxSpeedName = r.name;
    }
    if ((s.totalDist ?? 0) > longestKm) {
      longestKm = s.totalDist;
      longestName = r.name;
    }
  }

  return {
    hikeCount: routes.length,
    totalDistKm,
    totalMovSec,
    totalRstSec,
    maxSpeedKmh,
    maxSpeedName,
    longestKm,
    longestName,
  };
}

/**
 * Filter routes by a named period or custom date range.
 * Uses hike_date if set, falls back to created_at date portion.
 *
 * @param {Array}  routes
 * @param {string} period       - 'this_year'|'last_year'|'past_30'|'past_90'|'all_time'|'custom'
 * @param {string|null} customFrom  - ISO date string (inclusive)
 * @param {string|null} customTo    - ISO date string (inclusive)
 * @param {Date}   [now]        - Override current date (for testing)
 * @returns {Array}
 */
export function filterByPeriod(routes, period, customFrom, customTo, now = new Date()) {
  const { from, to } = getPeriodRange(period, customFrom, customTo, now);
  if (!from && !to) return routes;

  return routes.filter(r => {
    const raw = r.hike_date ?? r.created_at;
    if (!raw) return true;
    const date = raw.split('T')[0]; // works for both date ("2025-08-15") and timestamptz
    if (from && date < from) return false;
    if (to   && date > to)   return false;
    return true;
  });
}

/**
 * Return ISO date strings for the start and end of a named period.
 *
 * @param {string} period
 * @param {string|null} customFrom
 * @param {string|null} customTo
 * @param {Date} [now]
 * @returns {{ from: string|null, to: string|null }}
 */
export function getPeriodRange(period, customFrom, customTo, now = new Date()) {
  const y = now.getFullYear();

  switch (period) {
    case 'this_year':  return { from: `${y}-01-01`,     to: `${y}-12-31` };
    case 'last_year':  return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'past_30':    return { from: _daysAgo(30, now), to: null };
    case 'past_90':    return { from: _daysAgo(90, now), to: null };
    case 'custom':     return { from: customFrom ?? null, to: customTo ?? null };
    default:           return { from: null, to: null }; // all_time
  }
}

/**
 * Format seconds into a human-readable duration string.
 *
 * @param {number} sec
 * @returns {string}
 */
export function fmtDur(sec) {
  if (!sec || sec <= 0) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function _daysAgo(n, now) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
