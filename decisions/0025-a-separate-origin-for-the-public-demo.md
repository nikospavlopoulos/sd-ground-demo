# 0025 — A separate origin for the public demo, chosen at build time

**Status:** accepted · 2026-11-12

## Context

The app is worth showing — on a CV, on LinkedIn — and nobody can see it run. Every
`/api` route is behind the shared crew password, so a link leads to a password box.
Opening the real app is not an option: it holds the club's operational data.

So: a public demo with no database and no password, seeded with a fictional crew
and a fictional aircraft, where everything stays in the visitor's browser.

### Why this was cheap

The architecture had already done the work, for an unrelated reason.
[ADR-0003](0003-offline-first-with-client-uuids.md) made the client authoritative
for its own state as *hardening*: coverage at the airfield is usable, but the crew
move around the zone all day, and a tap has to survive a momentary dropout. Every
mutation
updates the screen **synchronously** and then hands durable work to one function:

```ts
function persist(write: () => Promise<void>, op: SyncOp): void
```

Totals, durations and sunset are all derived by `src/shared/` with no server, and
`api.ts` raises the password gate **only** on a real `401` — so an app that never
calls `/api` can never be asked for a password.

Demo mode is therefore: **`persist()` does nothing, and nothing calls `/api`.** A
conventionally-built CRUD app would have needed every screen re-pointed at mocks.

## Decision

**A separate origin, `ground-demo.skydive-athens.com`, built from the same source
with a compile-time flag.**

### A separate origin rather than `/demo`

`offline/db.ts` opens **one IndexedDB database per origin**:

```ts
openDB<GroundDB>("sd-ground", 1, …)
```

On a shared origin, a crew member who followed the demo link from the password
screen would have demo loads merged into their real day — **and queued for sync**.
Fake loads would reach production D1. A separate origin makes that impossible
rather than merely unlikely, and gives the demo its own Service Worker and its own
install identity, so nobody installs the demo believing it is the log.

### A build-time flag rather than a runtime hostname check

`import.meta.env.VITE_DEMO` is substituted by Vite before the bundler runs, so
every demo branch folds to `if (false)` and is eliminated. **The production bundle
does not contain demo mode at all.**

A `location.hostname` check would leave the real app one bug away from silently
not persisting the crew's taps. Silent failure is this project's recurring wound —
the queue that could not sync for ten days while the header looked normal
([ADR-0022](0022-a-sync-batch-must-degrade-not-die.md)), the day-summary
notification wired to a route the client never calls. The failure you cannot see
is the one to design out of existence rather than to test for.

The flag reaches the client through Vite's `define` rather than the `VITE_`
env-file convention, for the same reason: `define` is a textual substitution that
provably happened or provably did not.

### No Worker at all in the demo build

Not "a Worker that declines to use the database". `wrangler.demo.jsonc` has no
`main`, no `d1_databases`, no `vars` and no `triggers` — static assets only. It
cannot reach a database because there is nothing there to reach with, and it
cannot ask for a password because there is no `/api` to answer `401`.

### The badge tells the truth

Every demo action increments the pending counter and nothing ever flushes, so the
header sits on `⟳ n pending`. That is not a decorative badge: it is the app's
genuine offline state, which is exactly what a build with no server behind it is
in. `✓ Saved` would be a lie told by the one element whose whole job is to say
whether anything was saved.

## What the CI guard caught

The guard greps the production bundle for demo-only strings. It was written
expecting to confirm something already true, and failed twice immediately:

1. **A lookup `Map` built at a module's top level.**
   `const nameOf = new Map(DEMO_CREW.map(…))` is a call Rollup cannot prove is
   free of side effects, so it kept it — and with it the whole fake crew list.
2. **`const OWNER = DEMO_CREW[0]!.id`.** A property access can trigger a getter,
   so that derivation is not provably pure either. Rollup kept the object literal
   and the access as a statement.

Both shipped fictional crew names into the bundle the crew download. Harmless in
themselves — a few hundred bytes — but they disprove the assumption the whole
design rests on, which was that "every *use* is behind `if (DEMO)`" is enough.

**Tree shaking removes unreachable code. It does not remove executed code, and a
module's top level is executed.** Both are now lazy, and the guard runs on every
deploy.

## Rejected

- **`ground.skydive-athens.com/demo`.** Shares IndexedDB, the Service Worker and
  the install identity with the live app. The data hazard is decisive.
- **A runtime hostname check.** Makes silent data loss reachable.
- **Seeding the demo into IndexedDB.** Persisting *some* of a demo while the
  banner says nothing is saved is a half-truth, and it is one origin mistake from
  the hazard the separate origin exists to remove. Everything is in memory;
  closing the tab is the reset.
- **Hiding the "+ Other…" crew option.** Name folding lives in `src/shared/`, so
  the demo runs the real rule rather than miming it.
- **An e2e project against the demo build.** It would double the suite's servers
  and runtime to assert rendering that changes rarely. The seed data and the
  report resolver are pure and are unit tested; the rendering is checked by hand,
  including as an installed PWA — which is the part a headless browser could not
  honestly cover anyway.

## Consequences

- One source, two deploy targets. The demo deploys **after** production in the
  same workflow, so a failure in it can never hold up the crew's app.
- The demo's data is written in TypeScript rather than read from D1, so it is the
  one part of the app nothing else would notice going stale.
  `test/unit/demo.test.ts` covers what can rot silently: whether the seeded day
  still produces coherent figures through the shared aggregation.
- The seeded day follows the clock **and is clamped to half an hour before
  sunset**, because the header shows the real sunset for the real airfield. A
  visitor at 20:00 would otherwise read "Sunset 17:17 · passed" above a load that
  took off at 19:53. The last load stays airborne only while stamping LANDING NOW
  would still read as a real load.
- `Header` now takes the day's own `aircraftId` rather than the `AIRCRAFT`
  constant. `operating_day` has carried one since `0001`, so this is a small
  correctness fix that happens to mean **no demo branch in the header at all**.
