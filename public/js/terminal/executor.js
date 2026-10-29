// ─── Running a typed line: history expansion, ; && || sequencing, pipes, exit status ───

import { ALIASES } from './commands.js';
import { parseLine, syntaxError, expandHistory, expandVars, FILTERS, suggest } from './shell.js';
import { NETWORK_COMMANDS } from './commands/index.js';

// Aliases that carry flags, like a real shell's ll / la
const ALIAS_ARGS = { ll: '-l', la: '-a' };
const MAX_SAVED_LINE = 2000; // longer lines run but aren't kept in history

// Split "ls -l races" into a command name (aliases resolved) and its argument string
function splitCommand(stage) {
  const text = stage.trim();
  const word = text.split(/\s+/)[0];
  const lower = word.toLowerCase();
  let arg = text.slice(word.length).trim();
  if (Object.hasOwn(ALIAS_ARGS, lower)) arg = `${ALIAS_ARGS[lower]} ${arg}`.trim();
  const name = Object.hasOwn(ALIASES, lower) ? ALIASES[lower] : lower;
  return { name, arg, text };
}

export function createExecutor({ router, handlers, sh, history, base, promptText, commandNames }) {
  const { out, runner, capture, withCurrent } = router;

  function runHandler(name, text, arg, ctx) {
    if (Object.hasOwn(handlers, name)) {
      handlers[name](text, arg);
      return;
    }
    const guess = suggest(name, commandNames);
    out.addLine('$', text, `command not found: ${name}.${guess ? ` did you mean ${guess}?` : " try 'help'"}`, true);
    ctx.notFound = true;
  }

  // Run one pipeline; returns its exit status (0 ok, 1 error, 127 not found).
  // Like bash, the status is the last stage's.
  function runPipeline(stages, ctx) {
    ctx.failed = false;
    ctx.notFound = false;
    let stdin = null;

    for (let i = 0; i < stages.length; i++) {
      const isLast = i === stages.length - 1;
      const { name, arg, text } = splitCommand(expandVars(stages[i], sh.env));
      sh.lastFailed = false;

      // A filter reading the previous command's output
      if (stdin !== null && (Object.hasOwn(FILTERS, name) || (name === 'cat' && !arg))) {
        const result = name === 'cat' ? { lines: stdin } : FILTERS[name](stdin, arg ? arg.split(/\s+/) : []);
        if (result.error) {
          withCurrent(runner(ctx), () => out.addLine('$', text, `${name}: ${result.error}`, true));
          return 1;
        }
        if (isLast) {
          withCurrent(runner(ctx), () => out.addLine('$', text, result.lines.length ? result.lines.join('\n') : null));
          return result.failed ? 1 : 0;
        }
        stdin = result.lines;
        continue;
      }

      if (!isLast) {
        if (NETWORK_COMMANDS.has(name)) {
          withCurrent(runner(ctx), () => out.addLine('$', text, `${name}: its output arrives over the network and can't be piped`, true));
          return 1;
        }
        const cap = capture(ctx);
        withCurrent(cap, () => runHandler(name, text, arg, ctx));
        if (ctx.notFound) return 127;
        stdin = cap.lines;
        continue;
      }

      // Last stage, a regular command (it ignores any piped input, like echo does)
      ctx.failed = false;
      withCurrent(runner(ctx), () => runHandler(name, text, arg, ctx));
    }
    if (ctx.notFound) return 127;
    return ctx.failed || sh.lastFailed ? 1 : 0;
  }

  // Run what the user typed. Lines that didn't run (blank, failed !-expansion) aren't saved.
  return function run(rawInput) {
    const typed = rawInput.trim();
    if (!typed) return;
    const prompt = promptText();

    // !! / !n / !prefix, before anything else (like bash)
    const expansion = expandHistory(typed, history.getAll());
    if (expansion.error) {
      base.addLine(prompt, typed, expansion.error, true);
      sh.env['?'] = '1';
      return;
    }
    const { line } = expansion;
    if (line.length <= MAX_SAVED_LINE) history.push(line);

    const bad = syntaxError(line);
    if (bad) {
      base.addLine(prompt, line, bad, true);
      sh.env['?'] = '2';
      return;
    }

    // the echoed line is what actually ran
    const ctx = { prompt, line, echoed: false };
    let status = 0;
    parseLine(line).forEach((pipeline, i) => {
      if (i > 0 && pipeline.op === '&&' && status !== 0) return;
      if (i > 0 && pipeline.op === '||' && status === 0) return;
      status = runPipeline(pipeline.stages, ctx);
      // $? is updated after every pipeline, so "nope; echo $?" prints 127
      sh.env['?'] = String(status);
    });

    // cd, export… print nothing, but the line still shows on screen
    if (!ctx.echoed) base.addLine(prompt, line, null);
  };
}
