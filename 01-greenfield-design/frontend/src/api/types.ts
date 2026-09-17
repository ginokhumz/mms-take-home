// Every type here is transcribed from ../../DELIVERABLE.md §5. Field names are wire names
// (snake_case) on purpose: renaming them in the client would put the code and the contract into
// disagreement, which is the one drift worth preventing at compile time.

/** §5.0: IDs cross the wire as decimal strings — 2^63 exceeds Number.MAX_SAFE_INTEGER. */
export type PostId = string;
export type UserId = string;

/** §5.0: RFC 3339 UTC, millisecond precision, e.g. 2026-09-17T10:00:00.000Z */
export type Timestamp = string;

export interface Author {
  id: UserId;
  handle: string;
  display_name: string;
  avatar_url: string;
  // §5.0: authors deliberately carry no follower_count — the wide/narrow split is internal.
}

export interface PostImage {
  url: string;
  width: number;
  height: number;
  alt: string | null;
}

export interface Post {
  id: PostId;
  author: Author;
  /** §5.1#1: 1–500 Unicode code points after NFC normalisation. */
  text: string;
  /** §5.0: null when there is no image. Never partially populated — hence one nullable object. */
  image: PostImage | null;
  created_at: Timestamp;
  /** §5.0: 1 on publish, incremented per edit. Also the ETag value (§5.1#4). */
  revision: number;
  edited_at: Timestamp | null;
  /** §5.0: edit_count > 0 IS the edited indicator. */
  edit_count: number;
  /**
   * §5.0: present ONLY when the caller is the author and the 15-minute window is open; absent
   * otherwise. Optional, not nullable — with exactOptionalPropertyTypes that distinction is
   * enforced rather than decorative. Advisory: the server re-checks on PATCH.
   */
  editable_until?: Timestamp;
}

export interface PageInfo {
  /** §5.1#2: null exactly when has_more is false. Opaque to the client (§5.3). */
  next_cursor: string | null;
  has_more: boolean;
}

export interface TimelinePage {
  items: Post[];
  page: PageInfo;
  /** §5.1#2: push set unavailable, served from the pull path alone. A banner, not an error. */
  degraded: boolean;
}

export interface Revision {
  revision: number;
  text: string;
  created_at: Timestamp;
}

export interface RevisionsResponse {
  post_id: PostId;
  revisions: Revision[];
}

/** §5.1#1 request body. `media_id`/`alt` omitted: image upload is out of scope here. */
export interface PublishRequest {
  text: string;
}

/** §5.1#4 request body. Text only — §1.3, the image cannot be swapped. */
export interface EditRequest {
  text: string;
}
