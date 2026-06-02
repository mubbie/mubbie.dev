// ─── Keyboard shortcuts ───
//
// Global keys (only when not typing in an input/textarea):
//   1   scroll to overview
//   2   scroll to groups
//   3   scroll to knockout
//   4   scroll to tree
//   r   refresh results
//   c   download calendar
//   ?   toast the shortcut list

const SECTION_KEYS = {
  '1': 'overview',
  '2': 'groups',
  '3': 'knockout',
  '4': 'tree',
};

export function initShortcuts({ onRefresh, onCalendar }) {
  document.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const sectionId = SECTION_KEYS[e.key];
    if (sectionId) {
      scrollToSection(sectionId);
      e.preventDefault();
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      onRefresh?.();
      e.preventDefault();
      return;
    }
    if (e.key === 'c' || e.key === 'C') {
      onCalendar?.();
      e.preventDefault();
      return;
    }
    if (e.key === '?') {
      toastHelp();
      e.preventDefault();
    }
  });
}

function isTyping(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let toastEl = null;
let toastTimer = null;

function toastHelp() {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'wc-toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = (
    `<strong>shortcuts</strong>` +
    `<div><kbd>1</kbd>–<kbd>4</kbd> jump to a section</div>` +
    `<div><kbd>r</kbd> refresh results · <kbd>c</kbd> calendar</div>` +
    `<div><kbd>←</kbd> <kbd>→</kbd> change knockout round (when focused)</div>`
  );
  toastEl.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 4000);
}
