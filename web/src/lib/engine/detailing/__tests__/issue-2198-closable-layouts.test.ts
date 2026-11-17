import { describe, expect, it } from 'vitest';
import { beamLayoutDomain } from '../joint-threading';
import { coordinate } from '../coordination-search';
import type { RegulationEdition } from '../../../codes/regulation';

const knownWrong = process.env.RUN_KNOWN_WRONG !== '2198';

function request(edition: RegulationEdition, maxTopLayers: number) {
  return {
    row: { count: 6, rowDia: 10, dia: 10 }, section: { b: 0.2, h: 0.5 },
    cover: 0.025, stirrupDiaMm: 8, edition, maxAggregateSizeMm: 20,
    placement: 0.002, obstacles: [], maxTopLayers,
  };
}

for (const edition of ['2005', '2025'] as const) {
  describe(`${edition} beam layout eligibility`, () => {
    for (const maxTopLayers of [2, 3]) {
      it.skipIf(knownWrong)(`known wrong result: #2198 — every offered layout admits a stirrup closure with ${maxTopLayers} layers allowed`, () => {
        const domain = beamLayoutDomain(request(edition, maxTopLayers));
        expect(domain.length).toBeGreaterThan(0);
        expect(domain.every(c => c.closable === true)).toBe(true);
        for (const c of domain) {
          expect(c.slots).toHaveLength(6);
          expect(c.layers).toBeLessThanOrEqual(maxTopLayers);
          expect(c.bendWitnesses.every(w => w.filledBy !== null)).toBe(true);
        }
      });
    }

    it.skipIf(knownWrong)('known wrong result: #2198 — partial coordination cannot trade stirrup closure for less joint overlap', () => {
      const domain = beamLayoutDomain(request(edition, 2));
      const result = coordinate({
        members: [{ elementId: 1, domain, diameterMm: 10, neighbours: [] }],
        joints: [{
          jointId: 'blocked', elementIds: [1], relation: () => 'independent',
          keepOutsFor: new Map([[1, [{ at: 0.019, halfWidth: 0.2 }]]]),
        }],
      });
      expect(result.outcome).toBe('PARTIAL_ENVELOPE_EXHAUSTED');
      expect(result.assignment.size).toBe(1);
      expect(result.assignment.get(1)!.closable).toBe(true);
      expect(result.infeasibleJoints.map(j => j.jointId)).toEqual(['blocked']);
    });

    it('refuses below the layer bound and retains the legal four-plus-two arrangement at the bound', () => {
      expect(beamLayoutDomain(request(edition, 1))).toEqual([]);
      const domain = beamLayoutDomain(request(edition, 2));
      const fourPlusTwo = domain.find(c => c.slots.filter(s => s.layer === 0).length === 4);
      expect(fourPlusTwo).toBeDefined();
      expect(fourPlusTwo!.slots.filter(s => s.layer === 1)).toHaveLength(2);
      expect(fourPlusTwo!.closable).toBe(true);
      expect(coordinate({ members: [{ elementId: 1, domain: [fourPlusTwo!], diameterMm: 10, neighbours: [] }], joints: [] }).assignment.get(1)).toEqual(fourPlusTwo);
    });

    it('preserves a correct single-row answer and its bar count', () => {
      const o = request(edition, 1);
      const domain = beamLayoutDomain({ ...o, row: { ...o.row, count: 4 } });
      expect(domain.length).toBeGreaterThan(0);
      expect(domain.every(c => c.layers === 1 && c.slots.length === 4 && c.closable === true)).toBe(true);
    });
  });
}
