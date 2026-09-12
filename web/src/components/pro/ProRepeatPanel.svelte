<script lang="ts">
  /**
   * Repeat the selection: the storey tool.
   *
   * The clipboard already pastes one copy at a fixed offset, which is right
   * for "another one of these". Six identical storeys are a count and a
   * spacing, and doing them by hand means pasting six times and dragging
   * each result into place — accumulating a placement error every step.
   *
   * `lib/model/array-copy.ts` holds the rules and the reasoning, including
   * why the members BETWEEN copies have to be created rather than copied.
   */
  import { modelStore, uiStore, historyStore, resultsStore } from '../../lib/store';
  import { t } from '../../lib/i18n';
  import { repeatSelection, repeatIsMeaningful, type RepeatSpec } from '../../lib/model/array-copy';

  let count = $state(1);
  let dx = $state(0);
  let dy = $state(0);
  let dz = $state(3);
  let link = $state(true);
  let withSupports = $state(false);
  let done = $state<string | null>(null);

  /** Nodes explicitly selected, plus the ends of every selected member. */
  const nodeIds = $derived.by(() => {
    const ids = new Set<number>(uiStore.selectedNodes);
    for (const elemId of uiStore.selectedElements) {
      const e = modelStore.elements.get(elemId);
      if (e) { ids.add(e.nodeI); ids.add(e.nodeJ); }
    }
    return ids;
  });

  const spec = $derived<RepeatSpec>({ count, dx, dy, dz, link, withSupports });
  const canRun = $derived(nodeIds.size > 0 && repeatIsMeaningful(spec));

  function run() {
    if (!canRun) return;
    const ids = nodeIds;

    const src = {
      nodes: [...ids].map((id) => {
        const n = modelStore.getNode(id)!;
        return { id: n.id, x: n.x, y: n.y, z: n.z ?? 0 };
      }),
      /*
       * Every member with BOTH ends in the selection. One end inside is a
       * member leaving the thing being repeated, and copying it would attach
       * the copy to the original node — a beam from the sixth floor to the
       * ground.
       */
      elements: [...modelStore.elements.values()]
        .filter((e) => ids.has(e.nodeI) && ids.has(e.nodeJ))
        .map((e) => ({
          id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ, type: e.type,
          materialId: e.materialId, sectionId: e.sectionId,
        })),
      supports: [...modelStore.supports.values()]
        .filter((s) => ids.has(s.nodeId))
        .map((s) => ({ nodeId: s.nodeId, type: String(s.type) })),
    };

    historyStore.pushState();
    let out = { nodes: [] as number[], elements: [] as number[], links: [] as number[] };
    modelStore.batch(() => {
      out = repeatSelection(src, spec, {
        addNode: (x, y, z) => modelStore.addNode(x, y, z),
        addElement: (i, j, type) => modelStore.addElement(i, j, type),
        setElementMaterial: (id, m) => modelStore.updateElementMaterial(id, m),
        setElementSection: (id, sec) => modelStore.updateElementSection(id, sec),
        addSupport: (n, type) => modelStore.addSupport(n, type as never),
      });
    });

    /* The analysis described a smaller structure. */
    resultsStore.clear();

    done = t('repeat.done')
      .replace('{n}', String(out.nodes.length))
      .replace('{e}', String(out.elements.length + out.links.length));
  }
</script>

<div class="rp" data-testid="pro-repeat">
  <p class="rp-lead">{t('repeat.lead')}</p>

  <p class="rp-sel" data-testid="rp-selection">
    {#if nodeIds.size === 0}
      {t('repeat.nothingSelected')}
    {:else}
      {t('repeat.selected').replace('{n}', String(nodeIds.size))}
    {/if}
  </p>

  <label class="rp-field">
    <span>{t('repeat.count')}</span>
    <input type="number" min="1" max="200" step="1" bind:value={count} data-testid="rp-count" />
  </label>

  <div class="rp-offset">
    <span class="rp-label">{t('repeat.offset')}</span>
    <div class="rp-row">
      <label><span>X</span><input type="number" step="0.1" bind:value={dx} data-testid="rp-dx" /></label>
      <label><span>Y</span><input type="number" step="0.1" bind:value={dy} data-testid="rp-dy" /></label>
      <label><span>Z</span><input type="number" step="0.1" bind:value={dz} data-testid="rp-dz" /></label>
    </div>
  </div>

  <label class="rp-check">
    <input type="checkbox" bind:checked={link} data-testid="rp-link" />
    <span>
      <strong>{t('repeat.link')}</strong>
      <em>{t('repeat.linkWhat')}</em>
    </span>
  </label>

  <label class="rp-check">
    <input type="checkbox" bind:checked={withSupports} data-testid="rp-supports" />
    <span><strong>{t('repeat.withSupports')}</strong></span>
  </label>

  <button class="rp-go" disabled={!canRun} onclick={run} data-testid="rp-run">
    {t('repeat.run')}
  </button>

  {#if done}
    <p class="rp-done" data-testid="rp-done">{done}</p>
  {/if}

  <!--
    Said rather than silently done: two nodes in the same place analyse as two
    nodes, and merging them is a decision about everything attached to them.
  -->
  <p class="rp-note">{t('repeat.noWeldNote')}</p>
</div>

<style>
  .rp {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    font-size: 0.72rem;
  }

  .rp-lead { margin: 0; color: var(--st-text-2); }

  .rp-sel {
    margin: 0;
    padding: 0.3rem 0.45rem;
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text-2);
  }

  .rp-field, .rp-row label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .rp-field span, .rp-row span { color: var(--st-text-2); }
  .rp-field { justify-content: space-between; }

  .rp-label {
    display: block;
    margin-bottom: 0.2rem;
    font-family: var(--st-mono);
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--st-text-3);
  }

  .rp-row { display: flex; gap: 0.35rem; }
  .rp-row label { flex: 1; }

  input[type='number'] {
    width: 100%;
    min-width: 0;
    padding: 0.22rem 0.3rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 3px;
    background: var(--st-surface-2);
    color: var(--st-text);
    font: inherit;
    font-size: 0.72rem;
  }

  input[type='number']:focus { outline: none; border-color: var(--st-accent); }

  .rp-check {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    cursor: pointer;
  }

  .rp-check strong { display: block; color: var(--st-text); font-weight: 600; }
  .rp-check em { display: block; font-style: normal; color: var(--st-text-3); line-height: 1.4; }

  .rp-go {
    margin-top: 0.2rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--st-accent);
    border-radius: var(--st-radius);
    background: var(--st-selected-bg);
    color: var(--st-accent);
    font: inherit;
    font-size: 0.74rem;
    cursor: pointer;
  }

  .rp-go:disabled {
    border-color: var(--st-hair);
    background: none;
    color: var(--st-text-3);
    cursor: not-allowed;
  }

  .rp-done { margin: 0; color: var(--st-accent); }

  .rp-note {
    margin: 0;
    font-size: 0.62rem;
    line-height: 1.45;
    color: var(--st-text-3);
  }
</style>
