# Problem 1b implementation plan — the Chirp home timeline

Design and build order for `01-greenfield-design/frontend/`. The authority for every decision here
is **§5 of `../DELIVERABLE.md`**, my own API contract. Where this plan and §5 disagree, §5 wins and
this plan is wrong. Section references throughout (`§5.3`, `§5.5`) point at that document.

Written before any code. `SPEC.md` in this directory is the assessment brief.

---

## 0. Decisions taken before writing this

Four choices the brief leaves open. Each is recorded here so the reasoning survives to the debrief.

| Choice | Taken | Why not the alternative |
|---|---|---|
| Framework | **Vue 3**, `<script setup>`, Vite | Brief allows any. Chosen by me. |
| Mock layer | **Vite dev middleware** serving `/v1/*` over real HTTP | MSW needs a service worker and simulates status/headers; an in-process fixture client makes the error path a code branch rather than a served response. Real HTTP is stronger evidence that the client matches §5 — it exercises actual status codes, `ETag`, `Retry-After`, `X-Request-Id`, and `?fault=` as a genuine query parameter. |
| State | **Pinia**, one `timeline` store | A composable would work, but a single named owner makes the optimistic-vs-pagination race resolvable in one file and inspectable in devtools. That race is an announced debrief question. |
| Tests | **Vitest, store-level only** | Brief says tests are optional. Store-level covers the four places state handling can actually break; a browser test would not fit the 3–4 h guide. Stated in the README as a cut. |

Scope beyond the four required behaviours: **revisions view**, **edit inside the window**, and the
**`degraded` banner** are in, because §5 specifies frontend behaviour for each by name. Silent token
refresh (§5.2) is **out** — it overlaps the auth UI the brief excludes.

---

## 1. Module layout, and the part of the contract each implements

The README must state this mapping; it is designed here rather than reverse-engineered later.

```
frontend/
  PLAN.md                 this file
  BUILD-PLAN.md           the executable task breakdown of §9 below
  README.md               required by SPEC.md
  package.json            + package-lock.json (committed)
  tsconfig.json           strict: true
  vite.config.ts          mounts the mock middleware at /v1
  mock/
    snowflake.ts          §3.3 ID layout + §5.3 cursor encode/decode
    corpus.ts             deterministic seed: authors, posts, revisions
    router.ts             §5.1 endpoints 1, 2, 4, 5
    faults.ts             §5.5 — ?fault=<code> → status + error body + headers
  src/
    api/types.ts          §5.0 Post/PostImage/Author; §5.1#2 page envelope; §5.1#5 revisions
    api/errors.ts         §5.5 — ApiError, parsing and narrowing
    api/http.ts           §5.2 bearer, §5.4 Idempotency-Key, §5.1#4 If-Match, §5.5 429/503 backoff
    api/client.ts         one function per endpoint consumed
    api/mockControls.ts   reads ?fault=/?empty=/… off location.search (mock-only, flagged)
    stores/timeline.ts    §5.1#2 + §5.3 pagination, §5.4 optimistic publish
    components/*.vue      rendering
    main.ts, App.vue
```

| Module | Contract section it implements |
|---|---|
| `api/types.ts` | §5.0 `Post`/`Author`/`PostImage`; §5.1 endpoint 2 envelope; §5.1 endpoint 5 revisions |
| `api/errors.ts` | §5.5 error model — `code`, `retryable`, `request_id`, `details` |
| `api/http.ts` | §5.2 auth header; §5.4 idempotency; §5.1#4 `If-Match`; §5.5 retry policy |
| `api/client.ts` | §5.1 endpoints 1, 2, 4, 5 |
| `stores/timeline.ts` | §5.3 cursor pagination; §5.4 safe optimistic publish |
| `components/EditedIndicator.vue` + `RevisionsPanel.vue` | §5.0 `edit_count`; §5.1 endpoint 5 |
| `components/ErrorPanel.vue` | §5.5 — renders from the model, never a generic string |
| `components/DegradedBanner.vue` | §5.1 endpoint 2, `degraded: true` |
| `mock/*` | All of the above, server side |

Endpoints **3, 6, 7, 8, 9, 10** (single post, search, follow/unfollow, delete account, media) are
in the contract but neither consumed by this view nor implemented in the mock. The README says so
explicitly rather than leaving a reader to wonder whether they were forgotten.

`BUILD-PLAN.md` is the task-by-task expansion of §9. Where the two disagree, `BUILD-PLAN.md` is the
later thought and this file is corrected to match it — the same rule §5 gets over both of them.

---

## 2. Types

`tsconfig.json`: `strict: true`, plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. `vue-tsc --noEmit` runs as `npm run typecheck` and must pass with
zero errors. No `any` anywhere; the JSON boundary is typed `unknown` and narrowed once, in
`api/client.ts`.

Three details in §5.0 that the types must get exactly right, because they are the cheap way to
lose the highest-weighted mark:

1. **Every ID is `string`.** §5.0 makes this a contract rule, not a style choice: post IDs are
   64-bit Snowflakes and `2^63` exceeds `Number.MAX_SAFE_INTEGER`, so a numeric `id` corrupts
   silently in `JSON.parse`. `type PostId = string` as a branded-ish alias to make the intent
   visible.
2. **`image` is `PostImage | null`, never partial.** §5.0: "Never partially populated." So it is a
   single nullable object, not four optional fields.
3. **`editable_until` is optional, not nullable.** §5.0 says it is *absent* unless the caller is
   the author and the window is open. `editable_until?: string` — with
   `exactOptionalPropertyTypes` on, that difference is enforced rather than decorative.

```ts
export interface Post {
  id: PostId;
  author: Author;
  text: string;
  image: PostImage | null;
  created_at: string;       // RFC 3339 UTC, ms precision (§5.0)
  revision: number;
  edited_at: string | null;
  edit_count: number;
  editable_until?: string;  // absent unless author + window open (§5.0)
}

export interface TimelinePage {
  items: Post[];
  page: { next_cursor: string | null; has_more: boolean };
  degraded: boolean;
}
```

`next_cursor` is `string | null` and the invariant from §5.1 endpoint 2 — null exactly when
`has_more` is false — is asserted in the client, not assumed.

---

## 3. Store shape

```ts
status: 'idle' | 'loading-first' | 'ready' | 'loading-more' | 'error'
items: Post[]                  // server-confirmed, descending id (§5.3)
pending: PendingPost[]         // optimistic only; never mixed into items
cursor: string | null
hasMore: boolean
degraded: boolean
draft: string                  // compose box text; the rollback target in §4
error: ApiError | null         // first-page failure: replaces the list
loadMoreError: ApiError | null // page-N failure: list stays rendered
composeError: ApiError | null  // terminal publish failure: entry gone, draft restored

interface PendingPost {
  localId: string;
  text: string;
  idempotencyKey: string;      // §5.4: one per post, reused on every retry of that post
  createdAt: string;
  error?: ApiError;            // retryable publish failure, scoped to THIS entry
}
```

**Error slots are one per user-facing situation, never one per store.** A failed "load more" must
not blank 40 posts the reader is looking at, so `error` and `loadMoreError` are separate and
`error` is only ever set while `items` is empty.

The same argument applies to publishing, and it is the reason `composeError` and `PendingPost.error`
are two different places. A terminal failure removes the entry, so its error has nowhere to live but
the store. A retryable failure *keeps* the entry, so its error belongs on the entry: `pending` is an
array, and a single store-level publish error would let a second compose attempt wipe the message
belonging to a first entry that is still sitting there with a "Try again" button. One slot for an
array is the same mistake as one slot for both page-1 and page-N.

`pending` is a separate array rather than optimistic entries inserted into `items`. That is what
makes §4 work.

---

## 4. The optimistic write racing "load more"

An announced debrief question, so the resolution is designed rather than discovered.

**The claim: they cannot collide, and no cancellation is needed.**

The argument is entirely §5.3's. Pagination is forward-only over *descending* post IDs, and the
cursor is the ID of the last item returned. A "load more" in flight carries a cursor captured
before the write. A newly published post is minted with a *higher* ID than anything already
returned — §3.3 makes IDs time-ordered. So the incoming page contains only IDs below the cursor,
and the new post's ID is above it. §5.3 states the consequence directly: "No duplicates. A post
already returned has an ID ≥ the cursor and cannot appear on a later page."

Therefore:

- `pending` renders above `items`; `loadMore()` only ever **appends** to `items`. Disjoint writes.
- An in-flight `loadMore()` is **not** cancelled when a publish starts. Its result is still correct.
- On publish success the entry moves from `pending` to the **head** of `items`.
- **Dedup guard on reconcile:** if the returned `id` is already present in `items`, drop the pending
  entry instead of inserting it. This is the §5.4 idempotent-replay case — a retry with the same
  `Idempotency-Key` returns 201 with the original body, and without the guard a timed-out-then-
  retried publish would render twice.

**Rollback on failure splits on `retryable`**, because the two cases want opposite things and
collapsing them loses one of them.

- **Terminal** (`retryable: false` — `validation_failed`, `idempotency_key_reuse`): resending cannot
  help, so the optimistic entry is removed from `pending`, the text is restored into the compose box
  so it is not lost, and the `ApiError` renders in `composeError` above the textarea. This is
  "rolls back and tells the user" in SPEC.md's sense.
- **Retryable** (`retryable: true` — `post_service_unavailable`, `idempotency_in_progress`, `429`):
  the entry **stays** in `pending`, marked failed, carrying its own `error` and a "Try again" that
  calls `retryPending(localId)`. Removing it here would contradict the next paragraph: there would
  be nothing left holding the `Idempotency-Key` to retry *with*, and the user would have to retype a
  post the server may already have accepted.

That split is the direct consequence of §5.5 making `retryable` a field rather than something
inferred from the status — the same field that decides whether `ErrorPanel` shows a retry button
decides whether the optimistic entry survives.

Retry reuses the **same `Idempotency-Key`** — §5.4 is explicit that this is what makes an optimistic
UI safe, because on a timeout the client cannot tell whether the post was created.

The key is generated with `crypto.randomUUID()` once per compose attempt and held on the pending
entry, not regenerated per retry.

---

## 5. Error rendering, from the model

`ErrorPanel` takes an `ApiError`, never a string. It renders `message` (§5.5 guarantees it is
already end-user safe), the `code` as a small monospace tag, and `request_id` (§5.5: "Shown in the
UI so a user report is debuggable").

**The retry affordance appears if and only if `error.retryable === true`.** Not inferred from the
status code — §5.5 is explicit that `retryable` is a field precisely because 409 is mixed. Two
consequences worth demonstrating:

- `edit_window_closed` (409, `retryable: false`) renders **with no retry button**. §5.1 endpoint 4:
  "Terminal: retrying never succeeds, and the frontend must say so rather than offering a retry
  button."
- `idempotency_in_progress` (409, `retryable: true`) does get one.

`invalid_cursor` (§5.1 endpoint 2, terminal) gets a **"start over"** action rather than a retry —
the contract says the client restarts at page 1, which is a different action from repeating the
failed request.

Automatic retry lives in `api/http.ts` and nowhere else, per §5.5's closing note: 429 and 503 only,
exponential backoff with jitter, honouring `Retry-After`. Call sites never retry.

---

## 6. Edited indicator and the edit window

**Indicator.** §5.0: "`edit_count > 0` is the edited indicator the frontend renders; it links to
`/posts/{id}/revisions`." So the badge condition is `edit_count > 0` — not `edited_at !== null`,
not `revision > 1`, even though all three happen to coincide. Rendering "Edited ×N", clicking
fetches endpoint 5 and shows the revision list newest-first with revision number, text and
timestamp.

**Edit.** Offered when `post.author.id === VIEWER_ID` **and** `editable_until` is present and in the
future. `editable_until` is advisory (§5.0 — "the server re-checks on `PATCH`"), so the UI treats a
409 as the real answer and does not trust its own clock. `PATCH` sends `If-Match: "<revision>"`
from the `ETag` (§5.1 endpoint 4); 412 `revision_conflict` prompts a re-read rather than silently
overwriting.

---

## 7. The mock

A connect middleware in `vite.config.ts` via `configureServer`. Deterministic seed corpus, fixed
IDs and timestamps so fixtures are reproducible and tests are not time-dependent.

Corpus: ~55 posts across ~8 authors, descending Snowflake-shaped string IDs. At least two with
`edit_count > 0` and revision histories. At least three authored by the viewer, one of which has
`editable_until` still open. One with an image, one without.

Controls, all query parameters so the error path is reachable without editing code (SPEC
requirement, and §5.5 promises exactly this):

| Parameter | Effect |
|---|---|
| `?fault=<code>` | Any row of the §5.5 table — correct status, error body, `Retry-After`, `X-Request-Id` |
| `?fault_on=timeline\|publish\|patch\|revisions` | Which endpoint the fault applies to, so page-1 and load-more failures are separately reachable |
| `?empty=1` | Empty timeline — `items: []`, `has_more: false`, a 200 and not an error (§5.1 endpoint 2) |
| `?degraded=1` | `degraded: true` on the envelope |
| `?latency=<ms>` | Makes loading states observable |

`FaultPanel` is a small always-visible control that sets these, satisfying §5.5's "equivalent
toggle in the UI". It is labelled in the UI as a mock affordance, because §5.5 says it is not part
of the production contract.

Auth: the mock accepts any `Authorization` header and does not validate it. The viewer identity is
a **hardcoded constant** shared by the mock and the client. No `/v1/me`, no auth UI — both out of
scope per SPEC. Stated in the README.

---

## 8. Tests

Vitest, store-level, no browser. Five areas, chosen because they are where state handling actually
breaks. `BUILD-PLAN.md` Tasks 2, 5 and 7 hold the actual cases; this is the shape they cover:

1. **Reconcile** — pending entry replaced by the server `Post`, at the head of `items`, exactly once,
   including the idempotent-replay case where the ID is already present and the entry is dropped
   rather than inserted.
2. **Rollback, both halves of §4** — a terminal failure removes the pending entry, restores the
   draft and sets `composeError`; a retryable failure keeps the entry, sets `entry.error`, and the
   retry reuses the same `Idempotency-Key`. Plus: a second compose attempt must not wipe the error
   on a first entry that is still pending.
3. **The race** — a publish resolving while a `loadMore()` is in flight produces no duplicate and no
   lost post, in both resolution orders, and the in-flight `loadMore()` is not cancelled.
4. **Pagination edges** — paging to `has_more: false` sets `hasMore` false and `cursor` null and
   hides the control; a load-more failure leaves `items` intact, sets `loadMoreError` only, and
   keeps the cursor so a retry is possible; an empty timeline is ready-and-empty, not an error;
   a concurrent `loadMore()` while one is in flight is a no-op.
5. **Error parsing** — the §5.5 error body parses into `ApiError` with `retryable` preserved,
   including `idempotency_in_progress` as a retryable 409, and a non-§5.5-shaped body synthesises a
   contract-shaped error rather than surfacing foreign text.

---

## 9. Build order

Each step is a commit. Nothing is committed without my review first.

1. Scaffold: Vite + Vue 3 + TS, `strict: true`, `npm run typecheck`. Commit the lockfile.
2. `api/types.ts` + `api/errors.ts` — typed straight from §5.0 and §5.5, before any runtime code.
3. `mock/` — corpus, router for endpoint 2, faults. Verify with `curl` that `?fault=` returns the
   §5.5 body.
4. `api/http.ts` + `api/client.ts` — fetch layer, error parsing, backoff.
5. `stores/timeline.ts` — first page, load more, the two error slots.
6. Components: timeline, post, loading/empty/error, degraded banner.
7. Compose + optimistic publish + rollback; mock endpoint 1.
8. Edited indicator + revisions panel; mock endpoint 5.
9. Edit in window + `If-Match`; mock endpoint 4.
10. Vitest cases from §8.
11. `README.md`, then a run through every state in a browser: first load, empty, page-1 error,
    load-more error, degraded, optimistic success, optimistic rollback, edited badge, revisions,
    edit success, `edit_window_closed` with no retry button.

Steps 2 and 3 come before any component so the contract is the first thing written, not the last
thing reconciled.

---

## 10. Known cuts, to be repeated honestly in the README

- No "N new posts" polling, although §5.3 describes the client keeping the newest `id` for it.
- No image upload, no auth UI, no real backend — all excluded by SPEC.
- No silent token refresh, although §5.2 and §5.5 define one.
- Endpoints 3, 6, 7, 8, 9, 10 are unconsumed.
- No browser or component tests; store-level only.
- Styling is plain. Not marked.

---

## 11. Open risks

- **Contract drift.** The single largest risk to the top-weighted mark. Mitigation: `api/types.ts`
  is written directly from §5.0 in step 2 and is the only place field names appear as literals;
  §5 is re-read before each step that touches it. If a mismatch is found, §5 is edited and the
  change is journalled — the document is not quietly bent to fit the code.
- **The race argument depends on ID ordering.** If §3.3 IDs were not time-ordered, §4 collapses.
  It is worth being able to say that out loud rather than presenting the conclusion as obvious.
- **`exactOptionalPropertyTypes`** may prove noisy against Vue's prop types. If it costs more than
  a few minutes it is dropped and the reason recorded here; `strict: true` is the requirement.
