// ─── Theme (light/dark) ───

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mubbie-theme', theme);
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function initTheme() {
  applyTheme(localStorage.getItem('mubbie-theme') || 'dark');
}
