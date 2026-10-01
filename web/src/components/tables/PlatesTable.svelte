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

{#if rows.length > 0}
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>{t('pro.thKind')}</th>
        <th>{t('pro.nodes')}</th>
        <th>{t('pro.thMaterial')}</th>
        <th>{t('pro.thickness')}</th>
        <th title={t('pro.shellCurvatureHint')}>≈</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.key)}
        <tr>
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
            <select value={row.materialId} onchange={(e) => setMaterial(row, e.currentTarget.value)}>
              {#each materials as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
            </select>
          </td>
          <td>
            <input type="number" step="0.01" min="0.001" value={row.thickness}
                   onchange={(e) => setThickness(row, e.currentTarget.value)} />
          </td>
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

  input, select {
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
