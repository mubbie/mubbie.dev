// ─── Small helpers shared by command handlers ───

// Own-property lookup, so input like "constructor" never resolves to Object.prototype members
export function lookup(obj, key) {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

// Tokenize respecting quoted strings, then separate flags from positional args
export function parseArgs(arg) {
  const tokens = arg.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const flags = [];
  const positional = [];
  for (const t of tokens) {
    if (t.startsWith('-')) flags.push(t);
    else positional.push(t.replace(/^(["'])(.*)\1$/, '$2'));
  }
  return { flags, positional: positional.join(' ') };
}

// Reject flags for commands that take none. Returns the positional text, or null after an error.
export function rejectFlags(out, trimmed, cmd, arg) {
  const { flags, positional } = parseArgs(arg);
  if (flags.length) {
    out.addLine('$', trimmed, `${cmd}: unknown option: ${flags[0]}`, true);
    return null;
  }
  return positional;
}

// "rm -rf …", "rm -fr …", "rm -r -f …" etc.
export function isRmRf(cmdline) {
  const [name, ...rest] = cmdline.split(/\s+/);
  const flagChars = rest.filter((t) => /^-[a-z]+$/.test(t)).join('');
  return name === 'rm' && flagChars.includes('r') && flagChars.includes('f');
}

// Only web links (or paths on this site) are ever opened or linked, whatever an API returns
function safeUrl(url) {
  try {
    const parsed = new URL(url, location.href);
    return parsed.protocol === 'https:' || parsed.origin === location.origin ? url : null;
  } catch {
    return null;
  }
}

// Open a URL in a new tab. Browsers block window.open outside a direct user gesture
// (e.g. after a fetch or a timer), so fall back to a clickable link in the terminal.
export function openUrl(out, url, label) {
  const href = safeUrl(url);
  if (!href) {
    out.addLine(null, null, 'refusing to open that link.', true);
    return false;
  }
  // (no 'noopener' feature: that makes window.open return null, hiding a blocked popup)
  const win = window.open(href, '_blank');
  if (win) win.opener = null;
  else out.addLink(`popup blocked. click to open ${label || href}`, href);
  return Boolean(win);
}

// Print lines one after another, like a slow process. Each step is [text, delayMs];
// `done` ({ text, delay }) ends it with a line in green.
export function playSteps(out, steps, done) {
  steps.forEach(([text, delay]) => out.later(() => out.addLine(null, null, text), delay));
  if (done) out.later(() => out.addOk(done.text), done.delay);
}
