// ─── Commands that reach the network or open tabs: open, weather, curl, repo, guestbook ───

import { OPENABLES } from '../commands.js';
import { rejectFlags, openUrl } from '../args.js';
import { fetchJSON } from '../../dom.js';
import { fetchWeather } from '../../weather.js';
import { fetchNotes, signGuestbook, formatDate } from '../../guestbook.js';

// Their output arrives later over the network, so they can't feed a pipe
export const NETWORK_COMMANDS = new Set(['weather', 'curl', 'open', 'guestbook']);

const XKCD_MISSING = 404; // xkcd #404 intentionally doesn't exist

export function webCommands({ out, focusInput }) {
  function openLatestPost(trimmed) {
    out.addLine('$', trimmed, null);
    out.addLine(null, null, 'fetching latest post...');
    fetchJSON('/api/posts?limit=1')
      .then(out.guard((posts) => {
        const post = Array.isArray(posts) && posts[0];
        if (!post) throw new Error('no posts');
        const link = post.canonical_url || `https://notebook.mubbie.dev/p/${encodeURIComponent(post.slug)}`;
        if (openUrl(out, link, `"${post.title}"`)) out.addOk(`→ opening "${post.title}"`);
      }))
      .catch(out.guard(() => out.addLine(null, null, 'could not fetch latest post.', true)));
  }

  return {
    open(trimmed, arg) {
      const target = rejectFlags(out, trimmed, 'open', arg);
      if (target === null) return;
      const lower = target.toLowerCase();
      if (!target) {
        out.addLine('$', trimmed, 'usage: open <project|link> (try: open gx, open latest)', true);
        return;
      }
      if (['latest', 'substack latest', 'notebook latest'].includes(lower)) {
        openLatestPost(trimmed);
        return;
      }
      const exact = OPENABLES.find((x) => x.name.toLowerCase() === lower);
      const matches = exact ? [exact] : OPENABLES.filter((x) => x.name.toLowerCase().includes(lower));
      if (matches.length === 1) {
        out.addLine('$', trimmed, null);
        if (openUrl(out, matches[0].href, matches[0].name)) out.addOk(`→ opening ${matches[0].name}`);
      } else if (matches.length > 1) {
        out.addLine('$', trimmed, `open: ambiguous '${target}'. did you mean: ${matches.map((m) => m.name).join(', ')}?`, true);
      } else {
        out.addLine('$', trimmed, `open: '${target}' not found. try: open gx, open latest, open substack`, true);
      }
    },

    repo(trimmed) {
      out.addLine('$', trimmed, null);
      if (openUrl(out, 'https://github.com/mubbie/mubbie.dev', 'mubbie/mubbie.dev')) out.addOk('→ opening mubbie/mubbie.dev');
    },

    weather(trimmed) {
      out.addLine('$', trimmed, null);
      out.addLine(null, null, 'fetching seattle weather...');
      const failed = () => out.addLine(null, null, 'could not fetch weather. try again later.', true);
      fetchWeather()
        .then(out.guard((w) => {
          if (!w) failed();
          else out.addOk(`seattle: ${w.emoji} ${w.f}°F/${w.c}°C · ${w.wind} · ${w.humidity} humidity`);
        }))
        .catch(out.guard(failed));
    },

    curl(trimmed, arg) {
      const target = arg.trim().toLowerCase();
      if (!target) {
        out.addLine('$', trimmed, 'usage: curl xkcd | curl xkcd random', true);
        return;
      }
      if (target !== 'xkcd' && target !== 'xkcd random') {
        out.addLine('$', trimmed, `curl: unsupported target '${target}'. try: curl xkcd`, true);
        return;
      }
      out.addLine('$', trimmed, null);
      out.addLine(null, null, 'fetching xkcd...');
      const comic = target === 'xkcd random'
        ? fetchJSON('/api/xkcd').then((latest) => {
          let num = Math.floor(Math.random() * latest.num) + 1;
          if (num === XKCD_MISSING) num += 1;
          return fetchJSON(`/api/xkcd?num=${num}`);
        })
        : fetchJSON('/api/xkcd');
      comic
        .then(out.guard((data) => {
          out.addOk(`xkcd #${data.num}: ${data.title}`);
          out.addImage(data.img, data.alt, `https://xkcd.com/${data.num}/`);
        }))
        .catch(out.guard(() => out.addLine(null, null, 'could not fetch xkcd. try again later.', true)));
    },

    // Read notes, or sign (also: emacs guestbook)
    guestbook(trimmed, arg) {
      const sub = arg.trim().toLowerCase();
      if (sub === 'sign') {
        out.addLine('$', trimmed, null);
        signGuestbook({ onDone: out.guard(({ ok, text }) => out.addLine(null, null, text, !ok)), onExit: focusInput });
        return;
      }
      if (sub) {
        out.addLine('$', trimmed, `guestbook: unknown option '${sub}'. try: guestbook, guestbook sign`, true);
        return;
      }
      out.addLine('$', trimmed, null);
      out.addLine(null, null, 'fetching notes...');
      fetchNotes()
        .then(out.guard((notes) => {
          if (!notes.length) {
            out.addLine(null, null, 'no notes yet. be the first: guestbook sign');
            return;
          }
          notes.slice(0, 20).forEach((n) => out.addLine(null, null, `"${n.message}"\n  · ${n.name}, ${formatDate(n.createdAt)}`));
          out.addLine(null, null, `\n${notes.length} note${notes.length === 1 ? '' : 's'}. add yours: guestbook sign`);
        }))
        .catch(out.guard(() => out.addLine(null, null, 'could not load the guestbook. try again later.', true)));
    },
  };
}
