// ─── Shared DOM helpers ───

export function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

export function fetchJSON(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) throw new Error(`${url}: unexpected content-type ${type}`);
    return res.json();
  });
}

export function showFallback(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const fallback = document.createElement('div');
  fallback.className = 'section-fallback';
  fallback.textContent = message;
  el.appendChild(fallback);
}
