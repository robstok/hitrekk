/**
 * Auth page controller.
 * Handles login, register, forgot-password, and password-reset flows.
 */

import {
  getSession,
  signIn,
  signUp,
  resetPasswordForEmail,
  updatePassword,
  onAuthStateChange,
} from './auth.js';

// ── Initialise ─────────────────────────────────────────────────

async function init() {
  // If already logged in, go to app
  const session = await getSession();
  if (session) {
    window.location.href = '/index.html';
    return;
  }

  // Check URL hash for password-reset flow
  const hash = window.location.hash;
  if (hash.includes('mode=reset') || hash.includes('access_token=')) {
    setMode('reset');
  }

  // Wire up tab buttons
  document.getElementById('tab-login')?.addEventListener('click', () => setMode('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => setMode('register'));

  // Wire up form submissions
  document.getElementById('form-login')?.addEventListener('submit', e => {
    e.preventDefault();
    handleLogin();
  });

  document.getElementById('form-register')?.addEventListener('submit', e => {
    e.preventDefault();
    handleRegister();
  });

  document.getElementById('form-forgot')?.addEventListener('submit', e => {
    e.preventDefault();
    handleForgot();
  });

  document.getElementById('form-reset')?.addEventListener('submit', e => {
    e.preventDefault();
    handleReset();
  });

  // Forgot / back links
  document.getElementById('link-forgot')?.addEventListener('click', e => {
    e.preventDefault();
    setMode('forgot');
  });

  document.querySelectorAll('.link-back-login').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      setMode('login');
    });
  });

  // Auth state changes
  onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      window.location.href = '/index.html';
    }
    if (event === 'PASSWORD_RECOVERY') {
      setMode('reset');
    }
  });
}

// ── Mode management ─────────────────────────────────────────────

/**
 * Show the specified auth panel and configure tabs/UI accordingly.
 * @param {'login'|'register'|'forgot'|'reset'} mode
 */
function setMode(mode) {
  // Hide all panels
  document.querySelectorAll('.auth-panel').forEach(el => el.classList.remove('active'));

  // Show target panel
  const panel = document.getElementById(`panel-${mode}`);
  if (panel) panel.classList.add('active');

  // Tab visibility: only show for login/register
  const tabsEl = document.getElementById('auth-tabs');
  if (tabsEl) {
    if (mode === 'login' || mode === 'register') {
      tabsEl.style.display = '';
    } else {
      tabsEl.style.display = 'none';
    }
  }

  // Update active tab
  document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
  if (mode === 'login') {
    document.getElementById('tab-login')?.classList.add('active');
  } else if (mode === 'register') {
    document.getElementById('tab-register')?.classList.add('active');
  }

  // Clear all messages
  document.querySelectorAll('.form-msg').forEach(el => {
    el.textContent = '';
    el.className = 'form-msg';
  });
}

// ── Handlers ────────────────────────────────────────────────────

async function handleLogin() {
  const email = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;

  if (!email || !password) {
    showError('form-login', 'Please enter your email and password.');
    return;
  }

  const btn = document.getElementById('btn-login');
  setLoading(btn, true);
  clearMsg('form-login');

  const { error } = await signIn(email, password);

  setLoading(btn, false);

  if (error) {
    showError('form-login', error.message || 'Sign in failed. Please check your credentials.');
  }
  // On success, onAuthStateChange will redirect
}

async function handleRegister() {
  const name = document.getElementById('register-name')?.value?.trim();
  const email = document.getElementById('register-email')?.value?.trim();
  const password = document.getElementById('register-password')?.value;
  const confirm = document.getElementById('register-confirm')?.value;

  if (!name || !email || !password || !confirm) {
    showError('form-register', 'Please fill in all fields.');
    return;
  }

  if (password.length < 8) {
    showError('form-register', 'Password must be at least 8 characters.');
    return;
  }

  if (password !== confirm) {
    showError('form-register', 'Passwords do not match.');
    return;
  }

  const btn = document.getElementById('btn-register');
  setLoading(btn, true);
  clearMsg('form-register');

  const { error } = await signUp(email, password, name);

  setLoading(btn, false);

  if (error) {
    showError('form-register', error.message || 'Registration failed. Please try again.');
  } else {
    showSuccess('form-register', 'Check your email to confirm your account, then sign in.');
    // Clear fields
    document.getElementById('form-register')?.reset();
  }
}

async function handleForgot() {
  const email = document.getElementById('forgot-email')?.value?.trim();

  if (!email) {
    showError('form-forgot', 'Please enter your email address.');
    return;
  }

  const btn = document.getElementById('btn-forgot');
  setLoading(btn, true);
  clearMsg('form-forgot');

  const { error } = await resetPasswordForEmail(email);

  setLoading(btn, false);

  if (error) {
    showError('form-forgot', error.message || 'Could not send reset email. Please try again.');
  } else {
    showSuccess('form-forgot', `Password reset link sent to ${email}. Check your inbox.`);
  }
}

async function handleReset() {
  const password = document.getElementById('reset-password')?.value;
  const confirm = document.getElementById('reset-confirm')?.value;

  if (!password || !confirm) {
    showError('form-reset', 'Please enter and confirm your new password.');
    return;
  }

  if (password.length < 8) {
    showError('form-reset', 'Password must be at least 8 characters.');
    return;
  }

  if (password !== confirm) {
    showError('form-reset', 'Passwords do not match.');
    return;
  }

  const btn = document.getElementById('btn-reset');
  setLoading(btn, true);
  clearMsg('form-reset');

  const { error } = await updatePassword(password);

  setLoading(btn, false);

  if (error) {
    showError('form-reset', error.message || 'Could not update password. Please try again.');
  } else {
    showSuccess('form-reset', 'Password updated! Redirecting to the app…');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 2000);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Set button loading state.
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 */
function setLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn._origText = btn.textContent;
    btn.textContent = 'Please wait…';
  } else {
    btn.textContent = btn._origText || btn.textContent;
  }
}

/**
 * Show an error message inside a form.
 * @param {string} formId
 * @param {string} msg
 */
function showError(formId, msg) {
  const form = document.getElementById(formId);
  const el = form?.querySelector('.form-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'form-msg error';
}

/**
 * Show a success message inside a form.
 * @param {string} formId
 * @param {string} msg
 */
function showSuccess(formId, msg) {
  const form = document.getElementById(formId);
  const el = form?.querySelector('.form-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'form-msg success';
}

/**
 * Clear the message inside a form.
 * @param {string} formId
 */
function clearMsg(formId) {
  const form = document.getElementById(formId);
  const el = form?.querySelector('.form-msg');
  if (!el) return;
  el.textContent = '';
  el.className = 'form-msg';
}

// ── Boot ─────────────────────────────────────────────────────────

init().catch(err => {
  console.error('Auth page init failed:', err);
});
