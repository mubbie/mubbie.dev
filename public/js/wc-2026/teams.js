// ─── Team data + display helpers ───
// Pure module: ISO codes for flagcdn, FIFA 3-letter codes, flag image factory,
// and date/match-key utilities. No DOM, no state.

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

const FLAG_WIDTHS = { sm: 20, md: 40, lg: 80 };

export function code(team) {
  return CODES[team] || team.slice(0, 3).toUpperCase();
}

export function flag(team, size = 'sm') {
  const iso = ISO[team];
  if (!iso) return `<span class="wc-flag-placeholder">${code(team)}</span>`;
  const w = FLAG_WIDTHS[size] || FLAG_WIDTHS.sm;
  return (
    `<img class="wc-flag wc-flag-${size}" ` +
    `src="https://flagcdn.com/w${w}/${iso}.png" ` +
    `srcset="https://flagcdn.com/w${w * 2}/${iso}.png 2x" ` +
    `alt="" loading="lazy" decoding="async">`
  );
}

// Picks store date-only strings (YYYY-MM-DD). Anchor to midday so timezone
// shifts don't flip the displayed weekday.
export function fmtDate(iso) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

// Stable key used to look up a match in the results dictionary.
// Match the worker's `${home}-${away}` shape.
export function matchKey(m) {
  return `${m.home}-${m.away}`;
}

// Same midday-anchored parse used for "what round is happening now?" checks.
export function parseDate(iso) {
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
}
