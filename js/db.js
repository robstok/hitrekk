/**
 * Supabase persistence for user routes.
 */

import { supabaseClient as sb } from './supabase.js';
import { CONFIG } from './config.js';

export async function saveRoute(id, userId, name, color, gpxContent, stats = null, hikeDate = null) {
  const row = { id, user_id: userId, name, color, gpx_content: gpxContent };
  if (stats !== null)    row.stats     = stats;
  if (hikeDate !== null) row.hike_date = hikeDate;

  const { error } = await sb.from('routes').upsert(row);

  if (error) {
    // stats/hike_date columns may not exist yet — retry with core columns only
    if (error.message?.includes('hike_date') || error.message?.includes('stats') || error.message?.includes('schema cache')) {
      const coreRow = { id, user_id: userId, name, color, gpx_content: gpxContent };
      const { error: err2 } = await sb.from('routes').upsert(coreRow);
      if (err2) throw err2;
      return;
    }
    throw error;
  }
}

export async function updateRouteName(id, name) {
  const { error } = await sb.from('routes').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function updateRouteStats(id, stats) {
  const { error } = await sb.from('routes').update({ stats }).eq('id', id);
  if (error) {
    // stats column may not exist yet — silently skip rather than breaking the UI
    if (error.message?.includes('stats') || error.message?.includes('schema cache')) return;
    throw error;
  }
}

export async function deleteRoute(id) {
  const { error } = await sb.from('routes').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAllUserRoutes(userId) {
  const { error } = await sb.from('routes').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function fetchUserRoutes() {
  const { data, error } = await sb
    .from('routes')
    .select('id, name, color, gpx_content, created_at, stats, hike_date')
    .order('created_at', { ascending: true });

  if (error) {
    // stats/hike_date columns may not exist yet — fall back to core columns
    console.warn('fetchUserRoutes: falling back to basic query:', error.message);
    const { data: basic, error: err2 } = await sb
      .from('routes')
      .select('id, name, color, gpx_content, created_at')
      .order('created_at', { ascending: true });
    if (err2) throw err2;
    return (basic ?? []).map(r => ({ ...r, stats: null, hike_date: null }));
  }

  return data ?? [];
}

// ── Photo storage ─────────────────────────────────────────────────

export async function uploadPhotoFile(storagePath, file) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Storage: not authenticated');

  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/storage/v1/object/photos/${storagePath}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'x-upsert': 'true',
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Storage: ${body.message ?? res.statusText}`);
  }
}

export function getPhotoPublicUrl(storagePath) {
  const { data } = sb.storage.from('photos').getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function savePhotoRecord(id, userId, routeId, name, lat, lon, photoTime, storagePath) {
  const row = { id, user_id: userId, route_id: routeId, name, lat, lon, storage_path: storagePath };
  if (photoTime) row.photo_time = photoTime.toISOString();
  const { error } = await sb.from('photos').insert(row);
  if (error) throw new Error(`DB: ${error.message}`);
}

export async function fetchUserPhotos() {
  const { data, error } = await sb
    .from('photos')
    .select('id, route_id, name, lat, lon, photo_time, storage_path')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function deletePhotosForRoute(routeId) {
  const { data } = await sb.from('photos').select('storage_path').eq('route_id', routeId);
  const paths = (data ?? []).map(r => r.storage_path).filter(Boolean);
  if (paths.length) await sb.storage.from('photos').remove(paths);
  await sb.from('photos').delete().eq('route_id', routeId);
}

export async function deleteAllUserPhotos(userId) {
  const { data } = await sb.from('photos').select('storage_path').eq('user_id', userId);
  const paths = (data ?? []).map(r => r.storage_path).filter(Boolean);
  if (paths.length) await sb.storage.from('photos').remove(paths);
  await sb.from('photos').delete().eq('user_id', userId);
}

/** Fetch all routes for the dashboard (no gpx_content, just stats). */
export async function fetchAllRouteStats() {
  // Try with stats/hike_date columns first; fall back if they don't exist yet.
  const { data, error } = await sb
    .from('routes')
    .select('id, name, hike_date, created_at, stats')
    .order('created_at', { ascending: true });

  if (error) {
    // Columns may not exist — fall back to basic query so the dashboard still loads
    console.warn('fetchAllRouteStats: falling back to basic query:', error.message);
    const { data: basic, error: err2 } = await sb
      .from('routes')
      .select('id, name, created_at')
      .order('created_at', { ascending: true });
    if (err2) throw err2;
    return (basic ?? []).map(r => ({ ...r, stats: null, hike_date: null }));
  }

  return data ?? [];
}
