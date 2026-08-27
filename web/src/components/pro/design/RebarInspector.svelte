<script lang="ts">
  /**
   * Where the current selection is reported: a column beside the cage, not a strip under it.
   *
   * ── The measurement this exists to answer ──────────────────────────
   *
   * F6 §6 asks for "a selection panel on the right, aligned with the app". It was at the BOTTOM
   * of the stage, full width, and measured on a 1280×720 window it was 1008 × 96 px with a bar
   * selected and **15 px** with nothing selected — a hairline in the place the reader was told to
   * look. So it was simultaneously wide enough for nothing and short enough to disappear.
   *
   * A column is the right shape for what it holds: a `<dl>` of a dozen short label/value pairs
   * reads down, not across, and at 1008 px wide those pairs were a line of text with a metre of
   * blank beside them.
   *
   * ── Where `SIDE_PANEL_MIN_WIDTH` comes from ────────────────────────
   *
   * From the arithmetic, not from a round figure. With the rail open the canvas is the window
   * minus its 17 rem, and this panel wants another 17:
   *
   *     1280   canvas 1008 → ~740 left for the cage    readable
   *     1024   canvas  752 → ~490                      a slot
   *      900   canvas  628 → ~370                      a slot
   *
   * A viewport of 370 px is the exact defect this file's parent records about the sidebar the
   * overlay was built to escape — "inspecting a cage of thousands of bars through a slot a few
   * hundred pixels wide". So the threshold sits at 1100, above the widest width that fails, and
   * below it the panel is a strip under the canvas: the same content, the same testid, one fewer
   * column. `RebarWorkspace` measures 1280 · 1024 · 900 · 820, and only the first can pay.
   *
   * ── Why the shape is a PROP and not a media query ──────────────────
   *
   * Because the parent has to know it too. Putting the panel beside the canvas means turning
   * `.stage` into a row, and that decision and this one are the same decision — expressed as two
   * media queries in two components they are one number written twice, which is the drift this
   * tree keeps finding. `RebarWorkspace` already observes the window for the rail's own
   * threshold; it owns this one as well and hands the answer down.
   *
   * ── Why it is a component at all ───────────────────────────────────
   *
   * `RebarWorkspace.svelte` sits within a few lines of the 600-line ceiling
   * `rc-design-gates.test.ts` enforces, and this is layout the workspace does not otherwise need
   * to hold. `SelectionDetails` still renders the CONTENT; this is the box it sits in.
   */
  import { t } from '../../../lib/i18n';

  interface Props {
    /** True while the panel is a column beside the canvas rather than a strip under it. */
    side: boolean;
    /** The member the camera is on, echoed as data so a spec can read it without Three.js. */
    focusedElement: number | null;
    /** Whether anything is selected, so the region can say which state it is in. */
    hasSelection: boolean;
    children: import('svelte').Snippet;
  }
  const { side, focusedElement, hasSelection, children }: Props = $props();
</script>

<!--
  A named region with a visible heading, which the strip never had.

  Without one the panel was an unlabelled box of numbers, and with nothing selected an unlabelled
  box of one grey sentence. The name is what makes it reachable by landmark, and that matters here
  more than usual: the selection is often made in a canvas a screen reader cannot describe at all.

  `aria-labelledby` rather than `aria-label`, so the region and the heading are one string. A label
  duplicating a visible heading is announced twice.
-->
<aside
  class="inspector"
  class:side
  data-testid="rebar-inspector"
  data-focused={focusedElement ?? ''}
  data-selected={hasSelection ? 'true' : 'false'}
  data-layout={side ? 'column' : 'stacked'}
  aria-labelledby="rebar-inspector-title"
>
  <h3 id="rebar-inspector-title">{t('detailing.scene.selection.title')}</h3>
  {@render children()}
</aside>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    /* Its own height, never the content's: an empty selection must not collapse the box, and a
       bar with a long pin-reach sentence must not stretch the workspace. Stated the same way as
       the rail opposite, and for the same reason. */
    flex: 0 0 auto;
    min-width: 0;
    padding: 0.6rem;
    overflow-y: auto;
    background: var(--st-surface);
    /* The floor the 15 px measurement was missing. A panel that reports "nothing selected" has
       to be legible while it says so. */
    min-height: 3.2rem;
  }

  /* Beside the canvas. 17 rem is the rail's width opposite it, so the cage sits between two
     equal columns rather than off-centre. */
  .inspector.side {
    width: 17rem;
    border-left: 1px solid var(--st-hair);
  }

  /* Under the canvas, where the window cannot afford a third column. */
  .inspector:not(.side) {
    width: auto;
    max-height: 9rem;
    border-top: 1px solid var(--st-hair);
  }

  h3 {
    margin: 0;
    font-size: 0.66rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--st-text-2);
  }
</style>
