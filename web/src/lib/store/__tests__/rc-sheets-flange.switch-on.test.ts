/**
 * The slab as a beam's flange, a design datum off by default: on every beam or on those chosen;
 * a T section's own flange cut to the code's width, and a slab modelled over it named in the
 * diagnostics; the joint of flange and web checked; the sections drawn as T or L with the top
 * bars over a support spread in the flange (§24.3.4; FIUBA §8.10–8.11).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { physicalGroups, recognizePhysicalElements } from '../physical';
import { createPlate, preparePlatesForAnalysis } from '../physical-plates';
import { meshBeforeAnalysis } from '../mesh-policy.svelte';
import { setLevelReference } from '../placement';
import { buildSheetRows, setFlangeBeams, setRcOption } from '../rc-sheets.svelte';
import { lineSections } from '../../rc-sheets/line-geometry';
import { makeFmt } from '../../rc-sheets/format';
import { flangeTopAcross, spanFlange } from '../../rc-sheets/flange-bars';
import { flangeTwiceWarnings } from '../../engine/model-diagnostics';
import { render } from 'svelte/server';
import RcSectionSvg from '../../../components/pro/rc-sheets/RcSectionSvg.svelte';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); historyStore.clear(); resultsStore.clear(); });

function floor(secondary = false) {
  const conc = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.3 ** 4 / 12, iz: 0.3 ** 4 / 12, j: 0.1406 * 0.3 ** 4, b: 0.3, h: 0.3, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.2 * 0.5 ** 3 / 12, iz: 0.5 * 0.2 ** 3 / 12, j: 0.002, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const xy: Array<[number, number]> = [[0, 0], [6, 0], [6, 5], [0, 5]];
  const base = xy.map(([x, y]) => modelStore.addNode(x, y, 0)), top = xy.map(([x, y]) => modelStore.addNode(x, y, 3));
  base.forEach((b, i) => { const c = modelStore.addElement(b, top[i]!, 'frame'); modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); modelStore.addSupport(b, 'fixed3d'); });
  const beams = top.map((n, i) => { const e = modelStore.addElement(n, top[(i + 1) % 4]!, 'frame'); modelStore.updateElementSection(e, bm); modelStore.updateElementMaterial(e, conc); modelStore.addDistributedLoad3D(e, 0, 0, -25, -25, undefined, undefined, modelStore.model.loadCases[0]!.id); return e; });
  if (secondary) {
    const [m0, m2] = [[3, 0], [3, 5]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
    const split = (e: number, at: number) => { const el = modelStore.elements.get(e)!; const j = el.nodeJ; modelStore.updateElement(e, { nodeJ: at }); const f = modelStore.addElement(at, j, 'frame'); modelStore.updateElementSection(f, bm); modelStore.updateElementMaterial(f, conc); };
    split(beams[0]!, m0!); split(beams[2]!, m2!);
    const sb = modelStore.addElement(m0!, m2!, 'frame'); modelStore.updateElementSection(sb, bm); modelStore.updateElementMaterial(sb, conc);
  }
  const plate = createPlate({ outline: top, materialId: conc, thickness: 0.12 }) as { id: number };
  modelStore.addCombination('1.4D', [{ caseId: modelStore.model.loadCases[0]!.id, factor: 1.4 }]);
  setLevelReference('slabTop');
  return { beams, plate: plate.id, conc };
}

function solve() {
  meshBeforeAnalysis.value = true;
  expect(preparePlatesForAnalysis().ok).toBe(true);
  recognizePhysicalElements();
  const r = modelStore.solve3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setResults3D(r as never);
  publishCombinations3D(modelStore.solveCombinations3D(false, false, true) as never);
  return buildSheetRows();
}

describe('the slab as a beam\'s flange', () => {
  it('is off by default, on every beam when turned on, then only on the beams chosen', () => {
    floor();
    expect(solve().beam.every((r) => !r.demand.flange)).toBe(true);
    setRcOption('flange', true);
    const on = solve().beam;
    expect(on.length).toBe(4);
    for (const r of on) {
      expect(r.demand.flange?.kind, r.name).toBe('L');
      expect(r.demand.flange!.bf).toBeCloseTo(0.2 + Math.min(6 * 0.12, r.demand.length / 12), 6);
      expect(r.verifications.some((v) => v.label === 'rcSheets.v.flangeJoint')).toBe(true);
      expect(JSON.stringify([r.verifications, r.steps ?? []]), r.name).not.toMatch(/FIUBA/);
    }
    const first = physicalGroups().find((g) => g.physical.kind === 'beam')!.id;
    setFlangeBeams([first]);
    const chosen = solve().beam;
    expect(chosen.filter((r) => r.demand.flange).map((r) => r.demand.line?.group)).toEqual([first]);
    setFlangeBeams(null);
    expect(solve().beam.every((r) => r.demand.flange)).toBe(true);
  }, 120_000);

  it('draws its sections as an L with its effective width, the top bars over a support spread in the flange', () => {
    floor();
    setRcOption('flange', true);
    const rows = solve(), line = rows.line[0]!;
    const secs = lineSections(line, rows.beam.filter((r) => line.spans.some((s) => s.name === r.name)), makeFmt(','), false);
    const span = secs.find((s) => s.tags.some((t) => t.includes('x*')))!;
    expect(span.drawing.flange!.bf).toBeCloseTo(line.spans[0]!.flange!.bf, 9);
    const svg = render(RcSectionSvg, { props: { drawing: span.drawing, title: span.title } }).body;
    expect(svg).toContain('data-testid="rc-section-flange"');
    expect(svg).toMatch(/be = \d/);
    const fl = line.spans[0]!.flange!;
    expect(fl.spread).toBeCloseTo(Math.min(fl.bf, (line.spans[0]!.x1 - line.spans[0]!.x0) / 10), 9);
    const support = line.adopted.supportTop.findIndex((g) => g.count > 0);
    if (support >= 0) {
      const at = secs.find((s) => s.drawing.bars.some((b) => b.x < 0 || b.x > line.spans[0]!.b));
      expect(at, 'a support section with bars in the flange').toBeDefined();
    }
    const across = flangeTopAcross({ bf: 0.8, hf: 0.12, sides: [1, -1], spread: 0.6 }, 0.2, 0.025, 3)!;
    expect(across.length).toBe(3);
    expect(across.every((s) => Math.abs(s) > 0.1 && Math.abs(s) <= 0.3)).toBe(true);
    expect(spanFlange({ b: 0.2, length: 6, flange: { bf: 0.6, hf: 0.12, kind: 'L' }, slabs: [{ side: -1 }] })).toEqual({ bf: 0.6, hf: 0.12, sides: [-1], spread: 0.6 });
  }, 120_000);

  it('takes a T section\'s own flange cut to the code\'s width, its web as the beam, and names a slab modelled over it', () => {
    const { beams } = floor();
    const tee = modelStore.addSection({ name: 'T 120×50', a: 0.22, iy: 0.004, iz: 0.003, j: 0.002, b: 1.2, h: 0.5, tw: 0.2, tf: 0.12, shape: 'T' } as never);
    modelStore.updateElementSection(beams[0]!, tee);
    setRcOption('flange', true);
    const rows = solve();
    const r = rows.beam.find((x) => x.demand.flange?.own)!;
    expect(r.demand.b).toBeCloseTo(0.2, 9);
    expect(r.demand.flange!.bf).toBeCloseTo(Math.min(1.2, 0.2 + 2 * Math.min(8 * 0.12, (r.demand.length) / 8)), 6);
    expect(r.demand.flange!.twice).toBe(true);
    const named = flangeTwiceWarnings(modelStore.model as never)[0]?.elementIds ?? [];
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((id) => modelStore.elements.get(id)!.sectionId === tee)).toBe(true);
    const mine = r.demand.line!.group;
    setFlangeBeams(physicalGroups().filter((g) => g.physical.kind === 'beam' && g.id !== mine).map((g) => g.id));
    const left = solve().beam.find((x) => x.demand.line?.group === mine)!;
    expect(left.demand.b).toBeCloseTo(0.2, 9);
    expect(left.demand.flange).toBeUndefined();
  }, 120_000);

  it('narrows a span carrying a beam framing in by 40 % of its overhang (FIUBA p. 52)', () => {
    floor(true);
    setRcOption('flange', true);
    const rows = solve().beam;
    const carrying = rows.filter((r) => r.demand.flange?.reduced);
    expect(carrying.length).toBeGreaterThan(0);
    for (const r of carrying) expect(r.demand.flange!.bf).toBeCloseTo(0.2 + 0.6 * Math.min(6 * 0.12, r.demand.length / 12, Infinity), 6);
    const step = carrying[0]!.steps.flatMap((g) => g.steps).find((x) => x.label === 'rcSheets.s.flange')!;
    expect(step.formula).toContain('bf − 40 % ({criterion})');
  }, 120_000);
});

