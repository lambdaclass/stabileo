<script lang="ts">
  let { name }: { name: 'download' | 'reset' | 'sliders' | 'play' | 'pause' } = $props();
</script>

<svg class="mh-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
  {#if name === 'download'}
    <path d="M8 2.5v7M4.8 6.6 8 9.8l3.2-3.2M3 12.8h10" />
  {:else if name === 'reset'}
    <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" /><path d="M3 2.6v2.6h2.6" />
  {:else if name === 'sliders'}
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /><circle cx="10.5" cy="4.5" r="1.6" /><circle cx="5.5" cy="8" r="1.6" /><circle cx="9" cy="11.5" r="1.6" />
  {:else if name === 'play'}
    <path class="mh-icon-fill" d="M5 3.2v9.6L12.6 8Z" />
  {:else}
    <path class="mh-icon-fill" d="M4.5 3.2h2.4v9.6H4.5ZM9.1 3.2h2.4v9.6H9.1Z" />
  {/if}
</svg>
