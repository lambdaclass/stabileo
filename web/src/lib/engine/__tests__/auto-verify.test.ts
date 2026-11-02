import { describe, expect, it } from 'vitest';
import { autoVerifyFromResults } from '../auto-verify';
import { verifyElement } from '../codes/argentina/cirsoc201';
import { normalizeCirsoc201 } from '../design-check-results';

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
    expect(v!.shearSecondary?.spacing).toBe(reference(0.6, 0.3, 120, 150).shear.spacing);
    expect(v!.shearSecondary?.ratio).toBeCloseTo(reference(0.6, 0.3, 120, 150).shear.ratio, 9);
  });

  it('both shear axes are checked with the one stirrup spacing the tighter axis needs', () => {
    const input = {
      elementId: 1, elementType: 'column' as const, Mu: 120, Vu: 20, Nu: 800, axialLoads: [800], NuShear: 800,
      b: 0.3, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8,
    };
    const alone = verifyElement(input);
    const secondaryAlone = reference(0.6, 0.3, 120, 150).shear;
    expect(secondaryAlone.spacing).toBeLessThan(alone.shear.spacing);
    const v = verifyElement({ ...input, VuSecondary: 150 });
    expect(v.shear.spacing).toBe(secondaryAlone.spacing);
    expect(v.shearSecondary!.spacing).toBe(secondaryAlone.spacing);
    expect(v.shearSecondary!.ratio).toBeCloseTo(secondaryAlone.ratio, 9);
    expect(v.shear.phiVn).toBeGreaterThan(alone.shear.phiVn);
    expect(v.shear.steps).toContain(`Estribos: ${v.shear.stirrupLegs} ramas Ø8 c/${(secondaryAlone.spacing * 100).toFixed(0)} cm`);
  });

  it('the secondary axis is magnified with its own slenderness, and the magnified moment is the biaxial partner', () => {
    const [v] = autoVerifyFromResults(column({ myStart: 120, myEnd: -120, mzStart: 110, mzEnd: 110 }), columnModel(0.2, 0.6), null).concrete;
    expect(v!.flexureAxis).toBe('My');
    const weak = v!.slenderSecondary!;
    expect(weak.isSlender).toBe(true);
    expect(weak.r).toBeCloseTo(0.3 * 0.2, 12);
    expect(weak.Mc).toBeGreaterThan(v!.Mu);
    expect(v!.biaxial!.Muy).toBeCloseTo(weak.Mc, 9);
    const unmagnified = verifyElement({
      elementId: 1, elementType: 'column', Mu: v!.Mu, Vu: 0, Nu: 800, axialLoads: [800], NuShear: 800,
      b: 0.2, h: 0.6, fc: 25, fy: 420, cover: 0.025, stirrupDia: 8, Muy: 110,
    });
    expect(v!.biaxial!.ratio).toBeGreaterThan(unmagnified.biaxial!.ratio);
  });

  it('a non-finite demand is checked, and fails, on whichever axis it is', () => {
    expect(() => autoVerifyFromResults(column({ myStart: NaN, myEnd: NaN, mzStart: 50, mzEnd: -50 }), columnModel(0.3, 0.6), null))
      .toThrow(/non-finite/);
    const [nanShear] = autoVerifyFromResults(column({ myStart: 120, myEnd: -120, vzStart: 80, vzEnd: 80, vyStart: NaN, vyEnd: NaN }), columnModel(0.3, 0.6), null).concrete;
    expect(nanShear!.shearSecondary?.status).toBe('fail');
    expect(nanShear!.overallStatus).toBe('fail');
  });

  it('each shear row names the combination that governs its own axis', () => {
    const governing = new Map([[1, {
      momentY: { comboId: 1, comboName: '1.2D+1.6L', value: 120 },
      shearZ: { comboId: 1, comboName: '1.2D+1.6L', value: 80 },
      shearY: { comboId: 2, comboName: '1.2D+1.0E', value: 150 },
    }]]);
    const forces = column({ myStart: 120, myEnd: -120, vzStart: 80, vzEnd: 80, vyStart: 150, vyEnd: 150 });
    const [v] = autoVerifyFromResults(forces, columnModel(0.3, 0.6), governing).concrete;
    expect(v!.governingCombos?.shear?.comboName).toBe('1.2D+1.6L');
    expect(v!.governingCombos?.shearSecondary?.comboName).toBe('1.2D+1.0E');
    const rows = normalizeCirsoc201([v!], new Map([[1, 'RC']]))[0]!.checks;
    expect(rows.find((r) => r.name === 'Shear')?.comboName).toBe('1.2D+1.6L');
    expect(rows.find((r) => r.name === 'Shear, secondary axis')?.comboName).toBe('1.2D+1.0E');
  });

  it('a Mz-governed column takes its secondary shear combination from Vz', () => {
    const governing = new Map([[1, {
      momentZ: { comboId: 1, comboName: '1.2D+1.6L', value: 120 },
      shearY: { comboId: 1, comboName: '1.2D+1.6L', value: 80 },
      shearZ: { comboId: 3, comboName: '0.9D+1.0E', value: 150 },
    }]]);
    const forces = column({ mzStart: 120, mzEnd: -120, vyStart: 80, vyEnd: 80, vzStart: 150, vzEnd: 150 });
    const [v] = autoVerifyFromResults(forces, columnModel(0.3, 0.6), governing).concrete;
    expect(v!.flexureAxis).toBe('Mz');
    expect(v!.governingCombos?.shearSecondary?.comboName).toBe('0.9D+1.0E');
  });
});
