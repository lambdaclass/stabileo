<script lang="ts">
  /** A drawn mark per research field, for catalogue entries we have not run (never a paper's figure). */
  let { field, size = 56 }: { field: string; size?: number } = $props();
</script>

<svg class="fi" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  {#if field === 'fracture'}
    <rect x="6" y="8" width="36" height="32" rx="1" />
    <path d="M6 24h10l4-3 4 5 4-4 4 3 4-2" class="hot" />
  {:else if field === 'optimization'}
    <path d="M4 34h40M8 34l8-16h16l8 16M16 18l8 16 8-16M24 34V18" />
    <circle cx="8" cy="34" r="1.5" class="hot" /><circle cx="40" cy="34" r="1.5" class="hot" />
  {:else if field === 'metamaterials'}
    <path d="M8 8l16 8 16-8M8 8v16l16 8 16-8V8M8 24l16-8 16 8M24 16v16M8 24v16l16 8 16-8V24" />
  {:else if field === 'constitutive'}
    <path d="M8 40V8M8 40h32" /><path d="M8 40c6-14 12-20 20-22s10-1 12 0" class="hot" />
  {:else if field === 'digital-twins'}
    <path d="M10 40V18l8-8 8 8v22M10 26h16M10 33h16" /><path d="M30 30c2-4 4 4 6 0s4-4 6 0" class="hot" />
  {:else if field === 'differentiable-fem'}
    <path d="M6 40l12-24 12 24zM18 16l12 24 12-24z" /><path d="M24 8v8m-3-3 3 3 3-3" class="hot" />
  {:else if field === 'numerical-methods'}
    <path d="M6 40l18-32 18 32zM15 24h18M24 40l-9-16M24 40l9-16" />
  {:else if field === 'seismic'}
    <path d="M4 28h6l3-10 4 18 4-24 4 30 4-20 3 10h12" class="hot" />
  {:else}
    <path d="M6 30c6-16 30-16 36 0M6 30h36" />
  {/if}
</svg>

<style>
  .fi {
    fill: none;
    stroke: var(--fg-2);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .fi .hot {
    stroke: var(--lp-accent, #e5482a);
  }
</style>
