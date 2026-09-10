<script lang="ts">
  /**
   * The Stabileo mark: the same open triangle the application shows.
   *
   * The public pages used a filled tile with an "S" in it, so the brand a
   * visitor met on the landing was not the one they met a click later inside
   * the editor. This is the geometry of public/favicon.svg — the browser tab,
   * the README and the header now draw the same shape in the same colour.
   *
   * Drawn rather than loaded: it is nine bytes of path and an <img> would be
   * a request, a layout shift and a file that can go missing.
   *
   * `currentColor`, so it takes the accent from the CSS rather than baking a
   * hex in. The mark is expected to change; the colour should follow the
   * tokens when it does.
   */
</script>

<svg
  class="brand-mark"
  viewBox="0 0 32 32"
  width="26"
  height="26"
  aria-hidden="true"
  focusable="false"
>
  <polygon
    points="16,4 29,27 3,27"
    fill="none"
    stroke="currentColor"
    stroke-width="3.4"
    stroke-linejoin="round"
  />
</svg>
