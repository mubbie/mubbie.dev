// Scroll reveal — fade in sections as they enter the viewport
const reveals = document.querySelectorAll('.reveal');

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.1 }
);

reveals.forEach((el) => observer.observe(el));

// ─── Currently — render from currently.json ───

function renderCurrently(items) {
  const list = document.getElementById('currently-list');
  if (!list) return;

  items.forEach((item) => {
    const tag = item.url ? 'a' : 'div';
    const el = document.createElement(tag);
    el.className = 'currently-item';

    if (item.url) {
      el.href = item.url;
      el.target = '_blank';
    }

    el.innerHTML =
      `<span class="currently-icon">${item.icon}</span>` +
      `<span class="currently-label">${item.label}</span>` +
      `<span class="currently-value">${item.value}</span>` +
      (item.url ? '<span class="arrow">→</span>' : '');

    list.appendChild(el);
  });
}

fetch('currently.json')
  .then((res) => res.json())
  .then(renderCurrently)
  .catch((err) => console.error('Failed to load currently:', err));

// ─── Races — render from races.json ───
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${MONTHS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

function renderRaces(races) {
  const list = document.getElementById('races-list');
  const stats = document.getElementById('race-stats');
  const today = new Date().toISOString().slice(0, 10);

  // Find the next upcoming race (first race that isn't completed/skipped and date >= today)
  const nextIndex = races.findIndex((r) => r.completed === undefined && r.date >= today);

  let completedCount = 0;

  races.forEach((race, i) => {
    const a = document.createElement('a');
    a.className = 'race-item';
    a.href = race.url;
    a.target = '_blank';

    let statusIcon = '○';

    if (race.completed === true) {
      a.classList.add('completed');
      statusIcon = '✓';
      completedCount++;
    } else if (race.completed === false) {
      a.classList.add('skipped');
      statusIcon = '✗';
    } else if (i === nextIndex) {
      a.classList.add('next');
      statusIcon = '→';
    }

    if (race.goal) {
      a.classList.add('highlight');
    }

    a.innerHTML =
      `<span class="race-status">${statusIcon}</span>` +
      `<span class="race-date">${formatDate(race.date)}</span>` +
      `<span class="race-name">${race.name}</span>` +
      `<span class="race-location">${race.location}</span>` +
      (i === nextIndex ? '<span class="race-badge">next</span>' : '') +
      (race.goal ? '<span class="race-badge goal">first marathon</span>' : '');

    list.appendChild(a);
  });

  const remaining = races.length - completedCount;
  stats.innerHTML =
    `<span>${completedCount} / ${races.length} completed</span>` +
    '<span class="race-stats-divider">·</span>' +
    `<span>${remaining} to go</span>`;
}

fetch('races.json')
  .then((res) => res.json())
  .then(renderRaces);

// ─── Bucket List — render from bucketlist.json ───

function renderBucketList(items) {
  const list = document.getElementById('bucket-list');
  const stats = document.getElementById('bucket-stats');
  if (!list || !stats) return;

  let doneCount = 0;

  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'bucket-item' + (item.done ? ' done' : '');

    if (item.done) doneCount++;

    const status = item.done ? '✓' : '○';
    const note = item.note
      ? `<span class="bucket-note">${item.note}</span>`
      : '';

    el.innerHTML =
      `<span class="bucket-status">${status}</span>` +
      `<span class="bucket-text">${item.item}</span>` +
      note;

    list.appendChild(el);
  });

  const remaining = items.length - doneCount;
  stats.innerHTML =
    `<span>${doneCount} / ${items.length} done</span>` +
    '<span class="bucket-stats-divider">·</span>' +
    `<span>${remaining} to go</span>`;
}

fetch('bucketlist.json')
  .then((res) => res.json())
  .then(renderBucketList)
  .catch((err) => console.error('Failed to load bucket list:', err));

// ─── Interactive terminal ───

const terminal = document.getElementById('terminal');
const terminalHistory = document.getElementById('terminal-history');
const terminalTyped = document.getElementById('terminal-typed');
const terminalInput = document.getElementById('terminal-input');

if (terminal && terminalInput) {
  // File system
  const fs = {
    '~': ['projects/', 'writing/', 'currently/', 'races/', 'bucketlist/', 'connect/'],
    '/dev': ['secrets.txt', 'fuel', 'goals', 'mood', 'about.txt'],
  };

  const files = {
    '/dev/secrets.txt': 'uncharted 4 is the greatest game ever made',
    '/dev/fuel': 'lots of protein, sparkling ice && gym training sessions',
    '/dev/goals': 'ironman  marathon  pilot-license  startup',
    '/dev/mood': 'optimistic with a chance of debugging',
    '/dev/about.txt': 'engineer. builder. writer. based in seattle.',
  };

  const sections = {
    'projects': 'projects',
    'writing': 'writing',
    'currently': 'currently',
    'races': 'races',
    'bucketlist': 'bucketlist',
    'connect': 'connect',
  };

  const helpText = 'commands: help, whoami, pwd, ls, cd, cat, clear';

  function addLine(prompt, cmd, output, isError) {
    const line = document.createElement('div');
    line.className = 'terminal-history-line';

    if (prompt !== null) {
      line.innerHTML = `<span class="terminal-prompt">~/mubbie $&nbsp;</span><span class="terminal-cmd">${cmd}</span>`;
      terminalHistory.appendChild(line);
    }

    if (output != null) {
      const outLine = document.createElement('div');
      outLine.className = 'terminal-history-line';
      outLine.innerHTML = `<span class="${isError ? 'terminal-error' : 'terminal-output'}">${output}</span>`;
      terminalHistory.appendChild(outLine);
    }

    terminalHistory.scrollTop = terminalHistory.scrollHeight;
  }

  function processCommand(input) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0];
    const arg = parts.slice(1).join(' ');

    switch (cmd) {
      case '':
        break;

      case 'help':
        addLine('$', input, helpText);
        break;

      case 'whoami':
        addLine('$', input, 'mubbie idoko');
        break;

      case 'ls':
        if (!arg || arg === '~' || arg === '.') {
          addLine('$', input, fs['~'].join('  '));
        } else if (arg === '/dev' || arg === '/dev/') {
          addLine('$', input, fs['/dev'].join('  '));
        } else {
          addLine('$', input, `ls: ${arg}: No such file or directory`, true);
        }
        break;

      case 'cd':
        if (!arg || arg === '~') {
          addLine('$', input, null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (arg === '/dev' || arg === '/dev/' || arg === 'dev') {
          addLine('$', input, 'you found the secret directory. try: ls /dev');
        } else {
          const section = arg.replace(/\/$/, '');
          if (sections[section]) {
            addLine('$', input, null);
            document.getElementById(sections[section])?.scrollIntoView({ behavior: 'smooth' });
          } else {
            addLine('$', input, `cd: ${arg}: No such directory`, true);
          }
        }
        break;

      case 'cat':
        if (!arg) {
          addLine('$', input, 'usage: cat &lt;file&gt; — try: ls /dev', true);
        } else {
          if (files[arg]) {
            addLine('$', input, files[arg]);
          } else {
            addLine('$', input, `cat: ${arg}: No such file or directory`, true);
          }
        }
        break;

      case 'clear':
        terminalHistory.innerHTML = '';
        break;

      case 'pwd':
        addLine('$', input, '~/mubbie');
        break;

      case 'sudo':
        addLine('$', input, 'nice try 😏', true);
        break;

      default:
        addLine('$', input, `command not found: ${cmd}. try 'help'`, true);
    }
  }

  // Click terminal to focus input
  terminal.addEventListener('click', () => {
    terminalInput.focus();
  });

  // Mirror typed text
  terminalInput.addEventListener('input', () => {
    terminalTyped.textContent = terminalInput.value;
  });

  // Handle Enter
  terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = terminalInput.value;
      processCommand(value);
      terminalInput.value = '';
      terminalTyped.textContent = '';
    }
  });
}
