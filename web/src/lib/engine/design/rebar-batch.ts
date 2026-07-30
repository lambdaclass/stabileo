/**
 * Batch reinforcement editing: preview, compatibility, validation.
 *
 * Approved behaviour: a batch OVERWRITES the selected fields on every compatible
 * selected member. "Protect manual overrides" is opt-in. Incompatible members are
 * never silently skipped — they are listed with a reason and excluded from the count
 * on the Apply button.
 *
 * The preview is produced by verifying a CANDIDATE reinforcement object through the
 * authoritative verifier. The model is never mutated to compute a preview.
 *
 * Pure: no store access, no side effects.
 */

import type { ProvidedReinforcement, RebarLayer, StirrupDef } from '../../store/model.svelte';
import { resolveLayers, resolveColumnReinf } from '../station-design-forces';
import type { DesignCodeAdapter } from './code-adapter';
import type { MemberContext } from './member-context';
import { rebarHash } from './rebar-hash';
import { utilizationStatus, type LimitingConstraint } from './outcome';
import { maxBarsPerRow, BEAM_LIMITS } from './candidate-enumerate-beam';
import { COLUMN_LIMITS, maxTieSpacing } from './candidate-enumerate-column';
import { REBAR_DB } from '../codes/argentina/cirsoc201';

/** Fields a batch may set. Anything omitted is left untouched per member. */
export interface BatchPatch {
  // ── Beam longitudinal (per region) ──
  bottomSpan?: { count?: number; diameter?: number };
  topStart?: { count?: number; diameter?: number };
  topEnd?: { count?: number; diameter?: number };
  // ── Beam transverse (per region) ──
  stirrupsSupport?: Partial<StirrupDef>;
  stirrupsSpan?: Partial<StirrupDef>;
  // ── Column ──
  column?: { cornerDia?: number; faceDia?: number; perFace?: number };
  ties?: Partial<StirrupDef>;
}

export type BatchTargetKind = 'beam' | 'column';

export interface BatchBlock {
  reason: LimitingConstraint | 'incompatibleType' | 'noReinforcement' | 'invalidValue' | 'protectedOverride';
  /** i18n key + params for the preview row. */
  messageKey: string;
  params: Record<string, string | number>;
}

export interface BatchPreviewRow {
  elementId: number;
  kind: BatchTargetKind | 'other';
  /** True when this member will actually change. */
  willChange: boolean;
  /** Blocking problems — the member is excluded from Apply. */
  blocks: BatchBlock[];
  /** Human-readable before → after summary fragments. */
  changes: Array<{ field: string; before: string; after: string }>;
  utilizationBefore: number | null;
  utilizationAfter: number | null;
  statusBefore: 'ok' | 'warn' | 'fail' | 'none';
  statusAfter: 'ok' | 'warn' | 'fail' | 'none';
  /** The candidate that would be written (absent when blocked). */
  candidate?: ProvidedReinforcement;
  /** True when the member currently carries a user override. */
  hasManualOverride: boolean;
}

export interface BatchPlan {
  rows: BatchPreviewRow[];
  changeCount: number;
  unchangedCount: number;
  blockedCount: number;
  /** Distinct member kinds in the selection. */
  kinds: BatchTargetKind[];
  /** True when the selection mixes kinds (the patch applies to the compatible subset). */
  mixed: boolean;
  /** Members skipped because they carry a manual override and protection is on. */
  protectedCount: number;
  /** Rows omitted from `rows` because the preview cap was hit — never silent. */
  previewTruncated: boolean;
  previewShown: number;
  previewTotal: number;
}

/** Preview rows are capped; the count is always reported (no silent truncation). */
export const BATCH_PREVIEW_CAP = 50;
/** Above this many members the UI requires the count to be typed to confirm. */
export const BATCH_CONFIRM_THRESHOLD = 25;
/** Above this many members the UI adds a single-undo-step warning. */
export const BATCH_BULK_WARN_THRESHOLD = 200;

function areaOf(dia: number): number {
  return REBAR_DB.find(r => r.diameter === dia)?.area ?? 0;
}

function fmtLayers(layers: RebarLayer[]): string {
  if (layers.length === 0) return '—';
  return layers.map(l => `${l.count}Ø${l.diameter}`).join('+');
}
function fmtStir(s: StirrupDef | undefined): string {
  return s ? `eØ${s.diameter} ${s.legs}L c/${(s.spacing * 100).toFixed(0)}` : '—';
}

/** Rebuild a region's layers for a new (count, diameter), honouring bars-per-row. */
function layersFor(count: number, diameter: number, perRow: number): RebarLayer[] | null {
  if (count < BEAM_LIMITS.minBarsPerRow || perRow < BEAM_LIMITS.minBarsPerRow) return null;
  const rows = Math.ceil(count / perRow);
  if (rows > BEAM_LIMITS.maxRows) return null;
  const out: RebarLayer[] = [];
  let left = count;
  for (let r = 0; r < rows; r++) {
    const rowsLeft = rows - r;
    const take = Math.min(perRow, left - (rowsLeft - 1) * BEAM_LIMITS.minBarsPerRow);
    if (take < BEAM_LIMITS.minBarsPerRow) return null;
    out.push({ count: take, diameter, row: r });
    left -= take;
  }
  return left === 0 ? out : null;
}

/** True when the patch touches any beam-only field. */
export function patchTouchesBeam(p: BatchPatch): boolean {
  return !!(p.bottomSpan || p.topStart || p.topEnd || p.stirrupsSupport || p.stirrupsSpan);
}
/** True when the patch touches any column-only field. */
export function patchTouchesColumn(p: BatchPatch): boolean {
  return !!(p.column || p.ties);
}

/**
 * Apply a patch to one member's reinforcement, returning the candidate and any
 * blocking problems. Never mutates the input.
 */
export function applyPatch(
  ctx: MemberContext,
  current: ProvidedReinforcement | undefined,
  patch: BatchPatch,
): { candidate?: ProvidedReinforcement; blocks: BatchBlock[]; changes: BatchPreviewRow['changes'] } {
  const blocks: BatchBlock[] = [];
  const changes: BatchPreviewRow['changes'] = [];
  const isColumn = ctx.elementType === 'column';
  const isBeam = ctx.elementType === 'beam';

  if (isColumn && patchTouchesBeam(patch) && !patchTouchesColumn(patch)) {
    blocks.push({ reason: 'incompatibleType', messageKey: 'design.batch.beamFieldsOnColumn', params: { elementId: ctx.elementId } });
    return { blocks, changes };
  }
  if (isBeam && patchTouchesColumn(patch) && !patchTouchesBeam(patch)) {
    blocks.push({ reason: 'incompatibleType', messageKey: 'design.batch.columnFieldsOnBeam', params: { elementId: ctx.elementId } });
    return { blocks, changes };
  }
  if (!isBeam && !isColumn) {
    blocks.push({ reason: 'incompatibleType', messageKey: 'design.batch.unsupportedKind', params: { elementId: ctx.elementId } });
    return { blocks, changes };
  }

  const next: ProvidedReinforcement = JSON.parse(JSON.stringify(current ?? {}));

  if (isBeam) {
    next.regions = next.regions ?? {};
    const reg = next.regions;
    const { cover, stirrupDia } = ctx.material;
    const bWidth = ctx.axes.bFlex;

    const regionSpecs: Array<{
      key: 'bottomSpan' | 'topStart' | 'topEnd';
      layersKey: 'bottomSpanLayers' | 'topStartLayers' | 'topEndLayers';
      patch: { count?: number; diameter?: number } | undefined;
      label: string;
    }> = [
      { key: 'bottomSpan', layersKey: 'bottomSpanLayers', patch: patch.bottomSpan, label: 'bottom span' },
      { key: 'topStart', layersKey: 'topStartLayers', patch: patch.topStart, label: 'top start' },
      { key: 'topEnd', layersKey: 'topEndLayers', patch: patch.topEnd, label: 'top end' },
    ];

    for (const rs of regionSpecs) {
      if (!rs.patch) continue;
      const beforeLayers = resolveLayers(reg[rs.layersKey], reg[rs.key]);
      const beforeCount = beforeLayers.reduce((s, l) => s + l.count, 0);
      const beforeDia = beforeLayers[0]?.diameter ?? 16;
      const count = rs.patch.count ?? beforeCount;
      const diameter = rs.patch.diameter ?? beforeDia;
      if (count <= 0) {
        blocks.push({ reason: 'invalidValue', messageKey: 'design.batch.countTooLow', params: { field: rs.label, count } });
        continue;
      }
      const perRow = maxBarsPerRow(bWidth, cover, stirrupDia, diameter);
      const layers = layersFor(count, diameter, perRow);
      if (!layers) {
        blocks.push({
          reason: 'barFit', messageKey: 'design.batch.doesNotFit',
          params: { field: rs.label, count, dia: diameter, perRow, maxRows: BEAM_LIMITS.maxRows },
        });
        continue;
      }
      reg[rs.layersKey] = layers;
      reg[rs.key] = { count, diameter };
      // Keep the group form consistent with the flat layers so the two cannot diverge.
      const groupsKey = rs.key === 'bottomSpan' ? 'bottomGroups' : rs.key === 'topStart' ? 'topStartGroups' : 'topEndGroups';
      if (reg[groupsKey]) delete reg[groupsKey];
      if (beforeCount !== count || beforeDia !== diameter) {
        changes.push({ field: rs.label, before: fmtLayers(beforeLayers), after: fmtLayers(layers) });
      }
    }

    for (const sk of ['stirrupsSupport', 'stirrupsSpan'] as const) {
      const p = sk === 'stirrupsSupport' ? patch.stirrupsSupport : patch.stirrupsSpan;
      if (!p) continue;
      const before = reg[sk] ?? next.stirrups;
      const merged: StirrupDef = {
        diameter: p.diameter ?? before?.diameter ?? 8,
        legs: p.legs ?? before?.legs ?? 2,
        spacing: p.spacing ?? before?.spacing ?? 0.15,
      };
      if (merged.spacing < BEAM_LIMITS.minSpacing - 1e-9) {
        blocks.push({ reason: 'invalidValue', messageKey: 'design.batch.spacingTooSmall', params: { field: sk, spacing: merged.spacing } });
        continue;
      }
      if (merged.legs < 2) {
        blocks.push({ reason: 'invalidValue', messageKey: 'design.batch.legsTooFew', params: { field: sk, legs: merged.legs } });
        continue;
      }
      reg[sk] = merged;
      if (!before || before.diameter !== merged.diameter || before.legs !== merged.legs || Math.abs(before.spacing - merged.spacing) > 1e-9) {
        changes.push({ field: sk === 'stirrupsSupport' ? 'stirrups support' : 'stirrups span', before: fmtStir(before), after: fmtStir(merged) });
      }
    }
  }

  if (isColumn) {
    const { b, h } = ctx.section;
    const beforeCol = resolveColumnReinf(next.column, next.longitudinal);
    if (patch.column) {
      const cornerDia = patch.column.cornerDia ?? next.column?.cornerDia ?? beforeCol?.cornerDia ?? 16;
      const faceDia = patch.column.faceDia ?? next.column?.faceDia ?? cornerDia;
      const perFace = patch.column.perFace ?? next.column?.nBottom ?? 0;
      if (perFace < 0 || perFace > COLUMN_LIMITS.maxPerFace) {
        blocks.push({ reason: 'invalidValue', messageKey: 'design.batch.perFaceOutOfRange', params: { perFace, max: COLUMN_LIMITS.maxPerFace } });
      } else {
        const total = 4 + 4 * perFace;
        const area = 4 * areaOf(cornerDia) + 4 * perFace * areaOf(faceDia);
        const rho = area / (b * h * 1e4);
        if (rho < COLUMN_LIMITS.rhoMin - 1e-9) {
          blocks.push({ reason: 'minSteel', messageKey: 'design.batch.rhoBelowMin', params: { rho: +(rho * 100).toFixed(2), min: 1 } });
        } else if (rho > COLUMN_LIMITS.rhoMax + 1e-9) {
          blocks.push({ reason: 'maxSteel', messageKey: 'design.batch.rhoAboveMax', params: { rho: +(rho * 100).toFixed(2), max: 8 } });
        } else {
          const before = beforeCol ? `${beforeCol.totalCount}Ø${beforeCol.cornerDia}` : '—';
          next.column = { cornerDia, faceDia, nBottom: perFace, nTop: perFace, nLeft: perFace, nRight: perFace };
          next.longitudinal = { count: total, diameter: cornerDia };
          const after = `${total}Ø${cornerDia}`;
          if (before !== after) changes.push({ field: 'column bars', before, after });
        }
      }
    }
    if (patch.ties) {
      const before = next.stirrups;
      const merged: StirrupDef = {
        diameter: patch.ties.diameter ?? before?.diameter ?? 8,
        legs: patch.ties.legs ?? before?.legs ?? 2,
        spacing: patch.ties.spacing ?? before?.spacing ?? 0.15,
      };
      const cornerDia = next.column?.cornerDia ?? beforeCol?.cornerDia ?? 16;
      const sMax = maxTieSpacing(cornerDia, merged.diameter, b, h);
      if (merged.spacing < COLUMN_LIMITS.minSpacing - 1e-9) {
        blocks.push({ reason: 'invalidValue', messageKey: 'design.batch.spacingTooSmall', params: { field: 'ties', spacing: merged.spacing } });
      } else if (merged.spacing > sMax + 1e-9) {
        blocks.push({
          reason: 'tieSpacing', messageKey: 'design.batch.tieSpacingExceeded',
          params: { spacing: +(merged.spacing * 100).toFixed(0), max: +(sMax * 100).toFixed(0) },
        });
      } else {
        next.stirrups = merged;
        if (!before || fmtStir(before) !== fmtStir(merged)) {
          changes.push({ field: 'ties', before: fmtStir(before), after: fmtStir(merged) });
        }
      }
    }
  }

  if (blocks.length > 0) return { blocks, changes };
  return { candidate: next, blocks, changes };
}

export interface PlanOptions {
  /** Skip members carrying a manual override (opt-in protection). */
  protectManualOverrides?: boolean;
  /** Element ids the user has manually edited. */
  manualOverrides?: ReadonlySet<number>;
  previewCap?: number;
}

/**
 * Build the full batch plan for a selection. Every candidate is verified through the
 * adapter's authoritative verifier so the preview's before/after utilization is the
 * same number the table will show after Apply.
 */
export function planBatchEdit(
  adapter: DesignCodeAdapter,
  selection: Iterable<number>,
  contexts: Map<number, MemberContext>,
  currentReinf: (id: number) => ProvidedReinforcement | undefined,
  patch: BatchPatch,
  opts: PlanOptions = {},
): BatchPlan {
  const ids = [...new Set(selection)].sort((a, b) => a - b);
  const cap = opts.previewCap ?? BATCH_PREVIEW_CAP;
  const rows: BatchPreviewRow[] = [];
  const kinds = new Set<BatchTargetKind>();
  let changeCount = 0, unchangedCount = 0, blockedCount = 0, protectedCount = 0;

  for (const id of ids) {
    const ctx = contexts.get(id);
    const current = currentReinf(id);
    const hasManualOverride = opts.manualOverrides?.has(id) ?? false;
    const kind: BatchTargetKind | 'other' = ctx
      ? (ctx.elementType === 'column' ? 'column' : ctx.elementType === 'beam' ? 'beam' : 'other')
      : 'other';
    if (kind !== 'other') kinds.add(kind);

    if (!ctx) {
      blockedCount++;
      if (rows.length < cap) rows.push({
        elementId: id, kind, willChange: false,
        blocks: [{ reason: 'missingDemand', messageKey: 'design.batch.noContext', params: { elementId: id } }],
        changes: [], utilizationBefore: null, utilizationAfter: null,
        statusBefore: 'none', statusAfter: 'none', hasManualOverride,
      });
      continue;
    }

    if (opts.protectManualOverrides && hasManualOverride) {
      protectedCount++;
      if (rows.length < cap) rows.push({
        elementId: id, kind, willChange: false,
        blocks: [{ reason: 'protectedOverride', messageKey: 'design.batch.protectedOverride', params: { elementId: id } }],
        changes: [], utilizationBefore: null, utilizationAfter: null,
        statusBefore: 'none', statusAfter: 'none', hasManualOverride,
      });
      continue;
    }

    const before = current ? adapter.verify(ctx, current) : null;
    const { candidate, blocks, changes } = applyPatch(ctx, current, patch);

    if (!candidate) {
      blockedCount++;
      if (rows.length < cap) rows.push({
        elementId: id, kind, willChange: false, blocks, changes,
        utilizationBefore: before ? finiteOrNull(before.worstUtilization) : null,
        utilizationAfter: null,
        statusBefore: before?.overallStatus ?? 'none', statusAfter: 'none',
        hasManualOverride,
      });
      continue;
    }

    const unchanged = changes.length === 0
      || (current !== undefined && rebarHash(candidate) === rebarHash(current));
    const after = adapter.verify(ctx, candidate);
    if (unchanged) unchangedCount++; else changeCount++;

    if (rows.length < cap) rows.push({
      elementId: id, kind, willChange: !unchanged, blocks: [], changes,
      utilizationBefore: before ? finiteOrNull(before.worstUtilization) : null,
      utilizationAfter: finiteOrNull(after.worstUtilization),
      statusBefore: before?.overallStatus ?? 'none',
      statusAfter: after.overallStatus,
      candidate, hasManualOverride,
    });
  }

  return {
    rows, changeCount, unchangedCount, blockedCount, protectedCount,
    kinds: [...kinds].sort(),
    mixed: kinds.size > 1,
    previewTruncated: ids.length > cap,
    previewShown: rows.length,
    previewTotal: ids.length,
  };
}

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? +v.toFixed(3) : null;
}

/** Status label for a utilization under the approved convention. */
export function utilLabel(u: number | null): string {
  if (u === null) return '—';
  return `${u.toFixed(2)} ${utilizationStatus(u) === 'ok' ? '✓' : utilizationStatus(u) === 'warn' ? '⚠' : '✗'}`;
}
