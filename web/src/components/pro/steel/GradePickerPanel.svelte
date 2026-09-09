<script lang="ts">
  /**
   * Picking a steel grade in PRO, with everything the choice actually depends on on screen.
   *
   * ── Why not Basic's picker ────────────────────────────────────────
   *
   * `MaterialPresetSelector.svelte` is a good control for what it does: a modal over six
   * material categories, a code dropdown, a search box, and one line per grade showing E, fy,
   * fu and density. Reused here it would be wrong in four ways, and none of them is cosmetic:
   *
   *   · it is a MODAL over the whole app. PRO's surface is a panel beside the model, and a
   *     dialog that covers the model to choose a material for a member you can no longer see
   *     is the pattern PR20 spent a release removing.
   *   · it offers concrete and timber. On the metallic surface those are not choices, and a
   *     tab strip whose first two entries do not apply teaches the reader to ignore the strip.
   *   · it has no keyboard path through the list, no region filter, and no way to see WHY a
   *     value is what it is — the `~` mark is the only provenance it shows.
   *   · it filters by region for Basic and shows everything for PRO, which is right, but it
   *     cannot say which region a grade comes from, so the extra rows arrive unexplained.
   *
   * So this is a panel, metals only, with the axes PRO needs and a card that states the
   * authority behind every number. What it does NOT do is reimplement the catalogue: it holds
   * a `GradeSource`, exactly as the profile picker holds a `ProfileSource`, and the filtering
   * rules live there.
   *
   * ── What a selection means ────────────────────────────────────────
   *
   * It configures the model. There is no metallic design authority in this app, so choosing
   * F-36 does not check anything, and the panel says so above the list rather than leaving it
   * to be inferred from the absence of a result.
   */
  import { t, tp } from '../../../lib/i18n';
  import {
    groupByFamily, structuralGradeSource, gradePropertyRows, bandTable, pairing,
    type GradeEntry, type GradeId, type GradeSource,
  } from '../../../lib/grades/catalogue';
  import type { GradeFamily, GradeRegion } from '../../../lib/data/structural-grades';

  interface Props {
    /** The grade currently chosen, so the panel can mark and reveal it. */
    selected?: GradeId | null;
    onPick: (id: GradeId) => void;
    onClose?: () => void;
    /** Swappable catalogue. Defaults to the one this app ships. */
    source?: GradeSource;
    /**
     * The profile family the grade is being chosen FOR, when there is one.
     *
     * Present only so the card can say whether the pairing is what mills actually roll. Absent
     * is a normal state — a project-wide material has no section in hand — and the pairing block
     * simply does not appear.
     */
    profileFamily?: string | null;
  }
  const {
    selected = null, onPick, onClose, source = structuralGradeSource, profileFamily = null,
  }: Props = $props();

  let text = $state('');
  let families = $state<GradeFamily[]>([]);
  let regions = $state<GradeRegion[]>([]);
  let codeId = $state<string | null>(null);
  let input: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  /** The code filter only means something with one family chosen — a code covers exactly one. */
  const oneFamily = $derived(families.length === 1 ? families[0] : null);
  const codes = $derived(oneFamily ? source.designCodes(oneFamily) : []);

  const results = $derived(source.list({
    text,
    families,
    regions,
    ...(oneFamily && codeId ? { designCodeId: codeId } : {}),
  }));
  const groups = $derived(groupByFamily(results));
  /** Flat order, which is what the keyboard walks. Groups are presentation, not structure. */
  const flat = $derived(groups.flatMap((g) => g.entries));

  /**
   * The cursor is an INDEX, for the reason the profile picker's is: an id survives a filter
   * change and can point at a row that is no longer shown, which is how a highlight goes
   * invisible and Enter picks something the user cannot see.
   */
  let cursor = $state(0);
  $effect(() => {
    if (cursor > flat.length - 1) cursor = Math.max(0, flat.length - 1);
  });

  $effect(() => {
    input?.focus();
    const at = flat.findIndex((e) => e.id === selected);
    if (at >= 0) cursor = at;
  });

  $effect(() => {
    void cursor;
    listEl?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' });
  });

  /** The row the card describes: whatever the keyboard is on, which is also what hover sets. */
  const focused = $derived<GradeEntry | null>(flat[cursor] ?? null);
  const rows = $derived(focused ? gradePropertyRows(focused) : []);
  const bands = $derived(focused ? bandTable(focused) : null);
  const pair = $derived(
    focused && profileFamily ? pairing(profileFamily, focused.id) : null,
  );

  function toggleFamily(f: GradeFamily) {
    families = families.includes(f) ? families.filter((x) => x !== f) : [...families, f];
    // A code belongs to a family. Keeping the id across a family change would filter by
    // something the control no longer offers, which is the stale-filter bug Basic's picker
    // solves by resolving against the current list on every read; here the list is rebuilt, so
    // clearing is the honest equivalent.
    codeId = null;
  }

  function toggleRegion(r: GradeRegion) {
    regions = regions.includes(r) ? regions.filter((x) => x !== r) : [...regions, r];
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, flat.length - 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); return; }
    if (e.key === 'Home') { e.preventDefault(); cursor = 0; return; }
    if (e.key === 'End') { e.preventDefault(); cursor = flat.length - 1; return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = flat[cursor];
      if (pick) onPick(pick.id);
    }
  }

  /** GPa reads better for a modulus and MPa for a strength; the unit is always written out. */
  function fmt(value: number | null, unit: string): string {
    if (value === null) return '—';
    if (unit === '-') return value.toFixed(2);
    if (unit === 'MPa' && value >= 10000) return `${(value / 1000).toFixed(0)} GPa`;
    if (unit === 'kN/m3') return `${value.toFixed(1)} kN/m³`;
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} MPa`;
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="gp" role="group" aria-label={t('steel.grades.title')} data-testid="grade-picker">
  <header class="head">
    <h4>{t('steel.grades.title')}</h4>
    {#if onClose}
      <button class="close" type="button" onclick={onClose}
              title={t('steel.grades.close')} data-testid="grade-close">×</button>
    {/if}
  </header>

  <!--
    Stated before the list, not after it, and not conditioned on anything.

    A material picker on a design surface implies that choosing well makes the member pass. On
    the metallic surface it cannot: there is nothing to pass. Saying it here is the difference
    between a panel that configures a model and one that looks like it verifies something.
  -->
  <p class="not-a-check" role="note" data-testid="grade-not-a-check">
    {t('steel.grades.subtitle')}
  </p>

  <input
    bind:this={input}
    bind:value={text}
    class="search"
    type="search"
    role="combobox"
    aria-expanded="true"
    aria-controls="grade-list"
    placeholder={t('steel.grades.search')}
    data-testid="grade-search"
  />

  <div class="filters">
    <div class="chips" role="group" aria-label={t('steel.grades.families')}>
      {#each source.families() as f (f)}
        <button type="button" class="chip" class:on={families.includes(f)}
                aria-pressed={families.includes(f)} onclick={() => toggleFamily(f)}
                data-testid="grade-family-{f}">{t(`steel.grades.family.${f}`)}</button>
      {/each}
      {#if families.length > 0}
        <button type="button" class="chip clear" onclick={() => { families = []; codeId = null; }}
                data-testid="grade-family-clear">{t('steel.grades.allFamilies')}</button>
      {/if}
    </div>

    <div class="chips" role="group" aria-label={t('steel.grades.regions')}>
      {#each source.regions() as r (r)}
        <button type="button" class="chip" class:on={regions.includes(r)}
                aria-pressed={regions.includes(r)} onclick={() => toggleRegion(r)}
                data-testid="grade-region-{r}">{t(`steel.grades.region.${r}`)}</button>
      {/each}
      {#if regions.length > 0}
        <button type="button" class="chip clear" onclick={() => (regions = [])}
                data-testid="grade-region-clear">{t('steel.grades.allRegions')}</button>
      {/if}
    </div>

    <!--
      The code control appears only when it can mean something. An inert dropdown that filters
      nothing is worse than no dropdown: it suggests the app has an opinion it does not have.
    -->
    {#if codes.length > 0}
      <label class="code">
        <span>{t('steel.grades.code')}</span>
        <select bind:value={codeId} data-testid="grade-code">
          <option value={null}>{t('steel.grades.codeAny')}</option>
          {#each codes as c (c.id)}
            <option value={c.id}>{c.name}</option>
          {/each}
        </select>
      </label>
    {:else if families.length > 1}
      <p class="hint" data-testid="grade-code-hint">{t('steel.grades.codeNeedsOneFamily')}</p>
    {/if}
  </div>

  <p class="count" role="status" data-testid="grade-count">
    {tp('steel.grades.count', { n: results.length })}
  </p>

  <div class="list" id="grade-list" role="listbox" bind:this={listEl}
       aria-label={t('steel.grades.title')} data-testid="grade-list">
    {#if flat.length === 0}
      <p class="empty" data-testid="grade-empty">{t('steel.grades.empty')}</p>
    {:else}
      {#each groups as g (g.key)}
        <p class="grp" data-testid="grade-group-{g.key}">{t(`steel.grades.family.${g.key}`)}</p>
        {#each g.entries as e (e.id)}
          {@const at = flat.indexOf(e)}
          <button
            type="button"
            class="row"
            class:sel={e.id === selected}
            class:cur={at === cursor}
            data-cursor={at === cursor}
            role="option"
            aria-selected={e.id === selected}
            onclick={() => onPick(e.id)}
            onmouseenter={() => (cursor = at)}
            data-testid="grade-option-{e.id}"
          >
            <span class="nm">{e.designation}</span>
            <!-- The product standard is part of the identity: two standards can give the same
                 designation to different steels, and a grade cannot be specified without it. -->
            <span class="std">{e.productStandard}</span>
            <span class="num">fy {e.fyMPa}{#if e.bands}<span class="banded" aria-hidden="true">*</span>{/if}</span>
          </button>
        {/each}
      {/each}
    {/if}
  </div>

  <!-- ── The card: what this grade is, and on whose authority ────────── -->
  {#if focused}
    <div class="card" data-testid="grade-card">
      <p class="card-head">
        <span class="card-name">{focused.designation}</span>
        <span class="card-meta">
          {focused.productStandard} · {t(`steel.grades.region.${focused.region}`)} ·
          {t(`steel.grades.family.${focused.family}`)}
        </span>
      </p>

      {#if focused.verification === 'typical'}
        <p class="warn" data-testid="grade-typical">{t('steel.grades.typicalMark')}</p>
      {/if}

      <dl class="props">
        {#each rows as row (row.key)}
          <div class="prop" data-testid="grade-prop-{row.key}">
            <dt>{t(row.labelKey)}</dt>
            <dd>
              <span class="val">{fmt(row.quantity.value, row.quantity.unit)}</span>
              <!-- Where the number came from, on every row. A card that shows a derived value
                   beside a published one without distinguishing them implies one source. -->
              <span class="basis basis-{row.quantity.basis}"
                    title={t(`steel.grades.basis.title.${row.quantity.basis}`)}
                    data-testid="grade-basis-{row.key}"
                >{t(`steel.grades.basis.${row.quantity.basis}`)}</span>
            </dd>
            {#if row.quantity.noteKey}
              <p class="note">{t(row.quantity.noteKey)}</p>
            {/if}
          </div>
        {/each}
      </dl>

      <!--
        The bands, with the standard that published them.

        This is the fact the data module is most emphatic about: the bands are a DESIGN code's
        table, never the product standard's, and showing them beside the product standard
        without naming their own source attributes them to the wrong document.
      -->
      {#if bands}
        <div class="bands" data-testid="grade-bands">
          <p class="bands-title">{t('steel.grades.bandsTitle')}</p>
          {#each bands.rows as b (b.overMm)}
            <p class="band">{tp('steel.grades.bandRow', {
              over: b.overMm, upTo: b.upToMm, fy: b.fy, fu: b.fu,
            })}</p>
          {/each}
          {#if bands.standard}
            <p class="bands-by">{tp('steel.grades.bandsBy', { standard: bands.standard })}</p>
          {/if}
        </div>
      {/if}

      {#if pair}
        <p class="pairing pairing-{pair.verdict}" data-testid="grade-pairing">
          {t(pair.noteKey)}
        </p>
      {/if}

      {#if focused.note}
        <p class="src-note">{focused.note}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The panel lives in the PRO right-hand column, so it sizes to it rather than to a dialog. */
  .gp {
    display: flex; flex-direction: column; gap: 6px;
    background: var(--st-surface-2, var(--st-surface));
    border: 1px solid var(--st-hair); border-radius: 6px; padding: 8px;
  }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
  h4 { margin: 0; font-size: 0.74rem; color: var(--st-text); font-weight: 600; }
  .close {
    background: none; border: none; color: var(--st-text-2);
    font-size: 1rem; line-height: 1; cursor: pointer; padding: 2px 5px;
  }
  .not-a-check {
    margin: 0; font-size: 0.63rem; line-height: 1.4; color: var(--st-warn);
    border-left: 2px solid var(--st-warn); padding-left: 6px;
  }
  .search {
    font-size: 0.72rem; padding: 5px 7px;
    background: var(--st-surface); color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 4px;
  }
  .filters { display: flex; flex-direction: column; gap: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .chip {
    font-size: 0.62rem; padding: 2px 6px; border-radius: 3px; cursor: pointer;
    background: var(--st-surface); color: var(--st-text-2); border: 1px solid var(--st-hair);
  }
  .chip.on { background: var(--st-accent); color: var(--st-surface); border-color: var(--st-accent); }
  .chip.clear { color: var(--st-text-3); }
  .code { display: flex; align-items: center; gap: 5px; font-size: 0.64rem; color: var(--st-text-2); }
  .code select {
    flex: 1; min-width: 0; font-size: 0.66rem; padding: 2px 4px;
    background: var(--st-bg); color: var(--st-text);
    border: 1px solid var(--st-surface-3); border-radius: 3px;
  }
  .hint { margin: 0; font-size: 0.6rem; color: var(--st-text-3); line-height: 1.35; }
  .count { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  /* Bounded so the card below stays reachable without scrolling the whole panel at 720 px. */
  .list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; }
  .grp {
    position: sticky; top: 0; margin: 4px 0 2px; padding: 2px 0;
    background: var(--st-surface-2, var(--st-surface));
    font-size: 0.62rem; font-weight: 600; color: var(--st-text-2);
  }
  .row {
    display: grid; grid-template-columns: 6.5rem 1fr auto; align-items: baseline; gap: 6px;
    width: 100%; text-align: left; cursor: pointer;
    background: none; border: none; border-radius: 3px; padding: 3px 5px;
    color: var(--st-text); font-size: 0.67rem;
  }
  .row.cur { background: var(--st-hair); }
  .row.sel .nm { color: var(--st-accent); font-weight: 600; }
  .nm { font-family: var(--st-mono, monospace); }
  .std { font-size: 0.6rem; color: var(--st-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { font-family: var(--st-mono, monospace); font-size: 0.62rem; color: var(--st-text-2); }
  .banded { color: var(--st-warn); }
  .empty { margin: 8px 4px; font-size: 0.66rem; color: var(--st-text-3); line-height: 1.45; }

  .card {
    display: flex; flex-direction: column; gap: 5px;
    border-top: 1px solid var(--st-hair); padding-top: 6px;
  }
  .card-head { margin: 0; display: flex; flex-direction: column; gap: 1px; }
  .card-name { font-family: var(--st-mono, monospace); font-size: 0.72rem; color: var(--st-text); }
  .card-meta { font-size: 0.6rem; color: var(--st-text-3); }
  .warn { margin: 0; font-size: 0.62rem; color: var(--st-warn); line-height: 1.4; }
  .props { margin: 0; display: flex; flex-direction: column; gap: 2px; }
  .prop { display: flex; flex-direction: column; }
  .prop dt, .prop dd { margin: 0; }
  .prop { font-size: 0.64rem; }
  .prop dt { color: var(--st-text-2); }
  .prop dd { display: flex; align-items: baseline; gap: 6px; }
  .val { font-family: var(--st-mono, monospace); color: var(--st-text); }
  .basis {
    font-size: 0.55rem; padding: 0 3px; border-radius: 2px;
    border: 1px solid var(--st-hair); color: var(--st-text-3);
  }
  /* Derived and typical are the two the reader has to notice; published values are the default
     and are not tinted, so nothing reads as an alarm about an ordinary number. */
  .basis-derived, .basis-typicalValue { color: var(--st-warn); border-color: var(--st-warn); }
  .note { margin: 1px 0 0; font-size: 0.58rem; color: var(--st-text-3); line-height: 1.35; }
  .bands { display: flex; flex-direction: column; gap: 1px; }
  .bands-title { margin: 0; font-size: 0.62rem; font-weight: 600; color: var(--st-text-2); }
  .band { margin: 0; font-family: var(--st-mono, monospace); font-size: 0.6rem; color: var(--st-text); }
  .bands-by { margin: 1px 0 0; font-size: 0.58rem; color: var(--st-text-3); line-height: 1.35; }
  .pairing { margin: 0; font-size: 0.62rem; line-height: 1.4; color: var(--st-text-2); }
  .pairing-unusual { color: var(--st-warn); }
  .src-note { margin: 0; font-size: 0.6rem; color: var(--st-text-3); line-height: 1.4; }

  /* One focus ring for every control in the panel, as the metallic surface already does. */
  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--st-value);
    outline-offset: 1px;
  }
</style>
