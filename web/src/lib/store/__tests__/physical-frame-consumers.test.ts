/**
 * The four outputs that draw or measure the concrete read one geometry, and the analysis reads
 * none of it.
 *
 * On a frame with every joint F0 fixes (beams wider than the columns, corners with no column, an
 * eccentric column, the roof), each output's own volume is computed from what that output
 * produces: the quantities' items, the reinforcement scene's prisms, the IFC's swept profiles and
 * prisms, and the model viewer's triangles. Each must equal the physical frame's, member by member
 * where the output is per member. Before, each swept members node to node on its own: the
 * quantities said ΣA·L, which counts every joint once per member framing in.
 *
 * And the representation must not reach the model the solver reads: the solver input is the same
 * object, to the byte, before the physical frame is built, after every output has read it, and in
 * the physical view mode.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { loadFixture } from '../../templates/load-fixture';
import { projectPhysicalFrame, physicalLayersOf } from '../physical-frame';
import { measure } from '../takeoff';
import { projectIfcInput } from '../ifc-export';
import { frameVolume, layerVolume, polygonArea } from '../../engine/physical/physical-frame';
import { buildSceneModel, solidMatchesFilter, type SceneSolid } from '../../engine/detailing/scene-model';
import { buildDocumentModel } from '../../engine/detailing/document-model';
import { membersFromModel } from '../../engine/detailing/member-geometry';
import { createElementGroup } from '../../three/create-element-mesh';
import { buildSolverInput3D } from '../../engine/solver-service';

const FIXTURE = 'src/lib/engine/physical/__tests__/fixtures/physical-joints-frame.json';

function load(): void {
  modelStore.clear();
  modelStore.bulkMutate(() => loadFixture(JSON.parse(readFileSync(FIXTURE, 'utf8')) as never, modelStore.fixtureApi() as never));
}

/** A planar polygon's area by Newell's normal, and that unit normal. */
function planarArea(pts: ReadonlyArray<{ x: number; y: number; z: number }>): { area: number; n: THREE.Vector3 } {
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
  }
  const area = n.length() / 2;
  return { area, n: n.normalize() };
}
const sceneVolume = (s: SceneSolid): number => {
  const { area, n } = planarArea(s.base);
  const holes = (s.holes ?? []).reduce((a, h) => a + planarArea(h).area, 0);
  return (area - holes) * Math.abs(n.dot(new THREE.Vector3(s.extrude.x, s.extrude.y, s.extrude.z)));
};

/** The volume a closed triangle soup encloses (divergence theorem), m³. */
function meshVolume(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position');
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1), c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return Math.abs(v);
}

const ids = () => [...modelStore.model.elements.keys()].sort((a, b) => a - b);

describe('one geometry for every output that draws or measures the concrete', () => {
  beforeAll(load);

  it('the frame: 16 members cut, a joint at every beam-column node and at each column-less corner', () => {
    const f = projectPhysicalFrame();
    expect(f.member.size).toBe(16);
    expect(f.untrimmed).toEqual([]);
    expect(f.refused).toEqual([]);
    // Six column tops and the two corners at x = 12.
    expect(f.joint.size).toBe(8);
    expect(projectPhysicalFrame()).toBe(f);
  });

  it('the quantities measure exactly the frame, each member and each joint as the frame states it', () => {
    const f = projectPhysicalFrame(), m = measure();
    const concrete = m.items.filter((i) => i.kind === 'beam' || i.kind === 'column' || i.kind === 'joint');
    expect(concrete.reduce((a, i) => a + i.concrete, 0)).toBeCloseTo(frameVolume(f), 9);
    for (const i of concrete.filter((x) => x.kind !== 'joint')) expect(i.concrete).toBeCloseTo(f.member.get(i.elementId!)!.volume, 9);
    for (const i of concrete.filter((x) => x.kind === 'joint')) expect(i.concrete).toBeCloseTo(f.joint.get(i.nodeId!)!.volume, 9);
    // Node to node, ΣA·L, counted each joint once per member framing in.
    const nodeToNode = ids().reduce((a, id) => {
      const e = modelStore.model.elements.get(id)!, s = modelStore.model.sections.get(e.sectionId)!;
      const ni = modelStore.model.nodes.get(e.nodeI)!, nj = modelStore.model.nodes.get(e.nodeJ)!;
      return a + s.a * Math.hypot(nj.x - ni.x, nj.y - ni.y, (nj.z ?? 0) - (ni.z ?? 0));
    }, 0);
    expect(nodeToNode - frameVolume(f)).toBeGreaterThan(0.05);
  });

  it('the reinforcement scene draws exactly the frame, cut members and joints', () => {
    const f = projectPhysicalFrame();
    const doc = buildDocumentModel({ seriesId: 'S', revision: { number: 1, at: '2026-10-19T00:00:00Z', author: 'test', detailingRevision: 1, demandRevision: 1 }, regulations: [], assemblies: [], laps: [], certificates: [] });
    const { members } = membersFromModel({ elementIds: ids(), nodes: [...modelStore.model.nodes.values()], elements: [...modelStore.model.elements.values()], sections: [...modelStore.model.sections.values()] });
    const scene = buildSceneModel(doc, { members, physical: f });
    expect(scene.solids.reduce((a, s) => a + sceneVolume(s), 0)).toBeCloseTo(frameVolume(f), 9);
    for (const id of ids()) expect(sceneVolume(scene.solids.find((s) => s.id === `member:${id}`)!)).toBeCloseTo(f.member.get(id)!.volume, 9);
    expect(scene.solids.filter((s) => s.kind === 'joint').length).toBeGreaterThanOrEqual(f.joint.size);
  });

  it('a joint belongs to every member meeting in it: isolating either beam of a corner keeps it', () => {
    const f = projectPhysicalFrame();
    const doc = buildDocumentModel({ seriesId: 'S', revision: { number: 1, at: '2026-10-19T00:00:00Z', author: 'test', detailingRevision: 1, demandRevision: 1 }, regulations: [], assemblies: [], laps: [], certificates: [] });
    const { members } = membersFromModel({ elementIds: ids(), nodes: [...modelStore.model.nodes.values()], elements: [...modelStore.model.elements.values()], sections: [...modelStore.model.sections.values()] });
    const scene = buildSceneModel(doc, { members, physical: f });
    for (const j of f.joint.values()) {
      const solid = scene.solids.find((s) => s.id === `joint:${j.nodeId}`)!;
      expect(new Set(solid.elementIds)).toEqual(new Set(j.elementIds));
      // Any one of its members isolated draws it (it used to follow its owner alone).
      for (const id of j.elementIds) expect(solidMatchesFilter(solid, { elementIds: [id] }), `joint ${j.nodeId} with ${id} isolated`).toBe(true);
    }
  });

  it('the sections view draws the concrete as built too: a corner of two beams is closed, not overlapped', () => {
    const f = projectPhysicalFrame();
    let total = 0;
    for (const id of ids()) {
      const g = createElementGroup({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { elementId: id, elementType: 'frame', renderMode: 'sections', physicalLayers: physicalLayersOf(f, id)! });
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.physicalConcrete) total += meshVolume((o as THREE.Mesh).geometry); });
    }
    expect(Math.abs(total - frameVolume(f))).toBeLessThan(1e-5 * frameVolume(f));
  });

  it('the IFC writes exactly the frame: profiles swept over the cut segments plus the joints owned', () => {
    const f = projectPhysicalFrame();
    const input = projectIfcInput((k) => k, 'en', 'test');
    let total = 0;
    for (const m of input.members) {
      expect(m.segments, `${m.id} is cut`).toBeDefined();
      const p = m.profile as { b: number; h: number };
      total += p.b * p.h * m.segments!.reduce((a, g) => a + Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1], g.b[2] - g.a[2]), 0);
      total += (m.prisms ?? []).reduce((a, q) => a + polygonArea({ outer: q.outer, holes: q.holes ?? [] }) * q.depth, 0);
    }
    expect(total).toBeCloseTo(frameVolume(f), 9);
  });

  it('the model viewer draws exactly the frame in its physical mode', () => {
    const f = projectPhysicalFrame();
    let total = 0;
    for (const id of ids()) {
      const layers = physicalLayersOf(f, id)!;
      const own = layers.reduce((a, l) => a + layerVolume(l), 0);
      const g = createElementGroup({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { elementId: id, elementType: 'frame', renderMode: 'physical', physicalLayers: layers });
      let drawn = 0;
      g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.userData.physicalConcrete) drawn += meshVolume((o as THREE.Mesh).geometry); });
      // Float32 positions: within a millionth of the volume, relative.
      expect(Math.abs(drawn - own), `member ${id}`).toBeLessThan(1e-5 * own);
      total += drawn;
    }
    expect(Math.abs(total - frameVolume(f))).toBeLessThan(1e-5 * frameVolume(f));
  });

  it('each of the four reads the store\'s one projection, none sweeps its own', () => {
    const read = (p: string) => readFileSync(p, 'utf8');
    for (const p of ['src/lib/viewport3d/scene-sync.ts', 'src/lib/store/takeoff.ts', 'src/lib/store/ifc-export.ts', 'src/lib/store/sheet-set.ts',
      'src/components/pro/design/RebarWorkspace.svelte', 'src/components/pro/design/RebarScenePanel.svelte']) {
      expect(read(p), p).toMatch(/projectPhysicalFrame\(\)/);
    }
    // Nothing else builds a frame of its own.
    const builders: string[] = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); } else if (/\.(ts|svelte)$/.test(e.name) && /buildPhysicalFrame\(/.test(read(p))) builders.push(p);
    } };
    walk('src');
    expect(builders.sort()).toEqual(['src/lib/engine/physical/physical-frame.ts', 'src/lib/store/physical-frame.ts']);
  });
});

describe('the analysis model is not touched by the physical representation', () => {
  beforeAll(load);

  it('the solver input is the same before the frame is built, after every output read it, and in the physical view', () => {
    const snap = () => JSON.stringify(buildSolverInput3D(modelStore.model as never, true), (_k, v) => (v instanceof Map ? [...v.entries()] : v instanceof Set ? [...v] : v));
    const before = snap();
    expect(before.length).toBeGreaterThan(1000);
    projectPhysicalFrame(); measure(); projectIfcInput((k) => k, 'en', 'test');
    const prev = uiStore.renderMode3D;
    uiStore.renderMode3D = 'physical';
    expect(snap()).toBe(before);
    uiStore.renderMode3D = prev;
    // The model's own geometry: nodes, lengths and sections as loaded.
    const e = modelStore.model.elements.get(1)!, sec = modelStore.model.sections.get(e.sectionId)!;
    expect([e.nodeI, e.nodeJ, sec.b, sec.h]).toEqual([1, 7, 0.3, 0.3]);
    expect(modelStore.model.nodes.size).toBe(14);
  });
});
