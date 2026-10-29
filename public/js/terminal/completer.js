// ─── Tab completion, bash style ───
// One match completes it. Several complete as far as they agree (the common prefix);
// the caller lists them on a second Tab. Paths complete relative to the cwd.

import { ALIASES, OPENABLES, FILES } from './commands.js';
import { resolve, list, SHORTCUTS } from './fs.js';

const DIR_COMMANDS = new Set(['cd']);
const PATH_COMMANDS = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq', 'tree', 'emacs']);

function commonPrefix(words) {
  if (!words.length) return '';
  let prefix = words[0];
  for (const w of words) {
    while (!w.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

// Candidates for a path argument, e.g. "currently/t" → ["currently/tools/"]
function pathCandidates(cwd, word, dirsOnly) {
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
  const namePart = word.slice(slash + 1).toLowerCase();
  const dir = dirPart ? resolve(cwd, dirPart) : cwd;
  const entries = (list(dir) || [])
    .filter((e) => !dirsOnly || e.endsWith('/'))
    // only single-word names complete cleanly on a command line
    .filter((e) => !/\s/.test(e))
    .filter((e) => e.toLowerCase().startsWith(namePart))
    .map((e) => dirPart + e);
  // Section shortcuts work from anywhere (cd tools, ls cycling)
  if (!dirPart) {
    for (const key of Object.keys(SHORTCUTS)) {
      if (key.startsWith(namePart) && !entries.some((e) => e.replace(/\/$/, '') === key)) entries.push(`${key}/`);
    }
    if ('..'.startsWith(word) && word) entries.push('../');
  }
  return [...new Set(entries)];
}

function argCandidates(cmd, word, ctx) {
  const lower = word.toLowerCase();
  const starts = (list) => list.filter((x) => x.toLowerCase().startsWith(lower));
  if (DIR_COMMANDS.has(cmd)) return pathCandidates(ctx.cwd, word, true);
  if (PATH_COMMANDS.has(cmd)) {
    const extra = cmd === 'cat' ? starts(Object.keys(FILES).filter((f) => f.startsWith('/'))) : [];
    return [...new Set([...pathCandidates(ctx.cwd, word, false), ...extra])];
  }
  if (cmd === 'open') return starts([...OPENABLES.map((x) => x.name), 'latest']);
  if (cmd === 'theme') return starts(['dark', 'light', 'default']);
  if (cmd === 'man' || cmd === 'which') return starts(ctx.commands);
  if (cmd === 'cocktail') return starts(['random', 'tavern', 'merchant', 'alchemist', 'archmage']);
  if (cmd === 'history') return starts(['-c']);
  if (cmd === 'guestbook') return starts(['sign']);
  return [];
}

// Returns { value, candidates } (value is the new input), or null for no match
export function tabComplete(input, ctx) {
  if (!input.trim()) return null;

  // Only the last command in a chain or pipe is being typed
  const and = input.lastIndexOf('&&');
  const segStart = Math.max(input.lastIndexOf('|'), input.lastIndexOf(';'), and >= 0 ? and + 1 : -1);
  const head = segStart >= 0 ? input.slice(0, segStart + 1) : '';
  const segment = input.slice(segStart + 1);
  const lead = segment.match(/^\s*/)[0];
  const words = segment.slice(lead.length).split(/\s+/);
  const typingCommand = words.length === 1;

  // curl's only target is two words, so complete it whole
  if (/^curl\s+xkcd\s+\S*$/i.test(segment.trim()) && 'xkcd random'.startsWith(segment.trim().slice(5).toLowerCase())) {
    return { value: `${head}${lead}curl xkcd random`, candidates: ['xkcd random'] };
  }

  const word = words[words.length - 1];
  const before = head + lead + words.slice(0, -1).join(' ') + (typingCommand ? '' : ' ');
  const first = words[0].toLowerCase();
  const cmd = typingCommand ? null : (Object.hasOwn(ALIASES, first) ? ALIASES[first] : first);

  const candidates = typingCommand
    ? ctx.commands.filter((c) => c.startsWith(word.toLowerCase()))
    : argCandidates(cmd, word, ctx);
  if (!candidates.length) return null;

  if (candidates.length === 1) {
    const only = candidates[0];
    // Commands get a space after them; directories end in / so you can keep typing
    return { value: before + only + (typingCommand ? ' ' : ''), candidates };
  }
  const prefix = commonPrefix(candidates);
  return { value: before + (prefix.length > word.length ? prefix : word), candidates };
}
