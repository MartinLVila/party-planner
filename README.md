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

## Access

There are no user accounts. Each party has two secret links — one for editing, one read-only —
plus a password its creator sets.

- Link tokens are 256 bits of randomness, carried in the URL fragment so they never reach server
  logs, `Referer` headers or link previews, and stored only as SHA-256 hashes. They are shown once,
  when the party is created or its links are regenerated.
- Opening a link asks for the party password, hashed with scrypt. Every attempt is counted before
  the password is checked, and ten failures in 15 minutes lock the party for 15 minutes.
- A successful unlock sets an `HttpOnly`, `SameSite=Strict` session cookie scoped to that party's
  path. Regenerating the links or changing the password ends every existing session.
- Creating a party requires a creation code whose scrypt hash lives in `PARTY_CREATE_CODE_HASH`.
  Without it, creation is disabled.

## Stack

Next.js (App Router) on Vercel, Postgres on Neon through Drizzle and `pg`, Zod for validating
upstream data and form input, Vitest with PGlite for tests against a real Postgres engine.

## Development

Requires Node.js 24.

```sh
npm install
npm run db:local                        # Postgres (PGlite) on 127.0.0.1:54329, data in .local-db/
cp .env.example .env.local              # set DATABASE_URL to the one db:local prints
echo "some-long-code" | npm run --silent hash:creation-code   # paste into .env.local
npm run db:migrate
npm run sync:catalog -- classes
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Unit and database tests (PGlite, no external database needed) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration after changing `src/lib/db/schema.ts` |
| `npm run db:local` | Local Postgres for development, no install needed |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run hash:creation-code` | Read a creation code from stdin and print `PARTY_CREATE_CODE_HASH` |
| `npm run sync:catalog -- classes` | Sync the class list into `DATABASE_URL` |
| `npm run sync:catalog -- items` | Sync grades, categories and equipment items (about 15 requests, one every 1.5 s) |
| `npm run sync:catalog -- skills` | Sample the six highest-level characters of each class and build the skill list and equipment slots (about 75 requests) |

Add `--dry-run` to a sync to fetch and validate everything without touching the database.

## License

[MIT](LICENSE)
