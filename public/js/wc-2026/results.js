// ─── Results loader: API → localStorage cache (30 min) → static fallback ───

import { fetchJSON } from '../dom.js';

const CACHE_KEY = 'wc-2026-results-cache-v1';
const CACHE_TTL_MS = 30 * 60 * 1000;

export const EMPTY_RESULTS = { groupStage: {}, knockout: {} };

// Map our round ids to the Worker's response keys. The Worker still emits
// the longer FIFA names (roundOf32, etc.) so older results-cache snapshots
// keep slotting in.
export const ROUND_RESULTS_KEY = {
  r32:   'roundOf32',
  r16:   'roundOf16',
  qf:    'quarterfinals',
  sf:    'semifinals',
  final: 'final',
};

export async function loadResults(force = false) {
  if (!force) {
    const cached = readCache();
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return { ...cached.data, cachedAt: cached.cachedAt, source: 'localStorage' };
    }
  }
  return fetchFresh(force);
}

async function fetchFresh(force) {
  try {
    const url = force ? '/api/wc-results?refresh=1' : '/api/wc-results';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`api ${res.status}`);
    const data = await res.json();
    writeCache(data);
    return { ...data, cachedAt: Date.now(), source: res.headers.get('X-Cache') || 'api' };
  } catch (err) {
    console.warn('live results unavailable, falling back to static file:', err);
    return loadStaticFallback();
  }
}

async function loadStaticFallback() {
  try {
    const data = await fetchJSON('../data/wc-2026-results.json');
    return { ...data, source: 'static' };
  } catch {
    return { ...EMPTY_RESULTS, source: 'none' };
  }
}

export function clearResultsCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* no-op */ }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch {
    // localStorage may be unavailable (private mode etc.), non-fatal
  }
}

export function labelForSource(source) {
  switch (source) {
    case 'localStorage': return 'live results (cached)';
    case 'HIT-KV':       return 'live results (edge cache)';
    case 'MISS':
    case 'BYPASS':
    case 'api':          return 'live results';
    case 'STALE':        return 'live results (stale, upstream down)';
    case 'static':       return 'static fallback';
    default:             return 'no results yet';
  }
}
