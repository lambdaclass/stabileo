import * as THREE from 'three';
import type { Rebar3d, RebarTone } from '../rc-sheets/rebar-3d';

type Host = { scene: THREE.Scene; redraw: () => void };

const FIXED: Partial<Record<RebarTone, string>> = {
  bent: '#b48cf2', bottomX: '#4ecdc4', bottomY: '#5b8def', topX: '#e0a03c', topY: '#d9607a',
  vertical: '#4ecdc4', horizontal: '#5b8def', ubar: '#e0a03c', wallTie: '#d9607a',
};
const TOKENS: Partial<Record<RebarTone, [string, string]>> = {
  continuous: ['--st-text', '#d6d3cc'], column: ['--st-text', '#d6d3cc'], support: ['--st-danger', '#e0604a'], span: ['--st-ok', '#4fb37a'],
  stirrup: ['--st-text-2', '#9a968e'], tie: ['--st-text-2', '#9a968e'], dowel: ['--st-danger', '#e0604a'],
  footingX: ['--st-accent', '#e8553a'], footingY: ['--st-warn', '#d9a03c'], footingTop: ['--st-ok', '#4fb37a'],
};

let probe: CanvasRenderingContext2D | null | undefined;

export function toneColour(tone: RebarTone): THREE.Color {
  const fixed = FIXED[tone];
  if (fixed) return new THREE.Color(fixed);
  const [token, fallback] = TOKENS[tone] ?? ['', '#9a968e'];
  if (typeof document === 'undefined' || !token) return new THREE.Color(fallback);
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (probe === undefined) probe = document.createElement('canvas').getContext('2d');
  if (!raw || !probe) return new THREE.Color(fallback);
  probe.fillStyle = fallback;
  probe.fillStyle = raw;
  return new THREE.Color(String(probe.fillStyle).startsWith('#') ? probe.fillStyle : fallback);
}

const UP = new THREE.Vector3(0, 1, 0);

export function buildRebarGroup(bars: readonly Rebar3d[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sheetRebar';
  group.userData.noPick = true;
  const byTone = new Map<RebarTone, Rebar3d[]>();
  for (const b of bars) byTone.set(b.tone, [...(byTone.get(b.tone) ?? []), b]);
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
  for (const [tone, list] of byTone) {
    const legs = list.reduce((n, b) => n + b.segments.reduce((k, seg) => k + Math.max(0, seg.length - 1), 0), 0);
    if (!legs) continue;
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: toneColour(tone), roughness: 0.55, metalness: 0.25 }), legs);
    let i = 0;
    for (const b of list) {
      const r = b.dia / 2000;
      for (const seg of b.segments) for (let k = 1; k < seg.length; k++) {
        const a = seg[k - 1]!, c = seg[k]!;
        d.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        const len = d.length();
        p.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
        q.setFromUnitVectors(UP, len > 1e-12 ? d.normalize() : UP);
        s.set(r, len + r, r);
        mesh.setMatrixAt(i++, m.compose(p, q, s));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.noPick = true;
    mesh.raycast = () => {};
    group.add(mesh);
  }
  return group;
}

function dispose(group: THREE.Group): void {
  for (const c of group.children) {
    const mesh = c as THREE.InstancedMesh;
    (mesh.material as THREE.Material).dispose();
    mesh.dispose();
  }
  (group.children[0] as THREE.InstancedMesh | undefined)?.geometry.dispose();
}

export function createRebarLayer() {
  let group: THREE.Group | null = null;
  let shownOn: Host | null = null;
  const takeOut = (): Host | null => {
    const was = shownOn;
    if (group) { group.parent?.remove(group); dispose(group); }
    group = null;
    shownOn = null;
    return was;
  };
  return {
    show(host: Host | null, bars: readonly Rebar3d[]): void {
      const was = takeOut();
      if (!host || !bars.length) { (host ?? was)?.redraw(); return; }
      group = buildRebarGroup(bars);
      host.scene.add(group);
      shownOn = host;
      host.redraw();
    },
    clear(host: Host | null): void {
      const was = takeOut();
      (host ?? was)?.redraw();
    },
  };
}
