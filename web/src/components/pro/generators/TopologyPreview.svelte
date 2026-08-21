<script lang="ts">
  /**
   * The generated geometry, drawn.
   *
   * SVG straight from the projected topology — no Three.js, no canvas, no scene to keep in
   * step with the model. The picture is a function of the same object the counts come from
   * and that Generate emits, so all three agree by construction rather than by care.
   *
   * Colours come from `ROLE_COLOUR`, which the legend also reads, so the drawing and the
   * legend cannot disagree about what orange means.
   */
  import { t } from '../../../lib/i18n';
  import {
    projectTopology, roleWidth, ROLE_COLOUR, type PreviewView,
  } from '../../../lib/engine/generators/preview-projection';
  import type { Topology } from '../../../lib/engine/generators/truss-topology';
  import { rolesPresent } from '../../../lib/engine/generators/member-roles';

  interface Props {
    topology: Topology;
    view: PreviewView;
    /** Footprint outline, isometric only. */
    footprint?: { spanM: number; lengthM: number };
    /** Accessible summary. Required: an SVG with no name is invisible to a screen reader. */
    label: string;
    heightPx?: number;
    showLegend?: boolean;
  }
  const { topology, view, footprint, label, heightPx = 150, showLegend = false }: Props = $props();

  const p = $derived(projectTopology(topology, { view, footprint }));
  const vb = $derived(`${p.viewBox.x} ${p.viewBox.y} ${p.viewBox.w} ${p.viewBox.h}`);
  const nodeR = $derived(Math.max(p.viewBox.w, p.viewBox.h) / 260);
  const supR = $derived(Math.max(p.viewBox.w, p.viewBox.h) / 90);
  const roles = $derived(rolesPresent(topology.counts));

  /** Bearing symbol: a triangle under the node, as a drawing would show it. */
  function tri(x: number, y: number, r: number): string {
    return `${x},${y} ${x - r},${y + r * 1.5} ${x + r},${y + r * 1.5}`;
  }
</script>

<figure class="wrap" style={`height:${heightPx}px`}>
  <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
    {#if p.footprint.length === 4}
      <polygon
        class="footprint"
        points={p.footprint.map((q) => `${q.x},${q.y}`).join(' ')}
      />
    {/if}

    {#each p.segments as s, i (i)}
      <line
        x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
        stroke={ROLE_COLOUR[s.role]}
        stroke-width={roleWidth(s.role, p.viewBox)}
        stroke-linecap="round"
      />
    {/each}

    {#each p.nodes as n, i (i)}
      <circle cx={n.x} cy={n.y} r={nodeR} class="node" />
    {/each}

    {#each p.supports as s, i (i)}
      <polygon points={tri(s.x, s.y, supR)} class="support" class:fixed={s.type === 'fixed'} />
    {/each}
  </svg>

  {#if showLegend}
    <figcaption class="legend">
      {#each roles as role (role)}
        <span class="item">
          <span class="swatch" style={`background:${ROLE_COLOUR[role]}`} aria-hidden="true"></span>
          {t(`generator.role.${role}`)}
          <span class="n">{topology.counts[role]}</span>
        </span>
      {/each}
    </figcaption>
  {/if}
</figure>

<style>
  .wrap {
    margin: 0;
    display: flex; flex-direction: column;
    border: 1px solid #17324f; border-radius: 4px;
    background: #071322;
    overflow: hidden;
  }
  svg { flex: 1 1 auto; width: 100%; min-height: 0; display: block; padding: 4px; box-sizing: border-box; }
  .footprint { fill: rgba(120, 160, 200, 0.07); stroke: rgba(120, 160, 200, 0.28); stroke-width: 0.02; }
  .node { fill: #dde7f2; }
  .support { fill: #8fa0b4; }
  /* A fixed base is filled solid and hatched by a darker stroke — distinguishable from a
     pinned bearing without relying on colour alone. */
  .support.fixed { fill: #cdd8e4; stroke: #46586c; stroke-width: 0.02; }
  .legend {
    display: flex; flex-wrap: wrap; gap: 8px;
    padding: 3px 6px; border-top: 1px solid #17324f;
    font-size: 0.64rem; color: #9ab;
  }
  .item { display: inline-flex; align-items: center; gap: 3px; }
  .swatch { width: 9px; height: 3px; border-radius: 1px; }
  .n { color: #cde; font-variant-numeric: tabular-nums; }
</style>
