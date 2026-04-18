// ─── Page sections: greeting, footer, scroll reveal, data rendering ───

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${MONTHS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

// ─── Randomized greetings (4 per time of day) ───

const GREETINGS = {
  morning: [
    'Good morning',
    'Rise and shine',
    'Top of the morning',
    'Morning',
  ],
  afternoon: [
    'Good afternoon',
    'Hey there',
    'What\'s good',
    'Afternoon',
  ],
  evening: [
    'Good evening',
    'Evening',
    'What\'s poppin\'',
    'Twilight greetings',
  ],
};

// ─── Greeting ───

function initGreeting() {
  const el = document.getElementById('greeting-text');
  if (!el) return;

  const hour = new Date().getHours();
  let period;
  if (hour < 12) period = 'morning';
  else if (hour < 18) period = 'afternoon';
  else period = 'evening';

  const options = GREETINGS[period];
  el.textContent = options[Math.floor(Math.random() * options.length)];
}

// ─── Wave emoji interaction ───

function initWaveEmoji() {
  const wave = document.querySelector('.wave');
  if (!wave) return;

  const hands = ['👋🏾', '💪🏾', '✌🏾', '🤟🏾', '🤙🏾'];
  let index = 0;

  wave.style.cursor = 'pointer';
  wave.addEventListener('click', (e) => {
    e.preventDefault();
    index = (index + 1) % hands.length;
    wave.textContent = hands[index];
    // Restart the wave animation
    wave.style.animation = 'none';
    wave.offsetHeight; // force reflow
    wave.style.animation = '';
  });
}

// ─── Footer year ───

function initFooter() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

// ─── Scroll reveal ───

function initScrollReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    },
    { threshold: 0.1 }
  );
  reveals.forEach((el) => observer.observe(el));
}

// ─── Back to top button ───

function initBackToTop() {
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.textContent = '↑';
  document.body.appendChild(btn);

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }, { passive: true });
}

// ─── Keyboard shortcut hint ───

function initShortcutHint() {
  if (localStorage.getItem('mubbie-hint-dismissed')) return;

  const hint = document.createElement('div');
  hint.className = 'shortcut-hint';
  hint.innerHTML = 'press <kbd>/</kbd> to start typing';

  const terminal = document.getElementById('terminal');
  if (!terminal) return;
  terminal.appendChild(hint);

  setTimeout(() => hint.classList.add('visible'), 1500);

  function dismiss() {
    hint.classList.remove('visible');
    localStorage.setItem('mubbie-hint-dismissed', '1');
    setTimeout(() => hint.remove(), 300);
  }

  hint.addEventListener('click', dismiss);
  document.getElementById('terminal-input')?.addEventListener('focus', dismiss);
}

// ─── Currently ───

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

// ─── Races ───

function renderRaces(races) {
  const list = document.getElementById('races-list');
  const stats = document.getElementById('race-stats');
  const today = new Date().toISOString().slice(0, 10);

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

    if (race.goal) a.classList.add('highlight');

    a.innerHTML =
      `<span class="race-status">${statusIcon}</span>` +
      `<span class="race-date">${formatDate(race.date)}</span>` +
      `<span class="race-name">${race.name}</span>` +
      `<span class="race-location">${race.location}</span>` +
      (i === nextIndex ? '<span class="race-badge">next</span>' : '') +
      (race.goal ? '<span class="race-badge goal">first marathon</span>' : '');

    a.dataset.raceIndex = i;
    list.appendChild(a);
  });

  // Block progress + stats
  const total = races.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  let blocksHtml = '<div class="race-blocks">[ ';
  races.forEach((race, idx) => {
    const filled = race.completed === true;
    blocksHtml += `<span class="race-block${filled ? ' filled' : ''}" data-race-index="${idx}"></span>`;
  });
  blocksHtml += ' ]</div>';

  const summaryHtml =
    `<div class="race-summary">${completedCount}/${total} done · ${pct}%</div>`;

  stats.innerHTML = blocksHtml + summaryHtml;

  // Animate blocks filling in on scroll
  const blocks = stats.querySelectorAll('.race-block.filled');
  if (blocks.length > 0) {
    blocks.forEach((b) => b.classList.remove('filled'));
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          races.forEach((race, i) => {
            if (race.completed === true) {
              const block = stats.querySelectorAll('.race-block')[i];
              setTimeout(() => block.classList.add('filled'), i * 120);
            }
          });
          obs.disconnect();
        }
      });
    }, { threshold: 0.5 });
    obs.observe(stats);
  }

  // Cross-highlight: hover block ↔ race row
  function highlightPair(index, on) {
    const block = stats.querySelector(`.race-block[data-race-index="${index}"]`);
    const row = list.querySelector(`.race-item[data-race-index="${index}"]`);
    if (block) block.classList.toggle('highlight', on);
    if (row) row.classList.toggle('highlight-row', on);
  }

  stats.addEventListener('mouseover', (e) => {
    const block = e.target.closest('.race-block');
    if (block) highlightPair(block.dataset.raceIndex, true);
  });
  stats.addEventListener('mouseout', (e) => {
    const block = e.target.closest('.race-block');
    if (block) highlightPair(block.dataset.raceIndex, false);
  });
  list.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.race-item');
    if (row) highlightPair(row.dataset.raceIndex, true);
  });
  list.addEventListener('mouseout', (e) => {
    const row = e.target.closest('.race-item');
    if (row) highlightPair(row.dataset.raceIndex, false);
  });
}

// ─── Bucket List ───

function renderBucketList(items) {
  const list = document.getElementById('bucket-list');
  const stats = document.getElementById('bucket-stats');
  if (!list || !stats) return;

  let doneCount = 0;

  const sorted = [...items].sort((a, b) => (a.done === b.done ? 0 : a.done ? -1 : 1));

  sorted.forEach((item) => {
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
  const someday = Math.round(remaining * 2 / 3);
  const mystery = remaining - someday;

  stats.innerHTML =
    `<span>${doneCount} done · ${someday} someday · ${mystery} ???</span>`;
}

// ─── Footer meta (weather + clock) ───

function initFooterMeta() {
  const el = document.getElementById('footer-meta');
  if (!el) return;

  let weatherText = '';

  function render() {
    const time = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    el.textContent = weatherText
      ? `${weatherText} · ${time}`
      : time;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  fetch('https://wttr.in/Seattle?format=%c+%t+%l', {
    headers: { 'Accept': 'text/plain' },
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) return null;
      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('text/plain')) return null;
      return res.text();
    })
    .then((raw) => {
      if (!raw) return;
      const text = raw.trim();
      // Belt-and-suspenders: bail if body still looks like HTML
      if (!text || text.startsWith('<')) return;
      const match = text.match(/([+-]?\d+)°F/);
      if (match) {
        const f = parseInt(match[1], 10);
        const c = Math.round((f - 32) * 5 / 9);
        weatherText = text.replace(/[+-]?\d+°F/, `${f}°F / ${c}°C`);
      } else {
        weatherText = text;
      }
      render();
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeoutId));

  render();
  setInterval(render, 1000);
}

// ─── Init ───

export function initSections() {
  initGreeting();
  initWaveEmoji();
  initFooter();
  initFooterMeta();
  initScrollReveal();
  initBackToTop();
  initShortcutHint();

  fetch('data/currently.json')
    .then((res) => res.json())
    .then(renderCurrently)
    .catch((err) => console.error('Failed to load currently:', err));

  fetch('data/races.json')
    .then((res) => res.json())
    .then(renderRaces);

  fetch('data/bucketlist.json')
    .then((res) => res.json())
    .then(renderBucketList)
    .catch((err) => console.error('Failed to load bucket list:', err));
}
