<script lang="ts">
  import { onMount } from 'svelte';
  import { tPublic as t, i18n } from '../../../lib/i18n/store.svelte';
  import { NODES, PIECES, AXIAL, MOMENT, COMBINATION } from './building-data';
  import { HeroLoop, clamp01, smooth } from './loop.svelte';

  type Props = { prefersReducedMotion?: boolean; paused?: boolean };
  let { prefersReducedMotion = false, paused = false }: Props = $props();

  const PERIOD = 18;
  const BUILD = 7.2;
  const AXIAL_AT = 8;
  const MOMENT_AT = 12.4;
  const BLEND = 0.6;
  const FADE = 1.1;
  const PIECE = 0.35;
  const loop = new HeroLoop(PERIOD, prefersReducedMotion, (MOMENT_AT + 2) / PERIOD);
  onMount(() => loop.start());
  $effect(() => { loop.paused = paused; });

  const COLUMN = 0, BEAM = 1, WALL = 2, SLAB = 3;
  const top = (p: number[]) => Math.max(...p.slice(0, p.length - 1).map((i) => NODES[i][2]));
  const LEVELS = [...new Set(PIECES.map(top))].sort((a, b) => a - b);
  const RANK = [COLUMN, WALL, BEAM, SLAB];
  const ORDER = PIECES.map((p, i) => i).sort((a, b) => {
    const pa = PIECES[a], pb = PIECES[b];
    return top(pa) - top(pb) || RANK.indexOf(pa[pa.length - 1]) - RANK.indexOf(pb[pb.length - 1]) || a - b;
  });
  const STEP = (BUILD - PIECE) / ORDER.length;
  const START = new Array<number>(PIECES.length);
  ORDER.forEach((p, k) => { START[p] = k * STEP; });
  const KIND = (p: number[]) => p[p.length - 1];
  const N_MAX = Math.max(...AXIAL.map(Math.abs));
  const M_MAX = Math.max(...MOMENT.map((m) => (m ? Math.max(...m.map(Math.abs)) : 0)));
  const M_SCALE = 1.3 / M_MAX;
  const BASE_RGB = [185, 194, 202], AXIAL_RGB = [79, 143, 214], ACCENT_RGB = [229, 72, 42];
  const SLAB_RGB = [154, 165, 175], WALL_RGB = [125, 136, 147];
  const COOL = 0.9;
  const mix = (from: number[], to: number[], k: number) => {
    const c = from.map((v, j) => Math.round(v + (to[j] - v) * k));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  function axialStroke(i: number, amount: number): string {
    return mix(BASE_RGB, AXIAL_RGB, amount * Math.min(1, Math.abs(AXIAL[i]) / N_MAX) ** 0.7);
  }

  const CENTER = [9, 5, 10.75];
  const SCALE = 11.4;
  const ORIGIN = { x: 280, y: 138 };

  const time = $derived(loop.seconds);
  const az = $derived(((-38 + 16 * Math.sin((2 * Math.PI * time) / PERIOD)) * Math.PI) / 180);
  const EL = (24 * Math.PI) / 180;
  const view = $derived({
    r: [-Math.sin(az), Math.cos(az), 0],
    u: [-Math.sin(EL) * Math.cos(az), -Math.sin(EL) * Math.sin(az), Math.cos(EL)],
    c: [Math.cos(EL) * Math.cos(az), Math.cos(EL) * Math.sin(az), Math.sin(EL)],
  });
  function proj(p: number[]) {
    const d = [p[0] - CENTER[0], p[1] - CENTER[1], p[2] - CENTER[2]];
    const dot = (v: number[]) => d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
    return { x: ORIGIN.x + SCALE * dot(view.r), y: ORIGIN.y - SCALE * dot(view.u), z: dot(view.c) };
  }

  const axialMix = $derived(smooth((time - AXIAL_AT) / BLEND) * (1 - smooth((time - MOMENT_AT) / BLEND)));
  const momentMix = $derived(smooth((time - MOMENT_AT) / BLEND));
  const phase = $derived(time < AXIAL_AT ? 'build' : time < MOMENT_AT ? 'axial' : 'moment');
  const fmt0 = $derived(new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 0 }));
  const diagrams = $derived.by(() => {
    if (momentMix <= 0) return [];
    const grow = momentMix;
    const out: { id: number; d: string }[] = [];
    PIECES.forEach((piece, i) => {
      const m = MOMENT[i];
      if (!m) return;
      const a = NODES[piece[0]], b = NODES[piece[1]];
      const pts = m.map((v, k) => {
        const w = k / (m.length - 1);
        return proj([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w - v * M_SCALE * grow]);
      });
      const pa = proj(a), pb = proj(b);
      out.push({ id: i, d: `M${pa.x.toFixed(1)} ${pa.y.toFixed(1)}` + pts.map((q) => `L${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('') + `L${pb.x.toFixed(1)} ${pb.y.toFixed(1)}Z` });
    });
    return out;
  });

  type Drawn = { id: number; kind: number; depth: number; d: string; p: number; stroke: string; fill?: string; width?: number };
  const drawn = $derived.by(() => {
    const pts = NODES.map(proj);
    const out: Drawn[] = [];
    PIECES.forEach((piece, i) => {
      const p = clamp01((time - START[i]) / PIECE);
      if (p <= 0) return;
      const kind = KIND(piece);
      const glow = 1 - smooth((time - START[i] - PIECE * 0.6) / COOL);
      if (kind === COLUMN || kind === BEAM) {
        const a = pts[piece[0]], b0 = pts[piece[1]];
        const e = smooth(p);
        const b = { x: a.x + (b0.x - a.x) * e, y: a.y + (b0.y - a.y) * e };
        const k = Math.min(1, Math.abs(AXIAL[i]) / N_MAX);
        out.push({
          id: i, kind, depth: (a.z + b0.z) / 2, d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`, p,
          stroke: axialMix > 0 ? axialStroke(i, axialMix) : mix(BASE_RGB, ACCENT_RGB, glow),
          width: (kind === COLUMN ? 1.6 : 1.1) + 10.4 * k * axialMix,
        });
      } else {
        const q = piece.slice(0, 4).map((k) => pts[k]);
        out.push({
          id: i, kind, depth: q.reduce((s, v) => s + v.z, 0) / 4, d: `M${q.map((v) => `${v.x.toFixed(1)} ${v.y.toFixed(1)}`).join('L')}Z`, p,
          stroke: mix(BASE_RGB, ACCENT_RGB, glow),
          fill: mix(kind === WALL ? WALL_RGB : SLAB_RGB, ACCENT_RGB, glow),
        });
      }
    });
    return out.sort((a, b) => a.depth - b.depth);
  });

  const footprint = $derived.by(() => {
    const c = [[-1, -1, 0], [19, -1, 0], [19, 11, 0], [-1, 11, 0]].map(proj);
    return `M${c.map((v) => `${v.x.toFixed(1)} ${v.y.toFixed(1)}`).join('L')}Z`;
  });

  const FIRST = LEVELS.map((z) => Math.min(...ORDER.filter((p) => top(PIECES[p]) === z).map((p) => START[p])));
  const level = $derived(Math.max(1, FIRST.filter((s) => s <= time).length));
  const fade = $derived(1 - smooth((time - (PERIOD - FADE)) / FADE));
</script>

<figure class="bld-fig">
  <svg
    viewBox="0 0 560 270"
    role="img"
    aria-labelledby="bld-title bld-desc"
    onmouseenter={() => (loop.hovered = true)}
    onmouseleave={() => (loop.hovered = false)}
  >
    <title id="bld-title">{t('landing.bldTitle')}</title>
    <desc id="bld-desc">{t('landing.bldDesc')}</desc>
    <g aria-hidden="true" style="opacity: {fade}">
      <path class="bld-ground" d={footprint} />
      {#each drawn as piece (piece.id)}
        <path
          d={piece.d}
          class="bld-piece"
          class:bld-col={piece.kind === COLUMN}
          class:bld-beam={piece.kind === BEAM}
          class:bld-wall={piece.kind === WALL}
          class:bld-slab={piece.kind === SLAB}
          style={piece.kind >= WALL
            ? `stroke: ${piece.stroke}; fill: ${piece.fill}; fill-opacity: ${(piece.kind === WALL ? 0.5 : 0.3) * smooth(piece.p) * (1 - 0.65 * Math.max(axialMix, momentMix))}; stroke-opacity: ${smooth(piece.p) * (1 - 0.6 * Math.max(axialMix, momentMix))}`
            : `stroke: ${piece.stroke}; stroke-width: ${piece.width}; stroke-opacity: ${1 - 0.45 * momentMix}`}
        />
      {/each}
      {#each diagrams as dg (dg.id)}
        <path class="bld-moment" d={dg.d} />
      {/each}
    </g>

  </svg>
  <figcaption class="hf-row">
    <span class="hf-tag">{t('landing.bldTag')}</span>
    {#if phase === 'build'}
      <span class="hf-item">{t('landing.bldFloor')} <b>{level} / {LEVELS.length}</b></span>
    {:else if phase === 'axial'}
      <span class="hf-item"><i class="hf-sw" style="background: rgb(79,143,214)"></i>{t('landing.bldAxial')} <b>{t('landing.bldNMax')} {fmt0.format(N_MAX)} kN</b></span>
      <span class="hf-item">{COMBINATION}</span>
    {:else}
      <span class="hf-item"><i class="hf-sw" style="background: var(--lp-accent)"></i>{t('landing.bldMoment')} <b>{t('landing.bldMMax')} {fmt0.format(M_MAX)} kN·m</b></span>
      <span class="hf-item">{COMBINATION}</span>
    {/if}
  </figcaption>
</figure>

<style>
  .bld-fig {
    margin: 0;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }
  .bld-ground {
    fill: var(--fg-2);
    fill-opacity: 0.06;
    stroke: var(--fg-2);
    stroke-opacity: 0.3;
    stroke-dasharray: 3 3;
    stroke-width: 0.8;
  }
  .bld-piece {
    stroke: #b9c2ca;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .bld-col {
    stroke-width: 1.6;
    fill: none;
  }
  .bld-beam {
    stroke-width: 1.1;
    fill: none;
  }
  .bld-slab {
    fill: #9aa5af;
    stroke-width: 0.5;
    stroke-opacity: 0.6;
  }
  .bld-wall {
    fill: #7d8893;
    stroke-width: 0.6;
  }
  .bld-moment {
    fill: var(--lp-accent);
    fill-opacity: 0.28;
    stroke: var(--lp-accent);
    stroke-width: 0.9;
    stroke-linejoin: round;
  }
</style>
