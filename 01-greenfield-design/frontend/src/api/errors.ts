/**
 * Every 503 in the contract names the dependency that is down, rather than saying "a service".
 * That is why a call site has to say which one it is talking to: a request that dies on the wire
 * produces no response body to read a code out of, and the client has to synthesise one. Naming
 * the wrong dependency there would be a lie the user reads and an operator chases.
 */
export type UnavailableCode =
  | 'post_service_unavailable'
  | 'timeline_unavailable'
  | 'search_unavailable'
  | 'follow_service_unavailable';

/**
 * Every non-2xx response carries { error: { code, message, retryable, request_id, details? } } and
 * nothing else ever appears in an error position. The frontend switches on `code`, never on
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
 * Narrows an unknown response body into an ApiError. A body that is not contract-shaped means
 * something outside the contract answered (a proxy, a crash), so we synthesise the contract's
 * own unclassified code rather than surfacing foreign text to the user.
 */
export function parseApiError(status: number, body: unknown, fallbackRequestId: string): ApiError {
  if (isRecord(body) && isRecord(body['error'])) {
    const e = body['error'];
    const code = typeof e['code'] === 'string' ? e['code'] : 'internal_error';
    const message =
      typeof e['message'] === 'string' ? e['message'] : 'Something went wrong. Please try again.';
    // Fallback only if the server omitted the field, which the contract says never happens. It
    // must agree with the fallback below: 429 is retryable, so `status >= 500` alone is wrong.
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

/** Only 429 and 503 should ever drive an automatic retry. */
export function isAutoRetryable(err: ApiError): boolean {
  return err.retryable && (err.status === 429 || err.status === 503);
}
