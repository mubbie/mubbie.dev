// ─── Terminal command data & definitions ───

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

export const HELP_ITEMS = [
  { c: 'help',               d: 'show this list' },
  { c: 'ls [path]',          d: 'list sections or /dev files' },
  { c: 'cd <section>',       d: 'jump to a section' },
  { c: 'cat <file>',         d: 'read a file (try: ls /dev)' },
  { c: 'open <name>',        d: 'open a project or post by name' },
  { c: 'whoami',             d: 'who is this' },
  { c: 'theme [dark|light]', d: 'switch color theme' },
  { c: 'sudo hire-me',       d: 'you know you want to' },
  { c: 'matrix',             d: 'take the red pill' },
  { c: 'coffee',             d: 'brew a virtual cup' },
  { c: 'random',             d: 'fortune cookie' },
  { c: 'echo <text>',        d: 'repeat after me' },
  { c: 'date',               d: 'current date & time' },
  { c: 'pwd',                d: 'print working directory' },
  { c: 'clear',              d: 'wipe terminal history' },
  { c: 'claude',             d: 'open claude code' },
];

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

export const ALL_COMMANDS = [
  'help', 'ls', 'cd', 'cat', 'open', 'whoami', 'theme',
  'sudo', 'matrix', 'coffee', 'random', 'echo', 'date',
  'pwd', 'clear', 'claude',
];
