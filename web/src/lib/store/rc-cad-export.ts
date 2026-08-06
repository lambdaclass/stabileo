/**
 * The production action behind Foundations → *Export CAD handoff*.
 *
 * This is the adapter, and it is deliberately thin: it COLLECTS production values from the
 * stores and hands them to the pure producer. Every engineering decision lives in
 * `rc-cad-handoff.ts`; every number here is read, never computed.
 *
 * ── Prerequisites are checked before anything is written ────────
 *
 * A manifest that describes a cage the current model no longer produces is worse than no
 * manifest, because its revision stamps look authoritative. So the action refuses, with a
 * reason the UI shows verbatim, when:
 *
 *   * the footing has no detailing assembly — nothing has been generated;
 *   * the assembly's demand revision has moved — the bars were generated against demands that
 *     have since changed, and `isDemandStale` is the same test the review gate uses;
 *   * the producer itself refuses, because the data cannot determine the connection without
 *     inventing part of it.
 *
 * ── And validated before it is offered ──────────────────────────
 *
 * The produced document is run through BOTH validation layers before the download is offered.
 * A manifest that fails its own schema must never reach a consumer: the consumer would be
 * right to reject it and the user would have no way to know why.
 */

import { modelStore } from './model.svelte';
import { detailingStore } from './detailing.svelte';
import { verificationStore } from './verification.svelte';
import { regulationsStore } from './regulations.svelte';
import { downloadText } from './file';
import { isDemandStale, type DetailingAssembly } from '../engine/detailing/assembly';
import type { Footing } from '../model/footing';
import {
  buildRcCadHandoff, rcCadHandoffFilename, serializeRcCadHandoff,
  type CadSourceColumn, type CadTranslate, type RcCadHandoffRefusal,
} from '../export/rc-cad-handoff';
import { validateRcCadHandoff } from '../export/rc-cad-handoff-validate';
import {
  buildRcCadHandoffV2, rcCadHandoffV2Filename, serializeRcCadHandoffV2,
} from '../export/rc-cad-handoff-v2';
import { validateRcCadHandoffV2 } from '../export/rc-cad-handoff-v2-validate';
import type { RcCadHandoffV2 } from '../export/rc-cad-handoff-v2-types';
import type { RcCadHandoffSource } from '../export/rc-cad-handoff';
import type { CadNote, RcCadHandoffV1 } from '../export/rc-cad-handoff-types';

export interface RcCadExportSuccess {
  ok: true;
  handoff: RcCadHandoffV1;
  json: string;
  filename: string;
  byteLength: number;
}

export interface RcCadExportFailure {
  ok: false;
  refusals: RcCadHandoffRefusal[];
  /** Present when a document was produced but failed its own validation. */
  invalid?: { schema: string[]; semantic: string[] };
}

export type RcCadExportResult = RcCadExportSuccess | RcCadExportFailure;

export interface RcCadExportV2Success {
  ok: true;
  handoff: RcCadHandoffV2;
  json: string;
  filename: string;
  byteLength: number;
}

/**
 * The production result type.
 *
 * `RcCadExportResult` stays bound to V1 so the historical path keeps its exact type; a union of
 * the two documents would push a version check into every consumer of either.
 */
export type RcCadExportV2Result = RcCadExportV2Success | RcCadExportFailure;

const fail = (
  code: string, messageKey: string, params?: Record<string, unknown>,
): RcCadExportFailure => ({ ok: false, refusals: [{ code, messageKey, params }] });

/**
 * A fingerprint of the state every prerequisite refusal is computed against.
 *
 * A refusal describes ONE export attempt against ONE state. Held past the moment that state
 * changes it becomes a false statement: "generate foundation detailing first" stayed on screen
 * after the user had done exactly that, and only a successful export cleared it.
 *
 * The panel keeps this alongside the refusal and discards the refusal when the two stop
 * matching, which is why it lives here rather than in the component: the conditions above are
 * this module's, and a caller reimplementing them would drift the moment one is added. The
 * fields are precisely the ones the gates read — assembly presence and its revisions,
 * `demandRevision` for staleness, and the verifier identity — so a change to any of them
 * retires the refusal, while an unchanged state keeps it visible for as long as it is true.
 */
export function footingCadPrerequisiteStamp(footingId: number): string {
  const f = modelStore.model.footings.get(footingId);
  const assembly = f
    ? assemblyForFooting(f.id, modelStore.model.detailing?.assemblies ?? [])
    : undefined;
  return [
    f ? '1' : '0',
    assembly ? '1' : '0',
    assembly?.detailingRevision ?? -1,
    assembly?.demandRevision ?? -1,
    verificationStore.demandRevision,
    assembly?.provenance.verifierId ?? '',
  ].join('|');
}

/**
 * The assembly that carries this footing's transfer cage.
 *
 * Found through the footing's own FAMILY RECORD rather than by scanning bar ids: the record's
 * `ownerId` is the production identity of the footing in the assembly, so a second footing on
 * the same level cannot be picked up by accident.
 */
export function assemblyForFooting(
  footingId: number, assemblies: readonly DetailingAssembly[],
): DetailingAssembly | null {
  const ownerId = `F${footingId}`;
  return assemblies.find((a) => (a.families ?? []).some(
    (r) => r.family === 'footing' && r.ownerId === ownerId)) ?? null;
}

/** The column stub's source element, with the elevations that bound it. */
function collectColumn(f: Footing): CadSourceColumn | null {
  if (f.columnElementId === undefined) return null;
  const el = modelStore.model.elements.get(f.columnElementId);
  if (!el) return null;
  const sec = modelStore.model.sections.get(el.sectionId);
  // Exactly the guard `collectFootingColumns` applies: no plan dimensions, no footprint, and
  // no substitute for one.
  if (!sec?.b || !sec?.h) return null;
  const zI = modelStore.model.nodes.get(el.nodeI)?.z ?? 0;
  const zJ = modelStore.model.nodes.get(el.nodeJ)?.z ?? 0;
  return {
    elementId: el.id,
    b: sec.b,
    h: sec.h,
    ...(sec.name ? { sectionName: sec.name } : {}),
    baseZ: Math.min(zI, zJ),
    topZ: Math.max(zI, zJ),
  };
}

/** The concrete material reference, as an opaque string. Null is the ordinary case today. */
function concreteMaterialRef(f: Footing): string | null {
  if (f.concreteMaterialId === null) return null;
  const m = modelStore.model.materials.get(f.concreteMaterialId);
  return m ? `material:${m.id}` : null;
}

/** Production notes, rendered through the caller's translator, never re-worded here. */
function productionNotes(
  messages: ReadonlyArray<{ key: string; params?: Record<string, unknown> }>,
  translate: CadTranslate,
): CadNote[] {
  return messages.map((m) => ({
    messageKey: m.key,
    text: translate(m.key, m.params),
    ...(m.params ? { params: m.params } : {}),
  }));
}

/**
 * Produce the manifest for one footing, or say exactly why not.
 *
 * Nothing is written to disk here — the caller decides whether to offer the download, so a
 * test can assert on the bytes without a browser.
 */
/**
 * Everything both builders need, gathered once.
 *
 * Extracted when V2 arrived. The alternative was a second copy of ten prerequisite gates and the
 * source literal, and the gates are precisely the part that must not drift: a V2 export that
 * skipped the staleness check or the verifier check would publish exactly what V1 refuses to.
 */
function collectCadSource(
  footingId: number, translate: CadTranslate,
): { ok: true; source: RcCadHandoffSource } | RcCadExportFailure {
  const f = modelStore.model.footings.get(footingId);
  if (!f) return fail('FOOTING_NOT_FOUND', 'footing.cad.refusal.footingNotFound', { id: footingId });

  const node = modelStore.model.nodes.get(f.nodeId);
  if (!node) {
    return fail('NODE_NOT_FOUND', 'footing.cad.refusal.nodeNotFound',
      { footing: f.name, node: f.nodeId });
  }

  // Read from the PERSISTED store rather than the `$derived` view, for the reason
  // `generateFloors` documents at its own merge: a `$derived` does not recompute inside the
  // synchronous call that wrote it, and outside a reactive root it does not recompute at all.
  // Exporting straight after generating — which is the whole point of this action — would
  // otherwise read the assemblies as they were before the generation.
  const assembly = assemblyForFooting(f.id, modelStore.model.detailing?.assemblies ?? []);
  if (!assembly) {
    return fail('NO_ASSEMBLY', 'footing.cad.refusal.noAssembly', { footing: f.name });
  }

  const currentDemand = verificationStore.demandRevision;
  if (isDemandStale(assembly, currentDemand)) {
    return fail('STALE_ASSEMBLY', 'footing.cad.refusal.stale', {
      footing: f.name, generated: assembly.demandRevision, current: currentDemand,
    });
  }

  // A certificate that names no verifier is not a weaker certificate, it is an unsigned one.
  // Exporting it would publish `certificate.verifierId: ""` inside a document whose revision
  // stamps read as authoritative — a consumer has no way to tell that from a verifier whose
  // identity simply failed to serialise. `resolveVerifierId` withholds the identity whenever
  // no design run issued one, or the bound regulation no longer matches the one that did, so
  // an empty value here means exactly that and is refused rather than shipped.
  if (!assembly.provenance.verifierId) {
    return fail('NO_VERIFIER', 'footing.cad.refusal.noVerifier', { footing: f.name });
  }

  const certificate = (assembly.familyCertificates ?? []).find(
    (c) => c.family === 'footing' && c.ownerId === `F${f.id}`);
  const record = (assembly.families ?? []).find(
    (r) => r.family === 'footing' && r.ownerId === `F${f.id}`);
  const aggregate = detailingStore.aggregate;

  const source: RcCadHandoffSource = {
    footing: f,
    node: { x: node.x, y: node.y, ...(node.z !== undefined ? { z: node.z } : {}) },
    column: collectColumn(f),
    assembly,
    // The edition the assembly was BUILT with, not the one currently bound: a regulation
    // change after generation makes the assembly stale rather than retroactively re-editioned.
    edition: assembly.provenance.edition,
    maxAggregateSizeMm: aggregate.maxAggregateSizeMm,
    aggregateAssumed: aggregate.assumed,
    revisions: {
      detailing: assembly.detailingRevision,
      demand: assembly.demandRevision,
      analysis: regulationsStore.revisions.analysis,
      loads: regulationsStore.revisions.combination,
      regulation: regulationsStore.revisions.regulationConfig,
    },
    certificate: {
      maturity: certificate?.maturity ?? assembly.maturity,
      reviewState: assembly.state,
      verifierId: assembly.provenance.verifierId,
      // The regulation IDENTITY, from the footing's own design record. `certificate.edition` is
      // the edition and belongs in `codeEdition`; putting it in both would state the edition
      // twice and the code not at all.
      ...(record?.regulationIds?.[0] ? { codeId: record.regulationIds[0] } : {}),
      codeEdition: assembly.provenance.edition,
    },
    concreteMaterialRef: concreteMaterialRef(f),
    ...(modelStore.model.name ? { project: { name: modelStore.model.name } } : {}),
    productionAssumptions: productionNotes(assembly.provenance.assumptions ?? [], translate),
    productionUnsupported: (assembly.unsupported ?? [])
      .filter((u) => (u.scope.elementIds ?? []).includes(f.columnElementId ?? -1)
        || (u.scope.elementIds ?? []).length === 0)
      .map((u) => ({ messageKey: u.key, text: u.message })),
  };
  return { ok: true, source };
}

/** A validation failure, shaped the same way for either version. */
const invalidManifest = (
  schema: Array<{ path: string; message: string }>,
  semantic: Array<{ rule: string; message: string }>,
): RcCadExportFailure => ({
  ok: false,
  refusals: [{ code: 'INVALID_MANIFEST', messageKey: 'footing.cad.refusal.invalid', params: {
    schema: schema.length, semantic: semantic.length,
  } }],
  invalid: {
    schema: schema.map((v) => `${v.path}: ${v.message}`),
    semantic: semantic.map((v) => `${v.rule}: ${v.message}`),
  },
});

/**
 * Build a V1 document. HISTORICAL path.
 *
 * Retained so V1 stays buildable and its refusals stay reachable, not because production uses it:
 * V1 declares two families and the live chain now produces five, so this refuses live input rather
 * than describing mat bars as column dowels. `buildFootingCadHandoffV2` is the production builder.
 */
export function buildFootingCadHandoff(
  footingId: number, translate: CadTranslate,
): RcCadExportResult {
  const collected = collectCadSource(footingId, translate);
  if (!collected.ok) return collected;

  const result = buildRcCadHandoff(collected.source, translate);
  if (!result.ok) return { ok: false, refusals: result.refusals };

  const validation = validateRcCadHandoff(result.handoff);
  if (!validation.ok) return invalidManifest(validation.schema, validation.semantic);

  const json = serializeRcCadHandoff(result.handoff);
  return {
    ok: true,
    handoff: result.handoff,
    json,
    filename: rcCadHandoffFilename(result.handoff),
    // Bytes, not characters: the manifest is ASCII today but a footing named in Spanish is one
    // rename away from not being, and the reported size must match the file.
    byteLength: new TextEncoder().encode(json).length,
  };
}

/** Build the V2 document. The production path. */
export function buildFootingCadHandoffV2(
  footingId: number, translate: CadTranslate,
): RcCadExportV2Result {
  const collected = collectCadSource(footingId, translate);
  if (!collected.ok) return collected;

  const result = buildRcCadHandoffV2(collected.source, translate);
  if (!result.ok) return { ok: false, refusals: result.refusals };

  const validation = validateRcCadHandoffV2(result.handoff);
  if (!validation.ok) return invalidManifest(validation.schema, validation.semantic);

  const json = serializeRcCadHandoffV2(result.handoff);
  return {
    ok: true,
    handoff: result.handoff,
    json,
    filename: rcCadHandoffV2Filename(result.handoff),
    byteLength: new TextEncoder().encode(json).length,
  };
}

/**
 * Produce and download. Returns the same result so the UI can report the outcome either way.
 *
 * Emits V2. The live chain produces the coordinated assembly — mats, dowels, ties and crossties —
 * and V1 cannot describe it; a footing whose bottom mat is physical steel is a V2 subject.
 */
export function exportFootingCadHandoff(
  footingId: number, translate: CadTranslate,
): RcCadExportV2Result {
  const result = buildFootingCadHandoffV2(footingId, translate);
  if (result.ok) downloadText(result.json, result.filename, 'application/json');
  return result;
}
