/**
 * CIRSOC 101-2025 permanent loads — the catalogue and the two rules around it.
 *
 * The value of a transcription is that it can be checked against the printed page, so
 * the assertions here quote cells rather than reproducing the module's own arithmetic.
 */
import { describe, it, expect } from 'vitest';
import {
  DEAD_TABLE_2025, findDeadEntry, deadComponentLoad, checkPartitionAllowance,
  BATTEN_DEDUCTION_KNM2, PARTITION_EXEMPTION_LKNM2,
} from '../dead-loads';

describe('Tabla 3.1 — the catalogue', () => {
  it('carries the six groups the table prints, and nothing invented', () => {
    const groups = new Set(DEAD_TABLE_2025.map((e) => e.group));
    expect([...groups].sort()).toEqual(
      ['ceiling', 'concrete', 'floor', 'glazing', 'partition', 'roof'],
    );
    // No masonry wall: CIRSOC 101-2025 prints none, and a wall weight from memory is
    // exactly what this module exists to stop.
    expect(DEAD_TABLE_2025.some((e) => e.key.includes('mamposteria'))).toBe(false);
  });

  it('gives every row exactly one of the two printed columns', () => {
    for (const e of DEAD_TABLE_2025) {
      const hasArea = e.areaKNm2 !== null;
      const hasVol = e.volumeKNm3 !== null;
      expect(hasArea !== hasVol, e.key).toBe(true);
      expect(e.labelKey).toBe(`loads.dead.${e.key}`);
    }
  });

  it('has unique keys', () => {
    expect(new Set(DEAD_TABLE_2025.map((e) => e.key)).size).toBe(DEAD_TABLE_2025.length);
  });

  it('reproduces cells a reader can look up', () => {
    expect(findDeadEntry('horm_armado')!.volumeKNm3).toBe(25);      // hormigón armado
    expect(findDeadEntry('horm_simple')!.volumeKNm3).toBe(23.5);    // sin armar
    expect(findDeadEntry('contrapiso_cemento')!.volumeKNm3).toBe(18);
    expect(findDeadEntry('piso_baldosa_ceramica')!.areaKNm2).toBe(0.28);
    expect(findDeadEntry('tab_yeso_doble')!.areaKNm2).toBe(0.55);
    expect(findDeadEntry('cub_teja_espanola')!.areaKNm2).toBe(0.9);
  });
});

describe('what a row weighs', () => {
  it('reads an area row straight off the table', () => {
    const r = deadComponentLoad(findDeadEntry('piso_porcelanato')!);
    expect(r.qKNm2).toBe(0.2);
    expect(r.basis).toBe('table');
    expect(r.error).toBeUndefined();
  });

  it('refuses a per-m³ row with no thickness rather than assuming one', () => {
    const screed = findDeadEntry('contrapiso_cemento')!;
    const r = deadComponentLoad(screed);
    expect(r.error?.key).toBe('loads.cirsoc101.dead.thicknessRequired');
    expect(r.qKNm2).toBe(0);
    // A zero or negative thickness is the same refusal, not a zero load.
    expect(deadComponentLoad(screed, { thicknessM: 0 }).error).toBeDefined();
    expect(deadComponentLoad(screed, { thicknessM: -0.1 }).error).toBeDefined();
  });

  it('multiplies a per-m³ row by the thickness it is given', () => {
    // 8 cm of cement screed at 18 kN/m³ = 1,44 kN/m² — the number that used to be
    // typed as "1,0 screed" with nothing behind it.
    const r = deadComponentLoad(findDeadEntry('contrapiso_cemento')!, { thicknessM: 0.08 });
    expect(r.qKNm2).toBeCloseTo(1.44, 10);
    expect(r.basis).toBe('thickness');
  });

  it('applies the batten footnote only when the covering is on battens', () => {
    const tile = findDeadEntry('cub_teja_espanola')!;
    expect(tile.battenDeduction).toBe(true);

    const onBoarding = deadComponentLoad(tile);
    expect(onBoarding.qKNm2).toBe(0.9);
    // It still SAYS the deduction exists — a footnote nobody is told about is a
    // footnote that gets lost.
    expect(onBoarding.notes.map((n) => n.key))
      .toContain('loads.cirsoc101.dead.battenDeductionAvailable');

    const onBattens = deadComponentLoad(tile, { onBattens: true });
    expect(onBattens.qKNm2).toBeCloseTo(0.9 - BATTEN_DEDUCTION_KNM2, 10);
    expect(onBattens.notes.map((n) => n.key))
      .toContain('loads.cirsoc101.dead.battenDeductionApplied');
  });

  it('leaves a covering without the footnote alone', () => {
    const shingle = findDeadEntry('cub_teja_asfaltica')!;
    expect(shingle.battenDeduction).toBeUndefined();
    const r = deadComponentLoad(shingle, { onBattens: true });
    expect(r.qKNm2).toBe(0.2);
    expect(r.notes).toEqual([]);
  });
});

describe('§3.1.4 — the partition allowance', () => {
  it('says a build-up with none is missing one', () => {
    // A 2 kN/m² dwelling floor with no partition line. The regulation requires the
    // allowance whether or not the partitions are drawn, and what is missing shows up
    // as nothing at all — which is why this is checked rather than looked for.
    const r = checkPartitionAllowance(2.0, 0);
    expect(r.missing).toBe(true);
    expect(r.exempt).toBe(false);
    expect(r.message.key).toBe('loads.cirsoc101.dead.partitionMissing');
  });

  it('is satisfied by any allowance at all', () => {
    const r = checkPartitionAllowance(2.0, 1.0);
    expect(r.missing).toBe(false);
    expect(r.message.key).toBe('loads.cirsoc101.dead.partitionIncluded');
  });

  it('releases the designer only ABOVE the printed limit', () => {
    expect(PARTITION_EXEMPTION_LKNM2).toBe(4);
    // "a menos que la sobrecarga especificada sea mayor de 4 kN/m²" — 4 itself is not
    // greater than 4, and a boundary read the other way silently drops a real load.
    expect(checkPartitionAllowance(4.0, 0).exempt).toBe(false);
    expect(checkPartitionAllowance(4.0, 0).missing).toBe(true);
    expect(checkPartitionAllowance(4.01, 0).exempt).toBe(true);
    expect(checkPartitionAllowance(5.0, 0).missing).toBe(false);
  });
});
