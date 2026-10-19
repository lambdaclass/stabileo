<script lang="ts">
  /** Every steel joint with its typology and state; propose them all, make plates equal across joints alike. */
  import { t, tp } from '../../../lib/i18n';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { equalizeJointPlates, jointsReport, proposeAllJoints } from '../../../lib/store/joint-typology';

  let { onselect }: { onselect?: (nodeId: number) => void } = $props();
  const rows = $derived.by(() => { void modelStore.model.jointDesigns; void resultsStore.results3D; void modelStore.modelVersion; return jointsReport(); });
  let note = $state<string | null>(null);
  const count = (s: string | null) => rows.filter((r) => r.state === s).length;
</script>

<section class="jo" data-testid="joints-overview">
  <div class="jo-row">
    <button class="jo-btn" onclick={() => { const r = proposeAllJoints(); note = tp('joint.typ.proposedAll', { n: r.proposed, u: r.unresolved.length }); }} data-testid="joints-propose-all">{t('joint.typ.proposeAll')}</button>
    <button class="jo-btn" onclick={() => { note = tp('joint.typ.equalized', { n: equalizeJointPlates() }); }} data-testid="joints-equalize">{t('joint.typ.equalize')}</button>
  </div>
  {#if note}<p class="jo-n" role="status" data-testid="joints-note">{note}</p>{/if}
  <p class="jo-n" data-testid="joints-summary">{tp('joint.typ.summary', { n: rows.length, ok: count('designed'), bad: count('exceeded'), un: count('unresolved'), none: count(null) })}</p>
  {#if rows.length}
    <table class="jo-t" data-testid="joints-table">
      <tbody>
        {#each rows as r (r.nodeId)}
          <tr class:bad={r.state === 'exceeded' || r.state === 'unresolved'} onclick={() => onselect?.(r.nodeId)}>
            <td><button class="jo-link" onclick={() => onselect?.(r.nodeId)}>N{r.nodeId}</button></td>
            <td>{r.kind ? t(`joint.typ.kind.${r.kind}`) : '—'}</td>
            <td>{r.state ? t(`joint.typ.state.${r.state}`) : t('joint.typ.state.none')}</td>
            <td class="num">{r.worst !== null ? r.worst.toFixed(2) : ''}</td>
            <td class="why">{r.unresolvedKey ? t(r.unresolvedKey) : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .jo { font-size: 0.72rem; margin: 6px 0; }
  .jo-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .jo-btn { font: inherit; font-size: 0.7rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: var(--st-surface-3); color: var(--st-text); cursor: pointer; }
  .jo-n { color: var(--st-text-2); margin: 4px 0 0; }
  .jo-t { border-collapse: collapse; width: 100%; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .jo-t td { padding: 1px 4px; border-top: 1px solid var(--st-hair); }
  .jo-t .num { text-align: right; }
  .jo-t tr.bad td { color: var(--st-danger); }
  .jo-t .why { color: var(--st-text-3); font-size: 0.64rem; }
  .jo-link { background: none; border: none; color: var(--st-value); font: inherit; cursor: pointer; padding: 0; }
</style>
