import { describe, expect, it } from 'vitest';
import { autoVerifyFromResults } from '../auto-verify';

function makeElementForces(overrides: Partial<any> = {}) {
  return {
    elementId: 1,
    length: 3,
    nStart: 0,
    nEnd: 0,
    vyStart: 0,
    vyEnd: 0,
    vzStart: 0,
    vzEnd: 0,
    mxStart: 0,
    mxEnd: 0,
    myStart: 0,
    myEnd: 0,
    mzStart: 0,
    mzEnd: 0,
    hingeStart: false,
    hingeEnd: false,
    qYI: 0,
    qYJ: 0,
    distributedLoadsY: [],
    pointLoadsY: [],
    qZI: 0,
    qZJ: 0,
    distributedLoadsZ: [],
    pointLoadsZ: [],
    ...overrides,
  };
}

describe('autoVerifyFromResults', () => {
  it('preserves Mz as Mu and My as Muy for biaxial columns', () => {
    const results = {
      elementForces: [
        makeElementForces({
          nStart: 200,
          nEnd: 180,
          vyStart: 7,
          vyEnd: 5,
          vzStart: 30,
          vzEnd: 25,
          mzStart: 4,
          mzEnd: 3,
          myStart: 12,
          myEnd: 9,
        }),
      ],
    } as any;

    const model = {
      elements: new Map([[1, {
        id: 1,
        nodeI: 1,
        nodeJ: 2,
        sectionId: 1,
        materialId: 1,
        type: 'frame',
      }]]),
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 0 }],
        [2, { id: 2, x: 0, y: 0, z: 3 }],
      ]),
      sections: new Map([[1, {
        id: 1,
        name: 'RC 30x50',
        b: 0.30,
        h: 0.50,
        iz: 0.003125,
        iy: 0.001125,
      }]]),
      materials: new Map([[1, {
        id: 1,
        name: 'H30',
        fy: 30,
        e: 25_000_000,
      }]]),
      supports: new Map([
        [1, { id: 1, nodeId: 1, type: 'fixed' }],
        [2, { id: 2, nodeId: 2, type: 'fixed' }],
      ]),
    } as any;

    const { concrete } = autoVerifyFromResults(results, model, null);
    expect(concrete).toHaveLength(1);

    const verification = concrete[0]!;
    expect(verification.elementType).toBe('column');
    expect(verification.Mu).toBe(4);
    expect(verification.Vu).toBe(7);
    expect(verification.biaxial?.Muz).toBe(4);
    expect(verification.biaxial?.Muy).toBe(12);
  });

  it('keeps beam flexure on the Mz strong-axis slot even when My is larger', () => {
    const results = {
      elementForces: [
        makeElementForces({
          nStart: 20,
          nEnd: 15,
          vyStart: 9,
          vyEnd: 6,
          vzStart: 18,
          vzEnd: 12,
          mzStart: 6,
          mzEnd: 5,
          myStart: 14,
          myEnd: 11,
        }),
      ],
    } as any;

    const model = {
      elements: new Map([[1, {
        id: 1,
        nodeI: 1,
        nodeJ: 2,
        sectionId: 1,
        materialId: 1,
        type: 'frame',
      }]]),
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 3 }],
        [2, { id: 2, x: 5, y: 0, z: 3 }],
      ]),
      sections: new Map([[1, {
        id: 1,
        name: 'RC 30x50',
        b: 0.30,
        h: 0.50,
        iz: 0.003125,
        iy: 0.001125,
      }]]),
      materials: new Map([[1, {
        id: 1,
        name: 'H30',
        fy: 30,
        e: 25_000_000,
      }]]),
      supports: new Map([
        [1, { id: 1, nodeId: 1, type: 'fixed' }],
        [2, { id: 2, nodeId: 2, type: 'fixed' }],
      ]),
    } as any;

    const { concrete } = autoVerifyFromResults(results, model, null);
    expect(concrete).toHaveLength(1);

    const verification = concrete[0]!;
    expect(verification.elementType).toBe('beam');
    expect(verification.Mu).toBe(6);
    expect(verification.Vu).toBe(9);
    expect(verification.biaxial).toBeUndefined();
  });
});
