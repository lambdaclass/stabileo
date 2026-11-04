<!--
  Architecture: constructions by layers (U and surface mass against the project's limits), walls
  and partitions, rooms with their use, the loads they put on the structure, walls read from an
  IFC, a point cloud's slice to trace over, the geometry check and the architecture memoria.
-->
<script lang="ts">
  import { t, tp, i18n } from '../../../../lib/i18n';
  import { modelStore } from '../../../../lib/store';
  import {
    applyRoomLoads, applyWallLoads, architecture, downloadArchitectureMemoria, geometryIssues, importCloud, importIfcWalls, levels,
    removeConstruction, removeRoom, removeWall, saveRoom, saveWall,
  } from '../../../../lib/store/architecture';
  import { constructionProps, constructionRows, polygonArea, wallLength } from '../../../../lib/engine/architecture/architecture';
  import { ROOM_CATEGORY_LOADS } from '../../../../lib/cad/rooms';
  import SteelMemberSheet from '../steel/SteelMemberSheet.svelte';
  import ConstructionForm from './ConstructionForm.svelte';

  const a = $derived(architecture());
  const lvs = $derived(levels());
  const issues = $derived(geometryIssues());
  let selected = $state<string | null>(null);
  const current = $derived(a.constructions.find((c) => c.id === selected) ?? null);
  let note = $state('');
  const num = (s: string) => { const v = Number(String(s).replace(',', '.')); return String(s).trim() !== '' && Number.isFinite(v) ? v : undefined; };
  const f2 = (v: number) => new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 }).format(v);
  const lvName = (id: string) => lvs.find((l) => l.id === id)?.name ?? id;
  const stateKey = (rows: ReturnType<typeof constructionRows>) => { const s = rows.some((r) => r.status === 'fail') ? 'fail' : rows.some((r) => r.status === 'notVerified') ? 'none' : 'ok'; return s === 'ok' ? 'mat.state.ok' : s === 'fail' ? 'mat.state.fail' : 'mat.state.none'; };

  let w = $state<Record<string, string>>({ level: '', name: '', x1: '', y1: '', x2: '', y2: '', height: '', construction: '' });
  function addWall() {
    const lv = lvs.find((l) => l.id === w.level), xs = ['x1', 'y1', 'x2', 'y2', 'height'].map((k) => num(w[k]!));
    if (!lv || xs.some((v) => v === undefined) || !w.construction) { note = t('sel.ui.missing'); return; }
    saveWall({ id: `w-${Date.now().toString(36)}`, name: w.name!.trim() || `M${a.walls.length + 1}`, levelId: lv.id, z: lv.z, a: { x: xs[0]!, y: xs[1]! }, b: { x: xs[2]!, y: xs[3]! }, height: xs[4]!, constructionId: w.construction! });
    note = '';
  }
  // A room as a rectangle between two grid axes each way, or as typed points «x,y; x,y; …».
  const axes = $derived(modelStore.grid?.axes ?? []);
  let r = $state<Record<string, string>>({ level: '', name: '', use: '', height: '', ax1: '', ax2: '', ay1: '', ay2: '', points: '' });
  function addRoom() {
    const lv = lvs.find((l) => l.id === r.level), h = num(r.height!);
    let outline: Array<{ x: number; y: number }> = [];
    if (r.points!.trim()) outline = r.points!.split(';').map((p) => p.split(',').map((x) => num(x.trim()))).filter((p) => p.length === 2 && p.every((v) => v !== undefined)).map(([x, y]) => ({ x: x!, y: y! }));
    else {
      const at = (id: string) => axes.find((x) => x.id === id)?.at;
      const [x1, x2, y1, y2] = [at(r.ax1!), at(r.ax2!), at(r.ay1!), at(r.ay2!)];
      if ([x1, x2, y1, y2].every((v) => v !== undefined)) outline = [{ x: x1!, y: y1! }, { x: x2!, y: y1! }, { x: x2!, y: y2! }, { x: x1!, y: y2! }];
    }
    if (!lv || !h || outline.length < 3 || !r.name!.trim()) { note = t('sel.ui.missing'); return; }
    saveRoom({ id: `r-${Date.now().toString(36)}`, name: r.name!.trim(), levelId: lv.id, z: lv.z, outline, height: h, ...(r.use ? { use: r.use } : {}) });
    note = '';
  }
  async function ifcWalls(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]; if (!file) return;
    try { note = tp('arch.ui.ifcWalls', { n: await importIfcWalls(await file.arrayBuffer()) }); } catch (err) { note = (err as Error).message; }
  }
  let cloud = $state({ level: '', cut: '1', name: '' });
  async function cloudFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]; if (!file) return;
    if (!cloud.level) { note = t('sel.ui.missing'); return; }
    const res = importCloud(await file.text(), cloud.level, num(cloud.cut) ?? 1, cloud.name.trim() || file.name);
    note = tp('arch.ui.cloud', { r: res.read, k: res.kept });
  }
</script>

<div class="sf arch" data-testid="arch-editor">
  <p class="muted">{t('arch.ui.lead')}</p>

  <details class="sf-sec" open data-testid="arch-constructions">
    <summary>{t('arch.memo.constructions')} <span class="muted">· {tp('sfl.count', { n: a.constructions.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each a.constructions as c (c.id)}
        {@const p = constructionProps(c)}
        <tr class:on={selected === c.id} onclick={() => (selected = c.id)} data-testid="cons-row-{c.id}">
          <td>{c.name}</td><td>{t(`arch.kind.${c.kind}`)}</td><td>{Math.round(p.thickness * 1000)} mm</td><td>U {Number.isFinite(p.u) && c.layers.every((l) => l.lambda > 0) ? f2(p.u) : '—'}</td><td>{f2(p.mass)} kg/m²</td><td>{t(stateKey(constructionRows(c)))}</td>
          <td><button class="link" onclick={(e) => { e.stopPropagation(); removeConstruction(c.id); }}>{t('mat.timber.drop')}</button></td>
        </tr>
      {/each}
    </tbody></table>
    <ConstructionForm />
    {#if current}<SteelMemberSheet rows={constructionRows(current)} note={t('arch.ui.consNote')} />{/if}
  </details>

  <details class="sf-sec" data-testid="arch-walls">
    <summary>{t('arch.memo.walls')} <span class="muted">· {tp('sfl.count', { n: a.walls.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each a.walls as x (x.id)}<tr><td>{lvName(x.levelId)}</td><td>{x.name}</td><td>{f2(wallLength(x))} m</td><td>h {f2(x.height)} m</td><td>{a.constructions.find((c) => c.id === x.constructionId)?.name ?? '—'}</td><td><button class="link" onclick={() => removeWall(x.id)}>{t('mat.timber.drop')}</button></td></tr>{/each}
    </tbody></table>
    <div class="sf-form">
      <label>{t('arch.col.level')} <select bind:value={w.level} data-testid="wall-level"><option value="">—</option>{#each lvs as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select></label>
      {#each [['name', 'fed.ui.name'], ['x1', 'x₁ (m)'], ['y1', 'y₁ (m)'], ['x2', 'x₂ (m)'], ['y2', 'y₂ (m)'], ['height', 'arch.col.height']] as [k, label] (k)}
        <label>{label.includes('.') ? t(label) : label} <input inputmode="decimal" bind:value={w[k]} data-testid="wall-{k}" /></label>
      {/each}
      <label>{t('arch.col.construction')} <select bind:value={w.construction} data-testid="wall-construction"><option value="">—</option>{#each a.constructions as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select></label>
      <button onclick={addWall} data-testid="wall-add">{t('sfl.add')}</button>
    </div>
    <div class="sf-form"><label>{t('arch.ui.ifcWallsFile')} <input type="file" accept=".ifc" onchange={ifcWalls} /></label></div>
  </details>

  <details class="sf-sec" data-testid="arch-rooms">
    <summary>{t('arch.memo.rooms')} <span class="muted">· {tp('sfl.count', { n: a.rooms.length })}</span></summary>
    <table class="sf-t"><tbody>
      {#each a.rooms as x (x.id)}<tr data-testid="room-row-{x.id}"><td>{lvName(x.levelId)}</td><td>{x.name}</td><td>{x.use ? t(`cad.assume.roomCat.${x.use}`) : '—'}</td><td>{f2(polygonArea(x.outline))} m²</td><td><button class="link" onclick={() => removeRoom(x.id)}>{t('mat.timber.drop')}</button></td></tr>{/each}
    </tbody></table>
    <div class="sf-form">
      <label>{t('arch.col.level')} <select bind:value={r.level} data-testid="room-level"><option value="">—</option>{#each lvs as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select></label>
      <label>{t('fed.ui.name')} <input bind:value={r.name} data-testid="room-name" /></label>
      <label>{t('arch.col.use')} <select bind:value={r.use} data-testid="room-use"><option value="">—</option>{#each Object.keys(ROOM_CATEGORY_LOADS) as u (u)}<option value={u}>{t(`cad.assume.roomCat.${u}`)} ({ROOM_CATEGORY_LOADS[u]} kN/m²)</option>{/each}</select></label>
      <label>{t('arch.col.height')} <input inputmode="decimal" bind:value={r.height} data-testid="room-height" /></label>
      {#each [['ax1', 'x'], ['ax2', 'x'], ['ay1', 'y'], ['ay2', 'y']] as [k, dir] (k)}
        <label>{t('arch.ui.axis')} {dir} <select bind:value={r[k]} data-testid="room-{k}"><option value="">—</option>{#each axes.filter((x) => x.axis === dir) as ax (ax.id)}<option value={ax.id}>{ax.name}</option>{/each}</select></label>
      {/each}
      <label class="wide">{t('arch.ui.points')} <input bind:value={r.points} placeholder="0,0; 4,0; 4,3; 0,3" /></label>
      <button onclick={addRoom} data-testid="room-add">{t('sfl.add')}</button>
    </div>
  </details>

  <details class="sf-sec" data-testid="arch-loads">
    <summary>{t('arch.ui.loads')}</summary>
    <div class="sf-form">
      <button onclick={() => (note = tp('arch.ui.loadsApplied', { n: applyWallLoads() }))} data-testid="arch-wall-loads">{t('arch.ui.wallLoads')}</button>
      <button onclick={() => (note = tp('arch.ui.loadsApplied', { n: applyRoomLoads() }))} data-testid="arch-room-loads">{t('arch.ui.roomLoads')}</button>
    </div>
    <p class="muted">{t('arch.ui.loadsNote')}</p>
  </details>

  <details class="sf-sec" data-testid="arch-cloud">
    <summary>{t('arch.ui.cloudTitle')}</summary>
    <div class="sf-form">
      <label>{t('arch.col.level')} <select bind:value={cloud.level}><option value="">—</option>{#each lvs as l (l.id)}<option value={l.id}>{l.name}</option>{/each}</select></label>
      <label>{t('arch.ui.cut')} <input inputmode="decimal" bind:value={cloud.cut} /></label>
      <label>{t('fed.ui.name')} <input bind:value={cloud.name} /></label>
      <input type="file" accept=".xyz,.pts,.txt,.csv,.asc" onchange={cloudFile} />
    </div>
  </details>

  <details class="sf-sec" open={issues.length > 0} data-testid="arch-geometry">
    <summary>{t('arch.memo.geometry')} <span class="muted">· {tp('sfl.count', { n: issues.length })}</span></summary>
    {#each issues as i, k (k)}<p class="muted">{t(`arch.issue.${i.kind}`)}: {i.ids.join(', ')} ({f2(i.at.x)}; {f2(i.at.y)})</p>{/each}
    {#if !issues.length}<p class="muted">{t('arch.issue.none')}</p>{/if}
  </details>

  <div class="sf-form"><button onclick={() => downloadArchitectureMemoria(tp as never, i18n.locale)} data-testid="arch-memoria">{t('arch.ui.memoria')}</button></div>
  {#if note}<p class="muted" data-testid="arch-note">{note}</p>{/if}
</div>

<style>
  .sf { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem; font-size: 0.72rem; overflow: auto; }
  .arch :global(.muted) { margin: 0; color: var(--st-text-2); font-size: 0.68rem; line-height: 1.35; }
  .sf-sec { border: 1px solid var(--st-hair); border-radius: 4px; padding: 0.4rem 0.5rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .sf-sec summary { cursor: pointer; font-weight: 600; }
  .sf-t { width: 100%; border-collapse: collapse; }
  .sf-t td { padding: 2px 4px; border-top: 1px solid var(--st-hair); }
  .sf-t tr.on td { background: var(--st-surface-3); }
  .arch :global(.sf-form) { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: end; margin: 0.3rem 0; }
  .arch :global(.sf-form label) { display: flex; flex-direction: column; gap: 0.1rem; color: var(--st-text-2); font-size: 0.66rem; }
  .arch :global(.sf-form label.wide) { flex: 1 1 14rem; }
  .arch :global(.sf-form .tag) { align-self: center; font-size: 0.68rem; min-width: 4rem; }
  .arch :global(input), .arch :global(select) { font-size: 0.72rem; width: 5.5rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 3px; padding: 0.1rem 0.3rem; }
  .arch :global(label.wide input) { width: 100%; }
  .arch :global(input[type='file']) { width: auto; }
  .arch :global(select) { width: auto; max-width: 14rem; }
  .arch :global(button) { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--st-surface-3); color: var(--st-text); border: 1px solid var(--st-hair-strong); border-radius: 4px; cursor: pointer; }
  .arch :global(button.link) { background: none; border: none; color: var(--st-value); padding: 0 0.3rem; }
</style>
