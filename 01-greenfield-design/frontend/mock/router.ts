import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Post, RevisionsResponse, TimelinePage } from '../src/api/types';
import { posts, revisions, VIEWER } from './corpus';
import { encodeCursor, decodeCursor, snowflake } from './snowflake';
import { faultResponse, maybeFault } from './faults';

/**
 * A connect middleware mounted inside the Vite dev server, serving the API over real HTTP on /v1.
 *
 * Serving real responses rather than stubbing the client in-process is deliberate: status codes,
 * ETag, Retry-After, X-Request-Id and the `?fault=` parameter are all exercised for real, so the
 * client is evidence that it satisfies the contract rather than evidence that it satisfies a stub
 * written to agree with it.
 */

/** The in-memory corpus. Mutated by publish and edit, so the session has continuity. */
const state: { posts: Post[] } = { posts: posts.slice() };

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(payload);
}

function sendFault(res: ServerResponse, fault: ReturnType<typeof faultResponse>): void {
  send(res, fault.status, fault.body, fault.headers);
}

function fail(res: ServerResponse, code: string, status: number, message: string, retryable: boolean): void {
  sendFault(res, faultResponse(code, { status, message, retryable }));
}

/** GET /v1/timeline/home */
function getHomeTimeline(url: URL, res: ServerResponse): void {
  if (url.searchParams.get('empty') === '1') {
    // An empty timeline is a 200 with an empty items array, not an error.
    const page: TimelinePage = {
      items: [],
      page: { next_cursor: null, has_more: false },
      degraded: false,
    };
    send(res, 200, page);
    return;
  }

  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    // limit is 1–100, default 20.
    fail(res, 'validation_failed', 400, 'limit must be an integer between 1 and 100.', false);
    return;
  }

  let slice = state.posts;
  const cursor = url.searchParams.get('cursor');
  if (cursor !== null && cursor !== '') {
    const boundary = decodeCursor(cursor);
    if (boundary === null) {
      // Terminal: the client restarts at page 1 rather than retrying this request.
      fail(res, 'invalid_cursor', 400, 'This page link is no longer valid. Start from the top.', false);
      return;
    }
    // Strictly less than the cursor, which is what makes duplicates impossible.
    slice = state.posts.filter((p) => BigInt(p.id) < BigInt(boundary));
  }

  const items = slice.slice(0, limit);
  const has_more = slice.length > limit;
  const last = items[items.length - 1];

  const page: TimelinePage = {
    items,
    page: {
      // The invariant the client asserts: next_cursor is null exactly when has_more is false.
      next_cursor: has_more && last !== undefined ? encodeCursor(last.id) : null,
      has_more,
    },
    degraded: url.searchParams.get('degraded') === '1',
  };
  send(res, 200, page);
}

/**
 * The fixture clock. The corpus timestamps are fixed, so a real clock would slam the edit window
 * shut on every post the moment the reviewer ran this, and the state would depend on the time of
 * day they happened to run it.
 *
 * The pin is chosen so the corpus and this check cannot disagree. The viewer's newest post is from
 * 09:59 and its window closes at 10:14; the next one is from 09:56 and closed at 10:11. Any clock
 * between those two leaves exactly one post editable, which is what the corpus advertises by
 * carrying editable_until on that one post and omitting it on the others.
 */
const MOCK_NOW = Date.parse('2026-09-17T10:12:00.000Z');

const EDIT_WINDOW_MS = 15 * 60_000;

/** PATCH /v1/posts/{id} — the checks in the order the contract puts them. */
async function edit(id: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const index = state.posts.findIndex((p) => p.id === id);
  const current = state.posts[index];
  if (current === undefined) {
    fail(res, 'post_not_found', 404, 'This post is no longer available.', false);
    return;
  }

  // Ownership is a server-side check. The client hides the control, but hiding is not enforcing.
  if (current.author.id !== VIEWER.id) {
    fail(res, 'not_author', 403, 'You can only edit your own posts.', false);
    return;
  }

  const closesAt = Date.parse(current.created_at) + EDIT_WINDOW_MS;
  if (MOCK_NOW > closesAt) {
    sendFault(
      res,
      faultResponse('edit_window_closed', {
        status: 409,
        message: 'This post can no longer be edited.',
        retryable: false,
        details: { editable_until: new Date(closesAt).toISOString() },
      }),
    );
    return;
  }

  // If-Match carries the revision the client believes it is editing. Absent is allowed and means
  // last write wins; present and stale means someone else's edit landed first.
  const ifMatch = req.headers['if-match'];
  if (typeof ifMatch === 'string' && ifMatch !== `"${current.revision}"`) {
    fail(
      res,
      'revision_conflict',
      412,
      'This post changed since you opened it. Reload to see the latest version.',
      false,
    );
    return;
  }

  const text = textOrNull(await readBody(req));
  if (text === null) {
    fail(res, 'validation_failed', 400, 'Your post must be between 1 and 500 characters.', false);
    return;
  }

  const editedAt = new Date(MOCK_NOW).toISOString();
  const updated: Post = {
    ...current,
    text,
    revision: current.revision + 1,
    edited_at: editedAt,
    edit_count: current.edit_count + 1,
  };
  // The ID does not change, so the post keeps its place: an edit has no pagination effect.
  state.posts = state.posts.map((p) => (p.id === id ? updated : p));
  revisions.set(id, [
    { revision: updated.revision, text, created_at: editedAt },
    ...(revisions.get(id) ?? []),
  ]);

  send(res, 200, updated, { ETag: `"${updated.revision}"` });
}

/** GET /v1/posts/{id}/revisions — public, newest first, not paginated. */
function getRevisions(id: string, res: ServerResponse): void {
  const history = revisions.get(id);
  if (history === undefined) {
    fail(res, 'post_not_found', 404, 'This post is no longer available.', false);
    return;
  }
  const body: RevisionsResponse = { post_id: id, revisions: history };
  send(res, 200, body);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Length is counted in Unicode code points after NFC normalisation, which is the rule the contract
 * states. A family emoji costs 1, and a decomposed é costs 1 rather than 2, so the client's live
 * counter and this check agree about what "501 characters" means.
 */
function textOrNull(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const text = (body as Record<string, unknown>)['text'];
  if (typeof text !== 'string') return null;
  const length = [...text.normalize('NFC')].length;
  if (length < 1 || length > 500) return null;
  return text.normalize('NFC');
}

/**
 * Completed publishes, keyed by Idempotency-Key. A repeat of a key that already finished returns
 * the original post rather than creating a second one, which is what makes the client's automatic
 * retry of a publish safe.
 */
const publishedByKey = new Map<string, Post>();

/** POST /v1/posts */
async function publish(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const key = req.headers['idempotency-key'];
  const body = await readBody(req);

  if (typeof key === 'string') {
    const already = publishedByKey.get(key);
    if (already !== undefined) {
      send(res, 201, already, { Location: `/v1/posts/${already.id}`, ETag: `"${already.revision}"` });
      return;
    }
  }

  const text = textOrNull(body);
  if (text === null) {
    fail(res, 'validation_failed', 400, 'Your post must be between 1 and 500 characters.', false);
    return;
  }

  // Minted from the wall clock, so the new ID is strictly greater than every fixture ID and the
  // post belongs at the head of the timeline. That ordering is the whole reason a publish and an
  // in-flight "load more" cannot collide.
  const createdAt = new Date().toISOString();
  const post: Post = {
    id: snowflake(createdAt, 676, publishedByKey.size),
    author: VIEWER,
    text,
    image: null,
    created_at: createdAt,
    revision: 1,
    edited_at: null,
    edit_count: 0,
    editable_until: new Date(Date.parse(createdAt) + 15 * 60_000).toISOString(),
  };

  state.posts = [post, ...state.posts];
  revisions.set(post.id, [{ revision: 1, text, created_at: createdAt }]);
  if (typeof key === 'string') publishedByKey.set(key, post);

  send(res, 201, post, { Location: `/v1/posts/${post.id}`, ETag: `"${post.revision}"` });
}

export function chirpMock(): Plugin {
  return {
    name: 'chirp-mock',
    configureServer(server) {
      server.middlewares.use('/v1', (req, res) => {
        void (async () => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const method = req.method ?? 'GET';

          // Makes the loading states observable without a throttled network panel.
          const latency = Number(url.searchParams.get('latency') ?? 0);
          if (Number.isFinite(latency) && latency > 0) await delay(latency);

          // The middleware is mounted at /v1, so url.pathname arrives with that prefix stripped.
          const path = url.pathname;

          if (method === 'GET' && path === '/timeline/home') {
            const fault = maybeFault(url, 'timeline');
            if (fault !== null) {
              sendFault(res, fault);
              return;
            }
            getHomeTimeline(url, res);
            return;
          }

          const patchMatch = /^\/posts\/(\d+)$/.exec(path);
          if (method === 'PATCH' && patchMatch !== null) {
            const fault = maybeFault(url, 'patch');
            if (fault !== null) {
              sendFault(res, fault);
              return;
            }
            await edit(patchMatch[1] ?? '', req, res);
            return;
          }

          const revisionsMatch = /^\/posts\/(\d+)\/revisions$/.exec(path);
          if (method === 'GET' && revisionsMatch !== null) {
            const fault = maybeFault(url, 'revisions');
            if (fault !== null) {
              sendFault(res, fault);
              return;
            }
            getRevisions(revisionsMatch[1] ?? '', res);
            return;
          }

          if (method === 'POST' && path === '/posts') {
            const fault = maybeFault(url, 'publish');
            if (fault !== null) {
              sendFault(res, fault);
              return;
            }
            await publish(req, res);
            return;
          }

          // Anything else under /v1 is an endpoint this view does not consume. 404 in the
          // contract's own error shape rather than falling through to Vite's HTML 404.
          fail(res, 'post_not_found', 404, `No mock route for ${method} /v1${path}.`, false);
        })();
      });
    },
  };
}
