/**
 * A share link is untrusted input: its decompressed size is bounded, and a legacy (LZ-String)
 * payload too long to have been written by the app is refused before it is decoded.
 */
import { describe, expect, it } from 'vitest';
import { deflateSync } from 'fflate';
import { inflateBounded, InflateLimitError, MAX_SHARE_INFLATED_BYTES } from '../bounded-inflate';
import { decompressSnapshot, MAX_V1_LINK_CHARS } from '../url-sharing';
import { decodeCode } from '../../model/code/share';

const b64url = (u8: Uint8Array) => Buffer.from(u8).toString('base64url');

describe('inflateBounded', () => {
  it('round-trips data under the ceiling', () => {
    const src = new TextEncoder().encode('{"a":1}'.repeat(10_000));
    expect(inflateBounded(deflateSync(src))).toEqual(src);
  });

  it('round-trips empty input', () => {
    expect(inflateBounded(deflateSync(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  it('refuses output past the ceiling instead of materialising it', () => {
    const bomb = deflateSync(new Uint8Array(4 * 1024 * 1024)); // ~4 kB → 4 MB
    expect(() => inflateBounded(bomb, 1024 * 1024)).toThrow(InflateLimitError);
  });
});

describe('share link decoders under a decompression bomb', () => {
  // Zeros past the default ceiling: compresses to ~35 kB, a size a fragment carries easily.
  const bomb = deflateSync(new Uint8Array(MAX_SHARE_INFLATED_BYTES + 1024 * 1024), { level: 9 });

  it('#data= v2 payload returns null', () => {
    expect(decompressSnapshot('2.' + b64url(bomb))).toBeNull();
  });

  it('#code= payload returns null', () => {
    expect(decodeCode(b64url(bomb))).toBeNull();
  });

  it('an oversized legacy v1 payload is refused before decoding', () => {
    expect(decompressSnapshot('A'.repeat(MAX_V1_LINK_CHARS + 1))).toBeNull();
  });
});
