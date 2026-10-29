// ─── grep: search the whole site, or a file (grep <pattern> <file>) ───

import { readFile, DEV_FILES } from '../fs.js';
import { FILTERS, unquote } from '../shell.js';

// What grep searches on the page: [label, row selector, row → text when it matches or null]
const SECTIONS = [
  ['projects/', '.project-card', (el, has) => {
    const name = el.querySelector('h3')?.textContent || '';
    const desc = el.querySelector('p')?.textContent || '';
    return has(name) || has(desc) ? `${name}: ${desc}` : null;
  }],
  ['writing/', '.writing-item', (el, has) => {
    const title = el.querySelector('h3')?.textContent || '';
    return has(title) ? title : null;
  }],
  ['currently/tools/', '.dock-item', (el, has) => {
    const name = el.querySelector('.dock-label')?.textContent || el.getAttribute('aria-label') || '';
    const note = el.dataset.note || '';
    return has(`${name} ${note}`) ? (note ? `${name}: ${note}` : name) : null;
  }],
  ['races/', '.race-item', (el, has) => {
    const name = el.querySelector('.race-name')?.firstChild?.textContent || '';
    const loc = el.querySelector('.race-location')?.textContent || '';
    const date = el.querySelector('.race-date')?.textContent || '';
    return has(name + loc) ? `${name}: ${loc}, ${date}` : null;
  }],
  ['races/2027/', '.rail-race', (el, has) => {
    // full official name when there is one (it's the row's hover title)
    const name = el.title || el.querySelector('.rail-name')?.textContent || '';
    // the · separators are CSS-only, so join the detail parts explicitly
    const meta = [...el.querySelectorAll('.rail-part')].map((part) => part.textContent).join(' · ');
    return has(`${name} ${meta}`) ? `${name} (${meta})` : null;
  }],
  ['bucketlist/', '.bucket-item', (el, has) => {
    const text = el.querySelector('.bucket-text')?.textContent || '';
    return has(text) ? `${el.classList.contains('done') ? '✓' : '○'} ${text}` : null;
  }],
  ['currently/', '.currently-item', (el, has) => {
    const label = el.querySelector('.currently-label')?.textContent || '';
    const value = el.querySelector('.currently-value')?.textContent || '';
    return has(label + value) ? `${label}: ${value}` : null;
  }],
  ['connect/', '.connect-link', (el, has) => {
    const text = el.textContent.trim();
    return has(text) ? text : null;
  }],
];

export function searchCommands({ out, sh }) {
  return {
    grep(trimmed, arg) {
      if (!arg.trim()) {
        out.addLine('$', trimmed, 'usage: grep <term>  (or: … | grep <pattern>)', true);
        return;
      }
      // grep <pattern> <file>: search a file, like a real grep
      const words = arg.trim().split(/\s+/);
      if (words.length > 1) {
        const file = readFile(sh.cwd, words[words.length - 1]);
        if (!file.error) {
          const r = FILTERS.grep(file.text.split('\n'), words.slice(0, -1));
          if (r.error) out.addLine('$', trimmed, r.error, true);
          else out.addLine('$', trimmed, r.lines.length ? r.lines.join('\n') : null, false);
          if (r.failed) sh.lastFailed = true;
          return;
        }
      }

      const term = unquote(arg.trim()).toLowerCase();
      const has = (text) => text.toLowerCase().includes(term);
      const found = SECTIONS
        .map(([name, selector, match]) => ({
          name,
          matches: [...document.querySelectorAll(selector)].map((el) => match(el, has)).filter(Boolean),
        }))
        // /dev file names only (not contents: secrets stay hidden)
        .concat({ name: '/dev/', matches: DEV_FILES.filter(has) })
        .filter((s) => s.matches.length);
      const total = found.reduce((n, s) => n + s.matches.length, 0);

      out.addLine('$', trimmed, null);
      if (!total) {
        out.addLine(null, null, `no matches for '${unquote(arg.trim())}'`, true);
        return;
      }
      found.forEach((s) => {
        out.addOk(s.name);
        s.matches.forEach((m) => out.addLine(null, null, `  ${m}`));
      });
      out.addLine(null, null, `\n${total} match${total === 1 ? '' : 'es'}`);
    },
  };
}
