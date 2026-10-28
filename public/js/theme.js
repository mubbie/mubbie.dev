// ─── Theme (light/dark) ───

// Tracks whether the user has explicitly toggled the theme in this session
// vs. just inheriting from system preference.
const USER_PREF_KEY = 'mubbie-theme-explicit';

// localStorage throws in some privacy modes / when storage is blocked
function getThemePreference() {
  try { return localStorage.getItem(USER_PREF_KEY); } catch { return null; }
}

export function setThemePreference(theme) {
  try { localStorage.setItem(USER_PREF_KEY, theme); } catch { /* not persisted */ }
}

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Forget the explicit choice and follow the device again (live OS changes included)
export function useSystemTheme() {
  try { localStorage.removeItem(USER_PREF_KEY); } catch { /* nothing stored */ }
  const theme = systemTheme();
  applyTheme(theme);
  return theme;
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  // Update meta theme-color for mobile browser chrome
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = theme === 'light' ? '#fff' : '#000';
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setThemePreference(next);
  applyTheme(next);
  return next;
}

export function initTheme() {
  const explicit = getThemePreference();
  if (explicit === 'dark' || explicit === 'light') {
    applyTheme(explicit);
  } else {
    // Follow system preference when no explicit choice has been made
    applyTheme(systemTheme());
  }

  // Listen for OS theme changes (e.g. scheduled dark mode on phones)
  // Only auto-switch if the user hasn't made an explicit choice
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!getThemePreference()) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}
