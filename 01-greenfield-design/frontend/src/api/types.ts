// The API types, transcribed from the Chirp API contract. Field names are wire names (snake_case)
// on purpose: renaming them in the client would put the code and the contract into disagreement,
// which is the one kind of drift worth preventing at compile time.

/** IDs cross the wire as decimal strings — 2^63 exceeds Number.MAX_SAFE_INTEGER. */
export type PostId = string;
export type UserId = string;

/** RFC 3339 UTC, millisecond precision, e.g. 2026-09-17T10:00:00.000Z */
export type Timestamp = string;

export interface Author {
  id: UserId;
  handle: string;
  display_name: string;
  avatar_url: string;
  // Authors deliberately carry no follower_count: the wide/narrow fanout split is an internal
  // routing decision and is not exposed to clients.
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
  /** 1–500 Unicode code points, counted after NFC normalisation. */
  text: string;
  /** null when there is no image. Never partially populated — hence one nullable object. */
  image: PostImage | null;
  created_at: Timestamp;
  /** 1 on publish, incremented per edit. Also the value carried by the ETag. */
  revision: number;
  edited_at: Timestamp | null;
  /** edit_count > 0 is the edited indicator the frontend renders. */
  edit_count: number;
  /**
   * Present only when the caller is the author and the 15-minute edit window is still open;
   * absent otherwise. Optional rather than nullable — with exactOptionalPropertyTypes that
   * distinction is enforced rather than decorative. It is advisory: the server re-checks the
   * window on PATCH, so the UI must treat a 409 as the real answer.
   */
  editable_until?: Timestamp;
}

export interface PageInfo {
  /** null exactly when has_more is false. Opaque to the client. */
  next_cursor: string | null;
  has_more: boolean;
}

export interface TimelinePage {
  items: Post[];
  page: PageInfo;
  /**
   * True when the push set was unavailable and the page was served from the pull path alone:
   * fewer items than usual, and posts from narrow authors may be missing. A banner, not an error.
   */
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

/** Publish request body. media_id/alt are omitted: image upload is out of scope here. */
export interface PublishRequest {
  text: string;
}

/** Edit request body. Text only — the image cannot be swapped after publication. */
export interface EditRequest {
  text: string;
}
