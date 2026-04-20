// ─── Matrix rain easter egg ───

let active = false;
let raf = null;

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function startMatrix() {
  if (active) return;
  active = true;

  const canvas = document.getElementById('matrix-canvas');
  if (!canvas) return;
  canvas.classList.add('on');

  // Show tap-to-exit hint
  let hint = document.getElementById('matrix-exit-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'matrix-exit-hint';
    hint.textContent = 'tap anywhere to exit';
    document.body.appendChild(hint);
  }
  hint.classList.add('on');

  // Tap/click canvas to exit
  canvas.addEventListener('click', stopMatrix);

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const fontSize = 14;
  let cols = Math.floor(canvas.width / fontSize);
  let drops = Array(cols).fill(1);

  function draw() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#22c55e';
    ctx.font = fontSize + 'px monospace';

    for (let i = 0; i < drops.length; i++) {
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      ctx.fillText(char, i * fontSize, drops[i] * fontSize);

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
    raf = requestAnimationFrame(draw);
  }

  draw();

  function onResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const newCols = Math.floor(canvas.width / fontSize);
    if (newCols > cols) {
      drops = drops.concat(Array(newCols - cols).fill(1));
    } else if (newCols < cols) {
      drops = drops.slice(0, newCols);
    }
    cols = newCols;
  }
  window.addEventListener('resize', onResize);
  canvas._onResize = onResize;
}

export function stopMatrix() {
  if (!active) return;
  active = false;

  const canvas = document.getElementById('matrix-canvas');
  if (!canvas) return;
  canvas.classList.remove('on');

  if (raf) {
    cancelAnimationFrame(raf);
    raf = null;
  }
  if (canvas._onResize) {
    window.removeEventListener('resize', canvas._onResize);
    canvas._onResize = null;
  }

  canvas.removeEventListener('click', stopMatrix);

  const hint = document.getElementById('matrix-exit-hint');
  if (hint) hint.classList.remove('on');

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function isMatrixActive() {
  return active;
}
