// ─── Knockout: stepper tabs + match cards for the active round ───

import { flag, code, fmtDate, matchKey, parseDate } from './teams.js';
import { ROUND_RESULTS_KEY } from './results.js';

export function createKnockoutSection(ctx) {
  const { ROUNDS, getState } = ctx;
  const stepper = document.getElementById('wc-stepper');
  const matchEl = document.getElementById('wc-matches');
  if (!stepper || !matchEl) return null;

  let activeRound = defaultRound(ROUNDS, getState);

  function buildStepper() {
    stepper.innerHTML = ROUNDS.map((r) => {
      const selected = r.id === activeRound;
      return (
        `<button class="wc-step${selected ? ' active' : ''}" ` +
        `data-round="${r.id}" id="wc-step-${r.id}" ` +
        `role="tab" aria-selected="${selected}" ` +
        `aria-controls="wc-matches" tabindex="${selected ? 0 : -1}">` +
        `${r.label}</button>`
      );
    }).join('');
    syncPanelLabel();
  }

  function syncPanelLabel() {
    matchEl.setAttribute('aria-labelledby', `wc-step-${activeRound}`);
  }

  function selectRound(roundId) {
    if (roundId === activeRound) return;
    activeRound = roundId;
    for (const btn of stepper.querySelectorAll('.wc-step')) {
      const on = btn.dataset.round === activeRound;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    }
    syncPanelLabel();
    paint();
  }

  function paint() {
    const state = getState();
    if (!state.picks) return;
    const matches = state.picksByRound[activeRound] || [];
    const round = state.results?.knockout?.[ROUND_RESULTS_KEY[activeRound]] || {};
    matchEl.innerHTML = matches.map((m) => matchCard(m, round[matchKey(m)])).join('');
  }

  stepper.addEventListener('click', (e) => {
    const btn = e.target.closest('.wc-step');
    if (btn) selectRound(btn.dataset.round);
  });

  // Left/Right arrows move between tabs per the WAI-ARIA tabs pattern.
  stepper.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const idx = ROUNDS.findIndex((r) => r.id === activeRound);
    const next = e.key === 'ArrowRight'
      ? ROUNDS[(idx + 1) % ROUNDS.length]
      : ROUNDS[(idx - 1 + ROUNDS.length) % ROUNDS.length];
    selectRound(next.id);
    stepper.querySelector(`#wc-step-${next.id}`)?.focus();
    e.preventDefault();
  });

  buildStepper();

  return { paint };
}

function defaultRound(ROUNDS, getState) {
  const today = new Date();
  const { picksByRound } = getState();
  for (const r of ROUNDS) {
    const matches = picksByRound[r.id] || [];
    const last = matches[matches.length - 1];
    if (last && parseDate(last.date) >= today) return r.id;
  }
  return 'final';
}

function matchCard(m, actual) {
  const homeIsPick = m.pick === m.home;
  const awayIsPick = m.pick === m.away;
  const { resultLine, stateCls } = renderResult(m, actual);

  return `<article class="wc-match${stateCls}">
    <div class="wc-match-time">${fmtDate(m.date)}</div>
    <div class="wc-match-team ${homeIsPick ? 'pick' : ''}">
      ${flag(m.home, 'md')}
      <span class="wc-team">${m.home}</span>
      ${homeIsPick ? '<span class="wc-pick-badge">pick</span>' : ''}
    </div>
    <div class="wc-match-vs" aria-hidden="true">vs</div>
    <div class="wc-match-team ${awayIsPick ? 'pick' : ''}">
      ${flag(m.away, 'md')}
      <span class="wc-team">${m.away}</span>
      ${awayIsPick ? '<span class="wc-pick-badge">pick</span>' : ''}
    </div>
    ${resultLine}
  </article>`;
}

function renderResult(m, actual) {
  if (!actual || !actual.winner) {
    return {
      stateCls: '',
      resultLine: `<div class="wc-match-result pending"><span>awaiting result</span></div>`,
    };
  }
  const correct = actual.winner === m.pick;
  const score = actual.score
    ? `${code(m.home)} ${actual.score} ${code(m.away)}`
    : `winner: ${code(actual.winner)}`;
  return {
    stateCls: correct ? ' correct' : ' incorrect',
    resultLine:
      `<div class="wc-match-result">` +
      `<span class="wc-match-mark" aria-hidden="true">${correct ? '✓' : '✗'}</span>` +
      `<span class="wc-sr-only">${correct ? 'Correct pick. ' : 'Wrong pick. '}</span>` +
      `<span>${score}</span>` +
      `</div>`,
  };
}
