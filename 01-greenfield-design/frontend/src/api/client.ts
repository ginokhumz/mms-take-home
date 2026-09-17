import { request } from './http';
import { ApiError } from './errors';
import type {
  EditRequest,
  Post,
  PostId,
  PublishRequest,
  RevisionsResponse,
  TimelinePage,
} from './types';

/**
 * One function per endpoint this view consumes, and the only place a wire body becomes a typed
 * object. The contract defines endpoints for a single post, search, follow and unfollow, account
 * deletion and media upload; none of them are consumed here and none are called from this module.
 */

/** Home timeline, newest first, cursor-paginated. */
export async function getHomeTimeline(
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<TimelinePage> {
  const query = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  if (opts.cursor != null) query.set('cursor', opts.cursor);
  const { data } = await request<TimelinePage>('GET', '/timeline/home', { query });

  // The contract states next_cursor is null exactly when has_more is false. Asserted rather than
  // assumed: a server that broke this invariant would make the store loop forever or stall with a
  // "load more" button that can never do anything, both of which are silent failures.
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

/**
 * Publish. The Idempotency-Key belongs to the caller, which generates it once per compose attempt
 * and passes the same one back on every retry of that post.
 */
export async function publishPost(body: PublishRequest, idempotencyKey: string): Promise<Post> {
  const { data } = await request<Post>('POST', '/posts', { body, idempotencyKey });
  return data;
}

/**
 * Edit inside the window. If-Match carries the revision as an ETag, derived from the Post already
 * in the store rather than stashed from a response header: the contract defines the ETag as
 * exactly the revision, so the Post is the one source of truth for it.
 */
export async function editPost(
  id: PostId,
  body: EditRequest,
  ifMatchRevision: number,
): Promise<Post> {
  const { data } = await request<Post>('PATCH', `/posts/${id}`, { body, ifMatchRevision });
  return data;
}

/** Revision history: public, newest first, not paginated. */
export async function getRevisions(id: PostId): Promise<RevisionsResponse> {
  const { data } = await request<RevisionsResponse>('GET', `/posts/${id}/revisions`);
  return data;
}
