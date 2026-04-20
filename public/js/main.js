// ─── Entry point ───

import { initTheme } from './theme.js';
import { initSections } from './sections.js';
import { initTerminal } from './terminal/index.js';
import { isMatrixActive, stopMatrix } from './matrix.js';
import { scrollToEl } from './scroll.js';

// ─── Init ───
initTheme();
initSections();
initTerminal();

// ─── Global keyboard shortcuts ───
const NAV_SHORTCUTS = {
  '1': 'projects',
  '2': 'writing',
  '3': 'currently',
  '4': 'races',
  '5': 'bucketlist',
  '6': 'connect',
};

document.addEventListener('keydown', (e) => {
  // Escape exits matrix
  if (e.key === 'Escape' && isMatrixActive()) {
    stopMatrix();
    return;
  }

  // Don't fire shortcuts when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // "/" to focus terminal
  if (e.key === '/') {
    e.preventDefault();
    const termInput = document.getElementById('terminal-input');
    if (termInput) {
      scrollToEl(document.getElementById('terminal'));
      setTimeout(() => termInput.focus(), 300);
    }
    return;
  }

  // Number keys to navigate sections
  const section = NAV_SHORTCUTS[e.key];
  if (section) {
    scrollToEl(document.getElementById(section));
  }
});
