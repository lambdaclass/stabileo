import type { MemberMoments } from '../member-moments';

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

export class MemberLoadSpanRefusal extends Error {
  constructor(readonly elementId: number, a: number, b: number) {
    super(`Member ${elementId}: distributed force or moment span [${a}, ${b}] is below the native supported minimum ${MIN_NATIVE_MEMBER_LOAD_SPAN}; the load step was refused to avoid relocating member loading to a node`);
  }
}

export function assertMemberLoadSpan(elementId: number, a: number, b: number, spanLength = b - a, minimumSpan = MIN_NATIVE_MEMBER_LOAD_SPAN): void {
  const span = Math.min(b - a, spanLength);
  if (!Number.isFinite(span) || !(span > 0) || span < minimumSpan) {
    throw new MemberLoadSpanRefusal(elementId, a, b);
  }
}

export function memberLoadSpans<T extends { elementId: number }>(loads: readonly T[], _length?: (id: number) => number): { distributed: T[]; concentrated: never[] } {
  return { distributed: [...loads], concentrated: [] };
}

export function plannedMemberLoadSpans<T extends { elementId: number; q: number; qJ?: number; qX?: number; qY?: number; a?: number; b?: number; frame?: 'local' | 'global' | 'projected'; moments?: MemberMoments }>(loads: readonly T[], _model?: { nodes: Map<number, { x: number; y: number; z?: number }>; elements: Map<number, { nodeI: number; nodeJ: number }> }) {
  return memberLoadSpans(loads);
}
