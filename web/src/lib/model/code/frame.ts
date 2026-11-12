import {
  makeFrame, pseudoToModel, pseudoToUser, toModel, toUser, userAxisAlong,
  type AxesChoice, type AxesFrame, type Vec3,
} from '../../axes/frame';

type Obj = Record<string, any>;
type Way = 'toUser' | 'toModel';

const vec = (f: AxesFrame, way: Way, v: Vec3) => (way === 'toUser' ? toUser(f, v) : toModel(f, v));
const rot = (f: AxesFrame, way: Way, v: Vec3) => (way === 'toUser' ? pseudoToUser(f, v) : pseudoToModel(f, v));

function mapTriple(f: AxesFrame, way: Way, o: Obj, keys: readonly [string, string, string], kind: 'vec' | 'rot' = 'vec'): void {
  if (!keys.some((k) => o[k] !== undefined)) return;
  const v: Vec3 = [o[keys[0]] ?? 0, o[keys[1]] ?? 0, o[keys[2]] ?? 0];
  const out = kind === 'vec' ? vec(f, way, v) : rot(f, way, v);
  const had = keys.map((k) => o[k] !== undefined);
  const has = [...had];
  f.rows.forEach((row, i) => {
    const m = row.findIndex((c) => c !== 0);
    if (way === 'toUser') has[i] = had[m]!; else has[m] = had[i]!;
  });
  keys.forEach((k, i) => { if (has[i] || out[i] !== 0) o[k] = out[i]! + 0; else delete o[k]; });
}

function permute(f: AxesFrame, way: Way, o: Obj, keys: readonly [string, string, string]): void {
  if (!keys.some((k) => o[k] !== undefined)) return;
  const src = keys.map((k) => o[k]);
  const out: unknown[] = [...src];
  f.rows.forEach((row, i) => {
    const m = row.findIndex((c) => c !== 0);
    if (way === 'toUser') out[i] = src[m]; else out[m] = src[i];
  });
  keys.forEach((k, i) => { if (out[i] === undefined) delete o[k]; else o[k] = out[i]; });
}

function plane(f: AxesFrame) {
  return { h: userAxisAlong(f, 0).sign, v: userAxisAlong(f, 2).sign, r: f.det * userAxisAlong(f, 1).sign };
}

function planeGlobal(d: Obj, keys: readonly string[], p: { h: number; v: number }): void {
  for (const k of keys) if (typeof d[k] === 'number') d[k] = p.v * d[k] + 0;
  if (typeof d.angle === 'number') d.angle = p.h * p.v * d.angle + 0;
}

const SPACE_MODES = new Set(['3d', 'pro']);

const AXIS = ['X', 'Y', 'Z'] as const;

function vecList(f: AxesFrame, way: Way, list: unknown): void {
  if (!Array.isArray(list)) return;
  list.forEach((p, i) => { if (Array.isArray(p) && p.length === 3) list[i] = vec(f, way, p as unknown as Vec3).map((x) => x + 0); });
}

function vecArray(f: AxesFrame, way: Way, o: Obj, key: string): void {
  const v = o[key];
  if (Array.isArray(v) && v.length === 3) o[key] = vec(f, way, v as unknown as Vec3).map((x) => x + 0);
}

function vecXYZ(f: AxesFrame, way: Way, o: unknown): void {
  if (o && typeof o === 'object') mapTriple(f, way, o as Obj, ['x', 'y', 'z']);
}

function axisMap(f: AxesFrame, way: Way): { index: number[]; sign: number[] } {
  const index = [0, 1, 2], sign = [1, 1, 1];
  f.rows.forEach((row, i) => {
    const m = row.findIndex((c) => c !== 0);
    if (way === 'toUser') { index[m] = i; sign[m] = row[m]!; } else { index[i] = m; sign[i] = row[m]!; }
  });
  return { index, sign };
}

function mapDof(f: AxesFrame, way: Way, dof: number): { dof: number; sign: number } {
  if (!Number.isInteger(dof) || dof < 0 || dof > 5) return { dof, sign: 1 };
  const { index, sign } = axisMap(f, way);
  const k = dof % 3, rot = dof >= 3;
  return { dof: index[k]! + (rot ? 3 : 0), sign: sign[k]! * (rot ? f.det : 1) };
}

function transformConstraint(f: AxesFrame, way: Way, c: Obj): void {
  const dofs = (key: string) => {
    if (Array.isArray(c[key])) c[key] = (c[key] as unknown[]).map((d) => (typeof d === 'number' ? mapDof(f, way, d).dof : d));
  };
  if (c.type === 'rigidLink' || c.type === 'equalDOF') dofs('dofs');
  else if (c.type === 'linearMPC' && Array.isArray(c.terms)) {
    for (const t of c.terms as Obj[]) {
      if (typeof t.dof !== 'number') continue;
      const m = mapDof(f, way, t.dof);
      t.dof = m.dof;
      if (typeof t.coefficient === 'number') t.coefficient = m.sign * t.coefficient + 0;
    }
  } else if (c.type === 'diaphragm' && typeof c.plane === 'string' && /^[XYZ]{2}$/.test(c.plane)) {
    const { index } = axisMap(f, way);
    c.plane = [...c.plane].map((a) => AXIS[index[AXIS.indexOf(a as 'X')]!]).sort().join('');
  } else if (c.type === 'eccentricConnection') {
    mapTriple(f, way, c, ['offsetX', 'offsetY', 'offsetZ']);
    const r = c.releases;
    if (Array.isArray(r) && r.length === 6) {
      const out = [...r];
      for (let d = 0; d < 6; d++) out[mapDof(f, way, d).dof] = r[d];
      c.releases = out;
    }
  }
}

export function transformSnapshot<T extends Obj>(snap: T, choice: AxesChoice, way: Way): T {
  const f = makeFrame(choice);
  if (f.identity) return snap;
  const s = JSON.parse(JSON.stringify(snap)) as Obj;
  const space = SPACE_MODES.has(s.analysisMode) || (s.nodes ?? []).some(([, n]: [number, Obj]) => n.z !== undefined);
  const p = plane(f);
  for (const [, n] of (s.nodes ?? []) as Array<[number, Obj]>) {
    if (space) {
      const [x, y, z] = vec(f, way, [n.x, n.y, n.z ?? 0]);
      n.x = x + 0; n.y = y + 0;
      if (way === 'toUser' || z !== 0) n.z = z + 0; else delete n.z;
    }
    else { n.x = p.h * n.x + 0; n.y = p.v * n.y + 0; }
  }
  for (const l of (s.loads ?? []) as Obj[]) {
    const d = l.data as Obj;
    if (l.type === 'nodal' && !space) {
      if (d.fx !== undefined) d.fx = p.h * d.fx + 0;
      for (const k of ['fz', 'fy']) if (d[k] !== undefined) d[k] = p.v * d[k] + 0;
      for (const k of ['my', 'mz']) if (d[k] !== undefined) d[k] = p.r * d[k] + 0;
    } else if (l.type === 'nodal3d' || (l.type === 'nodal' && space)) {
      mapTriple(f, way, d, ['fx', 'fy', 'fz']);
      mapTriple(f, way, d, ['mx', 'my', 'mz'], 'rot');
    } else if (l.type === 'distributed3d' && (d.frame === 'global' || d.frame === 'projected')) {
      mapTriple(f, way, d, ['qXI', 'qYI', 'qZI']);
      mapTriple(f, way, d, ['qXJ', 'qYJ', 'qZJ']);
    } else if (l.type === 'pointOnElement3d' && d.frame === 'global') {
      mapTriple(f, way, d, ['px', 'py', 'pz']);
      mapTriple(f, way, d, ['mx', 'my', 'mz'], 'rot');
    } else if (l.type === 'displacement3d') {
      mapTriple(f, way, d, ['dx', 'dy', 'dz']);
      mapTriple(f, way, d, ['drx', 'dry', 'drz'], 'rot');
    } else if (l.type === 'surface3d') {
      if (d.frame === 'global' || d.frame === 'projected') vecArray(f, way, d, 'dir');
      if (d.vary && typeof d.vary === 'object') vecArray(f, way, d.vary as Obj, 'dir');
      const region = d.region as Obj | undefined;
      if (region && typeof region === 'object') {
        vecArray(f, way, region, 'normal');
        vecList(f, way, region.points);
        if (Array.isArray(region.holes)) for (const h of region.holes) vecList(f, way, h);
      }
    } else if (l.type === 'pointOnElement' && !space) {
      for (const k of ['my', 'mz']) if (d[k] !== undefined) d[k] = p.r * d[k] + 0;
      if (d.isGlobal) planeGlobal(d, ['p'], p);
    } else if (l.type === 'distributed' && !space && d.isGlobal) {
      planeGlobal(d, ['qI', 'qJ'], p);
    }
  }
  if (space) {
    for (const [, e] of (s.elements ?? []) as Array<[number, Obj]>) {
      mapTriple(f, way, e, ['localYx', 'localYy', 'localYz']);
      const o = e.offset as Obj | undefined;
      if (o && o.frame === 'global') { vecXYZ(f, way, o.i); vecXYZ(f, way, o.j); }
    }
    for (const key of ['quads', 'plates']) {
      for (const [, q] of (s[key] ?? []) as Array<[number, Obj]>) {
        const o = q.offset as Obj | undefined;
        if (o && o.frame === 'global') vecXYZ(f, way, o);
      }
    }
    for (const c of (s.constraints ?? []) as Obj[]) if (c && typeof c === 'object') transformConstraint(f, way, c);
  }
  for (const [, sp] of (s.supports ?? []) as Array<[number, Obj]>) {
    if (!space) {
      if (sp.dx !== undefined) sp.dx = p.h * sp.dx + 0;
      for (const k of ['dz', 'dy']) if (sp[k] !== undefined) sp[k] = p.v * sp[k] + 0;
      for (const k of ['dry', 'drz']) if (sp[k] !== undefined) sp[k] = p.r * sp[k] + 0;
      continue;
    }
    if (sp.dofFrame === 'local') continue;
    if (sp.dofRestraints) {
      const r = sp.dofRestraints as Obj;
      permute(f, way, r, ['tx', 'ty', 'tz']);
      permute(f, way, r, ['rx', 'ry', 'rz']);
    }
    permute(f, way, sp, ['kx', 'ky', 'kz']);
    permute(f, way, sp, ['krx', 'kry', 'krz']);
    if (sp.curves && typeof sp.curves === 'object') permute(f, way, sp.curves as Obj, ['x', 'y', 'z']);
    mapTriple(f, way, sp, ['dx', 'dy', 'dz']);
    mapTriple(f, way, sp, ['drx', 'dry', 'drz'], 'rot');
    mapTriple(f, way, sp, ['normalX', 'normalY', 'normalZ']);
  }
  return s as T;
}

export function frameLine(choice: AxesChoice): string {
  return `frame up=${JSON.stringify(choice.up)} right=${JSON.stringify(choice.right)} hand=${JSON.stringify(choice.hand)}`;
}

export const FRAME_NOTE = '# Coordinates, global loads, supports, member orientations and offsets and constraints are in the axes of the frame line; support type names, footings and the project settings lines keep the model\'s axes.';
