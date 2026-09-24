<script lang="ts">
  /**
   * The lightest catalogue profile that passes, per section or per member — proposed, applied,
   * re-verified. See `store/steel-optimise.svelte.ts` for the three states and why the loop is
   * never closed out of sight.
   *
   * The steel checker behind it is the experimental one the workflow above describes, so a pick
   * is a pre-design: it says which profile the checker would accept, not that the member is
   * certified.
   */
  import { resultsStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { steelOptimise, type OptimiseScope } from '../../lib/store/steel-optimise.svelte';
  import { runSolve3D } from '../../lib/actions/solve';

  let scope = $state<OptimiseScope>('section');
  let onlySelection = $state(false);
  let chosen = $state<Set<string>>(new Set());
  let busy = $state(false);

  const hasResults = $derived(!!resultsStore.results3D);
  const selected = $derived([...uiStore.selectedElements]);
  const rows = $derived(steelOptimise.rows);

  function run() {
    steelOptimise.run(scope, onlySelection && selected.length > 0 ? selected : undefined);
    chosen = new Set(steelOptimise.rows.filter((r) => r.result.chosen && r.result.chosen.profile.name !== r.currentName).map((r) => r.key));
  }

  function toggle(key: string) {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key); else next.add(key);
    chosen = next;
  }

  function apply() {
    steelOptimise.apply([...chosen]);
    chosen = new Set();
  }

  async function reverify() {
    busy = true;
    try {
      await runSolve3D();
      steelOptimise.recheck();
    } finally {
      busy = false;
    }
  }

  const pct = (r: number) => `${(r * 100).toFixed(0)} %`;
  const change = (r: (typeof rows)[number]) => {
    const c = r.result.chosen;
    if (!c) return 'none';
    if (c.profile.name === r.currentName) return 'same';
    return r.current && c.profile.weight < (r.current.profile.weight) ? 'lighter' : 'heavier';
  };
</script>

<div class="so" data-testid="steel-optimise">
  <p class="so-note">{t('opt.note')}</p>

  <div class="so-bar">
    <label><input type="radio" bind:group={scope} value="section" /> {t('opt.bySection')}</label>
    <label><input type="radio" bind:group={scope} value="member" /> {t('opt.byMember')}</label>
    <label title={t('opt.onlySelectionHint')}><input type="checkbox" bind:checked={onlySelection} disabled={selected.length === 0} /> {tp('opt.onlySelection', { n: selected.length })}</label>
    <button onclick={run} disabled={!hasResults} data-testid="opt-run">{t('opt.run')}</button>
  </div>
  {#if !hasResults}<p class="so-warn">{t('opt.needSolve')}</p>{/if}
  {#if steelOptimise.error}<p class="so-warn">{t(steelOptimise.error)}</p>{/if}

  {#if rows.length > 0}
    <table class="so-table" data-testid="opt-rows">
      <thead><tr><th></th><th>{scope === 'section' ? t('opt.section') : t('pro.elemLabel')}</th><th>{t('opt.members')}</th><th>{t('opt.current')}</th><th>{t('opt.proposed')}</th><th>{t('opt.ratio')}</th><th>{t('opt.weight')}</th></tr></thead>
      <tbody>
        {#each rows as r (r.key)}
          {@const c = r.result.chosen}
          {@const k = change(r)}
          <tr class={`so-${k}`}>
            <td><input type="checkbox" checked={chosen.has(r.key)} disabled={!c || k === 'same'} onchange={() => toggle(r.key)} /></td>
            <td>{r.scope === 'section' ? r.currentName : r.elementIds[0]}</td>
            <td class="num">{r.elementIds.length}</td>
            <td>{r.currentName} <span class="dim">{r.current ? pct(r.current.ratio) : '—'}</span></td>
            <td>{#if c}{c.profile.name}{:else}<span class="so-fail">{tp('opt.noneInFamily', { family: r.family, best: r.result.best ? pct(r.result.best.ratio) : '—' })}</span>{/if}</td>
            <td class="num">{c ? pct(c.ratio) : '—'}</td>
            <td class="num">{c ? `${c.profile.weight.toFixed(1)} kg/m` : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="so-bar">
      <button class="so-primary" onclick={apply} disabled={chosen.size === 0} data-testid="opt-apply">{tp('opt.apply', { n: chosen.size })}</button>
      <span class="dim">{t('opt.applyHint')}</span>
    </div>
  {/if}

  {#if steelOptimise.applied.length > 0}
    <div class="so-applied" data-testid="opt-applied">
      {#if steelOptimise.awaitingReverify}
        <p class="so-warn" data-testid="opt-awaiting">{tp('opt.awaiting', { n: steelOptimise.applied.length })}</p>
        <button class="so-primary" onclick={reverify} disabled={busy} data-testid="opt-reverify">{busy ? t('opt.solving') : t('opt.reverify')}</button>
      {:else}
        <p class={steelOptimise.converged ? 'so-ok' : 'so-warn'} data-testid="opt-verdict">{steelOptimise.converged ? t('opt.converged') : t('opt.notConverged')}</p>
        <ul>
          {#each steelOptimise.applied as a (a.key)}
            <li>
              <strong>{a.profileName}</strong> ({tp('opt.nMembers', { n: a.elementIds.length })}) — {t(`opt.status.${a.status}`)}
              {#if a.nowRatio !== undefined}<span class="dim">{pct(a.nowRatio)}</span>{/if}
              {#if a.status === 'lighter' && a.now?.chosen}→ {a.now.chosen.profile.name}{/if}
              {#if a.status === 'failsNow' && a.now?.chosen}→ {a.now.chosen.profile.name}{/if}
            </li>
          {/each}
        </ul>
        {#if !steelOptimise.converged}<p class="dim">{t('opt.nextPass')}</p>{/if}
        <button onclick={() => steelOptimise.clearApplied()}>{t('opt.done')}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .so { font-size: 0.68rem; color: var(--st-text-2); display: flex; flex-direction: column; gap: 6px; }
  .so-note { margin: 0; color: var(--st-text-3); font-size: 0.64rem; }
  .so-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  button { padding: 2px 8px; font-size: 0.64rem; color: var(--st-text); background: var(--st-surface-3); border: 1px solid var(--st-hair-strong); border-radius: 3px; cursor: pointer; }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  .so-primary { border-color: var(--st-accent); }
  .so-table { width: 100%; border-collapse: collapse; font-size: 0.64rem; }
  .so-table th, .so-table td { padding: 2px 4px; border-bottom: 1px solid var(--st-hair); text-align: left; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .dim { color: var(--st-text-3); }
  .so-lighter td:nth-child(5) { color: var(--st-ok); }
  .so-heavier td:nth-child(5) { color: var(--st-warn); }
  .so-fail { color: var(--st-danger); }
  .so-warn { margin: 0; color: var(--st-warn); }
  .so-ok { margin: 0; color: var(--st-ok); }
  .so-applied ul { margin: 2px 0; padding-left: 1rem; }
</style>
