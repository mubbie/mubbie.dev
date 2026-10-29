// ─── Seattle Hangouters invite: typed random activity + popcorn on join ───

import { popPopcorn } from './popcorn.js';

// Ideas pulled from past Hangouters outings. Shuffled, so every visit gets a different order.
export const ACTIVITIES = [
  'game night', 'watch party', 'soccer game', 'lifting session', 'bowling hangout', 'corn maze',
  'whirlyball', 'movie night', 'arcade night', 'minigolf', 'basketball game', 'brunch', 'dinner',
  'group run', 'road trip', 'race', 'swim meet', 'laser tag', 'bubble soccer', 'flag football',
  'potluck', 'simulation golf', 'topgolf', 'hiking trip', 'skiing trip', 'karting trip',
  'dance class', 'cooking class', 'skydive', 'soccer clinic', 'trivia night', 'karaoke',
  'cocktail class', 'christmas party', 'afro dance class', 'escape room', 'pickleball',
  'run club 5k', 'el clásico watch party', 'friendsgiving', 'oktoberfest', 'yoga session',
  'costume party', 'gingerbread house night', 'candlelight concert', 'aquarium day',
  'snowboard trip', 'jollof wars', 'volunteer day', "new year's eve party", 'afrobeats party',
];
const HOLD_MS = 2200;
const TYPE_MS = 55;

export function initHangout() {
  const word = document.getElementById('hangout-activity');
  const join = document.getElementById('hangout-join');

  // The link still opens; the popcorn is a send-off
  if (join) join.addEventListener('click', () => popPopcorn(join));

  if (!word) return;

  // Shuffle bag: every activity shows once before any repeats, and no back-to-back repeats
  let bag = [];
  let current = null;
  const next = () => {
    if (!bag.length) {
      bag = [...ACTIVITIES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.at(-1) === current) bag.unshift(bag.pop());
    }
    current = bag.pop();
    return current;
  };

  // Activities wrap to different line counts. Reserve the tallest so the card, the
  // button, and everything below it don't jump as the word changes.
  const pitch = word.closest('p');
  function reserveHeight() {
    const shown = word.textContent;
    pitch.style.minHeight = '';
    let tallest = 0;
    for (const activity of ACTIVITIES) {
      word.textContent = activity;
      tallest = Math.max(tallest, pitch.offsetHeight);
    }
    word.textContent = shown;
    pitch.style.minHeight = `${tallest}px`;
  }
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(reserveHeight, 150);
  });

  word.textContent = next();
  reserveHeight();
  // Webfont swap changes line breaks; measure again once it lands
  document.fonts?.ready.then(reserveHeight);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const wait = (ms) => new Promise((done) => setTimeout(done, ms));

  async function cycle() {
    for (;;) {
      await wait(HOLD_MS);
      // Pause while the tab is hidden so it doesn't spin in the background
      if (document.hidden) continue;
      word.classList.add('typing');
      for (let n = word.textContent.length; n >= 0; n--) {
        word.textContent = word.textContent.slice(0, n);
        await wait(TYPE_MS / 2);
      }
      const upcoming = next();
      for (let n = 1; n <= upcoming.length; n++) {
        word.textContent = upcoming.slice(0, n);
        await wait(TYPE_MS);
      }
      word.classList.remove('typing');
    }
  }

  cycle();
}
