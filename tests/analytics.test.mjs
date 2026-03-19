import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSpeedAnalytics } from '../js/analytics.js';

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Build a GPS point array.
 * Each segment in `phases` describes a phase of the hike:
 *   { durationSec, distanceM, count }
 * Points are evenly spaced within each phase.
 */
function buildPoints(phases) {
  const points = [];
  let lat = 47.0;
  const lon = 10.0;
  let t = new Date('2025-08-15T08:00:00Z');

  for (const phase of phases) {
    const dtSec     = phase.durationSec / phase.count;
    const dLatPerPt = phase.distanceM / 111000 / phase.count; // rough metres→degrees

    for (let i = 0; i < phase.count; i++) {
      points.push({ lat, lon, ele: 1000, time: new Date(t) });
      lat += dLatPerPt;
      t = new Date(t.getTime() + dtSec * 1000);
    }
  }
  return points;
}

// ── Tests ────────────────────────────────────────────────────────

describe('calculateSpeedAnalytics', () => {
  it('returns null when no timestamps are present', () => {
    const points = [
      { lat: 47.0, lon: 10.0, ele: 1000, time: null },
      { lat: 47.01, lon: 10.0, ele: 1010, time: null },
      { lat: 47.02, lon: 10.0, ele: 1020, time: null },
    ];
    assert.equal(calculateSpeedAnalytics(points), null);
  });

  it('returns null for fewer than 2 points', () => {
    const points = [{ lat: 47.0, lon: 10.0, ele: 1000, time: new Date() }];
    assert.equal(calculateSpeedAnalytics(points), null);
  });

  it('detects no rest time for a hike with only brief stops', () => {
    // 60 min moving, 90 sec stop (below REST_MIN_SECONDS=120), 60 min moving
    const points = buildPoints([
      { durationSec: 3600, distanceM: 5000, count: 720 }, // moving ~5 km/h
      { durationSec: 90,   distanceM: 2,    count: 18  }, // brief stop < 120s
      { durationSec: 3600, distanceM: 5000, count: 720 }, // moving ~5 km/h
    ]);
    const result = calculateSpeedAnalytics(points);
    assert.ok(result !== null, 'should return analytics');
    assert.equal(result.rstTimeSec, 0, 'brief stop should not count as rest');
    assert.ok(result.movTimeSec > 0, 'should have moving time');
  });

  it('correctly identifies a long rest stop', () => {
    // 30 min moving, 10 min rest (> 120s, < 10m), 30 min moving
    const points = buildPoints([
      { durationSec: 1800, distanceM: 2500, count: 360 }, // moving ~5 km/h
      { durationSec: 600,  distanceM: 3,    count: 120 }, // proper rest: >120s, <10m
      { durationSec: 1800, distanceM: 2500, count: 360 }, // moving ~5 km/h
    ]);
    const result = calculateSpeedAnalytics(points);
    assert.ok(result !== null, 'should return analytics');
    assert.ok(result.rstTimeSec > 0,  'rest stop should be counted');
    assert.ok(result.movTimeSec > 0,  'should have moving time');
    // Total tracked time should be close to full hike duration (3600s + brief overhead)
    const total = result.movTimeSec + result.rstTimeSec;
    assert.ok(total > 3600 && total <= 4210, `total ~4200s expected, got ${total}`);
  });

  it('rest + moving time accounts for the full hike duration', () => {
    const hikeDuration = 3600; // 1 hour
    const restDuration = 300;  // 5 min rest
    const points = buildPoints([
      { durationSec: (hikeDuration - restDuration) / 2, distanceM: 2000, count: 300 },
      { durationSec: restDuration, distanceM: 2, count: 60 },
      { durationSec: (hikeDuration - restDuration) / 2, distanceM: 2000, count: 300 },
    ]);
    const result = calculateSpeedAnalytics(points);
    assert.ok(result !== null);
    const total = result.movTimeSec + result.rstTimeSec;
    // Total should be within 5% of hike duration (segment boundary rounding)
    assert.ok(
      Math.abs(total - hikeDuration) < hikeDuration * 0.05,
      `expected ~${hikeDuration}s total, got ${total}s`
    );
  });

  it('returns maxSpeed > 0 for a moving hike', () => {
    const points = buildPoints([
      { durationSec: 3600, distanceM: 5000, count: 720 },
    ]);
    const result = calculateSpeedAnalytics(points);
    assert.ok(result !== null);
    assert.ok(result.maxSpeed > 0, 'maxSpeed should be positive');
  });

  it('movTimeSec and rstTimeSec are non-negative integers', () => {
    const points = buildPoints([
      { durationSec: 1800, distanceM: 2500, count: 360 },
      { durationSec: 600,  distanceM: 3,    count: 120 },
      { durationSec: 1800, distanceM: 2500, count: 360 },
    ]);
    const result = calculateSpeedAnalytics(points);
    assert.ok(result !== null);
    assert.equal(result.movTimeSec, Math.round(result.movTimeSec), 'movTimeSec should be integer');
    assert.equal(result.rstTimeSec, Math.round(result.rstTimeSec), 'rstTimeSec should be integer');
    assert.ok(result.movTimeSec >= 0);
    assert.ok(result.rstTimeSec >= 0);
  });
});
