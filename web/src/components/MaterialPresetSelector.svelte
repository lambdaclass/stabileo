<script lang="ts">
  import { MATERIAL_CATEGORIES, searchPresets, categoryFamily, bandSummary, type MaterialPreset } from '../lib/data/material-presets';
  import {
    codesForFamily, codesForMode, defaultCodeFor,
  } from '../lib/data/structural-grades';
  import { concreteCodes, timberCodes } from '../lib/data/non-metal-grades';
  import { codeLore } from '../lib/data/code-lore';
  import { uiStore } from '../lib/store';
  import { t } from '../lib/i18n';
  import { fmtQ, unitQ } from '../lib/store/display-units.svelte';

  interface Props {
    open: boolean;
    onselect: (preset: MaterialPreset) => void;
    onclose: () => void;
  }

  let { open, onselect, onclose }: Props = $props();

  /*
   * The catalogue quotes MPa and kN/m³. In SI they are shown as written (E in
   * GPa from 1000 MPa up, the way grades are quoted); the other systems get
   * the converted value in their own unit.
   */
  const isSI = $derived(uiStore.unitSystem === 'SI');
  function fmtE(mpa: number): string {
    if (isSI) return mpa >= 1000 ? `${(mpa / 1000).toFixed(0)}GPa` : `${mpa}MPa`;
    return `${fmtQ(mpa, 'stress')}${unitQ('stress')}`;
  }
  const fmtStress = (mpa: number) => isSI ? `${mpa}MPa` : `${fmtQ(mpa, 'stress')}${unitQ('stress')}`;
  const fmtRho = (knm3: number) => isSI ? `${knm3}kN/m³` : `${fmtQ(knm3, 'density')}${unitQ('density')}`;
  /** The thinnest band's limit and the yield beyond it; the fy is converted, the plate thickness stays in mm. */
  function bandTail(p: MaterialPreset, tail: string): string {
    const b = p.thicknessBands;
    if (isSI || !b || b.length === 0) return tail;
    return `(>${b[0].upToMm}mm: ${fmtQ(b[b.length - 1].fy, 'stress')})`;
  }

  let activeCategory = $state<string>('acero');
  let searchQuery = $state('');

  const isPro = $derived(uiStore.analysisMode === 'pro');
  const family = $derived(categoryFamily(activeCategory));

  /**
   * Codes offered for the active category.
   *
   * Metals resolve theirs from the design-code table by family. Concrete and
   * timber carry their code on each entry instead, because for them the code
   * is part of the material's identity rather than a lens over it — the same
   * concrete has a different modulus under each one, so "C25/30 to ACI" is not
   * a thing that exists.
   */
  const codes = $derived.by(() => {
    if (family) return codesForMode(codesForFamily(family), isPro).map((c) => ({ id: c.id, name: c.name }));
    if (activeCategory === 'hormigon') return concreteCodes().map((c) => ({ id: c, name: c }));
    if (activeCategory === 'madera') return timberCodes().map((c) => ({ id: c, name: c }));
    return [];
  });

  /**
   * The selected design code.
   *
   * Held as an id that may be stale — switching category can leave it pointing
   * at a code that category has no entry for. Resolving it against the current
   * list on every read, and falling back to the category's default, means the
   * picker can never end up filtering by something not on screen.
   */
  let codeId = $state<string | null>(null);
  const activeCode = $derived.by(() => {
    const chosen = codeId ? codes.find((c) => c.id === codeId) : undefined;
    if (chosen) return chosen;
    if (family) {
      const d = defaultCodeFor(family);
      return d ? { id: d.id, name: d.name } : null;
    }
    // Non-metals default to the Argentine code where there is one, for the same
    // reason the metals do: this is an Argentine tool.
    const local = codes.find((c) => c.name.startsWith('CIRSOC'));
    return local ?? codes[0] ?? null;
  });

  let filtered = $derived(
    searchPresets(searchQuery, activeCategory, {
      codeId: activeCode?.id,
      pro: isPro,
    }),
  );

  function pickCategory(id: string) {
    activeCategory = id;
    searchQuery = '';
    // Reset rather than carry the code across: CIRSOC 301 governs rolled
    // sections and CIRSOC 303 cold-formed ones, so the right code for the new
    // category is its own default, not whatever the last one was.
    codeId = null;
  }

  /** Where the selected code comes from — shown on demand, not by default. */
  const lore = $derived(codeLore(activeCode?.name));
  let showLore = $state(false);
  // A `?` that stayed open across a change of code would describe the wrong
  // one, which is worse than being closed.
  $effect(() => { void activeCode?.id; showLore = false; });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="preset-overlay" onclick={onclose} onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="preset-modal" onclick={(e) => e.stopPropagation()}>
      <div class="preset-header">
        <h3>{t('dialog.chooseMaterial')}</h3>
        <button class="close-btn" onclick={onclose}>✕</button>
      </div>

      <div class="preset-tabs">
        {#each MATERIAL_CATEGORIES as cat}
          <button
            class="tab-btn"
            class:active={activeCategory === cat.id}
            onclick={() => pickCategory(cat.id)}
          >{t(cat.label)}</button>
        {/each}
      </div>

      <!-- Design code. Present only for the graded metals: concrete and timber
           have no code attached here, and an inert control would only suggest
           it does something. -->
      {#if codes.length > 0}
        <div class="preset-code">
          <label for="preset-code-sel">{t('matCode.label')}</label>
          <!-- Driven by `activeCode`, not by `codeId`: the latter is null until
               the user chooses, and binding to it would show a blank control
               while the list is in fact filtered by the default. -->
          <select
            id="preset-code-sel"
            value={activeCode?.id ?? ''}
            onchange={(e) => codeId = (e.currentTarget as HTMLSelectElement).value}
          >
            {#each codes as c}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
          {#if lore}
            <button
              class="preset-lore-btn"
              class:open={showLore}
              onclick={() => showLore = !showLore}
              aria-expanded={showLore}
              title={t('matCode.aboutCode')}
            >?</button>
          {/if}
          <span class="preset-code-hint">{t('matCode.hint')}</span>
          {#if showLore && lore}
            <div class="preset-lore">
              <div class="preset-lore-row"><span>{t('matCode.body')}</span><span>{lore.body}</span></div>
              <div class="preset-lore-row"><span>{t('matCode.since')}</span><span>{lore.since}</span></div>
              <p class="preset-lore-trivia">{lore.trivia}</p>
            </div>
          {/if}
        </div>
      {/if}

      <div class="preset-search">
        <input type="text" placeholder={t('search.material')} bind:value={searchQuery} />
      </div>

      <div class="preset-list">
        {#each filtered as p}
          {@const bands = bandSummary(p)}
          <button class="preset-item" onclick={() => onselect(p)}>
            <span class="preset-name">
              {p.name}
              <!-- The standard is part of the identity, not a footnote: two
                   standards can give the same designation to different steels,
                   and a grade cannot be specified on a drawing without it. -->
              {#if p.standard}<span class="preset-std">{p.standard}</span>{/if}
              <!-- A value carried from general knowledge rather than read from
                   the standard. Small, but present: someone sizing a member
                   deserves to know which kind of number they picked. -->
              {#if p.verification === 'typical'}
                <span class="preset-unver" title={t('grade.typicalHelp')}>~</span>
              {/if}
            </span>
            <span class="preset-props">
              E={fmtE(p.e)}
              <!-- The quoted fy applies to the first thickness band only.
                   Hot-rolled yield falls with thickness — S355 is 355 MPa to
                   40 mm and 335 beyond it — so a picker that shows one number
                   lets someone size a thick plate 6 % unconservative without
                   ever being told.

                   Both numbers go on screen, not just the bound: `title` is
                   mouse-only and never reaches the button's accessible name,
                   so anything left there is unreachable by touch or keyboard.
                   What stays in the tooltip is the full table and the standard
                   the bands come from — which is the DESIGN code, not the
                   product standard shown beside the grade name. -->
              {#if p.fy}
                fy={fmtStress(p.fy)}{#if bands}<span class="preset-band" title={bands.full}
                >{bandTail(p, bands.tail)}</span>{/if}
              {/if}
              {#if p.fu} fu={fmtStress(p.fu)}{/if}
              ρ={fmtRho(p.rho)}
            </span>
          </button>
        {/each}
        {#if filtered.length === 0}
          <p class="no-results">{t('search.noResults')}</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /*
   * Rebuilt on the design tokens.
   *
   * This dialog still carried the app's first palette — a navy card with cyan
   * headings — while everything around it had moved to the ink/vermillion
   * system. Hard-coded hexes are why: they cannot follow a theme, so the one
   * surface nobody revisited stayed behind and read as a different product.
   */
  .preset-overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 16, 22, 0.72);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .preset-modal {
    background: var(--st-surface);
    border: 1px solid var(--st-border);
    border-radius: var(--st-radius-lg);
    /* Was a fixed 420 px, which is what pushed the sixth category tab off the
       edge once concrete and timber arrived. Sized to its content within a
       bound instead, so adding a category widens the dialog rather than
       hiding it. */
    width: min(560px, 100%);
    max-height: min(78vh, 720px);
    display: flex;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
    font-family: var(--st-sans);
  }

  .preset-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--st-border);
  }
  .preset-header h3 {
    color: var(--st-text);
    font-family: var(--st-display);
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 1.05rem;
    line-height: 1;
    padding: 4px 6px;
    border-radius: var(--st-radius);
  }
  .close-btn:hover { color: var(--st-text); background: var(--st-surface-3); }

  .preset-tabs {
    display: flex;
    /* Wrap rather than overflow: a category the user cannot see is a category
       that does not exist. */
    flex-wrap: wrap;
    gap: 2px;
    padding: 8px 12px 0;
    border-bottom: 1px solid var(--st-border);
  }

  .tab-btn {
    padding: 5px 10px;
    border: none;
    background: transparent;
    color: var(--st-text-3);
    cursor: pointer;
    font-size: 0.76rem;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    border-radius: var(--st-radius) var(--st-radius) 0 0;
  }
  .tab-btn:hover { color: var(--st-text); background: var(--st-surface-2); }
  .tab-btn.active { color: var(--st-text); border-bottom-color: var(--st-accent); }

  .preset-code {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px 0;
    flex-wrap: wrap;
  }
  .preset-code label {
    font-size: 0.76rem;
    color: var(--st-text-2);
    white-space: nowrap;
  }
  .preset-code select {
    flex: 1;
    min-width: 170px;
    padding: 5px 8px;
    border-radius: var(--st-radius);
    border: 1px solid var(--st-border);
    background: var(--st-surface-3);
    color: var(--st-text);
    font-family: var(--st-sans);
    font-size: 0.8rem;
  }
  .preset-code-hint {
    width: 100%;
    font-size: 0.68rem;
    color: var(--st-text-3);
    line-height: 1.4;
  }

  .preset-lore-btn {
    width: 18px; height: 18px; flex: none;
    border-radius: 50%;
    border: 1px solid var(--st-border);
    background: none;
    color: var(--st-text-3);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }
  .preset-lore-btn:hover, .preset-lore-btn.open {
    border-color: var(--st-value);
    color: var(--st-value);
  }
  .preset-lore {
    width: 100%;
    margin-top: 6px;
    padding: 9px 11px;
    border-radius: var(--st-radius);
    background: var(--st-surface-2);
    border-left: 2px solid var(--st-value);
  }
  .preset-lore-row {
    display: flex;
    gap: 8px;
    font-size: 0.72rem;
    line-height: 1.5;
  }
  .preset-lore-row span:first-child { color: var(--st-text-3); min-width: 74px; }
  .preset-lore-row span:last-child { color: var(--st-text-2); }
  .preset-lore-trivia {
    margin: 6px 0 0;
    font-size: 0.72rem;
    line-height: 1.55;
    color: var(--st-text-2);
  }

  .preset-search { padding: 10px 16px; }
  .preset-search input {
    width: 100%;
    padding: 6px 10px;
    background: var(--st-surface-3);
    border: 1px solid var(--st-border);
    border-radius: var(--st-radius);
    color: var(--st-text);
    font-family: var(--st-sans);
    font-size: 0.82rem;
  }
  .preset-search input:focus {
    outline: none;
    border-color: var(--st-accent);
  }

  .preset-list {
    overflow-y: auto;
    flex: 1;
    padding: 0 12px 12px;
  }

  .preset-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    width: 100%;
    padding: 7px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--st-radius);
    color: var(--st-text-2);
    cursor: pointer;
    font-family: var(--st-sans);
    font-size: 0.82rem;
    text-align: left;
  }
  .preset-item:hover {
    background: var(--st-surface-2);
    border-color: var(--st-border);
    color: var(--st-text);
  }

  .preset-name { font-weight: 500; color: var(--st-text); }
  .preset-std {
    margin-left: 6px;
    font-weight: 400;
    font-size: 0.72rem;
    color: var(--st-text-3);
  }
  /* Sits on the baseline beside the fy it qualifies, not raised: this carries
     a second number now, and ten superscript characters are a footnote mark,
     not a value anyone reads. The parentheses do the grouping the raise used
     to, so it still attaches to fy rather than reading as a property of its
     own. */
  .preset-band {
    margin-left: 3px;
    font-size: 0.68rem;
    color: var(--st-text-3);
  }
  .preset-unver {
    margin-left: 5px;
    padding: 0 4px;
    border-radius: var(--st-radius);
    background: rgba(217, 164, 65, 0.16);
    color: var(--st-amber-text);
    font-size: 0.7rem;
    font-weight: 700;
    cursor: help;
  }
  .preset-props {
    font-family: var(--st-mono);
    font-size: 0.7rem;
    color: var(--st-text-3);
    white-space: nowrap;
  }

  .no-results {
    color: var(--st-text-3);
    text-align: center;
    padding: 20px;
    font-size: 0.82rem;
  }
</style>
