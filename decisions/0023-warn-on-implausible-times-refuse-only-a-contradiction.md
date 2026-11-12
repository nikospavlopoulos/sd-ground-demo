# 0023 — Warn on an implausible load time, refuse only a contradiction

**Status:** accepted · 2026-11-12

## Context

A real day in production:

| # | Takeoff | Landing | Dur. | Fuel |
|---|---|---|---|---|
| 1 | 10:39 | 10:45 | 6m | 40 L |
| **2** | **13:19** | **13:19** | **0m** | — |
| **3** | **13:19** | **13:19** | **0m** | — |
| 4 | 13:38 | 14:05 | 27m | 20 L |

One aircraft cannot fly two loads at once, and no load is airborne for zero
minutes. Load 3 takes off the minute load 2 landed. The app accepted all of it
silently and reported it as fact.

The cause is not subtle: **somebody forgot to log loads as they happened and then
caught up by tapping.** `NOW` stamps `athensTime()` at minute resolution, so
TAKEOFF NOW followed by LANDING NOW inside one minute produces exactly this, on as
many rows as you tap.

Separately, found by trying it deliberately: a landing entered *earlier* than its
takeoff produced neither an error nor a negative duration. It produced about
**24 hours**, because `durationMinutes()` reads a backwards landing as a midnight
crossing:

```ts
return l >= t ? l - t : l + 1440 - t;
```

Nothing relational was checked anywhere. `guards.ts` validated only the *shape* of
a time, `TimeSheet.tsx` saved any parseable value without seeing the other end of
the pair, and no code compared one row to the next.

## Decision

**Three tiers. Only the first refuses anything.**

| Tier | Check | Behaviour |
|---|---|---|
| Contradictory | `landing < takeoff` | **refused** — the row contradicts itself |
| Relational | `takeoff === landing` | warn once, then save as entered |
| Threshold | under **10 min**, over **45 min** | warn once, then save as entered |

`checkLoadTimes()` in [`src/shared/time.ts`](../sample/src/time.ts) classifies a
pair, and both the editor and the NOW buttons use it, so one condition cannot meet
the crew in two different wordings.

### Why a threshold here, when ADR-0005 rejected one for fuel

ADR-0005 turned down a magic number for
fuel in favour of the relational check *"do the two tanks match?"*, and that was
right: the relational check caught the realistic error completely, needed no
configuration, and could not go stale.

Here it does not. The relational checks catch `0m` and backwards, but **not the
pattern that actually caused this** — bored tapping also yields short-but-nonzero
durations that look entirely plausible. The threshold earns its place by covering
what nothing else covers.

**Where the numbers come from, and why they are loose.** Loads under 15 minutes are
rare even in a fast aircraft; even a long, delayed one does not exceed 35–40. Ten
and forty-five therefore sit well outside the normal band rather than at its edge.
That is deliberate: a check that cries wolf gets dismissed, and a dismissed check
teaches the habit of tapping through — which is the behaviour that produced the bad
day in the first place.

### Why warn rather than block

A takeoff time that cannot be recorded at the moment of takeoff is a wrong takeoff
time. Refusing the save would risk losing a real entry in order to defend against a
typo. The existing precedent is fuel: *equal saves silently, unequal asks once*. If
the crew confirm, it saves **exactly as entered** — nothing is corrected or
adjusted on their behalf.

A backwards pair is the single exception, because it is not a judgement about
plausibility. The row contradicts itself and there is no value in it to preserve.
No legitimate case exists here either: jumping stops at sunset and the operating day
auto-closes at the Athens date rollover, so a load genuinely spanning midnight
cannot arise, and if one somehow did, the landing belongs to the next day's row.

The refusal **names the field that is probably wrong, not the one being edited**.
Setting a landing earlier than the takeoff usually means the takeoff is the bad
value, so *"Landing is before takeoff — check the takeoff time"* sends you to the
number that needs fixing rather than to the one you just got right.

### The refusal is client-side only

**`/api/sync` stays permissive, and there is a test asserting it.**

Per [ADR-0022](0022-a-sync-batch-must-degrade-not-die.md), an entry the server
refuses is returned in `rejected[]` and **dropped permanently by the client** —
that drop exists precisely so a permanently-refused op cannot pin the queue open
again, which is what cost one crew member ten days. A server-side rejection of a
backwards pair would therefore *destroy* a real load rather than correct it.

This inverts the usual instinct. Normally you validate at the trust boundary and
treat the client as a convenience. Here the client is the only layer where a human
can still fix the value, and the server's job is to accept whatever survived it.
Every new rule added to `/api/sync` is a new way to delete data.

### `durationMinutes()` keeps its midnight wrap

Refusing backwards pairs at entry settles this. No new one can be created, so the
wrap can only ever apply to rows already in the database — and those are out of
scope by decision. Leaving the function alone means **no historical duration or day
total is rewritten**, which matters because totals are derived rather than stored:
changing it would silently restate every past figure that depends on it.

The cost is bounded and accepted: an existing day containing a backwards pair keeps
its inflated airborne total, and therefore its wrong litres per flight hour.
Correcting one is SQL, as any past-day correction is.

So the wrap now defends a case that cannot occur and conceals one that can no longer
be created. That is a reasonable state, but **only while the block in front of it
holds** — which is the real reason the integration test matters.

## Where the checks fire

1. **On a save that completes a pair** — the `TimeSheet` editor *and* the NOW
   stamp. The stamp is what produced this data, so covering only the editor would
   have missed the actual defect. The stamped value is read from the clock once and
   carried through the confirmation unchanged, so confirming records the minute the
   aircraft moved rather than the minute someone tapped OK.
2. **On a manual CLOSE DAY** — the confirm sheet names the suspect loads. This is
   the backstop for the catch-up-later pattern, which is precisely when somebody is
   about to close.

**The automatic close stays silent.** `closeStaleDays()` runs on the cron at the
Athens date rollover with nobody present. It closes the day regardless and warns
about nothing.

## Rejected

- **Blocking a 0m or very short load.** It would lose real entries to defend
  against typos, and the crew's judgement is better than the app's.
- **Validating in `guards.ts` / `/api/sync`.** See above: a server refusal is
  permanent and therefore destructive.
- **Fixing `durationMinutes()` to return a negative or null.** It would restate
  historical totals that nobody asked to have changed.
- **Comparing one row against the next** (load 3 taking off the minute load 2
  landed). Real back-to-back operations do turn an aircraft fast, and the pattern
  this would catch is already caught by the 0m check on each row individually.
- **Migrating or flagging the rows already in the database.** They stay as they
  are. This is prevention at entry only.

## Consequences

- One shared classifier, used by the editor, the NOW buttons and the close-day
  confirmation — so the rule cannot drift between entry points.
- The numbers are in one exported constant, `LOAD_MINUTES`, with a test asserting
  they stay outside the normal flying range rather than creeping toward its edge.
- `/api/sync` has one more thing it must *not* learn to do, pinned by a test whose
  whole purpose is to fail if someone later hardens the API in the obvious place.
