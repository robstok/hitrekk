/**
 * Central application configuration.
 * Replace SUPABASE_URL and SUPABASE_ANON_KEY with your project values.
 * Get them free at: https://supabase.com
 */
export const CONFIG = {
  // ── Supabase ──────────────────────────────────────────────
  // Sign up at https://supabase.com, create a project, then paste
  // your Project URL and anon/public key here.
  SUPABASE_URL:      'https://hhtcmtozzehiualfcksn.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_tIVuDKuz8ngzUIVfDojI-Q_-sIpxvDi',

  // ── Map ───────────────────────────────────────────────────
  MAP_STYLE:          'https://tiles.openfreemap.org/styles/liberty',
  TERRAIN_TILES:      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  TERRAIN_ENCODING:   'terrarium',
  TERRAIN_MAX_ZOOM:   15,
  TERRAIN_EXAGGERATION: 1.5,

  // Standard OSM raster tiles — used as the 2D base map
  OSM_TILES: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

  // OSM Waymarked hiking trails overlay (no API key required)
  HIKING_TILES: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png',

  // ── Initial view (European Alps) ─────────────────────────
  INITIAL_CENTER: [10.0, 47.0],
  INITIAL_ZOOM:   6,
  INITIAL_PITCH:  0,

  // ── Trail colours (cycled for multiple routes) ────────────
  TRAIL_COLORS: ['#FF6B2B', '#4ECDC4', '#45B7D1', '#96CEB4', '#F7DC6F', '#BB8FCE', '#52BE80'],
  TRAIL_WIDTH: 4,

  // ── Speed analytics ───────────────────────────────────────
  MIN_MOVING_SPEED_KMH:   0.8,   // below this = not moving
  REST_THRESHOLD_METRES:  50,    // max movement to still count as rest (GPS drift on a stationary stop)
  REST_MIN_SECONDS:       120,   // must be stopped this long to count as rest
  SPEED_SMOOTH_WINDOW:    5,     // rolling average window for speed

  // ── Persistence keys ─────────────────────────────────────
  DASH_KEY: 'horizon_dashboard_v1',
};
