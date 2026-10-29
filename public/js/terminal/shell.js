// ─── Shell plumbing: parsing, expansion, pipe filters, suggestions ───

// Split a line into a sequence of pipelines joined by ;, && or ||.
// Quotes are respected, so `echo "a|b"` stays one command.
//   "ls | wc -l && pwd"  →  [{ op: null, stages: ['ls', 'wc -l'] }, { op: '&&', stages: ['pwd'] }]
export function parseLine(line) {
  const sequence = [];
  let stages = [];
  let current = '';
  let quote = null;
  let op = null;

  const endStage = () => { stages.push(current.trim()); current = ''; };
  const endPipeline = (nextOp) => {
    endStage();
    sequence.push({ op, stages });
    stages = [];
    op = nextOp;
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '&' && next === '&') {
      endPipeline('&&');
      i++;
    } else if (ch === '|' && next === '|') {
      endPipeline('||');
      i++;
    } else if (ch === '|') {
      endStage();
    } else if (ch === ';') {
      endPipeline(';');
    } else {
      current += ch;
    }
  }
  endPipeline(null);
  return sequence.filter((p) => p.stages.some(Boolean));
}

// A pipeline with an empty stage ("ls |", "| wc") is a syntax error, like bash
export function syntaxError(sequence) {
  for (const p of sequence) {
    if (p.stages.some((s) => !s)) return "syntax error near unexpected token `|'";
  }
  return null;
}

// Bash history expansion: !! (last), !n (nth, 1-based oldest first), !-n, !prefix.
// entries are newest-first. Returns { line } or { error }.
export function expandHistory(line, entries) {
  if (!line.includes('!')) return { line };
  let error = null;
  const oldestFirst = entries.slice().reverse();
  const out = line.replace(/!(!|-?\d+|[a-z][\w-]*)/gi, (match, ref) => {
    if (error) return match;
    let hit;
    if (ref === '!') hit = entries[0];
    else if (/^-\d+$/.test(ref)) hit = entries[parseInt(ref.slice(1), 10) - 1];
    else if (/^\d+$/.test(ref)) hit = oldestFirst[parseInt(ref, 10) - 1];
    else hit = entries.find((e) => e.startsWith(ref));
    if (hit === undefined) error = `${match}: event not found`;
    return hit ?? match;
  });
  return error ? { error } : { line: out, expanded: out !== line };
}

// $VAR and ${VAR}, not inside single quotes (like a real shell)
export function expandVars(text, env) {
  let out = '';
  let inSingle = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") { inSingle = !inSingle; out += ch; continue; }
    if (ch === '$' && !inSingle) {
      const m = /^\$(?:\{(\w+|\?)\}|(\w+|\?))/.exec(text.slice(i));
      if (m) {
        const name = m[1] || m[2];
        out += Object.hasOwn(env, name) ? env[name] : '';
        i += m[0].length - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

// Strip one layer of surrounding quotes from each word: echo "hi there" → hi there
export function unquote(text) {
  return text.replace(/(["'])(.*?)\1/g, '$2');
}

// ─── Filters: commands that read lines from a pipe ───

function parseCount(args, fallback = 10) {
  const n = args.find((a) => /^-\d+$/.test(a));
  if (n) return parseInt(n.slice(1), 10);
  const i = args.indexOf('-n');
  if (i >= 0 && /^\d+$/.test(args[i + 1] || '')) return parseInt(args[i + 1], 10);
  return fallback;
}

export const FILTERS = {
  // smart case: lowercase pattern matches any case; any capital makes it exact
  grep(lines, args) {
    const flags = args.filter((a) => /^-[ivcn]+$/.test(a)).join('');
    const pattern = unquote(args.filter((a) => !/^-[ivcn]+$/.test(a)).join(' '));
    if (!pattern) return { error: 'usage: … | grep [-i] [-v] [-c] [-n] <pattern>' };
    const insensitive = flags.includes('i') || pattern === pattern.toLowerCase();
    const needle = insensitive ? pattern.toLowerCase() : pattern;
    const hits = [];
    lines.forEach((line, i) => {
      const hay = insensitive ? line.toLowerCase() : line;
      if (hay.includes(needle) !== flags.includes('v')) hits.push(flags.includes('n') ? `${i + 1}:${line}` : line);
    });
    if (flags.includes('c')) return { lines: [String(hits.length)] };
    return { lines: hits, failed: hits.length === 0 };
  },
  head(lines, args) {
    return { lines: lines.slice(0, parseCount(args)) };
  },
  tail(lines, args) {
    const n = parseCount(args);
    return { lines: n ? lines.slice(-n) : [] };
  },
  wc(lines, args) {
    const text = lines.join('\n');
    const counts = {
      l: lines.length,
      w: text.split(/\s+/).filter(Boolean).length,
      c: text.length + (lines.length ? 1 : 0),
    };
    const flags = args.join('').replace(/-/g, '');
    const pick = ['l', 'w', 'c'].filter((f) => flags.includes(f));
    const shown = pick.length ? pick : ['l', 'w', 'c'];
    return { lines: [shown.map((f) => String(counts[f]).padStart(pick.length === 1 ? 0 : 7)).join(' ').trimStart()] };
  },
  sort(lines, args) {
    const flags = args.join('');
    let sorted = flags.includes('n')
      ? lines.slice().sort((a, b) => parseFloat(a) - parseFloat(b))
      : lines.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (flags.includes('r')) sorted.reverse();
    if (flags.includes('u')) sorted = sorted.filter((l, i) => i === 0 || l !== sorted[i - 1]);
    return { lines: sorted };
  },
  uniq(lines, args) {
    const counted = [];
    for (const line of lines) {
      const last = counted[counted.length - 1];
      if (last && last.line === line) last.n++;
      else counted.push({ line, n: 1 });
    }
    const showCount = args.includes('-c');
    return { lines: counted.map((c) => (showCount ? `${String(c.n).padStart(7)} ${c.line}` : c.line)) };
  },
  cowsay(lines, args) {
    const text = args.length ? unquote(args.join(' ')) : lines.join(' ');
    return { lines: cowsay(text || 'moo.') };
  },
};

// ─── cowsay ───

export function cowsay(text) {
  const width = 36;
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const rows = [];
  let row = '';
  for (const w of words) {
    if (row && (row + ' ' + w).length > width) { rows.push(row); row = w; }
    else row = row ? `${row} ${w}` : w;
  }
  if (row) rows.push(row);
  const len = Math.max(...rows.map((r) => r.length));
  const pad = (r) => r + ' '.repeat(len - r.length);
  const bubble = rows.length === 1
    ? [`< ${pad(rows[0])} >`]
    : rows.map((r, i) => {
        const [l, rr] = i === 0 ? ['/', '\\'] : i === rows.length - 1 ? ['\\', '/'] : ['|', '|'];
        return `${l} ${pad(r)} ${rr}`;
      });
  return [
    ` ${'_'.repeat(len + 2)}`,
    ...bubble,
    ` ${'-'.repeat(len + 2)}`,
    '        \\   ^__^',
    '         \\  (oo)\\_______',
    '            (__)\\       )\\/\\',
    '                ||----w |',
    '                ||     ||',
  ];
}

// ─── "did you mean" ───

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      // swapped neighbors ("grpe" → "grep") count as one typo
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

export function suggest(word, candidates) {
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = editDistance(word, c);
    if (d < bestDist) { best = c; bestDist = d; }
  }
  // close enough to be a typo: one slip for short words, two for longer ones
  return bestDist <= (word.length <= 4 ? 1 : 2) ? best : null;
}
