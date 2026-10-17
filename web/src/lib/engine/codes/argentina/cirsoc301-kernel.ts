/**
 * The CIRSOC 301 steel checker, as the engine computes it.
 *
 * Every CIRSOC 301 number in the app comes from Rust (`engine/src/postprocess/cirsoc301_check.rs`),
 * where the clauses are tested against INTI's worked examples, and from its certified twin
 * (`certify::design::certify_cirsoc301_members`), which evaluates the same formulas in
 * outward-rounded interval arithmetic. This module is the boundary and nothing else: it passes
 * JSON in and out and holds no rule.
 *
 * Registered by WASM initialisation and dependency-free, like the other kernels, so the
 * synchronous checker can call it without importing the solver. Unregistered, every query answers
 * `null`: the caller reports the member as NOT verified, never with a capacity made up here.
 */
import type { EngineMessage } from '../../../codes/message';

type JsonFn = (json: string) => string;

let check: JsonFn | null = null;
let certify: JsonFn | null = null;

export function registerCirsoc301Kernel(fns: { check: JsonFn | null; certify: JsonFn | null } | null): void {
  check = fns?.check ?? null;
  certify = fns?.certify ?? null;
}
export function cirsoc301KernelAvailable(): boolean { return check !== null && certify !== null; }

/** One limit-state check as the engine reports it. `ratio` is Infinity for a refused loaded check. */
export interface EngineCheck {
  demand: number;
  capacity: number;
  ratio: number;
  pass: boolean;
  clause: string;
  notEvaluated?: EngineMessage;
  values: Record<string, number | null>;
  steps: EngineMessage[];
}

export interface EngineMemberResult {
  elementId: number;
  nu: number; muStrong: number; muWeak: number; vu: number;
  tension?: EngineCheck;
  compression?: EngineCheck;
  flexureStrong: EngineCheck;
  flexureWeak?: EngineCheck;
  shear: EngineCheck;
  interaction?: EngineCheck;
  unityRatio: number;
  governingCheck: string;
  pass: boolean;
  unevaluated: string[];
}

/** Forces: Nu POSITIVE IN COMPRESSION (kN), Muz strong-axis and Muy weak-axis moments (kN·m), Vu (kN). */
export interface EngineForces { elementId: number; Nu: number; Muz: number; Muy: number; Vu: number }

const fixRatio = (c: EngineCheck | undefined) => {
  if (c && (c.ratio === null || c.ratio === undefined)) c.ratio = Infinity;
};

/** Check members. `members` are `SteelDesignParams` with `elementId`. Null when the engine is absent or throws. */
export function engineCheckMembers(members: readonly object[], forces: readonly EngineForces[]): EngineMemberResult[] | null {
  if (!check) return null;
  let out: EngineMemberResult[];
  try {
    out = JSON.parse(check(JSON.stringify({ members, forces })));
  } catch {
    return null;
  }
  for (const r of out) {
    if (r.unityRatio === null || r.unityRatio === undefined) r.unityRatio = Infinity;
    for (const c of [r.tension, r.compression, r.flexureStrong, r.flexureWeak, r.shear, r.interaction]) fixRatio(c);
  }
  return out;
}

/** Certified result of one member over its demand sets (`docs/verification/CERTIFY.md`). */
export interface CertifiedResult {
  elementId: number;
  certified: boolean;
  reason?: string;
  utilizationLower: number;
  utilizationUpper: number;
  certifiedOk: boolean;
  certifiedFail: boolean;
  governingCheck: string;
  checks: { name: string; lower: number; upper: number }[];
  demandCount: number;
}

export interface DemandBound { n: number; my: number; mz: number; vy: number }

/** Certify members over demand sets with bounds (0 = the exact given forces). Null when unavailable. */
export function engineCertifyMembers(
  members: readonly object[],
  demands: readonly { forces: EngineForces; bound?: DemandBound }[],
): CertifiedResult[] | null {
  if (!certify) return null;
  try {
    return JSON.parse(certify(JSON.stringify({
      members,
      demands: demands.map((d) => ({ forces: d.forces, bound: d.bound ?? { n: 0, my: 0, mz: 0, vy: 0 } })),
    })));
  } catch {
    return null;
  }
}
