<script lang="ts">
  import {
    FAMILY_LIST, PROFILE_FAMILIES, searchProfiles, profileToSection, familyToShape,
    type ProfileFamily, type SteelProfile,
  } from '../lib/data/steel-profiles';
  import { crossSectionPath } from '../lib/utils/section-drawing';
  import { t } from '../lib/i18n';

  interface Props {
    open: boolean;
    onselect: (profile: SteelProfile, section: { a: number; iz: number; b: number; h: number }) => void;
    onclose: () => void;
  }

  let { open, onselect, onclose }: Props = $props();

  let activeFamily = $state<ProfileFamily>('IPN');
  let searchQuery = $state('');

  let filtered = $derived(searchProfiles(searchQuery, activeFamily));

  // Representative profile for preview: use the middle-sized one from the active family
  const previewPath = $derived.by(() => {
    const profiles = PROFILE_FAMILIES[activeFamily];
    if (!profiles || profiles.length === 0) return null;
    // Pick a representative profile (middle of the list) for good proportions
    const rep = profiles[Math.floor(profiles.length / 2)];
    const shape = familyToShape(activeFamily);
    return crossSectionPath({
      shape,
      h: rep.h,
      b: rep.b,
      tw: rep.tw ?? 0,
      tf: rep.tf ?? 0,
      t: rep.t ?? 0,
    });
  });

  function handleSelect(p: SteelProfile) {
    onselect(p, profileToSection(p));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

{#if open}
  <div class="profile-overlay" role="dialog" aria-label={t('dialog.profileSelector')} onkeydown={handleKeydown}>
    <div class="profile-backdrop" onclick={onclose}></div>
    <div class="profile-modal">
      <div class="profile-header">
        <h2>{t('dialog.steelProfiles')}</h2>
        <button class="profile-close" onclick={onclose}>&#x2715;</button>
      </div>

      <div class="profile-tabs">
        {#each FAMILY_LIST as fam}
          <button
            class="tab-btn"
            class:active={activeFamily === fam}
            onclick={() => { activeFamily = fam; searchQuery = ''; }}
          >
            {fam}
          </button>
        {/each}
      </div>

      <!-- Section preview -->
      {#if previewPath}
        <div class="profile-preview">
          <svg viewBox="-90 -90 180 180" class="preview-svg">
            <path
              d={previewPath}
              fill="none"
              stroke="#4ecdc4"
              stroke-width="1.5"
              fill-rule="evenodd"
            />
          </svg>
        </div>
      {/if}

      <div class="profile-search">
        <input
          type="text"
          placeholder={t('search.profile')}
          bind:value={searchQuery}
        />
      </div>

      <div class="profile-table-wrap">
        <table class="profile-table">
          <thead>
            <tr>
              <th>{t('table.profile')}</th>
              <th>h (mm)</th>
              <th>b (mm)</th>
              <th>A (cm&#178;)</th>
              <th>Iz (cm&#8308;)</th>
              <th>Iy (cm&#8308;)</th>
              <th>kg/m</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as p}
              <tr onclick={() => handleSelect(p)} class="profile-row">
                <td class="name-cell">{p.name}</td>
                <td>{p.h}</td>
                <td>{p.b}</td>
                <td>{p.a.toFixed(1)}</td>
                <td>{p.iz.toFixed(0)}</td>
                <td>{p.iy.toFixed(0)}</td>
                <td>{p.weight.toFixed(1)}</td>
              </tr>
            {/each}
            {#if filtered.length === 0}
              <tr><td colspan="7" class="no-results">{t('search.noResults')}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  </div>
{/if}

<style>
  .profile-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .profile-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
  }

  .profile-modal {
    position: relative;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 8px;
    width: 680px;
    max-width: 95vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .profile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem 0.5rem;
  }

  .profile-header h2 {
    font-size: 1.05rem;
    color: #4ecdc4;
    margin: 0;
  }

  .profile-close {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .profile-close:hover {
    color: #eee;
  }

  .profile-tabs {
    display: flex;
    gap: 0.2rem;
    padding: 0.5rem 1.25rem;
    flex-wrap: wrap;
  }

  .tab-btn {
    padding: 0.3rem 0.7rem;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    background: transparent;
    color: #aaa;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    background: #0f3460;
    color: #eee;
  }

  .tab-btn.active {
    background: #e94560;
    border-color: #e94560;
    color: white;
  }

  /* Section shape preview */
  .profile-preview {
    display: flex;
    justify-content: center;
    padding: 0.25rem 1.25rem 0.4rem;
  }
  .preview-svg {
    width: 90px;
    height: 90px;
    background: rgba(15, 52, 96, 0.3);
    border-radius: 6px;
    border: 1px solid rgba(26, 74, 122, 0.4);
  }

  .profile-search {
    padding: 0 1.25rem 0.5rem;
  }

  .profile-search input {
    width: 100%;
    background: #0f3460;
    border: 1px solid #1a4a7a;
    border-radius: 4px;
    color: #eee;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
  }

  .profile-search input::placeholder {
    color: #666;
  }

  .profile-search input:focus {
    outline: none;
    border-color: #4ecdc4;
  }

  .profile-table-wrap {
    flex: 1;
    overflow-y: auto;
    padding: 0 1.25rem 1rem;
  }

  .profile-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .profile-table thead th {
    position: sticky;
    top: 0;
    background: #16213e;
    color: #888;
    font-weight: 500;
    text-align: right;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid #0f3460;
    font-size: 0.75rem;
  }

  .profile-table thead th:first-child {
    text-align: left;
  }

  .profile-row {
    cursor: pointer;
    transition: background 0.1s;
  }

  .profile-row:hover {
    background: #0f3460;
  }

  .profile-row td {
    padding: 0.35rem 0.5rem;
    text-align: right;
    color: #ccc;
    border-bottom: 1px solid rgba(15, 52, 96, 0.5);
  }

  .name-cell {
    text-align: left !important;
    font-weight: 500;
    color: #eee !important;
  }

  .no-results {
    text-align: center !important;
    color: #666 !important;
    padding: 2rem 0 !important;
  }
</style>
