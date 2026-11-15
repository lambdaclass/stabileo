<script lang="ts">
  /**
   * The concrete frame of one level in plan, each beam coloured by its role against the
   * earthquake: primary resists it, secondary only follows. The role is the project's declaration
   * of the lateral system (`model/lateral-system.ts`): a click declares the other role on that
   * beam, drawn solid; a beam with none is drawn dashed, read as primary, and its title gives the
   * role the geometry suggests, which a person may adopt for the undeclared beams of the level.
   */
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { adoptSuggestedRoles, concreteFrame, seismicRoleReadings, setSeismicRole, suggestedSeismicRoles } from '../../../../lib/store/seismic-design.svelte';

  const data = $derived.by(() => {
    void modelStore.model.elements; void modelStore.designData;
    const r = seismicRoleReadings();
    return { kinds: concreteFrame(), roles: r.roles, declared: r.declared, suggested: suggestedSeismicRoles() };
  });
  const levels = $derived([...new Set([...data.kinds].filter(([, k]) => k === 'beam').map(([id]) => {
    const e = modelStore.model.elements.get(id)!; return +(modelStore.model.nodes.get(e.nodeI)?.z ?? 0).toFixed(3);
  }))].sort((a, b) => a - b));
  let level = $state<number | null>(null);
  $effect(() => { if (level === null || !levels.includes(level)) level = levels.at(-1) ?? null; });
  const z = (n: number) => modelStore.model.nodes.get(n)?.z ?? 0;
  const beams = $derived([...data.kinds].filter(([id, k]) => k === 'beam' && Math.abs(z(modelStore.model.elements.get(id)!.nodeI) - (level ?? 0)) < 1e-3).map(([id]) => modelStore.model.elements.get(id)!));
  const cols = $derived([...data.kinds].filter(([id, k]) => k === 'column' && Math.abs(Math.max(z(modelStore.model.elements.get(id)!.nodeI), z(modelStore.model.elements.get(id)!.nodeJ)) - (level ?? 0)) < 1e-3)
    .map(([id]) => { const e = modelStore.model.elements.get(id)!; return modelStore.model.nodes.get(z(e.nodeI) > z(e.nodeJ) ? e.nodeI : e.nodeJ)!; }));
  const pts = $derived([...beams.flatMap((e) => [modelStore.model.nodes.get(e.nodeI)!, modelStore.model.nodes.get(e.nodeJ)!]), ...cols]);
  const W = 520, H = 340, PAD = 20;
  const box = $derived(pts.length ? { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) } : null);
  const sc = $derived(box ? Math.min((W - 2 * PAD) / Math.max(box.x1 - box.x0, 1e-3), (H - 2 * PAD) / Math.max(box.y1 - box.y0, 1e-3)) : 1);
  const X = (x: number) => PAD + (x - (box?.x0 ?? 0)) * sc;
  const Y = (y: number) => H - PAD - (y - (box?.y0 ?? 0)) * sc;
  const count = $derived({ primary: beams.filter((e) => data.roles.get(e.id) === 'primary').length, secondary: beams.filter((e) => data.roles.get(e.id) === 'secondary').length });
  function toggle(id: number) { setSeismicRole([id], data.roles.get(id) === 'primary' ? 'secondary' : 'primary'); }
  const undeclared = $derived(beams.filter((e) => !data.declared.has(e.id)));
  /** The geometry's suggestion, declared for this level's undeclared beams by the person's click. */
  const adopt = () => adoptSuggestedRoles(undeclared.map((e) => e.id));
</script>

<div class="rp" data-testid="seismic-roles-plan">
  <div class="rp-head">
    <label>{t('desk.level')}<select bind:value={level}>{#each levels as l}<option value={l}>{l.toFixed(2)} m</option>{/each}</select></label>
    <span class="rp-key prim">■ {tp('seisDes.primaryCount', { n: count.primary })}</span>
    <span class="rp-key sec">■ {tp('seisDes.secondaryCount', { n: count.secondary })}</span>
    {#if undeclared.length}<button onclick={adopt} data-testid="seismic-roles-adopt">{tp('lateral.adoptSuggestion', { n: undeclared.length })}</button>{/if}
    {#if beams.some((e) => data.declared.has(e.id))}<button onclick={() => setSeismicRole(beams.filter((e) => data.declared.has(e.id)).map((e) => e.id), null)} data-testid="seismic-roles-reset">{t('lateral.withdraw')}</button>{/if}
  </div>
  {#if box}
    <svg viewBox="0 0 {W} {H}" role="img" aria-label={t('seisDes.rolesPlan')}>
      {#each beams as e (e.id)}
        {@const a = modelStore.model.nodes.get(e.nodeI)!}{@const b = modelStore.model.nodes.get(e.nodeJ)!}
        <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} class="rp-beam" class:prim={data.roles.get(e.id) === 'primary'} class:fixed={data.declared.has(e.id)}
          role="button" tabindex="0" onclick={() => toggle(e.id)} onkeydown={(ev) => { if (ev.key === 'Enter') toggle(e.id); }} data-testid="seismic-beam-{e.id}"><title>{data.declared.has(e.id) ? tp('seisDes.beamTitle', { id: e.id, role: t(`seisDes.role.${data.roles.get(e.id)}`) }) : tp('lateral.beamUndeclared', { id: e.id, suggested: t(`seisDes.role.${data.suggested.get(e.id) ?? 'primary'}`) })}</title></line>
      {/each}
      {#each cols as p}<rect x={X(p.x) - 4} y={Y(p.y) - 4} width="8" height="8" class="rp-col" />{/each}
    </svg>
  {:else}<p class="rp-hint">{t('seisDes.noFrame')}</p>{/if}
</div>

<style>
  .rp-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 0.7rem; }
  .rp svg { width: 100%; max-width: 520px; display: block; margin-top: 4px; }
  .rp-beam { stroke: var(--st-warn); stroke-width: 4; stroke-dasharray: 6 3; cursor: pointer; }
  .rp-beam.prim { stroke: var(--st-info); }
  .rp-beam.fixed { stroke-dasharray: none; }
  .rp-beam:focus-visible { outline: none; stroke-width: 6; }
  .rp-col { fill: var(--st-text); }
  .rp-key.prim { color: var(--st-info); } .rp-key.sec { color: var(--st-warn); }
  .rp-hint { color: var(--st-text-2); font-size: 0.7rem; }
  select, button { font: inherit; font-size: 0.68rem; padding: 1px 6px; border: 1px solid var(--st-hair-strong); border-radius: 4px; background: var(--st-surface); color: var(--st-text); }
  button { background: var(--st-surface-3); cursor: pointer; }
</style>
