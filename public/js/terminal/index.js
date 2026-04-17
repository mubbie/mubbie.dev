// ─── Terminal: init, command processing, event wiring ───

import { FILESYSTEM, FILES, SECTION_MAP, HELP_ITEMS, OPENABLES, ALIASES, EIGHT_BALL_RESPONSES } from './commands.js';
import { createHistory } from './history.js';
import { createOutput } from './output.js';
import { tabComplete } from './completer.js';
import { applyTheme, getTheme } from '../theme.js';
import { startMatrix } from '../matrix.js';

export function initTerminal() {
  const terminalEl = document.getElementById('terminal');
  const historyEl = document.getElementById('terminal-history');
  const typedEl = document.getElementById('terminal-typed');
  const inputEl = document.getElementById('terminal-input');

  if (!terminalEl || !inputEl) return;

  const out = createOutput(historyEl);
  const history = createHistory();

  let fortunes = [];
  fetch('data/fortunes.json')
    .then((res) => res.json())
    .then((data) => { fortunes = data; })
    .catch(() => { fortunes = ['no fortunes loaded. try again later.']; });

  function processCommand(rawInput) {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    history.push(trimmed);

    const parts = trimmed.split(/\s+/);
    let cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');
    const argLower = arg.toLowerCase();

    // Resolve aliases
    if (ALIASES[cmd]) cmd = ALIASES[cmd];

    switch (cmd) {
      case '':
        break;

      case 'help':
      case '?':
        out.addLine('$', trimmed, null);
        out.addHelpTable(HELP_ITEMS);
        break;

      case 'whoami':
        out.addLine('$', trimmed, 'mubbie idoko');
        break;

      case 'ls':
        if (!arg || arg === '~' || arg === '.') {
          out.addLine('$', trimmed, FILESYSTEM['~'].join('  '));
        } else if (argLower === '/dev' || argLower === '/dev/') {
          out.addLine('$', trimmed, FILESYSTEM['/dev'].join('  '));
        } else {
          out.addLine('$', trimmed, `ls: ${arg}: No such file or directory`, true);
        }
        break;

      case 'cd':
        if (!arg || arg === '~') {
          out.addLine('$', trimmed, null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (argLower === '/dev' || argLower === '/dev/' || argLower === 'dev') {
          out.addLine('$', trimmed, 'you found the secret directory. try: ls /dev');
        } else {
          const section = SECTION_MAP[argLower.replace(/\/$/, '')];
          if (section) {
            out.addLine('$', trimmed, null);
            out.addOk(`→ /${argLower.replace(/\/$/, '')}`);
            document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
          } else {
            out.addLine('$', trimmed, `cd: ${arg}: No such directory`, true);
          }
        }
        break;

      case 'cat':
        if (!arg) {
          out.addLine('$', trimmed, 'usage: cat &lt;file&gt; — try: ls /dev', true);
        } else if (FILES[argLower] || FILES[arg]) {
          out.addLine('$', trimmed, FILES[argLower] || FILES[arg]);
        } else {
          out.addLine('$', trimmed, `cat: ${arg}: No such file or directory`, true);
        }
        break;

      case 'open': {
        if (!arg) {
          out.addLine('$', trimmed, 'usage: open &lt;project|post&gt; — try: open gx', true);
          break;
        }
        const match = OPENABLES.find((x) => x.name.toLowerCase().includes(argLower));
        if (match) {
          out.addLine('$', trimmed, null);
          out.addOk(`→ opening ${match.name}`);
          setTimeout(() => window.open(match.href, '_blank'), 200);
        } else {
          out.addLine('$', trimmed, `open: '${arg}' not found. try: open gx, open lena, open substack`, true);
        }
        break;
      }

      case 'theme': {
        const current = getTheme();
        if (argLower === 'dark' || argLower === 'light') {
          applyTheme(argLower);
          out.addLine('$', trimmed, null);
          out.addOk(`theme: ${argLower}`);
        } else {
          const next = current === 'dark' ? 'light' : 'dark';
          applyTheme(next);
          out.addLine('$', trimmed, null);
          out.addOk(`theme → ${next}`);
        }
        break;
      }

      case 'weather':
        out.addLine('$', trimmed, null);
        out.addLine(null, null, 'fetching seattle weather...');
        fetch('https://wttr.in/Seattle?format=%c+%t+%w+%h+humidity')
          .then((res) => res.text())
          .then((raw) => {
            const text = raw.trim();
            const match = text.match(/([+-]?\d+)°F/);
            if (match) {
              const f = parseInt(match[1], 10);
              const c = Math.round((f - 32) * 5 / 9);
              const dual = text.replace(/[+-]?\d+°F/, `${f}°F / ${c}°C`);
              out.addOk(`seattle: ${dual}`);
            } else {
              out.addOk(`seattle: ${text}`);
            }
          })
          .catch(() => {
            out.addLine(null, null, 'could not fetch weather. try again later.', true);
          });
        break;

      case 'clear':
        out.clear();
        break;

      case 'pwd':
        out.addLine('$', trimmed, '~/mubbie');
        break;

      case 'date':
        out.addLine('$', trimmed, new Date().toString());
        break;

      case 'random':
        out.addLine('$', trimmed, fortunes[Math.floor(Math.random() * fortunes.length)]);
        break;

      case 'echo':
        out.addLine('$', trimmed, arg || '');
        break;

      case 'sudo':
        if (argLower === 'hire-me' || argLower === 'hire me') {
          out.addLine('$', trimmed, null);
          out.addLine(null, null, '[sudo] password for recruiter: ••••••••');
          out.addOk('authenticated. email queued → midoko.dev@gmail.com');
          out.addLine(null, null, 'just kidding — drop a note at midoko.dev@gmail.com 👋🏾');
        } else {
          out.addLine('$', trimmed, 'nice try 😏', true);
        }
        break;

      case 'matrix':
        out.addLine('$', trimmed, null);
        out.addOk('wake up, neo... (esc or tap to exit)');
        setTimeout(() => startMatrix(), 400);
        break;

      case 'coffee': {
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
        break;
      }

      case 'flip':
        out.addLine('$', trimmed, Math.random() < 0.5 ? '🪙 heads!' : '🪙 tails!');
        break;

      case '8ball':
        if (!arg) {
          out.addLine('$', trimmed, 'ask me a question. e.g. 8ball will I ship this feature?', true);
        } else {
          out.addLine('$', trimmed, `🎱 ${EIGHT_BALL_RESPONSES[Math.floor(Math.random() * EIGHT_BALL_RESPONSES.length)]}`);
        }
        break;

      case 'repo':
        out.addLine('$', trimmed, null);
        out.addOk('→ opening mubbie/mubbie.dev');
        setTimeout(() => window.open('https://github.com/mubbie/mubbie.dev', '_blank'), 200);
        break;

      case 'rm':
        if (arg.includes('-rf')) {
          out.addLine('$', trimmed, "nice try. this isn't that kind of website. 🛡️", true);
        } else {
          out.addLine('$', trimmed, 'rm: refuses to disappoint', true);
        }
        break;

      case 'exit':
      case 'quit':
        out.addLine('$', trimmed, null);
        out.addLine(null, null, 'there is no escape. you live here now. 🏠');
        break;

      case 'claude':
        out.addLine('$', trimmed, 'I helped build this site, you\'re welcome 😎');
        break;

      case 'ping':
        out.addLine('$', trimmed, 'pong! 🏓');
        break;

      case 'neofetch':
        out.addLine('$', trimmed, null);
        out.addLine(null, null, '🖥️ mubbie.dev');
        out.addLine(null, null, '├── os: human 1.0');
        out.addLine(null, null, '├── shell: caffeine-powered');
        out.addLine(null, null, '├── uptime: since \'98');
        out.addLine(null, null, '├── location: seattle, wa');
        out.addLine(null, null, '├── role: software engineer @ microsoft');
        out.addLine(null, null, '└── status: building cool things');
        break;

      case 'history': {
        const all = history.getAll();
        if (all.length === 0) {
          out.addLine('$', trimmed, 'no commands in history yet');
        } else {
          out.addLine('$', trimmed, null);
          all.slice(0, 20).forEach((h, i) => {
            out.addLine(null, null, `  ${i + 1}  ${h}`);
          });
        }
        break;
      }

      default:
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
      const val = history.up(inputEl.value);
      if (val !== null) setInput(val);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const val = history.down();
      if (val !== null) setInput(val);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const result = tabComplete(inputEl.value);
      if (result) setInput(result);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      out.clear();
    }
  });
}
