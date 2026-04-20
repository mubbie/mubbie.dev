// ─── Page sections: greeting, footer, scroll reveal, data rendering ───

import { scrollToTop } from './scroll.js';
import { fetchWeather } from './weather.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

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

  wave.addEventListener('click', () => {
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
    scrollToTop();
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
      el.rel = 'noopener noreferrer';
    }

    el.appendChild(span('currently-icon', item.icon));
    el.appendChild(span('currently-label', item.label));
    el.appendChild(span('currently-value', item.value));
    if (item.url) el.appendChild(span('arrow', '→'));

    list.appendChild(el);
  });
}

// ─── Races ───

function renderRaces(races) {
  const list = document.getElementById('races-list');
  const stats = document.getElementById('race-stats');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

  const nextIndex = races.findIndex((r) => r.completed === undefined && r.date >= today);
  let completedCount = 0;

  races.forEach((race, i) => {
    const a = document.createElement('a');
    a.className = 'race-item';
    a.href = race.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

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

    a.appendChild(span('race-status', statusIcon));
    a.appendChild(span('race-date', formatDate(race.date)));
    a.appendChild(span('race-name', race.name));
    a.appendChild(span('race-location', race.location));
    if (i === nextIndex) a.appendChild(span('race-badge', 'next'));
    if (race.goal) a.appendChild(span('race-badge goal', 'first marathon'));

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

    el.appendChild(span('bucket-status', status));
    el.appendChild(span('bucket-text', item.item));
    if (item.note) el.appendChild(span('bucket-note', item.note));

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

  fetchWeather()
    .then((w) => {
      if (!w) return;
      weatherText = `${w.emoji} ${w.f}°F/${w.c}°C`;
      render();
    })
    .catch(() => {});

  render();
  setInterval(render, 1000);
}

// ─── Init ───

function fetchJSON(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) throw new Error(`${url}: unexpected content-type ${type}`);
    return res.json();
  });
}

function showFallback(containerId, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const fallback = document.createElement('div');
  fallback.className = 'section-fallback';
  fallback.textContent = message;
  el.appendChild(fallback);
}

export function initSections() {
  initGreeting();
  initWaveEmoji();
  initFooter();
  initFooterMeta();
  initScrollReveal();
  initBackToTop();
  initShortcutHint();

  fetchJSON('data/currently.json')
    .then(renderCurrently)
    .catch(() => showFallback('currently-list', 'could not load data.'));

  fetchJSON('data/races.json')
    .then(renderRaces)
    .catch(() => showFallback('races-list', 'could not load race data.'));

  fetchJSON('data/bucketlist.json')
    .then(renderBucketList)
    .catch(() => showFallback('bucket-list', 'could not load bucket list.'));
}
