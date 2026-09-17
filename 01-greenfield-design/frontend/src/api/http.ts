import { ApiError, isAutoRetryable, parseApiError } from './errors';
import type { UnavailableCode } from './errors';
import { passthroughParams } from './mockControls';

const BASE = '/v1';

/**
 * Every call carries a bearer token. Auth UI is out of scope for this build, so a placeholder
 * stands in and the fixture server does not validate it. Held in a module constant rather than
 * localStorage, so a cross-site scripting bug cannot read it back out of storage.
 */
const ACCESS_TOKEN = 'mock-access-token';

const MAX_ATTEMPTS = 3;

export interface RequestOptions {
  /**
   * The dependency this call depends on, used as the code when the request never reaches a server
   * and there is no error body to read. Required rather than defaulted, so adding an endpoint
   * cannot silently inherit another endpoint's dependency name.
   */
  unavailableCode: UnavailableCode;
  query?: URLSearchParams;
  body?: unknown;
  /** Required when publishing, and reused verbatim on every retry of that same post. */
  idempotencyKey?: string;
  /** The revision the client believes it is editing, sent as an ETag. */
  ifMatchRevision?: number;
}

/**
 * The single place the app talks to the network. Auth, idempotency, conditional requests and the
 * automatic-retry policy all live here, so no call site has to remember them and no call site can
 * disagree with another about them.
 *
 * Automatic retry of a publish is safe only because the same Idempotency-Key goes out on every
 * attempt: on a timeout the client cannot tell whether the post was created, and the key is what
 * makes asking again harmless. The two features are one feature.
 */
export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  opts: RequestOptions,
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
      // A network failure produces no response, so there is no contract-shaped error body to
      // parse. Synthesise one rather than letting a raw TypeError reach the UI, and name the
      // dependency this call actually needed: a failed publish must not report the timeline down.
      lastError = new ApiError({
        status: 503,
        code: opts.unavailableCode,
        message: 'Cannot reach Chirp. Check your connection.',
        retryable: true,
        requestId: 'local-network-error',
      });
      if (attempt < MAX_ATTEMPTS) {
        await backoff(attempt, null);
        continue;
      }
      throw lastError;
    }

    const requestId = res.headers.get('X-Request-Id') ?? 'unknown';

    if (res.ok) {
      // The body is unknown at this boundary; the client module is the one place it is given a
      // type, and it asserts the invariants the contract promises before handing it on.
      const data = (await res.json()) as T;
      return { data, etag: res.headers.get('ETag') };
    }

    const body: unknown = await res.json().catch(() => null);
    lastError = parseApiError(res.status, body, requestId);

    // Rate limiting and service-unavailable are the only two codes that drive an automatic retry,
    // and the backoff lives here rather than at each call site. Everything else surfaces at once.
    if (isAutoRetryable(lastError) && attempt < MAX_ATTEMPTS) {
      await backoff(attempt, res.headers.get('Retry-After'));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new Error('unreachable');
}

/** Exponential with jitter, never sooner than the Retry-After the server asked for. */
async function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  const serverMs = retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
  const ms = Math.max(serverMs, 2 ** (attempt - 1) * 250 + Math.random() * 250);
  await new Promise((r) => setTimeout(r, ms));
}
