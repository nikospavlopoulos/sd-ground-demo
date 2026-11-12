# A runnable excerpt of the domain core

Six modules and their tests, lifted unchanged from the application except for
import paths. They are the part of it that is pure: no Worker, no client, no
database, no account. Clone and run them.

```bash
npm ci          # NOT npm install — see below
npm run typecheck
npm test
```

## What is here, and why these six

| | |
|---|---|
| `time.ts` | Athens-local dates that survive the daylight-saving changeover; `checkLoadTimes`; and `durationMinutes`, whose midnight wrap reads a backwards landing as nearly 24 hours |
| `totals.ts` | Totals derived on read, never stored. A range recomputes each ratio from summed primitives rather than averaging per-day ratios |
| `normalize.ts` | Name folding: Greek surnames are transliterated inconsistently, so `Theodoroy` has to meet `Theodorou` rather than become a second person |
| `sunset.ts` | Sunset from the airfield's coordinates — a pure function of date and place, so every historical day is automatically right |
| `types.ts`, `dropzone.ts` | The shapes and the constants the four above need |

The tests are where the reasoning is visible. `totals.test.ts` pins the
aggregation against Simpson's paradox; `time.test.ts` asserts a value on each side
of the DST changeover, which a fixed `+02:00` offset cannot satisfy;
`normalize.test.ts` folds Greek script onto its own transliteration.

## `npm ci`, not `npm install`

npm 10's tree builder crashes on this dependency graph:

```
npm error Cannot read properties of null (reading 'edgesOut')
```

The committed `package-lock.json` is what makes it installable — `npm ci` reads
the lockfile instead of solving the tree, and works. The application has the same
note in its own contributing rules, for the same reason.
