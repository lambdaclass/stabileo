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
  import { untrack } from 'svelte';
  import { t, tp } from '../../../lib/i18n';
  import {
    groupByFamily, steelProfileSource,
    type ProfileEntry, type ProfileId, type ProfileSource,
  } from '../../../lib/profiles/catalogue';
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
  let input: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();
  let dialog: HTMLDivElement | undefined = $state();

  const results = $derived(source.list({ text, families }));
  const groups = $derived(groupByFamily(results));
  /** Flat order, which is what the keyboard walks — groups are a presentation, not a structure. */
  const flat = $derived(groups.flatMap((g) => g.entries));

  /**
   * The keyboard cursor, as an INDEX into the flat list rather than an id.
   *
   * An id would survive a filter change and point at a row that is no longer shown, which is
   * how a highlight ends up invisible and Enter picks something the user cannot see. An index
   * is restarted at the first row on every filter change, so it always points at something on
   * screen.
   */
  let cursor = $state(0);
  $effect(() => {
    // Reading `flat.length` is what subscribes this to filter and search changes: a
    // narrowed list restarts the cursor on its first row rather than leaving it on an
    // index that now names a different profile.
    void flat.length;
    cursor = 0;
  });

  /**
   * Mount-intended, and `untrack` keeps it that way: subscribing to `flat` or `selected`
   * would re-run this on every typed character, re-focusing the input and snapping the
   * cursor back to the previous selection mid-search.
   */
  $effect(() => {
    input?.focus();
    // Start on the current selection, so opening the panel and pressing Enter is a no-op
    // rather than a silent change to whatever happens to be first.
    const at = untrack(() => flat.findIndex((e) => e.id === selected));
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
   * Non-modal, so it must behave like one thing only: a popover. Keys are handled on the
   * dialog itself (nothing outside it is preventDefault'd while it is open), and a click
   * landing anywhere outside — back in the generator form, say — is a dismissal, not a
   * background state the form keeps typing into.
   *
   * This listener never sees the click that opened the panel: the trigger in
   * `ProfilePicker` stops propagation, because a trusted click can still be bubbling while
   * the state flush that mounts this panel runs (the browser checkpoints microtasks between
   * listeners), and an opening click reaching window would read as an instant dismissal.
   * Clicks on the trigger while open are likewise stopped there — the trigger's own toggle
   * closes the panel, and this handler's `onClose` would be a no-op.
   */
  function windowClick(e: MouseEvent) {
    if (dialog && e.target instanceof Node && !dialog.contains(e.target)) onClose();
  }

  const dims = (e: ProfileEntry) =>
    `${e.heightMm}×${e.widthMm} mm · ${e.areaCm2.toFixed(1)} cm² · ${e.massKgPerM.toFixed(1)} kg/m`;
</script>

<svelte:window onclick={windowClick} />

<div
  class="sel"
  role="dialog"
  aria-modal="false"
  aria-label={label || t('profileSelector.title')}
  data-testid="profile-selector"
  bind:this={dialog}
  onkeydown={keydown}
  tabindex={-1}
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
      aria-activedescendant={flat.length > 0 ? `profile-option-${cursor}` : undefined}
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

  <p class="count" role="status" data-testid="profile-count">
    {tp('profileSelector.count', { n: results.length })}
  </p>

  <div class="list" id="profile-selector-list" role="listbox" bind:this={listEl}
       aria-label={t('profileSelector.title')} data-testid="profile-list">
    {#if flat.length === 0}
      <!-- Says what to do, not just that there is nothing. -->
      <p class="empty" data-testid="profile-empty">{t('profileSelector.empty')}</p>
    {:else}
      {#each groups as g (g.key)}
        <p class="grp" data-testid="profile-group-{g.key}">
          {g.key}
          <!--
            The published standard, by name.

            This used to print a translated word from a three-value axis this component
            owned. `section-catalog.ts` carries the real thing — `EN 10365`, `DIN 1025-1`,
            `IRAM-IAS U 500-215-6` — and a standard's designation is a proper noun that must
            not be translated. So it is read from there and shown verbatim.
          -->
          <span class="std" title={source.classify(g.key as ProfileFamily).standardsBody}
                >{source.classify(g.key as ProfileFamily).standard}</span>
        </p>
        {#each g.entries as e (e.id)}
          {@const at = flat.indexOf(e)}
          <button
            type="button"
            id="profile-option-{at}"
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
            <span class="nm">{e.name}</span>
            <span class="dims">{dims(e)}</span>
          </button>
        {/each}
      {/each}
    {/if}
  </div>
</div>

<style>
  .sel {
    display: flex; flex-direction: column; gap: 6px;
    background: var(--st-surface-2, var(--st-surface));
    border: 1px solid var(--st-hair); border-radius: 6px;
    padding: 8px; width: 320px; max-width: 100%;
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
</style>
