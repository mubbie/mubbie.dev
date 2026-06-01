// ─── Worker: serves assets + /api/wc-results ───
//
// Routes:
//   /api/wc-results  → cached football-data.org WC matches, mapped to internal shape
//   *                → static assets via env.ASSETS
//
// Caching layers (defense in depth + free-tier friendly):
//   - KV (1 hr TTL): shared across all visitors
//   - Client localStorage (30 min): set on the client side
//   - Static wc-2026-results.json: final fallback if both API + KV fail

const CACHE_KEY = 'wc-results-v1';
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const STALE_GRACE_SECONDS = 24 * 60 * 60; // 24 hours: serve stale if upstream is down

const FD_BASE = 'https://api.football-data.org/v4';
const SEASON = 2026;

const STAGE_MAP = {
  LAST_32: 'roundOf32',
  LAST_16: 'roundOf16',
  QUARTER_FINALS: 'quarterfinals',
  SEMI_FINALS: 'semifinals',
  FINAL: 'final',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/wc-results') {
      return handleResults(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleResults(request, env, ctx) {
  const force = new URL(request.url).searchParams.get('refresh') === '1';

  // 1. KV cache lookup (with metadata to know when it was written)
  let cached = null;
  if (!force && env.WC_CACHE) {
    try {
      const { value, metadata } = await env.WC_CACHE.getWithMetadata(CACHE_KEY, 'json');
      if (value && metadata && Date.now() - metadata.fetchedAt < CACHE_TTL_SECONDS * 1000) {
        return jsonResponse(value, { 'X-Cache': 'HIT-KV' });
      }
      if (value) {
        cached = { value, metadata };
      }
    } catch (e) {
      // KV read failure → fall through to upstream
    }
  }

  // 2. Upstream call to football-data.org
  try {
    const data = await fetchFromFootballData(env.FD_TOKEN);
    if (env.WC_CACHE) {
      ctx.waitUntil(
        env.WC_CACHE.put(CACHE_KEY, JSON.stringify(data), {
          expirationTtl: CACHE_TTL_SECONDS + STALE_GRACE_SECONDS,
          metadata: { fetchedAt: Date.now() },
        }),
      );
    }
    return jsonResponse(data, { 'X-Cache': force ? 'BYPASS' : 'MISS' });
  } catch (err) {
    // 3. Stale-while-error: serve last good KV value if we have one
    if (cached && cached.value) {
      return jsonResponse(cached.value, {
        'X-Cache': 'STALE',
        'X-Upstream-Error': err.message.slice(0, 120),
      });
    }
    // 4. Hard failure: tell the client to fall back to the static file
    return jsonResponse(
      { error: 'upstream-unavailable', message: err.message.slice(0, 200) },
      { 'X-Cache': 'MISS' },
      502,
    );
  }
}

async function fetchFromFootballData(token) {
  if (!token) throw new Error('FD_TOKEN not configured');

  const res = await fetch(`${FD_BASE}/competitions/WC/matches?season=${SEASON}`, {
    headers: {
      'X-Auth-Token': token,
      'User-Agent': 'mubbie.dev wc-2026 bracket',
    },
  });
  if (!res.ok) {
    throw new Error(`football-data ${res.status} ${res.statusText}`);
  }
  const body = await res.json();
  const matches = body.matches || [];
  return shapeResults(matches);
}

function shapeResults(matches) {
  return {
    fetchedAt: new Date().toISOString(),
    season: SEASON,
    groupStage: computeGroupStandings(matches),
    knockout: collectKnockoutResults(matches),
  };
}

// Compute group standings (1st/2nd/3rd) from finished group matches.
// FIFA tiebreakers: points → goal difference → goals scored → (we stop here).
function computeGroupStandings(matches) {
  const groups = {}; // letter → team → { team, pts, gf, ga, w, d, l, played }

  for (const m of matches) {
    if (m.stage !== 'GROUP_STAGE') continue;
    if (m.status !== 'FINISHED') continue;
    const letter = m.group?.replace('GROUP_', '');
    if (!letter) continue;

    const home = m.homeTeam?.name;
    const away = m.awayTeam?.name;
    if (!home || !away) continue;

    const hs = m.score?.fullTime?.home ?? 0;
    const as = m.score?.fullTime?.away ?? 0;

    if (!groups[letter]) groups[letter] = {};
    const t = groups[letter];
    if (!t[home]) t[home] = blankTally(home);
    if (!t[away]) t[away] = blankTally(away);

    t[home].gf += hs; t[home].ga += as; t[home].played += 1;
    t[away].gf += as; t[away].ga += hs; t[away].played += 1;

    if (hs > as) {
      t[home].pts += 3; t[home].w += 1; t[away].l += 1;
    } else if (hs < as) {
      t[away].pts += 3; t[away].w += 1; t[home].l += 1;
    } else {
      t[home].pts += 1; t[home].d += 1;
      t[away].pts += 1; t[away].d += 1;
    }
  }

  const out = {};
  for (const [letter, tally] of Object.entries(groups)) {
    const sorted = Object.values(tally).sort(tiebreak);
    out[letter] = {
      '1st': sorted[0]?.team || null,
      '2nd': sorted[1]?.team || null,
      '3rd': sorted[2]?.team || null,
    };
  }
  return out;
}

function blankTally(team) {
  return { team, pts: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0, played: 0 };
}

function tiebreak(a, b) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  const gdA = a.gf - a.ga;
  const gdB = b.gf - b.ga;
  if (gdB !== gdA) return gdB - gdA;
  return b.gf - a.gf;
}

function collectKnockoutResults(matches) {
  const out = {
    roundOf32: {},
    roundOf16: {},
    quarterfinals: {},
    semifinals: {},
    final: {},
  };

  for (const m of matches) {
    const roundKey = STAGE_MAP[m.stage];
    if (!roundKey) continue;
    if (m.status !== 'FINISHED') continue;

    const home = m.homeTeam?.name;
    const away = m.awayTeam?.name;
    if (!home || !away) continue;

    const winner = computeWinner(m);
    if (!winner) continue;

    const hs = m.score?.fullTime?.home;
    const as = m.score?.fullTime?.away;
    out[roundKey][`${home}-${away}`] = {
      winner,
      score: (hs != null && as != null) ? `${hs}-${as}` : null,
      finishedAt: m.lastUpdated,
    };
  }

  return out;
}

function computeWinner(m) {
  const w = m.score?.winner;
  if (w === 'HOME_TEAM') return m.homeTeam?.name || null;
  if (w === 'AWAY_TEAM') return m.awayTeam?.name || null;
  // DRAW after extra time/penalties: football-data sets winner to the side that
  // advances even when fullTime is level. If winner is null we have no result.
  return null;
}

function jsonResponse(data, extraHeaders = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
      ...extraHeaders,
    },
  });
}
