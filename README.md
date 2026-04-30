# Optio Segments

A customer segmentation engine that groups clients into segments via filter rules, computes deltas (added/removed members) when underlying data changes, and propagates change signals to downstream consumers.

Built for the Optio take-home assignment. 5 days.

---

## Quick start

```bash
docker compose up
```

That's it. The stack boots Postgres, Redis, RabbitMQ, Elasticsearch, the NestJS API, and the Angular UI. Healthchecks gate startup so the API doesn't try to connect before its dependencies are ready.

Once the API is up:

```bash
docker compose exec api npm run seed
```

This creates the 5 seeded segments, ~500 clients, and a population of transactions distributed across realistic-looking timestamps. Then:

- **UI:** <http://localhost:4200>
- **API:** <http://localhost:3000>
- **RabbitMQ management:** <http://localhost:15672> (optio/optio)

---

## What this does (in plain language)

Optio's segmentation engine is the thing that answers "which of my clients match this rule right now?" Marketing teams care about questions like "who bought something in the last 14 days?" or "who used to spend a lot but stopped?" Those questions are easy to answer once. The hard part is keeping the answer up to date as transactions stream in, time passes, and clients shift in and out of qualifying.

The system distinguishes two segment types:

- **Dynamic segments** auto-update as data changes. Their _rules_ are fixed; their _membership_ is whatever currently matches.
- **Static segments** freeze a membership at creation time. Data changes don't affect them. The user can manually request a refresh, which evaluates the same rules against current data and replaces the frozen set.

For both types, the system doesn't just answer "did the membership change?" — it answers "_who specifically_ was added, and _who specifically_ was removed?" That delta is the unit of change. It gets persisted (as audit history), pushed to subscribed UI clients (so they see real-time updates), and broadcast to other interested consumers (in this codebase: a cascade consumer that propagates changes to dependent segments, and a WebSocket gateway that pushes to the UI).

The system also handles cascade dependencies: a segment's filter can reference _another segment's_ membership. When the upstream segment's membership changes, the downstream segment recomputes too.

---

## Seeded segments

| Name                     | Type    | Rule                                                       | Notes                                            |
| ------------------------ | ------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `recent-buyers`          | dynamic | Last transaction within 14 days                            |                                                  |
| `high-spenders`          | dynamic | total_purchases_60d > 1200                                 |                                                  |
| `lapsed-customers`       | dynamic | ≥3 transactions AND last transaction >22 days ago          |                                                  |
| `lapsed-high-value`      | dynamic | members of `high-spenders` ∩ members of `lapsed-customers` | depends on the two above; demonstrates cascading |
| `georgian-launch-cohort` | static  | country = 'GE' (frozen at seed time)                       | demonstrates static immutability                 |

---

## Architecture

> TODO: insert Mermaid diagram here. Sketch:
>
> - Data change (transaction created / client updated / bulk imported) → `data.changes` exchange
> - `SegmentRecomputeConsumer` reads from `data.changes`, schedules recomputes via `RecomputeSchedulerService` (Redis ZSET, 500ms debounce window)
> - `RecomputeTickService` (200ms interval) reads ready entries from the ZSET, calls `SegmentRecomputeService.recompute()`
> - `SegmentRecomputeService` evaluates rules against ES, computes delta against the Redis SET snapshot, atomic RENAME on success, writes audit row, publishes `segment.delta.computed` to `segment.events`
> - Two queues consume `segment.events`: `CascadeConsumer` (schedules dependent segments) and `SegmentsGateway` (WebSocket push to subscribed UI clients)

### Components

| Layer             | What it does                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres**      | Source of truth. Clients, transactions, segment definitions, delta history.                                                                                |
| **Elasticsearch** | Denormalized read replica of clients with precomputed rollups. Segment rules are translated to ES query DSL for evaluation.                                |
| **Redis**         | Membership snapshots as SETs (one per segment, key `segment:<id>:members`). SDIFF computes deltas. Sorted set as the recompute scheduler's debounce queue. |
| **RabbitMQ**      | Two topic exchanges: `data.changes` (input) and `segment.events` (output). Consumers subscribe with their own queues.                                      |
| **NestJS API**    | HTTP endpoints, message consumers, WebSocket gateway, scheduling.                                                                                          |
| **Angular UI**    | Browse segments, view members, simulate data changes, watch deltas in real time.                                                                           |

### Signal flow for a single transaction

1. `POST /transactions` → `IngressService.ingestTransaction()`
2. PG transaction: SELECT FOR UPDATE on the client row, insert transaction, recompute rollups, update client
3. ES update with `refresh: 'wait_for'` and version-conflict retry (exponential backoff)
4. Publish `transaction.created` to `data.changes`
5. `SegmentRecomputeConsumer` receives event, schedules all dynamic segments via `RecomputeSchedulerService.scheduleMany(ids)`
6. Scheduler ZADDs each segment ID with a future score (now + 500ms). Multiple events within the window collapse onto the same ZSET member; the future score gets pushed forward each time.
7. `RecomputeTickService` (interval, 200ms) atomically pops ready entries via Lua script (ZRANGEBYSCORE + ZREMRANGEBYSCORE). For each ID, calls `SegmentRecomputeService.recompute(id, 'event')`.
8. Recompute service evaluates the rule against ES, computes delta via Redis SDIFF, atomically swaps the snapshot via tmp-key + RENAME, writes a `delta_history` row, and publishes `segment.delta.computed` to `segment.events`.
9. `CascadeConsumer` reads the event, looks up dependent segments (JSONB containment query on `rules->'segmentDependencies'`), schedules them through the same debouncer.
10. `SegmentsGateway` reads the same event from a separate queue, emits `segment.delta` to clients in the room `segment:<id>`.

### Bulk path (50K clients)

`POST /clients/bulk` accepts an array. Server chunks 1000-per-chunk. Per chunk:

1. One multi-row INSERT into `clients`
2. One ES `_bulk` index op (refresh: false on intermediate chunks, refresh: 'wait_for' on the last)
3. One `bulk.imported` event published per chunk

The recompute consumer subscribes to `data.changes` with routing key `#`, so `bulk.imported` flows through the same code path as single-transaction events. The debouncer coalesces 50 events down to one recompute window per affected dynamic segment. Net: 50K writes → 50 events → 4 recomputes.

`POST /simulate/bulk-clients {count: N}` is a thin convenience that fabricates client payloads server-side and calls the bulk endpoint internally.

### Fast-forward simulation

`POST /simulate/fast-forward {days: N}` mutates `transactions.occured_at` backward by N days. This makes the rolling time windows in segment rules (last 14d, last 60d, lapsed > 24d) cross thresholds, demonstrating membership flip end-to-end with non-empty deltas.

This is destructive — once you fast-forward, the data is shifted. `npm run seed` resets to a clean state.

---

## Architectural decisions and trade-offs

### Why Elasticsearch for query evaluation, not Postgres

Segment rules are filter compositions: AND/OR/NOT trees over client fields and rollup values. ES's bool query DSL maps directly to this shape — `bool: { must: [...], should: [...], must_not: [...] }` is a filter tree. Rules are stored as data and translate one-to-one to ES queries; new segments don't require backend changes.

The cascading-segment case is where this is clearest. `lapsed-high-value` filters by membership of two other segments, which becomes a `terms` filter with the union of dependency member IDs. ES's `terms` filter is built for "filter by a known set" queries; the equivalent in PG would mean either threading a temp table or generating a `WHERE id IN (...30K ids...)` clause, which works but doesn't scale.

What we give up: dual-write complexity. Every client mutation in PG must propagate to ES. We pay this with a `wait_for` refresh and version-conflict retry on every write. In production, a CDC pipeline (Debezium → Kafka → ES) would replace application-level dual-writes.

### Debounce vs throttle vs buffer for recompute scheduling

Dynamic segments need to recompute when data changes, but a transaction-per-second stream shouldn't trigger a recompute-per-second. Three options were considered:

- **Throttle** (recompute at most once per N seconds): bounded throughput but loses the trailing edge — if a burst of changes lands and then stops, the final state isn't reflected until the next tick.
- **Buffer** (collect changes for N seconds, then process): same shape as throttle in practice.
- **Debounce** (wait for quiet, then process): feels right but pure debounce can starve if the stream never goes quiet.

We use _trailing-edge debounce with extension semantics_: ZADD with a future score (now + 500ms). New events within the window push the score further out, but only up to a point in practice (because the recompute itself takes time and the next stream of events arrives during recompute, not before). This gives us coalescing during bursts and ~500ms latency during quiet.

A simpler alternative considered and rejected: SET-NX-EX (set-if-not-exists with expiry). That's leading-edge with drops — fires immediately on the first event of a window, drops everything until the window expires. Wrong shape: we want to coalesce, not drop.

### Atomic snapshot swap via RENAME

When recomputing, we build the new membership SET in a tmp key (`segment:<id>:members:tmp`), compute deltas against the canonical key (`segment:<id>:members`) via SDIFF, then atomically swap with `RENAME tmp canonical`. The alternative — DEL + SADD — has a window where the SET is empty, during which any read or SDIFF would see incorrect state. RENAME is one operation and atomic in Redis.

### Cold-start: missing dependency snapshots

A cascade segment can be evaluated before its dependencies have any snapshot at all. We treat a missing dependency SET as an empty set — the cascade segment evaluates to empty, and the next recompute (after dependencies populate) corrects it. The seed CLI evaluates dependencies first to prevent this in practice, but the runtime behavior is robust to the case.

### Two exchanges, not one

`data.changes` and `segment.events` are separate exchanges by lifecycle, not by topic. Input vs output. This satisfies the "≥2 consumer types" acceptance criterion cleanly: the cascade consumer and the WS gateway both subscribe to `segment.events` via separate queues, so the same delta event reaches both independently. A single-exchange design would have worked too, but routing-key namespacing across input/output events would be fragile.

### Hardcoded eval order vs topo sort

The seed CLI evaluates segments in a hardcoded order (independent first, dependent second) rather than running a topological sort. With 5 seeded segments and one cascade level, this is simpler and obvious. A topo sort would matter at 50+ segments with multi-level cascades.

### Manual recompute on static segments

Static segments are protected from automatic recomputes by the consumer filtering `type='dynamic'`. The recompute service itself is type-agnostic — it doesn't care whether a segment is static or dynamic. The `POST /segments/:id/recompute` endpoint is what the user clicks for static refresh; it bypasses the debouncer (the user wants immediate feedback, not coalesced behavior) and goes straight to the service with `reason='manual'`. The audit row distinguishes manual from event-driven recomputes.

### Fast-forward by mutating data, not by abstracting "now"

Two ways to simulate time passage: mutate `occured_at` backward (destructive but the data is honest), or introduce a clock abstraction that every query reads from (clean conceptually, invasive across every timestamp in the codebase). We chose the destructive path. Trade-off: fast-forward burns the dataset; `npm run seed` resets it. Documented and accepted.

---

## Endpoints

> TODO: tabulate. Quick reference for reviewers without making them grep controllers.

| Method | Path                                   | Purpose                                                               |
| ------ | -------------------------------------- | --------------------------------------------------------------------- |
| GET    | `/segments`                            | List all segments with derived `member_count` and `last_evaluated_at` |
| GET    | `/segments/:id/members?limit=&offset=` | Paginated members, sorted by last_transaction_at                      |
| GET    | `/segments/:id/history?limit=`         | Recent delta_history rows                                             |
| POST   | `/segments/:id/evaluate-dry`           | Evaluate rules without writing snapshot                               |
| POST   | `/segments/:id/recompute`              | Recompute and update snapshot (works on static and dynamic)           |
| GET    | `/clients?ids=<csv>`                   | Hydrate by IDs                                                        |
| GET    | `/clients?limit=&offset=`              | Paginated list                                                        |
| PATCH  | `/clients/:id`                         | Update client (currently country only)                                |
| POST   | `/clients/bulk`                        | Bulk create clients (chunked, async events)                           |
| POST   | `/transactions`                        | Create a single transaction                                           |
| POST   | `/simulate/bulk-clients`               | Fabricate and bulk-create N clients                                   |
| POST   | `/simulate/fast-forward`               | Shift all transactions backward by N days                             |

---

## Performance considerations

- Index on `delta_history(segment_id, evaluated_at DESC)` — required for the LATERAL subquery in `GET /segments` and the history endpoint to perform efficiently. > TODO: confirm whether this is in the entity definition or applied via SQL.
- `wait_for` on the _last_ chunk of bulk imports only — intermediate chunks use `refresh: false` to let ES batch refreshes naturally. ES default refresh interval is 1s, which is fast enough that recomputes triggered by the debouncer (500ms after the last event) typically see the new docs by the time they query.
- Redis SETs as the membership snapshot: SCARD is O(1) for member count, SDIFF is O(N) where N is the size of the symmetric difference. For 100K-member segments, both are sub-millisecond.

---

## Things this would do differently in production

- CDC (Debezium) instead of application-level dual-writes to ES
- Authentication and authorization on all endpoints
- Rate limiting on simulation endpoints
- Topo sort of segment dependency graph for evaluation order
- ZSET instead of SET for member snapshots, to support paginated reads natively
- Bounded retry budget on Rabbit publish failures (currently best-effort with logging)
- Dedicated read replicas for segment evaluation queries

---

## What I'd ask in a code review

> TODO: write 3-5 specific things you're aware are non-obvious or you'd want a reviewer to push back on. Examples:
>
> - Why two exchanges instead of one?
> - Why is the cascade reason `'event'` and not `'cascade'`?
> - Why is fast-forward destructive instead of clock-abstracted?
> - Why does the bulk path skip per-row SELECT FOR UPDATE that the single-row path uses?

---

## Stack

- NestJS (TypeORM, nest-commander, @nestjs/schedule, @nestjs/websockets, golevelup/nestjs-rabbitmq)
- Angular 17+ standalone components, Tailwind v4
- Postgres 16
- Elasticsearch 8
- Redis 7
- RabbitMQ 3.13
- Docker Compose

---

## AI usage

Used Claude (Opus 4.x) extensively for:

- Architectural reasoning (debounce vs throttle, where to place each kind of state, fast-forward design alternatives)
- Code generation for boilerplate-heavy parts (controllers, modules, DTOs)
- Trade-off analysis throughout

Architecture decisions are mine; AI helped me think them through faster. I can explain any of them in depth.

> TODO: be specific about which decisions involved what kind of AI input. Honest disclosure here is a plus per the task description.
