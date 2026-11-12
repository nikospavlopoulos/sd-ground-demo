# 0016 — A day is what its loads say it is

**Status:** accepted · 2026-09-23

## Context

`operating_day` has no column meaning "the dropzone worked today". The *existence
of the row* was standing in for it — and the row is created by the first tap, not
by anything actually happening.

The consequence reached the crew's phones. On 2026-09-23 at 00:01 a push arrived
reading **"Day closed — 0 loads · 0m airborne · 0 L"**. Production showed why:

| date | owner | closed | summary sent | live loads | soft-deleted |
|---|---|---|---|---|---|
| 2026-09-22 | — | yes | **yes** | **0** | 5 |

Somebody had tapped `+ NEW LOAD`, deleted it again, and gone home. The row
survived; the auto-close cron closed it at local midnight and announced it.

The same husk row also kept **CLOSE DAY** on screen with an empty load list, and
filled the monthly report with lines of zeros.

Notably the *sunset* reminder stayed correctly silent. It has always had an
activity gate — `shouldAnnounceSunset` refuses when `owner_crew_id IS NULL`. The
day-summary path never got one. The predicate existed in the codebase twice
(`shouldAnnounceSunset`, `releaseDayIfEmpty`) and was missing from every place
that decided whether a day was real.

## Decision

**Derive it, everywhere, from one function.** `dayOperated(flights)` in
[`src/shared/totals.ts`](../sample/src/totals.ts), beside `computeTotals` so
the Worker and the client cannot drift:

```ts
export function dayOperated(flights: readonly Flight[]): boolean {
  return live(flights).length > 0;
}
```

**Loads only.** A load is the only thing that can start a day: fuel is entered
from a load's row, so neither a time nor a refuel can exist without one.

Applied at three points:

- `announceDayClosed` — reads the entries *before* claiming the send
- `Today.tsx` — CLOSE DAY renders on `flights.length > 0`, not on `s.day`
- `buildDayReports` — a day with no loads produces no row

No column was added. Storing "operated" would be a second source of truth for
something the rows already say, and the repo's standing rule is *derive, never
store* — there is no `total_l`, no `duration_min`, no stored sunset either.

## Consequences and reasoning

- **The entries are read before the send is claimed.** Claiming first would burn
  the send-once token on a quiet day, so a day that was later filled in and
  closed properly would stay silent forever. There is an integration test for
  exactly this ordering.
- **`announceDayClosed` also now requires `closed_at IS NOT NULL`.** It used to
  trust the caller. All three callers close before announcing, so this is free.
- **The auto-close cron is unchanged** and still closes empty rows. Closing is
  bookkeeping; skipping them would leave rows open forever, re-scanned every five
  minutes. Whether a closed day is worth *announcing* is a separate decision, and
  now lives in one place.
- **The husk rows needed no cleanup.** Soft-delete is an invariant — a hard delete
  cannot survive sync — so an emptied day's row stays in D1, inert and unreported.
  *(Corrected 2026-09-30: this originally said the 2026-09-22 and 2026-09-23 rows
  remain. They do not; production now holds three `operating_day` rows, for the
  24th, 25th and 28th. The point stands, the example did not.)*
- **Reports return one shape for all three modes.** `/day/:date` used to
  synthesize a row of zeros for a day that did not exist; it now returns the same
  `{ from, to, days, …totals }` as `/month` and `/range`, so "nothing happened" is
  simply `days: []`. That also removed a special case from the client.
- **A day closed while a phone was offline will not announce later.** The close
  already happened and the token was never claimed. The summary is a
  same-evening signal; re-announcing two days later would be worse.

## What this did not fix

Both push subscriptions returned `201` for the bogus notification, yet only one
device displayed it. That is device-side — Android battery optimisation, or the
app being foregrounded — and no server change addresses it.
