<script lang="ts">
  import type { Snippet } from 'svelte';

  let { label, summary, children, wide = false, testid, panelTestid, open = $bindable(false), title, button = 'mh-btn mh-btn-ghost' }: {
    label: string; summary: Snippet; children: Snippet; wide?: boolean; testid?: string; panelTestid?: string; open?: boolean; title?: string; button?: string;
  } = $props();
  let root = $state<HTMLDetailsElement>();

  $effect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (root && !root.contains(e.target as Node)) open = false; };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      open = false;
      root?.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', away, true);
    root?.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away, true); root?.removeEventListener('keydown', key); };
  });
</script>

<details class="mh-menu" class:mh-menu-wide={wide} bind:this={root} bind:open>
  <summary class={button} aria-label={label} title={title ?? label} data-testid={testid}>{@render summary()}</summary>
  <div class="mh-menu-panel" data-testid={panelTestid}>{@render children()}</div>
</details>
