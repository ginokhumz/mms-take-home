# Problem 1 deliverable: Chirp

Fill in every section. Keep a section short if you have little to say, but do not delete it. If
you deliberately skipped something, write one line saying so and why.

Length is not marked. A tight 2,000 words beats a padded 8,000.

---

## 1. Use cases and scope

State the use cases you are designing for, in priority order. State what you excluded and why.
State the assumptions you are making that the prompt did not settle.

### 1.1 Use cases, in priority order

Priority is set by how often each thing happens and how badly users notice when it breaks.

| # | Use case | Why it ranks here |
|---|----------|-------------------|
| 1 | **Read home timeline.** A signed-in user loads the newest posts from accounts they follow, then pages back with "load more". | Happens most often (see §2 read ratio). If this is slow, the product feels broken. |
| 2 | **Publish a post.** Up to 500 characters, with an optional image up to 2 MB. | 50M/day ≈ 580/s on average. Every other feature depends on posts existing. |
| 3 | **Follow / unfollow.** | Decides who is in each timeline. It has to take effect quickly, but follows happen far less often than reads. |
| 4 | **Search public posts.** A new post must show up within 5 s. | Hard freshness target, but it runs on a separate pipeline and can degrade without breaking timelines. |
| 5 | **Edit a post within 15 min, and view its edit history.** | Rare compared with publishing, and the time window is short. Its cost is consistency: timelines, caches and search copies can disagree for a while (§11.2, §12). |
| 6 | **Delete account and purge.** The user's posts disappear from every timeline within 24 h. | Least frequent, but the deadline is non-negotiable (a legal and trust promise). The 24 h budget means it can run as a background job. |

### 1.2 Out of scope

| Excluded | Why |
|----------|-----|
| DMs, notifications, trending, ads, ranking | The prompt excludes them. The timeline is **reverse-chronological** only, with no ranking. |
| Follow graph storage internals | The prompt excludes them. I assume a graph service that answers "followers of X" (paged) and "does A follow B". |
| Moderation policy | The prompt excludes it. There is a hook on publish/edit (before fanout and indexing) and on image processing. Takedowns reuse the purge path. |
| Replies, reposts, likes, quote posts | Not in the brief. Each would change fanout and deletion (for example, what happens to a repost of a deleted post), so I left them out rather than half-designing them. |
| Private or protected accounts | The brief says "public". Every post is visible to everyone, so the timeline and search need no per-viewer access checks. |
| Deleting or editing a single post outside the window | Not in the brief. Account purge covers the removal path. |
| Auth UI, sign-up, password reset | Assumed to be an existing identity provider. §5.2 only covers the token. |

### 1.3 Assumptions the prompt does not settle

| Assumption | Value | Used in |
|------------|-------|---------|
| Reading of fanout vs skew | Follower counts include inactive registered accounts; "average fanout 50" means active timelines written per post. The prompt's figures cannot both hold otherwise (§2.1) | §2, §11.1 |
| Active user | Opens a timeline at least once a day; the 20M figure is daily actives | §2 |
| Registered accounts | ~500M (needed for 1M+ follower counts, per §2.1) | §2, §11.1 |
| Posts per active user | 50M / 20M = 2.5 posts/day on average, heavily skewed | §2 |
| Read-to-write ratio | Stated and derived in §2 | §2 |
| Peak multiplier | Stated in §2 | §2 |
| Timeline ordering | Reverse-chronological by publish time; edits do not change position | §5.3, §12 |
| Edit semantics | Body text only; the image cannot be swapped. Each edit creates a new revision; history is public | §6, §11.2 |
| Edit window boundary | Checked on the server against the publish time, ±0 grace; client clock ignored | §5.1 |
| Unfollow | Stops future posts arriving immediately; existing timeline entries are hidden when read, not rewritten | §11.1 |
| Deletion scope | Posts, images, edit history, timeline entries, search docs, follow edges. Aggregate logs and metrics are anonymised, not purged | §9, §11.4 |
| Deleted account during 24 h window | Account is blocked from login and the profile is hidden immediately; the 24 h budget covers only copies in timelines, caches and search | §11.4 |
| Timeline depth | Materialised timelines keep only the newest ~800 entries per user; older pages are rebuilt on demand | §2, §6 |
| Single region | Designed for one region with multi-AZ; multi-region noted in §14 | §3, §8 |

---

## 2. Capacity estimation

Show the arithmetic. Every figure gets its working.

Cover at least:

- Write rate in posts per second, average and peak. State the peak multiplier you assume.
- Fanout writes per second at the average fanout.
- The skew case: what one post from an account with over 1 million followers costs, and what that
  does to your write path.
- Storage per month: post bodies, images, edit history, materialised timelines, search index.
  Treat each separately and state the assumptions behind each.
- **Your read-to-write ratio, stated explicitly**, and the read load in requests per second that
  follows from it. Say how you chose the ratio and cross-check it against per-user behaviour.
- Egress bandwidth for images, and what it implies for caching.

If two constraints in the prompt do not reconcile arithmetically, show the calculation that proves
it and state the reading you adopt.

### 2.1 Average fanout and follower skew do not reconcile

```
Top accounts        = 20,000,000 active users × 0.1%      = 20,000 accounts
Edges they need     = 20,000 × 1,000,000 followers (min)   = 20,000,000,000 follows
Edges at avg 50     = 20,000,000 users × 50                =  1,000,000,000 follows
Gap                 = 20B / 1B                             = 20× more than the whole graph
Per active user     = 20B / 20M                            = must follow ≥ 1,000 top accounts
```

Both figures cannot describe the same 20M users.

**Reading I adopt:**
- Follower counts include **all registered accounts** (~500M assumed, §1.3), most of them inactive.
- "Average fanout 50" is the number of **active timelines one post is written into**, averaged over
  posts. Most posts come from small accounts, which keeps the per-post average low.

**What this does to the write path:** pushing one post from a 1M-follower account means ≥ 1M
timeline writes for one post, 20,000× the average post's 50. Large accounts are therefore not
fanned out at write time (§11.1).

---

## 3. High-level design and diagram

One diagram, in a Mermaid fenced code block, showing components and the direction of data flow.
Then prose that walks the write path and the read path.

The diagram and the prose must agree. So must the diagram and section 4.

### 3.1 The shape, in one sentence

Posts are written once to a durable log; **narrow** authors (< 100,000 followers) are fanned out to
materialised timelines at write time, **wide** authors are merged in at read time, and every
materialised timeline entry is an **ID reference, never a copy of the body** — which is what makes
edits and purges cheap.

Three numbers drive the whole shape (§2):

```
50,000,000 posts/day ÷ 86,400          =    579 posts/s average, ~1,736/s at 3× peak
579/s × 50 average fanout              = 28,935 timeline writes/s average, ~86,800/s at peak
one post from a 3,000,000-follower account = 3,000,000 timeline writes
                                         = 3,000,000 ÷ 28,935 ≈ 104 s of the entire
                                           average fanout budget, for one post
```

Pure write-time fanout cannot absorb the skew case; pure read-time merge makes the common read
(50 followed accounts) a 50-way scatter. Hence the hybrid (decision record §11.1).

### 3.2 Diagram

```mermaid
graph TB
  subgraph clients[" "]
    C[Web / mobile client]
  end

  C -->|HTTPS| GW[Edge + API gateway<br/>TLS, authn, rate limit]
  C -.->|PUT presigned, direct| OS[(Object store<br/>originals + variants)]
  C -.->|GET image| CDN[Image CDN]
  CDN --> OS

  GW --> PS[Post service<br/>publish / edit / read post]
  GW --> TS[Timeline service<br/>home timeline read]
  GW --> SS[Search service]
  GW --> FS[Follow service<br/>follow / unfollow]
  GW --> AS[Account service<br/>delete account]
  GW --> MS[Media service<br/>presign + finalise]

  PS --> PDB[(Post store<br/>posts + revisions<br/>shard: post_id)]
  PS --> PC[(Post cache<br/>post_id -> rendered post)]
  PS -->|outbox| LOG[["Event log (Kafka)<br/>post.published / post.edited /<br/>account.deleted / media.ready"]]

  MS --> OS
  MS --> LOG

  LOG --> FW[Fanout workers]
  LOG --> IX[Search indexer]
  LOG --> PW[Purge workers]

  FW -->|followers of narrow authors| FGS[(Follow graph store<br/>followers_by_user /<br/>following_by_user)]
  FW -->|LPUSH post_id| TL[(Timeline store<br/>Redis list per user<br/>+ cold backing store)]
  IX --> SI[(Search index<br/>OpenSearch, refresh 1s)]
  PW --> TL
  PW --> PDB
  PW --> SI
  PW --> OS

  TS -->|push set| TL
  TS -->|"pull set: wide accounts followed"| AIX[(Author index<br/>recent post_ids by author)]
  TS -->|which followees are wide| FGS
  TS -->|hydrate by id| PC
  PC -.->|miss| PDB
  TS -->|filter| TOMB[(Tombstone set<br/>deleted / unfollowed authors)]
  SS --> SI
  SS --> PC
  FS --> FGS
  AS --> LOG
  AS --> TOMB

  PDB --> AIX
```

### 3.3 Write path (publish)

1. If the post has an image, the client first calls `POST /v1/media` and receives a presigned URL;
   the 2 MB upload goes **client → object store directly**, never through the API tier. That keeps
   ~225M images/month (§2) off the request path. The media service emits `media.ready` when the
   variants are generated.
2. `POST /v1/posts` with an idempotency key hits the post service. It validates ≤ 500 characters,
   mints a **time-ordered 64-bit post ID** (Snowflake-style: 41-bit ms timestamp, 10-bit shard,
   12-bit sequence), and writes the post row plus revision 1 in a single partition write to the post
   store, sharded by `post_id`.
3. The same transaction writes an **outbox row**, which is tailed into the event log. This is the
   only publication point: fanout, search indexing and purge all consume from it, so they can never
   see a post the post store does not have.
4. The API returns 201 as soon as step 3 is durable — **before** fanout completes. Publish latency
   does not depend on follower count.
5. Fanout workers consume `post.published`. They ask the follow service whether the author is
   narrow or wide:
   - **narrow** (< 100,000 followers): page `followers_by_user`, `LPUSH (post_id, author_id)` onto
     each follower's timeline list, trim to 800 entries. 24 bytes per entry, so the whole
     materialised set is 20M × 800 × 24 B ≈ **384 GB** — it fits in RAM across a Redis cluster.
   - **wide** (≥ 100,000 followers): **no fanout at all.** The post is only recorded in the author
     index, which the read path merges.
6. The search indexer consumes the same event and writes to OpenSearch with a 1 s refresh interval.
   Budget for the 5 s freshness requirement is in §11.3.

### 3.4 Read path (home timeline)

1. `GET /v1/timeline/home?cursor=&limit=20` reaches the timeline service.
2. It fetches two sets and merges them:
   - **push set** — a slice of the viewer's Redis list, already in reverse-chronological order
     because post IDs are time-ordered;
   - **pull set** — for each *wide* account the viewer follows (the follow service keeps a small
     `wide_followees` set per user; at 50 average followees this is typically 0–3 entries), a
     bounded range read of that author's recent post IDs from the author index.
3. A k-way merge on post ID descending produces one ordered list. The **cursor is the post ID of
   the last item returned**, so it is meaningful against both sets: the next page asks for
   `post_id < cursor` on each. Posts published mid-pagination have higher IDs and therefore appear
   on refresh, not interleaved into the page the reader is on (§5.3, §12).
4. Tombstone filter: IDs whose author is in the deleted-or-unfollowed set are dropped here. This is
   how "gone immediately" is delivered while the physical purge runs inside its 24 h budget (§11.4).
5. Hydration: one multi-get against the post cache by post ID, falling back to the post store on
   miss. **The timeline never stores the body**, so a hydrate always returns the current revision.
   That is the whole edit-propagation story: an edit invalidates one cache key, and every timeline
   that references the post picks up the new revision on its next read. No timeline is rewritten
   (§11.2).
6. The response carries `revision`, `edited_at` and an `edit_count` so the frontend can render the
   edited indicator.

### 3.5 Where the moderation hook goes

Out of scope per the prompt, but the seam is: a synchronous check in the post service between
step 2 and step 3 (reject before the post exists), and an asynchronous consumer on
`post.published`/`media.ready` that can call the purge path for a single post. Noted; not designed.

---

## 4. Core components

One subsection per component: responsibility, what it stores, how it scales, what happens when it
is unavailable. These are exactly the components in §3.2 and the ones whose state §12 tracks.

### 4.1 Edge and API gateway

**Responsibility.** TLS termination, token validation (§5.2), per-token and per-IP rate limiting,
request routing, idempotency-key pass-through.
**Stores.** Nothing durable. A short-lived counter store for rate limits.
**Scales.** Stateless, horizontally; sized against read RPS from §2, not write RPS.
**Unavailable.** Total outage of the product. Run ≥ 3 AZs behind an anycast load balancer; this is
the one component with no graceful degradation, so it holds no business logic.

### 4.2 Post service

**Responsibility.** Publish, edit (enforcing the 15-minute window against the server-side publish
time), read a single post, read edit history. Owns ID minting and the outbox.
**Stores.** Writes the post store; writes and invalidates the post cache.
**Scales.** Stateless; ~579 writes/s average, ~1,736/s peak — small. Sized by the read-through path
on cache misses, not by writes.
**Unavailable.** Publishing and editing fail with a retryable 503. **Timelines keep serving** from
the post cache, so the read path degrades to "no new posts" rather than an outage.

### 4.3 Post store

**Responsibility.** The durable record of every post and every revision. Source of truth.
**Stores.** `posts` (partition key `post_id`) and `post_revisions` (partition `post_id`, clustering
`revision`). ~1.5 B posts/month × ~600 B ≈ **900 GB/month** of bodies and metadata (§2).
**Scales.** Wide-column store (Cassandra/ScyllaDB) partitioned by `post_id`. Post IDs are
time-ordered but hashed into partitions, so writes spread rather than hot-spotting the newest
shard. Growth is linear and additive.
**Unavailable.** Publish fails. Reads survive for whatever is cached; cache misses return 503 for
individual posts, which the timeline renders as a gap rather than failing the whole page.

### 4.4 Post cache

**Responsibility.** Serve hydration. Keyed `post:{post_id}` → rendered post JSON including
`revision`.
**Stores.** Hot window only — roughly the last 48 h of posts plus anything recently read. At
100M posts in a 48 h window × ~700 B ≈ 70 GB, sharded.
**Scales.** Redis cluster, consistent hashing on `post_id`.
**Unavailable.** Every hydration falls through to the post store. Timeline read latency rises
sharply and the post store becomes the bottleneck — this is the second thing that breaks under
load (§7).

### 4.5 Event log

**Responsibility.** The ordering and delivery backbone. Topics: `post.published`, `post.edited`,
`account.deleted`, `media.ready`. Partitioned by `author_id` so all events for one author are
ordered.
**Stores.** 7-day retention, which is the replay window for a fanout or indexer bug.
**Scales.** Kafka. ~579 events/s average is trivial; partition count is chosen for consumer
parallelism (fanout), not throughput.
**Unavailable.** The post service's outbox rows accumulate and publish still succeeds; fanout,
indexing and purge stall. Search freshness and new-post delivery degrade, timelines keep serving
existing entries. Backlog drains on recovery because consumers are idempotent (§4.6).

### 4.6 Fanout workers

**Responsibility.** Consume `post.published`, expand narrow authors' follower lists, write timeline
entries. Skip wide authors entirely.
**Stores.** Consumer offsets only.
**Scales.** ~28,935 timeline writes/s average, ~86,800/s at peak. Workers are partitioned by
`author_id`; a large narrow author (say 90,000 followers) is chunked into follower pages of 10,000
so one post never occupies a worker for long. Writes are `LPUSH`+`LTRIM`, idempotent on replay
because the entry is keyed by `post_id` — a duplicate delivery re-pushes the same ID and the
de-duplication happens at merge time in §4.8.
**Unavailable.** New posts from narrow authors stop appearing in followers' timelines; posts from
wide authors keep appearing, because they come through the read-time merge. Backlog is bounded by
log retention.

### 4.7 Timeline store

**Responsibility.** The materialised push set: per user, a list of `(post_id, author_id)` capped at
800 entries.
**Stores.** 20M × 800 × 24 B ≈ **384 GB** in RAM. Anything older than 800 entries is not stored;
deep pagination falls back to the author-index path (§4.8).
**Scales.** Redis cluster keyed by `user_id`. Purely horizontal; a user's whole timeline lives on
one shard, so a page is one round trip.
**Unavailable (node lost).** The users on that shard lose their push set. The timeline service
detects the empty/errored read and serves a **degraded timeline from the pull path plus the author
index for followed accounts**, marked stale in the response. Lost lists are rebuilt lazily from the
author indexes rather than by replaying Kafka.

### 4.8 Timeline service

**Responsibility.** The read path in §3.4: fetch push set, fetch pull set for wide followees,
k-way merge, de-duplicate by post ID, apply the tombstone filter, hydrate, emit the cursor.
**Stores.** Nothing. This is where all the fiddly correctness lives, so it is deliberately
stateless.
**Scales.** The busiest service in the system — read load per §2. Horizontal; each request is
bounded by `limit` (max 100) and by the number of wide followees.
**Unavailable.** Home timeline is down. Single posts, profiles and search still work.

### 4.9 Author index

**Responsibility.** "Recent post IDs by author, newest first" — the read-time half of the hybrid,
and the rebuild source for lost timeline shards.
**Stores.** Partition `author_id`, clustering `post_id` descending; retains the newest ~1,000 IDs
per author in the hot tier. ~24 B per entry.
**Scales.** Same store as §4.3, written on the publish path. Wide authors are read-heavy but there
are few of them (20,000 accounts over 1M followers, §2.1), so these partitions are cached
aggressively.
**Unavailable.** Posts from wide accounts vanish from timelines until it recovers; narrow-author
posts are unaffected. This is the inverse failure of §4.6, which is the point of the hybrid.

### 4.10 Follow service and follow graph store

**Responsibility.** `follow`/`unfollow`, `followers_of(user)` paged, `following(user)`, the
`is_wide` flag, and the per-user `wide_followees` set the read path needs. Storage internals are
out of scope per the prompt; this is the interface the timeline depends on.
**Stores.** `followers_by_user` (partition `user_id`, clustering `follower_id`) and
`following_by_user`. ~1 B edges at 20M × 50 (§2.1).
**Scales.** Partitioned by `user_id`. Wide accounts' follower partitions are huge — they are only
read by purge, never by fanout, which is why the hybrid keeps them cold.
**Unavailable.** Follow/unfollow returns 503. Fanout stalls (it cannot list followers); read-time
merge degrades to the last cached `wide_followees` set.

### 4.11 Search indexer and search index

**Responsibility.** Consume `post.published`/`post.edited`, transform to a search document, index
it. Serve `GET /v1/search`.
**Stores.** OpenSearch, time-sliced indexes, `refresh_interval: 1s`. Body plus author and timestamp
metadata for 1.5 B docs/month.
**Scales.** Indexing at ~579 docs/s is modest; the index is sharded by time so the hot shard is
today's. Query load scales by adding replicas.
**Unavailable.** Search returns 503 or stale results; **timelines and publishing are unaffected**,
which is why search sits on its own consumer group. If it merely falls behind, the 5 s freshness
SLO breaks first and is alerted on before results become visibly wrong (§10).

### 4.12 Media service, object store and CDN

**Responsibility.** Issue presigned uploads, validate the finished object (content type by magic
bytes, size ≤ 2 MB, re-encode to strip metadata), generate variants, emit `media.ready`.
**Stores.** Object store: originals plus ~2 variants. At 15% of posts carrying an image,
225M images/month × 1.2 MB × 1.5 ≈ **405 TB/month** (§2) — the dominant storage cost by two orders
of magnitude, which is why it never touches the API tier or any database.
**Scales.** Object store scales on its own; processing workers scale on the queue.
**Unavailable.** Publish with an image fails at the presign step, before any post exists — so there
is no orphaned post. Text-only publishing is unaffected. If delivery (CDN/object store) is down,
posts render with a broken-image placeholder; text still reads.

### 4.13 Account service, tombstone set and purge workers

**Responsibility.** Account deletion. The account service immediately blocks login, hides the
profile, and writes the author to the **tombstone set**; it emits `account.deleted`. Purge workers
then physically remove posts, revisions, search docs, images, follow edges and timeline entries
inside the 24 h budget (§11.4).
**Stores.** Tombstone set: a small replicated set of author IDs, read on every hydration, entries
retired once the purge for that author completes.
**Scales.** Purge is a background job partitioned by author; the 24 h budget is what makes it
affordable to walk a wide account's follower partitions.
**Unavailable (job fails halfway).** Posts are already invisible via the tombstone filter, so the
user-visible promise holds; the job is resumable by checkpointed follower page and re-runs are
idempotent (delete-if-present). Recovery is covered in §8.

---

## 5. API contract

JSON over HTTPS, base path `/v1`. Everything below is what the frontend in `frontend/` codes
against.

### 5.0 Conventions and shared objects

**IDs are strings.** Post IDs are 64-bit Snowflake values (§3.3). `2^63` exceeds JavaScript's
`Number.MAX_SAFE_INTEGER` (`2^53 − 1`), so every ID crosses the wire as a decimal string. This is a
contract rule, not a style preference — a numeric `id` silently corrupts in any JSON parser using
IEEE-754 doubles.

**Timestamps** are RFC 3339 UTC with millisecond precision: `2026-09-17T10:00:00.000Z`.

**`Post`** — the single representation used by the timeline, single-post reads, search results and
the publish response. One shape, so the frontend has one type.

```json
{
  "id": "1827639201234567890",
  "author": {
    "id": "88213004",
    "handle": "grace",
    "display_name": "Grace",
    "avatar_url": "https://cdn.chirp.example/a/88213004/64.webp"
  },
  "text": "the post body, at most 500 characters",
  "image": {
    "url": "https://cdn.chirp.example/m/9f21c/1280.webp",
    "width": 1280,
    "height": 720,
    "alt": null
  },
  "created_at": "2026-09-17T10:00:00.000Z",
  "revision": 1,
  "edited_at": null,
  "edit_count": 0,
  "editable_until": "2026-09-17T10:15:00.000Z"
}
```

| Field | Notes |
|---|---|
| `id` | Time-ordered, so `id` descending **is** reverse-chronological order (§3.4). |
| `image` | `null` when the post has no image. Never partially populated. |
| `revision` | 1 on publish, incremented per edit. The hydration path always returns the current revision (§3.4 step 5). |
| `edited_at`, `edit_count` | `null` / `0` until the first edit. **`edit_count > 0` is the edited indicator** the frontend renders; it links to `/posts/{id}/revisions`. |
| `editable_until` | Present **only** when the caller is the author and the 15-minute window is still open; absent otherwise. It is advisory — the server re-checks on `PATCH` (§1.3). |

Authors do not carry a `follower_count`. The wide/narrow split (§3.3) is an internal routing
decision and is not exposed.

### 5.1 Endpoints

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | `POST` | `/v1/posts` | Publish |
| 2 | `GET` | `/v1/timeline/home` | Home timeline |
| 3 | `GET` | `/v1/posts/{post_id}` | Single post |
| 4 | `PATCH` | `/v1/posts/{post_id}` | Edit inside the window |
| 5 | `GET` | `/v1/posts/{post_id}/revisions` | Edit history |
| 6 | `GET` | `/v1/search` | Search the public corpus |
| 7 | `PUT` | `/v1/users/{user_id}/follow` | Follow |
| 8 | `DELETE` | `/v1/users/{user_id}/follow` | Unfollow |
| 9 | `DELETE` | `/v1/accounts/me` | Delete account, start purge |
| 10 | `POST` | `/v1/media` | Presigned image upload (precedes 1) |

---

**1. `POST /v1/posts` — publish**

```http
POST /v1/posts
Authorization: Bearer <access token>
Idempotency-Key: 5f2b8c1e-0a3d-4e77-9b21-6c0d1a7e4f9b
Content-Type: application/json

{ "text": "first post", "media_id": "9f21c7a0-...", "alt": null }
```

`text`: 1–500 characters, counted as Unicode code points after NFC normalisation, so a family emoji
costs 1, not 11 UTF-16 units. `media_id` optional (from endpoint 10), `alt` optional and ≤ 400
characters. A post must have `text`; an image alone is rejected.

`201 Created`, `Location: /v1/posts/{id}`, body is a `Post`. Returned as soon as the outbox write is
durable — **before fanout** (§3.3 step 4), so latency does not depend on follower count.

| Status | Meaning |
|---|---|
| 201 | Published. Repeat of a completed `Idempotency-Key` also returns 201 with the original body. |
| 400 | `validation_failed` — empty or > 500 characters, bad `alt`. |
| 401 | Missing/expired token. |
| 409 | `media_not_ready` (no object uploaded at that `media_id`) or `idempotency_key_reuse` (same key, different body). |
| 429 | Publish rate limit (§5.5). |
| 503 | Post service or post store down (§4.2, §4.3). Retryable with the same key. |

---

**2. `GET /v1/timeline/home` — home timeline**

```http
GET /v1/timeline/home?limit=20&cursor=eyJ2IjoxLCJiIjoiMTgyNzYzOTIwMTIzNDU2Nzg5MCJ9
Authorization: Bearer <access token>
```

`limit` 1–100, default 20. `cursor` omitted for the first page.

```json
{
  "items": [ { "...": "Post" } ],
  "page": {
    "next_cursor": "eyJ2IjoxLCJiIjoiMTgyNzYzOTE4NzAwMDAwMDAwMCJ9",
    "has_more": true
  },
  "degraded": false
}
```

`degraded: true` means the push set was unavailable and the page was served from the pull path alone
(§4.7) — fewer items than usual, narrow-author posts may be missing. The frontend shows a banner and
keeps rendering; it is not an error.

`next_cursor` is `null` exactly when `has_more` is `false`.

| Status | Meaning |
|---|---|
| 200 | Including an empty `items` array — an empty timeline is not an error. |
| 400 | `invalid_cursor` — malformed or truncated cursor. Terminal; the client restarts at page 1. |
| 401 | Missing/expired token. |
| 503 | Timeline service unavailable (§4.8). Retryable. |

---

**3. `GET /v1/posts/{post_id}` — single post**

`200` with a `Post`. `404 post_not_found` if the ID does not exist, if the post was purged, **or if
the author is in the tombstone set** (§4.13) — a deleted author's posts are indistinguishable from
absent ones from outside. `503` on a post-store failure with a cold cache (§4.3).

---

**4. `PATCH /v1/posts/{post_id}` — edit**

```http
PATCH /v1/posts/1827639201234567890
Authorization: Bearer <access token>
If-Match: "3"
Content-Type: application/json

{ "text": "first post (fixed a typo)" }
```

Body text only — the image cannot be swapped (§1.3), so there is no `media_id` here. `If-Match`
carries the revision the client believes it is editing, as an ETag; every `Post` read carries
`ETag: "<revision>"`. Omitting it is allowed (last-write-wins); sending a stale one gets 412. This
is the concurrent-edit guard for the same author on two devices.

`200 OK` with the updated `Post`: `revision` incremented, `edited_at` set, `edit_count` incremented.

| Status | Meaning |
|---|---|
| 200 | Edited. Invalidates `post:{post_id}` in the post cache; no timeline is rewritten (§3.4 step 5). |
| 400 | `validation_failed`. |
| 403 | `not_author` — authorisation is ownership, checked server-side against the token subject. |
| 404 | `post_not_found`. |
| 409 | `edit_window_closed` — more than 15 minutes after `created_at`, measured server-side. **Terminal**: retrying never succeeds, and the frontend must say so rather than offering a retry button. |
| 412 | `revision_conflict` — `If-Match` did not match the current revision. |

---

**5. `GET /v1/posts/{post_id}/revisions` — edit history**

Public, per §1.3. Newest first, at most 1 + the number of edits possible in 15 minutes, so no
pagination.

```json
{
  "post_id": "1827639201234567890",
  "revisions": [
    { "revision": 2, "text": "first post (fixed a typo)", "created_at": "2026-09-17T10:10:00.000Z" },
    { "revision": 1, "text": "first post", "created_at": "2026-09-17T10:00:00.000Z" }
  ]
}
```

`200`, or `404 post_not_found` under the same rules as endpoint 3.

---

**6. `GET /v1/search` — public corpus**

`GET /v1/search?q=coffee&limit=20&cursor=...`. `q` is 1–128 characters. Results are
reverse-chronological, not relevance-ranked (ranking is out of scope, §1.2), which lets search reuse
**the same post-ID cursor as the timeline** — one cursor implementation, one frontend type.

Same envelope as endpoint 2 minus `degraded`, plus `"freshness_lag_ms": 820` — the indexer's current
lag, exposed so the 5-second SLO (§11.3) is observable by clients and by the tests that check it.

`200` / `400 validation_failed` (empty or over-long `q`) / `503 search_unavailable` (retryable;
timelines are unaffected, §4.11).

---

**7–8. `PUT` / `DELETE /v1/users/{user_id}/follow`**

No request body. `204 No Content` on success, and both are naturally idempotent — following twice is
a no-op that still returns 204, so no `Idempotency-Key` is needed. `403 cannot_follow_self`,
`404 user_not_found`, `429`, `503 follow_service_unavailable` (§4.10).

Unfollow takes effect on the **next** timeline read via the tombstone/unfollow filter; existing
materialised entries are not rewritten (§1.3, §3.4 step 4).

---

**9. `DELETE /v1/accounts/me` — delete account**

```http
DELETE /v1/accounts/me
Authorization: Bearer <access token>
Content-Type: application/json

{ "confirm_handle": "grace" }
```

`202 Accepted` — the work is asynchronous by design:

```json
{
  "purge_id": "prg_01J9X2",
  "accepted_at": "2026-09-17T10:20:00.000Z",
  "visible_removal": "immediate",
  "purge_deadline": "2026-09-18T10:20:00.000Z"
}
```

`visible_removal: immediate` is the tombstone write plus login block; `purge_deadline` is
`accepted_at + 24 h`, the prompt's budget (§11.4). All sessions are revoked as part of the 202, so
the token used for this call is dead on return. `400 confirm_mismatch`, `401`, `409 purge_in_flight`.

---

**10. `POST /v1/media` — presigned upload**

```http
POST /v1/media
{ "content_type": "image/jpeg", "byte_size": 1843200 }
```

`201`:

```json
{
  "media_id": "9f21c7a0-4b6e-4f0b-8f02-a1d33c9e7b10",
  "upload_url": "https://uploads.chirp.example/...&X-Amz-Expires=900",
  "expires_at": "2026-09-17T10:15:00.000Z"
}
```

The client `PUT`s the bytes straight to `upload_url` (§3.3 step 1), then passes `media_id` to
endpoint 1. `413 image_too_large` if `byte_size > 2097152`, `415 unsupported_media_type` for anything
outside JPEG/PNG/WebP. Declared size and type are only a fast rejection — the media service
re-validates by magic bytes and re-encodes (§4.12, §9).

### 5.2 Authentication and authorisation

**Scheme.** `Authorization: Bearer <jwt>` on every endpoint above. Search and single-post reads
accept an absent token and serve the public view; everything else is 401 without one.

**Where it lives.** Two credentials:

- **Access token** — a JWT signed with EdDSA, claims `sub` (user ID), `sid` (session ID), `iat`,
  `exp`. **15-minute lifetime.** Held in memory by the client, never in `localStorage` (an XSS-
  readable store, §9).
- **Refresh token** — opaque, 30-day sliding lifetime, in an `HttpOnly; Secure; SameSite=Strict`
  cookie scoped to `/v1/auth`. `POST /v1/auth/refresh` exchanges it for a new access token and
  rotates the refresh token; a reused rotated token revokes the whole session family.

The gateway (§4.1) verifies the signature locally — no per-request call to an identity service at
timeline read rates.

**Authorisation** is ownership only, because every post is public (§1.2). Edit and delete compare
`sub` against the post's `author_id` **in the post service**, never at the gateway and never from a
client-supplied author field.

**Revocation.** A 15-minute access token cannot be withdrawn mid-life by signature checks alone, so
the gateway consults a **revoked-`sid` set** (Redis, entries expiring after 15 minutes — bounded
because it only needs to outlive the longest-lived token). Deleting an account, logging out, or a
password change writes every one of that user's `sid` values into it. Worst-case exposure is
therefore 0 seconds, not 15 minutes, at the cost of one cached set lookup per request.

### 5.3 Pagination

**Mechanism: forward-only cursor, descending post ID.** The cursor is an opaque base64url string;
its current payload is `{"v":1,"b":"<post_id>"}`, the ID of the last item returned. Clients must
treat it as opaque — the `v` field exists so the encoding can change without breaking live clients.

**Why not offset.** An offset over a feed that gains ~579 posts/s (§3.1) shifts under the reader: a
post inserted at the head while they page makes `OFFSET 20` return an item they already saw.
Offsets also force the merge in §3.4 to materialise and count everything before the offset, which
gets more expensive the deeper the page. A cursor is O(depth of one page) and is meaningful against
**both** halves of the hybrid — the Redis list slice and the author-index range read both accept
"give me IDs `< cursor`" (§3.4 step 3).

**New posts arriving mid-page.** They get higher IDs than the cursor, and pagination only ever moves
toward lower IDs, so:

- **No duplicates.** A post already returned has an ID ≥ the cursor and cannot appear on a later page.
- **No new posts mid-scroll.** Anything published after page 1 is invisible until the client
  restarts from `cursor = null`. That is deliberate: the alternative injects items above the reader's
  scroll position.
- The first response's newest `id` is what the client keeps to poll for "N new posts" and to decide
  whether a refresh is warranted.

**Trimmed depth.** Materialised timelines hold 800 entries (§4.7). Paging past 800 does not 404 —
the timeline service falls through to the author-index path for the viewer's followees and keeps
serving, more slowly. The frontend sees no difference beyond latency.

**Edits during pagination.** An edit does not change a post's ID, so it does not move between pages.
A reader who already passed the post keeps revision N in their rendered DOM; a page fetched after
the edit hydrates revision N+1. Both are correct views of different read times; §12 traces this.

### 5.4 Idempotency

| Operation | Idempotent? | Mechanism |
|---|---|---|
| `POST /v1/posts` | Yes, with a key | `Idempotency-Key` header, required |
| `POST /v1/media` | No | A wasted presign is garbage-collected after 15 minutes |
| `PATCH /v1/posts/{id}` | Effectively | `If-Match` makes a duplicate retry fail 412 instead of double-editing |
| `PUT`/`DELETE` follow | Yes, naturally | Set semantics; repeat returns 204 |
| `DELETE /v1/accounts/me` | Yes | Second call returns 409 `purge_in_flight` with the original `purge_id` |

**How a client retries a publish safely.** The client generates a UUIDv4 before the first attempt and
reuses it for every retry of *that* post. The post service stores `(user_id, key) → (request hash,
status, response body)` for 24 hours, written in the same partition transaction as the post row —
so a crash between "post written" and "key recorded" is impossible.

- Same key, same body, original completed → 201 with the stored body. The client sees one post.
- Same key, same body, original still in flight → `409 idempotency_in_progress`, retryable after
  `Retry-After`.
- Same key, **different** body → `409 idempotency_key_reuse`. Terminal: it means a client bug.

This is what makes the frontend's optimistic write safe. On a timeout the client cannot tell whether
the post was created, and retrying with the same key resolves that ambiguity without a duplicate
post — the alternative is an optimistic UI that occasionally publishes twice.

### 5.5 Error model

Every non-2xx response has this body, and nothing else ever appears in an error position:

```json
{
  "error": {
    "code": "edit_window_closed",
    "message": "This post can no longer be edited.",
    "retryable": false,
    "request_id": "01J9X2K3M4N5P6Q7R8S9T0",
    "details": { "editable_until": "2026-09-17T10:15:00.000Z" }
  }
}
```

| Field | Contract |
|---|---|
| `code` | Stable `snake_case` enum. The frontend switches on this, never on `message`. |
| `message` | Human-readable, already end-user safe. Never contains internal identifiers. |
| `retryable` | **Machine-readable.** `true` means the identical request may succeed later. The frontend shows a retry affordance if and only if this is `true`. |
| `request_id` | Echoed in `X-Request-Id`, the trace key for §10 and §12. Shown in the UI so a user report is debuggable. |
| `details` | Optional, code-specific. Absent by default. |

| Status | Retryable | Codes | What it means here |
|---|---|---|---|
| 400 | no | `validation_failed`, `invalid_cursor`, `confirm_mismatch` | Malformed request. Retrying the same bytes always fails. |
| 401 | no* | `unauthenticated`, `token_expired` | *Terminal for the request, but `token_expired` triggers one silent refresh (§5.2) and one replay. |
| 403 | no | `not_author`, `cannot_follow_self` | Authenticated, not permitted. |
| 404 | no | `post_not_found`, `user_not_found` | Absent, purged, or tombstoned — deliberately indistinguishable. |
| 409 | mixed | `edit_window_closed` (no), `media_not_ready` (no), `idempotency_key_reuse` (no), `idempotency_in_progress` (**yes**), `purge_in_flight` (no) | State conflict. `retryable` is per code, which is exactly why it is a field and not inferred from the status. |
| 412 | no | `revision_conflict` | Client must re-read and re-apply. |
| 413 | no | `image_too_large` | Over 2 MB. |
| 415 | no | `unsupported_media_type` | Not JPEG/PNG/WebP. |
| 429 | **yes** | `rate_limited` | With `Retry-After` and `details.limit` / `details.reset_at`. Publish 300/h/user, timeline 120/min, search 60/min, follow 600/day, all per token; anonymous reads 60/min per IP. |
| 500 | **yes** | `internal_error` | Unclassified. Never leaks a stack trace. |
| 503 | **yes** | `post_service_unavailable`, `timeline_unavailable`, `search_unavailable`, `follow_service_unavailable` | A named dependency from §4 is down. `Retry-After` present. Clients back off exponentially with jitter. |

Note that 429 and 503 are the only codes that should ever drive an automatic client retry, and the
backoff belongs in one HTTP layer in the frontend rather than at each call site.

**Reaching the error path in the mock.** The fixture layer in `frontend/` honours a `?fault=<code>`
query parameter and an equivalent toggle in the UI, so any row of this table can be produced without
editing code (SPEC requirement). The parameter is a mock affordance, not part of the production
contract.

---

## 6. Data model

Entities, fields, keys, indexes and relationships. State your partitioning or sharding key for
each store and justify it against the access patterns in section 5.

Say explicitly how you store: the post, the edit history, the materialised timeline (if you use
one), the follow graph, and the search document.

---

## 7. Scaling and bottlenecks

Name the first component that breaks as load grows, and at what load. Then the second, and the
third. For each, say what you do about it.

---

## 8. Failure modes and reliability

For each significant failure, state the effect a user sees and the recovery.

Cover at least: a fanout worker dies mid post, the search indexer falls behind, the image store
is unavailable on publish, a timeline cache node is lost, the primary datastore fails over, a
purge job fails halfway.

State your consistency model, per read path. Say where you accept staleness and for how long.

---

## 9. Security

Cover at least: authentication and session handling, authorisation on edit and delete, abuse and
rate limiting, image upload handling (content type, size, malicious payloads), output escaping
for post bodies, personal data and what deletion actually removes, and transport.

---

## 10. Deployment and observability

How the system is deployed and released. Then: the metrics that tell you it is healthy, the
alerts you would page on, and the traces or logs you would need to debug the worked trace in
section 12.

Name the service level objective for the home timeline read and for search freshness.

---

## 11. Decision records

**This section is heavily weighted.** Write one record for each of the five decisions below. Use
the template exactly.

For each record, "the numbers that forced it" must cite specific figures from `PROMPT.md` or from
your own section 2 arithmetic. A record that cites no number scores zero for that record.

### Template

> **Decision:** what you chose.
> **Alternative rejected:** one real alternative, described well enough that it is clear you
> considered it.
> **The numbers that forced it:** the specific figures that made the choice.
> **What this costs:** what you gave up, stated plainly.
> **What would change my mind:** the observation or measurement that would make you switch.

### The five decisions

1. **Fanout strategy.** Write-time fanout, read-time merge, or a hybrid.
2. **Edit propagation.** What happens to timelines and caches when a post is edited inside the
   15 minute window.
3. **Search freshness.** How a post becomes searchable within 5 seconds.
4. **Deletion purge.** How an account deletion removes that user's posts from every timeline
   within 24 hours.
5. **Image handling.** Upload, storage, resizing, delivery and lifecycle.

---

## 12. Worked trace

**This section is heavily weighted.** Walk this exact scenario end to end.

> An account with 3 million followers edits a post 10 minutes after publishing it, while one of
> its followers is part way through paginating their home timeline.

Requirements:

- Invent identifiers and keep them consistent throughout: user identifiers, post identifiers,
  cursor values, revision numbers.
- Number the steps.
- After each step, state the resulting state at each component you named in section 4.
- Show the actual request and response payloads at each API call, matching section 5.
- State what the paginating follower sees, and whether they can see the post twice, zero times,
  or in two different versions.
- Name every point at which the system is inconsistent, and for how long.

The trace must agree with your diagram, your data model and your API contract. A disagreement
between them is the single most common reason this section loses marks.

---

## 13. Self-critique

**This section is heavily weighted.** Name the three weakest parts of your design.

For each one:

- What is weak, stated without hedging.
- Why you accepted it.
- **The specific test, experiment or measurement that would expose it.** Name the load, the
  metric and the threshold at which you would say the design has failed.

"It might not scale" is not a critique. "The purge job is untested above 5 million timeline
entries per account, and a load test at 5 billion entries would show whether the 24 hour target
holds" is.

---

## 14. Trade-offs and what you would do with more time

What you traded away deliberately. What you would build next, in order, and why that order.
