import type { MemberMoments } from '../member-moments';
import type { PointLoad3DLike } from '../member-point-loads';

export const MIN_GRAVITY_MEMBER_SPAN = 1e-9;
export interface GravityMemberLoad {
  elementId: number;
  spanLength?: number;
  a?: number;
  b?: number;
  qXI?: number;
  qXJ?: number;
  qYI: number;
  qYJ: number;
  qZI: number;
  qZJ: number;
  moments?: MemberMoments;
  frame?: 'local' | 'global' | 'projected';
}

export function memberLoadSpans<T extends GravityMemberLoad>(loads: readonly T[], length: (id: number) => number): { distributed: T[]; concentrated: Array<Omit<T, keyof GravityMemberLoad> & PointLoad3DLike> } {
  const distributed: T[] = [], concentrated: Array<Omit<T, keyof GravityMemberLoad> & PointLoad3DLike> = [];
  for (const load of loads) {
    const a = load.a ?? 0, b = load.b ?? length(load.elementId), h = load.spanLength ?? b - a;
    if (!(h > 0)) throw new Error('Gravity member loading requires a positive span');
    if (h >= MIN_GRAVITY_MEMBER_SPAN) { distributed.push(load); continue; }
    if (load.frame === 'projected') throw new Error('Short projected gravity loading requires conversion to member length');
    const frame = load.frame ?? 'local';
    for (const [component, qi, qj] of [
      ['px', load.qXI ?? 0, load.qXJ ?? 0], ['py', load.qYI, load.qYJ], ['pz', load.qZI, load.qZJ],
    ] as const) {
      if (qi === 0 && qj === 0) continue;
      const parts = (qi >= 0 && qj >= 0 || qi <= 0 && qj <= 0)
        ? [{ force: h * (qi / 2 + qj / 2), t: (qi / Math.max(Math.abs(qi),Math.abs(qj)) + 2 * (qj / Math.max(Math.abs(qi),Math.abs(qj)))) / (3 * (qi / Math.max(Math.abs(qi),Math.abs(qj)) + qj / Math.max(Math.abs(qi),Math.abs(qj)))) }]
        : [{ force: h * qi / 2, t: 1 / 3 }, { force: h * qj / 2, t: 2 / 3 }];
      for (const part of parts) concentrated.push({ ...load, elementId: load.elementId, a: a + h * part.t, py: 0, pz: 0, [component]: part.force, frame });
    }
    if (load.moments) {
      for (const [component, v] of [['mx',load.moments.x],['my',load.moments.y],['mz',load.moments.z]] as const) {
        const scale = Math.max(...v.map(Math.abs));
        if (scale === 0) continue;
        const normalized = v.map(x => x/scale);
        const integral = normalized[0]!/6 + 2*normalized[1]!/3 + normalized[2]!/6;
        const first = normalized[1]!/3 + normalized[2]!/6;
        const t = first/integral;
        const parts = integral !== 0 && t >= 0 && t <= 1
          ? [{ value: h*scale*integral, t }]
          : v.map((value,i) => ({ value: h*value*(i===1 ? 2/3 : 1/6), t: i/2 }));
        for (const part of parts) if (part.value !== 0) concentrated.push({ ...load, elementId: load.elementId, a: a+h*part.t, py: 0, pz: 0, [component]: part.value, frame });
      }
    }
  }
  return { distributed, concentrated };
}

export function plannedMemberLoadSpans<T extends { elementId: number; q: number; qJ?: number; qX?: number; qY?: number; a?: number; b?: number; frame?: 'local' | 'global' | 'projected'; moments?: MemberMoments }>(loads: readonly T[], model?: { nodes: Map<number, { x: number; y: number; z?: number }>; elements: Map<number, { nodeI: number; nodeJ: number }> }) {
  const geometry = (id: number) => {
    if (!model) return { delta: [0,0,0], length: Infinity };
    const e = model.elements.get(id)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const delta = [b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0)];
    return { delta, length: Math.hypot(...delta) };
  };
  const canonical = loads.map(load => {
    const { delta, length } = geometry(load.elementId);
    const shortProjected = load.frame === 'projected' && (load.b ?? length) - (load.a ?? 0) < MIN_GRAVITY_MEMBER_SPAN;
    if (shortProjected && !model) throw new Error('Short projected gravity loading requires member geometry');
    const k = delta.map(v => shortProjected ? Math.sqrt(Math.max(0, 1 - (v / length) ** 2)) : 1);
    return { ...load, frame: shortProjected ? 'global' as const : load.frame, qXI: (load.qX ?? 0) * k[0]!, qXJ: (load.qX ?? 0) * k[0]!, qYI: (load.qY ?? 0) * k[1]!, qYJ: (load.qY ?? 0) * k[1]!, qZI: load.q * k[2]!, qZJ: (load.qJ ?? load.q) * k[2]! };
  });
  const result = memberLoadSpans(canonical, id => geometry(id).length);
  return { distributed: result.distributed.map(({ qXI, qXJ, qYI, qYJ, qZI, qZJ, ...load }) => load), concentrated: result.concentrated };
}
