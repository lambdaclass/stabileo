/**
 * Raw-deflate decompression with a ceiling on what it may produce.
 *
 * A share link is attacker-controlled input: anyone can craft `#data=` / `#code=` and send it.
 * Deflate expands up to ~1032:1, so a link of a couple of megabytes — which a browser accepts
 * in a fragment — would inflate to gigabytes inside `inflateSync` and take the tab down before
 * any validation ran. Here the input is fed in small slices, so the output can overshoot the
 * ceiling by at most one slice's worth (~1 MB) before the read is refused.
 */
import { Inflate } from 'fflate';

/**
 * What a shared model may decompress to. The largest real link measured (the 3D industrial
 * shed, ~10 kB of link) inflates to well under 1 MB; 32 MB leaves two orders of magnitude.
 */
export const MAX_SHARE_INFLATED_BYTES = 32 * 1024 * 1024;

/** Compressed bytes per push: 1 KiB can expand to at most ~1 MiB. */
const SLICE = 1024;

export class InflateLimitError extends Error {
  constructor(limit: number) {
    super(`decompressed data exceeds ${limit} bytes`);
    this.name = 'InflateLimitError';
  }
}

export function inflateBounded(data: Uint8Array, maxBytes: number = MAX_SHARE_INFLATED_BYTES): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > maxBytes) throw new InflateLimitError(maxBytes);
    chunks.push(chunk);
  });
  if (data.length === 0) inf.push(data, true);
  for (let off = 0; off < data.length; off += SLICE) {
    const end = Math.min(off + SLICE, data.length);
    inf.push(data.subarray(off, end), end === data.length);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
