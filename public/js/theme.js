// ─── Theme (light/dark) ───

// Tracks whether the user has explicitly toggled the theme in this session
// vs. just inheriting from system preference.
const USER_PREF_KEY = 'mubbie-theme-explicit';

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  // Update meta theme-color for mobile browser chrome
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = theme === 'light' ? '#f5f5f0' : '#0a0a0c';
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(USER_PREF_KEY, next);
  applyTheme(next);
  return next;
}

export function initTheme() {
  const explicit = localStorage.getItem(USER_PREF_KEY);
  if (explicit) {
    applyTheme(explicit);
  } else {
    // Follow system preference when no explicit choice has been made
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  // Listen for OS theme changes (e.g. scheduled dark mode on phones)
  // Only auto-switch if the user hasn't made an explicit choice
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(USER_PREF_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}
