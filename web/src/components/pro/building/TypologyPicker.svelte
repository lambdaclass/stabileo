<script lang="ts">
  /**
   * The typologies of one kind of element as drawn chips: a small cross-section of each, so the
   * choice is read off the drawing and not off a list of names. The drawings are schematic and
   * share one stroke: slab and ground in grey, the element itself in the accent colour.
   */
  import { t } from '../../../lib/i18n';
  import { TYPOLOGIES } from '../../../lib/model/physical';

  let { kind, value = $bindable(), disabled = false, testid, exclude = [] }: {
    kind: 'column' | 'beam' | 'brace' | 'slab' | 'wall'; value: string; disabled?: boolean; testid?: string;
    /** Typologies placed by a tool of their own (the ramp), left out of this choice. */
    exclude?: string[];
  } = $props();

  const list = $derived((TYPOLOGIES[kind] ?? []).filter((ty) => !exclude.includes(ty)));
</script>

<div class="tp" role="radiogroup" aria-label={t('physical.typology')} data-testid={testid}>
  {#each list as ty (ty)}
    <button type="button" class="tp-chip" class:on={value === ty} role="radio" aria-checked={value === ty}
      {disabled} onclick={() => (value = ty)} title={t(`physical.typ.${ty}`)} data-testid={testid ? `${testid}-${ty}` : undefined}>
      <svg viewBox="0 0 40 28" aria-hidden="true">
        {#if kind === 'beam'}
          {#if ty === 'dropped'}<rect class="ctx" x="2" y="6" width="36" height="5" /><rect class="el" x="14" y="11" width="12" height="12" />
          {:else if ty === 'flat'}<rect class="ctx" x="2" y="10" width="36" height="6" /><rect class="el" x="10" y="10" width="20" height="6" />
          {:else if ty === 'inverted'}<rect class="ctx" x="2" y="17" width="36" height="5" /><rect class="el" x="14" y="5" width="12" height="12" />
          {:else if ty === 'foundation'}<line class="gnd" x1="2" y1="14" x2="38" y2="14" /><rect class="el" x="12" y="14" width="16" height="10" />{#each [4, 9, 31, 36] as x}<line class="gnd" x1={x} y1="14" x2={x - 3} y2="18" />{/each}
          {:else if ty === 'tie'}<line class="gnd" x1="2" y1="20" x2="38" y2="20" /><rect class="el" x="16" y="12" width="8" height="8" />
          {:else if ty === 'strap'}<line class="gnd" x1="2" y1="22" x2="38" y2="22" /><rect class="ctx" x="2" y="16" width="9" height="6" /><rect class="ctx" x="29" y="16" width="9" height="6" /><rect class="el" x="6" y="12" width="28" height="5" />
          {:else if ty === 'edge'}<rect class="ctx" x="2" y="6" width="26" height="5" /><rect class="el" x="26" y="6" width="10" height="16" />
          {:else if ty === 'steel'}<path class="el" d="M12 5h16M12 23h16M20 5v18" />
          {:else}<rect class="el" x="14" y="4" width="12" height="20" /><path class="ctx-l" d="M17 6v16M20 6v16M23 6v16" />{/if}
        {:else if kind === 'column'}
          {#if ty === 'concrete'}<rect class="el" x="11" y="5" width="18" height="18" />{#each [[14, 8], [26, 8], [14, 20], [26, 20]] as [x, y]}<circle class="bar" cx={x} cy={y} r="1.4" />{/each}
          {:else if ty === 'steel'}<path class="el" d="M11 5h18M11 23h18M20 5v18" />
          {:else if ty === 'composite'}<rect class="ctx" x="9" y="3" width="22" height="22" /><path class="el" d="M13 7h14M13 21h14M20 7v14" />
          {:else}<rect class="el" x="11" y="5" width="18" height="18" /><circle class="ctx-l" cx="20" cy="14" r="3" /><circle class="ctx-l" cx="20" cy="14" r="6" />{/if}
        {:else if kind === 'slab'}
          {#if ty === 'solid'}<rect class="el" x="2" y="10" width="36" height="8" />
          {:else if ty === 'joist'}<rect class="el" x="2" y="8" width="36" height="4" />{#each [4, 16, 28] as x}<rect class="ctx" x={x + 2} y="12" width="8" height="8" /><rect class="el" x={x - 1} y="12" width="3" height="8" />{/each}
          {:else if ty === 'waffle'}<rect class="el" x="2" y="8" width="36" height="4" />{#each [4, 15, 26, 36] as x}<path class="el" d="M{x - 2} 12h4l-1 9h-2z" />{/each}
          {:else if ty === 'hollowCore'}<rect class="el" x="2" y="8" width="36" height="12" />{#each [8, 16, 24, 32] as x}<circle class="ctx" cx={x} cy="14" r="3" />{/each}
          {:else if ty === 'composite'}<rect class="el" x="2" y="8" width="36" height="6" /><path class="ctx-l" d="M2 18h6l3-4h6l3 4h6l3-4h6l3 4" />
          {:else if ty === 'postTensioned'}<rect class="el" x="2" y="8" width="36" height="12" /><path class="ctx-l" d="M3 11Q20 26 37 11" />
          {:else}<path class="el" d="M2 24L38 8v5L2 27z" /><line class="gnd" x1="2" y1="27" x2="38" y2="27" />{/if}
        {:else if kind === 'wall'}
          {#if ty === 'concrete'}<rect class="el" x="14" y="2" width="12" height="24" /><path class="ctx-l" d="M17 4v20M23 4v20" />
          {:else if ty === 'masonry'}<rect class="el" x="12" y="2" width="16" height="24" />{#each [8, 14, 20] as y}<line class="ctx-l" x1="12" y1={y} x2="28" y2={y} />{/each}
          {:else}<rect class="el" x="16" y="2" width="9" height="24" /><line class="gnd" x1="2" y1="10" x2="16" y2="10" />{#each [4, 9, 14] as x}<line class="gnd" x1={x} y1="10" x2={x - 3} y2="14" />{/each}{/if}
        {:else}
          <rect class="ctx" x="4" y="3" width="32" height="22" /><path class="el" d="M4 25L36 3{ty === 'steel' ? 'M4 3L36 25' : ''}" />
        {/if}
      </svg>
      <span>{t(`physical.typ.${ty}`)}</span>
    </button>
  {/each}
</div>

<style>
  .tp { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  .tp-chip { display: flex; flex-direction: column; align-items: center; gap: 1px; width: 4.4rem; padding: 3px 2px;
    background: var(--st-surface); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; color: var(--st-text-2); }
  .tp-chip.on { border-color: var(--st-accent); color: var(--st-text); background: var(--st-surface-3); }
  .tp-chip:disabled { opacity: 0.5; cursor: default; }
  .tp-chip span { font-size: 0.6rem; line-height: 1.1; text-align: center; }
  .tp-chip svg { width: 40px; height: 28px; }
  .tp-chip svg :global(.el) { fill: color-mix(in srgb, var(--st-accent) 25%, transparent); stroke: var(--st-accent); stroke-width: 1.3; }
  .tp-chip svg :global(path.el) { fill: none; stroke-width: 2; }
  .tp-chip svg :global(.ctx) { fill: var(--st-surface-3); stroke: var(--st-text-3); stroke-width: 0.8; }
  .tp-chip svg :global(.ctx-l) { fill: none; stroke: var(--st-text-3); stroke-width: 0.7; }
  .tp-chip svg :global(.gnd) { stroke: var(--st-text-3); stroke-width: 0.9; }
  .tp-chip svg :global(.bar) { fill: var(--st-text); }
</style>
