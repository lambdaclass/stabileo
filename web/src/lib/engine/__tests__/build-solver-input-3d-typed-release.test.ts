import { describe, it, expect, beforeEach } from 'vitest';
import { buildSolverInput3D } from '../solver-service';
import { modelStore } from '../../store/model.svelte';

describe('buildSolverInput3D — typed Release propagation', () => {
  beforeEach(() => {
    modelStore.clear();
  });

  function makeFrame(): number {
    const n1 = modelStore.addNode(0, 0, 0);
    const n2 = modelStore.addNode(5, 0, 0);
    const elemId = modelStore.addElement(n1, n2, 'frame');
    modelStore.addSupport(n1, 'fixed3d');
    modelStore.addSupport(n2, 'fixed3d');
    return elemId;
  }

  it('propagates releaseI.my=true to releaseMyStart in solver input', () => {
    const elemId = makeFrame();
    modelStore.toggleRelease(elemId, 'i', 'my');
    const input = buildSolverInput3D(modelStore.model);
    expect(input).not.toBeNull();
    const solverElem = input!.elements.get(elemId)!;
    expect(solverElem.releaseMyStart).toBe(true);
    expect(solverElem.releaseMzStart).toBe(false);
    expect(solverElem.releaseTStart).toBe(false);
  });

  it('propagates releaseJ.my=true to releaseMyEnd in solver input', () => {
    const elemId = makeFrame();
    modelStore.toggleRelease(elemId, 'j', 'my');
    const input = buildSolverInput3D(modelStore.model);
    const solverElem = input!.elements.get(elemId)!;
    expect(solverElem.releaseMyEnd).toBe(true);
    expect(solverElem.releaseMzEnd).toBe(false);
    expect(solverElem.releaseTEnd).toBe(false);
  });

  it('propagates releaseI.t=true to releaseTStart in solver input', () => {
    const elemId = makeFrame();
    modelStore.toggleRelease(elemId, 'i', 't');
    const input = buildSolverInput3D(modelStore.model);
    const solverElem = input!.elements.get(elemId)!;
    expect(solverElem.releaseTStart).toBe(true);
    expect(solverElem.releaseMyStart).toBe(false);
    expect(solverElem.releaseMzStart).toBe(false);
  });

  it('propagates releaseJ.t=true to releaseTEnd in solver input', () => {
    const elemId = makeFrame();
    modelStore.toggleRelease(elemId, 'j', 't');
    const input = buildSolverInput3D(modelStore.model);
    const solverElem = input!.elements.get(elemId)!;
    expect(solverElem.releaseTEnd).toBe(true);
  });

  it('propagates releaseI.mz=true to releaseMzStart (regression check on existing path)', () => {
    const elemId = makeFrame();
    modelStore.toggleRelease(elemId, 'i', 'mz');
    const input = buildSolverInput3D(modelStore.model);
    const solverElem = input!.elements.get(elemId)!;
    expect(solverElem.releaseMzStart).toBe(true);
    expect(solverElem.releaseMyStart).toBe(false);
    expect(solverElem.releaseTStart).toBe(false);
  });

  it('propagates a full mixed release set on both ends without crosstalk', () => {
    const elemId = makeFrame();
    modelStore.toggleRelease(elemId, 'i', 'my');
    modelStore.toggleRelease(elemId, 'i', 't');
    modelStore.toggleRelease(elemId, 'j', 'mz');
    modelStore.toggleRelease(elemId, 'j', 't');
    const input = buildSolverInput3D(modelStore.model);
    const solverElem = input!.elements.get(elemId)!;
    expect(solverElem.releaseMyStart).toBe(true);
    expect(solverElem.releaseMzStart).toBe(false);
    expect(solverElem.releaseTStart).toBe(true);
    expect(solverElem.releaseMyEnd).toBe(false);
    expect(solverElem.releaseMzEnd).toBe(true);
    expect(solverElem.releaseTEnd).toBe(true);
  });

  it('default-zero releases produce all-false flags on both ends', () => {
    const elemId = makeFrame();
    const input = buildSolverInput3D(modelStore.model);
    const solverElem = input!.elements.get(elemId)!;
    expect(solverElem).toMatchObject({
      releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false,
      releaseTStart: false, releaseTEnd: false,
    });
  });
});
