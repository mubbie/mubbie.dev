// ─── Bracket tree: R32 → Final → 🏆 ───
//
// Ordering uses nextMatchId so each child slots directly under its parent's
// position. Champion path status is a tiny state machine walked round by
// round: 'alive' until results show the champion lost, then 'dimmed' for
// everything downstream so the visual energy honestly stops at the upset.

import { flag, code, matchKey } from './teams.js';
import { ROUND_RESULTS_KEY, EMPTY_RESULTS } from './results.js';

export function renderBracketTree(ctx) {
  const { ROUNDS, getState } = ctx;
  const el = document.getElementById('wc-tree');
  if (!el) return;

  const state = getState();
  const picks = state.picks;
  if (!picks) return;
  const results = state.results || EMPTY_RESULTS;

  const pathStatus = computeChampionPathStatus(ROUNDS, state, results);
  const ordered = orderRoundsForTree(picks);

  const columns = ROUNDS.map((r) => renderRoundColumn(r, ordered[r.id] || [], results, pathStatus)).join('');
  const trophy = renderTrophyColumn(picks, pathStatus);

  el.innerHTML = columns + trophy;
}

function renderRoundColumn(round, matches, results, pathStatus) {
  const resultMap = results.knockout?.[ROUND_RESULTS_KEY[round.id]] || {};
  const slots = matches.map((m) => renderSlot(m, resultMap[matchKey(m)], pathStatus.matchStatus.get(m.id))).join('');
  return (
    `<div class="wc-tree-col wc-tree-${round.id}" role="group" aria-label="${round.label}">` +
      `<div class="wc-tree-col-label" aria-hidden="true">${round.short}</div>` +
      `<div class="wc-tree-slots">${slots}</div>` +
    `</div>`
  );
}

function renderSlot(m, actual, pathStatus) {
  const onPath = pathStatus !== undefined;
  const stateCls = correctnessClass(m, actual);
  const pathCls = onPath
    ? ` champion-path${pathStatus === 'dimmed' ? ' path-dimmed' : ''}`
    : '';
  return (
    `<div class="wc-tree-slot${pathCls}">` +
      `<div class="wc-tree-match${stateCls}${pathCls}">` +
        renderTreeTeam(m, m.home) +
        renderTreeTeam(m, m.away) +
      `</div>` +
    `</div>`
  );
}

function renderTreeTeam(m, team) {
  const cls = m.pick === team ? 'wc-tree-team pick' : 'wc-tree-team';
  return `<div class="${cls}">${flag(team)}<span class="wc-tree-code">${code(team)}</span></div>`;
}

function correctnessClass(m, actual) {
  if (!actual || !actual.winner) return '';
  return actual.winner === m.pick ? ' correct' : ' incorrect';
}

function renderTrophyColumn(picks, pathStatus) {
  const alive = pathStatus.championAlive;
  const slotCls = alive ? ' champion-path' : ' champion-path path-dimmed';
  const trophyCls = alive ? '' : ' wc-tree-champion-dead';
  return (
    `<div class="wc-tree-col wc-tree-trophy" role="group" aria-label="Champion">` +
      `<div class="wc-tree-col-label" aria-hidden="true">🏆</div>` +
      `<div class="wc-tree-slots">` +
        `<div class="wc-tree-slot${slotCls}">` +
          `<div class="wc-tree-champion${trophyCls}">` +
            flag(picks.champion, 'lg') +
            `<span class="wc-tree-champion-name">${picks.champion}</span>` +
          `</div>` +
        `</div>` +
      `</div>` +
    `</div>`
  );
}

// ─── Ordering: pair children with parents via nextMatchId ───

function orderRoundsForTree(picks) {
  const byRoundId = {};
  for (const r of picks.rounds || []) byRoundId[r.roundId] = (r.matches || []).slice();

  const ordered = { final: (byRoundId.final || []).slice() };
  const seq = ['final', 'sf', 'qf', 'r16', 'r32'];

  for (let i = 1; i < seq.length; i++) {
    const currentId = seq[i];
    const parentId = seq[i - 1];
    const parents = ordered[parentId] || [];
    const pool = (byRoundId[currentId] || []).slice();
    const out = [];

    for (const parent of parents) {
      // .filter preserves the original child order, so home-side comes
      // before away-side in the resulting list.
      const children = pool.filter((c) => c.nextMatchId === parent.id);
      for (const child of children) {
        out.push(child);
        pool.splice(pool.indexOf(child), 1);
      }
    }
    // Append any orphans so they're still visible if the JSON is malformed.
    for (const m of pool) out.push(m);
    ordered[currentId] = out;
  }
  return ordered;
}

// ─── Champion path status ───

export function computeChampionPathStatus(ROUNDS, state, results) {
  const champ = state.picks?.champion;
  const matchStatus = new Map();
  let died = false;

  if (!champ) return { matchStatus, championAlive: false };

  for (const r of ROUNDS) {
    const matches = state.picksByRound[r.id] || [];
    const round = results.knockout?.[ROUND_RESULTS_KEY[r.id]] || {};
    for (const m of matches) {
      if (m.home !== champ && m.away !== champ) continue;
      matchStatus.set(m.id, died ? 'dimmed' : 'alive');
      if (!died) {
        const actual = round[matchKey(m)];
        if (actual?.winner && actual.winner !== champ) died = true;
      }
    }
  }
  return { matchStatus, championAlive: !died };
}
