/**
 * Which members of this model are metallic, and what the app is entitled to say about each.
 *
 * ── What this is for ───────────────────────────────────────────────
 *
 * Today the answer to "what steel is in my model?" is: nothing asks. The RC design table
 * lists every element, including the steel ones, and refuses them under
 * `DEMAND_UNAVAILABLE` — the same bucket as "you have not solved yet" — with the real
 * reason, `notConcrete`, third in a list. The CIRSOC 301 table in the verification tab
 * lists them under a green tick with no authority behind it. Neither is an inventory and
 * neither is honest.
 *
 * This is the inventory. It states what is metallic, why it thinks so, and what has and has
 * not been done to it. It computes no capacity and asserts no verification, because there
 * is no metallic authority in this app to do either.
 *
 * ── The census exists so an empty answer is still an answer ────────
 *
 * "No metallic members" and "this model has 400 members and none of them are metallic" and
 * "this model is entirely metallic but nothing has a strength recorded" are three different
 * situations, and a panel that renders the first for all three sends the user looking for a
 * bug. So the census counts every element by family, and the empty state reads off it.
 *
 * Pure: no store, no runes, no i18n.
 */

import { classifyElement } from '../codes/argentina/cirsoc201';
import {
  materialFamilyOf, type GradeFamilyLookup, type MaterialFamilyVerdict,
  type StructuralMaterialFamily,
} from './material-family';
import {
  assertSteelStateInvariants, type SteelMemberState, type SteelMemberStatus, type SteelReason,
} from './steel-status';

/**
 * `classifyElement` is imported from the CIRSOC 201 module on purpose.
 *
 * It is pure geometry — vertical span against horizontal, plus a section aspect ratio — and
 * it contains nothing about concrete. It is also THE classifier the rest of the app uses,
 * and a second implementation living here would be a second answer to "is this a column",
 * free to disagree with the first. Importing across the boundary is the lesser evil, and
 * the right fix is to move it somewhere neutral, which is not this branch's business.
 */

export interface InventoryModel {
  nodes: Map<number, { x: number; y: number; z?: number }>;
  elements: Map<number, {
    id: number; nodeI: number; nodeJ: number; sectionId: number; materialId: number;
  }>;
  sections: Map<number, { id: number; name: string; b?: number; h?: number }>;
  materials: Map<number, { id: number; name: string; fy?: number; gradeId?: string }>;
}

export interface SteelMemberEntry {
  elementId: number;
  /** Geometric classification, shared with the rest of the app. */
  memberKind: 'beam' | 'column' | 'wall';
  sectionName: string;
  materialName: string;
  lengthM: number;
  family: MaterialFamilyVerdict;
  state: SteelMemberState;
}

export interface FamilyCensus {
  total: number;
  byFamily: Record<StructuralMaterialFamily, number>;
}

export interface SteelInventory {
  /** Metallic members only, ordered by element id. */
  members: SteelMemberEntry[];
  census: FamilyCensus;
  /**
   * Why the member list is empty, when it is. Null when it is not.
   *
   * `noElements`       the model has no members at all
   * `noneMetallic`     it has members and none of them are metallic
   * `nonFerrousOnly`   its only metal is non-ferrous, which this surface does not cover
   * `allUnclassified`  it has members and none of them carry a strength to classify by
   */
  emptyReason: 'noElements' | 'noneMetallic' | 'nonFerrousOnly' | 'allUnclassified' | null;
  /** i18n keys the surface must show. Never silently dropped. */
  notices: string[];
  /** True when at least one member's family was guessed rather than declared. */
  anyInferred: boolean;
}

export interface InventoryOptions {
  /** Resolves PR #132's `Material.gradeId`. Absent on this branch; see `material-family`. */
  lookupGrade?: GradeFamilyLookup;
  /** Whether analysis results and combinations exist for these members. */
  hasDemands?: boolean;
  /**
   * Whether a USABLE metallic design authority is bound to the project.
   *
   * False in every configuration this app can currently reach. Threaded as a parameter
   * rather than hardcoded so the day one exists, this module reports it instead of being
   * rewritten — and so a test can prove that a bound authority still never yields a pass.
   */
  authorityBound?: boolean;
}

function emptyCensus(): FamilyCensus {
  return {
    total: 0,
    byFamily: { concrete: 0, steel: 0, timber: 0, masonry: 0, aluminium: 0, unknown: 0 },
  };
}

/** Build the inventory. Never throws; every element gets counted, metallic or not. */
export function buildSteelInventory(
  model: InventoryModel,
  opts: InventoryOptions = {},
): SteelInventory {
  const census = emptyCensus();
  const members: SteelMemberEntry[] = [];
  const notices = new Set<string>();
  let anyInferred = false;

  for (const [id, elem] of model.elements) {
    census.total += 1;
    const material = model.materials.get(elem.materialId);
    const verdict = materialFamilyOf(material, opts.lookupGrade);
    census.byFamily[verdict.family] += 1;

    if (verdict.family !== 'steel') continue;
    if (verdict.basis !== 'declaredGrade') {
      anyInferred = true;
      if (verdict.caveatKey) notices.add(verdict.caveatKey);
    }

    const nI = model.nodes.get(elem.nodeI);
    const nJ = model.nodes.get(elem.nodeJ);
    const section = model.sections.get(elem.sectionId);

    const lengthM = (nI && nJ)
      ? Math.hypot(nJ.x - nI.x, nJ.y - nI.y, (nJ.z ?? 0) - (nI.z ?? 0))
      : 0;

    const memberKind = (nI && nJ)
      ? classifyElement(nI.x, nI.y, nI.z ?? 0, nJ.x, nJ.y, nJ.z ?? 0, section?.b, section?.h)
      : 'beam';

    const state = stateFor(id, opts);
    assertSteelStateInvariants(state);

    members.push({
      elementId: id,
      memberKind,
      sectionName: section?.name ?? '—',
      materialName: material?.name ?? '—',
      lengthM,
      family: verdict,
      state,
    });
  }

  members.sort((a, b) => a.elementId - b.elementId);

  if (members.length > 0 && !opts.authorityBound) notices.add('steel.notice.noAuthorityBound');
  if (members.length > 0 && !opts.hasDemands) notices.add('steel.notice.noDemands');
  /*
   * Non-ferrous metal, said out loud rather than left to the census.
   *
   * The member list is ferrous by definition — `isSteel` is what admits a row — so an
   * aluminium member is absent from it. Before the grade catalogue was wired in that was
   * invisible, because the `fy > 80` inference could not tell aluminium from steel and filed
   * it under steel anyway. Now the declaration separates them, and separating without saying
   * so would remove members from a panel silently, which is the failure mode this whole file
   * was written against.
   */
  if (census.byFamily.aluminium > 0) notices.add('steel.notice.nonFerrousNotCovered');

  return {
    members,
    census,
    emptyReason: emptyReasonOf(census, members.length),
    notices: [...notices].sort(),
    anyInferred,
  };
}

/**
 * The state of one metallic member.
 *
 * Ordered so the most actionable reason wins: a user with no solve should be told to solve,
 * not told there is no design code — the second is true and permanent, the first is theirs
 * to fix now.
 */
function stateFor(elementId: number, opts: InventoryOptions): SteelMemberState {
  const reasons: SteelReason[] = [];
  let status: SteelMemberStatus;

  if (opts.hasDemands === false) {
    status = 'DEMAND_UNAVAILABLE';
    reasons.push({ key: 'steel.reason.noDemands', params: { elementId } });
  } else if (!opts.authorityBound) {
    status = 'NOT_DESIGNED';
    reasons.push({ key: 'steel.reason.noMetallicAuthority', params: { elementId } });
  } else {
    /**
     * An authority is bound and demands exist — and the member is STILL not designed.
     *
     * This branch is reachable only once something is bound, and binding does not by itself
     * make a design happen. Reporting `NOT_DESIGNED` here rather than assuming success is
     * the difference between a surface that reports state and one that reports intent.
     */
    status = 'NOT_DESIGNED';
    reasons.push({ key: 'steel.reason.designNotRun', params: { elementId } });
  }

  return { elementId, status, reasons };
}

function emptyReasonOf(census: FamilyCensus, metallic: number): SteelInventory['emptyReason'] {
  if (metallic > 0) return null;
  if (census.total === 0) return 'noElements';
  if (census.byFamily.unknown === census.total) return 'allUnclassified';
  /*
   * "No metallic members" is a lie about a model built out of aluminium.
   *
   * It is metal; it is simply not the metal this surface can speak about, and those are
   * different statements. The distinction only became reachable once the grade catalogue was
   * wired in, because until then an aluminium grade was read as steel by magnitude.
   */
  if (census.byFamily.aluminium > 0) return 'nonFerrousOnly';
  return 'noneMetallic';
}

/** Members grouped by their geometric kind, for the panel's summary line. */
export function countByKind(inv: SteelInventory): Record<'beam' | 'column' | 'wall', number> {
  const out = { beam: 0, column: 0, wall: 0 };
  for (const m of inv.members) out[m.memberKind] += 1;
  return out;
}

/** Total metallic member length, m — the one quantity an inventory can state honestly. */
export function totalSteelLength(inv: SteelInventory): number {
  return inv.members.reduce((s, m) => s + m.lengthM, 0);
}
