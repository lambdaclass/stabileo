<script lang="ts">
  /**
   * The small glyphs of a tool's main choices on a phone: create a node or
   * edit its joints, a rigid or a pinned member, the support types, the load
   * types. Each one is its own drawing — none repeats a tool button's icon
   * (ribbon/Icon.svelte) or another choice's — and draws what the choice
   * does. Hidden on a desktop, where the options bar stays compact; the
   * phone's modelling sheet shows them (DataTable).
   */
  export type GlyphName =
    | 'nodeCreate' | 'joints' | 'frameRigid' | 'trussPinned'
    | 'supFixed' | 'supPinned' | 'supRoller' | 'supSpring'
    | 'loadPoint' | 'loadDistributed' | 'loadThermal';
  let { name }: { name: GlyphName } = $props();
</script>

<svg class="ft-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'nodeCreate'}
    <!-- A new point, and the plus that adds it. -->
    <circle cx="9" cy="15" r="3.2" />
    <path d="M17.5 3.5v7M14 7h7" />
  {:else if name === 'joints'}
    <!-- A member interrupted by an open ring: a hinge in the bar. -->
    <path d="M2.5 14.5l6.4-2.1M15.1 11.6l6.4-2.1" />
    <circle cx="12" cy="12" r="3.1" />
  {:else if name === 'frameRigid'}
    <!-- A portal with gusseted, stiff corners. -->
    <path d="M5 20.5V5h14v15.5" />
    <path d="M5 8.5L8.5 5M15.5 5L19 8.5" />
  {:else if name === 'trussPinned'}
    <!-- A triangle of pin-ended bars. -->
    <path d="M4.5 18.5L12 6l7.5 12.5z" />
    <circle cx="4.5" cy="18.5" r="1.6" />
    <circle cx="19.5" cy="18.5" r="1.6" />
    <circle cx="12" cy="6" r="1.6" />
  {:else if name === 'supFixed'}
    <!-- A post built into the ground. -->
    <path d="M12 3.5v10" />
    <path d="M5 13.5h14" />
    <path d="M7 13.5l-2 4M11 13.5l-2 4M15 13.5l-2 4M19 13.5l-2 4" />
  {:else if name === 'supPinned'}
    <!-- A pin on a triangle: it turns, it does not move. -->
    <circle cx="12" cy="6" r="2" />
    <path d="M12 8l5.5 9h-11z" />
    <path d="M4 20h16" />
  {:else if name === 'supRoller'}
    <!-- A triangle on two rollers: it slides. -->
    <path d="M12 4l5.5 8.5h-11z" />
    <circle cx="8.5" cy="16" r="2" />
    <circle cx="15.5" cy="16" r="2" />
    <path d="M4 20.5h16" />
  {:else if name === 'supSpring'}
    <!-- A coil. -->
    <path d="M12 2.5v3l4 1.5-8 3 8 3-8 3 4 1.5v4" />
  {:else if name === 'loadPoint'}
    <!-- One force onto one point. -->
    <path d="M12 3v11" />
    <path d="M8.5 10.5L12 14l3.5-3.5" />
    <circle cx="12" cy="19" r="1.8" />
  {:else if name === 'loadDistributed'}
    <!-- A line of forces along a span. -->
    <path d="M4 5h16" />
    <path d="M6 5v10M12 5v10M18 5v10" />
    <path d="M4.3 13l1.7 2 1.7-2M10.3 13l1.7 2 1.7-2M16.3 13l1.7 2 1.7-2" />
    <path d="M4 19.5h16" />
  {:else if name === 'loadThermal'}
    <!-- A thermometer. -->
    <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />
    <path d="M12 9v7" />
  {/if}
</svg>

<style>
  /* Compact desktop options bar: no glyph. The phone sheet shows it. */
  .ft-ic { display: none; flex: none; }
</style>
