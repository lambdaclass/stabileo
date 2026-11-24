import { expect, it } from 'vitest';
import { applySpanContexts, designSpans, mergeSpanStations } from '../design-spans';
import { buildAllMemberContexts } from '../member-context';
import { extractGoverningDemands, type ElementStationResult } from '../../station-design-forces';

const length = 6;
const structure = {
  nodes: new Map([0, 1.5, 4.5, 6].map((x, id) => [id, { id, x, y: 0, z: 0 }])),
  elements: new Map([1, 2, 3].map(id => [id, { id, nodeI: id - 1, nodeJ: id, type: 'frame', sectionId: 1, materialId: 1 }])),
  supports: new Map([0, 3].map(nodeId => [nodeId, { nodeId, type: 'pinned' }])),
  materials: new Map([[1, { id: 1, name: 'Concrete', fc: 30 }]]),
  sections: new Map([[1, { id: 1, name: 'Beam', b: 0.3, h: 0.5, rotation: 0 }]]),
};

const span = designSpans(structure, () => true)[0]!;
const stationTs = [0, 0.25, 0.5, 0.75, 1];
const governingStation = 0.5;
const load = new Map([[1, 10], [2, 10.5]]);

function pieceStations(elementId: number, omittedCombo?: number, omittedStation = governingStation): ElementStationResult {
  const index = span.elements.indexOf(elementId);
  const pieceLength = span.lengths[index]!;
  return {
    elementId, length: pieceLength, stationTs,
    comboResults: [...load].map(([comboId, q]) => ({
      comboId, comboName: `U${comboId}`,
      stations: stationTs.filter(t => !(elementId === 2 && comboId === omittedCombo && t === omittedStation)).map(t => {
        const x = span.offsets[index]! + t * pieceLength;
        return { t, x: t * pieceLength, n: 0, vy: 0, vz: q * (length / 2 - x),
          my: q * x * (length - x) / 2, mz: 0, torsion: 0 };
      }),
    })),
  };
}

it('reports the governing moment with both combination grids complete', () => {
  const merged = mergeSpanStations(structure, span, id => pieceStations(id))!;
  expect(merged.stationTs).toContain(governingStation);
  expect(extractGoverningDemands(merged).demands.find(d => d.category === 'My+')).toMatchObject({
    comboId: 2, stationT: governingStation, value: load.get(2)! * length ** 2 / 8,
  });
});

for (const omittedCombo of [1, 2]) {
  it(`#2403 refuses a declared midspan omission from combination ${omittedCombo}`, () => {
    expect(() => {
      const merged = mergeSpanStations(structure, span, id => pieceStations(id, omittedCombo))!;
      extractGoverningDemands(merged);
    }).toThrow(expect.objectContaining({
      code: 'incomplete-concurrent-demand',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'missing-station', comboId: omittedCombo, stationT: governingStation }),
      ]),
    }));
  });
}

it('#2403 refuses a missing piece endpoint even when the adjacent piece supplies the same span station', () => {
  expect(() => {
    const merged = mergeSpanStations(structure, span, id => pieceStations(id, 2, 0))!;
    extractGoverningDemands(merged);
  }).toThrow(expect.objectContaining({
    code: 'incomplete-concurrent-demand',
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'missing-station', elementId: 2, comboId: 2, stationT: 0 }),
    ]),
  }));
});

it('#2403 refuses to publish grouped contexts when a combination lacks the middle piece grid', () => {
  const stations = new Map(span.elements.map(id => {
    const source = pieceStations(id);
    return [id, id === 2 ? { ...source, comboResults: source.comboResults.filter(c => c.comboId !== 2) } : source];
  }));
  const demands = new Map([...stations].map(([id, source]) => [id, extractGoverningDemands(source)]));
  const contexts = buildAllMemberContexts(structure, { stations, demands });
  expect(() => applySpanContexts(contexts, structure, [span])).toThrow(expect.objectContaining({
    code: 'incomplete-concurrent-demand',
  }));
  expect(contexts.get(2)?.span).toBeUndefined();
});

function singleCombinationStations(elementId: number): ElementStationResult {
  const source = pieceStations(elementId);
  return { ...source, comboResults: source.comboResults.filter(c => c.comboId === 2) };
}

it('#2403 refuses when one piece loses its only combination', () => {
  const complete = mergeSpanStations(structure, span, singleCombinationStations)!;
  expect(extractGoverningDemands(complete).demands.find(d => d.category === 'My+')).toMatchObject({
    comboId: 2, stationT: governingStation, value: load.get(2)! * length ** 2 / 8,
  });

  expect(() => mergeSpanStations(structure, span, id => {
    const source = singleCombinationStations(id);
    return id === 2 ? { ...source, comboResults: [] } : source;
  })).toThrow(expect.objectContaining({
    code: 'incomplete-concurrent-demand',
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'missing-member', elementId: 2, comboId: 2 }),
    ]),
  }));
});

it('#2403 refuses declared grids when every piece loses its only combination', () => {
  expect(() => mergeSpanStations(structure, span, id => ({
    ...singleCombinationStations(id), comboResults: [],
  }))).toThrow(expect.objectContaining({
    code: 'incomplete-concurrent-demand',
    diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: 'missing-scope', elementId: 2 }),
    ]),
  }));
});

it('#2403 leaves an ungroupable span without a grid or combinations on one piece', () => {
  expect(mergeSpanStations(structure, span, id => {
    const source = singleCombinationStations(id);
    return id === 2 ? { ...source, stationTs: [], comboResults: [] } : source;
  })).toBeNull();
});

it('#2403 refuses to publish grouped contexts after a piece loses its only combination', () => {
  const stations = new Map(span.elements.map(id => [id, singleCombinationStations(id)]));
  const demands = new Map([...stations].map(([id, source]) => [id, extractGoverningDemands(source)]));
  const complete = buildAllMemberContexts(structure, { stations, demands });
  expect(applySpanContexts(complete, structure, [span])).toEqual([span]);
  expect(complete.get(2)?.span?.key).toBe(span.key);

  stations.set(2, { ...stations.get(2)!, comboResults: [] });
  const incomplete = buildAllMemberContexts(structure, { stations, demands });
  expect(() => applySpanContexts(incomplete, structure, [span])).toThrow(expect.objectContaining({
    code: 'incomplete-concurrent-demand',
  }));
  expect(incomplete.get(2)?.span).toBeUndefined();
});

it('retains a combination-specific station outside the declared span grid', () => {
  const merged = mergeSpanStations(structure, span, id => {
    const source = pieceStations(id, 1);
    return id === 2 ? { ...source, stationTs: source.stationTs.filter(t => t !== governingStation) } : source;
  })!;
  expect(merged.stationTs).not.toContain(governingStation);
  expect(extractGoverningDemands(merged).demands.find(d => d.category === 'My+')).toMatchObject({
    comboId: 2, stationT: governingStation, value: load.get(2)! * length ** 2 / 8,
  });
});
