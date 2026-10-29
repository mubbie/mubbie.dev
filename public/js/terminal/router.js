// ─── Output routing ───
//
// Handlers write to `out`, which forwards to whatever target is current:
//   - a runner prints to the screen, echoing the typed line once before its first output
//   - a capture collects lines to feed the next stage of a pipe (errors still go to screen)
// The current target is swapped synchronously around each handler call. Anything a handler
// prints later (timers, network replies) must go through out.later or out.guard, which
// remember the target and drop the output after Ctrl+C or clear.

export function createRouter(base) {
  let current;

  function withCurrent(target, fn) {
    const prev = current;
    current = target;
    try { return fn(); } finally { current = prev; }
  }

  // ctx: { prompt, line, echoed, failed } for one typed line
  function runner(ctx) {
    const echo = () => {
      if (!ctx.echoed) {
        base.addLine(ctx.prompt, ctx.line, null);
        ctx.echoed = true;
      }
    };
    const self = {
      live: true,
      addLine(prompt, cmd, output, isError) {
        if (prompt !== null) echo();
        if (isError) ctx.failed = true;
        return output != null ? base.addLine(null, null, output, isError) : null;
      },
      addOk(text) { echo(); base.addOk(text); },
      addHelpTable(items) { echo(); base.addHelpTable(items); },
      addImage(...a) { echo(); base.addImage(...a); },
      addLink(...a) { echo(); base.addLink(...a); },
      later(fn, delay) { base.later(() => withCurrent(self, fn), delay); },
      clear() { base.clear(); ctx.echoed = true; },
    };
    return self;
  }

  function capture(ctx) {
    const self = {
      live: false,
      lines: [],
      addLine(prompt, cmd, output, isError) {
        if (output == null) return null;
        // errors go to the screen (stderr), not down the pipe
        if (isError) runner(ctx).addLine('$', null, output, true);
        else self.lines.push(...String(output).split('\n'));
        return null;
      },
      addOk(text) { self.lines.push(text); },
      addHelpTable(items) { items.forEach((h) => self.lines.push(`${h.c.padEnd(28)}${h.d}`)); },
      addImage(src, alt) { self.lines.push(alt || src); },
      addLink(text) { self.lines.push(text); },
      // a pipe waits for the whole output, so animations run instantly
      later(fn) { withCurrent(self, fn); },
      clear() {},
    };
    return self;
  }

  // Between commands, output (e.g. a late network reply) prints without echoing anything
  current = runner({ echoed: true });

  const out = {
    get live() { return current.live; },
    addLine: (...a) => current.addLine(...a),
    addOk: (...a) => current.addOk(...a),
    addHelpTable: (...a) => current.addHelpTable(...a),
    addImage: (...a) => current.addImage(...a),
    addLink: (...a) => current.addLink(...a),
    later: (...a) => current.later(...a),
    clear: () => current.clear(),
    // Wrap a callback that runs later (a fetch's .then): it prints to the same place, or
    // not at all if Ctrl+C or clear happened in between
    guard(fn) {
      const target = current;
      const generation = base.generation();
      return (...a) => {
        if (base.generation() !== generation) return undefined;
        return withCurrent(target, () => fn(...a));
      };
    },
  };

  return { out, runner, capture, withCurrent };
}
