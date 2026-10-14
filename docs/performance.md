# Code Quality performance measurements

These results use synthetic data in private, temporary SQLite databases. No
production requests, cloud credentials, student records or live databases were
used. The baseline was captured from the worktree immediately before this phase;
the source SHA-256 fingerprints in the JSON reports identify the measured code.

Run the same fixtures with:

```powershell
node scripts/benchmark-performance.mjs --label current --output docs/performance-current.json
```

The clock is fixed at 2026-10-14 08:00 UTC. Each workload receives one untimed
warmup, then three sequential samples on Windows with Node 23.8.0. Values below
are medians in milliseconds; they describe this machine, not a production SLA.

| Students / ledger rows | Workload | Before | After | Relative speed |
| --- | --- | ---: | ---: | ---: |
| 300 / 10,000 | Summary | 628.51 | 47.16 | 13.33× |
| 300 / 10,000 | Own history, first page | 661.24 | 35.48 | 18.64× |
| 300 / 10,000 | Own history, filtered second page | 679.91 | 37.69 | 18.04× |
| 300 / 10,000 | Submission query, second page | 11.46 | 8.93 | 1.28× |
| 1,500 / 50,000 | Summary | 3,838.40 | 244.85 | 15.68× |
| 1,500 / 50,000 | Own history, first page | 3,736.03 | 187.51 | 19.92× |
| 1,500 / 50,000 | Own history, filtered second page | 3,642.05 | 201.42 | 18.08× |
| 1,500 / 50,000 | Submission query, second page | 61.15 | 60.72 | 1.01× |
| 3,000 / 100,000 | Summary | 7,097.11 | 570.97 | 12.43× |
| 3,000 / 100,000 | Own history, first page | 7,038.37 | 449.54 | 15.66× |
| 3,000 / 100,000 | Own history, filtered second page | 7,002.20 | 474.96 | 14.74× |
| 3,000 / 100,000 | Submission query, second page | 121.17 | 115.11 | 1.05× |

The main gains come from replacing repeated date formatting with shared school
date helpers, accumulating summary counters in one pass, and avoiding the global
summary when reading one student's history. Extracting business rules into
`server/domain.js` improves separation and has no claimed speed benefit by itself.

All output checks passed: every student's balance, total earned recycling Coins,
the selected student's rank, ledger ordering and page boundaries, submission
status counts and filters, and populated query page identifiers. Returned response
sizes were identical before and after for all four workloads. The largest first
history response was 7,206 bytes; the largest populated query response was 14,550
bytes. Logical data returned by the history reads fell from 20,012,579 to
13,707,490 bytes in the largest fixture, because unrelated submissions, redemptions,
rewards and audits are excluded from the first read.

The SQLite adapter still stores a single JSON snapshot: even a scoped query
parses the full database snapshot. Logical returned-read bytes are not database
transport bytes or proof of bounded disk work. The scoped submission query shows
little improvement and remains roughly linear in snapshot size. These measurements
do not validate cloud RPC performance; the accompanying cloud changes need their
own deployed-database measurement after separate approval.

The uniformly distributed fixtures contain about 33 ledger rows per student, so
the second wallet page exercises an out-of-range response. The populated second
query page contains 51 rows including the lookahead row. Regression tests cover
dense histories separately. Three samples are too few to infer a stable tail
latency; raw samples and descriptive p95 values are retained in
`performance-baseline.json` and `performance-after.json`.

Backend compatibility checks confirm that old imports from `server/store.js`
resolve to the extracted domain functions, student registration remains without a
PIN, class and image limits use the shared policy, and deletion removes student
audit actor identifiers while preserving staff identities and unrelated events.
