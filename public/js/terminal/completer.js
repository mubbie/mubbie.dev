// ─── Tab completion for terminal commands and arguments ───

import { ALL_COMMANDS, SECTION_MAP, OPENABLES } from './commands.js';

export function tabComplete(input) {
  const val = input.trim().toLowerCase();
  if (!val) return null;

  const parts = val.split(/\s+/);

  // Complete command name
  if (parts.length === 1) {
    const hit = ALL_COMMANDS.find((c) => c.startsWith(val));
    return hit ? hit + ' ' : null;
  }

  const cmd = parts[0];
  const arg = parts.slice(1).join(' ');

  // Complete cd argument with section names
  if (cmd === 'cd' && parts.length === 2) {
    const hit = Object.keys(SECTION_MAP).find((s) => s.startsWith(parts[1]));
    return hit ? 'cd ' + hit : null;
  }

  // Complete open argument with project/post names
  if (cmd === 'open') {
    const hit = OPENABLES.find((x) => x.name.toLowerCase().startsWith(arg));
    return hit ? 'open ' + hit.name : null;
  }

  // Complete theme argument
  if (cmd === 'theme' && parts.length === 2) {
    const themes = ['dark', 'light'];
    const hit = themes.find((t) => t.startsWith(parts[1]));
    return hit ? 'theme ' + hit : null;
  }

  return null;
}
