<script lang="ts">
  /**
   * What this project is about to document, and what it may not add to it.
   *
   * ── The question this answers on screen ────────────────────────────
   *
   * "Qué cubre este documento" had three answers and no way to compare them: the families the
   * design run was asked for (stamped on the exports), the assemblies the detailing happened to
   * draw (what the sheets show), and `ExportRecord.elements` (recorded and rendered nowhere).
   * This is the one place they are reconciled, and it sits ABOVE the export buttons because it is
   * a statement about what those buttons are about to produce.
   *
   * ── What it is not allowed to do ───────────────────────────────────
   *
   * It does not decide what is documentable. `resolveDocumentScope` does, against the design
   * scope, and it arrives here as a prop already resolved: a second resolution in a component is
   * how a panel comes to offer a box that the export then ignores.
   *
   * It does not offer a way to ADD a family. That is Diseñar's, and the refusal is stated rather
   * than hidden — a control here would be a second place to change the scope, and the two would
   * disagree the moment somebody used the quieter one. The families are shown as a READING.
   *
   * It holds no selection of its own. `documentScope` is the channel, the same way
   * `rebarWorkspace.selection` is the channel for the 3-D selection, and for the same reason.
   */
  import { t, tp } from '../../../lib/i18n';
  import { documentScope } from '../../../lib/store/document-scope.svelte';
  import { DESIGN_FAMILIES, type DesignFamily } from '../../../lib/engine/design/design-families';
  import type {
    RcDocumentableMember, RcDocumentScope,
  } from '../../../lib/flow/rc-document-scope';

  interface Props {
    /** Resolved once by the stage and passed down. See the header. */
    scope: RcDocumentScope;
    /** The drawing's members with their families, for the grouping. */
    members: readonly RcDocumentableMember[];
  }
  let { scope, members }: Props = $props();

  const familyWords = (fs: readonly DesignFamily[]) =>
    (fs.length === 0
      ? [t('detailing.doc.scopeNone')]
      : fs.map((f) => t(`detailing.convergence.family.${f}`))).join(', ');

  /** At most eight ids in a sentence; the count beside them is what stays complete. */
  const idList = (ids: readonly number[]) =>
    ids.length <= 8 ? ids.join(', ') : `${ids.slice(0, 8).join(', ')}…`;

  /**
   * The rows, grouped by family.
   *
   * A member is filed under the FIRST in-scope family it carries, in `DESIGN_FAMILIES` order.
   * A column standing on a footing carries two, and listing it twice would let one checkbox
   * contradict the other about the same element — one element, one row, one answer.
   */
  const groups = $derived.by(() => {
    const base = new Set(scope.base);
    const inScope = new Set(scope.designFamilies);
    const filed = new Map<DesignFamily | 'unclassified', number[]>();
    for (const m of members) {
      if (!base.has(m.elementId)) continue;
      const family = DESIGN_FAMILIES.find((f) => inScope.has(f) && m.families.includes(f));
      const key = family ?? 'unclassified';
      filed.set(key, [...(filed.get(key) ?? []), m.elementId]);
    }
    const order: Array<DesignFamily | 'unclassified'> = [...DESIGN_FAMILIES, 'unclassified'];
    return order
      .filter((k) => (filed.get(k)?.length ?? 0) > 0)
      .map((k) => ({
        key: k,
        label: k === 'unclassified'
          ? t('detailing.doc.select.unclassifiedGroup')
          : t(`detailing.convergence.family.${k}`),
        ids: (filed.get(k) ?? []).sort((a, b) => a - b),
      }));
  });

  const chosen = $derived(new Set(scope.elements));
</script>

<section class="doc-scope-picker" data-testid="doc-scope-picker"
         aria-labelledby="doc-scope-picker-title">
  <h4 id="doc-scope-picker-title">{t('detailing.doc.select.title')}</h4>

  <!--
    The base scope, as a reading of Diseñar, and the refusal to widen it — stated once, here,
    next to the boxes that can only narrow.
  -->
  <p class="base" data-testid="doc-scope-base">
    {tp('detailing.doc.select.base', { families: familyWords(scope.designFamilies) })}
    <span class="hint">{t('detailing.doc.select.baseHint')}</span>
  </p>

  <!-- What the next export covers, in the same words the file will carry. -->
  <p class="statement" data-testid="doc-scope-statement"
     data-whole={scope.whole ? 'true' : 'false'}>
    {#if scope.base.length === 0}
      {t('detailing.doc.select.noBase')}
    {:else if scope.elements.length === 0}
      {t('detailing.doc.select.emptySelection')}
    {:else if scope.whole}
      {tp('detailing.doc.select.whole', { n: scope.elements.length })}
    {:else}
      {tp('detailing.doc.select.statement', {
        n: scope.elements.length, total: scope.base.length, ids: idList(scope.elements),
      })}
    {/if}
  </p>

  {#if scope.excluded.length > 0}
    <!--
      Members of the drawing the design scope does not cover, with the remedy named.
      Not a fault and not hidden: the steel is on the sheets and the family is not in the claim.
    -->
    <p class="note warn" data-testid="doc-scope-excluded">
      {tp('detailing.doc.select.excluded', {
        n: scope.excluded.length,
        ids: idList(scope.excluded.map((e) => e.elementId)),
        families: familyWords([...new Set(scope.excluded.flatMap((e) => e.families))]),
      })}
    </p>
  {/if}

  {#if scope.unclassified.length > 0}
    <p class="note warn" data-testid="doc-scope-unclassified">
      {tp('detailing.doc.select.unclassified', {
        n: scope.unclassified.length, ids: idList(scope.unclassified),
      })}
    </p>
  {/if}

  {#if scope.refused.length > 0}
    <p class="note warn" data-testid="doc-scope-refused">
      {tp('detailing.doc.select.refused', {
        n: scope.refused.length, ids: idList(scope.refused),
      })}
    </p>
  {/if}

  {#if scope.base.length > 0}
    <div class="actions">
      <button type="button" data-testid="doc-scope-all"
              disabled={scope.whole && !documentScope.narrowed}
              onclick={() => documentScope.all()}>{t('detailing.doc.select.all')}</button>
      <button type="button" data-testid="doc-scope-none"
              disabled={scope.elements.length === 0}
              onclick={() => documentScope.none()}>{t('detailing.doc.select.none')}</button>
    </div>

    <details class="picker" data-testid="doc-scope-disclosure">
      <summary>{tp('detailing.doc.select.chooseCount', { n: scope.base.length })}</summary>
      {#each groups as g (g.key)}
        <fieldset data-testid={`doc-scope-group-${g.key}`}>
          <legend>{g.label} <span class="count">{g.ids.length}</span></legend>
          <div class="rows">
            {#each g.ids as id (id)}
              <label class="row">
                <input
                  type="checkbox"
                  data-testid={`doc-scope-member-${id}`}
                  checked={chosen.has(id)}
                  onchange={() => documentScope.toggle(id, scope.base)}
                />
                {tp('detailing.doc.select.member', { id })}
              </label>
            {/each}
          </div>
        </fieldset>
      {/each}
    </details>
  {/if}
</section>

<style>
  .doc-scope-picker {
    margin: 0.4rem 0;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--st-hair);
    border-radius: 4px;
    background: var(--st-surface-2, var(--st-surface));
  }
  h4 { margin: 0 0 0.2rem; font-size: 0.74rem; font-weight: 600; color: var(--st-text); }

  /*
    `--st-text-2` for every sentence here, never `--st-text-3`.
    At 0.7 rem on this surface `--st-text-3` measures 3.74 against the 4.5 copy needs — the
    finding `concrete-copy-contrast` reported seven times on this branch.
  */
  .base, .statement, .note {
    margin: 0.15rem 0 0; font-size: 0.7rem; line-height: 1.4; color: var(--st-text-2);
  }
  /* What is about to leave is the sentence a reader acts on. */
  .statement { color: var(--st-text); font-weight: 500; }
  .hint { display: block; }
  .note.warn { color: var(--st-warn); }

  .actions { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.35rem; }
  .actions button {
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--st-hair-strong);
    border-radius: 4px;
    background: var(--st-surface-3);
    color: var(--st-text);
    font-size: 0.68rem;
    cursor: pointer;
  }
  .actions button:hover:not(:disabled) { background: var(--st-hair-strong); }
  .actions button:disabled { opacity: 0.6; cursor: not-allowed; }
  .actions button:focus-visible,
  .picker summary:focus-visible,
  .row input:focus-visible { outline: 2px solid var(--st-value); outline-offset: 1px; }

  .picker { margin-top: 0.35rem; font-size: 0.7rem; color: var(--st-text-2); }
  .picker summary { cursor: pointer; }
  fieldset {
    margin: 0.3rem 0 0; padding: 0.2rem 0.35rem;
    border: 1px solid var(--st-hair); border-radius: 4px;
  }
  legend { font-size: 0.68rem; color: var(--st-text); padding: 0 0.2rem; }
  .count { font-family: var(--st-mono); color: var(--st-text-2); }
  /* A bounded list: a level of a real building holds hundreds of members. */
  .rows {
    display: flex; flex-wrap: wrap; gap: 0.1rem 0.6rem;
    max-height: 9rem; overflow-y: auto;
  }
  .row {
    display: flex; align-items: baseline; gap: 0.25rem;
    font-size: 0.68rem; color: var(--st-text); cursor: pointer;
  }
</style>
