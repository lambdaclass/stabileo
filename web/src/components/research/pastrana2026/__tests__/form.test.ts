import { describe, expect, it } from 'vitest';
import { inflateSync } from 'fflate';
import { decompressSnapshot } from '../../../../lib/utils/url-sharing';
import { compactModel, editorUrl, projection } from '../form';
import frames from '../../../../../../research/form-finding/pastrana-2026/results/stabileo_results.json';
import { setLocale, publicI18n } from '../../../../lib/i18n/store.svelte';
import { rs } from '../../i18n';
const baseline = frames.at(-1)!;

describe('four-cable model handoff', () => {
  it('preserves full spatial geometry, supports, material and loading', () => {
    const m = compactModel(baseline, 'Research');
    expect(m.m).toBe('3d');
    expect(m.n).toEqual([[1, 0, 0, -1], [2, -2, -2, 0], [3, 2, -2, 0], [4, 2, 2, 0], [5, -2, 2, 0]]);
    expect(m.e).toHaveLength(4);
    expect(m.e.every(e => e[1] === 1 && e[2] === 1)).toBe(true);
    expect(m.s.map(s => s[1])).toEqual([2, 3, 4, 5]);
    expect(m.l[0].type).toBe('nodal3d');
    expect(m.l[0].data).toMatchObject({ nodeId: 1, fz: -4 });
    expect(m.mt[0][2]).toBe(200000);
    expect(m.sc[0][2]).toBe(0.001);
  });
  it('encodes a real editor share payload', async () => {
    const url = await editorUrl(baseline, 'Research');
    const payload = url.split('#data=2.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(new TextDecoder().decode(inflateSync(Uint8Array.from(atob(payload), c => c.charCodeAt(0)))));
    expect(decoded).toEqual(compactModel(baseline, 'Research'));
    const snapshot = decompressSnapshot(url.split('#data=')[1]);
    expect(snapshot?.analysisMode).toBe('3d');
    expect(snapshot?.nodes[0][1]).toMatchObject({ x: 0, y: 0, z: -1 });
    expect(snapshot?.loads[0]).toMatchObject({ type: 'nodal3d', data: { nodeId: 1, fz: -4 } });
    expect(snapshot?.elements).toHaveLength(4);
  });
  it('projects without changing solver coordinates', () => {
    expect(projection(baseline, true).slice(0, 2)).toEqual([0, -1]);
    expect(projection(baseline, false)).toHaveLength(10);
    expect(baseline.nodes[1]).toEqual([-2, -2, 0]);
  });
  it('has localized scope and explicit limits in every research language', () => {
    const original = publicI18n.locale;
    try {
      for (const locale of ['en', 'es', 'pt']) {
        setLocale(locale);
        expect(rs().formScope).toContain('2.1');
        expect(rs().formReference).toContain('9a17fd379071fb3511ca914f46e8d1e8c286460e');
        expect(rs().formExportNote.length).toBeGreaterThan(60);
      }
    } finally { setLocale(original); }
  });
});
