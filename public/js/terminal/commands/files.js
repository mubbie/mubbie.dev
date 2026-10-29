// ─── Moving around and reading files: ls, cd, cat, pwd, tree, head/tail/wc/sort/uniq ───

import { HOME, displayPath, resolveDir, list, readFile, pageTarget } from '../fs.js';
import { FILTERS } from '../shell.js';
import { parseArgs, rejectFlags } from '../args.js';
import { scrollToTop, scrollToEl } from '../../scroll.js';
import { selectRaceTab } from '../../race-tabs.js';

// Names of things in a directory listing, laid out like ls does
function formatListing(entries, flags) {
  if (flags.includes('l')) {
    return entries.map((e) => `${e.endsWith('/') ? 'drwxr-xr-x' : '-rw-r--r--'}  mubbie  staff  ${e}`).join('\n');
  }
  // names with spaces (race names, post titles) read better one per line
  if (flags.includes('1') || entries.some((e) => e.includes(' '))) return entries.join('\n');
  return entries.join('  ');
}

export function fileCommands({ out, sh }) {
  // Change directory, and scroll the page to the section it stands for
  function goTo(dest) {
    if (dest !== sh.cwd) sh.prevCwd = sh.cwd;
    sh.cwd = dest;
    const target = pageTarget(dest);
    if (!target) return;
    const [id, year] = target;
    if (year) selectRaceTab(year);
    if (id) scrollToEl(document.getElementById(id));
    else scrollToTop();
  }

  // head/tail/wc/sort/uniq outside a pipe: read the named file instead
  function fileFilter(name) {
    return (trimmed, arg) => {
      const words = arg.trim() ? arg.trim().split(/\s+/) : [];
      // the file is the first word that isn't a flag or the number after -n
      const fileArg = words.find((w, i) => !w.startsWith('-') && !(i > 0 && words[i - 1] === '-n'));
      if (!fileArg) {
        out.addLine('$', trimmed, `${name}: reads from a pipe or a file. try: ls races | ${name}${name === 'head' || name === 'tail' ? ' -3' : ''}`, true);
        return;
      }
      const file = readFile(sh.cwd, fileArg);
      if (file.error) {
        out.addLine('$', trimmed, `${name}: ${file.error}`, true);
        return;
      }
      const r = FILTERS[name](file.text.split('\n'), words.filter((w) => w !== fileArg));
      if (r.error) out.addLine('$', trimmed, `${name}: ${r.error}`, true);
      else out.addLine('$', trimmed, r.lines.join('\n'));
    };
  }

  return {
    head: fileFilter('head'),
    tail: fileFilter('tail'),
    wc: fileFilter('wc'),
    sort: fileFilter('sort'),
    uniq: fileFilter('uniq'),

    ls(trimmed, arg) {
      const { flags, positional: target } = parseArgs(arg);
      const badFlag = flags.find((f) => !/^-[lah1]+$/.test(f));
      if (badFlag) {
        out.addLine('$', trimmed, `ls: unknown option: ${badFlag}`, true);
        return;
      }
      const flagChars = flags.join('');
      const dir = target ? resolveDir(sh.cwd, target) : sh.cwd;
      if (!dir) {
        // ls on a file prints its name, like a real shell
        const file = target && readFile(sh.cwd, target);
        if (file && !file.error) out.addLine('$', trimmed, target);
        else out.addLine('$', trimmed, `ls: ${target}: No such file or directory`, true);
        return;
      }
      let entries = list(dir);
      if (flagChars.includes('a')) entries = ['./', '../', ...entries];
      out.addLine('$', trimmed, entries.length ? formatListing(entries, flagChars) : null);
    },

    cd(trimmed, arg) {
      // "cd -" goes back; "cd -- dir" ends option parsing (both aren't flags)
      const rawArg = arg.trim().replace(/^--(\s+|$)/, '');
      const target = rawArg === '-' ? '-' : rejectFlags(out, trimmed, 'cd', rawArg);
      if (target === null) return;
      let dest;
      if (!target || target === '~') dest = HOME;
      else if (target === '-') dest = sh.prevCwd;
      else dest = resolveDir(sh.cwd, target);

      if (!dest) {
        const file = readFile(sh.cwd, target);
        const why = file && !file.error ? 'Not a directory' : 'No such file or directory';
        out.addLine('$', trimmed, `cd: ${target}: ${why}`, true);
        return;
      }
      const firstDevVisit = dest === '/dev' && !sh.visitedDev;
      if (dest === '/dev') sh.visitedDev = true;
      goTo(dest);
      // cd - prints where it went, like bash; the secret directory gets a welcome
      if (target === '-') out.addLine('$', trimmed, displayPath(dest));
      else out.addLine('$', trimmed, firstDevVisit ? 'you found the secret directory. try: ls' : null);
    },

    cat(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'cat', arg);
      if (target === null) return;
      if (!target) {
        out.addLine('$', trimmed, 'usage: cat <file> (try: ls, then cat about.txt)', true);
        return;
      }
      const file = readFile(sh.cwd, target);
      if (file.error) out.addLine('$', trimmed, `cat: ${file.error}`, true);
      else out.addLine('$', trimmed, file.text);
    },

    pwd(trimmed) {
      out.addLine('$', trimmed, displayPath(sh.cwd));
    },

    tree(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'tree', arg);
      if (target === null) return;
      const root = target ? resolveDir(sh.cwd, target) : sh.cwd;
      if (!root) {
        out.addLine('$', trimmed, `tree: ${target}: No such directory`, true);
        return;
      }
      const rows = [root === sh.cwd && !target ? '.' : displayPath(root)];
      let dirs = 0;
      let files = 0;
      (function walk(path, indent) {
        const entries = list(path) || [];
        entries.forEach((entry, i) => {
          const last = i === entries.length - 1;
          rows.push(`${indent}${last ? '└── ' : '├── '}${entry.replace(/\/$/, '')}`);
          if (entry.endsWith('/')) {
            dirs++;
            walk(`${path === '/' ? '' : path}/${entry.slice(0, -1)}`, indent + (last ? '    ' : '│   '));
          } else {
            files++;
          }
        });
      }(root, ''));
      rows.push('', `${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}`);
      out.addLine('$', trimmed, rows.join('\n'));
    },
  };
}
