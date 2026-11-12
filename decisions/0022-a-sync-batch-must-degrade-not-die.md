# 0022 — A sync batch must degrade, not die

**Status:** accepted · 2026-10-08

## Context

On 2026-09-28 a crew member's `crew_member.id` was renamed by hand, from a UUID
to a tidier `crew-theodorou`. The database was left perfectly consistent: every
child row in `flight`, `fuel_event` and `operating_day` was repointed, and
`PRAGMA defer_foreign_keys` was used correctly.

**It was not a database-only value.** A phone keeps its own `activeCrewId` in
**IndexedDB**, in the `meta` store, and stamps it onto every operation it queues
(`actions.ts`,
`offline/db.ts`). A rename is atomic in D1 and
completely invisible to a device, so that phone carried on sending an id the
database no longer had.

Three hours later it stopped being able to sync, and nobody noticed for ten days.

### Why one dead reference stopped everything

```ts
// the old src/worker/routes/sync.ts:71
if (statements.length > 0) await c.env.DB.batch(statements);   // no try/catch
```

> "Batched statements are SQL transactions. If a statement in the sequence fails,
> then an error is returned for that specific statement, and it **aborts or rolls
> back the entire sequence**."
> — [D1Database::batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)

The throw escaped the handler — the Worker had **no `onError`** — so Hono
returned a bare `500`. And the client keeps its queue on any non-2xx
(`offline/sync.ts`), deliberately, because a
failed request is usually a lost connection. So it replayed the identical doomed
batch every twenty seconds, indefinitely.

Three things made it worse than a stalled upload:

- **Frozen both ways.** `bootstrap()` refuses to overwrite local state while the
  queue is non-empty (`actions.ts:70`), so the phone could neither push nor pull.
- **No validation.** A missing field binds `undefined`, which D1 refuses while the
  statement is being *built* — a second uncaught throw site, before the batch.
- **Invisible.** The header read `⟳ 22 pending`, which is also what a phone with
  no signal reads.

It was reproduced in workerd against real D1 before anything was changed: an
unknown `crew_id` and a duplicate `(day_id, seq)` each produced `500` with
`days-in-report=0` — nothing from the batch survived.

## Decision

**Nothing in the sync handler may throw, and no single operation may cost
another.** Four changes, ordered so the ordinary path is untouched:

1. **Statement construction is guarded.** A malformed op becomes a rejection,
   not an exception. No hand-written validators — see below.
2. **`DB.batch()` runs exactly as before.** On failure, and only then, the
   statements are replayed **one at a time**, so the good ones land and only the
   genuinely unwritable one is refused.
3. **A failed reference is retried without its crew.** The load keeps its times
   and fuel; only the attribution is lost.
4. **The client shows a refusal.** `SyncState.failing`, set when the server is
   reached and refuses, cleared on success, and **never** set by a thrown fetch.

## Consequences and reasoning

- **The happy path is byte-identical.** Every new line runs only after something
  has already thrown, which previously meant a 500. The change cannot make a
  working sync worse — which mattered, because it shipped the night before the
  affected crew member's next shift.
- **No validators, deliberately.** The obvious fix was to validate each op before
  binding. It was rejected: **the client drops rejections permanently**, so a
  validator even slightly too strict would destroy data that works today — worse
  than the bug. Guarding construction achieves the same outcome with no rules to
  get wrong.
- **Per-statement replay gives up atomicity, and that is safe here.** Every op is
  keyed on its own UUID and upserts last-write-wins
  ([ADR-0003](0003-offline-first-with-client-uuids.md)) — the same property the
  retry loop has always depended on.
- **Coercing a dead crew reference beats rejecting it.** Rejecting would have
  discarded three loads, their times and their fuel. The attribution is one
  `UPDATE` away; the afternoon is not. Data first, attribution second.
- **Reasons are matched from the error text**, the pattern `flights.ts:50` already
  used. D1 offers nothing more structured than the SQLite message.
- **The Worker now has an `onError`.** The absence of one is why a 500 carried no
  information at all.
- **Offline is still not an error.** `failing` is set only by a response, never by
  a thrown fetch. Treating no signal as a fault is the mistake
  `api.ts` exists to prevent, and
  ADR-0014 depends on.
- **The id was reverted rather than re-migrated.** `0007` puts the database back
  to the id the phone already holds, because the devices are the authority on an
  id they cannot be told has changed. Renaming a crew id is now documented as
  something not to do; merging *into* an existing id remains safe.

## What this does not fix

- **`bootstrap()` still refuses server state while the queue is non-empty.** Once
  a queue always drains the precondition does not arise, so it is left alone.
- **The queue is sent whole, with no cap.** A device offline for a very long time
  still builds one large request. Same reasoning.
- **Nothing alerts the operator.** A crew member now sees `⚠ Not syncing` and can
  report it, which is the gap that actually mattered; server-side alerting is not
  built.
