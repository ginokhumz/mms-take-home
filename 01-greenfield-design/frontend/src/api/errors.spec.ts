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
  it('preserves every field of the error model, retryable included', () => {
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
    const body = {
      error: {
        code: 'idempotency_in_progress',
        message: 'Try again.',
        retryable: true,
        request_id: 'r1',
      },
    };
    expect(parseApiError(409, body, 'fallback-id').retryable).toBe(true);
  });

  it('synthesises a contract-shaped error when the body is not contract-shaped', () => {
    const err = parseApiError(502, '<html>gateway</html>', 'x-req-7');
    expect(err.code).toBe('internal_error');
    expect(err.retryable).toBe(true); // 502: transport-level, safe to retry
    expect(err.requestId).toBe('x-req-7');
    expect(err.message).not.toContain('<html>');
  });
});
