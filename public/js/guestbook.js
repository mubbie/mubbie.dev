// ─── Guestbook (visitor side): read approved notes, sign in an Emacs buffer ───
//
// Notes are written in the Emacs editor and sent with C-c C-c (or the send button).
// Cloudflare Turnstile checks for bots; the server reviews everything before it's public.

import { openEmacs } from './terminal/editor.js';

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let configPromise = null;
export function getConfig() {
  configPromise ??= fetch('/api/guestbook/config')
    .then((r) => (r.ok ? r.json() : { open: false }))
    .catch(() => ({ open: false }));
  return configPromise;
}

export async function fetchNotes() {
  const res = await fetch('/api/guestbook');
  if (!res.ok) throw new Error(res.status);
  const notes = await res.json();
  return Array.isArray(notes) ? notes : [];
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
}

let turnstilePromise = null;
function loadTurnstile() {
  turnstilePromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) { resolve(window.turnstile); return; }
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    script.onerror = () => { turnstilePromise = null; reject(new Error('turnstile failed to load')); };
    document.head.appendChild(script);
  });
  return turnstilePromise;
}

// Built with explicit spaces: editors strip trailing whitespace from template literals
const TEMPLATE = [
  ';; Sign the guestbook. Write below, then C-c C-c (or the send button).',
  ';; Notes are reviewed before they show up. No links, emails, or phone numbers.',
  ';; Up to 500 characters. C-x C-c to leave without sending.',
  '',
  'Name: ',
  'Message:',
  '',
  '',
].join('\n');
// Start typing right after "Name: "
const NAME_CARET = TEMPLATE.indexOf('Name: ') + 'Name: '.length;

// Pull the name and message out of the buffer, ignoring ;; comment lines
export function parseNote(text) {
  const lines = text.split('\n').filter((l) => !l.startsWith(';;'));
  const nameLine = lines.find((l) => /^name:/i.test(l)) || '';
  const at = lines.findIndex((l) => /^message:/i.test(l));
  const message = at >= 0
    ? [lines[at].replace(/^message:\s*/i, ''), ...lines.slice(at + 1)].join('\n').trim()
    : '';
  return { name: nameLine.replace(/^name:\s*/i, '').trim(), message };
}

// Open the editor to write a note. onDone(text) is called with a one-line result for the terminal.
export async function signGuestbook({ onDone = () => {} } = {}) {
  const config = await getConfig();
  if (!config.open) {
    onDone({ ok: false, text: 'the guestbook opens soon. come back in a bit!' });
    return;
  }

  // Turnstile renders into the editor's button row; most people never see a challenge
  const widget = document.createElement('div');
  widget.className = 'editor-turnstile';
  let token = null;
  let widgetId = null;
  let sending = false;
  // Sending before the bot check finishes waits for it instead of failing
  let tokenWaiters = [];
  const setToken = (t) => {
    token = t;
    if (t) { tokenWaiters.forEach((resolve) => resolve(t)); tokenWaiters = []; }
  };
  const waitForToken = (ms) => (token ? Promise.resolve(token) : new Promise((resolve) => {
    tokenWaiters.push(resolve);
    setTimeout(() => resolve(token), ms);
  }));

  const editor = openEmacs({
    name: 'guestbook.txt',
    text: TEMPLATE,
    mode: 'Text',
    submitLabel: 'send',
    caret: NAME_CARET,
    widget,
    onSubmit: async ({ text, message, exit }) => {
      if (sending) return;
      const note = parseNote(text);
      if (!note.name) { message('Add your name after "Name:" (a nickname is fine).'); return; }
      if (!note.message) { message('Write your note after "Message:".'); return; }
      // count characters the way people do (an emoji is one), same as the server
      const chars = [...note.message].length;
      if (chars > 500) { message(`That's ${chars} characters. Keep it under 500.`); return; }
      sending = true;
      if (!token) {
        message('Checking you\'re human…', { sticky: true });
        await waitForToken(8000);
        if (!token) {
          sending = false;
          message('The bot check didn\'t finish. Try again in a moment?');
          return;
        }
      }
      message('Sending…', { sticky: true });
      try {
        const res = await fetch('/api/guestbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...note, token }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          message(data.message || 'Thanks! Notes appear after a quick review.', { sticky: true });
          setTimeout(() => exit('sent'), 1400);
          onDone({ ok: true, text: 'note sent. it shows up after a quick review. thank you!' });
        } else {
          message(data.message || 'Something went wrong. Try again?');
          // a used token can't be reused; get a fresh one
          setToken(null);
          if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
        }
      } catch {
        message('Couldn\'t reach the server. Try again?');
      } finally {
        sending = false;
      }
    },
    onExit: () => document.getElementById('terminal-input')?.focus(),
  });
  if (!editor) return; // another editor is already open

  try {
    const turnstile = await loadTurnstile();
    widgetId = turnstile.render(widget, {
      sitekey: config.siteKey,
      appearance: 'interaction-only',
      theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
      callback: (t) => setToken(t),
      'expired-callback': () => setToken(null),
      'error-callback': () => setToken(null),
    });
  } catch {
    editor.message('Couldn\'t load the bot check. Refresh and try again?', { sticky: true });
  }
}

// ─── The guestbook section on the page ───

export async function initGuestbookSection() {
  const list = document.getElementById('guestbook-notes');
  const sign = document.getElementById('guestbook-sign');
  if (!list) return;

  if (sign) {
    sign.addEventListener('click', () => signGuestbook({
      onDone: ({ text }) => {
        const status = document.getElementById('guestbook-status');
        if (status) status.textContent = `# ${text}`;
      },
    }));
    getConfig().then((c) => {
      if (!c.open) {
        sign.textContent = 'opens soon';
        sign.disabled = true;
      }
    });
  }

  try {
    renderNotes(list, (await fetchNotes()).slice(0, 5));
  } catch {
    renderNotes(list, []);
  }
}

function renderNotes(list, notes) {
  list.replaceChildren();
  if (!notes.length) {
    const empty = document.createElement('div');
    empty.className = 'guestbook-empty';
    empty.textContent = '# no notes yet. be the first.';
    list.appendChild(empty);
    return;
  }
  notes.forEach((n) => {
    const item = document.createElement('div');
    item.className = 'guestbook-note';
    const msg = document.createElement('div');
    msg.className = 'guestbook-msg';
    msg.textContent = `"${n.message}"`;
    const who = document.createElement('div');
    who.className = 'guestbook-who';
    who.textContent = `· ${n.name}, ${formatDate(n.createdAt)}`;
    item.append(msg, who);
    list.appendChild(item);
  });
}
