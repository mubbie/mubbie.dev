// ─── WC 2026 bracket page ───

import { initTheme } from './theme.js';
import { initFooter } from './footer.js';
import { initScrollReveal } from './ui.js';
import { fetchJSON } from './dom.js';

const ROUNDS = [
  { key: 'roundOf32',     label: 'Round of 32', short: 'R32',   id: 'r32' },
  { key: 'roundOf16',     label: 'Round of 16', short: 'R16',   id: 'r16' },
  { key: 'quarterfinals', label: 'Quarterfinals', short: 'QF',  id: 'qf' },
  { key: 'semifinals',    label: 'Semifinals',  short: 'SF',    id: 'sf' },
  { key: 'final',         label: 'Final',       short: 'Final', id: 'final' },
];

// ISO 3166-1 alpha-2 codes (or flagcdn subdivision codes) for flag images
const ISO = {
  'South Korea': 'kr', 'Mexico': 'mx', 'South Africa': 'za',
  'Switzerland': 'ch', 'Canada': 'ca',
  'Brazil': 'br', 'Morocco': 'ma', 'Scotland': 'gb-sct',
  'Australia': 'au', 'Turkey': 'tr', 'United States': 'us',
  'Germany': 'de', 'Ivory Coast': 'ci', 'Ecuador': 'ec',
  'Netherlands': 'nl', 'Japan': 'jp', 'Tunisia': 'tn',
  'Belgium': 'be', 'Egypt': 'eg',
  'Spain': 'es', 'Uruguay': 'uy',
  'France': 'fr', 'Senegal': 'sn', 'Norway': 'no',
  'Argentina': 'ar', 'Algeria': 'dz', 'Austria': 'at',
  'Portugal': 'pt', 'Colombia': 'co',
  'England': 'gb-eng', 'Croatia': 'hr', 'Ghana': 'gh',
};

const CODES = {
  'South Korea': 'KOR', 'Mexico': 'MEX', 'South Africa': 'RSA',
  'Switzerland': 'SUI', 'Canada': 'CAN',
  'Brazil': 'BRA', 'Morocco': 'MAR', 'Scotland': 'SCO',
  'Australia': 'AUS', 'Turkey': 'TUR', 'United States': 'USA',
  'Germany': 'GER', 'Ivory Coast': 'CIV', 'Ecuador': 'ECU',
  'Netherlands': 'NED', 'Japan': 'JPN', 'Tunisia': 'TUN',
  'Belgium': 'BEL', 'Egypt': 'EGY',
  'Spain': 'ESP', 'Uruguay': 'URU',
  'France': 'FRA', 'Senegal': 'SEN', 'Norway': 'NOR',
  'Argentina': 'ARG', 'Algeria': 'ALG', 'Austria': 'AUT',
  'Portugal': 'POR', 'Colombia': 'COL',
  'England': 'ENG', 'Croatia': 'CRO', 'Ghana': 'GHA',
};

const code = (team) => CODES[team] || team.slice(0, 3).toUpperCase();

function flag(team, size = 'sm') {
  const iso = ISO[team];
  if (!iso) return `<span class="wc-flag-placeholder">${code(team)}</span>`;
  const widths = { sm: 20, md: 40, lg: 80 };
  const w = widths[size] || 20;
  return `<img class="wc-flag wc-flag-${size}" src="https://flagcdn.com/w${w}/${iso}.png" srcset="https://flagcdn.com/w${w * 2}/${iso}.png 2x" alt="" loading="lazy" decoding="async">`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  }) + ' PT';
}

function matchKey(m) {
  return `${m.home}-${m.away}`;
}

// ─── Init ───

initTheme();
initFooter();
initScrollReveal();

const state = { picks: null, results: null };

(async function init() {
  try {
    const [picks, results] = await Promise.all([
      fetchJSON('../data/wc-2026.json'),
      loadResults(),
    ]);
    state.picks = picks;
    state.results = results;
    setChampion(picks);
    setBracketLink(picks);
    renderKnockout(picks);   // builds stepper once
    renderAll();
    wireRefreshButton();
  } catch (err) {
    console.error(err);
    const ov = document.getElementById('wc-overview');
    if (ov) ov.textContent = 'could not load bracket data.';
  }
})();

function renderAll() {
  renderOverview(state.picks, state.results);
  renderGroups(state.picks, state.results);
  paintMatches();
  renderTree(state.picks, state.results);
  renderResultsMeta(state.results);
}

// ─── Results loader: API → localStorage cache (30 min) → static fallback ───

const RESULTS_CACHE_KEY = 'wc-2026-results-cache-v1';
const RESULTS_CACHE_TTL_MS = 30 * 60 * 1000;
const EMPTY_RESULTS = { groupStage: {}, knockout: {} };

async function loadResults(force = false) {
  if (!force) {
    const cached = readResultsCache();
    if (cached && Date.now() - cached.cachedAt < RESULTS_CACHE_TTL_MS) {
      return { ...cached.data, cachedAt: cached.cachedAt, source: 'localStorage' };
    }
  }

  try {
    const res = await fetch(force ? '/api/wc-results?refresh=1' : '/api/wc-results');
    if (!res.ok) throw new Error(`api ${res.status}`);
    const data = await res.json();
    writeResultsCache(data);
    return { ...data, cachedAt: Date.now(), source: res.headers.get('X-Cache') || 'api' };
  } catch (err) {
    console.warn('live results unavailable, falling back to static file:', err);
    try {
      const fallback = await fetchJSON('../data/wc-2026-results.json');
      return { ...fallback, source: 'static' };
    } catch {
      return { ...EMPTY_RESULTS, source: 'none' };
    }
  }
}

function readResultsCache() {
  try {
    const raw = localStorage.getItem(RESULTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeResultsCache(data) {
  try {
    localStorage.setItem(RESULTS_CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch {
    // localStorage may be unavailable (private mode etc.) — non-fatal
  }
}

// ─── Champion line ───

function setChampion(picks) {
  const el = document.getElementById('wc-champion-line');
  if (!el) return;
  el.innerHTML = `Champion pick: <strong>${flag(picks.prediction, 'md')} ${picks.prediction}</strong>.`;
}

function setBracketLink(picks) {
  const a = document.getElementById('wc-bracket-link');
  if (a && picks.bracketUrl) a.href = picks.bracketUrl;
}

// ─── Overview / accuracy strip ───

function renderOverview(picks, results) {
  const el = document.getElementById('wc-overview');
  if (!el) return;

  const tiles = [];
  tiles.push(tile('🏆', 'champion', `${flag(picks.prediction)} ${picks.prediction}`));

  const groupTotal = Object.keys(picks.groupStage).length;
  let groupCorrect = 0;
  let groupGraded = 0;
  for (const [letter, picked] of Object.entries(picks.groupStage)) {
    const actual = results.groupStage?.[letter];
    if (!actual || !actual['1st']) continue;
    groupGraded++;
    if (actual['1st'] === picked['1st']) groupCorrect++;
  }
  tiles.push(tile('🟢', 'group winners', groupGraded ? `${groupCorrect}/${groupGraded} correct` : `0/${groupTotal} graded`));

  for (const r of ROUNDS) {
    const matches = picks.knockout[r.key] || [];
    const round = results.knockout?.[r.key] || {};
    let correct = 0;
    let graded = 0;
    for (const m of matches) {
      const res = round[matchKey(m)];
      if (!res || !res.winner) continue;
      graded++;
      if (res.winner === m.pick) correct++;
    }
    tiles.push(tile(r.short === 'Final' ? '🏁' : '⚽', r.label.toLowerCase(), graded ? `${correct}/${graded} correct` : `0/${matches.length} graded`));
  }

  el.innerHTML = tiles.join('');
}

function renderResultsMeta(results) {
  const el = document.getElementById('wc-results-meta');
  if (!el) return;
  if (!results.cachedAt) {
    el.innerHTML = `<span class="wc-results-source">${labelForSource(results.source)}</span>`;
    return;
  }
  const ageMin = Math.round((Date.now() - results.cachedAt) / 60000);
  const ageText = ageMin <= 0 ? 'just now' : ageMin === 1 ? '1 min ago' : `${ageMin} min ago`;
  el.innerHTML = `
    <span class="wc-results-source">${labelForSource(results.source)} · updated ${ageText}</span>
    <button class="wc-results-refresh" id="wc-results-refresh" type="button">refresh</button>
  `;
}

function labelForSource(source) {
  if (source === 'localStorage') return 'live results (cached)';
  if (source === 'HIT-KV') return 'live results (edge cache)';
  if (source === 'MISS' || source === 'BYPASS' || source === 'api') return 'live results';
  if (source === 'STALE') return 'live results (stale, upstream down)';
  if (source === 'static') return 'static fallback';
  return 'no results yet';
}

function wireRefreshButton() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#wc-results-refresh');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'refreshing…';
    try {
      localStorage.removeItem(RESULTS_CACHE_KEY);
      state.results = await loadResults(true);
      renderAll();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'refresh failed';
    }
  });
}

function tile(icon, label, value) {
  return `<div class="wc-tile">
    <div class="wc-tile-icon">${icon}</div>
    <div class="wc-tile-body">
      <div class="wc-tile-label">${label}</div>
      <div class="wc-tile-value">${value}</div>
    </div>
  </div>`;
}

// ─── Group stage ───

function renderGroups(picks, results) {
  const el = document.getElementById('wc-groups');
  const note = document.getElementById('wc-groups-note');
  if (!el) return;

  const cards = Object.entries(picks.groupStage).map(([letter, group]) => {
    const actual = results.groupStage?.[letter] || {};
    const rows = ['1st', '2nd', '3rd'].filter((p) => group[p]).map((place) => {
      const team = group[place];
      let status = '';
      if (actual[place] === team) status = 'correct';
      else if (actual[place] && actual[place] !== team) status = 'incorrect';
      const mark = status === 'correct' ? '✓' : status === 'incorrect' ? '✗' : '';
      return `<div class="wc-group-row ${status}">
        <span class="wc-group-place">${place}</span>
        <span class="wc-group-team">${flag(team)} ${team}</span>
        <span class="wc-group-mark">${mark}</span>
      </div>`;
    }).join('');

    return `<div class="wc-group-card">
      <div class="wc-group-header">Group ${letter}</div>
      ${rows}
    </div>`;
  }).join('');

  el.innerHTML = cards;

  if (note) {
    note.textContent = 'Showing top-2 (and top-3 advancers) per group. Results fill in here once group stage finalizes.';
  }
}

// ─── Knockout stepper ───

let activeRound = 'roundOf32';

function renderKnockout(picks) {
  const stepper = document.getElementById('wc-stepper');
  if (!stepper) return;

  const today = new Date();
  for (const r of ROUNDS) {
    const matches = picks.knockout[r.key] || [];
    const last = matches[matches.length - 1];
    if (last && new Date(last.date) >= today) {
      activeRound = r.key;
      break;
    }
    if (r.key === 'final') activeRound = 'final';
  }

  stepper.innerHTML = ROUNDS.map((r) => {
    const active = r.key === activeRound ? ' active' : '';
    return `<button class="wc-step${active}" data-round="${r.key}" role="tab" aria-selected="${r.key === activeRound}">${r.label}</button>`;
  }).join('');

  stepper.addEventListener('click', (e) => {
    const btn = e.target.closest('.wc-step');
    if (!btn) return;
    activeRound = btn.dataset.round;
    for (const b of stepper.querySelectorAll('.wc-step')) {
      const on = b.dataset.round === activeRound;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    paintMatches();
  });
}

function paintMatches() {
  const matchEl = document.getElementById('wc-matches');
  if (!matchEl || !state.picks) return;
  const matches = state.picks.knockout[activeRound] || [];
  const round = state.results?.knockout?.[activeRound] || {};
  matchEl.innerHTML = matches.map((m) => matchCard(m, round[matchKey(m)])).join('');
}

function matchCard(m, actual) {
  const homeIsPick = m.pick === m.home;
  const awayIsPick = m.pick === m.away;

  let resultLine = '';
  let stateCls = '';
  if (actual && actual.winner) {
    const score = actual.score ? `${code(m.home)} ${actual.score} ${code(m.away)}` : `winner: ${code(actual.winner)}`;
    const correct = actual.winner === m.pick;
    stateCls = correct ? ' correct' : ' incorrect';
    resultLine = `<div class="wc-match-result">
      <span class="wc-match-mark">${correct ? '✓' : '✗'}</span>
      <span>${score}</span>
    </div>`;
  } else {
    resultLine = `<div class="wc-match-result pending"><span>awaiting result</span></div>`;
  }

  return `<div class="wc-match${stateCls}">
    <div class="wc-match-time">${fmtDate(m.date)}</div>
    <div class="wc-match-team ${homeIsPick ? 'pick' : ''}">
      ${flag(m.home, 'md')}
      <span class="wc-team">${m.home}</span>
      ${homeIsPick ? '<span class="wc-pick-badge">pick</span>' : ''}
    </div>
    <div class="wc-match-vs">vs</div>
    <div class="wc-match-team ${awayIsPick ? 'pick' : ''}">
      ${flag(m.away, 'md')}
      <span class="wc-team">${m.away}</span>
      ${awayIsPick ? '<span class="wc-pick-badge">pick</span>' : ''}
    </div>
    ${resultLine}
  </div>`;
}

// ─── Bracket tree ───

// Order each round so child matches align with their parents.
// Walks final → R32 using picks as the linkage.
function orderRoundsForTree(picks) {
  const ordered = {};
  ordered.final = (picks.knockout.final || []).slice();
  const seq = ['semifinals', 'quarterfinals', 'roundOf16', 'roundOf32'];
  let parents = ordered.final;

  for (const key of seq) {
    const pool = (picks.knockout[key] || []).slice();
    const out = [];
    for (const p of parents) {
      for (const team of [p.home, p.away]) {
        const idx = pool.findIndex((m) => m.pick === team);
        if (idx >= 0) out.push(pool.splice(idx, 1)[0]);
      }
    }
    for (const m of pool) out.push(m);
    ordered[key] = out;
    parents = out;
  }
  return ordered;
}

function renderTree(picks, results) {
  const el = document.getElementById('wc-tree');
  if (!el) return;

  const championPath = computeChampionPath(picks);
  const ordered = orderRoundsForTree(picks);

  const columns = ROUNDS.map((r) => {
    const matches = ordered[r.key] || [];
    const round = results.knockout?.[r.key] || {};

    const slots = matches.map((m) => {
      const actual = round[matchKey(m)];
      const onPath = championPath.has(`${r.key}:${matchKey(m)}`);
      let stateCls = '';
      if (actual && actual.winner) {
        stateCls = actual.winner === m.pick ? ' correct' : ' incorrect';
      }
      return `<div class="wc-tree-slot">
        <div class="wc-tree-match${stateCls}${onPath ? ' champion-path' : ''}">
          <div class="wc-tree-team ${m.pick === m.home ? 'pick' : ''}">
            ${flag(m.home)}<span class="wc-tree-code">${code(m.home)}</span>
          </div>
          <div class="wc-tree-team ${m.pick === m.away ? 'pick' : ''}">
            ${flag(m.away)}<span class="wc-tree-code">${code(m.away)}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    return `<div class="wc-tree-col wc-tree-${r.id}">
      <div class="wc-tree-col-label">${r.short}</div>
      <div class="wc-tree-slots">${slots}</div>
    </div>`;
  }).join('');

  const trophyCol = `<div class="wc-tree-col wc-tree-trophy">
    <div class="wc-tree-col-label">🏆</div>
    <div class="wc-tree-slots">
      <div class="wc-tree-slot">
        <div class="wc-tree-champion">
          ${flag(picks.prediction, 'lg')}
          <span class="wc-tree-champion-name">${picks.prediction}</span>
        </div>
      </div>
    </div>
  </div>`;

  el.innerHTML = columns + trophyCol;
}

function computeChampionPath(picks) {
  const champ = picks.prediction;
  const set = new Set();
  for (const r of ROUNDS) {
    const matches = picks.knockout[r.key] || [];
    for (const m of matches) {
      if (m.home === champ || m.away === champ) {
        set.add(`${r.key}:${matchKey(m)}`);
      }
    }
  }
  return set;
}
