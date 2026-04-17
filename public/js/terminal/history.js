// ─── Command history with up/down navigation ───

const MAX_HISTORY = 50;

export function createHistory() {
  const entries = [];
  let index = -1;
  let stash = '';

  return {
    push(cmd) {
      if (entries[0] !== cmd) {
        entries.unshift(cmd);
        if (entries.length > MAX_HISTORY) entries.pop();
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

    getAll() {
      return entries.slice();
    },
  };
}
