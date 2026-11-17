import { expect, it } from 'vitest';
import { coordinateFloor } from '../coordinate-floor';
import { drawElevation, ELEVATION_X, noteText, sheetToDxf, sheetToSvg, buildSchedule, buildTitleBlock, scheduleToAoa } from '../drawings';
import { ensureLocale } from '../../../i18n/store.svelte';
import { teAt } from '../../../i18n/engine-text';
import { straightSegment, type BarPath } from '../../../codes/cirsoc201/bar-geometry';

for (const kind of ['beam', 'column'] as const) {
  it(`known wrong result: #2198 ${kind} generation refusals reach the assembly and localized exports`, async () => {
    const key = `detailing.generation.${kind}SecondaryLegs`;
    const params: Record<string, string | number> = kind === 'beam' ? { legs: 3 } : { legs: 3, element: 100 };
    const bar: BarPath = {
      id: 'a', diameterMm: 20, role: 'longitudinal',
      segments: [straightSegment({ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 })],
      startTreatment: { kind: 'straight' }, endTreatment: { kind: 'straight' },
      cuttingLength: 4, ownerElementIds: [100], source: 'generated', locked: false, refs: [],
    };
    const { assembly } = coordinateFloor({
      assemblyId: 'L1-B', label: 'Eje B', kind: kind === 'beam' ? 'beamLine' : 'columnStack', elementIds: [100],
      members: [{ elementId: 100, bars: [bar], unsupported: [{ key, params }, 'legacy refusal'], maturity: 'VALIDATED', refs: [], trace: [] }],
      joints: [], edition: '2025', verifierId: 'cirsoc201.provided.v2.2025', demandRevision: 5,
      cover: 0.025, tieDia: 8, maxAggregateSizeMm: 20, membersVerified: true, coordinated: true,
    });
    expect(assembly.unsupported).toContainEqual({ key, params, message: key, scope: { elementIds: [100] }, refs: [] });
    expect(assembly.unsupported).toContainEqual({ key: 'generation', message: 'legacy refusal', scope: { elementIds: [100] }, refs: [] });
    expect(assembly.state).not.toBe('CONSTRUCTIBLE');
    const sheet = drawElevation({ assembly, outlines: [], projection: ELEVATION_X, clauses: [], sheetNumber: '1', title: 'test' });
    const note = sheet.notes.find(n => n.includes(key));
    expect(note).toBeDefined();
    for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu']) {
      const dictionary = (await import(`../../../i18n/locales/${locale}.ts`)).default;
      expect(Object.hasOwn(dictionary, key), `${locale}: ${key}`).toBe(true);
      expect(dictionary[key]).toEqual(expect.any(String));
      expect(dictionary[key]).not.toBe(key);
      await ensureLocale(locale);
      const expected = teAt({ key, params }, locale);
      expect(expected).not.toBe(key);
      expect(noteText(note!, locale)).toContain(expected);
      expect(sheetToDxf(sheet, [], locale)).toContain(expected);
      expect(sheetToSvg(sheet, 1200, locale)).toContain(expected);
      const schedule = buildSchedule(assembly.marks, 12, [note!]);
      const title = buildTitleBlock({ assembly, sheetNumber: '1', title: 'test', scale: 50, clauses: [] });
      expect(scheduleToAoa(schedule, title, locale).flat().some(cell => String(cell).includes(expected))).toBe(true);
    }
  });
}
