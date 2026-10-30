/**
 * The influence-line tool: what a click on the structure computes, moving the section, changing
 * the quantity or the unit load's direction with a line on screen.
 */
import { modelStore, resultsStore, uiStore } from '../store';
import type { InfluenceDirection, InfluenceLineResult, InfluenceQuantity } from '../store/model.svelte';
import { influenceTool } from '../store/influence-tool.svelte';
import { familyOf } from '../engine/influence/quantities';
import { sectionAt } from '../engine/influence/section-pick';
import { t } from '../i18n';
import { explainedSteps } from '../store/explained-steps.svelte';
import { setInfluenceDocInput } from '../engine/steps/methods/influence';
import { targetOf } from '../engine/influence/analysis';
import { defaultLoadedMembers } from '../engine/influence/areas';
import { unitInputOf, UNIT_LOAD_DIR } from '../engine/influence-service';
import type { SolverInput } from '../engine/types';

const flat = (r: InfluenceLineResult) => r.points.every((p) => Math.abs(p.value) < 1e-12);

/**
 * Compute and show a line. Zero wherever the unit load stands (a load down a column puts no
 * shear or moment in it) tries the other direction before saying there is no line.
 */
export function runInfluence(q: InfluenceQuantity, node: number | undefined, elem: number | undefined, at: number, quiet = false): boolean {
  const run = (dir: InfluenceDirection) => modelStore.computeInfluenceLine(q, node, elem, at, 20, dir);
  const result = run(uiStore.ilDirection);
  influenceTool.envelope = null;
  if (typeof result === 'string') {
    uiStore.toast(result, 'error');
    return false;
  }
  uiStore.ilQuantity = q;
  if (flat(result) && familyOf(q) !== 'displacement') {
    const other: InfluenceDirection = uiStore.ilDirection === 'vertical' ? 'horizontal' : 'vertical';
    const alt = run(other);
    if (typeof alt !== 'string' && !flat(alt)) {
      uiStore.ilDirection = other;
      resultsStore.setInfluenceLine(alt);
      uiStore.toast(t(other === 'horizontal' ? 'viewport.ilSwitchedHorizontal' : 'viewport.ilSwitchedVertical').replace('{q}', q), 'info');
      return true;
    }
    resultsStore.setInfluenceLine(result);
    uiStore.toast(t('viewport.ilAllZero').replace('{q}', q), 'info');
    return true;
  }
  resultsStore.setInfluenceLine(result);
  if (!quiet) uiStore.toast(t('viewport.ilCalculated'), 'success');
  return true;
}

/**
 * A click with the tool armed: a node for a reaction, a member for an internal force (the section
 * where the click falls on it), either for a displacement. `tol` snaps the section to an end or
 * the midpoint.
 */
export function pickInfluenceTarget(world: { x: number; y: number }, nodeId: number | undefined, elemId: number | undefined, tol: number): void {
  const q = uiStore.ilQuantity;
  const family = familyOf(q);
  const sectionOn = (id: number) => {
    const e = modelStore.elements.get(id);
    const ni = e && modelStore.nodes.get(e.nodeI), nj = e && modelStore.nodes.get(e.nodeJ);
    return ni && nj ? sectionAt(world, ni, nj, tol) : 0.5;
  };
  if (family === 'reaction' && nodeId !== undefined) runInfluence(q, nodeId, undefined, 0.5);
  else if (family === 'force' && elemId !== undefined) runInfluence(q, undefined, elemId, sectionOn(elemId));
  else if (family === 'displacement' && nodeId !== undefined) runInfluence(q, nodeId, undefined, 0.5);
  else if (family === 'displacement' && elemId !== undefined) runInfluence(q, undefined, elemId, sectionOn(elemId));
  else if (nodeId !== undefined) runInfluence('Rz', nodeId, undefined, 0.5);
  else if (elemId !== undefined) runInfluence('M', undefined, elemId, sectionOn(elemId));
  else uiStore.toast(t('viewport.ilClickHint'), 'info');
}

/** The section moved along its member, `at` ∈ [0, 1]. */
export function moveInfluenceSection(elementId: number, at: number): void {
  const il = resultsStore.influenceLine;
  if (!il) return;
  runInfluence(il.quantity, undefined, elementId, at, true);
}

/** A quantity chosen with a line on screen: the line follows when its target can carry it. */
export function setInfluenceQuantity(q: InfluenceQuantity): void {
  uiStore.ilQuantity = q;
  const il = resultsStore.influenceLine;
  if (!il || il.quantity === q) return;
  const family = familyOf(q);
  if (family === 'reaction' && il.targetNodeId !== undefined) runInfluence(q, il.targetNodeId, undefined, 0.5, true);
  else if (family !== 'reaction' && il.targetElementId !== undefined) runInfluence(q, undefined, il.targetElementId, il.targetPosition ?? 0.5, true);
  else if (family === 'displacement' && il.targetNodeId !== undefined) runInfluence(q, il.targetNodeId, undefined, 0.5, true);
}

/**
 * The influence line's unit-load direction, from either options bar. A line on screen is computed
 * again for the same target in the new direction, so the toggle shows its effect at once.
 */
export function setInfluenceDirection(dir: InfluenceDirection): void {
  if (uiStore.ilDirection === dir) return;
  uiStore.ilDirection = dir;
  influenceTool.envelope = null;
  const il = resultsStore.influenceLine;
  if (!il) return;
  const r = modelStore.computeInfluenceLine(il.quantity, il.targetNodeId, il.targetElementId, il.targetPosition ?? 0.5, 20, dir);
  if (typeof r === 'string') { uiStore.toast(r, 'error'); return; }
  resultsStore.setInfluenceLine(r);
  if (r.points.every((p) => Math.abs(p.value) < 1e-9)) uiStore.toast(t('viewport.ilZeroThisWay').replace('{q}', r.quantity), 'info');
}

/** The line on screen explained step by step, with the loads typed in the tool and the members it loads. */
export function openInfluenceExplanation(loadedIds: number[]): void {
  const il = resultsStore.influenceLine;
  setInfluenceDocInput(il ? {
    quantity: il.quantity, target: targetOf(il), direction: il.direction ?? 'vertical',
    loads: influenceTool.loads, placement: influenceTool.placement, loadedIds,
  } : null);
  explainedSteps.openMethod('influenceLine', 'tool');
}

/** The model's structure with nothing on it, as the line is solved on, or null when it cannot be. */
export function currentUnitInput(): SolverInput | null {
  const m = modelStore.model;
  const u = unitInputOf({ nodes: m.nodes, elements: m.elements, supports: m.supports, loads: m.loads, materials: m.materials, sections: m.sections, analysis: m.analysis, groups: m.groups } as never);
  return typeof u === 'string' ? null : u;
}

/** The members the line's loads act on: the selected ones, else every member across the unit load. */
export function loadedMembers(unit: SolverInput, dir: InfluenceDirection): number[] {
  const selected = [...uiStore.selectedElements].filter((id) => unit.elements.has(id));
  return selected.length ? selected : defaultLoadedMembers(unit, UNIT_LOAD_DIR[dir]);
}
