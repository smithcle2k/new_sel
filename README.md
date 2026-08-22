# My Day Buddy

A daily social-emotional check-in for children ages 3–5, plus the teacher and
administrator tooling around it. Children complete a wordless, four-step
routine on a smartboard or tablet; teachers get a spatial view of the class and
a compliance table that cites their own state's early-childhood standards.

## Stack and why

| Layer | Choice | Reason |
| --- | --- | --- |
| Client | React 18 + Vite + TypeScript | Instant HMR; a small, dependency-light bundle for tablets on school Wi‑Fi. |
| Animation | Framer Motion | Spring physics give the squash-and-stretch the toy aesthetic depends on. |
| Styling | Hand-authored CSS design system (`styles/clay.css`) | The 3D clay look is the product. A utility or component framework would have fought it the whole way. |
| API | Express (ESM) | Small, explicit surface; no framework magic between a request and its tenant check. |
| Database | libSQL (Turso hosted, SQLite-compatible) | Runs on serverless, where the filesystem is read-only and per-instance so an on-disk SQLite file cannot work. libSQL keeps the SQLite dialect, so every query, upsert and `datetime()` modifier is unchanged. Local dev uses the same client against a `file:` URL. |
| Auth | bcrypt + JWT in an httpOnly cookie | No third-party identity provider to depend on, and no token in JS reach. |
| Audio | WebAudio oscillator/noise nodes | Zero audio files, so sound is instant on a cold cache and works offline. |

There are **no external runtime requests at all** — no font CDN, no audio files,
no analytics. A tablet on a locked-down school network renders identically.

## Running it locally

```bash
npm install
npm run seed     # demo school, 10 children, a week of check-ins
npm run dev      # API on :4000, client on :5173
```

Locally `DATABASE_URL` defaults to a `file:` SQLite database under
`server/data/`, so nothing external is needed to develop or run the tests.

Seeded logins (both `password123`):

- `admin@sunnybrook.test` — school administrator
- `teacher@sunnybrook.test` — teacher, Butterfly Room

Set `JWT_SECRET` in production; the server refuses to boot without it when
`NODE_ENV=production`. See `.env.example`.

## Deploying to Vercel

The client is served as static files and the whole Express API runs as one
serverless function at `api/[...path].js` — a catch-all, so Vercel routes every
`/api/*` request to it with the original path intact rather than depending on a
rewrite to reconstruct it. `vercel.json` supplies the build command, the output
directory and an SPA fallback for client routes such as `/board`.

An on-disk database cannot work here, and the failure is not subtle — a
serverless filesystem is read-only outside `/tmp`, so opening a SQLite file
throws during cold start and the platform reports `FUNCTION_INVOCATION_FAILED`.
Even if it opened, `/tmp` is per-instance and wiped between invocations, so
concurrent requests would see different databases. The database is therefore
remote.

1. **Create the database** (free tier is enough for a demo):

   ```bash
   turso db create my-day-buddy
   turso db show my-day-buddy --url          # -> libsql://…turso.io
   turso db tokens create my-day-buddy       # -> the auth token
   ```

2. **Set environment variables** in the Vercel project (all environments):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | `libsql://<database>-<org>.turso.io` |
   | `DATABASE_AUTH_TOKEN` | the token from step 1 |
   | `JWT_SECRET` | `openssl rand -base64 48` |

   All three are checked at startup, and each missing one fails with a message
   naming the fix rather than a bare stack trace. `NODE_ENV=production` plus a
   `file:` `DATABASE_URL` is rejected outright, since that is the mistake that
   produces the read-only crash above.

3. **Deploy.** The schema is created on the first request and memoised per
   instance, so no migration step is required; `npm run migrate` will do it
   ahead of time if you prefer. To load the demo school and roster, run
   `npm run seed` locally with the deployed `DATABASE_URL` and
   `DATABASE_AUTH_TOKEN` exported. **`seed` deletes all existing schools
   first** — never point it at a database with real data.

Cookies are `secure` under `NODE_ENV=production`, which Vercel sets, and the
client is same-origin with the API there, so CORS is only used by the split dev
servers.

## Architecture

### Tenant isolation

SQLite has no native row-level security, so isolation is enforced in one place:
`server/src/lib/scope.js`. No route handler queries classrooms, students or
check-ins directly — it resolves the resource through a guard first, and every
guard filters on the caller's `school_id` and, for teachers, their own
`teacher_id`. Missing and forbidden both return **404**, so a probe cannot
detect that another tenant's record exists.

Verified behaviour:

| Caller | Target | Result |
| --- | --- | --- |
| Teacher in another school | A classroom's roster / reports | 404 |
| Second teacher, same school | A peer's classroom | 404 |
| School administrator | Any classroom in their school | 200 |
| Unauthenticated | Anything | 401 |

### Device-scoped board credentials

A wall-mounted board must not hold a staff session — that session can read
every classroom its teacher owns, the compliance tables and the staff list, and
it sits unattended on a screen overnight. Boards therefore carry their own
credential, minted per device from the **Boards** tab and bound to exactly one
classroom.

- Only the SHA-256 of the token is stored. The plaintext is shown **once**, at
  mint time, and is not recoverable. Tokens are 43 characters of `nanoid`
  entropy, so a fast digest is the right primitive: a password KDF buys nothing
  against an unguessable secret and would cost a stretch on every request.
- Opening `/board/link/<token>` exchanges the token for an httpOnly cookie and
  `replace`s the history entry. A board's address bar sits at child height on a
  wall; a token left in the URL or in history can be read, or photographed,
  from across the room.
- The credential lives under its own cookie name (`mdb_kiosk`), so it is
  structurally incapable of satisfying `requireAuth`. Board endpoints attach
  `req.device` and never `req.user`.
- Revocation and expiry are re-checked on **every** request, so revoking a lost
  board takes effect on its next call rather than whenever a token would have
  expired.

Verified behaviour:

| Caller | Target | Result |
| --- | --- | --- |
| Board credential | its own roster / check-in | 200 / 201 |
| Board credential | a child in another classroom | 404 |
| Board credential | staff list, classrooms, reports, device admin | 401 |
| Board credential | presented as a `Bearer` token | 401 |
| Board credential | `/api/auth/me` | 200 with `user: null` — discloses nothing |
| Revoked or expired board | anything | 401, and the board returns to its link screen |
| Teacher, another school | minting / listing / revoking boards | 404 |

A board that loses its credential mid-day falls back to the link screen, not to
a sign-in page — there is no staff account for it to sign in to. Teachers can
still preview the flow from their dashboard under their own session; the kiosk
screens take their credential from a small source abstraction
(`lib/kiosk-source.ts`) and are otherwise identical in both modes.

### The state-compliance engine

Check-ins store only the raw 1–5 score. Standard codes are joined **at read
time**, against the school's *current* home state:

```sql
LEFT JOIN state_standards st
       ON st.state = sch.state AND st.mood_score = c.mood_score
```

So correcting a school's state, or revising a citation in the catalog,
re-renders every historical report correctly with no data migration. The
catalog (`server/src/lib/standards.js`) is the source of truth and re-syncs into
the database on every boot — 50 indicator rows, five states × five scores × two
indicators:

- **New York** — NYSPLS Domain 3 (Self-Awareness, Self-Regulation, Relationships)
- **New Jersey** — NJSLS 0.1, 0.2, 0.3, 0.5 (Self-Confidence, Self-Direction, Identifying Feelings, Pro-Social)
- **California** — CA Preschool Learning Foundations (Self-Awareness, Self-Regulation, Cooperation)
- **Florida** — FELDS Three-Year-Old Standards (Self-Concept, Self-Regulation, Approaches to Learning, Pro-Social)
- **Georgia** — GELDS SED1, SED2, SED3, SED5 (Sense of Self, Self-Expression, Self-Control, Peer Relationships)

Reports are available as JSON and as a CSV export for an administrator's
compliance binder.

> The indicator text is written to be recognizable to an administrator familiar
> with each framework, but it is a working paraphrase keyed to the published
> domains, not a verbatim transcription of every state document. Before an
> audit submission, a district should reconcile `standards.js` against its own
> current edition of the standards — it is a single file, edited in one place.

## The child's four-step loop

Each step applies a specific behavioural mechanism; they are noted in the code
where they are implemented.

1. **Mascot customizer** — fur swatches and three droppable hats. The child
   invests effort in the raccoon before being asked for anything (endowment
   effect). The progress bar *opens* at 40% (goal-gradient effect).
2. **Winding vine** — an oversized pointer-captured drag channel, pre-set to
   **4 / Happy & Good** so the task is "scan and adjust", not "compose from
   scratch". The raccoon's face, posture and scale morph continuously with the
   drag; each band has its own synthesized voice and vibration pattern.
3. **Planting and watering** — the child presses *and holds* the watering can
   for ~2.2 seconds against falling droplets, a continuous rushing-water bed
   and a low haptic rumble. Effort precedes reward.
4. **The bloom** — the seed bursts with a star-burst and sparkle chord into a
   flower chosen by their mood (sunflower / sprout / bluebell). The bar
   completes at 100% and a cheer chord plays.

Nothing in the flow requires reading. Every control is an object, a colour or a
shape, and each is reinforced on three channels at once — visual, audio and
haptic.

### Touch details that matter on a wall-mounted board

- The vine uses `setPointerCapture`, so a drag that wanders off the element
  keeps tracking instead of dropping — the usual cause of dead zones on
  smartboards.
- Leaf stops and the knob are positioned by measuring the rendered path with
  `getPointAtLength`, not by re-deriving the curve in JS, so they sit exactly
  on the vine at any screen size.
- Every pressable surface compresses its shadow and translates downward on
  contact, giving mechanical feedback under a finger.
- `navigator.vibrate` is unavailable on iOS and can be switched off anywhere,
  so every haptic call is guarded and degrades silently.
- Audio contexts start suspended; the first tap unlocks WebAudio and every play
  path is a no-op until then.

## Teacher and administrator views

- **Classroom Meadow** — the week's blooms growing together in one shared
  garden. Tapping a child pops up their raccoon with a greeting and their
  weekly average.
- **Compliance** — every check-in joined to its state indicators, filterable by
  range, exportable as CSV.
- **Roster** — register children, pre-set their companion, archive leavers
  (their history stays in reports).
- **Boards** — mint, inspect and revoke the device links for this classroom,
  with each board's last-seen time.
- **School & Staff** (admin only) — home state, staff list, and teacher
  invitations. Invite links are surfaced for the administrator to send
  themselves; the app deliberately does not send mail on their behalf.

## Layout

```
server/src/
  lib/standards.js   the compliance catalog (edit citations here)
  lib/db.js          schema + idempotent standards sync
  lib/scope.js       tenant isolation guards
  lib/auth.js        bcrypt, JWT, cookie, route guards
  lib/kiosk.js       device credentials: mint, hash, resolve, requireKiosk
  lib/db.js          libSQL client, query helpers, schema, memoised ready()
  lib/async.js       promise-rejection wrapper for Express 4 handlers
  app.js             builds the Express app (no port) — shared by both entries
  index.js           local entry: listens on a port
  routes/            auth, classrooms, checkins, reports, kiosk
api/[...path].js     Vercel entry: the same app as a serverless function
client/src/
  components/        Raccoon (morph rig), VineSlider, Flower, ProgressBar
  screens/           CheckInFlow, Kiosk, BoardLink, Dashboard, Meadow, Compliance,
                     Roster, Boards, Admin, Auth
  lib/               api client, kiosk source, WebAudio synth, haptics, mood model
  styles/            clay.css (design system), kiosk.css (child UI)
```

## Verification performed

`npm run build` compiles clean (`tsc -b` + Vite). The serverless entry was
exercised on a simulated cold instance — importing `api/[...path].js` without
pre-warming and serving requests through it — to confirm the schema
initialisation runs on the first request and not on every one. The full path — sign in →
each dashboard tab → meadow popover → kiosk → customize → drag the vine across
all five moods → hold to water → bloom → return — was driven end to end in
headless Chromium with **zero console, page and network errors**. Tenant
isolation was exercised directly against the API with a second school and a
second teacher.

The board lifecycle was driven in a second, entirely separate browser context
holding no staff session: claim a link → confirm the token is gone from the URL
and from history → confirm the only cookie is `mdb_kiosk`, httpOnly and
unreadable from page JS → confirm `/dashboard` bounces to sign-in → complete a
child's check-in → revoke from the teacher's dashboard → confirm the board
lands back on its link screen. Results are the two tables above.

## Known limitations

- Teacher invitations produce a link to copy rather than sending email; wiring
  an SMTP or transactional-mail provider is the natural next step.
- `state_standards` is reference data keyed by state code; supporting a sixth
  state means adding a block to `standards.js` and restarting.
- Revoking a board relies on a teacher noticing it is missing. Boards report a
  last-seen time, but nothing alerts on a board that goes quiet or one that
  appears from an unexpected network.
- Every database call is now a network round trip. It is comfortably fast for
  a classroom, but the compliance table fans out 1:N over indicators and would
  want pagination before a school-wide, term-length export.
- `/api/kiosk/claim` has no rate limit. The tokens are ~256 bits of entropy so
  guessing is not a practical threat, but a limiter would still be worth adding
  before exposing the endpoint publicly.
