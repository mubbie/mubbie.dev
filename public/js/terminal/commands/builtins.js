// ─── Shell builtins: help, echo, env, export, which, history, man, theme, … ───

import { HELP_ITEMS, ALIASES, MAN_PAGES, COMMAND_DEFS } from '../commands.js';
import { FILTERS, unquote } from '../shell.js';
import { lookup, rejectFlags } from '../args.js';
import { applyTheme, toggleTheme, setThemePreference, useSystemTheme } from '../../theme.js';

const PAGE_LOAD_TIME = Date.now();
const READ_ONLY_VARS = ['PWD', 'HOME', 'USER'];
const MAX_VAR_LENGTH = 10000; // $A$A doubling would otherwise grow until the tab freezes

// `which` answers for names that aren't plain commands
const WHICH_SPECIAL = {
  ll: 'll: aliased to ls -l',
  la: 'la: aliased to ls -a',
  vim: '/usr/bin/vim (are you sure? try emacs)',
  vi: 'vi: aliased to vim',
  emacs: '/usr/bin/emacs',
  nano: '/usr/bin/nano',
};

export function builtinCommands({ out, sh, history, getFortunes, has }) {
  function printEnv(trimmed) {
    const shown = Object.entries(sh.env).filter(([k]) => k !== '?').sort(([a], [b]) => a.localeCompare(b));
    out.addLine('$', trimmed, shown.map(([k, v]) => `${k}=${v}`).join('\n'));
  }

  const exitMessage = (trimmed) => {
    out.addLine('$', trimmed, null);
    out.addLine(null, null, 'there is no escape. you live here now. 🏠');
  };

  return {
    help(trimmed) {
      out.addLine('$', trimmed, null);
      out.addHelpTable(HELP_ITEMS);
    },

    whoami(trimmed) {
      out.addLine('$', trimmed, 'mubbie idoko');
    },

    clear() {
      out.clear();
    },

    date(trimmed) {
      out.addLine('$', trimmed, new Date().toString());
    },

    uptime(trimmed) {
      const seconds = Math.floor((Date.now() - PAGE_LOAD_TIME) / 1000);
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const parts = [h && `${h}h`, m && `${m}m`, `${seconds % 60}s`].filter(Boolean);
      out.addLine('$', trimmed, `up ${parts.join(' ')}, since ${new Date(PAGE_LOAD_TIME).toLocaleTimeString()}`);
    },

    random(trimmed) {
      const fortunes = getFortunes();
      out.addLine('$', trimmed, fortunes[Math.floor(Math.random() * fortunes.length)]);
    },

    echo(trimmed, arg) {
      out.addLine('$', trimmed, unquote(arg || ''));
    },

    env: printEnv,

    export(trimmed, arg) {
      const text = arg.trim();
      if (!text) {
        printEnv(trimmed);
        return;
      }
      const m = /^([A-Za-z_]\w*)=(.*)$/.exec(text);
      if (!m) {
        out.addLine('$', trimmed, `export: not valid: ${text}. usage: export NAME=value`, true);
        return;
      }
      if (READ_ONLY_VARS.includes(m[1])) {
        out.addLine('$', trimmed, `export: ${m[1]}: read-only variable (nice try)`, true);
        return;
      }
      const value = unquote(m[2]);
      if (value.length > MAX_VAR_LENGTH) {
        out.addLine('$', trimmed, `export: ${m[1]}: value too long (max ${MAX_VAR_LENGTH} characters)`, true);
        return;
      }
      sh.env[m[1]] = value;
      out.addLine('$', trimmed, null);
    },

    which(trimmed, arg) {
      const name = arg.trim().toLowerCase();
      if (!name) out.addLine('$', trimmed, 'usage: which <command>', true);
      else if (Object.hasOwn(WHICH_SPECIAL, name)) out.addLine('$', trimmed, WHICH_SPECIAL[name]);
      else if (Object.hasOwn(ALIASES, name)) out.addLine('$', trimmed, `${name}: aliased to ${ALIASES[name]}`);
      else if (Object.hasOwn(FILTERS, name)) out.addLine('$', trimmed, `/usr/bin/${name}`);
      else if (has(name)) out.addLine('$', trimmed, `/usr/local/bin/${name}`);
      else out.addLine('$', trimmed, `${name} not found`, true);
    },

    history(trimmed, arg) {
      if (arg.trim() === '-c') {
        history.clear();
        out.addLine('$', trimmed, null);
        return;
      }
      const all = history.getAll();
      if (!all.length) {
        out.addLine('$', trimmed, 'no commands in history yet');
        return;
      }
      // entries are newest-first; print oldest → newest like a real shell
      const recent = all.slice(0, 20).reverse();
      const start = all.length - recent.length + 1;
      out.addLine('$', trimmed, null);
      recent.forEach((h, i) => out.addLine(null, null, `  ${String(start + i).padStart(3)}  ${h}`));
    },

    man(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'man', arg);
      if (target === null) return;
      if (!target) {
        out.addLine('$', trimmed, 'what manual page do you want? usage: man <command>', true);
        return;
      }
      const resolved = lookup(ALIASES, target.toLowerCase()) || target.toLowerCase();
      const page = lookup(MAN_PAGES, resolved);
      if (!page) {
        out.addLine('$', trimmed, `no manual entry for '${target}'`, true);
        return;
      }
      const def = COMMAND_DEFS.find((c) => c.name === resolved);
      out.addLine('$', trimmed, null);
      out.addLine(null, null, `NAME\n    ${resolved}${def?.help ? ` - ${def.help}` : ''}`);
      out.addLine(null, null, `\nSYNOPSIS\n    ${def?.usage || resolved}`);
      out.addLine(null, null, `\nDESCRIPTION\n    ${page}`);
    },

    theme(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'theme', arg);
      if (target === null) return;
      const lower = target.toLowerCase();
      if (lower === 'dark' || lower === 'light') {
        setThemePreference(lower);
        applyTheme(lower);
        out.addLine('$', trimmed, null);
        out.addOk(`theme: ${lower}`);
      } else if (lower === 'default' || lower === 'system' || lower === 'auto') {
        const theme = useSystemTheme();
        out.addLine('$', trimmed, null);
        out.addOk(`theme: default (${theme}, following your device)`);
      } else if (!target) {
        const next = toggleTheme();
        out.addLine('$', trimmed, null);
        out.addOk(`theme → ${next}`);
      } else {
        out.addLine('$', trimmed, `theme: unknown value '${target}'. use: dark, light, default`, true);
      }
    },

    true(trimmed) {
      out.addLine('$', trimmed, null);
    },

    false(trimmed) {
      out.addLine('$', trimmed, null);
      sh.lastFailed = true;
    },

    exit: exitMessage,
    quit: exitMessage,
  };
}
