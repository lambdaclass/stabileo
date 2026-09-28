<script lang="ts" module>
  /**
   * A cube in isometric with one face painted: the face a preset view looks at.
   *
   * The cube is projected, not drawn by hand, from the same corner the isometric view uses
   * (+X, −Y, +Z), so the three faces in front — top, front (−Y) and right (+X) — are solid, and the
   * three behind — bottom, back and left — are drawn through the cube, dashed. The isometric
   * icon paints the three visible faces lightly.
   */
  export type CubeFace = 'top' | 'bottom' | 'front' | 'back' | 'right' | 'left' | 'iso';

  type P3 = [number, number, number];
  const u: P3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
  const v: P3 = [-Math.SQRT1_2 / Math.sqrt(3), Math.SQRT1_2 / Math.sqrt(3), (2 * Math.SQRT1_2) / Math.sqrt(3)];
  const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const proj = (p: P3) => {
    const c: P3 = [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5];
    return `${(12 + 11 * dot(c, u)).toFixed(2)},${(12 - 11 * dot(c, v)).toFixed(2)}`;
  };
  const FACES: Record<Exclude<CubeFace, 'iso'>, { corners: P3[]; visible: boolean }> = {
    top:    { corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], visible: true },
    bottom: { corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], visible: false },
    front:  { corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], visible: true },
    back:   { corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], visible: false },
    right:  { corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], visible: true },
    left:   { corners: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], visible: false },
  };
  export const POLY = Object.fromEntries(
    Object.entries(FACES).map(([k, f]) => [k, { points: f.corners.map(proj).join(' '), visible: f.visible }]),
  ) as Record<Exclude<CubeFace, 'iso'>, { points: string; visible: boolean }>;
  const VISIBLE = (['top', 'front', 'right'] as const);
</script>

<script lang="ts">
  let { face, size = 22 }: { face: CubeFace; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="vc">
  {#if face !== 'iso' && !POLY[face].visible}
    <polygon points={POLY[face].points} class="vc-hidden-face" />
  {/if}
  {#each VISIBLE as f (f)}
    <polygon points={POLY[f].points} class="vc-face" class:on={face === f} class:iso={face === 'iso'} />
  {/each}
  {#if face !== 'iso' && !POLY[face].visible}
    <polygon points={POLY[face].points} class="vc-hidden-edge" />
  {/if}
</svg>

<style>
  .vc { display: block; }
  .vc-face { fill: none; stroke: currentColor; stroke-width: 1.1; stroke-linejoin: round; }
  .vc-face.on { fill: var(--st-accent); fill-opacity: 0.85; }
  .vc-face.iso { fill: var(--st-accent); fill-opacity: 0.3; }
  .vc-hidden-face { fill: var(--st-accent); fill-opacity: 0.45; stroke: none; }
  .vc-hidden-edge { fill: none; stroke: var(--st-accent); stroke-width: 1.1; stroke-dasharray: 1.6 1.4; }
</style>
