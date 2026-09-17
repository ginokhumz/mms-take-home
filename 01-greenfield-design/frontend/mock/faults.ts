/**
 * Every row of the contract's error table, reachable by query parameter with the status, the body
 * and the headers that row promises. The contract says the fixture layer honours `?fault=<code>`
 * so the error path can be produced without editing code; this is that mechanism. It is a mock
 * affordance and not part of the production API.
 */

export type FaultTarget = 'timeline' | 'publish' | 'patch' | 'revisions';

interface FaultSpec {
  status: number;
  message: string;
  retryable: boolean;
  /** Seconds. Required on 429 and 503. */
  retryAfter?: number;
  details?: Record<string, unknown>;
}

/**
 * Keys are the contract's `code` enum, every row of it. Adding a row is the only way to add a
 * reachable fault.
 *
 * Several codes belong to endpoints this view never calls — search, follow, account deletion and
 * media upload. They are here because the contract promises any code in the table can be produced
 * without editing code, and a list that quietly stopped at the four consumed endpoints would make
 * that promise false. Forcing one of them on a consumed endpoint is also the cheapest way to see
 * that the error rendering is driven by the model and not by a per-code branch.
 */
export const FAULTS: Record<string, FaultSpec> = {
  validation_failed: {
    status: 400,
    message: 'Your post must be between 1 and 500 characters.',
    retryable: false,
  },
  invalid_cursor: {
    status: 400,
    message: 'This page link is no longer valid. Start from the top.',
    retryable: false,
  },
  confirm_mismatch: {
    status: 400,
    message: 'The confirmation did not match. Nothing has been deleted.',
    retryable: false,
  },
  unauthenticated: { status: 401, message: 'Please sign in again.', retryable: false },
  token_expired: { status: 401, message: 'Your session expired.', retryable: false },
  not_author: { status: 403, message: 'You can only edit your own posts.', retryable: false },
  cannot_follow_self: { status: 403, message: 'You cannot follow yourself.', retryable: false },
  post_not_found: { status: 404, message: 'This post is no longer available.', retryable: false },
  user_not_found: { status: 404, message: 'This account is no longer available.', retryable: false },
  edit_window_closed: {
    status: 409,
    message: 'This post can no longer be edited.',
    retryable: false,
    details: { editable_until: '2026-09-17T10:15:00.000Z' },
  },
  idempotency_in_progress: {
    status: 409,
    message: 'Still publishing. Try again in a moment.',
    retryable: true,
    retryAfter: 1,
  },
  idempotency_key_reuse: {
    status: 409,
    message: 'This post was already published.',
    retryable: false,
  },
  media_not_ready: {
    status: 409,
    message: 'That image has not finished uploading yet.',
    retryable: false,
  },
  purge_in_flight: {
    status: 409,
    message: 'This account is being deleted.',
    retryable: false,
  },
  revision_conflict: {
    status: 412,
    message: 'This post changed since you opened it. Reload to see the latest version.',
    retryable: false,
  },
  image_too_large: {
    status: 413,
    message: 'That image is larger than 2 MB.',
    retryable: false,
  },
  unsupported_media_type: {
    status: 415,
    message: 'Images must be JPEG, PNG or WebP.',
    retryable: false,
  },
  rate_limited: {
    status: 429,
    message: 'You are posting too quickly. Please wait.',
    retryable: true,
    retryAfter: 2,
    details: { limit: 300, reset_at: '2026-09-17T11:00:00.000Z' },
  },
  internal_error: {
    status: 500,
    message: 'Something went wrong. Please try again.',
    retryable: true,
  },
  post_service_unavailable: {
    status: 503,
    message: 'Posting is temporarily unavailable.',
    retryable: true,
    retryAfter: 2,
  },
  timeline_unavailable: {
    status: 503,
    message: 'Your timeline is temporarily unavailable.',
    retryable: true,
    retryAfter: 2,
  },
  search_unavailable: {
    status: 503,
    message: 'Search is temporarily unavailable.',
    retryable: true,
    retryAfter: 2,
  },
  follow_service_unavailable: {
    status: 503,
    message: 'Following is temporarily unavailable.',
    retryable: true,
    retryAfter: 2,
  },
};

export interface FaultResponse {
  status: number;
  headers: Record<string, string>;
  body: { error: Record<string, unknown> };
}

/** Counts successful responses per target, so ?fault_after=<n> can let n pages through first. */
const served = new Map<FaultTarget, number>();

export function resetFaultCounters(): void {
  served.clear();
}

function requestId(): string {
  // Shaped like the ULIDs the contract uses in its examples. Random, because a request ID that
  // repeated across requests would be useless for the debugging it exists for.
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let out = '';
  for (let i = 0; i < 26; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function faultResponse(code: string, spec: FaultSpec): FaultResponse {
  const id = requestId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // request_id is echoed in X-Request-Id. They are the same value, not two values.
    'X-Request-Id': id,
  };
  if (spec.retryAfter !== undefined) headers['Retry-After'] = String(spec.retryAfter);

  const error: Record<string, unknown> = {
    code,
    message: spec.message,
    retryable: spec.retryable,
    request_id: id,
  };
  if (spec.details !== undefined) error['details'] = spec.details;

  return { status: spec.status, headers, body: { error } };
}

/**
 * Decides whether this request should fail.
 *
 * `fault_on` scopes the fault to one endpoint, which is what makes a page-1 failure and a
 * load-more failure separately reachable. `fault_after=n` serves n successful responses for that
 * target before failing — the only way to reach a load-more error, since page 1 has to succeed
 * first for there to be a "load more" at all.
 *
 * An unknown `fault` value returns 400 validation_failed rather than being ignored: silently
 * dropping a typo would make a failed demo of the error path look like a passing one.
 */
export function maybeFault(url: URL, endpoint: FaultTarget): FaultResponse | null {
  const code = url.searchParams.get('fault');
  if (code === null || code === '') return null;

  const target = url.searchParams.get('fault_on');
  if (target !== null && target !== endpoint) return null;

  const spec = FAULTS[code];
  if (spec === undefined) {
    return faultResponse('validation_failed', {
      status: 400,
      message: `Unknown fault code "${code}". Check the list in mock/faults.ts.`,
      retryable: false,
    });
  }

  const after = Number(url.searchParams.get('fault_after') ?? 0);
  if (Number.isFinite(after) && after > 0) {
    const count = served.get(endpoint) ?? 0;
    if (count < after) {
      served.set(endpoint, count + 1);
      return null;
    }
  }

  return faultResponse(code, spec);
}
