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

/** Every number and string a built object carries, in traversal order: two builds that draw the same thing give the same digest. */
function digest(root: THREE.Object3D): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193, count = 0;
  const word = new Float64Array(1), bytes = new Uint8Array(word.buffer);
  const feed = (v: number) => {
    word[0] = v;
    for (const b of bytes) { h1 = Math.imul(h1 ^ b, 16777619); h2 = Math.imul(h2 + b, 0x9e3779b1) ^ (h2 >>> 15); }
    count++;
  };
  const text = (s: string) => { for (let i = 0; i < s.length; i++) feed(s.charCodeAt(i)); };
  root.traverse((o) => {
    text(o.type); text(o.name);
    for (const v of [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray(), o.renderOrder, Number(o.visible)]) feed(v);
    const data = o.userData as Record<string, unknown>;
    for (const key of Object.keys(data).sort()) {
      const v = data[key];
      if (typeof v === 'number') { text(key); feed(v); } else if (typeof v === 'string' || typeof v === 'boolean') { text(key); text(String(v)); }
    }
    const geometry = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (geometry?.isBufferGeometry) {
      for (const name of Object.keys(geometry.attributes).sort()) {
        text(name);
        const array = (geometry.attributes[name] as THREE.BufferAttribute).array as ArrayLike<number>;
        for (let i = 0; i < array.length; i++) feed(array[i]!);
      }
      if (geometry.index) { const array = geometry.index.array; for (let i = 0; i < array.length; i++) feed(array[i]!); }
    }
    const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      text(m.type); feed(m.opacity); feed(Number(m.transparent)); feed(Number(m.depthTest));
      const color = (m as THREE.MeshBasicMaterial).color;
      if (color?.isColor) feed(color.getHex());
      const map = (m as THREE.SpriteMaterial).map;
      const label = map?.userData as { text?: string } | undefined;
      if (label?.text) text(label.text);
    }
  });
  return `${count}:${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
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
    const rows: Record<string, { medianMs: number; digest: string; objects: number }> = {};
    for (const [name, build] of Object.entries(steps)) {
      const times: number[] = [];
      let signature = '', objects = 0;
      for (let round = 0; round < 7; round++) {
        const start = performance.now();
        const built = build();
        const elapsed = performance.now() - start;
        if (round > 0) times.push(elapsed);
        if (built) {
          const now = digest(built);
          if (signature && now !== signature) throw new Error(`${example}.${name}: two builds differ`);
          signature = now;
          objects = 0;
          built.traverse(() => { objects++; });
          disposeObject(built);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      rows[name] = { medianMs: +median(times).toFixed(2), digest: signature, objects };
    }
    output.push({ example, members: modelStore.elements.size, nodes: modelStore.nodes.size, rows });
  }
  return output;
}
