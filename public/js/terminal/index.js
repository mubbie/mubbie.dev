// ─── Terminal: init, command processing, event wiring ───

import {
  FILESYSTEM, FILES, SECTION_MAP, HELP_ITEMS, OPENABLES, ALIASES,
  EIGHT_BALL_RESPONSES, NEOFETCH_LINES, MAN_PAGES, COMMAND_DEFS, HINTS,
} from './commands.js';
import { createHistory } from './history.js';
import { createOutput } from './output.js';
import { tabComplete } from './completer.js';
import { applyTheme, toggleTheme } from '../theme.js';
import { startMatrix } from '../matrix.js';
import { scrollToTop, scrollToEl } from '../scroll.js';
import { fetchWeather } from '../weather.js';
import { popPopcorn } from '../popcorn.js';

const PAGE_LOAD_TIME = Date.now();

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

function createHandlers(out, history, getFortunes) {

  return {
    help(trimmed) {
      out.addLine('$', trimmed, null);
      out.addHelpTable(HELP_ITEMS);
    },

    whoami(trimmed) {
      out.addLine('$', trimmed, 'mubbie idoko');
    },

    ls(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'ls', arg);
      if (target === null) return;
      const lower = target.toLowerCase();
      if (!lower || lower === '~' || lower === '.') {
        out.addLine('$', trimmed, FILESYSTEM['~'].join('  '));
      } else if (lower === '/dev' || lower === '/dev/') {
        out.addLine('$', trimmed, FILESYSTEM['/dev'].join('  '));
      } else {
        out.addLine('$', trimmed, `ls: ${target}: No such file or directory`, true);
      }
    },

    cd(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'cd', arg);
      if (target === null) return;
      const lower = target.toLowerCase();
      if (!target || target === '~') {
        out.addLine('$', trimmed, null);
        scrollToTop();
      } else if (lower === '/dev' || lower === '/dev/' || lower === 'dev') {
        out.addLine('$', trimmed, 'you found the secret directory. try: ls /dev');
      } else {
        const section = SECTION_MAP[lower.replace(/\/$/, '')];
        if (section) {
          out.addLine('$', trimmed, null);
          out.addOk(`→ /${lower.replace(/\/$/, '')}`);
          scrollToEl(document.getElementById(section));
        } else {
          out.addLine('$', trimmed, `cd: ${target || arg}: No such directory`, true);
        }
      }
    },

    cat(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'cat', arg);
      if (target === null) return;
      const lower = target.toLowerCase();
      if (!target) {
        out.addLine('$', trimmed, 'usage: cat <file> — try: ls /dev', true);
      } else if (FILES[lower] || FILES[target]) {
        out.addLine('$', trimmed, FILES[lower] || FILES[target]);
      } else {
        out.addLine('$', trimmed, `cat: ${target}: No such file or directory`, true);
      }
    },

    open(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'open', arg);
      if (target === null) return;
      const lower = target.toLowerCase();
      if (!target) {
        out.addLine('$', trimmed, 'usage: open <project|link> — try: open gx, open latest', true);
        return;
      }

      // Handle "latest", "substack latest", "notebook latest"
      if (lower === 'latest' || lower === 'substack latest' || lower === 'notebook latest') {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, 'fetching latest post...');
        fetch('https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://notebook.mubbie.dev/api/v1/posts?limit=1'))
          .then((r) => r.json())
          .then((posts) => {
            if (!posts || !posts.length) throw new Error();
            const post = posts[0];
            const link = post.canonical_url || `https://notebook.mubbie.dev/p/${post.slug}`;
            window.open(link, '_blank');
            out.addOk(`→ opening "${post.title}"`);
          })
          .catch(() => out.addLine(null, null, 'could not fetch latest post.', true));
        return;
      }

      const exact = OPENABLES.find((x) => x.name.toLowerCase() === lower);
      const matches = exact ? [exact] : OPENABLES.filter((x) => x.name.toLowerCase().includes(lower));
      if (matches.length === 1) {
        window.open(matches[0].href, '_blank');
        out.addLine('$', trimmed, null);
        out.addOk(`→ opening ${matches[0].name}`);
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
        localStorage.setItem('mubbie-theme-explicit', lower);
        applyTheme(lower);
        out.addLine('$', trimmed, null);
        out.addOk(`theme: ${lower}`);
      } else if (!target) {
        const next = toggleTheme();
        out.addLine('$', trimmed, null);
        out.addOk(`theme → ${next}`);
      } else {
        out.addLine('$', trimmed, `theme: unknown value '${target}'. use: dark, light`, true);
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
      out.addLine('$', trimmed, '~/mubbie');
    },

    date(trimmed) {
      out.addLine('$', trimmed, new Date().toString());
    },

    random(trimmed) {
      const f = getFortunes();
      out.addLine('$', trimmed, f[Math.floor(Math.random() * f.length)]);
    },

    echo(trimmed, arg) {
      out.addLine('$', trimmed, arg || '');
    },

    sudo(trimmed, arg) {
      const lower = arg.toLowerCase();
      if (lower === 'hire-me' || lower === 'hire me') {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, '[sudo] password for recruiter: ••••••••');
        out.addOk('authenticated. email queued → midoko.dev@gmail.com');
        out.addLine(null, null, 'just kidding — drop a note at midoko.dev@gmail.com 👋🏾');
      } else if (lower.startsWith('rm') && lower.includes('-r') && lower.includes('-f') || lower.includes('-rf')) {
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
          setTimeout(() => out.addLine(null, null, t.text), t.delay);
        });
        setTimeout(() => {
          out.addOk('just kidding. nice try though. 🛡️');
        }, 4200);
      } else {
        out.addLine('$', trimmed, 'nice try 😏', true);
      }
    },

    matrix(trimmed) {
      out.addLine('$', trimmed, null);
      out.addOk('wake up, neo... (esc or tap to exit)');
      setTimeout(() => startMatrix(), 400);
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
        setTimeout(() => {
          if (step.text === '') {
            out.addOk('☕ freshly brewed. enjoy!');
          } else {
            out.addLine(null, null, step.text);
          }
        }, step.delay);
      });
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
      window.open('https://github.com/mubbie/mubbie.dev', '_blank');
      out.addLine('$', trimmed, null);
      out.addOk('→ opening mubbie/mubbie.dev');
    },

    rm(trimmed) {
      out.addLine('$', trimmed, 'rm: permission denied. try sudo?', true);
    },

    grep(trimmed, arg) {
      if (!arg.trim()) {
        out.addLine('$', trimmed, 'usage: grep <term>', true);
        return;
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
          ? `${name} — ${desc}` : null;
      });

      // Writing: titles
      searchSection('writing/', '.writing-item', (el) => {
        const title = el.querySelector('h3')?.textContent || '';
        return title.toLowerCase().includes(term) ? title : null;
      });

      // Races: name + location
      searchSection('races/', '.race-item', (el) => {
        const name = el.querySelector('.race-name')?.textContent || '';
        const loc = el.querySelector('.race-location')?.textContent || '';
        const date = el.querySelector('.race-date')?.textContent || '';
        return (name + loc).toLowerCase().includes(term)
          ? `${name} — ${loc}, ${date}` : null;
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
        setTimeout(() => {
          if (step.text === '') {
            out.addOk(`access granted. welcome back. you're already here. 🏠`);
          } else {
            out.addLine(null, null, step.text);
          }
        }, step.delay);
      });
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

    popcorn(trimmed) {
      out.addLine('$', trimmed, null);
      out.addOk("what's poppin'! 🍿");
      popPopcorn(document.getElementById('terminal'));
    },

    neofetch(trimmed) {
      out.addLine('$', trimmed, null);
      NEOFETCH_LINES.forEach((line) => out.addLine(null, null, line));
    },

    history(trimmed) {
      const all = history.getAll();
      if (all.length === 0) {
        out.addLine('$', trimmed, 'no commands in history yet');
      } else {
        out.addLine('$', trimmed, null);
        all.slice(0, 20).forEach((h, i) => {
          out.addLine(null, null, `  ${i + 1}  ${h}`);
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
      const resolved = ALIASES[target.toLowerCase()] || target.toLowerCase();
      const page = MAN_PAGES[resolved];
      if (!page) {
        out.addLine('$', trimmed, `no manual entry for '${target}'`, true);
        return;
      }
      const def = COMMAND_DEFS.find((c) => c.name === resolved);
      out.addLine('$', trimmed, null);
      out.addLine(null, null, `NAME\n    ${resolved} — ${def?.help || ''}`);
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

        const proxyUrl = (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
        const latestUrl = proxyUrl('https://xkcd.com/info.0.json');

        const fetchComic = isRandom
          ? fetch(latestUrl).then((r) => r.json()).then((data) => {
              const num = Math.floor(Math.random() * data.num) + 1;
              return fetch(proxyUrl(`https://xkcd.com/${num}/info.0.json`)).then((r) => r.json());
            })
          : fetch(latestUrl).then((r) => r.json());

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
}

// ─── Init ───

export function initTerminal() {
  const terminalEl = document.getElementById('terminal');
  const historyEl = document.getElementById('terminal-history');
  const typedEl = document.getElementById('terminal-typed');
  const inputEl = document.getElementById('terminal-input');

  if (!terminalEl || !inputEl) return;

  const out = createOutput(historyEl);
  const cmdHistory = createHistory();

  let fortunes = [
    'the best time to start was yesterday. the second best time is now.',
    'fortune favors the bold.',
    'have you tried turning it off and on again?',
  ];
  fetch('data/fortunes.json')
    .then((res) => res.json())
    .then((data) => { fortunes = data; })
    .catch(() => {});

  const handlers = createHandlers(out, cmdHistory, () => fortunes);

  // quit is an alias for exit at the handler level
  handlers.quit = handlers.exit;

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

  function processCommand(rawInput) {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    cmdHistory.push(trimmed);

    const parts = trimmed.split(/\s+/);
    let cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    // Resolve aliases
    if (ALIASES[cmd]) cmd = ALIASES[cmd];

    const handler = handlers[cmd];
    if (handler) {
      handler(trimmed, arg);
    } else {
      out.addLine('$', trimmed, `command not found: ${cmd}. try 'help'`, true);
    }
  }

  // ─── Event wiring ───

  function setInput(value) {
    inputEl.value = value;
    typedEl.textContent = value;
  }

  terminalEl.addEventListener('click', () => inputEl.focus());

  inputEl.addEventListener('input', () => {
    typedEl.textContent = inputEl.value;
    if (inputEl.value) {
      stopHintCycle();
    } else {
      startHintCycle();
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processCommand(inputEl.value);
      setInput('');
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
      const result = tabComplete(inputEl.value);
      if (result) {
        e.preventDefault();
        setInput(result);
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      out.clear();
    }
  });
}
