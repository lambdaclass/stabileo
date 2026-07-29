/**
 * THE production adapter for slabs and walls: real model, real solver results, real design.
 *
 * ── What the forensic audit found ──────────────────────────────────
 *
 * `designSlabPanel`, `designWall`, `checkFooting` and `buildFloorAssembly` had **no caller
 * anywhere outside their own unit tests**. `floor-design.ts` imported the other three as
 * TYPES only. So roughly 1 550 lines of correct, clause-grounded engine were unreachable
 * from the product, and the branch's Playwright spec proved only that PR17's assembly UI
 * renders a JSON literal injected through a test hook.
 *
 * This module is the missing adapter. It is to slabs and walls what `run-detailing.ts` is
 * to beams and columns: model geometry and solver output in, `DetailingAssembly` out, with
 * every unsupported condition named rather than skipped.
 *
 * ── Where the demand comes from ────────────────────────────────────
 *
 * The solver already produces everything a slab needs. `QuadStress`/`PlateStress` carry
 * `mx`, `my` and `mxy` per shell element, and `mxy` is exactly what Wood-Armer folds in
 * rather than discarding. Nothing here asks for a solver change.
 *
 * A slab's one-way shear needs an area load, which the stresses do not carry. It is
 * integrated from the `surface3d` loads actually applied to that shell, factored by the
 * governing combination — a real free body, not a nominal figure. A panel carrying no
 * surface load reports that its shear check has no demand to check, instead of quietly
 * checking zero and passing.
 *
 * ── Panels are shell elements, and that is stated, not hidden ──────
 *
 * One shell element is designed as one panel. A meshed floor is therefore designed
 * element by element rather than as a continuous plate with a strip envelope across the
 * mesh. That is a real limitation with a real consequence — the moment used is the
 * element's own, so a finer mesh gives a less conservative peak — and it is reported as an
 * assumption on every panel rather than left for the reader to infer.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { ClauseRef, RegulationEdition } from '../../codes/regulation';
import type { Maturity } from '../../codes/maturity';
import { msg, type EngineMessage } from '../../codes/message';
import { designSlabPanel, type SlabDesignResult } from './slab-design';
import { designWall, type WallDesignResult } from './wall-design';
import {
  familyHash, familyRecordId,
  FAMILY_RECORD_SCHEMA_VERSION, recordStatusFor,
  type FamilyCheckOutcome, type FamilyRecordDraft, type FamilyRevisionVector,
  type FootingDesignRecord, type SlabDesignRecord, type WallDesignRecord,
} from './family-record';
import {
  buildFloorAssembly, type FloorAssemblyResult, type SlabPanelGeometry,
} from './floor-design';
import type { WallGeometry } from './floor-transverse';
import type { FootingAssemblyEntry } from './run-footing-design';
import type { DetailingAssembly } from './assembly';
import {
  RESIDUAL_TOL, checkSlabJointPunching, slabJointPosition,
  type AdjoiningShell, type SlabColumnJoint, type SlabPunchingResult,
} from './slab-punching';

// ─── What this adapter reads ─────────────────────────────────────

export interface FloorNode { x: number; y: number; z?: number }

export interface FloorShell {
  id: number;
  /** Three nodes for a plate, four for a quad. */
  nodes: readonly number[];
  materialId: number;
  thickness: number;
}

/** The membrane and bending fields the solver reports per shell element. */
export interface FloorShellStress {
  elementId: number;
  sigmaXx: number;
  sigmaYy: number;
  tauXy: number;
  mx: number;
  my: number;
  mxy: number;
}

export interface RunFloorDesignInput {
  nodes: ReadonlyMap<number, FloorNode>;
  /** Quads and plates alike — both are shells and both are designed here. */
  shells: readonly FloorShell[];
  /** Envelope shell stresses, one entry per element that has results. */
  stresses: readonly FloorShellStress[];
  /** Factored area load per shell, kPa, integrated from its `surface3d` loads. */
  factoredAreaLoad: ReadonlyMap<number, number>;
  /** Factored in-plane demands per wall shell, when the caller can supply them. */
  wallDemands?: ReadonlyMap<number, { pu: number; muInPlane: number; vuInPlane: number }>;
  fc: number;
  fy: number;
  cover: number;
  maxAggregateSizeMm: number;
  /** Distributed bar diameter for walls, mm. */
  wallBarDiameterMm: number;
  edition: RegulationEdition;
  verifierId: string;
  demandRevision: number;
  previousRevision?: number;
  seismicRequired: boolean;
  membersVerified: boolean;
  /** Assembly label, e.g. the level name. */
  label?: string;
  /**
   * Footings already checked by `runFootingDesign`, grouped by founding level.
   *
   * Passed in rather than designed here because a footing's demand is a support REACTION,
   * not a shell stress — a different input, a different level attribution and a different
   * gate. Grouping by level is what lets a footing join the assembly its column belongs to.
   */
  footingsByLevel?: ReadonlyMap<number, readonly FootingAssemblyEntry[]>;
  /**
   * Footing records that produced no steel, grouped by founding level.
   *
   * Their levels join the assembly set: a level whose only footing could not be checked still
   * needs an assembly, or the record — and the reason — reaches no document.
   */
  unverifiedFootingsByLevel?: ReadonlyMap<number,
    readonly FamilyRecordDraft<FootingDesignRecord>[]>;
  /**
   * The upstream revisions the shell records are stamped with. Same requirement, and same
   * reason, as `runFootingDesign`: a certificate that cannot go stale is not a certificate.
   */
  revisions: Omit<FamilyRevisionVector, 'entity'>;
  regulationIds: readonly string[];
  /**
   * Slab–column joints, keyed by node id, with the per-combination column forces at each.
   *
   * ── Why punching needs this ─────────────────────────────────────
   *
   * Because two-way shear is a property of a JOINT, not of a panel. A panel with no column
   * at any of its nodes has no punching to check, and reporting one as unverified there
   * would be a false limitation — it would make an ordinary beam-supported floor
   * permanently uncertifiable for a condition that does not arise in it.
   *
   * A panel that DOES support a column has a real punching check, and it is now RUN. The
   * demand is the step in column axial force across the joint per combination, which is why
   * this map carries forces and not only geometry: applicability alone is what it used to
   * carry, and a collector that stops at applicability produces a permanently unverified
   * check. `slab-punching.ts` owns the free body; this adapter owns the geometry around it.
   *
   * Absent — a caller with no solver results — every column-supported panel reports its
   * punching as unverified for want of forces, which is the honest outcome and not a claim.
   */
  slabColumns?: ReadonlyMap<number, SlabColumnJoint>;
  /**
   * True when the solved results on hand do not correspond to the model's own combinations.
   *
   * Passed in rather than inferred: the adapter sees stresses and forces, not the revision
   * graph. A punching check read from results that describe a different structure is a check
   * of a building that does not exist, so the joints report it as unverified.
   */
  analysisStale?: boolean;
}

export type ShellFamily = 'slab' | 'wall' | 'inclined' | 'degenerate';

export interface ShellClassification {
  elementId: number;
  family: ShellFamily;
  /** Unit normal of the shell's plane. */
  normal: { x: number; y: number; z: number };
  /** Level the shell is attributed to, m — its mean elevation. */
  level: number;
}

export interface RunFloorDesignResult {
  assemblies: DetailingAssembly[];
  slabs: SlabDesignResult[];
  walls: WallDesignResult[];
  classifications: ShellClassification[];
  /** Conditions that stopped a shell from being designed, each naming its element. */
  unsupported: Array<{ elementId: number; message: EngineMessage }>;
  trace: string[];
}

// ─── Geometry ────────────────────────────────────────────────────

/** Newell's method — a plane normal that is correct for a non-planar quad too. */
export function shellNormal(pts: readonly FloorNode[]): { x: number; y: number; z: number } {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const az = a.z ?? 0;
    const bz = b.z ?? 0;
    nx += (a.y - b.y) * (az + bz);
    ny += (az - bz) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  const L = Math.hypot(nx, ny, nz);
  return L < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: nx / L, y: ny / L, z: nz / L };
}

/**
 * Slab, wall, or neither.
 *
 * The bands are deliberately wide apart and the gap between them is NOT silently assigned:
 * a shell at 45° is neither a slab nor a wall, and designing it as either would apply the
 * wrong chapter. It becomes an explicit `inclined` outcome that the caller reports.
 */
export function classifyShell(
  elementId: number, pts: readonly FloorNode[],
): ShellClassification {
  const normal = shellNormal(pts);
  const level = pts.reduce((s, p) => s + (p.z ?? 0), 0) / Math.max(1, pts.length);
  const vertical = Math.abs(normal.z);
  const family: ShellFamily = Math.hypot(normal.x, normal.y, normal.z) < 0.5
    ? 'degenerate'
    : vertical >= 0.85 ? 'slab'
      : vertical <= 0.15 ? 'wall'
        : 'inclined';
  return { elementId, family, normal, level };
}

/** Plan bounding box of a shell, and whether it is an axis-aligned rectangle. */
export function planExtent(pts: readonly FloorNode[]): {
  x0: number; y0: number; lx: number; ly: number; axisAligned: boolean;
} {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const lx = Math.max(...xs) - x0;
  const ly = Math.max(...ys) - y0;
  // Every corner must sit on a corner of the bounding box, or the panel is not the
  // rectangle the slab generator lays bars across.
  const axisAligned = pts.every((p) =>
    (Math.abs(p.x - x0) < 1e-6 || Math.abs(p.x - (x0 + lx)) < 1e-6)
    && (Math.abs(p.y - y0) < 1e-6 || Math.abs(p.y - (y0 + ly)) < 1e-6));
  return { x0, y0, lx, ly, axisAligned };
}

/**
 * The average top-mat bar diameter, mm — the depth a punching crack forms at.
 *
 * Averaged over the two mat directions because they sit at different depths and the critical
 * perimeter is a single surface; the resulting effective depth is recorded as an assumption on
 * every punching result. Read from the layers the DESIGN chose rather than from a nominal
 * figure, so the perimeter depth and the placed steel cannot disagree. With no top mat the
 * bottom mat is used, and with no layers at all the caller's zero produces the
 * missing-geometry outcome rather than a fabricated depth.
 */
export function averageTopBarDiameter(design: SlabDesignResult): number {
  const top = design.layers.filter((l) => l.face === 'top');
  const use = top.length > 0 ? top : design.layers;
  if (use.length === 0) return 0;
  return use.reduce((s, l) => s + l.diameterMm, 0) / use.length;
}

/** How many of a shell's edges are shared with another shell or held by a support. */
export function supportedSideCount(
  shell: FloorShell, others: readonly FloorShell[],
): number {
  const edges = shell.nodes.map((n, i) => [n, shell.nodes[(i + 1) % shell.nodes.length]]);
  let n = 0;
  for (const [a, b] of edges) {
    const shared = others.some((o) => o.id !== shell.id
      && o.nodes.includes(a) && o.nodes.includes(b));
    if (shared) n++;
  }
  return n;
}

// ─── The run ─────────────────────────────────────────────────────

/**
 * Design every slab and wall in the model, then coordinate them into one assembly per level.
 *
 * Foundations are not produced here, and the reason is data rather than engineering: the
 * model carries no foundation entity — no plan dimensions, no thickness, no allowable
 * bearing pressure — so there is nothing for `checkFooting` to read. Inventing a footing
 * under every support would produce numbers with the appearance of a design and no basis.
 * The engine is complete and tested; what it needs is a modelled footing to be given.
 */
export function runFloorDesign(input: RunFloorDesignInput): RunFloorDesignResult {
  const trace: string[] = [];
  const unsupported: Array<{ elementId: number; message: EngineMessage }> = [];
  const classifications: ShellClassification[] = [];
  const slabs: SlabDesignResult[] = [];
  const walls: WallDesignResult[] = [];

  const stressOf = new Map(input.stresses.map((s) => [s.elementId, s]));
  const ptsOf = (shell: FloorShell): FloorNode[] | null => {
    const pts = shell.nodes.map((id) => input.nodes.get(id));
    return pts.every((p): p is FloorNode => p !== undefined) ? pts : null;
  };

  type SlabEntry = {
    geometry: SlabPanelGeometry; design: SlabDesignResult;
    record: FamilyRecordDraft<SlabDesignRecord>;
  };
  type WallEntry = {
    wallId: string; design: WallDesignResult; elementIds: number[];
    geometry: WallGeometry; barDiameterMm: number;
    record: FamilyRecordDraft<WallDesignRecord>;
  };
  const slabsByLevel = new Map<number, SlabEntry[]>();
  const wallsByLevel = new Map<number, WallEntry[]>();

  /** Levels are grouped to the millimetre so floating-point noise cannot split a floor. */
  const levelKey = (z: number) => Math.round(z * 1000) / 1000;

  /**
   * Every slab shell in the model, in plan, indexed by level — a PRE-pass.
   *
   * The punching position at a joint is a property of the whole floor, so it cannot be
   * answered from inside the loop that is still designing that floor one panel at a time.
   * This index is built first and read by `adjoiningSlabs`.
   *
   * Shells that will later be reported unsupported for their own reasons are INCLUDED here on
   * purpose: a panel too skewed to design is still slab material standing at the joint, and
   * omitting it would truncate a critical perimeter that is not truncated in the building.
   */
  const slabPlanByLevel = new Map<number, AdjoiningShell[]>();
  for (const shell of input.shells) {
    const pts = ptsOf(shell);
    if (!pts) continue;
    const cls = classifyShell(shell.id, pts);
    if (cls.family !== 'slab') continue;
    const key = levelKey(cls.level);
    const list = slabPlanByLevel.get(key) ?? [];
    list.push({ elementId: shell.id, nodeIds: shell.nodes, points: pts });
    slabPlanByLevel.set(key, list);
  }

  /** The slab shells at one level that meet a given node. */
  const adjoiningSlabs = (nodeId: number, level: number): AdjoiningShell[] =>
    (slabPlanByLevel.get(levelKey(level)) ?? [])
      .filter((s) => s.nodeIds.includes(nodeId))
      // Deterministic: the sector merge walks the caller's order.
      .sort((a, b) => a.elementId - b.elementId);

  for (const shell of input.shells) {
    const pts = ptsOf(shell);
    if (!pts) {
      unsupported.push({
        elementId: shell.id,
        message: msg('detailing.floorRun.missingNodes', { element: shell.id }),
      });
      continue;
    }
    const cls = classifyShell(shell.id, pts);
    classifications.push(cls);

    if (cls.family === 'degenerate' || cls.family === 'inclined') {
      unsupported.push({
        elementId: shell.id,
        message: msg(cls.family === 'inclined'
          ? 'detailing.floorRun.inclinedShell'
          : 'detailing.floorRun.degenerateShell',
        { element: shell.id, tilt: +(Math.acos(Math.min(1, Math.abs(cls.normal.z)))
          * 180 / Math.PI).toFixed(1) }),
      });
      continue;
    }

    const stress = stressOf.get(shell.id);
    if (!stress) {
      // No result for this element means no demand. Designing it anyway would produce a
      // panel reinforced for zero moment, which is worse than an absent panel.
      unsupported.push({
        elementId: shell.id,
        message: msg('detailing.floorRun.noSolverResult', { element: shell.id }),
      });
      continue;
    }

    if (cls.family === 'slab') {
      const ext = planExtent(pts);
      if (!ext.axisAligned || ext.lx <= 0 || ext.ly <= 0) {
        unsupported.push({
          elementId: shell.id,
          message: msg('detailing.floorRun.nonRectangularPanel', { element: shell.id }),
        });
        continue;
      }
      const qu = input.factoredAreaLoad.get(shell.id);
      if (qu === undefined) {
        unsupported.push({
          elementId: shell.id,
          message: msg('detailing.floorRun.noAreaLoad', { element: shell.id }),
        });
        continue;
      }
      const design = designSlabPanel({
        panelId: `P${shell.id}`,
        lx: ext.lx, ly: ext.ly,
        thickness: shell.thickness,
        cover: input.cover,
        supportedSides: Math.max(1, supportedSideCount(shell, input.shells)),
        fc: input.fc, fy: input.fy,
        maxAggregateSizeMm: input.maxAggregateSizeMm,
        edition: input.edition,
        moments: { mx: stress.mx, my: stress.my, mxy: stress.mxy },
        qu,
      });
      slabs.push(design);
      const key = levelKey(cls.level);
      const panelGeometry: SlabPanelGeometry = {
        panelId: `P${shell.id}`,
        origin: { x: ext.x0, y: ext.y0, z: cls.level },
        lx: ext.lx, ly: ext.ly,
        thickness: shell.thickness, cover: input.cover,
        elementIds: [shell.id],
      };
      /**
       * Punching, at every joint this panel supports — run, not deferred.
       *
       * The position is measured from the slab that meets each joint at THIS LEVEL, not from
       * the panel alone: the column sits at a node of this panel, so relative to one shell it
       * is always a corner, while relative to the floor it is usually interior. Classifying
       * from the panel would call every joint in a meshed flat plate a corner column and
       * apply α_s = 20 where 40 belongs.
       */
      const punchingResults = [...shell.nodes]
        .map((nodeId) => input.slabColumns?.get(nodeId))
        .filter((j): j is SlabColumnJoint => j !== undefined)
        // Node order, so the record is deterministic under any Map iteration order.
        .sort((a, b) => a.nodeId - b.nodeId)
        .map((joint) => checkSlabJointPunching({
          panelId: `P${shell.id}`,
          joint,
          position: slabJointPosition(joint.nodeId, adjoiningSlabs(joint.nodeId, cls.level)),
          thickness: shell.thickness,
          cover: input.cover,
          topBarDiameterMm: averageTopBarDiameter(design),
          fc: input.fc,
          qu,
          staleAnalysis: input.analysisStale === true,
        }));

      const entry: SlabEntry = {
        geometry: panelGeometry,
        design,
        record: slabRecord({
          shell, geometry: panelGeometry, design, stress, qu,
          supportedSides: Math.max(1, supportedSideCount(shell, input.shells)),
          punching: punchingResults,
          input,
        }),
      };
      const list = slabsByLevel.get(key);
      if (list) list.push(entry); else slabsByLevel.set(key, [entry]);
      continue;
    }

    // ── Wall ──
    const zs = pts.map((p) => p.z ?? 0);
    const height = Math.max(...zs) - Math.min(...zs);
    const baseZ = Math.min(...zs);
    const onBase = pts.filter((p) => Math.abs((p.z ?? 0) - baseZ) < 1e-6);
    if (height <= 0 || onBase.length < 2) {
      unsupported.push({
        elementId: shell.id,
        message: msg('detailing.floorRun.wallGeometryNotResolved', { element: shell.id }),
      });
      continue;
    }
    // The two base corners furthest apart define the wall's length and direction.
    let start = onBase[0];
    let end = onBase[0];
    let best = -1;
    for (const a of onBase) {
      for (const b of onBase) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > best) { best = d; start = a; end = b; }
      }
    }
    const length = best;
    if (!(length > 0)) {
      unsupported.push({
        elementId: shell.id,
        message: msg('detailing.floorRun.wallGeometryNotResolved', { element: shell.id }),
      });
      continue;
    }

    // In-plane demands, when the caller resolved them from the element forces. Absent
    // them the membrane stresses give the in-plane shear directly: τ_xy over the section.
    const supplied = input.wallDemands?.get(shell.id);
    const demands = supplied ?? {
      pu: Math.max(0, -stress.sigmaYy) * shell.thickness * length,
      muInPlane: 0,
      vuInPlane: Math.abs(stress.tauXy) * shell.thickness * length,
    };
    if (!supplied) {
      unsupported.push({
        elementId: shell.id,
        message: msg('detailing.floorRun.wallMomentFromMembraneOnly', { element: shell.id }),
      });
    }

    const design = designWall({
      wallId: `W${shell.id}`,
      length, height,
      thickness: shell.thickness,
      cover: input.cover,
      fc: input.fc, fy: input.fy,
      barDiameterMm: input.wallBarDiameterMm,
      edition: input.edition,
      pu: demands.pu, muInPlane: demands.muInPlane, vuInPlane: demands.vuInPlane,
      seismicRequired: input.seismicRequired,
    });
    walls.push(design);
    const key = levelKey(baseZ);
    const wallGeom: WallGeometry = {
      wallId: `W${shell.id}`,
      start: { x: start.x, y: start.y, z: baseZ },
      end: { x: end.x, y: end.y, z: baseZ },
      height, thickness: shell.thickness, cover: input.cover,
      elementIds: [shell.id],
    };
    const entry: WallEntry = {
      wallId: `W${shell.id}`, design, elementIds: [shell.id],
      geometry: wallGeom,
      barDiameterMm: input.wallBarDiameterMm,
      record: wallRecord({
        shell, geometry: wallGeom, design, stress, demands,
        fromMembraneOnly: !supplied, input,
      }),
    };
    const list = wallsByLevel.get(key);
    if (list) list.push(entry); else wallsByLevel.set(key, [entry]);
  }

  // One assembly per level, in ascending elevation so the output is deterministic.
  // Footing levels join the set: a footing at a level with no shell still needs an assembly,
  // or its bars would be checked, marked and then dropped before coordination.
  const footingsByLevel = input.footingsByLevel ?? new Map();
  const unverifiedFootings = input.unverifiedFootingsByLevel ?? new Map();
  const levels = [...new Set([
    ...slabsByLevel.keys(), ...wallsByLevel.keys(), ...footingsByLevel.keys(),
    ...unverifiedFootings.keys(),
  ])].sort((a, b) => a - b);
  const assemblies: DetailingAssembly[] = [];
  for (const level of levels) {
    const built: FloorAssemblyResult = buildFloorAssembly({
      assemblyId: `FLOOR-${level.toFixed(3)}`,
      label: input.label ?? `Nivel ${level.toFixed(2)} m`,
      edition: input.edition,
      verifierId: input.verifierId,
      demandRevision: input.demandRevision,
      previousRevision: input.previousRevision,
      maxAggregateSizeMm: input.maxAggregateSizeMm,
      slabs: slabsByLevel.get(level) ?? [],
      walls: wallsByLevel.get(level) ?? [],
      footings: [...(footingsByLevel.get(level) ?? [])],
      unverifiedRecords: [...(unverifiedFootings.get(level) ?? [])],
      membersVerified: input.membersVerified,
    });
    assemblies.push(built.assembly);
    trace.push(...built.trace);
  }

  trace.push(
    `Piso: ${slabs.length} losa(s), ${walls.length} tabique(s), ` +
    `${assemblies.length} conjunto(s) de nivel, ${unsupported.length} condición(es) no soportada(s).`);

  return { assemblies, slabs, walls, classifications, unsupported, trace };
}

// ─── Family records ──────────────────────────────────────────────

/**
 * What a shell record can and cannot say about the combination that governed it.
 *
 * `input.stresses` are the shell results of the LAST SOLVE, not per-combination output:
 * `resultsStore.results3D.quadStresses` is one field per element, and the app's
 * per-combination shell enrichment is not exposed element-by-element to this adapter. So a
 * shell record names NO governing combination, and says so, rather than naming the
 * combination that happened to govern a footing reaction at the same node — which would be a
 * plausible and wrong attribution.
 *
 * The consequence is stated on every shell record as an assumption, so a reader of the
 * certificate knows the demand is the solved state and not an enveloped design combination.
 */
const SHELL_DEMAND_NOT_PER_COMBINATION = msg('detailing.floorRun.shellDemandNotPerCombination');

/** Common record fields for a shell family — the two differ only in their evidence. */
function shellRecordCommon(args: {
  family: 'slab' | 'wall';
  ownerId: string;
  elementIds: number[];
  geometrySnapshot: unknown;
  /** Everything the design read, for the input hash. */
  demandSnapshot: unknown;
  results: unknown;
  checks: FamilyCheckOutcome[];
  assumptions: readonly EngineMessage[];
  unsupported: readonly EngineMessage[];
  refs: readonly ClauseRef[];
  maturity: Maturity;
  input: Pick<RunFloorDesignInput,
    'fc' | 'fy' | 'cover' | 'edition' | 'regulationIds' | 'revisions' | 'demandRevision'>;
  barDiameterMm: number | null;
} & { thickness: number }) {
  const materialHash = familyHash({
    fc: args.input.fc, fy: args.input.fy, cover: args.input.cover,
    thickness: args.thickness, barDiameterMm: args.barDiameterMm,
  });
  const geometryHash = familyHash(args.geometrySnapshot);
  return {
    schemaVersion: FAMILY_RECORD_SCHEMA_VERSION,
    recordId: familyRecordId(args.family, args.ownerId),
    family: args.family,
    ownerId: args.ownerId,
    ownerElementIds: [...args.elementIds],
    geometryHash,
    /**
     * A shell has no per-entity revision of its own — a panel is a solver element, not a
     * modelled entity like a footing — so `entity` carries the DEMAND revision. That is the
     * thing whose change must invalidate a panel's design, and using it here means a
     * re-solve stales the record exactly as a footing edit stales a footing's.
     */
    revisions: { ...args.input.revisions, entity: args.input.demandRevision },
    edition: args.input.edition,
    regulationIds: [...args.input.regulationIds],
    materialHash,
    inputHash: familyHash({
      geometry: args.geometrySnapshot, materialHash, demand: args.demandSnapshot,
      edition: args.input.edition,
      regulationIds: [...args.input.regulationIds].sort(),
    }),
    resultHash: familyHash(args.results),
    // Empty, and said out loud in `assumptions`: a shell demand is not attributed to a
    // named combination by this adapter. An invented name would be worse than none.
    governingCombinations: [] as string[],
    checks: args.checks,
    assumptions: [...args.assumptions, SHELL_DEMAND_NOT_PER_COMBINATION],
    unsupported: [...args.unsupported],
    refs: [...args.refs],
    maturity: args.maturity,
    status: recordStatusFor(args.checks, args.maturity),
  };
}

// ─── Rolling several joints up into one family check ─────────────

/**
 * The worst punching outcome across a panel's joints.
 *
 * FAIL outranks UNSUPPORTED outranks OK. A measured exceedance is a stronger statement than
 * an unmeasured joint, and both outrank a pass: a panel with one failing joint has a failing
 * punching check whatever its other joints did. Averaging or first-wins would certify a panel
 * nobody verified.
 */
export function worstPunchingStatus(
  results: readonly SlabPunchingResult[],
): 'OK' | 'FAIL' | 'UNSUPPORTED' {
  if (results.some((p) => p.status === 'FAIL')) return 'FAIL';
  if (results.some((p) => p.status === 'UNSUPPORTED')) return 'UNSUPPORTED';
  return 'OK';
}

/**
 * The largest utilisation across the joints that produced one, or null when none did.
 *
 * Null rather than 0: a zero would read as a joint that was checked and found unloaded, which
 * is a measurement, and an unverified joint made none.
 */
export function maxPunchingUtilization(
  results: readonly SlabPunchingResult[],
): number | null {
  const measured = results.filter((p) => p.status !== 'UNSUPPORTED');
  if (measured.length === 0) return null;
  return measured.reduce((m, p) => Math.max(m, p.utilization), 0);
}

/**
 * The combination governing the panel's punching — the one at the joint with the largest
 * utilisation, since that is the joint the family check reports.
 */
export function governingPunchingCombination(
  results: readonly SlabPunchingResult[],
): string | null {
  const measured = results.filter((p) => p.status !== 'UNSUPPORTED');
  if (measured.length === 0) return null;
  const worst = measured.reduce((m, p) => (
    p.utilization > m.utilization
      || (p.utilization === m.utilization && p.nodeId < m.nodeId) ? p : m),
  measured[0]);
  return worst.governingCombination;
}

/**
 * The slab panel's design evidence.
 *
 * Both the RAW plate moments and the Wood-Armer transform are recorded. Storing only the
 * transformed pair would make the transformation unauditable, and `mxy` is precisely the
 * field a naive slab design discards — a reviewer has to be able to see that it was folded
 * in rather than dropped.
 */
function slabRecord(args: {
  shell: FloorShell;
  geometry: SlabPanelGeometry;
  design: SlabDesignResult;
  stress: FloorShellStress;
  qu: number;
  supportedSides: number;
  /**
   * Punching at every joint this panel supports, already checked. Empty means the panel
   * supports no column and punching does not apply to it — a measurement, not a silence.
   */
  punching: readonly SlabPunchingResult[];
  input: RunFloorDesignInput;
}): FamilyRecordDraft<SlabDesignRecord> {
  const { design, stress, geometry } = args;
  const geometrySnapshot = {
    panelId: geometry.panelId,
    origin: { ...geometry.origin },
    lx: geometry.lx, ly: geometry.ly,
    thickness: geometry.thickness, cover: geometry.cover,
    supportedSides: args.supportedSides,
    behaviour: design.behaviour,
  };
  const demands: SlabDesignRecord['demands'] = [{
    // One shell element IS one panel in this adapter, so the region is the element. Stated
    // as a region rather than assumed to be the whole panel, because a meshed floor has many
    // and the record has to survive the day a strip envelope spans them.
    region: geometry.panelId,
    elementId: args.shell.id,
    mx: stress.mx, my: stress.my, mxy: stress.mxy,
    woodArmer: {
      mxBottom: design.design.bottomX,
      myBottom: design.design.bottomY,
      mxTop: design.design.topX,
      myTop: design.design.topY,
    },
    governingCombination: null,
    qu: args.qu,
  }];
  const reinforcement: SlabDesignRecord['reinforcement'] = design.layers.map((l) => ({
    face: l.face, direction: l.direction,
    diameterMm: l.diameterMm, spacing: l.spacing,
    // The engine works in m²/m; the record states mm²/m, which is what a schedule and a
    // drawing note both use. One conversion, here, rather than one per consumer.
    asProvided: l.asProvided * 1e6,
    asRequired: l.asRequired * 1e6,
    governedBy: l.minimumGoverns ? 'minimum' : 'flexure',
    barIds: [],
  }));
  const oneWayShear: SlabDesignRecord['oneWayShear'] = {
    status: design.shear.ok ? 'OK' : 'FAIL',
    // Per metre width, as the engine reports it: the panel's strip demand, not a total.
    Vu: design.shear.vu, phiVc: design.shear.phiVc,
    utilization: design.shear.utilization,
  };
  const unsupported = design.unsupported.map((u) =>
    msg('detailing.floorRun.slabUnsupported', { panel: geometry.panelId, reason: u }));
  const checks: FamilyCheckOutcome[] = [
    {
      key: 'flexure', status: 'OK', utilization: null,
      governingCombination: null, refs: design.refs, unsupported: [],
    },
    {
      key: 'oneWayShear', status: oneWayShear.status, utilization: oneWayShear.utilization,
      governingCombination: null, refs: design.shear.refs, unsupported: [],
    },
    /**
     * Punching, present ONLY when this panel supports a column.
     *
     * Two-way shear is a property of a joint. Emitting the check unconditionally would make
     * every beam-supported floor permanently uncertifiable for a condition that does not arise
     * in it; omitting it unconditionally would let a flat plate on columns certify with its
     * governing check unexamined. So applicability is measured from the columns at this
     * panel's own nodes — and where it applies the check is now RUN.
     *
     * ── One row for many joints, and how it is resolved ───────────────
     *
     * A panel can support several columns with different outcomes. The family check is the
     * WORST of them, because a panel with one failing joint has a failing punching check
     * whatever its other joints did, and because a certificate that averaged them would
     * certify a panel nobody verified. FAIL outranks UNSUPPORTED outranks OK: a measured
     * exceedance is a stronger statement than an unmeasured joint, and both outrank a pass.
     * The per-joint detail is in the record, which is where a reader goes for which joint.
     */
    ...(args.punching.length > 0
      ? [{
        key: 'punching',
        status: worstPunchingStatus(args.punching),
        // The largest utilisation across the joints that produced one. Null when none did,
        // rather than 0 — a zero would read as a joint checked and found unloaded.
        utilization: maxPunchingUtilization(args.punching),
        governingCombination: governingPunchingCombination(args.punching),
        refs: args.punching.flatMap((p) => p.refs),
        unsupported: args.punching.flatMap((p) => p.unsupported),
      } satisfies FamilyCheckOutcome]
      : []),
  ];
  /**
   * The per-joint punching evidence, one entry per column this panel supports.
   *
   * Copied from `checkSlabJointPunching`; nothing is recomputed here. A joint the collector
   * could not verify keeps zeroed forces with an UNSUPPORTED status and a named reason — the
   * same contract as before, except that it is now the exception rather than every joint.
   */
  const punching: SlabDesignRecord['punching'] = args.punching.map((p) => ({
    columnElementId: p.columnElementId,
    nodeId: p.nodeId,
    status: p.status,
    position: p.position,
    truncatedSides: p.truncatedSides,
    Vu: p.Vu, phiVc: p.phiVc, utilization: p.utilization,
    axialAbove: p.axialAbove, axialBelow: p.axialBelow,
    equilibriumResidual: p.equilibriumResidual,
    governingCombination: p.governingCombination,
    unsupported: p.unsupported,
    elementBelow: p.elementBelow,
    elementAbove: p.elementAbove,
    at: { ...p.at },
    coverageDeg: p.coverageDeg,
    openBearingDeg: p.openBearingDeg,
    perimeter: p.perimeter,
    contributions: p.contributions.map((c) => ({ ...c })),
    residualDenominator: p.contributions.find(
      (c) => c.combinationName === p.governingCombination)?.residualDenominator,
    residualThreshold: RESIDUAL_TOL,
    maturity: p.maturity,
    assumptions: p.assumptions,
    refs: p.refs,
  }));
  const results = { reinforcement, oneWayShear, punching };
  return {
    ...shellRecordCommon({
      family: 'slab',
      ownerId: geometry.panelId,
      elementIds: geometry.elementIds,
      geometrySnapshot,
      demandSnapshot: demands,
      results,
      checks,
      // The punching assumptions and refusals join the panel's own. The effective depth the
      // perimeter was cut at is an assumption of THIS PANEL's design, and a joint the
      // collector refused is a limitation of this panel — leaving either inside the punching
      // sub-object would keep it out of the report's assumptions block and off the drawing
      // notes, which is where a reader looks for it.
      assumptions: [
        ...design.maturity.assumptions,
        ...args.punching.flatMap((p) => p.assumptions),
      ],
      unsupported: [...unsupported, ...args.punching.flatMap((p) => p.unsupported)],
      refs: [...design.refs, ...args.punching.flatMap((p) => p.refs)],
      maturity: design.maturity.maturity,
      input: args.input,
      thickness: geometry.thickness,
      barDiameterMm: design.layers[0]?.diameterMm ?? null,
    }),
    family: 'slab',
    geometry: geometrySnapshot,
    demands,
    reinforcement,
    oneWayShear,
    punching,
  };
}

/** The wall's design evidence. */
function wallRecord(args: {
  shell: FloorShell;
  geometry: WallGeometry;
  design: WallDesignResult;
  stress: FloorShellStress;
  demands: { pu: number; muInPlane: number; vuInPlane: number };
  fromMembraneOnly: boolean;
  input: RunFloorDesignInput;
}): FamilyRecordDraft<WallDesignRecord> {
  const { design, geometry, stress } = args;
  const length = Math.hypot(geometry.end.x - geometry.start.x, geometry.end.y - geometry.start.y);
  const geometrySnapshot = {
    wallId: geometry.wallId,
    start: { ...geometry.start }, end: { ...geometry.end },
    length, height: geometry.height,
    thickness: geometry.thickness, cover: geometry.cover,
    // §11.7.2.3: two curtains once the wall passes 250 mm. Read off the thickness that was
    // designed, not off a flag a caller could set.
    twoCurtains: geometry.thickness > 0.25,
  };
  const demandSnapshot: WallDesignRecord['demands'] = [{
    elementId: args.shell.id,
    sigmaXx: stress.sigmaXx, sigmaYy: stress.sigmaYy, tauXy: stress.tauXy,
    pu: args.demands.pu, muInPlane: args.demands.muInPlane, vuInPlane: args.demands.vuInPlane,
    governingCombination: null,
    fromMembraneOnly: args.fromMembraneOnly,
  }];
  const axialFlexure: WallDesignRecord['axialFlexure'] = {
    status: design.axialFlexure.ok ? 'OK' : 'FAIL',
    pu: design.axialFlexure.pu,
    phiMn: design.axialFlexure.mn,
    utilization: design.axialFlexure.utilization,
  };
  const inPlaneShear: WallDesignRecord['inPlaneShear'] = {
    status: design.shear.ok ? 'OK' : 'FAIL',
    Vu: design.shear.vu, phiVn: design.shear.phiVn,
    utilization: design.shear.utilization,
    webCrushingLimit: design.shear.vnLimit,
    // §11.5.4.6: at the ceiling the wall fails by web crushing and horizontal steel does not
    // help. Recorded as its own flag so a report can say "add steel" or "thicken the wall"
    // rather than reporting a shortfall whose stated remedy would not work.
    webCrushingGoverns: design.shear.atLimit,
  };
  const reinforcement: WallDesignRecord['reinforcement'] = {
    verticalDiameterMm: args.input.wallBarDiameterMm,
    verticalSpacing: design.verticalSpacing,
    horizontalDiameterMm: args.input.wallBarDiameterMm,
    horizontalSpacing: design.horizontalSpacing,
    rhoVertical: design.ratios.rhoL,
    rhoHorizontal: design.ratios.rhoT,
    // These ratios come from §11.6.1's minimum table in every current path, so the record
    // states `minimum` rather than implying a demand-driven amount that was not computed.
    verticalGovernedBy: 'minimum',
    horizontalGovernedBy: 'minimum',
    curtains: geometrySnapshot.twoCurtains ? 2 : 1,
    barIds: [],
  };
  const unsupported = design.unsupported.map((u) =>
    msg('detailing.floorRun.wallUnsupported', { wall: geometry.wallId, reason: u }));
  const checks: FamilyCheckOutcome[] = [
    {
      key: 'axialFlexure', status: axialFlexure.status, utilization: axialFlexure.utilization,
      governingCombination: null, refs: design.axialFlexure.refs, unsupported: [],
    },
    {
      key: 'inPlaneShear', status: inPlaneShear.status, utilization: inPlaneShear.utilization,
      governingCombination: null, refs: design.shear.refs, unsupported: [],
    },
    {
      key: 'minimumReinforcement', status: 'OK', utilization: null,
      governingCombination: null, refs: design.ratios.refs, unsupported: [],
    },
    {
      key: 'thickness', status: design.thicknessOk ? 'OK' : 'FAIL', utilization: null,
      governingCombination: null, refs: [], unsupported: [],
    },
    /**
     * Boundary elements are 103-II territory and are NOT designed here.
     *
     * A non-seismic boundary element would look like a complete design and would not be one.
     * So the check is UNSUPPORTED whenever the project binds a seismic regulation — the case
     * where the question actually arises — and OK, with the trigger recorded as not fired,
     * when it does not.
     */
    {
      key: 'boundaryElement',
      status: args.input.seismicRequired ? 'UNSUPPORTED' : 'OK',
      utilization: null, governingCombination: null, refs: [],
      unsupported: args.input.seismicRequired
        ? [msg('detailing.floorRun.wallBoundaryNotImplemented', { wall: geometry.wallId })]
        : [],
    },
  ];
  const results = { axialFlexure, inPlaneShear, reinforcement };
  return {
    ...shellRecordCommon({
      family: 'wall',
      ownerId: geometry.wallId,
      elementIds: geometry.elementIds,
      geometrySnapshot,
      demandSnapshot,
      results,
      checks,
      assumptions: design.maturity.assumptions,
      unsupported,
      refs: design.refs,
      maturity: design.maturity.maturity,
      input: args.input,
      thickness: geometry.thickness,
      barDiameterMm: args.input.wallBarDiameterMm,
    }),
    family: 'wall',
    geometry: geometrySnapshot,
    demands: demandSnapshot,
    axialFlexure,
    inPlaneShear,
    reinforcement,
    boundaryElement: {
      required: args.input.seismicRequired,
      reason: msg(args.input.seismicRequired
        ? 'detailing.floorRun.wallBoundaryRequired'
        : 'detailing.floorRun.wallBoundaryNotTriggered', { wall: geometry.wallId }),
      // Null and REQUIRED is the honest pair: the trigger fired and the detailing does not
      // exist. Null with `required: false` says the question was asked and answered no.
      detailing: null,
    },
  };
}

/**
 * Can the floor workflow run at all, and if not, exactly why?
 *
 * Separate and cheap, like `detailingReadiness`, so a disabled command explains itself
 * instead of just being grey.
 */
export interface FloorDesignReadiness {
  ready: boolean;
  shellCount: number;
  withResults: number;
  reasons: EngineMessage[];
}

export function floorDesignReadiness(input: {
  shells: readonly { id: number }[];
  stresses: readonly { elementId: number }[];
  /**
   * Modelled footings.
   *
   * Readiness originally counted shells only, which disabled the command for a project that
   * has footings and no shells — a bare frame on pad footings, which is an ordinary thing to
   * design. Footings do not need a shell, and they carry their OWN per-footing gate: an
   * unsolved model produces "no reaction" against each footing, which is a specific and
   * readable answer, where a globally disabled button is not.
   */
  footings?: readonly { id: number }[];
}): FloorDesignReadiness {
  const reasons: EngineMessage[] = [];
  const withResults = input.stresses.length;
  const hasFootings = (input.footings?.length ?? 0) > 0;
  if (input.shells.length === 0 && !hasFootings) {
    reasons.push(msg('detailing.floorRun.noShells'));
  } else if (input.shells.length > 0 && withResults === 0 && !hasFootings) {
    reasons.push(msg('detailing.floorRun.notSolved'));
  }
  return {
    ready: reasons.length === 0,
    shellCount: input.shells.length,
    withResults,
    reasons,
  };
}
