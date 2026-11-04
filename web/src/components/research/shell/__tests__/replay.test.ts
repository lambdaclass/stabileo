import { describe, expect, it } from 'vitest';
import { decodeReplay, fetchReplay } from '../replay';
import { gzipSync } from 'node:zlib';

/** A replay of two nodes, one element (degenerate, it is only data) and one step, built by hand. */
function sample(overrides: Record<string, unknown> = {}): ArrayBuffer {
  const header = JSON.stringify({ nodes: 2, elements: 1, damage_max: 1.05, displacement_scale: [0.5], steps: [{ step: 0 }], config: {}, ...overrides });
  const json = new TextEncoder().encode(header);
  const pad = (4 - ((12 + json.length) % 4)) % 4;
  const size = 12 + json.length + pad + 16 + 8 + 6;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const b = new Uint8Array(buf);
  b.set([83, 82, 80, 76]);
  dv.setUint32(4, 1, true);
  dv.setUint32(8, json.length, true);
  b.set(json, 12);
  b.fill(32, 12 + json.length, 12 + json.length + pad);
  let o = 12 + json.length + pad;
  [0, 0, 1, 2].forEach((v, i) => dv.setFloat32(o + 4 * i, v, true));
  o += 16;
  [0, 1, 1, 0].forEach((v, i) => dv.setUint16(o + 2 * i, v, true));
  o += 8;
  b[o] = 0;
  b[o + 1] = 255;
  dv.setInt8(o + 2, 127);
  dv.setInt8(o + 3, -127);
  dv.setInt8(o + 4, 0);
  dv.setInt8(o + 5, 64);
  return buf;
}

describe('decodeReplay', () => {
  it('reads the mesh and dequantises damage and displacement', () => {
    const r = decodeReplay<{ step: number }>(sample());
    expect(Array.from(r.nodes)).toEqual([0, 0, 1, 2]);
    expect(Array.from(r.elements)).toEqual([0, 1, 1, 0]);
    expect(r.frames).toHaveLength(1);
    expect(r.frames[0].damage[1]).toBeCloseTo(1.05, 6);
    expect(r.frames[0].displacement[0]).toBeCloseTo(0.5, 6);
    expect(r.frames[0].displacement[2]).toBeCloseTo(-0.5, 6);
    expect(r.frames[0].displacement[3]).toBeCloseTo((64 / 127) * 0.5, 6);
    expect(r.frames[0].step.step).toBe(0);
  });

  it('refuses anything that is not a version 1 replay', () => {
    expect(() => decodeReplay(new ArrayBuffer(8))).toThrow();
    const bad = sample();
    new DataView(bad).setUint32(4, 2, true);
    expect(() => decodeReplay(bad)).toThrow();
  });

  it('fetches a gzip-compressed replay, and one the host already inflated', async () => {
    const raw = new Uint8Array(sample());
    for (const body of [gzipSync(raw), raw]) {
      const orig = globalThis.fetch;
      globalThis.fetch = (async () => new Response(body)) as typeof fetch;
      try {
        const r = await fetchReplay<{ step: number }>('x');
        expect(r.frames).toHaveLength(1);
      } finally {
        globalThis.fetch = orig;
      }
    }
  });
});


it('rejects invalid headers, mismatched counts and truncated payloads before decoding', () => {
  for (const overrides of [{ steps: [] }, { nodes: -1 }, { nodes: 1e12 }, { elements: 1.5 },
    { damage_max: null }, { displacement_scale: [-1] }, { steps: [null] }, { config: null }]) {
    expect(() => decodeReplay(sample(overrides))).toThrow(/replay/);
  }
  const buf = sample();
  for (const length of [12, buf.byteLength - 1, buf.byteLength - 6]) {
    expect(() => decodeReplay(buf.slice(0, length))).toThrow(/replay/);
  }
});

it('rejects connectivity outside the mesh and nonfinite coordinates', () => {
  const buf = sample();
  const dv = new DataView(buf);
  const offset = Math.ceil((12 + dv.getUint32(8, true)) / 4) * 4;
  dv.setUint16(offset + 16, 2, true);
  expect(() => decodeReplay(buf)).toThrow(/connectivity/);
  dv.setUint16(offset + 16, 0, true);
  dv.setFloat32(offset, NaN, true);
  expect(() => decodeReplay(buf)).toThrow(/coordinate/);
});
