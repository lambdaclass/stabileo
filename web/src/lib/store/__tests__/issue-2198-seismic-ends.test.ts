import { beforeEach, expect, it, vi } from 'vitest';
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import { syntheticBeamContext } from '../../engine/design/__tests__/helpers';
import { hoopSpacingFor } from '../../engine/design/seismic/capacity';

const state = vi.hoisted(() => ({ reinforcement: {} as ProvidedReinforcement, contexts: new Map(), ve: 240, vcZero: true, revisions: 0 }));
vi.mock('../verification.svelte', () => ({ verificationStore: { get contexts() { return state.contexts; }, get analysisRevision() { return state.revisions; }, demandRevision: 0 } }));
vi.mock('../model.svelte', () => ({ modelStore: {
  model: { nodes: new Map(), elements: new Map(), loadCases: [], materials: new Map() }, quads: new Map(), plates: new Map(),
  reinforcementTransaction: (write: (api: { setReinforcement: (id: number, r: ProvidedReinforcement) => void }) => void) => write({ setReinforcement: (_id, r) => { state.reinforcement = r; } }),
} }));
vi.mock('../rebar-edit', () => ({ getReinforcement: () => state.reinforcement }));
vi.mock('../design-data', () => ({ designData: () => ({ seismic: {} }), patchDesignData: vi.fn() }));
vi.mock('../active-results', () => ({ activeCombinations: () => [] }));
vi.mock('../lateral-system', () => ({ declareLateral: vi.fn(), lateralResolver: () => () => ({ role: 'lateral' }), setMemberLateral: vi.fn() }));
vi.mock('../../engine/design/seismic/frame-checks', async importOriginal => ({ ...await importOriginal<typeof import('../../engine/design/seismic/frame-checks')>(), seismicFrameChecks: () => ({ members: [{ id: 1, kind: 'beam', role: 'primary', ok: false, beam: { ve: state.ve, vcZero: state.vcZero, hoops: { spacing: 0.15, length: 1.2 } } }], joints: [] }) }));
import { applySeismicDetailing } from '../seismic-design.svelte';


beforeEach(() => {
  state.revisions++;
  state.contexts = new Map([[1, syntheticBeamContext({ material: { ...syntheticBeamContext().material, fc: 25 } })]]);
  state.ve = 240;
});

for (const swap of [false, true]) for (const vcZero of [false, true]) for (const endLegs of [2, 3, 4]) for (const demand of [120, 240, 1000]) {
  it(`known wrong result: #2198 seismic end hoops ${swap} ${vcZero} ${endLegs} ${demand}`, () => {
    state.ve = demand;
    state.vcZero = vcZero;
    const shared = { diameter: 8, legs: 4, secondaryLegs: 3, spacing: 0.2 };
    const weak = { diameter: 8, legs: endLegs, secondaryLegs: 2, spacing: 0.2 };
    const strong = { diameter: 8, legs: 4, secondaryLegs: 4, spacing: 0.2 };
    const [start, end] = swap ? [strong, weak] : [weak, strong];
    const original = { bottom: { count: 4, diameter: 16 }, top: { count: 4, diameter: 16 }, regions: { stirrupsSupport: shared, stirrupsStart: start, stirrupsEnd: end } };
    state.reinforcement = structuredClone(original);
    const written = applySeismicDetailing();
    if (demand === 1000) {
      expect(written.beams).toBe(0);
      expect(state.reinforcement).toEqual(original);
      return;
    }
    expect(written.beams).toBe(1);
    for (const [key, prior] of [['stirrupsStart', start], ['stirrupsEnd', end]] as const) {
      const cage = state.reinforcement.regions![key]!;
      const d = 0.6 - 0.025 - cage.diameter / 1000 - 0.008;
      const s = hoopSpacingFor(demand, vcZero, 0.3, d, 25, 420, cage.diameter, prior.legs);
      expect(s).not.toBeNull();
      expect(cage.spacing).toBeLessThanOrEqual(Math.min(0.15, s!));
      const strength = 0.75 * ((vcZero ? 0 : 0.17 * Math.sqrt(25) * 0.3 * d * 1000) + prior.legs * (Math.PI * (cage.diameter / 1000) ** 2 / 4) * 420000 * d / cage.spacing);
      expect(strength).toBeGreaterThanOrEqual(demand);
      expect(cage.legs).toBe(prior.legs);
      expect(cage.secondaryLegs).toBe(prior.secondaryLegs);
    }
  });
}

for (const swap of [false, true]) for (const fallback of [
  { diameter: 16, legs: 4, secondaryLegs: 4, spacing: 0.2 },
  { diameter: 8, legs: 1, secondaryLegs: 2, spacing: 0.05 },
]) for (const explicit of ['both', 'start', 'end'] as const) {
  it(`known wrong result: #2198 seismic overridden fallback ${swap} ${JSON.stringify(fallback)} ${explicit}`, () => {
    state.ve = 120;
    state.vcZero = true;
    const weak = { diameter: 8, legs: 2, secondaryLegs: 2, spacing: 0.2 };
    const strong = { diameter: 8, legs: 4, secondaryLegs: 3, spacing: 0.2 };
    const [start, end] = swap ? [strong, weak] : [weak, strong];
    const original = { bottom: { count: 4, diameter: 16 }, top: { count: 4, diameter: 16 }, regions: { stirrupsSupport: fallback, ...(explicit !== 'end' ? { stirrupsStart: start } : {}), ...(explicit !== 'start' ? { stirrupsEnd: end } : {}) } };
    state.reinforcement = structuredClone(original);
    const written = applySeismicDetailing();
    if (explicit !== 'both' && fallback.diameter === 16) {
      expect(written.beams).toBe(0);
      expect(state.reinforcement).toEqual(original);
      return;
    }
    expect(written.beams).toBe(1);
    const used = [explicit !== 'end' ? start : fallback, explicit !== 'start' ? end : fallback];
    const candidates = [8, 10, 12].filter(dia => dia >= Math.max(...used.map(c => c.diameter))).flatMap(dia => {
      const d = 0.6 - 0.025 - dia / 1000 - 0.008;
      const limits = used.map(c => hoopSpacingFor(120, true, 0.3, d, 25, 420, dia, c.legs));
      return limits.some(s => s === null) ? [] : [{ diameter: dia, spacing: Math.floor(Math.min(0.15, ...limits as number[], ...used.map(c => c.spacing)) * 40 + 1e-9) / 40 }];
    });
    expect(candidates.length).toBeGreaterThan(0);
    for (const [key, prior] of [['stirrupsStart', start], ['stirrupsEnd', end]] as const) {
      if (!original.regions[key]) continue;
      expect(state.reinforcement.regions![key]).toEqual({ ...prior, ...candidates[0] });
    }
  });
}
