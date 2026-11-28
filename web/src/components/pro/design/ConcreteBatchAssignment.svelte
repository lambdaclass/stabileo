<script lang="ts">
  import { modelStore, uiStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { DESIGN_KINDS, type DesignKind } from '../../../lib/model/design-data';
  import { assignConcrete } from '../../../lib/model/building/assign-concrete';
  import { runGlobalSolve } from '../../../lib/engine/live-calc';
  import { errorText } from '../../../lib/utils/error-text';

  let { concretes, levels }: { concretes: { id: number; name: string }[]; levels: { id: string; name: string }[] } = $props();
  const KINDS = DESIGN_KINDS.filter((k): k is Exclude<DesignKind, 'footing'> => k !== 'footing');
  let level = $state('');
  let chosen = $state<Record<string, number>>({});
  let assigned = $state<number | null>(null);
  let solving = $state(false);
  const any = $derived(KINDS.some((k) => chosen[k] !== undefined));
  function assign() {
    let n = 0;
    modelStore.bulkMutate(() => { for (const k of KINDS) if (chosen[k] !== undefined) n += assignConcrete(k, chosen[k]!, level || undefined); });
    assigned = n;
    chosen = {};
  }
  async function solve() {
    solving = true;
    try {
      const outcome = await runGlobalSolve();
      if (outcome.ok) assigned = null;
      else uiStore.toast(errorText(outcome.error, String(outcome.error)), 'error');
    }
    catch (err) { uiStore.toast(errorText(err, String(err)), 'error'); }
    finally { solving = false; }
  }
</script>

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
          <select value={chosen[k] ?? ''} onchange={(e) => { const v = e.currentTarget.value; const { [k]: _, ...rest } = chosen; chosen = v === '' ? rest : { ...rest, [k]: Number(v) }; }} data-testid="design-data-concrete-{k}">
            <option value="">{t('designData.concreteKeep')}</option>
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

<style>
  .cl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 0.7rem; margin: 4px 0; color: var(--st-text-2); }
  .cl-table { border-collapse: collapse; font-size: 0.7rem; margin: 2px 0 6px; }
  .cl-table td { padding: 2px 8px 2px 0; }
  .cl-hint { color: var(--st-text-2); margin: 4px 0; }
  .cl-done { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
</style>
