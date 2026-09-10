<script lang="ts">
  /**
   * A committed screenshot, served as AVIF with a WebP fallback at two widths.
   * `base` is the file stem under /screenshots (no extension, no width).
   *
   * ── Why the intrinsic size is declared ──
   *
   * Without `width`/`height` an <img> occupies no height until it decodes, so
   * every screenshot that arrived pushed the rest of the page down. Two things
   * came from that, one visible and one measured: the page jumped around while
   * loading, and clicking a nav item landed short — the scroll's target was
   * computed before the images above it took their space. "Estado" was 2,418 px
   * out.
   *
   * The attributes reserve the box from the first paint. The CSS still sizes
   * the image; the browser only needs the RATIO, which is why one pair of
   * numbers per file is enough even though it renders at any width.
   */
  type Props = {
    base: string;
    alt: string;
    /** Intrinsic pixels of the committed file, for the aspect ratio. */
    w: number;
    h: number;
    sizes?: string;
    class?: string;
    eager?: boolean;
  };
  let { base, alt, w, h, sizes = '(max-width: 760px) 92vw, 45vw', class: cls = '', eager = false }: Props = $props();
</script>

<picture class={cls}>
  <source
    type="image/avif"
    srcset="/screenshots/{base}-800.avif 800w, /screenshots/{base}-1600.avif 1600w"
    {sizes}
  />
  <source
    type="image/webp"
    srcset="/screenshots/{base}-800.webp 800w, /screenshots/{base}-1600.webp 1600w"
    {sizes}
  />
  <img
    src="/screenshots/{base}-1600.webp"
    {alt}
    width={w}
    height={h}
    loading={eager ? 'eager' : 'lazy'}
    decoding="async"
  />
</picture>
