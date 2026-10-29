// ─── Terminal DOM output helpers ───

// getPrompt: the live prompt ("~/mubbie/races $"). A prompt argument of '$' means
// "use the live prompt"; any other string is printed as-is (the prompt a line was typed at).
export function createOutput(historyEl, getPrompt = () => '~/mubbie $') {
  // Timers for multi-step animations (sudo, coffee, ssh…), cancelled by clear()
  const pending = new Set();
  // Bumped by Ctrl+C and clear, so a network reply that lands afterwards is dropped
  let generation = 0;

  function later(fn, delay) {
    const id = setTimeout(() => {
      pending.delete(id);
      fn();
    }, delay);
    pending.add(id);
  }
  function scrollToBottom() {
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  // Returns the output element (or null), e.g. for sl to animate its train
  function addLine(prompt, cmd, output, isError) {
    let outSpan = null;
    if (prompt !== null) {
      const line = document.createElement('div');
      line.className = 'terminal-history-line';
      const promptSpan = document.createElement('span');
      promptSpan.className = 'terminal-prompt';
      promptSpan.textContent = `${prompt === '$' ? getPrompt() : prompt} `;
      const cmdSpan = document.createElement('span');
      cmdSpan.className = 'terminal-cmd';
      cmdSpan.textContent = cmd;
      line.appendChild(promptSpan);
      line.appendChild(cmdSpan);
      historyEl.appendChild(line);
    }

    if (output != null) {
      const outLine = document.createElement('div');
      outLine.className = 'terminal-history-line';
      outSpan = document.createElement('span');
      outSpan.className = isError ? 'terminal-error' : 'terminal-output';
      outSpan.textContent = output;
      outLine.appendChild(outSpan);
      historyEl.appendChild(outLine);
    }

    scrollToBottom();
    return outSpan;
  }

  function addOk(text) {
    const line = document.createElement('div');
    line.className = 'terminal-history-line';
    const span = document.createElement('span');
    span.className = 'terminal-ok';
    span.textContent = text;
    line.appendChild(span);
    historyEl.appendChild(line);
    scrollToBottom();
  }

  function addHelpTable(helpItems) {
    const table = document.createElement('div');
    table.className = 'terminal-history-line terminal-help-table';

    helpItems.forEach((h) => {
      const row = document.createElement('div');
      row.className = 'terminal-help-row';
      const cmd = document.createElement('span');
      cmd.className = 'terminal-help-cmd';
      cmd.textContent = h.c;
      const desc = document.createElement('span');
      desc.className = 'terminal-help-desc';
      desc.textContent = h.d;
      row.append(cmd, desc);
      table.appendChild(row);
    });
    // static markup only
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    table.insertAdjacentHTML('beforeend', isTouch
      ? '<div class="terminal-help-hint">tap the prompt, type a command, and hit enter.</div>'
      : '<div class="terminal-help-hint">press <kbd>/</kbd> from anywhere to jump here. <kbd>Tab</kbd> to autocomplete. <kbd>↑</kbd><kbd>↓</kbd> for history.</div>');
    historyEl.appendChild(table);
    scrollToBottom();
  }

  function addImage(src, alt, href) {
    const line = document.createElement('div');
    line.className = 'terminal-history-line';
    const img = document.createElement('img');
    img.className = 'terminal-image';
    img.src = src;
    img.alt = alt || '';
    if (alt) img.title = alt;
    img.loading = 'lazy';
    if (href) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.appendChild(img);
      line.appendChild(link);
    } else {
      line.appendChild(img);
    }
    historyEl.appendChild(line);
    img.onload = scrollToBottom;
    scrollToBottom();
  }

  function addLink(text, href) {
    const line = document.createElement('div');
    line.className = 'terminal-history-line';
    const link = document.createElement('a');
    link.className = 'terminal-ok';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    line.appendChild(link);
    historyEl.appendChild(line);
    scrollToBottom();
  }

  // Ctrl+C: stop running animations but keep what's on screen
  function cancelPending() {
    generation++;
    pending.forEach(clearTimeout);
    pending.clear();
  }

  function clear() {
    cancelPending();
    historyEl.innerHTML = '';
  }

  return { addLine, addOk, addHelpTable, addImage, addLink, later, cancelPending, clear, generation: () => generation };
}
