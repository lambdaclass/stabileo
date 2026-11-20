<script lang="ts">
  import Hint from './Hint.svelte';
  /**
   * The concrete of each kind of element, every kind at once, on every level or one. It changes the
   * analysis model (the members' material), so it stays available with design off and, once
   * assigned, asks for the model to be solved again.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { DESIGN_KINDS, type DesignKind } from '../../lib/model/design-data';
  import { assignConcrete } from '../../lib/model/building/assign-concrete';
  import { materialFamilyOf } from '../../lib/engine/steel/material-family';
  import { catalogueGradeFamily } from '../../lib/engine/steel/grade-family';
  import { runGlobalSolve } from '../../lib/engine/live-calc';

  const KINDS = DESIGN_KINDS.filter((k): k is Exclude<DesignKind, 'footing'> => k !== 'footing');
  const concretes = $derived([...modelStore.materials.values()].filter((m) => materialFamilyOf(m, catalogueGradeFamily).family === 'concrete'));
  const levels = $derived(modelStore.grid?.levels ?? []);
  let level = $state('');
  let chosen = $state<Record<string, number>>({});
  let assigned = $state<number | null>(null);
  let solving = $state(false);
  const any = $derived(KINDS.some((k) => chosen[k]));
  function assign() {
    let n = 0;
    for (const k of KINDS) if (chosen[k]) n += assignConcrete(k, chosen[k]!, level || undefined);
    assigned = n;
    chosen = {};
  }
  async function solve() {
    solving = true;
    try { await runGlobalSolve(); assigned = null; }
    catch (err) { uiStore.toast(err instanceof Error ? err.message : String(err), 'error'); }
    finally { solving = false; }
  }
</script>

<section class="pk-card" data-testid="design-data-concrete">
  <h5 class="cl-h">{t('designData.concrete')}</h5>
  <Hint text={t('designData.concreteHint')} />
  {#if concretes.length === 0}<p class="pk-hint cl-hint">{t('designData.noConcrete')}</p>{:else}
    <label class="cl-row">{t('building.level')}
      <select bind:value={level} data-testid="design-data-concrete-level">
        <option value="">{t('designData.allLevels')}</option>
        {#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
      </select>
    </label>
    <table class="cl-table">
      <tbody>
        {#each KINDS as k (k)}
          <tr>
            <td>{t(`designData.kind.${k}`)}</td>
            <td>
              <select value={chosen[k] ?? 0} onchange={(e) => (chosen = { ...chosen, [k]: Number(e.currentTarget.value) })} data-testid="design-data-concrete-{k}">
                <option value={0}>{t('designData.concreteKeep')}</option>
                {#each concretes as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
              </select>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button class="pk-btn" onclick={assign} disabled={!any} data-testid="design-data-assign">{t('designData.assign')}</button>
    {#if assigned !== null}
      <div class="cl-done" role="status" data-testid="design-data-assigned">
        <p class="pk-hint cl-hint">{tp('designData.assigned', { n: assigned })}{#if assigned > 0} {t('designData.assignedSolve')}{/if}</p>
        {#if assigned > 0}<button class="pk-btn pk-btn-primary" onclick={solve} disabled={solving} data-testid="design-data-assigned-solve">{t('designData.solveAgain')}</button>{/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .cl-h { margin: 0 0 4px; font-size: 0.78rem; font-weight: 500; }
  .cl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; margin: 4px 0; color: var(--st-text-2); }
  .cl-table { border-collapse: collapse; font-size: 0.7rem; margin: 2px 0 6px; }
  .cl-table td { padding: 2px 8px 2px 0; }
  .cl-hint { color: var(--st-text-2); margin: 4px 0; }
  .cl-done { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
</style>
