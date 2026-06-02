// ─── Next-match countdown banner ───
// Walks France's path chronologically and renders one of:
//   - "Tournament kicks off in 27d 4h"     (pre-tournament)
//   - "Next: France vs Scotland · in 3d 12h" (upcoming)
//   - "LIVE · France 1-0 Scotland · 67'"     (in progress, if API gives a live match)
//   - "France's run is over"                 (champion eliminated)
//   - "Tournament over — France lifted it 🏆" (won) or … (lost final)
//
// Ticks every second so the countdown actually counts.

import { flag, matchKey, parseDate } from './teams.js';
import { ROUND_RESULTS_KEY } from './results.js';

const TOURNAMENT_START = '2026-06-11';
const TOURNAMENT_END   = '2026-07-19';

let timer = null;

export function initCountdown(ctx) {
  const el = document.getElementById('wc-countdown');
  if (!el) return;
  paint(el, ctx);
  if (timer) clearInterval(timer);
  timer = setInterval(() => paint(el, ctx), 1000);
}

function paint(el, ctx) {
  const view = computeView(ctx);
  el.className = `wc-countdown wc-countdown-${view.tone}`;
  el.innerHTML = view.html;
  el.hidden = false;
}

function computeView(ctx) {
  const { getState } = ctx;
  const state = getState();
  const picks = state.picks;
  if (!picks) return { tone: 'idle', html: '' };

  const champ = picks.champion;
  const now = new Date();

  // Pre-tournament
  const tStart = parseDate(TOURNAMENT_START);
  if (now < tStart) {
    return {
      tone: 'pre',
      html: `<span class="wc-countdown-label">Tournament kicks off</span>
             <span class="wc-countdown-value">in ${diff(now, tStart)}</span>`,
    };
  }

  // Walk France's matches chronologically
  const championMatches = collectChampionMatches(picks, champ);
  const results = state.results || {};
  let lastWonMatchDate = null;
  for (const { match, round } of championMatches) {
    const actual = results.knockout?.[ROUND_RESULTS_KEY[round.id]]?.[matchKey(match)];
    if (actual?.winner && actual.winner !== champ) {
      // Champion lost here
      return {
        tone: 'dead',
        html: `<span class="wc-countdown-label">${champ}'s run ended</span>
               <span class="wc-countdown-value">${round.label.toLowerCase()} · ${labelFor(match, champ)}</span>`,
      };
    }
    if (actual?.winner === champ) {
      lastWonMatchDate = parseDate(match.date);
      continue;
    }
    // First unfinished match — this is "next"
    const matchDate = parseDate(match.date);
    const liveWindow = matchInProgress(actual, matchDate, now);
    if (liveWindow) {
      return {
        tone: 'live',
        html: `<span class="wc-countdown-pulse" aria-hidden="true"></span>
               <span class="wc-countdown-label">LIVE</span>
               <span class="wc-countdown-value">${formatMatchup(match)} · ${round.short}</span>`,
      };
    }
    return {
      tone: 'upcoming',
      html: `<span class="wc-countdown-label">Next</span>
             <span class="wc-countdown-value">${formatMatchup(match)} · ${round.short} · in ${diff(now, matchDate)}</span>`,
    };
  }

  // Champion won every match they were in: the final happened.
  const finalMatch = championMatches[championMatches.length - 1];
  if (finalMatch && results.knockout?.final?.[matchKey(finalMatch.match)]?.winner === champ) {
    return {
      tone: 'won',
      html: `<span class="wc-countdown-label">Tournament over</span>
             <span class="wc-countdown-value">${champ} lifted it 🏆</span>`,
    };
  }

  // Fallback: tournament window passed without a clear outcome
  const tEnd = parseDate(TOURNAMENT_END);
  if (now > tEnd) {
    return {
      tone: 'idle',
      html: `<span class="wc-countdown-label">Tournament over</span>`,
    };
  }
  return { tone: 'idle', html: '' };
}

function collectChampionMatches(picks, champ) {
  const out = [];
  for (const round of picks.rounds || []) {
    for (const match of round.matches || []) {
      if (match.home === champ || match.away === champ) {
        out.push({ match, round });
      }
    }
  }
  return out;
}

function formatMatchup(match) {
  return `${flag(match.home)} ${match.home} vs ${flag(match.away)} ${match.away}`;
}

function labelFor(match, champ) {
  const opponent = match.home === champ ? match.away : match.home;
  return `vs ${flag(opponent)} ${opponent}`;
}

function matchInProgress(actual, matchDate, now) {
  // We don't get a "live" flag from football-data on the free tier; approximate:
  // a match is in progress if the scheduled date is today and there's no winner yet.
  if (actual?.winner) return false;
  const sameDay = matchDate.toDateString() === now.toDateString();
  return sameDay;
}

function diff(from, to) {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 'now';
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const days = Math.floor(ms / day);
  const hours = Math.floor((ms % day) / hour);
  const minutes = Math.floor((ms % hour) / minute);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
