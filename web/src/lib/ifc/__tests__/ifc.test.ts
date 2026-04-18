/**
 * IFC Mapper Tests — Verify mapping from IFC members to Dedaliano model
 * These tests use mock data and don't require web-ifc WASM.
 */

import { describe, it, expect } from 'vitest';
import { mapIfcToModel, type IfcMember } from '../ifc-mapper';
import { ifcToZup, ifcDirToZup } from '../ifc-parser';

// ─── Y-up → Z-up coordinate remapping ───────────────────────────

describe('ifcToZup (IFC Y-up → app Z-up)', () => {
  it('maps IFC origin to app origin', () => {
    const result = ifcToZup(0, 0, 0);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it('remaps IFC +Y (vertical) to app +Z', () => {
    // In IFC, Y is up. A point at (0, 5, 0) is 5m above ground.
    // In app, Z is up. So this should become (0, 0, 5).
    const result = ifcToZup(0, 5, 0);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(5);
  });

  it('remaps IFC +Z (depth) to app -Y (preserving right-handedness)', () => {
    // IFC Z goes "into screen" in Y-up; to preserve right-hand rule,
    // app_y = -ifc_z.
    const result = ifcToZup(0, 0, 3);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(-3);
    expect(result.z).toBeCloseTo(0);
  });

  it('preserves IFC X as app X', () => {
    const result = ifcToZup(7, 0, 0);
    expect(result.x).toBeCloseTo(7);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it('handles a general 3D point', () => {
    // IFC point (2, 10, -4):
    //   app_x = 2, app_y = -(-4) = 4, app_z = 10
    const result = ifcToZup(2, 10, -4);
    expect(result.x).toBeCloseTo(2);
    expect(result.y).toBeCloseTo(4);
    expect(result.z).toBeCloseTo(10);
  });
});

describe('ifcDirToZup (IFC direction Y-up → app Z-up)', () => {
  it('maps IFC vertical direction (0,1,0) to app (0,0,1)', () => {
    const result = ifcDirToZup(0, 1, 0);
    expect(result.dx).toBeCloseTo(0);
    expect(result.dy).toBeCloseTo(0);
    expect(result.dz).toBeCloseTo(1);
  });

  it('maps IFC depth direction (0,0,1) to app (0,-1,0)', () => {
    const result = ifcDirToZup(0, 0, 1);
    expect(result.dx).toBeCloseTo(0);
    expect(result.dy).toBeCloseTo(-1);
    expect(result.dz).toBeCloseTo(0);
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
