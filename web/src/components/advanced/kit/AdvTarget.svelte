<script lang="ts">
  interface Props {
    label: string;
    position?: string;
    t?: number;
    step?: number;
    from?: string;
    to?: string;
    slider?: boolean;
    sliderTitle?: string;
    onmove?: (t: number) => void;
    oncommit?: (t: number) => void;
  }

  let { label, position, t = $bindable(0), step = 0.005, from = 'I', to = 'J', slider = false, sliderTitle, onmove, oncommit }: Props = $props();
</script>

<div class="at-info">
  <span class="at-label">{label}</span>
  {#if position}<span class="at-pos">{position}</span>{/if}
</div>
{#if slider}
  <div class="at-slider-row">
    <span class="at-end">{from}</span>
    <input type="range" class="at-slider" min="0" max="1" {step} value={t} title={sliderTitle}
      oninput={(e) => { t = Number((e.currentTarget as HTMLInputElement).value); onmove?.(t); }}
      onchange={(e) => oncommit?.(Number((e.currentTarget as HTMLInputElement).value))} data-testid="adv-target-slider" />
    <span class="at-end">{to}</span>
  </div>
{/if}

<style>
  .at-info { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 4px; color: var(--st-text-2); font-size: 0.7rem; }
  .at-label { color: var(--st-text); font-weight: 600; }
  .at-pos { font-family: 'Courier New', monospace; color: var(--st-text-3); }
  .at-slider-row { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .at-end { font-size: 0.6rem; color: var(--st-text-3); font-weight: 600; flex-shrink: 0; width: 10px; text-align: center; }
  .at-slider { flex: 1; height: 4px; -webkit-appearance: none; appearance: none; background: var(--st-bg); border-radius: 2px; outline: none; cursor: pointer; }
  .at-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--st-accent); cursor: pointer; border: none; }
  .at-slider::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--st-accent); cursor: pointer; border: none; }
</style>
