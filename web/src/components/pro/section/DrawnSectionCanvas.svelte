<script lang="ts">
  /**
   * The drawing of a drawn section: every part in its material's colour, holes dashed, the
   * centroid, the shear centre, the principal axes and the overall dimensions, with the selected
   * part's own dimensions beside it. A part is moved by dragging, and snaps edge to edge.
   *
   * While a drag is running the parent is told, so it can skip the torsion solve until the part
   * is dropped: one mesh per pointer move would make the drag stutter on a large profile.
   */
  import type { DrawnSection, DrawnPart, Pt } from '../../../lib/section/drawn';
  import { snapOffset, bboxOf, partOutline, type ProfileOutline } from '../../../lib/section/drawn';
  import type { DrawnProperties } from '../../../lib/section/drawn-properties';
  import { categoryCss } from '../../../lib/viewport/element-colour';

  interface Props {
    drawn: DrawnSection;
    sp: DrawnProperties | null;
    selected: number | null;
    profile: ProfileOutline;
    /** Material ids in the order their colours are assigned. */
    materialOrder: Array<number | null>;
    onSelect: (id: number | null) => void;
    onMove: (id: number, at: Pt) => void;
    onDrag: (dragging: boolean) => void;
  }
  const { drawn, sp, selected, profile, materialOrder, onSelect, onMove, onDrag }: Props = $props();

  const W = 420, H = 300;
  const outlines = $derived(drawn.parts.map((p) => ({ part: p, polys: partOutline(p, profile) })));
  const box = $derived.by(() => {
    const all = outlines.flatMap((o) => o.polys ?? []);
    if (all.length === 0) return [-0.1, -0.1, 0.1, 0.1] as [number, number, number, number];
    return bboxOf(all);
  });
  /** Metres to pixels, the drawing fitted with room for the dimension lines. */
  const view = $derived.by(() => {
    const [y0, z0, y1, z1] = box;
    const w = Math.max(y1 - y0, 1e-3), h = Math.max(z1 - z0, 1e-3);
    const k = Math.min((W - 90) / w, (H - 80) / h);
    const cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    return { k, px: (y: number) => W / 2 + 15 + (y - cy) * k, pz: (z: number) => H / 2 - 10 - (z - cz) * k };
  });

  const path = (polys: Array<Array<Array<[number, number]>>>) =>
    polys.flatMap((poly) => poly.map((ring) =>
      ring.map(([y, z], i) => `${i ? 'L' : 'M'}${view.px(y).toFixed(1)} ${view.pz(z).toFixed(1)}`).join(' ') + ' Z')).join(' ');

  const colourOf = (p: DrawnPart) => categoryCss(materialOrder.indexOf(p.materialId ?? null) + 1);
  const mm = (m: number) => (m * 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });

  const selBox = $derived.by(() => {
    const o = outlines.find((x) => x.part.id === selected);
    return o?.polys ? bboxOf(o.polys) : null;
  });

  // ── Dragging ──
  let svgEl: SVGSVGElement | undefined = $state();
  let drag: { id: number; start: Pt; at0: Pt } | null = null;
  const toModel = (e: PointerEvent): Pt | null => {
    if (!svgEl) return null;
    const r = svgEl.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W, sz = ((e.clientY - r.top) / r.height) * H;
    return [sx / view.k, -sz / view.k];
  };
  function down(e: PointerEvent, part: DrawnPart) {
    e.stopPropagation();
    onSelect(part.id);
    const p = toModel(e);
    if (!p) return;
    drag = { id: part.id, start: p, at0: part.at };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    onDrag(true);
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const p = toModel(e);
    const part = drawn.parts.find((x) => x.id === drag!.id);
    if (!p || !part) return;
    const at: Pt = [drag.at0[0] + (p[0] - drag.start[0]), drag.at0[1] + (p[1] - drag.start[1])];
    // Six pixels of pull, whatever the zoom.
    const snapped = snapOffset(part, at, drawn.parts.filter((x) => x.id !== part.id && !x.void), 6 / view.k, profile);
    onMove(part.id, snapped);
  }
  function up() {
    if (!drag) return;
    drag = null;
    onDrag(false);
  }

  const axes = $derived.by(() => {
    if (!sp) return null;
    const L = Math.hypot(box[2] - box[0], box[3] - box[1]) * 0.55;
    const line = (th: number) => ({
      x1: view.px(sp.yc - L * Math.cos(th)), y1: view.pz(sp.zc - L * Math.sin(th)),
      x2: view.px(sp.yc + L * Math.cos(th)), y2: view.pz(sp.zc + L * Math.sin(th)),
    });
    return { one: line(sp.thetaP), two: line(sp.thetaP + Math.PI / 2) };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  bind:this={svgEl}
  viewBox="0 0 {W} {H}" class="canvas" data-testid="drawn-canvas"
  onpointermove={move} onpointerup={up} onpointerleave={up}
  onpointerdown={() => onSelect(null)}
  role="img" aria-label="section drawing"
>
  {#each outlines as o (o.part.id)}
    {#if o.polys}
      <path
        d={path(o.polys)}
        fill-rule="evenodd"
        fill={o.part.void ? 'none' : colourOf(o.part)}
        fill-opacity={o.part.void ? 0 : 0.35}
        stroke={o.part.id === selected ? 'var(--st-selected)' : o.part.void ? 'var(--st-text-2)' : colourOf(o.part)}
        stroke-width={o.part.id === selected ? 2 : 1.2}
        stroke-dasharray={o.part.void ? '4 3' : undefined}
        class="part"
        data-testid="drawn-part-shape"
        onpointerdown={(e) => down(e, o.part)}
      />
    {/if}
  {/each}

  {#if axes}
    <line {...axes.one} class="axis" />
    <line {...axes.two} class="axis" />
    <text x={axes.one.x2 + 3} y={axes.one.y2} class="lbl">1</text>
    <text x={axes.two.x2 + 3} y={axes.two.y2} class="lbl">2</text>
  {/if}
  {#if sp}
    {@const gx = view.px(sp.yc)}
    {@const gz = view.pz(sp.zc)}
    <g data-testid="drawn-centroid">
      <line x1={gx - 6} y1={gz} x2={gx + 6} y2={gz} class="mark" />
      <line x1={gx} y1={gz - 6} x2={gx} y2={gz + 6} class="mark" />
      <text x={gx + 5} y={gz - 5} class="lbl">G</text>
    </g>
    {#if sp.shearCentre}
      <g data-testid="drawn-shear-centre">
        <circle cx={view.px(sp.shearCentre[0])} cy={view.pz(sp.shearCentre[1])} r="4" class="mark" fill="none" />
        <text x={view.px(sp.shearCentre[0]) + 5} y={view.pz(sp.shearCentre[1]) + 12} class="lbl">S</text>
      </g>
    {/if}
  {/if}

  <!-- Overall dimensions, under and left of the drawing. -->
  {#if outlines.some((o) => o.polys)}
    {@const yb = view.pz(box[1]) + 18}
    {@const xl = view.px(box[0]) - 18}
    <g class="dim" data-testid="drawn-dims">
      <line x1={view.px(box[0])} y1={yb} x2={view.px(box[2])} y2={yb} />
      <line x1={view.px(box[0])} y1={yb - 4} x2={view.px(box[0])} y2={yb + 4} />
      <line x1={view.px(box[2])} y1={yb - 4} x2={view.px(box[2])} y2={yb + 4} />
      <text x={(view.px(box[0]) + view.px(box[2])) / 2} y={yb + 12} text-anchor="middle">{mm(box[2] - box[0])}</text>
      <line x1={xl} y1={view.pz(box[1])} x2={xl} y2={view.pz(box[3])} />
      <line x1={xl - 4} y1={view.pz(box[1])} x2={xl + 4} y2={view.pz(box[1])} />
      <line x1={xl - 4} y1={view.pz(box[3])} x2={xl + 4} y2={view.pz(box[3])} />
      <text x={xl - 4} y={(view.pz(box[1]) + view.pz(box[3])) / 2} text-anchor="end" dominant-baseline="middle">{mm(box[3] - box[1])}</text>
    </g>
  {/if}
  {#if selBox}
    {@const yt = view.pz(selBox[3]) - 6}
    {@const xr = view.px(selBox[2]) + 6}
    <g class="dim sel">
      <line x1={view.px(selBox[0])} y1={yt} x2={view.px(selBox[2])} y2={yt} />
      <text x={(view.px(selBox[0]) + view.px(selBox[2])) / 2} y={yt - 3} text-anchor="middle">{mm(selBox[2] - selBox[0])}</text>
      <line x1={xr} y1={view.pz(selBox[1])} x2={xr} y2={view.pz(selBox[3])} />
      <text x={xr + 3} y={(view.pz(selBox[1]) + view.pz(selBox[3])) / 2} dominant-baseline="middle">{mm(selBox[3] - selBox[1])}</text>
    </g>
  {/if}
</svg>

<style>
  .canvas {
    width: 100%; height: auto; display: block;
    background: var(--st-bg); border: 1px solid var(--st-hair); border-radius: 4px;
    touch-action: none; user-select: none;
  }
  .part { cursor: grab; }
  .axis { stroke: var(--st-value); stroke-width: 0.8; stroke-dasharray: 6 3; opacity: 0.8; }
  .mark { stroke: var(--st-value); stroke-width: 1.4; }
  .lbl { fill: var(--st-value); font-size: 10px; font-family: var(--st-mono, monospace); }
  .dim line { stroke: var(--st-text-3); stroke-width: 0.8; }
  .dim text { fill: var(--st-text-2); font-size: 9.5px; font-family: var(--st-mono, monospace); }
  .dim.sel line { stroke: var(--st-selected); }
  .dim.sel text { fill: var(--st-selected); }
</style>
