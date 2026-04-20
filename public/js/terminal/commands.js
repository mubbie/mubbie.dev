// ─── Terminal command data & definitions ───

// ─── Filesystem & files ───

export const FILESYSTEM = {
  '~': ['projects/', 'writing/', 'currently/', 'races/', 'bucketlist/', 'connect/'],
  '/dev': ['secrets.txt', 'fuel', 'goals', 'mood', 'about.txt'],
};

export const FILES = {
  '/dev/secrets.txt': 'uncharted 4 is the greatest game ever made',
  '/dev/fuel': 'lots of protein, sparkling ice && gym training sessions',
  '/dev/goals': 'ironman  marathon  pilot-license  startup',
  '/dev/mood': 'optimistic with a chance of debugging',
  '/dev/about.txt': 'engineer. builder. writer. based in seattle.',
  'about': 'mubbie idoko. software engineer at microsoft security. building things, breaking things, writing about things that make me curious. currently in seattle, training for a marathon.',
  'about.txt': 'mubbie idoko. software engineer at microsoft security. building things, breaking things, writing about things that make me curious. currently in seattle, training for a marathon.',
};

export const SECTION_MAP = {
  'projects': 'projects',
  'writing': 'writing',
  'currently': 'currently',
  'now': 'currently',
  'races': 'races',
  'running': 'races',
  'bucketlist': 'bucketlist',
  'bucket': 'bucketlist',
  'connect': 'connect',
};

export const OPENABLES = [
  { name: 'gx', href: 'https://github.com/mubbie/gx-cli' },
  { name: 'officecat', href: 'https://github.com/mubbie/officecat' },
  { name: 'portctl', href: 'https://github.com/mubbie/portctl' },
  { name: 'chaos-pong', href: 'https://github.com/mubbie/chaos-pong' },
  { name: 'lena', href: 'https://lena.africa' },
  { name: 'garbage collection', href: 'https://open.substack.com/pub/mubbiesnotebook/p/garbage-collection-more-like-recycling' },
  { name: 'salt password', href: 'https://open.substack.com/pub/mubbiesnotebook/p/add-salt-to-the-password-for-taste' },
  { name: 'lean gta', href: 'https://open.substack.com/pub/mubbiesnotebook/p/getting-lean-before-gta-6' },
  { name: 'traffic jams', href: 'https://open.substack.com/pub/mubbiesnotebook/p/traffic-jamshtml' },
  { name: 'github', href: 'https://github.com/mubbie' },
  { name: 'substack', href: 'https://notebook.mubbie.dev' },
  { name: 'notebook', href: 'https://notebook.mubbie.dev' },
];

// ─── 8-ball responses ───

export const EIGHT_BALL_RESPONSES = [
  'it is certain.',
  'without a doubt.',
  'you may rely on it.',
  'yes, definitely.',
  'as I see it, yes.',
  'most likely.',
  'outlook good.',
  'signs point to yes.',
  'reply hazy, try again.',
  'ask again later.',
  'better not tell you now.',
  'cannot predict now.',
  'concentrate and ask again.',
  'don\'t count on it.',
  'my reply is no.',
  'my sources say no.',
  'outlook not so good.',
  'very doubtful.',
];

// ─── Neofetch output lines ───

export const NEOFETCH_LINES = [
  '🖥️ mubbie.dev',
  '├── os: human 1.0',
  '├── shell: caffeine-powered',
  '├── uptime: since \'98',
  '├── location: seattle, wa',
  '├── role: software engineer @ microsoft',
  '└── status: building cool things',
];

// ─── Command registry ───
// Single source of truth: name, aliases, help text.
// Adding a command? Add one entry here + a handler in index.js. That's it.

export const COMMAND_DEFS = [
  { name: 'help',     aliases: ['?'],                   usage: 'help',               help: 'show this list' },
  { name: 'ls',       aliases: ['ll', 'la'],            usage: 'ls [path]',          help: 'list sections or /dev files' },
  { name: 'cd',                                         usage: 'cd <section>',       help: 'jump to a section' },
  { name: 'cat',                                        usage: 'cat <file>',         help: 'read a file' },
  { name: 'open',                                       usage: 'open <name>',        help: 'open a project or post by name' },
  { name: 'whoami',                                     usage: 'whoami',             help: 'who is this' },
  { name: 'theme',                                      usage: 'theme [dark|light]', help: 'switch color theme' },
  { name: 'weather',                                    usage: 'weather',            help: 'seattle weather right now' },
  { name: 'sudo',                                       usage: 'sudo hire-me',       help: 'you know you want to' },
  { name: 'matrix',   aliases: ['hack'],                usage: 'matrix',             help: 'take the red pill' },
  { name: 'coffee',   aliases: ['brew'],                usage: 'coffee',             help: 'brew a virtual cup' },
  { name: 'flip',     aliases: ['coin'],                usage: 'flip',               help: 'flip a coin' },
  { name: '8ball',                                      usage: '8ball <question>',   help: 'ask the magic 8-ball' },
  { name: 'random',   aliases: ['fortune'],             usage: 'random',             help: 'fortune cookie' },
  { name: 'echo',                                       usage: 'echo <text>',        help: 'repeat after me' },
  { name: 'date',                                       usage: 'date',               help: 'current date & time' },
  { name: 'pwd',                                        usage: 'pwd',                help: 'print working directory' },
  { name: 'repo',                                       usage: 'repo',               help: 'open the site repo' },
  { name: 'clear',    aliases: ['c', 'cls'],            usage: 'clear',              help: 'wipe terminal history' },
  { name: 'claude',                                     usage: 'claude',             help: 'who built this?' },
  { name: 'history',                                    usage: 'history',            help: 'recent commands' },
  { name: 'neofetch',                                   usage: 'neofetch',           help: 'system info' },
  { name: 'ping',                                       usage: 'ping',               help: 'pong' },
  // Hidden commands (no help text — won't appear in help table but still tab-complete)
  { name: 'rm' },
  { name: 'exit' },
  { name: 'quit',     aliases: ['q'] },
];

// ─── Derived exports ───

export const HELP_ITEMS = COMMAND_DEFS
  .filter((c) => c.help)
  .map((c) => ({ c: c.usage || c.name, d: c.help }));

export const ALL_COMMANDS = COMMAND_DEFS.flatMap((c) => [c.name, ...(c.aliases || [])]);

export const ALIASES = {};
COMMAND_DEFS.forEach((c) => (c.aliases || []).forEach((a) => { ALIASES[a] = c.name; }));
