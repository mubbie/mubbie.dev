// ─── Popcorn explosion effect ───

const KERNELS = ['🍿', '🍿', '🍿', '🌽', '🍿', '🍿'];

export function popPopcorn(originEl) {
  const rect = originEl
    ? originEl.getBoundingClientRect()
    : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 20;

  for (let i = 0; i < count; i++) {
    const kernel = document.createElement('span');
    kernel.className = 'popcorn-kernel';
    kernel.textContent = KERNELS[Math.floor(Math.random() * KERNELS.length)];
    kernel.setAttribute('aria-hidden', 'true');

    // Random direction and distance
    const angle = (Math.random() * 360) * (Math.PI / 180);
    const distance = 80 + Math.random() * 180;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 60; // bias upward

    kernel.style.left = cx + 'px';
    kernel.style.top = cy + 'px';
    kernel.style.setProperty('--dx', dx + 'px');
    kernel.style.setProperty('--dy', dy + 'px');
    kernel.style.animationDelay = (Math.random() * 200) + 'ms';

    document.body.appendChild(kernel);
    kernel.addEventListener('animationend', () => kernel.remove());
  }
}
