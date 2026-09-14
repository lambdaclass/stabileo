<script lang="ts">
  /**
   * The constraints, as a list you can read and delete from.
   *
   * A constraint ties degrees of freedom between nodes that already exist —
   * a rigid link, a diaphragm, equal DOFs, a linear MPC, an eccentric
   * connection. They are the one part of the model with no geometry of their
   * own: nothing in the viewport is shaped like them, so a table is the only
   * place they can be seen at all.
   *
   * The description comes from `constraint-labels`, which moved out of the
   * PRO panel when that panel stopped listing them itself: a generic
   * "rigidLink · 3 · 7" would be worse information than the "node 3 → 7,
   * ux,uy,uz" the panel used to show, and a second describer is one that can
   * come to disagree with the first.
   *
   * Read-only apart from deletion, deliberately. Each kind takes different
   * fields — a diaphragm has a master node and a plane, an MPC has a row of
   * coefficients — and a grid that edited all five in the same columns would
   * be five forms wearing one costume. Editing belongs in the panel above,
   * where the kind is chosen; what belongs here is "what is in the model".
   */
  import { modelStore, resultsStore, historyStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { constraintLabel, constraintTypeLabel } from '../../lib/model/constraint-labels';

  const rows = $derived(modelStore.model.constraints ?? []);

  function remove(index: number) {
    historyStore.pushState();
    modelStore.removeConstraint(index);
    /* A constraint is stiffness: what was solved no longer describes this. */
    resultsStore.clear();
  }
</script>

{#if rows.length > 0}
  <table>
    <thead>
      <tr><th>#</th><th>{t('pro.thKindName')}</th><th>{t('pro.thWhatItTies')}</th><th></th></tr>
    </thead>
    <tbody>
      {#each rows as c, i (i)}
        <tr>
          <td class="id-cell">{i + 1}</td>
          <td class="kind-cell">{constraintTypeLabel((c as { type?: string }).type ?? '', t)}</td>
          <td class="nodes-cell">{constraintLabel(c as never, t)}</td>
          <td><button class="del" onclick={() => remove(i)}>&#10005;</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
{:else}
  <p class="empty">{t('pro.noConstraints')}</p>
{/if}

<style>
  table { width: max-content; min-width: 100%; border-collapse: collapse; }

  th {
    text-align: left; padding: 0.25rem 0.35rem;
    color: var(--st-text-3); font-weight: 500; font-size: 0.65rem;
    text-transform: uppercase; letter-spacing: 0.03em;
    border-bottom: 1px solid var(--st-surface-3);
    position: sticky; top: 0; background: var(--st-surface-2); white-space: nowrap;
  }

  td {
    padding: 0.2rem 0.35rem; border-bottom: 1px solid var(--st-bg);
    color: var(--st-text-2); white-space: nowrap;
  }

  .id-cell { color: var(--st-value); font-weight: 600; }
  .kind-cell { color: var(--st-text); }
  .nodes-cell { font-variant-numeric: tabular-nums; }

  .del {
    background: none; border: none; color: var(--st-text-3);
    cursor: pointer; font-size: 0.8rem; padding: 0 2px;
  }
  .del:hover { color: var(--st-danger); }

  .empty { padding: 0.6rem; color: var(--st-text-3); font-size: 0.72rem; }
</style>
