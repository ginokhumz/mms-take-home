import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '../api/errors';
import type { Post, TimelinePage } from '../api/types';

vi.mock('../api/client', () => ({
  getHomeTimeline: vi.fn(),
  publishPost: vi.fn(),
  editPost: vi.fn(),
  getRevisions: vi.fn(),
}));

import * as client from '../api/client';
import { useTimelineStore } from './timeline';

function post(id: string): Post {
  return {
    id,
    author: {
      id: '88213004',
      handle: 'grace',
      display_name: 'Grace',
      avatar_url: 'https://cdn/a.webp',
    },
    text: `post ${id}`,
    image: null,
    created_at: '2026-09-17T10:00:00.000Z',
    revision: 1,
    edited_at: null,
    edit_count: 0,
  };
}

function page(ids: string[], next: string | null): TimelinePage {
  return {
    items: ids.map(post),
    page: { next_cursor: next, has_more: next !== null },
    degraded: false,
  };
}

const unavailable = new ApiError({
  status: 503,
  code: 'timeline_unavailable',
  message: 'Your timeline is temporarily unavailable.',
  retryable: true,
  requestId: 'req-1',
});

describe('timeline store — pagination', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(client.getHomeTimeline).mockReset();
  });

  it('loads the first page and exposes the cursor', async () => {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(['300', '200'], 'cur-200'));
    const s = useTimelineStore();
    await s.loadFirstPage();
    expect(s.status).toBe('ready');
    expect(s.items.map((p) => p.id)).toEqual(['300', '200']);
    expect(s.cursor).toBe('cur-200');
    expect(s.hasMore).toBe(true);
  });

  it('appends the next page and passes the cursor through', async () => {
    vi.mocked(client.getHomeTimeline)
      .mockResolvedValueOnce(page(['300', '200'], 'cur-200'))
      .mockResolvedValueOnce(page(['100'], null));
    const s = useTimelineStore();
    await s.loadFirstPage();
    await s.loadMore();
    expect(vi.mocked(client.getHomeTimeline).mock.calls[1]?.[0]).toMatchObject({
      cursor: 'cur-200',
    });
    expect(s.items.map((p) => p.id)).toEqual(['300', '200', '100']);
  });

  it('stops at the end: has_more false sets hasMore false and cursor null', async () => {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(['300'], null));
    const s = useTimelineStore();
    await s.loadFirstPage();
    expect(s.hasMore).toBe(false);
    expect(s.cursor).toBeNull();
    expect(s.canLoadMore).toBe(false);
  });

  it('an empty timeline is ready-and-empty, not an error', async () => {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page([], null));
    const s = useTimelineStore();
    await s.loadFirstPage();
    expect(s.status).toBe('ready');
    expect(s.isEmpty).toBe(true);
    expect(s.error).toBeNull();
  });

  it('a first-page failure sets error and leaves the list empty', async () => {
    vi.mocked(client.getHomeTimeline).mockRejectedValueOnce(unavailable);
    const s = useTimelineStore();
    await s.loadFirstPage();
    expect(s.status).toBe('error');
    expect(s.error?.code).toBe('timeline_unavailable');
    expect(s.items).toEqual([]);
  });

  it('a load-more failure keeps the rendered list and sets only loadMoreError', async () => {
    vi.mocked(client.getHomeTimeline)
      .mockResolvedValueOnce(page(['300', '200'], 'cur-200'))
      .mockRejectedValueOnce(unavailable);
    const s = useTimelineStore();
    await s.loadFirstPage();
    await s.loadMore();
    expect(s.items.map((p) => p.id)).toEqual(['300', '200']);
    expect(s.error).toBeNull();
    expect(s.loadMoreError?.code).toBe('timeline_unavailable');
    expect(s.status).toBe('ready');
    expect(s.cursor).toBe('cur-200'); // retryable: the cursor must survive the failure
  });

  it('invalid_cursor clears the list and restarts from page 1', async () => {
    const invalid = new ApiError({
      status: 400,
      code: 'invalid_cursor',
      message: 'This page link is no longer valid.',
      retryable: false,
      requestId: 'req-2',
    });
    vi.mocked(client.getHomeTimeline)
      .mockResolvedValueOnce(page(['300'], 'cur-300'))
      .mockRejectedValueOnce(invalid)
      .mockResolvedValueOnce(page(['400', '300'], 'cur-300'));
    const s = useTimelineStore();
    await s.loadFirstPage();
    await s.loadMore();
    expect(s.loadMoreError?.code).toBe('invalid_cursor');
    await s.restart();
    expect(s.items.map((p) => p.id)).toEqual(['400', '300']);
    expect(s.loadMoreError).toBeNull();
  });

  it('ignores a concurrent loadMore while one is in flight', async () => {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(['300'], 'cur-300'));
    const s = useTimelineStore();
    await s.loadFirstPage();
    let release: ((v: TimelinePage) => void) | undefined;
    vi.mocked(client.getHomeTimeline).mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );
    const first = s.loadMore();
    await s.loadMore(); // must be a no-op
    release?.(page(['200'], null));
    await first;
    expect(vi.mocked(client.getHomeTimeline)).toHaveBeenCalledTimes(2);
    expect(s.items.map((p) => p.id)).toEqual(['300', '200']);
  });
});

describe('timeline store — optimistic publish', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(client.getHomeTimeline).mockReset();
    vi.mocked(client.publishPost).mockReset();
  });

  async function ready(ids: string[], next: string | null = 'cur') {
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(ids, next));
    const s = useTimelineStore();
    await s.loadFirstPage();
    return s;
  }

  it('shows the post immediately, then reconciles it to the head of items exactly once', async () => {
    const s = await ready(['300', '200']);
    const confirmed = { ...post('400'), text: 'hello' };
    let release: ((p: Post) => void) | undefined;
    vi.mocked(client.publishPost).mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );

    const inFlight = s.publish('hello');
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]?.text).toBe('hello');
    expect(s.draft).toBe(''); // the compose box clears optimistically

    release?.(confirmed);
    await inFlight;
    expect(s.pending).toHaveLength(0);
    expect(s.items.map((p) => p.id)).toEqual(['400', '300', '200']);
    expect(s.items.filter((p) => p.id === '400')).toHaveLength(1);
  });

  it('reuses the same Idempotency-Key across a retry of the same post', async () => {
    const s = await ready(['300']);
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('hello');
    const key = s.pending[0]?.idempotencyKey;
    expect(key).toBeTypeOf('string');

    vi.mocked(client.publishPost).mockResolvedValueOnce({ ...post('400'), text: 'hello' });
    await s.retryPending(s.pending[0]!.localId);
    const keys = vi.mocked(client.publishPost).mock.calls.map((c) => c[1]);
    expect(keys[0]).toBe(key);
    // A timeout leaves the client unable to tell whether the post was created. The same key on
    // both attempts is what turns that ambiguity into a safe question to ask twice.
    expect(keys[1]).toBe(key);
  });

  it('rolls back on a terminal failure: pending cleared, draft restored, error surfaced', async () => {
    const s = await ready(['300']);
    const invalid = new ApiError({
      status: 400,
      code: 'validation_failed',
      message: 'Your post must be between 1 and 500 characters.',
      retryable: false,
      requestId: 'req-9',
    });
    vi.mocked(client.publishPost).mockRejectedValueOnce(invalid);
    await s.publish('x'.repeat(501));
    expect(s.pending).toHaveLength(0);
    expect(s.draft).toBe('x'.repeat(501));
    expect(s.composeError?.code).toBe('validation_failed');
    expect(s.items.map((p) => p.id)).toEqual(['300']); // the list is untouched
  });

  it('keeps the pending entry on a retryable failure, with the error on the entry', async () => {
    const s = await ready(['300']);
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('hello');
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]?.error?.retryable).toBe(true);
    expect(s.draft).toBe(''); // not rolled back: the entry still holds the text and the key
    expect(s.composeError).toBeNull(); // a retryable failure is not a compose-box error
  });

  it('a second compose attempt does not wipe the error on a still-pending first entry', async () => {
    const s = await ready(['300']);
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('first');
    const firstId = s.pending[0]!.localId;

    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('second');

    // Both entries are pending, and each still carries its own error. A single store-level slot
    // would have left the first rendering a "Try again" button with no message beside it.
    expect(s.pending).toHaveLength(2);
    expect(s.pending.find((p) => p.localId === firstId)?.error?.code).toBe('timeline_unavailable');
    expect(s.pending.find((p) => p.text === 'second')?.error?.code).toBe('timeline_unavailable');
  });

  it('clears only that entry error on retry, and only that entry', async () => {
    const s = await ready(['300']);
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('first');
    vi.mocked(client.publishPost).mockRejectedValueOnce(unavailable);
    await s.publish('second');

    const firstId = s.pending.find((p) => p.text === 'first')!.localId;
    vi.mocked(client.publishPost).mockResolvedValueOnce({ ...post('400'), text: 'first' });
    await s.retryPending(firstId);

    expect(s.items.map((p) => p.id)).toEqual(['400', '300']);
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]?.text).toBe('second');
    expect(s.pending[0]?.error?.code).toBe('timeline_unavailable'); // untouched
  });

  it('drops the pending entry rather than duplicating on an idempotent replay', async () => {
    const s = await ready(['300']);
    // The post is already in items: the server replayed the original body for a key it had
    // already completed.
    const replayed = { ...post('400'), text: 'hello' };
    vi.mocked(client.getHomeTimeline).mockResolvedValueOnce(page(['400', '300'], null));
    await s.restart();
    vi.mocked(client.publishPost).mockResolvedValueOnce(replayed);
    await s.publish('hello');
    expect(s.items.filter((p) => p.id === '400')).toHaveLength(1);
    expect(s.pending).toHaveLength(0);
  });

  describe('racing "load more"', () => {
    it('publish resolving first: no duplicate, no lost post', async () => {
      const s = await ready(['300', '200'], 'cur-200');
      let releaseMore: ((p: TimelinePage) => void) | undefined;
      let releasePublish: ((p: Post) => void) | undefined;
      vi.mocked(client.getHomeTimeline).mockReturnValueOnce(
        new Promise((r) => {
          releaseMore = r;
        }),
      );
      vi.mocked(client.publishPost).mockReturnValueOnce(
        new Promise((r) => {
          releasePublish = r;
        }),
      );

      const more = s.loadMore();
      const pub = s.publish('hello');
      releasePublish?.({ ...post('400'), text: 'hello' });
      await pub;
      releaseMore?.(page(['100'], null));
      await more;

      expect(s.items.map((p) => p.id)).toEqual(['400', '300', '200', '100']);
      expect(s.pending).toHaveLength(0);
    });

    it('load more resolving first: same result', async () => {
      const s = await ready(['300', '200'], 'cur-200');
      let releaseMore: ((p: TimelinePage) => void) | undefined;
      let releasePublish: ((p: Post) => void) | undefined;
      vi.mocked(client.getHomeTimeline).mockReturnValueOnce(
        new Promise((r) => {
          releaseMore = r;
        }),
      );
      vi.mocked(client.publishPost).mockReturnValueOnce(
        new Promise((r) => {
          releasePublish = r;
        }),
      );

      const more = s.loadMore();
      const pub = s.publish('hello');
      releaseMore?.(page(['100'], null));
      await more;
      releasePublish?.({ ...post('400'), text: 'hello' });
      await pub;

      expect(s.items.map((p) => p.id)).toEqual(['400', '300', '200', '100']);
      expect(s.pending).toHaveLength(0);
    });

    it('an in-flight load more is not cancelled by a publish', async () => {
      const s = await ready(['300'], 'cur-300');
      let releaseMore: ((p: TimelinePage) => void) | undefined;
      vi.mocked(client.getHomeTimeline).mockReturnValueOnce(
        new Promise((r) => {
          releaseMore = r;
        }),
      );
      vi.mocked(client.publishPost).mockResolvedValueOnce({ ...post('400'), text: 'hello' });

      const more = s.loadMore();
      await s.publish('hello');
      releaseMore?.(page(['200'], null));
      await more;
      expect(s.items.map((p) => p.id)).toEqual(['400', '300', '200']);
    });
  });
});
