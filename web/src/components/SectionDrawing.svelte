<script lang="ts">
  /**
   * The section, drawn — outline, bars, compression block, neutral axis.
   *
   * ── Why a drawing and not a table of numbers ───────────────────────
   *
   * Because the mistakes this catches are not arithmetic. A flange entered
   * narrower than the web, a cover deeper than half the section, a neutral
   * axis below the bars: each of those produces a number, and none of them
   * looks wrong in a column of figures. All three are obvious in a picture,
   * before the reader has read anything.
   *
   * The spreadsheet this replaces draws its section too, in a cell it calls
   * "Esquema", and for the same reason.
   *
   * ── What is drawn, and what it means ───────────────────────────────
   *
   * The hatched band at the top is the equivalent rectangular block of depth
   * `a` — the concrete the calculation is actually leaning on. The dashed
   * line below it is the neutral axis at `c`. Everything under that line is
   * cracked and carries nothing, which is a thing engineers know and students
   * are being taught, so it is worth showing rather than implying.
   *
   * Bars are drawn where the calculation puts them, not where they would be
   * detailed: one layer at `d` for a beam, a ring for a round column. A
   * drawing that showed a nicer arrangement than the one being computed would
   * be lying about the model.
   *
   * ── Scaling ────────────────────────────────────────────────────────
   *
   * To fit, isotropically, with the section centred. Never to a fixed scale:
   * a 20×50 beam and a 1.37 m flange have to be legible in the same 150 px
   * box, and a shared scale would make one of them a line.
   */
  import { t } from '../lib/i18n';
  import type { SectionShape } from '../lib/engine/codes/argentina/section-shape';

  interface Props {
    shape: SectionShape;
    /** Cover to the bar centre, m. */
    cover: number;
    /** Depth of the compression block, m. Omitted, nothing is hatched. */
    a?: number;
    /** Neutral axis depth, m. */
    c?: number;
    /** How many bars to draw. A beam gets them in one bottom layer. */
    barCount?: number;
    /** Total steel, cm² — sets the drawn bar diameter so it reads to scale. */
    AsCm2?: number;
  }

  let { shape, cover, a, c, barCount = 4, AsCm2 = 0 }: Props = $props();

  const PAD = 14;
  const BOX = 170;

  /** Outline in section coordinates: x across, y down from the top fibre. */
  const geom = $derived.by(() => {
    if (shape.kind === 'rect') {
      const { b, h } = shape;
      return { w: b, h, path: `M0,0 H${b} V${h} H0 Z` };
    }
    if (shape.kind === 'tee') {
      const { bf, hf, bw, h } = shape;
      const x0 = (bf - bw) / 2;
      return {
        w: bf, h,
        path: `M0,0 H${bf} V${hf} H${x0 + bw} V${h} H${x0} V${hf} H0 Z`,
      };
    }
    const { D } = shape;
    return { w: D, h: D, path: '' };
  });

  /** One scale for both axes, so nothing is distorted. */
  const s = $derived(Math.min((BOX - 2 * PAD) / geom.w, (BOX - 2 * PAD) / geom.h));
  const ox = $derived((BOX - geom.w * s) / 2);
  const oy = $derived((BOX - geom.h * s) / 2);
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;

  /**
   * Bar positions, in section coordinates.
   *
   * A round column's bars go on a ring, evenly, starting at the top — the same
   * arrangement `barRing` computes in the engine, so the picture and the
   * numbers describe one section. A beam's go in a single bottom layer, which
   * is what the flexural engine assumes when it puts all the steel at `d`.
   */
  const bars = $derived.by(() => {
    const out: Array<{ x: number; y: number }> = [];
    if (shape.kind === 'circle') {
      const R = shape.D / 2;
      const Rs = R - cover;
      for (let i = 0; i < barCount; i++) {
        const ang = (2 * Math.PI * i) / barCount;
        out.push({ x: R + Rs * Math.sin(ang), y: R - Rs * Math.cos(ang) });
      }
      return out;
    }
    const width = shape.kind === 'tee' ? shape.bw : shape.b;
    const x0 = shape.kind === 'tee' ? (shape.bf - shape.bw) / 2 : 0;
    const y = geom.h - cover;
    const n = Math.max(2, Math.min(barCount, 8));
    /* Inset by the cover so the outermost bars sit inside the section. */
    const usable = Math.max(width - 2 * cover, width * 0.2);
    for (let i = 0; i < n; i++) {
      out.push({ x: x0 + cover + (n === 1 ? usable / 2 : (usable * i) / (n - 1)), y });
    }
    return out;
  });

  /** Drawn radius from the real area, floored so a small bar stays visible. */
  const barR = $derived.by(() => {
    const n = Math.max(bars.length, 1);
    const areaPerBar = (AsCm2 * 1e-4) / n; // m²
    const r = Math.sqrt(Math.max(areaPerBar, 0) / Math.PI) * s;
    return Math.max(2, Math.min(r, 7));
  });

  /** The compression block, clipped to the outline. */
  const blockPath = $derived.by(() => {
    if (!a || a <= 0) return '';
    if (shape.kind === 'circle') {
      const R = shape.D / 2;
      const depth = Math.min(a, shape.D);
      /* A chord at `depth`: the arc from one end to the other, then closed. */
      const half = Math.sqrt(Math.max(R * R - (R - depth) ** 2, 0));
      const x1 = R - half, x2 = R + half;
      const large = depth > R ? 1 : 0;
      return `M${X(x1)},${Y(depth)} A${R * s},${R * s} 0 ${large} 1 ${X(x2)},${Y(depth)} Z`;
    }
    if (shape.kind === 'tee') {
      const { bf, hf, bw } = shape;
      const x0 = (bf - bw) / 2;
      if (a <= hf) return `M${X(0)},${Y(0)} H${X(bf)} V${Y(a)} H${X(0)} Z`;
      return `M${X(0)},${Y(0)} H${X(bf)} V${Y(hf)} H${X(x0 + bw)} V${Y(a)} H${X(x0)} V${Y(hf)} H${X(0)} Z`;
    }
    return `M${X(0)},${Y(0)} H${X(shape.b)} V${Y(Math.min(a, shape.h))} H${X(0)} Z`;
  });

  const naY = $derived(c && c > 0 ? Y(Math.min(c, geom.h)) : null);
</script>

<figure class="sd" data-testid="section-drawing">
  <svg viewBox="0 0 {BOX} {BOX}" role="img" aria-label={t('flex.draw.alt')}>
    <defs>
      <pattern id="sd-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="6" class="sd-hatch-line" />
      </pattern>
    </defs>

    {#if shape.kind === 'circle'}
      <circle cx={X(shape.D / 2)} cy={Y(shape.D / 2)} r={(shape.D / 2) * s} class="sd-outline" />
      {#if blockPath}<circle cx={X(shape.D / 2)} cy={Y(shape.D / 2)} r={(shape.D / 2) * s} class="sd-block-clip" clip-path="url(#sd-clip)" />{/if}
      <clipPath id="sd-clip"><circle cx={X(shape.D / 2)} cy={Y(shape.D / 2)} r={(shape.D / 2) * s} /></clipPath>
      {#if blockPath}<path d={blockPath} class="sd-block" clip-path="url(#sd-clip)" />{/if}
    {:else}
      {#if blockPath}<path d={blockPath} class="sd-block" />{/if}
      <path
        d={geom.path.replace(/([MHV])(-?[\d.]+)(,(-?[\d.]+))?/g, (_m, cmd, p1, _c, p2) =>
          cmd === 'M' ? `M${X(Number(p1))},${Y(Number(p2))}`
          : cmd === 'H' ? `H${X(Number(p1))}`
          : `V${Y(Number(p1))}`)}
        class="sd-outline"
      />
    {/if}

    {#if naY !== null}
      <line x1={PAD / 2} y1={naY} x2={BOX - PAD / 2} y2={naY} class="sd-na" />
      <text x={BOX - PAD / 2} y={naY - 3} class="sd-na-label" text-anchor="end">c</text>
    {/if}

    {#each bars as bar}
      <circle cx={X(bar.x)} cy={Y(bar.y)} r={barR} class="sd-bar" />
    {/each}
  </svg>
</figure>

<style>
  .sd {
    margin: 0;
    display: flex;
    justify-content: center;
  }
  .sd svg {
    width: 100%;
    max-width: 170px;
    height: auto;
  }

  .sd-outline {
    fill: none;
    stroke: var(--st-text-2);
    stroke-width: 1.4;
    stroke-linejoin: round;
  }

  /* The concrete the calculation leans on, hatched the way a section is. */
  .sd-block {
    fill: url(#sd-hatch);
    stroke: none;
  }
  .sd-hatch-line {
    stroke: var(--st-accent);
    stroke-width: 1.1;
    opacity: 0.55;
  }
  .sd-block-clip { fill: none; }

  /* Dashed, because it is a boundary rather than a thing. */
  .sd-na {
    stroke: var(--st-info);
    stroke-width: 1;
    stroke-dasharray: 4 3;
    opacity: 0.9;
  }
  .sd-na-label {
    fill: var(--st-info);
    font-size: 8px;
    font-family: var(--st-mono);
  }

  .sd-bar {
    fill: var(--st-text);
    stroke: var(--st-surface);
    stroke-width: 0.6;
  }
</style>
