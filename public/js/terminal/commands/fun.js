// ─── The fun stuff: sudo, matrix, coffee, cocktail, ssh, sl, cowsay, 8ball, … ───

import { EIGHT_BALL_RESPONSES, NEOFETCH_LINES } from '../commands.js';
import { cowsay, unquote } from '../shell.js';
import { isRmRf, openUrl, playSteps } from '../args.js';
import { startMatrix } from '../../matrix.js';
import { popPopcorn } from '../../popcorn.js';
import { ACTIVITIES } from '../../hangout.js';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const SHELVES = ['tavern', 'merchant', 'alchemist', 'archmage'];
const PHIALS = ['brooding', 'celebratory', 'contemplative', 'amorous', 'courageous', 'weary'];
const COCKTAIL_GUIDE = [
  '',
  '  cocktail <shelf> <phial>',
  '  cocktail random',
  '',
  '  shelves (how much you want to spend):',
  '    tavern      budget',
  '    merchant    mid-range',
  '    alchemist   premium',
  '    archmage    top-shelf',
  '',
  '  phials (how are you feeling):',
  '    brooding        dark & smoky',
  '    celebratory     bubbly & bright',
  '    contemplative   smooth & mellow',
  '    amorous         sweet & romantic',
  '    courageous      bold & strong',
  '    weary           easy & comforting',
];

// You typed sl, not ls. Real terminals punish this with a train.
const TRAIN = [
  '      ====        ________                ___________ ',
  '  _D _|  |_______/        \\__I_I_____===__|_________| ',
  '   |(_)---  |   H\\________/ |   |        =|___ ___|  ',
  '   /     |  |   H  |  |     |   |         ||_| |_||  ',
  '  |      |  |   H  |__--------------------| [___] |  ',
  '  | ________|___H__/__|_____/[][]~\\_______|       |  ',
  '  |/ |   |-----------I_____I [][] []  D   |=======|__',
  '__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__',
  ' |/-=|___|=    ||    ||    ||    |_____/~\\___/        ',
  '  \\_/      \\O=====O=====O=====O_/      \\_/            ',
];

export function funCommands({ out }) {
  return {
    sudo(trimmed, arg) {
      const lower = arg.toLowerCase();
      if (lower === 'hire-me' || lower === 'hire me') {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, '[sudo] password for recruiter: ••••••••');
        out.addOk('authenticated. email queued → hi@mubbie.dev');
        out.addLine(null, null, 'just kidding. drop a note at hi@mubbie.dev 👋🏾');
      } else if (isRmRf(lower)) {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, '[sudo] password for root: ••••••••');
        playSteps(out, [
          ['deleting /projects...', 600],
          ['deleting /writing...', 1200],
          ['deleting /races...', 1800],
          ['deleting /bucketlist...', 2400],
          ['deleting /connect...', 3000],
          ['deleting /dev/secrets.txt...', 3600],
        ], { text: 'just kidding. nice try though. 🛡️', delay: 4200 });
      } else {
        out.addLine('$', trimmed, 'nice try 😏', true);
      }
    },

    rm(trimmed) {
      out.addLine('$', trimmed, 'rm: permission denied. try sudo?', true);
    },

    matrix(trimmed) {
      if (!out.live) {
        out.addLine('$', trimmed, 'matrix: needs a screen, not a pipe', true);
        return;
      }
      out.addLine('$', trimmed, null);
      if (reducedMotion()) {
        out.addLine(null, null, 'the matrix is resting: your system prefers reduced motion.');
        return;
      }
      out.addOk('wake up, neo... (esc or tap to exit)');
      out.later(() => startMatrix(), 400);
    },

    coffee(trimmed) {
      out.addLine('$', trimmed, null);
      playSteps(out, [
        ['🫘 grinding beans...', 0],
        ['💧 heating water...', 600],
        ['☕ brewing...', 1200],
        ['🥛 adding a splash...', 1800],
      ], { text: '☕ freshly brewed. enjoy!', delay: 2400 });
    },

    cocktail(trimmed, arg) {
      const args = arg ? arg.trim().toLowerCase().split(/\s+/) : [];
      let url = null;
      if (args.length === 1 && args[0] === 'random') url = 'https://sorcery.lol?random=true';
      else if (args.length === 2 && SHELVES.includes(args[0]) && PHIALS.includes(args[1])) url = `https://sorcery.lol?tier=${args[0]}&mood=${args[1]}`;

      if (!url) {
        out.addLine('$', trimmed, null);
        out.addLine(null, null, args.length ? '🧙 unknown incantation. try:' : '🧙 conjure your next drink:');
        COCKTAIL_GUIDE.forEach((line) => out.addLine(null, null, line));
        return;
      }
      if (!out.live) {
        out.addLine('$', trimmed, 'cocktail: opens a tab, so it needs a screen, not a pipe', true);
        return;
      }
      out.addLine('$', trimmed, null);
      playSteps(out, [
        ['🧙 consulting the apothecary...', 0],
        ['🌿 gathering rare ingredients...', 700],
        ['⚗️ mixing the elixir...', 1400],
        ['✨ channeling flavor spirits...', 2100],
        ['🔮 divining the perfect concoction...', 2800],
      ], { text: '🍸 your elixir awaits. opening sorcery...', delay: 3500 });
      out.later(() => openUrl(out, url, 'sorcery'), 4100);
    },

    ssh(trimmed, arg) {
      const host = arg.trim() || 'mubbie.dev';
      out.addLine('$', trimmed, null);
      playSteps(out, [
        [`connecting to ${host}...`, 0],
        ['establishing secure connection...', 800],
        ['authenticating...', 1600],
      ], { text: 'access granted. welcome back. you\'re already here. 🏠', delay: 2400 });
    },

    sl(trimmed) {
      out.addLine('$', trimmed, null);
      const el = out.addLine(null, null, TRAIN.join('\n'));
      if (!el || !out.live || reducedMotion()) return;
      const width = 46;
      for (let f = 0; f <= width + TRAIN[0].length; f += 2) {
        out.later(() => {
          const shift = width - f;
          el.textContent = TRAIN.map((row) => (shift >= 0 ? ' '.repeat(shift) + row : row.slice(-shift))).join('\n');
        }, f * 25);
      }
    },

    cowsay(trimmed, arg) {
      out.addLine('$', trimmed, cowsay(unquote(arg.trim()) || 'moo. (try: random | cowsay)').join('\n'));
    },

    flip(trimmed) {
      out.addLine('$', trimmed, Math.random() < 0.5 ? '🪙 heads!' : '🪙 tails!');
    },

    '8ball'(trimmed, arg) {
      if (!arg) out.addLine('$', trimmed, 'ask me a question. e.g. 8ball will I ship this feature?', true);
      else out.addLine('$', trimmed, `🎱 ${pick(EIGHT_BALL_RESPONSES)}`);
    },

    hangout(trimmed) {
      out.addLine('$', trimmed, null);
      out.addOk(`🎲 next hangout: ${pick(ACTIVITIES)}`);
      out.addLine(null, null, 'want in? try "open hangouters"');
    },

    popcorn(trimmed) {
      out.addLine('$', trimmed, null);
      out.addOk("what's poppin'! 🍿");
      if (out.live) popPopcorn(document.getElementById('terminal'));
    },

    neofetch(trimmed) {
      out.addLine('$', trimmed, null);
      NEOFETCH_LINES.forEach((line) => out.addLine(null, null, line));
    },

    nano(trimmed) {
      out.addLine('$', trimmed, 'nano? in this economy? (try: emacs)');
    },

    claude(trimmed) {
      out.addLine('$', trimmed, 'I helped build this site, you\'re welcome 😎');
    },

    ping(trimmed) {
      out.addLine('$', trimmed, 'pong! 🏓');
    },
  };
}
