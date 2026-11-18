<script lang="ts">
  import { t, tp, i18n, tpn } from '../../../lib/i18n';
  import { fullScreenWorkspace } from '../../../lib/store/fullscreen-workspace.svelte';
  import { extraBarsText } from '../../../lib/rc-sheets/line-geometry';
  import { adoptAll, downloadRcSheets, type SheetRow, type SheetRows } from '../../../lib/store/rc-sheets.svelte';
  import { designSheets, followSheetEdits, sheetsRun, sheetsStale } from '../../../lib/store/rc-sheets-view.svelte';
  import RcSheetsProgress from './RcSheetsProgress.svelte';
  import RcCoversNotice from './RcCoversNotice.svelte';
  import RcLeftOut from './RcLeftOut.svelte';
  import { uiStore } from '../../../lib/store';
  import { decimalFor, makeFmt } from '../../../lib/rc-sheets/format';
  import { groupsArea, groupsLabel, meshArea, meshLabel, stirrupsLabel } from '../../../lib/rc-sheets/bars';
  import { columnLabel, crosstiesText, tieLabel } from '../../../lib/rc-sheets/column-row';
  import { SLAB_FACES } from '../../../lib/rc-sheets/slab-row';
  import { wallLabel } from '../../../lib/rc-sheets/wall-row';
  import { SHEET_FAMILIES, type SheetFamily } from '../../../lib/rc-sheets/types';
  import RcSteps from './RcSteps.svelte';
  import RcCodePicker from './RcCodePicker.svelte';
  import RcChecks from './RcChecks.svelte';
  import RcCombos from './RcCombos.svelte';
  import RcLineDetail from './RcLineDetail.svelte';
  import { lineRowStatus, type LineLayout } from '../../../lib/rc-sheets/beam-line';
  import RcRowEditor from './RcRowEditor.svelte';
  import RcColumnSection from './RcColumnSection.svelte';
  import RcColumnElevation from './RcColumnElevation.svelte';
  import RcSlabLayers from './RcSlabLayers.svelte';
  import RcSlabPlan from './RcSlabPlan.svelte';
  import RcStructurePlan from './RcStructurePlan.svelte';
  import { structurePlanOf } from '../../../lib/store/rc-structure-plan';
  import { slabSpanKind } from '../../../lib/rc-sheets/slab-plan';
  import RcWallDetail from './RcWallDetail.svelte';
  import RcPunchingSvg from './RcPunchingSvg.svelte';
  import RcFootingDetail from './RcFootingDetail.svelte';
  import { meshText } from '../../../lib/rc-sheets/footing-mesh';
  import { FOOTING_SIZINGS } from '../../../lib/rc-sheets/footing-types';
  import { footingSizing, setFootingSizing } from '../../../lib/store/rc-sheets-footings';
  import { rcSheetsData } from '../../../lib/store/rc-sheets.svelte';
  import RcResize from './RcResize.svelte';
  import { noArrangement } from '../../../lib/store/rc-sheets-resize';
  import RcScheduleView from './RcScheduleView.svelte';
  import RcPlansExport from './RcPlansExport.svelte';
  import type { ElementRef } from '../../../lib/rc-sheets/schedule/views';
  import { tick } from 'svelte';
  import { editedKeys, sheetCode } from '../../../lib/store/rc-sheets.svelte';
  import { designData } from '../../../lib/store/design-data';
  import { modelStore, resultsStore } from '../../../lib/store';
  import { sheetsSolve, solveAndDesign } from '../../../lib/store/rc-sheets-solve.svelte';

  let { onclose, family = $bindable<SheetFamily>('beam') }: { onclose: () => void; family?: SheetFamily } = $props();

  let level = $state('');
  let failingOnly = $state(false);
  let editedOnly = $state(false);
  let openKey = $state<string | null>(null);
  let slabView = $state<'panels' | 'plan'>('panels');
  let structView = $state<'list' | 'plan'>('list');
  let schedule = $state(false);
  let plansOpen = $state(false);
  let highlight = $state<string[]>([]);

  const fmt = $derived(makeFmt(decimalFor(i18n.locale)));
  const EMPTY: SheetRows = { beam: [], line: [], column: [], slab: [], slabPlan: [], wall: [], punching: [], footing: [], code: '', basis: 'combinations', combos: 0 };
  followSheetEdits();
  const stale = $derived(sheetsStale());
  const code = $derived.by(() => { void modelStore.designData; return sheetCode(); });
  const sizing = $derived.by(() => { void modelStore.designData; return footingSizing(rcSheetsData()); });
  const slabCover = $derived.by(() => { void modelStore.designData; return designData().covers.slab; });
  const endZones = $derived.by(() => { void modelStore.designData; return designData().columnEndZones === true; });
  const rows = $derived(sheetsRun.rows ?? EMPTY);
  const basisText = $derived(rows.basis === 'combinations' ? tpn('rcSheets.basis.combinations', rows.combos) : t(`rcSheets.basis.${rows.basis}`));
  const spansOf = (l: LineLayout) => rows.beam.filter((r) => r.demand.line?.group === l.group);
  const lineStatus = (l: LineLayout) => lineRowStatus(l, spansOf(l));
  const nothingFits = (r: ListRow) => noArrangement(r, r.family === 'line' ? spansOf(r) : []);
  type ListRow = SheetRow | (LineLayout & { family: 'line'; status: 'ok' | 'warn' | 'fail' });
  const all = $derived((family === 'beam' ? rows.line.map((l) => ({ ...l, family: 'line' as const, status: lineStatus(l) })) : rows[family]) as ListRow[]);
  const levels = $derived([...new Set(all.map((r) => r.level ?? ''))]);
  const edited = $derived.by(() => { void modelStore.designData; return editedKeys(); });
  const shown = $derived(all.filter((r) => (!level || (r.level ?? '') === level) && (!failingOnly || r.status === 'fail') && (!editedOnly || edited.has(r.key))));
  const counts = $derived(Object.fromEntries(SHEET_FAMILIES.map((f) => {
    const list = (f === 'beam' ? rows.line.map((l) => ({ status: lineStatus(l) })) : rows[f]) as Array<{ status: string }>;
    return [f, { n: list.length, fail: list.filter((r) => r.status === 'fail').length }];
  })) as Record<SheetFamily, { n: number; fail: number }>);
  const planFamily = $derived(family === 'beam' || family === 'column' || family === 'wall' ? family : null);
  const structPlan = $derived(planFamily && structView === 'plan' && level ? structurePlanOf(planFamily, level, rows) : null);
  $effect(() => { if (planFamily && structView === 'plan' && !schedule && !level && levels.length) level = levels[0]!; });
  const levelPlan = $derived(rows.slabPlan.find((p) => p.level === level) ?? rows.slabPlan[0]);
  const f1 = (v: number) => fmt(v, 1);
  const f2 = (v: number) => fmt(v, 2);

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
  function onkey(e: KeyboardEvent) { if (e.key !== 'Escape') return; if (plansOpen) plansOpen = false; else onclose(); }
  const openRow = $derived(openKey ? shown.find((r) => r.key === openKey) : undefined);
  const drawable = $derived(rows.line.length + rows.column.length + rows.wall.length + rows.slabPlan.length + rows.footing.length > 0);
  async function openFromSchedule(el: ElementRef, marks: string[]) {
    const plan = el.key.startsWith('slabplan:');
    schedule = false;
    failingOnly = false;
    editedOnly = false;
    family = el.family;
    slabView = plan ? 'plan' : 'panels';
    structView = 'list';
    level = plan ? el.level ?? '' : '';
    openKey = plan ? null : el.key;
    highlight = marks;
    await tick();
    const target = plan ? document.querySelector('[data-testid="rc-plan-svg"]') : document.querySelector(`[data-testid="rc-row"][data-key="${CSS.escape(el.key)}"]`);
    target?.scrollIntoView({ block: 'start' });
  }
  async function openFromPlan(key: string) {
    structView = 'list';
    failingOnly = false;
    editedOnly = false;
    openKey = key;
    highlight = [];
    await tick();
    document.querySelector(`[data-testid="rc-row"][data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'start' });
  }
  $effect(() => fullScreenWorkspace.enter());

  let head = $state<HTMLElement | null>(null);
  const FIT_STEPS = 3;
  // An expression, not a literal: with data-fit="0" written out the compiler drops every [data-fit="2"] rule as unused.
  const fitStart: number = 0;
  $effect(() => {
    const el = head;
    if (!el) return;
    const refit = () => {
      for (let step = 0; step <= FIT_STEPS; step++) {
        el.dataset.fit = String(step);
        if (el.scrollWidth <= el.clientWidth) break;
      }
    };
    refit();
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    const mo = new MutationObserver(refit);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  });
</script>

<svelte:window onkeydown={onkey} />

<div class="rcw" class:st-panel-scrollbars={uiStore.panelScrollbars && !uiStore.isMobile} use:portal role="dialog" aria-modal="true" aria-label={t('rcSheets.title')} data-testid="rc-sheets-workspace">
  <header class="rcw-head" title={basisText} bind:this={head} data-testid="rc-head" data-fit={fitStart}>
    <strong class="rcw-name">{t('rcSheets.title')}</strong>
    <span class="rcw-code" data-testid="rc-code"><RcCodePicker compact /></span>
    <span class="rcw-dim rcw-basis">{basisText}</span>
    {#if stale && !sheetsRun.progress}<span class="rcw-dim rcw-stale" data-testid="rc-stale">{t('rcSheets.staleShort')}</span><button type="button" class="rcs-btn" onclick={designSheets} data-testid="rc-redesign">{t('rcSheets.redesign')}</button>{/if}
    <div class="rcw-tabs" role="tablist">
      {#each SHEET_FAMILIES as f (f)}
        <button type="button" role="tab" aria-selected={!schedule && family === f} class:on={!schedule && family === f} data-testid={`rc-tab-${f}`} onclick={() => { family = f; schedule = false; level = ''; openKey = null; highlight = []; }}>
          {t(`rcSheets.family.${f}`)} <small>{counts[f].n}{counts[f].fail ? ` · ${counts[f].fail} ✗` : ''}</small>
        </button>
      {/each}
      <button type="button" role="tab" aria-selected={schedule} class:on={schedule} data-testid="rc-tab-schedule" onclick={() => { schedule = true; openKey = null; }}>{t('rcSheets.bbs.title')}</button>
    </div>
    <div class="rcw-tools">
      {#if !schedule}
      <label class="rcw-ctl" title={t('rcSheets.col.level')} data-testid="rc-level-filter"><span class="wide">{t('rcSheets.col.level')}</span>
        <select bind:value={level} aria-label={t('rcSheets.col.level')}>
          <option value="">{t('rcSheets.allLevels')}</option>
          {#each levels as l (l)}<option value={l}>{l || '—'}</option>{/each}
        </select>
      </label>
      <label class="rcw-ctl" title={t('rcSheets.onlyFailing')}><input type="checkbox" bind:checked={failingOnly} aria-label={t('rcSheets.onlyFailing')} /> <span class="wide">{t('rcSheets.onlyFailing')}</span><span class="narrow">✗</span></label>
      <label class="rcw-ctl" title={t('rcSheets.onlyEdited')}><input type="checkbox" bind:checked={editedOnly} aria-label={t('rcSheets.onlyEdited')} data-testid="rc-only-edited" /> <span class="wide">{t('rcSheets.onlyEdited')}</span><span class="narrow">✎</span></label>
      {/if}
      <button type="button" class="rcs-btn" title={t('rcSheets.adoptAll')} onclick={() => adoptAll(shown.filter((r): r is Exclude<ListRow, { family: 'punching' }> => r.family !== 'punching'))} disabled={!shown.length}><span class="wide">{t('rcSheets.adoptAll')}</span><span class="narrow">{t('rcSheets.adoptAllShort')}</span></button>
      <button type="button" class="rcs-btn" title={t('rcSheets.plans.export')} onclick={() => (plansOpen = true)} disabled={!sheetsRun.rows || !drawable} data-testid="rc-plans-export"><span class="wide">{t('rcSheets.plans.export')}</span><span class="narrow">{t('rcSheets.plans.exportShort')}</span></button>
      <button type="button" class="rcs-btn" title={t('rcSheets.export')} onclick={() => downloadRcSheets(rows, t)} data-testid="rc-export-workbook" disabled={stale || !rows.beam.length && !rows.column.length && !rows.slab.length && !rows.wall.length && !rows.punching.length && !rows.footing.length}><span class="wide">{t('rcSheets.export')}</span><span class="narrow">{t('rcSheets.exportShort')}</span></button>
    </div>
    <button type="button" class="rcs-btn rcw-close" onclick={onclose} aria-label={t('rcSheets.close')} data-testid="rc-close">✕</button>
  </header>

  {#if plansOpen}
    <RcPlansExport {rows} current={openRow && openRow.family !== 'punching' ? { key: openRow.key, name: openRow.name } : null} onclose={() => (plansOpen = false)} />
  {/if}
  <div class="rcw-body">
    <RcCoversNotice />
    {#if sheetsRun.rows && !schedule}<RcLeftOut left={rows.left ?? []} />{/if}
    {#if sheetsRun.progress}
      <div class="rcw-empty"><RcSheetsProgress progress={sheetsRun.progress} /></div>
    {:else if !sheetsRun.rows && !resultsStore.results3D}
      <p class="rcw-empty" data-testid="rc-not-solved">{t(sheetsSolve.busy ? 'rcSheets.solving' : 'rcSheets.solveFirst')}</p>
      <button type="button" class="rcs-btn primary" onclick={() => solveAndDesign()} disabled={sheetsSolve.busy} data-testid="rc-solve-design">{t('rcSheets.solveAndDesign')}</button>
    {:else if !sheetsRun.rows}
      <p class="rcw-empty" data-testid="rc-not-designed">{t('rcSheets.designHint')}</p>
      <button type="button" class="rcs-btn primary" onclick={designSheets} data-testid="rc-design">{t('rcSheets.design')}</button>
    {:else if schedule}
      <RcScheduleView {rows} onopen={openFromSchedule} />
    {:else if !all.length}
      <p class="rcw-empty" data-testid="rc-empty">{t(rows.basis === 'none' ? 'rcSheets.solveFirst' : `rcSheets.empty.${family}`)}</p>
    {:else}
      {#if family === 'slab'}
        <div class="rcw-views" role="tablist" aria-label={t('rcSheets.slabView.label')}>
          <button type="button" role="tab" aria-selected={slabView === 'panels'} class:on={slabView === 'panels'} onclick={() => (slabView = 'panels')} data-testid="rc-slab-view-panels">{t('rcSheets.slabView.panels')}</button>
          <button type="button" role="tab" aria-selected={slabView === 'plan'} class:on={slabView === 'plan'} onclick={() => { slabView = 'plan'; if (!level && levelPlan) level = levelPlan.level; }} disabled={!rows.slabPlan.length} data-testid="rc-slab-view-plan">{t('rcSheets.slabView.plan')}</button>
        </div>
      {/if}
      {#if planFamily}
        <div class="rcw-views" role="tablist" aria-label={t('rcSheets.structView.label')}>
          <button type="button" role="tab" aria-selected={structView === 'list'} class:on={structView === 'list'} onclick={() => (structView = 'list')} data-testid="rc-struct-view-list">{t('rcSheets.structView.list')}</button>
          <button type="button" role="tab" aria-selected={structView === 'plan'} class:on={structView === 'plan'} onclick={() => { structView = 'plan'; if (!level && levels.length) level = levels[0]!; }} data-testid="rc-struct-view-plan">{t('rcSheets.slabView.plan')}</button>
        </div>
      {/if}
      {#if family === 'footing'}
        <label class="rcw-ctl rcw-sizing"><span>{t('rcSheets.footSizing.label')}</span>
          <select value={sizing} onchange={(e) => setFootingSizing((e.currentTarget as HTMLSelectElement).value as typeof sizing)} data-testid="rc-footing-sizing">
            {#each FOOTING_SIZINGS as m (m)}<option value={m}>{t(`rcSheets.footSizing.${m}`)}</option>{/each}
          </select>
        </label>
      {/if}
      {#if family === 'slab' && slabView === 'plan'}
        {#if levelPlan}{#key levelPlan.level}<RcSlabPlan plan={levelPlan} {highlight} />{/key}{/if}
      {:else if structPlan}
        {#key `${structPlan.family}:${structPlan.level}`}<RcStructurePlan plan={structPlan} onopen={openFromPlan} />{/key}
      {:else}
      <table class="rcw-table" data-testid={`rc-table-${family}`}>
        <thead>
          {#if family === 'beam'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th class="n">{t('rcSheets.line.spans')}</th><th class="n">L</th>
              <th>{t('rcSheets.line.runBottom')}</th><th>{t('rcSheets.line.runTop')}</th><th>{t('rcSheets.line.supports')}</th><th>{t('rcSheets.line.spans')} +</th><th>{t('rcSheets.col.stirrups')}</th><th class="n">{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else if family === 'column'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>b × h</th><th class="n">Pu</th><th class="n">ρ</th>
              <th>{t('rcSheets.col.bars')}</th><th>{t('rcSheets.col.ties')}</th><th>{t('rcSheets.col.crossties')}</th><th class="n">{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else if family === 'punching'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>{t('rcSheets.s.punchPosition')}</th><th class="n">Vu</th><th class="n">φVc</th><th class="n">{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else if family === 'footing'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>B × L × h</th><th class="n">N</th><th class="n">{t('rcSheets.foot.soil')}</th>
              <th>{t('rcSheets.foot.mesh.x')}</th><th>{t('rcSheets.foot.mesh.y')}</th><th>{t('rcSheets.foot.dowels')}</th><th class="n">{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else if family === 'wall'}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>lw × t</th><th class="n">Pu</th><th class="n">Mu</th><th class="n">Vu</th>
              <th class="n">ρl · ρt {t('rcSheets.req')}</th><th>{t('rcSheets.col.bars')}</th><th class="n">{t('rcSheets.col.ratio')}</th><th>{t('rcSheets.col.status')}</th></tr>
          {:else}
            <tr><th>{t('rcSheets.col.name')}</th><th>{t('rcSheets.col.level')}</th><th>{t('rcSheets.col.slabKind')}</th><th class="n">h</th><th>Lx × Ly</th>
              {#each SLAB_FACES as f (f)}<th>{t(`rcSheets.face.${f}`)}</th>{/each}<th>{t('rcSheets.col.status')}</th></tr>
          {/if}
        </thead>
        <tbody>
          {#each shown as r (r.key)}
            <tr class="row st-{r.status}" class:open={openKey === r.key} class:none={nothingFits(r)} onclick={() => { openKey = openKey === r.key ? null : r.key; highlight = []; }} data-testid="rc-row" data-key={r.key}>
              <td class="nm">{r.name}{#if nothingFits(r)}<span class="tag none" title={t('rcSheets.alt.closest')} data-testid="rc-no-arrangement-tag">✕</span>{:else if !r.isAdopted}<span class="tag" title={t('rcSheets.showingProposal')}>P</span>{:else if edited.has(r.key)}<span class="tag" title={t('rcSheets.editedByHand')} data-testid="rc-edited-tag">✎</span>{/if}</td>
              <td>{r.level ?? ''}</td>
              {#if r.family === 'line'}
                {@const extra = extraBarsText(r, t('rcSheets.line.bentShort'))}
                <td class="n">{r.spans.length}</td>
                <td class="n">{f2(r.length)}</td>
                <td>{r.adopted.bottom.count} Ø{r.adopted.bottom.dia}</td>
                <td>{r.adopted.top.count} Ø{r.adopted.top.dia}</td>
                <td data-testid="rc-line-supports">{extra.supports}</td>
                <td data-testid="rc-line-spans">{extra.spans}{#if r.bentNotes.length && !r.bars.some((b) => b.kind === 'bent')} <span class="dim" title={r.bentNotes.map((n) => tp(`rcSheets.line.noBent.${n.reason}`, { span: n.span !== undefined ? r.spans[n.span]?.name ?? '' : '', clause: n.clause ?? '' })).join(' ')} data-testid="rc-line-no-bent">{` · ${t('rcSheets.line.noBentShort')}`}</span>{/if}</td>
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
                <td data-testid="rc-col-crossties">{crosstiesText(r.checks.crossties)}</td>
                <td class="n">{fmt(r.checks.ratio, 2)}</td>
              {:else if r.family === 'punching'}
                <td data-testid="rc-punch-position">{r.position === 'interior' || r.position === 'edge' || r.position === 'corner' ? t(`rcSheets.punchPos.${r.position}`) : '—'}</td>
                <td class="n">{f1(r.vu)}</td>
                <td class="n">{f1(r.phiVc)}</td>
                <td class="n">{fmt(r.utilization, 2)}</td>
              {:else if r.family === 'footing'}
                <td>{r.B > 0 ? `${fmt(r.B * 100, 0)}×${fmt(r.L * 100, 0)}×${fmt(r.h * 100, 0)}` : '—'}</td>
                <td class="n">{r.demand.service ? f1(r.demand.service.N) : '—'}</td>
                <td class="n">{r.bearing ? `${fmt(r.bearing.qMax, 0)} / ${r.bearing.allowable ? fmt(r.bearing.allowable, 0) : '—'}` : '—'}</td>
                <td>{meshText(r.adopted.x)}</td>
                <td>{meshText(r.adopted.y)}</td>
                <td>{r.adopted.dowels && !r.uncovered ? `${r.adopted.dowels.count} Ø${r.adopted.dowels.dia}` : '—'}</td>
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
                {@const kind = slabSpanKind(r, rows.slabPlan)}
                <td title={t(`rcSheets.slabKind.${kind}.long`)} data-testid="rc-slab-kind" data-kind={kind}>{t(`rcSheets.slabKind.${kind}`)}</td>
                <td class="n">{fmt(r.h * 100, 0)}</td>
                <td>{f2(r.lx)} × {f2(r.ly)}</td>
                {#each SLAB_FACES as f (f)}
                  <td><span class="need">{f2(r.faces[f].asReq)}</span> {r.adopted[f].dia ? meshLabel(r.adopted[f]) : '—'} <span class="dim">({f2(meshArea(r.adopted[f]))})</span></td>
                {/each}
              {/if}
              <td class="stc" data-testid="rc-row-status">{t(nothingFits(r) ? 'rcSheets.status.noArrangement' : `rcSheets.status.${r.status}`)}</td>
            </tr>
            {#if openKey === r.key}
              <tr class="detail">
                <td colspan="13">
                  {#if r.family === 'line'}
                    <RcLineDetail line={r} spans={spansOf(r)} onleave={onclose} {highlight} />
                  {:else}
                  {#if r.family === 'footing'}<RcFootingDetail row={r} {code} />{:else}<RcResize row={r} walls={rows.wall} onleave={onclose} />{/if}
                  {#if r.family !== 'punching' && r.family !== 'footing'}<RcRowEditor row={r} />{/if}
                  {#if r.family === 'column'}
                    <div class="rcw-secs">
                      <RcColumnSection row={r} all={rows.column} {code} {endZones} />
                      <RcColumnElevation row={r} {code} {endZones} />
                    </div>
                  {:else if r.family === 'slab'}
                    <div class="rcw-secs"><RcSlabLayers row={r} cover={slabCover} /></div>
                  {:else if r.family === 'wall'}
                    <div class="rcw-secs"><RcWallDetail row={r} {code} /></div>
                  {:else if r.family === 'punching' && r.figure}
                    <div class="rcw-secs"><RcPunchingSvg fig={r.figure} name={r.name} /></div>
                  {/if}
                  <RcChecks lines={r.verifications} kind={r.family === 'beam' || r.family === 'column' ? r.family : undefined} />
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
      {/if}
      <p class="rcw-note">{t('rcSheets.scopeNote')}</p>
    {/if}
  </div>
</div>

<style>
  .rcw { position: fixed; inset: 0; z-index: 1000; background: var(--st-surface); color: var(--st-text); display: flex; flex-direction: column; }
  .rcw-head { display: flex; align-items: center; flex-wrap: nowrap; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--st-hair); }
  .rcw-name { flex: none; white-space: nowrap; }
  .rcw-code { flex: none; }
  .rcw-basis { flex: 1 1 0; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rcw-tools { flex: none; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .rcw-close { flex: none; min-width: 30px; min-height: 28px; font-size: 0.85rem; }
  .narrow { display: none; }
  .rcw-head:not([data-fit="0"]) .rcw-basis { display: none; }
  .rcw-head:not([data-fit="0"]) .rcw-tabs { margin-left: auto; }
  .rcw-head:not([data-fit="0"]) .rcw-code :global(.rcc > span) { display: none; }
  .rcw-head:not([data-fit="0"]) .rcw-tools .wide { display: none; }
  .rcw-head:not([data-fit="0"]) .rcw-tools .narrow { display: inline; }
  .rcw-head[data-fit="2"] .rcw-tabs small, .rcw-head[data-fit="3"] .rcw-tabs small { display: none; }
  .rcw-head[data-fit="2"] .rcw-name, .rcw-head[data-fit="3"] .rcw-name { display: none; }
  .rcw-head[data-fit="2"] .rcw-code :global(select), .rcw-head[data-fit="3"] .rcw-code :global(select) { max-width: 11rem; }
  .rcw-head[data-fit="3"] .rcw-tabs { flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: thin; }
  .rcw-head strong { font-family: var(--st-display); font-size: 0.9rem; }
  .rcw-dim { font-size: 0.72rem; color: var(--st-text-3); }
  .rcw-stale { color: var(--st-warn); }
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
  tr.row { cursor: pointer; scroll-margin-top: 32px; }
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
  tr.st-warn .stc { color: var(--st-text-2); }
  tr.st-fail .stc { color: var(--st-danger); }
  .tag.none { color: var(--st-danger); border-color: var(--st-danger); }
  tr.none td:not(.nm):not(.stc) { color: var(--st-text-3); font-style: italic; }
  tr.detail td { white-space: normal; padding: 8px; background: var(--st-surface); }
  tr.detail :global(.rce) { margin-bottom: 8px; }
  .rcw-note { font-size: 0.7rem; color: var(--st-text-3); margin-top: 8px; max-width: 90ch; }
  .rcw-views { display: flex; gap: 2px; margin-bottom: 6px; }
  .rcw-views button { border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text-2); border-radius: 4px; padding: 3px 10px; font-size: 0.74rem; cursor: pointer; }
  .rcw-views button.on { background: var(--st-accent, var(--st-surface-3)); color: var(--st-on-accent, var(--st-text)); }
  .rcw-views button:disabled { opacity: 0.5; cursor: default; }
  .rcw-sizing { margin-bottom: 6px; }
  .rcw-secs { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin: 6px 0 8px; }
</style>
