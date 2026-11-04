/**
 * The influence line's unit-load direction, from either options bar. A line on screen is computed
 * again for the same target in the new direction, so the toggle shows its effect at once.
 */
import { modelStore, resultsStore, uiStore } from '../store';
import type { InfluenceDirection } from '../store/model.svelte';
import { t } from '../i18n';

export function setInfluenceDirection(dir: InfluenceDirection): void {
  if (uiStore.ilDirection === dir) return;
  uiStore.ilDirection = dir;
  const il = resultsStore.influenceLine;
  if (!il) return;
  const r = modelStore.computeInfluenceLine(il.quantity, il.targetNodeId, il.targetElementId, il.targetPosition ?? 0.5, 20, dir);
  if (typeof r === 'string') { uiStore.toast(r, 'error'); return; }
  resultsStore.setInfluenceLine(r);
  if (r.points.every((p) => Math.abs(p.value) < 1e-9)) uiStore.toast(t('viewport.ilZeroThisWay').replace('{q}', r.quantity), 'info');
}
