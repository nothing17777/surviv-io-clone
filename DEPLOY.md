# Deploying surviv.io

The game has two parts, and they need different hosting:

| Part | What it is | Where |
| --- | --- | --- |
| Client | Static site (`client/`) | **Vercel** |
| API + game server | Long-running Node processes using WebSockets (`server/`) | A VPS / Railway / Fly.io / Render. **Not Vercel**: Vercel functions can't hold WebSocket connections open |

## 1. Host the server

On a machine with Node 22+ and pnpm (see `HOSTING.md` for a full VPS guide):

```sh
pnpm install
cp survev-config.hjson <server checkout>   # it's gitignored, copy it over (it holds all the modes)
cd server && pnpm build
NODE_ENV=production node dist/api/index.js        # API, port 8000
NODE_ENV=production node dist/gameServer.js       # game server, port 8001
```

Put both behind HTTPS (nginx config is in `nginx.conf`). In the server's `survev-config.hjson` set
`regions.na.address` to the public game server address and `gameServer.apiServerUrl` to the API URL.

## 2. Deploy the client to Vercel

1. Push this folder to a GitHub repo and import it in Vercel. `vercel.json` already sets the build.
2. Add these Environment Variables in the Vercel project:
   - `SURVIV_API_URL`: the API server, e.g. `https://api.yourdomain.com`
   - `SURVIV_GAME_ADDRESS`: the game server host (plus port if it isn't 443), e.g. `game.yourdomain.com`
   - `SURVIV_GAME_HTTPS`: `true` (default) or `false`
3. Deploy. Redeploy whenever those values change, because they're baked in at build time.

## Modes

`survev-config.hjson` turns on every map with Solo / Duo / Trio / Squad, plus:

- **Duel**: an arena for exactly two teams (1v1 to 4v4). Everyone spawns with max armor, full ammo and heals,
  the guns and throwable they picked in the menu, and any skin or melee.
- **Duel Classic**: the same arena with no god kit, so you loot like normal.

Players choose a map and team size in the main menu. Party leaders choose them in the team menu.
