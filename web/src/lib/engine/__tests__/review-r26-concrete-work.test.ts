import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { registerCirsoc201BeamKernel, evaluateBeamSections, type Cirsoc201BeamKernel, type BeamSectionQuery } from '../codes/argentina/cirsoc201-beam-kernel';
import { cirsoc201Engine, registerCirsoc201Engine, type Cirsoc201Engine } from '../codes/argentina/cirsoc201-engine';
import { ConcurrentDemand } from '../concurrent-demand';
import { normalizeCirsoc201 } from '../design-check-results';
import { autoVerifyFromResults } from '../auto-verify';
import * as concurrent from '../concurrent-verification';
import * as gate from '../codes/argentina/cirsoc201-engine-gate';
import { extractGoverningDemands } from '../station-design-forces';
import { solve, solve3D, solvePDelta, solvePDelta3D } from '../wasm-solver';
import type { ElementForces, SolverInput } from '../types';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import { runCirsocDesign, runUnifiedVerification } from '../verification-service';

const registered = (): Cirsoc201Engine => ({ Section: cirsoc201Engine('Section'), basis: cirsoc201Engine('basis'),
  phi: cirsoc201Engine('phi'), designBeam: cirsoc201Engine('designBeam'), slabProvisions: cirsoc201Engine('slabProvisions') });
let real: Cirsoc201Engine;
let beamKernel: Cirsoc201BeamKernel;
beforeAll(async () => { real = registered(); beamKernel = (await import('../../wasm/dedaliano_engine.js')).cirsoc201_beam_batch; });
const query: BeamSectionQuery = { edition: '2025', fc: 25e6, fy: 420e6, b: 0.3, h: 0.6, d: 0.55, As: 0.001 };

afterEach(() => { vi.restoreAllMocks(); registerCirsoc201Engine(real); if (beamKernel) registerCirsoc201BeamKernel(beamKernel); });

it('known wrong result: #2080 identical complete basis inputs cross WASM once', () => {
  const basis = vi.fn((input: Float64Array) => input.slice());
  registerCirsoc201Engine({ ...real, basis });
  const input = Float64Array.from({ length: 9 }, (_, i) => i + 1);
  const ask = cirsoc201Engine('basis');
  expect(ask(input)).toEqual(input);
  expect(ask(input.slice())).toEqual(input);
  expect(basis).toHaveBeenCalledTimes(1);
});

for (const torque of [0, 6]) for (const spatial of [false, true]) for (const nonlinear of [false, true]) for (const edition of ['2005', '2025'] as const) for (const entry of ['auto', 'unified', 'design'] as const) {
  (torque === 0 ? it : it.fails)(`known wrong result: #2080 held span checks reuse complete inputs ${spatial} ${nonlinear} ${edition} ${entry} torque=${torque}`, () => {
    const model = {
      nodes: new Map([1, 2, 3].map(id => [id, { id, x: (id - 1) * 0.4, y: 0, z: 0 }])),
      elements: new Map([1, 2].map(id => [id, { id, nodeI: id, nodeJ: id + 1, type: 'frame' as const, sectionId: 1, materialId: 1 }])),
      sections: new Map([[1, { id: 1, name: 'RC', b: 0.3, h: 0.6, a: 0.3 * 0.6, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.001 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fc: 25, fy: 25, e: 25000, nu: 0.2 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' as const }]]),
    };
    let solved: AnalysisResults3D;
    if (spatial) {
      const input: SolverInput3D = { ...model,
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }])),
        supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
        loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fy: 0, fz: 0, mx: torque, my: 20, mz: 0 } }],
      };
      solved = nonlinear ? solvePDelta3D(input).results : solve3D(input);
    } else {
      const input: SolverInput = { ...model, nodes: new Map([...model.nodes].map(([id, n]) => [id, { id, x: n.x, z: 0 }])),
        elements: new Map([...model.elements].map(([id, e]) => [id, { ...e, hingeStart: false, hingeEnd: false }])),
        loads: [{ type: 'nodal', data: { nodeId: 3, fx: 0, fz: 0, my: 20 } }],
      };
      const planar = nonlinear ? solvePDelta(input).results : solve(input);
      solved = { displacements: [], reactions: [], elementForces: planar.elementForces.map((ef: ElementForces) => ({
        elementId: ef.elementId, length: ef.length, nStart: ef.nStart, nEnd: ef.nEnd,
        myStart: ef.mStart, myEnd: ef.mEnd, mzStart: 0, mzEnd: 0, vyStart: 0, vyEnd: 0,
        vzStart: ef.vStart, vzEnd: ef.vEnd, mxStart: 0, mxEnd: 0,
        releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
        qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, distributedLoadsY: [], pointLoadsY: [], distributedLoadsZ: [], pointLoadsZ: [],
      })) };
    }
    expect(solved.elementForces).toHaveLength(2);
    const results = { ...solved, elementForces: solved.elementForces.map(ef => ({ ...ef, mxStart: torque, mxEnd: torque })) };
    const ef = results.elementForces[0]!;
    const demand = extractGoverningDemands({ elementId: 1, length: 0.8, stationTs: [0, 1], comboResults: [{
      comboId: 1, comboName: 'torsion', stations: [0, 1].map(t => ({ t, x: 0.8 * t, n: t ? ef.nEnd : ef.nStart,
        my: t ? ef.myEnd : ef.myStart, mz: t ? ef.mzEnd : ef.mzStart,
        vy: t ? ef.vyEnd : ef.vyStart, vz: t ? ef.vzEnd : ef.vzStart, torsion: torque })),
    }] });
    const demands = new Map([[1, demand], [2, demand]]);
    const run = (elementForces: typeof results.elementForces) => entry === 'auto' ? autoVerifyFromResults({ ...results, elementForces }, model, null, { edition }, demands).concrete
      : entry === 'unified' ? runUnifiedVerification({ ...results, elementForces }, model, null, demands, { edition })
        : runCirsocDesign({ ...results, elementForces }, model, demands, new Map(), null, { edition }).concrete;
    const originalRecheck = gate.engineRecheckElement;
    const recheck = vi.spyOn(gate, 'engineRecheckElement').mockImplementation((...args) => {
      const value = originalRecheck(...args);
      if (torque !== 0 && value.engineRecheck.certified) value.engineRecheck.certified.reason = 'Unchecked provision display text';
      return value;
    });
    const expected = results.elementForces.flatMap(ef => run([ef]));
    expect(expected.every(v => torque === 0 ? v.torsion === undefined : v.torsion?.longitudinalProvision === 'not-checked')).toBe(true);
    expect(expected.every(v => torque === 0 ? v.engineRecheck?.certified?.ok === true : v.engineRecheck?.certified?.code === 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED')).toBe(true);
    for (const value of expected) for (const check of value.concurrentChecks ?? []) {
      expect(check.verification.engineRecheck?.certified?.code).toBe(torque === 0 ? undefined : 'VERIF_TORSION_LONGITUDINAL_NOT_CHECKED');
    }
    recheck.mockClear();
    let stationCopies = 0;
    const original = concurrent.verifyConcurrentElement;
    const verify = vi.spyOn(concurrent, 'verifyConcurrentElement').mockImplementation(inputs => {
      const value = original(inputs);
      for (const check of value.concurrentChecks ?? []) {
        const detailing = check.verification.detailing;
        if (!detailing) continue;
        const bars = detailing.bars;
        Object.defineProperty(detailing, 'bars', { enumerable: true, configurable: true,
          get() { stationCopies++; return bars; },
        });
      }
      return value;
    });
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const sections = vi.spyOn(ConcurrentDemand.prototype, 'section');
    const actual = run(results.elementForces);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(recheck).toHaveBeenCalledTimes(demand.concurrent!.length);
    expect(sections).toHaveBeenCalledTimes(demand.concurrent!.length);
    expect(clone.mock.calls.filter(([v]) => v && typeof v === 'object' && 'flexure' in v)).toHaveLength(0);
    normalizeCirsoc201(actual, new Map());
    expect(stationCopies).toBe(actual.length);
    expect(actual).toEqual(expected);
    actual[0]!.flexure.steps.push('first');
    actual[0]!.concurrentChecks![0]!.verification.flexure.steps.push('first station');
    expect(actual[1]).toEqual(expected[1]);
    const before = [...actual[0]!.concurrentChecks![0]!.verification.flexure.steps];
    actual[1]!.concurrentChecks![0]!.verification.flexure.steps.push('second station');
    expect(actual[0]!.concurrentChecks![0]!.verification.flexure.steps).toEqual(before);
  });
}

it('known wrong result: #2080 identical complete beam queries cross WASM once', () => {
  const kernel = vi.fn((input: Float64Array) => input.slice(0, 16));
  registerCirsoc201BeamKernel(kernel);
  expect(evaluateBeamSections([query])).toEqual(evaluateBeamSections([{ ...query }]));
  expect(kernel).toHaveBeenCalledTimes(1);
});

for (const width of [9, 17]) {
  function install(kernel: (input: Float64Array) => Float64Array) {
    if (width === 9) {
      registerCirsoc201Engine({ ...real, basis: kernel });
      return (input: Float64Array) => cirsoc201Engine('basis')(input);
    }
    registerCirsoc201BeamKernel(kernel);
    return (input: Float64Array) => evaluateBeamSections([{ ...query,
      edition: input[0] === 2005 ? '2005' : '2025', fc: input[1], fy: input[2], es: input[3],
      b: input[4], h: input[5], d: input[6], As: input[7], AsComp: input[8], dPrime: input[9],
      Av: input[10], s: input[11], fyt: input[12], Ag: input[13], NuCompression: input[14], bf: input[15], hf: input[16],
    }]);
  }
  it(`known wrong result: #2080 complete ${width}-field cache keys distinguish every input and own their storage`, () => {
    const kernel = vi.fn((input: Float64Array) => input.slice(0, width === 9 ? 9 : 16));
    const ask = install(kernel);
    const input = Float64Array.from({ length: width }, (_, i) => i === 0 ? 2025 : i + 1);
    const expected = ask(input);
    expect(ask(input.slice())).toEqual(expected);
    expect(kernel).toHaveBeenCalledTimes(1);
    for (let i = 0; i < width; i++) {
      const changed = input.slice(); changed[i] = i === 0 && width === 17 ? 2005 : changed[i] * (1 + Number.EPSILON);
      ask(changed);
      expect(kernel).toHaveBeenCalledTimes(i + 2);
    }
    if (width === 9) (expected as Float64Array)[0] = 999;
    else (expected as NonNullable<ReturnType<typeof evaluateBeamSections>>)[0]!.phiMn = 999;
    expect(ask(input)).not.toEqual(expected);
    const saved = ask(input);
    kernel.mock.results[0]!.value[0] = 999;
    expect(ask(input)).toEqual(saved);
    for (const value of [0, -0, Infinity, -Infinity, NaN]) {
      const changed = input.slice(); changed[1] = value;
      expect(ask(changed)).toEqual(ask(changed.slice()));
    }
    expect(kernel).toHaveBeenCalledTimes(width + 6);
  });
  for (const count of [4095, 4096, 4097]) it(`known wrong result: #2080 ${width}-field cache retains exact answers across ${count} entries`, () => {
    const kernel = vi.fn((input: Float64Array) => input.slice(0, width === 9 ? 9 : 16));
    const ask = install(kernel);
    const input = new Float64Array(width); input[0] = 2025;
    for (let i = 0; i < count; i++) { input[1] = i; ask(input); }
    expect(kernel).toHaveBeenCalledTimes(count);
    expect(ask(input)).toEqual(ask(input));
    expect(kernel).toHaveBeenCalledTimes(count);
    input[1] = 0; ask(input);
    expect(kernel).toHaveBeenCalledTimes(count + Number(count > 4096));
  });
  it(`known wrong result: #2080 ${width}-field cache retries failures and is cleared on registration or removal`, () => {
    const kernel = vi.fn((input: Float64Array) => input.slice(0, width === 9 ? 9 : 16));
    kernel.mockImplementationOnce(() => { throw new Error('kernel failed'); });
    let ask = install(kernel);
    const input = new Float64Array(width); input[0] = 2025;
    expect(() => ask(input)).toThrow('kernel failed');
    const expected = ask(input);
    expect(ask(input)).toEqual(expected);
    expect(kernel).toHaveBeenCalledTimes(2);
    ask = install(kernel); expect(ask(input)).toEqual(expected);
    expect(kernel).toHaveBeenCalledTimes(3);
    if (width === 9) {
      registerCirsoc201Engine(null);
      expect(() => cirsoc201Engine('basis')).toThrow();
    } else {
      registerCirsoc201BeamKernel(null);
      expect(evaluateBeamSections([query])).toBeNull();
    }
  });
}

it.each([0, 8, 10, 18])('malformed or batched %i-value basis inputs bypass the scalar cache', length => {
  const basis = vi.fn((input: Float64Array) => input.slice());
  registerCirsoc201Engine({ ...real, basis });
  const input = new Float64Array(length);
  const ask = cirsoc201Engine('basis');
  expect(ask(input)).toEqual(input);
  expect(ask(input)).toEqual(input);
  expect(basis).toHaveBeenCalledTimes(2);
});

it.each([0, 2])('a %i-section beam batch retains its exact uncached answer', count => {
  const kernel = vi.fn(() => new Float64Array(count * 16));
  registerCirsoc201BeamKernel(kernel);
  const queries = Array.from({ length: count }, () => query);
  const expected = evaluateBeamSections(queries);
  expect(evaluateBeamSections(queries)).toEqual(expected);
  expect(kernel).toHaveBeenCalledTimes(2);
});

it('hash collisions retain both exact bit patterns through FIFO eviction', () => {
  const hash = (words: Uint32Array) => {
    let value = 2166136261;
    for (const word of words) value = Math.imul(value ^ word, 16777619);
    return value;
  };
  const first = new Float64Array(9).fill(1);
  const before = new Uint32Array(first.buffer);
  const second = first.slice();
  const after = new Uint32Array(second.buffer);
  after[0] ^= 1;
  let inverse = 1;
  for (let i = 0; i < 5; i++) inverse = Math.imul(inverse, 2 - Math.imul(16777619, inverse));
  after[after.length - 1] = hash(after.subarray(0, -1)) ^ Math.imul(hash(before), inverse);
  expect(after).not.toEqual(before);
  expect(hash(after)).toBe(hash(before));
  const basis = vi.fn((input: Float64Array) => input.slice());
  registerCirsoc201Engine({ ...real, basis });
  const ask = cirsoc201Engine('basis');
  expect(new Uint32Array(ask(first).buffer)).toEqual(before);
  expect(new Uint32Array(ask(second).buffer)).toEqual(after);
  expect(new Uint32Array(ask(first).buffer)).toEqual(before);
  expect(new Uint32Array(ask(second).buffer)).toEqual(after);
  expect(basis).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 4095; i++) ask(new Float64Array(9).fill(i + 100));
  expect(basis).toHaveBeenCalledTimes(4097);
  expect(new Uint32Array(ask(second).buffer)).toEqual(after);
  expect(basis).toHaveBeenCalledTimes(4097);
  expect(new Uint32Array(ask(first).buffer)).toEqual(before);
  expect(basis).toHaveBeenCalledTimes(4098);
});
