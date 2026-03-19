/**
 * Speed analytics module.
 * Pure functions — no side effects, no DOM access.
 */

import { haversine } from './gpx.js';
import { CONFIG } from './config.js';

/**
 * Analyse GPS track points for speed and time statistics.
 *
 * Handles two recording styles:
 * - Smart recording (MapOut, most phone apps): pauses during rests, producing a
 *   single large time-gap segment. Detected directly as a gap rest.
 * - Constant recording (Garmin etc.): records at fixed rate even when stopped,
 *   producing many slow segments. Detected via block classification.
 *
 * Algorithm:
 * 1. Build per-segment (distM, dtSec, speedKmh).
 * 2. Any segment with dtSec >= REST_MIN_SECONDS and distM < REST_THRESHOLD_METRES
 *    is a gap rest — counted directly, excluded from smoothing.
 * 3. Remaining segments: apply rolling average, group into moving/stopped blocks.
 *    A stopped block with duration >= REST_MIN_SECONDS and dist < REST_THRESHOLD_METRES
 *    also counts as rest.
 * 4. Max speed = 98th percentile of smoothed speeds (avoids GPS outliers).
 *
 * @param {Array<{lat, lon, ele, time}>} points
 * @returns {Object|null}
 */
export function calculateSpeedAnalytics(points) {
  if (points.length < 2) return null;

  const timed = points.filter(p => p.time instanceof Date && !isNaN(p.time.getTime()));
  if (timed.length < points.length * 0.8) return null;

  // Build per-segment data
  const allSegments = [];
  for (let i = 1; i < timed.length; i++) {
    const distM = haversine(timed[i - 1].lat, timed[i - 1].lon, timed[i].lat, timed[i].lon) * 1000;
    const dtSec = (timed[i].time - timed[i - 1].time) / 1000;
    if (dtSec <= 0) continue;
    allSegments.push({ speedKmh: (distM / dtSec) * 3.6, distM, dtSec });
  }

  if (allSegments.length < 2) return null;

  // Split: gap rests (smart-recorder pauses) vs normal segments
  let rstTimeSec = 0;
  const segments = [];
  for (const seg of allSegments) {
    if (seg.dtSec >= CONFIG.REST_MIN_SECONDS && seg.distM < CONFIG.REST_THRESHOLD_METRES) {
      rstTimeSec += seg.dtSec;
    } else {
      segments.push(seg);
    }
  }

  // Rolling average smoothing on remaining segments
  let movTimeSec = 0;
  if (segments.length >= 2) {
    const w = CONFIG.SPEED_SMOOTH_WINDOW;
    const smoothed = segments.map((_, idx) => {
      const lo = Math.max(0, idx - Math.floor(w / 2));
      const hi = Math.min(segments.length, idx + Math.ceil(w / 2));
      const slice = segments.slice(lo, hi);
      return slice.reduce((s, seg) => s + seg.speedKmh, 0) / slice.length;
    });

    // Group into moving/stopped blocks
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

    // Accumulate moving vs resting time from blocks
    blocks.forEach(block => {
      const isRest =
        !block.moving &&
        block.durationSec >= CONFIG.REST_MIN_SECONDS &&
        block.distM < CONFIG.REST_THRESHOLD_METRES;

      if (isRest) rstTimeSec += block.durationSec;
      else movTimeSec += block.durationSec;
    });

    // Max speed: 98th percentile to avoid GPS spikes
    var sorted = [...smoothed].sort((a, b) => b - a);
    var p98 = sorted[Math.max(0, Math.floor(sorted.length * 0.02))] ?? 0;

    // Average moving speed
    const movSegs = segments.filter((_, i) => smoothed[i] >= CONFIG.MIN_MOVING_SPEED_KMH);
    var avgMoving =
      movSegs.length > 0
        ? movSegs.reduce((s, seg) => s + seg.speedKmh, 0) / movSegs.length
        : 0;
  } else {
    // All segments were gap rests or too few remain
    var p98 = 0;
    var avgMoving = 0;
  }

  return {
    movTimeSec: Math.round(movTimeSec),
    rstTimeSec: Math.round(rstTimeSec),
    totalTimeSec: Math.round(movTimeSec + rstTimeSec),
    maxSpeed: Math.round(p98 * 10) / 10,
    avgMovingSpeed: Math.round(avgMoving * 10) / 10,
  };
}
