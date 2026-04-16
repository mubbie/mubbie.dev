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

// Races — render from races.json
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
