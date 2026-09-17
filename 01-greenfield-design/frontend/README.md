# Chirp — home timeline frontend

A TypeScript home-timeline view for Chirp, built against the API contract in §5 of
[`../DELIVERABLE.md`](../DELIVERABLE.md). It talks to a fixture server that implements that same
contract over real HTTP, so nothing here is a stub written to agree with the client.

Four required behaviours, all present: cursor pagination, loading/empty/error states rendered from
the error model, optimistic post creation with rollback, and an edited indicator. Editing inside
the 15-minute window and the revision-history panel are here too, because the contract specifies
frontend behaviour for both by name.

---

## Install and run

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # Vitest, store and error-model level
npm run typecheck  # vue-tsc --noEmit
npm run build      # typecheck, then a production bundle
```

**Node v26.5.1, npm 11.17.0.** `package-lock.json` is committed; `npm install && npm run dev` works
on a clean checkout. `tsconfig.json` sets `strict: true` plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. There is no `any` anywhere in `src/` or `mock/` — the JSON boundary is
typed `unknown` and narrowed in one place.

---

## Structure, and why

```
frontend/
  mock/                     the fixture server, mounted in the Vite dev server at /v1
    snowflake.ts            ID minting and the cursor codec
    corpus.ts               deterministic seed data: authors, posts, revision histories
    faults.ts               the error table, reachable by query parameter
    router.ts               the four endpoints this view consumes
  src/
    api/types.ts            wire types, transcribed from the contract
    api/errors.ts           the error object and the parser that produces it
    api/http.ts             fetch, auth, idempotency, conditional requests, retry policy
    api/client.ts           one function per consumed endpoint
    api/mockControls.ts     the viewer constant and the fixture query-parameter passthrough
    stores/timeline.ts      all timeline state: pages, pending posts, error slots
    components/*.vue        rendering only
```

**The mock is a connect middleware serving real HTTP, not an in-process fixture layer.** That
choice is the point of the whole directory. An in-process stub makes the error path a code branch;
a real server makes it a real 503 with a real `Retry-After`, a real `X-Request-Id`, and a real
`?fault=` query parameter. The client is then evidence that it satisfies the contract rather than
evidence that it satisfies a fixture written by the same hand, at the same time, to agree with it.

**One Pinia store owns timeline state.** Server-confirmed posts and optimistic posts live in two
separate arrays, which is what makes the publish-versus-pagination race resolvable by reading one
file. A composable would work; a single named owner is easier to inspect and easier to explain.

**Wire names stay snake_case all the way to the template.** `api/types.ts` is the only place a
field name appears as a literal, so a contract that gains or renames a field breaks at compile time
in one file rather than at runtime in five. The single exception is the error object, where
`request_id` becomes `requestId`; that conversion happens inside `parseApiError` and nowhere else.

---

## Which part of the contract each module implements

| Module | Contract section |
|---|---|
| `src/api/types.ts` | §5.0 shared objects (`Post`, `Author`, `PostImage`); the §5.1 endpoint 2 page envelope; the §5.1 endpoint 5 revisions body; the endpoint 1 and 4 request bodies |
| `src/api/errors.ts` | §5.5 error model: `code`, `message`, `retryable`, `request_id`, `details`, and the rule that only 429 and 503 drive an automatic retry |
| `src/api/http.ts` | §5.2 bearer token; §5.4 `Idempotency-Key`; §5.1 endpoint 4 `If-Match`; §5.5 backoff honouring `Retry-After` |
| `src/api/client.ts` | §5.1 endpoints 1, 2, 4 and 5; asserts the §5.1 endpoint 2 invariant that `next_cursor` is null exactly when `has_more` is false |
| `src/stores/timeline.ts` | §5.3 cursor pagination; §5.4 optimistic publish and idempotent replay |
| `src/components/TimelineView.vue` | §5.1 endpoint 2: loading, empty, error and end-of-list states |
| `src/components/ComposeBox.vue` | §5.1 endpoint 1, including its 1–500 code-point counting rule after NFC normalisation |
| `src/components/EditBox.vue` | §5.1 endpoint 4: the window, `If-Match`, and `edit_window_closed` as terminal |
| `src/components/EditedIndicator.vue` | §5.0 `edit_count > 0` |
| `src/components/RevisionsPanel.vue` | §5.1 endpoint 5 |
| `src/components/ErrorPanel.vue` | §5.5: rendered from the error object, never from a string |
| `src/components/DegradedBanner.vue` | §5.1 endpoint 2 `degraded: true` |
| `src/components/FaultPanel.vue` | §5.5's "equivalent toggle in the UI" |
| `mock/router.ts` | The server side of §5.1 endpoints 1, 2, 4 and 5 |
| `mock/snowflake.ts` | §3.3 ID layout; the §5.3 cursor codec |
| `mock/faults.ts` | Every row of the §5.5 status table |
| `mock/corpus.ts` | Fixture data using §12's identifiers |

### Endpoints deliberately not consumed

| # | Endpoint | Why not |
|---|---|---|
| 3 | `GET /v1/posts/{id}` | The timeline already carries the full `Post`; nothing in this view reads one in isolation. |
| 6 | `GET /v1/search` | Search is a different view. |
| 7 | `PUT /v1/users/{id}/follow` | No follow affordance in a timeline view. |
| 8 | `DELETE /v1/users/{id}/follow` | As above. |
| 9 | `DELETE /v1/accounts/me` | Account settings, not the timeline. |
| 10 | `POST /v1/media` | Image upload is out of scope for this build. |

None of these are implemented in the mock either; requesting one returns a 404 in the contract's own
error shape rather than falling through to the dev server's HTML.

Two more parts of the contract are specified and not built, both listed under cuts below: the silent
token refresh on `token_expired` (§5.2) and the "N new posts" poll the client could drive from the
newest ID it already holds (§5.3).

---

## How to trigger the error path

Two ways, neither of which needs a code edit. The **Mock controls** panel at the top of the page
sets these parameters and reloads; or type them in the URL directly.

| Parameter | Effect |
|---|---|
| `?fault=<code>` | Any code in the error table: correct status, error body, `Retry-After`, `X-Request-Id` |
| `?fault_on=timeline\|publish\|patch\|revisions` | Scopes the fault to one endpoint |
| `?fault_after=<n>` | Serve `n` successful responses for that endpoint first, then fail |
| `?empty=1` | Empty timeline: `items: []`, `has_more: false`, HTTP 200 and not an error |
| `?degraded=1` | `degraded: true` on the envelope |
| `?latency=<ms>` | Delay before responding, so loading states are visible |

Copy-pasteable:

```
http://localhost:5173/?fault=timeline_unavailable
    page-1 error, HTTP 503, with a "Try again" button because the response says retryable

http://localhost:5173/?fault=timeline_unavailable&fault_after=1&latency=400
    page 1 loads, then "Load more" fails below an intact list

http://localhost:5173/?fault=edit_window_closed&fault_on=patch
    saving an edit fails with HTTP 409 and NO retry button

http://localhost:5173/?fault=idempotency_in_progress&fault_on=publish
    also a 409, but this one DOES get a retry button
```

The last two are the pair worth looking at together: same status code, opposite affordance, because
the button follows the `retryable` field and never the status.

An unknown `fault` value returns `400 validation_failed` rather than being ignored — a silently
dropped typo would make a failed demo of the error path look like a passing one.

The fault table includes codes belonging to endpoints this view never calls (search, follow,
deletion, media). They are there because the contract promises every code in the table is reachable
without editing code.

---

## What I cut

- **No component or browser tests.** Vitest covers the store and the error parser: pagination
  edges, both halves of rollback, the publish/load-more race in both resolution orders, idempotent
  replay, and error parsing including a non-contract-shaped body. Rendering is verified by hand.
  21 tests.
- **No image upload, no auth UI, no real backend** — all out of scope. The publish request body is
  text only, so the contract's optional `media_id` and `alt` are unused.
- **No silent token refresh**, although the contract defines one on `token_expired`. It overlaps
  the auth UI that is out of scope.
- **No "N new posts" poll.** The store keeps everything needed for it.
- **Six endpoints unconsumed**, listed above.
- **Plain styling.** Not marked, and not worth the time against the other criteria.
- **The viewer identity is a constant**, shared between `api/mockControls.ts` and the corpus. The
  contract puts the viewer in the token's `sub` and defines no endpoint that returns the current
  user; inventing one would be contract drift.
- **The fixture server's clock is pinned to `2026-09-17T10:12:00.000Z`.** The corpus timestamps are
  fixed, so a real clock would shut the edit window on every post before a reviewer ever saw it.
  The pin sits between the two window boundaries in the corpus, so exactly one post is editable
  whenever this is run.
- **The mock fault table is imported by `FaultPanel.vue`, so it ships in `npm run build`.** This app
  has no production deployment — the mock is its only backend — but in a real build the panel and
  that import would be behind a dev-only flag.

Two decisions that read like cuts and are not:

**No optimistic update on edit, unlike publish.** The `editable_until` the client can see is
advisory and the server re-checks it on save, so the response is the only honest answer about
whether the edit landed. Publishing is different: the idempotency key makes an optimistic write
safe to retry, and an edit has no equivalent.

**A retryable publish failure does not roll back.** The brief says an optimistic post "rolls back
and tells the user" on failure, and that is what happens on a *terminal* failure: the entry goes,
the text returns to the compose box, the error renders above it with no retry button. On a
*retryable* failure the entry stays, marked failed, holding its own error and its idempotency key,
with a "Try again" that resends under that same key. Rolling back there would throw away the key —
which is the one thing that makes retrying an ambiguous publish safe — and would make the user
retype a post the server may already have accepted. Each pending entry owns its error, so two
failed publishes show two messages rather than one overwriting the other.

---

## What's next, in order

1. **Component tests for the state matrix.** The store is covered; the mapping from store state to
   rendered output is not, and that is where the next regression will be.
2. **The "N new posts" poll**, driven by the newest ID the store already holds. It is the one piece
   of the pagination design the contract describes and this build does not use.
3. **Real `413` and `415` handling** once image upload exists. Both codes are in the fault table and
   neither has a rendering path that was designed for it.
