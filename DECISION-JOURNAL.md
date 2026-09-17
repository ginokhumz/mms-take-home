# Decision journal

Write in the first person. Write as you work, not at the end. Rough timestamps are fine, and
"about 40 minutes later" is a valid timestamp.

This file is marked. We read it for three things: how your understanding changed, what you tried
and abandoned, and how you used any AI assistant. See `AI-POLICY.md`.

Keep it honest. "I did not understand the deletion requirement for the first hour" is a good
entry. It tells us more than a tidy narrative does.

Delete these instructions and the example entry before you submit, or leave them. We do not mind.

---

## Time log

Fill this in at the end. Wall-clock hours, honestly.

| Piece | Hours |
|-------|-------|
| Problem 1, design document | |
| Problem 1b, frontend | |
| Problem 2, critique and extend | |
| Journal and admin | |
| **Total** | |

---

## Entries

### Your entries start here

**Wednesday, about 11:00** Read instructions and browsed the 2 problems. Created the repos and initial commits. 

**Wednesday, about 11:30** Started with Problem 1. Read through the documents to get understanding of what needs to be done and what is required.

**Wednesday, about 12:00** Initialized structure for AI agents that covers the whole project.

**Wednesday, about 21:00** Planned out the plan and capacity section

**Wednesday, about 21:30** Planned out the design and core components

**Wednesday, about 21:45** Planned out api contract

**Wednesday, about 22:30** Wrote the data model. Writing the tables out caught three places where
the earlier sections were wrong, which is the point of doing it after §5 rather than before.

**Wednesday, about 23:00** Wrote the Scaling and bottlenecks section.

**Wednesday, about 23:20** Wrote the Failure modes and reliability section.

**Wednesday, about 23:40** Wrote the security section.

**Thursday, about 00:10** Wrote the Deployment and observability section.


---

## Changes of mind

List the decisions you reversed. One line each: what you first chose, what you moved to, and what
made you move.

| First choice | Moved to | What changed my mind |
|--------------|----------|----------------------|
| Post row ~600 B, 900 GB/month (§4.3) | ~368 B, 560 GB/month raw and 1.68 TB at RF 3 (§6.2) | I wrote 600 B in §4 without a breakdown. Adding the fields up in §6.2 gave 230 B, 368 B with wide-column overhead. I had also never mentioned replication, which matters more than the row size |
| Idempotency key written "in the same partition transaction as the post row" (§5.4) | Reserve the `post_id` in the key row first, then write the post, then mark completed | Laying out the tables in §6.8 made it obvious the two are in different partitions and Cassandra cannot write them atomically. The original claim was just wrong |
| Timeline store had a "cold backing store" behind the 800-entry Redis list (§3.2 diagram) | No cold copy; deep pages come from `posts_by_author` | §4.7 already said entries past 800 are not stored. The diagram label contradicted it and would have meant a second store to keep consistent for no gain |
| One flat `followers_by_user` partition per user | Bucketed at 10,000 edges per partition, in append order | 3M followers in one partition is 48 MB and 3M rows, over both Cassandra guidelines. Append order rather than a hash because fanout and purge both walk buckets and want to checkpoint |

---

## Dead ends

List the approaches you tried and abandoned. We read this section closely. An empty section is a
weaker signal than a full one.

| Approach | Why I abandoned it |
|----------|--------------------|
| | |

---

## AI usage log

One row per use. Add rows as you go. If you used no AI assistant at all, write "none" and say so
in the debrief.

| When | What I asked | What came back | What I kept, changed or discarded, and why |
|------|--------------|----------------|--------------------------------------------|
| Wednesday 12:00 | Instructed Claude to write a context file from the instructions that will be used during developement | A claude file and settings file for permissions for the tools | Nothing yet. It looks solid, I'll update where I see it misbehaving |
| Wednesday (§1 drafting) | Asked Claude to expand on use cases and scope | Draft covering: prioritised use cases, exclusions with reasons, the fanout-vs-skew arithmetic (20,000 top accounts × 1M = 20B edges vs 20M × 50 = 1B), an adopted reading (follower counts include inactive registered accounts), and an assumptions table | Moved the arithmatic to section 2 because that is the best place for it, remove repetition |
| Wednesday (§3/§4 drafting) | Asked Claude to propose the high-level design diagram and the core components | Hybrid fanout (push under 100k followers, read-time merge above), Mermaid diagram, write/read path prose, and 13 component subsections each with store / scaling / unavailability. Grounding arithmetic computed in the shell: 579 posts/s avg, 1,736/s at 3× peak, 28,935 timeline writes/s, one 3M-follower post = 3M writes ≈ 104 s of the whole average fanout budget, 384 GB materialised timelines, ~405 TB/month images | Kept the hybrid and the 104 s figure — that number is the argument for it. Kept the decision that timeline entries store `(post_id, author_id)` only and never the body, because it makes §11.2 (edit propagation) and §11.4 (purge) nearly free. Still to check against myself: the 100,000-follower wide/narrow threshold is asserted, not derived — I need to justify it in §11.1 or move it. Peak multiplier of 3× is used here before §2 states it; §2 must state it or the two sections disagree |
| Wednesday (§5 drafting) | Asked Claude to propose the API contract for §5 | A full contract: 10 endpoints (publish, home timeline, single post, PATCH edit, revisions, search, follow, unfollow, delete account, presigned media), one shared `Post` object, Bearer JWT with a 15-min access token plus rotating refresh cookie and a revoked-`sid` set, opaque base64 descending post-ID cursor, `Idempotency-Key` on publish with a stored `(user_id, key) → response` record, and an error envelope with a machine-readable `retryable` flag. Verified in the shell that the two example cursor strings actually base64-decode to `{"v":1,"b":"..."}` and that the second is lower than the first | Kept the shape. The parts I want to be able to defend out loud and believe: IDs as strings (Snowflake is 64-bit, JS is safe to 2^53−1), `retryable` as an explicit field rather than inferred from the status (409 covers both `edit_window_closed`, which is permanent, and `idempotency_in_progress`, which is not), and reusing the timeline cursor for search since ranking is out of scope so both sort by post ID descending. Changed: made `degraded: true` a 200-with-banner rather than an error, to match §4.7 which already says the timeline serves a degraded page from the pull path. Still unverified and flagged in the entry above: the rate-limit numbers and the per-request tombstone lookup are asserted, not derived from §2 |
| Wednesday (§6 drafting) | Asked Claude to write the data model | CQL for `posts`, `post_revisions`, `posts_by_author`, `followers_by_user`/`following_by_user`, `users`, `media`, `idempotency_keys`; the Redis shapes for the timeline list and caches; the OpenSearch document; an ER diagram; an access-pattern table mapping every §5 endpoint to its keys. Arithmetic computed in the shell: 368 B/post row and 560 GB/month raw (1.68 TB at RF 3), 107M revision rows/month adding 7%, a 3M-follower partition at 48 MB and 3M rows against Cassandra's ~100 MB/~100k-row guidance, 300 buckets at 288 s each inside the 24 h purge budget, 17 GB for the follow-graph read cache, 16 KB for the tombstone set, 384 GB for timelines (matches §4.7) | Kept the bucketing, the reserve-then-write idempotency protocol and the `tlmeta` key — that last one is small but it is the only thing that lets the API tell an empty timeline apart from a lost shard, which §5 already promised via `degraded`. Kept `author_id` in the timeline entry once I worked out the filter runs before hydration, so the merge cannot fetch the author. Changed three earlier sections that this contradicted (logged as changes of mind). Still asserted, not derived: 5% of posts get edited, 1.4 edits each, 140-char average post, 0.01% daily deletion rate — all four are guesses and I have marked them as assumptions in the text |
| Wednesday (§6 revision) | Asked Claude what the `lang` field on the post was, then asked it to remove it | It found `lang` in three places (`posts` table, the row-size sum, the search document), none explained, never in the §5 contract, and nothing producing or reading it. It removed it and redid the sums it fed: post row 230 → 222 B, 368 → 355 B with overhead, 540 GB/month raw (1.62 TB at RF 3), revisions 38 GB/month, search doc ~210 B → 0.73 TB/month per replica; §4.3 updated to match | Removed. It had no source and no consumer, so it was a §5/§6 inconsistency I could not have defended. Language-aware search is not in scope |
| Wednesday (§6.6 revision) | Asked Claude to explain `bucket` in `followers_by_user`, then to write up the gaps it raised | Explanation: buckets split each follower list into 10,000-edge partitions because a 3M-follower account is 3M rows, 30x Cassandra's ~100k-row guidance. Gaps: overfill under concurrent follows, holes left by unfollows, the three follow writes not being atomic, and 16 B/edge leaving out overhead. It added all four to §6.6: edge size recalculated at ~26 B (78 MB unbucketed, 260 KB per bucket, so row count is the real reason to split); `users.active_bucket` plus a `bucket_fill` counter table with an LWT to advance the bucket, replacing the vague "counter row"; overfill ≈ 1,000 follows/s x 50 ms = ~50 edges (both figures assumed); holes accepted, not compacted; edge pair in a multi-partition logged batch, counters allowed to drift. Also fixed §4.10, which still said the partition key was `user_id` alone, and the §6.12 follow row | Kept. The original "a counter row holds active_bucket" could not work, because a counter cannot serve as a checked pointer. The 1,000 follows/s and 50 ms LWT figures are my assumptions, not measurements |
| Wednesday (§7 drafting) | Asked Claude to write §7, scaling and bottlenecks | A ranked list by headroom multiple (capacity ÷ peak demand) rather than by absolute size. Arithmetic in the shell: timeline cluster sized by memory at 384 GB = 8 shards = ~400k entries/s, against 86,806 entries/s peak fanout = 4.6x headroom on the mean — but three plausible follower mixes (0.2% of posts at 60k followers, 0.1% at 60k, 0.5% at 20k) give 295k / 191k / 260k entries/s, i.e. 1.4x–2.1x. One 99,999-follower post = 0.25 s of the whole cluster, so 4 such posts per second saturate it against 1,736 posts/s at peak. Post cache second: 347,222 hydrations/s at peak, and a 95%→90% hit-rate drop doubles post-store reads from 17.4k to 34.7k/s. Search third: a ~2.0 s latency budget inside the 5 s SLO, so it breaks on lag not throughput. Then read-time merge, purge (3M ÷ 86,400 = 35 deletes/s), image egress (300 TB/day, 6 TB/day origin at 98% CDN hit) | Kept. The point I want to be able to make out loud is that the mean-based 4.6x headroom is a fiction — fanout demand is set by the follower distribution, and the prompt only gives the mean, which is exactly the trap §2.1 already flagged. Also kept the framing that the 100k wide/narrow threshold is a runtime dial that converts write amplification into read amplification, and that #1's mitigation pushes load into #4, so the two are coupled. **Read ratio: §7 states 25 timeline requests per active user per day → 500M/day → 12.4:1 overall. §2 is not written yet and must state exactly this or the two sections disagree.** Still assumed, not derived: the 0.1–0.5% near-threshold post fraction, the 95% cache hit rate, 100k ops/s per Redis shard, 15% of posts carrying an image, 200 KB per delivered variant. The cache hit rate is flagged in the text as something to measure, and belongs in §13 |
| Wednesday (§8 drafting) | Asked Claude to write §8, failure modes and reliability | A blast-radius table per dependency, then the six named failures with recovery arithmetic computed in the shell: a 5-min fanout outage = 26.0M entries backlog, draining at 400k − 86.8k = 313k/s surplus in 83 s, but only 248 s at the 1.4x-headroom mix from §7.2; a 10-min indexer stall = 1.04M docs draining at 3,500 − 1,736 = 1,764/s in 590 s (~1:1); image-store failure split into presign / pre-finalise / delivery, with 260 of 1,736 posts/s blocked at the 15% image rate; one lost timeline shard = 2.5M users, and rebuilding them within an hour = 694 users/s × 50 followees = 34,722 reads/s against a post store sized for ~25,000 — i.e. the recovery is bigger than the failure; quorum behaviour for the post store at RF 3 / `LOCAL_QUORUM` across 3 AZs; a purge crash costing at most one 10,000-edge bucket of 300. Then a per-read-path consistency table with staleness windows | Kept. The line I want to be able to reproduce live is 34,722 vs 25,000: it is what forces a replica per timeline shard (an extra 384 GB of RAM) instead of the lazy rebuild §4.7 previously described alone, so I edited §4.7 to match rather than let the two sections disagree. Also kept the two admitted give-ups — no monotonic reads across a paginating session, and up to 48 h staleness on an author's display name, where the alternative is 347k extra reads/s at peak. Changed: added a §1.3 assumption row for the self-edge (an author's own post in their own home timeline), because §8.7 and the frontend's optimistic insert both depend on it and nothing had stated it. Still asserted, not derived: ~3,500 docs/s indexer capacity, ~25,000 reads/s post-store read budget, p50 1 s / p99 30 s fanout lag, ~1 s tombstone replication |
| Wednesday (§9 drafting) | Asked Claude to write §9, security | Seven subsections framed around three assets (authorship integrity, availability at ~3x headroom, the deletion promise) rather than confidentiality, since every post is public. Threat table for sessions reusing the §5.2 scheme; ownership checks placed in the post service with the 15-minute edit window treated as an authorisation boundary; rate-limit counters in Redis keyed per `sub` or per IPv6 /64, failing open; image handling covering presign scoping, magic-byte validation, SVG rejection, an 8,192 x 8,192 decode cap, re-encoding to strip EXIF and polyglots, and a sandboxed decoder; escaping at render not at write; a table of what deletion actually removes; TLS 1.3 and mTLS. Arithmetic checked in the shell: 20,000,000 x 300 posts/hour = 1,666,667/s against a 1,736/s design peak (960x), and 8,192 x 8,192 x 4 B = 256 MiB of RGBA | Kept. The two parts I want to be able to defend out loud are (a) per-user rate limits are 960x short of protecting the fleet, so the real controls are global admission shedding and account-age gating — asserting "we rate limit" without that arithmetic is the generic answer the prompt warns about; and (b) "purged from every timeline in 24 h" is a promise about the serving path, not every byte — the event log's 7-day retention and 30-day backups outlive it, and I chose to write that down rather than claim crypto-shredding I have not designed. Also kept rejecting SVG outright and rendering bodies as React text nodes, which is the constraint the frontend has to honour. Still asserted, not derived: the 10 failures/account/hour login throttle, ~20,000 rate-limit evaluations/s at peak, 7-day log and 30-day backup retentions (§10 must state the same numbers or the sections disagree), and the account-age tier of 10 posts/hour |
| Wednesday (§10 drafting) | Asked Claude to write §10, deployment and observability | Three deployment classes (stateless request-path, stateful consumers, stores) with different release mechanisms; the two SLOs stated as 99.9% of home-timeline reads under 400 ms over 28 days and p99 publish-to-searchable under 5 s; a metrics table where each signal is tied to the §7 bottleneck it leads; a page/ticket/not-an-alert split; and six named telemetry artefacts chosen specifically so the §12 dispute ("I saw the old text on page 3") is answerable from telemetry. Arithmetic in the shell: a 1% canary at peak is 174 req/s so a 30-min bake sees ~312,000 requests; a 30 s consumer rebalance during a deploy costs 2,604,180 entries of backlog draining in 8.3 s at §8.1's 313k/s surplus; the error budget is 15M requests or 43.2 minutes a month; 1% head sampling is 6.2M traces/day at 12.4 GB, and ~400 B x 670M requests/day is 268 GB/day or 8 TB at 30-day retention | Kept. The three things I want to defend out loud: (a) the bake duration and canary fraction are derived from traffic, not habit — 312,000 requests is what makes a sub-percent error regression detectable; (b) `degraded: true` counts as a **success** for the availability SLO, because an SLO that punishes graceful degradation teaches the system to fail hard, and §5.1 already made degradation a 200; (c) the revision-per-hydrated-post span attribute is the one piece of instrumentation without which the §12 complaint cannot be settled — the trace would otherwise prove nothing. Also closed the consistency debt §9 opened: 30-day telemetry retention is now stated here and matches §9.6, and the event log's 7-day retention is called out as a separate number that *does* contain bodies. Still asserted, not derived: the 400 ms target, the 30 s rebalance pause, 400 B per structured log line, 2 KB per trace, and the 2%/1 h and 5%/6 h burn-rate thresholds |


---

## Assumptions I made

Every assumption you made that the prompt did not settle. One line each, with the value you chose.

| Assumption | Value I chose | Why |
|------------|---------------|-----|
| | | |

---

## What I would do with another day

Three to five lines. Be specific.
