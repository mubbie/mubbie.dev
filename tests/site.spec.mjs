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

// Type a command and wait for the next prompt; returns the terminal text
const promptOf = (page) => page.locator('.terminal-input-line .terminal-prompt');

test('shell: a real working directory (cd, pwd, ls, prompt)', async ({ page }) => {
  await load(page);
  await run(page, 'cd races');
  await expect(promptOf(page)).toHaveText(/^~\/mubbie\/races \$/);
  expect(await run(page, 'pwd')).toContain('~/mubbie/races');
  const ls = await run(page, 'ls');
  expect(ls).toContain('cycling/');
  expect(ls).toContain('Hot Chocolate 15K');
  await run(page, 'cd cycling');
  await expect(promptOf(page)).toHaveText(/^~\/mubbie\/races\/cycling \$/);
  await expect(page.locator('#tab-2027')).toHaveAttribute('aria-selected', 'true');
  expect(await run(page, 'ls')).toContain('STP');
  await run(page, 'cd ..');
  expect(await run(page, 'pwd')).toContain('~/mubbie/races');
  expect(await run(page, 'cd -')).toContain('~/mubbie/races/cycling'); // cd - prints where it went
  await run(page, 'cd ~/mubbie/currently');
  expect(await run(page, 'cat reading')).toContain('Designing Data-Intensive Applications');
  await run(page, 'cd /');
  expect(await run(page, 'ls')).toContain('dev/  home/');
  await run(page, 'cd ~');
  await expect(promptOf(page)).toHaveText(/^~\/mubbie \$/);
  expect(await run(page, 'cd about.txt')).toContain('Not a directory');
  expect(await run(page, 'cat bucketlist.md')).toContain('- [x] Run a half marathon');
});

test('shell: pipes, chaining, variables, and exit status', async ({ page }) => {
  await load(page);
  const races = await (await page.request.get('/data/races.json')).json();
  const halves = races.filter((r) => /half/i.test(r.name)).length;
  expect(await run(page, 'ls races | grep half | wc -l')).toContain(`\n${halves}`);
  expect(await run(page, 'ls races | head -2')).toContain(`${races[0].name}`);
  const bucket = await (await page.request.get('/data/bucketlist.json')).json();
  expect(await run(page, 'cat bucketlist.md | grep -c "[x]"')).toContain(`\n${bucket.filter((b) => b.done).length}`);
  expect(await run(page, 'help | grep theme')).toContain('theme [dark|light|default]');
  expect(await run(page, 'random | cowsay')).toContain('(oo)');
  expect(await run(page, 'ls |')).toContain('syntax error');
  expect(await run(page, 'weather | head')).toContain("can't be piped");
  expect(await run(page, 'echo "a|b; c"')).toContain('a|b; c'); // quotes protect | and ;
  expect(await run(page, 'false || echo recovered')).toContain('recovered');
  expect(await run(page, 'true && echo chained')).toContain('chained');
  // only the echoed command line may mention it, not the output below it
  expect((await run(page, 'cd nowhere && echo SHOULD-NOT-PRINT')).split('\n').slice(1).join('\n')).not.toContain('SHOULD-NOT-PRINT');
  expect(await run(page, 'nope; echo $?')).toContain('127');
  expect(await run(page, 'echo $USER $EDITOR')).toContain('mubbie emacs');
  await run(page, 'export GREETING=hey');
  expect(await run(page, 'echo $GREETING')).toContain('hey');
  expect(await run(page, "echo '$GREETING'")).toContain('$GREETING'); // single quotes don't expand
  expect(await run(page, 'env')).toContain('PWD=~/mubbie');
  expect(await run(page, 'which ll')).toContain('aliased to ls -l');
  expect(await run(page, 'tree races')).toContain('└──');
  expect(await run(page, 'grpe marathon')).toContain('did you mean grep?');
  expect(await run(page, 'head -n 1 bucketlist.md')).toContain('- [x]');
});

test('shell: history expansion and persistence', async ({ page }) => {
  await load(page);
  await run(page, 'whoami');
  expect(await run(page, '!!')).toContain('mubbie idoko');
  await run(page, 'ping');
  expect(await run(page, '!who')).toContain('mubbie idoko');
  expect(await run(page, '!9999')).toContain('event not found');
  await run(page, 'ls');
  const sudo = await run(page, 'sudo !!');
  expect(sudo).toContain('sudo ls'); // the expanded line is what's echoed
  expect(sudo).toContain('nice try');
  await page.reload();
  await expect(page.locator('#terminal-input')).toBeAttached();
  await page.locator('#terminal-input').press('ArrowUp');
  await expect(page.locator('#terminal-input')).toHaveValue('sudo ls');
  expect(await run(page, 'history -c && history')).toContain('no commands in history yet');
});

test.describe('shell keys', () => {
  test.skip(({ isMobile }) => isMobile, 'hardware keyboard');

  test('Ctrl+C cancels the line and stops running output', async ({ page }) => {
    await load(page);
    const input = page.locator('#terminal-input');
    await input.focus();
    await input.fill('half typed');
    await input.press('Control+c');
    await expect(input).toHaveValue('');
    await expect(page.locator('#terminal-history')).toContainText('half typed^C');
    await run(page, 'coffee');
    await input.press('Control+c');
    await page.waitForTimeout(2600);
    await expect(page.locator('#terminal-history')).not.toContainText('freshly brewed');
  });

  test('Ctrl+R searches history; Enter runs the match, Esc restores', async ({ page }) => {
    await load(page);
    for (const c of ['pwd', 'echo needle in history', 'whoami']) await run(page, c);
    const input = page.locator('#terminal-input');
    await input.focus();
    await input.press('Control+r');
    await input.pressSequentially('needle');
    await expect(promptOf(page)).toContainText('(reverse-i-search)`needle\'');
    await expect(page.locator('#terminal-typed')).toHaveText('echo needle in history');
    await input.press('Escape');
    await expect(promptOf(page)).toHaveText(/^~\/mubbie \$/);
    await input.press('Control+r');
    await input.pressSequentially('needle');
    await input.press('Enter');
    await expect(page.locator('#terminal-history')).toContainText('\nneedle in history');
  });

  test('line editing: Ctrl+A/E/U/K/W, and the caret is drawn where it really is', async ({ page }) => {
    await load(page);
    const input = page.locator('#terminal-input');
    await input.focus();
    await input.fill('echo hello world');
    await input.press('Control+a');
    await expect(page.locator('#terminal-typed')).toHaveText('');
    await expect(page.locator('#terminal-typed-after')).toHaveText('echo hello world');
    await input.press('Control+e');
    await input.press('Control+w');
    await expect(input).toHaveValue('echo hello ');
    await input.press('Control+a');
    await input.press('ArrowRight');
    await input.press('ArrowRight');
    await input.press('Control+k');
    await expect(input).toHaveValue('ec');
    await input.press('Control+u');
    await expect(input).toHaveValue('');
  });

  test('Tab completes as far as matches agree; a second Tab lists them', async ({ page }) => {
    await load(page);
    const input = page.locator('#terminal-input');
    await input.focus();
    await input.fill('open s');
    await input.press('Tab');
    await expect(input).toHaveValue('open s');
    await input.press('Tab');
    await expect(page.locator('#terminal-history')).toContainText('sorcery  substack  strava');
    await input.fill('cd races && ls cyc');
    await input.press('Tab');
    await expect(input).toHaveValue('cd races && ls cycling/');
  });
});

test('emacs: scratch, M-x doctor and butterfly, read-only files, C-x C-c', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'hardware keyboard; phones get on-screen chords (tested separately)');
  await load(page);
  await run(page, 'emacs');
  const modeLine = page.locator('.editor-mode-line');
  await expect(modeLine).toContainText('*scratch*');
  await expect(modeLine).toContainText('(Lisp Interaction)');
  // M-x via Esc then x, with Tab completion
  await page.keyboard.press('Escape');
  await page.keyboard.press('x');
  await page.keyboard.type('doc');
  await page.keyboard.press('Tab');
  await expect(page.locator('.editor-mini-input')).toHaveValue('doctor');
  await page.keyboard.press('Enter');
  await expect(modeLine).toContainText('(Doctor)');
  await page.keyboard.type('I am worried about vim');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-buffer')).toHaveValue(/vim might be the source of your problems/);
  // M-x via Alt+x
  await page.keyboard.press('Alt+x');
  await page.keyboard.type('butterfly');
  await page.keyboard.press('Enter');
  await page.keyboard.type('yes');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-echo a')).toHaveAttribute('href', 'https://xkcd.com/378/', { timeout: 5000 });
  await page.keyboard.press('Control+x');
  await page.keyboard.press('Control+c');
  await expect(page.locator('.editor-overlay')).toHaveCount(0);
  await expect(page.locator('#terminal-input')).toBeFocused();

  await run(page, 'emacs bucketlist.md');
  await expect(modeLine).toContainText('%%');
  await page.keyboard.type('x');
  await expect(page.locator('.editor-echo')).toContainText('Buffer is read-only');
  await page.keyboard.press('Control+x');
  await page.keyboard.press('Control+c');
  await expect(page.locator('.editor-overlay')).toHaveCount(0);
});

test('vim: easy to get in, :q to get out', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'hardware keyboard');
  await load(page);
  await run(page, 'vim');
  await expect(page.locator('.editor-vim')).toBeVisible();
  for (const k of ['j', 'k', 'Escape', 'h']) await page.keyboard.press(k);
  await expect(page.locator('.editor-echo')).toContainText('everyone gets stuck');
  await page.keyboard.type(':q');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-overlay')).toHaveCount(0);
  await expect(page.locator('#terminal-history')).toContainText('you escaped vim');
});

test('editors on phones: chords are buttons', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'phone-only');
  await load(page);
  await run(page, 'emacs');
  const keys = page.locator('.editor-key');
  await expect(keys.filter({ hasText: 'M-x' })).toBeVisible();
  await keys.filter({ hasText: 'C-x C-c' }).tap();
  await expect(page.locator('.editor-overlay')).toHaveCount(0);
  await run(page, 'vi');
  await page.locator('.editor-key', { hasText: ':q' }).tap();
  await expect(page.locator('#terminal-history')).toContainText('you escaped vim');
});

// Stand-ins for the guestbook API and Cloudflare Turnstile (no outside calls in tests)
async function mockGuestbook(page, { open = true, notes = [], onPost } = {}) {
  await page.route('**/api/guestbook/config', (r) => r.fulfill({ json: { open, siteKey: open ? 'test-site-key' : null } }));
  await page.route('**/api/guestbook', async (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      if (onPost) onPost(body);
      await r.fulfill({ json: { ok: true, message: 'Thanks! Notes appear after a quick review.' } });
    } else {
      await r.fulfill({ json: notes });
    }
  });
  await page.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({
    contentType: 'text/javascript',
    body: 'window.turnstile = { render(el, o) { setTimeout(() => o.callback("test-token"), 50); return 1; }, reset() {} };',
  }));
}

test('guestbook: a hidden easter egg (nothing on the page, not in help or ls)', async ({ page }) => {
  await mockGuestbook(page, { notes: [{ name: 'Ada', message: 'love the dock', createdAt: '2026-10-28T12:00:00Z' }] });
  await load(page);
  expect(await page.locator('body').innerText()).not.toMatch(/guestbook/i);
  expect(await page.locator('#guestbook, .guestbook-note, #guestbook-sign').count()).toBe(0);
  expect(await run(page, 'help')).not.toContain('guestbook');
  expect(await run(page, 'ls')).not.toContain('guestbook');
  // …but it's there for whoever finds it
  expect(await run(page, 'man guestbook')).toContain('guestbook sign');
  await run(page, 'guestbook');
  await expect(page.locator('#terminal-history')).toContainText('"love the dock"');
  await expect(page.locator('#terminal-history')).toContainText('1 note. add yours: guestbook sign');
});

test('guestbook: empty, and closed until configured', async ({ page }) => {
  await mockGuestbook(page, { open: false });
  await load(page);
  await run(page, 'guestbook');
  await expect(page.locator('#terminal-history')).toContainText('no notes yet. be the first: guestbook sign');
  await run(page, 'guestbook sign');
  await expect(page.locator('#terminal-history')).toContainText('the guestbook opens soon');
  await expect(page.locator('.editor-overlay')).toHaveCount(0);
});

test('guestbook: guestbook sign, then the send button', async ({ page }) => {
  let sent = null;
  await mockGuestbook(page, { onPost: (b) => { sent = b; } });
  await load(page);
  await run(page, 'guestbook sign');
  const buffer = page.locator('.editor-buffer');
  await expect(buffer).toBeFocused();
  await buffer.evaluate((t) => { t.value = t.value.replace('Name: ', 'Name: Ada').replace('Message:\n', 'Message:\nhello from a test\n'); t.dispatchEvent(new Event('input')); });
  await page.locator('.editor-key', { hasText: 'send' }).click();
  await expect.poll(() => sent).not.toBeNull();
  expect(sent).toEqual({ name: 'Ada', message: 'hello from a test', token: 'test-token' });
  await expect(page.locator('#terminal-history')).toContainText('note sent');
  await expect(page.locator('.editor-overlay')).toHaveCount(0, { timeout: 5000 });
});

test('guestbook: refuses an empty note without sending', async ({ page }) => {
  let posts = 0;
  await mockGuestbook(page, { onPost: () => { posts++; } });
  await load(page);
  await run(page, 'guestbook sign');
  await page.locator('.editor-key', { hasText: 'send' }).click();
  await expect(page.locator('.editor-echo')).toContainText('Add your name');
  await page.locator('.editor-key', { hasText: 'C-x C-c' }).click();
  expect(posts).toBe(0);
});

test('guestbook: hostile notes print as plain text, and long words wrap', async ({ page }) => {
  await mockGuestbook(page, { notes: [
    { name: '<img src=x onerror="window.__pwned=1">', message: '<script>window.__pwned=2</script>', createdAt: '2026-10-28T12:00:00Z' },
    { name: 'long', message: 'W'.repeat(480), createdAt: '2026-10-28T12:00:00Z' },
  ] });
  await load(page);
  await run(page, 'guestbook');
  await expect(page.locator('#terminal-history')).toContainText('"<script>window.__pwned=2</script>"');
  expect(await page.locator('#terminal-history').evaluate((h) => h.querySelectorAll('img, script').length)).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('#terminal-history').evaluate((h) => h.scrollWidth <= h.clientWidth + 1)).toBe(true);
});

test('guestbook: emacs guestbook + C-c C-c, the Emacs way', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'hardware keyboard');
  let sent = null;
  await mockGuestbook(page, { onPost: (b) => { sent = b; } });
  await load(page);
  await run(page, 'emacs guestbook');
  await expect(page.locator('.editor-mode-line')).toContainText('guestbook.txt');
  await page.keyboard.type('Grace');
  await page.keyboard.press('Control+n');
  await page.keyboard.press('Control+e');
  await page.keyboard.press('Enter');
  await page.keyboard.type('C-c C-c is muscle memory');
  await page.waitForTimeout(150); // let the bot check token arrive
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+c');
  await expect.poll(() => sent).not.toBeNull();
  expect(sent.name).toBe('Grace');
  expect(sent.message).toBe('C-c C-c is muscle memory');
  await expect(page.locator('#terminal-history')).toContainText('note sent');
});

test('shell hardening: what a session of trying to break it turned up', async ({ page }) => {
  await load(page);
  // empty commands next to operators are syntax errors, not silently skipped or run
  for (const bad of ['|', '&&', ';', '&& ls', 'echo a && && echo b', 'ls &&']) {
    expect(await run(page, bad), bad).toContain('syntax error');
  }
  expect((await run(page, 'echo a && && echo b')).split('\n').slice(1).join('\n')).not.toContain('b');
  expect(await run(page, 'echo "a && b; c | d"')).toContain('a && b; c | d'); // still fine inside quotes
  // punctuation isn't treated as a typo of "?"
  expect(await run(page, '!')).not.toContain('did you mean');
  expect(await run(page, '$')).not.toContain('did you mean');
  // a failed expansion isn't saved, so !! still means the last real command
  await run(page, 'whoami');
  await run(page, '!nonexistent');
  expect(await run(page, '!!')).toContain('mubbie idoko');
  // cd -- dir works; bad counts and flags are errors
  await run(page, 'cd -- races');
  await expect(promptOf(page)).toHaveText(/^~\/mubbie\/races \$/);
  await run(page, 'cd ~');
  expect(await run(page, 'head -n abc bucketlist.md')).toContain('invalid number of lines');
  expect(await run(page, 'ls | grep -z x')).toContain('invalid option');
  // variables: prototype names are ordinary; runaway growth is capped
  await run(page, 'export __proto__=proto');
  expect(await run(page, 'echo $__proto__')).toContain('proto');
  await run(page, 'export A=aaaaaaaaaa');
  let last = '';
  for (let i = 0; i < 12; i++) last = await run(page, 'export A=$A$A');
  expect(last).toContain('value too long');
  // long words wrap instead of scrolling the terminal sideways
  await run(page, 'echo ' + 'x'.repeat(3000));
  expect(await page.locator('#terminal-history').evaluate((h) => h.scrollWidth <= h.clientWidth + 1)).toBe(true);
});

test('shell hardening: Ctrl+R with no match gives your line back', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'hardware keyboard');
  await load(page);
  const input = page.locator('#terminal-input');
  await input.focus();
  await input.fill('my draft');
  await input.press('Control+r');
  await input.pressSequentially('zzznomatch');
  await input.press('Enter');
  await expect(input).toHaveValue('my draft');
  await expect(promptOf(page)).toHaveText(/^~\/mubbie \$/);
});

test('editors: one at a time, and the page behind is unreachable while open', async ({ page }) => {
  await mockGuestbook(page);
  await load(page);
  await run(page, 'emacs');
  await expect(page.locator('.editor-overlay')).toHaveCount(1);
  // links behind the editor can't be reached by Tab
  expect(await page.locator('.nav-pills a').first().evaluate((a) => a.closest('[inert]') !== null)).toBe(true);
  // and a second editor refuses to open on top
  await page.evaluate(async () => (await import('/js/guestbook.js')).signGuestbook());
  await page.waitForTimeout(300);
  await expect(page.locator('.editor-overlay')).toHaveCount(1);
  // (on desktop the chord buttons are hidden unless there's something to send)
  await page.locator('.editor-key', { hasText: 'C-x C-c' }).evaluate((b) => b.click());
  await expect(page.locator('.editor-overlay')).toHaveCount(0);
  expect(await page.locator('[inert]').count()).toBe(0);
  expect(await page.evaluate(() => document.body.classList.contains('editor-open'))).toBe(false);
});

test('terminal: every alias runs its command', async ({ page }) => {
  // Reduced motion keeps `hack` (matrix) from taking over the screen mid-loop
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(page);
  // Read the aliases from the site's own registry, so new ones are covered automatically
  const aliases = await page.evaluate(async () => {
    const { COMMAND_DEFS } = await import('/js/terminal/commands.js');
    return COMMAND_DEFS.flatMap((c) => (c.aliases || []).map((a) => [a, c.name]));
  });
  expect(aliases.length).toBeGreaterThan(10);
  for (const [alias, name] of aliases) {
    const out = await run(page, alias);
    // aliases that open an editor (vi): close it, since the terminal is unreachable behind it
    if (await page.locator('.editor-overlay').count()) {
      await page.locator('.editor-key', { hasText: /:q|C-x C-c/ }).first().evaluate((b) => b.click());
    }
    expect.soft(out, `${alias} → ${name}`).not.toContain('command not found');
    // clear and its aliases wipe the history; everything else echoes the command line
    if (name !== 'clear') expect.soft(out, `${alias} → ${name}`).toContain(alias);
  }
  // man resolves aliases to their command's page
  expect(await run(page, 'man cls')).toContain('clear -');
});

test('terminal: weather shows live conditions, and degrades gracefully', async ({ page }) => {
  // Stand in for wttr.in so the test never depends on an outside service
  const conditions = { current_condition: [{ weatherCode: '113', weatherDesc: [{ value: 'Sunny' }],
    temp_F: '55', temp_C: '13', winddir16Point: 'NW', windspeedMiles: '5', humidity: '70' }] };
  await page.route('https://wttr.in/**', (route) => route.fulfill({ json: conditions }));
  await load(page);
  await run(page, 'weather');
  await expect(page.locator('#terminal-history')).toContainText('seattle: ☀️ 55°F/13°C · NW 5mph · 70% humidity');

  await page.unroute('https://wttr.in/**');
  await page.route('https://wttr.in/**', (route) => route.abort());
  await run(page, 'weather');
  await expect(page.locator('#terminal-history')).toContainText('could not fetch weather. try again later.');
});

test('theme default: forgets the explicit choice and follows the device again', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await load(page);
  await run(page, 'theme dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  expect(await run(page, 'theme default')).toContain('theme: default (light, following your device)');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('mubbie-theme-explicit'))).toBeNull();

  // Follows live OS changes again, and still does after a reload
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Aliases
  expect(await run(page, 'theme system')).toContain('theme: default');
  expect(await run(page, 'theme auto')).toContain('theme: default');
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
  ['ls -la', 'drwxr-xr-x  mubbie  staff  ./'],
  ['ll', 'drwxr-xr-x  mubbie  staff  projects/'],
  ['ls /dev', 'secrets.txt  fuel  goals  mood  about.txt'],
  ['ls -x', 'ls: unknown option: -x'],
  ['ls currently', 'tools/  reading  playing  learning  watching  planning  listening'],
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
  ['cd ~', '/dev $ cd ~'], // echoed at the prompt it was typed at
  ['cd nowhere', 'No such file or directory'],
  ['open', 'usage: open'],
  ['open s', 'ambiguous'],
  ['open zzz', 'not found'],
  ['theme blue', "unknown value 'blue'"],
  ['theme blue', 'use: dark, light, default'],
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
  ['cd toString', 'No such file or directory'],
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
  await expect(page.locator('.terminal-help-row')).toHaveCount(36);
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
    for (const [typed, expected] of [['neo', 'neofetch '], ['cd ra', 'cd races/'], ['open gi', 'open github'],
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
