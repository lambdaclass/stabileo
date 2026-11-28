import { expect, it } from 'vitest';
import { anchorageFunctions, deriveDevelopment, deriveLap, TABLE_25_4_2_3_DIAMETER_BREAK_MM } from '../anchorage';

it('known wrong result: #1928 a forwarded sheet layout cannot shorten ordinary development or its tension laps', () => {
  for (const edition of ['2005', '2025'] as const) for (const favourableSpacing of [false, true]) {
    const ordinary = { fy: 420, fc: 25, favourableSpacing, edition };
    const supplied = { ...ordinary, confinement: { cbMm: 80 } };
    const expected = anchorageFunctions(ordinary);
    const actual = anchorageFunctions(supplied);
    for (const diameterMm of [8, TABLE_25_4_2_3_DIAMETER_BREAK_MM, 20]) {
      const reference = deriveDevelopment({ ...ordinary, diameterMm });
      const result = deriveDevelopment({ ...supplied, diameterMm });
      expect.soft(result).toEqual(reference);
      expect.soft(actual.ld(diameterMm)).toBe(expected.ld(diameterMm));
      expect.soft(actual.lapSplice(diameterMm)).toBe(expected.lapSplice(diameterMm));
      expect.soft(actual.derivationFor(diameterMm)).toEqual(expected.derivationFor(diameterMm));
      for (const spliceClass of ['A', 'B'] as const) {
        expect.soft(deriveLap(result, { edition, spliceClass })).toEqual(deriveLap(reference, { edition, spliceClass }));
      }
    }
  }
});

it('only the offered sheet may use its recorded layout', async () => {
  const { deriveSheetDevelopment } = await import('../sheet-development');
  const input = { diameterMm: 20, fy: 420, fc: 25, favourableSpacing: false, edition: '2025' as const };
  expect(deriveSheetDevelopment(input)).toEqual(deriveDevelopment(input));
  const result = deriveSheetDevelopment({ ...input, confinement: { cbMm: 24 } });
  if (__PUBLIC_FEATURES__.proRcSheets) expect(result.tableRow).toBe('general');
  else expect(result).toEqual(deriveDevelopment(input));
});
