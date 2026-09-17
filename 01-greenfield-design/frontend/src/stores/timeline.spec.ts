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
