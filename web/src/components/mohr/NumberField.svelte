<script lang="ts">
  let { label, value = $bindable(), readonly = false, title, min, max, step, suffix, testid, compact = false }: {
    label: string; value: number; readonly?: boolean; title?: string; min?: number; max?: number; step?: number; suffix?: string; testid?: string; compact?: boolean;
  } = $props();

  const show = (v: number) => String(Number(v.toPrecision(10)));
  let text = $state('');
  let focused = $state(false);
  let invalid = $state(false);
  $effect(() => { const v = value; if (!focused) { text = show(v); invalid = false; } });

  function input(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    const v = Number(text.replace(',', '.'));
    invalid = text.trim() === '' || !Number.isFinite(v) || (min !== undefined && v < min) || (max !== undefined && v > max);
    if (!invalid) value = v;
  }
</script>

<span class="mh-field" class:mh-field-compact={compact} class:mh-readonly={readonly}>
  <span class="mh-field-label" aria-hidden="true">{label}</span>
  <input type="text" inputmode="decimal" aria-label={label} {title} value={text} {readonly} tabindex={readonly ? -1 : undefined}
    aria-invalid={invalid} data-testid={testid}
    onfocus={() => (focused = true)}
    onblur={() => { focused = false; text = show(value); invalid = false; }}
    oninput={input}
    onkeydown={(e) => {
      if (readonly || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const next = value + (e.key === 'ArrowUp' ? 1 : -1) * (step ?? 1);
      value = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
      text = show(value);
    }} />
  {#if suffix}<span class="mh-field-suffix" aria-hidden="true">{suffix}</span>{/if}
</span>
