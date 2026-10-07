<script lang="ts" generics="T extends number | null = number">
  /**
   * A number typed in the project's display units and kept in SI: what the field shows and reads
   * goes through `toDisplay` / `fromDisplay`, so a code in other units, or a reader who works in
   * kgf/m², does not make the dialog that holds the value change. A comma or a point both read
   * (`parseDecimal`); a value that does not parse leaves the stored one as it was. The unit is
   * shown beside the field, and follows the unit system.
   *
   * The bound value follows the typing; `onchange` is told once, when the field is left (a table
   * cell writes the model there, one undo step per edit). While the field has the focus, what is
   * typed is not rewritten under the cursor. `nullable`: an empty field is `null`, the default the
   * placeholder names (a J value left empty is the I value).
   */
  import { uiStore } from '../../../lib/store/ui.svelte';
  import { toDisplay, fromDisplay, unitLabel, type Quantity } from '../../../lib/utils/units';
  import { parseDecimal } from '../../../lib/utils/numeric-input';

  interface Props {
    /** SI; `null` only when `nullable`. */
    value: T;
    quantity: Quantity;
    /** SI bounds, checked after the conversion. */
    min?: number;
    max?: number;
    nullable?: boolean;
    placeholder?: string;
    testid?: string;
    cls?: string;
    /** The wrapper's class, for a host's own field layout. */
    wrap?: string;
    ariaLabel?: string;
    /** The id of the text that explains the field (`aria-describedby`). */
    describedBy?: string;
    title?: string;
    disabled?: boolean;
    /** The unit beside the field; off where a column header already says it. */
    showUnit?: boolean;
    /** The SI value, when the field is left with a value that reads. */
    onchange?: (si: T) => void;
  }
  let {
    value = $bindable(), quantity, min, max, nullable = false, placeholder, testid, cls = '', wrap = '',
    ariaLabel, describedBy, title, disabled = false, showUnit = true, onchange,
  }: Props = $props();

  const system = $derived(uiStore.unitSystem);
  const fmt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(+toDisplay(v, quantity, system).toPrecision(6)));

  let focused = $state(false);
  let text = $state('');
  // What the value says, written into the field whenever the reader is not typing in it.
  $effect(() => { const s = fmt(value); if (!focused) text = s; });

  /** The SI value the text reads, `null` for an empty nullable field, or `undefined` when it does not read. */
  function parse(raw: string): number | null | undefined {
    if (raw.trim() === '') return nullable ? null : undefined;
    const v = parseDecimal(raw);
    const si = v === null ? NaN : fromDisplay(v, quantity, system);
    if (!Number.isFinite(si) || (min !== undefined && si < min) || (max !== undefined && si > max)) return undefined;
    return si;
  }
  function input(el: HTMLInputElement) {
    text = el.value;
    const si = parse(el.value);
    if (si !== undefined) value = si as T;
  }
  function leave(el: HTMLInputElement) {
    const si = parse(el.value);
    if (si === undefined) { text = fmt(value); el.value = text; return; }
    value = si as T;
    text = fmt(si);
    onchange?.(si as T);
  }
</script>

<span class="qi {wrap}">
  <input type="text" inputmode="decimal" class={cls} value={text} {placeholder} {disabled} {title} aria-label={ariaLabel} aria-describedby={describedBy}
    onfocus={() => (focused = true)}
    onblur={() => (focused = false)}
    oninput={(e) => input(e.currentTarget)}
    onchange={(e) => leave(e.currentTarget)}
    onclick={(e) => e.stopPropagation()}
    data-testid={testid} />
  {#if showUnit}<span class="qi-unit">{unitLabel(quantity, system)}</span>{/if}
</span>

<style>
  .qi { display: inline-flex; align-items: center; gap: 4px; }
  .qi-unit { font-size: 0.66rem; color: var(--st-text-3); white-space: nowrap; }
</style>
