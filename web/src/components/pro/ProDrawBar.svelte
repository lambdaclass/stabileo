<script lang="ts">
  import { userComponent, axisName } from '../../lib/axes/display';
  import { userPlane } from '../../lib/axes/typed-frame';
  import { editorActivity } from '../../lib/utils/editor-activity';
  const editorActive = editorActivity();
  import { OSNAP_MODES } from '../../lib/model/osnap-modes';
  /**
   * What the next click in the model does, while PRO is drawing: a card over the model's corner,
   * so arming a tool never moves the model down. Supports and loads are not drawn here; each is
   * added from its panel's "Add" card, and a support or load tool still armed from Basic is put down.
   */
  import { modelStore, uiStore } from '../../lib/store';
  import { drawState } from '../../lib/store/draw-state.svelte';
  import { t, tp, capitalized } from '../../lib/i18n';
  import Icon from '../ribbon/Icon.svelte';
  import NextMemberFields from './NextMemberFields.svelte';
  import DrawnKindField from './building/DrawnKindField.svelte';
  import QuantityInput from './loads/QuantityInput.svelte';

  const pick = $derived(uiStore.shellNodePick);
  const drawingPlate = $derived(pick.target === 'quad' && (pick.active || pick.picked.length > 0));
  const tool = $derived(drawingPlate ? 'plate' : uiStore.currentTool);

  const icon = $derived(({ node: 'node', element: 'element', plate: 'shell' } as Record<string, string>)[tool] ?? 'node');
  const title = $derived(({
    node: t('pro.oneNode'), element: t('pro.oneElement'), plate: t('pro.onePlate'),
  } as Record<string, string>)[tool] ?? '');

  /** What the next click does, said as the step the reader is at. */
  const step = $derived.by(() => {
    switch (tool) {
      case 'node': return t('drawBar.stepNode');
      case 'element': return drawState.memberStart === null
        ? t('drawBar.stepMemberI')
        : tp('drawBar.stepMemberJ', { id: drawState.memberStart });
      case 'plate': return drawState.plateCorners === 'outline'
        ? (pick.picked.length < 3 ? tp('drawBar.stepOutline', { k: pick.picked.length + 1 }) : tp('drawBar.stepOutlineClose', { first: pick.picked[0] ?? '' }))
        : tp('drawBar.stepPlate', { k: Math.min(pick.picked.length + 1, drawState.plateCorners), n: drawState.plateCorners });
      default: return '';
    }
  });

  const levelK = $derived(({ XY: 2, XZ: 1, YZ: 0 } as const)[uiStore.workingPlane]);
  const levelAxis = $derived(axisName(levelK));
  const materials = $derived([...modelStore.materials.values()]);

  $effect(() => {
    if (uiStore.currentTool === 'support' || uiStore.currentTool === 'load') uiStore.currentTool = 'select';
  });

  function undoCorner() {
    const kept = pick.picked.slice(0, -1);
    drawState.startPlate();
    for (const id of kept) uiStore.pushShellNodePick(id);
  }

  /** Enter closes an outline being drawn, as clicking its first node does. */
  function onKey(e: KeyboardEvent) {
    if (!editorActive()) return;
    if (e.key !== 'Enter' || tool !== 'plate' || drawState.plateCorners !== 'outline' || pick.picked.length < 3) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    drawState.closeOutline();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if drawState.active}
  <div class="db" role="toolbar" aria-label={capitalized(tp('pro.drawWhat', { what: title }))} data-testid="pro-draw-bar" data-tool={tool}>
    <div class="db-head">
      <span class="db-title"><Icon name={icon} size={14} /> {capitalized(tp('pro.drawWhat', { what: title }))}</span>
      <details class="db-osnap" data-testid="osnap-menu">
        <summary title={t('osnap.hint')}>{t('osnap.title')}{uiStore.snapToAxes ? '' : ' ·'}</summary>
        <div class="db-osnap-list">
          <label><input type="checkbox" bind:checked={uiStore.snapToAxes} data-testid="osnap-master" /> {t('osnap.master')}</label>
          {#each OSNAP_MODES as m (m)}
            <label class:off={!uiStore.snapToAxes}><input type="checkbox" checked={uiStore.osnapModes.has(m)} disabled={!uiStore.snapToAxes} onchange={() => uiStore.toggleOsnap(m)} data-testid="osnap-mode-{m}" /> {t(`osnap.${m}`)}</label>
          {/each}
          <p>{t('osnap.hint')}</p>
        </div>
      </details>
      <button class="db-stop" onclick={() => drawState.stop()} title={t('pro.drawStopHint')} data-testid="draw-stop">
        {t('pro.drawStop')} <kbd>Esc</kbd>
      </button>
    </div>
    <p class="db-step" data-testid="draw-step">{step}</p>
    <div class="db-body">
    <div class="db-opts">
      {#if tool === 'node'}
        <label>{t('drawBar.plane')}
          <select bind:value={uiStore.workingPlane} data-testid="draw-plane">
            <option value="XY">{userPlane('XY')}</option><option value="XZ">{userPlane('XZ')}</option><option value="YZ">{userPlane('YZ')}</option>
          </select>
        </label>
        <label>{levelAxis} =
          <QuantityInput value={userComponent(levelK, uiStore.nodeCreateZ, 'vector')} quantity="length" cls="db-num" onchange={(v) => (uiStore.nodeCreateZ = userComponent(levelK, v, 'vector'))} testid="draw-level" />
        </label>
      {:else if tool === 'element'}
        <NextMemberFields />
        <DrawnKindField />
        <label class="db-check" title={t('drawBar.chainHint')}>
          <input type="checkbox" bind:checked={drawState.memberChain} data-testid="draw-chain" /> {t('drawBar.chain')}
        </label>
      {:else if tool === 'plate'}
        <div class="db-seg" role="group" aria-label={t('drawBar.corners')}>
          <button class:on={drawState.plateCorners === 'outline'} aria-pressed={drawState.plateCorners === 'outline'} onclick={() => (drawState.plateCorners = 'outline')} title={t('drawBar.outlineHint')} data-testid="draw-corners-outline">{t('drawBar.outline')}</button>
          <button class:on={drawState.plateCorners === 3} aria-pressed={drawState.plateCorners === 3} onclick={() => (drawState.plateCorners = 3)} title={t('drawBar.elementHint')} data-testid="draw-corners-3">{t('drawBar.triangle')}</button>
          <button class:on={drawState.plateCorners === 4} aria-pressed={drawState.plateCorners === 4} onclick={() => (drawState.plateCorners = 4)} title={t('drawBar.elementHint')} data-testid="draw-corners-4">{t('drawBar.quad')}</button>
        </div>
        <span class="db-chips" data-testid="draw-corners">
          {#each Array.from({ length: drawState.plateCorners === 'outline' ? Math.max(3, pick.picked.length + 1) : drawState.plateCorners }, (_, i) => i) as i (i)}
            <span class="db-chip" class:set={pick.picked[i] !== undefined}>{pick.picked[i] ?? `N${i + 1}`}</span>
          {/each}
        </span>
        <button class="db-btn" disabled={pick.picked.length === 0} onclick={undoCorner} data-testid="draw-undo-corner">{t('drawBar.undoCorner')}</button>
        {#if drawState.plateCorners === 'outline'}
          <button class="db-btn" disabled={pick.picked.length < 3} onclick={() => drawState.closeOutline()} data-testid="draw-close-outline">{t('drawBar.closeOutline')} <kbd>Enter</kbd></button>
        {/if}
        <select value={drawState.plateMaterialId} onchange={(e) => (drawState.plateMaterialId = Number(e.currentTarget.value))} aria-label={t('pro.thMaterial')}>
          {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
        </select>
        <label>{t('pro.thicknessLabel')}
          <QuantityInput min={0.001} value={drawState.plateThickness} quantity="length" cls="db-num" onchange={(v) => { if (v > 0) drawState.plateThickness = v; }} />
        </label>
      {/if}
    </div>
    </div>
  </div>
{/if}

<style>
  .db-osnap { position: relative; margin-left: auto; font-size: 0.72rem; }
  .db-osnap summary { cursor: pointer; padding: 2px 8px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); list-style: none; color: var(--st-text-2); }
  .db-osnap[open] summary { border-color: var(--st-accent); color: var(--st-text); }
  .db-osnap-list { position: absolute; right: 0; top: calc(100% + 4px); z-index: 30; width: 240px; padding: 8px; display: flex; flex-direction: column; gap: 4px; background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); box-shadow: 0 6px 18px rgb(0 0 0 / 0.3); }
  .db-osnap-list label { display: flex; gap: 6px; align-items: center; color: var(--st-text); }
  .db-osnap-list label.off { color: var(--st-text-3); }
  .db-osnap-list p { margin: 4px 0 0; color: var(--st-text-3); font-size: 0.66rem; line-height: 1.4; }
  .db {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 25;
    width: max-content;
    max-width: min(560px, calc(100% - 20px));
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--st-surface) 94%, transparent);
    border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius-lg);
    box-shadow: inset 3px 0 0 var(--st-accent), 0 10px 28px -12px rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    font-size: 0.72rem;
    color: var(--st-text-2);
  }
  .db-head { display: flex; align-items: center; gap: 12px; }
  .db-title { display: inline-flex; align-items: center; gap: 5px; color: var(--st-accent); font-weight: 600; white-space: nowrap; }
  .db-step { margin: 0; color: var(--st-text); }
  .db-body { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .db-body:not(:has(.db-opts > *)) { display: none; }
  @media (max-width: 767px) {
    .db { top: 8px; left: 8px; max-width: calc(100% - 16px); }
  }
  .db-opts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1 1 auto; min-width: 0; }
  .db-opts label { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .db-opts :global(input.db-num), .db-opts select {
    padding: 1px 5px;
    background: var(--st-ink); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius);
    font: inherit; font-family: var(--st-font-mono, monospace);
  }
  .db-opts :global(input.db-num) { width: 58px; }
  .db-opts select { max-width: 150px; font-family: inherit; }
  .db-opts :global(input.db-num:focus), .db-opts select:focus { outline: none; border-color: var(--st-accent); }
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
  .db-stop:hover, .db-btn:hover:not(:disabled) { color: var(--st-text); border-color: var(--st-accent); }
  kbd { font-size: 0.6rem; padding: 0 3px; border: 1px solid var(--st-hair); border-radius: 3px; color: var(--st-text-3); }
</style>
