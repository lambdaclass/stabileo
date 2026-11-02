import { describe, expect, it } from 'vitest';
import { autoVerifyFromResults } from '../auto-verify';
import { verifyElement } from '../codes/argentina/cirsoc201';

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
  it('biaxial column: the larger moment is primary over its own depth, the other is the biaxial partner', () => {
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
    expect(verification.flexureAxis).toBe('My');
    expect(verification.Mu).toBe(12);
    expect(verification.Vu).toBe(30);
    expect([verification.b, verification.h]).toEqual([0.30, 0.50]);
    expect(verification.biaxial?.Muz).toBe(12);
    expect(verification.biaxial?.Muy).toBe(4);
    expect(verification.shearSecondary?.Vu).toBe(7);
  });

  // Helper: a horizontal beam model with one section/material.
  function horizBeamModel() {
    return {
      elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
      nodes: new Map([
        [1, { id: 1, x: 0, y: 0, z: 3 }],
        [2, { id: 2, x: 5, y: 0, z: 3 }],
      ]),
      sections: new Map([[1, { id: 1, name: 'RC 30x50', b: 0.30, h: 0.50, iz: 0.003125, iy: 0.001125 }]]),
      materials: new Map([[1, { id: 1, name: 'H30', fy: 30, e: 25_000_000 }]]),
      supports: new Map([
        [1, { id: 1, nodeId: 1, type: 'fixed' }],
        [2, { id: 2, nodeId: 2, type: 'fixed' }],
      ]),
    } as any;
  }

  it('beam flexure: My governs (vertical-plane gravity) when its stress demand is larger', () => {
    // My (14) bends about depth h=0.50; Mz (6) about depth b=0.30.
    // stressMy=14/(0.3·0.5²)=186.7 > stressMz=6/(0.5·0.3²)=133.3 → My governs.
    const results = {
      elementForces: [makeElementForces({
        nStart: 20, nEnd: 15, vyStart: 9, vyEnd: 6, vzStart: 18, vzEnd: 12,
        mzStart: 6, mzEnd: 5, myStart: 14, myEnd: 11,
      })],
    } as any;
    const { concrete } = autoVerifyFromResults(results, horizBeamModel(), null);
    expect(concrete).toHaveLength(1);
    const v = concrete[0]!;
    expect(v.elementType).toBe('beam');
    expect(v.flexureAxis).toBe('My');
    expect(v.Mu).toBe(14);              // My demand, not Mz
    expect(v.Vu).toBe(18);              // paired vertical shear Vz, not Vy
    expect(v.flexure.ratio).toBeGreaterThan(0); // real, nonzero, finite
    expect(Number.isFinite(v.flexure.ratio)).toBe(true);
    expect(v.biaxial).toBeUndefined();  // beams never get the column biaxial path
  });

  it('beam flexure: Mz governs (horizontal-plane lateral) when its stress demand is larger', () => {
    // Mz (20) about depth b=0.30; My (2) about depth h=0.50.
    // stressMz=20/(0.5·0.3²)=444 > stressMy=2/(0.3·0.5²)=26.7 → Mz governs.
    const results = {
      elementForces: [makeElementForces({
        nStart: 10, nEnd: 8, vyStart: 15, vyEnd: 10, vzStart: 3, vzEnd: 2,
        mzStart: 20, mzEnd: 16, myStart: 2, myEnd: 1,
      })],
    } as any;
    const { concrete } = autoVerifyFromResults(results, horizBeamModel(), null);
    const v = concrete[0]!;
    expect(v.elementType).toBe('beam');
    expect(v.flexureAxis).toBe('Mz');
    expect(v.Mu).toBe(20);              // Mz demand
    expect(v.Vu).toBe(15);              // paired Vy
    expect(v.flexure.ratio).toBeGreaterThan(0);
  });
});

describe('autoVerifyFromResults: column design axes (#532)', () => {
  function columnModel(b: number, h: number) {
    return {
      elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }]]),
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }]]),
      sections: new Map([[1, { id: 1, name: 'RC', b, h, iy: b * h ** 3 / 12, iz: h * b ** 3 / 12 }]]),
      materials: new Map([[1, { id: 1, name: 'H25', fy: 25, e: 25_000_000 }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    } as any;
  }
  const column = (f: Partial<any>) => ({ elementForces: [makeElementForces({ nStart: -800, nEnd: -800, ...f })] }) as any;
  const reference = (b: number, h: number, Mu: number, Vu: number) => verifyElement({
    elementId: 1, elementType: 'column', Mu, Vu, Nu: 800, axialLoads: [800], NuShear: 800,
    b, h, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8,
  });

  it('Mz bends a 30×60 column over its 30 cm width', () => {
    const [v] = autoVerifyFromResults(column({ mzStart: 120, mzEnd: -120, vyStart: 80, vyEnd: 80 }), columnModel(0.3, 0.6), null).concrete;
    expect(v!.flexureAxis).toBe('Mz');
    expect([v!.b, v!.h]).toEqual([0.6, 0.3]);
    expect(v!.Mu).toBe(120);
    expect(v!.Vu).toBe(80);
    const right = reference(0.6, 0.3, 120, 80);
    const swapped = reference(0.3, 0.6, 120, 80);
    expect(v!.column!.ratio).toBeCloseTo(right.column!.ratio, 9);
    expect(right.column!.ratio).toBeGreaterThan(swapped.column!.ratio);
  });

  it('My bends a 30×60 column over its 60 cm depth, with Vz as its shear', () => {
    const [v] = autoVerifyFromResults(column({ myStart: 120, myEnd: -120, vzStart: 80, vzEnd: 80 }), columnModel(0.3, 0.6), null).concrete;
    expect(v!.flexureAxis).toBe('My');
    expect([v!.b, v!.h]).toEqual([0.3, 0.6]);
    expect(v!.Mu).toBe(120);
    expect(v!.Vu).toBe(80);
    expect(v!.column!.ratio).toBeCloseTo(reference(0.3, 0.6, 120, 80).column!.ratio, 9);
  });

  it('slenderness end moments come from the primary axis', () => {
    const [v] = autoVerifyFromResults(column({ myStart: 120, myEnd: 60, mzStart: 5, mzEnd: -5 }), columnModel(0.3, 0.6), null).concrete;
    expect(v!.flexureAxis).toBe('My');
    expect(v!.slender?.steps.some((x) => x.startsWith('M1/M2 = 0.500'))).toBe(true);
  });

  it('the secondary shear is checked over the rotated section', () => {
    const [v] = autoVerifyFromResults(column({ myStart: 120, myEnd: -120, vzStart: 80, vzEnd: 80, vyStart: 150, vyEnd: 150 }), columnModel(0.3, 0.6), null).concrete;
    expect(v!.shearSecondary?.Vu).toBe(150);
    expect(v!.shearSecondary?.ratio).toBeCloseTo(reference(0.6, 0.3, 120, 150).shear.ratio, 9);
  });
});
