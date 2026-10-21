/**
 * Slabs and walls drawn as members while a large model is being modelled, and as their mesh once
 * it has results.
 *
 * Each shell is a group of its own in the scene: its face, its edges, two draw calls. A building
 * of 19 000 shells was 38 000 draw calls a frame, and every edit rebuilt what it touched, which
 * made modelling on it impractical. Until it is solved nobody reads its mesh: a slab is a slab.
 * So above `MESH_SHOWN_UP_TO` shells, with no results on screen and in the line or solid view,
 * each physical member (a slab, a wall; shells of no member, by material and thickness) is one
 * face mesh and one outline, the mesh's inner edges and the nodes only the mesh has are not
 * drawn, and a shell is still picked by the face it was hit on. Results, the view's own switch,
 * the volume views and the build timelapse bring the mesh back.
 */
import * as THREE from 'three';
import { modelStore } from '../store/model.svelte';
import { resultsStore } from '../store/results.svelte';
import { uiStore } from '../store/ui.svelte';
import { viewState, visiblePlates, visibleQuads } from '../store/view-state.svelte';
import { physicalGroups } from '../store/physical';
import { buildTimelapse } from '../store/build-timelapse.svelte';
import { shellColorForMaterial, SHELL_EDGE_COLOR } from '../three/create-shell-mesh';
import { disposeObject } from '../three/selection-helpers';
import { projectNodeToScene } from '../geometry/coordinate-system';

/** Up to this many shells the mesh is drawn while modelling, as it always was. */
export const MESH_SHOWN_UP_TO = 2000;

/** Whether the shells are drawn as members now (`viewState.shellMesh` decides, else the rule above). */
export function meshHidden(): boolean {
  const mode = uiStore.renderMode3D;
  if (mode !== 'wireframe' && mode !== 'solid') return false;
  if (buildTimelapse.active) return false;
  const asked = viewState.shellMesh;
  if (asked === 'show') return false;
  // A result drawn on the shells is drawn on their mesh.
  if (asked === 'hide') return !shellResultDrawn();
  return modelStore.quads.size + modelStore.plates.size > MESH_SHOWN_UP_TO && !resultsStore.results3D;
}

/** Whether a contour is drawn on the shells now. */
function shellResultDrawn(): boolean {
  if (!resultsStore.results3D || resultsStore.diagramType !== 'colorMap') return false;
  const k = resultsStore.colorMapKind;
  return k === 'shellVonMises' || k === 'shellBending' || (k === 'stress' && !!resultsStore.stressShowShells);
}

/** The nodes only the mesh has: on shells and on nothing else a reader works with. */
export function meshOnlyNodes(): Set<number> {
  const m = modelStore.model;
  const onShell = new Set<number>();
  for (const q of m.quads.values()) for (const n of q.nodes) onShell.add(n);
  for (const p of m.plates.values()) for (const n of p.nodes) onShell.add(n);
  for (const e of m.elements.values()) { onShell.delete(e.nodeI); onShell.delete(e.nodeJ); }
  for (const s of m.supports.values()) onShell.delete(s.nodeId);
  for (const c of m.constraints as Array<{ masterNode?: number; slaveNode?: number; nodes?: number[] }>) {
    if (c.masterNode !== undefined) onShell.delete(c.masterNode);
    if (c.slaveNode !== undefined) onShell.delete(c.slaveNode);
    for (const n of c.nodes ?? []) onShell.delete(n);
  }
  for (const l of m.loads) if (l.type === 'nodal3d' || l.type === 'nodal') onShell.delete((l.data as { nodeId: number }).nodeId);
  for (const n of uiStore.selectedNodes) onShell.delete(n);
  return onShell;
}

interface MembersCtx { shellsParent: THREE.Group; shellMembers?: Map<string, THREE.Group> }

/**
 * The members' meshes: one face (its triangles knowing their shell) and one outline (the edges
 * one shell of the member has alone) per member. Rebuilt only where its shells or nodes moved.
 */
export function syncShellMembers(ctx: MembersCtx, project2D: boolean, on: boolean): void {
  const members = (ctx.shellMembers ??= new Map());
  if (!on) {
    for (const g of members.values()) { ctx.shellsParent.remove(g); disposeObject(g); }
    members.clear();
    return;
  }
  const m = modelStore.model;
  const memberOf = new Map<string, string>();
  for (const g of physicalGroups()) {
    for (const q of g.members.quads ?? []) memberOf.set(`q${q}`, `g${g.id}`);
    for (const p of g.members.plates ?? []) memberOf.set(`p${p}`, `g${g.id}`);
  }
  const batches = new Map<string, Array<{ key: string; nodes: readonly number[]; materialId: number }>>();
  const add = (key: string, s: { nodes: readonly number[]; materialId: number; thickness: number }) => {
    const b = memberOf.get(key) ?? `m${s.materialId}|t${s.thickness}`;
    (batches.get(b) ?? batches.set(b, []).get(b)!).push({ key, nodes: s.nodes, materialId: s.materialId });
  };
  for (const [id, q] of visibleQuads()) add(`q${id}`, q);
  for (const [id, p] of visiblePlates()) add(`p${id}`, p);

  const mode = uiStore.renderMode3D;
  const seen = new Set<string>();
  for (const [bk, shells] of batches) {
    const pts = new Map<number, { x: number; y: number; z: number }>();
    let sig = `${mode}|${project2D ? 1 : 0}`;
    for (const s of shells) {
      sig += `|${s.key}:${s.materialId}`;
      for (const n of s.nodes) {
        if (!pts.has(n)) { const node = m.nodes.get(n); if (node) pts.set(n, projectNodeToScene(node, project2D)); }
        const p = pts.get(n);
        sig += p ? `:${n}@${p.x},${p.y},${p.z}` : `:${n}?`;
      }
    }
    seen.add(bk);
    const old = members.get(bk);
    if (old?.userData.sig === sig) continue;
    if (old) { ctx.shellsParent.remove(old); disposeObject(old); }
    const g = buildMember(shells, pts, mode === 'wireframe');
    g.userData.sig = sig;
    ctx.shellsParent.add(g);
    members.set(bk, g);
  }
  for (const [bk, g] of members) if (!seen.has(bk)) { ctx.shellsParent.remove(g); disposeObject(g); members.delete(bk); }
}

function buildMember(shells: Array<{ key: string; nodes: readonly number[]; materialId: number }>, pts: Map<number, { x: number; y: number; z: number }>, wire: boolean): THREE.Group {
  const pos: number[] = [], col: number[] = [], faceKeys: string[] = [];
  const edgeUse = new Map<string, [number, number, number]>();
  const c = new THREE.Color();
  for (const s of shells) {
    const p = s.nodes.map((n) => pts.get(n));
    if (p.some((x) => !x)) continue;
    c.setHex(shellColorForMaterial(s.materialId));
    const tris = p.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    for (const t of tris) {
      for (const k of t) { pos.push(p[k]!.x, p[k]!.y, p[k]!.z); col.push(c.r, c.g, c.b); }
      faceKeys.push(s.key);
    }
    s.nodes.forEach((a, i) => {
      const b = s.nodes[(i + 1) % s.nodes.length]!;
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      const u = edgeUse.get(k);
      if (u) u[2]++; else edgeUse.set(k, [a, b, 1]);
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: wire ? 0.14 : 0.5, side: THREE.DoubleSide, depthWrite: false,
  }));
  face.userData = { type: 'shellMember', faceKeys };
  // The member's outline: the edges one of its shells has alone (its boundary and openings).
  const line: number[] = [];
  for (const [a, b, uses] of edgeUse.values()) {
    if (uses !== 1) continue;
    const pa = pts.get(a), pb = pts.get(b);
    if (pa && pb) line.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
  const edges = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: SHELL_EDGE_COLOR }));
  edges.raycast = () => {};
  const g = new THREE.Group();
  g.add(face, edges);
  g.userData.shellMember = true;
  return g;
}

/** The shell a hit on a member's face was on, as the pick of that shell would give it. */
export function shellOfMemberHit(hit: THREE.Intersection): { type: 'quad' | 'plate'; id: number } | null {
  const keys = (hit.object.userData as { faceKeys?: string[] }).faceKeys;
  const key = hit.faceIndex !== undefined && hit.faceIndex !== null ? keys?.[hit.faceIndex] : undefined;
  if (!key) return null;
  return { type: key[0] === 'q' ? 'quad' : 'plate', id: Number(key.slice(1)) };
}
