// ─── Editors: emacs (the good one) and vim (the trap) ───

import { readFile } from '../fs.js';
import { openEmacs, openVim } from '../editor.js';
import { signGuestbook } from '../../guestbook.js';

export function editorCommands({ out, sh, focusInput }) {
  return {
    emacs(trimmed, arg) {
      if (!out.live) {
        out.addLine('$', trimmed, 'emacs: needs a screen, not a pipe', true);
        return;
      }
      out.addLine('$', trimmed, null);
      const target = arg.trim();
      // emacs guestbook: the Emacs way to sign it
      if (/^guestbook$/i.test(target)) {
        signGuestbook({ onDone: out.guard(({ ok, text }) => out.addLine(null, null, text, !ok)), onExit: focusInput });
        return;
      }
      if (!target) {
        if (!openEmacs({ onExit: focusInput })) out.addLine(null, null, 'emacs: an editor is already open', true);
        return;
      }
      const file = readFile(sh.cwd, target);
      if (file.error && /Is a directory/.test(file.error)) {
        out.addLine(null, null, `emacs: ${target}: is a directory`, true);
        return;
      }
      // a file that exists opens read-only; a new name opens an empty buffer
      openEmacs({
        name: target.split('/').pop(),
        text: file.error ? '' : `${file.text}\n`,
        readOnly: !file.error,
        mode: 'Text',
        onExit: focusInput,
      });
    },

    vim(trimmed) {
      if (!out.live) {
        out.addLine('$', trimmed, 'vim: needs a screen, not a pipe', true);
        return;
      }
      out.addLine('$', trimmed, null);
      openVim({
        onExit: out.guard(() => {
          out.addOk('you escaped vim. an emacs user would never have been trapped.');
          focusInput();
        }),
      });
    },
  };
}
