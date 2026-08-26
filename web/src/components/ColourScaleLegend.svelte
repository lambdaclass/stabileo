<script lang="ts">
  /**
   * The colour map's scale, bottom-left of the viewport.
   *
   * A gradient without one says WHERE the peaks are and not how big they are —
   * half the information, and the half a reader assumes they have. Red means
   * "the most of whatever this is", which is useless for judging a member and
   * misleading when comparing two models: the same red is 40 MPa in one and
   * 400 in the other.
   *
   * One component for both viewports. The 2D canvas could draw its own, and
   * did for the utilisation map, but then the two modes would carry two
   * legends drawn by two pieces of code that have to agree on a colour ramp —
   * and the ramp is defined once, in the code that paints the members.
   *
   * Positioned above the axes gizmo for the same reason the axial legend is:
   * the corner is shared, and the gizmo was there first.
   */
  import { resultsStore, uiStore } from '../lib/store';
  import { colourScaleSource } from '../lib/store/result-view';
  import { COLOUR_RAMP_STOPS, OVER_SCALE_RGB } from '../lib/three/colour-ramp';
  import { t } from '../lib/i18n';

  /**
   * The gradient is drawn from the SAME stops the painters interpolate — one
   * ramp, defined once in lib/three/colour-ramp. A legend with its own copy
   * of the ramp is a legend describing a map nobody is showing.
   */
  const gradient = `linear-gradient(to top, ${COLOUR_RAMP_STOPS.map((s) => `rgb(${s.rgb.join(',')}) ${s.at * 100}%`).join(', ')})`;

  /** The "past the top of the scale" colour, same source as the painters. */
  const OVER_SCALE_CSS = `rgb(${OVER_SCALE_RGB.join(',')})`;

  /**
   * The published scale, but only while it still describes what is on screen.
   *
   * The numbers come from the drawing code, which stops running the moment the
   * user picks a bending diagram instead — leaving the last map's maximum in
   * the store with no picture to belong to, and a legend floating over an
   * unrelated result. Matching the source is what makes that impossible rather
   * than merely unlikely: a stale value simply does not match.
   */
  const scale = $derived.by(() => {
    const s = resultsStore.colourScale;
    return s && s.source === colourScaleSource() ? s : null;
  });

  /**
   * Utilisation tops out at 1.00 — 100% of fy — but a member can demand MORE
   * than that, and the map paints it magenta, off the top of the bar. A bar
   * that ends at red with no word about the magenta above it leaves the most
   * important colour on screen unexplained, so the scale that can produce it
   * gets a cap entry.
   */
  const overScale = $derived(scale?.source === 'colorMap:stressRatio');

  /**
   * Four labels rather than a continuous axis: a bar 90 px tall cannot carry
   * more without them colliding, and the reader needs the top, the bottom and
   * enough between them to see that it is linear.
   */
  const ticks = $derived.by(() => {
    if (!scale) return [];
    return [1, 0.75, 0.5, 0.25, 0].map((f) => ({
      at: f,
      label: fmt(scale.max * f),
    }));
  });

  /** Compact enough for a 90 px bar; a scale label is a magnitude, not a result. */
  function fmt(v: number): string {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1000) return v.toExponential(1).replace('e+', 'e');
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    return v.toPrecision(2);
  }
</script>

{#if scale && uiStore.showColourScale}
  <div class="cs-legend" aria-label={t('results.colourScaleLegend')}>
    <div class="cs-rail">
      {#if overScale}
        <div class="cs-cap" style="background: {OVER_SCALE_CSS}"></div>
      {/if}
      <div class="cs-bar" style="background: {gradient}"></div>
    </div>
    <div class="cs-ticks">
      {#if overScale}
        <span class="cs-tick cs-cap-label">{t('results.overScale')}</span>
      {/if}
      {#each ticks as tick}
        <span class="cs-tick" style="bottom: calc({tick.at * 100}% - 0.45em)">{tick.label}</span>
      {/each}
    </div>
    {#if scale.unit}
      <span class="cs-unit">{scale.unit}</span>
    {/if}
  </div>
{/if}

<style>
  .cs-legend {
    position: absolute;
    /* Clear of the axes gizmo, which owns this corner. */
    left: 12px;
    bottom: 96px;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    pointer-events: none;
    z-index: 5;
  }

  .cs-bar {
    width: 14px;
    height: 90px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 2px;
  }

  /* Bar plus, for utilisation, the magenta "past fy" cap above it. */
  .cs-rail {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cs-cap {
    width: 14px;
    height: 10px;
    border: 1px solid var(--st-hair-strong);
    border-radius: 2px;
  }

  /* Sits above the 1.00 tick, level with the cap it names. */
  .cs-cap-label {
    bottom: calc(100% + 0.5em);
    white-space: nowrap;
  }

  .cs-ticks {
    position: relative;
    height: 90px;
    width: 3.2em;
  }

  .cs-tick {
    position: absolute;
    left: 0;
    font-size: 0.6rem;
    line-height: 1;
    color: var(--st-text-2);
    font-family: var(--st-mono, monospace);
    /* Readable over whatever the model happens to be behind it. */
    text-shadow: 0 0 3px var(--st-bg), 0 0 3px var(--st-bg);
  }

  .cs-unit {
    align-self: flex-start;
    font-size: 0.6rem;
    color: var(--st-text-3);
    text-shadow: 0 0 3px var(--st-bg), 0 0 3px var(--st-bg);
  }
</style>
