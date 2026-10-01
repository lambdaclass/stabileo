<script lang="ts">
  /**
   * What the next click in the model does, while PRO is drawing.
   *
   * Under the ribbon, across the model, because that is where the eye is while drawing. It
   * replaces the strip Basic uses, which PRO borrowed for loads and supports: it sat above the
   * top bar, spoke in Basic's terms (one direction and one value, the 2D support kinds) and said
   * nothing for nodes, members and plates. Each tool here gets the choices PRO has for it, the
   * step it is at ("node I is 5, pick node J"), and one way out.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { drawState } from '../../lib/store/draw-state.svelte';
  import { supportTypeOptions } from '../../lib/pro/support-types';
  import { t, tp } from '../../lib/i18n';
  import Icon from '../ribbon/Icon.svelte';
  import NextMemberFields from './NextMemberFields.svelte';

  const pick = $derived(uiStore.shellNodePick);
  const drawingPlate = $derived(pick.target === 'quad' && (pick.active || pick.picked.length > 0));
  const tool = $derived(drawingPlate ? 'plate' : uiStore.currentTool);

  const icon = $derived(({ node: 'node', element: 'element', plate: 'shell', support: 'support', load: 'load' } as Record<string, string>)[tool] ?? 'node');
  const title = $derived(({
    node: t('pro.oneNode'), element: t('pro.oneElement'), plate: t('pro.onePlate'),
    support: t('pro.oneSupport'), load: t('pro.oneLoad'),
  } as Record<string, string>)[tool] ?? '');

  /** What the next click does, said as the step the reader is at. */
  const step = $derived.by(() => {
    switch (tool) {
      case 'node': return t('drawBar.stepNode');
      case 'element': return drawState.memberStart === null
        ? t('drawBar.stepMemberI')
        : tp('drawBar.stepMemberJ', { id: drawState.memberStart });
      case 'plate': return tp('drawBar.stepPlate', { k: Math.min(pick.picked.length + 1, drawState.plateCorners), n: drawState.plateCorners });
      case 'support': return t('drawBar.stepSupport');
      case 'load': return uiStore.loadType === 'nodal' ? t('drawBar.stepLoadNode') : t('drawBar.stepLoadMember');
      default: return '';
    }
  });

  const levelAxis = $derived(({ XY: 'Z', XZ: 'Y', YZ: 'X' } as const)[uiStore.workingPlane]);
  const materials = $derived([...modelStore.materials.values()]);
  const supportTypes = $derived(supportTypeOptions(true, t));
  const cases = $derived(modelStore.loadCases);
  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value) || 0;

  function undoCorner() {
    const kept = pick.picked.slice(0, -1);
    uiStore.startShellNodePick('quad', drawState.plateCorners);
    for (const id of kept) uiStore.pushShellNodePick(id);
  }
</script>

{#if drawState.active}
  <div class="db" data-testid="pro-draw-bar" data-tool={tool}>
    <span class="db-title"><Icon name={icon} size={14} /> {t('pro.drawInModel')} {title}</span>
    <span class="db-step" data-testid="draw-step">{step}</span>
    <span class="db-sep" aria-hidden="true"></span>

    <div class="db-opts">
      {#if tool === 'node'}
        <label>{t('drawBar.plane')}
          <select bind:value={uiStore.workingPlane} data-testid="draw-plane">
            <option value="XY">XY</option><option value="XZ">XZ</option><option value="YZ">YZ</option>
          </select>
        </label>
        <label>{levelAxis} =
          <input type="number" step="0.5" value={uiStore.nodeCreateZ} onchange={(e) => (uiStore.nodeCreateZ = num(e))} data-testid="draw-level" /> m
        </label>
      {:else if tool === 'element'}
        <div class="db-seg" role="group" aria-label={t('drawBar.memberType')}>
          <button class:on={uiStore.elementCreateType === 'frame'} aria-pressed={uiStore.elementCreateType === 'frame'} onclick={() => (uiStore.elementCreateType = 'frame')}>{t('table.frame')}</button>
          <button class:on={uiStore.elementCreateType === 'truss'} aria-pressed={uiStore.elementCreateType === 'truss'} onclick={() => (uiStore.elementCreateType = 'truss')}>{t('table.truss')}</button>
        </div>
        <NextMemberFields />
        <label class="db-check" title={t('drawBar.chainHint')}>
          <input type="checkbox" bind:checked={drawState.memberChain} data-testid="draw-chain" /> {t('drawBar.chain')}
        </label>
      {:else if tool === 'plate'}
        <div class="db-seg" role="group" aria-label={t('drawBar.corners')}>
          <button class:on={drawState.plateCorners === 3} aria-pressed={drawState.plateCorners === 3} onclick={() => (drawState.plateCorners = 3)} data-testid="draw-corners-3">{t('drawBar.triangle')}</button>
          <button class:on={drawState.plateCorners === 4} aria-pressed={drawState.plateCorners === 4} onclick={() => (drawState.plateCorners = 4)} data-testid="draw-corners-4">{t('drawBar.quad')}</button>
        </div>
        <span class="db-chips" data-testid="draw-corners">
          {#each Array.from({ length: drawState.plateCorners }, (_, i) => i) as i (i)}
            <span class="db-chip" class:set={pick.picked[i] !== undefined}>{pick.picked[i] ?? `N${i + 1}`}</span>
          {/each}
        </span>
        <button class="db-btn" disabled={pick.picked.length === 0} onclick={undoCorner} data-testid="draw-undo-corner">{t('drawBar.undoCorner')}</button>
        <select value={drawState.plateMaterialId} onchange={(e) => (drawState.plateMaterialId = Number(e.currentTarget.value))} aria-label={t('pro.thMaterial')}>
          {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
        </select>
        <label>{t('pro.thickness')}
          <input type="number" step="any" min="0.001" value={drawState.plateThickness} onchange={(e) => (drawState.plateThickness = num(e))} /> m
        </label>
      {:else if tool === 'support'}
        <select bind:value={drawState.support.type} aria-label={t('pro.thType')} data-testid="draw-support-type">
          {#each supportTypes as st (st.value)}<option value={st.value}>{st.label}</option>{/each}
        </select>
        {#if drawState.support.type === 'custom3d'}
          {#each ['tx', 'ty', 'tz', 'rx', 'ry', 'rz'] as const as d (d)}
            <label class="db-check"><input type="checkbox" bind:checked={drawState.support.dofs[d]} /> {d.replace('t', 'u')}</label>
          {/each}
        {:else if drawState.support.type === 'spring3d'}
          {#each ['kx', 'ky', 'kz'] as const as k (k)}
            <label>{k} <input type="number" value={drawState.support.springs[k] ?? ''} onchange={(e) => (drawState.support.springs[k] = num(e) || undefined)} placeholder="kN/m" /></label>
          {/each}
        {/if}
      {:else if tool === 'load'}
        <select bind:value={uiStore.activeLoadCaseId} aria-label={t('pro.loadCases')} data-testid="draw-load-case">
          {#each cases as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
        <div class="db-seg" role="group" aria-label={t('drawBar.loadKind')}>
          <button class:on={uiStore.loadType === 'nodal'} aria-pressed={uiStore.loadType === 'nodal'} onclick={() => (uiStore.loadType = 'nodal')} data-testid="draw-load-nodal">{t('pro.nodal')}</button>
          <button class:on={uiStore.loadType === 'distributed'} aria-pressed={uiStore.loadType === 'distributed'} onclick={() => (uiStore.loadType = 'distributed')} data-testid="draw-load-member">{t('pro.distributed')}</button>
          <button class:on={uiStore.loadType === 'thermal'} aria-pressed={uiStore.loadType === 'thermal'} onclick={() => (uiStore.loadType = 'thermal')}>{t('drawBar.thermal')}</button>
        </div>
        {#if uiStore.loadType === 'nodal'}
          {#each ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const as k (k)}
            <label>{k.toUpperCase()} <input type="number" value={drawState.nodalLoad[k]} onchange={(e) => (drawState.nodalLoad = { ...drawState.nodalLoad, [k]: num(e) })} data-testid="draw-load-{k}" /></label>
          {/each}
          <span class="db-unit">kN, kN·m</span>
        {:else if uiStore.loadType === 'distributed'}
          <select value={drawState.memberLoad.frame} onchange={(e) => (drawState.memberLoad = { ...drawState.memberLoad, frame: e.currentTarget.value as never })} title={t('loads.frameHelp')} aria-label={t('loads.frame')}>
            <option value="local">{t('loads.frame.local')}</option>
            <option value="global">{t('loads.frame.global')}</option>
            <option value="projected">{t('loads.frame.projected')}</option>
          </select>
          {#each ['qx', 'qy', 'qz'] as const as k (k)}
            <label>{drawState.memberLoad.frame === 'local' ? k : 'q' + k[1]!.toUpperCase()} <input type="number" value={drawState.memberLoad[k]} onchange={(e) => (drawState.memberLoad = { ...drawState.memberLoad, [k]: num(e) })} data-testid="draw-load-{k}" /></label>
          {/each}
          <span class="db-unit">kN/m</span>
        {:else}
          <label>{t('pro.dtUniform')} <input type="number" value={uiStore.thermalDT} onchange={(e) => (uiStore.thermalDT = num(e))} /></label>
          <label>{t('pro.dtGradient')} <input type="number" value={uiStore.thermalDTg} onchange={(e) => (uiStore.thermalDTg = num(e))} /></label>
          <span class="db-unit">°C</span>
        {/if}
      {/if}
    </div>

    <button class="db-stop" onclick={() => drawState.stop()} title={t('pro.drawStopHint')} data-testid="draw-stop">
      {t('pro.drawStop')} <kbd>Esc</kbd>
    </button>
  </div>
{/if}

<style>
  .db {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 5px 12px;
    background: var(--st-surface-2);
    border-bottom: 1px solid var(--st-hair-strong);
    box-shadow: inset 3px 0 0 var(--st-accent);
    font-size: 0.72rem;
    color: var(--st-text-2);
  }
  .db-title { display: inline-flex; align-items: center; gap: 5px; color: var(--st-accent); font-weight: 600; white-space: nowrap; }
  .db-step { color: var(--st-text); white-space: nowrap; }
  .db-sep { width: 1px; align-self: stretch; background: var(--st-hair); }
  .db-opts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1 1 auto; min-width: 0; }
  .db-opts label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .db-opts input[type='number'], .db-opts select {
    padding: 1px 5px;
    background: var(--st-ink); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    font: inherit; font-family: var(--st-font-mono, monospace);
  }
  .db-opts input[type='number'] { width: 58px; }
  .db-opts select { max-width: 150px; font-family: inherit; }
  .db-opts input:focus, .db-opts select:focus { outline: none; border-color: var(--st-accent); }
  .db-unit { color: var(--st-text-3); }
  .db-check { cursor: pointer; }
  .db-seg { display: inline-flex; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); overflow: hidden; }
  .db-seg button { padding: 2px 8px; background: none; border: none; color: var(--st-text-2); font: inherit; cursor: pointer; }
  .db-seg button + button { border-left: 1px solid var(--st-hair-strong); }
  .db-seg button.on { background: var(--st-accent); color: #fff; }
  .db-chips { display: inline-flex; gap: 4px; }
  .db-chip {
    min-width: 26px; padding: 1px 5px; text-align: center;
    border: 1px dashed var(--st-hair-strong); border-radius: var(--st-radius);
    color: var(--st-text-3); font-family: var(--st-font-mono, monospace);
  }
  .db-chip.set { border-style: solid; border-color: var(--st-selected, var(--st-accent)); color: var(--st-text); }
  .db-btn, .db-stop {
    padding: 2px 8px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    background: none; color: var(--st-text-2); font: inherit; cursor: pointer; white-space: nowrap;
  }
  .db-btn:disabled { opacity: 0.4; cursor: default; }
  .db-stop { margin-left: auto; }
  .db-stop:hover, .db-btn:hover:not(:disabled) { color: var(--st-text); border-color: var(--st-accent); }
  kbd { font-size: 0.6rem; padding: 0 3px; border: 1px solid var(--st-hair); border-radius: 3px; color: var(--st-text-3); }
</style>
