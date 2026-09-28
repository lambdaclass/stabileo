/**
 * IFC Mapper Tests — Verify mapping from IFC members to Dedaliano model
 * These tests use mock data and don't require web-ifc WASM.
 */

import { describe, it, expect } from 'vitest';
import { mapIfcToModel, type IfcMember } from '../ifc-mapper';
import { IDENTITY, axis2Placement3D, compose, extrusionAxis } from '../ifc-geometry';

// ─── Placements: IFC is Z-up, and a placement is a whole frame ───

describe('IFC placements', () => {
  it('keep IFC coordinates as they are: IFC is Z-up like the app', () => {
    // A diagonal from (0,0,0) to (5,0,3): the old Y-up remap laid it down to (5,-3,0).
    const { start, end } = extrusionAxis(IDENTITY, [5, 0, 3], Math.hypot(5, 3));
    expect(start).toEqual([0, 0, 0]);
    expect(end[0]).toBeCloseTo(5, 12); expect(end[1]).toBeCloseTo(0, 12); expect(end[2]).toBeCloseTo(3, 12);
  });

  it('a beam whose solid is rotated runs along its placement, not along the global Z', () => {
    // Object at (2,3,4); the extruded solid's Z axis points along global +X (a horizontal beam).
    const object = axis2Placement3D([2, 3, 4]);
    const solid = axis2Placement3D([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    const { start, end } = extrusionAxis(compose(object, solid), [0, 0, 1], 6);
    expect(start).toEqual([2, 3, 4]);
    expect(end[0]).toBeCloseTo(8, 12); expect(end[1]).toBeCloseTo(3, 12); expect(end[2]).toBeCloseTo(4, 12);
  });

  it('nested placements compose rotations, not only translations', () => {
    // A storey rotated 90° about Z at (10,0,3); inside it, an object at local (1,0,0).
    const storey = axis2Placement3D([10, 0, 3], [0, 0, 1], [0, 1, 0]);
    const obj = axis2Placement3D([1, 0, 0]);
    const w = compose(storey, obj);
    expect(w.t[0]).toBeCloseTo(10, 12); expect(w.t[1]).toBeCloseTo(1, 12); expect(w.t[2]).toBeCloseTo(3, 12);
  });
});

describe('mapIfcToModel', () => {
  it('maps 3 members (2 columns + 1 beam) to 4 nodes and 3 elements', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'column', name: 'Col1', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 3, z: 0 } },
      { id: 2, type: 'column', name: 'Col2', start: { x: 5, y: 0, z: 0 }, end: { x: 5, y: 3, z: 0 } },
      { id: 3, type: 'beam', name: 'Beam1', start: { x: 0, y: 3, z: 0 }, end: { x: 5, y: 3, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.nodes.length).toBe(4); // 4 unique points
    expect(result.elements.length).toBe(3);
    expect(result.elements[0].type).toBe('frame'); // columns are frame
    expect(result.elements[2].type).toBe('frame'); // beams are frame
  });

  it('merges coincident nodes within snap tolerance', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
      { id: 2, type: 'beam', name: 'B2', start: { x: 5.005, y: 0.003, z: 0 }, end: { x: 10, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members, { snapTolerance: 0.01 });

    // The end of B1 and start of B2 should merge (distance < 0.01m)
    expect(result.nodes.length).toBe(3); // not 4
  });

  it('does NOT merge nodes beyond snap tolerance', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
      { id: 2, type: 'beam', name: 'B2', start: { x: 5.1, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members, { snapTolerance: 0.01 });

    // 5.1 is 0.1m away from 5.0, should NOT merge
    expect(result.nodes.length).toBe(4);
  });

  it('maps brace members as truss elements', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'brace', name: 'Br1', start: { x: 0, y: 0, z: 0 }, end: { x: 3, y: 4, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.elements[0].type).toBe('truss');
  });

  it('skips zero-length members with warning', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 0 } },
      { id: 2, type: 'beam', name: 'B2', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.elements.length).toBe(1); // only B2
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('B1');
  });

  it('recognizes S355 material', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', materialName: 'S355', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.materials.length).toBe(1);
    expect(result.materials[0].e).toBe(200000); // steel
    expect(result.materials[0].name).toBe('S355');
  });

  it('uses default steel for unknown material', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', materialName: 'UnknownMat', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.materials[0].e).toBe(200000); // default steel
    expect(result.warnings.some(w => w.includes('UnknownMat'))).toBe(true);
  });

  it('recognizes concrete material', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'column', name: 'C1', materialName: 'Concrete C30', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 3, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    // "concretec30" matches "concrete" first (E=30000) in the lookup order
    expect(result.materials[0].e).toBe(30000);
    expect(result.materials[0].rho).toBe(25.0);
  });

  it('matches IPE profile from steel database', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', profileName: 'IPE200', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.sections.length).toBe(1);
    expect(result.sections[0].name).toContain('IPE');
    expect(result.sections[0].h).toBeCloseTo(0.2, 2); // 200mm = 0.2m
  });

  it('estimates section from dimension string', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', profileName: '300x200x10', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.sections[0].h).toBeCloseTo(0.3, 2);
    expect(result.sections[0].b).toBeCloseTo(0.2, 2);
    expect(result.sections[0].t).toBeCloseTo(0.01, 3);
    expect(result.sections[0].shape).toBe('RHS');
  });

  it('provides default section when profile is unknown', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', profileName: 'CustomWeirdProfile', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.sections.length).toBe(1);
    expect(result.warnings.some(w => w.includes('CustomWeirdProfile'))).toBe(true);
  });

  it('handles 3D members in space', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', start: { x: 0, y: 0, z: 0 }, end: { x: 3, y: 4, z: 5 } },
      { id: 2, type: 'beam', name: 'B2', start: { x: 3, y: 4, z: 5 }, end: { x: 6, y: 0, z: 2 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.nodes.length).toBe(3); // shared middle node
    expect(result.elements.length).toBe(2);
    // Verify 3D coordinates preserved
    const midNode = result.nodes.find(n => Math.abs(n.x - 3) < 0.01);
    expect(midNode).toBeDefined();
    expect(midNode!.y).toBeCloseTo(4, 2);
    expect(midNode!.z).toBeCloseTo(5, 2);
  });

  it('adds default material and section when none provided', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    expect(result.materials.length).toBe(1); // default steel
    expect(result.sections.length).toBe(1); // default section
  });

  it('deduplicates identical profile names', () => {
    const members: IfcMember[] = [
      { id: 1, type: 'beam', name: 'B1', profileName: 'IPE200', start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
      { id: 2, type: 'beam', name: 'B2', profileName: 'IPE200', start: { x: 5, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
    ];

    const result = mapIfcToModel(members);

    // Should only have 1 section, not 2
    expect(result.sections.length).toBe(1);
  });
});

describe('each member keeps its own material and section', () => {
  it('two materials and two profiles go to the members that name them, with Iy and J', () => {
    const r = mapIfcToModel([
      { id: 1, type: 'column', name: 'C1', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 3 }, profileName: 'HEB 200', materialName: 'S355' },
      { id: 2, type: 'beam', name: 'B1', start: { x: 0, y: 0, z: 3 }, end: { x: 6, y: 0, z: 3 }, profileName: 'IPE 300', materialName: 'C30' },
      { id: 3, type: 'brace', name: 'D1', start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 3 }, profileName: 'IPE 300', materialName: 'S355' },
    ]);
    const [c, b, d] = r.elements;
    expect(r.materials[c!.material]!.name).toBe('S355');
    expect(r.materials[b!.material]!.name).toBe('C30');
    expect(r.sections[c!.section]!.name).toContain('HEB');
    expect(r.sections[b!.section]!.name).toContain('IPE');
    expect(r.sections[b!.section]!.iy).toBeGreaterThan(r.sections[b!.section]!.iz);
    // J as the catalogue has it — carried, not invented (the IPE rows publish none).
    expect('j' in r.sections[b!.section]!).toBe(true);
    expect(d!.type).toBe('truss');
    expect(mapIfcToModel([{ id: 3, type: 'brace', name: 'D1', start: { x: 0, y: 0, z: 0 }, end: { x: 6, y: 0, z: 3 } }], { membersAsTruss: false }).elements[0]!.type).toBe('frame');
  });
});
