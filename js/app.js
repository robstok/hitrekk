/**
 * Main entry point.
 * Orchestrates all modules: auth guard, map boot, UI, dashboard.
 */

import { requireAuth, signOut, onAuthStateChange } from './auth.js';
import { initMap } from './map.js';
import { initUI, showToast } from './ui.js';
import * as dashboard from './dashboard.js';
import { clearAllRoutes, loadSavedRoutes } from './routes.js';
import { destroyChart } from './elevation.js';
import { initPhotos, loadSavedPhotos } from './photos.js';

async function main() {
  // Auth guard — redirects to /auth.html if not signed in
  const user = await requireAuth();
  if (!user) return;

  // Show user display name or email
  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = user.user_metadata?.full_name || user.email;

  // Boot map and UI
  initMap('map');
  initUI();
  initPhotos();
  dashboard.init();

  // Load routes and photos saved from previous sessions
  loadSavedRoutes().catch(err => console.warn('Failed to load saved routes:', err));
  loadSavedPhotos().catch(err => console.warn('Failed to load saved photos:', err));

  // Commit each new route to the persistent dashboard
  window.addEventListener('route:added', e => {
    dashboard.commit(e.detail);
  });

  // Dashboard modal
  document.getElementById('dash-btn')?.addEventListener('click', () => dashboard.open());
  document.getElementById('dash-close')?.addEventListener('click', () => dashboard.close());
  document.getElementById('dash-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) dashboard.close();
  });

  // Clear all routes
  document.getElementById('clear-all-btn')?.addEventListener('click', () => {
    if (!confirm('Remove all loaded routes?')) return;
    clearAllRoutes();
    destroyChart();
    showToast('All routes cleared', 'info');
  });

  // Elevation panel close
  document.getElementById('elev-close')?.addEventListener('click', () => {
    document.getElementById('elev-panel')?.classList.add('hidden');
  });

  // Sign out
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await signOut();
    window.location.href = '/auth.html';
  });

  // Handle remote sign-out (e.g. token expiry)
  onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.href = '/auth.html';
  });
}

main().catch(err => {
  console.error('App init failed:', err);
});
