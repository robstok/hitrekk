# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dev server

```bash
npm run dev    # serves on http://localhost:3000
```

No build step — the app uses native ES Modules and CDN UMD scripts.

## Architecture

### Module layout

```
js/
  config.js       # All configuration constants (Supabase keys, map settings, colours)
  supabase.js     # Single shared Supabase client instance
  auth.js         # Auth helpers: getUser, requireAuth, signIn, signUp, signOut, resetPasswordForEmail, updatePassword, onAuthStateChange
  auth-page.js    # Auth page controller: login / register / forgot / reset flows
  gpx.js          # GPX XML parser, Haversine distance, route geometry builder
  analytics.js    # Speed analytics: moving/rest time, avg speed, max speed
  map.js          # MapLibre map: terrain, OSM overlay, per-route layers, hover dots
  elevation.js    # Chart.js elevation profile: render, hover sync, destroy
  routes.js       # In-memory route store: add, remove, toggle, activate
  dashboard.js    # Persistent all-time stats (localStorage) + modal renderer
  ui.js           # DOM event wiring: dropzone, file input, route list, toasts
  app.js          # Entry point: auth guard, init map + UI + dashboard
```

### Key patterns

- **Event bus**: modules communicate via `window.dispatchEvent` / `window.addEventListener` with custom events (`route:added`, `route:removed`, `route:activated`, `route:updated`, `routes:cleared`, `map:ready`). `routes.js` never imports `ui.js` or `dashboard.js`.
- **Map readiness**: `onMapReady(cb)` in `map.js` queues callbacks until `style.load` fires. Always use it before accessing map sources/layers.
- **Chart↔Map hover sync**: `chartHoverX` variable in `elevation.js` and `vLinePlugin` keep the chart crosshair and map dot in sync.
- **Auth guard**: `requireAuth()` in `app.js` redirects to `/auth.html` if no Supabase session.

### CDN globals vs ES modules

MapLibre, Chart.js, and Supabase are loaded as UMD globals via `<script>` tags in the HTML (before ES module scripts). In JS modules, access them as `maplibregl`, `Chart`, and `window.supabase`. Do not `import` them.

## Supabase setup

Edit `js/config.js`:
```js
SUPABASE_URL:      'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJ...',
```

Add `http://localhost:3000` (and your production domain) to Supabase → Authentication → URL Configuration → Allowed Origins & Redirect URLs.

## Hosting

Static site — deploy as-is to Vercel (`npx vercel`), Netlify (drag-and-drop), or GitHub Pages. No build command needed. See README.md for details.

## Path to Vite

When a bundler is needed, replace CDN `<script>` tags with npm imports (`maplibre-gl`, `chart.js`, `@supabase/supabase-js`) and add Vite to `package.json` scripts.
