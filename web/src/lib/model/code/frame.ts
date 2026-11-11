import {
  makeFrame, pseudoToModel, pseudoToUser, toModel, toUser, userAxisAlong,
  type AxesChoice, type AxesFrame, type Vec3,
} from '../../axes/frame';

type Obj = Record<string, any>;
type Way = 'toUser' | 'toModel';

const vec = (f: AxesFrame, way: Way, v: Vec3) => (way === 'toUser' ? toUser(f, v) : toModel(f, v));
const rot = (f: AxesFrame, way: Way, v: Vec3) => (way === 'toUser' ? pseudoToUser(f, v) : pseudoToModel(f, v));

function mapTriple(o: Obj, keys: readonly [string, string, string], fn: (v: Vec3) => Vec3): void {
  if (!keys.some((k) => o[k] !== undefined)) return;
  const out = fn([o[keys[0]] ?? 0, o[keys[1]] ?? 0, o[keys[2]] ?? 0]);
  keys.forEach((k, i) => { if (o[k] !== undefined || out[i] !== 0) o[k] = out[i] + 0; });
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

const SPACE_MODES = new Set(['3d', 'pro']);

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
      mapTriple(d, ['fx', 'fy', 'fz'], (v) => vec(f, way, v));
      mapTriple(d, ['mx', 'my', 'mz'], (v) => rot(f, way, v));
    } else if (l.type === 'distributed3d' && (d.frame === 'global' || d.frame === 'projected')) {
      mapTriple(d, ['qXI', 'qYI', 'qZI'], (v) => vec(f, way, v));
      mapTriple(d, ['qXJ', 'qYJ', 'qZJ'], (v) => vec(f, way, v));
    } else if (l.type === 'pointOnElement3d' && d.frame === 'global') {
      mapTriple(d, ['px', 'py', 'pz'], (v) => vec(f, way, v));
      mapTriple(d, ['mx', 'my', 'mz'], (v) => rot(f, way, v));
    } else if (l.type === 'displacement3d') {
      mapTriple(d, ['dx', 'dy', 'dz'], (v) => vec(f, way, v));
      mapTriple(d, ['drx', 'dry', 'drz'], (v) => rot(f, way, v));
    }
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
    mapTriple(sp, ['dx', 'dy', 'dz'], (v) => vec(f, way, v));
    mapTriple(sp, ['drx', 'dry', 'drz'], (v) => rot(f, way, v));
    mapTriple(sp, ['normalX', 'normalY', 'normalZ'], (v) => vec(f, way, v));
  }
  return s as T;
}

export function frameLine(choice: AxesChoice): string {
  return `frame up=${JSON.stringify(choice.up)} right=${JSON.stringify(choice.right)} hand=${JSON.stringify(choice.hand)}`;
}

export const FRAME_NOTE = '# Coordinates, global loads and supports are in the axes of the frame line; support type names keep the model\'s axes.';
