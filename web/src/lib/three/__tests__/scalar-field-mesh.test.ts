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
  it('builds one geometry with four triangles per quad and four edges per quad', () => {
    const m = createScalarFieldMesh(XY, QUADS, 4);
    const mesh = m.group.children[0] as THREE.Mesh;
    const edges = m.group.children[1] as THREE.LineSegments;
    expect(mesh.geometry.drawRange.count).toBe(24);
    expect(edges.geometry.drawRange.count).toBe(16);
  });

  it('paints nodal values with the shell contour colours, clamped to the range', () => {
    const m = createScalarFieldMesh(XY, QUADS, 4);
    m.setField([0, 0.5, 1, 0, 0.5, 2], { min: 0, max: 1 });
    expect(colourAt(m, 0)).toBe(shellContourColor(0, 0, 1));
    expect(colourAt(m, 1)).toBe(shellContourColor(0.5, 0, 1));
    // Node 5 holds 2, above the range: painted as the maximum, not extrapolated.
    expect(colourAt(m, 7)).toBe(shellContourColor(1, 0, 1));
  });

  it('paints per-cell values flat over each cell', () => {
    const m = createScalarFieldMesh(XY, QUADS, 4);
    m.setField([0.25, 0.75], { min: 0, max: 1 }, { perCell: true });
    for (const v of [0, 1, 2, 3, 4]) expect(colourAt(m, v)).toBe(shellContourColor(0.25, 0, 1));
    for (const v of [5, 6, 7, 8, 9]) expect(colourAt(m, v)).toBe(shellContourColor(0.75, 0, 1));
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
    expect((m.group.children[0] as THREE.Mesh).geometry.drawRange.count).toBe(12);
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
    expect((geo as THREE.InstancedBufferGeometry).instanceCount).toBe(2);
  });
});

it('line updates keep attributes reachable through geometry disposal', () => {
  const m = createScalarFieldMesh([0, 0, 1, 0, 0, 1], [0, 1, 1, 2, 2, 0], 2);
  const line = m.group.children[0] as THREE.Mesh;
  const geo = line.geometry;
  const attributes = { ...geo.attributes };
  const position = (geo.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data;
  const colour = (geo.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data;
  const versions = [position.version, colour.version];
  for (let i = 0; i < 30; i++) {
    m.setField([0, i / 30, 1], { min: 0, max: 1 });
    m.setDisplacement([0, 0, i / 100, 0, 0, 0], 1);
    m.setHidden(i % 2 ? c => c === 0 : null);
    for (const [name, attribute] of Object.entries(attributes)) expect(geo.getAttribute(name)).toBe(attribute);
  }
  expect(position.version).toBeGreaterThan(versions[0]);
  expect(colour.version).toBeGreaterThan(versions[1]);
  let disposed = 0;
  geo.addEventListener('dispose', () => {
    for (const [name, attribute] of Object.entries(attributes)) expect(geo.getAttribute(name)).toBe(attribute);
    disposed++;
  });
  (line.material as THREE.Material).addEventListener('dispose', () => disposed++);
  m.dispose();
  expect(disposed).toBe(2);
});

it('maps the Q4 centre scalar before colouring the four triangles', () => {
  const m = createScalarFieldMesh([0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 2, 3]);
  m.setField([0, 1, 0, 1], { min: 0, max: 1 });
  m.setDisplacement(null, 0);
  const geometry = (m.group.children[0] as THREE.Mesh).geometry;
  expect(colourAt(m, 4)).toBe(shellContourColor(0.5, 0, 1));
  expect(geometry.getAttribute('position').getX(4)).toBe(0.5);
  expect(geometry.getAttribute('position').getY(4)).toBe(0.5);
  expect(Array.from(geometry.index!.array)).toEqual([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
  m.dispose();
});

for (const cellSize of [2, 3, 4] as const) {
  it(`switches ${cellSize}-node cells between neutral geometry and scalar colours without losing displacement`, () => {
    const xy = [0, 0, 1, 0, 1, 1, 0, 1];
    const m = createScalarFieldMesh(xy, [0, 1, 2, 3].slice(0, cellSize), cellSize);
    const mesh = m.group.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    m.setField([0, 1, 0, 1], { min: 0, max: 1 });
    m.setUncoloured();
    expect(material.vertexColors).toBe(false);
    expect(material.color.getHex()).toBe(0x8fa3b3);
    m.setEdgesVisible(false);
    expect(mesh.visible).toBe(true);
    for (const dy of [0, 0.1, 0.3, 0]) {
      m.setDisplacement([0, dy, 0, dy, 0, dy, 0, dy], 2);
      const position = mesh.geometry.getAttribute(cellSize === 2 ? 'instanceStart' : 'position');
      expect(position.getY(0)).toBeCloseTo(2 * dy);
      expect(mesh.geometry.boundingBox!.min.y).toBeCloseTo(2 * dy);
    }
    m.setField([0, 1, 0, 1], { min: 0, max: 1 });
    expect(material.vertexColors).toBe(true);
    expect(material.color.getHex()).toBe(0xffffff);
    m.dispose();
  });
}
