/**
 * Dashboard — fetches per-route stats from Supabase and renders
 * an aggregate view (all-time).
 */

import { getAllRoutes } from './routes.js';
import { aggregateStats, fmtDur } from './dashboard-logic.js';

// ── Public API ──────────────────────────────────────────────────

export function init() {
  // Clear legacy localStorage data accumulated before the Supabase refactor
  localStorage.removeItem('horizon_dashboard_v1');

  // Refresh stats live if the modal is open when routes change
  const refreshIfOpen = () => {
    if (document.getElementById('dash-modal')?.classList.contains('show')) {
      _refreshStats();
    }
  };
  window.addEventListener('route:added',   refreshIfOpen);
  window.addEventListener('route:removed', refreshIfOpen);
  window.addEventListener('routes:cleared', refreshIfOpen);
}

/** No longer accumulates in localStorage — stats come from Supabase. */
export function commit() {}

export function open() {
  render();
  document.getElementById('dash-modal')?.classList.add('show');
}

export function close() {
  document.getElementById('dash-modal')?.classList.remove('show');
}

// ── Rendering ───────────────────────────────────────────────────

function render() {
  const body = document.getElementById('dash-body');
  if (!body) return;
  body.innerHTML = `<div id="dash-stats-content"></div>`;
  _refreshStats();
}

function _refreshStats() {
  const content = document.getElementById('dash-stats-content');
  if (!content) return;

  const all = getAllRoutes().map(r => ({
    name:      r.name,
    hike_date: r.startDate ? r.startDate.toISOString().split('T')[0] : null,
    stats: {
      totalDist:   r.totalDist        ?? 0,
      movTimeSec:  r.speed?.movTimeSec ?? 0,
      rstTimeSec:  r.speed?.rstTimeSec ?? 0,
      maxSpeedKmh: r.speed?.maxSpeed   ?? 0,
    },
  }));
  const agg = aggregateStats(all);

  const badge = document.getElementById('dash-hike-badge');
  if (badge) {
    badge.textContent = agg.hikeCount === 0
      ? 'No hikes'
      : `${agg.hikeCount} ${agg.hikeCount === 1 ? 'hike' : 'hikes'}`;
  }

  content.innerHTML = agg.hikeCount === 0
    ? `<div class="dash-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 17l5-8 4 6 3-4 5 6H3z"/>
          <circle cx="18" cy="6" r="2"/>
        </svg>
        <p>No hikes yet</p>
      </div>`
    : _buildStatsHtml(agg);
}

function _buildStatsHtml(agg) {
  const hikeCount = agg.hikeCount;
  const { totalDistKm, totalMovSec, totalRstSec, maxSpeedKmh, maxSpeedName, longestKm, longestName } = agg;

  const distStr  = totalDistKm >= 1000
    ? (totalDistKm / 1000).toFixed(1)
    : Math.round(totalDistKm).toString();
  const distUnit = totalDistKm >= 1000 ? 'Mm' : 'km';

  const hasTime  = totalMovSec > 0 || totalRstSec > 0;
  const totalSec = totalMovSec + totalRstSec;
  const movPct   = totalSec > 0 ? Math.round((totalMovSec / totalSec) * 100) : 0;
  const rstPct   = 100 - movPct;

  const speedSet   = maxSpeedKmh > 0;
  const longestSet = longestKm > 0;

  return `
    <div class="dash-grid">
      <div class="dash-stat accent">
        <div class="d-val">${distStr}<span class="d-unit">${distUnit}</span></div>
        <div class="d-lbl">Total Distance</div>
      </div>
      <div class="dash-stat">
        <div class="d-val">${hikeCount}</div>
        <div class="d-lbl">Hikes</div>
      </div>
      ${hasTime ? `
      <div class="dash-stat">
        <div class="d-val">${fmtDur(totalMovSec)}</div>
        <div class="d-lbl">Moving Time</div>
      </div>
      <div class="dash-stat">
        <div class="d-val">${fmtDur(totalRstSec)}</div>
        <div class="d-lbl">Rest Time</div>
      </div>
      ` : ''}
    </div>

    ${hasTime && totalSec > 0 ? `
    <div style="margin-bottom: 12px;">
      <div class="time-bar">
        <div class="time-bar-mv" style="width: ${movPct}%"></div>
        <div class="time-bar-rs" style="width: ${rstPct}%"></div>
      </div>
      <div class="time-legend">
        <span><span class="ldot" style="background: var(--green)"></span>Moving ${movPct}%</span>
        <span>Resting ${rstPct}%<span class="ldot" style="background: #F59E0B; margin-left: 4px; margin-right: 0"></span></span>
      </div>
    </div>
    ` : ''}

    <div class="pr-lbl">Personal Records</div>

    <div class="pr-card ${speedSet ? 'set' : ''}">
      <div class="pr-icon">⚡</div>
      <div class="pr-info">
        <div class="pr-val">${speedSet ? maxSpeedKmh.toFixed(1) : '—'}<span class="pr-unit"> km/h</span></div>
        <div class="pr-name">${speedSet ? maxSpeedName : 'No data yet'}</div>
      </div>
      <div style="font-size: 10px; color: var(--text-2)">Max Speed</div>
    </div>

    <div class="pr-card ${longestSet ? 'set' : ''}">
      <div class="pr-icon">🥾</div>
      <div class="pr-info">
        <div class="pr-val">${longestSet ? longestKm.toFixed(1) : '—'}<span class="pr-unit"> km</span></div>
        <div class="pr-name">${longestSet ? longestName : 'No data yet'}</div>
      </div>
      <div style="font-size: 10px; color: var(--text-2)">Longest Hike</div>
    </div>
  `;
}
