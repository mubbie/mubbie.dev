// ─── Data section renderers: currently, fav tools dock, races, bucket list, latest post ───

import { span, showFallback } from './dom.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr) {
  const [, month, day] = dateStr.split('-');
  return `${MONTHS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}`;
}

// ─── Currently ───

export function renderCurrently(items) {
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

    // Tile: icon + label on top, the thing itself underneath
    const head = span('currently-head', '');
    head.appendChild(span('currently-icon', item.icon));
    head.appendChild(span('currently-label', item.label));
    el.appendChild(head);
    el.appendChild(span('currently-value', item.value));
    if (item.url) el.appendChild(span('arrow', '↗'));

    list.appendChild(el);
  });
}

// ─── Fav tools dock ───
// Mac-dock style. Easter egg: hovering an icon reveals why it's there (no hint on the page).
// On touch there's no hover, so the first tap selects an app and the second opens it.

export function renderDock(items) {
  const dock = document.getElementById('dock');
  const caption = document.getElementById('dock-caption');
  if (!dock || !caption) return;

  dock.style.setProperty('--dock-count', items.length);
  let lastPointer = 'mouse';
  // Whether the tapped app was already selected when the finger came down. Android
  // fires focus (which selects) before click, so checking at click time is too late.
  let tapWasSelected = false;
  let selected = null;

  function select(el) {
    if (selected) selected.classList.remove('selected');
    selected = el;
    if (!el) {
      caption.replaceChildren();
      return;
    }
    el.classList.add('selected');
    const item = items[el.dataset.index];
    caption.textContent = item.note;
  }

  items.forEach((item, i) => {
    const a = document.createElement('a');
    a.className = 'dock-item';
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.dataset.index = i;
    a.setAttribute('aria-label', item.name);
    a.dataset.note = item.note; // the caption shows it; grep searches it

    const img = document.createElement('img');
    img.src = item.icon;
    img.alt = '';
    img.width = 128;
    img.height = 128;
    img.loading = 'lazy';
    a.appendChild(img);
    a.appendChild(span('dock-label', item.name));

    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') select(a); });
    a.addEventListener('focus', () => select(a));
    a.addEventListener('click', (e) => {
      if (lastPointer !== 'mouse' && !tapWasSelected) {
        e.preventDefault();
        select(a);
      }
    });

    dock.appendChild(a);
  });

  dock.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
    tapWasSelected = selected !== null && selected === e.target.closest('.dock-item');
  });
  // Keyboard Enter on a focused app opens it, even after an earlier tap
  dock.addEventListener('keydown', () => { lastPointer = 'mouse'; });
  // WebKit fires compatibility mouse-leave events right after a tap; only a real mouse should clear the selection
  dock.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && lastPointer === 'mouse') select(null); });
  dock.addEventListener('focusout', (e) => { if (!dock.contains(e.relatedTarget)) select(null); });
}

// ─── Races ───

// Today in Seattle as YYYY-MM-DD, comparable as a string with race dates
const seattleToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

// The [ ■■□□ ] bar and "3 run · 1 PR · 2 to go" line shared by every challenge tab
function renderProgress(races, stats, { doneLabel, countPRs = false }) {
  const done = races.filter((r) => r.completed === true).length;
  const missed = races.filter((r) => r.completed === false).length;
  const prs = countPRs ? races.filter((r) => r.pr).length : 0;
  const blocks = races.map((r, idx) => `<span class="race-block${r.completed === true ? ' filled' : ''}${r.completed === false ? ' missed' : ''}" data-race-index="${idx}"></span>`).join('');
  const parts = [
    `${done} ${doneLabel}`,
    prs && `${prs} PR${prs === 1 ? '' : 's'}`,
    missed && `${missed} missed`,
    `${races.length - done - missed} to go`,
  ].filter(Boolean);
  stats.innerHTML = `<div class="race-blocks">[ ${blocks} ]</div><div class="race-summary">${parts.join(' · ')}</div>`;
}

export function renderRaces(races) {
  const list = document.getElementById('races-list');
  const stats = document.getElementById('race-stats');
  const today = seattleToday();
  const nextIndex = races.findIndex((r) => r.completed === undefined && r.date >= today);
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
    const name = span('race-name', race.name);
    if (race.pr) {
      const pr = span('race-pr', 'PR');
      pr.title = 'Personal record';
      pr.setAttribute('aria-label', 'personal record');
      name.appendChild(pr);
    }
    a.appendChild(name);
    a.appendChild(span('race-location', race.location));
    const badges = span('race-badges', '');
    if (i === nextIndex) badges.appendChild(span('race-badge countdown', daysUntil(race.date, today)));
    if (race.goal) badges.appendChild(span('race-badge goal', 'first marathon 🤞🏾'));
    if (race.note) badges.appendChild(span('race-badge note', race.note));
    a.appendChild(badges);

    a.dataset.raceIndex = i;
    list.appendChild(a);
  });

  renderProgress(races, stats, { doneLabel: 'run', countPRs: true });
  wireProgress(races, list, stats, '.race-item');
}

// ─── Progress bar behavior, shared by every challenge tab ───
// Blocks fill in when the bar scrolls into view, and hovering a block highlights
// its race (and vice versa). Rows and blocks are paired by data-race-index.

function wireProgress(races, list, stats, rowSelector) {
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

  function highlightPair(index, on) {
    const block = stats.querySelector(`.race-block[data-race-index="${index}"]`);
    const row = list.querySelector(`${rowSelector}[data-race-index="${index}"]`);
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
    const row = e.target.closest(rowSelector);
    if (row) highlightPair(row.dataset.raceIndex, true);
  });
  list.addEventListener('mouseout', (e) => {
    const row = e.target.closest(rowSelector);
    if (row) highlightPair(row.dataset.raceIndex, false);
  });
}

// Both dates are YYYY-MM-DD strings, so they parse as UTC midnights: whole days, no DST drift
function daysUntil(date, today) {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
  return days === 0 ? 'today!' : days === 1 ? 'tomorrow' : `in ${days} days`;
}

// For TBA dates only the month is reliable: count calendar months
function monthsUntil(date, today) {
  const months = (parseInt(date.slice(0, 4), 10) - parseInt(today.slice(0, 4), 10)) * 12
    + parseInt(date.slice(5, 7), 10) - parseInt(today.slice(5, 7), 10);
  return months <= 0 ? 'this month' : months === 1 ? 'next month' : `in ~${months} months`;
}

// ─── Month rail (2027 cycling challenge) ───
// Races grouped by month along a vertical line. Status reads by shape as well as
// color: filled dot = done, ✗ = missed, ringed dot = next, hollow dot = upcoming.

export function renderRail(races, list, stats) {
  if (!list) return;
  const today = seattleToday();
  const nextIndex = races.findIndex((r) => r.completed === undefined && r.date >= today);

  let group = null;
  let groupMonth = '';

  races.forEach((race, i) => {
    const month = race.date.slice(0, 7);
    if (month !== groupMonth) {
      groupMonth = month;
      list.appendChild(span('rail-month', MONTHS[parseInt(month.slice(5), 10) - 1]));
      group = document.createElement('div');
      group.className = 'rail-group';
      list.appendChild(group);
    }

    const a = document.createElement('a');
    a.className = 'rail-race';
    a.href = race.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    let status = 'upcoming';
    if (race.completed === true) {
      a.classList.add('completed');
      status = 'completed';
    } else if (race.completed === false) {
      a.classList.add('skipped');
      status = 'missed';
    } else if (i === nextIndex) {
      a.classList.add('next');
      status = 'next';
    }

    a.appendChild(span('sr-only', `${status}: `));
    a.appendChild(span('rail-name', race.name));
    // Short name keeps every row to two lines; the official name is on hover and for screen readers
    if (race.fullName) {
      a.title = race.fullName;
      a.appendChild(span('sr-only', ` ${race.fullName}`));
    }
    if (race.pr) {
      const pr = span('rail-pr', 'PR');
      pr.title = 'Personal record';
      a.appendChild(pr);
    }
    // Line 1 is the name plus any chips; line 2 is the details.
    // Countdown chip on the next event, same green chip as 2026. A TBA date is only
    // a guess at the day, so count in months instead.
    if (i === nextIndex) a.appendChild(span('rail-chip countdown', race.tba ? monthsUntil(race.date, today) : daysUntil(race.date, today)));
    // The year's goal ride gets the same orange tag as 2026's first marathon
    if (race.goal) a.appendChild(span('rail-chip goal', race.goal));
    if (race.note) a.appendChild(span('rail-chip', race.note));

    // One quiet line of details: date (or TBA until announced) · place · distance
    const meta = span('rail-meta', '');
    let when = race.tba ? 'date TBA' : formatDate(race.date);
    if (!race.tba && race.endDate) when += `–${parseInt(race.endDate.slice(8), 10)}`;
    [when, race.location, race.distance].filter(Boolean).forEach((part) => meta.appendChild(span('rail-part', part)));
    a.appendChild(meta);

    a.dataset.raceIndex = i;
    group.appendChild(a);
  });

  // Progress bar + summary, same as the running challenge
  if (stats) {
    renderProgress(races, stats, { doneLabel: 'done' });
    wireProgress(races, list, stats, '.rail-race');
  }
}

// ─── Bucket List ───

export function renderBucketList(items) {
  const list = document.getElementById('bucket-list');
  const stats = document.getElementById('bucket-stats');
  if (!list || !stats) return;

  let doneCount = 0;

  const sorted = [...items].sort((a, b) => (a.done === b.done ? 0 : a.done ? -1 : 1));

  sorted.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'bucket-item' + (item.done ? ' done' : '');

    if (item.done) doneCount++;

    // A markdown checklist line: - [x] item  # note
    el.appendChild(span('bucket-status', item.done ? '- [x]' : '- [ ]'));
    el.appendChild(span('bucket-text', item.item));
    if (item.note) el.appendChild(span('bucket-note', `# ${item.note}`));

    list.appendChild(el);
  });

  const remaining = items.length - doneCount;
  const someday = Math.round(remaining * 2 / 3);
  const mystery = remaining - someday;

  stats.innerHTML =
    `<span>${doneCount} done · ${someday} someday · ${mystery} ???</span>`;
}

// ─── Writing (posts come from /api/posts, the Substack proxy) ───

export function renderWriting(posts) {
  const writingList = document.getElementById('writing-list');
  if (!writingList) return;
  const valid = (Array.isArray(posts) ? posts : []).filter((p) => p.title && (p.canonical_url || p.slug));
  if (!valid.length) {
    showFallback('writing-list', 'no posts yet.');
    return;
  }

  valid.forEach((post, i) => {
    const a = document.createElement('a');
    a.className = 'writing-item';
    a.href = post.canonical_url || `https://notebook.mubbie.dev/p/${encodeURIComponent(post.slug)}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    const h3 = document.createElement('h3');
    h3.textContent = post.title;
    a.appendChild(h3);

    // the latest post is always "new"
    if (i === 0) a.appendChild(span('writing-badge', 'new'));

    const date = post.post_date ? new Date(post.post_date) : null;
    if (date) {
      const sameYear = date.getFullYear() === new Date().getFullYear();
      a.appendChild(span('writing-date', date.toLocaleDateString('en-US', sameYear
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', year: 'numeric' })));
    }

    if (post.wordcount) a.appendChild(span('writing-time', `${Math.max(1, Math.round(post.wordcount / 250))} min`));
    a.appendChild(span('arrow', '→'));
    writingList.appendChild(a);
  });
}
