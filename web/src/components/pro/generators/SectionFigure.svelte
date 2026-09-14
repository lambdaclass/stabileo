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
        <!--
          The void's fill comes from the STYLESHEET, not from a `fill` attribute.

          It has to be exactly the container's background — a void is a hole, and a hole that is
          a near-match reads as a darker solid. Writing the same token in two places is how they
          drift, so `.fig` and `polygon` both resolve `--st-bg` from the stylesheet, and the
          equality is one a test can read off the two declarations rather than take on trust.

          `fill="var(--st-bg)"` would render — the modal already hands this component a
          `var(--st-value)` for its stroke and it draws — but a presentation attribute is the
          weakest thing in the cascade and it sits in the template, where nothing relates it to
          the rule painting the background it has to match.

          The role colour is an inline `style`, which outranks the class, so a solid polygon
          overrides both the fill and the opacity in one declaration.
        -->
        {#each outline.polygons as p, i (i)}
          <polygon
            points={p.vertices.map(([y, z]) => `${y},${z}`).join(' ')}
            style={p.isVoid ? '' : `fill:${colour};fill-opacity:0.55`}
            stroke={colour}
            stroke-width={Math.max(outline.viewBox.w, outline.viewBox.h) / 90}
          />
        {/each}
      </g>
    </svg>
  {/if}
</div>

<style>
  /*
   * ── The four literals this component used to carry, and what replaced them ──
   *
   * It was the only metallic component with hardcoded colour: `#071322` twice — the well and
   * the void inside it, which have to be the same value — `#24486e` for the frame, and `#566`
   * for the em dash that stands in when there is no outline. Everything else on this surface
   * reaches for `--st-*`.
   *
   * The migration is to tokens the system already shares; no new token is introduced, because
   * `tokens.css` is H1's and `m1-token-proposal-reconciliation.md` is where that boundary is
   * recorded. Each choice was measured rather than picked by eye:
   *
   *   · **well and void → `--st-bg`.** One token in two places, so "the void matches the
   *     container" is structural rather than a pair of literals kept equal by hand. Against the
   *     row it sits on the well goes 1.14 → 1.11, and `#071322` against `--st-bg` is 1.02 — the
   *     figure does not visibly change colour. What it gains is agreement with the modal's own
   *     `.preview` well, which was ALREADY `--st-bg`: a nested well that differed from its
   *     container for no reason anyone had decided.
   *
   *   · **frame → `--st-hair-strong`, not `--st-hair`.** `--st-hair` is the obvious reading and
   *     it is the wrong one here. Composited on the row it gives 1.48, BELOW the 1.74 the
   *     literal had — the frame would come out fainter than before, which is a regression
   *     measured in the same units the decision asked about. `--st-hair-strong` gives 2.03 on
   *     the row and 2.07 on the well, at or above the literal on both grounds. There is also a
   *     structural reason: inside the modal this figure sits within a `--st-hair` preview well,
   *     and a nested frame in the same token as its parent's is a frame nobody can see.
   *     Neither value reaches the 3:1 WCAG 2.1 §1.4.11 asks of a boundary that identifies a
   *     COMPONENT — this is a decorative frame around a picture, not a control edge, and the
   *     literal did not reach it either.
   *
   *   · **the em dash → `--st-text-2`.** `#566` on the old well was **3.02**, and `--st-text-3`
   *     would be 4.03: both under AA. This glyph is not decoration — it is the whole visible
   *     content of the state where the catalogue has no geometry and the component refuses to
   *     invent one, so it is the last thing that should be hard to read. `--st-text-2` on
   *     `--st-bg` is 7.00, which closes a pre-existing failure rather than carrying it across.
   */
  .fig {
    flex: 0 0 auto;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--st-hair-strong); border-radius: 3px;
    background: var(--st-bg);
    overflow: hidden;
  }
  svg { width: 100%; height: 100%; display: block; padding: 2px; box-sizing: border-box; }
  /* The void, and only the void: a solid polygon overrides both of these from its `style`. */
  polygon { fill: var(--st-bg); fill-opacity: 1; }
  .none { font-size: 0.7rem; color: var(--st-text-2); }
</style>
