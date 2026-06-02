// ─── WC 2026 bracket page ───
// Entry point. Bootstraps theme/footer/scroll, loads picks + results,
// and orchestrates the section renderers.

import { initTheme } from '../theme.js';
import { initFooter } from '../footer.js';
import { initScrollReveal } from '../ui.js';
import { fetchJSON } from '../dom.js';

import { flag } from './teams.js';
import {
  loadResults,
  clearResultsCache,
  labelForSource,
  ROUND_RESULTS_KEY,
  EMPTY_RESULTS,
} from './results.js';
import { createKnockoutSection } from './knockout.js';
import { renderBracketTree } from './bracket.js';
import { renderGroups, scoreGroupWinners } from './groups.js';
import { initShortcuts } from './shortcuts.js';
import { kickConfetti } from './confetti.js';

const ROUNDS = [
  { id: 'r32',   label: 'Round of 32',   short: 'R32'   },
  { id: 'r16',   label: 'Round of 16',   short: 'R16'   },
  { id: 'qf',    label: 'Quarterfinals', short: 'QF'    },
  { id: 'sf',    label: 'Semifinals',    short: 'SF'    },
  { id: 'final', label: 'Final',         short: 'Final' },
];

const state = {
  picks: null,
  picksByRound: {},
  picksById: {},
  results: null,
};
const ctx = { ROUNDS, getState: () => state };

let knockoutSection = null;

// ─── Bootstrap ───

initTheme();
initFooter();
initScrollReveal();
initRotatingEmoji();

(async function init() {
  try {
    const [picks, results] = await Promise.all([
      fetchJSON('../data/wc-2026.json'),
      loadResults(),
    ]);
    indexPicks(picks);
    state.results = results;

    setChampionLine(picks);
    knockoutSection = createKnockoutSection(ctx);
    renderAll();

    wireRefreshButton();
    wireConfetti();
    initShortcuts({
      onRefresh: () => refreshResults(),
    });

    // Welcome burst, but only if motion isn't reduced.
    if (!prefersReducedMotion()) {
      const emojiEl = document.getElementById('wc-emoji');
      if (emojiEl) setTimeout(() => kickConfetti(emojiEl, 14), 400);
    }
  } catch (err) {
    console.error('wc-2026 init failed:', err);
    const ov = document.getElementById('wc-overview');
    if (ov) ov.textContent = 'could not load bracket data.';
  }
})();

function indexPicks(picks) {
  state.picks = picks;
  state.picksByRound = {};
  state.picksById = {};
  for (const r of picks.rounds || []) {
    state.picksByRound[r.roundId] = r.matches || [];
    for (const m of r.matches || []) state.picksById[m.id] = m;
  }
}

function renderAll() {
  renderOverview();
  renderGroups(ctx);
  knockoutSection?.paint();
  renderBracketTree(ctx);
  renderResultsMeta();
}

// ─── Champion line ───

function setChampionLine(picks) {
  const el = document.getElementById('wc-champion-line');
  if (!el) return;
  el.innerHTML = `Champion pick: <strong>${flag(picks.champion, 'md')} ${picks.champion}</strong>`;
}

// ─── Overview tiles ───

function renderOverview() {
  const el = document.getElementById('wc-overview');
  if (!el || !state.picks) return;
  const results = state.results || EMPTY_RESULTS;

  const tiles = [
    tile('🏆', 'champion', `${flag(state.picks.champion, 'md')} ${state.picks.champion}`),
  ];

  // Group winners accuracy
  if (state.picks.groupStage) {
    const { correct, graded, total } = scoreGroupWinners(state.picks, results);
    const value = graded ? `${correct}/${graded} correct` : `0/${total} graded`;
    tiles.push(tile(null, 'group winners', value));
  }

  for (const r of ROUNDS) {
    const matches = state.picksByRound[r.id] || [];
    const roundResults = results.knockout?.[ROUND_RESULTS_KEY[r.id]] || {};
    const { correct, graded } = scoreRound(matches, roundResults);
    const value = graded
      ? `${correct}/${graded} correct`
      : `0/${matches.length} graded`;
    tiles.push(tile(null, r.label.toLowerCase(), value));
  }

  el.innerHTML = tiles.join('');
}

function scoreRound(matches, roundResults) {
  let correct = 0;
  let graded = 0;
  for (const m of matches) {
    const res = roundResults[`${m.home}-${m.away}`];
    if (!res || !res.winner) continue;
    graded++;
    if (res.winner === m.pick) correct++;
  }
  return { correct, graded };
}

function tile(icon, label, value) {
  const iconHtml = icon ? `<div class="wc-tile-icon" aria-hidden="true">${icon}</div>` : '';
  return (
    `<div class="wc-tile${icon ? '' : ' wc-tile-plain'}">` +
      `${iconHtml}` +
      `<div class="wc-tile-body">` +
        `<div class="wc-tile-label">${label}</div>` +
        `<div class="wc-tile-value">${value}</div>` +
      `</div>` +
    `</div>`
  );
}

// ─── Results meta line ───

function renderResultsMeta() {
  const el = document.getElementById('wc-results-meta');
  if (!el) return;
  const r = state.results;
  if (!r || !r.cachedAt) {
    el.innerHTML = `<span class="wc-results-source">${labelForSource(r?.source)}</span>`;
    return;
  }
  const ageMin = Math.round((Date.now() - r.cachedAt) / 60000);
  const ageText = ageMin <= 0 ? 'just now' : ageMin === 1 ? '1 min ago' : `${ageMin} min ago`;
  el.innerHTML = (
    `<span class="wc-results-source">${labelForSource(r.source)} · updated ${ageText}</span>` +
    `<button class="wc-results-refresh" id="wc-results-refresh" type="button">refresh</button>`
  );
}

// ─── Wire-ups: refresh button + confetti triggers ───
// Both use event delegation so they survive innerHTML re-renders without
// stacking listeners.

async function refreshResults(button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'refreshing…';
    button.setAttribute('aria-busy', 'true');
  }
  try {
    clearResultsCache();
    state.results = await loadResults(true);
    renderAll();
  } catch (err) {
    console.error(err);
    if (button) {
      button.disabled = false;
      button.textContent = 'refresh failed';
      button.removeAttribute('aria-busy');
    }
  }
}

function wireRefreshButton() {
  document.addEventListener('click', (e) => {
    const refreshBtn = e.target.closest('#wc-results-refresh');
    if (refreshBtn) refreshResults(refreshBtn);
  });
}

function wireConfetti() {
  document.addEventListener('click', (e) => {
    if (prefersReducedMotion()) return;
    const emojiBtn = e.target.closest('#wc-emoji');
    if (emojiBtn) { kickConfetti(emojiBtn, 20); return; }
    const champ = e.target.closest('.wc-tree-champion');
    if (champ) { kickConfetti(champ, 36); }
  });
}

// ─── Rotating emoji ───

function initRotatingEmoji() {
  const el = document.getElementById('wc-emoji');
  if (!el) return;
  const emojis = ['⚽', '🏆', '🥅', '🎯', '🏟️', '🟢', '⚽'];
  let i = 0;
  if (prefersReducedMotion()) return; // honor user preference; keep static ⚽
  setInterval(() => {
    i = (i + 1) % emojis.length;
    el.textContent = emojis[i];
  }, 1400);
}

function prefersReducedMotion() {
  return typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;
}
