# surviv-io clone

A project to bring back the feeling of the old **surviv.io**: the quick 2D battle royale you could play in a browser tab, with friends or random people.

It's built on [survev](https://github.com/survev/survev), the open-source surviv.io server. This version adds more ways to play.

## What's different

- **Every map:** Normal, Desert, Woods, Savannah, Cobalt, Halloween, Potato, Snow, Beach, Birthday, Turkey, 50v50 and their seasonal versions, all available from a map dropdown on the main menu.
- **Solo, Duo, Trio and Squad** on every map. Trio, with three players per team, is new.
- **Duel:** a small arena for exactly two teams: 1v1, 2v2, 3v3 or 4v4. Everyone spawns with a god kit: max armor, full ammo and heals, the two guns and throwable they picked in the menu, and any skin or melee.
- **Duel Classic:** the same arena with no kit. You loot to win.
- **Parties:** the party leader picks the map and team size for the whole group.

## Running it locally

You need Node.js 22+ and pnpm.

```sh
pnpm install
pnpm dev
```

Then open http://127.0.0.1:3000.

The modes are set in `survev-config.hjson`.

## Deploying

The website can be hosted on Vercel. The game servers need a host that keeps running and supports WebSockets, such as a VPS, Railway or Fly.io. See [DEPLOY.md](DEPLOY.md) and [HOSTING.md](HOSTING.md).

## Credits and license

All credit for the original game goes to the surviv.io creators. The server and client this clone is built on come from the [survev](https://github.com/survev/survev) contributors.

This is a fan project with no connection to the original surviv.io. It's licensed under GPL-3.0, like survev. See [LICENSE](LICENSE).
