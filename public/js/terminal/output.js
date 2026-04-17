// ─── Terminal DOM output helpers ───

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function createOutput(historyEl) {
  function scrollToBottom() {
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function addLine(prompt, cmd, output, isError) {
    const line = document.createElement('div');
    line.className = 'terminal-history-line';

    if (prompt !== null) {
      line.innerHTML = `<span class="terminal-prompt">~/mubbie $&nbsp;</span><span class="terminal-cmd">${cmd}</span>`;
      historyEl.appendChild(line);
    }

    if (output != null) {
      const outLine = document.createElement('div');
      outLine.className = 'terminal-history-line';
      outLine.innerHTML = `<span class="${isError ? 'terminal-error' : 'terminal-output'}">${output}</span>`;
      historyEl.appendChild(outLine);
    }

    scrollToBottom();
  }

  function addOk(text) {
    const line = document.createElement('div');
    line.className = 'terminal-history-line';
    line.innerHTML = `<span class="terminal-ok">${text}</span>`;
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

  function clear() {
    historyEl.innerHTML = '';
  }

  return { addLine, addOk, addHelpTable, clear };
}
