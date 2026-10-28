<script lang="ts">
  import { publicI18n } from '../../../lib/i18n/store.svelte';
  import { formatDecimal, parseDecimal } from './numeric';

  let { value = $bindable(), min, max, label }: { value: number; min: number; max: number; label: string } = $props();
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
    border: 1px solid var(--hair);
    border-radius: 3px;
    padding: 0.3rem 0.4rem;
    font: 13px var(--lp-mono);
    width: 8rem;
    min-width: 0;
  }
  input.invalid {
    border-color: #d9a441;
  }
</style>
