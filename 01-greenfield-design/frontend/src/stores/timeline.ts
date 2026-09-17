import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { editPost, getHomeTimeline, publishPost } from '../api/client';
import { ApiError } from '../api/errors';
import type { Post, PostId } from '../api/types';

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
  /**
   * Describes the list currently on screen, not the last page fetched. The server sets the flag
   * per page, but the reader is looking at every page at once: clearing it because page 2 came
   * back healthy would retract a warning about page 1 while page 1 is still rendered. It resets
   * only when the list itself is replaced, which is the one moment the warning stops applying.
   */
  const degraded = ref(false);
  /**
   * Bumped by every fetch that replaces or extends `items`, and checked again before that fetch
   * writes anything. A response whose epoch has moved on belongs to a list the user has already
   * discarded, so it is dropped rather than merged.
   *
   * `loadMore` is additionally guarded by `canLoadMore`, but that only stops two "load more"
   * calls overlapping. It does not stop a restart landing on top of one, or two first-page loads
   * from an impatient double-click on "Try again" — where the slower response wins and leaves the
   * store holding a cursor that does not belong to the rendered list.
   *
   * A counter rather than an AbortController on purpose: the request may well have been worth
   * completing, and the question here is only whether its result is still allowed to be written.
   */
  const epoch = ref(0);
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
    const mine = ++epoch.value;
    status.value = 'loading-first';
    error.value = null;
    loadMoreError.value = null;
    try {
      const page = await getHomeTimeline({ limit: PAGE_LIMIT });
      if (mine !== epoch.value) return;
      items.value = page.items;
      cursor.value = page.page.next_cursor;
      hasMore.value = page.page.has_more;
      // A fresh first page replaces the whole list, so this is the assignment that resets the flag.
      degraded.value = page.degraded;
      status.value = 'ready';
    } catch (e) {
      if (mine !== epoch.value) return;
      error.value = asApiError(e);
      items.value = [];
      status.value = 'error';
    }
  }

  async function loadMore(): Promise<void> {
    if (!canLoadMore.value) return;
    const from = cursor.value;
    const mine = ++epoch.value;
    status.value = 'loading-more';
    loadMoreError.value = null;
    try {
      const page = await getHomeTimeline({ limit: PAGE_LIMIT, cursor: from });
      if (mine !== epoch.value) return;
      // Pagination is forward-only over descending IDs, so this is append-only. A post already
      // returned has an ID at or above the cursor and cannot come back on a later page.
      items.value = items.value.concat(page.items);
      cursor.value = page.page.next_cursor;
      hasMore.value = page.page.has_more;
      // Sticky while the list grows: a degraded page stays degraded once it is on screen.
      degraded.value = degraded.value || page.degraded;
    } catch (e) {
      if (mine !== epoch.value) return;
      // The cursor is NOT cleared: on a retryable failure the same cursor is still correct.
      loadMoreError.value = asApiError(e);
    } finally {
      // Only if this response is still the current one — a superseded page must not drop the
      // store out of the 'loading-first' state the request that replaced it just set.
      if (mine === epoch.value) status.value = 'ready';
    }
  }

  /**
   * A rejected cursor is terminal — the client starts again at page 1, which is a different action
   * from retrying the request that failed, and the UI offers it as a different button.
   *
   * loadFirstPage bumps the epoch on entry, so a "load more" still in flight when this runs is
   * invalidated and cannot append its page to a list that has just been thrown away.
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

  const editError = ref<ApiError | null>(null);

  /**
   * No optimistic update here, and the asymmetry with publish is deliberate. The window the
   * client can see is advisory and the server re-checks it, so the only honest answer about
   * whether an edit landed is the response to the request.
   */
  async function applyEdit(id: PostId, text: string): Promise<boolean> {
    const current = items.value.find((p) => p.id === id);
    if (current === undefined) return false;
    editError.value = null;
    try {
      // If-Match carries the revision the client believes it is editing, taken from the post it
      // is rendering. The contract defines the ETag as exactly that revision.
      const updated = await editPost(id, { text }, current.revision);
      // An edit does not change the post's ID, so this is a replacement in place: no reordering,
      // no effect on the cursor, and a reader part-way through paginating sees only new text.
      items.value = items.value.map((p) => (p.id === id ? updated : p));
      return true;
    } catch (e) {
      editError.value = asApiError(e);
      return false;
    }
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
    editError,
    draft,
    isEmpty,
    canLoadMore,
    loadFirstPage,
    loadMore,
    restart,
    publish,
    retryPending,
    applyEdit,
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
