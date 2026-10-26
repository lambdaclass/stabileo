<script lang="ts">
  /**
   * Background drawings: a DXF plan laid at a level, to model over. Its layers are chosen, its
   * unit confirmed, and it is shifted and turned onto the grid. New nodes capture its segments'
   * ends while the axes snap is on (`model/underlay.ts`). Saved with the project; touches no result.
   */
  import { modelStore } from '../../../lib/store';
  import { t, tp } from '../../../lib/i18n';
  import { parseCadDxf, unsupportedFileKind, suggestUnitFromExtent, cadImportProblem } from '../../../lib/cad/parse';
  import type { CadDocument, CadUnit } from '../../../lib/cad/types';
  import { cadSegments, underlayExtent, type Underlay } from '../../../lib/model/underlay';
  import { sortedLevels } from '../../../lib/model/grid';

  const levels = $derived(sortedLevels(modelStore.grid));
  const list = $derived(modelStore.underlays);

  let doc = $state<CadDocument | null>(null);
  let fileName = $state('');
  let error = $state<string | null>(null);
  let unit = $state<CadUnit>('m');
  let chosen = $state<string[]>([]);
  let levelId = $state('');
  let note = $state<string | null>(null);

  $effect(() => { if (!levels.some((l) => l.id === levelId)) levelId = levels[0]?.id ?? ''; });

  async function read(f: File) {
    error = null; note = null; doc = null; fileName = f.name;
    const kind = unsupportedFileKind(f.name);
    if (kind) { error = t(`cad.unsupported.${kind}`); return; }
    const d = parseCadDxf(await f.text(), f.name);
    const problem = cadImportProblem(d);
    if (problem) { error = t(problem === 'emptyFile' ? 'cad.emptyFile' : 'cad.parseError'); return; }
    doc = d;
    unit = d.suggestedUnit ?? 'm';
    const sug = suggestUnitFromExtent(d.bbox, unit);
    if (sug) unit = sug.suggested;
    chosen = d.layers.filter((l) => !l.hidden && l.total > 0).map((l) => l.name);
  }

  function lay() {
    if (!doc) return;
    const { segments, truncated } = cadSegments(doc, unit, new Set(chosen));
    if (segments.length === 0) { error = t('underlay.empty'); return; }
    const lv = levels.find((l) => l.id === levelId);
    const u: Underlay = {
      id: `ul-${Date.now().toString(36)}`, name: fileName.replace(/\.dxf$/i, '') || 'DXF',
      ...(lv ? { levelId: lv.id } : {}), z: lv?.z ?? 0,
      segments, dx: 0, dy: 0, rotationDeg: 0, visible: true, layers: [...chosen],
    };
    modelStore.setUnderlays([...list, u]);
    note = truncated ? t('underlay.truncated') : tp('underlay.laid', { n: segments.length / 4 });
    doc = null;
  }

  const edit = (id: string, patch: Partial<Underlay>) =>
    modelStore.setUnderlays(list.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  /** The drawing's lower-left corner onto the grid's origin. */
  function toOrigin(u: Underlay) {
    const e = underlayExtent(u.segments);
    if (e) edit(u.id, { dx: -e.minX, dy: -e.minY, rotationDeg: 0 });
  }
  function atLevel(u: Underlay, id: string) {
    const lv = levels.find((l) => l.id === id);
    if (lv) edit(u.id, { levelId: lv.id, z: lv.z });
  }
</script>

<section class="pk-card" data-testid="underlay-card">
  <h4 class="pk-heading">{t('underlay.title')}</h4>
  <p class="pk-hint">{t('underlay.hint')}</p>
  <label class="pk-btn ul-file">
    {t('underlay.load')}
    <input type="file" accept=".dxf,.dwg" onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void read(f); e.currentTarget.value = ''; }} data-testid="underlay-file" />
  </label>
  {#if error}<p class="pk-hint ul-warn" role="alert">{error}</p>{/if}
  {#if note}<p class="pk-hint" role="status" data-testid="underlay-note">{note}</p>{/if}

  {#if doc}
    <div class="ul-setup" data-testid="underlay-setup">
      <div class="pk-row">
        <label class="ul-inline">{t('underlay.unit')}
          <select bind:value={unit} data-testid="underlay-unit"><option value="m">m</option><option value="cm">cm</option><option value="mm">mm</option></select>
        </label>
        <label class="ul-inline">{t('underlay.level')}
          <select bind:value={levelId} data-testid="underlay-level">
            {#if levels.length === 0}<option value="">z = 0</option>{/if}
            {#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
          </select>
        </label>
      </div>
      <div class="ul-layers" role="group" aria-label={t('underlay.layers')}>
        {#each doc.layers.filter((l) => l.total > 0) as l (l.name)}
          <label class:off={!!l.hidden}>
            <input type="checkbox" checked={chosen.includes(l.name)} onchange={() => (chosen = chosen.includes(l.name) ? chosen.filter((x) => x !== l.name) : [...chosen, l.name])} />
            {l.name} <span class="ul-n">({l.total})</span>
          </label>
        {/each}
      </div>
      <button class="pk-btn pk-btn-primary" disabled={chosen.length === 0} onclick={lay} data-testid="underlay-lay">{t('underlay.lay')}</button>
    </div>
  {/if}

  {#if list.length > 0}
    <table class="ul-table" data-testid="underlay-list">
      <thead><tr><th></th><th>{t('underlay.name')}</th><th>{t('underlay.level')}</th><th>dx</th><th>dy</th><th>°</th><th></th></tr></thead>
      <tbody>
        {#each list as u (u.id)}
          <tr data-testid="underlay-row-{u.name}">
            <td><input type="checkbox" checked={u.visible} onchange={() => edit(u.id, { visible: !u.visible })} aria-label={t('underlay.visible')} /></td>
            <td>{u.name}</td>
            <td>
              <select value={u.levelId ?? ''} onchange={(e) => atLevel(u, e.currentTarget.value)}>
                {#if !u.levelId}<option value="">z = {u.z}</option>{/if}
                {#each levels as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
              </select>
            </td>
            <td><input class="ul-num" type="number" step="0.1" value={u.dx} onchange={(e) => edit(u.id, { dx: Number(e.currentTarget.value) || 0 })} /></td>
            <td><input class="ul-num" type="number" step="0.1" value={u.dy} onchange={(e) => edit(u.id, { dy: Number(e.currentTarget.value) || 0 })} /></td>
            <td><input class="ul-num" type="number" step="1" value={u.rotationDeg} onchange={(e) => edit(u.id, { rotationDeg: Number(e.currentTarget.value) || 0 })} /></td>
            <td class="ul-act">
              <button class="pk-btn" title={t('underlay.toOrigin')} onclick={() => toOrigin(u)}>⌖</button>
              <button class="pk-btn" title={t('grid.remove')} onclick={() => modelStore.setUnderlays(list.filter((x) => x.id !== u.id))}>×</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .ul-file { position: relative; display: inline-flex; cursor: pointer; }
  .ul-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .ul-warn { color: var(--st-warn); }
  .ul-setup { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .ul-inline { display: flex; align-items: center; gap: 4px; font-size: 0.66rem; color: var(--st-text-2); }
  .ul-layers { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 0.66rem; max-height: 9rem; overflow: auto; }
  .ul-layers .off { opacity: 0.6; }
  .ul-n { color: var(--st-text-3); }
  .ul-table { width: 100%; border-collapse: collapse; font-size: 0.66rem; margin-top: 6px; }
  .ul-table th { text-align: left; font-weight: 500; color: var(--st-text-3); padding: 1px 3px; }
  .ul-table td { padding: 1px 3px; }
  .ul-num { width: 3.6rem; font-size: 0.66rem; }
  .ul-act { white-space: nowrap; }
</style>
