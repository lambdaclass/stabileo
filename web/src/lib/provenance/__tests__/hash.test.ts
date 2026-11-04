import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { sha256Hex } from '../sha256';
import { canonicalExactJson, exactHash } from '../exact-hash';

describe('sha256Hex', () => {
  it('matches the FIPS 180-4 vectors and node:crypto', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const n of [55, 56, 63, 64, 65, 1000]) {
      const s = 'é'.repeat(n);
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
});

describe('exactHash', () => {
  it('does not depend on key order or undefined members', () => {
    expect(exactHash({ a: 1, b: [2, { c: 3, d: undefined }] })).toBe(exactHash({ b: [2, { c: 3 }], a: 1 }));
  });
  it('tells apart numbers that differ in the last bit, and -0 from 0', () => {
    expect(exactHash({ x: 0.1 + 0.2 })).not.toBe(exactHash({ x: 0.3 }));
    expect(exactHash(-0)).not.toBe(exactHash(0));
    expect(canonicalExactJson([NaN, Infinity, -Infinity])).toBe('["NaN","Infinity","-Infinity"]');
  });
  it('drops omitted keys at every depth', () => {
    expect(exactHash({ r: 1, timings: { t: 5 }, n: { timings: 9, v: 2 } }, ['timings'])).toBe(exactHash({ r: 1, n: { v: 2 } }));
  });
  it('reads Maps by sorted key and typed arrays as arrays', () => {
    expect(canonicalExactJson(new Map([[2, 'b'], [1, 'a']]))).toBe('{"1":"a","2":"b"}');
    expect(canonicalExactJson(new Float64Array([1.5, -0]))).toBe('[1.5,-0]');
  });
});
