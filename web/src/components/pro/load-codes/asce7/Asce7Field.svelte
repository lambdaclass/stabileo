<script lang="ts">
  import { parseDecimal } from '../../../../lib/utils/numeric-input';

  interface Props {
    label: string;
    value: number | undefined;
    unit?: string;
    hint?: string;
    placeholder?: string;
    testid?: string;
    onchange: (v: number | undefined) => void;
  }
  let { label, value, unit = '', hint = '', placeholder = '', testid, onchange }: Props = $props();
  let text = $state('');
  let focused = $state(false);
  $effect(() => { if (!focused) text = value === undefined ? '' : String(+value.toFixed(6)); });
  function commit() {
    focused = false;
    const n = parseDecimal(text);
    onchange(n === null ? undefined : n);
  }
</script>

<label class="a7-field">
  <span class="pk-label">{label}</span>
  <span class="pk-row">
    <input class="a7-input" type="text" inputmode="decimal" bind:value={text} {placeholder} data-testid={testid}
      onfocus={() => (focused = true)} onblur={commit} onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
    {#if unit}<span class="pk-label">{unit}</span>{/if}
  </span>
  {#if hint}<span class="pk-hint">{hint}</span>{/if}
</label>

<style>
  .a7-field { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .a7-input { width: 6.5rem; }
</style>
