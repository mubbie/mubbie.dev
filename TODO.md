# TODO

Ideas parked for later (from looking at vitorialima.com).

## Past / present / future arc

Do this around the team switch, when "present" changes anyway.

- Short story in three beats: how I got into software (Lena, education in
  Africa), where I am now (new team), and what I want to build next.
- Could be its own section or a terminal command (`whoami --long`, or
  `cat past.txt` / `present.txt` / `future.txt`).
- Update `about` / `about.txt` in `public/js/terminal/commands.js` and the
  hero tagline at the same time.

## One-line identity in the hero

"engineer, runner, writer — reach out about any of the three." Running is a
big part of the page but not mentioned up top. Pairs naturally with the arc
above.

## Projects: favorites vs. older (maybe)

Add a year to each project card and split into "favorites" and "old / random".
Only worth it once there are enough projects for the split to mean something.

## Fav tools dock: bench

Apps that didn't make the dock. Keep it at 8 so icons stay tappable on phones
(9 is ~31px, 10 is ~27px on an iPhone), so adding one means swapping one out.
Icons go in `public/img/tools/` (128px, cropped to the artwork), entries in
`public/data/uses.json`.

- Steam Deck: portable gaming (swapped out for Listy)
- Monarch Money: financial management
- TickTick: tasks / todos
- StrongLifts: strength training
- Spark: email client
- Brick: focus
- Waze: navigation

## Writing categories on the site (parked)

Tried filter pills (all / technical / fitness / life / general) above the
writing list, then pulled them: too few posts per category to be worth the UI.
The Substack posts are tagged now, and `/api/v1/posts` returns `postTags`, so
bringing filters back means passing `postTags` through in `workers/index.js`
(`fetchFromSubstack`) and filtering on the client. No local mapping needed.
