// ─── Command history with up/down navigation, kept across visits like .bash_history ───

const MAX_HISTORY = 100;
const STORAGE_KEY = 'mubbie-terminal-history';

// localStorage throws in some privacy modes; history then just lasts for the visit
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter((e) => typeof e === 'string').slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function save(entries) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* not persisted */ }
}

export function createHistory() {
  // newest first
  const entries = load();
  let index = -1;
  let stash = '';

  return {
    push(cmd) {
      if (entries[0] !== cmd) {
        entries.unshift(cmd);
        if (entries.length > MAX_HISTORY) entries.pop();
        save(entries);
      }
      index = -1;
      stash = '';
    },

    up(currentInput) {
      if (entries.length === 0) return null;
      if (index === -1) stash = currentInput;
      if (index < entries.length - 1) {
        index++;
        return entries[index];
      }
      return null;
    },

    down() {
      if (index > 0) {
        index--;
        return entries[index];
      }
      if (index === 0) {
        index = -1;
        return stash;
      }
      return null;
    },

    reset() {
      index = -1;
      stash = '';
    },

    clear() {
      entries.length = 0;
      save(entries);
      index = -1;
      stash = '';
    },

    // Ctrl+R: newest entry containing query, starting after `from` (an index into entries)
    search(query, from = -1) {
      if (!query) return -1;
      const q = query.toLowerCase();
      for (let i = from + 1; i < entries.length; i++) {
        if (entries[i].toLowerCase().includes(q)) return i;
      }
      return -1;
    },

    get(i) {
      return entries[i];
    },

    getAll() {
      return entries.slice();
    },
  };
}
