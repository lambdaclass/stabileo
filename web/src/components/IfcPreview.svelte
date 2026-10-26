<!--
  What an IFC file brings in, drawn before it does: every member as a line and every slab and wall
  as its mid-surface, in an isometric view, in the colour of the kind its class was mapped to. A
  class left out stays visible, faint and dashed, so leaving it out is a choice the reader sees.
-->
<script lang="ts">
  import type { IfcMember, IfcSurface } from '../lib/ifc/ifc-mapper';
  import { defaultKindOf, type ClassChoice } from '../lib/ifc/ifc-physical';
  import { t } from '../lib/i18n';

  let { members, surfaces, choices }: { members: IfcMember[]; surfaces: IfcSurface[]; choices: Record<string, ClassChoice> } = $props();

  const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
  const iso = (p: { x: number; y: number; z: number }) => ({ u: (p.x - p.y) * C30, v: -((p.x + p.y) * S30 + p.z) });
  const kindOf = (cls: string | undefined, read: IfcMember['type'] | IfcSurface['type']): ClassChoice =>
    choices[cls ?? ''] ?? defaultKindOf(cls ?? '', read);

  const view = $derived.by(() => {
    const lines = members.map((m) => ({ a: iso(m.start), b: iso(m.end), kind: kindOf(m.ifcClass, m.type) }));
    const polys = surfaces.map((s) => ({ pts: s.outline.map(iso), kind: kindOf(s.ifcClass, s.type) }));
    const all = [...lines.flatMap((l) => [l.a, l.b]), ...polys.flatMap((p) => p.pts)];
    if (!all.length) return null;
    const u0 = Math.min(...all.map((p) => p.u)), u1 = Math.max(...all.map((p) => p.u));
    const v0 = Math.min(...all.map((p) => p.v)), v1 = Math.max(...all.map((p) => p.v));
    const pad = Math.max(u1 - u0, v1 - v0, 1) * 0.05;
    return { lines, polys, box: `${u0 - pad} ${v0 - pad} ${u1 - u0 + 2 * pad} ${v1 - v0 + 2 * pad}`, stroke: Math.max(u1 - u0, v1 - v0, 1) / 300 };
  });
  const counts = $derived(Object.entries([...members.map((m) => kindOf(m.ifcClass, m.type)), ...surfaces.map((s) => kindOf(s.ifcClass, s.type))]
    .reduce<Record<string, number>>((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {})));
</script>

{#if view}
  <figure class="ifc-iso" data-testid="ifc-preview-3d">
    <svg viewBox={view.box} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('ifc.previewTitle')}>
      {#each view.polys as p, i (i)}
        <polygon points={p.pts.map((q) => `${q.u},${q.v}`).join(' ')} class="k-{p.kind}" stroke-width={view.stroke} />
      {/each}
      {#each view.lines as l, i (i)}
        <line x1={l.a.u} y1={l.a.v} x2={l.b.u} y2={l.b.v} class="k-{l.kind}" stroke-width={view.stroke * 2} />
      {/each}
    </svg>
    <figcaption>
      {#each counts as [k, n] (k)}<span class="chip k-{k}">{k === 'ignore' ? t('ifc.leaveOut') : t(`physical.kind.${k}`)} · {n}</span>{/each}
    </figcaption>
  </figure>
{/if}

<style>
  .ifc-iso { margin: 0.4rem 0 0; display: flex; flex-direction: column; gap: 0.3rem; }
  svg { width: 100%; height: 220px; background: var(--st-surface); border: 1px solid var(--st-surface-3); border-radius: 4px; }
  line, polygon { fill: none; stroke: var(--st-text-2); vector-effect: non-scaling-stroke; }
  polygon { fill: color-mix(in srgb, var(--st-text-2) 12%, transparent); }
  .k-column { stroke: var(--st-interactive); }
  .k-beam { stroke: var(--st-value); }
  .k-brace { stroke: var(--st-warn); }
  polygon.k-slab { stroke: var(--st-ok); fill: color-mix(in srgb, var(--st-ok) 18%, transparent); }
  polygon.k-wall { stroke: var(--st-value); fill: color-mix(in srgb, var(--st-value) 18%, transparent); }
  .k-ignore { stroke: var(--st-text-3); stroke-dasharray: 4 3; opacity: 0.5; }
  figcaption { display: flex; flex-wrap: wrap; gap: 0.3rem; font-size: 0.68rem; color: var(--st-text-2); }
  .chip { border-left: 3px solid var(--st-text-3); padding-left: 0.3rem; }
  .chip.k-column { border-color: var(--st-interactive); } .chip.k-beam { border-color: var(--st-value); } .chip.k-brace { border-color: var(--st-warn); }
  .chip.k-slab { border-color: var(--st-ok); } .chip.k-wall { border-color: var(--st-value); }
</style>
