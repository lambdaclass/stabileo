/**
 * What the view draws beside the members: constraints (rigid links, diaphragms, equal DOFs,
 * eccentric connections, linear MPCs) as lines between their nodes, each member's I and J ends,
 * and the project's text notes. One group, rebuilt when any of it changes.
 */
import * as THREE from 'three';
import { modelStore } from '../store/model.svelte';
import { uiStore } from '../store/ui.svelte';
import { viewState, visibleElements } from '../store/view-state.svelte';
import { createTextSpriteCached, disposeObject } from '../three/selection-helpers';
import { projectNodeToScene } from '../geometry/coordinate-system';

/** Lines per constraint kind: link-like ones solid, diaphragms and MPCs dashed. */
const CONSTRAINT_COLOUR: Record<string, number> = {
  rigidLink: 0xf4a261, diaphragm: 0x7fd4cc, equalDOF: 0xe9c46a, eccentricConnection: 0xe76f51, linearMPC: 0xa8dadc,
};

export function buildViewOverlays(project2D: boolean): THREE.Group | null {
  const group = new THREE.Group();
  group.name = 'viewOverlays';
  const pos = (id: number) => { const n = modelStore.nodes.get(id); return n ? projectNodeToScene(n, project2D) : null; };

  if (viewState.showConstraints) {
    const byKind = new Map<string, number[]>();
    const seg = (kind: string, a: number, b: number) => {
      const p = pos(a), q = pos(b);
      if (!p || !q) return;
      const arr = byKind.get(kind) ?? [];
      arr.push(p.x, p.y, p.z, q.x, q.y, q.z);
      byKind.set(kind, arr);
    };
    for (const c of modelStore.model.constraints ?? []) {
      if (c.type === 'diaphragm') for (const s of c.slaveNodes) seg(c.type, c.masterNode, s);
      else if (c.type === 'linearMPC') { const ids = c.terms.map((t) => t.nodeId); for (const id of ids.slice(1)) seg(c.type, ids[0]!, id); }
      else if ('masterNode' in c && 'slaveNode' in c) seg(c.type, c.masterNode, (c as { slaveNode: number }).slaveNode);
    }
    for (const [kind, arr] of byKind) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const dashed = kind === 'diaphragm' || kind === 'linearMPC';
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color: CONSTRAINT_COLOUR[kind] ?? 0xffffff, dashSize: 0.15, gapSize: 0.1, depthTest: false, transparent: true, opacity: 0.9 })
        : new THREE.LineBasicMaterial({ color: CONSTRAINT_COLOUR[kind] ?? 0xffffff, depthTest: false, transparent: true, opacity: 0.9 });
      const lines = new THREE.LineSegments(geo, mat);
      if (dashed) lines.computeLineDistances();
      lines.renderOrder = 5;
      lines.userData = { constraintKind: kind };
      group.add(lines);
    }
  }

  if (viewState.showMemberEnds) {
    const only = viewState.labelsOnSelection;
    for (const [, e] of visibleElements()) {
      if (only && !uiStore.selectedElements.has(e.id)) continue;
      const a = pos(e.nodeI), b = pos(e.nodeJ);
      if (!a || !b) continue;
      for (const [label, f] of [['i', 0.12], ['j', 0.88]] as const) {
        const s = createTextSpriteCached(label, '#ffb86b', 22, true);
        s.position.set(a.x + f * (b.x - a.x), a.y + f * (b.y - a.y), a.z + f * (b.z - a.z));
        s.scale.set(0.028, 0.028, 1);
        s.userData = { memberEnd: `${e.id}${label}` };
        group.add(s);
      }
    }
  }

  for (const n of modelStore.notes) {
    const p = projectNodeToScene({ id: -1, x: n.at.x, y: n.at.y, z: n.at.z } as never, project2D);
    const s = createTextSpriteCached(n.text, '#ffffff', 26, true);
    s.position.set(p.x, p.y, p.z);
    s.scale.set(0.034, 0.034, 1);
    s.userData = { note: n.id };
    group.add(s);
  }

  return group.children.length > 0 ? group : null;
}

export function syncViewOverlays(scene: THREE.Scene, prev: THREE.Group | null, project2D: boolean): THREE.Group | null {
  if (prev) { scene.remove(prev); disposeObject(prev); }
  const next = buildViewOverlays(project2D);
  if (next) scene.add(next);
  return next;
}
