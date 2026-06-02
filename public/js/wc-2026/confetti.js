// ─── Soccer ball confetti ───
// Mirrors the popcorn pattern but with footballs (and the occasional trophy).
// Respects prefers-reduced-motion so it doesn't ambush motion-sensitive users.

const BALLS = ['⚽', '⚽', '⚽', '⚽', '🏆', '⚽', '⚽', '🥅'];

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

export function kickConfetti(originEl, count = 24) {
  if (reducedMotion()) return;

  const rect = originEl
    ? originEl.getBoundingClientRect()
    : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    spawnBall(cx, cy);
  }
}

function spawnBall(cx, cy) {
  const ball = document.createElement('span');
  ball.className = 'wc-confetti';
  ball.textContent = BALLS[Math.floor(Math.random() * BALLS.length)];
  ball.setAttribute('aria-hidden', 'true');

  const angle = Math.random() * Math.PI * 2;
  const distance = 80 + Math.random() * 220;
  const dx = Math.cos(angle) * distance;
  const dy = Math.sin(angle) * distance - 60;

  ball.style.left = `${cx}px`;
  ball.style.top = `${cy}px`;
  ball.style.setProperty('--dx', `${dx}px`);
  ball.style.setProperty('--dy', `${dy}px`);
  ball.style.animationDelay = `${Math.random() * 200}ms`;

  document.body.appendChild(ball);
  ball.addEventListener('animationend', () => ball.remove(), { once: true });
}
