import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { getHomeTimeline, publishPost } from '../api/client';
import { ApiError } from '../api/errors';
import type { Post } from '../api/types';

export interface PendingPost {
  localId: string;
  text: string;
  /** Generated once per compose attempt and reused on every retry of that same post. */
  idempotencyKey: string;
  createdAt: string;
  /**
   * A *retryable* publish failure for THIS entry. It lives on the entry and not on the store
   * because `pending` is an array: a store-level slot would let a second compose attempt wipe the
   * message belonging to a first entry still sitting there with a "Try again" button. Terminal
   * failures remove the entry, so their error goes to `composeError` instead.
   */
  error?: ApiError;
}

// The timeline accepts a limit of 1 to 100 and defaults to 20. Twenty is also the page size the
// capacity work costed the read path against, so the frontend asks for exactly what was assumed.
const PAGE_LIMIT = 20;

export const useTimelineStore = defineStore('timeline', () => {
  const status = ref<'idle' | 'loading-first' | 'ready' | 'loading-more' | 'error'>('idle');
  const items = ref<Post[]>([]); // server-confirmed, descending id
  const pending = ref<PendingPost[]>([]); // optimistic only; never mixed into items
  const cursor = ref<string | null>(null);
  const hasMore = ref(false);
  const degraded = ref(false);
  /** First-page failure: replaces the list. Only ever set while items is empty. */
  const error = ref<ApiError | null>(null);
  /**
   * Page-N failure: the list stays rendered. Two slots, deliberately — a failed "load more" must
   * not blank forty posts the reader is looking at.
   */
  const loadMoreError = ref<ApiError | null>(null);
  const draft = ref('');
  /**
   * Terminal publish failure only. A retryable one lives on the pending entry instead, because
   * that entry is still on screen holding the text and the idempotency key it would retry with.
   */
  const composeError = ref<ApiError | null>(null);

  const isEmpty = computed(
    () => status.value === 'ready' && items.value.length === 0 && pending.value.length === 0,
  );
  const canLoadMore = computed(
    () => hasMore.value && cursor.value !== null && status.value !== 'loading-more',
  );

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
      // Pagination is forward-only over descending IDs, so this is append-only. A post already
      // returned has an ID at or above the cursor and cannot come back on a later page.
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

  /**
   * A rejected cursor is terminal — the client starts again at page 1, which is a different action
   * from retrying the request that failed, and the UI offers it as a different button.
   */
  async function restart(): Promise<void> {
    items.value = [];
    cursor.value = null;
    hasMore.value = false;
    loadMoreError.value = null;
    await loadFirstPage();
  }

  async function publish(text: string): Promise<void> {
    const entry: PendingPost = {
      localId: crypto.randomUUID(),
      text,
      // Generated once, before the first attempt, and reused for every retry of THIS post.
      idempotencyKey: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    pending.value = [entry, ...pending.value];
    draft.value = '';
    // Clears the compose box's own error only. Errors on entries still in `pending` belong to
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
        // The entry stays, marked failed, carrying its own error and a retry affordance that
        // resends under the same idempotency key. Dropping it here would throw away the key.
        setPendingError(entry.localId, err);
      } else {
        // Terminal: resending cannot help. Roll the optimistic entry back and hand the text back
        // to the compose box so the user does not lose it.
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
    // A retry under a completed idempotency key returns the ORIGINAL post, so it may already be
    // in the list: a publish that timed out but actually succeeded, followed by a reload that
    // fetched it. Without this guard it renders twice.
    if (items.value.some((p) => p.id === confirmed.id)) return;
    // IDs are time-ordered, so a new post's ID is strictly greater than anything already fetched.
    // The head is its correct position and loadMore only ever appends, which is why an in-flight
    // "load more" needs no cancelling: the two writes touch disjoint ends of the list.
    items.value = [confirmed, ...items.value];
  }

  return {
    status,
    items,
    pending,
    cursor,
    hasMore,
    degraded,
    error,
    loadMoreError,
    composeError,
    draft,
    isEmpty,
    canLoadMore,
    loadFirstPage,
    loadMore,
    restart,
    publish,
    retryPending,
  };
});

function asApiError(e: unknown): ApiError {
  return e instanceof ApiError
    ? e
    : new ApiError({
        status: 500,
        code: 'internal_error',
        message: 'Something went wrong. Please try again.',
        retryable: true,
        requestId: 'local',
      });
}
