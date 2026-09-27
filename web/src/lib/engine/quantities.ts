/**
 * The project's quantities, in one place: what the structure is made of and the reinforcement it
 * is detailed with.
 *
 *   · Concrete and structural steel from the geometry (`model-takeoff.ts`): every member is its
 *     section along its length, every shell its area times its thickness, by material.
 *   · Reinforcement from the bar schedule of the detailing (the assemblies' marks, the same rows
 *     the schedule, the drawings and the workbook carry), by diameter and split into
 *     longitudinal bars and transverse (stirrups and ties).
 *   · Steel per cubic metre over the members the detailing covers, so the ratio compares like
 *     with like: the concrete of an undetailed member has no reinforcement counted against it.
 *
 * Reinforcement is never estimated from the design: an undetailed member has none here, and the
 * coverage says how much of the concrete is detailed.
 *
 * Pure.
 */
import { takeoffFromModel, type ModelTakeoff, type TakeoffModel } from './model-takeoff';
import type { BarMark } from './detailing/assembly';

export interface RebarByDiameter { diameterMm: number; quantity: number; lengthM: number; massKg: number }

export interface ReinforcementTakeoff {
  byDiameter: RebarByDiameter[];
  longitudinalKg: number;
  transverseKg: number;
  totalKg: number;
  /** Members some mark belongs to. */
  members: number[];
}

export interface ProjectQuantities {
  model: ModelTakeoff;
  reinforcement: ReinforcementTakeoff | null;
  /** Concrete of the members the detailing covers, m³, and the steel over it, kg/m³. */
  detailedConcreteVolume: number;
  kgPerM3: number | null;
}

export function reinforcementTakeoff(marks: Iterable<Pick<BarMark, 'diameterMm' | 'quantity' | 'cuttingLength' | 'massKg' | 'role' | 'ownerElementIds'>>): ReinforcementTakeoff | null {
  const byDia = new Map<number, RebarByDiameter>();
  const members = new Set<number>();
  let longitudinalKg = 0, transverseKg = 0, any = false;
  for (const m of marks) {
    any = true;
    const d = byDia.get(m.diameterMm) ?? { diameterMm: m.diameterMm, quantity: 0, lengthM: 0, massKg: 0 };
    d.quantity += m.quantity;
    d.lengthM += m.quantity * m.cuttingLength;
    d.massKg += m.massKg;
    byDia.set(m.diameterMm, d);
    if (m.role === 'transverse') transverseKg += m.massKg; else longitudinalKg += m.massKg;
    for (const id of m.ownerElementIds ?? []) members.add(id);
  }
  if (!any) return null;
  return {
    byDiameter: [...byDia.values()].sort((a, b) => a.diameterMm - b.diameterMm),
    longitudinalKg, transverseKg, totalKg: longitudinalKg + transverseKg,
    members: [...members].sort((a, b) => a - b),
  };
}

export function projectQuantities(model: TakeoffModel, marks: Iterable<Parameters<typeof reinforcementTakeoff>[0] extends Iterable<infer M> ? M : never>): ProjectQuantities {
  const t = takeoffFromModel(model);
  const reinforcement = reinforcementTakeoff(marks);
  let detailedConcreteVolume = 0;
  if (reinforcement) {
    const ids = new Set(reinforcement.members);
    const only = new Map([...model.elements].filter(([id]) => ids.has(id)));
    detailedConcreteVolume = takeoffFromModel({ ...model, elements: only, plates: new Map(), quads: new Map() }).concreteVolume;
  }
  return {
    model: t,
    reinforcement,
    detailedConcreteVolume,
    kgPerM3: reinforcement && detailedConcreteVolume > 0 ? reinforcement.totalKg / detailedConcreteVolume : null,
  };
}
