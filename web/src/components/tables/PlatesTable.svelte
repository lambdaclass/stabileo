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
  import { modelStore, resultsStore, historyStore } from '../../lib/store';
  import { t } from '../../lib/i18n';

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

  function setThickness(row: Row, value: string) {
    const t2 = parseFloat(value);
    if (!Number.isFinite(t2) || t2 <= 0 || t2 === row.thickness) return;
    historyStore.pushState();
    const target = row.kind === 'plate' ? modelStore.plates.get(row.id) : modelStore.quads.get(row.id);
    if (target) target.thickness = t2;
    /* A thickness is a stiffness: what was solved no longer describes this. */
    resultsStore.clear();
  }

  function setMaterial(row: Row, value: string) {
    const id = parseInt(value, 10);
    if (!Number.isFinite(id) || id === row.materialId) return;
    historyStore.pushState();
    const target = row.kind === 'plate' ? modelStore.plates.get(row.id) : modelStore.quads.get(row.id);
    if (target) target.materialId = id;
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
        <th>{t('pro.thickness')} (m)</th>
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
          <td class="nodes-cell">{row.nodes.join(' · ')}</td>
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
