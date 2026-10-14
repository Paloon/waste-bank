# Performance, UX/Kiosk and Code Quality — implementation and recheck

The scope is the school waste-photo application: a student chooses category and
piece count, submits proof, and staff corrects/approves server-calculated Coins.
Student login remains student-ID-only. The changes are local and have not been
published to the production deployment or installed in its PostgreSQL database.

## Implemented

| Plan area | Implementation and evidence |
| --- | --- |
| Baseline | Three synthetic SQLite datasets: 300/10k, 1,500/50k and 3,000/100k students/ledger. Independent correctness oracles and raw samples in performance-baseline.json and performance-after.json. |
| Tailored reads | Server-paged student search; only related student records accompany review/pickup/ledger/audit pages. Public overview has three leaders; filtered leaderboard has ten; rank search has at most fifty matches. SQL/local parity and permission tests. |
| Student history | Own profile/totals and independently paged history. Cloud RPC avoids returning schoolwide profiles; exact rank still aggregates school ledger. |
| Client requests | Concurrent identical GETs share a pending request, without persistent account cache. Caller AbortSignals cancel old tab/search/report reads. Generation checks reject old-account results. Cookie changes remain serialized. |
| Refresh | Admin refresh updates its view; entering the reward shop refreshes public reward data. Initial staff login does not perform a duplicate dashboard read. |
| Submission UX | Inline photo/category/integer-count/note errors, first-error focus, piece units, Coin formula/icon, loading and retry messages, mobile bottom submit action. |
| Kiosk lifecycle | One hook owns idle/heartbeat and event cleanup. Back returns home; pagehide clears memory before beacon/BFCache; pageshow/visibility enforce expiration. In-session network failures preserve proof and the retry receipt. |
| Code boundaries | SQLite adapter and shared domain separated. Staff workspace, student submit, ProfileForm, ReviewCount, ActionButton, compression, request transport and data hooks extracted from main. Stable form component identity preserves typed input during idle warnings. |
| Config | Image URI/byte and class limits use shared policy. Installer runtime includes new module dependencies. |
| Audit consistency | Student deletion removes audit actor IDs; registration and staff login/Drive connection record actor roles. Regression tests cover deletion and role recording. |

## Verification

- `npm run test:all` runs unit/API/SQL tests, production build, the complete business
  browser flow, mobile kiosk tests, and read/paging/filter race tests.
- SQL tests cover SQLite/PostgreSQL output parity, role denial, legacy null
  deletion fields, missing-RPC compatibility and no fallback on permission errors.
- Browser reads test filtered rankings, stale-response cancellation, 50-row student
  pages, search returning to page 1, one initial dashboard read and preserved
  input/focus through the idle warning.
- Core browser flow covers submit, teacher correction/approval, rejection, redeem,
  refund, adjustment, promotion, reward gallery and deletion without browser errors.
- The mobile suite covers integer validation, image errors, loading, same-key retry,
  390px layout, actual history Back, refresh, simulated persisted-page lifecycle and
  91-second idle clearing.

## Measurements

SQLite medians, 3,000 students and 100,000 ledger entries:

| Workload | Before | After |
| --- | ---: | ---: |
| Summary | 7,097 ms | 571 ms |
| Own history first page | 7,038 ms | 450 ms |
| Scoped submission page | 121 ms | 115 ms |

The summary gain is primarily cached date formatting and single-pass counters.
The adapter still parses a complete JSON snapshot; the scoped-query result shows
why it must not be described as bounded disk work. See performance.md for all sizes.

The separate `scripts/benchmark-sql.mjs` uses isolated PGlite PostgreSQL/WASM,
five warm sequential samples, and no network or credentials. At 3,000/100,000:

| Database RPC | Median | Returned database response |
| --- | ---: | ---: |
| Previous school summary | 632 ms | 412,706 bytes |
| New students page | 274 ms | 7,119 bytes |
| New review page | 305 ms | 12,809 bytes |
| New public overview | 574 ms | 668 bytes |
| New own history | 64 ms | 4,553 bytes |

These are different RPCs serving different workloads, not equivalent HTTP response
benchmarks. The public overview reduces transfer considerably while its aggregation
time remains close to the previous summary. The own-history figure is a current
measurement, not a measured speedup against an old history RPC. The EXPLAIN ANALYZE
report confirms an indexed ledger-history lookup; it does not prove that aggregate
summary/rank queries are constant time. Raw timings and plan are in performance-sql.json.

## Release preparation and remaining verification

1. Before a future production release, take a verified backup and apply the additive
   `supabase/read-queries.sql` in the intended database. Then verify service-role
   execute privileges and compare bounded RPC output with the existing totals.
2. Deploy the tested code and check actual domain/API responses. Missing new RPCs
   have a bounded-response compatibility path, but that path retains broader
   internal summary reads and does not provide the optimized database transfer.
3. Measure warm/cold HTTP latency, concurrency/retry frequency and quotas on a
   school-controlled staging deployment. No live-data load test was performed.
4. Check iPad Safari/Android camera, soft keyboard and genuine BFCache navigation;
   tests use Chromium and a mobile viewport, with persisted lifecycle simulation.
5. Run an overnight kiosk soak and capture heap/request trends. Cleanup and idle
   behavior were tested; multi-day memory stability was not measured.

The current design preserves global transaction version checks. Exact school
totals/ranks still scan aggregate ledger data, substring search scans matching
students, and reward editor data includes the whole catalog. Only measurements
showing a remaining bottleneck should trigger a summary table, search extension or
more granular transaction locking. No persistent private browser cache or new
framework was introduced.
