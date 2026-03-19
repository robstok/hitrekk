# Horizon: 3D Hiking Explorer

A browser-based 3D hiking route visualiser. Load GPX tracks onto a live topographic map with terrain exaggeration, view elevation profiles, analyse speed data, and track personal records — all without a build step.

---

## Tech Stack

| Layer | Technology |
|---|---|
| 3D Map | [MapLibre GL JS v4](https://maplibre.org/) |
| Elevation Chart | [Chart.js v4](https://www.chartjs.org/) |
| Auth & Backend | [Supabase](https://supabase.com/) (email/password, email confirmation, password reset) |
| Terrain DEM | AWS Elevation Tiles (Terrarium encoding, free, no API key) |
| Hiking Overlay | Waymarked Trails / OSM (free, no API key) |
| Map Style | OpenFreeMap Liberty (free, no API key) |
| Module System | Native ES Modules (`type="module"`) — no bundler, no build step |

---

## Project Structure

```
hike-map/
├── index.html          # Main app shell — loads CDN scripts + css + js/app.js
├── auth.html           # Auth page — sign in, register, forgot & reset password
├── package.json        # npm scripts: dev + start (uses `npx serve`)
├── .gitignore
├── README.md
│
├── css/
│   ├── variables.css   # CSS custom properties & global reset
│   ├── app.css         # Full app layout, sidebar, map, modals, toasts
│   └── auth.css        # Auth card, tabs, form fields
│
└── js/
    ├── config.js       # Central config: Supabase keys, map settings, colours
    ├── supabase.js     # Creates & exports the shared Supabase client
    ├── auth.js         # Auth helper functions (getUser, signIn, signUp, etc.)
    ├── auth-page.js    # Auth page controller (login/register/forgot/reset flows)
    ├── gpx.js          # GPX XML parser + Haversine + route geometry builder
    ├── analytics.js    # Speed analytics: moving/rest time, max speed, avg speed
    ├── map.js          # MapLibre map: terrain, OSM overlay, per-route layers, hover dots
    ├── elevation.js    # Chart.js elevation profile: render, hover sync, destroy
    ├── routes.js       # In-memory route store: add, remove, toggle, activate
    ├── dashboard.js    # Persistent all-time stats (localStorage) + modal renderer
    ├── ui.js           # DOM event wiring: dropzone, file input, route list, toasts
    └── app.js          # Entry point: auth guard, init map + UI + dashboard
```

---

## Quick Start

```bash
# Clone / download the repo, then:
npm run dev
# Open http://localhost:3000
```

You need Node ≥ 18 only for the dev server (`npx serve`). The app itself has no Node dependencies.

---

## Supabase Setup

1. Go to [https://supabase.com](https://supabase.com) and create a free project.

2. In your project dashboard go to **Settings → API**.  
   Copy the **Project URL** and the **anon / public** key.

3. Open `js/config.js` and paste your values:
   ```js
   SUPABASE_URL:      'https://xxxxxxxxxxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
   ```

4. In the Supabase dashboard go to **Authentication → URL Configuration**.  
   Add the following to both **Allowed Origins** and **Redirect URLs**:
   - `http://localhost:3000`
   - `http://localhost:5000` (if using Python server)

5. For production: add your deployed domain (e.g. `https://horizon-hike.vercel.app`) to both lists.

6. Email confirmation is enabled by default in Supabase. After a user registers they will receive a confirmation email before they can sign in. You can disable this in **Authentication → Settings** for development.

---

## Deployment

### Vercel (recommended)

```bash
npx vercel
```

Zero configuration required. Vercel auto-detects a static site, provides free SSL, and deploys from GitHub on push.

### Netlify

Option A — drag and drop: go to [app.netlify.com](https://app.netlify.com), drag the `hike-map/` folder onto the deploy zone.

Option B — git integration: connect your GitHub repo, set publish directory to `.` (root), no build command needed.

### GitHub Pages

Push the repo to GitHub, then in **Settings → Pages** set the source to the `main` branch, root folder. The site will be available at `https://<username>.github.io/<repo>/`.

Note: GitHub Pages serves from a subdirectory path. Update `redirectTo` in `js/auth.js` and Supabase redirect URLs accordingly.

---

## Features

- **3D terrain** — 1.5× exaggeration, hillshade, max 85° pitch
- **Multi-file GPX** — load several routes simultaneously, each with its own colour
- **Elevation profile** — interactive Chart.js panel, chart↔map hover sync
- **Speed analytics** — moving time, rest time, average moving speed, max speed (98th percentile), time bar visualisation
- **OSM hiking trails overlay** — Waymarked Trails raster layer, toggleable
- **Persistent dashboard** — all-time distance, hike count, time, personal records stored in localStorage
- **User auth** — email/password sign-up, email confirmation, password reset via email link
- **Mobile responsive** — slide-out sidebar, adjusted elevation panel, FAB open button
- **Toast notifications** — success/error feedback on file load

---

## Architecture Notes

### Event-driven module communication

Modules communicate via `window.dispatchEvent` / `window.addEventListener` with custom events (`route:added`, `route:removed`, `route:activated`, `route:updated`, `routes:cleared`, `map:ready`). This keeps modules decoupled — `routes.js` does not import `ui.js` or `dashboard.js`.

### Why no bundler?

The app uses native ES Modules in the browser, which avoids the need for Webpack/Vite/Rollup for development. The three CDN dependencies (MapLibre, Chart.js, Supabase) are loaded as UMD globals via `<script>` tags, which is compatible with the native module approach.

### Path to Vite when ready

When you want hot-module replacement and a production bundle:

```bash
npm install --save-dev vite
```

Then change the CDN `<script>` tags to npm imports in each module:

```js
import maplibregl from 'maplibre-gl';
import { Chart } from 'chart.js';
import { createClient } from '@supabase/supabase-js';
```

And update `package.json` scripts to use `vite` / `vite build`.

---

## Environment variables (optional)

For production deployments you can move the Supabase keys out of `config.js` and into environment variables injected at build time (if using Vite) or a server-side config endpoint. For a fully static deploy with no build step, the anon key in `config.js` is safe — it is a public key by design and protected by Supabase Row Level Security policies.
