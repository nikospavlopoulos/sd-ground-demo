# 0003 — Offline-first with client-generated UUIDs

**Status:** accepted · 2026-09-21

## Context

Entries are made outdoors at an airfield. A takeoff time that cannot be recorded at
the moment of takeoff is a wrong takeoff time. Connectivity is usually fine, but
"usually" is not good enough for the one tap that matters.

## Decision

IndexedDB is the UI's source of truth. Every mutation updates the screen
synchronously, then persists locally and enqueues an operation for
`POST /api/sync`. Entities carry **client-generated UUIDs**, and day IDs are
derived from the date (`day-2026-09-21`).

## Consequences

- Replay is safe. The server upserts `ON CONFLICT(id) DO UPDATE`, so retrying a
  write that already landed converges on the same row instead of creating a second
  load. This is at-least-once delivery made safe by a natural dedupe key.
- Deriving day IDs from the date means two devices creating the same day offline
  produce the *same* row rather than colliding on `op_date`'s UNIQUE constraint.
- Mutations are **serialised** (`actions.ts`):
  without that, two rapid taps on *+ NEW LOAD* both read the flight list before
  either writes, and the day gets two loads numbered 1.
- Reports are the exception — they query the server directly, since historical days
  are not cached locally.
