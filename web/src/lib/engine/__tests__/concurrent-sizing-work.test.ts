import { afterEach, expect, it, vi } from 'vitest';
import { ConcurrentDemand } from '../concurrent-demand';
import { verifyConcurrentElement } from '../concurrent-verification';
import { amplifiedDemand, checkColumn, verifyElement, verificationCase, type ConcurrentVerificationInput } from '../codes/argentina/cirsoc201';
import { engineRecheckElement } from '../codes/argentina/cirsoc201-engine-gate';
import * as engine from '../codes/argentina/cirsoc201-engine';
import { autoVerifyFromResults, type AutoVerifyModelData } from '../auto-verify';
import * as concurrentVerification from '../concurrent-verification';
import { runUnifiedVerification, runCirsocDesign } from '../verification-service';
import { extractGoverningDemands, type ElementDesignDemands } from '../station-design-forces';
import type { AnalysisResults3D } from '../types-3d';

const cases = (['beam', 'column', 'wall'] as const).flatMap(elementType =>
  (['My', 'Mz'] as const).flatMap(axis => (['2005', '2025'] as const).map(edition => ({ elementType, axis, edition }))));

function inputsFor({ elementType, axis, edition }: typeof cases[number]): ConcurrentVerificationInput[] {
  return ConcurrentDemand.fromTuples([0, 1, 2, 3].map(i => ({ comboId: i + 1, comboName: `comb ${i + 1}`,
    forces: { n: [0, -100, 100, -300][i]!, my: [20, -65, 55, 20][i]!, mz: [15, 25, -35, 10][i]!,
      vy: 5 + i, vz: 10 - i, torsion: i, t: i / 3, x: i / 3 * 0.4 },
  }))).map(demand => ({ elementId: 1, elementType, edition, demand: demand.section(axis),
    b: 0.4, h: 0.4, fc: 30, fy: 420, cover: 0.025, stirrupDia: 8, Lu: 0.4 }));
}

function referenceChecks(inputs: readonly ConcurrentVerificationInput[]) {
  const first = inputs[0]!;
  const column = first.elementType !== 'beam' ? checkColumn(first, inputs.map(amplifiedDemand), { edition: first.edition }) : undefined;
  const fixedColumn = column ? { barCount: column.barCount, barDia: column.barDia } : undefined;
  const preliminary = inputs.map(i => verifyElement(i, { column: fixedColumn }));
  expect(preliminary.every(v => !v.torsion || v.torsion.neglect)).toBe(true);
  const maxFlexure = preliminary.reduce((a, b) => b.flexure.AsProv > a.flexure.AsProv ? b : a).flexure;
  const maxCompression = preliminary.reduce((a, b) => (b.flexure.AsComp ?? 0) > (a.flexure.AsComp ?? 0) ? b : a).flexure;
  const flexure = { ...maxFlexure, AsComp: maxCompression.AsComp, barCountComp: maxCompression.barCountComp,
    barDiaComp: maxCompression.barDiaComp, barsComp: maxCompression.barsComp, isDoublyReinforced: maxCompression.isDoublyReinforced };
  const shear = { spacing: Math.min(...preliminary.flatMap(v => [v.shear.spacing, v.shearSecondary?.spacing ?? Infinity])),
    legs: Math.max(...preliminary.flatMap(v => [v.shear.stirrupLegs, v.shearSecondary?.stirrupLegs ?? 0])) };
  return inputs.map(i => ({ demand: i.demand.source,
    verification: engineRecheckElement(verifyElement(i, { column: fixedColumn, flexure, shear, torsion: { AlProv: 0 } }),
      { edition: i.edition, stirrupDia: i.stirrupDia, NuShear: verificationCase(i).Nu }),
  }));
}

afterEach(() => vi.restoreAllMocks());

it.each(cases)('#2080 — $elementType $axis $edition sizes each station once while checking the shared cage', options => {
  const inputs = inputsFor(options);
  const get = engine.cirsoc201Engine;
  const sizing = vi.fn(get('designBeam'));
  const registered: engine.Cirsoc201Engine = { Section: get('Section'), basis: get('basis'), phi: get('phi'),
    designBeam: sizing, slabProvisions: get('slabProvisions') };
  vi.spyOn(engine, 'cirsoc201Engine').mockImplementation(key => registered[key]);
  inputs.forEach(i => verifyElement(i));
  const once = sizing.mock.calls.length;
  expect(once).toBeGreaterThan(0);
  sizing.mockClear();
  verifyConcurrentElement(inputs);
  expect(sizing).toHaveBeenCalledTimes(once);
});

it.each(cases)('$elementType $axis $edition retains every exact shared-cage result and certificate', options => {
  const inputs = inputsFor(options);
  expect(verifyConcurrentElement(inputs).concurrentChecks).toEqual(referenceChecks(inputs));
  expect(verifyConcurrentElement([inputs[0]!]).concurrentChecks).toEqual(referenceChecks([inputs[0]!]));
});

it('refuses an empty concurrent set', () => {
  expect(() => verifyConcurrentElement([])).toThrow('Concurrent demands are required for verification');
});

function sizingQuery(value: number): Float64Array {
  return new Float64Array(15).fill(value);
}

function withSizingKernel(run: (sizing: ReturnType<typeof vi.fn<engine.Cirsoc201Engine['designBeam']>>) => void) {
  const get = engine.cirsoc201Engine;
  const original = { Section: get('Section'), basis: get('basis'), phi: get('phi'),
    designBeam: get('designBeam'), slabProvisions: get('slabProvisions') };
  const sizing = vi.fn(original.designBeam);
  try {
    engine.registerCirsoc201Engine({ ...original, designBeam: sizing });
    run(sizing);
  } finally {
    engine.registerCirsoc201Engine(original);
  }
}

it.each(cases)('#2080 — $elementType $axis $edition repeats identical sizing across concurrent members', options => {
  withSizingKernel(sizing => {
    const inputs = inputsFor(options);
    const expected = verifyConcurrentElement(inputs);
    const once = sizing.mock.calls.length;
    expect(once).toBeGreaterThan(0);
    expect(verifyConcurrentElement(inputs)).toEqual(expected);
    inputs.forEach(i => verifyElement(i));
    expect(sizing).toHaveBeenCalledTimes(once);
  });
});

it('#2080 — repeated sizing queries reuse only identical input bytes', () => {
  withSizingKernel(sizing => {
    sizing.mockImplementation(input => input.slice());
    const query = Float64Array.from({ length: 15 }, (_, i) => i + 1);
    const ask = engine.cirsoc201Engine('designBeam');
    const expected = ask(query);
    expect(ask(query.slice())).toEqual(expected);
    expect(sizing).toHaveBeenCalledTimes(1);
    for (let i = 0; i < query.length; i++) {
      const changed = query.slice();
      changed[i] += Number.EPSILON * changed[i];
      expect(ask(changed)).toEqual(changed);
    }
    expect(sizing).toHaveBeenCalledTimes(16);
    const zeros = sizingQuery(0), negativeZero = sizingQuery(-0);
    expect(Object.is(ask(zeros)[0], 0)).toBe(true);
    expect(Object.is(ask(negativeZero)[0], -0)).toBe(true);
    const storage = Float64Array.of(999, ...query, 999);
    expect(ask(storage.subarray(1, 16))).toEqual(expected);
    expect(sizing).toHaveBeenCalledTimes(18);
  });
});

it('#2080 — cached sizing answers own their storage', () => {
  withSizingKernel(sizing => {
    const output = Float64Array.of(10, 20);
    sizing.mockReturnValue(output);
    const query = sizingQuery(1);
    const ask = engine.cirsoc201Engine('designBeam');
    const first = ask(query);
    first[0] = 999;
    output[1] = 999;
    expect(ask(query)).toEqual(Float64Array.of(10, 20));
    query[0] = 3;
    expect(ask(query)).toEqual(output);
    expect(sizing).toHaveBeenCalledTimes(2);
  });
});

it.each([4095, 4096, 4097])('#2080 — sizing cache retains correct answers across %i distinct queries', count => {
  withSizingKernel(sizing => {
    sizing.mockImplementation(input => input.slice());
    const ask = engine.cirsoc201Engine('designBeam');
    for (let i = 0; i < count; i++) expect(ask(sizingQuery(i))).toEqual(sizingQuery(i));
    expect(sizing).toHaveBeenCalledTimes(count);
    expect(ask(sizingQuery(count - 1))).toEqual(sizingQuery(count - 1));
    expect(sizing).toHaveBeenCalledTimes(count);
    expect(ask(sizingQuery(0))).toEqual(sizingQuery(0));
    expect(sizing).toHaveBeenCalledTimes(count + Number(count > 4096));
  });
});

it('engine replacement and removal never retain sizing answers', () => {
  withSizingKernel(sizing => {
    sizing.mockReturnValue(Float64Array.of(1));
    expect(engine.cirsoc201Engine('designBeam')(sizingQuery(0))).toEqual(Float64Array.of(1));
    engine.registerCirsoc201Engine({ designBeam: () => Float64Array.of(2) });
    expect(engine.cirsoc201Engine('designBeam')(sizingQuery(0))).toEqual(Float64Array.of(2));
    engine.registerCirsoc201Engine(null);
    expect(() => engine.cirsoc201Engine('designBeam')).toThrow(engine.Cirsoc201EngineUnavailable);
  });
});

it('failed sizing calls are retried', () => {
  withSizingKernel(sizing => {
    sizing.mockImplementationOnce(() => { throw new Error('sizing failed'); });
    sizing.mockReturnValue(Float64Array.of(1));
    const ask = engine.cirsoc201Engine('designBeam');
    expect(() => ask(sizingQuery(0))).toThrow('sizing failed');
    expect(ask(sizingQuery(0))).toEqual(Float64Array.of(1));
    expect(sizing).toHaveBeenCalledTimes(2);
  });
});

it.each([0, 14, 16, 30])('passes %i-value batches and malformed sizing queries to the engine unchanged', length => {
  withSizingKernel(sizing => {
    sizing.mockImplementation(input => input.slice());
    const ask = engine.cirsoc201Engine('designBeam');
    const query = new Float64Array(length).fill(1);
    expect(ask(query)).toEqual(query);
    expect(ask(query)).toEqual(query);
    expect(sizing).toHaveBeenCalledTimes(2);
  });
});

it('preserves nonfinite input bits without merging distinct queries', () => {
  withSizingKernel(sizing => {
    sizing.mockImplementation(input => input.slice());
    const ask = engine.cirsoc201Engine('designBeam');
    const query = sizingQuery(1);
    for (const value of [Infinity, -Infinity, NaN]) {
      query[0] = value;
      expect(ask(query)).toEqual(query);
      expect(ask(query.slice())).toEqual(query);
    }
    expect(sizing).toHaveBeenCalledTimes(3);
  });
});


function sharedBeamModel() {
  const model: AutoVerifyModelData = {
    elements: new Map([1, 2].map(id => [id, { id, nodeI: id, nodeJ: id + 1, type: 'frame', sectionId: 1, materialId: 1 }])),
    nodes: new Map([1, 2, 3].map(id => [id, { id, x: id - 1, y: 0, z: 0 }])),
    sections: new Map([[1, { id: 1, name: 'RC', b: 0.4, h: 0.4 }]]),
    materials: new Map([[1, { id: 1, name: 'H30', fc: 30, fy: 30 }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
  };
  const results = { elementForces: [1, 2].map(elementId => ({ elementId, length: 1,
    nStart: 0, nEnd: 0, myStart: 20, myEnd: 20, mzStart: 0, mzEnd: 0,
    vyStart: 0, vyEnd: 0, vzStart: 5, vzEnd: 5, mxStart: 0, mxEnd: 0 })) } as AnalysisResults3D;
  const demands = extractGoverningDemands({ elementId: 1, length: 2, stationTs: [0, 1],
    comboResults: [{ comboId: 1, comboName: 'C1', stations: [0, 1].map(t => ({
      t, x: 2 * t, n: 0, my: 20, mz: 0, vy: 0, vz: 5, torsion: 0,
    })) }] });
  return { model, results, demands };
}

function sharedDemands(demands: ElementDesignDemands, uncached = false) {
  return new Map([1, 2].map(elementId => [elementId, { ...demands, elementId,
    concurrent: uncached ? [...demands.concurrent!] : demands.concurrent,
  }]));
}

it.each(['auto', 'unified', 'design'] as const)('#2080 — $0 verifies identical shared-span inputs once per run', entry => {
  const { model, results, demands } = sharedBeamModel();
  const verify = vi.spyOn(concurrentVerification, 'verifyConcurrentElement');
  const shared = sharedDemands(demands);
  const output = entry === 'auto' ? autoVerifyFromResults(results, model, null, undefined, shared).concrete
    : entry === 'unified' ? runUnifiedVerification(results, model, null, shared)
      : runCirsocDesign(results, model, shared, new Map([[1, 'RC'], [2, 'RC']]), null).concrete;
  expect(output).toHaveLength(2);
  expect(output.every(v => v.engineRecheck?.certified?.ok)).toBe(true);
  expect(verify).toHaveBeenCalledTimes(1);
});

it.each(['b', 'h', 'fc'] as const)('keeps separate checks when shared-demand members differ in %s', field => {
  const { model, results, demands } = sharedBeamModel();
  model.elements.get(2)!.sectionId = 2;
  model.elements.get(2)!.materialId = 2;
  model.sections.set(2, { ...model.sections.get(1)!, id: 2, ...(field !== 'fc' ? { [field]: 0.5 } : {}) });
  model.materials.set(2, { ...model.materials.get(1)!, id: 2, ...(field === 'fc' ? { fc: 25 } : {}) });
  const verify = vi.spyOn(concurrentVerification, 'verifyConcurrentElement');
  const actual = autoVerifyFromResults(results, model, null, undefined, sharedDemands(demands)).concrete;
  expect(verify).toHaveBeenCalledTimes(2);
  const expected = autoVerifyFromResults(results, model, null, undefined, sharedDemands(demands, true)).concrete;
  expect(verify).toHaveBeenCalledTimes(4);
  expect(actual).toEqual(expected);
});

it('shared-span reuse preserves exact results, diagnostics, brands and independently mutable output', () => {
  const { model, results, demands } = sharedBeamModel();
  const real = concurrentVerification.verifyConcurrentElement;
  const verify = vi.spyOn(concurrentVerification, 'verifyConcurrentElement').mockImplementation(inputs => {
    const value = real(inputs);
    const diagnostic = { severity: 'warning' as const, code: 'VERIF_WARN_FLEXURE', message: 'diag.verifWarnFlexure',
      source: 'verification' as const, elementIds: [inputs[0]!.elementId], details: { ratio: value.flexure.ratio } };
    value.diagnostics = [diagnostic];
    value.concurrentChecks![0]!.verification.diagnostics = [diagnostic];
    return value;
  });
  const run = (forces: typeof results.elementForces, uncached = false) => autoVerifyFromResults({ ...results, elementForces: forces }, model,
    null, undefined, sharedDemands(demands, uncached)).concrete;
  const actual = run(results.elementForces);
  expect(verify).toHaveBeenCalledTimes(1);
  const expected = run(results.elementForces, true);
  expect(verify).toHaveBeenCalledTimes(3);
  expect(actual).toEqual(expected);
  expect(actual[1]!.concurrentChecks![0]!.demand.section('My').source).toBe(demands.concurrent![0]);
  actual[1]!.flexure.steps.push('changed');
  actual[1]!.concurrentChecks![0]!.verification.diagnostics![0]!.elementIds!.push(999);
  expect(actual[0]).toEqual(expected[0]);
});

it('a new verification run recomputes shared-span checks', () => {
  const { model, results, demands } = sharedBeamModel();
  const verify = vi.spyOn(concurrentVerification, 'verifyConcurrentElement');
  const run = () => autoVerifyFromResults(results, model, null, undefined, sharedDemands(demands));
  run();
  expect(verify).toHaveBeenCalledTimes(1);
  expect(run()).toEqual(run());
  expect(verify).toHaveBeenCalledTimes(3);
});

it('distinct tuple sets and incomplete data cannot reuse a previous member check', () => {
  const { model, results, demands } = sharedBeamModel();
  const verify = vi.spyOn(concurrentVerification, 'verifyConcurrentElement');
  autoVerifyFromResults(results, model, null, undefined, new Map([[1, demands], [2, { ...demands, elementId: 2, concurrent: [...demands.concurrent!] }]]));
  expect(verify).toHaveBeenCalledTimes(2);
  expect(() => autoVerifyFromResults(results, model, null, undefined, new Map([[1, demands], [2, { ...demands, elementId: 2, concurrent: [] }]])))
    .toThrow('Incomplete concurrent demand');
});

it('uncertified shared-span checks are recomputed with each member id', () => {
  const { model, results, demands } = sharedBeamModel();
  const real = concurrentVerification.verifyConcurrentElement;
  const verify = vi.spyOn(concurrentVerification, 'verifyConcurrentElement').mockImplementation(inputs => {
    const value = real(inputs);
    value.engineRecheck!.certified = { ok: false, lower: 0, upper: Infinity, reason: `member ${inputs[0]!.elementId}` };
    return value;
  });
  const actual = autoVerifyFromResults(results, model, null, undefined, sharedDemands(demands)).concrete;
  expect(verify).toHaveBeenCalledTimes(2);
  expect(actual.map(v => v.engineRecheck!.certified!.reason)).toEqual(['member 1', 'member 2']);
});

it('a changed tuple in the same array cannot reuse a previous shared-span check', () => {
  const { model, results, demands } = sharedBeamModel();
  const shared = sharedDemands(demands);
  const get = shared.get.bind(shared);
  vi.spyOn(shared, 'get').mockImplementation(id => {
    if (id === 2) (demands.concurrent as ConcurrentDemand[])[0] = demands.concurrent![0]!.withAxial(-100);
    return get(id);
  });
  const verify = vi.spyOn(concurrentVerification, 'verifyConcurrentElement');
  const actual = autoVerifyFromResults(results, model, null, undefined, shared).concrete;
  expect(verify).toHaveBeenCalledTimes(2);
  expect(actual.map(v => v.concurrentChecks![0]!.demand.n)).toEqual([0, -100]);
});

for (const edition of ['2005', '2025'] as const) for (const entry of ['auto', 'unified', 'design'] as const) for (const reverse of [false, true]) {
  it(`known wrong result: #2080 shared tuples retain opposite axes ${edition} ${entry} reverse=${reverse}`, () => {
    const { model, results } = sharedBeamModel();
    model.sections.set(1, { id: 1, name: 'RC', b: 0.3, h: 0.6 });
    model.sections.set(2, { id: 2, name: 'RC reversed', b: 0.6, h: 0.3 });
    model.elements.get(2)!.sectionId = 2;
    const demands = extractGoverningDemands({ elementId: 1, length: 2, stationTs: [0, 1],
      comboResults: [{ comboId: 1, comboName: 'unequal axes', stations: [0, 1].map(t => ({
        t, x: 2 * t, n: 0, my: 20, mz: 15, vy: 2, vz: 5, torsion: 0,
      })) }] });
    const forces = reverse ? [...results.elementForces].reverse() : results.elementForces;
    const run = (elementForces: typeof forces, uncached = false) => {
      const shared = sharedDemands(demands, uncached);
      return entry === 'auto'
      ? autoVerifyFromResults({ ...results, elementForces }, model, null, { edition }, shared).concrete
      : entry === 'unified' ? runUnifiedVerification({ ...results, elementForces }, model, null, shared, { edition })
        : runCirsocDesign({ ...results, elementForces }, model, shared, new Map(), null, { edition }).concrete;
    };
    const expected = run(forces, true);
    expect(new Set(expected.map(v => v.flexureAxis)).size).toBe(2);
    expect(expected.every(v => v.engineRecheck?.certified?.ok)).toBe(true);
    expect(run(forces)).toEqual(expected);
  });
}

it.each(cases)('every shared $elementType $axis $edition fixture equals an uncached verification', options => {
  const { model, results } = sharedBeamModel();
  if (options.elementType !== 'beam') {
    for (const node of model.nodes.values()) { node.z = node.x; node.x = 0; }
  }
  const inputs = inputsFor(options);
  const perCombo = inputs.map(i => extractGoverningDemands({ elementId: 1, length: 2, stationTs: [i.demand.source.stationT],
    comboResults: [{ comboId: i.demand.source.comboId, comboName: i.demand.source.comboName,
      stations: [{ ...i.demand.source.forces }] }] }));
  const demands = { elementId: 1, length: 2, demands: perCombo.flatMap(d => d.demands), concurrent: inputs.map(i => i.demand.source) };
  const verify = vi.spyOn(concurrentVerification, 'verifyConcurrentElement');
  const run = (uncached = false) => autoVerifyFromResults(results, model,
    null, { edition: options.edition }, sharedDemands(demands, uncached)).concrete;
  expect(run()).toEqual(run(true));
  expect(verify).toHaveBeenCalledTimes(options.elementType === 'beam' ? 3 : 4);
});
