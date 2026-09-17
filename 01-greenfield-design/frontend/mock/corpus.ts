import type { Author, Post, PostId, Revision } from '../src/api/types';
import { snowflake } from './snowflake';

/**
 * Deterministic fixture data: fixed timestamps, no Date.now(), so the corpus is byte-identical on
 * every boot and nothing here depends on when a reviewer runs it.
 *
 * The identifiers are the worked trace's identifiers — grace is 88213004, rob is 41777219, and
 * post P is 1827639201234567890 — so the trace and the running app can be read side by side.
 */

/**
 * The viewer. Hardcoded and shared with the client through src/api/mockControls.ts: the contract
 * defines no /v1/me, and inventing an endpoint it does not have would be exactly the drift that
 * costs the most. There is no auth UI to derive an identity from.
 */
export const VIEWER: Author = {
  id: '41777219',
  handle: 'rob',
  display_name: 'Rob',
  avatar_url: 'https://cdn.chirp.example/a/41777219/64.webp',
};

const GRACE: Author = {
  id: '88213004',
  handle: 'grace',
  display_name: 'Grace',
  avatar_url: 'https://cdn.chirp.example/a/88213004/64.webp',
};

const NEWSDESK: Author = {
  id: '90112233',
  handle: 'newsdesk',
  display_name: 'The Newsdesk',
  avatar_url: 'https://cdn.chirp.example/a/90112233/64.webp',
};

const AVA: Author = {
  id: '77001122',
  handle: 'ava',
  display_name: 'Ava Mensah',
  avatar_url: 'https://cdn.chirp.example/a/77001122/64.webp',
};

const KOFI: Author = {
  id: '66554433',
  handle: 'kofi',
  display_name: 'Kofi',
  avatar_url: 'https://cdn.chirp.example/a/66554433/64.webp',
};

const LENA: Author = {
  id: '55443322',
  handle: 'lena',
  display_name: 'Lena',
  avatar_url: 'https://cdn.chirp.example/a/55443322/64.webp',
};

const OMAR: Author = {
  id: '44332211',
  handle: 'omar',
  display_name: 'Omar',
  avatar_url: 'https://cdn.chirp.example/a/44332211/64.webp',
};

const PRIYA: Author = {
  id: '33221100',
  handle: 'priya',
  display_name: 'Priya',
  avatar_url: 'https://cdn.chirp.example/a/33221100/64.webp',
};

const ROTATION: Author[] = [AVA, KOFI, LENA, OMAR, PRIYA, NEWSDESK, GRACE];

interface Seed {
  author: Author;
  at: string; // ISO, ms precision
  text: string;
  shard?: number;
  image?: Post['image'];
  /** Oldest first. Drives revision, edit_count and edited_at, so they cannot disagree. */
  edits?: Array<{ at: string; text: string }>;
  editableUntil?: string;
}

function build(seed: Seed): { post: Post; revisions: Revision[] } {
  const id: PostId = snowflake(seed.at, seed.shard ?? 676);
  const edits = seed.edits ?? [];
  const history: Revision[] = [{ revision: 1, text: seed.text, created_at: seed.at }];
  edits.forEach((e, i) => history.push({ revision: i + 2, text: e.text, created_at: e.at }));
  const current = history[history.length - 1]!;
  const last = edits[edits.length - 1];
  const post: Post = {
    id,
    author: seed.author,
    text: current.text,
    image: seed.image ?? null,
    created_at: seed.at,
    revision: current.revision,
    edited_at: last ? last.at : null,
    edit_count: edits.length,
    // Spread rather than assign: with exactOptionalPropertyTypes, `editable_until: undefined` is
    // not the same as an absent key, and the field is absent when the edit window is shut.
    ...(seed.editableUntil !== undefined ? { editable_until: seed.editableUntil } : {}),
  };
  return { post, revisions: history.slice().reverse() }; // revision history is served newest first
}

/**
 * Walks backwards one minute at a time from 10:00, so IDs come out strictly descending.
 * toISOString already produces the millisecond precision the contract asks for.
 */
function minutesBefore(base: string, minutes: number): string {
  return new Date(Date.parse(base) - minutes * 60_000).toISOString();
}

const BASE = '2026-09-17T10:00:00.000Z';

const BODIES = [
  'Deploy went out clean. No alerts, which is the part I never trust.',
  'The best debugging tool is still a second pair of eyes.',
  'Reading about consistent hashing again and finally seeing why the ring has virtual nodes.',
  'Coffee, then the on-call handover, then maybe some actual work.',
  'Someone has put a whiteboard in the kitchen and it is already full of architecture diagrams.',
  'Small commits are a kindness to whoever reviews them, including future you.',
  'A cache with no eviction policy is just a memory leak you have not met yet.',
  'Rewrote the query, went from 400ms to 9ms, felt briefly like a genius.',
  'The meeting could have been a message. The message could have been a comment in the code.',
  'Three years of logs and nobody has ever queried past the last fortnight.',
  'Every timeout is a decision about how long you are prepared to wait for bad news.',
  'Naming is hard because naming is design under a different hat.',
  'If the runbook has a step that says "ask Sam", it is not a runbook.',
  'Backfill finished overnight. 40 million rows, no drama.',
  'Turns out the flaky test was flaky for a real reason. It usually is.',
  'Pairing for an hour beat a day of solo guessing.',
  'The index was there all along, just on the wrong column order.',
  'Shipping on a Friday is fine if rolling back on a Friday is also fine.',
  'Wrote a postmortem where the root cause was a default nobody had ever looked at.',
  'Feature flags are how you make a deploy boring.',
  'The new starter found a bug on day two by reading the code we all skim.',
  'A queue is a promise that you will get to it, not that you will get to it soon.',
  'Rate limits should return numbers, not adjectives.',
  'Half of capacity planning is admitting which figure you made up.',
  'Idempotency keys turn "did that work?" into a question with an answer.',
  'Dashboards nobody looks at are just expensive wallpaper.',
  'The fix was one line. Finding it was four hours.',
  'Documenting the thing you just learned is the cheapest leverage there is.',
  'Retries without backoff are a denial of service you wrote yourself.',
  'Cursor pagination, once you have used it, makes offsets feel reckless.',
  'Every schema migration is a small negotiation with the past.',
  'Alert fatigue is a design failure, not a people failure.',
  'The staging environment lied to us again.',
  'Logs are for questions you did not know to ask. Metrics are for the ones you did.',
  'Deleted 2,000 lines today. Best commit of the week.',
  'You cannot grep a conversation, which is why decisions belong in writing.',
  'Load testing found nothing. Real traffic found it in eleven minutes.',
  'A 500 that tells you nothing is worse than a 500 that tells you which dependency.',
  'Refactoring under a green test suite is one of the genuine pleasures of the job.',
  'The hardest part of the outage was explaining it afterwards in plain words.',
  'Timezones. That is the whole post.',
  'Two people independently built the same helper. Neither knew. That is a docs problem.',
  'Graceful degradation beats a clever feature that fails hard.',
  'We measured it and the assumption was off by an order of magnitude.',
  'Code review is not a gate, it is a conversation with a paper trail.',
  'Sometimes the right answer is a boring database and no queue at all.',
  'The on-call week where nothing happened is a result, not luck.',
  'Instrument first. Optimise second. Guess never.',
  'Wrote the failing test first and the bug explained itself.',
  'A good error message names the thing that went wrong and what to do about it.',
];

const seeds: Seed[] = [];

// Post P: grace's post from the worked trace, at 10:00 exactly, already edited once at 10:10.
seeds.push({
  author: GRACE,
  at: BASE,
  text: 'first post',
  edits: [{ at: '2026-09-17T10:10:00.000Z', text: 'first post (fixed a typo)' }],
});

// The viewer's post with the edit window still open. The fixture clock is pinned to 10:12, so a
// window that closes at 10:14 is open and this is the one post offering an Edit control. The
// viewer's two older posts below close at 10:11 and 10:10, which is why they omit the field.
seeds.push({
  author: VIEWER,
  at: '2026-09-17T09:59:00.000Z',
  text: 'Trying out the edit window. This one is still inside it.',
  editableUntil: '2026-09-17T10:14:00.000Z',
});

// A second edited post, twice, so the indicator renders in its "Edited ×2" form as well.
seeds.push({
  author: NEWSDESK,
  at: '2026-09-17T09:58:00.000Z',
  text: 'Breaking: service degraded for some users.',
  edits: [
    { at: '2026-09-17T09:59:30.000Z', text: 'Breaking: service degraded for some users. Updating.' },
    { at: '2026-09-17T10:01:00.000Z', text: 'Resolved: service is back to normal for all users.' },
  ],
});

// The one post carrying an image.
seeds.push({
  author: AVA,
  at: '2026-09-17T09:57:00.000Z',
  text: 'The latency graph after the index change. I have never seen a cliff that clean.',
  image: {
    url: 'https://cdn.chirp.example/m/9f21c/1280.webp',
    width: 1280,
    height: 720,
    alt: 'A latency chart dropping sharply from 400ms to under 10ms',
  },
});

// Two more of the viewer's own posts, both outside the window: editable_until is absent, so the
// "no edit affordance" case is visible too.
seeds.push({
  author: VIEWER,
  at: '2026-09-17T09:56:00.000Z',
  text: 'This one is older than fifteen minutes, so there is no edit control on it.',
});
seeds.push({
  author: VIEWER,
  at: '2026-09-17T09:55:00.000Z',
  text: 'Third post of mine, also past the window.',
});

// Fill out to 55 posts, one minute apart, rotating authors.
for (let i = seeds.length; i < 55; i++) {
  seeds.push({
    author: ROTATION[i % ROTATION.length]!,
    at: minutesBefore(BASE, i),
    text: BODIES[i % BODIES.length]!,
  });
}

const built = seeds.map(build);

/**
 * Descending by ID, which is the same thing as reverse-chronological. Compared as BigInt
 * rather than as strings: equal-length decimal strings happen to sort correctly, but the IDs are
 * numbers and comparing them as numbers is the honest version.
 */
export const posts: Post[] = built
  .map((b) => b.post)
  .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : BigInt(a.id) > BigInt(b.id) ? -1 : 0));

export const revisions: Map<PostId, Revision[]> = new Map(
  built.map((b) => [b.post.id, b.revisions]),
);
