import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { getHomeTimeline } from '../api/client';
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

  return {
    status,
    items,
    pending,
    cursor,
    hasMore,
    degraded,
    error,
    loadMoreError,
    draft,
    isEmpty,
    canLoadMore,
    loadFirstPage,
    loadMore,
    restart,
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
