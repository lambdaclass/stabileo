<script lang="ts">
  /**
   * The column editor: the stack the selected column belongs to, one row per level with its
   * section, bars, ties, end zones, steel ratio and how it checks; the selected lift's bars edited
   * in place, its interaction curves with the demand points, its failing checks and its bar
   * breakdown with the lap above. A list of every stack, searchable and sortable, and equalizing
   * the stacks that repeat this one or all of them.
   */
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { verificationStore } from '../../../../lib/store/verification.svelte';
  import { deskUi } from '../../../../lib/store/design-desk-ui.svelte';
  import { sortedLevels } from '../../../../lib/model/grid';
  import { equalizeAllStacks, equalizeStack, modelColumnStacks, stackOf } from '../../../../lib/store/column-stack-store';
  import { columnSteel, liftBreakdown } from '../../../../lib/engine/design/column-stacks';
  import { columnInteraction } from '../../../../lib/engine/design/column-interaction';
  import { grossAreaOf } from '../../../../lib/engine/design/shaped-column';
  import { requiredLd } from '../../../../lib/engine/station-design-forces';
  import RebarEditorColumn from '../../design/RebarEditorColumn.svelte';
  import RebarEditorShapedColumn from '../../design/RebarEditorShapedColumn.svelte';
  import ColumnInteraction from './ColumnInteraction.svelte';

  let { memberId }: { memberId: number | null } = $props();
  const rev = $derived(verificationStore.providedRevision);
  const isColumn = $derived(memberId !== null && verificationStore.contextFor(memberId)?.elementType === 'column');
  const here = $derived.by(() => { void rev; void modelStore.elements; return isColumn ? stackOf(memberId!) : null; });
  const levels = $derived(sortedLevels(modelStore.grid));
  const levelAt = (z: number) => [...levels].reverse().find((l) => l.z <= z + 1e-6)?.name ?? `z = ${z.toFixed(2)}`;
  const statusOf = (id: number) => verificationStore.getDisplayStatus(id);
  const ratioOf = (id: number) => verificationStore.getDisplayRatio(id);
  const areaOf = (id: number) => { const c = verificationStore.contextFor(id); return c ? (c.shape ? grossAreaOf(c.shape) : c.section.b * c.section.h) : 0; };
  const barsText = (id: number) => {
    const r = modelStore.elements.get(id)?.reinforcement;
    if (!r) return '—';
    if (r.shaped) return `${r.shaped.count}Ø${r.shaped.diameter}`;
    if (r.column) { const c = r.column; return `4Ø${c.cornerDia} + ${c.nBottom + c.nTop + c.nLeft + c.nRight}Ø${c.faceDia}`; }
    return r.longitudinal ? `${r.longitudinal.count}Ø${r.longitudinal.diameter}` : '—';
  };
  const tieText = (id: number) => {
    const r = modelStore.elements.get(id)?.reinforcement;
    const s = r?.shaped?.spiral;
    if (s) return `${t('shapedCol.spiral')} Ø${s.diameter} p${(s.pitch * 100).toFixed(1)}`;
    return r?.stirrups ? `eØ${r.stirrups.diameter} c/${(r.stirrups.spacing * 100).toFixed(1)}${r.tieZones ? ` (${(r.tieZones.endSpacing * 100).toFixed(1)})` : ''}` : '—';
  };

  const lift = $derived(isColumn ? memberId! : null);
  const ctx = $derived(lift !== null ? verificationStore.contextFor(lift) : undefined);
  const plot = $derived.by(() => { void rev; return ctx && lift !== null ? columnInteraction(ctx, modelStore.elements.get(lift)?.reinforcement) : null; });
  const failing = $derived.by(() => { void rev; return lift !== null ? (verificationStore.providedFor(lift)?.checks ?? []).filter((c) => c.status !== 'ok') : []; });
  const breakdown = $derived.by(() => {
    void rev;
    if (!ctx || lift === null || !here) return [];
    const l = here.stack.lifts.find((x) => x.id === lift)!;
    const per = ctx.shape?.kind === 'circle' ? Math.PI * (ctx.shape.D - 2 * ctx.material.cover) : 2 * (ctx.section.b + ctx.section.h - 4 * ctx.material.cover);
    return liftBreakdown(l, modelStore.elements.get(lift)?.reinforcement, (d) => requiredLd(d, ctx.material.fc, ctx.material.fy), per);
  });

  // ── Every stack ──
  let query = $state(''), sort = $state<'position' | 'ratio'>('position');
  const stacks = $derived.by(() => {
    void rev;
    const all = modelColumnStacks().map((s) => ({ s, worst: Math.max(0, ...s.lifts.map((l) => ratioOf(l.id) ?? 0)) }));
    const q = query.trim().toLowerCase();
    const shown = q ? all.filter(({ s }) => s.lifts.some((l) => `#${l.id}`.includes(q) || String(l.id) === q) || `${s.x.toFixed(2)} ${s.y.toFixed(2)}`.includes(q)) : all;
    return sort === 'ratio' ? [...shown].sort((a, b) => b.worst - a.worst) : shown;
  });
  let note = $state<string | null>(null);
</script>

<div class="ce" data-testid="column-editor">
  <aside class="ce-list">
    <div class="ce-row">
      <input placeholder={t('colEd.search')} bind:value={query} data-testid="column-search" />
      <select bind:value={sort} aria-label={t('colEd.sort')}><option value="position">{t('colEd.byPosition')}</option><option value="ratio">{t('colEd.byRatio')}</option></select>
    </div>
    <button class="ce-btn" onclick={() => { const r = equalizeAllStacks(); note = tp('colEd.equalizedAll', { groups: r.groups, n: r.members }); }} data-testid="column-equalize-all">{t('colEd.equalizeAll')}</button>
    <ul>
      {#each stacks as { s, worst } (s.key)}
        <li><button class:on={here?.stack.key === s.key} onclick={() => (deskUi.selected = s.lifts[0]!.id)}>
          ({s.x.toFixed(2)}, {s.y.toFixed(2)}) · {s.lifts.length} · <span class:bad={worst > 1}>{worst.toFixed(2)}</span>
        </button></li>
      {/each}
    </ul>
  </aside>

  <section class="ce-main">
    {#if note}<p class="ce-hint" role="status">{note}</p>{/if}
    {#if !here}
      <p class="ce-hint">{t('colEd.pick')}</p>
    {:else}
      <header class="ce-head">
        <h4>{tp('colEd.title', { x: here.stack.x.toFixed(2), y: here.stack.y.toFixed(2), n: here.stack.lifts.length })}</h4>
        {#if here.repeats.length}
          <button class="ce-btn" onclick={() => { note = tp('desk.equalized', { n: equalizeStack(memberId!).length }); }} data-testid="column-equalize">{tp('colEd.equalize', { n: here.repeats.length })}</button>
        {/if}
      </header>
      <table class="ce-table" data-testid="column-table">
        <thead><tr><th>{t('desk.level')}</th><th>z</th><th>{t('colEd.section')}</th><th>{t('colEd.bars')}</th><th>{t('colEd.ties')}</th><th>ρ</th><th>u</th></tr></thead>
        <tbody>
          {#each [...here.stack.lifts].reverse() as l (l.id)}
            {@const r = ratioOf(l.id)}
            <tr class:sel={l.id === memberId} onclick={() => (deskUi.selected = l.id)} data-testid="column-lift-{l.id}">
              <td>{levelAt(l.zHi)}</td><td class="num">{l.zLo.toFixed(2)}–{l.zHi.toFixed(2)}</td>
              <td>{modelStore.sections.get(l.sectionId)?.name ?? '—'}</td>
              <td>{barsText(l.id)}</td><td>{tieText(l.id)}</td>
              <td class="num">{(columnSteel(modelStore.elements.get(l.id)?.reinforcement) / Math.max(areaOf(l.id) * 1e4, 1e-9) * 100).toFixed(2)} %</td>
              <td class="num st-{statusOf(l.id)}">{r === null ? '—' : r.toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      {#if ctx && lift !== null}
        <div class="ce-cols">
          <div>
            <h5>{tp('colEd.lift', { level: levelAt(here.stack.lifts.find((x) => x.id === lift)!.zHi), id: lift })}</h5>
            {#if ctx.shape}<RebarEditorShapedColumn elementId={lift} {ctx} version={rev} />{:else}<RebarEditorColumn elementId={lift} {ctx} version={rev} />{/if}
            {#if failing.length}
              <ul class="ce-fail" data-testid="column-failing">{#each failing as c}<li class="st-{c.status}">{c.category} · {c.ratio.toFixed(2)}</li>{/each}</ul>
            {:else}<p class="ce-hint">{t('colEd.allChecks')}</p>{/if}
            {#if breakdown.length}
              <table class="ce-table ce-bd" data-testid="column-breakdown">
                <thead><tr><th>{t('colEd.piece')}</th><th>{t('colEd.count')}</th><th>Ø</th><th>L</th></tr></thead>
                <tbody>{#each breakdown as b}<tr><td>{b.what === 'long' ? t('colEd.longWithLap') : t('colEd.tie')}</td><td class="num">{b.count}</td><td class="num">{b.diameter}</td><td class="num">{b.length.toFixed(2)} m</td></tr>{/each}</tbody>
              </table>
            {/if}
          </div>
          <div>{#if plot}<ColumnInteraction {plot} />{/if}</div>
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .ce { display: grid; grid-template-columns: 13rem minmax(0, 1fr); gap: 8px; padding: 8px; font-size: 0.72rem; }
  .ce-list ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 60vh; overflow: auto; }
  .ce-list li button { width: 100%; text-align: left; font-size: 0.68rem; padding: 2px 4px; border: none; background: none; color: var(--st-text-2); cursor: pointer; }
  .ce-list li button.on { background: var(--st-surface-3); color: var(--st-text); }
  .ce-row { display: flex; gap: 4px; } .ce-row input { flex: 1; min-width: 0; font-size: 0.7rem; }
  .ce-btn { margin-top: 4px; font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .ce-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ce-head h4 { margin: 0; font-size: 0.8rem; }
  .ce-table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  .ce-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 2px 6px; }
  .ce-table td { padding: 2px 6px; border-top: 1px solid var(--st-hair); }
  .ce-table tr.sel td { background: var(--st-surface-3); }
  .ce-table tbody tr { cursor: pointer; }
  .num { font-variant-numeric: tabular-nums; }
  .st-fail, .st-provisional, .bad { color: var(--st-danger); } .st-warn { color: var(--st-warn); } .st-ok { color: var(--st-ok); }
  .ce-cols { display: grid; grid-template-columns: minmax(19rem, 1fr) minmax(0, 20rem); gap: 10px; margin-top: 8px; }
  .ce-cols h5 { margin: 0 0 4px; font-size: 0.74rem; }
  .ce-hint { color: var(--st-text-3); }
  .ce-fail { margin: 6px 0; padding-left: 16px; }
  .ce-bd { margin-top: 8px; }
  @media (max-width: 1000px) { .ce { grid-template-columns: 1fr; } .ce-cols { grid-template-columns: 1fr; } }
</style>
