// ─── Scroll helper respecting reduced-motion preference ───

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function scrollBehavior() {
  return motionQuery.matches ? 'auto' : 'smooth';
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

export function scrollToEl(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: scrollBehavior() });
  if (!el.getAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
