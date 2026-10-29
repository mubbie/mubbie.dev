// ─── Virtual filesystem: the site's sections as directories ───
//
//   /                      dev/  home/
//   /dev                   hidden developer files (FILES['/dev/…'])
//   /home/mubbie  (~)      projects/ writing/ currently/ races/ bucketlist/ connect/
//                          about.txt  bucketlist.md
//   ~/currently            reading, playing, … (cat-able) + tools/
//   ~/currently/tools      the dock apps
//   ~/races                2026 races + cycling/
//   ~/races/cycling        2027 rides
//
// Paths are kept as absolute strings ("/home/mubbie/races"). Directory contents
// that mirror page content are read from the rendered page, like grep does.

import { FILES, FILESYSTEM } from './commands.js';

export const HOME = '/home/mubbie';

const texts = (selector, pick = (el) => el.textContent) =>
  [...document.querySelectorAll(selector)].map((el) => pick(el).trim()).filter(Boolean);

// Directory → its subdirectories and files (files are read lazily from the page)
const DIRS = {
  '/': { dirs: ['dev', 'home'], files: () => [] },
  '/dev': { dirs: [], files: () => FILESYSTEM['/dev'] },
  '/home': { dirs: ['mubbie'], files: () => [] },
  [HOME]: { dirs: ['projects', 'writing', 'currently', 'races', 'bucketlist', 'connect'], files: () => ['about.txt', 'bucketlist.md'] },
  [`${HOME}/projects`]: { dirs: [], files: () => texts('.project-card h3') },
  [`${HOME}/writing`]: { dirs: [], files: () => texts('.writing-item h3') },
  [`${HOME}/currently`]: { dirs: ['tools'], files: () => texts('.currently-label') },
  [`${HOME}/currently/tools`]: { dirs: [], files: () => texts('.dock-item', (el) => el.querySelector('.dock-label')?.textContent || '') },
  [`${HOME}/races`]: { dirs: ['cycling'], files: () => texts('#races-list .race-name', (el) => el.firstChild?.textContent || '') },
  [`${HOME}/races/cycling`]: { dirs: [], files: () => texts('#race-rail .rail-name') },
  [`${HOME}/bucketlist`]: { dirs: [], files: () => texts('.bucket-text') },
  [`${HOME}/connect`]: { dirs: [], files: () => texts('.connect-link') },
};

// Names that jump to a section from anywhere (the old cd shortcuts)
export const SHORTCUTS = {
  projects: `${HOME}/projects`,
  writing: `${HOME}/writing`,
  currently: `${HOME}/currently`,
  now: `${HOME}/currently`,
  tools: `${HOME}/currently/tools`,
  uses: `${HOME}/currently/tools`,
  races: `${HOME}/races`,
  running: `${HOME}/races`,
  cycling: `${HOME}/races/cycling`,
  bucketlist: `${HOME}/bucketlist`,
  bucket: `${HOME}/bucketlist`,
  connect: `${HOME}/connect`,
  dev: '/dev',
};

// Where each directory lives on the page: [element id, race tab to open]
const PAGE_TARGETS = {
  [HOME]: [null],
  [`${HOME}/projects`]: ['projects'],
  [`${HOME}/writing`]: ['writing'],
  [`${HOME}/currently`]: ['currently'],
  [`${HOME}/currently/tools`]: ['tools'],
  [`${HOME}/races`]: ['races', '2026'],
  [`${HOME}/races/cycling`]: ['races', '2027'],
  [`${HOME}/bucketlist`]: ['bucketlist'],
  [`${HOME}/connect`]: ['connect'],
};

export function pageTarget(path) {
  return Object.hasOwn(PAGE_TARGETS, path) ? PAGE_TARGETS[path] : undefined;
}

export function isDir(path) {
  return Object.hasOwn(DIRS, path);
}

// "/home/mubbie/races" → "~/mubbie/races" (the site's prompt has always said ~/mubbie)
export function displayPath(path) {
  if (path === HOME || path.startsWith(`${HOME}/`)) return `~/mubbie${path.slice(HOME.length)}`;
  return path;
}

// Resolve a typed path against cwd. Handles ~, ~/mubbie, /abs, ., .., trailing slashes.
// Returns an absolute path string (which may not exist).
export function resolve(cwd, input) {
  let raw = String(input).trim();
  let base;
  if (raw === '~' || raw.startsWith('~/')) {
    base = HOME;
    raw = raw.slice(1);
    // "~/mubbie/…" is how the prompt shows home, so accept it too
    if (/^\/mubbie(\/|$)/i.test(raw)) raw = raw.slice('/mubbie'.length);
  } else if (raw.startsWith('/')) {
    base = '/';
  } else {
    base = cwd;
  }
  const parts = base === '/' ? [] : base.split('/').filter(Boolean);
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg.toLowerCase());
  }
  return `/${parts.join('/')}`;
}

// Resolve a directory the way cd does: real path first, then a section shortcut
export function resolveDir(cwd, input) {
  const path = resolve(cwd, input);
  if (isDir(path)) return path;
  const key = String(input).trim().toLowerCase().replace(/\/+$/, '');
  return Object.hasOwn(SHORTCUTS, key) ? SHORTCUTS[key] : null;
}

// Entries of a directory: subdirectories (with a trailing /) then files
export function list(path) {
  if (!isDir(path)) return null;
  const { dirs, files } = DIRS[path];
  return [...dirs.map((d) => `${d}/`), ...files()];
}

// Read a file's contents, or { error } in the shape a shell would print
export function readFile(cwd, input) {
  const path = resolve(cwd, input);
  if (isDir(path)) return { error: `${input}: Is a directory` };

  const name = path.split('/').pop();
  const parent = path.slice(0, path.length - name.length - 1) || '/';

  if (parent === '/dev' && Object.hasOwn(FILES, path)) return { text: FILES[path] };
  if (path === `${HOME}/about.txt`) return { text: FILES['about.txt'] };
  if (path === `${HOME}/bucketlist.md`) {
    // Same lines the bucket list's terminal window shows
    const lines = [...document.querySelectorAll('.bucket-item')].map((el) => {
      const box = el.classList.contains('done') ? '- [x]' : '- [ ]';
      const text = el.querySelector('.bucket-text')?.textContent || '';
      const note = el.querySelector('.bucket-note')?.textContent;
      return note ? `${box} ${text}  ${note}` : `${box} ${text}`;
    });
    return { text: lines.join('\n') };
  }
  if (parent === `${HOME}/currently`) {
    // cat reading → "Designing Data-Intensive Applications"
    const tile = [...document.querySelectorAll('.currently-item')]
      .find((el) => el.querySelector('.currently-label')?.textContent.toLowerCase() === name);
    if (tile) return { text: tile.querySelector('.currently-value')?.textContent || '' };
  }

  // Backward compatible: bare names from `ls /dev` ("secrets.txt") resolve to /dev from anywhere
  if (Object.hasOwn(FILES, `/dev/${name}`) && !String(input).includes('/')) return { text: FILES[`/dev/${name}`] };
  if (Object.hasOwn(FILES, String(input).toLowerCase())) return { text: FILES[String(input).toLowerCase()] };

  return { error: `${input}: No such file or directory` };
}

// Every directory, for tree
export function allDirs() {
  return Object.keys(DIRS);
}
