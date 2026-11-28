import { expect, it } from 'vitest';
import { bvbsOfDocument } from '../listing-export';
import { modelFeatures } from '../../provenance/model-features';
import { bvbsChecksum } from '../../listings/bvbs';
import { minMandrelDiameter } from '../../codes/cirsoc201/bar-geometry';
import type { DocumentModel } from '../../engine/detailing/document-model';

it.each([[16, 'transverse'], [25, 'longitudinal'], [32, 'longitudinal'], [40, 'longitudinal']] as const)(
  'known wrong result: #1928 BVBS uses the standard inside bend diameter for %s mm %s marks',
  (diameterMm, role) => {
    const bar = { id: 'B', role, diameterMm, segments: [{ start: { x: 0, y: 0, z: 0 }, end: { x: 1, y: 0, z: 0 } },
      { start: { x: 1, y: 0, z: 0 }, end: { x: 1, y: 1, z: 0 } }] };
    const mark = { mark: 'B1', diameterMm, barIds: ['B'], quantity: 1, cuttingLength: 2, massKg: 1 };
    const doc = { assemblies: [{ bars: [bar], source: { marks: [mark] } }], revision: { number: 1 } } as unknown as DocumentModel;
    expect(modelFeatures({ detailing: { assemblies: [{ marks: [mark] }] } }).has('largeBvbsMark')).toBe(diameterMm > 32);
    const record = bvbsOfDocument(doc, 'E-05').trim();
    expect(record).toContain('@s' + Math.round(1000 * minMandrelDiameter(diameterMm, role).value) + '@');
    const checksum = record.match(/^(BF2D@.*@C)(\d+)@$/)!;
    expect(Number(checksum[2])).toBe(bvbsChecksum(checksum[1]!));
  },
);
