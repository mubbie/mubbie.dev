// ─── Editors: a small Emacs (the real one, spiritually) and a Vim you can't escape ───
//
// openEmacs({ name, text, readOnly, mode, onSubmit, onExit }) opens a full-screen buffer:
//   C-x C-c  exit            C-x C-s  save            C-c C-c  submit (when onSubmit)
//   M-x      commands: doctor, butterfly, tetris, version, kill-emacs
//   C-a C-e C-f C-b C-n C-p C-k C-d  movement and editing, C-g quit
// Meta is Alt, or Esc then the key (the classic way on keyboards without Meta).
//
// openVim({ onExit }) is the trap. :q gets you out.

const isTouch = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// The shell of both editors: a full-screen window with a buffer, a status line and an echo line
function createFrame(label) {
  const overlay = el('div', 'editor-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', label);
  const buffer = el('textarea', 'editor-buffer');
  buffer.spellcheck = false;
  buffer.setAttribute('autocapitalize', 'off');
  buffer.setAttribute('autocomplete', 'off');
  buffer.setAttribute('aria-label', `${label} buffer`);
  const modeLine = el('div', 'editor-mode-line');
  const echo = el('div', 'editor-echo');
  echo.setAttribute('aria-live', 'polite');
  const keys = el('div', 'editor-keys');
  overlay.append(buffer, modeLine, echo, keys);
  document.body.appendChild(overlay);
  document.body.classList.add('editor-open');
  return { overlay, buffer, modeLine, echo, keys };
}

function closeFrame(frame) {
  frame.overlay.remove();
  document.body.classList.remove('editor-open');
}

// On-screen keys for phones (no Ctrl, Meta or Esc on a phone keyboard)
function addKey(frame, label, onPress) {
  const button = el('button', 'editor-key', label);
  button.type = 'button';
  // keep focus (and the phone keyboard) in the buffer
  button.addEventListener('mousedown', (e) => e.preventDefault());
  button.addEventListener('click', onPress);
  frame.keys.appendChild(button);
  return button;
}

// ─── Textarea motions ───

function lineBounds(text, pos) {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  const nl = text.indexOf('\n', pos);
  return { start, end: nl === -1 ? text.length : nl };
}

function moveVertical(buffer, dir) {
  const text = buffer.value;
  const pos = buffer.selectionStart;
  const { start, end } = lineBounds(text, pos);
  const col = pos - start;
  if (dir < 0) {
    if (start === 0) return;
    const prev = lineBounds(text, start - 1);
    buffer.setSelectionRange(Math.min(prev.start + col, prev.end), Math.min(prev.start + col, prev.end));
  } else {
    if (end >= text.length) return;
    const next = lineBounds(text, end + 1);
    buffer.setSelectionRange(Math.min(next.start + col, next.end), Math.min(next.start + col, next.end));
  }
}

function lineNumber(buffer) {
  return buffer.value.slice(0, buffer.selectionStart).split('\n').length;
}

// ─── M-x doctor: a tiny ELIZA, like the one Emacs ships ───

const REFLECT = { i: 'you', me: 'you', my: 'your', am: 'are', mine: 'yours', "i'm": "you're", you: 'I', your: 'my', yours: 'mine', are: 'am' };
const reflect = (s) => s.toLowerCase().replace(/[.!?]+$/, '').split(/\s+/).map((w) => REFLECT[w] || w).join(' ');

const DOCTOR_RULES = [
  [/\b(vim|vi)\b/i, () => 'Have you considered that vim might be the source of your problems?'],
  [/\bemacs\b/i, () => 'Emacs is a great comfort to many. Tell me more.'],
  [/\bi need (.+)/i, (m) => `Why do you need ${reflect(m[1])}?`],
  [/\bi(?: am|'m) (.+)/i, (m) => `How long have you been ${reflect(m[1])}?`],
  [/\bi feel (.+)/i, (m) => `Do you often feel ${reflect(m[1])}?`],
  [/\bi (?:want|wish) (.+)/i, (m) => `What would it mean to you if you got ${reflect(m[1])}?`],
  [/\bbecause\b/i, () => 'Is that the real reason?'],
  [/\bmy (\w+)/i, (m) => `Tell me more about your ${m[1].toLowerCase()}.`],
  [/\b(mother|father|family|parents)\b/i, () => 'Tell me more about your family.'],
  [/\b(bug|deploy|prod|production|outage|test)s?\b/i, () => 'Does it help to talk about the bug, or would you rather blame the build?'],
  [/\b(run|running|marathon|ride|bike|cycling)\b/i, () => 'How do you feel when you are out there, mile after mile?'],
  [/\b(sad|tired|stressed|anxious|lonely)\b/i, () => 'I am sorry to hear that. What do you think is behind it?'],
  [/^\s*yes\b/i, () => 'You seem quite sure.'],
  [/^\s*no\b/i, () => 'Why not?'],
  [/\?\s*$/, () => 'Why do you ask?'],
];
const DOCTOR_DEFAULTS = ['Can you elaborate on that?', 'Why do you say that?', 'I see. And how does that make you feel?', 'What makes you believe that?', 'Go on.', 'Earlier you said something similar. Is that connected?'];

let defaultIndex = 0;
export function doctorReply(text) {
  for (const [pattern, reply] of DOCTOR_RULES) {
    const m = pattern.exec(text);
    if (m) return reply(m);
  }
  defaultIndex = (defaultIndex + 1) % DOCTOR_DEFAULTS.length;
  return DOCTOR_DEFAULTS[defaultIndex];
}

const BUTTERFLY = [
  '        _      _',
  '   ,-.,\'\\    /\'.,-.',
  '  (   \\  \\  /  /   )',
  '   `-._\\  \\/  /_.-\'',
  '     ,-\'  /\\  `-.',
  '    (    /  \\    )',
  '     `--\'    `--\'',
].join('\n');

const SCRATCH = ';; This buffer is for text that is not saved, and for Lisp evaluation.\n;; To create a file, visit it with C-x C-f and enter text in its buffer.\n;; (On mubbie.dev: M-x doctor, M-x butterfly. C-x C-c to leave.)\n\n';

const MX_COMMANDS = ['doctor', 'butterfly', 'tetris', 'version', 'kill-emacs'];

// ─── Emacs ───

export function openEmacs({ name = '*scratch*', text = SCRATCH, readOnly = false, mode = 'Lisp Interaction', onSubmit = null, submitLabel = 'submit', widget = null, caret = null, onExit = () => {} } = {}) {
  const frame = createFrame('Emacs');
  const { buffer, modeLine, echo } = frame;
  frame.overlay.classList.add('editor-emacs');

  let state = { name, mode, readOnly, original: text, doctor: null };
  let prefix = null; // 'C-x', 'C-c', 'M' (Esc), or 'ask' while a yes/no question is open
  let minibuffer = null; // the M-x input while it's open
  let echoTimer = null;

  function setBuffer(next) {
    state = { ...state, ...next };
    buffer.value = next.text ?? buffer.value;
    buffer.readOnly = Boolean(state.readOnly);
    buffer.setSelectionRange(buffer.value.length, buffer.value.length);
    updateModeLine();
  }

  function updateModeLine() {
    const flag = state.readOnly ? '%%' : buffer.value !== state.original ? '**' : '--';
    modeLine.textContent = `-UUU:${flag}--F1  ${state.name.padEnd(18)} All L${lineNumber(buffer)}   (${state.mode})`;
  }

  function message(text, { sticky = false, html = null } = {}) {
    clearTimeout(echoTimer);
    echo.replaceChildren();
    if (html) echo.appendChild(html);
    else echo.textContent = text;
    if (!sticky) echoTimer = setTimeout(() => { if (!minibuffer) echo.textContent = ''; }, 4000);
  }

  function exit(why) {
    document.removeEventListener('keydown', onKey, true);
    closeFrame(frame);
    onExit(why);
  }

  // ─── Minibuffer (M-x, yes/no questions) ───
  function ask(promptText, onAnswer, complete = []) {
    echo.replaceChildren();
    const label = el('span', 'editor-mini-prompt', promptText);
    const input = el('input', 'editor-mini-input');
    input.setAttribute('aria-label', promptText);
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
    echo.append(label, input);
    minibuffer = input;
    input.focus();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const answer = input.value.trim();
        closeMini();
        onAnswer(answer);
      } else if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'g')) {
        e.preventDefault();
        closeMini();
        message('Quit');
      } else if (e.key === 'Tab' && complete.length) {
        e.preventDefault();
        const hits = complete.filter((c) => c.startsWith(input.value));
        if (hits.length === 1) input.value = hits[0];
        else if (hits.length > 1) message(`Possible completions: ${hits.join('  ')}`, { sticky: true });
      }
      e.stopPropagation();
    });
  }

  function closeMini() {
    minibuffer = null;
    echo.textContent = '';
    buffer.focus();
  }

  function mx() {
    ask('M-x ', runCommand, MX_COMMANDS);
  }

  function runCommand(cmd) {
    if (!cmd) return;
    if (cmd === 'doctor') {
      const intro = 'I am the psychotherapist.  Please, describe your problems.  Each time\nyou are finished talking, type RET twice.\n\n';
      setBuffer({ name: '*doctor*', mode: 'Doctor', readOnly: false, text: intro, original: intro, doctor: { from: intro.length } });
    } else if (cmd === 'butterfly') {
      ask('Do you really want to unleash the powers of the butterfly? (yes or no) ', (answer) => {
        if (!/^y(es)?$/i.test(answer)) { message('Please answer yes or no.'); return; }
        setBuffer({ name: '*butterfly*', mode: 'Fundamental', readOnly: true, text: `\n\n${BUTTERFLY}\n`, original: '' });
        message('Amazing physics going on...', { sticky: true });
        setTimeout(() => {
          const link = el('a', 'editor-link', 'Successfully flipped one bit! (xkcd #378)');
          link.href = 'https://xkcd.com/378/';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          message('', { html: link, sticky: true });
        }, 1600);
      });
    } else if (cmd === 'tetris') {
      message('Tetris is not available in this build. Try M-x doctor.');
    } else if (cmd === 'version') {
      message('GNU Emacs 30.1 (mubbie.dev edition, of 2026-10-28)');
    } else if (cmd === 'kill-emacs') {
      exit('quit');
    } else {
      message(`[No match] ${cmd}`);
    }
  }

  // ─── Keys ───
  function insertDoctorReply() {
    const said = buffer.value.slice(state.doctor.from).trim();
    if (!said) return;
    const reply = `\n\n${doctorReply(said)}\n\n`;
    buffer.value = buffer.value.replace(/\s*$/, '') + reply;
    state.doctor.from = buffer.value.length;
    buffer.setSelectionRange(buffer.value.length, buffer.value.length);
    buffer.scrollTop = buffer.scrollHeight;
  }

  function onKey(e) {
    if (minibuffer) return; // the minibuffer handles its own keys
    const ctrl = e.ctrlKey && !e.metaKey;
    const key = e.key.toLowerCase();
    const meta = e.altKey || prefix === 'M';

    // Prefix sequences: C-x …, C-c …
    if (prefix === 'C-x') {
      e.preventDefault();
      prefix = null;
      if (ctrl && key === 'c') exit('quit');
      else if (ctrl && key === 's') {
        if (state.readOnly) message(`Buffer is read-only: #<buffer ${state.name}>`);
        else if (buffer.value === state.original) message('(No changes need to be saved)');
        else message(`Cannot save ${state.name}: this filesystem is read-only. (C-x C-c to leave)`);
      } else if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) message(`C-x ${ctrl ? 'C-' : ''}${key} is undefined`);
      else prefix = 'C-x';
      return;
    }
    if (prefix === 'C-c') {
      e.preventDefault();
      prefix = null;
      if (ctrl && key === 'c' && onSubmit) onSubmit({ text: buffer.value, message, exit });
      else if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) prefix = 'C-c';
      else message(`C-c ${ctrl ? 'C-' : ''}${key} is undefined`);
      return;
    }

    if (meta && (e.code === 'KeyX' || key === 'x')) {
      e.preventDefault();
      prefix = null;
      mx();
      return;
    }
    if (prefix === 'M') prefix = null;

    if (e.key === 'Escape') {
      e.preventDefault();
      prefix = 'M';
      message('ESC-', { sticky: true });
      return;
    }

    if (ctrl) {
      const text = buffer.value;
      const pos = buffer.selectionStart;
      const { start, end } = lineBounds(text, pos);
      const handled = {
        x: () => { prefix = 'C-x'; message('C-x-', { sticky: true }); },
        c: () => { prefix = 'C-c'; message('C-c-', { sticky: true }); },
        g: () => { prefix = null; message('Quit'); },
        a: () => buffer.setSelectionRange(start, start),
        e: () => buffer.setSelectionRange(end, end),
        f: () => buffer.setSelectionRange(pos + 1, pos + 1),
        b: () => buffer.setSelectionRange(Math.max(0, pos - 1), Math.max(0, pos - 1)),
        n: () => moveVertical(buffer, 1),
        p: () => moveVertical(buffer, -1),
        k: () => {
          if (state.readOnly) return message(`Buffer is read-only: #<buffer ${state.name}>`);
          const cut = pos === end ? end + 1 : end;
          buffer.value = text.slice(0, pos) + text.slice(cut);
          buffer.setSelectionRange(pos, pos);
        },
        d: () => {
          if (state.readOnly) return message(`Buffer is read-only: #<buffer ${state.name}>`);
          buffer.value = text.slice(0, pos) + text.slice(pos + 1);
          buffer.setSelectionRange(pos, pos);
        },
      }[key];
      if (handled) {
        e.preventDefault();
        handled();
        updateModeLine();
      }
      return;
    }

    // Typing into a read-only buffer says so, like Emacs
    if (state.readOnly && e.key.length === 1) {
      message(`Buffer is read-only: #<buffer ${state.name}>`);
      return;
    }

    // Doctor: RET twice ends your turn
    if (state.doctor && e.key === 'Enter') {
      const before = buffer.value.slice(0, buffer.selectionStart);
      if (before.endsWith('\n') && buffer.value.slice(state.doctor.from).trim()) {
        e.preventDefault();
        insertDoctorReply();
      }
    }
  }

  document.addEventListener('keydown', onKey, true);
  buffer.addEventListener('input', updateModeLine);
  ['keyup', 'click'].forEach((t) => buffer.addEventListener(t, updateModeLine));

  // Phones: the chords as buttons
  addKey(frame, 'M-x', mx);
  if (onSubmit) addKey(frame, `C-c C-c (${submitLabel})`, () => onSubmit({ text: buffer.value, message, exit }));
  addKey(frame, 'C-x C-c (exit)', () => exit('quit'));
  // Something to submit means non-Emacs visitors need visible buttons, on any device
  if (isTouch() || onSubmit) frame.overlay.classList.add('editor-touch');
  if (widget) frame.keys.appendChild(widget);

  setBuffer({ text });
  if (caret !== null) buffer.setSelectionRange(caret, caret);
  message(onSubmit ? `C-c C-c to ${submitLabel}, C-x C-c to leave` : 'C-x C-c to leave. M-x doctor if you need to talk.', { sticky: true });
  buffer.focus();
  return { message, exit, buffer };
}

// ─── Vim: easy to get in ───

export function openVim({ onExit = () => {} } = {}) {
  const frame = createFrame('Vim');
  const { buffer, modeLine, echo } = frame;
  frame.overlay.classList.add('editor-vim');
  let mode = 'normal';
  let command = null;
  let flails = 0;

  buffer.value = '';
  buffer.readOnly = true;
  buffer.placeholder = Array(120).fill('~').join('\n');
  modeLine.textContent = '"[No Name]" 0L, 0B';

  function status(text) { echo.textContent = text; }

  function exit(how) {
    document.removeEventListener('keydown', onKey, true);
    closeFrame(frame);
    onExit(how);
  }

  function run(cmd) {
    const c = cmd.trim();
    if (['q', 'q!', 'wq', 'x', 'qa', 'qa!', 'wq!'].includes(c)) exit(c);
    else if (c === 'w') status('E32: No file name');
    else if (c === 'help') status('E149: Sorry, no help for this. Try :q');
    else status(`E492: Not an editor command: ${c}`);
  }

  function onKey(e) {
    if (command !== null) {
      e.preventDefault();
      if (e.key === 'Enter') { const c = command; command = null; run(c); }
      else if (e.key === 'Escape') { command = null; status(''); }
      else if (e.key === 'Backspace') { command = command.slice(0, -1); status(`:${command}`); }
      else if (e.key.length === 1) { command += e.key; status(`:${command}`); }
      return;
    }
    if (mode === 'insert') {
      if (e.key === 'Escape') {
        e.preventDefault();
        mode = 'normal';
        buffer.readOnly = true;
        status('');
      }
      return;
    }
    // normal mode
    if (e.key === ':') {
      e.preventDefault();
      command = '';
      status(':');
      return;
    }
    if (['i', 'a', 'o'].includes(e.key)) {
      e.preventDefault();
      mode = 'insert';
      buffer.readOnly = false;
      status('-- INSERT --');
      return;
    }
    if (e.key.length === 1 || e.key === 'Escape') {
      e.preventDefault();
      flails++;
      if (flails >= 4) status("it's ok, everyone gets stuck. type :q and press enter");
    }
  }

  document.addEventListener('keydown', onKey, true);
  addKey(frame, 'Esc', () => onKey(new KeyboardEvent('keydown', { key: 'Escape' })));
  addKey(frame, ':q', () => exit('q'));
  if (isTouch()) frame.overlay.classList.add('editor-touch');
  buffer.focus();
}
