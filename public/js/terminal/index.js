// ─── Terminal: init, command processing, event wiring ───

import {
  FILESYSTEM, HELP_ITEMS, OPENABLES, ALIASES, ALL_COMMANDS,
  EIGHT_BALL_RESPONSES, NEOFETCH_LINES, MAN_PAGES, COMMAND_DEFS, HINTS,
} from './commands.js';
import { createHistory } from './history.js';
import { createOutput } from './output.js';
import { tabComplete } from './completer.js';
import { HOME, displayPath, resolveDir, list, readFile, pageTarget } from './fs.js';
import { openEmacs, openVim } from './editor.js';
import { fetchNotes, signGuestbook, formatDate } from '../guestbook.js';
import { parseLine, syntaxError, expandHistory, expandVars, unquote, FILTERS, cowsay, suggest } from './shell.js';
import { applyTheme, toggleTheme, setThemePreference, useSystemTheme } from '../theme.js';
import { startMatrix, isMatrixActive, stopMatrix } from '../matrix.js';
import { scrollToTop, scrollToEl } from '../scroll.js';
import { fetchWeather } from '../weather.js';
import { popPopcorn } from '../popcorn.js';
import { ACTIVITIES } from '../hangout.js';
import { selectRaceTab } from '../race-tabs.js';

const PAGE_LOAD_TIME = Date.now();

// Own-property lookup, so input like "constructor" never resolves to Object.prototype members
function lookup(obj, key) {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

// Open a URL in a new tab. Browsers block window.open outside a direct user gesture
// (e.g. after a fetch or a timer), so fall back to a clickable link in the terminal.
function openUrl(out, url, label) {
  const win = window.open(url, '_blank');
  if (win) {
    win.opener = null;
  } else {
    out.addLink(`popup blocked. click to open ${label || url}`, url);
  }
  return Boolean(win);
}

// ─── Argument parser ───

// Tokenize respecting quoted strings, then separate flags from positional args
function parseArgs(arg) {
  const tokens = (arg.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []);
  const flags = [];
  const positional = [];
  for (const t of tokens) {
    if (t.startsWith('-') && !t.startsWith('"') && !t.startsWith("'")) {
      flags.push(t);
    } else {
      positional.push(t.replace(/^(["'])(.*)\1$/, '$2'));
    }
  }
  return { flags, positional: positional.join(' ') };
}

// "rm -rf …", "rm -fr …", "rm -r -f …" etc.
function isRmRf(cmdline) {
  const [name, ...rest] = cmdline.split(/\s+/);
  const flagChars = rest.filter((t) => /^-[a-z]+$/.test(t)).join('');
  return name === 'rm' && flagChars.includes('r') && flagChars.includes('f');
}

// Guard: reject unknown flags for commands that don't accept any
function rejectFlags(out, trimmed, cmd, arg) {
  const { flags, positional } = parseArgs(arg);
  if (flags.length) {
    out.addLine('$', trimmed, `${cmd}: unknown option: ${flags[0]}`, true);
    return null;
  }
  return positional;
}

// ─── Command handlers ───
// Each handler receives (ctx) with: { out, trimmed, arg, argLower, history, fortunes }

// sh: shared shell state { cwd, prevCwd, env, visitedDev }
function createHandlers(out, history, getFortunes, sh) {
  // Names of things in a directory listing, laid out like ls does
  function formatListing(entries, flags) {
    if (flags.includes('l')) {
      return entries.map((e) => `${e.endsWith('/') ? 'drwxr-xr-x' : '-rw-r--r--'}  mubbie  staff  ${e}`).join('\n');
    }
    // names with spaces (race names, post titles) read better one per line
    if (flags.includes('1') || entries.some((e) => e.includes(' '))) return entries.join('\n');
    return entries.join('  ');
  }

  function goTo(dest) {
    if (dest !== sh.cwd) sh.prevCwd = sh.cwd;
    sh.cwd = dest;
    const target = pageTarget(dest);
    if (!target) return;
    const [id, year] = target;
    if (year) selectRaceTab(year);
    if (id) scrollToEl(document.getElementById(id));
    else scrollToTop();
  }

  // head/tail/wc/sort/uniq outside a pipe: read the named file instead
  function fileFilter(name) {
    return (trimmed, arg) => {
      const words = arg.trim() ? arg.trim().split(/\s+/) : [];
      // the file is the first word that isn't a flag or the number after -n
      const fileArg = words.find((w, i) => !w.startsWith('-') && !(i > 0 && words[i - 1] === '-n'));
      if (!fileArg) {
        out.addLine('$', trimmed, `${name}: reads from a pipe or a file. try: ls races | ${name}${name === 'head' || name === 'tail' ? ' -3' : ''}`, true);
        return;
      }
      const file = readFile(sh.cwd, fileArg);
      if (file.error) {
        out.addLine('$', trimmed, `${name}: ${file.error}`, true);
        return;
      }
      const r = FILTERS[name](file.text.split('\n'), words.filter((w) => w !== fileArg));
      out.addLine('$', trimmed, r.lines.join('\n'));
    };
  }

  const handlersRef = {
    head: fileFilter('head'),
    tail: fileFilter('tail'),
    wc: fileFilter('wc'),
    sort: fileFilter('sort'),
    uniq: fileFilter('uniq'),

    help(trimmed) {
      out.addLine('$', trimmed, null);
      out.addHelpTable(HELP_ITEMS);
    },

    whoami(trimmed) {
      out.addLine('$', trimmed, 'mubbie idoko');
    },

    ls(trimmed, arg) {
      const { flags, positional: target } = parseArgs(arg);
      const badFlag = flags.find((f) => !/^-[lah1]+$/.test(f));
      if (badFlag) {
        out.addLine('$', trimmed, `ls: unknown option: ${badFlag}`, true);
        return;
      }
      const flagChars = flags.join('');
      const dir = target ? resolveDir(sh.cwd, target) : sh.cwd;
      if (!dir) {
        // ls on a file prints its name, like a real shell
        const file = target && readFile(sh.cwd, target);
        if (file && !file.error) out.addLine('$', trimmed, target);
        else out.addLine('$', trimmed, `ls: ${target}: No such file or directory`, true);
        return;
      }
      let entries = list(dir);
      if (flagChars.includes('a')) entries = ['./', '../', ...entries];
      out.addLine('$', trimmed, entries.length ? formatListing(entries, flagChars) : null);
    },

    cd(trimmed, arg) {
      // "cd -" goes back; it isn't a flag
      const target = arg.trim() === '-' ? '-' : rejectFlags(out, trimmed, 'cd', arg);
      if (target === null) return;
      let dest;
      if (!target || target === '~') dest = HOME;
      else if (target === '-') dest = sh.prevCwd;
      else dest = resolveDir(sh.cwd, target);

      if (!dest) {
        const file = readFile(sh.cwd, target);
        const why = file && !file.error ? 'Not a directory' : 'No such file or directory';
        out.addLine('$', trimmed, `cd: ${target}: ${why}`, true);
        return;
      }
      const firstDevVisit = dest === '/dev' && !sh.visitedDev;
      if (dest === '/dev') sh.visitedDev = true;
      goTo(dest);
      // cd - prints where it went, like bash; the secret directory gets a welcome
      if (target === '-') out.addLine('$', trimmed, displayPath(dest));
      else out.addLine('$', trimmed, firstDevVisit ? 'you found the secret directory. try: ls' : null);
    },

    cat(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'cat', arg);
      if (target === null) return;
      if (!target) {
        out.addLine('$', trimmed, 'usage: cat <file> (try: ls, then cat about.txt)', true);
        return;
      }
      const file = readFile(sh.cwd, target);
      if (file.error) out.addLine('$', trimmed, `cat: ${file.error}`, true);
      else out.addLine('$', trimmed, file.text);
    },

    open(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'open', arg);
      if (target === null) return;
      const lower = target.toLowerCase();
      if (!target) {
        out.addLine('$', trimmed, 'usage: open <project|link> (try: open gx, open latest)', true);
        return;
      }

      // Handle "latest", "substack latest", "notebook latest"
      if (lower === 'latest' || lower === 'substack latest' || lower === 'notebook latest') {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, 'fetching latest post...');
        fetch('/api/posts?limit=1')
          .then((r) => {
            if (!r.ok) throw new Error(r.status);
            return r.json();
          })
          .then((posts) => {
            if (!Array.isArray(posts) || !posts.length) throw new Error();
            const post = posts[0];
            const link = post.canonical_url || `https://notebook.mubbie.dev/p/${post.slug}`;
            if (openUrl(out, link, `"${post.title}"`)) out.addOk(`→ opening "${post.title}"`);
          })
          .catch(() => out.addLine(null, null, 'could not fetch latest post.', true));
        return;
      }

      const exact = OPENABLES.find((x) => x.name.toLowerCase() === lower);
      const matches = exact ? [exact] : OPENABLES.filter((x) => x.name.toLowerCase().includes(lower));
      if (matches.length === 1) {
        out.addLine('$', trimmed, null);
        if (openUrl(out, matches[0].href, matches[0].name)) out.addOk(`→ opening ${matches[0].name}`);
      } else if (matches.length > 1) {
        out.addLine('$', trimmed, `open: ambiguous '${target}'. did you mean: ${matches.map((m) => m.name).join(', ')}?`, true);
      } else {
        out.addLine('$', trimmed, `open: '${target}' not found. try: open gx, open latest, open substack`, true);
      }
    },

    theme(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'theme', arg);
      if (target === null) return;
      const lower = target.toLowerCase();
      if (lower === 'dark' || lower === 'light') {
        setThemePreference(lower);
        applyTheme(lower);
        out.addLine('$', trimmed, null);
        out.addOk(`theme: ${lower}`);
      } else if (lower === 'default' || lower === 'system' || lower === 'auto') {
        const theme = useSystemTheme();
        out.addLine('$', trimmed, null);
        out.addOk(`theme: default (${theme}, following your device)`);
      } else if (!target) {
        const next = toggleTheme();
        out.addLine('$', trimmed, null);
        out.addOk(`theme → ${next}`);
      } else {
        out.addLine('$', trimmed, `theme: unknown value '${target}'. use: dark, light, default`, true);
      }
    },

    weather(trimmed) {
      out.addLine('$', trimmed, null);
      out.addLine(null, null, 'fetching seattle weather...');
      fetchWeather()
        .then((w) => {
          if (!w) { out.addLine(null, null, 'could not fetch weather. try again later.', true); return; }
          out.addOk(`seattle: ${w.emoji} ${w.f}°F/${w.c}°C · ${w.wind} · ${w.humidity} humidity`);
        })
        .catch(() => out.addLine(null, null, 'could not fetch weather. try again later.', true));
    },

    clear() {
      out.clear();
    },

    pwd(trimmed) {
      out.addLine('$', trimmed, displayPath(sh.cwd));
    },

    date(trimmed) {
      out.addLine('$', trimmed, new Date().toString());
    },

    random(trimmed) {
      const f = getFortunes();
      out.addLine('$', trimmed, f[Math.floor(Math.random() * f.length)]);
    },

    echo(trimmed, arg) {
      out.addLine('$', trimmed, unquote(arg || ''));
    },

    sudo(trimmed, arg) {
      const lower = arg.toLowerCase();
      if (lower === 'hire-me' || lower === 'hire me') {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, '[sudo] password for recruiter: ••••••••');
        out.addOk('authenticated. email queued → midoko.dev@gmail.com');
        out.addLine(null, null, 'just kidding. drop a note at midoko.dev@gmail.com 👋🏾');
      } else if (lower === 'guestbook review') {
        handlersRef.guestbook(trimmed, 'review');
      } else if (isRmRf(lower)) {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, '[sudo] password for root: ••••••••');
        const targets = [
          { text: 'deleting /projects...', delay: 600 },
          { text: 'deleting /writing...', delay: 1200 },
          { text: 'deleting /races...', delay: 1800 },
          { text: 'deleting /bucketlist...', delay: 2400 },
          { text: 'deleting /connect...', delay: 3000 },
          { text: 'deleting /dev/secrets.txt...', delay: 3600 },
        ];
        targets.forEach((t) => {
          out.later(() => out.addLine(null, null, t.text), t.delay);
        });
        out.later(() => {
          out.addOk('just kidding. nice try though. 🛡️');
        }, 4200);
      } else {
        out.addLine('$', trimmed, 'nice try 😏', true);
      }
    },

    matrix(trimmed) {
      out.addLine('$', trimmed, null);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        out.addLine(null, null, 'the matrix is resting: your system prefers reduced motion.');
        return;
      }
      out.addOk('wake up, neo... (esc or tap to exit)');
      out.later(() => startMatrix(), 400);
    },

    coffee(trimmed) {
      out.addLine('$', trimmed, null);
      const steps = [
        { text: '🫘 grinding beans...', delay: 0 },
        { text: '💧 heating water...', delay: 600 },
        { text: '☕ brewing...', delay: 1200 },
        { text: '🥛 adding a splash...', delay: 1800 },
        { text: '', delay: 2400 },
      ];
      steps.forEach((step) => {
        out.later(() => {
          if (step.text === '') {
            out.addOk('☕ freshly brewed. enjoy!');
          } else {
            out.addLine(null, null, step.text);
          }
        }, step.delay);
      });
    },

    cocktail(trimmed, arg) {
      const SHELVES = ['tavern', 'merchant', 'alchemist', 'archmage'];
      const PHIALS = ['brooding', 'celebratory', 'contemplative', 'amorous', 'courageous', 'weary'];
      const args = arg ? arg.trim().split(/\s+/) : [];

      function showGuide(header) {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, header);
        out.addLine(null, null, '');
        out.addLine(null, null, '  cocktail <shelf> <phial>');
        out.addLine(null, null, '  cocktail random');
        out.addLine(null, null, '');
        out.addLine(null, null, '  shelves (how much you want to spend):');
        out.addLine(null, null, '    tavern      budget');
        out.addLine(null, null, '    merchant    mid-range');
        out.addLine(null, null, '    alchemist   premium');
        out.addLine(null, null, '    archmage    top-shelf');
        out.addLine(null, null, '');
        out.addLine(null, null, '  phials (how are you feeling):');
        out.addLine(null, null, '    brooding        dark & smoky');
        out.addLine(null, null, '    celebratory     bubbly & bright');
        out.addLine(null, null, '    contemplative   smooth & mellow');
        out.addLine(null, null, '    amorous         sweet & romantic');
        out.addLine(null, null, '    courageous      bold & strong');
        out.addLine(null, null, '    weary           easy & comforting');
      }

      function conjure(url) {
        out.addLine('$', trimmed, null);
        const steps = [
          { text: '🧙 consulting the apothecary...', delay: 0 },
          { text: '🌿 gathering rare ingredients...', delay: 700 },
          { text: '⚗️ mixing the elixir...', delay: 1400 },
          { text: '✨ channeling flavor spirits...', delay: 2100 },
          { text: '🔮 divining the perfect concoction...', delay: 2800 },
          { text: '', delay: 3500 },
        ];
        steps.forEach((step) => {
          out.later(() => {
            if (step.text === '') {
              out.addOk('🍸 your elixir awaits. opening sorcery...');
              out.later(() => openUrl(out, url, 'sorcery'), 600);
            } else {
              out.addLine(null, null, step.text);
            }
          }, step.delay);
        });
      }

      // No args → show guide
      if (args.length === 0) {
        showGuide('🧙 conjure your next drink:');
        return;
      }

      // "cocktail random"
      if (args.length === 1 && args[0] === 'random') {
        conjure('https://sorcery.lol?random=true');
        return;
      }

      // "cocktail <shelf> <phial>"
      if (args.length === 2) {
        const shelf = args[0].toLowerCase();
        const phial = args[1].toLowerCase();
        if (SHELVES.includes(shelf) && PHIALS.includes(phial)) {
          conjure(`https://sorcery.lol?tier=${shelf}&mood=${phial}`);
          return;
        }
      }

      // Bad args → detailed guide
      showGuide('🧙 unknown incantation. try:');
    },

    flip(trimmed) {
      out.addLine('$', trimmed, Math.random() < 0.5 ? '🪙 heads!' : '🪙 tails!');
    },

    '8ball'(trimmed, arg) {
      if (!arg) {
        out.addLine('$', trimmed, 'ask me a question. e.g. 8ball will I ship this feature?', true);
      } else {
        out.addLine('$', trimmed, `🎱 ${EIGHT_BALL_RESPONSES[Math.floor(Math.random() * EIGHT_BALL_RESPONSES.length)]}`);
      }
    },

    repo(trimmed) {
      out.addLine('$', trimmed, null);
      if (openUrl(out, 'https://github.com/mubbie/mubbie.dev', 'mubbie/mubbie.dev')) {
        out.addOk('→ opening mubbie/mubbie.dev');
      }
    },

    rm(trimmed) {
      out.addLine('$', trimmed, 'rm: permission denied. try sudo?', true);
    },

    grep(trimmed, arg) {
      if (!arg.trim()) {
        out.addLine('$', trimmed, 'usage: grep <term>  (or: … | grep <pattern>)', true);
        return;
      }
      // grep <pattern> <file>: search a file, like a real grep
      const words = arg.trim().split(/\s+/);
      if (words.length > 1) {
        const file = readFile(sh.cwd, words[words.length - 1]);
        if (!file.error) {
          const r = FILTERS.grep(file.text.split('\n'), words.slice(0, -1));
          if (r.error) out.addLine('$', trimmed, r.error, true);
          else out.addLine('$', trimmed, r.lines.length ? r.lines.join('\n') : null, false);
          if (r.failed) sh.lastFailed = true;
          return;
        }
      }
      const term = arg.trim().toLowerCase();
      const sections = [];
      let totalMatches = 0;

      function searchSection(name, selector, extractFn) {
        const els = document.querySelectorAll(selector);
        const matches = [];
        els.forEach((el) => {
          const text = extractFn(el);
          if (text && text.toLowerCase().includes(term)) matches.push(text);
        });
        if (matches.length > 0) {
          sections.push({ name, matches });
          totalMatches += matches.length;
        }
      }

      // Projects: name + description
      searchSection('projects/', '.project-card', (el) => {
        const name = el.querySelector('h3')?.textContent || '';
        const desc = el.querySelector('p')?.textContent || '';
        return name.toLowerCase().includes(term) || desc.toLowerCase().includes(term)
          ? `${name}: ${desc}` : null;
      });

      // Writing: titles
      searchSection('writing/', '.writing-item', (el) => {
        const title = el.querySelector('h3')?.textContent || '';
        return title.toLowerCase().includes(term) ? title : null;
      });

      // Fav tools dock: name + note (both live in the aria-label)
      searchSection('currently/tools/', '.dock-item', (el) => {
        const text = el.getAttribute('aria-label') || '';
        return text.toLowerCase().includes(term) ? text : null;
      });

      // Races: name + location
      searchSection('races/', '.race-item', (el) => {
        const name = el.querySelector('.race-name')?.firstChild?.textContent || '';
        const loc = el.querySelector('.race-location')?.textContent || '';
        const date = el.querySelector('.race-date')?.textContent || '';
        return (name + loc).toLowerCase().includes(term)
          ? `${name}: ${loc}, ${date}` : null;
      });

      // 2027 cycling challenge (month rail)
      searchSection('races/2027/', '.rail-race', (el) => {
        // Full official name when there is one (it's the row's hover title)
        const name = el.title || el.querySelector('.rail-name')?.textContent || '';
        // The · separators are CSS-only, so join the detail parts explicitly
        const meta = [...el.querySelectorAll('.rail-part')].map((part) => part.textContent).join(' · ');
        return (name + ' ' + meta).toLowerCase().includes(term) ? `${name} (${meta})` : null;
      });

      // Bucket list
      searchSection('bucketlist/', '.bucket-item', (el) => {
        const text = el.querySelector('.bucket-text')?.textContent || '';
        if (!text.toLowerCase().includes(term)) return null;
        const done = el.classList.contains('done');
        return `${done ? '✓' : '○'} ${text}`;
      });

      // Currently
      searchSection('currently/', '.currently-item', (el) => {
        const label = el.querySelector('.currently-label')?.textContent || '';
        const value = el.querySelector('.currently-value')?.textContent || '';
        return (label + value).toLowerCase().includes(term)
          ? `${label}: ${value}` : null;
      });

      // Connect
      searchSection('connect/', '.connect-link', (el) => {
        const text = el.textContent.trim();
        return text.toLowerCase().includes(term) ? text : null;
      });

      // /dev file names only (not contents — keep secrets hidden)
      const devMatches = [];
      (FILESYSTEM['/dev'] || []).forEach((f) => {
        if (f.toLowerCase().includes(term)) devMatches.push(f);
      });
      if (devMatches.length > 0) {
        sections.push({ name: '/dev/', matches: devMatches });
        totalMatches += devMatches.length;
      }

      out.addLine('$', trimmed, null);
      if (totalMatches === 0) {
        out.addLine(null, null, `no matches for '${arg.trim()}'`, true);
      } else {
        sections.forEach((s) => {
          out.addOk(s.name);
          s.matches.forEach((m) => out.addLine(null, null, `  ${m}`));
        });
        out.addLine(null, null, `\n${totalMatches} match${totalMatches === 1 ? '' : 'es'}`);
      }
    },

    ssh(trimmed, arg) {
      const host = arg.trim() || 'mubbie.dev';
      out.addLine('$', trimmed, null);
      const steps = [
        { text: `connecting to ${host}...`, delay: 0 },
        { text: 'establishing secure connection...', delay: 800 },
        { text: 'authenticating...', delay: 1600 },
        { text: '', delay: 2400 },
      ];
      steps.forEach((step) => {
        out.later(() => {
          if (step.text === '') {
            out.addOk(`access granted. welcome back. you're already here. 🏠`);
          } else {
            out.addLine(null, null, step.text);
          }
        }, step.delay);
      });
    },

    tree(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'tree', arg);
      if (target === null) return;
      const root = target ? resolveDir(sh.cwd, target) : sh.cwd;
      if (!root) {
        out.addLine('$', trimmed, `tree: ${target}: No such directory`, true);
        return;
      }
      const rows = [root === sh.cwd && !target ? '.' : displayPath(root)];
      let dirs = 0;
      let files = 0;
      (function walk(path, indent) {
        const entries = list(path) || [];
        entries.forEach((entry, i) => {
          const last = i === entries.length - 1;
          rows.push(`${indent}${last ? '└── ' : '├── '}${entry.replace(/\/$/, '')}`);
          if (entry.endsWith('/')) {
            dirs++;
            walk(`${path === '/' ? '' : path}/${entry.slice(0, -1)}`, indent + (last ? '    ' : '│   '));
          } else {
            files++;
          }
        });
      }(root, ''));
      rows.push('', `${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`);
      out.addLine('$', trimmed, rows.join('\n'));
    },

    env(trimmed) {
      const shown = Object.entries(sh.env).filter(([k]) => k !== '?').sort(([a], [b]) => a.localeCompare(b));
      out.addLine('$', trimmed, shown.map(([k, v]) => `${k}=${v}`).join('\n'));
    },

    export(trimmed, arg) {
      const m = /^([A-Za-z_]\w*)=(.*)$/.exec(arg.trim());
      if (!m) {
        out.addLine('$', trimmed, arg.trim() ? `export: not valid: ${arg.trim()}. usage: export NAME=value` : null, Boolean(arg.trim()));
        if (!arg.trim()) handlersRef.env(trimmed);
        return;
      }
      if (['PWD', 'HOME', 'USER'].includes(m[1])) {
        out.addLine('$', trimmed, `export: ${m[1]}: read-only variable (nice try)`, true);
        return;
      }
      sh.env[m[1]] = unquote(m[2]);
      out.addLine('$', trimmed, null);
    },

    which(trimmed, arg) {
      const name = arg.trim().toLowerCase();
      if (!name) {
        out.addLine('$', trimmed, 'usage: which <command>', true);
        return;
      }
      const special = { ll: 'll: aliased to ls -l', la: 'la: aliased to ls -a', vim: '/usr/bin/vim (are you sure? try emacs)', vi: 'vi: aliased to vim', emacs: '/usr/bin/emacs', nano: '/usr/bin/nano' };
      if (Object.hasOwn(special, name)) {
        out.addLine('$', trimmed, special[name]);
      } else if (Object.hasOwn(ALIASES, name)) {
        out.addLine('$', trimmed, `${name}: aliased to ${ALIASES[name]}`);
      } else if (Object.hasOwn(FILTERS, name)) {
        out.addLine('$', trimmed, `/usr/bin/${name}`);
      } else if (Object.hasOwn(handlersRef, name)) {
        out.addLine('$', trimmed, `/usr/local/bin/${name}`);
      } else {
        out.addLine('$', trimmed, `${name} not found`, true);
      }
    },

    cowsay(trimmed, arg) {
      out.addLine('$', trimmed, cowsay(unquote(arg.trim()) || 'moo. (try: random | cowsay)').join('\n'));
    },

    sl(trimmed) {
      // You typed sl, not ls. Real terminals punish this with a train.
      const train = [
        '      ====        ________                ___________ ',
        '  _D _|  |_______/        \\__I_I_____===__|_________| ',
        '   |(_)---  |   H\\________/ |   |        =|___ ___|  ',
        '   /     |  |   H  |  |     |   |         ||_| |_||  ',
        '  |      |  |   H  |__--------------------| [___] |  ',
        '  | ________|___H__/__|_____/[][]~\\_______|       |  ',
        '  |/ |   |-----------I_____I [][] []  D   |=======|__',
        '__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__',
        ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ',
        '  \\_/      \\O=====O=====O=====O_/      \\_/            ',
      ];
      out.addLine('$', trimmed, null);
      out.addLine(null, null, train.join('\n'));
      if (!out.live || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const el = document.getElementById('terminal-history')?.lastElementChild?.firstElementChild;
      if (!el) return;
      const width = 46;
      for (let f = 0; f <= width + train[0].length; f += 2) {
        out.later(() => {
          const shift = width - f;
          el.textContent = train.map((row) => (shift >= 0 ? ' '.repeat(shift) + row : row.slice(-shift))).join('\n');
        }, f * 25);
      }
    },

    emacs(trimmed, arg) {
      if (!out.live) {
        out.addLine('$', trimmed, 'emacs: needs a screen, not a pipe', true);
        return;
      }
      out.addLine('$', trimmed, null);
      const backToTerminal = () => document.getElementById('terminal-input')?.focus();
      const target = arg.trim();
      // emacs guestbook: the Emacs way to sign it
      if (/^(~\/)?guestbook(\.txt)?$/i.test(target)) {
        signGuestbook({ onDone: ({ ok, text }) => out.addLine(null, null, text, !ok) });
        return;
      }
      if (!target) {
        openEmacs({ onExit: backToTerminal });
        return;
      }
      const file = readFile(sh.cwd, target);
      if (file.error && /Is a directory/.test(file.error)) {
        out.addLine(null, null, `emacs: ${target}: is a directory`, true);
        return;
      }
      openEmacs({
        name: target.split('/').pop(),
        text: file.error ? '' : `${file.text}\n`,
        readOnly: !file.error,
        mode: 'Text',
        onExit: backToTerminal,
      });
    },

    vim(trimmed) {
      if (!out.live) {
        out.addLine('$', trimmed, 'vim: needs a screen, not a pipe', true);
        return;
      }
      out.addLine('$', trimmed, null);
      openVim({
        onExit: () => {
          out.addOk('you escaped vim. an emacs user would never have been trapped.');
          document.getElementById('terminal-input')?.focus();
        },
      });
    },

    guestbook(trimmed, arg) {
      const sub = arg.trim().toLowerCase();
      if (sub === 'sign') {
        out.addLine('$', trimmed, null);
        signGuestbook({ onDone: ({ ok, text }) => out.addLine(null, null, text, !ok) });
        return;
      }
      if (sub === 'review') {
        out.addLine('$', trimmed, null);
        if (openUrl(out, '/admin/guestbook', 'the review page')) out.addOk('→ opening the review page (admins only)');
        return;
      }
      if (sub) {
        out.addLine('$', trimmed, `guestbook: unknown option '${sub}'. try: guestbook, guestbook sign`, true);
        return;
      }
      out.addLine('$', trimmed, null);
      out.addLine(null, null, 'fetching notes...');
      fetchNotes()
        .then((notes) => {
          if (!notes.length) {
            out.addLine(null, null, 'no notes yet. be the first: guestbook sign');
            return;
          }
          notes.slice(0, 20).forEach((n) => out.addLine(null, null, `"${n.message}"\n  · ${n.name}, ${formatDate(n.createdAt)}`));
          out.addLine(null, null, `\n${notes.length} note${notes.length === 1 ? '' : 's'}. add yours: guestbook sign`);
        })
        .catch(() => out.addLine(null, null, 'could not load the guestbook. try again later.', true));
    },

    true(trimmed) {
      out.addLine('$', trimmed, null);
    },

    false(trimmed) {
      out.addLine('$', trimmed, null);
      sh.lastFailed = true;
    },

    nano(trimmed) {
      out.addLine('$', trimmed, 'nano? in this economy? (try: emacs)');
    },

    exit(trimmed) {
      out.addLine('$', trimmed, null);
      out.addLine(null, null, 'there is no escape. you live here now. 🏠');
    },

    claude(trimmed) {
      out.addLine('$', trimmed, 'I helped build this site, you\'re welcome 😎');
    },

    ping(trimmed) {
      out.addLine('$', trimmed, 'pong! 🏓');
    },

    hangout(trimmed) {
      const pick = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
      out.addLine('$', trimmed, null);
      out.addOk(`🎲 next hangout: ${pick}`);
      out.addLine(null, null, 'want in? try "open hangouters"');
    },

    popcorn(trimmed) {
      out.addLine('$', trimmed, null);
      out.addOk("what's poppin'! 🍿");
      popPopcorn(document.getElementById('terminal'));
    },

    neofetch(trimmed) {
      out.addLine('$', trimmed, null);
      NEOFETCH_LINES.forEach((line) => out.addLine(null, null, line));
    },

    history(trimmed, arg) {
      if (arg.trim() === '-c') {
        history.clear();
        out.addLine('$', trimmed, null);
        return;
      }
      const all = history.getAll();
      if (all.length === 0) {
        out.addLine('$', trimmed, 'no commands in history yet');
      } else {
        // entries are newest-first; print oldest → newest like a real shell
        const recent = all.slice(0, 20).reverse();
        const start = all.length - recent.length + 1;
        out.addLine('$', trimmed, null);
        recent.forEach((h, i) => {
          out.addLine(null, null, `  ${String(start + i).padStart(3)}  ${h}`);
        });
      }
    },

    man(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'man', arg);
      if (target === null) return;
      if (!target) {
        out.addLine('$', trimmed, 'what manual page do you want? usage: man <command>', true);
        return;
      }
      const resolved = lookup(ALIASES, target.toLowerCase()) || target.toLowerCase();
      const page = lookup(MAN_PAGES, resolved);
      if (!page) {
        out.addLine('$', trimmed, `no manual entry for '${target}'`, true);
        return;
      }
      const def = COMMAND_DEFS.find((c) => c.name === resolved);
      out.addLine('$', trimmed, null);
      out.addLine(null, null, `NAME\n    ${resolved} - ${def?.help || ''}`);
      out.addLine(null, null, `\nSYNOPSIS\n    ${def?.usage || resolved}`);
      out.addLine(null, null, `\nDESCRIPTION\n    ${page}`);
    },

    uptime(trimmed) {
      const elapsed = Date.now() - PAGE_LOAD_TIME;
      const seconds = Math.floor(elapsed / 1000);
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      const parts = [];
      if (h > 0) parts.push(`${h}h`);
      if (m > 0) parts.push(`${m}m`);
      parts.push(`${s}s`);
      out.addLine('$', trimmed, `up ${parts.join(' ')}, since ${new Date(PAGE_LOAD_TIME).toLocaleTimeString()}`);
    },

    curl(trimmed, arg) {
      const target = arg.trim().toLowerCase();
      if (target === 'xkcd' || target === 'xkcd random') {
        const isRandom = target.includes('random');
        out.addLine('$', trimmed, null);
        out.addLine(null, null, 'fetching xkcd...');

        const getJson = (url) => fetch(url).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        });
        const fetchComic = isRandom
          ? getJson('/api/xkcd').then((data) => {
              let num = Math.floor(Math.random() * data.num) + 1;
              if (num === 404) num = 405; // xkcd #404 intentionally doesn't exist
              return getJson(`/api/xkcd?num=${num}`);
            })
          : getJson('/api/xkcd');

        fetchComic
          .then((data) => {
            out.addOk(`xkcd #${data.num}: ${data.title}`);
            out.addImage(data.img, data.alt, `https://xkcd.com/${data.num}/`);
          })
          .catch(() => out.addLine(null, null, 'could not fetch xkcd. try again later.', true));
      } else if (!target) {
        out.addLine('$', trimmed, 'usage: curl xkcd | curl xkcd random', true);
      } else {
        out.addLine('$', trimmed, `curl: unsupported target '${target}'. try: curl xkcd`, true);
      }
    },
  };
  return handlersRef;
}

// ─── Init ───

// Commands whose output arrives later over the network can't feed a pipe
const NETWORK_COMMANDS = new Set(['weather', 'curl', 'open', 'guestbook']);
// Aliases that carry flags, like a real shell's ll / la
const ALIAS_ARGS = { ll: '-l', la: '-a' };

export function initTerminal() {
  const terminalEl = document.getElementById('terminal');
  const historyEl = document.getElementById('terminal-history');
  const typedEl = document.getElementById('terminal-typed');
  const typedAfterEl = document.getElementById('terminal-typed-after');
  const inputEl = document.getElementById('terminal-input');
  const promptEl = document.querySelector('.terminal-input-line .terminal-prompt');

  if (!terminalEl || !inputEl) return;

  // ─── Shell state ───
  const sh = {
    cwd: HOME,
    prevCwd: HOME,
    visitedDev: false,
    env: {
      USER: 'mubbie',
      HOME,
      SHELL: '/bin/mubsh',
      EDITOR: 'emacs',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      '?': '0',
    },
  };
  Object.defineProperty(sh.env, 'PWD', { get: () => displayPath(sh.cwd), enumerable: true });

  const promptText = () => `${displayPath(sh.cwd)} $`;
  const base = createOutput(historyEl, promptText);
  const cmdHistory = createHistory();

  // ─── Output routing ───
  // Handlers write to `out`, which forwards to whatever is current: a runner that
  // prints (echoing the typed line once), or a capture that collects a pipe's input.
  function runner(ctx) {
    const echo = () => {
      if (!ctx.echoed) {
        base.addLine(ctx.prompt, ctx.line, null);
        ctx.echoed = true;
      }
    };
    const self = {
      live: true,
      addLine(prompt, cmd, output, isError) {
        if (prompt !== null) echo();
        if (output != null) base.addLine(null, null, output, isError);
        if (isError) ctx.failed = true;
      },
      addOk(text) { echo(); base.addOk(text); },
      addHelpTable(items) { echo(); base.addHelpTable(items); },
      addImage(...a) { echo(); base.addImage(...a); },
      addLink(...a) { echo(); base.addLink(...a); },
      later(fn, delay) { base.later(() => withCurrent(self, fn), delay); },
      cancelPending: () => base.cancelPending(),
      clear() { base.clear(); ctx.echoed = true; ctx.cleared = true; },
    };
    return self;
  }

  function capture(ctx) {
    const self = {
      live: false,
      lines: [],
      addLine(prompt, cmd, output, isError) {
        if (output == null) return;
        if (isError) {
          // errors go to the screen (stderr), not down the pipe
          runner(ctx).addLine('$', null, output, true);
          self.failed = true;
        } else {
          self.lines.push(...String(output).split('\n'));
        }
      },
      addOk(text) { self.lines.push(text); },
      addHelpTable(items) { items.forEach((h) => self.lines.push(`${h.c.padEnd(28)}${h.d}`)); },
      addImage(src, alt) { self.lines.push(alt || src); },
      addLink(text) { self.lines.push(text); },
      // a pipe waits for the whole output, so animations run instantly
      later(fn) { withCurrent(self, fn); },
      cancelPending: () => false,
      clear() {},
    };
    return self;
  }

  let current = runner({ echoed: true });
  const idle = current;
  function withCurrent(target, fn) {
    const prev = current;
    current = target;
    try { fn(); } finally { current = prev; }
  }
  const out = {
    get live() { return current.live; },
    addLine: (...a) => current.addLine(...a),
    addOk: (...a) => current.addOk(...a),
    addHelpTable: (...a) => current.addHelpTable(...a),
    addImage: (...a) => current.addImage(...a),
    addLink: (...a) => current.addLink(...a),
    later: (...a) => current.later(...a),
    cancelPending: () => base.cancelPending(),
    clear: () => current.clear(),
  };

  let fortunes = [
    'the best time to start was yesterday. the second best time is now.',
    'fortune favors the bold.',
    'have you tried turning it off and on again?',
  ];
  fetch('data/fortunes.json')
    .then((res) => res.json())
    .then((data) => { fortunes = data; })
    .catch(() => {});

  const handlers = createHandlers(out, cmdHistory, () => fortunes, sh);

  // quit is an alias for exit at the handler level
  handlers.quit = handlers.exit;

  // Everything Tab can complete as a command name
  const commandNames = [...new Set([...ALL_COMMANDS, ...Object.keys(FILTERS)])].sort();

  // ─── Rotating hint placeholder ───
  let hintEl = document.getElementById('terminal-hint');
  if (!hintEl) {
    hintEl = document.createElement('span');
    hintEl.id = 'terminal-hint';
    hintEl.className = 'terminal-hint';
    const inputLine = document.querySelector('.terminal-input-line');
    if (inputLine) inputLine.appendChild(hintEl);
  }

  let hintIndex = Math.floor(Math.random() * HINTS.length);
  let hintInterval = null;

  function showHint() {
    hintEl.textContent = HINTS[hintIndex];
    hintEl.style.display = '';
    hintIndex = (hintIndex + 1) % HINTS.length;
  }

  function startHintCycle() {
    if (hintInterval) return;
    showHint();
    hintInterval = setInterval(showHint, 5000);
  }

  function stopHintCycle() {
    if (hintInterval) {
      clearInterval(hintInterval);
      hintInterval = null;
    }
    hintEl.style.display = 'none';
  }

  startHintCycle();

  // ─── Command dispatch ───

  // Split "ls -l races" into a command name (aliases resolved) and its argument string
  function splitCommand(stage) {
    const text = stage.trim();
    const word = text.split(/\s+/)[0];
    const lower = word.toLowerCase();
    let arg = text.slice(word.length).trim();
    if (Object.hasOwn(ALIAS_ARGS, lower)) arg = `${ALIAS_ARGS[lower]} ${arg}`.trim();
    const name = Object.hasOwn(ALIASES, lower) ? ALIASES[lower] : lower;
    return { name, arg, text };
  }

  function runHandler(name, text, arg, ctx) {
    const handler = Object.hasOwn(handlers, name) ? handlers[name] : null;
    if (handler) {
      handler(text, arg);
      return;
    }
    const guess = suggest(name, commandNames);
    out.addLine('$', text, `command not found: ${name}.${guess ? ` did you mean ${guess}?` : " try 'help'"}`, true);
    ctx.notFound = true;
  }

  // Run one pipeline; returns its exit status (0 ok, 1 error, 127 not found)
  function runPipeline(stages, ctx) {
    ctx.failed = false;
    ctx.notFound = false;
    sh.lastFailed = false;
    let stdin = null;

    for (let i = 0; i < stages.length; i++) {
      const isLast = i === stages.length - 1;
      const { name, arg, text } = splitCommand(expandVars(stages[i], sh.env));
      const words = arg ? arg.split(/\s+/) : [];

      // A filter reading the previous command's output
      if (stdin !== null && (Object.hasOwn(FILTERS, name) || (name === 'cat' && !arg))) {
        const result = name === 'cat' ? { lines: stdin } : FILTERS[name](stdin, words);
        if (result.error) {
          withCurrent(runner(ctx), () => out.addLine('$', text, `${name}: ${result.error}`, true));
          return 1;
        }
        if (isLast) {
          withCurrent(runner(ctx), () => out.addLine('$', text, result.lines.length ? result.lines.join('\n') : null));
          return result.failed ? 1 : 0;
        }
        stdin = result.lines;
        continue;
      }

      if (!isLast) {
        if (NETWORK_COMMANDS.has(name)) {
          withCurrent(runner(ctx), () => out.addLine('$', text, `${name}: its output arrives over the network and can't be piped`, true));
          return 1;
        }
        const cap = capture(ctx);
        withCurrent(cap, () => runHandler(name, text, arg, ctx));
        if (ctx.notFound) return 127;
        stdin = cap.lines;
        continue;
      }

      // Last stage, a regular command (it ignores any piped input, like echo does)
      withCurrent(runner(ctx), () => runHandler(name, text, arg, ctx));
    }
    if (ctx.notFound) return 127;
    return ctx.failed || sh.lastFailed ? 1 : 0;
  }

  function processCommand(rawInput) {
    const typed = rawInput.trim();
    if (!typed) return;
    const prompt = promptText();

    // !! / !n / !prefix, before anything else (like bash)
    const expansion = expandHistory(typed, cmdHistory.getAll());
    if (expansion.error) {
      cmdHistory.push(typed);
      base.addLine(prompt, typed, expansion.error, true);
      sh.env['?'] = '1';
      return;
    }
    const line = expansion.line;
    cmdHistory.push(line);

    // the echoed line is what actually ran
    const ctx = { prompt, line, echoed: false };
    const sequence = parseLine(line);
    const bad = syntaxError(sequence);
    if (bad) {
      base.addLine(prompt, line, bad, true);
      sh.env['?'] = '2';
      return;
    }

    let status = 0;
    sequence.forEach((pipeline, i) => {
      if (i > 0 && pipeline.op === '&&' && status !== 0) return;
      if (i > 0 && pipeline.op === '||' && status === 0) return;
      status = runPipeline(pipeline.stages, ctx);
      // $? is updated after every pipeline, so "nope; echo $?" prints 127
      sh.env['?'] = String(status);
    });

    // cd, export… print nothing, but the line still shows on screen
    if (!ctx.echoed) base.addLine(prompt, line, null);
    updatePrompt();
  }

  // ─── Input line: prompt, caret, Ctrl+R search ───

  let search = null; // { query, index, original } while in Ctrl+R mode

  function updatePrompt() {
    if (!promptEl) return;
    promptEl.textContent = search
      ? `(reverse-i-search)\`${search.query}': `
      : `${promptText()} `;
  }

  // Draw the typed text with the caret where the input's cursor really is
  function render() {
    if (search) {
      const match = search.index >= 0 ? cmdHistory.get(search.index) : '';
      typedEl.textContent = match;
      if (typedAfterEl) typedAfterEl.textContent = '';
      return;
    }
    const value = inputEl.value;
    const caret = typedAfterEl ? (inputEl.selectionStart ?? value.length) : value.length;
    typedEl.textContent = value.slice(0, caret);
    if (typedAfterEl) typedAfterEl.textContent = value.slice(caret);
  }

  function setInput(value, caret = value.length) {
    inputEl.value = value;
    inputEl.setSelectionRange(caret, caret);
    render();
  }

  function startSearch() {
    search = { query: '', index: -1, original: inputEl.value };
    inputEl.value = '';
    stopHintCycle();
    updatePrompt();
    render();
  }

  function endSearch(accept) {
    if (!search) return;
    const match = search.index >= 0 ? cmdHistory.get(search.index) : null;
    const value = accept && match ? match : search.original;
    search = null;
    updatePrompt();
    setInput(value);
  }

  // Ctrl+C: abandon the line (and stop anything running), like a real terminal
  function interrupt() {
    const typed = search ? '' : inputEl.value;
    search = null;
    base.cancelPending();
    if (isMatrixActive()) stopMatrix();
    base.addLine(promptText(), `${typed}^C`, null);
    setInput('');
    updatePrompt();
    startHintCycle();
    sh.env['?'] = '130';
  }

  // Tab: complete; a second Tab with nothing new to add lists the options
  let lastTab = null;
  function complete() {
    const result = tabComplete(inputEl.value, { cwd: sh.cwd, commands: commandNames });
    if (!result) return false;
    if (result.value !== inputEl.value) {
      setInput(result.value);
      lastTab = null;
      return true;
    }
    if (result.candidates.length > 1) {
      if (lastTab === inputEl.value) {
        base.addLine(promptText(), inputEl.value, result.candidates.join('  '));
        lastTab = null;
      } else {
        lastTab = inputEl.value;
      }
    }
    return true;
  }

  // ─── Event wiring ───

  terminalEl.addEventListener('click', () => inputEl.focus());

  inputEl.addEventListener('input', () => {
    if (search) {
      search.query = inputEl.value;
      search.index = cmdHistory.search(search.query);
      updatePrompt();
      render();
      return;
    }
    render();
    if (inputEl.value) stopHintCycle();
    else startHintCycle();
  });

  // Keep the drawn caret in step with clicks and arrow keys
  ['keyup', 'click', 'select'].forEach((type) => inputEl.addEventListener(type, () => { if (!search) render(); }));
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === inputEl && !search) render();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') lastTab = null;
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    const key = e.key.toLowerCase();

    // While searching history (Ctrl+R)
    if (search) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const match = search.index >= 0 ? cmdHistory.get(search.index) : '';
        search = null;
        updatePrompt();
        setInput('');
        if (match) processCommand(match);
        startHintCycle();
      } else if (ctrl && key === 'r') {
        e.preventDefault();
        const next = cmdHistory.search(search.query, search.index);
        if (next >= 0) search.index = next;
        render();
      } else if (e.key === 'Escape' || (ctrl && key === 'g')) {
        e.preventDefault();
        endSearch(false);
      } else if (ctrl && key === 'c') {
        e.preventDefault();
        interrupt();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key) || (ctrl && (key === 'a' || key === 'e'))) {
        e.preventDefault();
        endSearch(true);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const value = inputEl.value;
      setInput('');
      processCommand(value);
      startHintCycle();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const val = cmdHistory.up(inputEl.value);
      if (val !== null) {
        setInput(val);
        stopHintCycle();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const val = cmdHistory.down();
      if (val !== null) {
        setInput(val);
        if (!val) startHintCycle(); else stopHintCycle();
      }
    } else if (e.key === 'Tab') {
      if (complete()) e.preventDefault();
    } else if (ctrl && key === 'l') {
      e.preventDefault();
      base.clear();
    } else if (ctrl && key === 'c') {
      // with text selected, Ctrl+C is copy; otherwise it's interrupt
      if (inputEl.selectionStart !== inputEl.selectionEnd) return;
      e.preventDefault();
      interrupt();
    } else if (ctrl && key === 'r') {
      e.preventDefault();
      startSearch();
    } else if (ctrl && key === 'a') {
      e.preventDefault();
      setInput(inputEl.value, 0);
    } else if (ctrl && key === 'e') {
      e.preventDefault();
      setInput(inputEl.value);
    } else if (ctrl && key === 'u') {
      // delete everything before the cursor
      e.preventDefault();
      const caret = inputEl.selectionStart;
      setInput(inputEl.value.slice(caret), 0);
    } else if (ctrl && key === 'k') {
      // delete everything after the cursor
      e.preventDefault();
      const caret = inputEl.selectionStart;
      setInput(inputEl.value.slice(0, caret), caret);
    } else if (ctrl && key === 'w') {
      // delete the word before the cursor
      e.preventDefault();
      const caret = inputEl.selectionStart;
      const before = inputEl.value.slice(0, caret).replace(/\S+\s*$/, '');
      setInput(before + inputEl.value.slice(caret), before.length);
    } else if (ctrl && key === 'd' && !inputEl.value) {
      e.preventDefault();
      base.addLine(promptText(), 'logout', 'there is no escape. you live here now. 🏠');
    }
  });

  updatePrompt();
  render();
}
