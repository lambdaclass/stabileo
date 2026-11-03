<script lang="ts">
  import Hint from '../Hint.svelte';
  /**
   * Point masses for the dynamic analyses (`MassSource.points`): t at a node, horizontal only
   * when asked, and Izz about the vertical axis. A floor's mass goes on its diaphragm's master.
   * The engine takes them as nodal masses (`SolverInput3D.masses.nodal`), never as loads.
   */
  import { modelStore } from '../../../lib/store';
  import { t } from '../../../lib/i18n';
  import type { PointMass } from '../../../lib/engine/dynamics/mass-source';

  const points = $derived(modelStore.model.massSource?.points ?? []);
  let error = $state<string | null>(null);

  function save(list: PointMass[]) {
    const ms = modelStore.model.massSource;
    modelStore.setMassSource(ms ? { ...ms, points: list } : { kind: 'custom', factors: [], points: list });
  }
  const set = (i: number, patch: Partial<PointMass>) => save(points.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  function num(raw: string): number | null {
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) { error = t('pointMasses.badValue'); return null; }
    error = null;
    return v;
  }

  /** Diaphragm masters with no point mass yet: one horizontal-only row each. */
  const masters = $derived(
    [...new Set(modelStore.constraints.flatMap((c) => (c.type === 'diaphragm' ? [c.masterNode] : [])))]
      .filter((n) => !points.some((p) => p.nodeId === n)),
  );
  const firstNode = $derived(modelStore.nodes.keys().next().value ?? 1);
</script>

<div class="pm" data-testid="point-masses">
  <div class="pm-title">{t('pointMasses.title')}</div>
  {#if points.length}
    <table class="pm-table">
      <thead>
        <tr><th>{t('pointMasses.node')}</th><th>{t('pointMasses.mass')}</th><th>{t('pointMasses.izz')}</th><th>{t('pointMasses.horizontalOnly')}</th><th></th></tr>
      </thead>
      <tbody>
        {#each points as p, i (i)}
          <tr>
            <td><input type="number" class="pm-num" min="1" step="1" value={p.nodeId} data-testid="pm-node-{i}"
              onchange={(e) => { const v = Number(e.currentTarget.value); if (Number.isInteger(v) && modelStore.nodes.has(v)) { error = null; set(i, { nodeId: v }); } else error = t('pointMasses.badNode'); }} /></td>
            <td><input type="number" class="pm-num" min="0" step="0.1" value={p.m} data-testid="pm-m-{i}"
              onchange={(e) => { const v = num(e.currentTarget.value); if (v !== null) set(i, { m: v }); }} /></td>
            <td><input type="number" class="pm-num" min="0" step="1" value={p.izz ?? 0} data-testid="pm-izz-{i}"
              onchange={(e) => { const v = num(e.currentTarget.value); if (v !== null) set(i, { izz: v }); }} /></td>
            <td><input type="checkbox" checked={p.horizontalOnly === true} data-testid="pm-h-{i}"
              onchange={(e) => set(i, { horizontalOnly: e.currentTarget.checked })} /></td>
            <td><button class="pm-x" onclick={() => save(points.filter((_, k) => k !== i))} aria-label={t('loadTables.delete')}>×</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <div class="pm-row">
    <button class="pk-btn" onclick={() => save([...points, { nodeId: firstNode, m: 0 }])} data-testid="pm-add">+ {t('pointMasses.add')}</button>
    {#if masters.length}
      <button class="pk-btn" onclick={() => save([...points, ...masters.map((n) => ({ nodeId: n, m: 0, horizontalOnly: true, izz: 0 }))])} data-testid="pm-add-floors">
        + {t('pointMasses.addFloors')}
      </button>
    {/if}
  </div>
  {#if error}<div class="pm-error" role="alert">{error}</div>{/if}
  <Hint text={t('pointMasses.hint')} />
</div>

<style>
  .pm { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; font-size: 0.68rem; color: var(--st-text-2); }
  .pm-title { font-weight: 600; color: var(--st-text); }
  .pm-table { width: 100%; border-collapse: collapse; }
  .pm-table th { padding: 2px 4px; text-align: left; font-size: 0.6rem; font-weight: 600; color: var(--st-text-3); }
  .pm-table td { padding: 2px 4px; }
  .pm-num {
    width: 60px; padding: 2px 4px; font-size: 0.68rem; font-family: var(--st-mono); background: var(--st-surface);
    border: 1px solid var(--st-surface-3); border-radius: 3px; color: var(--st-text-2); text-align: right;
  }
  .pm-row { display: flex; flex-wrap: wrap; gap: 4px 8px; }
  .pm-x { background: none; border: none; color: var(--st-text-3); cursor: pointer; }
  .pm-error { font-size: 0.62rem; color: var(--st-danger); }
</style>
