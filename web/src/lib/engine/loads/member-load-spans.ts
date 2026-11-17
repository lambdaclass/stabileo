import { EngineCheckError } from '../engine-unavailable';
import type { Load } from '../../store/model.svelte';
import { hasMemberMoments, type MemberMoments } from '../member-moments';

export const MIN_GRAVITY_MEMBER_SPAN = 1e-9;
export const MIN_NATIVE_MEMBER_LOAD_SPAN = 1e-12;
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

export class MemberLoadSpanRefusal extends EngineCheckError {
  constructor(readonly elementId: number, readonly a: number, readonly b: number, reason?: string) {
    super('member loading', reason ?? `Member ${elementId}: distributed force or moment span [${a}, ${b}] is below the native supported minimum ${MIN_NATIVE_MEMBER_LOAD_SPAN}; the load step was refused to avoid relocating member loading to a node`);
  }
}

export function assertMemberLoadSpan(elementId: number, a: number, b: number, spanLength = b - a, minimumSpan = MIN_NATIVE_MEMBER_LOAD_SPAN): void {
  const span = Math.min(b - a, spanLength);
  if (!Number.isFinite(spanLength) || !Number.isFinite(span) || !(span > 0) || span < minimumSpan) {
    throw new MemberLoadSpanRefusal(elementId, a, b);
  }
}

export function retainMemberLoadSpan(elementId: number, a: number, b: number, length: number, forces: readonly number[], moments?: MemberMoments, minimumSpan = MIN_NATIVE_MEMBER_LOAD_SPAN, source?: { elementId: number; generatedBy?: string; fromDef?: number; spanLength?: number }): boolean {
  const explicitEmpty = source?.generatedBy === undefined && source?.fromDef === undefined && (source?.spanLength === undefined || source.spanLength === 0);
  if (explicitEmpty && !hasMemberMoments(moments) && Number.isFinite(a) && Number.isFinite(length) && length > 0 && a >= 0 && a <= length && a === b && forces.every(Number.isFinite)) return false;
  assertMemberLoadSpan(elementId, a, b, undefined, minimumSpan);
  return true;
}

export function nonemptyMemberForceLoads(loads: readonly Load[], model: { nodes: Map<number, { x: number; y: number; z?: number }>; elements: Map<number, { nodeI: number; nodeJ: number }> }): Load[] {
  return loads.filter(load => {
    if (load.type !== 'distributed' && load.type !== 'distributed3d') return true;
    const d = load.data, e = model.elements.get(d.elementId);
    const i = e && model.nodes.get(e.nodeI), j = e && model.nodes.get(e.nodeJ);
    if (!i || !j) return true;
    const length = Math.hypot(j.x - i.x, j.y - i.y, (j.z ?? 0) - (i.z ?? 0));
    const forces = load.type === 'distributed' ? [load.data.qI, load.data.qJ, load.data.angle ?? 0]
      : [load.data.qXI ?? 0, load.data.qXJ ?? 0, load.data.qYI, load.data.qYJ, load.data.qZI, load.data.qZJ];
    return retainMemberLoadSpan(d.elementId, d.a ?? 0, d.b ?? length, length, forces,
      load.type === 'distributed3d' ? load.data.moments : undefined, 0, d);
  });
}

export function memberLoadSpans<T extends { elementId: number; a?: number; b?: number; spanLength?: number }>(loads: readonly T[], length?: (id: number) => number): { distributed: T[]; concentrated: never[] } {
  for (const load of loads) {
    const memberLength = length?.(load.elementId) ?? NaN;
    const a = load.a ?? 0, b = load.b ?? memberLength;
    if (!Number.isFinite(memberLength) || memberLength <= 0) {
      throw new MemberLoadSpanRefusal(load.elementId, a, b, `Member ${load.elementId}: missing or invalid member geometry for distributed loading`);
    }
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > memberLength || b < a) {
      throw new MemberLoadSpanRefusal(load.elementId, a, b, `Member ${load.elementId}: distributed load span [${a}, ${b}] is outside member length ${memberLength}`);
    }
    assertMemberLoadSpan(load.elementId, a, b, load.spanLength);
  }
  return { distributed: [...loads], concentrated: [] };
}

export function plannedMemberLoadSpans<T extends { elementId: number; q: number; qJ?: number; qX?: number; qY?: number; a?: number; b?: number; frame?: 'local' | 'global' | 'projected'; moments?: MemberMoments }>(loads: readonly T[], model?: { nodes: Map<number, { x: number; y: number; z?: number }>; elements: Map<number, { nodeI: number; nodeJ: number }> }) {
  return memberLoadSpans(loads, id => {
    const e = model?.elements.get(id), a = e && model?.nodes.get(e.nodeI), b = e && model?.nodes.get(e.nodeJ);
    return a && b ? Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + ((b.z ?? 0) - (a.z ?? 0)) ** 2) : NaN;
  });
}
