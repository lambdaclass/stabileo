<script lang="ts">
  /**
   * The rail's controls: what is drawn, where it is cut, and what is in it.
   *
   * Split out of `RebarWorkspace` when that file crossed the 600-line ceiling the suite
   * enforces. The boundary is the one the workspace already had: this owns the CONTROLS and
   * the census, the workspace owns the stage, the selection and the camera.
   *
   * It reads `rebarWorkspace` directly for the switch state — the switches ARE that state, and
   * threading eight two-way bindings through props would put the same store one indirection
   * further away without decoupling anything.
   */
  import { t } from '../../../lib/i18n';
  import { rebarWorkspace, SOLID_KINDS } from '../../../lib/store/rebar-workspace.svelte';
  import type { SceneBounds, SceneSolidKind, SceneSummary }
    from '../../../lib/engine/detailing/scene-model';

  interface Props {
    summary: SceneSummary | null;
    /** Families with a switch and no members in this model. */
    emptyKinds: readonly SceneSolidKind[];
    /** Transverse pieces by kind, already counted. */
    pieces: ReadonlyArray<readonly [string, number]>;
    bounds: SceneBounds | null;
  }
  const { summary, emptyKinds, pieces, bounds }: Props = $props();

  function setAxis(axis: string) {
    if (axis === '') { rebarWorkspace.setSection(null); return; }
    const a = axis as 'x' | 'y' | 'z';
    // Start the plane at the middle of the model, which is where a section is useful.
    const at = bounds ? (bounds.min[a] + bounds.max[a]) / 2 : 0;
    rebarWorkspace.setSection({ axis: a, at, flip: false });
  }

  const sectionAxis = $derived(rebarWorkspace.section?.axis ?? '');
</script>

<section class="layers">
  <!-- `h3`: the workspace title is the overlay's `h2`, so a rail panel is its child. This was
       an `h4` and skipped a level — the jump H1-A measured in all three languages. -->
  <h3>{t('detailing.scene.layers')}</h3>
  {#each SOLID_KINDS as kind (kind)}
    <label>
      <input
        type="checkbox"
        data-testid={`rebar-layer-${kind}`}
        checked={!rebarWorkspace.hiddenKinds.includes(kind)}
        onchange={() => rebarWorkspace.toggleKind(kind)}
      />
      <span class:empty={emptyKinds.includes(kind)}>
        {t(`detailing.scene.kind.${kind}`)}
        {#if emptyKinds.includes(kind)}
          <em data-testid={`rebar-layer-empty-${kind}`}>
            — {t('detailing.scene.emptyFamily')}
          </em>
        {/if}
      </span>
    </label>
  {/each}
  <hr />
  <label>
    <input
      type="checkbox"
      data-testid="rebar-layer-bars"
      bind:checked={rebarWorkspace.showBars}
    />
    <span>{t('detailing.scene.showBars')}</span>
  </label>
  <label>
    <input
      type="checkbox"
      data-testid="rebar-layer-concrete"
      bind:checked={rebarWorkspace.showConcrete}
    />
    <span>{t('detailing.scene.showConcrete')}</span>
  </label>
  <label>
    <input
      type="checkbox"
      data-testid="rebar-layer-conflicts"
      bind:checked={rebarWorkspace.showConflicts}
    />
    <span>{t('detailing.scene.showConflicts')}</span>
  </label>
  <label>
    <input
      type="checkbox"
      data-testid="rebar-hide-unreinforced"
      bind:checked={rebarWorkspace.hideUnreinforced}
    />
    <span>{t('detailing.scene.hideUnreinforced')}</span>
  </label>
  <label class="slider">
    <span>{t('detailing.scene.exaggerate')} ×{rebarWorkspace.diameterScale}</span>
    <input type="range" min="1" max="6" step="1"
           data-testid="rebar-exaggerate"
           bind:value={rebarWorkspace.diameterScale} />
  </label>
  <label class="slider">
    <span>{t('detailing.scene.opacity')}</span>
    <input type="range" min="0.2" max="2" step="0.1"
           data-testid="rebar-opacity"
           bind:value={rebarWorkspace.concreteOpacity} />
  </label>
</section>

<section class="section-cut">
  <h3>{t('detailing.scene.section')}</h3>
  <select
    data-testid="rebar-section-axis"
    value={sectionAxis}
    onchange={(e) => setAxis((e.currentTarget as HTMLSelectElement).value)}
  >
    <option value="">{t('detailing.scene.sectionOff')}</option>
    <option value="x">X</option>
    <option value="y">Y</option>
    <option value="z">Z</option>
  </select>
  {#if rebarWorkspace.section && bounds}
    {@const b = bounds}
    {@const ax = rebarWorkspace.section.axis}
    <input
      type="range"
      data-testid="rebar-section-at"
      min={b.min[ax]} max={b.max[ax]}
      step={Math.max(0.01, (b.max[ax] - b.min[ax]) / 200)}
      value={rebarWorkspace.section.at}
      oninput={(e) => rebarWorkspace.setSection({
        ...rebarWorkspace.section!,
        at: Number((e.currentTarget as HTMLInputElement).value),
      })}
    />
    <button
      type="button"
      onclick={() => rebarWorkspace.setSection({
        ...rebarWorkspace.section!, flip: !rebarWorkspace.section!.flip,
      })}
    >{t('detailing.scene.sectionFlip')}</button>
  {/if}
</section>

<!-- ── What is actually in the scene, counted ────────────────
     A model can render thousands of bars and still be missing an entire family:
     12 705 bars looked full while every column tie in the building was absent.
     "Lots of bars" and "all the bars" are indistinguishable by eye, so the families
     are counted next to the picture. -->
{#if summary}
  <section class="tally" data-testid="rebar-tally">
    <h3>{t('detailing.scene.tally.title')}</h3>
    <p class="totals">
      <span>{t('detailing.scene.tally.solids')} <strong>{summary.solidCount}</strong></span>
      <span>{t('detailing.scene.tally.reinforced')}
        <strong>{summary.reinforcedSolidCount}</strong></span>
      <span>{t('detailing.scene.tally.bars')} <strong>{summary.barCount}</strong></span>
    </p>
    <table>
      <tbody>
        {#each summary.byFamily as f (f.family)}
          <tr data-testid={`rebar-tally-${f.family}`}>
            <th scope="row">{t(`detailing.scene.kind.${f.family}`)}</th>
            <td>{f.solids}</td>
            <td>{f.longitudinal} {t('detailing.scene.tally.long')}</td>
            <td>{f.transverse} {t('detailing.scene.tally.trans')}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if pieces.length > 0}
      <!-- Nested inside the tally, so one level below it. -->
      <h4>{t('detailing.scene.pieces.title')}</h4>
      <table data-testid="rebar-pieces">
        <tbody>
          {#each pieces as [kind, n] (kind)}
            <tr data-testid={`rebar-piece-${kind}`}>
              <th scope="row">{t(`detailing.scene.piece.${kind}`)}</th>
              <td>{n}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    {#if emptyKinds.length > 0}
      <p class="empty-families" data-testid="rebar-empty-families">
        {#each emptyKinds as k (k)}
          <span>{t(`detailing.scene.kind.${k}`)}: {t('detailing.scene.emptyFamily')}</span>
        {/each}
        <span class="why">{t('detailing.scene.emptyFamilyHint')}</span>
      </p>
    {/if}
  </section>
{/if}

<style>
  /*
    The rail's headings, in the application's own hierarchy.

    Layers / Section / What the scene contains / Model status were four different weights and
    sizes with no separators, which is a large part of why the viewer read as another program.
  */
  h3, h4 {
    margin: 0 0 0.3rem;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--st-text-2);
  }
  section { display: flex; flex-direction: column; }
  h3 { margin: 0 0 0.25rem; font-size: 0.8rem; }
  label {
    display: flex; align-items: center; gap: 0.35rem;
    font-size: 0.76rem; padding: 0.08rem 0; cursor: pointer;
  }
  label.slider { flex-direction: column; align-items: stretch; gap: 0.15rem; }
  label span.empty { opacity: 0.55; }
  label em { font-style: normal; font-size: 0.68rem; opacity: 0.8; }
  hr { border: none; border-top: 1px solid var(--st-hair); margin: 0.35rem 0; }
  select, input[type='range'] { width: 100%; font-size: 0.76rem; }
  .section-cut button {
    font-size: 0.74rem; margin-top: 0.3rem; cursor: pointer;
    background: var(--st-surface-3); color: var(--st-text);
    border: 1px solid var(--st-hair-strong); border-radius: 4px;
    padding: 0.2rem 0.5rem;
  }
  .tally h4 { margin: 0.35rem 0 0.15rem; font-size: 0.75rem; }
  .tally table { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
  .tally th {
    text-align: left; font-weight: 400; color: var(--st-text-2);
    padding: 0.08rem 0;
  }
  .tally td {
    text-align: right; font-family: var(--st-mono); font-variant-numeric: tabular-nums;
    padding: 0.08rem 0;
  }
  .tally .totals {
    display: flex; flex-direction: column; gap: 0.05rem;
    margin: 0 0 0.25rem; font-size: 0.72rem; color: var(--st-text-2);
  }
  .tally .totals strong { color: var(--st-text); float: right; }
  .empty-families {
    display: flex; flex-direction: column; gap: 0.05rem;
    margin: 0.3rem 0 0; font-size: 0.7rem; color: var(--st-text-2);
  }
  .empty-families .why { opacity: 0.8; margin-top: 0.15rem; }
</style>
