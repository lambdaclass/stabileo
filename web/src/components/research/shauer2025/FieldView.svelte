<script lang="ts">
  /**
   * The mesh coloured by a field of one load step: damage (sequential, 0 to 1) or the degraded
   * opening stress sigma_yy at element centres (diverging about zero). Each element is filled
   * with one value (the mean of its nodes for damage), drawn on the deformed shape when asked.
   */
  import type { Frame } from './simulation.svelte';

  type Field = 'damage' | 'syy';
  type View = 'plate' | 'band' | 'tip';

  let {
    nodes,
    elements,
    frame,
    field = 'damage',
    view = 'plate',
    deform = 0,
    showMesh = false,
    hideBroken = false,
  }: {
    nodes: Float64Array;
    elements: Uint32Array;
    frame: Frame | null;
    field?: Field;
    view?: View;
    deform?: number;
    showMesh?: boolean;
    /** Leave out elements whose four nodes all have d > 0.95 (the open crack). */
    hideBroken?: boolean;
  } = $props();

  const VIEWS: Record<View, [number, number, number, number]> = {
    plate: [-0.52, -0.52, 0.52, 0.52],
    band: [-0.5, -0.12, 0.5, 0.12],
    tip: [-0.03, -0.0225, 0.03, 0.0225],
  };

  let canvas: HTMLCanvasElement | undefined = $state();
  let width = $state(600);
  let hover = $state<{ x: number; y: number; text: string } | null>(null);

  const LOW = [18, 32, 44];
  const MID = [229, 72, 42];
  const HIGH = [255, 214, 199];
  function seq(t: number): string {
    const v = Math.min(1, Math.max(0, t));
    const [a, b, u] = v < 0.5 ? [LOW, MID, v / 0.5] : [MID, HIGH, (v - 0.5) / 0.5];
    return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * u)).join(',')})`;
  }
  const NEG = [57, 135, 229];
  const ZERO = [42, 54, 64];
  const POS = [217, 89, 38];
  function div(t: number): string {
    const v = Math.min(1, Math.max(-1, t));
    const [a, b, u] = v < 0 ? [ZERO, NEG, -v] : [ZERO, POS, v];
    return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * u)).join(',')})`;
  }

  const height = $derived.by(() => {
    const [x0, y0, x1, y1] = VIEWS[view];
    return Math.round((width * (y1 - y0)) / (x1 - x0));
  });

  const stressScale = $derived.by(() => {
    if (!frame) return 1;
    let m = 0;
    for (const v of frame.syy) m = Math.max(m, Math.abs(v));
    return m || 1;
  });

  function pos(n: number): [number, number] {
    const d = frame && deform > 0 ? frame.displacement : null;
    return [nodes[2 * n] + (d ? deform * d[2 * n] : 0), nodes[2 * n + 1] + (d ? deform * d[2 * n + 1] : 0)];
  }

  function elementValue(e: number): number {
    if (!frame) return 0;
    if (field === 'damage') {
      let s = 0;
      for (let a = 0; a < 4; a++) s += frame.damage[elements[4 * e + a]];
      return s / 4;
    }
    return frame.syy[e];
  }

  $effect(() => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const [x0, y0, x1, y1] = VIEWS[view];
    const sx = (width * dpr) / (x1 - x0);
    const tx = (x: number) => (x - x0) * sx;
    const ty = (y: number) => (y1 - y) * sx;
    ctx.fillStyle = '#0f1e2b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ne = elements.length / 4;
    ctx.lineWidth = Math.max(0.5, 0.5 * dpr);
    for (let e = 0; e < ne; e++) {
      if (hideBroken && frame && [0, 1, 2, 3].every((a) => frame.damage[elements[4 * e + a]] > 0.95)) continue;
      ctx.beginPath();
      for (let a = 0; a < 4; a++) {
        const [x, y] = pos(elements[4 * e + a]);
        if (a === 0) ctx.moveTo(tx(x), ty(y));
        else ctx.lineTo(tx(x), ty(y));
      }
      ctx.closePath();
      const v = elementValue(e);
      const c = field === 'damage' ? seq(v) : div(v / stressScale);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.strokeStyle = showMesh ? 'rgba(143,163,179,0.18)' : c;
      ctx.stroke();
    }
  });

  function inside(px: number, py: number, e: number): boolean {
    let sign = 0;
    for (let a = 0; a < 4; a++) {
      const [ax, ay] = pos(elements[4 * e + a]);
      const [bx, by] = pos(elements[4 * e + ((a + 1) % 4)]);
      const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if (c !== 0) {
        if (sign === 0) sign = Math.sign(c);
        else if (Math.sign(c) !== sign) return false;
      }
    }
    return true;
  }

  function onMove(ev: PointerEvent) {
    if (!canvas || !frame) return;
    const r = canvas.getBoundingClientRect();
    const [x0, , x1, y1] = VIEWS[view];
    const s = (x1 - x0) / r.width;
    const px = x0 + (ev.clientX - r.left) * s;
    const py = y1 - (ev.clientY - r.top) * s;
    const ne = elements.length / 4;
    for (let e = 0; e < ne; e++) {
      if (inside(px, py, e)) {
        let d = 0;
        for (let a = 0; a < 4; a++) d += frame.damage[elements[4 * e + a]];
        hover = {
          x: ev.clientX - r.left,
          y: ev.clientY - r.top,
          text: `element ${e} · damage ${(d / 4).toFixed(3)} · σyy ${frame.syy[e].toExponential(2)} kN/mm²`,
        };
        return;
      }
    }
    hover = null;
  }
</script>

<div class="field" bind:clientWidth={width}>
  <canvas
    bind:this={canvas}
    style:width="{width}px"
    style:height="{height}px"
    onpointermove={onMove}
    onpointerleave={() => (hover = null)}
    aria-label={field === 'damage' ? 'Damage field on the mesh' : 'Opening stress field on the mesh'}
    role="img"
  ></canvas>
  {#if hover}
    <div class="tip" style:left="{Math.min(hover.x + 12, width - 260)}px" style:top="{hover.y + 12}px">{hover.text}</div>
  {/if}
  <div class="legend" aria-hidden="true">
    {#if field === 'damage'}
      <span>0</span>
      <span class="bar" style:background="linear-gradient(90deg, {seq(0)}, {seq(0.5)}, {seq(1)})"></span>
      <span>1 damage</span>
    {:else}
      <span>−{stressScale.toExponential(1)}</span>
      <span class="bar" style:background="linear-gradient(90deg, {div(-1)}, {div(0)}, {div(1)})"></span>
      <span>+{stressScale.toExponential(1)} σyy, kN/mm²</span>
    {/if}
  </div>
</div>

<style>
  .field {
    position: relative;
    width: 100%;
  }
  canvas {
    display: block;
    border: 1px solid var(--hair);
    border-radius: 3px;
    touch-action: none;
  }
  .tip {
    position: absolute;
    pointer-events: none;
    background: var(--lp-ink, #0c1620);
    border: 1px solid var(--hair);
    color: var(--fg);
    font: 12px/1.4 var(--lp-mono);
    padding: 0.3rem 0.5rem;
    border-radius: 3px;
    white-space: nowrap;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    font: 12px var(--lp-mono);
    color: var(--fg-2);
  }
  .bar {
    flex: 0 0 10rem;
    height: 0.6rem;
    border-radius: 2px;
  }
</style>
