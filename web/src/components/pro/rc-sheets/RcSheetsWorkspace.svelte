<script lang="ts">
  import { t, tp, i18n } from '../../../lib/i18n';
  import { adoptAll, downloadRcSheets, type SheetRow, type SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import { liveSheetRows, sheetSize } from '../../../lib/store/rc-sheets-view.svelte';
  import { uiStore } from '../../../lib/store';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { groupsArea, groupsLabel, meshArea, meshLabel, stirrupsLabel } from '../../../lib/rc-sheets/bars';
  import { columnLabel, tieLabel } from '../../../lib/rc-sheets/column-row';
  import { SLAB_FACES } from '../../../lib/rc-sheets/slab-row';
  import { wallLabel } from '../../../lib/rc-sheets/wall-row';
  import { SHEET_FAMILIES, type SheetFamily } from '../../../lib/rc-sheets/types';
  import RcSteps from './RcSteps.svelte';
  import RcCodePicker from './RcCodePicker.svelte';
  import RcChecks from './RcChecks.svelte';
  import RcCombos from './RcCombos.svelte';
  import RcLineDetail from './RcLineDetail.svelte';
  import type { LineLayout } from '../../../lib/rc-sheets/beam-line';
  import RcRowEditor from './RcRowEditor.svelte';
  import RcSectionSvg from './RcSectionSvg.svelte';
  import { columnSection } from '../../../lib/rc-sheets/drawing';
  import RcColumnElevation from './RcColumnElevation.svelte';
  import RcSlabLayers from './RcSlabLayers.svelte';
  import RcWallDetail from './RcWallDetail.svelte';
  import { sheetCode } from '../../../lib/store/rc-sheets.svelte';
  import { designData } from '../../../lib/store/design-data';
  import { modelStore } from '../../../lib/store';

  let { onclose, family = $bindable<SheetFamily>('beam') }: { onclose: () => void; family?: SheetFamily } = $props();

  let level = $state('');
  let failingOnly = $state(false);
  let openKey = $state<string | null>(null);

  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const EMPTY: SheetRows = { beam: [], line: [], column: [], slab: [], wall: [], punching: [], code: '', basis: 'combinations', combos: 0 };
  const view = liveSheetRows(() => true);
  const code = $derived.by(() => { void modelStore.designData; return sheetCode(); });
  const slabCover = $derived.by(() => { void modelStore.designData; return designData().covers.slab; });
  const endZones = $derived.by(() => { void modelStore.designData; return designData().columnEndZones === true; });
  const rows = $derived(view.rows ?? EMPTY);
  const basisText = $derived(rows.basis === 'combinations' ? tp('rcSheets.basis.combinations', { n: rows.combos }) : t(`rcSheets.basis.${rows.basis}`));
  const spansOf = (l: LineLayout) => rows.beam.filter((r) => r.demand.line?.group === l.group);
  const lineStatus = (l: LineLayout) => (l.status === 'fail' || spansOf(l).some((r) => r.status === 'fail') ? 'fail' : spansOf(l).some((r) => r.status === 'warn') ? 'warn' : 'ok');
  type ListRow = SheetRow | (LineLayout & { family: 'line'; status: 'ok' | 'warn' | 'fail' });
  const all = $derived((family === 'beam' ? rows.line.map((l) => ({ ...l, family: 'line' as const, status: lineStatus(l) })) : rows[family]) as ListRow[]);
  const levels = $derived([...new Set(all.map((r) => r.level ?? ''))]);
  const shown = $derived(all.filter((r) => (!level || (r.level ?? '') === level) && (!failingOnly || r.status === 'fail')));
  const counts = $derived(Object.fromEntries(SHEET_FAMILIES.map((f) => {
    const list = (f === 'beam' ? rows.line.map((l) => ({ status: lineStatus(l) })) : rows[f]) as Array<{ status: string }>;
    return [f, { n: list.length, fail: list.filter((r) => r.status === 'fail').length }];
  })) as Record<SheetFamily, { n: number; fail: number }>);
  const f1 = (v: number) => fmt(v, 1);
  const f2 = (v: number) => fmt(v, 2);

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
  function onkey(e: KeyboardEvent) { if (e.key === 'Escape') onclose(); }
</script>

<svelte:window onkeydown={onkey} />

<div class="rcw" class:st-panel-scrollbars={uiStore.panelScrollbars && !uiStore.isMobile} use:portal role="dialog" aria-modal="true" aria-label={t('rcSheets.title')} data-testid="rc-sheets-workspace">
  <!-- One row at any width: what matters least gives way first (the container queries below). -->
  <header class="rcw-head" title={basisText}>
    <strong class="rcw-name">{t('rcSheets.title')}</strong>
    <span class="rcw-code" data-testid="rc-code"><RcCodePicker compact /></span>
    <span class="rcw-dim rcw-basis">{basisText}</span>
    {#if view.building && view.rows}<span class="rcw-dim" role="status" data-testid="rc-updating">{t('rcSheets.updating')}</span>{/if}
    <div class="rcw-tabs" role="tablist">
      {#each SHEET_FAMILIES as f (f)}
        <button type="button" role="tab" aria-selected={family === f} class:on={family === f} data-testid={`rc-tab-${f}`} onclick={() => { family = f; level = ''; openKey = null; }}>
          {t(`rcSheets.family.${f}`)} <small>{counts[f].n}{counts[f].fail ? ` · ${counts[f].fail} ✗` : ''}</small>
        </button>
      {/each}
    </div>
    <div class="rcw-tools">
      <label class="rcw-ctl" title={t('rcSheets.col.level')}><span class="wide">{t('rcSheets.col.level')}</span>
        <select bind:value={level} aria-label={t('rcSheets.col.level')}>
          <option value="">{t('rcSheets.allLevels')}</option>
          {#each levels as l (l)}<option value={l}>{l || '—'}</option>{/each}
        </select>
      </label>
      <label class="rcw-ctl" title={t('rcSheets.onlyFailing')}><input type="checkbox" bind:checked={failingOnly} aria-label={t('rcSheets.onlyFailing')} /> <span class="wide">{t('rcSheets.onlyFailing')}</span><span class="narrow">✗</span></label>
      <button type="button" class="rcs-btn" title={t('rcSheets.adoptAll')} onclick={() => adoptAll(shown.filter((r): r is Exclude<ListRow, { family: 'punching' }> => r.family !== 'punching'))} disabled={!shown.length}><span class="wide">{t('rcSheets.adoptAll')}</span><span class="narrow">{t('rcSheets.adoptAllShort')}</span></button>
      <button type="button" class="rcs-btn" title={t('rcSheets.export')} onclick={() => downloadRcSheets(rows, t)} disabled={!rows.beam.length && !rows.column.length && !rows.slab.length && !rows.wall.length && !rows.punching.length}><span class="wide">{t('rcSheets.export')}</span><span class="narrow">{t('rcSheets.exportShort')}</span></button>
    </div>
    <button type="button" class="rcs-btn rcw-close" onclick={onclose} aria-label={t('rcSheets.close')} data-testid="rc-close">✕</button>
  </header>

  <div class="rcw-body">
    {#if !view.rows}
      {@const z = sheetSize()}
      <p class="rcw-empty" role="status" data-testid="rc-building">{tp('rcSheets.building', { combos: z.combos, members: z.members, shells: z.shells })}</p>
    {:else if !all.length}
      <p class="rcw-empty" data-testid="rc-empty">{t(rows.basis === 'none' ? 'rcSheets.solveFirst' : `rcSheets.empty.${family}`)}</p>
    {:else}
      <table class="rcw-table" data-testid={`rc-table-${family}`}>
        <thead>
          {#if family === 'beam'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>{t('rcSheets.line.spans')}</th><th>L</th>
              <th>{t('rcSheets.line.runBottom')}</th><th>{t('rcSheets.line.runTop')}</th><th>{t('rcSheets.line.supports')}</th><th>{t('rcSheets.line.spans')} +</th><th>{t('rcSheets.col.stirrups')}</th><th>{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else if family === 'column'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>b × h</th><th>Pu</th><th>ρ</th>
              <th>{t('rcSheets.col.bars')}</th><th>{t('rcSheets.col.ties')}</th><th>{t('rcSheets.col.crossties')}</th><th>{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else if family === 'punching'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>{t('rcSheets.s.punchPosition')}</th><th>Vu</th><th>φVc</th><th>{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else if family === 'wall'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>lw × t</th><th>Pu</th><th>Mu</th><th>Vu</th>
              <th>ρl · ρt {t('rcSheets.req')}</th><th>{t('rcSheets.col.bars')}</th><th>{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>h</th><th>Lx × Ly</th>
              {#each SLAB_FACES as f (f)}<th>{t(`rcSheets.face.${f}`)}</th>{/each}<th>{t('rcSheets.col.status')}</th></tr>
          {/if}
        </thead>
        <tbody>
          {#each shown as r (r.key)}
            <tr class="row st-{r.status}" class:open={openKey === r.key} onclick={() => (openKey = openKey === r.key ? null : r.key)} data-testid="rc-row">
              <td class="nm">{r.name}{#if !r.isAdopted}<span class="tag" title={t('rcSheets.showingProposal')}>P</span>{/if}</td>
              <td>{r.level ?? ''}</td>
              {#if r.family === 'line'}
                <td class="n">{r.spans.length}</td>
                <td class="n">{f2(r.length)}</td>
                <td>{r.adopted.bottom.count} Ø{r.adopted.bottom.dia}</td>
                <td>{r.adopted.top.count} Ø{r.adopted.top.dia}</td>
                <td>{r.adopted.supportTop.map((g, j) => (g.count ? `${j + 1}: ${g.count}Ø${g.dia}` : '')).filter(Boolean).join(' · ') || '—'}</td>
                <td>{r.adopted.spanBottom.map((g, k) => (g.count ? `${k + 1}: ${g.count}Ø${g.dia}` : '')).filter(Boolean).join(' · ') || '—'}</td>
                <td>{[...new Set((r.adopted.stirrups ?? []).map((x) => stirrupsLabel(x)))].join(' · ')}</td>
                <td class="n">{fmt(r.utilization, 2)}</td>
              {:else if r.family === 'beam'}
                <td>{fmt(r.b * 100, 0)}×{fmt(r.h * 100, 0)}</td>
                <td class="n">{f1(Math.max(r.demand.start.pos.value, r.demand.span.pos.value, r.demand.end.pos.value))}</td>
                <td class="n">{f1(Math.max(r.demand.start.neg.value, r.demand.span.neg.value, r.demand.end.neg.value, r.demand.negAny.value))}</td>
                <td class="n">{f1(r.demand.vu.value)}</td>
                <td class="n">{f1(r.demand.tu.value)}</td>
                <td><span class="need">{f2(r.req.bottom)}</span> {groupsLabel(r.adopted.bottom)} <span class="dim">({f2(groupsArea(r.adopted.bottom))})</span></td>
                <td><span class="need">{f2(r.req.top)}</span> {groupsLabel(r.adopted.top)} <span class="dim">({f2(groupsArea(r.adopted.top))})</span></td>
                <td>{stirrupsLabel(r.adopted.stirrups)}</td>
                <td>{r.req.torsionNeglected ? '—' : `${r.adopted.torsionLong ? groupsLabel([r.adopted.torsionLong]) : '—'} (${f2(r.req.al)})`}</td>
              {:else if r.family === 'column'}
                <td>{fmt(r.b * 100, 0)}×{fmt(r.h * 100, 0)}</td>
                <td class="n">{f1(Math.max(0, ...r.demand.cases.map((c) => c.pu)))}</td>
                <td class="n">{f2(r.req.rho * 100)} %</td>
                <td>{columnLabel(r.adopted)} <span class="dim">({f2(r.checks.area)})</span></td>
                <td>{tieLabel(r.adopted)}</td>
                <td>{r.checks.crossties.x} · {r.checks.crossties.y}</td>
                <td class="n">{fmt(r.checks.ratio, 2)}</td>
              {:else if r.family === 'punching'}
                <td>{r.position}</td>
                <td class="n">{f1(r.vu)}</td>
                <td class="n">{f1(r.phiVc)}</td>
                <td class="n">{fmt(r.utilization, 2)}</td>
              {:else if r.family === 'wall'}
                <td>{f2(r.length)} m × {fmt(r.thickness * 100, 0)}</td>
                <td class="n">{f1(Math.max(0, ...r.demand.combos.map((k) => k.pu)))}</td>
                <td class="n">{f1(Math.max(0, ...r.demand.combos.map((k) => k.mu)))}</td>
                <td class="n">{f1(Math.max(0, ...r.demand.combos.map((k) => k.vu)))}</td>
                <td class="n">{fmt(r.req.rhoL * 100, 3)} · {fmt(r.req.rhoT * 100, 3)} %</td>
                <td>{wallLabel(r.adopted)}</td>
                <td class="n">{fmt(r.utilization, 2)}</td>
              {:else}
                <td>{fmt(r.h * 100, 0)}</td>
                <td>{f2(r.lx)} × {f2(r.ly)}</td>
                {#each SLAB_FACES as f (f)}
                  <td><span class="need">{f2(r.faces[f].asReq)}</span> {r.adopted[f].dia ? meshLabel(r.adopted[f]) : '—'} <span class="dim">({f2(meshArea(r.adopted[f]))})</span></td>
                {/each}
              {/if}
              <td class="stc">{t(`rcSheets.status.${r.status}`)}</td>
            </tr>
            {#if openKey === r.key}
              <tr class="detail">
                <td colspan="13">
                  {#if r.family === 'line'}
                    <RcLineDetail line={r} spans={spansOf(r)} />
                  {:else}
                  {#if r.family !== 'punching'}<RcRowEditor row={r} />{/if}
                  {#if r.family === 'column'}
                    <div class="rcw-secs">
                      <RcSectionSvg drawing={columnSection(r.b, r.h, r.cover, r.adopted)} title="{r.name} · {fmt(r.b * 100, 0)}×{fmt(r.h * 100, 0)}"
                        notes={[columnLabel(r.adopted), `${tieLabel(r.adopted)} · ${t('rcSheets.col.crossties')} ${r.checks.crossties.x} · ${r.checks.crossties.y}`]} />
                      <RcColumnElevation row={r} {code} {endZones} />
                    </div>
                  {:else if r.family === 'slab'}
                    <div class="rcw-secs"><RcSlabLayers row={r} cover={slabCover} /></div>
                  {:else if r.family === 'wall'}
                    <div class="rcw-secs"><RcWallDetail row={r} {code} /></div>
                  {/if}
                  <RcChecks lines={r.verifications} />
                  <details open={r.status === 'fail'}>
                    <summary>{t('rcSheets.combo.title')} ({r.combos.rows.length})</summary>
                    <RcCombos table={r.combos} />
                  </details>
                  <details open>
                    <summary>{t('rcSheets.steps')}</summary>
                    <RcSteps groups={r.steps} />
                  </details>
                  {/if}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
      <p class="rcw-note">{t('rcSheets.scopeNote')}</p>
    {/if}
  </div>
</div>

<style>
  .rcw { position: fixed; inset: 0; z-index: 1000; background: var(--st-surface); color: var(--st-text); display: flex; flex-direction: column; }
  .rcw-head { container-type: inline-size; display: flex; align-items: center; flex-wrap: nowrap; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--st-hair); }
  .rcw-name { flex: none; white-space: nowrap; }
  .rcw-code { flex: none; }
  .rcw-basis { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rcw-tools { flex: none; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .rcw-close { flex: none; min-width: 30px; min-height: 28px; font-size: 0.85rem; }
  .narrow { display: none; }
  @container (max-width: 1500px) { .rcw-basis { display: none; } .rcw-tabs { margin-left: auto; } }
  @container (max-width: 1320px) { .rcw-code :global(.rcc > span) { display: none; } .rcw-tools .wide { display: none; } .rcw-tools .narrow { display: inline; } }
  @container (max-width: 1120px) { .rcw-tabs small { display: none; } .rcw-name { display: none; } }
  @container (max-width: 940px) { .rcw-tabs { flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: thin; } }
  .rcw-head strong { font-family: var(--st-display); font-size: 0.9rem; }
  .rcw-dim { font-size: 0.72rem; color: var(--st-text-3); }
  .rcw-code { font-size: 0.72rem; font-weight: 600; border: 1px solid var(--st-hair); border-radius: 4px; padding: 1px 6px; color: var(--st-text); }
  details { margin: 4px 0 8px; }
  summary { cursor: pointer; font-size: 0.72rem; font-weight: 600; color: var(--st-text-2); margin-bottom: 4px; }
  .rcw-tabs { flex: none; display: flex; flex-wrap: nowrap; gap: 2px; }
  .rcw-tabs button { flex: none; white-space: nowrap; }
  .rcw-tabs button { border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text-2); border-radius: 4px; padding: 3px 10px; font-size: 0.76rem; cursor: pointer; }
  .rcw-tabs button.on { background: var(--st-accent, var(--st-surface-3)); color: var(--st-on-accent, var(--st-text)); }
  .rcw-tabs small { opacity: 0.75; }
  .rcw-ctl { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--st-text-2); }
  .rcw-ctl select { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
  .rcs-btn:disabled { opacity: 0.5; cursor: default; }
  .rcw-body { flex: 1; min-height: 0; overflow: auto; padding: 8px 12px 16px; }
  .rcw-empty { color: var(--st-text-2); font-size: 0.8rem; max-width: 60ch; }
  .rcw-table { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
  th { position: sticky; top: 0; background: var(--st-surface-2); text-align: left; font-weight: 600; color: var(--st-text-2); padding: 4px 6px; border-bottom: 1px solid var(--st-hair); white-space: nowrap; }
  td { padding: 3px 6px; border-bottom: 1px solid var(--st-hair); white-space: nowrap; }
  tr.row { cursor: pointer; }
  tr.row:hover { background: var(--st-surface-2); }
  tr.open { background: var(--st-surface-2); }
  .n { text-align: right; font-family: var(--st-mono); }
  .need { font-family: var(--st-mono); color: var(--st-text-3); margin-right: 4px; }
  .need::after { content: ' →'; }
  .dim { color: var(--st-text-3); }
  .nm { font-weight: 600; }
  .tag { margin-left: 4px; font-size: 0.6rem; border: 1px solid var(--st-hair); border-radius: 3px; padding: 0 3px; color: var(--st-text-3); }
  .stc { font-weight: 600; }
  tr.st-ok .stc { color: var(--st-ok); }
  tr.st-warn .stc { color: var(--st-warn); }
  tr.st-fail .stc { color: var(--st-danger); }
  tr.detail td { white-space: normal; padding: 8px; background: var(--st-surface); }
  tr.detail :global(.rce) { margin-bottom: 8px; }
  .rcw-note { font-size: 0.7rem; color: var(--st-text-3); margin-top: 8px; max-width: 90ch; }
  .rcw-secs { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin: 6px 0 8px; }
</style>
