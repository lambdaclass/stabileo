<script lang="ts">
  import { t } from '../../lib/i18n';
  import { axesStore } from '../../lib/axes/axes.svelte';
  import {
    DEFAULT_AXES, gravityLabel, plane2D, signedLabel, makeFrame,
    type AxesChoice, type Handedness, type SignedAxis,
  } from '../../lib/axes/frame';
  import AxesFigure from './AxesFigure.svelte';
  import { portal } from '../../lib/utils/portal';
  import { uiStore } from '../../lib/store';

  const SIGNED: SignedAxis[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
  const PRESETS: Array<{ key: string; choice: AxesChoice }> = [
    { key: 'axes.presetZUp', choice: DEFAULT_AXES },
    { key: 'axes.presetYUp', choice: { up: '+Y', right: '+X', hand: 'right' } },
  ];

  const choice = $derived(axesStore.choice);
  const frame = $derived(axesStore.frame);
  const plane = $derived(plane2D(frame));
  const localHand = $derived<Handedness>(uiStore.axisConvention3D === 'leftHand' ? 'left' : 'right');
  const rightOptions = $derived(SIGNED.filter((s) => s[1] !== choice.up[1]));

  const pretty = (s: SignedAxis) => (s[0] === '-' ? `−${s[1]}` : s[1]);
  const set = (patch: Partial<AxesChoice>) => {
    const next = { ...choice, ...patch };
    if (next.right[1] === next.up[1]) next.right = SIGNED.find((s) => s[1] !== next.up[1])!;
    axesStore.choice = next;
  };
  const samePreset = (c: AxesChoice) => c.up === choice.up && c.right === choice.right && c.hand === choice.hand;
  const thirdName = $derived(['X', 'Y', 'Z'].find((n) => n !== choice.up[1] && n !== choice.right[1])!);
  const handFormula = (h: Handedness) => {
    const f = makeFrame({ ...choice, hand: h });
    return `X × Y = ${f.det === 1 ? '' : '−'}Z`;
  };

  function close() { axesStore.pickerOpen = false; }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window onkeydown={axesStore.pickerOpen ? onKey : undefined} />

{#if axesStore.pickerOpen}
  <div class="ax-overlay" role="presentation" use:portal onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div class="ax" role="dialog" aria-modal="true" aria-labelledby="ax-title" data-testid="axes-picker">
      <header class="ax-head">
        <h2 id="ax-title" class="ax-title">{t('axes.title')}</h2>
        <p class="ax-lede">{t('axes.lede')}</p>
        <div class="ax-presets">
          {#each PRESETS as p}
            <button type="button" class="ax-chip" class:on={samePreset(p.choice)} onclick={() => set({ up: p.choice.up, right: p.choice.right, hand: p.choice.hand })}>{t(p.key)}</button>
          {/each}
        </div>
      </header>

      <div class="ax-scroll">
        <div class="ax-body">
          <div class="ax-questions">
            <fieldset>
              <legend>{t('axes.qUp')}</legend>
              <div class="ax-options" role="radiogroup">
                {#each SIGNED as s}
                  <button type="button" role="radio" aria-checked={choice.up === s} class="ax-opt" class:on={choice.up === s} data-testid="axes-up-{s}" onclick={() => set({ up: s })}>{pretty(s)}</button>
                {/each}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t('axes.qRight')}</legend>
              <div class="ax-options" role="radiogroup">
                {#each rightOptions as s}
                  <button type="button" role="radio" aria-checked={choice.right === s} class="ax-opt" class:on={choice.right === s} data-testid="axes-right-{s}" onclick={() => set({ right: s })}>{pretty(s)}</button>
                {/each}
              </div>
            </fieldset>
            <fieldset>
              <legend>{t('axes.qHand').replace('{axis}', thirdName)}</legend>
              <div class="ax-options" role="radiogroup">
                {#each ['right', 'left'] as const as h}
                  <button type="button" role="radio" aria-checked={choice.hand === h} class="ax-opt wide" class:on={choice.hand === h} data-testid="axes-hand-{h}" onclick={() => set({ hand: h })}>
                    <span>{t(h === 'right' ? 'axes.handRight' : 'axes.handLeft')}</span>
                    <small>{handFormula(h)}</small>
                  </button>
                {/each}
              </div>
            </fieldset>
            <fieldset class="ax-local">
              <legend>{t('axes.localTitle')}</legend>
              <div class="ax-options" role="radiogroup">
                {#each ['right', 'left'] as const as h}
                  <button type="button" role="radio" aria-checked={localHand === h} class="ax-opt wide" class:on={localHand === h} data-testid="axes-local-{h}" onclick={() => { uiStore.axisConvention3D = h === 'left' ? 'leftHand' : 'rightHand'; }}>
                    <span>{t(h === 'right' ? 'axes.handRight' : 'axes.handLeft')}</span>
                    <small>{h === 'right' ? 'ex × ey = ez' : 'ex × ey = −ez'}</small>
                  </button>
                {/each}
              </div>
              <p class="ax-note">{t('axes.localNote')}</p>
            </fieldset>
          </div>

          <div class="ax-figures">
            <div class="ax-fig-space"><AxesFigure {frame} kind="space" /></div>
            <p class="ax-caption" data-testid="axes-summary">
              {t('axes.summary').replace('{gravity}', gravityLabel(frame)).replace('{h}', signedLabel(plane.horizontal).replace('+', '')).replace('{v}', signedLabel(plane.vertical).replace('+', ''))}
            </p>
            <div class="ax-pair">
              <figure>
                <AxesFigure {frame} kind="plane" />
                <figcaption>{t('axes.planeCaption').replace('{axis}', plane.normal.name)}</figcaption>
              </figure>
              <figure>
                <AxesFigure {frame} kind="local" leftLocal={localHand === 'left'} />
                <figcaption>{t('axes.localTitle')}</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </div>

      <footer class="ax-foot">
        <p class="ax-note">{t('axes.note')}</p>
        <div class="ax-actions">
          <button type="button" class="ax-btn" onclick={() => axesStore.reset()} data-testid="axes-reset">{t('axes.reset')}</button>
          <button type="button" class="ax-btn primary" onclick={close} data-testid="axes-done">{t('axes.done')}</button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .ax-overlay {
    position: fixed; inset: 0; z-index: 9999;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--st-bg) 72%, transparent);
  }
  .ax {
    width: min(760px, 100%); max-height: 100%;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius); box-shadow: 0 8px 32px rgb(0 0 0 / 0.35); color: var(--st-text);
  }
  .ax-head { padding: 16px 18px 10px; border-bottom: 1px solid var(--st-border); flex: none; }
  .ax-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 14px 18px; }
  .ax-foot {
    flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 10px 18px; border-top: 1px solid var(--st-border);
  }
  .ax-title { margin: 0 0 4px; font-size: 0.95rem; font-weight: 600; }
  .ax-lede { margin: 0 0 10px; font-size: 0.78rem; color: var(--st-text-2); line-height: 1.45; }
  .ax-note { margin: 0; font-size: 0.74rem; color: var(--st-text-2); line-height: 1.4; }
  .ax-caption { margin: 4px 0 10px; font-size: 0.76rem; color: var(--st-text-2); line-height: 1.4; }
  .ax-presets { display: flex; flex-wrap: wrap; gap: 6px; }
  .ax-chip, .ax-opt, .ax-btn {
    font: inherit; font-size: 0.78rem; color: var(--st-text); cursor: pointer;
    background: var(--st-surface-3); border: 1px solid var(--st-border); border-radius: var(--st-radius);
  }
  .ax-chip { padding: 4px 10px; }
  .ax-chip.on, .ax-opt.on { border-color: var(--st-interactive); color: var(--st-interactive); }
  .ax-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
  .ax-questions { display: flex; flex-direction: column; gap: 14px; }
  fieldset { border: none; margin: 0; padding: 0; min-width: 0; }
  legend { font-size: 0.8rem; font-weight: 600; margin-bottom: 6px; padding: 0; }
  .ax-local { border-top: 1px solid var(--st-border); padding-top: 12px; }
  .ax-local .ax-note { margin-top: 6px; }
  .ax-options { display: flex; flex-wrap: wrap; gap: 6px; }
  .ax-opt { min-width: 42px; padding: 6px 8px; font-weight: 600; }
  .ax-opt.wide { display: flex; flex-direction: column; align-items: flex-start; flex: 1 1 120px; font-weight: 500; }
  .ax-opt small { color: var(--st-text-2); font-size: 0.72rem; }
  .ax-figures { background: var(--st-surface-2); border-radius: var(--st-radius); padding: 10px; position: sticky; top: 0; }
  .ax-fig-space { max-width: 300px; margin: 0 auto; }
  .ax-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  figure { margin: 0; }
  figcaption { font-size: 0.72rem; color: var(--st-text-2); line-height: 1.35; margin-top: 2px; }
  .ax-actions { display: flex; gap: 8px; flex: none; }
  .ax-btn { padding: 6px 14px; white-space: nowrap; }
  .ax-btn.primary { background: var(--st-interactive); border-color: var(--st-interactive); color: var(--st-text-on-accent); }
  @media (max-width: 640px) {
    .ax-overlay { padding: 8px; }
    .ax-body { grid-template-columns: 1fr; }
    .ax-figures { position: static; }
    .ax-foot { flex-direction: column; align-items: stretch; }
    .ax-actions { justify-content: flex-end; }
  }
</style>
