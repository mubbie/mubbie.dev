// ─── Greeting text + wave emoji ───

import { popPopcorn } from './popcorn.js';

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
    'What\'s poppin\'',
  ],
  evening: [
    'Good evening',
    'Evening',
    'What\'s poppin\'',
    'Twilight greetings',
  ],
};

export function initGreeting() {
  const el = document.getElementById('greeting-text');
  if (!el) return;

  const hour = new Date().getHours();
  let period;
  if (hour < 12) period = 'morning';
  else if (hour < 18) period = 'afternoon';
  else period = 'evening';

  const options = GREETINGS[period];
  const chosen = options[Math.floor(Math.random() * options.length)];
  el.textContent = chosen;

  // Easter egg: clicking "What's poppin'" triggers popcorn
  if (chosen === 'What\'s poppin\'') {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => popPopcorn(el));
  }
}

export function initWaveEmoji() {
  const wave = document.querySelector('.wave');
  if (!wave) return;

  const hands = ['👋🏾', '💪🏾', '✌🏾', '🤟🏾', '🤙🏾'];
  let index = Math.floor(Math.random() * hands.length);
  wave.textContent = hands[index];

  wave.addEventListener('click', () => {
    index = (index + 1) % hands.length;
    wave.textContent = hands[index];
    wave.style.animation = 'none';
    wave.offsetHeight; // force reflow
    wave.style.animation = '';
  });
}
