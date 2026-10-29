// ─── Terminal command data & definitions ───

// ─── Files (the directories themselves live in fs.js) ───

export const FILES = {
  '/dev/secrets.txt': 'uncharted 4 is the greatest game ever made',
  '/dev/fuel': 'lots of protein, sparkling ice && gym training sessions',
  '/dev/goals': 'ironman  marathon  pilot-license  startup',
  '/dev/mood': 'optimistic with a chance of debugging',
  '/dev/about.txt': 'engineer. builder. writer. based in seattle.',
  '/dev/editor': 'emacs. obviously.',
  'about': 'mubbie idoko. software engineer at microsoft security. building things, breaking things, writing about things that make me curious. currently in seattle, training for a marathon.',
  'about.txt': 'mubbie idoko. software engineer at microsoft security. building things, breaking things, writing about things that make me curious. currently in seattle, training for a marathon.',
};

export const OPENABLES = [
  { name: 'gx', href: 'https://github.com/mubbie/gx-cli' },
  { name: 'officecat', href: 'https://github.com/mubbie/officecat' },
  { name: 'portctl', href: 'https://github.com/mubbie/portctl' },
  { name: 'chaos-pong', href: 'https://github.com/mubbie/chaos-pong' },
  { name: 'sorcery', href: 'https://sorcery.lol' },
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
  { name: 'hangouters', href: 'https://chat.whatsapp.com/JDZW4Em5UyJEd7RS4leUNd' },
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
// Adding a command? Add one entry here + a handler in commands/ (the file for its theme).

export const COMMAND_DEFS = [
  { name: 'help',     aliases: ['?'],                   usage: 'help',               help: 'show this list' },
  { name: 'ls',       aliases: ['ll', 'la'],            usage: 'ls [-l] [path]',     help: 'list what\'s here, or in a path' },
  { name: 'cd',                                         usage: 'cd <dir>',           help: 'move to a section (cd .., cd -, cd ~)' },
  { name: 'cat',                                        usage: 'cat <file>',         help: 'read a file' },
  { name: 'open',                                       usage: 'open <name>',        help: 'open a project or post by name' },
  { name: 'whoami',                                     usage: 'whoami',             help: 'who is this' },
  { name: 'theme',                                      usage: 'theme [dark|light|default]', help: 'switch color theme' },
  { name: 'weather',                                    usage: 'weather',            help: 'seattle weather right now' },
  { name: 'sudo',                                       usage: 'sudo hire-me',       help: 'you know you want to' },
  { name: 'matrix',   aliases: ['hack'],                usage: 'matrix',             help: 'take the red pill' },
  { name: 'coffee',   aliases: ['brew'],                usage: 'coffee',             help: 'brew a virtual cup' },
  { name: 'cocktail', aliases: ['drink', 'sorcery'],   usage: 'cocktail',           help: 'for those who indulge: conjure your next drink' },
  { name: 'flip',     aliases: ['coin'],                usage: 'flip',               help: 'flip a coin' },
  { name: '8ball',                                      usage: '8ball <question>',   help: 'ask the magic 8-ball' },
  { name: 'random',   aliases: ['fortune'],             usage: 'random',             help: 'fortune cookie' },
  { name: 'echo',                                       usage: 'echo <text>',        help: 'repeat after me' },
  { name: 'date',                                       usage: 'date',               help: 'current date & time' },
  { name: 'pwd',                                        usage: 'pwd',                help: 'print working directory' },
  { name: 'repo',                                       usage: 'repo',               help: 'open the site repo' },
  { name: 'clear',    aliases: ['c', 'cls'],            usage: 'clear',              help: 'wipe terminal history' },
  { name: 'claude',                                     usage: 'claude',             help: 'who helped build this' },
  { name: 'history',                                    usage: 'history',            help: 'recent commands' },
  { name: 'neofetch',                                   usage: 'neofetch',           help: 'system info' },
  { name: 'ping',                                       usage: 'ping',               help: 'pong' },
  { name: 'man',                                        usage: 'man <command>',      help: 'show manual for a command' },
  { name: 'uptime',                                     usage: 'uptime',             help: 'time since page load' },
  { name: 'curl',                                       usage: 'curl xkcd',         help: 'fetch & display an xkcd comic' },
  { name: 'grep',                                       usage: 'grep <term>',       help: 'search site content' },
  { name: 'hangout',  aliases: ['hang'],                usage: 'hangout',           help: 'roll a seattle hangout idea' },
  { name: 'popcorn',                                     usage: 'popcorn',           help: "what's poppin'" },
  { name: 'ssh',                                        usage: 'ssh',               help: 'connect to a remote host' },
  { name: 'tree',                                       usage: 'tree [path]',       help: 'the whole site as a tree' },
  { name: 'env',      aliases: ['printenv'],            usage: 'env',               help: 'environment variables ($USER, $PWD, …)' },
  { name: 'which',    aliases: ['type'],                usage: 'which <command>',   help: 'where a command lives' },
  { name: 'cowsay',                                     usage: 'cowsay <text>',     help: 'a cow says it. try: random | cowsay' },
  { name: 'emacs',                                      usage: 'emacs [file]',      help: 'the one true editor. M-x doctor inside' },
  { name: 'guestbook',                                  usage: 'guestbook [sign]',  help: 'read the guestbook, or sign it' },
  // Pipe filters (documented in man pages; reachable via Tab)
  { name: 'head' },
  { name: 'tail' },
  { name: 'wc' },
  { name: 'sort' },
  { name: 'uniq' },
  { name: 'export' },
  { name: 'sl' },
  { name: 'vim',      aliases: ['vi'] },
  { name: 'nano' },
  { name: 'true' },
  { name: 'false' },
  // Hidden commands (no help text — won't appear in help table but still tab-complete)
  { name: 'rm' },
  { name: 'exit' },
  { name: 'quit',     aliases: ['q'] },
];

// ─── Man pages ───

export const MAN_PAGES = {
  help:     'Display a list of all available commands with brief descriptions.',
  ls:       'List directory contents. With no path, lists the current directory.\n\n  Paths:\n    ~, .        home directory (site sections)\n    ..          one level up\n    <section>   what\'s in a section (try: ls currently, ls cycling)\n    /dev        hidden developer files\n\n  Options:\n    -l          long format\n    -a          include . and ..\n    -1          one entry per line\n\n  Aliases: ll, la',
  cd:       'Change directory. The prompt shows where you are, and the page scrolls there.\n\n  cd <section>   projects, writing, currently, races, bucketlist, connect\n  cd ..          up one level\n  cd -           back to the previous directory\n  cd ~ (or cd)   home\n  cd /dev        the hidden developer directory\n\n  Shortcuts work from anywhere: now, tools/uses, running, cycling, bucket.\n  cd running / cd cycling also open that year\'s race tab.',
  cat:      'Print a file. Paths are relative to where you are.\n\n  Try: cat about.txt, cat bucketlist.md, cat /dev/secrets.txt\n  In ~/currently: cat reading, cat watching, …\n  Run ls (or ls /dev) to see what\'s there. Works in pipes: cat bucketlist.md | grep x',
  open:     'Open a project, social link, or post in a new tab.\n\n  Projects: gx, officecat, portctl, chaos-pong, sorcery, lena\n  Social: github, linkedin, x, twitter, instagram, threads, strava\n  Community: hangouters\n  Links: substack, notebook\n  Special: open latest (opens the latest blog post)\n\n  Exact matches are preferred. If ambiguous, suggestions are shown.',
  whoami:   'Print the current user identity.',
  theme:    'Toggle or set the color theme.\n\n  theme          toggle between dark and light\n  theme dark     switch to dark mode\n  theme light    switch to light mode\n  theme default  follow your device again (aliases: system, auto)\n\n  Explicit choices are persisted. Without one, or after theme default, the site follows your OS preference.',
  weather:  'Fetch current weather for Seattle via wttr.in.\n\n  Displays temperature (°F/°C), wind, and humidity.',
  sudo:     'Execute a command as superuser.\n\n  Try: sudo hire-me',
  matrix:   'Enter the Matrix. Green rain falls.\n\n  Press Esc or tap anywhere to exit.\n  Alias: hack',
  coffee:   'Brew a virtual cup of coffee.\n\n  Alias: brew',
  cocktail: 'For those who indulge: conjure your next drink.\n\n  Usage:\n    cocktail                 show guide\n    cocktail random          surprise me\n    cocktail <shelf> <phial> choose your own\n\n  Shelves (how much you want to spend):\n    tavern      budget\n    merchant    mid-range\n    alchemist   premium\n    archmage    top-shelf\n\n  Phials (how are you feeling):\n    brooding        dark & smoky\n    celebratory     bubbly & bright\n    contemplative   smooth & mellow\n    amorous         sweet & romantic\n    courageous      bold & strong\n    weary           easy & comforting\n\n  Aliases: drink, sorcery',
  flip:     'Flip a fair coin. Heads or tails.\n\n  Alias: coin',
  '8ball':  'Ask the Magic 8-Ball a yes/no question.\n\n  Usage: 8ball <question>',
  random:   'Get a random fortune cookie message.\n\n  Alias: fortune',
  echo:     'Print text. Variables expand: echo $USER, echo $PWD, echo $?\n\n  Usage: echo <text>',
  date:     'Print the current date and time.',
  pwd:      'Print the current working directory (it follows cd).',
  repo:     'Open the mubbie.dev GitHub repository in a new tab.',
  clear:    'Clear all terminal history.\n\n  Aliases: c, cls\n  Shortcut: Ctrl+L',
  claude:   'The AI that helped build this site.',
  history:  'Show recent commands. History is kept across visits in this browser.\n\n  history        list recent commands\n  history -c     clear it\n\n  Expansion:\n    !!             rerun the last command (try: sudo !!)\n    !n             rerun command number n\n    !prefix        rerun the latest command starting with prefix\n\n  Keys: up/down walk history, Ctrl+R searches it.',
  neofetch: 'Display system information in a stylized format.',
  ping:     'Send a ping. Receive a pong.',
  man:      'Show the manual page for a command.\n\n  Usage: man <command>',
  uptime:   'Show how long since the page was loaded.',
  curl:     'Fetch and display content from the web.\n\n  curl xkcd          today\'s xkcd comic\n  curl xkcd random   a random xkcd comic',
  hangout:  'Roll a random Seattle Hangouters activity.\n\n  Run it again for another one. To join: open hangouters\n  Alias: hang',
  popcorn:  'What\'s poppin\'! 🍿\n\n  Triggers a popcorn explosion. Because why not.',
  grep:     'Search. On its own it searches the whole site; in a pipe it filters lines.\n\n  grep <term>                 search projects, writing, tools, races, bucket list, …\n  … | grep [-i -v -c -n] <x>  keep lines containing x\n\n  Smart case: lowercase matches any case; a capital letter makes it exact.\n  Example: ls races | grep half | wc -l',
  tree:     'Print the site as a directory tree, from here or a given path.\n\n  Usage: tree [path]',
  env:      'Print environment variables. Set your own for this visit with export.\n\n  Try: echo $USER, echo $PWD, echo $EDITOR\n  Alias: printenv',
  which:    'Show where a command lives, or what an alias points to.\n\n  Usage: which <command>\n  Alias: type',
  cowsay:   'A cow says your text. Reads from a pipe too.\n\n  Try: cowsay hello, random | cowsay, whoami | cowsay',
  head:     'First lines of input (default 10).\n\n  Usage: … | head [-n N | -N]\n  Example: ls races | head -3',
  tail:     'Last lines of input (default 10).\n\n  Usage: … | tail [-n N | -N]',
  wc:       'Count lines, words, and characters.\n\n  Usage: … | wc [-l] [-w] [-c]\n  Example: ls races/cycling | wc -l',
  sort:     'Sort lines.\n\n  Usage: … | sort [-r] [-n] [-u]',
  uniq:     'Collapse repeated adjacent lines.\n\n  Usage: … | uniq [-c]',
  export:   'Set a variable for this visit.\n\n  Usage: export NAME=value, then echo $NAME',
  sl:       'You meant ls. Here is a train anyway. (Ctrl+C to stop it.)',
  vim:      'Opens vim. Getting out is your problem. (Hint: :q)\n\n  Alias: vi',
  emacs:    'Open Emacs. With no file you get *scratch*; with a file you get it read-only.\n\n  Keys (Meta is Alt, or Esc then the key):\n    C-x C-c        leave\n    C-x C-s        save (the filesystem is read-only, though)\n    M-x doctor     the built-in psychotherapist (RET twice to talk)\n    M-x butterfly  as seen in xkcd #378\n    C-a C-e C-n C-p C-f C-b C-k C-d   move and edit\n    C-g            quit whatever you started\n\n  On a phone, the chords are buttons at the bottom.',
  nano:     'A text editor. Opinions available on request.',
  true:     'Do nothing, successfully. Handy with && and ||.',
  guestbook: 'Read notes visitors left, or leave your own.\n\n  guestbook          read approved notes\n  guestbook sign     write one (opens the editor; C-c C-c or the send button)\n  emacs guestbook    the same, the Emacs way\n\n  Notes are reviewed before they appear. No links, emails, or phone numbers.',
  false:    'Do nothing, unsuccessfully. Try: false || echo recovered',
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
  '"theme default" goes back to your device\'s setting',
  'press Tab to autocomplete commands',
  'type "neofetch" for system info',
  '"open linkedin" or "open github" to connect',
  'try "grep marathon" to search the site',
  '"history" shows your recent commands',
  'some commands have secrets. explore.',
  '"weather" for live seattle conditions',
  'try "uptime" to see how long you\'ve been here',
  // fun
  'try "sudo hire-me" 👀',
  'ask the oracle: "8ball is pineapple on pizza ok?"',
  'try "curl xkcd random" for a surprise',
  'try "ssh" and see what happens',
  'try "matrix" if you dare',
  'try "sudo rm -rf /". I dare you',
  '"flip" when you can\'t decide',
  'try "coffee", you look like you need one',
  '"ping": just checking',
  'this terminal has 30+ commands. find them all.',
  'try "open strava" to see my runs',
  'you found the secret terminal. congrats.',
  '"random" for a fortune cookie',
  'bored this weekend? try "hangout"',
  'try "ls currently" to peek inside a section',
  'type "help" if you\'re lost. no judgment.',
  'press / from anywhere to jump here',
  'pipes work: ls races | grep half | wc -l',
  'cd into a section and the prompt follows you',
  'Ctrl+R searches your history, !! reruns the last command',
  'try "random | cowsay"',
  'emacs, then M-x doctor, if you need to talk',
  'typo? the terminal will suggest what you meant',
  'there are hidden easter eggs. can you find them?',
];

// ─── Derived exports ───

export const HELP_ITEMS = COMMAND_DEFS
  .filter((c) => c.help)
  .map((c) => ({ c: c.usage || c.name, d: c.help }));

export const ALL_COMMANDS = COMMAND_DEFS.flatMap((c) => [c.name, ...(c.aliases || [])]);

export const ALIASES = {};
COMMAND_DEFS.forEach((c) => (c.aliases || []).forEach((a) => { ALIASES[a] = c.name; }));
