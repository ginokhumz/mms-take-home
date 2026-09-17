import type { Plugin } from 'vite';
import type { ServerResponse } from 'node:http';
import type { Post, TimelinePage } from '../src/api/types';
import { posts } from './corpus';
import { encodeCursor, decodeCursor } from './snowflake';
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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

          // Anything else under /v1 is an endpoint this view does not consume. 404 in the
          // contract's own error shape rather than falling through to Vite's HTML 404.
          fail(res, 'post_not_found', 404, `No mock route for ${method} /v1${path}.`, false);
        })();
      });
    },
  };
}
