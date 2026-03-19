/**
 * Chart.js elevation profile module.
 * Renders an interactive elevation chart synced with the map.
 */

import { CONFIG } from './config.js';
import { updateChartHoverPoint } from './map.js';

let _chart = null;
let _step = 1; // downsampling step

/** Render or replace the elevation chart for the given route. */
export function renderElevationChart(route) {
  if (!route?.hasElevation) { hidePanel(); return; }

  const canvas = document.getElementById('elev-chart');
  if (!canvas) return;

  if (_chart) { _chart.destroy(); _chart = null; }

  const ctx = canvas.getContext('2d');

  // Downsample for performance
  const MAX_PTS = 500;
  let pts = route.distances.map((d, i) => ({ x: d, y: route.elevations[i] }));
  _step = 1;
  if (pts.length > MAX_PTS) {
    _step = Math.ceil(pts.length / MAX_PTS);
    pts = pts.filter((_, i) => i % _step === 0);
  }

  // Gradient fill using route colour
  const grad = ctx.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, route.color + '55');
  grad.addColorStop(1, route.color + '00');

  // Capture locals for plugin closure
  const routeColor = route.color;
  const routeCoords = route.coords;
  const step = _step;

  // Plugin: vertical dashed line at hover position
  const vLinePlugin = {
    id: 'vLine',
    afterDraw(ch) {
      if (ch._vLineX == null) return;
      const { ctx: c, scales: { y } } = ch;
      c.save();
      c.beginPath();
      c.moveTo(ch._vLineX, y.top);
      c.lineTo(ch._vLineX, y.bottom);
      c.lineWidth = 2;
      c.strokeStyle = routeColor;
      c.setLineDash([4, 3]);
      c.stroke();
      c.restore();
    },
  };

  _chart = new Chart(ctx, {
    type: 'line',
    plugins: [vLinePlugin],
    data: {
      datasets: [{
        label: 'Elevation',
        data: pts,
        borderColor: routeColor,
        backgroundColor: grad,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: routeColor,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      onHover: (_, elements) => {
        if (!elements.length) { clearHoverState(); return; }
        const idx = elements[0].index;
        const origIdx = Math.min(idx * step, routeCoords.length - 1);
        updateChartHoverPoint(routeCoords[origIdx]);
        _chart._vLineX = elements[0].element.x;
        _chart.draw();
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,12,16,0.95)',
          titleColor: '#8B949E',
          bodyColor: '#F0F6FC',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: items => `${items[0].parsed.x.toFixed(2)} km`,
            label: item => `${Math.round(item.parsed.y)} m elevation`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Distance (km)',
            color: '#8B949E',
            font: { size: 11 },
          },
          ticks: {
            color: '#8B949E',
            font: { size: 10 },
            maxTicksLimit: 8,
            callback: v => `${Number(v).toFixed(1)}`,
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'rgba(255,255,255,0.08)' },
        },
        y: {
          title: {
            display: true,
            text: 'Elevation (m)',
            color: '#8B949E',
            font: { size: 11 },
          },
          ticks: {
            color: '#8B949E',
            font: { size: 10 },
            maxTicksLimit: 5,
            callback: v => `${Math.round(v)}m`,
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'rgba(255,255,255,0.08)' },
        },
      },
    },
  });

  showPanel();
}

/**
 * Sync chart vertical line and tooltip when hovering the map trail.
 * Called from ui.js with the nearest route point index.
 *
 * @param {Object} routeData - The active route data object
 * @param {number} nearestIdx - Index into routeData.coords
 */
export function syncChartToMapHover(routeData, nearestIdx) {
  if (!_chart) return;
  const chartIdx = Math.min(
    Math.round(nearestIdx / _step),
    _chart.data.datasets[0].data.length - 1
  );
  _chart._vLineX = _chart.scales.x.getPixelForValue(routeData.distances[nearestIdx]);
  _chart.tooltip.setActiveElements(
    [{ datasetIndex: 0, index: chartIdx }],
    { x: 0, y: 0 }
  );
  _chart.update('none');
}

/** Clear chart hover line and tooltip, and clear the map hover dot. */
export function clearHoverState() {
  updateChartHoverPoint(null);
  if (!_chart) return;
  _chart._vLineX = null;
  _chart.tooltip.setActiveElements([], {});
  _chart.draw();
}

/** Destroy the chart instance. */
export function destroyChart() {
  if (_chart) { _chart.destroy(); _chart = null; }
  hidePanel();
}

function showPanel() {
  document.getElementById('elev-panel')?.classList.remove('hidden');
}

function hidePanel() {
  document.getElementById('elev-panel')?.classList.add('hidden');
}
