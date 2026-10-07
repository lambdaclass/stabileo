<script lang="ts">
  /**
   * Plates and quads in one table.
   *
   * Two shapes, one list, because a reader reading a model wants to see its
   * SHELLS — not "the triangles" and separately "the quadrilaterals". Which it
   * is shows in the corner count, where it is a fact about the row rather than
   * a choice the reader had to make up front.
   *
   * The id space is shared with nothing: plate 1 and quad 1 both exist, which
   * is why the model keys shells `p1` / `q1` everywhere a selection is carried.
   */
  import { modelStore, resultsStore, historyStore, uiStore } from '../../lib/store';
  import { t, tp } from '../../lib/i18n';
  import { parseIdList } from '../../lib/model/select-ops';
  import { shellSpecifications } from '../../lib/pro/specification-list';
  import BatchEditBar from '../pro/BatchEditBar.svelte';
  import { tick } from 'svelte';
  import LazySelect from './LazySelect.svelte';
  import { progressiveRows } from '../../lib/utils/progressive-rows.svelte';

  type Row = {
    key: string;
    kind: 'plate' | 'quad';
    id: number;
    nodes: readonly number[];
    materialId: number;
    thickness: number;
    curved: boolean;
  };

  const rows = $derived<Row[]>([
    ...[...modelStore.plates.values()].map((p) => ({
      key: `p${p.id}`, kind: 'plate' as const, id: p.id, nodes: p.nodes,
      materialId: p.materialId, thickness: p.thickness, curved: false,
    })),
    ...[...modelStore.quads.values()].map((q) => ({
      key: `q${q.id}`, kind: 'quad' as const, id: q.id, nodes: q.nodes,
      materialId: q.materialId, thickness: q.thickness,
      curved: !!(q as { curved?: boolean }).curved,
    })),
  ]);

  const materials = $derived([...modelStore.materials.values()]);

  /*
   * Through the store, which takes the undo step and reassigns the map. These wrote onto the
   * object, so the change reached the solve but not the screen, nor anything keyed on the model
   * version.
   */
  function update(row: Row, patch: { materialId?: number; thickness?: number }) {
    if (row.kind === 'plate') modelStore.updatePlate(row.id, patch);
    else modelStore.updateQuad(row.id, patch);
    /* A thickness or a material is a stiffness: what was solved no longer describes this. */
    resultsStore.clear();
  }

  function setThickness(row: Row, value: string) {
    const t2 = parseFloat(value);
    if (!Number.isFinite(t2) || t2 <= 0 || t2 === row.thickness) return;
    update(row, { thickness: t2 });
  }

  function setMaterial(row: Row, value: string) {
    const id = parseInt(value, 10);
    if (!Number.isFinite(id) || id === row.materialId) return;
    update(row, { materialId: id });
  }

  /*
   * The corners, editable in PRO as a member's nodes are: three or four existing, distinct
   * nodes, in the order that sets the local axes.
   */
  const editNodes = $derived(uiStore.analysisMode === 'pro');
  /*
   * In PRO the table is a view of the model's selection, as the members table is: a row click
   * selects that shell (Shift, Ctrl or Cmd adds or removes it), every selected shell's row is lit,
   * several selected get group editing above the table, and the last column says what each shell
   * is told beyond the default, opening Specifications › Surfaces on it. Basic keeps its table.
   */
  const pro = $derived(uiStore.analysisMode === 'pro');
  const selectedKeys = $derived([...uiStore.selectedShells].filter((k) => rows.some((r) => r.key === k)));
  function rowClick(row: Row, e: MouseEvent) {
    if (!pro) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
    uiStore.selectMode = 'shells';
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    if (!add) { uiStore.selectShell(row.key, false); return; }
    const next = new Set(uiStore.selectedShells);
    if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
    uiStore.setSelection(new Set(), new Set(), true, next);
  }
  /*
   * Rows drawn in batches (`progressive-rows.svelte.ts`): a meshed floor is thousands of faces.
   * The first selected shell is drawn and scrolled into view, wherever it was selected.
   */
  const batches = progressiveRows(() => rows, 30, 60);
  $effect(() => {
    if (!pro) return;
    const first = selectedKeys[0];
    if (!first) return;
    const at = rows.findIndex((r) => r.key === first);
    if (at >= 0) batches.reach(at);
    void tick().then(() => document.querySelector(`tr[data-shell="${first}"]`)?.scrollIntoView({ block: 'nearest' }));
  });
  const specsOf = (row: Row) => {
    const sh = row.kind === 'plate' ? modelStore.plates.get(row.id) : modelStore.quads.get(row.id);
    return sh ? shellSpecifications(sh as never, t) : [];
  };
  function openSpec(row: Row) {
    uiStore.selectMode = 'shells';
    if (!uiStore.selectedShells.has(row.key)) uiStore.selectShell(row.key, false);
    uiStore.specSection = 'surfaces';
    uiStore.proActiveTab = 'specifications';
  }
  const sameOf = (f: (r: Row) => number) => {
    const v = selectedKeys.map((k) => f(rows.find((r) => r.key === k)!));
    return v.length && v.every((x) => x === v[0]) ? String(v[0]) : '';
  };
  function batchUpdate(patch: { materialId?: number; thickness?: number }) {
    if (patch.thickness !== undefined && !(patch.thickness > 0)) return;
    modelStore.batch(() => {
      for (const k of selectedKeys) {
        const id = Number(k.slice(1));
        if (k[0] === 'p') modelStore.updatePlate(id, patch); else modelStore.updateQuad(id, patch);
      }
    });
    resultsStore.clear();
  }
  let nodesError = $state<{ key: string; msg: string } | null>(null);
  function setNodes(row: Row, value: string, input: HTMLInputElement) {
    const want = row.kind === 'plate' ? 3 : 4;
    const { ids, bad } = parseIdList(value);
    if (bad.length > 0 || ids.length !== want || new Set(ids).size !== want || ids.some((id) => !modelStore.nodes.has(id))) {
      nodesError = { key: row.key, msg: tp('quickEdit.nodesInvalid', { n: want }) };
      input.value = row.nodes.join(', ');
      return;
    }
    nodesError = null;
    if (ids.every((id, i) => id === row.nodes[i])) return;
    if (row.kind === 'plate') modelStore.updatePlateNodes(row.id, ids as [number, number, number]);
    else modelStore.updateQuadNodes(row.id, ids as [number, number, number, number]);
    resultsStore.clear();
  }

  /*
   * Curvature, editable where it is shown.
   *
   * The row already printed `≈` for a curved quad, and there was no way to put
   * it there or take it away: the flag was settable only while CREATING one.
   * Material and thickness are edited in this table; curvature is the same
   * kind of fact about the same row, and it changes the element the solver
   * builds — a flat MITC4 becomes a degenerated continuum — so what was solved
   * no longer describes the model, exactly as a thickness change does.
   */
  function setCurved(row: Row, on: boolean) {
    if (row.kind !== 'quad') return;
    historyStore.pushState();
    modelStore.setQuadCurved(row.id, on);
    resultsStore.clear();
  }

  function remove(row: Row) {
    historyStore.pushState();
    if (row.kind === 'plate') modelStore.removePlate(row.id);
    else modelStore.removeQuad(row.id);
    resultsStore.clear();
  }
</script>

{#if pro && selectedKeys.length > 1}
  <BatchEditBar count={selectedKeys.length} labelKey="batch.shells" testid="shells-batch">
    <label>{t('pro.thMaterial')}
      <select value={sameOf((r) => r.materialId)} onchange={(e) => batchUpdate({ materialId: Number(e.currentTarget.value) })} data-testid="batch-shell-material">
        {#if sameOf((r) => r.materialId) === ''}<option value="" disabled>{t('behaviour.mixed')}</option>{/if}
        {#each materials as m (m.id)}<option value={String(m.id)}>{m.name}</option>{/each}
      </select>
    </label>
    <label>{t('pro.thickness')}
      <input type="number" step="0.01" min="0.001" value={sameOf((r) => r.thickness)} placeholder={t('behaviour.mixed')}
        onchange={(e) => batchUpdate({ thickness: parseFloat(e.currentTarget.value) })} data-testid="batch-shell-thickness" />
    </label>
    <button class="pk-btn" onclick={() => { uiStore.specSection = 'surfaces'; uiStore.proActiveTab = 'specifications'; }} data-testid="batch-shell-spec">{t('pro.thSpec')}…</button>
  </BatchEditBar>
{/if}
{#if rows.length > 0}
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>{t('pro.thKind')}</th>
        <th>{t('pro.nodes')}</th>
        <th>{t('pro.thMaterial')}</th>
        <th>{t('pro.thickness')}</th>
        {#if pro}<th title={t('pro.thSpecHint')}>{t('pro.thSpec')}</th>{:else}<th title={t('pro.shellCurvatureHint')}>≈</th>{/if}
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each batches.rows as row (row.key)}
        <tr class:selected={pro && uiStore.selectedShells.has(row.key)} class:pickable={pro} onmousedown={(e) => { if (pro && (e.shiftKey || e.metaKey || e.ctrlKey) && !(e.target instanceof HTMLInputElement)) e.preventDefault(); }} onclick={(e) => rowClick(row, e)} data-shell={row.key}>
          <td class="id-cell">{row.id}</td>
          <td class="kind-cell">
            {row.nodes.length}
            {#if row.curved}<span class="curved-tag" title={t('pro.curvedShell')}>≈</span>{/if}
          </td>
          <td class="nodes-cell">
            {#if editNodes}
              <input type="text" class="nodes-input" value={row.nodes.join(', ')}
                onchange={(e) => setNodes(row, e.currentTarget.value, e.currentTarget)}
                title={nodesError?.key === row.key ? nodesError.msg : ''}
                class:bad={nodesError?.key === row.key} data-testid="plate-nodes-{row.key}" />
            {:else}{row.nodes.join(' · ')}{/if}
          </td>
          <td>
            <LazySelect value={row.materialId} label={materials.find((m) => m.id === row.materialId)?.name ?? String(row.materialId)}
              options={() => materials.map((m) => ({ value: m.id, label: m.name }))} onchange={(v) => setMaterial(row, v)} />
          </td>
          <td>
            <input type="number" step="0.01" min="0.001" value={row.thickness}
                   onchange={(e) => setThickness(row, e.currentTarget.value)} />
          </td>
          {#if pro}
            {@const specs = specsOf(row)}
            <td class="spec-cell">
              <button class="spec-btn" class:set={specs.length > 0} title={specs.length ? specs.map((x) => `${x.what}: ${x.value}`).join('\n') : t('pro.specOpen')}
                onclick={() => openSpec(row)} data-testid="shell-spec-{row.key}">{specs.length ? specs.map((x) => x.what).join(' · ') : '—'}</button>
            </td>
          {:else}
          <td class="curv-cell">
            {#if row.kind === 'quad'}
              <input
                type="checkbox"
                checked={row.curved}
                title={t('pro.curvedShell')}
                aria-label={t('pro.curvedShell')}
                onchange={(e) => setCurved(row, e.currentTarget.checked)}
                data-testid="plate-curved-{row.id}"
              />
            {/if}
          </td>
          {/if}
          <td><button class="del" onclick={() => remove(row)}>&#10005;</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if nodesError}<p class="nodes-err" role="alert" data-testid="plate-nodes-error">{nodesError.msg}</p>{/if}
{:else}
  <p class="empty">{t('pro.noShells')}</p>
{/if}

<style>
  table { width: max-content; min-width: 100%; border-collapse: collapse; }

  th {
    text-align: left; padding: 0.25rem 0.35rem;
    color: var(--st-text-3); font-weight: 500; font-size: 0.65rem;
    text-transform: uppercase; letter-spacing: 0.03em;
    border-bottom: 1px solid var(--st-surface-3);
    position: sticky; top: 0; background: var(--st-surface-2); white-space: nowrap;
  }

  td {
    padding: 0.2rem 0.35rem; border-bottom: 1px solid var(--st-bg);
    color: var(--st-text-2); white-space: nowrap;
  }

  .id-cell { color: var(--st-value); font-weight: 600; }
  tr.pickable { cursor: pointer; }
  tr.pickable:hover td { background: var(--st-surface-3); }
  tr.selected td { background: var(--st-selected-bg); }
  tr.selected td:first-child { box-shadow: inset 3px 0 0 var(--st-selected, var(--st-accent)); }
  .spec-cell { max-width: 9rem; }
  .spec-btn {
    max-width: 100%; padding: 2px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    background: none; border: 1px solid transparent; border-radius: var(--st-radius);
    color: var(--st-text-3); font-size: 0.68rem; cursor: pointer; text-align: left;
  }
  .spec-btn.set { color: var(--st-warn); border-color: var(--st-hair-strong); }
  .spec-btn:hover { color: var(--st-text); border-color: var(--st-accent); }
  .kind-cell { color: var(--st-text-3); }
  .nodes-cell { font-variant-numeric: tabular-nums; }
  .nodes-cell .nodes-input { width: 9rem; font-family: var(--st-mono); }
  .nodes-cell .nodes-input.bad { border-color: var(--st-danger); }
  .nodes-err { margin: 4px 8px; font-size: 0.66rem; color: var(--st-danger); }
  /* A curved quad is solved as a degenerated continuum, not a flat MITC4 —
     worth one character in the row that says so. */
  .curved-tag { color: var(--st-accent); margin-left: 3px; }
  /* The checkbox is the control; the cell is narrow because the column header
     is one character. A triangle leaves it empty — it cannot be curved. */
  .curv-cell { text-align: center; }
  .curv-cell input { width: auto; }

  input, select, td :global(select) {
    width: 74px; background: var(--st-surface); color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 3px;
    padding: 1px 3px; font: inherit; font-size: 0.7rem;
  }

  .del {
    background: none; border: none; color: var(--st-text-3);
    cursor: pointer; font-size: 0.8rem; padding: 0 2px;
  }
  .del:hover { color: var(--st-danger); }

  .empty { padding: 0.6rem; color: var(--st-text-3); font-size: 0.72rem; }
</style>
