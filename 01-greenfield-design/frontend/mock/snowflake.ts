// The ID layout and the cursor encoding are the contract's. Both are reproduced exactly, because
// the design document's worked trace quotes literal values from them:
//   snowflake('2026-09-17T10:00:00.000Z') === '1827639201234567890'
//   encodeCursor('1827639201234567890') === 'eyJ2IjoxLCJiIjoiMTgyNzYzOTIwMTIzNDU2Nzg5MCJ9'
// If either stops holding, the epoch or a field width is wrong.

/** The service epoch IDs are minted against. */
const EPOCH_MS = Date.UTC(2012, 10, 26, 2, 14, 18, 532);

/** (ms since epoch << 22) | (shard << 12) | sequence, returned as a decimal string. */
export function snowflake(iso: string, shard = 676, seq = 722): string {
  const ms = BigInt(Date.parse(iso) - EPOCH_MS);
  return ((ms << 22n) | (BigInt(shard) << 12n) | BigInt(seq)).toString();
}

/** Opaque base64url of {"v":1,"b":"<post_id>"} — the ID of the last item returned. */
export function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ v: 1, b: id })).toString('base64url');
}

/** Returns the boundary post ID, or null if the cursor is malformed — an invalid_cursor. */
export function decodeCursor(cursor: string): string | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    if (rec['v'] !== 1 || typeof rec['b'] !== 'string' || !/^\d+$/.test(rec['b'])) return null;
    return rec['b'];
  } catch {
    return null;
  }
}
