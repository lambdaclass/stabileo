import * as THREE from 'three';
import { modelStore } from '../src/lib/store';
import { initSolver } from '../src/lib/engine/wasm-solver';
import { createDiagramGroup3D, createEnvelopeDiagramGroup3D, type Diagram3DKind } from '../src/lib/three/diagram-render-3d';
import { createDeformedLines, type ElementEI } from '../src/lib/three/deformed-shape-3d';
import { disposeObject } from '../src/lib/three/selection-helpers';
import { eiOf } from '../src/lib/engine/member-deflection';
import type { EnvelopeDiagramData3D } from '../src/lib/engine/types-3d';

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};

function hash(parts: (number | string)[]): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const word = new Float64Array(1), bytes = new Uint8Array(word.buffer);
  const feed = (v: number) => {
    word[0] = v;
    for (const b of bytes) { h1 = Math.imul(h1 ^ b, 16777619); h2 = Math.imul(h2 + b, 0x9e3779b1) ^ (h2 >>> 15); }
  };
  for (const part of parts) {
    if (typeof part === 'number') feed(part);
    else for (let i = 0; i < part.length; i++) feed(part.charCodeAt(i));
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

function materialParts(material: THREE.Material | THREE.Material[] | undefined): (number | string)[] {
  const parts: (number | string)[] = [];
  for (const m of Array.isArray(material) ? material : material ? [material] : []) {
    parts.push(m.type, m.opacity, Number(m.transparent), Number(m.depthTest), Number(m.depthWrite), m.side);
    const color = (m as THREE.MeshBasicMaterial).color;
    if (color?.isColor) parts.push(color.getHex());
    const label = (m as THREE.SpriteMaterial).map?.userData as { text?: string } | undefined;
    if (label?.text) parts.push(label.text);
  }
  return parts;
}

/**
 * What a built group draws, whatever objects it is drawn with and wherever its vertices are held
 * from. `digest` is everything but positions: a segment is the same segment as one `Line` of two
 * points or as a pair in a `LineSegments`, a marker the same marker as its own `Mesh` or as an
 * instance, and every other object is its type, data, indices, other attributes (normals apart)
 * and material.
 * The primitives are sorted, so the order of the children is not part of it. `placed` is where
 * things stand in the world: the count of points (vertices, markers, and the positions of
 * objects with no geometry) and the sums of their coordinates and of their squares, to be
 * compared within rounding, since a float32 vertex held from a group is not the float32 of the
 * same point held from zero.
 */
function digest(root: THREE.Object3D): { digest: string; primitives: number; placed: number[] } {
  root.updateMatrixWorld(true);
  const primitives: string[] = [];
  const placed = [0, 0, 0, 0, 0, 0, 0];
  const point = new THREE.Vector3();
  const place = (world: THREE.Matrix4, x: number, y: number, z: number) => {
    point.set(x, y, z).applyMatrix4(world);
    [1, point.x, point.y, point.z, point.x * point.x, point.y * point.y, point.z * point.z].forEach((v, i) => { placed[i]! += v; });
  };
  const instance = new THREE.Matrix4();
  root.traverse((o) => {
    const type = (o.userData as { type?: unknown }).type;
    const geometry = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    const untyped = type === undefined || type === 'diagram3dClosing' || type === 'diagram3dMarkers';
    if (untyped && (o as THREE.Line).isLine && position
      && ((o as THREE.LineSegments).isLineSegments || position.count === 2) && !geometry!.index) {
      const style = hash(materialParts(material));
      for (let i = 0; i + 1 < position.count; i += 2) {
        primitives.push(`segment ${style} ${o.renderOrder}`);
        place(o.matrixWorld, position.getX(i), position.getY(i), position.getZ(i));
        place(o.matrixWorld, position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
      }
      return;
    }
    if (untyped && (o as THREE.Mesh).isMesh && geometry?.type === 'SphereGeometry') {
      const sphere = (geometry as THREE.SphereGeometry).parameters;
      const style = hash([...materialParts(material), sphere.radius, sphere.widthSegments, sphere.heightSegments, o.renderOrder]);
      if (o.quaternion.w !== 1 || o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1) throw new Error('a marker that is turned or scaled');
      if ((o as THREE.InstancedMesh).isInstancedMesh) {
        for (let i = 0; i < (o as THREE.InstancedMesh).count; i++) {
          (o as THREE.InstancedMesh).getMatrixAt(i, instance);
          const e = instance.elements;
          if (e[0] !== 1 || e[5] !== 1 || e[10] !== 1 || e[1] !== 0 || e[2] !== 0 || e[4] !== 0 || e[6] !== 0 || e[8] !== 0 || e[9] !== 0) throw new Error('a marker that is turned or scaled');
          primitives.push(`marker ${style}`);
          place(o.matrixWorld, e[12]!, e[13]!, e[14]!);
        }
      } else {
        primitives.push(`marker ${style}`);
        place(o.matrixWorld, 0, 0, 0);
      }
      return;
    }
    const parts: (number | string)[] = [o.type, o.name, ...o.quaternion.toArray(), ...o.scale.toArray(), o.renderOrder, Number(o.visible)];
    const data = o.userData as Record<string, unknown>;
    for (const key of Object.keys(data).sort()) {
      const v = data[key];
      if (typeof v === 'number') parts.push(key, v);
      else if (typeof v === 'string' || typeof v === 'boolean') parts.push(key, String(v));
    }
    if (geometry?.isBufferGeometry) {
      for (const name of Object.keys(geometry.attributes).sort()) {
        const array = (geometry.attributes[name] as THREE.BufferAttribute).array as ArrayLike<number>;
        parts.push(name, array.length);
        // Normals are derived from the float32 positions and no material here is lit.
        if (name === 'position' || name === 'normal') continue;
        for (let i = 0; i < array.length; i++) parts.push(array[i]!);
      }
      if (position) for (let i = 0; i < position.count; i++) place(o.matrixWorld, position.getX(i), position.getY(i), position.getZ(i));
      if (geometry.index) { const array = geometry.index.array; for (let i = 0; i < array.length; i++) parts.push(array[i]!); }
    } else if (o !== root && !(o as THREE.Group).isGroup) {
      place(o.matrixWorld, 0, 0, 0);
    }
    parts.push(...materialParts(material));
    primitives.push(`object ${o.type} ` + hash(parts));
  });
  primitives.sort();
  return { digest: hash(primitives), primitives: primitives.length, placed };
}

const KINDS: Diagram3DKind[] = ['momentY', 'momentZ', 'shearY', 'shearZ', 'axial', 'torsion'];

export async function benchmark(exampleIds: string[]) {
  await initSolver();
  const output = [];
  for (const example of exampleIds) {
    modelStore.clear();
    await modelStore.loadExample(example);
    const bundle = modelStore.solveCombinations3D(true, false, true);
    if (!bundle || typeof bundle === 'string') throw new Error(`${example}: ${bundle}`);
    const combo = bundle.perCombo.values().next().value ?? bundle.perCase.values().next().value;
    if (!combo) throw new Error(`${example}: no results`);
    const eiMap = new Map<number, ElementEI>();
    for (const [id, elem] of modelStore.elements) {
      const ei = eiOf(modelStore.materials.get(elem.materialId), modelStore.sections.get(elem.sectionId), modelStore.analysis);
      if (ei) eiMap.set(id, ei);
    }
    const steps: Record<string, () => THREE.Object3D | null> = {
      deformed: () => createDeformedLines(modelStore.elements, modelStore.nodes, combo.displacements, combo.elementForces, 50, eiMap, false, modelStore.sections),
      deformedLinear: () => createDeformedLines(modelStore.elements, modelStore.nodes, combo.displacements, [], 50, undefined, false, modelStore.sections),
    };
    for (const kind of KINDS) {
      steps[`diagram.${kind}`] = () => createDiagramGroup3D(modelStore.elements, modelStore.nodes, combo.elementForces, kind, 1, false, false, modelStore.sections);
      steps[`diagram.${kind}.values`] = () => createDiagramGroup3D(modelStore.elements, modelStore.nodes, combo.elementForces, kind, 1, true, false, modelStore.sections);
      const envelope = bundle.envelope?.[kind as keyof typeof bundle.envelope] as EnvelopeDiagramData3D | undefined;
      if (envelope && 'elements' in envelope) {
        steps[`envelope.${kind}`] = () => createEnvelopeDiagramGroup3D(modelStore.elements, modelStore.nodes, envelope, kind, 1, false, false, modelStore.sections);
      }
    }
    const rows: Record<string, { medianMs: number; digest: string; primitives: number; objects: number; placed: number[] }> = {};
    for (const [name, build] of Object.entries(steps)) {
      const times: number[] = [];
      let signature = '', objects = 0, primitives = 0, placed: number[] = [];
      for (let round = 0; round < 7; round++) {
        const start = performance.now();
        const built = build();
        const elapsed = performance.now() - start;
        if (round > 0) times.push(elapsed);
        if (built) {
          const now = digest(built);
          if (signature && now.digest !== signature) throw new Error(`${example}.${name}: two builds differ`);
          signature = now.digest;
          primitives = now.primitives;
          placed = now.placed;
          objects = 0;
          built.traverse(() => { objects++; });
          disposeObject(built);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      rows[name] = { medianMs: +median(times).toFixed(2), digest: signature, primitives, objects, placed };
    }
    output.push({ example, members: modelStore.elements.size, nodes: modelStore.nodes.size, rows });
  }
  return output;
}
