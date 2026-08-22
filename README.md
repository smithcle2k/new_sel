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
| Database | SQLite via `better-sqlite3` | Synchronous, in-process, single-digit-microsecond reads — no network hop on a check-in. A classroom's whole year is a few megabytes. |
| Auth | bcrypt + JWT in an httpOnly cookie | No third-party identity provider to depend on, and no token in JS reach. |
| Audio | WebAudio oscillator/noise nodes | Zero audio files, so sound is instant on a cold cache and works offline. |

There are **no external runtime requests at all** — no font CDN, no audio files,
no analytics. A tablet on a locked-down school network renders identically.

## Running it

```bash
npm install
npm run seed     # demo school, 10 children, a week of check-ins
npm run dev      # API on :4000, client on :5173
```

Seeded logins (both `password123`):

- `admin@sunnybrook.test` — school administrator
- `teacher@sunnybrook.test` — teacher, Butterfly Room

Set `JWT_SECRET` in production; the server refuses to boot without it when
`NODE_ENV=production`. See `.env.example`.

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
  routes/            auth, classrooms, checkins, reports
client/src/
  components/        Raccoon (morph rig), VineSlider, Flower, ProgressBar
  screens/           CheckInFlow, Kiosk, Dashboard, Meadow, Compliance, Roster, Admin, Auth
  lib/               api client, WebAudio synth, haptics, mood model
  styles/            clay.css (design system), kiosk.css (child UI)
```

## Verification performed

`npm run build` compiles clean (`tsc -b` + Vite). The full path — sign in →
each dashboard tab → meadow popover → kiosk → customize → drag the vine across
all five moods → hold to water → bloom → return — was driven end to end in
headless Chromium with **zero console, page and network errors**. Tenant
isolation was exercised directly against the API with a second school and a
second teacher; results are the table above.

## Known limitations

- Teacher invitations produce a link to copy rather than sending email; wiring
  an SMTP or transactional-mail provider is the natural next step.
- `state_standards` is reference data keyed by state code; supporting a sixth
  state means adding a block to `standards.js` and restarting.
- The kiosk sits behind the teacher's session (they sign in once in the
  morning). A dedicated device-scoped kiosk token would be better for boards
  left unattended overnight.
