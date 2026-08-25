/**
 * Turn a topology plus a profile choice per role into a loadable model.
 *
 * ── Why this is a separate step ────────────────────────────────────
 *
 * The topology modules know where the members go and know nothing about steel. This one
 * knows about steel and nothing about where the members go. Keeping them apart is what
 * lets the geometry be tested against symmetry and arc identities without a catalogue in
 * the way, and lets the section arithmetic be tested against the parallel-axis theorem
 * without a truss in the way.
 *
 * ── One section per role, not per member ───────────────────────────
 *
 * Every chord in a truss shares one `Section`, because they are the same profile in the
 * same arrangement and duplicating them would make the sections table unreadable on a
 * 600-member shed. The consequence matters and is the reason `Section.rotation` cannot
 * carry a per-member orientation: rotating a shared section rotates every member using it.
 * Per-member orientation goes on the ELEMENT, as `rollAngle`, which is what that field is
 * for.
 *
 * ── What the emitted model claims ──────────────────────────────────
 *
 * Geometry, profiles and a material. NOT loads, NOT combinations, and NOT any statement
 * that the profiles verify. A generated model arrives with every member undesigned, which
 * is the honest state for it until a metallic authority exists to say otherwise.
 *
 * Pure of stores and runes.
 */

import type { JSONModel } from '../../templates/load-fixture';
import type { MemberRole } from './member-roles';
import { rolesPresent, tallyRoles } from './member-roles';
import type { GenSupport, Topology } from './truss-topology';
import {
  composeBuiltUp, torsionBasisKey, type BuiltUpArrangement, type BuiltUpSection,
} from './built-up-section';
import { canCompose, resolveProfile, type ResolvedProfile } from './profile-resolve';
import { familyToShape } from '../../data/steel-profiles';

/** What a role is made of. */
export interface ProfileSpec {
  /** Exact catalogue name, e.g. `IPE 160`, `L 75x75x6`. */
  profileName: string;
  arrangement: BuiltUpArrangement;
  /** Gap between the parts of a compound section, mm. */
  gapMm: number;
  /**
   * Section rotation about the member axis, degrees, or `'auto'`.
   *
   * `'auto'` defers to whatever roll the GENERATOR computed for each member — a purlin
   * laid on a pitched roof knows its own slope, and the emitter does not. A number
   * overrides that for every member of the role, which is what the "customise rotation"
   * switch does.
   */
  rotationDeg: number | 'auto';
}

export function defaultProfileSpec(profileName: string): ProfileSpec {
  return { profileName, arrangement: 'single', gapMm: 0, rotationDeg: 'auto' };
}

/** The material the generated members are made of. */
export interface GeneratorMaterial {
  name: string;
  /** MPa. */
  e: number;
  nu: number;
  /** kN/m³. */
  rho: number;
  /** MPa. */
  fy: number;
  /**
   * The catalogued grade this came from, when it came from one.
   *
   * Carried through unchanged. It is the field that will let a later pass tell steel from
   * concrete by a declared fact instead of by the `fy > 80` guess the audit found in four
   * separate places.
   */
  gradeId?: string;
}

/** A36 is not an Argentine grade and is a placeholder, stated as one. */
export const PLACEHOLDER_STEEL: GeneratorMaterial = Object.freeze({
  name: 'Acero A36',
  e: 200000,
  nu: 0.3,
  rho: 78.5,
  fy: 250,
});

export interface EmitOptions {
  /** Model name. */
  name: string;
  /** One spec per role the topology actually uses. A missing role is an error. */
  profiles: Partial<Record<MemberRole, ProfileSpec>>;
  material?: GeneratorMaterial;
}

export interface EmitProblem {
  role?: MemberRole;
  key: string;
  params?: Record<string, string | number>;
}

export interface GeneratedModel {
  json: JSONModel;
  counts: Record<MemberRole, number>;
  totalLengthM: number;
  slopePercent: number | null;
  /**
   * i18n keys for everything the generator assumed, topology and sections together.
   *
   * Deduplicated and ordered, because they are written onto the model's provenance and a
   * list that repeats "the web is pinned" once per member is a list nobody reads.
   */
  assumptions: string[];
  /** The composed section for each role, so the preview can show A, I and the gap. */
  sections: Partial<Record<MemberRole, BuiltUpSection>>;
}

/**
 * Which roles a topology needs a profile for.
 *
 * Derived from the members rather than from the kind, so a generator that stops placing
 * diagonals stops demanding a diagonal profile without anyone remembering to update a list.
 */
export function requiredRoles(t: Topology): MemberRole[] {
  return rolesPresent(tallyRoles(t.members));
}

/**
 * Everything wrong with a profile selection, all at once.
 *
 * Checked before emission so a dialog can disable Generate with the reasons visible,
 * rather than letting the user press it and receive a throw.
 */
export function validateProfiles(t: Topology, profiles: EmitOptions['profiles']): EmitProblem[] {
  const out: EmitProblem[] = [];
  for (const role of requiredRoles(t)) {
    const spec = profiles[role];
    if (!spec) {
      out.push({ role, key: 'generator.problem.profileMissing', params: { role } });
      continue;
    }
    const resolved = resolveProfile(spec.profileName);
    if (!resolved) {
      out.push({ role, key: 'generator.problem.profileUnknown', params: { name: spec.profileName } });
      continue;
    }
    const refusal = canCompose(resolved, spec.arrangement);
    if (refusal) out.push({ role, key: refusal.key, params: refusal.params });
    if (spec.gapMm < 0) {
      out.push({ role, key: 'generator.problem.negative', params: { role } });
    }
  }
  return out;
}

/**
 * Emit the model.
 *
 * Throws on an invalid selection for the same reason the topology generators do: every
 * caller has `validateProfiles`, and a model emitted from a profile that does not exist
 * would be a model with a section of zero area.
 */
export function emitModel(t: Topology, opts: EmitOptions): GeneratedModel {
  const problems = validateProfiles(t, opts.profiles);
  if (problems.length > 0) {
    throw new Error(`emitModel: invalid profile selection — ${problems.map((p) => `${p.role ?? '?'}:${p.key}`).join(', ')}`);
  }

  const material = opts.material ?? PLACEHOLDER_STEEL;
  const assumptions = new Set(t.assumptions);
  if (!material.gradeId) assumptions.add('generator.assume.placeholderGrade');

  // ── One section per role, in role order so the table reads top-down ──
  const roles = requiredRoles(t);
  const sectionIdOf = new Map<MemberRole, number>();
  const composed: Partial<Record<MemberRole, BuiltUpSection>> = {};
  const sections: JSONModel['sections'] = [];

  roles.forEach((role, index) => {
    const spec = opts.profiles[role]!;
    const resolved = resolveProfile(spec.profileName)!;
    const built = composeBuiltUp(resolved.profile, spec.arrangement, spec.gapMm / 1000);
    composed[role] = built;

    const id = index + 1;
    sectionIdOf.set(role, id);
    sections.push(sectionJson(id, built, resolved, spec));

    assumptions.add(torsionBasisKey(built.jBasis));
    if (resolved.basis === 'catalogueDeclared') assumptions.add('generator.assume.propertiesOnlyProfile');
    if (resolved.areaDeviation !== null && Math.abs(resolved.areaDeviation) > 0.005) {
      assumptions.add('generator.assume.nominalDimensionFamily');
    }
  });

  // ── Nodes, elements, supports ──
  const nodes: JSONModel['nodes'] = t.nodes.map((n, i) => ({ id: i + 1, x: n.x, y: n.y, z: n.z }));

  const elements: JSONModel['elements'] = t.members.map((m, i) => {
    const spec = opts.profiles[m.role]!;
    // ── One orientation mechanism, not two ──
    //
    // The solver composes them: `effectiveRoll = element.rollAngle + section.rotation`
    // (`solver-service.ts:1513`). Writing an explicit rotation to BOTH — which the first
    // version of this did — turned a requested 90° into 180° and looked right in every
    // symmetric case. So the generator writes orientation to the ELEMENT only and never
    // touches `Section.rotation`.
    //
    // The element is also the correct owner regardless: sections are shared per role, so a
    // rotation stored there would move every member using it the moment one is adjusted.
    //
    // A number applies to every member of the role; `'auto'` keeps whatever roll the
    // generator worked out for this particular member, and 0 where it worked out none.
    const roll = spec.rotationDeg === 'auto' ? (m.rollAngleDeg ?? 0) : spec.rotationDeg;
    return {
      id: i + 1,
      type: m.type,
      nodeI: m.a + 1,
      nodeJ: m.b + 1,
      materialId: 1,
      sectionId: sectionIdOf.get(m.role)!,
      ...(roll !== 0 ? { rollAngle: roll } : {}),
    };
  });

  const supports: JSONModel['supports'] = t.supports.map((s, i) => support(i + 1, s));

  const json: JSONModel = {
    name: opts.name,
    materials: [{
      id: 1,
      name: material.name,
      e: material.e,
      nu: material.nu,
      rho: material.rho,
      fy: material.fy,
      ...(material.gradeId ? { gradeId: material.gradeId } : {}),
    }],
    sections,
    nodes,
    elements,
    supports,
    loads: [],
    plates: [],
    quads: [],
    constraints: [],
    loadCases: [],
    combinations: [],
  };

  return {
    json,
    counts: t.counts,
    totalLengthM: t.totalLengthM,
    slopePercent: t.slopePercent,
    assumptions: [...assumptions].sort(),
    sections: composed,
  };
}

/**
 * One support, in the 3-D vocabulary, because a generated frame is a 3-D model even when
 * every node of it happens to lie in one plane.
 *
 * ── The roller had to be spelled out ───────────────────────────────
 *
 * The first version emitted `rollerXZ` for the sliding bearing, on the reading that a
 * "roller in XZ" is a bearing that rolls along the span. It is the opposite:
 * `solver-service.ts:1402` maps it to `{ rx: false, ry: true, rz: false }`, where those
 * flags mean RESTRAINED — so it is free in X **and in Z**. The generated truss was standing
 * on one pin and one bearing that did not hold it up at all, and the solver correctly
 * reported a mechanism.
 *
 * A truss bearing slides along the span and is held laterally and vertically. There is no
 * named type for that in 3-D — `rollerX` is right but lives in the 2-D vocabulary and is not
 * in `types3D` — so it is written out as `custom3d` with the DOF stated. Explicit is also
 * better here than a name that has to be looked up to be believed: the last one was.
 *
 * All three rotations stay free, which is what makes it a pin rather than a fixity.
 */
function support(id: number, s: GenSupport): JSONModel['supports'][number] {
  const nodeId = s.node + 1;
  if (s.type === 'fixed') return { id, nodeId, type: 'fixed3d' };
  if (s.type === 'pinned') return { id, nodeId, type: 'pinned3d' };
  return {
    id, nodeId, type: 'custom3d',
    dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false },
    dofFrame: 'global',
  };
}

/**
 * One section row.
 *
 * `shape` is set only for a SINGLE profile. A compound section is not an `I` or an `L` — it
 * is several of them at a spacing — and declaring the single-profile shape would let the
 * canonical resolver rebuild one profile's outline and overwrite the assembly's own
 * properties with it. Leaving it off keeps the declared A, Iy, Iz and J authoritative,
 * which is exactly what `resolveCanonicalSection` does for a section it cannot recognise.
 */
function sectionJson(
  id: number,
  built: BuiltUpSection,
  resolved: ResolvedProfile,
  spec: ProfileSpec,
): JSONModel['sections'][number] {
  const single = built.count === 1;
  return {
    id,
    name: built.name,
    a: built.a,
    iy: built.iy,
    iz: built.iz,
    ...(built.j !== null ? { j: built.j } : {}),
    b: built.b,
    h: built.h,
    /*
     * What the section is made of, declaratively.
     *
     * The 3-D viewport reads this to draw the REAL outline of the assembly. Without it a
     * generated section carried no `shape` either, and `createSectionShape`'s `default:`
     * branch says "Default to I-shape" — so a double-channel box chord and a back-to-back
     * angle post both rendered as a fabricated I-beam. Measured, before this field existed.
     *
     * Emitted for a single profile too, so nothing has to infer "one part" from an absence.
     */
    composition: {
      profileName: resolved.name,
      arrangement: spec.arrangement,
      gapMm: Math.max(0, spec.gapMm),
    },
    /*
     * `shape` ONLY for a single profile, and this is not a stylistic choice.
     *
     * `resolveCanonicalSection` switches on `shape`, and for a compound section that would
     * make it rebuild ONE part's outline from b/h/tw/tf, mark the section geometry-backed and
     * silently replace the assembly's composed A, Iy and Iz with a single profile's. The
     * solver would then analyse a double-channel member as one channel.
     *
     * Today an assembly also happens to lack `tw`/`tf`, so that branch would fall back to
     * properties-only anyway — but relying on a missing dimension to avoid a wrong answer is
     * accidental safety, and `emit.test.ts` pins the deliberate kind.
     */
    ...(single ? { shape: familyToShape(resolved.family) } : {}),
    // `profileFamily` is the field PR #132 adds to `Section`, recorded at selection time
    // rather than parsed back out of a name. Emitted now so a model generated today is
    // already answerable by that catalogue once it lands; until then it is an inert extra
    // property, which is what an unknown key on a section already is.
    ...(single ? { profileFamily: resolved.family } : {}),
    // Deliberately NO `rotation`: see the orientation note in `emitModel`.
  };
}
