// ─── Calendar export (.ics) ───
//
// Generates an iCalendar file with every knockout match. Team names update
// based on current results: pre-tournament they're shown as placeholders like
// "Group A 1st", once group play finishes they become actual teams, once R32
// plays the R16 matches resolve, and so on.

import { ROUND_RESULTS_KEY } from './results.js';

const SITE_URL = 'https://mubbie.dev/wc-2026/';

export function downloadCalendar(ctx) {
  const state = ctx.getState();
  if (!state.picks) return;

  const ics = buildIcs(state.picks, state.results || {});
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'wc-2026-bracket.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildIcs(picks, results) {
  const groupPos = teamToGroupPosition(picks);
  const events = [];
  for (const round of picks.rounds || []) {
    for (const match of round.matches || []) {
      events.push(makeEvent(match, round, picks, results, groupPos));
    }
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//mubbie.dev//WC 2026 bracket//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:WC 2026 Bracket',
    'X-WR-CALDESC:FIFA World Cup 2026 knockout matches',
    ...events,
    'END:VCALENDAR',
  ];
  // ICS spec: lines terminated by CRLF
  return lines.join('\r\n') + '\r\n';
}

function makeEvent(match, round, picks, results, groupPos) {
  const home = resolveTeam(match, 'home', round, picks, results, groupPos);
  const away = resolveTeam(match, 'away', round, picks, results, groupPos);
  const summary = `WC 2026 ${round.roundId.toUpperCase()} · ${home} vs ${away}`;
  const description = [
    `Round: ${round.round}`,
    `My pick: ${match.pick}`,
    `Track live: ${SITE_URL}`,
  ].join('\\n');

  const day = match.date.replace(/-/g, '');
  const next = nextDayStr(match.date);
  return [
    'BEGIN:VEVENT',
    `UID:wc-2026-${match.id}@mubbie.dev`,
    `DTSTAMP:${nowStamp()}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${SITE_URL}`,
    'END:VEVENT',
  ].join('\r\n');
}

// ─── Resolution: what team should appear in this slot right now? ───

function resolveTeam(match, side, round, picks, results, groupPos) {
  if (round.roundId === 'r32') {
    // R32 participants are determined by group-stage standings.
    const predicted = match[side];
    const pos = groupPos.get(predicted);
    if (pos) {
      const actual = results.groupStage?.[pos.letter]?.[pos.place];
      if (actual) return actual;
      return `Group ${pos.letter} ${pos.place}`;
    }
    return predicted;
  }

  // R16+: each team comes from a predecessor knockout match.
  const predecessor = findPredecessor(match, side, round, picks);
  if (!predecessor) return match[side];
  const prevRound = previousRoundId(round.roundId);
  const prevResults = results.knockout?.[ROUND_RESULTS_KEY[prevRound]] || {};
  const prevResult = prevResults[`${predecessor.home}-${predecessor.away}`];
  if (prevResult?.winner) return prevResult.winner;
  return `Winner of ${predecessor.id}`;
}

function findPredecessor(match, side, round, picks) {
  const prevRoundId = previousRoundId(round.roundId);
  if (!prevRoundId) return null;
  const prevRound = picks.rounds.find((r) => r.roundId === prevRoundId);
  if (!prevRound) return null;
  const children = prevRound.matches.filter((c) => c.nextMatchId === match.id);
  // Document order: first child feeds the home side, second feeds the away.
  return side === 'home' ? children[0] : children[1];
}

function previousRoundId(roundId) {
  return { r16: 'r32', qf: 'r16', sf: 'qf', final: 'sf' }[roundId] || null;
}

function teamToGroupPosition(picks) {
  const map = new Map(); // team → { letter, place }
  const groups = picks.groupStage || {};
  for (const [letter, places] of Object.entries(groups)) {
    for (const [place, team] of Object.entries(places)) {
      map.set(team, { letter, place });
    }
  }
  return map;
}

// ─── ICS helpers ───

function escapeIcs(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function nowStamp() {
  // YYYYMMDDTHHMMSSZ
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z'
  );
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function nextDayStr(dateStr) {
  // Add one day to a YYYY-MM-DD string and return YYYYMMDD.
  const d = new Date(dateStr + 'T12:00:00');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}
