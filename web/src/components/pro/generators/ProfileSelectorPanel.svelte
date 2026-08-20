<script lang="ts">
  /**
   * Picking a profile out of a hundred and some, without a hundred-item dropdown.
   *
   * ── What it replaces ──────────────────────────────────────────────
   *
   * A native `<select>` with 15 `<optgroup>`s and 100+ `<option>`s. It "worked": every profile
   * was in there. But the only way to find `HEA 200` was to open the list and scroll it, the
   * list covered the panel while open, and nothing told you an HEA from an HEB except the
   * name. There was no search, no filter, and no way to see what you were choosing between.
   *
   * ── The shape ─────────────────────────────────────────────────────
   *
   * A popover: search first and focused, family filters under it, then the results grouped by
   * family in the catalogue's own order. Typing narrows; the filters narrow; the two compose.
   * Everything is one control away, and the whole thing fits in 320 px of height so it does
   * not swallow the generator panel behind it at 1280×720.
   *
   * ── Why the rows carry numbers ────────────────────────────────────
   *
   * `IPE 200` and `HEA 200` are both "200" and are not interchangeable. The row shows height ×
   * width in mm, area in cm² and mass in kg/m — the four figures someone actually chooses
   * between — with the units written out, because a bare `22.4` beside a bare `200` is how a
   * cm² gets read as a mm².
   *
   * ── It holds a source, not the tables ─────────────────────────────
   *
   * `source` is a `ProfileSource`. This component never imports `steel-profiles`, so the
   * general PRO section picker can hand it a different catalogue — a project library, a
   * server — without this file changing. That is the whole point of the seam.
   */
  import { t, tp } from '../../../lib/i18n';
  import {
    groupByFamily, steelProfileSource,
    type ProfileEntry, type ProfileId, type ProfileSource,
  } from '../../../lib/profiles/catalogue';
  import { profileProperties, propertyRows, type Quantity } from '../../../lib/profiles/properties';
  import type { ProfileFamily } from '../../../lib/data/steel-profiles';

  interface Props {
    /** Currently chosen profile, so the panel can mark and reveal it. */
    selected: ProfileId;
    onPick: (id: ProfileId) => void;
    onClose: () => void;
    /** Swappable catalogue. Defaults to the one this app ships. */
    source?: ProfileSource;
    /** Labels the trigger, for the accessible name of the dialog. */
    label?: string;
  }
  const { selected, onPick, onClose, source = steelProfileSource, label = '' }: Props = $props();

  let text = $state('');
  let families = $state<ProfileFamily[]>([]);
  /**
   * The axes PRO adds to the ones PR21 shipped.
   *
   * Each answers a question an engineer asks out loud. Which body publishes these dimensions —
   * a project working to IRAM tables does not want the DIN series mixed in. Which design code —
   * the same question the section catalogue already answers with `familiesForCode`. And what
   * depth range fits, which is the constraint a drawing actually imposes on a beam.
   */
  let bodies = $state<ProfileEntry['standardsBody'][]>([]);
  let designCode = $state<string>('');
  /**
   * The depth bounds, as whatever a number input puts there.
   *
   * `bind:value` on `type="number"` writes a NUMBER when the field parses and `null` when it is
   * empty or half-typed — not a string. Typing these as `string` and calling `.trim()` on them
   * would throw at the first keystroke, which is why the type says what the binding does.
   */
  let hMin = $state<number | null>(null);
  let hMax = $state<number | null>(null);
  let input: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();
  /** Whether the property card is open. Remembered across rows, not per row. */
  let cardOpen = $state(true);

  /**
   * Profiles pinned for comparison.
   *
   * Ids rather than entries: a pinned row survives a filter change — which is the point, since
   * comparing an IPE with an HEA means having both in view while the filters show one — and an
   * id cannot go stale the way a copied row could.
   */
  let pinned = $state<ProfileId[]>([]);

  /**
   * An empty field is no bound at all.
   *
   * Null and NaN are the two things a number input produces for "not a number yet", and neither
   * may become a filter: `undefined` leaves the axis open, which is what an empty box means.
   */
  const bound = (v: number | null) =>
    (v === null || !Number.isFinite(v) ? undefined : v);

  const results = $derived(source.list({
    text,
    families,
    standardsBodies: bodies,
    ...(designCode ? { designCode } : {}),
    heightMinMm: bound(hMin),
    heightMaxMm: bound(hMax),
  }));
  const groups = $derived(groupByFamily(results));
  /** Flat order, which is what the keyboard walks — groups are a presentation, not a structure. */
  const flat = $derived(groups.flatMap((g) => g.entries));

  /**
   * The keyboard cursor, as an INDEX into the flat list rather than an id.
   *
   * An id would survive a filter change and point at a row that is no longer shown, which is
   * how a highlight ends up invisible and Enter picks something the user cannot see. An index
   * is clamped below on every change, so it always points at something on screen.
   */
  let cursor = $state(0);
  $effect(() => {
    // Reading `flat.length` is what subscribes this to filter and search changes.
    if (cursor > flat.length - 1) cursor = Math.max(0, flat.length - 1);
  });

  $effect(() => {
    input?.focus();
    // Start on the current selection, so opening the panel and pressing Enter is a no-op
    // rather than a silent change to whatever happens to be first.
    const at = flat.findIndex((e) => e.id === selected);
    if (at >= 0) cursor = at;
  });

  $effect(() => {
    // Follow the cursor with the scroll, or keyboard navigation walks off the visible area.
    void cursor;
    listEl?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' });
  });

  function toggleFamily(f: ProfileFamily) {
    families = families.includes(f) ? families.filter((x) => x !== f) : [...families, f];
  }

  function toggleBody(b: ProfileEntry['standardsBody']) {
    bodies = bodies.includes(b) ? bodies.filter((x) => x !== b) : [...bodies, b];
  }

  function togglePin(id: ProfileId) {
    // Three is the width the panel can show without a horizontal scroller at 1280×720, and
    // comparing more than three sections at once is not a thing anyone does at this size.
    if (pinned.includes(id)) pinned = pinned.filter((x) => x !== id);
    else if (pinned.length < 3) pinned = [...pinned, id];
  }

  /** The row the card describes: whatever the keyboard is on, which hover also sets. */
  const focused = $derived<ProfileEntry | null>(flat[cursor] ?? null);
  const focusedProps = $derived(focused ? profileProperties(focused) : null);
  const rows = $derived(focusedProps ? propertyRows(focusedProps) : []);
  const pinnedProps = $derived(
    pinned
      .map((id) => source.byId(id))
      .filter((e): e is ProfileEntry => e !== null)
      .map((e) => ({ entry: e, quantities: profileProperties(e) })),
  );

  const UNIT_LABEL: Record<Quantity['unit'], string> = {
    cm2: 'cm²', cm3: 'cm³', cm4: 'cm⁴', cm: 'cm', mm: 'mm', 'kg/m': 'kg/m',
  };

  /**
   * A quantity, with its unit, or an em dash.
   *
   * Significant figures rather than a fixed count of decimals: an inertia runs to six digits
   * and a radius of gyration to two, and `toFixed(2)` on the first is noise while `toFixed(0)`
   * on the second is a lie.
   */
  function show(q: Quantity): string {
    if (q.value === null) return '—';
    const v = q.value;
    const digits = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 10 ? 2 : 3;
    return `${v.toFixed(digits)} ${UNIT_LABEL[q.unit]}`;
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, flat.length - 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); return; }
    if (e.key === 'Home') { e.preventDefault(); cursor = 0; return; }
    if (e.key === 'End') { e.preventDefault(); cursor = flat.length - 1; return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = flat[cursor];
      if (pick) { onPick(pick.id); onClose(); }
    }
  }

  /**
   * The publishing bodies, as a constant rather than derived from the rows.
   *
   * Four values, closed by `FamilyClassification.standardsBody`. Deriving them from the current
   * results would make the filter chips appear and disappear as the search narrows, which is the
   * one thing a filter control must not do.
   */
  const BODIES: ProfileEntry['standardsBody'][] = ['IRAM-IAS', 'CEN', 'DIN', 'ASTM/AISC'];

  /**
   * The rows the comparison shows — the ones a choice between two sections turns on.
   *
   * Not the full card: dimensions and the root radius describe a section, they do not
   * discriminate between two, and a twelve-row table at 360 px is unreadable.
   */
  const COMPARED = ['height', 'area', 'mass', 'iy', 'wy', 'ry', 'iz', 'wz', 'rz'] as const;

  const dims = (e: ProfileEntry) =>
    `${e.heightMm}×${e.widthMm} mm · ${e.areaCm2.toFixed(1)} cm² · ${e.massKgPerM.toFixed(1)} kg/m`;
</script>

<svelte:window onkeydown={keydown} />

<div
  class="sel"
  role="dialog"
  aria-modal="false"
  aria-label={label || t('profileSelector.title')}
  data-testid="profile-selector"
>
  <div class="head">
    <input
      bind:this={input}
      bind:value={text}
      class="search"
      type="search"
      role="combobox"
      aria-expanded="true"
      aria-controls="profile-selector-list"
      placeholder={t('profileSelector.search')}
      data-testid="profile-search"
    />
    <button class="close" type="button" onclick={onClose}
            title={t('profileSelector.close')} data-testid="profile-close">×</button>
  </div>

  <!--
    Families as toggles rather than a second dropdown: the whole point is to stop hiding the
    choices behind something you have to open.
  -->
  <div class="fams" role="group" aria-label={t('profileSelector.families')}>
    {#each source.families() as f (f)}
      <button
        type="button"
        class="fam"
        class:on={families.includes(f)}
        aria-pressed={families.includes(f)}
        onclick={() => toggleFamily(f)}
        data-testid="profile-family-{f}"
      >{f}</button>
    {/each}
    {#if families.length > 0}
      <button type="button" class="fam clear" onclick={() => (families = [])}
              data-testid="profile-family-clear">{t('profileSelector.allFamilies')}</button>
    {/if}
  </div>

  <!--
    The PRO axes. Toggles and small numeric boxes rather than dropdowns, for the reason the
    family chips are toggles: the whole point is to stop hiding the choices behind something
    that has to be opened.
  -->
  <div class="bodies" role="group" aria-label={t('steel.profileSelector.bodies')}>
    {#each BODIES as b (b)}
      <button
        type="button"
        class="fam"
        class:on={bodies.includes(b)}
        aria-pressed={bodies.includes(b)}
        onclick={() => toggleBody(b)}
        data-testid="profile-body-{b}"
      >{b}</button>
    {/each}
  </div>

  <div class="axes">
    <label class="axis">
      <span>{t('steel.profileSelector.designCode')}</span>
      <select bind:value={designCode} data-testid="profile-code">
        <option value="">{t('steel.profileSelector.anyCode')}</option>
        {#each source.designCodes() as c (c.id)}
          <option value={c.id}>{c.label}</option>
        {/each}
      </select>
    </label>
    <label class="axis depth">
      <span>{t('steel.profileSelector.depthRange')}</span>
      <input type="number" min="0" step="10" bind:value={hMin} placeholder="min"
             aria-label={t('steel.profileSelector.depthMin')} data-testid="profile-hmin" />
      <input type="number" min="0" step="10" bind:value={hMax} placeholder="max"
             aria-label={t('steel.profileSelector.depthMax')} data-testid="profile-hmax" />
      <span class="unit">mm</span>
    </label>
  </div>

  <p class="count" role="status" data-testid="profile-count">
    {tp('profileSelector.count', { n: results.length })}
  </p>

  <div class="list" id="profile-selector-list" role="listbox" bind:this={listEl}
       aria-label={t('profileSelector.title')} data-testid="profile-list">
    {#if flat.length === 0}
      <!-- Says what to do, not just that there is nothing. -->
      <!--
        The empty state names every filter that can produce it, which PR21's could not: it
        predates the body, code and depth axes, and its own key lives in the shared main
        dictionary that M1 does not edit. This one is in the steel namespace.
      -->
      <p class="empty" data-testid="profile-empty">{t('steel.profileSelector.empty')}</p>
    {:else}
      {#each groups as g (g.key)}
        {@const stds = source.standards(g.key as ProfileFamily)}
        <p class="grp" data-testid="profile-group-{g.key}">
          {g.key}
          <!--
            The published standard, by name — or the count, when the group has more than one.

            This used to print a translated word from a three-value axis this component
            owned. `section-catalog.ts` carries the real thing — `EN 10365`, `DIN 1025-1`,
            `IRAM-IAS U 500-215-6` — and a standard's designation is a proper noun that must
            not be translated. So it is read from there and shown verbatim.

            The angles hold two: the European series and the Argentine one tabulated for
            CIRSOC 301-EL. Printing the first over a group of both states something false
            about the rest, and there is no room at 320 px to print two designations, so the
            header says how many and the row says which. The count is translated; the
            designations in the tooltip are not.
          -->
          {#if stds.length === 1}
            <span class="std" title={source.classify(g.key as ProfileFamily).standardsBody}
                  >{stds[0]}</span>
          {:else}
            <span class="std mixed" title={stds.join(' · ')}
                  data-testid="profile-group-mixed-{g.key}"
                  >{tp('steel.profileSelector.standardCount', { n: stds.length })}</span>
          {/if}
        </p>
        {#each g.entries as e (e.id)}
          {@const at = flat.indexOf(e)}
          <!--
            The pin is a separate control, not a modifier on the row.

            Clicking a row PICKS the profile and closes the panel — that is the primary action
            and it must not become ambiguous. Comparing is a different intent, so it gets its own
            small button with its own accessible name.
          -->
          <span class="row-wrap">
          <button
            type="button"
            class="row"
            class:sel={e.id === selected}
            class:cur={at === cursor}
            data-cursor={at === cursor}
            role="option"
            aria-selected={e.id === selected}
            onclick={() => { onPick(e.id); onClose(); }}
            onmouseenter={() => (cursor = at)}
            data-testid="profile-option-{e.id}"
          >
            <span class="nm">{e.name}
              <!--
                Marked only where the row's own standard is not its family's. A badge on every
                row would be noise; a badge on none of them would leave eleven IRAM angles
                filed under a European standard, which is the defect this closes.
              -->
              {#if e.standardDiffersFromFamily}<span class="own-std" title={e.standard}
                    data-testid="profile-own-std-{e.id}">{e.standardsBody}</span>{/if}
            </span>
            <span class="dims">{dims(e)}</span>
          </button>
          <button
            type="button"
            class="pin"
            class:on={pinned.includes(e.id)}
            aria-pressed={pinned.includes(e.id)}
            title={t('steel.profileSelector.pin')}
            aria-label={`${t('steel.profileSelector.pin')} ${e.name}`}
            onclick={() => togglePin(e.id)}
            data-testid="profile-pin-{e.id}"
          >⊕</button>
          </span>
        {/each}
      {/each}
    {/if}
  </div>

  <!--
    ── The card: every property, and where each number came from ──

    This is what makes the picker a PRO control rather than a longer list. A section is chosen
    on the moduli and the radii of gyration, and the tables publish neither; `properties.ts`
    derives what can be derived, refuses what cannot, and states which is which. The badge on
    each row is not decoration — a modulus derived from a verified outline and one derived from
    half a bounding box are different claims, and only one of them exists here.
  -->
  {#if focused && focusedProps}
    <details class="card" bind:open={cardOpen} data-testid="profile-card">
      <summary>{focused.name} · {focused.standard}</summary>

      <dl class="props">
        {#each rows as row (row.key)}
          <div class="prop" data-testid="profile-prop-{row.key}">
            <dt>{t(row.labelKey)}</dt>
            <dd>
              <span class="pval">{show(row.quantity)}</span>
              <span class="pbasis pbasis-{row.quantity.basis}"
                    title={t(`steel.props.basis.title.${row.quantity.basis}`)}
                    data-testid="profile-basis-{row.key}"
                >{t(`steel.props.basis.${row.quantity.basis}`)}</span>
            </dd>
            {#if row.quantity.noteKey}
              <p class="pnote">{t(row.quantity.noteKey)}</p>
            {/if}
          </div>
        {/each}
      </dl>

      <!--
        The gaps as a block, not as blanks.

        A card with three empty rows reads as a loading state. Naming what this source does not
        give — and why — is the difference between an incomplete table and an honest one.
      -->
      {#if focusedProps.unavailableReasons.length > 0}
        <div class="gaps" data-testid="profile-gaps">
          <p class="gaps-title">{t('steel.props.unavailableTitle')}</p>
          {#each focusedProps.unavailableReasons as key (key)}
            <p class="gap">{t(key)}</p>
          {/each}
        </div>
      {/if}
    </details>
  {/if}

  <!--
    ── Comparison ──

    `IPE 200` and `HEA 200` are both "200" and are not interchangeable; the reason to compare is
    that the numbers, not the names, decide. Pinned rows survive a filter change so two families
    can be held side by side while the search shows one.
  -->
  {#if pinnedProps.length > 0}
    <div class="compare" data-testid="profile-compare">
      <div class="cmp-head">
        <span class="cmp-title">{t('steel.profileSelector.compare')}</span>
        <button type="button" class="fam clear" onclick={() => (pinned = [])}
                data-testid="profile-compare-clear">{t('steel.profileSelector.compareClear')}</button>
      </div>
      <div class="cmp-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col"></th>
              {#each pinnedProps as p (p.entry.id)}
                <th scope="col">{p.entry.name}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each COMPARED as key (key)}
              <tr data-testid="profile-compare-{key}">
                <th scope="row">{t(`steel.props.label.${key}`)}</th>
                {#each pinnedProps as p (p.entry.id)}
                  <td>{show(p.quantities[key])}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<style>
  .sel {
    display: flex; flex-direction: column; gap: 6px;
    background: var(--st-surface-2, var(--st-surface));
    border: 1px solid var(--st-hair); border-radius: 6px;
    padding: 8px; width: 360px; max-width: 100%;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .head { display: flex; gap: 6px; align-items: center; }
  .search {
    flex: 1; min-width: 0; font-size: 0.72rem; padding: 5px 7px;
    background: var(--st-surface); color: var(--st-text);
    border: 1px solid var(--st-hair); border-radius: 4px;
  }
  .search:focus-visible, .fam:focus-visible, .row:focus-visible, .close:focus-visible {
    outline: 2px solid var(--st-focus, var(--st-accent)); outline-offset: 1px;
  }
  .close {
    background: none; border: none; color: var(--st-text-2);
    font-size: 1rem; line-height: 1; cursor: pointer; padding: 2px 5px;
  }
  .fams { display: flex; flex-wrap: wrap; gap: 3px; }
  .fam {
    font-size: 0.62rem; padding: 2px 6px; border-radius: 3px; cursor: pointer;
    background: var(--st-surface); color: var(--st-text-2);
    border: 1px solid var(--st-hair);
  }
  .fam.on { background: var(--st-accent); color: var(--st-surface); border-color: var(--st-accent); }
  .fam.clear { color: var(--st-text-3); }
  .count { margin: 0; font-size: 0.62rem; color: var(--st-text-3); }
  /* Bounded so the popover cannot cover the panel it belongs to at 1280×720. */
  .list { max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; }
  .grp {
    position: sticky; top: 0; margin: 4px 0 2px; padding: 2px 0;
    background: var(--st-surface-2, var(--st-surface));
    font-size: 0.62rem; font-weight: 600; color: var(--st-text-2);
    display: flex; justify-content: space-between; gap: 6px;
  }
  .std { font-weight: 400; color: var(--st-text-3); }
  .std.mixed { font-style: italic; }
  /* Small, monospaced and dimmed: a provenance tag, not a second name. */
  .own-std {
    font-family: var(--st-mono, monospace); font-size: 0.55rem;
    color: var(--st-text-3); border: 1px solid var(--st-hair);
    border-radius: 2px; padding: 0 3px; margin-left: 4px; vertical-align: 1px;
  }
  .row {
    display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
    width: 100%; text-align: left; cursor: pointer;
    background: none; border: none; border-radius: 3px; padding: 4px 5px;
    color: var(--st-text); font-size: 0.68rem;
  }
  .row.cur { background: var(--st-hair); }
  .row.sel .nm { color: var(--st-accent); font-weight: 600; }
  .nm { font-family: var(--st-mono, monospace); }
  .dims { font-size: 0.6rem; color: var(--st-text-3); white-space: nowrap; }
  .empty { margin: 8px 4px; font-size: 0.66rem; color: var(--st-text-3); line-height: 1.45; }

  /* ── The PRO axes ── */
  .bodies { display: flex; flex-wrap: wrap; gap: 3px; }
  .axes { display: flex; flex-direction: column; gap: 3px; }
  .axis { display: flex; align-items: center; gap: 4px; font-size: 0.62rem; color: var(--st-text-2); }
  .axis select {
    flex: 1; min-width: 0; font-size: 0.64rem; padding: 2px 4px;
    background: var(--st-bg); color: var(--st-text);
    border: 1px solid var(--st-surface-3); border-radius: 3px;
  }
  .axis.depth input {
    width: 3.6rem; text-align: right; font-size: 0.64rem; padding: 2px 4px;
    background: var(--st-bg); color: var(--st-text);
    border: 1px solid var(--st-surface-3); border-radius: 3px;
  }
  .axis .unit { color: var(--st-text-3); }

  /* The row and its pin share a line; the row keeps the whole width it had. */
  .row-wrap { display: flex; align-items: center; gap: 2px; }
  .row-wrap .row { flex: 1; min-width: 0; }
  .pin {
    background: none; border: 1px solid transparent; border-radius: 3px;
    color: var(--st-text-3); font-size: 0.7rem; line-height: 1; cursor: pointer; padding: 1px 3px;
  }
  .pin.on { color: var(--st-accent); border-color: var(--st-accent); }

  /* ── Card ── */
  .card { border-top: 1px solid var(--st-hair); padding-top: 4px; }
  .card summary {
    cursor: pointer; font-family: var(--st-mono, monospace);
    font-size: 0.66rem; color: var(--st-text-2);
  }
  .props { margin: 4px 0 0; display: flex; flex-direction: column; gap: 2px; }
  .prop { display: flex; flex-direction: column; font-size: 0.62rem; }
  .prop dt, .prop dd { margin: 0; }
  .prop dt { color: var(--st-text-2); }
  .prop dd { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
  .pval { font-family: var(--st-mono, monospace); color: var(--st-text); }
  .pbasis {
    font-size: 0.54rem; padding: 0 3px; border-radius: 2px; white-space: nowrap;
    border: 1px solid var(--st-hair); color: var(--st-text-3);
  }
  /* Derived and unavailable are the two the reader has to notice. A published value is the
     default and is not tinted, so nothing reads as an alarm about an ordinary number. */
  .pbasis-derivedFromTable, .pbasis-derivedFromGeometry { color: var(--st-warn); border-color: var(--st-warn); }
  .pbasis-unavailable { color: var(--st-text-3); border-style: dashed; }
  .pnote { margin: 1px 0 0; font-size: 0.56rem; color: var(--st-text-3); line-height: 1.35; }
  .gaps { margin-top: 5px; display: flex; flex-direction: column; gap: 2px; }
  .gaps-title { margin: 0; font-size: 0.6rem; font-weight: 600; color: var(--st-text-2); }
  .gap { margin: 0; font-size: 0.56rem; color: var(--st-text-3); line-height: 1.35; }

  /* ── Comparison ── */
  .compare { border-top: 1px solid var(--st-hair); padding-top: 4px; }
  .cmp-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
  .cmp-title { font-size: 0.62rem; font-weight: 600; color: var(--st-text-2); }
  /* Its own scroller: three columns of six-digit inertias overflow 360 px, and the panel body
     must never scroll sideways. */
  .cmp-scroll { overflow-x: auto; }
  .compare table { border-collapse: collapse; font-size: 0.58rem; width: 100%; }
  .compare th, .compare td {
    text-align: right; padding: 1px 4px; white-space: nowrap;
    border-bottom: 1px solid var(--st-hair);
  }
  .compare thead th { font-family: var(--st-mono, monospace); color: var(--st-accent); }
  .compare tbody th { text-align: left; font-weight: 400; color: var(--st-text-2); }
  .compare td { font-family: var(--st-mono, monospace); color: var(--st-text); }
</style>
