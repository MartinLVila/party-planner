# Party Planner

Plan every member's build in an AION 2 party and the party order for raids, together with
friends. One shared link per party, no accounts.

The interface is in Rioplatense Spanish. Game data — item, skill and class names, grades, stats —
stays in English, exactly as the game shows it on Global servers.

## Status

Early development. The data model, security baseline and catalog sync land first; the
screens described below follow.

## What it does

- **Party:** an ordered roster of members (name, class, role). Reorder by dragging or with the
  keyboard. Shows the role composition and what is missing ("Sin healer").
- **Builds:** around 35 equipment slots per member, each with an item from the catalog, enchant
  level +0 to +20 and exceed 0 to 5. Skills grouped into Active, Passive and Dp, with level 1 to 30
  and whether they are on the skill bar.
- **Compare:** members side by side, highlighting empty and weak slots before a raid.

## Game data

Global servers have no public API. The item, class and skill catalog comes from the internal JSON
API behind the AION 2 Taiwan website, which serves English data. It is unofficial and can change or
disappear without notice, so:

- The browser never talks to it. A sync run fetches the catalog on the server, one request every
  1.5 seconds, and stores it in Postgres. The app keeps working while the upstream is down.
- Every response is validated against a schema. A response that does not validate writes nothing,
  and a partial sync never replaces a complete catalog. A catalog that would
  shrink below 80% of the active one is rejected too. Every run is recorded in `sync_runs` with
  what it examined, or why it failed.
- There is no per-class skill catalog upstream. It is assembled from the learned skills of sampled
  Taiwan characters, and each run reports how many characters and skills it examined per class.
- Skill point costs and the total point cap are unknown, and the app says so instead of guessing.

## Access design

There are no user accounts. Each party has a secret link — one for editing, one read-only — plus a
password its creator sets.

- Link tokens are 256 bits of randomness, sent in the URL fragment so they never reach server logs,
  `Referer` headers or link previews, and stored only as SHA-256 hashes.
- Opening a link asks for the party password. Passwords are hashed with scrypt, and failed attempts
  are throttled per party.
- A successful unlock exchanges link and password for an `HttpOnly`, `SameSite=Strict` session
  cookie. Rotating the link or changing the password invalidates every existing session.

## Stack

Next.js (App Router) on Vercel, Postgres on Neon through Drizzle, Zod for validating upstream data,
Vitest with PGlite for tests against a real Postgres engine.

## Development

Requires Node.js 24.

```sh
npm install
cp .env.example .env.local   # point DATABASE_URL at a Postgres database
npm run db:migrate
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Unit and database tests (PGlite, no external database needed) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration after changing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run sync:catalog -- classes` | Sync the class list into `DATABASE_URL` |
| `npm run sync:catalog -- items` | Sync grades, categories and equipment items (about 15 requests, one every 1.5 s) |

Add `--dry-run` to a sync to fetch and validate everything without touching the database.

## License

[MIT](LICENSE)
