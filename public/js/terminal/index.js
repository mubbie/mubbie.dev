// ─── Terminal: init, command processing, event wiring ───

import {
  FILESYSTEM, FILES, SECTION_MAP, HELP_ITEMS, OPENABLES, ALIASES,
  EIGHT_BALL_RESPONSES, NEOFETCH_LINES,
} from './commands.js';
import { createHistory } from './history.js';
import { createOutput } from './output.js';
import { tabComplete } from './completer.js';
import { applyTheme, toggleTheme } from '../theme.js';
import { startMatrix } from '../matrix.js';
import { scrollToTop, scrollToEl } from '../scroll.js';

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
        out.addLine('$', trimmed, 'usage: open <project|post> — try: open gx', true);
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
        out.addLine('$', trimmed, `open: '${target}' not found. try: open gx, open lena, open substack`, true);
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const fail = () => out.addLine(null, null, 'could not fetch weather. try again later.', true);
      fetch('https://wttr.in/Seattle?format=%c+%t+%w+%h+humidity', {
        headers: { 'Accept': 'text/plain' },
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) return null;
          const type = res.headers.get('content-type') || '';
          if (type.includes('html') || type.includes('json')) return null;
          return res.text();
        })
        .then((raw) => {
          if (!raw) { fail(); return; }
          const text = raw.trim();
          if (!text || text.startsWith('<')) { fail(); return; }
          const match = text.match(/([+-]?\d+)°F/);
          if (match) {
            const f = parseInt(match[1], 10);
            const c = Math.round((f - 32) * 5 / 9);
            out.addOk(`seattle: ${text.replace(/[+-]?\d+°F/, `${f}°F / ${c}°C`)}`);
          } else {
            out.addOk(`seattle: ${text}`);
          }
        })
        .catch(fail)
        .finally(() => clearTimeout(timeoutId));
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

    rm(trimmed, arg) {
      const rmFlags = arg.toLowerCase().split(/\s+/).filter((t) => t.startsWith('-')).join('');
      if (rmFlags.includes('r') && rmFlags.includes('f')) {
        out.addLine('$', trimmed, "nice try. this isn't that kind of website. 🛡️", true);
      } else {
        out.addLine('$', trimmed, 'rm: i expected better from you', true);
      }
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
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processCommand(inputEl.value);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const val = cmdHistory.up(inputEl.value);
      if (val !== null) setInput(val);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const val = cmdHistory.down();
      if (val !== null) setInput(val);
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
