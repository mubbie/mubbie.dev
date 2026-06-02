// ─── Group stage section ───
// Picks shape: { A: { '1st': team, '2nd': team, '3rd': team }, B: ..., ... }
// Worker results shape is identical.
//
// Each card renders two stacked sections, parallel to how knockout cards
// stack the match info above the "result line":
//   - "my picks": predicted 1st / 2nd / 3rd, marked ✓/✗ once graded
//   - "actual":   real 1st / 2nd / 3rd from the live API, or a pending stub

import { flag } from './teams.js';

const PLACES = ['1st', '2nd', '3rd'];

export function renderGroups(ctx) {
  const { getState } = ctx;
  const el = document.getElementById('wc-groups');
  const note = document.getElementById('wc-groups-note');
  if (!el) return;

  const { picks, results } = getState();
  const groups = picks?.groupStage;
  if (!groups) {
    el.innerHTML = '';
    if (note) note.textContent = '';
    return;
  }

  el.innerHTML = Object.entries(groups).map(([letter, group]) =>
    renderGroupCard(letter, group, results?.groupStage?.[letter] || {})
  ).join('');

  if (note) {
    note.textContent = 'Top-2 (and top-3 advancers) per group. Picks fill in with ✓/✗ once group play finishes.';
  }
}

function renderGroupCard(letter, picked, actual) {
  return (
    `<article class="wc-group-card" aria-label="Group ${letter}">` +
      `<div class="wc-group-header">Group ${letter}</div>` +
      renderSection('my picks', PLACES.filter((p) => picked[p]).map((place) =>
        renderPickRow(place, picked[place], actual[place])
      )) +
      renderSection('actual', renderActualRows(picked, actual)) +
    `</article>`
  );
}

function renderSection(label, rowsHtml) {
  return (
    `<div class="wc-group-section">` +
      `<div class="wc-group-subheader">${label}</div>` +
      rowsHtml.join('') +
    `</div>`
  );
}

function renderPickRow(place, pickedTeam, actualTeam) {
  let status = '';
  let mark = '';
  let srSuffix = '';
  if (actualTeam) {
    if (actualTeam === pickedTeam) {
      status = 'correct';
      mark = '✓';
      srSuffix = '<span class="wc-sr-only"> (correct)</span>';
    } else {
      status = 'incorrect';
      mark = '✗';
      srSuffix = `<span class="wc-sr-only"> (wrong; actual was ${actualTeam})</span>`;
    }
  }
  return (
    `<div class="wc-group-row ${status}">` +
      `<span class="wc-group-place">${place}</span>` +
      `<span class="wc-group-team">${flag(pickedTeam)} ${pickedTeam}${srSuffix}</span>` +
      `<span class="wc-group-mark" aria-hidden="true">${mark}</span>` +
    `</div>`
  );
}

function renderActualRows(picked, actual) {
  // Show one row per place the user picked, so the columns line up between
  // the two sections. If a place has no actual yet, render a "pending" stub.
  const places = PLACES.filter((p) => picked[p]);
  if (!places.some((p) => actual[p])) {
    return [`<div class="wc-group-pending">awaiting group play</div>`];
  }
  return places.map((place) => renderActualRow(place, actual[place]));
}

function renderActualRow(place, team) {
  if (!team) {
    return (
      `<div class="wc-group-row wc-group-row-actual pending">` +
        `<span class="wc-group-place">${place}</span>` +
        `<span class="wc-group-team wc-group-team-pending">awaiting</span>` +
        `<span class="wc-group-mark"></span>` +
      `</div>`
    );
  }
  return (
    `<div class="wc-group-row wc-group-row-actual">` +
      `<span class="wc-group-place">${place}</span>` +
      `<span class="wc-group-team">${flag(team)} ${team}</span>` +
      `<span class="wc-group-mark"></span>` +
    `</div>`
  );
}

// Used by the overview "group winners" accuracy tile.
export function scoreGroupWinners(picks, results) {
  const picked = picks?.groupStage || {};
  const actual = results?.groupStage || {};
  let correct = 0;
  let graded = 0;
  const total = Object.keys(picked).length;
  for (const [letter, group] of Object.entries(picked)) {
    const a = actual[letter];
    if (!a || !a['1st']) continue;
    graded++;
    if (a['1st'] === group['1st']) correct++;
  }
  return { correct, graded, total };
}
