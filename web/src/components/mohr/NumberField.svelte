<script lang="ts">
  import type { Attachment } from 'svelte/attachments';

  let { label, value = $bindable(), scale = 1, places, readonly = false, title, min, max, step = 1, suffix, testid, compact = false, shear = false }: {
    label: string; value: number; scale?: number; places?: number; readonly?: boolean; title?: string; min?: number; max?: number; step?: number; suffix?: string; testid?: string; compact?: boolean; shear?: boolean;
  } = $props();

  const show = (v: number) => String(Number(places === undefined ? (v * scale).toPrecision(7) : (v * scale).toFixed(places)));
  let text = $state('');
  let focused = $state(false);
  let invalid = $state(false);
  let shownScale = scale;
  $effect(() => {
    const v = value, unitChanged = scale !== shownScale;
    void places;
    shownScale = scale;
    if (!focused || unitChanged) { text = show(v); invalid = false; }
  });

  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const tidy = (v: number) => Number(v.toPrecision(12));

  function input(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    const v = Number(text.replace(',', '.'));
    invalid = text.trim() === '' || !Number.isFinite(v) || (min !== undefined && v < min) || (max !== undefined && v > max);
    if (!invalid) value = v / scale;
  }
  function nudge(steps: number) {
    if (readonly) return;
    value = clamp(tidy(value * scale + steps * step)) / scale;
    text = show(value);
    invalid = false;
  }
  const factor = (e: { shiftKey: boolean; altKey: boolean }) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);

  const wheel: Attachment<HTMLInputElement> = (el) => {
    const on = (e: WheelEvent) => {
      if (document.activeElement !== el || e.deltaY === 0) return;
      e.preventDefault();
      nudge((e.deltaY < 0 ? 1 : -1) * factor(e));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  };

  let scrub = $state<{ x: number; start: number; id: number } | null>(null);
  function scrubStart(e: PointerEvent) {
    if (readonly || e.button !== 0) return;
    e.preventDefault();
    scrub = { x: e.clientX, start: value * scale, id: e.pointerId };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }
  function scrubMove(e: PointerEvent) {
    if (!scrub || scrub.id !== e.pointerId) return;
    const steps = Math.round((e.clientX - scrub.x) / 6);
    value = clamp(tidy(scrub.start + steps * step * factor(e))) / scale;
    text = show(value);
  }
</script>

<span class="mh-field" class:mh-field-compact={compact} class:mh-readonly={readonly} class:mh-field-shear={shear} class:mh-scrubbing={scrub}>
  <span class="mh-field-label" aria-hidden="true" onpointerdown={scrubStart} onpointermove={scrubMove} onpointerup={() => (scrub = null)} onpointercancel={() => (scrub = null)}>{label}</span>
  <input type="text" inputmode="decimal" aria-label={label} title={title} value={text} {readonly} tabindex={readonly ? -1 : undefined}
    aria-invalid={invalid} data-testid={testid} autocomplete="off" spellcheck="false" {@attach wheel}
    onfocus={() => (focused = true)}
    onblur={() => { focused = false; text = show(value); invalid = false; }}
    oninput={input}
    onkeydown={(e) => {
      if (e.key === 'Enter') { (e.currentTarget as HTMLInputElement).blur(); return; }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      nudge((e.key === 'ArrowUp' ? 1 : -1) * factor(e));
    }} />
  {#if suffix}<span class="mh-field-suffix" aria-hidden="true">{suffix}</span>{/if}
</span>
