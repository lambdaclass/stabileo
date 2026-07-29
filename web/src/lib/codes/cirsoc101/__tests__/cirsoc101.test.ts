import { describe, it, expect } from 'vitest';
import { formatCombinationLabel, teAt } from '../../../i18n/engine-text';
import {
  generateCombinations, liveLoadFactorInCompanion, type CombinationInputs,
} from '../combinations';
import {
  K_LL, OCCUPANCY_TABLE_2025, REDUCTION_THRESHOLD_M2, findOccupancy, reduceLiveLoad,
} from '../live-loads';

const absent: CombinationInputs['present'] = {
  L: false, Lr: false, S: false, R: false, W: false, E: false, F: false, H: false,
};

const inputs = (p: Partial<CombinationInputs['present']>, rest: Partial<CombinationInputs> = {})
  : CombinationInputs => ({ present: { ...absent, ...p }, ...rest });

describe('CIRSOC 101-2025 §2.3.2 — the seven basic combinations', () => {
  it('always emits 1,4 D', () => {
    const c = generateCombinations(inputs({}));
    expect(c).toHaveLength(1);
    expect(c[0].label).toBe('1.4 D');
    expect(c[0].refs[0].clause).toBe('2.3.2');
    expect(c[0].refs[0].edition).toBe('2025');
  });

  it('emits combination 2 with L at 1,6 — Exception 1 does not reach it', () => {
    // Exception 1 names combinations 3, 4 and 5 only.
    const c = generateCombinations(inputs({ L: true }, { maxLoKNm2: 2.0 }));
    const two = c.filter((x) => x.basic === 2);
    expect(two).toHaveLength(1);
    expect(two[0].label).toBe('1.2 D + 1.6 L');
  });

  it('expands (Lr ó S ó R) into one combination per present companion', () => {
    const c = generateCombinations(inputs({ L: true, Lr: true, S: true, R: true }));
    const two = c.filter((x) => x.basic === 2);
    expect(two.map((x) => x.id).sort()).toEqual(['2-Lr', '2-R', '2-S']);
    expect(two.find((x) => x.id === '2-Lr')!.label).toBe('1.2 D + 1.6 L + 0.5 Lr');
  });

  it('emits combination 3 in both the L and the 0,5 W variants', () => {
    const c = generateCombinations(inputs({ L: true, Lr: true, W: true }, { maxLoKNm2: 2.0 }));
    const three = c.filter((x) => x.basic === 3);
    expect(three.map((x) => x.id).sort()).toEqual(['3-Lr-L', '3-Lr-W']);
    expect(three.find((x) => x.id === '3-Lr-W')!.label).toBe('1.2 D + 1.6 Lr + 0.5 W');
  });

  it('emits 4 and 6 when wind is present, and 5 and 7 when seismic is', () => {
    const w = generateCombinations(inputs({ W: true })).map((x) => x.basic);
    expect(w).toContain(4);
    expect(w).toContain(6);
    const s = generateCombinations(inputs({ E: true })).map((x) => x.basic);
    expect(s).toContain(5);
    expect(s).toContain(7);
  });

  it('never puts W and E in the same combination', () => {
    // §2.3.2: wind and seismic effects need not be considered simultaneously.
    const c = generateCombinations(inputs({ L: true, W: true, E: true, S: true }));
    for (const x of c) {
      const sym = x.terms.map((t) => t.symbol);
      expect(sym.includes('W') && sym.includes('E'), x.id).toBe(false);
    }
  });

  it('applies 0,2 S in combination 5', () => {
    const five = generateCombinations(inputs({ E: true, S: true })).find((x) => x.basic === 5)!;
    expect(five.label).toBe('1.2 D + 1.0 E + 0.2 S');
  });

  it('reproduces the printed combination 4 exactly', () => {
    const c = generateCombinations(inputs({ L: true, W: true, Lr: true }, { maxLoKNm2: 10 }));
    const four = c.find((x) => x.id === '4-Lr')!;
    // Lo > 5 kN/m², so Exception 1 does not apply and L keeps factor 1,0.
    expect(four.label).toBe('1.2 D + 1.0 W + 1.0 L + 0.5 Lr');
  });
});

describe('§2.3.2 Exception 1 — reduced L factor in combinations 3, 4 and 5', () => {
  it('applies 0,5 when Lo <= 5 kN/m² and there is no garage or public assembly', () => {
    const r = liveLoadFactorInCompanion(inputs({}, { maxLoKNm2: 5.0 }));
    expect(r.factor).toBe(0.5);
    expect(r.note!.key).toBe('loads.cirsoc101.exception1.applied');
    expect(teAt(r.note!, 'es')).toMatch(/Excepción 1 aplicada/);
    expect(teAt(r.note!, 'en')).toMatch(/Exception 1 applied/);
  });

  it('does not apply above 5 kN/m²', () => {
    expect(liveLoadFactorInCompanion(inputs({}, { maxLoKNm2: 5.1 })).factor).toBe(1.0);
  });

  it('does not apply when a garage or place of public assembly is present', () => {
    const r = liveLoadFactorInCompanion(
      inputs({}, { maxLoKNm2: 2.0, hasGarageOrPublicAssembly: true }));
    expect(r.factor).toBe(1.0);
    expect(r.note!.key).toBe('loads.cirsoc101.exception1.blockedByAssembly');
    expect(teAt(r.note!, 'es')).toMatch(/garaje o de reunión pública/);
  });

  it('stays conservative when Lo is unknown', () => {
    const r = liveLoadFactorInCompanion(inputs({}));
    expect(r.factor).toBe(1.0);
    expect(r.note!.key).toBe('loads.cirsoc101.exception1.unknownLo');
    expect(teAt(r.note!, 'es')).toMatch(/conservador/);
  });

  it('feeds the generated combinations and records why', () => {
    const four = generateCombinations(inputs({ L: true, W: true }, { maxLoKNm2: 2.0 }))
      .find((x) => x.basic === 4)!;
    expect(four.label).toBe('1.2 D + 1.0 W + 0.5 L');
    expect(four.notes.map((n) => n.key)).toContain('loads.cirsoc101.exception1.applied');
  });
});

describe('§2.3.2 — fluid load F and earth pressure H', () => {
  it('gives F the same factor as D, in combinations 1 through 5 and 7', () => {
    const c = generateCombinations(inputs({ F: true, W: true, E: true }));
    expect(c.find((x) => x.basic === 1)!.label).toBe('1.4 D + 1.4 F');
    expect(c.find((x) => x.basic === 7)!.label).toBe('0.9 D + 1.0 E + 0.9 F');
    // Combination 6 is excluded: the printed rule says "1 hasta 5 y 7".
    expect(c.find((x) => x.basic === 6)!.terms.some((t) => t.symbol === 'F')).toBe(false);
  });

  it('uses 1,6 H when H adds to the primary variable effect', () => {
    const c = generateCombinations(inputs({ H: true }, { earthPressureAction: 'adds' }));
    expect(c[0].label).toBe('1.4 D + 1.6 H');
  });

  it('uses 0,9 H when H opposes and is permanent', () => {
    const c = generateCombinations(inputs({ H: true },
      { earthPressureAction: 'opposes', earthPressurePermanent: true }));
    expect(c[0].label).toBe('1.4 D + 0.9 H');
  });

  it('drops H entirely when it opposes and is not permanent', () => {
    const c = generateCombinations(inputs({ H: true }, { earthPressureAction: 'opposes' }));
    expect(c[0].label).toBe('1.4 D');
    expect(c[0].notes.map((n) => n.key))
      .toContain('loads.cirsoc101.note.hOpposesTemporary');
  });

  it('generates both cases rather than guessing when the direction is unstated', () => {
    const c = generateCombinations(inputs({ H: true }));
    expect(c.map((x) => x.id)).toEqual(['1-H+', '1-H-']);
    expect(c[0].notes.map((n) => n.key)).toContain('loads.cirsoc101.note.hUnknownAdding');
  });
});

describe('Table 4.1 — occupancy loads', () => {
  it('has no duplicate keys', () => {
    const keys = OCCUPANCY_TABLE_2025.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cites Table 4.1 on every entry', () => {
    for (const o of OCCUPANCY_TABLE_2025) {
      expect(o.refs.some((r) => r.clause === 'Tabla 4.1' && r.edition === '2025'), o.key).toBe(true);
    }
  });

  it('records a cross-reference instead of inventing a value', () => {
    // Table 4.1 sends "Balcones — otros casos" to article 4.11 rather than giving kN/m².
    const b = findOccupancy('balcon_otros')!;
    expect(b.uniformKNm2).toBeNull();
    expect(b.seeArticle).toBe('4.11');
  });

  it('transcribes the values that drive the worked examples', () => {
    expect(findOccupancy('oficina')!.uniformKNm2).toBe(2.5);
    expect(findOccupancy('oficina')!.concentratedKN).toBe(9.0);
    expect(findOccupancy('vivienda')!.uniformKNm2).toBe(2.0);
    expect(findOccupancy('escuela_aulas')!.uniformKNm2).toBe(3.0);
    expect(findOccupancy('comercio_minorista_pb')!.uniformKNm2).toBe(5.0);
    expect(findOccupancy('deposito_pesado')!.uniformKNm2).toBe(12.0);
    expect(findOccupancy('archivos')!.uniformKNm2).toBe(7.0);
  });

  it('flags garages and assembly areas, which two separate rules depend on', () => {
    expect(findOccupancy('garaje_autos')!.garageOrPublicAssembly).toBe(true);
    expect(findOccupancy('reunion_vestibulos')!.garageOrPublicAssembly).toBe(true);
    expect(findOccupancy('oficina')!.garageOrPublicAssembly).toBeUndefined();
  });
});

describe('§4.7.2 — live-load reduction, Eq. (4.1)', () => {
  it('does not reduce below K_LL·A_t = 37 m²', () => {
    // interior beam, K_LL = 2 -> A_t = 18 m² gives 36 m², just under.
    const r = reduceLiveLoad({ loKNm2: 2.5, tributaryAreaM2: 18, elementKind: 'interiorBeam', floorsSupported: 1 });
    expect(r.reduced).toBe(false);
    expect(r.lKNm2).toBe(2.5);
    expect(r.reason.key).toBe('loads.cirsoc101.reduction.belowThreshold');
    expect(r.reason.params?.threshold).toBe(REDUCTION_THRESHOLD_M2);
  });

  it('reduces exactly per the printed expression', () => {
    // Interior column, K_LL = 4, A_t = 50 m² -> K_LL·A_t = 200.
    // L = 2.5 (0.25 + 4.57/sqrt(200)) = 2.5 (0.25 + 0.323148...) = 1.43287 kN/m²
    const r = reduceLiveLoad({ loKNm2: 2.5, tributaryAreaM2: 50, elementKind: 'interiorColumn', floorsSupported: 1 });
    const expected = 2.5 * (0.25 + 4.57 / Math.sqrt(200));
    expect(r.lKNm2).toBeCloseTo(expected, 9);
    expect(r.lKNm2).toBeCloseTo(1.43287, 4);
    expect(r.reduced).toBe(true);
  });

  it('never falls below 0,5 Lo for a member supporting one floor', () => {
    const r = reduceLiveLoad({ loKNm2: 2.0, tributaryAreaM2: 5000, elementKind: 'interiorColumn', floorsSupported: 1 });
    expect(r.lKNm2).toBeCloseTo(1.0, 9);
    // The clamp is a distinct key, and the floor factor is a parameter rather than text,
    // so the assertion survives translation.
    expect(r.reason.key).toBe('loads.cirsoc101.reduction.appliedClamped');
    expect(r.reason.params?.floorFactor).toBe(0.5);
    expect(teAt(r.reason, 'en')).toMatch(/limited to 0.5 Lo/);
    expect(teAt(r.reason, 'es')).toMatch(/limitado a 0,5 Lo/);
  });

  it('allows 0,4 Lo for a member supporting two or more floors', () => {
    const r = reduceLiveLoad({ loKNm2: 2.0, tributaryAreaM2: 5000, elementKind: 'interiorColumn', floorsSupported: 3 });
    expect(r.lKNm2).toBeCloseTo(0.8, 9);
  });

  it('uses the Table 4.2 element factors', () => {
    expect(K_LL.interiorColumn).toBe(4);
    expect(K_LL.exteriorColumnNoCantilever).toBe(4);
    expect(K_LL.edgeColumnWithCantilever).toBe(3);
    expect(K_LL.cornerColumnWithCantilever).toBe(2);
    expect(K_LL.edgeBeamNoCantilever).toBe(2);
    expect(K_LL.interiorBeam).toBe(2);
    expect(K_LL.other).toBe(1);
  });

  it('makes K_LL change the answer, not just the memo', () => {
    const at = 40;
    const a = reduceLiveLoad({ loKNm2: 3, tributaryAreaM2: at, elementKind: 'interiorColumn', floorsSupported: 1 });
    const b = reduceLiveLoad({ loKNm2: 3, tributaryAreaM2: at, elementKind: 'other', floorsSupported: 1 });
    expect(a.lKNm2).toBeLessThan(b.lKNm2);
    // K_LL = 1, A_t = 40 -> 40 m² >= 37, so `other` reduces too, just less.
    expect(b.reduced).toBe(true);
  });
});

describe('§4.7.3 – §4.7.6 — limits on the reduction', () => {
  it('§4.7.3 does not reduce loads above 5 kN/m² on a single-floor member', () => {
    const r = reduceLiveLoad({ loKNm2: 7, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 1 });
    expect(r.reduced).toBe(false);
    expect(r.refs[0].clause).toBe('4.7.3');
  });

  it('§4.7.3 allows 20 % for a member supporting two or more floors', () => {
    const r = reduceLiveLoad({ loKNm2: 7, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 2 });
    expect(r.lKNm2).toBeCloseTo(5.6, 9);
    expect(r.ratio).toBeCloseTo(0.8, 9);
  });

  it('§4.7.4 treats passenger garages the same way', () => {
    const one = reduceLiveLoad({ loKNm2: 2.5, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 1, passengerGarage: true });
    expect(one.reduced).toBe(false);
    expect(one.refs[0].clause).toBe('4.7.4');
    const many = reduceLiveLoad({ loKNm2: 2.5, tributaryAreaM2: 500, elementKind: 'interiorColumn', floorsSupported: 4, passengerGarage: true });
    expect(many.lKNm2).toBeCloseTo(2.0, 9);
  });

  it('§4.7.5 never reduces places of public assembly', () => {
    const r = reduceLiveLoad({ loKNm2: 5, tributaryAreaM2: 5000, elementKind: 'interiorColumn', floorsSupported: 5, publicAssembly: true });
    expect(r.reduced).toBe(false);
    expect(r.refs[0].clause).toBe('4.7.5');
  });

  it('§4.7.5 outranks §4.7.3 — an assembly area is not reduced by 20 % either', () => {
    const r = reduceLiveLoad({ loKNm2: 7, tributaryAreaM2: 5000, elementKind: 'interiorColumn', floorsSupported: 5, publicAssembly: true });
    expect(r.lKNm2).toBe(7);
  });

  it('§4.7.6 blocks the reduction when a one-way slab strip is too wide', () => {
    const r = reduceLiveLoad({
      loKNm2: 3, tributaryAreaM2: 200, elementKind: 'other', floorsSupported: 1,
      oneWaySlabSpanM: 4, tributaryWidthM: 7,  // cap is 1.5 * 4 = 6 m
    });
    expect(r.reduced).toBe(false);
    expect(r.refs[0].clause).toBe('4.7.6');
  });

  it('§4.7.6 permits it at the limit', () => {
    const r = reduceLiveLoad({
      loKNm2: 3, tributaryAreaM2: 200, elementKind: 'other', floorsSupported: 1,
      oneWaySlabSpanM: 4, tributaryWidthM: 6,
    });
    expect(r.reduced).toBe(true);
  });
});
