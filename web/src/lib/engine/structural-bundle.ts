/**
 * Build the StructuralBundle from a solved model: the calculation's side of the contract.
 *
 * Reads the per-combination results the solve produced and the station extraction the
 * calculation owns (`station-forces.ts`); imports nothing from design. A design module, here or
 * in another repository, reads the bundle and never recomputes forces.
 */
import {
  STRUCTURAL_BUNDLE_VERSION, type BundleMaterial, type BundleStation, type BundleUnits, type StructuralBundle,
} from '../design-contract/bundle';
import { buildCriticalStations, extractForcesAtStation } from './station-forces';
import { materialFamilyOf } from '../model/material-family';
import { catalogueGradeFamily } from '../model/grade-family';
import type { AnalysisResults3D } from './types-3d';

/** A model material as the bundle reads it: moduli and strengths in MPa, as the model keeps them. */
export interface BundleSourceMaterial {
  id: number;
  name: string;
  e?: number; g?: number; nu?: number; rho?: number; alpha?: number;
  fy?: number; fu?: number;
  /** A concrete's f'c, MPa. Absent on older projects, which kept it in `fy` (`concreteFc`). */
  fc?: number;
  gradeId?: string;
  timber?: { fb: number; ft: number; fc: number; fcPerp?: number; fv: number; e: number; emin?: number; kind: string; cf?: unknown };
}

const UNITS: BundleUnits = {
  length: 'm', force: 'kN', moment: 'kN·m', stress: 'kPa',
  density: 'kN/m³', thermalExpansion: '1/°C', area: 'm²', inertia: 'm⁴', angle: 'deg',
};

/** MPa → kPa, the bundle's stress unit; absent stays absent. */
const kPa = (mpa: number | undefined): number | undefined => (mpa === undefined ? undefined : mpa * 1000);

/**
 * A material in the bundle's units. Every stress goes from the model's MPa to kPa, and a
 * concrete's f'c is stated as `fc` (its own field, or the `fy` older projects kept it in, the
 * rule `concreteFc` applies) with no `fy`, so a reader never takes a concrete strength for a
 * yield stress. The family is the app's one classification (`materialFamilyOf`); a material
 * that states `fc` is a concrete whatever else it says.
 */
function bundleMaterial(m: BundleSourceMaterial): BundleMaterial {
  const { e, g, fy, fu, fc, timber, ...rest } = m;
  const family = fc !== undefined ? 'concrete' : materialFamilyOf(m, catalogueGradeFamily).family;
  const out: BundleMaterial = { ...rest, family };
  const put = (k: 'e' | 'g' | 'fy' | 'fu' | 'fc', v: number | undefined) => { if (v !== undefined) out[k] = v; };
  put('e', kPa(e));
  put('g', kPa(g));
  if (family === 'concrete') {
    put('fc', kPa(fc ?? fy));
  } else {
    put('fy', kPa(fy));
    put('fu', kPa(fu));
  }
  if (timber) {
    out.timber = {
      ...timber,
      fb: timber.fb * 1000, ft: timber.ft * 1000, fc: timber.fc * 1000, fv: timber.fv * 1000, e: timber.e * 1000,
      ...(timber.fcPerp !== undefined ? { fcPerp: timber.fcPerp * 1000 } : {}),
      ...(timber.emin !== undefined ? { emin: timber.emin * 1000 } : {}),
    };
  }
  return out;
}

export interface BundleSource {
  nodes: Iterable<{ id: number; x: number; y: number; z?: number }>;
  elements: Iterable<{ id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number }>;
  sections: Iterable<{ id: number; name: string }>;
  materials: Iterable<BundleSourceMaterial>;
  combinations: ReadonlyArray<{ id: number; name: string; origin?: { code: string; family?: string; edition?: string; rule?: string; purpose?: string } }>;
  /** The solve's results per combination id. */
  perCombo: ReadonlyMap<number, AnalysisResults3D>;
  analysisRevision: number;
}

export function buildStructuralBundle(src: BundleSource): StructuralBundle {
  const combos = src.combinations.filter((c) => src.perCombo.has(c.id));
  const members = [...src.elements].map((e) => {
    const stations: Record<number, BundleStation[]> = {};
    let length = 0;
    for (const c of combos) {
      const ef = src.perCombo.get(c.id)!.elementForces.find((f) => f.elementId === e.id);
      if (!ef) continue;
      length = ef.length;
      stations[c.id] = buildCriticalStations(ef).map((t) => {
        const s = extractForcesAtStation(ef, t);
        return { t: s.t, x: s.x, n: s.n, vy: s.vy, vz: s.vz, my: s.my, mz: s.mz, torsion: s.torsion };
      });
    }
    return { id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, sectionId: e.sectionId, materialId: e.materialId, length, stations };
  });
  const reactions: StructuralBundle['reactions'] = {};
  for (const c of combos) {
    const r: Record<number, [number, number, number, number, number, number]> = {};
    for (const x of src.perCombo.get(c.id)!.reactions) r[x.nodeId] = [x.fx, x.fy, x.fz, x.mx, x.my, x.mz];
    reactions[c.id] = r;
  }
  return {
    version: STRUCTURAL_BUNDLE_VERSION,
    units: { ...UNITS },
    analysisRevision: src.analysisRevision,
    nodes: [...src.nodes].map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z ?? 0 })),
    // A section is geometry only (m, m², m⁴, degrees): nothing in it is a stress to convert.
    sections: [...src.sections].map((s) => ({ ...s })),
    materials: [...src.materials].map(bundleMaterial),
    combinations: combos.map((c) => ({ id: c.id, name: c.name, ...(c.origin ? { origin: { ...c.origin } } : {}) })),
    members,
    reactions,
  };
}

/**
 * Read a bundle written by any version, as the current one.
 *
 *  - Version 2 is taken as it is.
 *  - Version 1 declared `stress: 'kPa'` and carried the model's MPa, with a concrete's f'c in `fy`:
 *    every v1 bundle was written by `buildStructuralBundle` before the fix, so its stresses are
 *    MPa whatever its `units` say. It is upgraded (stresses × 1000, the concrete's strength as `fc`,
 *    the full units) and says so in `upgradedFrom`.
 *  - Any other version, or something that is not a bundle, is refused with the reason: a reader
 *    must not guess the units of numbers it was not told about.
 */
export function readStructuralBundle(raw: unknown):
  | { ok: true; bundle: StructuralBundle; upgradedFrom?: 1 }
  | { ok: false; reason: 'notABundle' | 'unknownVersion'; version?: unknown } {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { materials?: unknown }).materials)) return { ok: false, reason: 'notABundle' };
  const b = raw as StructuralBundle & { version: unknown };
  if (b.version === STRUCTURAL_BUNDLE_VERSION) return { ok: true, bundle: b as StructuralBundle };
  if (b.version !== 1) return { ok: false, reason: 'unknownVersion', version: b.version };
  const materials = (b.materials as unknown as BundleSourceMaterial[]).map((m) => bundleMaterial(m));
  return { ok: true, upgradedFrom: 1, bundle: { ...b, version: STRUCTURAL_BUNDLE_VERSION, units: { ...UNITS }, materials } };
}
