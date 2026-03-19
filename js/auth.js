import { supabaseClient as sb } from './supabase.js';

/** Return the current session, or null. */
export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}

/** Return the logged-in user, or null. */
export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Guard: redirect to /auth.html if not logged in.
 * Returns the user object if authenticated.
 */
export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/auth.html';
    return null;
  }
  return user;
}

export async function signIn(email, password) {
  return sb.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, fullName) {
  return sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
}

export async function signOut() {
  return sb.auth.signOut();
}

/**
 * Send a password-reset email.
 * The link will redirect to /auth.html#mode=reset.
 */
export async function resetPasswordForEmail(email) {
  return sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth.html#mode=reset`,
  });
}

/** Update the signed-in user's password. */
export async function updatePassword(newPassword) {
  return sb.auth.updateUser({ password: newPassword });
}

/** Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY …). */
export function onAuthStateChange(callback) {
  return sb.auth.onAuthStateChange(callback);
}
