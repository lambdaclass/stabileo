<script lang="ts">
  import { editorActivity } from '../../../lib/utils/editor-activity';
  const editorActive = editorActivity();
  /**
   * The floors' use zones (`store/use-zones.ts`), level by level: each zone's name, use, state,
   * area, value and what it adds, and the totals. Zones are drawn in the model, read from a
   * template's closed outlines (their labels suggesting the use), or picked as nodes above;
   * several are given a use, confirmed, copied to other levels or deleted at once. The live loads
   * follow a plan reviewed before it is written (`UseZonesPlanDialog`).
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { OCCUPANCY_TABLE_2025, findOccupancy } from '../../../lib/codes/cirsoc101/live-loads';
  import { confirmZoneUse, copyZonesToLevels, deleteUseZones, finishPackages, liveCaseId, setZoneUse, useZones } from '../../../lib/store/use-zones';
  import FinishPackages from './FinishPackages.svelte';
  import { zoneLiveLoad, zoneStatus, zoneUnsupported, zoneOverlap, zoneUseOf, type ZoneStatus } from '../../../lib/model/use-zones';
  import { zoneArea, zoneChanged, type DefinitionModel } from '../../../lib/model/loads/floor-definitions';
  import { sortedLevels } from '../../../lib/model/grid';
  import { zoneDraw } from '../../../lib/store/zone-draw.svelte';
  import { useZoneMap } from '../../../lib/store/use-zone-map.svelte';
  import UseZonesPlanDialog from './UseZonesPlanDialog.svelte';
  import UseZonesFromTemplate from './UseZonesFromTemplate.svelte';

  const dm = () => modelStore.model as unknown as DefinitionModel;
  const levels = $derived(sortedLevels(modelStore.grid));
  const rows = $derived.by(() => {
    void modelStore.modelVersion; void modelStore.model.groups;
    return useZones().map((z) => {
      const use = zoneUseOf(z);
      const live = zoneLiveLoad(use);
      const area = zoneArea(dm(), z.id);
      return { id: z.id, name: z.name, z: z.z, use, status: zoneStatus(use), area, q: live?.q ?? null, kN: live ? live.q * area : null, off: zoneUnsupported(dm(), z.id), openings: ((z.data as { openings?: number[] } | undefined)?.openings ?? []).length };
    });
  });
  const byLevel = $derived.by(() => {
    const out = new Map<number, typeof rows>();
    for (const r of rows) (out.get(r.z) ?? out.set(r.z, []).get(r.z)!).push(r);
    return [...out].sort((a, b) => b[0] - a[0]);
  });
  const levelName = (z: number) => levels.find((l) => Math.abs(l.z - z) < 1e-6)?.name ?? `z = ${z}`;
  /** Pairs of zones of one level that share area: two uses on one place. */
  const overlaps = $derived.by(() => {
    const out: Array<[number, number]> = [];
    for (const [, list] of byLevel) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (zoneOverlap(dm(), list[i]!.id, list[j]!.id) > 1e-3) out.push([list[i]!.id, list[j]!.id]);
    return out;
  });

  let selected = $state<Set<number>>(new Set());
  let bulkUse = $state('');
  let copyTo = $state<number[]>([]);
  let planOpen = $state(false);
  let fromTemplate = $state(false);
  let manual = $state<{ id: number; q: number; note: string } | null>(null);
  let message = $state<string | null>(null);
  let drawName = $state('');
  let confirmDelete = $state(false);
  /** The load definitions the zones generated (live and finishes), which go with them. */
  const generatedOf = (ids: number[]) => [...modelStore.model.groups.values()].filter((g) => g.kind === 'floorLoad' && ids.includes((g.data as { fromZone?: number } | undefined)?.fromZone ?? -1)).length;

  const toggle = (id: number) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); selected = s; };
  function assign(ids: number[], value: string) {
    if (!value) return;
    if (value === '__none') setZoneUse(ids, { none: true, provenance: 'manual' });
    else if (value === '__manual') manual = { id: ids[0]!, q: 0, note: '' };
    else setZoneUse(ids, { occupancy: value, provenance: 'confirmed' });
  }
  function copy() {
    const r = copyZonesToLevels([...selected], copyTo);
    message = tp('useZones.copied', { n: r.copied, skipped: r.skipped });
  }
  const label = (key: string) => { const row = findOccupancy(key); return row ? `${t(row.labelKey)}${row.uniformKNm2 !== null ? ` · ${row.uniformKNm2}` : ` · ${t('useZones.seeArticle')}`}` : key; };
  const statusLabel = (s: ZoneStatus) => t(`useZones.status.${s}`);
  const fmt = (v: number | null, d = 2) => (v === null ? '—' : v.toFixed(d));
</script>

<svelte:window onkeydown={(e) => {
    if (!editorActive()) return;
  if (!zoneDraw.active) return;
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) return;
  if (e.key === 'Enter') { e.preventDefault(); zoneDraw.close(); }
  if (e.key === 'Escape') zoneDraw.stop();
}} />

<section class="uz" data-testid="use-zones">
  <div class="uz-head">
    <span class="uz-title">{t('useZones.title')}</span>
    <label class="uz-map">{t('useZones.map')}
      <select bind:value={useZoneMap.mode} data-testid="use-zone-map">
        <option value="off">{t('useZones.mapOff')}</option>
        <option value="use">{t('useZones.mapUse')}</option>
        <option value="status">{t('useZones.mapStatus')}</option>
        <option value="intensity">{t('useZones.mapIntensity')}</option>
      </select>
    </label>
  </div>
  <p class="uz-hint">{t('useZones.hint')}</p>

  <div class="uz-row">
    {#if zoneDraw.active}
      <span class="uz-drawing" data-testid="zone-draw-state">{tp('useZones.drawing', { n: zoneDraw.points.length, level: levelName(zoneDraw.z) })}</span>
      <button class="pk-btn" disabled={zoneDraw.points.length < 3} onclick={() => zoneDraw.close()} data-testid="zone-draw-close">{t('drawBar.closeOutline')} <kbd>Enter</kbd></button>
      <button class="pk-btn" disabled={!zoneDraw.points.length} onclick={() => zoneDraw.undo()}>{t('drawBar.undoCorner')}</button>
      <button class="pk-btn" onclick={() => zoneDraw.stop()} data-testid="zone-draw-stop">{t('pro.drawStop')} <kbd>Esc</kbd></button>
    {:else}
      <input class="uz-name" placeholder={t('useZones.newName')} bind:value={drawName} />
      <button class="pk-btn" onclick={() => zoneDraw.start(drawName)} data-testid="zone-draw-start">{t('useZones.draw')}</button>
      <button class="pk-btn" disabled={!modelStore.underlays.some((u) => u.shapes?.some((s) => s.k === 'p' && s.closed))} onclick={() => (fromTemplate = true)} data-testid="zones-from-template">{t('useZones.fromTemplate')}…</button>
    {/if}
  </div>

  {#if rows.length}
    {#if selected.size}
      <div class="uz-bulk" data-testid="use-zones-bulk">
        <span>{tp('useZones.selectedN', { n: selected.size })}</span>
        <select bind:value={bulkUse} data-testid="use-zones-bulk-use">
          <option value="">{t('useZones.chooseUse')}</option>
          {#each OCCUPANCY_TABLE_2025 as o (o.key)}<option value={o.key}>{label(o.key)}</option>{/each}
          <option value="__none">{t('useZones.none')}</option>
        </select>
        <button class="pk-btn" disabled={!bulkUse} onclick={() => assign([...selected], bulkUse)} data-testid="use-zones-bulk-assign">{t('useZones.assign')}</button>
        <button class="pk-btn" onclick={() => confirmZoneUse([...selected])} data-testid="use-zones-confirm">{t('useZones.confirm')}</button>
        <span class="uz-copy">
          {t('useZones.copyTo')}
          {#each levels as l (l.id)}<label><input type="checkbox" checked={copyTo.includes(l.z)} onchange={() => (copyTo = copyTo.includes(l.z) ? copyTo.filter((x) => x !== l.z) : [...copyTo, l.z])} /> {l.name}</label>{/each}
          <button class="pk-btn" disabled={!copyTo.length} onclick={copy} data-testid="use-zones-copy">{t('useZones.copy')}</button>
        </span>
        <button class="pk-btn danger" onclick={() => (confirmDelete = true)} data-testid="use-zones-delete">{t('useZones.delete')}</button>
      </div>
      {#if confirmDelete}
        <!-- What goes with the zones, before it goes: their names and the loads they generated. -->
        <div class="uz-confirm" data-testid="use-zones-delete-confirm">
          <span>{tp('useZones.deleteReview', { zones: [...selected].map((id) => modelStore.model.groups.get(id)?.name ?? `#${id}`).join(', '), loads: generatedOf([...selected]) })}</span>
          <button class="pk-btn danger" onclick={() => { deleteUseZones([...selected]); selected = new Set(); confirmDelete = false; }} data-testid="use-zones-delete-yes">{t('useZones.deleteYes')}</button>
          <button class="pk-btn" onclick={() => (confirmDelete = false)}>{t('plates.close')}</button>
        </div>
      {/if}
    {/if}

    <table class="uz-table" data-testid="lz-list">
      <thead><tr><th></th><th>{t('useZones.zone')}</th><th>{t('useZones.use')}</th><th>{t('useZones.state')}</th><th>m²</th><th>kN/m²</th><th>kN</th><th>{t('finishes.column')}</th></tr></thead>
      {#each byLevel as [z, list] (z)}
        <tbody>
          <tr class="uz-level"><td colspan="8">{levelName(z)} · {tp('useZones.levelTotal', { area: list.reduce((s, r) => s + r.area, 0).toFixed(2), kN: list.reduce((s, r) => s + (r.kN ?? 0), 0).toFixed(1), pending: list.filter((r) => r.status !== 'assigned' && r.status !== 'none').length })}</td></tr>
          {#each list as r (r.id)}
            <tr data-testid="use-zone-{r.name}">
              <td><input type="checkbox" checked={selected.has(r.id)} onchange={() => toggle(r.id)} aria-label={r.name} /></td>
              <td>{r.name}{#if r.use?.name && r.use.name !== r.name}<span class="uz-dim"> ({r.use.name})</span>{/if}{#if zoneChanged(dm(), r.id)}<span class="uz-warn" title={t('loadZone.changed')} data-testid="lz-changed"> !</span>{/if}{#if r.openings}<span class="uz-dim"> · {tp('loadZone.withOpenings', { n: r.openings })}</span>{/if}</td>
              <td>
                <select value={r.use?.none ? '__none' : Number.isFinite(r.use?.manualQ) ? '__manual' : (r.use?.occupancy ?? '')} onchange={(e) => assign([r.id], e.currentTarget.value)} data-testid="use-zone-use-{r.name}">
                  <option value="">—</option>
                  {#if r.use?.candidates?.length}
                    <optgroup label={t('useZones.suggested')}>{#each r.use.candidates as k (k)}<option value={k}>{label(k)}</option>{/each}</optgroup>
                  {/if}
                  <optgroup label={t('useZones.table')}>{#each OCCUPANCY_TABLE_2025 as o (o.key)}<option value={o.key}>{label(o.key)}</option>{/each}</optgroup>
                  <option value="__manual">{t('useZones.manual')}…</option>
                  <option value="__none">{t('useZones.none')}</option>
                </select>
              </td>
              <td><span class="chip chip-{r.status}" title={r.use?.manualNote ?? ''}>{statusLabel(r.status)}</span>{#if r.off > 1e-3}<span class="uz-warn" title={t('useZones.offSlab')}> ⚠ {r.off.toFixed(2)}</span>{/if}</td>
              <td class="num">{r.area.toFixed(2)} m²</td>
              <td class="num">{fmt(r.q)}</td>
              <td class="num">{fmt(r.kN, 1)}</td>
              <td>
                <select value={r.use?.finish ?? ''} onchange={(e) => setZoneUse([r.id], { finish: e.currentTarget.value || undefined })} data-testid="use-zone-finish-{r.name}">
                  <option value="">—</option>
                  {#each finishPackages() as f (f.id)}<option value={String(f.id)}>{f.name}</option>{/each}
                </select>
              </td>
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
    {#if overlaps.length}<p class="uz-warn" data-testid="use-zones-overlaps">{tp('useZones.overlaps', { list: overlaps.map(([a, b]) => `${modelStore.model.groups.get(a)?.name} / ${modelStore.model.groups.get(b)?.name}`).join(', ') })}</p>{/if}
    <p class="uz-hint">{t('useZones.ref')}</p>
    <div class="uz-row">
      <button class="pk-btn pk-btn-primary" disabled={liveCaseId() === null} onclick={() => (planOpen = true)} data-testid="use-zones-plan">{t('useZones.generate')}…</button>
      {#if liveCaseId() === null}<span class="uz-warn">{t('useZones.noLiveCase')}</span>{/if}
    </div>
  {/if}
  <FinishPackages />
  {#if manual}
    <div class="uz-manual" data-testid="use-zone-manual">
      <label>{t('useZones.manualValue')} <input type="number" step="0.1" bind:value={manual.q} /> kN/m²</label>
      <input class="uz-name" placeholder={t('useZones.manualNote')} bind:value={manual.note} />
      <button class="pk-btn" disabled={!manual.note.trim()} onclick={() => { setZoneUse([manual!.id], { manualQ: manual!.q, manualNote: manual!.note.trim(), provenance: 'confirmed' }); manual = null; }}>{t('useZones.assign')}</button>
      <button class="pk-btn" onclick={() => (manual = null)}>{t('plates.close')}</button>
    </div>
  {/if}
  {#if message}<p class="uz-hint" role="status">{message}</p>{/if}
</section>
{#if planOpen}<UseZonesPlanDialog onclose={() => (planOpen = false)} />{/if}
{#if fromTemplate}<UseZonesFromTemplate onclose={() => (fromTemplate = false)} />{/if}

<style>
  .uz { display: flex; flex-direction: column; gap: 5px; padding-top: 6px; border-top: 1px solid var(--st-hair); font-size: 0.66rem; color: var(--st-text-2); }
  .uz-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .uz-title { font-weight: 600; color: var(--st-text); }
  .uz-hint { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  .uz-row, .uz-bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
  .uz-bulk { padding: 4px; border: 1px solid var(--st-hair-strong); border-radius: var(--st-radius); }
  .uz-copy { display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; }
  .uz-name { width: 7rem; font-size: 0.64rem; }
  .uz-drawing { color: var(--st-accent); }
  .uz-table { width: 100%; border-collapse: collapse; }
  .uz-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 3px; }
  .uz-table td { padding: 1px 3px; border-bottom: 1px solid var(--st-hair); }
  .uz-table td.num { text-align: right; font-family: var(--st-mono); }
  .uz-table select { max-width: 11rem; font-size: 0.62rem; }
  .uz-level td { color: var(--st-text); font-weight: 600; background: var(--st-surface-2); }
  .uz-dim { color: var(--st-text-3); }
  .uz-warn { color: var(--st-warn, #d9a441); }
  .uz-manual, .uz-confirm { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .uz-confirm { padding: 4px; border: 1px solid var(--st-danger, #e06c6c); border-radius: var(--st-radius); }
  .chip { padding: 0 5px; border-radius: 8px; border: 1px solid var(--st-hair-strong); }
  .chip-assigned { color: var(--st-ok, #5cb85c); border-color: currentColor; }
  .chip-pending, .chip-unsupported { color: var(--st-warn, #d9a441); border-color: currentColor; }
  .chip-unassigned { color: var(--st-text-3); }
  .chip-none { color: var(--st-text-2); }
  .pk-btn.danger { color: var(--st-danger, #e06c6c); }
</style>
