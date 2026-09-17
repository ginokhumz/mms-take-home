import type { UserId } from './types';

/**
 * The viewer identity. The contract puts this in the access token's `sub`, but auth UI is out of
 * scope for this build and the contract defines no endpoint that returns the current user, so the
 * identity is a constant shared with the fixture corpus rather than something fetched.
 */
export const VIEWER_ID: UserId = '41777219';

const MOCK_KEYS = ['fault', 'fault_on', 'fault_after', 'empty', 'degraded', 'latency'] as const;

/**
 * Mock affordance only — these parameters are a fixture mechanism and not part of the production
 * API. Forwarding the page's own query string onto API calls is what lets the error path be
 * triggered from the URL or from the mock controls panel without editing code.
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
