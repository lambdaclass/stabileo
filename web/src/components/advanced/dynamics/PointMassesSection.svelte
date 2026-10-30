<script lang="ts">
  /**
   * Point masses at nodes for Basic's dynamic analysis, in the model's mass
   * source (the field PRO's point masses use too). Every change re-runs the
   * modal analysis on screen, so the frequencies always include the masses.
   */
  import CourseSection from './CourseSection.svelte';
  import { modelStore, uiStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import { numText } from '../../../lib/engine/steps/format';
  import type { PointMass } from '../../../lib/engine/dynamics/mass-source';

  let { onChange }: { onChange: () => void } = $props();

  const points = $derived(modelStore.model.massSource?.points ?? []);
  const total = $derived(points.reduce((s, p) => s + Math.max(0, p.m), 0));
  let error = $state<string | null>(null);
  const selected = $derived([...uiStore.selectedNodes].find((n) => modelStore.nodes.has(n)) ?? null);

  function save(list: PointMass[]) {
    const ms = modelStore.model.massSource;
    modelStore.setMassSource(ms ? { ...ms, points: list } : { kind: 'custom', factors: [], points: list });
    onChange();
  }
  const set = (i: number, patch: Partial<PointMass>) => save(points.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  function add(nodeId: number) {
    const at = points.findIndex((p) => p.nodeId === nodeId);
    if (at >= 0) return;
    error = null;
    save([...points, { nodeId, m: 1 }]);
  }
  const firstFree = $derived([...modelStore.nodes.keys()].find((n) => !points.some((p) => p.nodeId === n)) ?? null);
</script>

<CourseSection title={t('course.dynamics.ui.points.title')} testid="dyn-points"
  summary={points.length ? `${points.length} · ${numText(total)} t` : t('course.dynamics.ui.points.none')}
  help={t('course.dynamics.ui.points.help')}>
  {#if points.length}
    <table class="cf-table">
      <thead><tr><th>{t('course.dynamics.ui.points.node')}</th><th>m (t)</th><th title={t('course.dynamics.ui.points.hOnlyTitle')}>{t('course.dynamics.ui.points.hOnly')}</th><th></th></tr></thead>
      <tbody>
        {#each points as p, i (p.nodeId)}
          <tr>
            <td><input class="pm-in" type="number" min="1" step="1" value={p.nodeId} data-testid={`dyn-pm-node-${i}`}
              onchange={(e) => { const v = Number(e.currentTarget.value); if (Number.isInteger(v) && modelStore.nodes.has(v) && !points.some((q, k) => k !== i && q.nodeId === v)) { error = null; set(i, { nodeId: v }); } else error = t('course.dynamics.ui.points.badNode'); }} /></td>
            <td><input class="pm-in" type="number" min="0" step="0.1" value={p.m} data-testid={`dyn-pm-m-${i}`}
              onchange={(e) => { const v = Number(e.currentTarget.value.replace(',', '.')); if (Number.isFinite(v) && v >= 0) { error = null; set(i, { m: v }); } else error = t('course.dynamics.ui.points.badValue'); }} /></td>
            <td><input type="checkbox" checked={p.horizontalOnly === true} title={t('course.dynamics.ui.points.hOnlyTitle')} onchange={(e) => set(i, { horizontalOnly: e.currentTarget.checked })} /></td>
            <td><button class="pm-x" onclick={() => save(points.filter((_, k) => k !== i))} aria-label={t('course.dynamics.ui.points.remove')} title={t('course.dynamics.ui.points.remove')}>×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <div class="pm-row">
    {#if selected !== null && !points.some((p) => p.nodeId === selected)}
      <button class="cf-primary" onclick={() => add(selected)} data-testid="dyn-pm-add-selected">{t('course.dynamics.ui.points.addSelected')} ({selected})</button>
    {:else if firstFree !== null}
      <button class="pm-add" onclick={() => add(firstFree)} data-testid="dyn-pm-add">{t('course.dynamics.ui.points.add')}</button>
    {/if}
  </div>
  {#if error}<p class="cf-err" role="alert">{error}</p>{/if}
  <p class="cf-hint">{t('course.dynamics.ui.points.hint')}</p>
</CourseSection>

<style>
  .pm-in { width: 58px; padding: 2px 4px; font: inherit; font-size: 0.7rem; text-align: right; color: var(--st-text); background: var(--st-surface-3); border: 1px solid var(--st-hair); border-radius: 3px; }
  .pm-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; font-size: 0.9rem; padding: 0 4px; }
  .pm-x:hover { color: #e5484d; }
  .pm-row { display: flex; gap: 6px; }
  .pm-add { padding: 4px 10px; border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.7rem; background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); color: var(--st-text-2); }
</style>
