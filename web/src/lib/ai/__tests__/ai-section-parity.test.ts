import { beforeAll, describe, expect, it } from 'vitest';
import { outcomeFromToolCall } from '../capabilities/build-model';
import { AI_PROFILE_NAMES, SECTIONS, lookupSection } from '../capabilities/sections';
import { modelStore, uiStore } from '../../store';
import { initSolver } from '../../engine/wasm-solver';
import { solverProperties } from '../../section/state';
import { catalogueOutline } from '../../section/canonical';
import { familyToShape, profileByName, profileToSectionFull } from '../../data/steel-profiles';

beforeAll(async () => { await initSolver(); });

type Snapshot = Record<string, unknown> & { sections: Array<[number, Record<string, unknown>]> };

function aiSnapshot(mode: '2d' | '3d', tool: string, args: Record<string, unknown>): Snapshot {
  uiStore.analysisMode = mode;
  const o = outcomeFromToolCall(tool, { ...args, interpretation: 'x' });
  if (o?.kind !== 'snapshot') throw new Error(JSON.stringify(o));
  return structuredClone(o.snapshot) as Snapshot;
}

function handPicked(snapshot: Snapshot): Snapshot {
  const out = structuredClone(snapshot);
  out.sections = out.sections.map(([id, s]) => {
    const p = profileByName(String(s.name))!;
    const full = profileToSectionFull(p);
    return [id, { id, name: p.name, profileFamily: p.family, a: full.a, iz: full.iz, iy: full.iy, j: full.j, b: full.b, h: full.h, shape: full.shape, tw: full.tw, tf: full.tf, t: full.t }];
  });
  return out;
}

function solved(snapshot: Snapshot, mode: '2d' | '3d') {
  modelStore.restore(snapshot as never);
  const sections = [...modelStore.sections.values()].map((s) => [s.name, solverProperties(s as never)] as const);
  const r = mode === '3d' ? modelStore.solve3D(false) : modelStore.solve(false);
  if (typeof r === 'string' || !r) throw new Error(String(r));
  return { sections, displacements: r.displacements as unknown as Array<Record<string, number>> };
}

function expectSame(a: ReturnType<typeof solved>, b: ReturnType<typeof solved>) {
  expect(a.sections.map(([n]) => n)).toEqual(b.sections.map(([n]) => n));
  a.sections.forEach(([, p], i) => {
    const q = b.sections[i][1];
    expect(p.j).not.toBeNull();
    expect(p.j!).toBeCloseTo(q.j!, 12);
    expect(p.iy).toBeCloseTo(q.iy, 12);
    expect(p.iz).toBeCloseTo(q.iz, 12);
    expect(p.a).toBeCloseTo(q.a, 12);
  });
  expect(a.displacements.length).toBe(b.displacements.length);
  a.displacements.forEach((d, i) => {
    const e = b.displacements[i];
    expect(Object.keys(d).sort()).toEqual(Object.keys(e).sort());
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === 'number') expect(Math.abs(v - e[k]), k).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(v)));
      else expect(v, k).toEqual(e[k]);
    }
  });
}

describe('the AI section table is the app catalogue', () => {
  it('every AI profile equals its catalogue entry with the solver axes and carries no hand-typed j', () => {
    expect(SECTIONS.map((s) => s.name)).toEqual([...AI_PROFILE_NAMES]);
    for (const name of AI_PROFILE_NAMES) {
      const p = profileByName(name)!;
      const s = lookupSection(name)!;
      expect(s).toEqual({
        name: p.name, a: p.a * 1e-4, iz: p.iy * 1e-8, iy: p.iz * 1e-8, h: p.h * 1e-3, b: p.b * 1e-3,
        tw: (p.tw ?? p.t!) * 1e-3, tf: (p.tf ?? p.t!) * 1e-3, shape: familyToShape(p.family),
        ...(p.j != null ? { j: p.j * 1e-8 } : {}),
      });
    }
  });

  it('the app draws every AI profile from its catalogue geometry', () => {
    for (const name of AI_PROFILE_NAMES) expect(catalogueOutline(name), name).not.toBeNull();
  });

  it('lookup tolerates spacing and case', () => {
    expect(lookupSection('  heb   300 ')?.name).toBe('HEB 300');
  });
});

describe('an AI-built model and the same profiles picked by hand', () => {
  it('give the same section properties, J and displacements in 3D', () => {
    const ai = aiSnapshot('3d', 'create_portal_frame_3d', { width: 6, depth: 4, height: 3 });
    expect(ai.sections.every(([, s]) => s.j === undefined)).toBe(true);
    expectSame(solved(ai, '3d'), solved(handPicked(ai), '3d'));
  });

  it('give the same displacements in 2D', () => {
    const ai = aiSnapshot('2d', 'create_beam', { span: 6, q: -10 });
    expectSame(solved(ai, '2d'), solved(handPicked(ai), '2d'));
  });
});
