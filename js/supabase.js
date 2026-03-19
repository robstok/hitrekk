import { CONFIG } from './config.js';

/**
 * Supabase JS client — loaded as UMD global via <script> in HTML.
 * Exposes a single shared client instance used across all modules.
 */
const { createClient } = window.supabase;

export const supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
