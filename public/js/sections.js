// ─── Page sections: greeting, footer, scroll reveal, data rendering ───

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${MONTHS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

// ─── Greeting ───

function initGreeting() {
  const el = document.getElementById('greeting-text');
  if (!el) return;
  const hour = new Date().getHours();
  if (hour < 12) el.textContent = 'Good morning';
  else if (hour < 18) el.textContent = 'Good afternoon';
  else el.textContent = 'Good evening';
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

    list.appendChild(a);
  });

  const remaining = races.length - completedCount;
  stats.innerHTML =
    `<span>${completedCount} / ${races.length} completed</span>` +
    '<span class="race-stats-divider">·</span>' +
    `<span>${remaining} to go</span>`;
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
  stats.innerHTML =
    `<span>${doneCount} / ${items.length} done</span>` +
    '<span class="bucket-stats-divider">·</span>' +
    `<span>${remaining} to go</span>`;
}

// ─── Init ───

export function initSections() {
  initGreeting();
  initFooter();
  initScrollReveal();

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
