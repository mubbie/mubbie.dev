// ─── Footer: year + weather/clock ───

import { fetchWeather } from './weather.js';

export function initFooter() {
  const el = document.getElementById('footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

export function initFooterMeta() {
  const el = document.getElementById('footer-meta');
  if (!el) return;

  let weatherText = '';

  function render() {
    const time = new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    el.textContent = weatherText
      ? `${weatherText} · ${time}`
      : time;
  }

  fetchWeather()
    .then((w) => {
      if (!w) return;
      weatherText = `${w.emoji} ${w.f}°F/${w.c}°C`;
      render();
    })
    .catch(() => {});

  render();
  setInterval(render, 1000);
}
