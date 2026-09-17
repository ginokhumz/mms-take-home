# Chirp home timeline frontend — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Chirp home-timeline view in TypeScript against §5 of `../DELIVERABLE.md`, with
a mock server implementing that contract, cursor pagination, loading/empty/error states, optimistic
publish with rollback, and an edited indicator.

**Architecture:** Vue 3 + Vite. A connect middleware mounted inside the Vite dev server serves
`/v1/*` over real HTTP from a deterministic fixture corpus, so status codes, `ETag`, `Retry-After`,
`X-Request-Id` and `?fault=` are exercised for real rather than simulated in-process. A single Pinia
store owns timeline state; server-confirmed posts and optimistic posts live in two separate arrays,
which is what makes the publish/`load more` race resolvable in one file.

**Tech Stack:** Node 26.5.1 (npm 11.17.0), TypeScript `strict`, Vue 3 `<script setup>`, Vite, Pinia,
Vitest.

**Spec:** `SPEC.md` (assessment brief) and **`../DELIVERABLE.md` §5 (the API contract — the
authority)**. Design decisions and their rationale live in `PLAN.md` in this directory; this file is
the executable task breakdown of `PLAN.md` §9.

---

## Global Constraints

- **§5 wins every disagreement.** If code and contract diverge, edit §5 deliberately and journal it,
  or fix the code. Never bend one silently to fit the other — contract consistency is the
  highest-weighted mark in `SPEC.md`.
- **`strict: true`** in `tsconfig.json`, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. **No `any` anywhere.** The JSON boundary is typed `unknown` and
  narrowed once, in `api/client.ts`.
- **Every ID is a `string`** (§5.0: 64-bit Snowflakes exceed `Number.MAX_SAFE_INTEGER`).
- **Timestamps** are RFC 3339 UTC with millisecond precision: `2026-09-17T10:00:00.000Z`.
- **`npm install && npm run dev` must work on a clean checkout.** Commit `package-lock.json`.
- **Automatic retry lives only in `api/http.ts`**, for 429 and 503 only (§5.5 closing note). Call
  sites never retry.
- **The retry affordance appears if and only if `error.retryable === true`** — never inferred from
  the status code (§5.5).
- **Fixture identifiers are §12's identifiers.** `grace` = `88213004`, `rob` = `41777219`, post
  `P` = `1827639201234567890`. Reusing them means §12 and the frontend can be read side by side.
- **Never run `git commit` unsolicited** (`CLAUDE.md` rule 4). Each task ends by *proposing* a commit
  message and waiting for approval.
- Out of scope, per `SPEC.md`: styling polish, auth UI, real backend, image upload.

---

## File Structure

```
frontend/
  PLAN.md                   design decisions (already written)
  BUILD-PLAN.md             this file
  README.md                 required by SPEC.md — written in Task 10
  package.json              scripts: dev, build, typecheck, test
  package-lock.json         committed
  tsconfig.json             strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
  vite.config.ts            mounts the mock middleware; Vitest config
  index.html
  mock/
    snowflake.ts            §3.3 ID layout + §5.3 cursor encode/decode
    corpus.ts               deterministic seed: authors, posts, revisions
    faults.ts               §5.5 — ?fault=<code> -> status + error body + headers
    router.ts               §5.1 endpoints 1, 2, 4, 5
  src/
    main.ts
    App.vue
    api/types.ts            §5.0 Post/Author/PostImage; §5.1#2 envelope; §5.1#5 revisions
    api/errors.ts           §5.5 ApiError + parsing/narrowing
    api/http.ts             §5.2 bearer, §5.4 Idempotency-Key, §5.1#4 If-Match, §5.5 backoff
    api/client.ts           one function per consumed endpoint; the only narrowing site
    api/mockControls.ts     reads ?fault=/?empty=/... off location.search (mock-only, flagged)
    stores/timeline.ts      §5.3 pagination, §5.4 optimistic publish
    components/
      TimelineView.vue      list + states + load more
      PostCard.vue          one Post
      ComposeBox.vue        optimistic publish, draft restore
      EditBox.vue           §5.1#4 PATCH inside the window
      EditedIndicator.vue   §5.0 edit_count > 0
      RevisionsPanel.vue    §5.1#5
      ErrorPanel.vue        §5.5 — renders from the model, never a string
      DegradedBanner.vue    §5.1#2 degraded: true
      FaultPanel.vue        mock affordance; sets the query params
  src/stores/timeline.spec.ts   Vitest, store-level (the only tests — see PLAN.md §8)
```

**Files that change together live together:** the mock and the client both encode §5, but they are
split because the mock is dev-only and must not ship into `src/` types. `api/types.ts` is the single
place field-name literals appear; `mock/` imports those same types so a rename breaks both sides at
compile time rather than at runtime.

**On testing:** `SPEC.md` makes tests optional and `PLAN.md` §8 scopes them to store level. So TDD
applies to Tasks 5 and 7 (where state handling actually breaks) and to error parsing in Task 2.
Other tasks are verified by `npm run typecheck`, `curl` against the running mock, and the browser
walkthrough in Task 10. This is a deliberate narrowing of the usual test-first rule, recorded here
so it is a decision rather than a lapse.

---

## Task 1: Scaffold

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`,
  `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.ts`, `frontend/src/App.vue`,
  `frontend/.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run test`; a mounted Pinia
  instance; `#app` root.

- [ ] **Step 1: Create the project**

Run from `01-greenfield-design/frontend/`:

```bash
npm create vite@latest . -- --template vue-ts
npm install
npm install pinia
npm install -D vitest vue-tsc
```

- [ ] **Step 2: Set the compiler options**

`tsconfig.json` — replace the generated app config with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "mock/**/*.ts", "vite.config.ts"]
}
```

If the generated scaffold uses project references (`tsconfig.app.json` / `tsconfig.node.json`),
collapse them into this single config and delete the extras — one config is easier to prove `strict`
from in the debrief.

- [ ] **Step 3: Add the scripts**

In `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "typecheck": "vue-tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Mount Pinia and empty the template**

`src/main.ts`:

```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

createApp(App).use(createPinia()).mount('#app');
```

`src/App.vue`:

```vue
<script setup lang="ts">
</script>

<template>
  <main><h1>Chirp</h1></main>
</template>
```

Delete `src/components/HelloWorld.vue`, `src/style.css` imports and `src/assets/` from the scaffold.

- [ ] **Step 5: Verify it runs and typechecks**

```bash
npm run typecheck
npm run dev
```

Expected: `typecheck` exits 0 with no output; `dev` serves and the page shows "Chirp" with no
console errors. Record the Node version (`node -v` → v26.5.1) for the README.

- [ ] **Step 6: Propose the commit**

Stage nothing. Propose, and wait for approval:

> `1b: scaffold Vite + Vue 3 + TS with strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes`

Confirm `package-lock.json` is in the proposed set and not gitignored.

---

## Task 2: Contract types and the error model

Written before any runtime code, directly from §5.0 and §5.5 — the contract is the first thing in
the repo, not the last thing reconciled.

**Files:**
- Create: `frontend/src/api/types.ts`, `frontend/src/api/errors.ts`
- Test: `frontend/src/api/errors.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PostId = string`, `type UserId = string`
  - `interface Author { id: UserId; handle: string; display_name: string; avatar_url: string }`
  - `interface PostImage { url: string; width: number; height: number; alt: string | null }`
  - `interface Post` (below)
  - `interface TimelinePage { items: Post[]; page: PageInfo; degraded: boolean }`
  - `interface PageInfo { next_cursor: string | null; has_more: boolean }`
  - `interface Revision { revision: number; text: string; created_at: string }`
  - `interface RevisionsResponse { post_id: PostId; revisions: Revision[] }`
  - `class ApiError` with `status: number`, `code: string`, `message: string`, `retryable: boolean`,
    `requestId: string`, `details?: Record<string, unknown>`
  - `function parseApiError(status: number, body: unknown, fallbackRequestId: string): ApiError`

- [ ] **Step 1: Write the types**

`src/api/types.ts`:

```ts
// Every type here is transcribed from ../../DELIVERABLE.md §5. Field names are wire names
// (snake_case) on purpose: renaming them in the client would be the exact contract drift
// SPEC.md marks hardest.

/** §5.0: IDs cross the wire as decimal strings — 2^63 exceeds Number.MAX_SAFE_INTEGER. */
export type PostId = string;
export type UserId = string;

/** §5.0: RFC 3339 UTC, millisecond precision, e.g. 2026-09-17T10:00:00.000Z */
export type Timestamp = string;

export interface Author {
  id: UserId;
  handle: string;
  display_name: string;
  avatar_url: string;
  // §5.0: authors deliberately carry no follower_count — the wide/narrow split is internal.
}

export interface PostImage {
  url: string;
  width: number;
  height: number;
  alt: string | null;
}

export interface Post {
  id: PostId;
  author: Author;
  /** §5.1#1: 1–500 Unicode code points after NFC normalisation. */
  text: string;
  /** §5.0: null when there is no image. Never partially populated — hence one nullable object. */
  image: PostImage | null;
  created_at: Timestamp;
  /** §5.0: 1 on publish, incremented per edit. Also the ETag value (§5.1#4). */
  revision: number;
  edited_at: Timestamp | null;
  /** §5.0: edit_count > 0 IS the edited indicator. */
  edit_count: number;
  /**
   * §5.0: present ONLY when the caller is the author and the 15-minute window is open; absent
   * otherwise. Optional, not nullable — with exactOptionalPropertyTypes that distinction is
   * enforced rather than decorative. Advisory: the server re-checks on PATCH.
   */
  editable_until?: Timestamp;
}

export interface PageInfo {
  /** §5.1#2: null exactly when has_more is false. Opaque to the client (§5.3). */
  next_cursor: string | null;
  has_more: boolean;
}

export interface TimelinePage {
  items: Post[];
  page: PageInfo;
  /** §5.1#2: push set unavailable, served from the pull path alone. A banner, not an error. */
  degraded: boolean;
}

export interface Revision {
  revision: number;
  text: string;
  created_at: Timestamp;
}

export interface RevisionsResponse {
  post_id: PostId;
  revisions: Revision[];
}

/** §5.1#1 request body. `media_id`/`alt` omitted: image upload is out of scope per SPEC.md. */
export interface PublishRequest {
  text: string;
}

/** §5.1#4 request body. Text only — §1.3, the image cannot be swapped. */
export interface EditRequest {
  text: string;
}
```

- [ ] **Step 2: Write the failing test for the error model**

`src/api/errors.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError, parseApiError } from './errors';

const wire = {
  error: {
    code: 'edit_window_closed',
    message: 'This post can no longer be edited.',
    retryable: false,
    request_id: '01J9X2K3M4N5P6Q7R8S9T0',
    details: { editable_until: '2026-09-17T10:15:00.000Z' },
  },
};

describe('parseApiError', () => {
  it('preserves every §5.5 field, retryable included', () => {
    const err = parseApiError(409, wire, 'fallback-id');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('edit_window_closed');
    expect(err.message).toBe('This post can no longer be edited.');
    expect(err.retryable).toBe(false);
    expect(err.requestId).toBe('01J9X2K3M4N5P6Q7R8S9T0');
    expect(err.details).toEqual({ editable_until: '2026-09-17T10:15:00.000Z' });
  });

  it('keeps retryable true for idempotency_in_progress — a retryable 409', () => {
    const body = { error: { code: 'idempotency_in_progress', message: 'Try again.', retryable: true, request_id: 'r1' } };
    expect(parseApiError(409, body, 'fallback-id').retryable).toBe(true);
  });

  it('synthesises a §5.5-shaped error when the body is not §5.5-shaped', () => {
    const err = parseApiError(502, '<html>gateway</html>', 'x-req-7');
    expect(err.code).toBe('internal_error');
    expect(err.retryable).toBe(true); // 502: transport-level, safe to retry
    expect(err.requestId).toBe('x-req-7');
    expect(err.message).not.toContain('<html>');
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
npm run test -- src/api/errors.spec.ts
```

Expected: FAIL — `Failed to resolve import "./errors"`.

- [ ] **Step 4: Implement the error model**

`src/api/errors.ts`:

```ts
/**
 * §5.5: every non-2xx response carries { error: { code, message, retryable, request_id, details? } }
 * and nothing else ever appears in an error position. The frontend switches on `code`, never on
 * `message`, and shows a retry affordance if and only if `retryable` is true.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string;
  readonly details?: Record<string, unknown>;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.retryable = init.retryable;
    this.requestId = init.requestId;
    if (init.details !== undefined) this.details = init.details;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Narrows an unknown response body into an ApiError. A body that is not §5.5-shaped means
 * something outside the contract answered (a proxy, a crash), so we synthesise the contract's
 * own unclassified code rather than surfacing foreign text to the user.
 */
export function parseApiError(status: number, body: unknown, fallbackRequestId: string): ApiError {
  if (isRecord(body) && isRecord(body['error'])) {
    const e = body['error'];
    const code = typeof e['code'] === 'string' ? e['code'] : 'internal_error';
    const message =
      typeof e['message'] === 'string' ? e['message'] : 'Something went wrong. Please try again.';
    // Fallback only if the server omitted the field, which §5.5 says never happens. It must match
    // the fallback below: 429 is retryable per §5.5, so `status >= 500` alone would be wrong.
    const retryable =
      typeof e['retryable'] === 'boolean' ? e['retryable'] : status === 429 || status >= 500;
    const requestId = typeof e['request_id'] === 'string' ? e['request_id'] : fallbackRequestId;
    const details = isRecord(e['details']) ? e['details'] : undefined;
    return new ApiError(
      details === undefined
        ? { status, code, message, retryable, requestId }
        : { status, code, message, retryable, requestId, details },
    );
  }

  return new ApiError({
    status,
    code: 'internal_error',
    message: 'Something went wrong. Please try again.',
    retryable: status === 429 || status >= 500,
    requestId: fallbackRequestId,
  });
}

/** §5.5: only 429 and 503 should ever drive an automatic retry. */
export function isAutoRetryable(err: ApiError): boolean {
  return err.retryable && (err.status === 429 || err.status === 503);
}
```

- [ ] **Step 5: Run the tests and the typechecker**

```bash
npm run test -- src/api/errors.spec.ts
npm run typecheck
```

Expected: 3 tests PASS; typecheck exits 0.

- [ ] **Step 6: Propose the commit**

> `1b: types and error model transcribed from DELIVERABLE §5.0 and §5.5`

---

## Task 3: The mock — corpus, faults, timeline endpoint

**Files:**
- Create: `frontend/mock/snowflake.ts`, `frontend/mock/corpus.ts`, `frontend/mock/faults.ts`,
  `frontend/mock/router.ts`
- Modify: `frontend/vite.config.ts`

**Interfaces:**
- Consumes: `src/api/types.ts` (`Post`, `TimelinePage`, `RevisionsResponse`).
- Produces:
  - `mock/snowflake.ts`: `snowflake(iso: string, shard?: number, seq?: number): string`,
    `encodeCursor(id: string): string`, `decodeCursor(c: string): string | null`
  - `mock/corpus.ts`: `VIEWER: Author`, `posts: Post[]` (descending `id`),
    `revisions: Map<PostId, Revision[]>`
  - `mock/faults.ts`: `maybeFault(url: URL, endpoint: FaultTarget): FaultResponse | null`
  - `mock/router.ts`: `chirpMock(): Plugin` (a Vite plugin using `configureServer`)

- [ ] **Step 1: Snowflake IDs and cursors**

`mock/snowflake.ts`. The layout and epoch are §3.3's, and the §12.0 arithmetic is the test:
`1827639201234567890 >> 22 = 435743141468` ms after the epoch `2012-11-26T02:14:18.532Z`, which is
`2026-09-17T10:00:00.000Z`.

```ts
const EPOCH_MS = Date.UTC(2012, 10, 26, 2, 14, 18, 532); // §3.3 service epoch

/** §3.3: (ms since epoch << 22) | (shard << 12) | sequence. Returned as a string (§5.0). */
export function snowflake(iso: string, shard = 676, seq = 722): string {
  const ms = BigInt(Date.parse(iso) - EPOCH_MS);
  return ((ms << 22n) | (BigInt(shard) << 12n) | BigInt(seq)).toString();
}

/** §5.3: opaque base64url of {"v":1,"b":"<post_id>"} — the ID of the last item returned. */
export function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ v: 1, b: id })).toString('base64url');
}

/** Returns the boundary post ID, or null if the cursor is malformed (§5.1#2 invalid_cursor). */
export function decodeCursor(cursor: string): string | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    if (rec['v'] !== 1 || typeof rec['b'] !== 'string' || !/^\d+$/.test(rec['b'])) return null;
    return rec['b'];
  } catch {
    return null;
  }
}
```

Sanity-check in the shell before moving on:

```bash
node -e "const{snowflake,encodeCursor}=await import('./mock/snowflake.ts');" # if ts loader unavailable, check in Task 3 Step 6 via curl instead
```

The binding assertion to hold: `snowflake('2026-09-17T10:00:00.000Z')` must equal
`1827639201234567890`, and `encodeCursor('1827639201234567890')` must equal
`eyJ2IjoxLCJiIjoiMTgyNzYzOTIwMTIzNDU2Nzg5MCJ9` — both are §12.0's literal values. If they differ,
the epoch or the field widths are wrong; fix them here, not later.

- [ ] **Step 2: The corpus**

`mock/corpus.ts`. Deterministic, fixed timestamps, no `Date.now()` — tests must not be
time-dependent. Requirements the later tasks depend on:

- **~55 posts** across 8 authors, `id` strictly descending, one minute apart walking backwards from
  `2026-09-17T10:00:00.000Z`.
- **`grace` (`88213004`)** holds post `P` = `1827639201234567890` at `10:00:00.000Z` with
  `revision: 2`, `edit_count: 1`, `edited_at: '2026-09-17T10:10:00.000Z'` and a two-entry revision
  history — the §12 post, already edited.
- **`newsdesk` (`90112233`)** holds a second edited post (`edit_count: 2`) so the indicator is
  visible more than once.
- **The viewer is `rob` (`41777219`, handle `rob`)**, author of three posts. Exactly one of them
  carries `editable_until` **open**: set `created_at` to `2026-09-17T09:59:00.000Z` and
  `editable_until` to `2026-09-17T10:14:00.000Z`. The other two omit the field entirely (window
  closed) so the "no edit affordance" case is also visible.
- One post with an `image` (`1280×720`, `alt: null`), the rest `image: null`.

```ts
import type { Author, Post, PostId, Revision } from '../src/api/types';
import { snowflake } from './snowflake';

/**
 * The viewer. Hardcoded and shared with the client via src/api/mockControls.ts: §5 has no /v1/me,
 * and inventing an endpoint the contract does not define would be exactly the drift SPEC.md marks.
 * Auth UI is out of scope, so there is nothing to derive an identity from.
 */
export const VIEWER: Author = {
  id: '41777219',
  handle: 'rob',
  display_name: 'Rob',
  avatar_url: 'https://cdn.chirp.example/a/41777219/64.webp',
};
```

Build the list with a helper so the fields cannot drift post to post:

```ts
interface Seed {
  author: Author;
  at: string;              // ISO, ms precision
  text: string;
  shard?: number;
  image?: Post['image'];
  edits?: Array<{ at: string; text: string }>; // oldest first; drives revision/edit_count
  editableUntil?: string;
}

function build(seed: Seed): { post: Post; revisions: Revision[] } {
  const id: PostId = snowflake(seed.at, seed.shard ?? 676);
  const edits = seed.edits ?? [];
  const history: Revision[] = [{ revision: 1, text: seed.text, created_at: seed.at }];
  edits.forEach((e, i) => history.push({ revision: i + 2, text: e.text, created_at: e.at }));
  const current = history[history.length - 1]!;
  const last = edits[edits.length - 1];
  const post: Post = {
    id,
    author: seed.author,
    text: current.text,
    image: seed.image ?? null,
    created_at: seed.at,
    revision: current.revision,
    edited_at: last ? last.at : null,
    edit_count: edits.length,
    ...(seed.editableUntil !== undefined ? { editable_until: seed.editableUntil } : {}),
  };
  return { post, revisions: history.slice().reverse() }; // §5.1#5: newest first
}
```

Export `posts` sorted by `id` descending (string IDs of equal length compare correctly, but sort
with `BigInt` comparison to be honest about it) and `revisions` as a `Map<PostId, Revision[]>`.

- [ ] **Step 3: Faults**

`mock/faults.ts`. Every row of §5.5's table reachable by query parameter, with the status, the error
body, and the headers that row promises.

```ts
export type FaultTarget = 'timeline' | 'publish' | 'patch' | 'revisions';

interface FaultSpec {
  status: number;
  message: string;
  retryable: boolean;
  retryAfter?: number;                    // seconds; §5.5 requires it on 429 and 503
  details?: Record<string, unknown>;
}

/** Keys are the §5.5 `code` enum. Adding a row here is the only way to add a reachable fault. */
export const FAULTS: Record<string, FaultSpec> = {
  validation_failed:        { status: 400, message: 'Your post must be between 1 and 500 characters.', retryable: false },
  invalid_cursor:           { status: 400, message: 'This page link is no longer valid. Start from the top.', retryable: false },
  unauthenticated:          { status: 401, message: 'Please sign in again.', retryable: false },
  token_expired:            { status: 401, message: 'Your session expired.', retryable: false },
  not_author:               { status: 403, message: 'You can only edit your own posts.', retryable: false },
  post_not_found:           { status: 404, message: 'This post is no longer available.', retryable: false },
  edit_window_closed:       { status: 409, message: 'This post can no longer be edited.', retryable: false, details: { editable_until: '2026-09-17T10:15:00.000Z' } },
  idempotency_in_progress:  { status: 409, message: 'Still publishing. Try again in a moment.', retryable: true, retryAfter: 1 },
  idempotency_key_reuse:    { status: 409, message: 'This post was already published.', retryable: false },
  revision_conflict:        { status: 412, message: 'This post changed since you opened it. Reload to see the latest version.', retryable: false },
  rate_limited:             { status: 429, message: 'You are posting too quickly. Please wait.', retryable: true, retryAfter: 2, details: { limit: 300, reset_at: '2026-09-17T11:00:00.000Z' } },
  internal_error:           { status: 500, message: 'Something went wrong. Please try again.', retryable: true },
  post_service_unavailable: { status: 503, message: 'Posting is temporarily unavailable.', retryable: true, retryAfter: 2 },
  timeline_unavailable:     { status: 503, message: 'Your timeline is temporarily unavailable.', retryable: true, retryAfter: 2 },
};
```

`maybeFault(url, endpoint)` returns a response only when `url.searchParams.get('fault')` names a
known code **and** `fault_on` is absent or equals `endpoint`. The body is the §5.5 envelope; set
`X-Request-Id` to the same value as `error.request_id` (§5.5 says they are echoes of each other) and
`Retry-After` when the spec has one. An unknown `fault` value must return
`400 validation_failed` — silently ignoring a typo would make a failed error-path demo look like a
passing one.

Also honour, all as query parameters (SPEC: the error path must be reachable without editing code):

| Parameter | Effect |
|---|---|
| `?fault=<code>` | Any row above, with correct status, body and headers |
| `?fault_on=timeline\|publish\|patch\|revisions` | Which endpoint the fault applies to |
| `?fault_after=<n>` | Serve `n` successful pages first, then fault — how the *load-more* failure is reached |
| `?empty=1` | `items: []`, `has_more: false`, `next_cursor: null`, status **200** (§5.1#2: not an error) |
| `?degraded=1` | `degraded: true` on the envelope |
| `?latency=<ms>` | Delay before responding, so loading states are observable |

- [ ] **Step 4: The router, endpoint 2 only**

`mock/router.ts` exports a Vite plugin:

```ts
import type { Plugin } from 'vite';

export function chirpMock(): Plugin {
  return {
    name: 'chirp-mock',
    configureServer(server) {
      server.middlewares.use('/v1', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        // ... latency, fault check, then route on req.method + url.pathname
      });
    },
  };
}
```

`GET /v1/timeline/home`:

1. `limit` = `Number(url.searchParams.get('limit') ?? 20)`; reject outside 1–100 with
   `400 validation_failed`.
2. No `cursor` → slice from index 0. With a `cursor` → `decodeCursor`; `null` result is
   `400 invalid_cursor`; otherwise take posts with `BigInt(id) < BigInt(boundary)` (§5.3:
   strictly less than, which is what makes duplicates impossible).
3. `items` = the first `limit` of that slice. `has_more` = more remain.
   **`next_cursor` = `encodeCursor(last item id)` when `has_more`, and `null` otherwise** — §5.1#2's
   invariant, asserted here so the client can rely on it.
4. `degraded` from the query parameter.
5. Set `ETag: "<revision>"` only on single-post responses, not on the page (§5.1#4 attaches it to
   `Post` reads).

- [ ] **Step 5: Mount it**

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chirpMock } from './mock/router';

export default defineConfig({
  plugins: [vue(), chirpMock()],
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
});
```

- [ ] **Step 6: Verify the mock over real HTTP**

With `npm run dev` running:

```bash
curl -s 'http://localhost:5173/v1/timeline/home?limit=2' | head -c 400
curl -s 'http://localhost:5173/v1/timeline/home?limit=2' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['page'], d['degraded'], len(d['items']))"
curl -s 'http://localhost:5173/v1/timeline/home?empty=1' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['items'], d['page'])"
curl -si 'http://localhost:5173/v1/timeline/home?fault=timeline_unavailable' | head -20
curl -s 'http://localhost:5173/v1/timeline/home?cursor=not-a-cursor' | python3 -m json.tool
```

Expected, checked one by one:
- First call: 2 items, newest is `1827639201234567890` with `revision: 2`, `edit_count: 1`.
- `page.next_cursor` is a base64url string and `has_more` is `true`.
- `?empty=1`: HTTP **200**, `items: []`, `has_more: false`, `next_cursor: null`.
- `?fault=timeline_unavailable`: HTTP **503**, `Retry-After: 2`, `X-Request-Id` present and equal to
  `error.request_id`, `error.retryable: true`.
- Bad cursor: HTTP **400**, `error.code: "invalid_cursor"`, `retryable: false`.

Then walk the cursor by hand and confirm no overlap:

```bash
C=$(curl -s 'http://localhost:5173/v1/timeline/home?limit=5' | python3 -c "import json,sys;print(json.load(sys.stdin)['page']['next_cursor'])")
curl -s "http://localhost:5173/v1/timeline/home?limit=5&cursor=$C" | python3 -c "import json,sys;print([p['id'] for p in json.load(sys.stdin)['items']])"
```

Expected: the second page's IDs are all strictly smaller than the first page's last ID.

- [ ] **Step 7: Propose the commit**

> `1b: mock server for DELIVERABLE §5.1 endpoint 2, with §5.5 faults reachable by query param`

---

## Task 4: HTTP layer and API client

**Files:**
- Create: `frontend/src/api/mockControls.ts`, `frontend/src/api/http.ts`, `frontend/src/api/client.ts`

**Interfaces:**
- Consumes: `types.ts`, `errors.ts` (`ApiError`, `parseApiError`, `isAutoRetryable`).
- Produces:
  - `mockControls.ts`: `VIEWER_ID: UserId` (`'41777219'`), `passthroughParams(): URLSearchParams`
  - `http.ts`: `request<T>(method, path, opts): Promise<{ data: T; etag: string | null }>`
  - `client.ts`: `getHomeTimeline(opts: { limit?: number; cursor?: string | null }): Promise<TimelinePage>`,
    `publishPost(body: PublishRequest, idempotencyKey: string): Promise<Post>`,
    `editPost(id: PostId, body: EditRequest, ifMatchRevision: number): Promise<Post>`,
    `getRevisions(id: PostId): Promise<RevisionsResponse>`

- [ ] **Step 1: Mock controls, isolated and labelled**

`src/api/mockControls.ts`:

```ts
import type { UserId } from './types';

/**
 * §5.2 puts the viewer identity in the access token's `sub`. Auth UI is out of scope (SPEC.md),
 * and §5 defines no /v1/me, so the identity is a constant shared with mock/corpus.ts.
 */
export const VIEWER_ID: UserId = '41777219';

const MOCK_KEYS = ['fault', 'fault_on', 'fault_after', 'empty', 'degraded', 'latency'] as const;

/**
 * Mock affordance only — §5.5 is explicit that `?fault=` is not part of the production contract.
 * Forwarding the page's own query string onto API calls is what lets the error path be triggered
 * from the URL or from FaultPanel without editing code.
 */
export function passthroughParams(): URLSearchParams {
  const from = new URLSearchParams(window.location.search);
  const out = new URLSearchParams();
  for (const k of MOCK_KEYS) {
    const v = from.get(k);
    if (v !== null) out.set(k, v);
  }
  return out;
}
```

- [ ] **Step 2: The fetch layer**

`src/api/http.ts`. Everything §5 says belongs in one HTTP layer lives here and nowhere else.

```ts
import { ApiError, isAutoRetryable, parseApiError } from './errors';
import { passthroughParams } from './mockControls';

const BASE = '/v1';

/**
 * §5.2: a bearer token on every call. Auth UI is out of scope, so a placeholder is present —
 * the mock does not validate it. Held in a module constant, never localStorage (§5.2, §9).
 */
const ACCESS_TOKEN = 'mock-access-token';

const MAX_ATTEMPTS = 3;

export interface RequestOptions {
  query?: URLSearchParams;
  body?: unknown;
  /** §5.4: required on POST /v1/posts, and reused verbatim on every retry of that post. */
  idempotencyKey?: string;
  /** §5.1#4: the revision the client believes it is editing, sent as an ETag. */
  ifMatchRevision?: number;
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  opts: RequestOptions = {},
): Promise<{ data: T; etag: string | null }> {
  const url = new URL(BASE + path, window.location.origin);
  for (const [k, v] of opts.query ?? []) url.searchParams.set(k, v);
  for (const [k, v] of passthroughParams()) url.searchParams.set(k, v);

  const headers: Record<string, string> = { Authorization: `Bearer ${ACCESS_TOKEN}` };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey !== undefined) headers['Idempotency-Key'] = opts.idempotencyKey;
  if (opts.ifMatchRevision !== undefined) headers['If-Match'] = `"${opts.ifMatchRevision}"`;

  let lastError: ApiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch {
      // Network failure: no response, so no §5.5 body exists to parse. Synthesise one.
      lastError = new ApiError({
        status: 503,
        code: 'timeline_unavailable',
        message: 'Cannot reach Chirp. Check your connection.',
        retryable: true,
        requestId: 'local-network-error',
      });
      if (attempt < MAX_ATTEMPTS) { await backoff(attempt, null); continue; }
      throw lastError;
    }

    const requestId = res.headers.get('X-Request-Id') ?? 'unknown';

    if (res.ok) {
      const data = (await res.json()) as T; // narrowed by the caller in client.ts
      return { data, etag: res.headers.get('ETag') };
    }

    const body: unknown = await res.json().catch(() => null);
    lastError = parseApiError(res.status, body, requestId);

    // §5.5: 429 and 503 are the only codes that drive an automatic retry, and the backoff lives
    // here rather than at each call site.
    if (isAutoRetryable(lastError) && attempt < MAX_ATTEMPTS) {
      await backoff(attempt, res.headers.get('Retry-After'));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error('unreachable');
}

/** Exponential with jitter, honouring Retry-After when the server sent one (§5.5). */
async function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  const serverMs = retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
  const ms = Math.max(serverMs, 2 ** (attempt - 1) * 250 + Math.random() * 250);
  await new Promise((r) => setTimeout(r, ms));
}
```

Note in a comment that automatic retry of `POST /v1/posts` is safe **only** because the same
`Idempotency-Key` is sent on every attempt (§5.4) — the retry loop above is what makes that
non-optional.

- [ ] **Step 3: The client**

`src/api/client.ts` — one function per consumed endpoint, and the only place a wire body becomes a
typed object.

```ts
import { request } from './http';
import { ApiError } from './errors';
import type { EditRequest, Post, PostId, PublishRequest, RevisionsResponse, TimelinePage } from './types';

/** §5.1#2 */
export async function getHomeTimeline(opts: { limit?: number; cursor?: string | null } = {}): Promise<TimelinePage> {
  const query = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  if (opts.cursor != null) query.set('cursor', opts.cursor);
  const { data } = await request<TimelinePage>('GET', '/timeline/home', { query });

  // §5.1#2 states next_cursor is null exactly when has_more is false. Asserted, not assumed:
  // a server that breaks this invariant would make the store loop or stall silently.
  if (data.page.has_more === (data.page.next_cursor === null)) {
    throw new ApiError({
      status: 502,
      code: 'internal_error',
      message: 'The timeline could not be loaded.',
      retryable: true,
      requestId: 'contract-violation',
    });
  }
  return data;
}

/** §5.1#1 — the Idempotency-Key is the caller's, reused across retries of the same post (§5.4). */
export async function publishPost(body: PublishRequest, idempotencyKey: string): Promise<Post> {
  const { data } = await request<Post>('POST', '/posts', { body, idempotencyKey });
  return data;
}

/**
 * §5.1#4. If-Match carries the revision as an ETag. Derived from `post.revision` rather than
 * stored from the response header, because §5.1#4 defines the ETag as exactly "<revision>" — one
 * source of truth, and the store already holds the Post.
 */
export async function editPost(id: PostId, body: EditRequest, ifMatchRevision: number): Promise<Post> {
  const { data } = await request<Post>('PATCH', `/posts/${id}`, { body, ifMatchRevision });
  return data;
}

/** §5.1#5 — public, newest first, no pagination. */
export async function getRevisions(id: PostId): Promise<RevisionsResponse> {
  const { data } = await request<RevisionsResponse>('GET', `/posts/${id}/revisions`);
  return data;
}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
```

Expected: exits 0, no `any` introduced. Grep to prove it:

```bash
grep -rn ": any\|as any\|<any>" src/ mock/ || echo "no any"
```

- [ ] **Step 5: Propose the commit**

> `1b: HTTP layer with §5.5 backoff, §5.4 idempotency and §5.1#4 If-Match, plus the typed client`

---

## Task 5: Timeline store — first page and pagination

Test-first: this is where pagination edges break.

**Files:**
- Create: `frontend/src/stores/timeline.ts`
- Test: `frontend/src/stores/timeline.spec.ts`

**Interfaces:**
- Consumes: `api/client.ts`, `api/types.ts`, `api/errors.ts`.
- Produces `useTimelineStore()` with state:
  `status: 'idle' | 'loading-first' | 'ready' | 'loading-more' | 'error'`, `items: Post[]`,
  `pending: PendingPost[]`, `cursor: string | null`, `hasMore: boolean`, `degraded: boolean`,
  `error: ApiError | null`, `loadMoreError: ApiError | null`, `draft: string`;
  actions `loadFirstPage()`, `loadMore()`, `restart()`.
  `interface PendingPost { localId: string; text: string; idempotencyKey: string; createdAt: string; error?: ApiError }`
  (`error` is unused until Task 7; it is declared here so `PendingPost` is written once.)

- [ ] **Step 1: Write the failing pagination tests**

`src/stores/timeline.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '../api/errors';
import type { Post, TimelinePage } from '../api/types';

vi.mock('../api/client', () => ({
  getHomeTimeline: vi.fn(),
  publishPost: vi.fn(),
  editPost: vi.fn(),
  getRevisions: vi.fn(),
}));

import * as client from '../api/client';
import { useTimelineStore } from './timeline';

function post(id: string): Post {
  return {
    id,
    author: { id: '88213004', handle: 'grace', display_name: 'Grace', avatar_url: 'https://cdn/a.webp' },
    text: `post ${id}`,
    image: null,
    created_at: '2026-09-17T10:00:00.000Z',
    revision: 1,
    edited_at: null,
    edit_count: 0,
  };
}

function page(ids: string[], next: string | null): TimelinePage {
  return { items: ids.map(post), page: { next_cursor: next, has_more: next !== null }, degraded: false };
}

const unavailable = new ApiError({
  status: 503,
  code: 'timeline_unavailable',
  message: 'Your timeline is temporarily unavailable.',
  retryable: true,
  requestId: 'req-1',
});

describe('timeline store — pagination', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(client.getHomeTimeline).mockReset();
  });

  it('loads the first page and exposes the cursor', async () => {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(['300', '200'], 'cur-200'));
    const s = useTimelineStore();
    await s.loadFirstPage();
    expect(s.status).toBe('ready');
    expect(s.items.map((p) => p.id)).toEqual(['300', '200']);
    expect(s.cursor).toBe('cur-200');
    expect(s.hasMore).toBe(true);
  });

  it('appends the next page and passes the cursor through', async () => {
    vi.mocked(client.getHomeTimeline)
      .mockResolvedValueOnce(page(['300', '200'], 'cur-200'))
      .mockResolvedValueOnce(page(['100'], null));
    const s = useTimelineStore();
    await s.loadFirstPage();
    await s.loadMore();
    expect(vi.mocked(client.getHomeTimeline).mock.calls[1]?.[0]).toMatchObject({ cursor: 'cur-200' });
    expect(s.items.map((p) => p.id)).toEqual(['300', '200', '100']);
  });

  it('stops at the end: has_more false sets hasMore false and cursor null', async () => {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(['300'], null));
    const s = useTimelineStore();
    await s.loadFirstPage();
    expect(s.hasMore).toBe(false);
    expect(s.cursor).toBeNull();
    expect(s.canLoadMore).toBe(false);
  });

  it('an empty timeline is ready-and-empty, not an error (§5.1#2)', async () => {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page([], null));
    const s = useTimelineStore();
    await s.loadFirstPage();
    expect(s.status).toBe('ready');
    expect(s.isEmpty).toBe(true);
    expect(s.error).toBeNull();
  });

  it('a first-page failure sets error and leaves the list empty', async () => {
    vi.mocked(client.getHomeTimeline).mockRejectedValueOnce(unavailable);
    const s = useTimelineStore();
    await s.loadFirstPage();
    expect(s.status).toBe('error');
    expect(s.error?.code).toBe('timeline_unavailable');
    expect(s.items).toEqual([]);
  });

  it('a load-more failure keeps the rendered list and sets only loadMoreError', async () => {
    vi.mocked(client.getHomeTimeline)
      .mockResolvedValueOnce(page(['300', '200'], 'cur-200'))
      .mockRejectedValueOnce(unavailable);
    const s = useTimelineStore();
    await s.loadFirstPage();
    await s.loadMore();
    expect(s.items.map((p) => p.id)).toEqual(['300', '200']);
    expect(s.error).toBeNull();
    expect(s.loadMoreError?.code).toBe('timeline_unavailable');
    expect(s.status).toBe('ready');
    expect(s.cursor).toBe('cur-200'); // retryable: the cursor must survive the failure
  });

  it('invalid_cursor clears the list and restarts from page 1', async () => {
    const invalid = new ApiError({
      status: 400, code: 'invalid_cursor', message: 'This page link is no longer valid.',
      retryable: false, requestId: 'req-2',
    });
    vi.mocked(client.getHomeTimeline)
      .mockResolvedValueOnce(page(['300'], 'cur-300'))
      .mockRejectedValueOnce(invalid)
      .mockResolvedValueOnce(page(['400', '300'], 'cur-300'));
    const s = useTimelineStore();
    await s.loadFirstPage();
    await s.loadMore();
    expect(s.loadMoreError?.code).toBe('invalid_cursor');
    await s.restart();
    expect(s.items.map((p) => p.id)).toEqual(['400', '300']);
    expect(s.loadMoreError).toBeNull();
  });

  it('ignores a concurrent loadMore while one is in flight', async () => {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(['300'], 'cur-300'));
    const s = useTimelineStore();
    await s.loadFirstPage();
    let release: ((v: TimelinePage) => void) | undefined;
    vi.mocked(client.getHomeTimeline).mockReturnValueOnce(new Promise((r) => { release = r; }));
    const first = s.loadMore();
    await s.loadMore(); // must be a no-op
    release?.(page(['200'], null));
    await first;
    expect(vi.mocked(client.getHomeTimeline)).toHaveBeenCalledTimes(2);
    expect(s.items.map((p) => p.id)).toEqual(['300', '200']);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

```bash
npm run test -- src/stores/timeline.spec.ts
```

Expected: FAIL — `Failed to resolve import "./timeline"`.

- [ ] **Step 3: Implement the store**

`src/stores/timeline.ts`:

```ts
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { getHomeTimeline } from '../api/client';
import { ApiError } from '../api/errors';
import type { Post } from '../api/types';

export interface PendingPost {
  localId: string;
  text: string;
  /** §5.4: generated once per compose attempt and reused on every retry of that post. */
  idempotencyKey: string;
  createdAt: string;
  /**
   * A *retryable* publish failure for THIS entry (PLAN.md §4). It lives on the entry and not on
   * the store because `pending` is an array: a store-level slot would let a second compose attempt
   * wipe the message belonging to a first entry that is still pending with a "Try again" button.
   * Terminal failures remove the entry, so their error goes to `composeError` instead.
   */
  error?: ApiError;
}

// §5.1#2: `limit` is 1–100, default 20. 20 is also the page size §2 and §7.1 cost the read path
// against, so the frontend asks for exactly what the capacity work assumed.
const PAGE_LIMIT = 20;

export const useTimelineStore = defineStore('timeline', () => {
  const status = ref<'idle' | 'loading-first' | 'ready' | 'loading-more' | 'error'>('idle');
  const items = ref<Post[]>([]);          // server-confirmed, descending id (§5.3)
  const pending = ref<PendingPost[]>([]); // optimistic only; never mixed into items
  const cursor = ref<string | null>(null);
  const hasMore = ref(false);
  const degraded = ref(false);
  /** First-page failure: replaces the list. Only ever set while items is empty. */
  const error = ref<ApiError | null>(null);
  /** Page-N failure: the list stays rendered. Two slots, deliberately — see PLAN.md §3. */
  const loadMoreError = ref<ApiError | null>(null);
  const draft = ref('');

  const isEmpty = computed(() => status.value === 'ready' && items.value.length === 0 && pending.value.length === 0);
  const canLoadMore = computed(() => hasMore.value && cursor.value !== null && status.value !== 'loading-more');

  async function loadFirstPage(): Promise<void> {
    status.value = 'loading-first';
    error.value = null;
    loadMoreError.value = null;
    try {
      const page = await getHomeTimeline({ limit: PAGE_LIMIT });
      items.value = page.items;
      cursor.value = page.page.next_cursor;
      hasMore.value = page.page.has_more;
      degraded.value = page.degraded;
      status.value = 'ready';
    } catch (e) {
      error.value = asApiError(e);
      items.value = [];
      status.value = 'error';
    }
  }

  async function loadMore(): Promise<void> {
    if (!canLoadMore.value) return;
    const from = cursor.value;
    status.value = 'loading-more';
    loadMoreError.value = null;
    try {
      const page = await getHomeTimeline({ limit: PAGE_LIMIT, cursor: from });
      // §5.3: pagination is forward-only over descending IDs, so this is append-only. A post
      // already returned has an ID >= the cursor and cannot appear on a later page.
      items.value = items.value.concat(page.items);
      cursor.value = page.page.next_cursor;
      hasMore.value = page.page.has_more;
      degraded.value = page.degraded;
    } catch (e) {
      // The cursor is NOT cleared: on a retryable failure the same cursor is still correct.
      loadMoreError.value = asApiError(e);
    } finally {
      status.value = 'ready';
    }
  }

  /** §5.1#2: invalid_cursor is terminal — the client restarts at page 1, which is a different
   *  action from retrying the failed request. */
  async function restart(): Promise<void> {
    items.value = [];
    cursor.value = null;
    hasMore.value = false;
    loadMoreError.value = null;
    await loadFirstPage();
  }

  return { status, items, pending, cursor, hasMore, degraded, error, loadMoreError, draft,
           isEmpty, canLoadMore, loadFirstPage, loadMore, restart };
});

function asApiError(e: unknown): ApiError {
  return e instanceof ApiError
    ? e
    : new ApiError({ status: 500, code: 'internal_error', message: 'Something went wrong. Please try again.', retryable: true, requestId: 'local' });
}
```

- [ ] **Step 4: Run the tests**

```bash
npm run test -- src/stores/timeline.spec.ts
npm run typecheck
```

Expected: 8 tests PASS; typecheck exits 0.

- [ ] **Step 5: Propose the commit**

> `1b: timeline store with §5.3 cursor pagination and separate first-page/load-more error slots`

---

## Task 6: Rendering — list, states, degraded banner, fault panel

**Files:**
- Create: `frontend/src/components/TimelineView.vue`, `PostCard.vue`, `ErrorPanel.vue`,
  `DegradedBanner.vue`, `FaultPanel.vue`
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: `useTimelineStore()`, `ApiError`, `Post`.
- Produces: `ErrorPanel` with props `{ error: ApiError; onRetry?: () => void; onRestart?: () => void }`;
  `PostCard` with props `{ post: Post }`.

- [ ] **Step 1: `ErrorPanel.vue` — rendered from the model**

`SPEC.md` requires the error state to come from the error model, not a generic string. So the
component takes an `ApiError` and never a `string`:

```vue
<script setup lang="ts">
import type { ApiError } from '../api/errors';

const props = defineProps<{ error: ApiError; onRetry?: () => void; onRestart?: () => void }>();

// §5.5: the retry affordance appears if and only if `retryable` is true — not inferred from the
// status code, because 409 is mixed (edit_window_closed no, idempotency_in_progress yes).
const showRetry = () => props.error.retryable && props.onRetry !== undefined;
// §5.1#2: invalid_cursor is terminal, and the contract's remedy is restarting at page 1.
const showRestart = () => props.error.code === 'invalid_cursor' && props.onRestart !== undefined;
</script>

<template>
  <div role="alert" class="error-panel">
    <p>{{ error.message }}</p>
    <p><code>{{ error.code }}</code> · HTTP {{ error.status }}</p>
    <!-- §5.5: request_id is shown so a user report is debuggable. -->
    <p class="muted">Reference: <code>{{ error.requestId }}</code></p>
    <button v-if="showRetry()" @click="onRetry?.()">Try again</button>
    <button v-if="showRestart()" @click="onRestart?.()">Start from the top</button>
  </div>
</template>
```

- [ ] **Step 2: `DegradedBanner.vue`**

```vue
<template>
  <!-- §5.1#2: the push set was unavailable and the page came from the pull path alone. Fewer
       items than usual; narrow-author posts may be missing. Not an error — keep rendering. -->
  <p role="status" class="degraded">
    Some posts may be missing right now. Showing what we could load.
  </p>
</template>
```

- [ ] **Step 3: `PostCard.vue`**

Renders `display_name`, `@handle`, `created_at`, `text`, and the image when `post.image !== null`
(with `alt` from the contract, falling back to `""` so a decorative image is not announced as
`null`). Interpolation only — no `v-html` anywhere, per §9.5. Leave a named slot for the edited
indicator and the edit affordance; Tasks 8 and 9 fill it.

- [ ] **Step 4: `FaultPanel.vue`**

A small, always-visible control labelled **"Mock controls (not part of the API contract)"** — the
wording matters, §5.5 says `?fault=` is a fixture affordance. A `<select>` of the `FAULTS` keys, a
`<select>` for `fault_on`, a `fault_after` number input, and checkboxes for `empty` and `degraded`.
Applying writes `window.location.search` and reloads, so the URL stays the single source of truth
and a state is shareable as a link.

- [ ] **Step 5: `TimelineView.vue` — the four states**

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useTimelineStore } from '../stores/timeline';
import PostCard from './PostCard.vue';
import ErrorPanel from './ErrorPanel.vue';
import DegradedBanner from './DegradedBanner.vue';

const store = useTimelineStore();
onMounted(() => void store.loadFirstPage());
</script>

<template>
  <section>
    <DegradedBanner v-if="store.degraded" />

    <p v-if="store.status === 'loading-first'">Loading your timeline…</p>

    <ErrorPanel
      v-else-if="store.status === 'error' && store.error"
      :error="store.error"
      :on-retry="() => void store.loadFirstPage()"
      :on-restart="() => void store.restart()"
    />

    <p v-else-if="store.isEmpty">Nothing here yet. Your timeline will fill up as you follow people.</p>

    <template v-else>
      <PostCard v-for="post in store.items" :key="post.id" :post="post" />

      <ErrorPanel
        v-if="store.loadMoreError"
        :error="store.loadMoreError"
        :on-retry="() => void store.loadMore()"
        :on-restart="() => void store.restart()"
      />

      <button v-if="store.canLoadMore" @click="void store.loadMore()">
        {{ store.status === 'loading-more' ? 'Loading…' : 'Load more' }}
      </button>
      <p v-else-if="!store.hasMore">You have reached the end.</p>
    </template>
  </section>
</template>
```

Note the ordering: the load-more error renders **below** the list, never replacing it. That is the
visible payoff of the two error slots in Task 5.

- [ ] **Step 6: Wire `App.vue`** — `FaultPanel` then `TimelineView`.

- [ ] **Step 7: Verify in the browser**

```bash
npm run typecheck && npm run dev
```

Check each URL by hand:

| URL | Expected |
|---|---|
| `/` | Loading text, then ~20 posts, then a "Load more" button |
| `/?latency=1500` | The loading state is visible for ~1.5 s |
| `/?empty=1` | The empty message. **No** error panel, no "Load more" |
| `/?fault=timeline_unavailable` | Error panel: message, `timeline_unavailable`, HTTP 503, reference ID, **and** a "Try again" button (`retryable: true`) |
| `/?fault=invalid_cursor` | Error panel with **"Start from the top"** and no "Try again" |
| `/?degraded=1` | Banner above a normally rendered list |
| `/?fault=timeline_unavailable&fault_after=1` | Page 1 renders; pressing "Load more" leaves the 20 posts on screen and shows the error below them |

Clicking "Load more" repeatedly must reach "You have reached the end." with no duplicate post IDs —
confirm in the DOM, not by eye, e.g. in the console:
`new Set([...document.querySelectorAll('[data-post-id]')].map(e=>e.dataset.postId)).size`
must equal the rendered count (add `data-post-id` to `PostCard`'s root for this).

- [ ] **Step 8: Propose the commit**

> `1b: timeline rendering with loading/empty/error states from the §5.5 model, degraded banner and mock controls`

---

## Task 7: Optimistic publish, rollback, and the race

Test-first. The race between an optimistic write and "load more" is an announced debrief question.

**Files:**
- Modify: `frontend/src/stores/timeline.ts`, `frontend/mock/router.ts`,
  `frontend/src/components/TimelineView.vue`
- Create: `frontend/src/components/ComposeBox.vue`
- Test: `frontend/src/stores/timeline.spec.ts` (extend)

**Interfaces:**
- Consumes: `publishPost` from `api/client.ts`.
- Produces on the store: `publish(text: string): Promise<void>`,
  `retryPending(localId: string): Promise<void>`, `composeError: ApiError | null`, and
  `PendingPost.error?: ApiError` (declared in Task 5, populated here).

**Two publish error slots, for the reason PLAN.md §4 gives.** A *terminal* failure removes the
pending entry, so its error has nowhere to live but the store: `composeError`, rendered above the
textarea with the text restored inside it. A *retryable* failure keeps the entry, so its error
belongs on the entry: `pending[i].error`, rendered on that row next to its "Try again". One shared
slot for an array of pending entries is the same mistake as one shared slot for the page-1 and
page-N load errors.

- [ ] **Step 1: Add `POST /v1/posts` to the mock**

In `mock/router.ts`: validate `text` as 1–500 code points after NFC normalisation
(`[...text.normalize('NFC')].length` — so a family emoji costs 1, per §5.1#1), reject otherwise with
`400 validation_failed`. On success mint a Snowflake **greater than every existing corpus ID** from
the current wall clock, unshift the post into the in-memory corpus, and return **`201`** with
`Location: /v1/posts/{id}` and a `Post` body whose `revision` is 1, `edit_count` 0, `edited_at`
null, and `editable_until` = `created_at + 15 min` (the author is the viewer).

Keep a `Map<string, Post>` keyed by `Idempotency-Key`: a repeat of a completed key returns **201
with the original body** (§5.1#1, §5.4), not a second post. This is what the dedup guard in Step 4
is tested against.

- [ ] **Step 2: Write the failing optimistic-write tests**

Append to `src/stores/timeline.spec.ts`:

```ts
describe('timeline store — optimistic publish', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(client.getHomeTimeline).mockReset();
    vi.mocked(client.publishPost).mockReset();
  });

  async function ready(ids: string[], next: string | null = 'cur') {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(ids, next));
    const s = useTimelineStore();
    await s.loadFirstPage();
    return s;
  }

  it('shows the post immediately, then reconciles it to the head of items exactly once', async () => {
    const s = await ready(['300', '200']);
    const confirmed = { ...post('400'), text: 'hello' };
    let release: ((p: Post) => void) | undefined;
    vi.mocked(client.publishPost).mockReturnValueOnce(new Promise((r) => { release = r; }));

    const inFlight = s.publish('hello');
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]?.text).toBe('hello');
    expect(s.draft).toBe(''); // the compose box clears optimistically

    release?.(confirmed);
    await inFlight;
    expect(s.pending).toHaveLength(0);
    expect(s.items.map((p) => p.id)).toEqual(['400', '300', '200']);
    expect(s.items.filter((p) => p.id === '400')).toHaveLength(1);
  });

  it('reuses the same Idempotency-Key across a retry of the same post', async () => {
    const s = await ready(['300']);
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('hello');
    const key = s.pending[0]?.idempotencyKey;
    expect(key).toBeTypeOf('string');

    vi.mocked(client.publishPost).mockResolvedValueOnce({ ...post('400'), text: 'hello' });
    await s.retryPending(s.pending[0]!.localId);
    const keys = vi.mocked(client.publishPost).mock.calls.map((c) => c[1]);
    expect(keys[0]).toBe(key);
    expect(keys[1]).toBe(key); // §5.4: the ambiguity of a timeout is resolved by the same key
  });

  it('rolls back on a terminal failure: pending cleared, draft restored, error surfaced', async () => {
    const s = await ready(['300']);
    const invalid = new ApiError({
      status: 400, code: 'validation_failed', message: 'Your post must be between 1 and 500 characters.',
      retryable: false, requestId: 'req-9',
    });
    vi.mocked(client.publishPost).mockRejectedValueOnce(invalid);
    await s.publish('x'.repeat(501));
    expect(s.pending).toHaveLength(0);
    expect(s.draft).toBe('x'.repeat(501));
    expect(s.composeError?.code).toBe('validation_failed');
    expect(s.items.map((p) => p.id)).toEqual(['300']); // the list is untouched
  });

  it('keeps the pending entry on a retryable failure, with the error on the entry', async () => {
    const s = await ready(['300']);
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('hello');
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]?.error?.retryable).toBe(true);
    expect(s.draft).toBe(''); // not rolled back: the entry still holds the text and the key
    expect(s.composeError).toBeNull(); // a retryable failure is not a compose-box error
  });

  it('a second compose attempt does not wipe the error on a still-pending first entry', async () => {
    const s = await ready(['300']);
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('first');
    const firstId = s.pending[0]!.localId;

    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('second');

    // Both entries are pending, and each still carries its own error. A single store-level slot
    // would have left `first` rendering a "Try again" button with no message beside it.
    expect(s.pending).toHaveLength(2);
    expect(s.pending.find((p) => p.localId === firstId)?.error?.code).toBe('timeline_unavailable');
    expect(s.pending.find((p) => p.text === 'second')?.error?.code).toBe('timeline_unavailable');
  });

  it('clears only that entry error on retry, and only that entry', async () => {
    const s = await ready(['300']);
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('first');
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('second');

    const firstId = s.pending.find((p) => p.text === 'first')!.localId;
    vi.mocked(client.publishPost).mockResolvedValueOnce({ ...post('400'), text: 'first' });
    await s.retryPending(firstId);

    expect(s.items.map((p) => p.id)).toEqual(['400', '300']);
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]?.text).toBe('second');
    expect(s.pending[0]?.error?.code).toBe('timeline_unavailable'); // untouched
  });

  it('drops the pending entry rather than duplicating on an idempotent replay', async () => {
    const s = await ready(['300']);
    // The post is already in items — the 201-with-original-body case from §5.1#1.
    const replayed = { ...post('400'), text: 'hello' };
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(['400', '300'], null));
    await s.restart();
    vi.mocked(client.publishPost).mockResolvedValueOnce(replayed);
    await s.publish('hello');
    expect(s.items.filter((p) => p.id === '400')).toHaveLength(1);
    expect(s.pending).toHaveLength(0);
  });

  describe('racing "load more"', () => {
    it('publish resolving first: no duplicate, no lost post', async () => {
      const s = await ready(['300', '200'], 'cur-200');
      let releaseMore: ((p: TimelinePage) => void) | undefined;
      let releasePublish: ((p: Post) => void) | undefined;
      vi.mocked(client.getHomeTimeline).mockReturnValueOnce(new Promise((r) => { releaseMore = r; }));
      vi.mocked(client.publishPost).mockReturnValueOnce(new Promise((r) => { releasePublish = r; }));

      const more = s.loadMore();
      const pub = s.publish('hello');
      releasePublish?.({ ...post('400'), text: 'hello' });
      await pub;
      releaseMore?.(page(['100'], null));
      await more;

      expect(s.items.map((p) => p.id)).toEqual(['400', '300', '200', '100']);
      expect(s.pending).toHaveLength(0);
    });

    it('load more resolving first: same result', async () => {
      const s = await ready(['300', '200'], 'cur-200');
      let releaseMore: ((p: TimelinePage) => void) | undefined;
      let releasePublish: ((p: Post) => void) | undefined;
      vi.mocked(client.getHomeTimeline).mockReturnValueOnce(new Promise((r) => { releaseMore = r; }));
      vi.mocked(client.publishPost).mockReturnValueOnce(new Promise((r) => { releasePublish = r; }));

      const more = s.loadMore();
      const pub = s.publish('hello');
      releaseMore?.(page(['100'], null));
      await more;
      releasePublish?.({ ...post('400'), text: 'hello' });
      await pub;

      expect(s.items.map((p) => p.id)).toEqual(['400', '300', '200', '100']);
      expect(s.pending).toHaveLength(0);
    });

    it('an in-flight load more is not cancelled by a publish', async () => {
      const s = await ready(['300'], 'cur-300');
      let releaseMore: ((p: TimelinePage) => void) | undefined;
      vi.mocked(client.getHomeTimeline).mockReturnValueOnce(new Promise((r) => { releaseMore = r; }));
      vi.mocked(client.publishPost).mockResolvedValueOnce({ ...post('400'), text: 'hello' });

      const more = s.loadMore();
      await s.publish('hello');
      releaseMore?.(page(['200'], null));
      await more;
      expect(s.items.map((p) => p.id)).toEqual(['400', '300', '200']);
    });
  });
});
```

- [ ] **Step 3: Run them to confirm they fail**

```bash
npm run test -- src/stores/timeline.spec.ts
```

Expected: the pagination tests still pass; every test in the new block FAILs with
`s.publish is not a function`.

- [ ] **Step 4: Implement publish, reconcile and rollback**

Add to `src/stores/timeline.ts`:

```ts
  /** Terminal publish failure only. Retryable ones live on the pending entry — PLAN.md §4. */
  const composeError = ref<ApiError | null>(null);

  async function publish(text: string): Promise<void> {
    const entry: PendingPost = {
      localId: crypto.randomUUID(),
      text,
      // §5.4: generated once, before the first attempt, and reused for every retry of THIS post.
      idempotencyKey: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    pending.value = [entry, ...pending.value];
    draft.value = '';
    // Clears only the compose box's own error. Errors on entries still in `pending` belong to
    // those entries and survive this.
    composeError.value = null;
    await send(entry);
  }

  async function retryPending(localId: string): Promise<void> {
    const entry = pending.value.find((p) => p.localId === localId);
    if (entry === undefined) return;
    setPendingError(localId, undefined);
    await send(entry);
  }

  async function send(entry: PendingPost): Promise<void> {
    try {
      const confirmed = await publishPost({ text: entry.text }, entry.idempotencyKey);
      reconcile(entry, confirmed);
    } catch (e) {
      const err = asApiError(e);
      if (err.retryable) {
        // The entry stays in `pending`, marked failed, carrying its own error and a retry
        // affordance that reuses the same Idempotency-Key (§5.4).
        setPendingError(entry.localId, err);
      } else {
        // Terminal: nothing about resending will help. Roll the optimistic entry back and hand
        // the text back to the compose box so it is not lost.
        pending.value = pending.value.filter((p) => p.localId !== entry.localId);
        draft.value = entry.text;
        composeError.value = err;
      }
    }
  }

  /** Replaces the entry rather than mutating it, so the array identity change drives rendering. */
  function setPendingError(localId: string, err: ApiError | undefined): void {
    pending.value = pending.value.map((p) => {
      if (p.localId !== localId) return p;
      const { error: _dropped, ...rest } = p;
      return err === undefined ? rest : { ...rest, error: err };
    });
  }

  function reconcile(entry: PendingPost, confirmed: Post): void {
    pending.value = pending.value.filter((p) => p.localId !== entry.localId);
    // §5.1#1 + §5.4: a retry of a completed Idempotency-Key returns 201 with the ORIGINAL body,
    // so the post may already be in `items` (e.g. a timed-out attempt that actually succeeded,
    // followed by a restart that fetched it). Without this guard it renders twice.
    if (items.value.some((p) => p.id === confirmed.id)) return;
    // §5.3: IDs are time-ordered, so a new post's ID is strictly greater than anything already
    // fetched — the head of `items` is the correct position, and `loadMore` only ever appends.
    // The two writes are disjoint: no cancellation and no locking is needed.
    items.value = [confirmed, ...items.value];
  }
```

Export `composeError`, `publish`, `retryPending`. `pending` renders **above** `items` and is never
merged into it — that separation is the whole argument.

- [ ] **Step 5: Run the tests**

```bash
npm run test
npm run typecheck
```

Expected: all pagination tests plus 10 optimistic tests PASS.

- [ ] **Step 6: `ComposeBox.vue`**

A `<textarea>` bound to `store.draft`, a live counter using `[...draft.normalize('NFC')].length`
against 500 (§5.1#1's counting rule, so the client and server agree on what "501 characters" means),
and a Post button disabled when the count is 0 or over 500.

The two error slots render in two places, which is the visible payoff of splitting them:

- **`composeError`** renders in an `ErrorPanel` **above the textarea**, with the rolled-back text
  restored inside it. No retry affordance: `retryable` is false, and §5.5 says the button appears if
  and only if that field is true.
- **`entry.error`** renders in an `ErrorPanel` **on that pending row**, with "Try again" wired to
  `retryPending(entry.localId)`. Each pending row owns its own message, so two failed entries show
  two errors rather than one overwriting the other.

Below the textarea, pending entries render with a "Posting…" marker, or with their own error panel
once `entry.error` is set.

- [ ] **Step 7: Verify in the browser**

| Action | Expected |
|---|---|
| Post "hello" at `/?latency=2000` | Appears immediately above the list as pending, then becomes a real post at the head, exactly once |
| Post at `/?fault=validation_failed&fault_on=publish` | Pending entry disappears, text is back in the textarea, error shows `validation_failed` and **no** "Try again" |
| Post at `/?fault=post_service_unavailable&fault_on=publish` | Pending entry stays, error is retryable, "Try again" present. (`http.ts` retries 3× first — expect a pause.) |
| Post at `/?fault=idempotency_in_progress&fault_on=publish` | Retry affordance present: a retryable 409, proving the button follows `retryable` and not the status |
| Post twice at `/?fault=post_service_unavailable&fault_on=publish` | **Two** pending rows, **two** error panels, two "Try again" buttons. Neither message disappears when the second post is composed |
| Then clear the fault and retry the older row | Only that row resolves into the timeline; the other keeps its error and its button |
| Press "Load more" and Post within the same second at `/?latency=3000` | New post at the head, next page appended at the tail, no duplicates, nothing lost |

- [ ] **Step 8: Propose the commit**

> `1b: optimistic publish with §5.4 idempotency-key reuse, rollback, and the reconcile dedup guard`

---

## Task 8: Edited indicator and revision history

**Files:**
- Create: `frontend/src/components/EditedIndicator.vue`, `frontend/src/components/RevisionsPanel.vue`
- Modify: `frontend/mock/router.ts`, `frontend/src/components/PostCard.vue`

**Interfaces:**
- Consumes: `getRevisions` from `api/client.ts`; `Post.edit_count`.
- Produces: `EditedIndicator` props `{ post: Post }`; `RevisionsPanel` props `{ postId: PostId }`.

- [ ] **Step 1: Add `GET /v1/posts/{id}/revisions` to the mock**

Serve from `corpus.revisions`, newest first, as `{ post_id, revisions }`. Unknown ID →
`404 post_not_found`. §5.1#5 has no pagination, so return the whole array.

- [ ] **Step 2: `EditedIndicator.vue`**

```vue
<script setup lang="ts">
import type { Post } from '../api/types';
const props = defineProps<{ post: Post }>();
// §5.0 is explicit: "edit_count > 0 IS the edited indicator the frontend renders; it links to
// /posts/{id}/revisions". Not edited_at !== null and not revision > 1 — all three coincide today,
// but the contract names this one, so this is the one the code reads.
const isEdited = () => props.post.edit_count > 0;
</script>

<template>
  <button v-if="isEdited()" class="edited-indicator">
    Edited{{ post.edit_count > 1 ? ` ×${post.edit_count}` : '' }}
  </button>
</template>
```

- [ ] **Step 3: `RevisionsPanel.vue`**

On mount, calls `getRevisions(postId)`. Three states: loading, loaded (a list of
`revision`, `created_at`, `text`, newest first), and error via `ErrorPanel` — the same component, so
there is one error rendering path in the app. Assert nothing about ordering client-side; §5.1#5
guarantees newest-first and the panel says so in a comment.

- [ ] **Step 4: Wire it into `PostCard.vue`**

`EditedIndicator` next to the timestamp; clicking it toggles `RevisionsPanel` below the post body.

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm run dev
curl -s 'http://localhost:5173/v1/posts/1827639201234567890/revisions' | python3 -m json.tool
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:5173/v1/posts/1/revisions'
```

Expected: grace's post shows "Edited" in the list; the `curl` returns revisions 2 then 1, with
revision 1's text being the pre-edit body and `created_at` `2026-09-17T10:00:00.000Z`; the unknown
ID returns `404`. `newsdesk`'s post shows "Edited ×2". Unedited posts show no indicator.
`/?fault=post_not_found&fault_on=revisions` renders the error inside the panel with no retry button.

- [ ] **Step 6: Propose the commit**

> `1b: edited indicator from §5.0 edit_count and the §5.1#5 revision history panel`

---

## Task 9: Edit inside the window

**Files:**
- Create: `frontend/src/components/EditBox.vue`
- Modify: `frontend/mock/router.ts`, `frontend/src/stores/timeline.ts`,
  `frontend/src/components/PostCard.vue`

**Interfaces:**
- Consumes: `editPost` from `api/client.ts`; `VIEWER_ID` from `api/mockControls.ts`.
- Produces on the store: `applyEdit(id: PostId, text: string): Promise<void>`,
  `editError: ApiError | null`.

- [ ] **Step 1: Add `PATCH /v1/posts/{id}` to the mock**

In order, because the order is the contract:

1. Unknown ID → `404 post_not_found`.
2. `author.id !== VIEWER.id` → `403 not_author` (§5.2: ownership, checked server-side).
3. `now > created_at + 15 min` → `409 edit_window_closed` with
   `details.editable_until`. The mock's corpus timestamps are fixed in the past, so this is the
   natural answer for every corpus post — which is why the seed includes one post whose
   `editable_until` the mock treats as open. Implement the check against a **mock clock** pinned to
   `2026-09-17T10:05:00.000Z` so the window state is deterministic rather than dependent on when
   the reviewer runs it; say so in the README.
4. `If-Match` present and `!== '"' + post.revision + '"'` → `412 revision_conflict`. Absent is
   allowed (last-write-wins, §5.1#4).
5. Validate text as in Task 7 → `400 validation_failed`.
6. Otherwise `200` with the updated `Post`: `revision + 1`, `edited_at` = now, `edit_count + 1`,
   plus `ETag: "<new revision>"`. Append to the revision history so Task 8's panel shows it.

- [ ] **Step 2: Store action**

```ts
  const editError = ref<ApiError | null>(null);

  async function applyEdit(id: PostId, text: string): Promise<void> {
    const index = items.value.findIndex((p) => p.id === id);
    const current = items.value[index];
    if (current === undefined) return;
    editError.value = null;
    try {
      // §5.1#4: If-Match carries the revision the client believes it is editing. Derived from the
      // Post we are rendering, which is the same value the ETag carried.
      const updated = await editPost(id, { text }, current.revision);
      // An edit does not change the post's ID (§5.3), so this is an in-place replacement: no
      // reordering, no pagination effect. §12 traces exactly this.
      items.value = items.value.map((p) => (p.id === id ? updated : p));
    } catch (e) {
      editError.value = asApiError(e);
    }
  }
```

No optimistic update here, deliberately: §5.0 says `editable_until` is advisory and the server
re-checks, so the only honest answer about whether an edit landed is the response. Note that in the
README as a considered asymmetry with publish, not an oversight.

- [ ] **Step 3: `EditBox.vue`**

Shown when `post.author.id === VIEWER_ID` **and** `post.editable_until !== undefined` and parses to
a future time. A `<textarea>` seeded with `post.text`, Save and Cancel. On `editError`, render
`ErrorPanel` — so `edit_window_closed` appears with **no retry button** (§5.1#4: "Terminal:
retrying never succeeds, and the frontend must say so rather than offering a retry button"), and
`revision_conflict` shows its message prompting a reload rather than silently overwriting.

Because `editable_until` is advisory, the UI does not hide the affordance on its own clock alone —
it offers the edit and treats a 409 as the real answer.

- [ ] **Step 4: Verify**

| URL / action | Expected |
|---|---|
| `/` | Only the viewer's in-window post shows an Edit control; grace's and newsdesk's do not |
| Edit it and save | Text updates in place, position unchanged, "Edited" indicator appears, revisions panel now lists the new revision at the top |
| `/?fault=edit_window_closed&fault_on=patch` | Error with `edit_window_closed`, HTTP 409, **no "Try again" button** |
| `/?fault=revision_conflict&fault_on=patch` | HTTP 412, message prompting a reload, no retry |
| `/?fault=not_author&fault_on=patch` | HTTP 403, no retry |

Confirm the `If-Match` header is actually on the wire in the network panel: `If-Match: "1"`.

- [ ] **Step 5: Propose the commit**

> `1b: in-window edit with §5.1#4 If-Match and terminal-error handling for edit_window_closed`

---

## Task 10: README and the full state walkthrough

**Files:**
- Create: `frontend/README.md`

- [ ] **Step 1: Run the whole suite and the typechecker**

```bash
npm run test
npm run typecheck
npm run build
grep -rn ": any\|as any\|<any>" src/ mock/ || echo "no any"
grep -n '"strict"' tsconfig.json
```

Expected: all tests pass; typecheck and build exit 0; no `any`; `"strict": true` present.

- [ ] **Step 2: Clean-checkout check**

```bash
cd "$(mktemp -d)" && git clone /Users/eugene/Documents/projects/MMS-take-home chirp-check \
  && cd chirp-check/01-greenfield-design/frontend && npm install && npm run dev
```

Expected: `npm install` succeeds from the committed lockfile and `npm run dev` serves a working
timeline. This is the SPEC's literal requirement and the cheapest mark to lose.

- [ ] **Step 3: Walk every state in the browser**

Tick each one. Any that fails goes back to its task rather than into the README as a caveat:

- [ ] First load, 20 posts, load more to the end, no duplicate IDs
- [ ] `?empty=1` → empty state, 200 not an error
- [ ] `?latency=2000` → loading state visible
- [ ] `?fault=timeline_unavailable` → page-1 error with retry
- [ ] `?fault=timeline_unavailable&fault_after=1` → load-more error **below** an intact list
- [ ] `?fault=invalid_cursor&fault_after=1` → "Start from the top", no retry
- [ ] `?degraded=1` → banner, list still rendered
- [ ] Optimistic publish success → pending, then head of list, once
- [ ] Optimistic publish terminal failure → rollback + draft restored + `composeError` above the box
- [ ] Optimistic publish retryable failure → pending kept, error on that row, same key on retry
- [ ] Two failed retryable publishes → two rows, two errors, neither overwrites the other
- [ ] Edited indicator on grace's post → revisions panel, newest first
- [ ] Edit in window → in-place update, indicator appears
- [ ] `?fault=edit_window_closed&fault_on=patch` → no retry button

- [ ] **Step 4: Write `frontend/README.md`**

Required sections, per `SPEC.md`:

1. **Install and run** — `npm install`, `npm run dev`, `npm run test`, `npm run typecheck`. **Node
   v26.5.1, npm 11.17.0.**
2. **Structure, and why** — the `api/` / `stores/` / `components/` / `mock/` split; why the mock is
   a Vite middleware serving real HTTP rather than an in-process fixture layer (real status codes,
   `ETag`, `Retry-After`, `X-Request-Id`, a genuine `?fault=` query parameter); why one Pinia store.
3. **Which part of the contract each module implements** — the table from `PLAN.md` §1, updated to
   match what was actually built. State plainly that endpoints **3, 6, 7, 8, 9, 10** exist in the
   contract and are deliberately not consumed by this view.
4. **How to trigger the error path** — the query-parameter table, plus the FaultPanel, plus two
   copy-pasteable examples.
5. **What I cut** (`PLAN.md` §10, honestly): no "N new posts" polling; no image upload, auth UI or
   real backend (out of scope); no silent token refresh although §5.2 defines one; six endpoints
   unconsumed; **store-level Vitest only, no component or browser tests**; plain styling; the mock's
   pinned clock; no optimistic update on edit, and why that asymmetry with publish is deliberate.
   State the rollback reading too: SPEC's "rolls back on failure" is implemented for terminal
   failures, while a retryable one keeps the pending entry so the `Idempotency-Key` survives for the
   retry (§5.4). That is a decision, not a missing feature.
6. **What's next** — in order: component tests for the state matrix, the "N new posts" poll using
   the newest `id` the store already keeps, and real `413`/`415` handling once image upload exists.

Cross-check every §-reference in the README actually says what the README claims, by re-reading
`../DELIVERABLE.md` §5 one final time. If any code/contract mismatch surfaces at this point, fix it
and journal it — do not paper over it in the README.

- [ ] **Step 5: Journal it**

Add a `DECISION-JOURNAL.md` entry covering the build: what was asked of the assistant, what came
back, what was kept, changed or discarded, and why — including any point where the code forced a
change to §5. Also record wall-clock hours for Problem 1b in the time log.

- [ ] **Step 6: Propose the final commits**

> `1b: frontend README with the contract-to-module map, error-path instructions and what I cut`
>
> `journal: Problem 1b build entry and wall-clock time`

---

## Self-review against the spec

**Spec coverage.** `SPEC.md` setup (Task 1), mock layer with a no-code-edit failure switch
(Task 3), types from the contract (Task 2), cursor pagination (Tasks 5–6), loading/empty/error from
the error model (Tasks 5–6), optimistic creation with rollback (Task 7), edited indicator consistent
with the edit-history design (Task 8), README with all five required sections (Task 10). The three
debrief questions have designated homes: state approach (Task 5 / `PLAN.md` §3), the publish-vs-
load-more race (Task 7 Step 4's comments and its three tests), and "what if the contract gains a
field" (`api/types.ts` is the single place wire names appear as literals — Task 2 Step 1).

**One reading of `SPEC.md` worth stating out loud.** SPEC's behaviour 3 says an optimistic post "on
failure rolls back and tells the user". That is implemented for **terminal** failures. A
**retryable** failure deliberately does *not* roll back: the entry stays in `pending` holding its
`Idempotency-Key`, because §5.4 says the whole point of that key is to make a retry of an ambiguous
publish safe, and discarding the entry would discard the key with it. The user is still told — the
error renders on that row. This is an interpretation, not an omission, and the README says so.

**Gaps I am accepting, both from `PLAN.md`:** silent token refresh (§5.2) and the "N new posts"
poll (§5.3) are specified in the contract and not built; both are declared in the README's cuts.

**Type consistency.** `ApiError.requestId` is camelCase in the class and `request_id` on the wire —
the conversion happens only in `parseApiError` (Task 2) and nowhere else. Wire types keep snake_case
everywhere. `editable_until` is optional (`?`), never `| null`, in the types, the corpus builder and
the mock. `PendingPost.idempotencyKey` is the name used in Tasks 5 and 7 alike.

**Risk carried forward from `PLAN.md` §11:** `exactOptionalPropertyTypes` may fight Vue's prop
types. If it costs more than a few minutes in Task 6, drop that one flag, keep `strict: true`, and
record the reason in `PLAN.md` §11 and the journal.
