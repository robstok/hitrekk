/**
 * Speed analytics module.
 * Pure functions — no side effects, no DOM access.
 */

import { haversine } from './gpx.js';
import { CONFIG } from './config.js';

/**
 * Analyse GPS track points for speed and time statistics.
 *
 * Requires timestamp data on at least 80% of points.
 * Returns null if timestamps are missing or insufficient.
 *
 * Algorithm:
 * 1. Compute instantaneous speed for each segment (km/h).
 * 2. Apply rolling average (CONFIG.SPEED_SMOOTH_WINDOW) to remove GPS jitter.
 * 3. Classify each segment as "moving" (>= MIN_MOVING_SPEED_KMH) or "stopped".
 * 4. Group consecutive same-state segments into blocks.
 * 5. A block is "resting" if: stopped && duration >= REST_MIN_SECONDS && total movement < REST_THRESHOLD_METRES.
 * 6. Max speed = 98th percentile of smoothed speeds (avoids GPS outliers).
 *
 * @param {Array<{lat, lon, ele, time}>} points
 * @returns {Object|null}
 */
export function calculateSpeedAnalytics(points) {
  if (points.length < 2) return null;

  const timed = points.filter(p => p.time instanceof Date && !isNaN(p.time.getTime()));
  if (timed.length < points.length * 0.8) return null;

  // Build per-segment speed array
  const segments = [];
  for (let i = 1; i < timed.length; i++) {
    const distM = haversine(timed[i - 1].lat, timed[i - 1].lon, timed[i].lat, timed[i].lon) * 1000;
    const dtSec = (timed[i].time - timed[i - 1].time) / 1000;
    if (dtSec <= 0) continue;
    segments.push({
      speedKmh: (distM / dtSec) * 3.6,
      distM,
      dtSec,
    });
  }

  if (segments.length < 2) return null;

  // Rolling average smoothing
  const w = CONFIG.SPEED_SMOOTH_WINDOW;
  const smoothed = segments.map((_, idx) => {
    const lo = Math.max(0, idx - Math.floor(w / 2));
    const hi = Math.min(segments.length, idx + Math.ceil(w / 2));
    const slice = segments.slice(lo, hi);
    return slice.reduce((s, seg) => s + seg.speedKmh, 0) / slice.length;
  });

  // Classify segments into moving/stopped blocks
  const blocks = [];
  let cur = null;

  for (let i = 0; i < segments.length; i++) {
    const moving = smoothed[i] >= CONFIG.MIN_MOVING_SPEED_KMH;
    if (!cur || cur.moving !== moving) {
      if (cur) blocks.push(cur);
      cur = { moving, durationSec: 0, distM: 0 };
    }
    cur.durationSec += segments[i].dtSec;
    cur.distM += segments[i].distM;
  }
  if (cur) blocks.push(cur);

  // Accumulate moving vs resting time
  let movTimeSec = 0;
  let rstTimeSec = 0;

  blocks.forEach(block => {
    const isRest =
      !block.moving &&
      block.durationSec >= CONFIG.REST_MIN_SECONDS &&
      block.distM < CONFIG.REST_THRESHOLD_METRES;

    if (isRest) rstTimeSec += block.durationSec;
    else movTimeSec += block.durationSec;
  });

  // Max speed: 98th percentile to avoid GPS spikes
  const sorted = [...smoothed].sort((a, b) => b - a);
  const p98 = sorted[Math.max(0, Math.floor(sorted.length * 0.02))] ?? 0;

  // Average moving speed
  const movSegs = segments.filter((_, i) => smoothed[i] >= CONFIG.MIN_MOVING_SPEED_KMH);
  const avgMoving =
    movSegs.length > 0
      ? movSegs.reduce((s, seg) => s + seg.speedKmh, 0) / movSegs.length
      : 0;

  return {
    movTimeSec: Math.round(movTimeSec),
    rstTimeSec: Math.round(rstTimeSec),
    totalTimeSec: Math.round(movTimeSec + rstTimeSec),
    maxSpeed: Math.round(p98 * 10) / 10,
    avgMovingSpeed: Math.round(avgMoving * 10) / 10,
  };
}
