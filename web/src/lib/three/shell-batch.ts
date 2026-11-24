/**
 * The shells drawn in a handful of draw calls. Each shell, plate, outline and flight's steps keeps
 * its own object under the shells' parent, for picking, selection and contours to work on as they
 * always did, but is not rendered: its faces and lines are copied, in world space and in the colours
 * they carry, into one mesh per look (opaque, translucent…) and one set of lines per look. A
 * building's thousands of shells were two draw calls each, and a frame stalled on them.
 *
 * The copy is made again only when something it shows changed: `sync` keeps a fingerprint of the
 * sources (which are shown, their geometry's versions, where they stand) and, while it holds,
 * writes again only the colours of the shells whose colour changed.
 */
import * as THREE from 'three';

type Look = { mesh: THREE.Mesh | THREE.LineSegments; key: string };
const BATCH = 'shellBatch';

const colorOf = (m: THREE.Material): THREE.Color | null => ((m as THREE.MeshStandardMaterial).color instanceof THREE.Color ? (m as THREE.MeshStandardMaterial).color : null);

function isSource(o: THREE.Object3D): o is THREE.Mesh | THREE.Line {
  if (o.userData[BATCH] || o.userData.pickingHelper || o.userData.noBatch) return false;
  if ((o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) return false;
  if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.Line)) return false;
  const m = o.material;
  if (Array.isArray(m) || !m || !colorOf(m) || (m as THREE.ShaderMaterial).isShaderMaterial || (m as THREE.MeshBasicMaterial).map) return false;
  return o.geometry.getAttribute('position') !== undefined && !o.geometry.morphAttributes.position;
}

/** The sources under `parent` that are shown, each with whether its ancestors are. */
function sources(parent: THREE.Object3D): Array<THREE.Mesh | THREE.Line> {
  const out: Array<THREE.Mesh | THREE.Line> = [];
  const walk = (o: THREE.Object3D) => {
    if (!o.visible || o.userData[BATCH]) return;
    if (isSource(o)) out.push(o);
    for (const c of o.children) walk(c);
  };
  for (const c of parent.children) walk(c);
  return out;
}

const lookOf = (o: THREE.Mesh | THREE.Line): string => {
  const m = o.material as THREE.Material;
  return `${o instanceof THREE.Line ? 'L' : 'M'}|${o.renderOrder}|${m.type}|${m.transparent ? 1 : 0}|${m.opacity}|${m.depthWrite ? 1 : 0}|${m.depthTest ? 1 : 0}|${m.side}|${m.polygonOffset ? `${m.polygonOffsetFactor},${m.polygonOffsetUnits}` : ''}`;
};

/** The vertices a source draws, in the order a mesh's triangles or a set of line segments takes them: a line strip's or loop's as its segments. */
function order(o: THREE.Mesh | THREE.Line): number[] {
  const g = o.geometry, idx = g.index, n = idx ? idx.count : g.getAttribute('position').count, at = (i: number) => (idx ? idx.getX(i) : i);
  if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) return Array.from({ length: n }, (_, i) => at(i));
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(at(i - 1), at(i));
  if (o instanceof THREE.LineLoop && n > 2) out.push(at(n - 1), at(0));
  return out;
}

interface Entry { o: THREE.Mesh | THREE.Line; look: string; start: number; count: number; paint: string }

const paintOf = (o: THREE.Mesh | THREE.Line): string => {
  const m = o.material as THREE.Material;
  return `${colorOf(m)!.getHex()}|${m.vertexColors ? (o.geometry.getAttribute('color') as THREE.BufferAttribute | undefined)?.version ?? 'n' : '-'}`;
};

export class ShellBatch {
  private looks = new Map<string, Look>();
  private shape = '';
  private entries: Entry[] = [];
  private hidden = new Set<THREE.Material>();
  /** Objects copied the last time, for tests and the HUD. */
  sources = 0;

  constructor(private readonly parent: THREE.Group) {}

  /** Copy the shown shells into their batches when anything they show changed; with `off`, draw each on its own again. */
  sync(off = false): void {
    if (off) { this.clear(); return; }
    this.parent.updateMatrixWorld(true);
    const src = sources(this.parent);
    const shape = this.shapeOf(src);
    if (shape !== this.shape) { this.shape = shape; this.rebuild(src); return; }
    this.repaint();
  }

  private shapeOf(src: ReadonlyArray<THREE.Mesh | THREE.Line>): string {
    let h1 = 0x811c9dc5 | 0, h2 = 0;
    const mix = (v: number) => { h1 = Math.imul(h1 ^ (v | 0), 16777619); h2 = (h2 * 31 + (v | 0)) | 0; };
    for (const o of src) {
      const m = o.material as THREE.Material, g = o.geometry;
      mix(o.id); mix(g.id); mix((m as unknown as { id: number }).id);
      mix((g.getAttribute('position') as THREE.BufferAttribute | undefined)?.version ?? -1);
      mix(Math.round(m.opacity * 1000)); mix(m.transparent ? 1 : 0); mix(m.depthWrite ? 1 : 0);
      const e = o.matrixWorld.elements;
      for (const i of [0, 5, 10, 12, 13, 14]) mix(Math.round(e[i]! * 1e4));
    }
    return `${src.length}:${h1}:${h2}`;
  }

  private write(e: Entry, col: Float32Array): void {
    const g = e.o.geometry, m = e.o.material as THREE.Material, base = colorOf(m)!, c = new THREE.Color();
    const C = m.vertexColors ? g.getAttribute('color') as THREE.BufferAttribute | undefined : undefined;
    const ord = order(e.o);
    for (let i = 0; i < e.count; i++) {
      const v = ord[i]!, at = (e.start + i) * 3;
      if (C) c.fromBufferAttribute(C, v).multiply(base); else c.copy(base);
      col[at] = c.r; col[at + 1] = c.g; col[at + 2] = c.b;
    }
    e.paint = paintOf(e.o);
  }

  /** Only colours changed: those of the shells that changed are written again. */
  private repaint(): void {
    const dirty = new Set<string>();
    for (const e of this.entries) {
      if (paintOf(e.o) === e.paint) continue;
      const look = this.looks.get(e.look);
      if (!look) continue;
      this.write(e, (look.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).array as Float32Array);
      dirty.add(e.look);
    }
    for (const k of dirty) (this.looks.get(k)!.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private rebuild(src: ReadonlyArray<THREE.Mesh | THREE.Line>): void {
    for (const m of this.hidden) m.visible = true;
    this.hidden.clear();
    this.entries = [];
    const groups = new Map<string, Array<THREE.Mesh | THREE.Line>>();
    for (const o of src) { const k = lookOf(o); const l = groups.get(k) ?? []; l.push(o); groups.set(k, l); }
    for (const [k, look] of this.looks) if (!groups.has(k)) { this.parent.remove(look.mesh); look.mesh.geometry.dispose(); (look.mesh.material as THREE.Material).dispose(); this.looks.delete(k); }
    const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const [k, list] of groups) {
      const lines = list[0] instanceof THREE.Line;
      let count = 0;
      for (const o of list) count += order(o).length;
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), nor = lines ? null : new Float32Array(count * 3);
      const withNormals = !!nor && list.every((o) => o.geometry.getAttribute('normal'));
      let at = 0;
      for (const o of list) {
        const g = o.geometry, m = o.material as THREE.Material;
        const P = g.getAttribute('position') as THREE.BufferAttribute, N = withNormals ? g.getAttribute('normal') as THREE.BufferAttribute : undefined;
        nm.getNormalMatrix(o.matrixWorld);
        const ord = order(o), total = ord.length;
        for (let i = 0; i < total; i++) {
          const v = ord[i]!, j = (at + i) * 3;
          p.fromBufferAttribute(P, v).applyMatrix4(o.matrixWorld);
          pos[j] = p.x; pos[j + 1] = p.y; pos[j + 2] = p.z;
          if (N) { n.fromBufferAttribute(N, v).applyMatrix3(nm).normalize(); nor![j] = n.x; nor![j + 1] = n.y; nor![j + 2] = n.z; }
        }
        const e: Entry = { o, look: k, start: at, count: total, paint: '' };
        this.write(e, col);
        this.entries.push(e);
        at += total;
        m.visible = false;
        this.hidden.add(m);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (nor) { if (withNormals) geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); else geo.computeVertexNormals(); }
      const old = this.looks.get(k);
      if (old) { this.parent.remove(old.mesh); old.mesh.geometry.dispose(); (old.mesh.material as THREE.Material).dispose(); }
      const mat = (list[0]!.material as THREE.Material).clone();
      delete mat.userData.halftone;
      mat.visible = true;
      mat.vertexColors = true;
      colorOf(mat)!.set(0xffffff);
      const mesh = lines ? new THREE.LineSegments(geo, mat) : new THREE.Mesh(geo, mat);
      mesh.renderOrder = list[0]!.renderOrder;
      mesh.userData[BATCH] = true;
      mesh.raycast = () => {};
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      this.parent.add(mesh);
      this.looks.set(k, { mesh, key: k });
    }
    this.sources = src.length;
  }

  /** Every source drawn on its own again, and the batches gone. */
  clear(): void {
    for (const m of this.hidden) m.visible = true;
    this.hidden.clear();
    for (const look of this.looks.values()) { this.parent.remove(look.mesh); look.mesh.geometry.dispose(); (look.mesh.material as THREE.Material).dispose(); }
    this.looks.clear();
    this.entries = [];
    this.shape = '';
    this.sources = 0;
  }

  /** The batches, for tests. */
  batches(): Array<THREE.Mesh | THREE.LineSegments> { return [...this.looks.values()].map((l) => l.mesh); }
}
