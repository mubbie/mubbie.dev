// ─── The input line: prompt, drawn caret, keys, Ctrl+R search, Tab, rotating hints ───

import { HINTS } from './commands.js';
import { tabComplete } from './completer.js';

const HINT_INTERVAL_MS = 5000;

function createHints(inputLine) {
  let el = document.getElementById('terminal-hint');
  if (!el) {
    el = document.createElement('span');
    el.id = 'terminal-hint';
    el.className = 'terminal-hint';
    inputLine?.appendChild(el);
  }
  let index = Math.floor(Math.random() * HINTS.length);
  let timer = null;

  function show() {
    el.textContent = HINTS[index];
    el.style.display = '';
    index = (index + 1) % HINTS.length;
  }
  return {
    start() {
      if (timer) return;
      show();
      timer = setInterval(show, HINT_INTERVAL_MS);
    },
    stop() {
      clearInterval(timer);
      timer = null;
      el.style.display = 'none';
    },
  };
}

// els: { terminalEl, inputEl, typedEl, typedAfterEl, promptEl, inputLine }
// onSubmit(line) runs Enter's line; onInterrupt(typed) handles Ctrl+C.
export function createInput({ els, history, base, promptText, getCompletionContext, onSubmit, onInterrupt }) {
  const { terminalEl, inputEl, typedEl, typedAfterEl, promptEl, inputLine } = els;
  const hints = createHints(inputLine);
  let search = null; // { query, index, original } while in Ctrl+R mode
  let lastTab = null;

  function updatePrompt() {
    if (promptEl) promptEl.textContent = search ? `(reverse-i-search)\`${search.query}': ` : `${promptText()} `;
  }

  // The hint shows only on an empty line, outside search
  function syncHints() {
    if (!search && !inputEl.value) hints.start();
    else hints.stop();
  }

  // Draw the typed text with the caret where the input's cursor really is
  function render() {
    if (search) {
      typedEl.textContent = search.index >= 0 ? history.get(search.index) : '';
      if (typedAfterEl) typedAfterEl.textContent = '';
      return;
    }
    const { value } = inputEl;
    const caret = typedAfterEl ? (inputEl.selectionStart ?? value.length) : value.length;
    typedEl.textContent = value.slice(0, caret);
    if (typedAfterEl) typedAfterEl.textContent = value.slice(caret);
  }

  function setInput(value, caret = value.length) {
    inputEl.value = value;
    inputEl.setSelectionRange(caret, caret);
    render();
    syncHints();
  }

  function startSearch() {
    search = { query: '', index: -1, original: inputEl.value };
    inputEl.value = '';
    updatePrompt();
    render();
    syncHints();
  }

  function endSearch(accept) {
    if (!search) return;
    const match = search.index >= 0 ? history.get(search.index) : null;
    const value = accept && match ? match : search.original;
    search = null;
    updatePrompt();
    setInput(value);
  }

  function submit(line) {
    history.reset(); // Up starts from the newest entry again, whatever happened to this line
    setInput('');
    onSubmit(line);
    updatePrompt();
  }

  // Ctrl+C: abandon the line (and stop anything running), like a real terminal
  function interrupt() {
    const typed = search ? '' : inputEl.value;
    search = null;
    history.reset();
    onInterrupt(typed);
    setInput('');
    updatePrompt();
  }

  // Tab: complete; a second Tab with nothing new to add lists the options
  function complete() {
    const result = tabComplete(inputEl.value, getCompletionContext());
    if (!result) return false;
    if (result.value !== inputEl.value) {
      setInput(result.value);
      lastTab = null;
      return true;
    }
    if (result.candidates.length > 1) {
      if (lastTab === inputEl.value) {
        base.addLine(promptText(), inputEl.value, result.candidates.map((c) => c.replace(/^.*\/(?=.)/, '')).join('  '));
        lastTab = null;
      } else {
        lastTab = inputEl.value;
      }
    }
    return true;
  }

  function onSearchKey(e, ctrl, key) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const match = search.index >= 0 ? history.get(search.index) : '';
      // nothing found: give back what was typed before searching
      if (!match) {
        endSearch(false);
        return;
      }
      search = null;
      submit(match);
    } else if (ctrl && key === 'r') {
      e.preventDefault();
      const next = history.search(search.query, search.index);
      if (next >= 0) search.index = next;
      render();
    } else if (e.key === 'Escape' || (ctrl && key === 'g')) {
      e.preventDefault();
      endSearch(false);
    } else if (ctrl && key === 'c') {
      e.preventDefault();
      interrupt();
    } else if (ctrl && key === 'l') {
      e.preventDefault();
      base.clear();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.key) || (ctrl && (key === 'a' || key === 'e'))) {
      e.preventDefault();
      endSearch(true);
    }
  }

  function onKey(e) {
    // IME composition (e.g. Japanese input) owns Enter until it's done
    if (e.isComposing) return;
    if (e.key !== 'Tab') lastTab = null;
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    const key = (e.key || '').toLowerCase();

    if (search) {
      onSearchKey(e, ctrl, key);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      submit(inputEl.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const val = history.up(inputEl.value);
      if (val !== null) setInput(val);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const val = history.down();
      if (val !== null) setInput(val);
    } else if (e.key === 'Tab') {
      if (complete()) e.preventDefault();
    } else if (ctrl && key === 'l') {
      e.preventDefault();
      base.clear();
    } else if (ctrl && key === 'c') {
      // with text selected, Ctrl+C is copy; otherwise it's interrupt
      if (inputEl.selectionStart !== inputEl.selectionEnd) return;
      e.preventDefault();
      interrupt();
    } else if (ctrl && key === 'r') {
      e.preventDefault();
      startSearch();
    } else if (ctrl && key === 'a') {
      e.preventDefault();
      setInput(inputEl.value, 0);
    } else if (ctrl && key === 'e') {
      e.preventDefault();
      setInput(inputEl.value);
    } else if (ctrl && key === 'u') {
      // delete everything before the cursor
      e.preventDefault();
      setInput(inputEl.value.slice(inputEl.selectionStart), 0);
    } else if (ctrl && key === 'k') {
      // delete everything after the cursor
      e.preventDefault();
      const caret = inputEl.selectionStart;
      setInput(inputEl.value.slice(0, caret), caret);
    } else if (ctrl && key === 'w') {
      // delete the word before the cursor
      e.preventDefault();
      const caret = inputEl.selectionStart;
      const before = inputEl.value.slice(0, caret).replace(/\S+\s*$/, '');
      setInput(before + inputEl.value.slice(caret), before.length);
    } else if (ctrl && key === 'd' && !inputEl.value) {
      e.preventDefault();
      base.addLine(promptText(), 'logout', 'there is no escape. you live here now. 🏠');
    }
  }

  terminalEl.addEventListener('click', () => inputEl.focus());
  inputEl.addEventListener('input', () => {
    if (search) {
      search.query = inputEl.value;
      search.index = history.search(search.query);
      updatePrompt();
    }
    render();
    syncHints();
  });
  // Keep the drawn caret in step with clicks and arrow keys
  ['keyup', 'click', 'select'].forEach((type) => inputEl.addEventListener(type, () => { if (!search) render(); }));
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === inputEl && !search) render();
  });
  inputEl.addEventListener('keydown', onKey);

  updatePrompt();
  render();
  syncHints();

  return { updatePrompt, focus: () => inputEl.focus() };
}
