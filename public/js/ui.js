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
  document.body.appendChild(btn);

  btn.addEventListener('click', () => {
    scrollToTop();
  });

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }, { passive: true });
}

export function initShortcutHint() {
  if (localStorage.getItem('mubbie-hint-dismissed')) return;

  const hint = document.createElement('div');
  hint.className = 'shortcut-hint';
  hint.innerHTML = 'press <kbd>/</kbd> to start typing';

  const terminal = document.getElementById('terminal');
  if (!terminal) return;
  terminal.appendChild(hint);

  setTimeout(() => hint.classList.add('visible'), 1500);

  function dismiss() {
    hint.classList.remove('visible');
    localStorage.setItem('mubbie-hint-dismissed', '1');
    setTimeout(() => hint.remove(), 300);
  }

  hint.addEventListener('click', dismiss);
  document.getElementById('terminal-input')?.addEventListener('focus', dismiss);
}
