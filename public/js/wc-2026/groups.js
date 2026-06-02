// ─── Group stage section ───
// Picks shape: { A: { '1st': team, '2nd': team, '3rd': team }, B: ..., ... }
// Worker results shape is identical, so comparison is a direct key lookup.

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

  const cards = Object.entries(groups).map(([letter, group]) =>
    renderGroupCard(letter, group, results?.groupStage?.[letter] || {})
  ).join('');
  el.innerHTML = cards;

  if (note) {
    note.textContent = 'Top-2 (and top-3 advancers) per group. Picks fill in with ✓/✗ once group play finishes.';
  }
}

function renderGroupCard(letter, picked, actual) {
  const rows = PLACES
    .filter((place) => picked[place])
    .map((place) => renderGroupRow(place, picked[place], actual[place]))
    .join('');
  return (
    `<div class="wc-group-card" aria-label="Group ${letter}">` +
      `<div class="wc-group-header">Group ${letter}</div>` +
      rows +
    `</div>`
  );
}

function renderGroupRow(place, pickedTeam, actualTeam) {
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
      srSuffix = '<span class="wc-sr-only"> (wrong; actual was ' + actualTeam + ')</span>';
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
