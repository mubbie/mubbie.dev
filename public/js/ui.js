// ─── UI: scroll reveal, back-to-top, shortcut hint ───

import { scrollToTop } from './scroll.js';

export function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    },
    { threshold: 0.1 }
  );
  reveals.forEach((el) => observer.observe(el));
}

export function initBackToTop() {
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.textContent = '↑';
  btn.tabIndex = -1; // hidden until scrolled; don't leave an invisible tab stop
  document.body.appendChild(btn);

  btn.addEventListener('click', () => {
    scrollToTop();
  });

  window.addEventListener('scroll', () => {
    const visible = window.scrollY > 400;
    btn.classList.toggle('visible', visible);
    btn.tabIndex = visible ? 0 : -1;
  }, { passive: true });
}

const HINT_KEY = 'mubbie-hint-dismissed';

export function initShortcutHint() {
  let dismissed = false;
  try { dismissed = Boolean(localStorage.getItem(HINT_KEY)); } catch { /* storage blocked */ }
  if (dismissed) return;

  const hint = document.createElement('div');
  hint.className = 'shortcut-hint';
  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  hint.innerHTML = isTouch ? 'tap here to start typing' : 'press <kbd>/</kbd> to start typing';

  const terminal = document.getElementById('terminal');
  if (!terminal) return;
  terminal.appendChild(hint);

  setTimeout(() => hint.classList.add('visible'), 1500);

  function dismiss() {
    hint.classList.remove('visible');
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* storage blocked */ }
    setTimeout(() => hint.remove(), 300);
  }

  hint.addEventListener('click', () => {
    if (isTouch) document.getElementById('terminal-input')?.focus();
    dismiss();
  });
  document.getElementById('terminal-input')?.addEventListener('focus', dismiss);
}
