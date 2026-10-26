<!--
  The works by phases: the sequence proposed by level, each phase renamed, moved, lengthened and
  given what is selected; the model shown as it stands at the end of each phase, played as an
  animation; the auxiliary means and collective protections by level; the budget phase by phase.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t, tp, i18n } from '../../../../lib/i18n';
  import { generatePhases, assignSelection, phaseScopes, removePhase, savePhase, showUpTo, siteData, siteSafetyItems, siteView } from '../../../../lib/store/site.svelte';
  import { activeBase, budgetSettings, workItems } from '../../../../lib/store/budget';
  import { builtBy, phaseEnd } from '../../../../lib/engine/site/phases';
  import { NO_SHARES, priceBudget } from '../../../../lib/engine/budget/budget';

  const site = $derived(siteData());
  const order = $derived(builtBy(site));
  const safety = $derived(siteSafetyItems());
  const base = $derived(activeBase());
  let note = $state('');
  let start = $state(new Date().toISOString().slice(0, 10));
  let days = $state('10');
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const f2 = (v: number) => new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format(v);
  const money = (v: number) => new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  function generate() {
    if (site.phases.length && !confirm(t('site.ui.replaceConfirm'))) return;
    note = tp('site.ui.generated', { n: generatePhases(start, num(days) ?? 10, tp as never).length });
  }
  let timer: ReturnType<typeof setInterval> | null = null;
  function play() {
    stop();
    let i = 0;
    showUpTo(0);
    timer = setInterval(() => { i++; if (i >= order.length) { stop(); return; } showUpTo(i); }, 1000);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  onDestroy(() => { stop(); if (siteView.step !== null) showUpTo(null); });

  const byPhase = $derived.by(() => {
    if (!base) return [];
    const shares = budgetSettings().shares ?? NO_SHARES;
    return phaseScopes().map((s) => ({ phase: s.phase, total: priceBudget(workItems({ only: { elements: s.elements, shells: s.shells }, safety: s.safety }), base, shares).total }));
  });
</script>

<div class="sf site" data-testid="site-editor">
  <p class="muted">{t('site.ui.lead')}</p>
  <div class="sf-form">
    <label>{t('site.ui.start')} <input type="date" bind:value={start} data-testid="site-start" /></label>
    <label>{t('site.ui.days')} <input inputmode="numeric" bind:value={days} data-testid="site-days" /></label>
    <button onclick={generate} data-testid="site-generate">{t('site.ui.generate')}</button>
  </div>

  <table class="sf-t" data-testid="site-phases">
    <thead><tr><th>#</th><th>{t('site.col.phase')}</th><th>{t('site.col.start')}</th><th>{t('site.col.days')}</th><th>{t('site.col.end')}</th><th>{t('site.col.members')}</th><th></th></tr></thead>
    <tbody>
      {#each order as b, i (b.phase.id)}
        <tr class:on={siteView.step === i}>
          <td>{i + 1}</td>
          <td><input class="name" value={b.phase.name} onchange={(e) => savePhase({ ...b.phase, name: e.currentTarget.value })} /></td>
          <td><input type="date" value={b.phase.start} onchange={(e) => savePhase({ ...b.phase, start: e.currentTarget.value })} /></td>
          <td><input inputmode="numeric" value={String(b.phase.days)} onchange={(e) => savePhase({ ...b.phase, days: num(e.currentTarget.value) ?? b.phase.days })} /></td>
          <td>{phaseEnd(b.phase)}</td><td>{b.keys.length}</td>
          <td>
            <button class="link" onclick={() => (note = tp('site.ui.assigned', { n: assignSelection(b.phase.id) }))}>{t('site.ui.assign')}</button>
            <button class="link" onclick={() => showUpTo(i)}>{t('site.ui.show')}</button>
            <button class="link" onclick={() => removePhase(b.phase.id)}>{t('mat.timber.drop')}</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if order.length === 0}<p class="muted">{t('site.ui.none')}</p>{/if}
  {#if order.length}
    <div class="sf-form">
      <label class="wide">{t('site.ui.step')} <input type="range" min="0" max={order.length - 1} value={siteView.step ?? order.length - 1} oninput={(e) => showUpTo(Number(e.currentTarget.value))} data-testid="site-slider" /></label>
      <button onclick={play} data-testid="site-play">{t('site.ui.play')}</button>
      <button class="link" onclick={() => { stop(); showUpTo(null); }}>{t('site.ui.showAll')}</button>
    </div>
  {/if}

  <details class="sf-sec" data-testid="site-safety">
    <summary>{t('site.ui.safety')} <span class="muted">· {tp('sfl.count', { n: safety.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each safety as s, i (i)}<tr><td>{s.level}</td><td>{t(`bud.item.${s.kind}`)}</td><td>{f2(s.quantity)} {s.unit === 'm' ? 'm' : 'm²'}</td><td>{order.find((b) => b.phase.id === s.phaseId)?.phase.name ?? '—'}</td></tr>{/each}
    </tbody></table>
    <p class="muted">{t('site.ui.safetyNote')}</p>
  </details>

  <details class="sf-sec" data-testid="site-budget">
    <summary>{t('site.ui.budget')}</summary>
    {#if !base}<p class="muted">{t('site.ui.noBase')}</p>{:else}
      <table class="sf-t"><tbody>
        {#each byPhase as b (b.phase.id)}<tr><td>{b.phase.name}</td><td class="n">{money(b.total)} {base.currency}</td></tr>{/each}
      </tbody></table>
    {/if}
  </details>
  {#if note}<p class="muted" data-testid="site-note">{note}</p>{/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .muted { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td, .sf-t th { padding: 2px 4px; border-top: 1px solid var(--st-hair); text-align: left; }
  .sf-t .n { text-align: right; font-variant-numeric: tabular-nums; }
  .sf-t tr.on td { background: var(--st-surface-3); }
  .sf-form { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .sf-form label { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  .sf-form label.wide { flex: 1 1 14rem; }
  input { font-size: 0.72rem; width: 4.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  input.name { width: 14rem; }
  input[type='date'] { width: 8rem; }
  input[type='range'] { width: 100%; }
  button { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  button.link { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; }
</style>
