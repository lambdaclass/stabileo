<script lang="ts">
  import { storeyLabel } from '../../../lib/rc-sheets/storeys';
  import { t, i18n } from '../../../lib/i18n';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { columnLabel, crosstiesText, tieLabel } from '../../../lib/rc-sheets/column-row';
  import { governingRatio, type SheetCode } from '../../../lib/rc-sheets/types';
  import type { VerticalItem, VerticalPier, VerticalRow } from '../../../lib/rc-sheets/vertical-list';
  import type { SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import { showRebarOf } from '../../../lib/store/rc-rebar-3d.svelte';
  import RcRowDetail from './RcRowDetail.svelte';
  import RcPierSection from './RcPierSection.svelte';
  import RcChecks from './RcChecks.svelte';
  import RcSteps from './RcSteps.svelte';

  let { items, rows, code, endZones, slabCover, edited, nothingFits, openKey = $bindable<string | null>(null), onpick, onleave }: {
    items: VerticalItem[]; rows: SheetRows; code: SheetCode; endZones: boolean; slabCover: number; edited: ReadonlySet<string>;
    nothingFits: (r: VerticalRow) => boolean; openKey?: string | null; onpick: () => void; onleave: () => void;
  } = $props();

  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const f1 = (v: number) => fmt(v, 1);
  const f2 = (v: number) => fmt(v, 2);
  const cm = (m: number) => Math.round(m * 100);
  const COLS = 12;
  const maxOf = (xs: number[]) => Math.max(0, ...xs.map(Math.abs));
  const toggle = (key: string) => { openKey = openKey === key ? null : key; onpick(); };
  const typeOf = (r: VerticalRow) => t(r.family === 'wall' ? 'rcSheets.vtype.wall' : r.pier ? 'rcSheets.vtype.pierColumn' : 'rcSheets.vtype.column');
  const pierLines = (p: VerticalPier) => p.walls[0]?.verifications.filter((v) => v.label === 'rcSheets.v.pierPM' || v.label === 'rcSheets.v.forcesMissing') ?? [];
  const pierSteps = (p: VerticalPier) => p.walls[0]?.steps.filter((g) => g.title === 'rcSheets.g.pier') ?? [];
  const zones = (p: VerticalPier) => p.columns.map((c) => `${c.name}: ${columnLabel(c.adopted)}`).join(' · ');
</script>

{#snippet rowCells(r: VerticalRow, member: boolean)}
  <tr class="row st-{r.status}" class:member class:open={openKey === r.key} class:none={nothingFits(r)} onclick={() => toggle(r.key)} data-testid="rc-row" data-key={r.key} data-family={r.family}>
    <td class="nm">{#if member}<span class="branch" aria-hidden="true">└</span>{/if}{r.name}{#if nothingFits(r)}<span class="tag none" title={t('rcSheets.alt.closest')} data-testid="rc-no-arrangement-tag">✕</span>{:else if !r.isAdopted}<span class="tag" title={t('rcSheets.showingProposal')}>P</span>{:else if edited.has(r.key)}<span class="tag" title={t('rcSheets.editedByHand')} data-testid="rc-edited-tag">✎</span>{/if}</td>
    <td class="ty">{typeOf(r)}</td>
    <td>{storeyLabel(r.level ?? '', t)}</td>
    {#if r.family === 'column'}
      {@const cs = r.demand.cases}
      <td>{fmt(r.b * 100, 0)}×{fmt(r.h * 100, 0)}</td>
      <td class="n">{f1(Math.max(0, ...cs.map((c) => c.pu)))}</td>
      <td class="n" title="Mx · My">{f1(maxOf(cs.flatMap((c) => [c.mxTop, c.mxBot])))} · {f1(maxOf(cs.flatMap((c) => [c.myTop, c.myBot])))}</td>
      <td class="n" title="Vx · Vy">{f1(maxOf(cs.map((c) => c.vx ?? 0)))} · {f1(maxOf(cs.map((c) => c.vy ?? 0)))}</td>
      <td class="n">{r.pier ? '—' : `${f2(r.req.rho * 100)} %`}</td>
      <td>{columnLabel(r.adopted)} <span class="dim">({f2(r.checks.area)})</span></td>
      <td>{tieLabel(r.adopted)} <span class="dim" title={t('rcSheets.col.crossties')} data-testid="rc-col-crossties">⊥ {crosstiesText(r.checks.crossties)}</span></td>
      <td class="n">{fmt(r.pier ? r.verifications.find((v) => v.label === 'rcSheets.v.pierPM')?.ratio ?? governingRatio(r.verifications) : r.checks.ratio, 2)}</td>
    {:else}
      {@const k = r.demand.combos}
      {@const a = r.adopted}
      <td>{f2(r.length)} m × {fmt(r.thickness * 100, 0)}</td>
      <td class="n">{f1(Math.max(0, ...k.map((x) => x.pu)))}</td>
      <td class="n">{f1(Math.max(0, ...k.map((x) => x.mu)))}</td>
      <td class="n">{f1(Math.max(0, ...k.map((x) => x.vu)))}</td>
      <td class="n">{fmt(r.req.rhoL * 100, 3)} · {fmt(r.req.rhoT * 100, 3)} %</td>
      <td>{a.curtains}× V Ø{a.vertical.diameter} c/{cm(a.vertical.spacing)}{a.boundary && a.boundary.count > 0 ? ` · ${a.boundary.count} Ø${a.boundary.diameter}` : ''}</td>
      <td>H Ø{a.horizontal.diameter} c/{cm(a.horizontal.spacing)}</td>
      <td class="n">{fmt(r.utilization, 2)}</td>
    {/if}
    <td class="stc" data-testid="rc-row-status">{t(nothingFits(r) ? 'rcSheets.status.noArrangement' : `rcSheets.status.${r.status}`)}</td>
  </tr>
  {#if openKey === r.key}
    <tr class="detail"><td colspan={COLS}><div class="rcw-detail"><RcRowDetail row={r} {rows} {code} {endZones} {slabCover} {onleave} /></div></td></tr>
  {/if}
{/snippet}

<table class="rcw-table" data-testid="rc-table-vertical">
  <thead>
    <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.type')}</th><th>{t('rcSheets.col.level')}</th><th>{t('rcSheets.col.section')}</th><th class="n">Pu</th><th class="n">Mu</th><th class="n">Vu</th>
      <th class="n">ρ {t('rcSheets.req')}</th><th>{t('rcSheets.col.bars')}</th><th>{t('rcSheets.col.transverse')}</th><th class="n">{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
  </thead>
  <tbody>
    {#each items as it (it.kind === 'row' ? it.row.key : it.pier.key)}
      {#if it.kind === 'row'}
        {@render rowCells(it.row, false)}
      {:else}
        {@const p = it.pier}
        <tr class="row pier st-{p.status}" class:open={openKey === p.key} onclick={() => toggle(p.key)} data-testid="rc-pier-row" data-key={p.key}>
          <td class="nm">{p.name}</td>
          <td class="ty">{t('rcSheets.vtype.pier')}</td>
          <td>{storeyLabel(p.level ?? '', t)}</td>
          <td class="dim">{p.columns.map((c) => `${c.name} ${fmt(c.b * 100, 0)}×${fmt(c.h * 100, 0)}`).join(' · ')}</td>
          <td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td>
          <td colspan="2" class="dim">{zones(p)}</td>
          <td class="n">{fmt(p.ratio, 2)}</td>
          <td class="stc" data-testid="rc-row-status">{t(`rcSheets.status.${p.status}`)}</td>
        </tr>
        {#if openKey === p.key}
          <tr class="detail">
            <td colspan={COLS}><div class="rcw-detail">
              <button type="button" class="rcs-btn rcw-3d" onclick={() => { showRebarOf({ key: p.key, name: p.name, keys: [...p.walls, ...p.columns].map((r) => r.key) }); onleave(); }} data-testid="rc-view-3d">{t('rcSheets.r3d.show')}</button>
              <p class="hint">{t('rcSheets.pier.hint')}</p>
              <div class="rcw-secs"><RcPierSection name={p.name} walls={p.walls} {code} /></div>
              <RcChecks lines={pierLines(p)} />
              <details open><summary>{t('rcSheets.steps')}</summary><RcSteps groups={pierSteps(p)} /></details>
            </div></td>
          </tr>
        {/if}
        {#each it.rows as r (r.key)}{@render rowCells(r, true)}{/each}
      {/if}
    {/each}
  </tbody>
</table>

<style>
  .rcw-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
  th { position: sticky; top: 0; z-index: 1; background: var(--st-surface-2); text-align: left; font-weight: 600; color: var(--st-text-2); padding: 4px 6px; border-bottom: 1px solid var(--st-hair); white-space: nowrap; }
  td { padding: 3px 6px; border-bottom: 1px solid var(--st-hair); white-space: nowrap; }
  tr.row { cursor: pointer; scroll-margin-top: 32px; }
  tr.row:hover { background: var(--st-surface-2); }
  tr.open { background: var(--st-surface-2); }
  tr.pier td { border-top: 1px solid var(--st-text-3); }
  tr.pier .nm { font-weight: 700; }
  tr.member .nm { font-weight: 500; }
  .branch { color: var(--st-text-3); margin: 0 4px 0 2px; }
  .ty { color: var(--st-text-2); }
  .n { text-align: right; font-family: var(--st-mono); }
  .dim { color: var(--st-text-3); }
  .nm { font-weight: 600; }
  .tag { margin-left: 4px; font-size: 0.6rem; border: 1px solid var(--st-hair); border-radius: 3px; padding: 0 3px; color: var(--st-text-3); }
  .stc { font-weight: 600; }
  tr.st-ok .stc { color: var(--st-ok); }
  tr.st-warn .stc { color: var(--st-text-2); }
  tr.st-fail .stc { color: var(--st-danger); }
  .tag.none { color: var(--st-danger); border-color: var(--st-danger); }
  tr.none td:not(.nm):not(.stc) { color: var(--st-text-3); font-style: italic; }
  tr.detail td { white-space: normal; padding: 8px; background: var(--st-surface); }
  .rcw-detail { position: sticky; left: 8px; max-width: calc(100vw - 48px); min-width: 0; }
  tr.detail :global(.rce) { margin-bottom: 8px; }
  details { margin: 4px 0 8px; }
  summary { cursor: pointer; font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); margin-bottom: 4px; }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
  .rcw-3d { float: right; margin: 2px 0 4px 8px; }
  .rcw-secs { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin: 6px 0 8px; min-width: 0; }
  .hint { margin: 2px 0 6px; font-size: 0.7rem; color: var(--st-text-2); max-width: 80ch; }
</style>
