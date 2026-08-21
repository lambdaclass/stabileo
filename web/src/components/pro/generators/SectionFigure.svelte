<script lang="ts">
  /**
   * The section a profile row defines, drawn small, beside the row.
   *
   * The real canonical outline, replicated through the same placement table the property
   * arithmetic uses — so the figure shows whether the two channels are back to back or toe
   * to toe, which way round the profile sits after a rotation, and how 8 mm of gap actually
   * compares to a 100 mm web. None of that is legible from the labels.
   *
   * When there is no outline it says so instead of drawing a plausible box: a
   * properties-only family has no geometry, and inventing one here would be the same
   * over-claim the rest of this branch exists to avoid.
   */
  import { t } from '../../../lib/i18n';
  import {
    buildSectionOutline, outlineExtentMm, outlineUnavailableKey,
  } from '../../../lib/engine/generators/section-outline';
  import type { BuiltUpArrangement } from '../../../lib/engine/generators/built-up-section';

  interface Props {
    profileName: string;
    arrangement: BuiltUpArrangement;
    gapMm: number;
    rotationDeg: number | 'auto';
    /** Colour of the role this section belongs to, so the row reads with the preview. */
    colour: string;
    sizePx?: number;
  }
  const { profileName, arrangement, gapMm, rotationDeg, colour, sizePx = 34 }: Props = $props();

  const outline = $derived(buildSectionOutline({ profileName, arrangement, gapMm, rotationDeg }));
  const vb = $derived(
    `${outline.viewBox.x} ${-outline.viewBox.y - outline.viewBox.h} ${outline.viewBox.w} ${outline.viewBox.h}`,
  );
  const mm = $derived(outlineExtentMm(outline));

  /**
   * Accessible name.
   *
   * An SVG with no name is invisible to a screen reader, and this one carries information the
   * row does not repeat: the outside dimensions of the assembled section.
   */
  const label = $derived(
    outline.unavailable
      ? t(outlineUnavailableKey(outline.unavailable))
      : `${profileName} · ${mm.widthMm}×${mm.heightMm} mm`,
  );
</script>

<div class="fig" style={`width:${sizePx}px;height:${sizePx}px`} title={label}>
  {#if outline.unavailable}
    <span class="none" aria-label={label} role="img">—</span>
  {:else}
    <!--
      Z is negated in the viewBox rather than by transforming every vertex: the outline is
      produced in structural coordinates (z up) and SVG counts downward, and flipping the
      window keeps the polygons in the frame the properties are stated in.
    -->
    <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
      <g transform="scale(1,-1)">
        {#each outline.polygons as p, i (i)}
          <polygon
            points={p.vertices.map(([y, z]) => `${y},${z}`).join(' ')}
            fill={p.isVoid ? '#071322' : colour}
            fill-opacity={p.isVoid ? 1 : 0.55}
            stroke={colour}
            stroke-width={Math.max(outline.viewBox.w, outline.viewBox.h) / 90}
          />
        {/each}
      </g>
    </svg>
  {/if}
</div>

<style>
  .fig {
    flex: 0 0 auto;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid #24486e; border-radius: 3px;
    background: #071322;
    overflow: hidden;
  }
  svg { width: 100%; height: 100%; display: block; padding: 2px; box-sizing: border-box; }
  .none { font-size: 0.7rem; color: #566; }
</style>
