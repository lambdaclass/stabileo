import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createScalarFieldMesh } from '../scalar-field-mesh';
import { shellContourColor } from '../shell-contour-colour';

// Two unit quads side by side: nodes 0-1-2 along y = 0, 3-4-5 along y = 1.
const XY = [0, 0, 1, 0, 2, 0, 0, 1, 1, 1, 2, 1];
const QUADS = [0, 1, 4, 3, 1, 2, 5, 4];

function colourAt(m: ReturnType<typeof createScalarFieldMesh>, vertex: number): number {
  const mesh = m.group.children[0] as THREE.Mesh;
  const c = mesh.geometry.getAttribute('color');
  return new THREE.Color(c.getX(vertex), c.getY(vertex), c.getZ(vertex)).getHex();
}

describe('createScalarFieldMesh', () => {
  it('builds one geometry with two triangles per quad and four edges per quad', () => {
    const m = createScalarFieldMesh(XY, QUADS, 4);
    const mesh = m.group.children[0] as THREE.Mesh;
    const edges = m.group.children[1] as THREE.LineSegments;
    expect(mesh.geometry.drawRange.count).toBe(12);
    expect(edges.geometry.drawRange.count).toBe(16);
  });

  it('paints nodal values with the shell contour colours, clamped to the range', () => {
    const m = createScalarFieldMesh(XY, QUADS, 4);
    m.setField([0, 0.5, 1, 0, 0.5, 2], { min: 0, max: 1 });
    expect(colourAt(m, 0)).toBe(shellContourColor(0, 0, 1));
    expect(colourAt(m, 1)).toBe(shellContourColor(0.5, 0, 1));
    // Node 5 holds 2, above the range: painted as the maximum, not extrapolated.
    expect(colourAt(m, 6)).toBe(shellContourColor(1, 0, 1));
  });

  it('paints per-cell values flat over each cell', () => {
    const m = createScalarFieldMesh(XY, QUADS, 4);
    m.setField([0.25, 0.75], { min: 0, max: 1 }, { perCell: true });
    for (const v of [0, 1, 2, 3]) expect(colourAt(m, v)).toBe(shellContourColor(0.25, 0, 1));
    for (const v of [4, 5, 6, 7]) expect(colourAt(m, v)).toBe(shellContourColor(0.75, 0, 1));
  });

  it('moves vertices by the scaled displacement and back', () => {
    const m = createScalarFieldMesh(XY, QUADS, 4);
    const pos = () => (m.group.children[0] as THREE.Mesh).geometry.getAttribute('position');
    m.setDisplacement([0, 0, 0, 0, 0, 0, 0, 0.1, 0, 0.1, 0, 0.1], 10);
    // Vertex 2 of the first quad is node 4 = (1, 1) moved up by 10 * 0.1.
    expect(pos().getY(2)).toBeCloseTo(2);
    m.setDisplacement(null, 10);
    expect(pos().getY(2)).toBeCloseTo(1);
  });

  it('leaves hidden cells out of the faces and the edges', () => {
    const m = createScalarFieldMesh(XY, QUADS, 4);
    m.setHidden((c) => c === 1);
    expect((m.group.children[0] as THREE.Mesh).geometry.drawRange.count).toBe(6);
    expect((m.group.children[1] as THREE.LineSegments).geometry.drawRange.count).toBe(8);
  });

  it('accepts triangles', () => {
    const m = createScalarFieldMesh([0, 0, 1, 0, 0, 1], [0, 1, 2], 3);
    expect((m.group.children[0] as THREE.Mesh).geometry.drawRange.count).toBe(3);
  });

  it('draws line cells (bars, springs) coloured per cell, deformed, with hidden cells left out', () => {
    // A triangle of three bars.
    const m = createScalarFieldMesh([0, 0, 1, 0, 0, 1], [0, 1, 1, 2, 2, 0], 2);
    m.setField([-1, 0, 1], { min: -1, max: 1 }, { perCell: true });
    const geo = (m.group.children[0] as THREE.Mesh).geometry;
    const colours = geo.getAttribute('instanceColorStart');
    expect(new THREE.Color(colours.getX(2), colours.getY(2), colours.getZ(2)).getHex()).toBe(shellContourColor(1, -1, 1));
    m.setDisplacement([0, 0, 0.1, 0, 0, 0], 10);
    expect(geo.getAttribute('instanceEnd').getX(0)).toBeCloseTo(2);
    m.setHidden((c) => c === 0);
    expect((m.group.children[0] as THREE.Mesh).geometry.getAttribute('instanceStart').count).toBe(2);
  });
});
