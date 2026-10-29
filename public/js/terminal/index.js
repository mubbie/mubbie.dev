// ─── Terminal: wires the pieces together ───
//
//   state.js      where you are, your variables
//   router.js     where output goes (screen, or the next stage of a pipe)
//   commands/     the command handlers, by theme
//   executor.js   runs a typed line: history expansion, ; && ||, pipes, $?
//   input.js      the input line: keys, caret, Ctrl+R, Tab, hints
//   shell.js, fs.js, history.js, completer.js, output.js, editor.js: the building blocks

import { ALL_COMMANDS } from './commands.js';
import { createHistory } from './history.js';
import { createOutput } from './output.js';
import { displayPath } from './fs.js';
import { FILTERS } from './shell.js';
import { createShellState } from './state.js';
import { createRouter } from './router.js';
import { createHandlers } from './commands/index.js';
import { createExecutor } from './executor.js';
import { createInput } from './input.js';
import { isMatrixActive, stopMatrix } from '../matrix.js';
import { fetchJSON } from '../dom.js';

// Used until data/fortunes.json loads (or if it can't)
const DEFAULT_FORTUNES = [
  'the best time to start was yesterday. the second best time is now.',
  'fortune favors the bold.',
  'have you tried turning it off and on again?',
];

export function initTerminal() {
  const els = {
    terminalEl: document.getElementById('terminal'),
    historyEl: document.getElementById('terminal-history'),
    typedEl: document.getElementById('terminal-typed'),
    typedAfterEl: document.getElementById('terminal-typed-after'),
    inputEl: document.getElementById('terminal-input'),
    promptEl: document.querySelector('.terminal-input-line .terminal-prompt'),
    inputLine: document.querySelector('.terminal-input-line'),
  };
  if (!els.terminalEl || !els.inputEl) return;

  const sh = createShellState();
  const promptText = () => `${displayPath(sh.cwd)} $`;
  const base = createOutput(els.historyEl, promptText);
  const history = createHistory();
  const router = createRouter(base);

  let fortunes = DEFAULT_FORTUNES;
  fetchJSON('data/fortunes.json').then((data) => { fortunes = data; }).catch(() => {});

  const handlers = createHandlers({
    out: router.out,
    sh,
    history,
    getFortunes: () => fortunes,
    focusInput: () => els.inputEl.focus(),
  });

  // Everything Tab, "did you mean", man and which know as a command name
  const commandNames = [...new Set([...ALL_COMMANDS, ...Object.keys(FILTERS)])].sort();

  const run = createExecutor({ router, handlers, sh, history, base, promptText, commandNames });

  createInput({
    els,
    history,
    base,
    promptText,
    getCompletionContext: () => ({ cwd: sh.cwd, commands: commandNames }),
    onSubmit: run,
    onInterrupt(typed) {
      base.cancelPending();
      if (isMatrixActive()) stopMatrix();
      base.addLine(promptText(), `${typed}^C`, null);
      sh.env['?'] = '130';
    },
  });
  // the terminal loads after the page; this marks it ready for input (tests wait for it)
  els.terminalEl.dataset.ready = 'true';
}
