// ─── Every command handler, by name ───
//
// A handler is (trimmed, arg) => void: `trimmed` is the command as typed (echoed above its
// output), `arg` is everything after the command name. Handlers print through deps.out and
// mark failure with deps.sh.lastFailed (or by printing an error).

import { fileCommands } from './files.js';
import { searchCommands } from './search.js';
import { builtinCommands } from './builtins.js';
import { webCommands } from './web.js';
import { editorCommands } from './editors.js';
import { funCommands } from './fun.js';

export { NETWORK_COMMANDS } from './web.js';

// deps: { out, sh, history, getFortunes, focusInput }
export function createHandlers(deps) {
  const handlers = {};
  const has = (name) => Object.hasOwn(handlers, name);
  const all = { ...deps, has };
  Object.assign(
    handlers,
    fileCommands(all),
    searchCommands(all),
    builtinCommands(all),
    webCommands(all),
    editorCommands(all),
    funCommands(all),
  );
  return handlers;
}
