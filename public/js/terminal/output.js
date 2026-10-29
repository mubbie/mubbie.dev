// ─── Terminal DOM output helpers ───

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// getPrompt: the live prompt ("~/mubbie/races $"). A prompt argument of '$' means
// "use the live prompt"; any other string is printed as-is (the prompt a line was typed at).
export function createOutput(historyEl, getPrompt = () => '~/mubbie $') {
  // Timers for multi-step animations (sudo, coffee, ssh…), cancelled by clear()
  const pending = new Set();

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

  function addLine(prompt, cmd, output, isError) {
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
      const outSpan = document.createElement('span');
      outSpan.className = isError ? 'terminal-error' : 'terminal-output';
      outSpan.textContent = output;
      outLine.appendChild(outSpan);
      historyEl.appendChild(outLine);
    }

    scrollToBottom();
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

    let html = '';
    helpItems.forEach((h) => {
      html += `<div class="terminal-help-row"><span class="terminal-help-cmd">${escapeHtml(h.c)}</span><span class="terminal-help-desc">${escapeHtml(h.d)}</span></div>`;
    });
    const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    html += isTouch
      ? '<div class="terminal-help-hint">tap the prompt, type a command, and hit enter.</div>'
      : '<div class="terminal-help-hint">press <kbd>/</kbd> from anywhere to jump here. <kbd>Tab</kbd> to autocomplete. <kbd>↑</kbd><kbd>↓</kbd> for history.</div>';
    table.innerHTML = html;
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
    const wasRunning = pending.size > 0;
    pending.forEach(clearTimeout);
    pending.clear();
    return wasRunning;
  }

  function clear() {
    cancelPending();
    historyEl.innerHTML = '';
  }

  return { addLine, addOk, addHelpTable, addImage, addLink, later, cancelPending, clear };
}
