/**
 * Entry point for the public share page.
 * Loads routes and photos for a given share token — no auth required.
 */

import { initMap } from './map.js';
import { initUI, showToast } from './ui.js';
import { loadSharedRoutes } from './routes.js';
import { initPhotos, loadSharedPhotos } from './photos.js';

const token = new URLSearchParams(window.location.search).get('t');

async function main() {
  if (!token) {
    document.getElementById('route-list-empty').textContent = 'Invalid share link.';
    return;
  }
  initMap('map');
  initUI();
  initPhotos();
  document.getElementById('elev-close')?.addEventListener('click', () => {
    document.getElementById('elev-panel')?.classList.add('hidden');
  });
  try {
    await loadSharedRoutes(token);
    await loadSharedPhotos(token);
    const empty = document.getElementById('route-list-empty');
    if (empty && empty.style.display !== 'none') empty.textContent = 'No routes found.';
  } catch (err) {
    console.error(err);
    showToast('Failed to load shared map', 'error');
  }
}
main().catch(console.error);
