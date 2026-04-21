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
  { name: 'github', href: 'https://github.com/mubbie' },
  { name: 'substack', href: 'https://notebook.mubbie.dev' },
  { name: 'notebook', href: 'https://notebook.mubbie.dev' },
  { name: 'linkedin', href: 'https://www.linkedin.com/in/mubarak-idoko' },
  { name: 'x', href: 'https://twitter.com/imubbiee' },
  { name: 'twitter', href: 'https://twitter.com/imubbiee' },
  { name: 'instagram', href: 'https://www.instagram.com/mubbiee' },
  { name: 'threads', href: 'https://www.threads.net/@mubbiee' },
  { name: 'strava', href: 'https://strava.app.link/ySjT1gEwn2b' },
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
  '├── shell: sparkling-ice-fueled',
  '├── uptime: since \'00',
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
  { name: 'claude',                                     usage: 'claude',             help: 'open claude code' },
  { name: 'history',                                    usage: 'history',            help: 'recent commands' },
  { name: 'neofetch',                                   usage: 'neofetch',           help: 'system info' },
  { name: 'ping',                                       usage: 'ping',               help: 'pong' },
  { name: 'man',                                        usage: 'man <command>',      help: 'show manual for a command' },
  { name: 'uptime',                                     usage: 'uptime',             help: 'time since page load' },
  { name: 'curl',                                       usage: 'curl xkcd',         help: 'fetch & display an xkcd comic' },
  { name: 'grep',                                       usage: 'grep <term>',       help: 'search site content' },
  { name: 'popcorn',                                     usage: 'popcorn',           help: "what's poppin'" },
  { name: 'ssh',                                        usage: 'ssh',               help: 'connect to a remote host' },
  // Hidden commands (no help text — won't appear in help table but still tab-complete)
  { name: 'rm' },
  { name: 'exit' },
  { name: 'quit',     aliases: ['q'] },
];

// ─── Man pages ───

export const MAN_PAGES = {
  help:     'Display a list of all available commands with brief descriptions.',
  ls:       'List directory contents.\n\n  Paths:\n    ~, .     home directory (site sections)\n    /dev     hidden developer files\n\n  Aliases: ll, la',
  cd:       'Navigate to a site section by name.\n\n  Sections: projects, writing, currently, races, bucketlist, connect\n  Shortcuts: now → currently, running → races, bucket → bucketlist\n  cd ~ scrolls to top.',
  cat:      'Read the contents of a file.\n\n  Try: cat /dev/secrets.txt\n  Run ls /dev to see available files.',
  open:     'Open a project, social link, or post in a new tab.\n\n  Projects: gx, officecat, portctl, chaos-pong, lena\n  Social: github, linkedin, x, twitter, instagram, threads, strava\n  Links: substack, notebook\n  Special: open latest — opens the latest blog post\n\n  Exact matches are preferred. If ambiguous, suggestions are shown.',
  whoami:   'Print the current user identity.',
  theme:    'Toggle or set the color theme.\n\n  theme          toggle between dark and light\n  theme dark     switch to dark mode\n  theme light    switch to light mode\n\n  Explicit choices are persisted. Without one, the site follows your OS preference.',
  weather:  'Fetch current weather for Seattle via wttr.in.\n\n  Displays temperature (°F/°C), wind, and humidity.',
  sudo:     'Execute a command as superuser.\n\n  Try: sudo hire-me',
  matrix:   'Enter the Matrix. Green rain falls.\n\n  Press Esc or tap anywhere to exit.\n  Alias: hack',
  coffee:   'Brew a virtual cup of coffee.\n\n  Alias: brew',
  flip:     'Flip a fair coin. Heads or tails.\n\n  Alias: coin',
  '8ball':  'Ask the Magic 8-Ball a yes/no question.\n\n  Usage: 8ball <question>',
  random:   'Get a random fortune cookie message.\n\n  Alias: fortune',
  echo:     'Print text to the terminal.\n\n  Usage: echo <text>',
  date:     'Print the current date and time.',
  pwd:      'Print the current working directory.',
  repo:     'Open the mubbie.dev GitHub repository in a new tab.',
  clear:    'Clear all terminal history.\n\n  Aliases: c, cls\n  Shortcut: Ctrl+L',
  claude:   'The AI that helped build this site.',
  history:  'Show the last 20 commands entered in this session.',
  neofetch: 'Display system information in a stylized format.',
  ping:     'Send a ping. Receive a pong.',
  man:      'Show the manual page for a command.\n\n  Usage: man <command>',
  uptime:   'Show how long since the page was loaded.',
  curl:     'Fetch and display content from the web.\n\n  curl xkcd          today\'s xkcd comic\n  curl xkcd random   a random xkcd comic',
  popcorn:  'What\'s poppin\'! 🍿\n\n  Triggers a popcorn explosion. Because why not.',
  grep:     'Search across all site content.\n\n  Usage: grep <term>\n  Searches: projects, writing, races, bucket list, currently, connect, /dev.\n  Results grouped by section. Only sections with matches are shown.',
  ssh:      'Attempt to connect to a remote host.\n\n  Spoiler: you\'re already here.',
  rm:       'Nice try.',
  exit:     'There is no escape.',
  quit:     'See: man exit',
};

// ─── MOTD hints ───

export const HINTS = [
  // useful
  'try "curl xkcd" for a comic',
  'type "man open" to see all you can open',
  'try "open latest" to read my newest post',
  '"theme" toggles dark/light mode',
  'press Tab to autocomplete commands',
  'type "neofetch" for system info',
  '"open linkedin" or "open github" to connect',
  'try "grep marathon" to search the site',
  '"history" shows your recent commands',
  'try "cat /dev/secrets.txt" 👀',
  '"weather" for live seattle conditions',
  'try "uptime" to see how long you\'ve been here',
  // fun
  'try "sudo hire-me" 👀',
  '"8ball is pineapple on pizza ok?" — ask the oracle',
  'try "curl xkcd random" for a surprise',
  'try "ssh" and see what happens',
  'try "matrix" if you dare',
  'try "sudo rm -rf /" — I dare you',
  '"flip" when you can\'t decide',
  'try "coffee" — you look like you need one',
  '"ping" — just checking',
  'this terminal has 30+ commands. find them all.',
  'try "open strava" to see my runs',
  'you found the secret terminal. congrats.',
  '"random" for a fortune cookie',
  'type "help" if you\'re lost. no judgment.',
  'press / from anywhere to jump here',
  'there are hidden easter eggs. can you find them?',
];

// ─── Derived exports ───

export const HELP_ITEMS = COMMAND_DEFS
  .filter((c) => c.help)
  .map((c) => ({ c: c.usage || c.name, d: c.help }));

export const ALL_COMMANDS = COMMAND_DEFS.flatMap((c) => [c.name, ...(c.aliases || [])]);

export const ALIASES = {};
COMMAND_DEFS.forEach((c) => (c.aliases || []).forEach((a) => { ALIASES[a] = c.name; }));
