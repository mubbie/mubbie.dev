// ─── Tab completion for terminal commands and arguments ───

import { ALL_COMMANDS, SECTION_MAP, OPENABLES, FILES } from './commands.js';

export function tabComplete(input) {
  if (!input.trim()) return null;

  const val = input.toLowerCase();
  const parts = val.trim().split(/\s+/);
  const hasTrailingSpace = input.endsWith(' ');

  // Complete command name (no space typed yet)
  if (parts.length === 1 && !hasTrailingSpace) {
    const hit = ALL_COMMANDS.find((c) => c.startsWith(parts[0]));
    return hit ? hit + ' ' : null;
  }

  const cmd = parts[0];
  const arg = parts.slice(1).join(' ');

  // Complete cd argument with section names
  if (cmd === 'cd') {
    const prefix = hasTrailingSpace && parts.length === 1 ? '' : (parts[1] || '');
    const hit = Object.keys(SECTION_MAP).find((s) => s.startsWith(prefix));
    return hit ? 'cd ' + hit : null;
  }

  // Complete open argument with project/post names
  if (cmd === 'open') {
    const prefix = hasTrailingSpace ? arg : (arg || '');
    const hit = OPENABLES.find((x) => x.name.toLowerCase().startsWith(prefix || ''));
    return hit ? 'open ' + hit.name : null;
  }

  // Complete cat argument with file paths
  if (cmd === 'cat') {
    const prefix = hasTrailingSpace && parts.length === 1 ? '' : (parts[1] || '');
    const hit = Object.keys(FILES).find((f) => f.toLowerCase().startsWith(prefix));
    return hit ? 'cat ' + hit : null;
  }

  // Complete theme argument
  if (cmd === 'theme') {
    const themes = ['dark', 'light'];
    const prefix = hasTrailingSpace && parts.length === 1 ? '' : (parts[1] || '');
    const hit = themes.find((t) => t.startsWith(prefix));
    return hit ? 'theme ' + hit : null;
  }

  // Complete man argument with command names
  if (cmd === 'man') {
    const prefix = hasTrailingSpace && parts.length === 1 ? '' : (parts[1] || '');
    const hit = ALL_COMMANDS.find((c) => c.startsWith(prefix));
    return hit ? 'man ' + hit : null;
  }

  // Complete curl argument
  if (cmd === 'curl') {
    const options = ['xkcd', 'xkcd random'];
    const prefix = hasTrailingSpace ? arg : (arg || '');
    const hit = options.find((o) => o.startsWith(prefix || ''));
    return hit ? 'curl ' + hit : null;
  }

  return null;
}
