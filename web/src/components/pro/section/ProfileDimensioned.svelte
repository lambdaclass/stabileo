<script lang="ts">
  /**
   * A catalogue profile drawn from its canonical outline, with its dimensions: depth and width
   * always, web and flange thickness where the shape has them, the wall thickness otherwise,
   * and the root radius written beside the drawing. The numbers are the table's, the outline
   * the one every analysis uses.
   */
  import { t } from '../../../lib/i18n';
  import { catalogueOutline } from '../../../lib/section/canonical';
  import { findProfile } from '../../../lib/engine/generators/profile-resolve';
  import { familyToShape } from '../../../lib/data/steel-profiles';

  const { name }: { name: string } = $props();

  const W = 240, H = 220, PAD = 34;
  const profile = $derived(findProfile(name));
  const outline = $derived(catalogueOutline(name));
  const box = $derived.by(() => {
    let y0 = Infinity, z0 = Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const poly of outline ?? []) for (const ring of poly) for (const [y, z] of ring) {
      y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    return [y0, z0, y1, z1] as const;
  });
  const k = $derived(Math.min((W - 2 * PAD) / (box[2] - box[0] || 1), (H - 2 * PAD) / (box[3] - box[1] || 1)));
  const px = (y: number) => W / 2 + (y - (box[0] + box[2]) / 2) * k;
  const pz = (z: number) => H / 2 - (z - (box[1] + box[3]) / 2) * k;
  const d = $derived((outline ?? []).flatMap((poly) => poly.map((ring) =>
    ring.map(([y, z], i) => `${i ? 'L' : 'M'}${px(y).toFixed(1)} ${pz(z).toFixed(1)}`).join(' ') + ' Z')).join(' '));
  const shape = $derived(profile ? familyToShape(profile.family) : null);
  /** An I or H: its web is centred, so tw and tf can be drawn where they are. */
  const doublySymmetricI = $derived(shape === 'I' || shape === 'H');
  const mm = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });
</script>

{#if profile && outline}
  <figure class="dimensioned" data-testid="profile-dimensioned">
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={name}>
      <path d={d} fill-rule="evenodd" class="outline" />
      <g class="dim">
        <!-- depth, on the left -->
        <line x1={px(box[0]) - 14} y1={pz(box[1])} x2={px(box[0]) - 14} y2={pz(box[3])} />
        <line x1={px(box[0]) - 18} y1={pz(box[1])} x2={px(box[0]) - 4} y2={pz(box[1])} />
        <line x1={px(box[0]) - 18} y1={pz(box[3])} x2={px(box[0]) - 4} y2={pz(box[3])} />
        <text x={px(box[0]) - 17} y={(pz(box[1]) + pz(box[3])) / 2} text-anchor="end" dominant-baseline="middle" data-testid="dim-h">{mm(profile.h)}</text>
        <!-- width, underneath -->
        <line x1={px(box[0])} y1={pz(box[1]) + 14} x2={px(box[2])} y2={pz(box[1]) + 14} />
        <line x1={px(box[0])} y1={pz(box[1]) + 4} x2={px(box[0])} y2={pz(box[1]) + 18} />
        <line x1={px(box[2])} y1={pz(box[1]) + 4} x2={px(box[2])} y2={pz(box[1]) + 18} />
        <text x={(px(box[0]) + px(box[2])) / 2} y={pz(box[1]) + 26} text-anchor="middle" data-testid="dim-b">{mm(profile.b)}</text>
        {#if doublySymmetricI && profile.tw && profile.tf}
          {@const cy = (box[0] + box[2]) / 2}
          {@const tw = profile.tw / 1000}
          {@const tf = profile.tf / 1000}
          {@const zw = box[1] + 0.3 * (box[3] - box[1])}
          <!-- web thickness low on the web, clear of the centroid; flange thickness at the top right tip -->
          <line x1={px(cy - tw / 2) - 10} y1={pz(zw)} x2={px(cy + tw / 2) + 10} y2={pz(zw)} />
          <text x={px(cy + tw / 2) + 12} y={pz(zw)} dominant-baseline="middle" data-testid="dim-tw">tw {mm(profile.tw)}</text>
          <line x1={px(box[2]) + 8} y1={pz(box[3])} x2={px(box[2]) + 8} y2={pz(box[3] - tf)} />
          <text x={px(box[2]) + 11} y={pz(box[3] - tf / 2)} dominant-baseline="middle" data-testid="dim-tf">tf {mm(profile.tf)}</text>
        {/if}
      </g>
    </svg>
    <figcaption>
      {#if !doublySymmetricI && profile.tw != null}tw {mm(profile.tw)} · {/if}
      {#if !doublySymmetricI && profile.tf != null}tf {mm(profile.tf)} · {/if}
      {#if profile.t != null}t {mm(profile.t)} · {/if}
      {#if profile.r != null && profile.r > 0}r {mm(profile.r)} · {/if}
      <span class="u">{t('profileTable.mm')}</span>
    </figcaption>
  </figure>
{/if}

<style>
  .dimensioned { margin: 0; }
  svg { width: 100%; height: auto; display: block; background: var(--st-bg); border: 1px solid var(--st-hair); border-radius: 4px; }
  .outline { fill: var(--st-value); fill-opacity: 0.14; stroke: var(--st-value); stroke-width: 1.2; }
  .dim line { stroke: var(--st-text-3); stroke-width: 0.8; }
  .dim text { fill: var(--st-text-2); font-size: 9.5px; font-family: var(--st-mono, monospace); }
  figcaption { font-size: 0.66rem; color: var(--st-text-2); font-family: var(--st-mono, monospace); padding-top: 3px; }
  .u { color: var(--st-text-3); font-family: var(--st-sans, sans-serif); }
</style>
