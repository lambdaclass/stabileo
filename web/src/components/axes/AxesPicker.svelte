<script lang="ts">
  import { t } from '../../lib/i18n';
  import { axesStore } from '../../lib/axes/axes.svelte';
  import {
    DEFAULT_AXES, gravityLabel, plane2D, signedLabel, makeFrame,
    type AxesChoice, type Handedness, type SignedAxis,
  } from '../../lib/axes/frame';
  import AxesFigure from './AxesFigure.svelte';
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
  <div class="ax-overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div class="ax" role="dialog" aria-modal="true" aria-labelledby="ax-title" data-testid="axes-picker">
      <h2 id="ax-title" class="ax-title">{t('axes.title')}</h2>
      <p class="ax-lede">{t('axes.lede')}</p>

      <div class="ax-presets">
        {#each PRESETS as p}
          <button type="button" class="ax-chip" class:on={samePreset(p.choice)} onclick={() => set({ up: p.choice.up, right: p.choice.right, hand: p.choice.hand })}>{t(p.key)}</button>
        {/each}
      </div>

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
        </div>
        <div class="ax-figures">
          <AxesFigure {frame} kind="space" />
          <p class="ax-caption" data-testid="axes-summary">
            {t('axes.summary').replace('{gravity}', gravityLabel(frame)).replace('{h}', signedLabel(plane.horizontal).replace('+', '')).replace('{v}', signedLabel(plane.vertical).replace('+', ''))}
          </p>
          <div class="ax-plane">
            <AxesFigure {frame} kind="plane" />
            <p class="ax-caption">{t('axes.planeCaption').replace('{axis}', plane.normal.name)}</p>
          </div>
        </div>
      </div>

      <section class="ax-local">
        <h3>{t('axes.localTitle')}</h3>
        <div class="ax-local-row">
          <div class="ax-options" role="radiogroup">
            {#each ['right', 'left'] as const as h}
              <button type="button" role="radio" aria-checked={localHand === h} class="ax-opt wide" class:on={localHand === h} data-testid="axes-local-{h}" onclick={() => { uiStore.axisConvention3D = h === 'left' ? 'leftHand' : 'rightHand'; }}>
                <span>{t(h === 'right' ? 'axes.handRight' : 'axes.handLeft')}</span>
                <small>{h === 'right' ? 'ex × ey = ez' : 'ex × ey = −ez'}</small>
              </button>
            {/each}
          </div>
          <div class="ax-local-fig"><AxesFigure {frame} kind="local" leftLocal={localHand === 'left'} /></div>
        </div>
        <p class="ax-note">{t('axes.localNote')}</p>
      </section>

      <p class="ax-note">{t('axes.note')}</p>
      <div class="ax-actions">
        <button type="button" class="ax-btn" onclick={() => axesStore.reset()} data-testid="axes-reset">{t('axes.reset')}</button>
        <button type="button" class="ax-btn primary" onclick={close} data-testid="axes-done">{t('axes.done')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ax-overlay {
    position: fixed; inset: 0; z-index: 200;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--st-bg) 72%, transparent);
  }
  .ax {
    width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto;
    padding: 18px; background: var(--st-surface); border: 1px solid var(--st-hair-strong);
    border-radius: var(--st-radius); box-shadow: 0 8px 32px rgb(0 0 0 / 0.35); color: var(--st-text);
  }
  .ax-title { margin: 0 0 4px; font-size: 0.95rem; font-weight: 600; }
  .ax-lede, .ax-note, .ax-caption { margin: 0 0 12px; font-size: 0.78rem; color: var(--st-text-2); line-height: 1.45; }
  .ax-caption { margin: 4px 0 8px; }
  .ax-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
  .ax-chip, .ax-opt, .ax-btn {
    font: inherit; font-size: 0.78rem; color: var(--st-text); cursor: pointer;
    background: var(--st-surface-3); border: 1px solid var(--st-border); border-radius: var(--st-radius);
  }
  .ax-chip { padding: 4px 10px; }
  .ax-chip.on, .ax-opt.on { border-color: var(--st-interactive); color: var(--st-interactive); }
  .ax-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
  .ax-questions { display: flex; flex-direction: column; gap: 12px; }
  fieldset { border: none; margin: 0; padding: 0; }
  legend { font-size: 0.8rem; font-weight: 600; margin-bottom: 6px; }
  .ax-options { display: flex; flex-wrap: wrap; gap: 6px; }
  .ax-opt { min-width: 42px; padding: 6px 8px; font-weight: 600; }
  .ax-opt.wide { display: flex; flex-direction: column; align-items: flex-start; min-width: 120px; font-weight: 500; }
  .ax-opt small { color: var(--st-text-2); font-size: 0.72rem; }
  .ax-figures { background: var(--st-surface-2); border-radius: var(--st-radius); padding: 8px; }
  .ax-plane { display: grid; grid-template-columns: 170px 1fr; gap: 8px; align-items: center; }
  .ax-local { margin-top: 16px; border-top: 1px solid var(--st-border); padding-top: 12px; }
  .ax-local h3 { margin: 0 0 8px; font-size: 0.85rem; font-weight: 600; }
  .ax-local-row { display: grid; grid-template-columns: auto 200px; gap: 16px; align-items: center; }
  .ax-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .ax-btn { padding: 6px 14px; }
  .ax-btn.primary { background: var(--st-interactive); border-color: var(--st-interactive); color: var(--st-text-on-accent); }
  @media (max-width: 640px) {
    .ax-body, .ax-local-row { grid-template-columns: 1fr; }
  }
</style>
