<script lang="ts">
  /**
   * "What if…?": move a load, a support or a node, scale the stiffness, and watch the answer follow.
   *
   * Docked in the right-hand panel (its header names it and goes back); `docked` false is the
   * floating box PRO opens over its canvas. The session — the model on entry and every change —
   * is `whatIf`'s: see whatif.svelte.ts for why, and for how it recomputes one frame at a time
   * while the last picture stays drawn (`screen-hold`).
   */
  let { docked = false }: { docked?: boolean } = $props();
  import { uiStore, modelStore, resultsStore } from '../lib/store';
  import { whatIf } from '../lib/store/whatif.svelte';
  import { showDiagram } from '../lib/store/view-mode';
  import type { DiagramType } from '../lib/store/results.svelte';
  import { onMount } from 'svelte';
  import { i18n, t } from '../lib/i18n';
  import { fmtQ, toQ, unitQ } from '../lib/store/display-units.svelte';
  import { TWO_D_INTERNAL_FORCE_LABELS as F2D } from '../lib/geometry/coordinate-system';
  import { RESPONSE_QUANTITY, percentChange, response2D, response3D, type Response, type ResponseKey } from '../lib/whatif/response';
  import WhatIfLoads from './whatif/WhatIfLoads.svelte';
  import WhatIfMembers from './whatif/WhatIfMembers.svelte';
  import WhatIfSupports from './whatif/WhatIfSupports.svelte';
  import WhatIfNodes from './whatif/WhatIfNodes.svelte';

  const is3D = $derived(uiStore.is3DWorkspace);

  /* What is on screen, from here: picking it in the ribbon would take the panel away mid-comparison. */
  const diagrams = $derived<Array<{ d: DiagramType; label: string; title: string }>>(is3D
    ? [
        { d: 'deformed', label: 'δ', title: t('ribbon.deformed') },
        { d: 'axial', label: 'N', title: t('ribbon.nameAxial') },
        { d: 'momentY', label: 'My', title: t('ribbon.nameMomentY') },
        { d: 'shearZ', label: 'Vz', title: t('ribbon.nameShearZ') },
        { d: 'momentZ', label: 'Mz', title: t('ribbon.nameMomentZ') },
        { d: 'shearY', label: 'Vy', title: t('ribbon.nameShearY') },
        { d: 'torsion', label: 'T', title: t('ribbon.nameTorsion') },
      ]
    : [
        { d: 'deformed', label: 'δ', title: t('ribbon.deformed') },
        { d: 'axial', label: F2D.axial, title: t('ribbon.nameAxial') },
        { d: 'moment', label: F2D.moment, title: t('ribbon.nameMomentY') },
        { d: 'shear', label: F2D.shear, title: t('ribbon.nameShearZ') },
      ]);

  /* The members painted by what they carry: tension and compression, the moment, or how near yield. */
  type Paint = { key: string; label: string; title: string; diagram: 'axialColor' | 'colorMap'; kind?: 'moment' | 'momentY' | 'stressRatio' };
  const paints = $derived<Paint[]>([
    { key: 'axial', label: `${F2D.axial} ±`, title: t('whatif.paint.axial'), diagram: 'axialColor' },
    { key: 'moment', label: `|${is3D ? 'My' : F2D.moment}|`, title: t('whatif.paint.moment'), diagram: 'colorMap', kind: is3D ? 'momentY' : 'moment' },
    { key: 'ratio', label: 'σ/fy', title: t('whatif.paint.ratio'), diagram: 'colorMap', kind: 'stressRatio' },
  ]);
  const painting = (p: Paint) => resultsStore.diagramType === p.diagram && (!p.kind || resultsStore.colorMapKind === p.kind);
  function paint(p: Paint) {
    if (p.kind) resultsStore.colorMapKind = p.kind;
    showDiagram(p.diagram);
  }

  /*
   * The answer next to the question. The numbers keep their last value between solves, like the
   * picture; the first results of the unchanged model are what each change is measured against.
   */
  const live = $derived<Response | null>(is3D
    ? (resultsStore.results3D ? response3D(resultsStore.results3D) : null)
    : (resultsStore.results ? response2D(resultsStore.results) : null));
  const shown = $derived.by(() => {
    if (uiStore.liveCalcError) return null;
    if (live) return live;
    if (!resultsStore.screen.held) return null;
    const { results, results3D } = resultsStore.screen;
    return is3D ? (results3D && response3D(results3D)) : (results && response2D(results));
  });
  onMount(() => { void whatIf.startReferenceSolve(); });
  $effect(() => { if (live) whatIf.captureReference(); });
  const boundKey = (k: ResponseKey, response: Response | null) => response?.componentEnvelopeBound && (k === 'moment' || k === 'shear') ? 'whatif.resp.' + k + 'Bound' : null;
  const ROWS = $derived<Array<{ k: ResponseKey; key: string }>>([
    { k: 'delta', key: 'whatif.resp.delta' }, { k: 'moment', key: is3D ? 'whatif.resp.momentResultant' : 'whatif.resp.moment' }, { k: 'shear', key: is3D ? 'whatif.resp.shearResultant' : 'whatif.resp.shear' },
    { k: 'axial', key: 'whatif.resp.axial' }, { k: 'reaction', key: 'whatif.resp.reaction' },
  ]);
  const scientific = $derived(new Intl.NumberFormat(i18n.locale, { notation: 'scientific', maximumSignificantDigits: 4 }));
  function value(k: ResponseKey, v: number): string {
    if (!Number.isFinite(v)) return t('solver.diagramExtremaUnavailable');
    const quantity = RESPONSE_QUANTITY[k];
    const formatted = fmtQ(v, quantity);
    const number = v !== 0 && Number(formatted) === 0 ? scientific.format(toQ(v, quantity)) : formatted;
    return `${number} ${unitQ(quantity)}`;
  }
  const percent = $derived(new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: 1 }));

  /* Results off leaves the structure and its loads alone; on again brings back the last diagram. */
  let lastDiagram: DiagramType | null = null;
  let lastReactions = false;
  const resultsOn = $derived(resultsStore.diagramType !== 'none' || resultsStore.showReactions);
  function toggleResults() {
    if (resultsOn) {
      lastDiagram = resultsStore.diagramType;
      lastReactions = resultsStore.showReactions;
      showDiagram('none');
      resultsStore.showReactions = false;
    } else {
      showDiagram(lastDiagram ?? (is3D ? 'momentY' : 'moment'));
      resultsStore.showReactions = lastReactions;
    }
  }
  /* Loads drawn over the results; on by default while the loads are being edited, until the reader turns them off. */
  let loadsTouched = false;
  function toggleLoads() { loadsTouched = true; whatIf.showLoads(!whatIf.loadsShown); }

  type Tab = 'loads' | 'members' | 'supports' | 'nodes';
  let tab = $state<Tab>('loads');
  $effect(() => { if (tab === 'loads' && !loadsTouched) whatIf.showLoads(true); });
  /* Picking on the canvas is the quickest way to say what to change: a member or a node opens its tab. */
  let lastPicked = { members: new Set<number>(), nodes: new Set<number>() };
  $effect(() => {
    const members = new Set(uiStore.selectedElements), nodes = new Set(uiStore.selectedNodes);
    if ([...members].some(id => !lastPicked.members.has(id))) tab = 'members';
    else if (members.size === 0 && [...nodes].some(id => !lastPicked.nodes.has(id))) tab = 'nodes';
    lastPicked = { members, nodes };
  });
  const changedIn = $derived<Record<Tab, boolean>>({
    loads: whatIf.loadFactors.some((f) => f !== 1) || Object.keys(whatIf.loadAt).length > 0 || Object.keys(whatIf.loadNode).length > 0 || Object.keys(whatIf.loadAlong).length > 0,
    members: whatIf.all.e !== 1 || whatIf.all.a !== 1 || whatIf.all.iy !== 1 || [...modelStore.elements.keys()].some((id) => whatIf.isMemberChanged(id)),
    supports: Object.keys(whatIf.supportTypes).length > 0 || Object.keys(whatIf.supportNode).length > 0 || Object.keys(whatIf.supportAlong).length > 0,
    nodes: Object.values(whatIf.nodeShift).some((d) => d.some((v) => v !== 0)),
  });
  const TABS: Array<{ id: Tab; key: string }> = [
    { id: 'loads', key: 'whatif.loads' }, { id: 'members', key: 'whatif.elements' },
    { id: 'supports', key: 'whatif.supports' }, { id: 'nodes', key: 'whatif.nodes' },
  ];
</script>

{#if uiStore.showWhatIf}
  <div class="wif-panel" class:docked data-testid="whatif-panel">
    {#if !docked}
      <div class="wif-header">
        <span class="wif-title">{t('whatif.title')}</span>
        <button class="wif-close" onclick={() => whatIf.close()} title={t('whatif.closeAndRestore')}>✕</button>
      </div>
    {/if}

    <div class="wif-body">
      <div class="wif-bar">
        <span class="wif-live" class:busy={resultsStore.screen.held} data-testid="whatif-live"><span class="wif-dot" aria-hidden="true"></span>{t(resultsStore.screen.held ? 'pro.calculating' : 'whatif.liveNote')}</span>
        <button class="wif-reset" onclick={() => whatIf.reset()} disabled={!whatIf.changed} title={t('whatif.restoreOriginals')}
          data-testid="whatif-reset">{t('whatif.reset')}</button>
      </div>

      <div class="wif-view" role="group" aria-label={t('whatif.result')}>
        <div class="wif-results">
          {#each diagrams as item (item.d)}
            <button class="wif-res-btn" class:active={resultsStore.screen.diagram === item.d}
              title={item.title} onclick={() => showDiagram(item.d)} data-testid="whatif-diagram-{item.d}">{item.label}</button>
          {/each}
        </div>
        <div class="wif-paints">
          <span class="wif-paints-label">{t('whatif.show')}</span>
          <button class="wif-paint-btn" class:active={resultsOn} aria-pressed={resultsOn} onclick={toggleResults} data-testid="whatif-show-results">{t('whatif.showResults')}</button>
          <button class="wif-paint-btn" class:active={whatIf.loadsShown} aria-pressed={whatIf.loadsShown} onclick={toggleLoads} data-testid="whatif-show-loads">{t('whatif.showLoads')}</button>
        </div>
        <div class="wif-paints">
          <span class="wif-paints-label">{t('whatif.paint')}</span>
          {#each paints as p (p.key)}
            <button class="wif-paint-btn" class:active={painting(p)} title={p.title} onclick={() => paint(p)} data-testid="whatif-paint-{p.key}">{p.label}</button>
          {/each}
        </div>
      </div>

      {#if uiStore.liveCalcError}
        <div class="wif-error" role="alert" data-testid="whatif-error">{uiStore.liveCalcError}</div>
      {/if}

      {#if shown || whatIf.reference}
        <table class="wif-resp" data-testid="whatif-response">
          <thead><tr><th></th><th>{t('whatif.resp.original')}</th><th>{t('whatif.resp.now')}</th><th></th></tr></thead>
          <tbody>
            {#each ROWS as r (r.k)}
              {@const before = whatIf.reference?.[r.k]}
              {@const originalBasis = boundKey(r.k, whatIf.reference)}
              {@const currentBasis = boundKey(r.k, shown)}
              {@const pct = before === undefined || !shown || originalBasis !== currentBasis ? null : percentChange(before, shown[r.k])}
              <tr data-testid="whatif-resp-{r.k}">
                <th scope="row">{t(originalBasis && originalBasis === currentBasis ? originalBasis : r.key)}</th>
                <td>{before === undefined ? '—' : value(r.k, before)}{#if originalBasis && originalBasis !== currentBasis} ({t(originalBasis)}){/if}</td>
                <td class="wif-now">{shown ? value(r.k, shown[r.k]) : '—'}{#if currentBasis && originalBasis !== currentBasis} ({t(currentBasis)}){/if}</td>
                <td class="wif-pct" class:up={pct !== null && pct > 0.5} class:down={pct !== null && pct < -0.5}>
                  {pct === null || pct === 0 ? '' : `${pct > 0 ? '▲' : '▼'} ${percent.format(Math.abs(pct) / 100)}`}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

      <div class="wif-tabs" role="tablist">
        {#each TABS as tb (tb.id)}
          <button role="tab" class="wif-tab" class:active={tab === tb.id} aria-selected={tab === tb.id} onclick={() => (tab = tb.id)}
            data-testid="whatif-tab-{tb.id}">{t(tb.key)}{#if changedIn[tb.id]}<span class="wif-tab-dot" aria-hidden="true"></span>{/if}</button>
        {/each}
      </div>
      <div class="wif-tab-body" role="tabpanel">
        {#if tab === 'loads'}<WhatIfLoads />
        {:else if tab === 'members'}<WhatIfMembers />
        {:else if tab === 'supports'}<WhatIfSupports />
        {:else}<WhatIfNodes />{/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .wif-panel {
    position: absolute;
    top: 50px;
    right: 8px;
    z-index: 110;
    width: 260px;
    max-height: calc(100% - 70px);
    display: flex;
    flex-direction: column;
    background: rgba(19, 33, 45, 0.96);
    border: 1px solid var(--st-surface-3);
    border-radius: 8px;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    font-size: 0.72rem;
    color: var(--st-text);
  }
  .wif-panel.docked {
    position: static; width: auto; max-height: none; border: none; border-radius: 0;
    box-shadow: none; backdrop-filter: none; background: transparent; z-index: auto;
  }
  .wif-header { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--st-hair); }
  .wif-title { flex: 1; font-family: var(--st-mono); font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--st-text-2); }
  .wif-close { background: none; border: none; color: var(--st-text-2); cursor: pointer; font-size: 0.8rem; border-radius: 3px; padding: 2px 5px; }
  .wif-close:hover { background: var(--st-accent); color: white; }
  .wif-body { overflow-y: auto; padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 8px; }
  .wif-panel.docked .wif-body { padding: 0 0 6px; overflow: visible; }

  .wif-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .wif-live { display: inline-flex; align-items: center; gap: 5px; font-size: 0.66rem; color: var(--st-text-3); }
  .wif-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--st-ok, #2fb36b); }
  /* While a re-solve is pending the last picture stays drawn; the dot says the answer is on its way. */
  .wif-live.busy .wif-dot { background: var(--st-warn, #e0a030); animation: wif-pulse 0.8s ease-in-out infinite; }
  @keyframes wif-pulse { 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) { .wif-live.busy .wif-dot { animation: none; } }
  .wif-reset {
    background: none; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); color: var(--st-text-2);
    font: inherit; font-size: 0.68rem; padding: 3px 9px; cursor: pointer;
  }
  .wif-reset:hover:not(:disabled) { border-color: var(--st-accent); color: var(--st-accent); }
  .wif-reset:disabled { opacity: 0.4; cursor: default; }

  .wif-view { display: flex; flex-direction: column; gap: 4px; }
  .wif-results, .wif-paints { display: flex; gap: 3px; align-items: center; }
  .wif-res-btn, .wif-paint-btn {
    flex: 1; min-width: 0; padding: 4px 0; background: var(--st-surface-2); border: 1px solid var(--st-hair-strong); border-radius: 4px;
    color: var(--st-text-2); font-family: var(--st-mono); font-size: 0.7rem; cursor: pointer; white-space: nowrap;
  }
  .wif-res-btn:hover, .wif-paint-btn:hover { color: var(--st-text); }
  .wif-res-btn.active, .wif-paint-btn.active { border-color: var(--st-accent); color: var(--st-accent); background: var(--st-selected-bg); }
  .wif-paints-label { flex: none; width: 3.6rem; font-size: 0.64rem; color: var(--st-text-3); padding-right: 2px; }

  .wif-error {
    padding: 6px 8px; border: 1px solid color-mix(in srgb, var(--st-danger, #e5484d) 60%, transparent); border-radius: var(--st-radius);
    color: var(--st-text); font-size: 0.7rem; line-height: 1.4;
  }

  .wif-resp { width: 100%; border-collapse: collapse; font-size: 0.68rem; font-variant-numeric: tabular-nums; }
  .wif-resp th, .wif-resp td { padding: 2px 3px; text-align: right; white-space: nowrap; }
  .wif-resp thead th { font-weight: 400; font-size: 0.6rem; color: var(--st-text-3); text-transform: uppercase; letter-spacing: 0.06em; }
  .wif-resp tbody th { text-align: left; font-weight: 400; color: var(--st-text-2); white-space: normal; }
  .wif-resp td { color: var(--st-text-3); font-family: var(--st-mono); }
  .wif-resp td.wif-now { color: var(--st-text); }
  .wif-pct { min-width: 3.2rem; }
  .wif-pct.up { color: var(--st-warn, #e0a030); }
  .wif-pct.down { color: var(--st-ok, #2fb36b); }

  .wif-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--st-hair); }
  .wif-tab {
    flex: 1; min-width: 0; position: relative; padding: 6px 2px; background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--st-text-2); font: inherit; font-size: 0.72rem; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .wif-tab:hover { color: var(--st-text); }
  .wif-tab.active { color: var(--st-accent); border-bottom-color: var(--st-accent); }
  .wif-tab-dot { display: inline-block; width: 5px; height: 5px; margin-left: 4px; vertical-align: middle; border-radius: 50%; background: var(--st-accent); }
  .wif-tab-body { display: flex; flex-direction: column; gap: 6px; }

  /* The tabs' rows: shared by every tab's component. */
  .wif-panel :global(.wif-item) { padding: 5px 7px; border: 1px solid var(--st-hair); border-left: 2px solid var(--st-hair); border-radius: var(--st-radius); }
  .wif-panel :global(.wif-item.changed) { border-left-color: var(--st-accent); }
  .wif-panel :global(.wif-item.picked) { border-color: var(--st-interactive); }
  .wif-panel :global(.wif-item-title) { font-size: 0.7rem; color: var(--st-text); margin-bottom: 3px; overflow-wrap: anywhere; }
  .wif-panel :global(.wif-item-head) {
    display: flex; align-items: center; gap: 5px; width: 100%; padding: 2px 0; background: none; border: none; color: var(--st-text);
    font: inherit; font-size: 0.7rem; text-align: left; cursor: pointer;
  }
  .wif-panel :global(.wif-item-head[aria-expanded='true'] .wif-caret) { transform: rotate(90deg); }
  .wif-panel :global(.wif-caret) { color: var(--st-text-3); transition: transform 0.15s; }
  .wif-panel :global(.wif-tag) { font-size: 0.6rem; color: var(--st-text-3); }
  .wif-panel :global(.wif-tools) { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .wif-panel :global(.wif-hint), .wif-panel :global(.wif-empty) { margin: 0; font-size: 0.66rem; color: var(--st-text-3); line-height: 1.35; }
  .wif-panel :global(.wif-ids) { display: inline-flex; align-items: center; gap: 3px; font-size: 0.64rem; color: var(--st-text-2); cursor: pointer; flex: none; }
  .wif-panel :global(.wif-row) { display: flex; align-items: center; gap: 6px; min-height: 24px; }
  .wif-panel :global(.wif-label) { flex: none; width: 4.6rem; font-size: 0.66rem; color: var(--st-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wif-panel :global(.wif-select) {
    flex: 1; min-width: 0; padding: 2px 4px; border: 1px solid var(--st-hair-strong); border-radius: 3px;
    background: var(--st-surface-2); color: var(--st-text); font: inherit; font-size: 0.68rem;
  }
  .wif-panel :global(.wif-range) {
    flex: 1; min-width: 0; height: 4px; -webkit-appearance: none; appearance: none; background: var(--st-surface-3); border-radius: 2px; outline: none;
  }
  .wif-panel :global(.wif-range::-webkit-slider-thumb) { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: var(--st-value); cursor: pointer; border: none; }
  .wif-panel :global(.wif-range::-moz-range-thumb) { width: 13px; height: 13px; border-radius: 50%; background: var(--st-value); cursor: pointer; border: none; }
  .wif-panel :global(.wif-val) { flex: none; min-width: 4.2rem; text-align: right; font-family: var(--st-mono); font-size: 0.66rem; color: var(--st-text-3); }
  .wif-panel :global(.wif-val.changed) { color: var(--st-text); }

  @media (max-width: 767px), (pointer: coarse) {
    .wif-res-btn, .wif-paint-btn { min-height: 40px; }
    .wif-paint-btn { font-family: inherit; }
    .wif-tab { min-height: 44px; }
    .wif-reset { min-height: 40px; padding: 0 12px; }
    .wif-panel :global(.wif-row) { min-height: 44px; }
    .wif-panel :global(.wif-item-head) { min-height: 44px; }
    .wif-panel :global(.wif-range) { height: 6px; }
    .wif-panel :global(.wif-range::-webkit-slider-thumb) { width: 22px; height: 22px; }
    .wif-panel :global(.wif-range::-moz-range-thumb) { width: 22px; height: 22px; }
    .wif-panel :global(.wif-select) { min-height: 40px; font-size: 16px; }
    .wif-panel :global(.wif-ids) { min-height: 44px; }
  }
</style>
