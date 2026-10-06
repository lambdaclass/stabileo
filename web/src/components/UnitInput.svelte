<script lang="ts">
  /**
   * A number typed in the reader's unit system, stored in SI.
   *
   * The model keeps SI (kN, kN·m, kN/m, m, MPa…) whatever the reader chose
   * under Settings › Units. Fields used to show and take the SI number with an
   * SI unit beside it, so switching to tf or kip changed the drawing and the
   * results but not what one typed. This shows the value converted
   * (`toDisplay`), says the unit, and hands back SI (`fromDisplay`).
   *
   * A field left as shown keeps the exact value behind it: converting to the
   * display and back would round it to the digits on screen.
   */
  import { uiStore } from '../lib/store/ui.svelte';
  import { toDisplay, fromDisplay, unitLabel, type Quantity } from '../lib/utils/units';

  interface Props {
    /** The value in SI. */
    value: number;
    qty: Quantity;
    /** Called with the new value in SI. */
    onchange: (si: number) => void;
    /** Show the unit after the field (default true). */
    unit?: boolean;
    /** The input's class, for the surrounding component's own styling. */
    inputClass?: string;
    step?: string;
    min?: number;
    title?: string;
    disabled?: boolean;
    testid?: string;
    /** Commit on every keystroke rather than on change (a toolbar value read when clicking). */
    live?: boolean;
  }
  let { value, qty, onchange, unit = true, inputClass = '', step = 'any', min, title, disabled = false, testid, live = false }: Props = $props();

  const shown = $derived.by(() => {
    if (!Number.isFinite(value)) return '';
    const v = toDisplay(value, qty, uiStore.unitSystem);
    // Six significant figures: enough for any input, without 0.30000000000000004.
    return String(+v.toPrecision(6));
  });
  const label = $derived(unitLabel(qty, uiStore.unitSystem));

  /*
   * What the field holds. Following the value while the field is not being
   * typed in, and left alone while it is: a field that committed on every
   * keystroke would otherwise be rewritten under the cursor ("1." to "1").
   */
  let text = $state('');
  let focused = $state(false);
  $effect(() => { const s = shown; if (!focused) text = s; });

  function commit(raw: string) {
    if (raw === shown) return;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    onchange(fromDisplay(n, qty, uiStore.unitSystem));
  }
</script>

<input
  type="number"
  class={inputClass}
  bind:value={text}
  {step}
  {min}
  {title}
  {disabled}
  data-testid={testid}
  onfocus={() => (focused = true)}
  onblur={() => { focused = false; text = shown; }}
  oninput={live ? () => commit(String(text)) : undefined}
  onchange={() => commit(String(text))}
/>{#if unit}<span class="ft-unit unit-label">{label}</span>{/if}

<style>
  .unit-label { margin-left: 2px; white-space: nowrap; }
</style>
