<script lang="ts">
  import { t } from '../../../lib/i18n';
  import { setAdopted, type SheetRow } from '../../../lib/store/rc-sheets.svelte';
  import { SLAB_FACES } from '../../../lib/rc-sheets/slab-row';
  import type { BarGroup, BeamAdopted, ColumnAdopted, MeshBars, SlabAdopted, WallAdopted } from '../../../lib/rc-sheets/types';

  let { row }: { row: SheetRow } = $props();

  const LONG = [10, 12, 16, 20, 25, 32];
  const SMALL = [6, 8, 10, 12];
  const MESH = [6, 8, 10, 12, 16];

  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement | HTMLSelectElement).value);
  const save = (a: BeamAdopted | ColumnAdopted | SlabAdopted | WallAdopted) => setAdopted(row.key, a);
  function wallPatch(patch: Partial<WallAdopted>) {
    if (row.family !== 'wall') return;
    save({ ...JSON.parse(JSON.stringify(row.adopted)), ...patch });
  }

  function beamGroup(face: 'bottom' | 'top', i: number, patch: Partial<BarGroup>) {
    if (row.family !== 'beam') return;
    const a: BeamAdopted = JSON.parse(JSON.stringify(row.adopted));
    const list = a[face];
    while (list.length <= i) list.push({ count: 0, dia: list[0]?.dia ?? 16 });
    list[i] = { ...list[i]!, ...patch };
    a[face] = list.filter((g, k) => k === 0 || g.count > 0);
    save(a);
  }
  function beamPatch(patch: Partial<BeamAdopted>) {
    if (row.family !== 'beam') return;
    save({ ...JSON.parse(JSON.stringify(row.adopted)), ...patch });
  }
  function columnPatch(patch: Partial<ColumnAdopted>) {
    if (row.family !== 'column') return;
    save({ ...row.adopted, ...patch });
  }
  function meshPatch(face: (typeof SLAB_FACES)[number], patch: Partial<MeshBars>) {
    if (row.family !== 'slab') return;
    const a: SlabAdopted = JSON.parse(JSON.stringify(row.adopted));
    a[face] = { ...a[face], ...patch };
    if (a[face].dia > 0 && !(a[face].spacing > 0)) a[face].spacing = 0.2;
    save(a);
  }
</script>

<div class="rce" data-testid="rc-editor">
  {#if row.family === 'beam'}
    {#each ['bottom', 'top'] as const as face (face)}
      <fieldset>
        <legend>{t(face === 'bottom' ? 'rcSheets.col.bottom' : 'rcSheets.col.top')}</legend>
        {#each [0, 1] as i (i)}
          {@const g = row.adopted[face][i] ?? { count: 0, dia: row.adopted[face][0]?.dia ?? 16 }}
          <label>
            <span>{t(i === 0 ? 'rcSheets.ed.layer1' : 'rcSheets.ed.layer2')}</span>
            <input type="number" min="0" max="20" step="1" value={g.count} aria-label={t('rcSheets.ed.count')} onchange={(e) => beamGroup(face, i, { count: num(e) })} />
            <select value={g.dia} aria-label={t('rcSheets.ed.dia')} onchange={(e) => beamGroup(face, i, { dia: num(e) })}>
              {#each LONG as d (d)}<option value={d}>Ø{d}</option>{/each}
            </select>
          </label>
        {/each}
      </fieldset>
    {/each}
    <fieldset>
      <legend>{t('rcSheets.col.stirrups')}</legend>
      <label>
        <select value={row.adopted.stirrups.dia} aria-label={t('rcSheets.ed.dia')} onchange={(e) => beamPatch({ stirrups: { ...row.adopted.stirrups, dia: num(e) } })}>
          {#each SMALL as d (d)}<option value={d}>Ø{d}</option>{/each}
        </select>
        <span>{t('rcSheets.ed.legs')}</span>
        <input type="number" min="2" max="8" step="2" value={row.adopted.stirrups.legs} onchange={(e) => beamPatch({ stirrups: { ...row.adopted.stirrups, legs: num(e) } })} />
        <span>c/</span>
        <input type="number" min="5" max="40" step="2.5" value={Math.round(row.adopted.stirrups.spacing * 1000) / 10} aria-label={t('rcSheets.ed.spacing')} onchange={(e) => beamPatch({ stirrups: { ...row.adopted.stirrups, spacing: num(e) / 100 } })} />
        <span>cm</span>
      </label>
    </fieldset>
    <fieldset>
      <legend>{t('rcSheets.col.torsionLong')}</legend>
      <label>
        <input type="number" min="0" max="12" step="2" value={row.adopted.torsionLong?.count ?? 0} aria-label={t('rcSheets.ed.count')} onchange={(e) => beamPatch({ torsionLong: { dia: row.adopted.torsionLong?.dia ?? 10, count: num(e) } })} />
        <select value={row.adopted.torsionLong?.dia ?? 10} aria-label={t('rcSheets.ed.dia')} onchange={(e) => beamPatch({ torsionLong: { count: row.adopted.torsionLong?.count ?? 4, dia: num(e) } })}>
          {#each LONG as d (d)}<option value={d}>Ø{d}</option>{/each}
        </select>
      </label>
    </fieldset>
  {:else if row.family === 'column'}
    <fieldset>
      <legend>{t('rcSheets.col.bars')}</legend>
      <label><span>{t('rcSheets.ed.corner')}</span>
        <select value={row.adopted.corner} onchange={(e) => columnPatch({ corner: num(e) })}>{#each LONG.filter((d) => d >= 12) as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
      </label>
      <label><span>{t('rcSheets.ed.faceB')}</span>
        <input type="number" min="0" max="12" step="1" value={row.adopted.nx} onchange={(e) => columnPatch({ nx: num(e) })} />
        <select value={row.adopted.dx} onchange={(e) => columnPatch({ dx: num(e) })}>{#each LONG.filter((d) => d >= 12) as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
      </label>
      <label><span>{t('rcSheets.ed.faceH')}</span>
        <input type="number" min="0" max="12" step="1" value={row.adopted.ny} onchange={(e) => columnPatch({ ny: num(e) })} />
        <select value={row.adopted.dy} onchange={(e) => columnPatch({ dy: num(e) })}>{#each LONG.filter((d) => d >= 12) as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
      </label>
    </fieldset>
    <fieldset>
      <legend>{t('rcSheets.col.ties')}</legend>
      <label>
        <select value={row.adopted.tieDia} onchange={(e) => columnPatch({ tieDia: num(e) })}>{#each SMALL as d (d)}<option value={d}>Ø{d}</option>{/each}</select>
        <span>c/</span>
        <input type="number" min="5" max="40" step="2.5" value={Math.round(row.adopted.tieSpacing * 1000) / 10} onchange={(e) => columnPatch({ tieSpacing: num(e) / 100 })} />
        <span>cm</span>
      </label>
    </fieldset>
  {:else if row.family === 'wall'}
    {#each ['vertical', 'horizontal'] as const as k (k)}
      <fieldset>
        <legend>{t(k === 'vertical' ? 'rcSheets.ed.vertical' : 'rcSheets.ed.horizontal')}</legend>
        <label>
          <select value={row.adopted[k].diameter} aria-label={t('rcSheets.ed.dia')} onchange={(e) => wallPatch({ [k]: { ...row.adopted[k], diameter: num(e) } })}>
            {#each MESH as d (d)}<option value={d}>Ø{d}</option>{/each}
          </select>
          <span>c/</span>
          <input type="number" min="5" max="45" step="2.5" value={Math.round(row.adopted[k].spacing * 1000) / 10} aria-label={t('rcSheets.ed.spacing')} onchange={(e) => wallPatch({ [k]: { ...row.adopted[k], spacing: num(e) / 100 } })} />
          <span>cm</span>
        </label>
      </fieldset>
    {/each}
    <fieldset>
      <legend>{t('rcSheets.ed.curtains')}</legend>
      <label>
        <select value={row.adopted.curtains} onchange={(e) => wallPatch({ curtains: num(e) === 1 ? 1 : 2 })}>
          <option value={1}>1</option><option value={2}>2</option>
        </select>
      </label>
    </fieldset>
    <fieldset>
      <legend>{t('rcSheets.ed.boundary')}</legend>
      <label>
        <input type="number" min="0" max="24" step="2" value={row.adopted.boundary?.count ?? 0} aria-label={t('rcSheets.ed.count')} onchange={(e) => wallPatch({ boundary: { diameter: row.adopted.boundary?.diameter ?? 16, count: num(e) } })} />
        <select value={row.adopted.boundary?.diameter ?? 16} aria-label={t('rcSheets.ed.dia')} onchange={(e) => wallPatch({ boundary: { count: row.adopted.boundary?.count ?? 4, diameter: num(e) } })}>
          {#each LONG.filter((d) => d >= 12) as d (d)}<option value={d}>Ø{d}</option>{/each}
        </select>
      </label>
    </fieldset>
  {:else}
    {#each SLAB_FACES as f (f)}
      <fieldset>
        <legend>{t(`rcSheets.face.${f}`)}</legend>
        <label>
          <select value={row.adopted[f].dia} onchange={(e) => meshPatch(f, { dia: num(e) })}>
            <option value={0}>—</option>
            {#each MESH as d (d)}<option value={d}>Ø{d}</option>{/each}
          </select>
          <span>c/</span>
          <input type="number" min="5" max="40" step="2.5" value={Math.round(row.adopted[f].spacing * 1000) / 10} onchange={(e) => meshPatch(f, { spacing: num(e) / 100 })} />
          <span>cm</span>
        </label>
      </fieldset>
    {/each}
  {/if}
  <div class="rce-actions">
    {#if row.isAdopted}
      <button type="button" class="rcs-btn" onclick={() => setAdopted(row.key, null)}>{t('rcSheets.useProposal')}</button>
    {:else}
      <span class="hint">{t('rcSheets.showingProposal')}</span>
      <button type="button" class="rcs-btn" onclick={() => setAdopted(row.key, row.proposed)}>{t('rcSheets.adoptProposal')}</button>
    {/if}
  </div>
</div>

<style>
  .rce { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
  fieldset { border: 1px solid var(--st-hair); border-radius: 6px; padding: 4px 8px 6px; margin: 0; display: flex; flex-direction: column; gap: 4px; }
  legend { font-size: 0.66rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--st-text-2); padding: 0 4px; }
  label { display: flex; align-items: center; gap: 4px; font-size: 0.72rem; color: var(--st-text); }
  label span { color: var(--st-text-2); }
  input[type='number'] { width: 4.2em; }
  input, select { font-size: 0.72rem; background: var(--st-surface); color: var(--st-text); border: 1px solid var(--st-hair); border-radius: 4px; padding: 1px 3px; }
  .rce-actions { display: flex; align-items: center; gap: 8px; align-self: center; }
  .hint { font-size: 0.7rem; color: var(--st-text-3); }
  .rcs-btn { font-size: 0.72rem; border: 1px solid var(--st-hair); background: var(--st-surface-2); color: var(--st-text); border-radius: 4px; padding: 3px 8px; cursor: pointer; }
</style>
