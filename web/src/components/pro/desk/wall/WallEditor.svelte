<script lang="ts">
  /**
   * The wall editor: the walls the floor design produced, one per level; the selected wall's stack
   * drawn level by level with its openings and boundary zones; its bars edited as a draft (vertical
   * and horizontal in one or two curtains, boundary bars at the ends, bars beside the openings) and
   * checked at once on the wall's own demands (`designWall`); saving keeps them with the decisions
   * and designs the walls again. Its thickness, and for a basement wall the soil it retains, which
   * puts the earth pressure on its shells.
   */
  import { untrack } from 'svelte';
  import { t, tp } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import { detailingStore } from '../../../../lib/store/detailing.svelte';
  import { storedDecisions } from '../../../../lib/store/design-decisions';
  import { physicalGroups, setPhysicalThickness } from '../../../../lib/store/physical';
  import { applyEarthPressure } from '../../../../lib/store/earth-pressure';
  import { designWall } from '../../../../lib/engine/detailing/wall-design';
  import type { WallReinforcement } from '../../../../lib/design-contract/reinforcement';

  const run = $derived(detailingStore.lastFloorRun);
  const walls = $derived(run?.walls ?? []);
  const geo = $derived(run?.wallGeometry ?? {});
  let sel = $state<string | null>(null);
  $effect(() => { if (!sel && walls[0]) sel = walls[0].wallId; });
  const wall = $derived(walls.find((w) => w.wallId === sel) ?? null);
  const g = $derived(sel ? geo[sel] : undefined);
  const worst = (w: (typeof walls)[number]) => Math.max(w.shear.utilization, w.axialFlexure.utilization, ...w.checks.map((c) => c.utilization));
  const sameLine = (a: NonNullable<typeof g>, b: NonNullable<typeof g>) => Math.hypot(a.start.x - b.start.x, a.start.y - b.start.y) < 1e-3 && Math.hypot(a.end.x - b.end.x, a.end.y - b.end.y) < 1e-3;
  const stack = $derived(g ? walls.filter((w) => geo[w.wallId] && sameLine(geo[w.wallId]!, g)).sort((p, q) => geo[p.wallId]!.start.z - geo[q.wallId]!.start.z) : []);

  let draft = $state<WallReinforcement | null>(null);
  $effect(() => { void sel; untrack(() => { draft = wall ? JSON.parse(JSON.stringify(storedDecisions().walls?.[wall.wallId] ?? wall.reinforcement)) : null; }); });
  const check = $derived(wall && draft ? designWall({ ...wall.input, provided: draft }) : null);
  const saved = $derived.by(() => { void modelStore.designDecisions; return !!(sel && storedDecisions().walls?.[sel]); });
  let note = $state<string | null>(null);

  function save() {
    if (!wall || !draft) return;
    const d = storedDecisions();
    modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, walls: { ...(d.walls ?? {}), [wall.wallId]: JSON.parse(JSON.stringify(draft)) } }));
    detailingStore.generateFloors({ families: ['wall'] });
    note = t('wallEd.saved');
  }
  function revert() {
    if (!wall) return;
    const d = storedDecisions();
    const rest = { ...(d.walls ?? {}) }; delete rest[wall.wallId];
    modelStore.reinforcementTransaction((api) => api.setDecisions({ ...d, walls: rest }));
    detailingStore.generateFloors({ families: ['wall'] });
    note = t('wallEd.reverted');
  }
  const groupsOf = (ids: number[]) => physicalGroups().filter((x) => x.physical.kind === 'wall' && (x.members.quads ?? []).some((q) => ids.includes(q))).map((x) => x.id);
  let thick = $state(0.2);
  $effect(() => { if (g) untrack(() => (thick = g.thickness)); });
  function applyThickness() { if (g) { for (const id of groupsOf(g.elementIds)) setPhysicalThickness(id, thick); note = t('wallEd.resolve'); } }

  // ── The retained soil ──
  let gradeZ = $state(0), gamma = $state(18), k = $state(0.5), q = $state(10), side = $state<'l' | 'r'>('l');
  $effect(() => { if (g) untrack(() => { const top = stack.length ? Math.max(...stack.map((w) => geo[w.wallId]!.start.z + geo[w.wallId]!.height)) : g.start.z + g.height; gradeZ = +top.toFixed(2); }); });
  function applySoil() {
    if (!g) return;
    const L = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y) || 1;
    const nx = -(g.end.y - g.start.y) / L, ny = (g.end.x - g.start.x) / L, s = side === 'l' ? 1 : -1;
    const mid = { x: (g.start.x + g.end.x) / 2 + s * nx, y: (g.start.y + g.end.y) / 2 + s * ny };
    const r = applyEarthPressure(groupsOf(stack.flatMap((w) => geo[w.wallId]!.elementIds)), { gradeZ, gamma, k, surcharge: q, side: mid });
    note = tp('wallEd.soilApplied', { n: r.shells, f: Math.hypot(r.force.x, r.force.y).toFixed(1), c: r.combinations });
  }

  // ── The elevation ──
  const W = 420;
  const box = $derived.by(() => {
    if (!g || !stack.length) return null;
    const L = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
    const z0 = Math.min(...stack.map((w) => geo[w.wallId]!.start.z)), z1 = Math.max(...stack.map((w) => geo[w.wallId]!.start.z + geo[w.wallId]!.height));
    const sc = Math.min((W - 40) / L, 300 / (z1 - z0 || 1));
    return { L, z0, z1, sc };
  });
</script>

<div class="we" data-testid="wall-editor">
  <aside class="we-list">
    {#if walls.length === 0}
      <p class="we-hint">{t('wallEd.none')}</p>
      <button class="we-btn" onclick={() => detailingStore.generateFloors({ families: ['wall'] })} data-testid="wall-design-run">{t('wallEd.designWalls')}</button>
    {:else}
      <ul>
        {#each walls as w (w.wallId)}
          {@const gw = geo[w.wallId]}
          <li><button class:on={w.wallId === sel} onclick={() => (sel = w.wallId)} data-testid="wall-row-{w.wallId}">
            {w.wallId}{gw ? ` · z ${gw.start.z.toFixed(2)} · ${Math.hypot(gw.end.x - gw.start.x, gw.end.y - gw.start.y).toFixed(2)}×${gw.thickness.toFixed(2)}` : ''}
            · <span class:bad={worst(w) > 1}>{Number.isFinite(worst(w)) ? worst(w).toFixed(2) : '∞'}</span>
          </button></li>
        {/each}
      </ul>
    {/if}
  </aside>

  {#if wall && draft && g && box}
    <section class="we-main">
      {#if note}<p class="we-hint" role="status">{note}</p>{/if}
      <svg viewBox="0 0 {W} {(box.z1 - box.z0) * box.sc + 30}" class="we-svg" role="img" aria-label={t('wallEd.elevation')} data-testid="wall-elevation">
        {#each stack as w (w.wallId)}
          {@const gw = geo[w.wallId]!}
          {@const y = 10 + (box.z1 - gw.start.z - gw.height) * box.sc}
          {@const r = w.wallId === sel ? draft : w.reinforcement}
          <rect x={20} y={y} width={box.L * box.sc} height={gw.height * box.sc} class="we-wall" class:on={w.wallId === sel} onclick={() => (sel = w.wallId)} role="button" tabindex="0" onkeydown={() => (sel = w.wallId)} />
          {#if r.boundary}
            {@const bw = Math.max(0.15, r.boundary.count / r.curtains * Math.max(0.05, 2 * r.boundary.diameter / 1000)) * box.sc}
            <rect x={20} y={y} width={bw} height={gw.height * box.sc} class="we-bnd" /><rect x={20 + box.L * box.sc - bw} y={y} width={bw} height={gw.height * box.sc} class="we-bnd" />
          {/if}
          {#each gw.openings ?? [] as o}
            <rect x={20 + o.offset * box.sc} y={y + (gw.height - o.sill - o.height) * box.sc} width={o.width * box.sc} height={o.height * box.sc} class="we-open" />
          {/each}
          <text x={24} y={y + 12} class="we-t">{w.wallId} · V Ø{r.vertical.diameter} c/{(r.vertical.spacing * 100).toFixed(0)} · H Ø{r.horizontal.diameter} c/{(r.horizontal.spacing * 100).toFixed(0)}{r.boundary ? ` · ${r.boundary.count}Ø${r.boundary.diameter}` : ''}</text>
        {/each}
      </svg>

      <div class="we-cols">
        <div>
          <h5>{tp('wallEd.bars', { id: wall.wallId })} <span class="we-badge">{saved ? t('wallEd.stateSaved') : t('wallEd.stateProposed')}</span></h5>
          <div class="we-grid">
            <label>{t('wallEd.vertical')} Ø<input type="number" min="6" max="25" bind:value={draft.vertical.diameter} /></label>
            <label>c/ (cm)<input type="number" min="5" max="45" step="2.5" value={draft.vertical.spacing * 100} onchange={(e) => (draft!.vertical.spacing = Number(e.currentTarget.value) / 100)} data-testid="wall-v-spacing" /></label>
            <label>{t('wallEd.horizontal')} Ø<input type="number" min="6" max="25" bind:value={draft.horizontal.diameter} /></label>
            <label>c/ (cm)<input type="number" min="5" max="45" step="2.5" value={draft.horizontal.spacing * 100} onchange={(e) => (draft!.horizontal.spacing = Number(e.currentTarget.value) / 100)} /></label>
            <label>{t('wallEd.curtains')}<select bind:value={draft.curtains}><option value={1}>1</option><option value={2}>2</option></select></label>
            <label>{t('wallEd.boundary')}<input type="number" min="0" max="16" value={draft.boundary?.count ?? 0} onchange={(e) => { const n = Number(e.currentTarget.value); draft!.boundary = n > 0 ? { count: n, diameter: draft!.boundary?.diameter ?? 16 } : undefined; }} data-testid="wall-boundary" /></label>
            {#if draft.boundary}<label>Ø<input type="number" min="10" max="32" bind:value={draft.boundary.diameter} /></label>{/if}
            <label>{t('wallEd.openings')}<input type="number" min="0" max="8" value={draft.openings?.count ?? 0} onchange={(e) => { const n = Number(e.currentTarget.value); draft!.openings = n > 0 ? { count: n, diameter: draft!.openings?.diameter ?? 16 } : undefined; }} /></label>
            {#if draft.openings}<label>Ø<input type="number" min="10" max="25" bind:value={draft.openings.diameter} /></label>{/if}
          </div>
          <div class="we-row">
            <button class="we-btn we-primary" onclick={save} data-testid="wall-save">{t('wallEd.save')}</button>
            {#if saved}<button class="we-btn" onclick={revert}>{t('wallEd.revert')}</button>{/if}
          </div>
          <div class="we-row">
            <label>{t('wallEd.thickness')} (m)<input type="number" min="0.08" max="1" step="0.01" bind:value={thick} /></label>
            <button class="we-btn" onclick={applyThickness}>{t('wallEd.applyThickness')}</button>
          </div>
          <h5>{t('wallEd.soil')}</h5>
          <div class="we-grid">
            <label>{t('wallEd.grade')} z<input type="number" step="0.05" bind:value={gradeZ} /></label>
            <label>γ<input type="number" step="0.5" bind:value={gamma} /></label>
            <label>K<input type="number" step="0.05" bind:value={k} /></label>
            <label>q (kPa)<input type="number" step="1" bind:value={q} /></label>
            <label>{t('wallEd.side')}<select bind:value={side}><option value="l">{t('wallEd.left')}</option><option value="r">{t('wallEd.right')}</option></select></label>
          </div>
          <button class="we-btn" onclick={applySoil} data-testid="wall-soil">{t('wallEd.applySoil')}</button>
        </div>
        {#if check}
          <table class="we-checks" data-testid="wall-checks">
            <tbody>
              <tr class:bad={!check.thicknessOk}><td>{t('wallEd.cThickness')}</td><td class="num">{(check.minThickness * 100).toFixed(0)} cm</td></tr>
              <tr class:bad={!check.shear.ok}><td>{t('wallEd.cShear')}</td><td class="num">{check.shear.utilization.toFixed(2)}</td></tr>
              <tr class:bad={!check.axialFlexure.ok}><td>{t('wallEd.cInPlane')}</td><td class="num">{Number.isFinite(check.axialFlexure.utilization) ? check.axialFlexure.utilization.toFixed(2) : '∞'}</td></tr>
              {#each check.checks as c}<tr class:bad={!c.ok} title={c.description}><td>{c.category}</td><td class="num">{Number.isFinite(c.utilization) ? c.utilization.toFixed(2) : '∞'}</td></tr>{/each}
            </tbody>
          </table>
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .we { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 8px; padding: 8px; font-size: 0.72rem; }
  .we-list ul { list-style: none; margin: 0; padding: 0; max-height: 70vh; overflow: auto; }
  .we-list li button { width: 100%; text-align: left; font-size: 0.68rem; padding: 2px 4px; border: none; background: none; color: var(--st-text-2); cursor: pointer; }
  .we-list li button.on { background: var(--st-surface-3); color: var(--st-text); }
  .we-svg { width: 100%; max-width: 520px; background: var(--st-surface); border: 1px solid var(--st-hair); border-radius: 4px; }
  .we-wall { fill: var(--st-surface-2); stroke: var(--st-text-3); stroke-width: 0.8; cursor: pointer; }
  .we-wall.on { stroke: var(--st-accent); stroke-width: 1.6; }
  .we-bnd { fill: color-mix(in srgb, var(--st-value) 25%, transparent); pointer-events: none; }
  .we-open { fill: var(--st-surface); stroke: var(--st-text-3); stroke-dasharray: 3 2; pointer-events: none; }
  .we-t { font-size: 8px; fill: var(--st-text-2); pointer-events: none; }
  .we-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 16rem); gap: 10px; margin-top: 8px; }
  .we-cols h5 { margin: 6px 0 4px; font-size: 0.74rem; }
  .we-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: 3px 8px; }
  .we-grid label, .we-row label { display: flex; align-items: center; gap: 4px; color: var(--st-text-2); }
  .we-grid input, .we-row input, .we-grid select { width: 4rem; font-size: 0.7rem; }
  .we-row { display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
  .we-btn { font-size: 0.68rem; padding: 2px 8px; border: 1px solid var(--st-hair-strong); background: var(--st-surface); color: var(--st-text); border-radius: 4px; cursor: pointer; }
  .we-primary { background: var(--st-accent); border-color: var(--st-accent); color: var(--st-on-accent, #fff); }
  .we-badge { font-size: 0.64rem; padding: 0 6px; border-radius: 8px; background: var(--st-surface-3); color: var(--st-text-2); font-weight: 400; }
  .we-checks { border-collapse: collapse; width: 100%; }
  .we-checks td { padding: 2px 6px; border-top: 1px solid var(--st-hair); }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .bad, tr.bad td { color: var(--st-danger); }
  .we-hint { color: var(--st-text-3); }
  @media (max-width: 1000px) { .we, .we-cols { grid-template-columns: 1fr; } }
</style>
