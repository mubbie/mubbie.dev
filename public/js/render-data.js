// ─── Data section renderers: currently, races, bucket list, latest post ───

import { span } from './dom.js';

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

    el.appendChild(span('currently-icon', item.icon));
    el.appendChild(span('currently-label', item.label));
    el.appendChild(span('currently-value', item.value));
    if (item.url) el.appendChild(span('arrow', '→'));

    list.appendChild(el);
  });
}

// ─── Races ───

export function renderRaces(races) {
  const list = document.getElementById('races-list');
  const stats = document.getElementById('race-stats');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

  const nextIndex = races.findIndex((r) => r.completed === undefined && r.date >= today);
  let daysUntilNext = null;
  if (nextIndex >= 0) {
    // Both are YYYY-MM-DD strings (today is in Seattle time), so they parse as UTC
    // midnights and the difference is always a whole number of days — no DST drift.
    daysUntilNext = Math.round((Date.parse(races[nextIndex].date) - Date.parse(today)) / 86400000);
  }
  let completedCount = 0;
  let missedCount = 0;

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
      missedCount++;
    } else if (i === nextIndex) {
      a.classList.add('next');
      statusIcon = '→';
    }

    if (race.goal) a.classList.add('highlight');

    a.appendChild(span('race-status', statusIcon));
    a.appendChild(span('race-date', formatDate(race.date)));
    const name = span('race-name', race.name);
    if (race.pr) {
      const star = span('race-pr', '★');
      star.title = 'Personal record';
      star.setAttribute('aria-label', 'personal record');
      name.appendChild(star);
    }
    a.appendChild(name);
    a.appendChild(span('race-location', race.location));
    const badges = span('race-badges', '');
    if (i === nextIndex) {
      if (daysUntilNext === 0) {
        badges.appendChild(span('race-badge countdown', 'today!'));
      } else if (daysUntilNext === 1) {
        badges.appendChild(span('race-badge countdown', 'tomorrow'));
      } else if (daysUntilNext !== null) {
        badges.appendChild(span('race-badge countdown', `in ${daysUntilNext} days`));
      }
    }
    if (race.goal) badges.appendChild(span('race-badge goal', 'first marathon'));
    if (race.note) badges.appendChild(span('race-badge note', race.note));
    a.appendChild(badges);

    a.dataset.raceIndex = i;
    list.appendChild(a);
  });

  // Block progress + stats
  const remaining = races.length - completedCount - missedCount;

  let blocksHtml = '<div class="race-blocks">[ ';
  races.forEach((race, idx) => {
    const filled = race.completed === true;
    const missed = race.completed === false;
    blocksHtml += `<span class="race-block${filled ? ' filled' : ''}${missed ? ' missed' : ''}" data-race-index="${idx}"></span>`;
  });
  blocksHtml += ' ]</div>';

  const prCount = races.filter((r) => r.pr).length;
  const summaryParts = [`${completedCount} run`];
  if (prCount > 0) {
    summaryParts.push(`${prCount} PR${prCount === 1 ? '' : 's'}`);
  }
  if (missedCount > 0) summaryParts.push(`${missedCount} missed`);
  summaryParts.push(`${remaining} to go`);
  const summaryHtml = `<div class="race-summary">${summaryParts.join(' · ')}</div>`;

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

// ─── Writing (fetched from Substack) ───

export function fetchWriting() {
  const writingList = document.getElementById('writing-list');
  if (!writingList) return;

  fetch('/api/posts?limit=4')
    .then((res) => {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then((posts) => {
      if (!posts || !posts.length) return;

      posts.forEach((post, i) => {
        const title = post.title;
        const link = post.canonical_url || `https://notebook.mubbie.dev/p/${post.slug}`;
        if (!title || !link) return;

        const a = document.createElement('a');
        a.className = 'writing-item';
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const h3 = document.createElement('h3');
        h3.textContent = title;
        a.appendChild(h3);

        if (i === 0) a.appendChild(span('writing-badge', 'new'));

        if (post.post_date) {
          const d = new Date(post.post_date);
          const sameYear = d.getFullYear() === new Date().getFullYear();
          const label = d.toLocaleDateString('en-US', sameYear
            ? { month: 'short', day: 'numeric' }
            : { month: 'short', year: 'numeric' });
          a.appendChild(span('writing-date', label));
        }

        const wc = post.wordcount || post.word_count;
        if (wc) {
          const mins = Math.max(1, Math.round(wc / 250));
          a.appendChild(span('writing-time', `${mins} min`));
        }

        a.appendChild(span('arrow', '→'));

        writingList.appendChild(a);
      });
    })
    .catch(() => {
      writingList.appendChild(
        Object.assign(document.createElement('div'), {
          className: 'section-fallback',
          textContent: 'could not load posts.',
        })
      );
    });
}
