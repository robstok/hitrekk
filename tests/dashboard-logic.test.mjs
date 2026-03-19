import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateStats,
  filterByPeriod,
  getPeriodRange,
  fmtDur,
} from '../js/dashboard-logic.js';

const NOW = new Date('2026-03-19T12:00:00Z');

// ── fmtDur ───────────────────────────────────────────────────────

describe('fmtDur', () => {
  it('returns 0m for zero', () => assert.equal(fmtDur(0), '0m'));
  it('returns 0m for negative', () => assert.equal(fmtDur(-1), '0m'));
  it('returns 0m for null', () => assert.equal(fmtDur(null), '0m'));
  it('formats minutes only', () => assert.equal(fmtDur(90), '1m'));
  it('formats exactly 1 hour', () => assert.equal(fmtDur(3600), '1h 0m'));
  it('formats hours and minutes', () => assert.equal(fmtDur(3660), '1h 1m'));
  it('formats 3h 22m', () => assert.equal(fmtDur(3 * 3600 + 22 * 60), '3h 22m'));
});

// ── getPeriodRange ───────────────────────────────────────────────

describe('getPeriodRange', () => {
  it('this_year returns correct year bounds', () => {
    const { from, to } = getPeriodRange('this_year', null, null, NOW);
    assert.equal(from, '2026-01-01');
    assert.equal(to,   '2026-12-31');
  });

  it('last_year returns correct year bounds', () => {
    const { from, to } = getPeriodRange('last_year', null, null, NOW);
    assert.equal(from, '2025-01-01');
    assert.equal(to,   '2025-12-31');
  });

  it('past_30 sets from to 30 days ago, no to', () => {
    const { from, to } = getPeriodRange('past_30', null, null, NOW);
    assert.equal(from, '2026-02-17');
    assert.equal(to,   null);
  });

  it('past_90 sets from to 90 days ago, no to', () => {
    const { from, to } = getPeriodRange('past_90', null, null, NOW);
    assert.equal(from, '2025-12-19');
    assert.equal(to,   null);
  });

  it('all_time returns nulls', () => {
    const { from, to } = getPeriodRange('all_time', null, null, NOW);
    assert.equal(from, null);
    assert.equal(to,   null);
  });

  it('custom uses provided dates', () => {
    const { from, to } = getPeriodRange('custom', '2025-06-01', '2025-08-31', NOW);
    assert.equal(from, '2025-06-01');
    assert.equal(to,   '2025-08-31');
  });

  it('custom with null dates passes through nulls', () => {
    const { from, to } = getPeriodRange('custom', null, null, NOW);
    assert.equal(from, null);
    assert.equal(to,   null);
  });
});

// ── filterByPeriod ───────────────────────────────────────────────

const ROUTES = [
  { id: '1', name: 'Alps 2024',  hike_date: '2024-08-15', created_at: '2026-01-10T10:00:00Z', stats: null },
  { id: '2', name: 'Pyrenees',   hike_date: '2025-07-20', created_at: '2026-01-15T10:00:00Z', stats: null },
  { id: '3', name: 'Dolomites',  hike_date: '2026-02-01', created_at: '2026-02-01T10:00:00Z', stats: null },
  { id: '4', name: 'No date',    hike_date: null,          created_at: '2026-03-10T10:00:00Z', stats: null },
];

describe('filterByPeriod', () => {
  it('all_time returns all routes', () => {
    const result = filterByPeriod(ROUTES, 'all_time', null, null, NOW);
    assert.equal(result.length, 4);
  });

  it('this_year (2026) includes 2026 hike_date and null hike_date (created 2026)', () => {
    const result = filterByPeriod(ROUTES, 'this_year', null, null, NOW);
    const names = result.map(r => r.name);
    assert.ok(names.includes('Dolomites'), 'should include 2026 hike');
    assert.ok(names.includes('No date'),   'should include null hike_date (created 2026)');
    assert.ok(!names.includes('Alps 2024'), 'should exclude 2024 hike');
    assert.ok(!names.includes('Pyrenees'), 'should exclude 2025 hike');
  });

  it('last_year (2025) includes only 2025 hike', () => {
    const result = filterByPeriod(ROUTES, 'last_year', null, null, NOW);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Pyrenees');
  });

  it('past_30 includes routes from last 30 days', () => {
    // NOW = 2026-03-19, past_30 from = 2026-02-17
    // 'Dolomites' hike_date = 2026-02-01 → EXCLUDED (before 2026-02-17)
    // 'No date' created_at = 2026-03-10 → INCLUDED
    const result = filterByPeriod(ROUTES, 'past_30', null, null, NOW);
    const names = result.map(r => r.name);
    assert.ok(names.includes('No date'),    'should include route from 2026-03-10');
    assert.ok(!names.includes('Dolomites'), 'should exclude 2026-02-01 route');
  });

  it('custom range filters correctly', () => {
    const result = filterByPeriod(ROUTES, 'custom', '2025-01-01', '2025-12-31', NOW);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Pyrenees');
  });

  it('route with no date or created_at is included (safe default)', () => {
    const noDate = [{ id: '99', name: 'Ghost', hike_date: null, created_at: null, stats: null }];
    const result = filterByPeriod(noDate, 'this_year', null, null, NOW);
    assert.equal(result.length, 1);
  });

  it('hike_date takes precedence over created_at', () => {
    // hike from 2024 but uploaded in 2026
    const result = filterByPeriod(ROUTES, 'this_year', null, null, NOW);
    const names = result.map(r => r.name);
    assert.ok(!names.includes('Alps 2024'), 'hike_date 2024 should not appear in this_year filter');
  });
});

// ── aggregateStats ───────────────────────────────────────────────

describe('aggregateStats', () => {
  it('returns zero hikeCount for empty array', () => {
    const agg = aggregateStats([]);
    assert.equal(agg.hikeCount, 0);
    assert.equal(agg.totalDistKm, 0);
  });

  it('counts hikes correctly', () => {
    const routes = [
      { name: 'A', stats: { totalDist: 10, movTimeSec: 3600, rstTimeSec: 600, maxSpeedKmh: 8 } },
      { name: 'B', stats: { totalDist: 20, movTimeSec: 7200, rstTimeSec: 0,   maxSpeedKmh: 6 } },
    ];
    const agg = aggregateStats(routes);
    assert.equal(agg.hikeCount, 2);
  });

  it('sums distances correctly', () => {
    const routes = [
      { name: 'A', stats: { totalDist: 10.5, movTimeSec: 0, rstTimeSec: 0, maxSpeedKmh: 0 } },
      { name: 'B', stats: { totalDist: 4.3,  movTimeSec: 0, rstTimeSec: 0, maxSpeedKmh: 0 } },
    ];
    const agg = aggregateStats(routes);
    assert.ok(Math.abs(agg.totalDistKm - 14.8) < 0.001, `expected ~14.8, got ${agg.totalDistKm}`);
  });

  it('handles null stats gracefully (contributes 0)', () => {
    const routes = [
      { name: 'A', stats: null },
      { name: 'B', stats: { totalDist: 5, movTimeSec: 1800, rstTimeSec: 0, maxSpeedKmh: 7 } },
    ];
    const agg = aggregateStats(routes);
    assert.equal(agg.hikeCount, 2);
    assert.equal(agg.totalDistKm, 5);
    assert.equal(agg.totalMovSec, 1800);
  });

  it('picks route with highest maxSpeedKmh as record', () => {
    const routes = [
      { name: 'Slow', stats: { totalDist: 5,  movTimeSec: 0, rstTimeSec: 0, maxSpeedKmh: 4 } },
      { name: 'Fast', stats: { totalDist: 10, movTimeSec: 0, rstTimeSec: 0, maxSpeedKmh: 12 } },
    ];
    const agg = aggregateStats(routes);
    assert.equal(agg.maxSpeedKmh, 12);
    assert.equal(agg.maxSpeedName, 'Fast');
  });

  it('picks longest route correctly', () => {
    const routes = [
      { name: 'Short', stats: { totalDist: 5,  movTimeSec: 0, rstTimeSec: 0, maxSpeedKmh: 0 } },
      { name: 'Long',  stats: { totalDist: 30, movTimeSec: 0, rstTimeSec: 0, maxSpeedKmh: 0 } },
    ];
    const agg = aggregateStats(routes);
    assert.equal(agg.longestKm, 30);
    assert.equal(agg.longestName, 'Long');
  });

  it('all null stats: records remain unset (0 / empty string)', () => {
    const routes = [{ name: 'A', stats: null }, { name: 'B', stats: null }];
    const agg = aggregateStats(routes);
    assert.equal(agg.maxSpeedKmh, 0);
    assert.equal(agg.maxSpeedName, '');
    assert.equal(agg.longestKm, 0);
  });

  it('fallback rows (no hike_date/stats columns) are handled safely', () => {
    // Shape returned by the basic fallback query in fetchAllRouteStats
    const rows = [
      { id: '1', name: 'A', created_at: '2026-01-10T10:00:00Z', stats: null, hike_date: null },
      { id: '2', name: 'B', created_at: '2026-02-15T10:00:00Z', stats: null, hike_date: null },
    ];
    const agg = aggregateStats(rows);
    assert.equal(agg.hikeCount, 2);
    assert.equal(agg.totalDistKm, 0);
  });
});
