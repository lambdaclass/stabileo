import type { ModelData } from '../../../../lib/engine/solver-service';
import { describe, expect, it } from 'vitest';
import { inflateSync } from 'fflate';
import { decompressSnapshot } from '../../../../lib/utils/url-sharing';
import { compactModel, editorUrl, projection } from '../form';
import reference from '../../../../../../research/form-finding/pastrana-2026/reference-results/four_bar.json';
import frames from '../../../../../../research/form-finding/pastrana-2026/results/stabileo_results.json';
import { setLocale, publicI18n, PUBLIC_LOCALES } from '../../../../lib/i18n/store.svelte';
import { rs, researchLocale } from '../../i18n';
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
  it('solves the decoded editor model with pinned supports in production WASM', async () => {
    const { buildSolverInput3D } = await import('../../../../lib/engine/solver-service');
    const { initSolver, solve3D } = await import('../../../../lib/engine/wasm-solver');
    await initSolver();
    for (const form of reference.map(c => ({ ...baseline, ...c }))) {
      const url = await editorUrl(form, 'Research');
      const snap = decompressSnapshot(url.split('#data=')[1])!;
      expect(snap.supports.map(([,s]) => [s.nodeId, s.type])).toEqual([2,3,4,5].map(i => [i,'pinned']));
      expect(snap.elements.every(([,e]) => e.type === 'truss')).toBe(true);
      expect(snap.materials[0][1]).toMatchObject({ e: 200000, rho: 0 });
      expect(snap.sections[0][1]).toMatchObject({ a: 0.001 });
      const input = buildSolverInput3D({ nodes: new Map(snap.nodes), elements: new Map(snap.elements), supports: new Map(snap.supports), materials: new Map(snap.materials), sections: new Map(snap.sections), loads: snap.loads } as unknown as ModelData);
      expect(input).not.toBeNull();
      const result = solve3D(input!);
      expect(result.elementForces).toHaveLength(4);
      expect(result.elementForces.map(f => f.elementId).sort()).toEqual([1,2,3,4]);
      for (const f of result.elementForces) for (const axial of [f.nStart, f.nEnd]) expect(Math.abs(axial - form.forces[f.elementId - 1])).toBeLessThanOrEqual(1e-9);
      const h = form.load/(4*form.q);
      const uz = -form.load*Math.pow(8+h*h, 1.5)/(4*200000*h*h);
      expect(Math.abs(result.displacements.find(d => d.nodeId === 1)!.uz - uz)).toBeLessThanOrEqual(1e-12);
    }
  });
  it('projects without changing solver coordinates', () => {
    expect(projection(baseline, true).slice(0, 2)).toEqual([0, -1]);
    expect(projection(baseline, false)).toHaveLength(10);
    expect(baseline.nodes[1]).toEqual([-2, -2, 0]);
  });
  it('has localized scope and explicit limits in every research language', () => {
    const original = publicI18n.locale;
    try {
      for (const locale of PUBLIC_LOCALES) {
        setLocale(locale);
        expect(researchLocale()).toBe(['es', 'pt'].includes(locale) ? locale : 'en');
        expect(rs().researchLanguages.length).toBeGreaterThan(40);
        expect(rs().formScope).toContain('2.1');
        expect(rs().formReference).toContain('9a17fd379071fb3511ca914f46e8d1e8c286460e');
        expect(rs().formExportNote.length).toBeGreaterThan(60);
      }
    } finally { setLocale(original); }
  });
});
