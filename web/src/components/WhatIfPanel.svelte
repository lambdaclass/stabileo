<script lang="ts">

  /**
   * `docked` renders this panel inside the right-hand panel instead of floating
   * over the canvas.
   *
   * Floating was the old shell's answer to "where does an analysis put its
   * output": a box pinned to a corner of the drawing area. With several
   * analyses open it stopped being an answer — Kinematic sat over the left of
   * the model, Explore over the right, and the structure they describe was
   * behind them. The new shell already has one place for anything that needs
   * area and outlives a single click, so that is where this goes; the floating
   * form is kept for mobile, which has no right panel to dock into.
   *
   * The session — baseline, factors, overrides — is `whatIf`'s, not this
   * component's: see whatif.svelte.ts for why, and for how it recomputes.
   */
  let { docked = false }: { docked?: boolean } = $props();
  import { uiStore, modelStore, resultsStore } from '../lib/store';
  import { whatIf, type MemberFactors } from '../lib/store/whatif.svelte';
  import { showDiagram } from '../lib/store/view-mode';
  import type { DiagramType } from '../lib/store/results.svelte';
  import type { SupportType } from '../lib/store/model.svelte';
  import { t } from '../lib/i18n';
  import {
    TWO_D_INTERNAL_FORCE_LABELS as F2D, get2DDisplayNodalLoadMoment, get2DDisplayNodalLoadVertical,
  } from '../lib/geometry/coordinate-system';
  import EndConditionSelect from './EndConditionSelect.svelte';

  const is3D = $derived(uiStore.analysisMode === '3d' || uiStore.analysisMode === 'pro');

  /*
   * ── What is on screen, from here ──────────────────────────────────
   * Picking a diagram in the ribbon moves the right-hand column to Results,
   * which took Explore off screen in the middle of a comparison. The same
   * choice, one row, here — so the session stays in view.
   */
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

  const elements = $derived([...modelStore.elements.values()].sort((a, b) => a.id - b.id));
  const supports = $derived([...modelStore.supports.values()].sort((a, b) => a.nodeId - b.nodeId));

  /*
   * A member list is a slider stack per member, which is fine for the dozen a
   * Basic model has and a wall for a building. Past a few dozen only the
   * members selected on the canvas, and the ones already changed, are listed.
   */
  const MANY = 30;
  const selected = $derived(new Set([...uiStore.selectedElements].filter((id) => modelStore.elements.has(id))));
  const listed = $derived(elements.length <= MANY
    ? elements
    : elements.filter((e) => selected.has(e.id) || whatIf.isMemberChanged(e.id)));
  let expanded = $state<Set<number>>(new Set());
  /* A member picked on the canvas opens here. */
  $effect(() => {
    const s = selected;
    if (s.size === 0 || s.size > 4) return;
    const next = new Set(expanded);
    for (const id of s) next.add(id);
    if (next.size !== expanded.size) expanded = next;
  });
  function toggle(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    expanded = next;
  }

  const showIds = $derived(is3D ? uiStore.showElementLabels3D : uiStore.showElementLabels);
  function setShowIds(v: boolean) {
    if (is3D) uiStore.showElementLabels3D = v; else uiStore.showElementLabels = v;
  }

  const SUPPORTS_2D: Array<{ v: SupportType; k: string }> = [
    { v: 'fixed', k: 'table.fixed' }, { v: 'pinned', k: 'table.pinned' },
    { v: 'rollerX', k: 'table.rollerX' }, { v: 'rollerZ', k: 'table.rollerY' },
  ];
  const SUPPORTS_3D: Array<{ v: SupportType; k: string }> = [
    { v: 'fixed3d', k: 'pro.fixed3d' }, { v: 'pinned3d', k: 'pro.pinned3d' },
    { v: 'rollerXY', k: 'pro.rollerXY' }, { v: 'rollerXZ', k: 'pro.rollerXZ' }, { v: 'rollerYZ', k: 'pro.rollerYZ' },
  ];
  const supportOptions = $derived(is3D ? SUPPORTS_3D : SUPPORTS_2D);

  function releaseOf(id: number, end: 'i' | 'j') {
    const o = whatIf.releases[id]?.[end];
    if (o) return o;
    const el = modelStore.elements.get(id);
    return end === 'i' ? el?.releaseI : el?.releaseJ;
  }

  const FACTORS: Array<{ k: keyof MemberFactors; label: string }> = [
    { k: 'e', label: 'E' }, { k: 'a', label: 'A' }, { k: 'iy', label: 'Iy' },
  ];

  function loadLabel(i: number): string {
    const l = whatIf.baseline?.loads[i];
    if (!l) return t('whatif.loadFallback').replace('{n}', String(i + 1));
    if (l.type === 'nodal') {
      const d = l.data as { fx: number; fz?: number; fy?: number; my?: number; mz?: number };
      const parts: string[] = [];
      if (d.fx) parts.push(`Fx=${d.fx}`);
      if (get2DDisplayNodalLoadVertical(d)) parts.push(`Fz=${get2DDisplayNodalLoadVertical(d)}`);
      if (get2DDisplayNodalLoadMoment(d)) parts.push(`My=${get2DDisplayNodalLoadMoment(d)}`);
      return parts.join(', ') || `Nodal ${i + 1}`;
    }
    if (l.type === 'distributed') {
      const d = l.data as { qI: number; qJ: number; elementId: number };
      return `${d.qI === d.qJ ? `q=${d.qI}` : `q=${d.qI}→${d.qJ}`} (B${d.elementId})`;
    }
    if (l.type === 'pointOnElement') {
      const d = l.data as { p: number; elementId: number };
      return `P=${d.p} (B${d.elementId})`;
    }
    if (l.type === 'thermal') return t('whatif.thermal');
    if (l.type === 'nodal3d') {
      const d = l.data as { nodeId: number; fx: number; fy: number; fz: number };
      const parts: string[] = [];
      if (d.fx) parts.push(`Fx=${d.fx}`);
      if (d.fy) parts.push(`Fy=${d.fy}`);
      if (d.fz) parts.push(`Fz=${d.fz}`);
      return parts.join(', ') || `N${d.nodeId}`;
    }
    if (l.type === 'distributed3d') {
      const d = l.data as { elementId: number };
      return `q (B${d.elementId})`;
    }
    return t('whatif.loadFallback').replace('{n}', String(i + 1));
  }
</script>

{#snippet factorRow(label: string, value: number, set: (v: number) => void)}
  <div class="wif-slider-row">
    <span class="wif-label">{label}</span>
    <input type="range" class="wif-range" min="0.1" max="5" step="0.05" value={value}
      oninput={(e) => set(Number(e.currentTarget.value))} />
    <span class="wif-val" class:changed={value !== 1}>{value.toFixed(2)}×</span>
  </div>
{/snippet}

{#if uiStore.showWhatIf}
  <div class="wif-panel" class:docked={docked} data-testid="whatif-panel">
    <div class="wif-header">
      {#if !docked}<span class="wif-title">{t('whatif.title')}</span>{/if}
      <span class="wif-live">{t('whatif.liveNote')}</span>
      <button class="wif-reset" onclick={() => whatIf.reset()} title={t('whatif.restoreOriginals')} data-testid="whatif-reset">Reset</button>
      {#if !docked}
        <button class="wif-close" onclick={() => whatIf.close()} title={t('whatif.closeAndRestore')}>✕</button>
      {/if}
    </div>

    <div class="wif-body">
      <div class="wif-results" role="group" aria-label={t('whatif.result')}>
        {#each diagrams as item (item.d)}
          <button class="wif-res-btn" class:active={resultsStore.diagramType === item.d}
            title={item.title} onclick={() => showDiagram(item.d)} data-testid="whatif-diagram-{item.d}">{item.label}</button>
        {/each}
      </div>

      {#if uiStore.liveCalcError}
        <div class="wif-error" role="alert" data-testid="whatif-error">{uiStore.liveCalcError}</div>
      {/if}

      <!-- Loads -->
      {#if whatIf.loadFactors.length > 0}
        <div class="wif-section">
          <div class="wif-section-title">{t('whatif.loads')}</div>
          {#each whatIf.loadFactors as factor, i}
            <div class="wif-slider-row">
              <span class="wif-label" title={loadLabel(i)}>{loadLabel(i)}</span>
              <input type="range" class="wif-range" min="0" max="3" step="0.05" value={factor}
                oninput={(e) => whatIf.setLoadFactor(i, Number(e.currentTarget.value))} />
              <span class="wif-val" class:changed={factor !== 1}>{factor.toFixed(2)}×</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Members -->
      <div class="wif-section">
        <div class="wif-section-title wif-title-row">
          <span>{t('whatif.elements')}</span>
          <label class="wif-ids" title={t('whatif.showIdsHint')}>
            <input type="checkbox" checked={showIds} onchange={(e) => setShowIds(e.currentTarget.checked)} data-testid="whatif-show-ids" />
            {t('whatif.showIds')}
          </label>
        </div>

        <div class="wif-member wif-all">
          <div class="wif-member-name">{t('whatif.allMembers')}</div>
          {#each FACTORS as f (f.k)}
            {@render factorRow(f.label, whatIf.all[f.k], (v) => whatIf.setAll(f.k, v))}
          {/each}
        </div>

        {#if elements.length > MANY}
          <div class="wif-hint">{t('whatif.manyMembers').replace('{n}', String(elements.length))}</div>
        {/if}
        {#each listed as el (el.id)}
          {@const open = expanded.has(el.id)}
          {@const f = whatIf.memberFactors(el.id)}
          <div class="wif-member" class:changed={whatIf.isMemberChanged(el.id)} data-testid="whatif-member-{el.id}">
            <button class="wif-member-head" onclick={() => toggle(el.id)} aria-expanded={open}>
              <span class="wif-caret">{open ? '▾' : '▸'}</span>
              {t('whatif.member').replace('{n}', String(el.id))}
              {#if el.type === 'truss'}<span class="wif-tag">{t('whatif.truss')}</span>{/if}
            </button>
            {#if open}
              {#each FACTORS as fk (fk.k)}
                {#if !(el.type === 'truss' && fk.k === 'iy')}
                  {@render factorRow(fk.label, f[fk.k], (v) => whatIf.setMember(el.id, fk.k, v))}
                {/if}
              {/each}
              {#if el.type !== 'truss' || !is3D}
                {#each [{ end: 'i', label: t('whatif.hingeI') }, { end: 'j', label: t('whatif.hingeJ') }] as const as row (row.end)}
                  <div class="wif-end-row">
                    <span class="wif-label">{row.label}</span>
                    <EndConditionSelect compact release={releaseOf(el.id, row.end)} {is3D}
                      onchange={(r) => whatIf.setRelease(el.id, row.end, r)} testid="whatif-end-{el.id}-{row.end}" />
                  </div>
                {/each}
              {/if}
            {/if}
          </div>
        {/each}
      </div>

      <!-- Supports -->
      {#if supports.length > 0}
        <div class="wif-section">
          <div class="wif-section-title">{t('whatif.supports')}</div>
          {#each supports as s (s.id)}
            {@const type = whatIf.supportTypes[s.id] ?? s.type}
            <div class="wif-end-row">
              <span class="wif-label">{t('whatif.node').replace('{n}', String(s.nodeId))}</span>
              <select class="wif-select" value={type} onchange={(e) => whatIf.setSupportType(s.id, e.currentTarget.value as SupportType)}
                data-testid="whatif-support-{s.id}">
                {#if !supportOptions.some((o) => o.v === type)}<option value={type}>{type}</option>{/if}
                {#each supportOptions as o (o.v)}<option value={o.v}>{t(o.k)}</option>{/each}
              </select>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /*
     Docked, this panel's header is a section heading inside the right panel,
     not the title bar of a window: the rule above separates it from the
     analysis list it belongs to, and the type matches every other heading in
     the panel so the eye reads one column, not a widget dropped into one.
  */
  .wif-panel.docked .wif-header {
    background: none;
    padding: 0 0 0.35rem;
    border-bottom: none;
  }

  .wif-panel.docked .wif-title {
    font-family: var(--st-mono);
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--st-text-2);
    font-weight: 400;
  }

  /* Docked: no chrome of its own — the right panel already supplies the frame. */
  .wif-panel.docked {
    position: static;
    width: auto;
    max-height: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    background: transparent;
    z-index: auto;
  }

  .wif-panel {
    position: absolute;
    top: 50px;
    right: 8px;
    z-index: 110;
    width: 240px;
    background: rgba(19, 33, 45, 0.96);
    border: 1px solid var(--st-surface-3);
    border-radius: 8px;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    max-height: calc(100% - 70px);
  }

  .wif-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--st-surface-3);
  }

  .wif-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--st-value);
  }

  .wif-live {
    flex: 1;
    font-size: 0.6rem;
    color: var(--st-text-3);
  }

  .wif-reset {
    padding: 2px 6px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-surface-3);
    border-radius: 3px;
    color: var(--st-text-2);
    cursor: pointer;
    font-size: 0.65rem;
  }

  .wif-reset:hover { color: var(--st-text); }

  .wif-close {
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .wif-close:hover { background: var(--st-accent); color: white; }

  .wif-body {
    overflow-y: auto;
    padding: 6px 10px 10px;
  }

  .wif-panel.docked .wif-body { padding: 0 0 6px; }

  /* ── The result selector: one row ─────────────────────────────── */
  .wif-results {
    display: flex;
    gap: 2px;
    margin-bottom: 8px;
  }

  .wif-res-btn {
    flex: 1;
    min-width: 0;
    padding: 3px 0;
    background: var(--st-surface-2);
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    color: var(--st-text-2);
    font-family: var(--st-mono);
    font-size: 0.66rem;
    cursor: pointer;
  }

  .wif-res-btn:hover { color: var(--st-text); }
  .wif-res-btn.active { border-color: var(--st-accent); color: var(--st-accent); background: var(--st-selected-bg); }

  .wif-error {
    margin-bottom: 8px;
    padding: 5px 7px;
    border: 1px solid var(--st-danger);
    border-radius: 3px;
    background: color-mix(in srgb, var(--st-danger) 12%, transparent);
    color: var(--st-text);
    font-size: 0.66rem;
    line-height: 1.35;
  }

  .wif-section { margin-bottom: 10px; }

  .wif-section-title {
    font-size: 0.68rem;
    color: var(--st-text-3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--st-hair);
    padding-bottom: 2px;
  }

  .wif-title-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }

  .wif-ids {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    text-transform: none;
    letter-spacing: 0;
    font-size: 0.62rem;
    color: var(--st-text-2);
    cursor: pointer;
  }

  .wif-ids input { margin: 0; width: 11px; height: 11px; }

  .wif-hint { font-size: 0.62rem; color: var(--st-text-3); margin: 2px 0 4px; }

  .wif-member {
    border-left: 2px solid transparent;
    padding-left: 4px;
    margin-bottom: 2px;
  }

  .wif-member.changed { border-left-color: var(--st-accent); }
  .wif-all { margin-bottom: 6px; }

  .wif-member-name { font-size: 0.66rem; color: var(--st-text-2); margin: 2px 0; }

  .wif-member-head {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 2px 0;
    background: none;
    border: none;
    color: var(--st-text-2);
    font: inherit;
    font-size: 0.68rem;
    text-align: left;
    cursor: pointer;
  }

  .wif-member-head:hover { color: var(--st-text); }
  .wif-caret { width: 10px; color: var(--st-text-3); }
  .wif-tag { font-size: 0.58rem; color: var(--st-text-3); }

  .wif-slider-row,
  .wif-end-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
  }

  .wif-label {
    font-size: 0.65rem;
    color: var(--st-text-2);
    min-width: 34px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 70px;
  }

  .wif-select {
    flex: 1;
    min-width: 0;
    padding: 0.1rem 0.2rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.64rem;
  }

  .wif-range {
    flex: 1;
    min-width: 0;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--st-surface-3);
    border-radius: 2px;
    outline: none;
  }

  .wif-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--st-value);
    cursor: pointer;
    border: none;
  }

  .wif-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--st-value);
    cursor: pointer;
    border: none;
  }

  .wif-val {
    font-size: 0.65rem;
    color: var(--st-text-3);
    min-width: 36px;
    text-align: right;
    font-family: var(--st-mono);
  }

  .wif-val.changed { color: var(--st-text); }

  @media (pointer: coarse) {
    .wif-res-btn { padding: 8px 0; }
    .wif-range { height: 6px; }
    .wif-range::-webkit-slider-thumb { width: 18px; height: 18px; }
    .wif-range::-moz-range-thumb { width: 18px; height: 18px; }
  }
</style>
