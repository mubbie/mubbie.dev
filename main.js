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

// ─── Easter egg — click the prompt ───

const secrets = [
  { cmd: 'cat secrets.txt', output: 'mass effect is the greatest game ever made' },
  { cmd: 'echo $FUEL', output: 'coffee && late-night coding sessions' },
  { cmd: 'ls ~/goals', output: 'ironman  marathon  pilot-license  startup' },
  { cmd: 'uptime', output: 'building since 2019, no signs of stopping' },
  { cmd: 'cat /dev/mood', output: 'optimistic with a chance of debugging' },
];

let easterEggIndex = 0;
let easterEggTyping = false;

function typeText(element, text, speed) {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      element.textContent += text[i];
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        resolve();
      }
    }, speed);
  });
}

const greeting = document.getElementById('greeting');
const easterEgg = document.getElementById('easter-egg');

if (greeting && easterEgg) {
  greeting.addEventListener('click', async () => {
    if (easterEggTyping) return;
    easterEggTyping = true;

    const secret = secrets[easterEggIndex % secrets.length];
    easterEggIndex++;

    easterEgg.innerHTML = '';

    const line1 = document.createElement('div');
    const prompt = document.createElement('span');
    prompt.className = 'ee-prompt';
    prompt.textContent = '$ ';
    line1.appendChild(prompt);
    const cmdSpan = document.createElement('span');
    line1.appendChild(cmdSpan);
    easterEgg.appendChild(line1);

    await typeText(cmdSpan, secret.cmd, 50);

    const line2 = document.createElement('div');
    line2.className = 'ee-output';
    easterEgg.appendChild(line2);

    await new Promise((r) => setTimeout(r, 300));
    await typeText(line2, secret.output, 30);

    easterEggTyping = false;
  });
}
