import { describe, it, expect } from 'vitest';
import { gzipBase64, gunzipBase64 } from '../gzip-base64';

describe('gzip + base64', () => {
  it('round-trips text, accents included, and compresses a repetitive document', async () => {
    const text = JSON.stringify({ name: 'Pórtico ñandú', nodes: Array.from({ length: 2000 }, (_, i) => ({ id: i, x: 0, y: 0 })) });
    const packed = await gzipBase64(text);
    expect(packed.length).toBeLessThan(text.length / 5);
    expect(await gunzipBase64(packed)).toBe(text);
  });

  it('produces a gzip stream, as the backend expects', async () => {
    const bytes = Uint8Array.from(atob(await gzipBase64('{}')), (c) => c.charCodeAt(0));
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
  });
});
