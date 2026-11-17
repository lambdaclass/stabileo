<script lang="ts">
  /** «Check geometry»: the model's own diagnostics, listed, with a way to the members they name. */
  import { t, tp } from '../../../lib/i18n';
  import { checkCurrentModel } from '../../../lib/engine/solve-diagnostics';
  import { deskUi } from '../../../lib/store/design-desk-ui.svelte';
  import type { SolverDiagnostic } from '../../../lib/engine/types';
  let found = $state<SolverDiagnostic[] | null>(null);
  const text = (d: SolverDiagnostic) => { const s = t(d.message); return s === d.message ? d.message : tp(d.message, (d.details ?? {}) as Record<string, string | number>); };
</script>

<div class="dg" data-testid="desk-geometry">
  <button class="dg-run" onclick={() => (found = checkCurrentModel())} data-testid="desk-check-geometry">{t('desk.checkGeometry')}</button>
  {#if found}
    {#if found.length === 0}<p class="dg-ok" data-testid="desk-geometry-ok">{t('desk.geometryOk')}</p>{/if}
    <ul>
      {#each found as d, i (i)}
        <li class="sev-{d.severity}">
          <span class="dg-code">{d.code}</span> <span>{text(d)}</span>
          {#each (d.elementIds ?? []).slice(0, 6) as id}<button onclick={() => (deskUi.selected = id)}>#{id}</button>{/each}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dg { padding: 10px; overflow: auto; }
  .dg-run { font-size: 0.72rem; padding: 3px 10px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .dg-ok { font-size: 0.72rem; color: var(--st-ok); }
  ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: 0.7rem; }
  li { border-left: 2px solid var(--st-hair-strong); padding-left: 6px; }
  li.sev-error { border-left-color: var(--st-danger); } li.sev-warning { border-left-color: var(--st-warn); }
  .dg-code { font-family: var(--st-mono, monospace); color: var(--st-text-3); }
  li button { background: none; border: none; color: var(--st-accent); cursor: pointer; padding: 0 2px; font: inherit; }
</style>
