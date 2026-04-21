// ─── Terminal DOM output helpers ───

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createOutput(historyEl) {
  function scrollToBottom() {
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function addLine(prompt, cmd, output, isError) {
    if (prompt !== null) {
      const line = document.createElement('div');
      line.className = 'terminal-history-line';
      const promptSpan = document.createElement('span');
      promptSpan.className = 'terminal-prompt';
      promptSpan.textContent = '~/mubbie $ ';
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
    html += '<div class="terminal-help-hint">press <kbd>/</kbd> from anywhere to jump here. <kbd>Tab</kbd> to autocomplete. <kbd>↑</kbd><kbd>↓</kbd> for history.</div>';
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

  function clear() {
    historyEl.innerHTML = '';
  }

  return { addLine, addOk, addHelpTable, addImage, clear };
}
