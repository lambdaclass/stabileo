<script lang="ts">
  /**
   * While the plan view is on: which level is under the camera, a way to take another one (a
   * named level, or the cut moved by hand), and the way out. A state the reader lives in for a
   * while is said on the view itself, not only in the menu that set it.
   *
   * The plan's cut is its own (`uiStore.planCutZ`): the cut plane a person sets in the view menu
   * stays as it was (QA of 20-oct: «que esa sea una función independiente»).
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { tp, t } from '../../lib/i18n';

  const levels = $derived([...(modelStore.grid?.levels ?? [])].sort((a, b) => b.z - a.z));
  const current = $derived(levels.find((l) => Math.abs(l.z - uiStore.nodeCreateZ) < 1e-6));
  const level = $derived(current ? current.name : `+${uiStore.nodeCreateZ.toFixed(2)} m`);
  /** The cut's travel: from under the lowest node to over the highest. */
  const range = $derived.by(() => {
    let lo = Infinity, hi = -Infinity;
    for (const n of modelStore.nodes.values()) { const z = n.z ?? 0; if (z < lo) lo = z; if (z > hi) hi = z; }
    if (!Number.isFinite(lo)) return { lo: 0, hi: 3 };
    return { lo: Math.floor(lo * 10) / 10, hi: Math.ceil((hi + 0.5) * 10) / 10 };
  });
</script>

<div class="pv" role="status" data-testid="plan-view-chip">
  <span>{tp('viewport.planChip', { level })}</span>
  {#if levels.length}
    <select value={current?.id ?? ''} onchange={(e) => { const l = levels.find((x) => x.id === e.currentTarget.value); if (l) uiStore.setActiveLevel(l.z); }}
            aria-label={t('viewport.planLevel')} title={t('viewport.planLevel')} data-testid="plan-view-level">
      {#if !current}<option value="" disabled>{level}</option>{/if}
      {#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
    </select>
  {/if}
  <input type="range" min={range.lo} max={range.hi} step="0.05" value={uiStore.planCutZ ?? uiStore.nodeCreateZ}
         oninput={(e) => (uiStore.planCutZ = +e.currentTarget.value)}
         aria-label={t('viewport.planCut')} title={t('viewport.planCut')} data-testid="plan-view-cut" />
  <span class="pv-z">{tp('viewport.planCutAt', { z: (uiStore.planCutZ ?? uiStore.nodeCreateZ).toFixed(2) })}</span>
  <button onclick={() => (uiStore.planView3D = false)} aria-label={t('viewport.planExit')} title={t('viewport.planExit')} data-testid="plan-view-exit">×</button>
</div>

<style>
  .pv {
    position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 6;
    display: flex; align-items: center; gap: 6px; padding: 2px 4px 2px 10px;
    font-size: 0.72rem; color: var(--st-text);
    background: color-mix(in srgb, var(--st-surface) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--st-value) 45%, transparent); border-radius: var(--st-radius);
    max-width: calc(100% - 24px); flex-wrap: wrap;
  }
  select { font: inherit; font-size: 0.7rem; color: var(--st-text); background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; padding: 1px 4px; }
  input[type='range'] { width: 110px; accent-color: var(--st-accent); }
  .pv-z { color: var(--st-text-2); font-variant-numeric: tabular-nums; }
  button { border: none; background: none; color: var(--st-text-2); cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 2px 4px; }
  button:hover { color: var(--st-text); }
</style>
