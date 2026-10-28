// Browser tests for the homepage, terminal, and 404 page.
// Run: npm run test:browser   (desktop Chrome/Safari/Firefox + iPhone/Android emulation)

import { test, expect } from '@playwright/test';

const isMobile = (testInfo) => ['iphone', 'android'].includes(testInfo.project.name);

// Record window.open calls instead of opening tabs. `window.__blockPopups = true` simulates a blocker.
async function stubWindowOpen(page) {
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => {
      if (window.__blockPopups) return null;
      window.__opened.push(String(url));
      return {};
    };
  });
}

async function load(page, path = '/') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubWindowOpen(page);
  await page.goto(path);
  await expect(page.locator('.race-item')).toHaveCount(16);
  await expect(page.locator('.writing-item').first()).toBeVisible();
  return errors;
}

// Type a command into the terminal and return its output.
// Like a person, bring the terminal on screen first: if Playwright has to scroll an
// off-screen input into view itself, that scroll can land after (and cancel) a
// smooth scroll the command just started.
async function run(page, cmd, { wait = 0 } = {}) {
  await page.evaluate(async () => {
    document.getElementById('terminal-history').innerHTML = '';
    const r = document.getElementById('terminal-input').getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      // The site sets `scroll-behavior: smooth`; some engines apply it even to 'instant'
      const html = document.documentElement;
      html.style.scrollBehavior = 'auto';
      document.getElementById('terminal').scrollIntoView({ block: 'center' });
      html.style.scrollBehavior = '';
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    }
  });
  const input = page.locator('#terminal-input');
  await input.fill(cmd);
  await input.press('Enter');
  if (wait) await page.waitForTimeout(wait);
  return page.locator('#terminal-history').innerText();
}

// Resolve once smooth scrolling has stopped (scrollY unchanged across two samples)
async function scrollSettled(page) {
  let prev = -1;
  await expect.poll(async () => {
    const y = await page.evaluate(() => window.scrollY);
    const still = y === prev;
    prev = y;
    return still;
  }, { intervals: [200], timeout: 10_000 }).toBe(true);
  return prev;
}

// ─── Page content ───

test('homepage renders every section with no script errors', async ({ page }) => {
  const errors = await load(page);
  await expect(page.locator('.project-card')).toHaveCount(5);
  await expect(page.locator('.writing-item')).toHaveCount(4);
  const currently = await (await page.request.get('/data/currently.json')).json();
  await expect(page.locator('.currently-item')).toHaveCount(currently.length);
  await expect(page.locator('.dock-item')).toHaveCount(8);
  await expect(page.locator('.hangout-join')).toHaveAttribute('href', /^https:\/\/chat\.whatsapp\.com\//);
  await expect(page.locator('.bucket-item')).toHaveCount(12);
  await expect(page.locator('.connect-link')).toHaveCount(8);
  await expect(page.locator('#greeting-text')).not.toHaveText('Hey');
  // House style: no em dashes anywhere a visitor can read
  expect(await page.title()).not.toContain('—');
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('—');
  expect(errors).toEqual([]);
});

test('races: statuses, PR stars, countdown, and summary', async ({ page }) => {
  await load(page);
  const races = await (await page.request.get('/data/races.json')).json();
  await expect(page.locator('.race-item.completed')).toHaveCount(races.filter((r) => r.completed === true).length);
  await expect(page.locator('.race-item.skipped')).toHaveCount(races.filter((r) => r.completed === false).length);
  await expect(page.locator('.race-pr')).toHaveCount(races.filter((r) => r.pr).length);
  await expect(page.locator('.race-pr').first()).toHaveAttribute('title', 'Personal record');

  const run = races.filter((r) => r.completed === true).length;
  const missed = races.filter((r) => r.completed === false).length;
  const prs = races.filter((r) => r.pr).length;
  const toGo = races.length - run - missed;
  await expect(page.locator('#panel-2026 .race-summary')).toHaveText(
    [`${run} run`, prs && `${prs} PR${prs === 1 ? '' : 's'}`, missed && `${missed} missed`, `${toGo} to go`].filter(Boolean).join(' · '),
  );

  // Countdown = Seattle calendar days to the next unfinished race
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  const next = races.find((r) => r.completed === undefined && r.date >= today);
  if (next) {
    const days = Math.round((Date.parse(next.date) - Date.parse(today)) / 86_400_000);
    const label = days === 0 ? 'today!' : days === 1 ? 'tomorrow' : `in ${days} days`;
    await expect(page.locator('.race-item.next .race-name')).toHaveText(next.name);
    await expect(page.locator('.race-badge.countdown')).toHaveText(label);
  }

  await expect(page.locator('#panel-2026 .race-block')).toHaveCount(races.length);
  await expect(page.locator('#panel-2026 .race-block.missed')).toHaveCount(missed);
  // Blocks fill in once the progress bar itself is on screen
  await page.locator('#race-stats').scrollIntoViewIfNeeded();
  await expect(page.locator('#panel-2026 .race-block.filled')).toHaveCount(run, { timeout: 10_000 });
});

test('race tabs: opens on this year, 2027 shows the cycling rail', async ({ page }, testInfo) => {
  await load(page);
  const year = String(new Date().getFullYear());
  const hasTab = await page.locator(`.race-tab[data-year="${year}"]`).count();
  const opened = hasTab ? year : '2026';
  await expect(page.locator(`.race-tab[data-year="${opened}"]`)).toHaveAttribute('aria-selected', 'true');

  const rides = await (await page.request.get('/data/races-2027.json')).json();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  await page.locator('#tab-2027').click();
  await expect(page.locator('#panel-2027')).toBeVisible();
  await expect(page.locator('#panel-2026')).toBeHidden();
    await expect(page.locator('.rail-race')).toHaveCount(rides.length);
  await expect(page.locator('.rail-month')).toHaveCount(new Set(rides.map((r) => r.date.slice(0, 7))).size);
  // Placeholder dates say so instead of showing a made-up day
  for (const [i, r] of rides.entries()) {
    await expect(page.locator('.rail-meta').nth(i)).toContainText(r.tba ? 'date TBA' : /^[A-Z][a-z]{2} \d{1,2}/);
  }
  await expect(page.locator('.rail-chip:not(.goal):not(.countdown)')).toHaveText(rides.filter((r) => r.note).map((r) => r.note));
  // One countdown chip, on the next event: days when the date is set, months while it's TBA
  const next = rides.find((r) => r.completed === undefined && r.date >= today);
  await expect(page.locator('.rail-chip.countdown')).toHaveCount(next ? 1 : 0);
  if (next) {
    await expect(page.locator('.rail-race.next .rail-chip.countdown'))
      .toHaveText(next.tba ? /^(in ~\d+ months|next month|this month)$/ : /^(in \d+ days|tomorrow|today!)$/);
  }
  // The goal ride gets the orange tag, like 2026's first marathon
  await expect(page.locator('.rail-chip.goal')).toHaveText(rides.filter((r) => r.goal).map((r) => r.goal));
  // Short names on the rail; the official name is the hover title
  for (const r of rides.filter((x) => x.fullName)) {
    await expect(page.locator('.rail-race', { hasText: r.name }).first()).toHaveAttribute('title', r.fullName);
  }

  await expect(page.locator('#races-label')).toHaveText('// 2027 cycling challenge: road to vancouver');

  // Progress bar works like 2026: one block per ride, hover pairs block and row both ways
  await expect(page.locator('#panel-2027 .race-block')).toHaveCount(rides.length);
  if (!isMobile(testInfo)) {
    await page.locator('#panel-2027 .race-block').nth(1).hover();
    await expect(page.locator('#panel-2027 .rail-race').nth(1)).toHaveClass(/highlight-row/);
    await page.locator('#panel-2027 .rail-race').nth(2).hover();
    await expect(page.locator('#panel-2027 .race-block').nth(2)).toHaveClass(/highlight/);
    await expect(page.locator('#panel-2027 .rail-race').nth(1)).not.toHaveClass(/highlight-row/);
  }

  // Arrow keys move between tabs
  await page.locator('#tab-2027').press('ArrowLeft');
  await expect(page.locator('#tab-2026')).toBeFocused();
  await expect(page.locator('#panel-2026')).toBeVisible();
});

test('writing: NEW badge on first post, dates and read times on all', async ({ page }) => {
  await load(page);
  const items = page.locator('.writing-item');
  await expect(items.first().locator('.writing-badge')).toBeVisible();
  await expect(page.locator('.writing-badge')).toHaveCount(1);
  for (const item of await items.all()) {
    await expect(item.locator('.writing-date')).toHaveText(/^[A-Z][a-z]{2} \d{1,4}$/);
    await expect(item.locator('.writing-time')).toHaveText(/^\d+ min$/);
    await expect(item).toHaveAttribute('href', /^https:\/\/notebook\.mubbie\.dev\/p\//);
  }
});

test('fav tools dock: hover or focus explains an app, and every app links out', async ({ page }, testInfo) => {
  await load(page);
  const tools = await (await page.request.get('/data/uses.json')).json();
  const items = page.locator('.dock-item');
  await expect(items).toHaveCount(tools.length);
  await page.locator('#dock').scrollIntoViewIfNeeded(); // icons are lazy-loaded
  for (const [i, t] of tools.entries()) {
    await expect(items.nth(i)).toHaveAttribute('href', t.url);
    await expect.poll(() => items.nth(i).locator('img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  }

  // Easter egg: nothing explains the dock until you poke at it
  const caption = page.locator('#dock-caption');
  await expect(caption).toHaveText('');
  await expect(page.locator('#tools .footnote-ref')).toHaveAttribute('href', '#credits');
  await expect(page.locator('#credits a')).toHaveAttribute('href', 'https://www.vitorialima.com/');
  await items.nth(2).focus();
  await expect(caption).toHaveText(tools[2].note); // the reason only; the name floats above the icon
  await expect(items.nth(2).locator('.dock-label')).toHaveText(tools[2].name);
  await expect(items.nth(2).locator('.dock-label')).toBeVisible();
  await expect(items.nth(2)).toHaveClass(/selected/);
  if (!isMobile(testInfo)) {
    // Magnification shifts icons under the cursor, so re-aim once the dock settles
    await items.nth(4).hover();
    await page.waitForTimeout(250);
    await items.nth(4).hover();
    await expect(caption).toContainText(tools[4].note);
  }
  expect(await caption.innerText()).not.toContain('—');
});

test('hangout invite: activity word cycles, and joining pops popcorn', async ({ page }) => {
  await load(page);
  const word = page.locator('#hangout-activity');
  const first = await word.innerText();
  expect(first.length).toBeGreaterThan(0);
  await expect(word).not.toHaveText(first, { timeout: 8000 }); // starts typing a new one
  await expect(word).not.toHaveClass(/typing/, { timeout: 8000 });
  const second = await word.innerText();
  expect(second).not.toBe(first);

  const join = page.locator('#hangout-join');
  // The site scrolls smoothly; under load a click can land where the button was mid-scroll
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  await join.scrollIntoViewIfNeeded();
  // Kernels remove themselves when their animation ends, so count them as they're added
  await page.evaluate(() => {
    window.__kernels = 0;
    new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => {
      if (n.classList?.contains('popcorn-kernel')) window.__kernels++;
    }))).observe(document.body, { childList: true });
  });
  // Check the link target and the click handler, without waiting on a real popup:
  // opening WhatsApp in a new tab is the browser's job, and Firefox is slow to report it under load
  await expect(join).toHaveAttribute('href', /^https:\/\/chat\.whatsapp\.com\//);
  await expect(join).toHaveAttribute('target', '_blank');
  await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), { once: true }));
  await join.click();
  await expect.poll(() => page.evaluate(() => window.__kernels)).toBeGreaterThan(0);
});

test('every new-tab link is noopener and no link is empty', async ({ page }) => {
  await load(page);
  const bad = await page.evaluate(() => [...document.querySelectorAll('a')]
    .filter((a) => !a.getAttribute('href') || a.getAttribute('href') === '#'
      || (a.target === '_blank' && !a.rel.includes('noopener')))
    .map((a) => a.outerHTML.slice(0, 80)));
  expect(bad).toEqual([]);
});

test('no horizontal scrolling', async ({ page }) => {
  await load(page);
  for (const id of ['projects', 'writing', 'currently', 'races', 'bucketlist', 'connect']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  }
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test('theme: follows the OS, and an explicit choice persists across reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await load(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await run(page, 'theme dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');

  // The 404 page follows the same choice, in both directions
  await page.goto('/missing-page');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.goto('/');
  await run(page, 'theme light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.goto('/missing-page');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('bucket list: a checklist cat\'d in a terminal window', async ({ page }) => {
  await load(page);
  const items = await (await page.request.get('/data/bucketlist.json')).json();
  await expect(page.locator('#bucketlist .term-cmd').first()).toContainText('cat bucketlist.md');
  await expect(page.locator('.bucket-item.done .bucket-status')).toHaveText(items.filter((i) => i.done).map(() => '- [x]'));
  await expect(page.locator('.bucket-item:not(.done) .bucket-status')).toHaveCount(items.filter((i) => !i.done).length);
  await expect(page.locator('.bucket-note')).toHaveCount(items.filter((i) => i.note).length);
  await expect(page.locator('.bucket-note').first()).toHaveText(/^# /);
  // Done items stay legible: no strikethrough
  expect(await page.locator('.bucket-item.done .bucket-text').first().evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none');
});

test('page still works when localStorage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('blocked', 'SecurityError'); },
    });
  });
  const errors = await load(page);
  await expect(page.locator('.bucket-item')).toHaveCount(12);
  for (const id of ['projects', 'races', 'connect']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await expect(page.locator(`#${id}`)).toHaveClass(/visible/);
  }
  expect(await run(page, 'theme light')).toContain('theme: light');
  expect(errors).toEqual([]);
});

test('back-to-top is only tabbable when shown', async ({ page }) => {
  await load(page);
  const btn = page.locator('.back-to-top');
  await expect(btn).toHaveAttribute('tabindex', '-1');
  await page.evaluate(() => window.scrollTo(0, 2000));
  await expect(btn).toHaveClass(/visible/);
  await expect(btn).toHaveAttribute('tabindex', '0');
});

test('nested missing page shows the styled 404', async ({ page }) => {
  const res = await page.goto('/some/nested/missing-page');
  expect(res.status()).toBe(404);
  await expect(page.locator('.error-code')).toHaveText('404');
  // Styled: the stylesheet loaded (unstyled default would be ~16px)
  const size = await page.locator('.error-code').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThan(40);
});

// ─── Terminal commands ───

const COMMANDS = [
  ['whoami', 'mubbie idoko'],
  ['pwd', '~/mubbie'],
  ['ls', 'projects/  writing/  currently/  races/  bucketlist/  connect/'],
  ['ls -la', 'projects/  writing/'],
  ['ll', 'projects/  writing/'],
  ['ls /dev', 'secrets.txt  fuel  goals  mood  about.txt'],
  ['ls -x', 'ls: unknown option: -x'],
  ['ls currently', 'reading  playing  learning  watching  planning  listening  tools/'],
  ['ls tools', 'Heynote'],
  ['ls projects', 'gx  officecat'],
  ['ls nope', 'No such file or directory'],
  ['hangout', 'next hangout:'],
  ['ls cycling', 'STP'],
  ['grep vancouver', 'races/2027/'],
  ['grep party', 'Ride from Seattle to Vancouver and Party ('],
  ['cat /dev/secrets.txt', 'uncharted 4'],
  ['cat secrets.txt', 'uncharted 4'],
  ['cat about', 'software engineer at microsoft security'],
  ['cat', 'usage: cat'],
  ['cat nope', 'No such file or directory'],
  ['cd /dev', 'you found the secret directory'],
  ['cd nowhere', 'No such directory'],
  ['open', 'usage: open'],
  ['open s', 'ambiguous'],
  ['open zzz', 'not found'],
  ['theme blue', "unknown value 'blue'"],
  ['echo hello <b>x</b>', 'hello <b>x</b>'],
  ['8ball', 'ask me a question'],
  ['8ball will it ship?', '🎱'],
  ['ping', 'pong'],
  ['claude', 'helped build'],
  ['exit', 'no escape'],
  ['quit', 'no escape'],
  ['rm -rf /', 'permission denied'],
  ['sudo hire-me', 'midoko.dev@gmail.com'],
  ['sudo ls', 'nice try'],
  ['sudo apt install -rf', 'nice try'],
  ['neofetch', 'os: human 1.0'],
  ['cocktail', 'conjure your next drink'],
  ['cocktail foo bar', 'unknown incantation'],
  ['man ls', 'NAME'],
  ['man ll', 'ls - '],
  ['man zzz', 'no manual entry'],
  ['man', 'what manual page'],
  ['curl', 'usage: curl'],
  ['curl google.com', 'unsupported target'],
  ['grep', 'usage: grep'],
  ['grep qqqzzz', 'no matches'],
  ['grep marathon', 'races/'],
  ['grep secrets', '/dev/'],
  ['grep heynote', 'Heynote: scratch pad'],
  ['blah', "command not found: blah. try 'help'"],
  // Object.prototype names must not resolve to anything
  ['constructor', 'command not found: constructor'],
  ['__proto__', 'command not found: __proto__'],
  ['cat constructor', 'No such file or directory'],
  ['cd toString', 'No such directory'],
  ['man constructor', 'no manual entry'],
];

test('terminal: every command produces the expected output', async ({ page }) => {
  await load(page);
  for (const [cmd, expected] of COMMANDS) {
    expect.soft(await run(page, cmd), cmd).toContain(expected);
  }
  // The PR tag lives inside the race name; terminal output should show the plain name
  expect(await run(page, 'grep shamrock')).not.toMatch(/MarathonPR|★/);
  expect(await run(page, 'grep uncharted')).not.toContain('uncharted 4'); // /dev contents stay hidden
});

test('terminal: help lists all visible commands', async ({ page }, testInfo) => {
  await load(page);
  await run(page, 'help');
  await expect(page.locator('.terminal-help-row')).toHaveCount(31);
  const hint = page.locator('.terminal-help-hint');
  if (isMobile(testInfo)) await expect(hint).toHaveText('tap the prompt, type a command, and hit enter.');
  else await expect(hint).toContainText('to autocomplete');
});

test('terminal: man page exists for every command', async ({ page }) => {
  await load(page);
  const cmds = ['help', 'ls', 'cd', 'cat', 'open', 'whoami', 'theme', 'weather', 'sudo', 'matrix', 'coffee',
    'cocktail', 'flip', '8ball', 'random', 'echo', 'date', 'pwd', 'repo', 'clear', 'claude', 'history',
    'neofetch', 'ping', 'man', 'uptime', 'curl', 'grep', 'popcorn', 'ssh', 'rm', 'exit', 'quit'];
  for (const c of cmds) {
    const out = await run(page, `man ${c}`);
    expect.soft(out, c).toContain('NAME');
    expect.soft(out, c).toContain('DESCRIPTION');
  }
});

test('terminal: random, flip, uptime, date', async ({ page }) => {
  await load(page);
  const fortunes = await (await page.request.get('/data/fortunes.json')).json();
  const out = await run(page, 'random');
  expect(fortunes.some((f) => out.includes(f))).toBe(true);
  expect(await run(page, 'flip')).toMatch(/heads!|tails!/);
  expect(await run(page, 'uptime')).toMatch(/up (\d+h )?(\d+m )?\d+s, since/);
  expect(await run(page, 'date')).toMatch(/\d{4}/);
});

test('terminal: cd scrolls to sections', async ({ page }) => {
  await load(page);
  for (const [arg, id] of [['races', 'races'], ['bucket', 'bucketlist'], ['now', 'currently'], ['tools', 'tools'], ['cycling', 'races']]) {
    await run(page, `cd ${arg}`);
    await scrollSettled(page);
    expect(await page.locator(`#${id}`).evaluate((el) => Math.abs(el.getBoundingClientRect().top)), `cd ${arg}`)
      .toBeLessThan(200);
  }
  await expect(page.locator('#tab-2027')).toHaveAttribute('aria-selected', 'true'); // cd cycling opened its tab
  await run(page, 'cd ~');
  expect(await scrollSettled(page)).toBeLessThan(50);
});

test('terminal: open, open latest, repo and the popup-blocked fallback', async ({ page }) => {
  await load(page);
  for (const [name, url] of [['gx', 'gx-cli'], ['linkedin', 'linkedin.com'], ['strava', 'strava.app.link']]) {
    await run(page, `open ${name}`);
    expect(await page.evaluate(() => window.__opened.pop())).toContain(url);
  }
  await run(page, 'open latest');
  await expect.poll(() => page.evaluate(() => window.__opened.at(-1) || '')).toContain('notebook.mubbie.dev/p/');

  await page.evaluate(() => { window.__blockPopups = true; });
  expect(await run(page, 'open gx')).toContain('popup blocked');
  const link = page.locator('#terminal-history a');
  await expect(link).toHaveAttribute('href', /gx-cli/);
  await expect(link).toHaveAttribute('rel', /noopener/);
});

test('terminal: timed animations finish, and clear cancels them', async ({ page }) => {
  await load(page);
  expect(await run(page, 'coffee', { wait: 2700 })).toContain('freshly brewed');
  expect(await run(page, 'sudo rm -rf /', { wait: 4400 })).toContain('just kidding');
  await run(page, 'sudo rm -rf /', { wait: 400 });
  await run(page, 'clear', { wait: 4000 });
  await expect(page.locator('#terminal-history')).toHaveText('');
});

test('terminal: cocktail opens sorcery with the right mood', async ({ page }) => {
  await load(page);
  await run(page, 'cocktail archmage brooding', { wait: 4300 });
  expect(await page.evaluate(() => window.__opened.at(-1))).toBe('https://sorcery.lol?tier=archmage&mood=brooding');
});

test('terminal: curl xkcd shows a linked comic', async ({ page }) => {
  await load(page);
  await run(page, 'curl xkcd');
  await expect(page.locator('#terminal-history img.terminal-image')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#terminal-history a')).toHaveAttribute('href', /^https:\/\/xkcd\.com\/\d+\/$/);
});

test('terminal: matrix starts, Esc stops it, reduced motion skips it', async ({ page }) => {
  await load(page);
  await run(page, 'matrix', { wait: 700 });
  await expect(page.locator('#matrix-canvas')).toHaveClass(/on/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#matrix-canvas')).not.toHaveClass(/on/);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await run(page, 'matrix', { wait: 700 })).toContain('reduced motion');
  await expect(page.locator('#matrix-canvas')).not.toHaveClass(/on/);
});

test('terminal: history is oldest → newest', async ({ page }) => {
  await load(page);
  for (const c of ['pwd', 'whoami', 'ping']) await run(page, c);
  const lines = (await run(page, 'history')).split('\n').filter((l) => /^\s*\d+\s/.test(l));
  expect(lines.slice(-4).map((l) => l.trim().split(/\s+/)[1])).toEqual(['pwd', 'whoami', 'ping', 'history']);
});

// ─── Keyboard (desktop only) ───

test.describe('keyboard', () => {
  test.skip(({ isMobile }) => isMobile, 'no physical keyboard on phones');

  test('Tab completes commands and arguments', async ({ page }) => {
    await load(page);
    const input = page.locator('#terminal-input');
    for (const [typed, expected] of [['neo', 'neofetch '], ['cd ra', 'cd races'], ['open gi', 'open github'],
      ['cat /dev/s', 'cat /dev/secrets.txt'], ['theme l', 'theme light'], ['curl xkcd r', 'curl xkcd random']]) {
      await input.fill(typed);
      await input.press('Tab');
      await expect(input).toHaveValue(expected);
    }
  });

  test('↑/↓ walk command history and restore the draft', async ({ page }) => {
    await load(page);
    await run(page, 'pwd');
    await run(page, 'whoami');
    const input = page.locator('#terminal-input');
    await input.fill('draft');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('whoami');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('pwd');
    await input.press('ArrowDown');
    await input.press('ArrowDown');
    await expect(input).toHaveValue('draft');
  });

  test('Ctrl+L clears the terminal', async ({ page }) => {
    await load(page);
    await run(page, 'ping');
    await page.locator('#terminal-input').press('Control+l');
    await expect(page.locator('#terminal-history')).toHaveText('');
  });

  test('"/" focuses the terminal; modifier combos are left to the browser', async ({ page }) => {
    await load(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+/');
    await expect(page.locator('#terminal-input')).not.toBeFocused();
    await page.keyboard.press('/');
    await expect(page.locator('#terminal-input')).toBeFocused();
  });

  test('number keys jump to sections, but not while typing', async ({ page }) => {
    await load(page);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('4');
    await expect.poll(() => page.locator('#races').evaluate((el) => Math.abs(el.getBoundingClientRect().top)))
      .toBeLessThan(200);

    await page.evaluate(() => window.scrollTo(0, 0));
    await scrollSettled(page);
    await page.locator('#terminal-input').focus();
    const y = await scrollSettled(page);
    await page.keyboard.press('2');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.scrollY)).toBe(y);
    await expect(page.locator('#terminal-input')).toHaveValue('2'); // the key went to the input
  });
});

// ─── Phones ───

test.describe('phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only');

  test('tap hint replaces "press /" and focuses the terminal', async ({ page }) => {
    await load(page);
    const hint = page.locator('.shortcut-hint');
    await expect(hint).toHaveText('tap here to start typing');
    await hint.tap();
    await expect(page.locator('#terminal-input')).toBeFocused();
  });

  test('dock: first tap explains an app, second tap opens it', async ({ page }) => {
    await load(page);
    const item = page.locator('.dock-item').nth(1);
    await item.scrollIntoViewIfNeeded();
    // Count real link popups too: Android fires focus before click, which once let the first tap open the app
    let popups = 0;
    page.context().on('page', () => popups++);
    await item.tap();
    await expect(page.locator('#dock-caption')).toContainText('coding agents');
    await page.waitForTimeout(500);
    expect(popups, 'first tap should only explain').toBe(0);
    expect(await page.evaluate(() => window.__opened.length + (location.href.includes('t3.codes') ? 1 : 0))).toBe(0);
    const [popup] = await Promise.all([page.waitForEvent('popup'), item.tap()]);
    expect(popup.url()).toContain('t3.codes');
  });

  test('phone layout: location hidden, badges under the name, 2-column tiles and connect grid', async ({ page }) => {
    await load(page);
    await expect(page.locator('.race-location').first()).toBeHidden();
    expect(await page.locator('.race-item.next .race-badges').evaluate((el) => getComputedStyle(el).gridColumnStart)).toBe('3');
    expect(await page.locator('.currently-list').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
    expect(await page.locator('.connect-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  });
});
