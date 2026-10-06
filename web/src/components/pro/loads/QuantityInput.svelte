<script lang="ts">
  /**
   * A number typed in the project's display units and kept in SI: what the field shows and reads
   * goes through `toDisplay` / `fromDisplay`, so a code in other units, or a reader who works in
   * kgf/m², does not make the dialog that holds the value change. A comma or a point both read
   * (`parseDecimal`); a value that does not parse leaves the stored one as it was.
   */
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { toDisplay, fromDisplay, unitLabel, type Quantity } from '../../../lib/utils/units';
  import { parseDecimal } from '../../../lib/utils/numeric-input';

  interface Props {
    /** SI. */
    value: number;
    quantity: Quantity;
    /** SI bounds, checked after the conversion. */
    min?: number;
    max?: number;
    testid?: string;
    cls?: string;
    /** The wrapper's class, for a host's own field layout. */
    wrap?: string;
    ariaLabel?: string;
  }
  let { value = $bindable(), quantity, min, max, testid, cls = '', wrap = '', ariaLabel }: Props = $props();

  const system = $derived(uiStore.unitSystem);
  const shown = $derived(+toDisplay(value, quantity, system).toPrecision(6));

  function read(el: HTMLInputElement) {
    const v = parseDecimal(el.value);
    const si = v === null ? NaN : fromDisplay(v, quantity, system);
    if (!Number.isFinite(si) || (min !== undefined && si < min) || (max !== undefined && si > max)) {
      el.value = String(shown);
      return;
    }
    value = si;
  }
</script>

<span class="qi {wrap}">
  <input type="text" inputmode="decimal" class={cls} value={String(shown)} aria-label={ariaLabel}
    onchange={(e) => read(e.currentTarget)} data-testid={testid} />
  <span class="qi-unit">{unitLabel(quantity, system)}</span>
</span>

<style>
  .qi { display: inline-flex; align-items: center; gap: 4px; }
  .qi-unit { font-size: 0.66rem; color: var(--st-text-3); }
</style>
