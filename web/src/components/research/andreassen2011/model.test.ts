import { describe, it, expect } from 'vitest';
import { defaults, mesh, validConfig, validFrame, referenceMatches, decodeReplay } from './model';
import { text } from './i18n';
import { colourFor } from '../../../lib/three/colour-maps';

describe('topology optimization data contract', () => {
  it('bounds allocations and parameter domains', () => {
    expect(validConfig(defaults)).toBe(true);
    for (const update of [{ nelx: 1e9 }, { nelx: 120, nely: 60 }, { nely: 2.5 }, { volfrac: NaN }, { penal: Infinity }, { ft: 0 }, { rmin: 0 }]) expect(validConfig({ ...defaults, ...update })).toBe(false);
    expect(() => mesh({ ...defaults, nelx: 1e9 })).toThrow();
  });
  it('uses top88 column-major elements with counterclockwise geometry', () => {
    const m = mesh({ ...defaults, nelx: 2, nely: 2 });
    expect(m.cells.slice(0, 4)).toEqual([1, 4, 3, 0]);
    expect(m.xy.slice(0, 6)).toEqual([0, 2, 0, 1, 0, 0]);
    expect(m.cells).toHaveLength(16);
  });
  it('rejects malformed streamed output', () => {
    const c = { ...defaults, nelx: 2, nely: 2 };
    const f = { iteration: 1, compliance: 10, volume: .5, change: .2, density: [.5, .5, .5, .5] };
    expect(validFrame(f, c, 0)).toBe(true);
    expect(validFrame({ ...f, density: [NaN] }, c, 0)).toBe(false);
    expect(validFrame(f, c, 1)).toBe(false);
  });
  it('never overlays an unrelated reference case', () => {
    expect(referenceMatches({ ...defaults, ft: 2 })).toBe(true);
    expect(referenceMatches({ ...defaults, volfrac: .4 })).toBe(false);
  });
  it('decodes a density replay and rejects truncation or corrupt metadata', () => {
    const c = { ...defaults, nelx: 2, nely: 2 };
    const header = new TextEncoder().encode(JSON.stringify({ config: c, frames: [{ iteration: 1, compliance: 10, volume: .5, change: .2 }] }));
    const bytes = new Uint8Array(12 + header.length + 4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x4c505253, true); view.setUint32(4, 2, true); view.setUint32(8, header.length, true);
    bytes.set(header, 12); bytes.set([0, 255, 128, 64], 12 + header.length);
    expect(decodeReplay(bytes.buffer).frames[0].density.slice(0, 2)).toEqual([0, 1]);
    for (let n = 0; n < bytes.length; n++) expect(() => decodeReplay(bytes.buffer.slice(0, n))).toThrow();
    view.setUint32(4, 99, true); expect(() => decodeReplay(bytes.buffer)).toThrow();
  });
  it('provides complete translations and black material on a sequential ramp', () => {
    for (const locale of ['es', 'pt'] as const) expect(Object.keys(text[locale]).sort()).toEqual(Object.keys(text.en).sort());
    expect(colourFor('sequential-grey', 1, 0, 1)).toBe(0x000000);
    expect(colourFor('sequential-grey', 0, 0, 1)).toBe(0xffffff);
  });
});
