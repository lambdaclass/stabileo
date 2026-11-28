import { expect, it } from 'vitest';
import { composeSheets, type DrawingInput } from '../compose';
import { formatGeometry } from '../formats';
import { layerDef } from '../layers';
import { sheetToDxf } from '../to-dxf';
import { sheetToSvg } from '../to-svg';
import type { Primitive } from '../primitives';

const sheets = !!__PUBLIC_FEATURES__.proRcSheets;

it('known wrong result: #1928 ordinary drawings retain their row placement when dense packing is requested', () => {
  const drawings: DrawingInput[] = ['a', 'b', 'c'].map(key => ({
    key, title: key, width: 100, height: 60, origin: { x: 0, y: 0 }, scale: 1, paper: true, primitives: [],
  }));
  const ordinary = composeSheets(drawings, 'A3');
  const dense = Reflect.apply(composeSheets, undefined, [drawings, 'A3', formatGeometry, true]);
  expect(dense[0].drawings.length).toBe(ordinary[0]!.drawings.length);
  expect(JSON.stringify(dense) === JSON.stringify(ordinary)).toBe(!sheets);
});

it.each(['ST-COTA', 'ST-ARM-EST-Ø16'])('known wrong result: #1928 imported drawing layer %s follows its active export catalogue', name => {
  const geometry: Primitive[] = [{ kind: 'line', layer: name, a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }];
  const own = layerDef(name);
  const ordinary = { ...layerDef('imported-layer'), name };
  expect(own.color === ordinary.color).toBe(!sheets);
  expect(sheetToDxf(geometry)).toContain(['LAYER', 2, name, 70, 0, 62, sheets ? own.color : ordinary.color].join('\n'));
  expect(sheetToSvg(100, 100, geometry) === sheetToSvg(100, 100, geometry, () => ordinary)).toBe(!sheets);
  expect(layerDef('SHEET-FRAME').name).toBe('SHEET-FRAME');
});

it('known wrong result: #1928 ordinary sheet exports never read the dense packing option', async () => {
  const { buildSheetSet } = await import('../sheet-set');
  let reads = 0;
  const settings = { format: 'A3' as const, prefix: 'E-', start: 1 };
  const project = { office: '', project: '', client: '', designer: '' };
  const ordinary = { drawings: [], settings, project, label: (key: string) => key };
  const result = buildSheetSet({ ...ordinary, get dense() { reads++; return false; } });
  expect(result).toEqual(buildSheetSet(ordinary));
  expect(reads).toBe(sheets ? 1 : 0);
});
