// ─── Shell state: where you are and your variables ───

import { HOME, displayPath } from './fs.js';

export function createShellState() {
  const sh = {
    cwd: HOME,
    prevCwd: HOME,
    visitedDev: false,
    // set by a handler (grep with no match, false) to make its stage exit non-zero
    lastFailed: false,
    // no prototype: "__proto__" or "constructor" are just names here
    env: Object.assign(Object.create(null), {
      USER: 'mubbie',
      HOME,
      SHELL: '/bin/mubsh',
      EDITOR: 'emacs',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      '?': '0',
    }),
  };
  Object.defineProperty(sh.env, 'PWD', { get: () => displayPath(sh.cwd), enumerable: true });
  return sh;
}
