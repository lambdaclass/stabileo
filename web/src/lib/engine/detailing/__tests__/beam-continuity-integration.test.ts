import { expect, it } from 'vitest';
import fixture from '../../../templates/fixtures/rc-beam-flexure.json';
import { solveFixture } from '../../design/__tests__/helpers';
import { cirsoc201Adapter } from '../../design/adapters/cirsoc201-adapter';
import { outcomeFromProvided } from '../../design/candidate-search';
import { runDetailing } from '../run-detailing';
import { searchPhysicalDesignAlternatives } from '../physical-design-search';
import { detailRegresses } from '../design-feedback-loop';
import type { MemberDesignOutcome } from '../../design/outcome';
import type { MemberContext } from '../../design/member-context';
import type { ProvidedReinforcement } from '../../../design-contract/reinforcement';

// Two equal 6 m spans, 35x65 cm, H25, with 12 kN/m dead + 8 kN/m live load.
// Including self weight, 1.2D+1.6L gives w=34.025 kN/m and |M at the middle support|
// = w L²/8 = 153.1125 kN m. The initial top patterns (7Ø12 and 4Ø16) both resist it,
// but cannot occupy their nearly coincident positions as a lap. Either uniform pattern
// is a finite, known alternative to test; the engine must still build and verify it.
it.each(['original', 'rotated', 'reversed', 'renumbered', 'three spans', 'three spans reversed', 'bottom three spans', 'catalog three spans', 'cage three spans', 'cage three spans reversed', 'mixed cage three spans', 'mixed cage three spans reversed'] as const)(
  'closes both spans through the production path (%s)', mode => {
  const model = structuredClone(fixture);
  model.nodes[1].x = 6; model.nodes[2].x = 12;
  const three = mode.includes('three spans'), bottom = mode.startsWith('bottom'), catalog = mode.startsWith('catalog');
  const cage = mode.includes('cage'), mixed = mode.startsWith('mixed');
  if (three) {
    model.nodes.push({ id: 4, x: 18, y: 0, z: 0 });
    model.elements.push({ ...model.elements[1], id: 3, nodeI: 3, nodeJ: 4 });
    model.supports.push({ id: 4, nodeId: 4, type: 'rollerZ' });
    model.loads.push(...model.loads.filter(l => l.data.elementId === 2)
      .map(l => ({ ...l, data: { ...l.data, id: l.data.id + 4, elementId: 3 } })));
  }
  // The mixed family needs room for its larger population of smaller bottom bars.
  const width = mixed ? 0.375 : 0.35;
  Object.assign(model.sections[0], { b: width, h: 0.65, a: width * 0.65,
    iy: width * 0.65 ** 3 / 12, iz: 0.65 * width ** 3 / 12 });
  model.supports.push({ id: 3, nodeId: 2, type: 'rollerZ' });
  // State all six restraints: the legacy rollerZ label is a 2D support, not a 3D hinge.
  for (const s of model.supports) Object.assign(s, { type: 'custom3d', dofRestraints: {
    tx: true, ty: true, tz: true,
    rx: s.nodeId === 1 && mode !== 'rotated', ry: s.nodeId === 1 && mode === 'rotated', rz: false,
  } });
  if (mode === 'rotated') for (const n of model.nodes) {
    const x = n.x; n.x = 20; n.y = x - 7; n.z = 4;
  }
  if (mode.includes('reversed')) for (const e of model.elements) [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
  if (mode === 'renumbered') {
    const ids = new Map([[1, 19], [2, 7]]);
    for (const e of model.elements) e.id = ids.get(e.id)!;
    for (const l of model.loads) l.data.elementId = ids.get(l.data.elementId)!;
  }
  const firstId = model.elements[0].id;
  const solved = solveFixture(model);
  const rebar = (id: number): ProvidedReinforcement => ({ regions: {
    topStart: { count: !bottom && id === firstId ? 7 : catalog ? 8 : 4, diameter: !bottom && id === firstId ? 12 : catalog ? 12 : 16 },
    topEnd: { count: !bottom && id === firstId ? 7 : catalog ? 8 : 4, diameter: !bottom && id === firstId ? 12 : catalog ? 12 : 16 },
    bottomSpan: { count: (bottom || cage) && id !== firstId ? 7 : 4, diameter: (bottom || cage) && id !== firstId ? 12 : 16 },
    bottomGroups: [{ layers: [{ count: (bottom || cage) && id !== firstId ? 7 : 4, diameter: (bottom || cage) && id !== firstId ? 12 : 16, row: 0 }],
      anchorageStart: 'hook', anchorageEnd: 'hook' }],
    stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.125 },
    stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.125 },
  } });
  const outcomes = new Map<number, MemberDesignOutcome>();
  for (const [id, ctx] of solved.contexts) {
    // Independent statics value: a different load/model must not accidentally weaken the fixture.
    expect(Math.max(...ctx.stations!.comboResults.flatMap(c => c.stations.map(s => Math.abs(s.my)))))
      .toBeCloseTo((1.2 * (12 + 25 * width * 0.65) + 1.6 * 8) * (three ? 3.6 : 4.5), 3);
    const r = rebar(id), verdict = cirsoc201Adapter.verify(ctx, r);
    expect(['ok', 'warn'], JSON.stringify({ id, checks: verdict.checks.filter(c => c.status === 'fail') })).toContain(verdict.overallStatus);
    const o = outcomeFromProvided(cirsoc201Adapter, ctx, r, verdict);
    expect(o?.outcome).toBe('VERIFIED'); outcomes.set(id, o!);
  }
  const detail = (o: ReadonlyMap<number, MemberDesignOutcome>, contexts: ReadonlyMap<number, MemberContext> = solved.contexts) => runDetailing({
    contexts, outcomes: o, nodes: solved.data.nodes as never, elements: solved.data.elements as never,
    edition: '2025', verifierId: cirsoc201Adapter.provenance().verifierId, demandRevision: 1, maxAggregateSizeMm: 19,
    reverify: (id, finalGeometry) => {
      const v = cirsoc201Adapter.verify({ ...contexts.get(id)!, finalGeometry }, o.get(id)!.accepted!);
      return v.overallStatus === 'none' ? 'fail' : v.overallStatus;
    },
  });
  const before = detail(outcomes);
  expect(before.assemblies.flatMap(a => a.unsupported).map(u => u.key))
    .toContain('detailing.lapCheck.unarranged');
  if (cage) {
    const topOnly = searchPhysicalDesignAlternatives({ adapter: cirsoc201Adapter, contexts: solved.contexts,
      outcomes, result: before, detail, regresses: detailRegresses,
      budget: { maxDetailingRuns: 4, maxMemberSearches: 12, operators: ['harmonizeTopCatalog'] } });
    expect(topOnly.result.assemblies.flatMap(a => a.conflicts).filter(c => c.severity !== 'marginal').length)
      .toBeGreaterThan(0);
  }
  const result = searchPhysicalDesignAlternatives({ adapter: cirsoc201Adapter, contexts: solved.contexts,
    outcomes, result: before, detail, regresses: detailRegresses,
    budget: { maxDetailingRuns: 4, maxMemberSearches: 12,
      operators: [mixed ? 'harmonizeMixedCageCatalog' : cage ? 'harmonizeCageCatalog' : catalog ? 'harmonizeTopCatalog' : bottom ? 'harmonizeBottomLine' : three ? 'harmonizeTopLine' : 'harmonizeTop'] } });
  expect(result.changed.length).toBeGreaterThan(0);
  if (catalog) for (const o of result.outcomes.values()) expect(o.accepted!.regions!.topStart).toEqual({ count: 5, diameter: 16 });
  if (cage && !mixed) for (const o of result.outcomes.values()) {
    expect(o.accepted!.regions!.topStart).toEqual({ count: 4, diameter: 16 });
    expect(o.accepted!.regions!.bottomSpan).toEqual({ count: 4, diameter: 16 });
  }
  if (mixed) for (const o of result.outcomes.values()) {
    expect(o.accepted!.regions!.topStart!.diameter).not.toBe(o.accepted!.regions!.bottomSpan!.diameter);
  }
  const assertClosed = (r: ReturnType<typeof detail>) => {
    expect(r.skipped).toEqual([]);
    expect(r.provisionalMembers).toEqual([]);
    expect(r.assemblies.flatMap(a => a.unsupported)).toEqual([]);
    expect(r.assemblies.flatMap(a => a.conflicts).filter(c => c.severity !== 'marginal')).toEqual([]);
    expect(r.reverification).toHaveLength(three ? 3 : 2);
    expect(r.reverification.every(v => v.status === 'ok' || v.status === 'warn')).toBe(true);
    const bars = r.assemblies.flatMap(a => a.bars);
    // The middle support really has shared top steel, not two deleted member cages.
    const top = result.outcomes.get(firstId)!.accepted!.regions!.topStart!;
    for (let i = 1; i < model.elements.length; i++) {
      const pair = [model.elements[i - 1].id, model.elements[i].id];
      expect(bars.filter(b => b.role === 'longitudinal' && b.layerId?.includes(':top')
        && pair.every(id => b.ownerElementIds.includes(id)))).toHaveLength(top.count);
    }
    for (const id of outcomes.keys()) {
      const stations = bars.filter(b => b.role === 'transverse' && b.ownerElementIds.includes(id))
        .map(b => b.station!).sort((a, b) => a - b);
      expect(stations.length).toBeGreaterThan(40);
      expect(stations[0]).toBeLessThanOrEqual(0.008 + 1e-8);
      expect(6 - stations.at(-1)!).toBeLessThanOrEqual(0.008 + 1e-8);
      expect(Math.max(...stations.slice(1).map((s, i) => s - stations[i]))).toBeLessThanOrEqual(0.125 + 1e-8);
    }
  };
  assertClosed(result.result);
  assertClosed(detail(result.outcomes));
  expect(result.stats.structuralSolves).toBe(0);
}, 60_000);
