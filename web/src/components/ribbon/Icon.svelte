<script lang="ts">
  /**
   * Line icons for the ribbon.
   *
   * The ribbon shipped with Unicode glyphs — ●, ▬, ▽, ✋ — which was quick and
   * looked it. They came from different typefaces, so their weights and optical
   * sizes never matched; several are emoji on some platforms and render in
   * colour; and none of them says anything specific about structural analysis.
   * A hand does not mean "pan" any more than a triangle means "pinned support".
   *
   * These are drawn instead: one 24×24 grid, one stroke weight, `currentColor`
   * so a disabled or active button tints them with no extra rules, and shapes
   * taken from the drawings an engineer already reads — a roller on its
   * circles, a moment as a parabola, shear as the step it actually is.
   *
   * `stroke-width` is 1.6 at 24 units, which lands near a hairline at the sizes
   * the ribbon uses and keeps the icons in the same visual family as the
   * hairline borders around them.
   */

  type Props = { name: string; size?: number; rotate?: number };
  /**
   * `rotate` distinguishes a pair that shares a shape but not an axis. My and
   * Mz are the same bending action about perpendicular axes, and so are Vz and
   * Vy — drawing them identically made the two halves of the results row
   * indistinguishable. Turning one by 90° says "same force, other axis" without
   * inventing a second icon that would imply a different quantity.
   */
  let { name, size = 22, rotate = 0 }: Props = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
  style={rotate ? `transform: rotate(${rotate}deg)` : undefined}
>
  {#if name === 'select'}
    <!-- Arrow cursor, the one shape every application agrees on. -->
    <path d="M5 3l6.5 16 2.2-6.4 6.3-2.2z" />
  {:else if name === 'pan'}
    <!-- Four-way move, not a hand: the gesture is panning, not grabbing. -->
    <path d="M12 3v18M3 12h18" />
    <path d="M12 3l-2.4 2.6M12 3l2.4 2.6M12 21l-2.4-2.6M12 21l2.4-2.6" />
    <path d="M3 12l2.6-2.4M3 12l2.6 2.4M21 12l-2.6-2.4M21 12l-2.6 2.4" />
  {:else if name === 'view2d'}
    <!-- A framed plane with its grid. -->
    <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
    <path d="M9 4.5v15M15 4.5v15M3.5 9.5h17M3.5 14.5h17" />
  {:else if name === 'view3d'}
    <!-- Isometric box. -->
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 3v18M4 7.5l8 4.5 8-4.5" />
  {:else if name === 'node'}
    <!-- A joint: the point plus the crosshair that places it. -->
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
  {:else if name === 'element'}
    <!-- A member spanning two joints. -->
    <path d="M6.6 17.4L17.4 6.6" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="5" r="2" />
  {:else if name === 'material'}
    <!-- A hatched square: the drafting convention for "this is material", and
         the same mark the PRO ribbon uses. -->
    <rect x="4.5" y="4.5" width="15" height="15" rx="1.5" />
    <path d="M7 15.5L15.5 7" />
    <path d="M10.5 17.5L17.5 10.5" />
  {:else if name === 'section'}
    <!-- An I-beam seen end-on. The section IS a shape, so the icon is one
         rather than a document or a table. -->
    <path d="M6 5.5h12" />
    <path d="M6 18.5h12" />
    <path d="M12 5.5v13" />
  {:else if name === 'support'}
    <!-- Pinned support: triangle on hatched ground. -->
    <path d="M12 6l6 9H6z" />
    <path d="M3.5 15h17" />
    <path d="M6 15l-1.8 3M11 15l-1.8 3M16 15l-1.8 3M21 15l-1.8 3" />
  {:else if name === 'load'}
    <!-- Point load onto a member. -->
    <path d="M12 3v12" />
    <path d="M8.4 11.6L12 15.4l3.6-3.8" />
    <path d="M4 19.5h16" />
  {:else if name === 'solve'}
    <path d="M7 4.5l12 7.5-12 7.5z" />
  {:else if name === 'advanced'}
    <!-- Sliders: parameters, not a gear. A gear means settings. -->
    <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h9M17 17h3" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="15" cy="17" r="2" />
  {:else if name === 'data'}
    <!-- A table, because that is literally what the panel shows. -->
    <rect x="3.5" y="4.5" width="17" height="15" rx="1" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15" />
  {:else if name === 'settings'}
    <!--
      A gear, drawn as one outline.
      ─────────────────────────────
      First attempt was a circle ringed by eight straight rays: that is a sun,
      because rays radiate AWAY from the disc. The second added a second circle
      around them, which read as a sun in a frame.

      A gear is a single closed profile that alternates between a root radius
      and a tip radius — the teeth are part of the body, not decoration on it.
      Eight teeth at r=10.4 over roots at r=7.6, with the bore at r=3.2, which
      keeps the hub visible at 16 px where the ribbon renders it.
    -->
    <path d="M13.42 3.2l.28 2.2 1.9.79 1.75-1.36 1.82 1.82-1.36 1.75.79 1.9 2.2.28v2.58l-2.2.28-.79 1.9 1.36 1.75-1.82 1.82-1.75-1.36-1.9.79-.28 2.2h-2.58l-.28-2.2-1.9-.79-1.75 1.36-1.82-1.82 1.36-1.75-.79-1.9-2.2-.28v-2.58l2.2-.28.79-1.9-1.36-1.75 1.82-1.82 1.75 1.36 1.9-.79.28-2.2z" />
    <circle cx="12" cy="12" r="3.2" />
  {:else if name === 'save'}
    <!-- A diskette: still the one shape everyone reads as "save". -->
    <path d="M4.5 4.5h11.4L19.5 8.1v11.4h-15z" />
    <path d="M8 4.5v5h7v-5" />
    <rect x="7.5" y="13" width="9" height="6.5" />
  {:else if name === 'undo'}
    <path d="M4 10h10a5 5 0 0 1 0 10H8" />
    <path d="M7.5 6.5L4 10l3.5 3.5" />
  {:else if name === 'redo'}
    <path d="M20 10H10a5 5 0 0 0 0 10h6" />
    <path d="M16.5 6.5L20 10l-3.5 3.5" />
  {:else if name === 'none'}
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6 18L18 6" />
  {:else if name === 'deformed'}
    <!-- The undeflected member, ghosted, with the deflected one over it. -->
    <path d="M3 8h18" opacity="0.4" />
    <path d="M3 8c4 0 5 9 9 9s5-9 9-9" />

  <!--
    Internal forces are drawn as the ACTION ON A CUT SECTION, not as their
    diagram. A diagram is what the result looks like plotted along a member; the
    arrows either side of a cut face are what the force IS, and they are how the
    convention is taught and how an engineer recognises it at a glance. Drawing
    the diagram made every one of these look like a squiggle on a baseline, so
    moment and shear read as near-identical curves.

    Each is a section face with the characteristic arrow pair:
      N  opposed arrows normal to the face      (pulls apart / pushes together)
      V  opposed arrows parallel to the face    (slides)
      M  opposed curved arrows                  (rotates)
      T  one curved arrow about the axis        (twists)
  -->
  {:else if name === 'axial'}
    <rect x="10.6" y="5" width="2.8" height="14" rx="0.4" fill="currentColor" stroke="none" />
    <path d="M8.4 12H2.6M17.6 12h3.8" />
    <path d="M5 9.4L2.4 12 5 14.6M19 9.4L21.6 12 19 14.6" />
  {:else if name === 'shear' || name === 'shearZ' || name === 'shearY'}
    <rect x="10.6" y="5" width="2.8" height="14" rx="0.4" fill="currentColor" stroke="none" />
    <path d="M7 17.5V6.5M17 6.5v11" />
    <path d="M4.6 9L7 6.4 9.4 9M14.6 15L17 17.6 19.4 15" />
  {:else if name === 'moment' || name === 'momentY' || name === 'momentZ'}
    <rect x="10.6" y="5" width="2.8" height="14" rx="0.4" fill="currentColor" stroke="none" />
    <path d="M8.4 7.6a5 5 0 0 0 0 8.8" />
    <path d="M15.6 7.6a5 5 0 0 1 0 8.8" />
    <path d="M6.6 6.6l1.9 1L7.6 9.6M17.4 6.6l-1.9 1 .9 2" />
  {:else if name === 'torsion'}
    <path d="M12 4v16" opacity="0.45" />
    <path d="M5.5 9.5a7.5 4 0 1 0 13 0" />
    <path d="M4.4 6.6l1.2 3.2 3.2-.9" />

  {:else if name === 'material'}
    <!--
      A material sample: a square with the hatch a section drawing uses to say
      "this is solid material". Materials were borrowing the table icon, which
      says where the data lives rather than what it is.
    -->
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M7 17L17 7M11 17l6-6M7 13l6-6" />
  {:else if name === 'section'}
    <!--
      An I profile seen end-on — the shape an engineer means by "section". It
      was borrowing the axial-force icon, which is a force, not a geometry.
    -->
    <path d="M5.5 4.5h13M5.5 19.5h13" />
    <path d="M12 4.5v15" />
    <path d="M8.5 4.5v1.6h7V4.5M8.5 19.5v-1.6h7v1.6" opacity="0.5" />
  {:else if name === 'constraint'}
    <!--
      Two nodes tied rigidly: the link, not a hand. Constraints were borrowing
      the pan icon, which is a viewport gesture.
    -->
    <circle cx="6" cy="12" r="2.2" />
    <circle cx="18" cy="12" r="2.2" />
    <path d="M8.2 12h7.6" />
    <path d="M10 9.4v5.2M14 9.4v5.2" opacity="0.55" />
  {:else if name === 'shell'}
    <!-- A plate in space: a quadrilateral seen at an angle, with its nodes. -->
    <path d="M3.5 9.5L11 5.5l9.5 4.5-8 5z" />
    <circle cx="3.5" cy="9.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="11" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="20.5" cy="10" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="15" r="1.1" fill="currentColor" stroke="none" />
  {:else if name === 'fit'}
    <!--
      Zoom to fit: a frame closing IN on the drawing. Four corner brackets and
      arrows pointing inward — the shape every viewer uses for it, and legible
      at 18 px where the ⊞ glyph it replaces read as a generic grid.
    -->
    <path d="M3 8V4.6a1.6 1.6 0 0 1 1.6-1.6H8" />
    <path d="M16 3h3.4A1.6 1.6 0 0 1 21 4.6V8" />
    <path d="M21 16v3.4a1.6 1.6 0 0 1-1.6 1.6H16" />
    <path d="M8 21H4.6A1.6 1.6 0 0 1 3 19.4V16" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="0.6" opacity="0.5" />

  {:else if name === 'stress'}
    <!--
      A member with the stress varying along it: the bar, and four bands of
      increasing weight reading left to right. Not a colour ramp — these icons
      are one stroke in `currentColor` so they tint with the button state — so
      the gradient is carried by SPACING, which reads at 22 px where a colour
      would not survive being greyed out.
    -->
    <rect x="3" y="9" width="18" height="6" rx="0.6" />
    <path d="M7 9v6" opacity="0.35" />
    <path d="M11 9v6" opacity="0.6" />
    <path d="M14.5 9v6" opacity="0.8" />
    <path d="M17.5 9v6" />

  {:else if name === 'examples'}
    <path d="M4 6.5h16M4 12h16M4 17.5h10" />
  {:else if name === 'project'}
    <path d="M5 3.5h9l5 5v12H5z" />
    <path d="M14 3.5v5h5" />
  {/if}
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
