// ─── Race tabs: one panel per yearly challenge ───
// Opens on the current year's challenge (falls back to the first tab).

export function selectRaceTab(year) {
  const tab = document.querySelector(`.race-tab[data-year="${year}"]`);
  if (!tab) return false;
  document.querySelectorAll('.race-tab').forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
  const label = document.getElementById('races-label');
  if (label) label.textContent = tab.dataset.label;
  return true;
}

export function initRaceTabs() {
  const tabs = [...document.querySelectorAll('.race-tab')];
  if (!tabs.length) return;

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectRaceTab(tab.dataset.year));
    // Arrow keys move between tabs, per the ARIA tabs pattern
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectRaceTab(next.dataset.year);
      next.focus();
    });
  });

  if (!selectRaceTab(String(new Date().getFullYear()))) selectRaceTab(tabs[0].dataset.year);
}
