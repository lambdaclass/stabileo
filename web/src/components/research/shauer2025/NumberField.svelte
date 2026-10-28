<script lang="ts">
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { formatDecimal, parseDecimal } from './numeric';

  let { value = $bindable(), min, max, label, id = undefined }: { value: number; min: number; max: number; label: string; id?: string } = $props();
  let text = $state('');
  let invalid = $state(false);
  let focused = $state(false);

  $effect(() => {
    if (!focused) {
      text = formatDecimal(value, publicI18n.locale);
      invalid = false;
    }
  });

  function onInput() {
    const v = parseDecimal(text);
    invalid = v === null || v < min || v > max;
    if (v !== null) value = v;
  }
</script>

<input
  {id}
  aria-describedby={id ? `${id}-hint` : undefined}
  type="text"
  inputmode="decimal"
  autocomplete="off"
  spellcheck="false"
  aria-label={label}
  aria-invalid={invalid}
  class:invalid
  bind:value={text}
  oninput={onInput}
  onfocus={() => (focused = true)}
  onblur={() => (focused = false)}
/>

<style>
  input {
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--rs-control-border);
    border-radius: var(--st-radius, 3px);
    padding: 0 0.5rem;
    font: 400 0.9375rem/1 var(--st-sans);
    text-align: right;
    font-variant-numeric: tabular-nums;
    height: var(--rs-control-h);
    background: var(--st-surface-3);
    width: 100%;
    min-width: 0;
  }
  input.invalid {
    border-color: #d9a441;
  }
</style>
