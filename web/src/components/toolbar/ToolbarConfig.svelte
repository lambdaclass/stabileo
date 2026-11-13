<script lang="ts">
  import { axesStore } from '../../lib/axes/axes.svelte';
  import { upLabel } from '../../lib/axes/frame';
  import { uiStore, resultsStore } from '../../lib/store';
  import LocaleSelect from '../LocaleSelect.svelte';

  /**
   * The floor sizes worth offering, in metres.
   *
   * Round numbers an order of magnitude apart: a test frame, a building, a
   * site, a district. `updateGrid` draws only a patch around the view, and drops
   * the finest lines when zoomed far out, so a 10 km floor does not ask for
   * twenty thousand line segments.
   */
  const GRID_EXTENTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  import { authStore } from '../../lib/store/auth.svelte';
  import { usageConsent } from '../../lib/telemetry/consent.svelte';
  import { legalHref, USAGE_DATA_PATH } from '../../lib/legal/legal';
  import { t } from '../../lib/i18n';
  import { setLocale, OFFERED_LOCALES, i18n } from '../../lib/i18n/store.svelte';
  import { LOCALE_NAMES } from '../../lib/i18n/offered';
  import HelpTip from '../HelpTip.svelte';
  import UnitInput from '../UnitInput.svelte';
  import { toQ, unitQ } from '../../lib/store/display-units.svelte';
  import { announceDesignOn, DESIGN_LIMITS } from '../../lib/store/design-presence';

  /*
   * The grid is kept in metres and shown in the chosen length unit. The xz
   * label's translations carry "(m)" in their text, so that suffix is taken
   * off and the unit in use is written instead.
   */
  const gridSizeLabel = (is3D: boolean) =>
    `${is3D ? t('config.gridSizeXZ') : t('config.gridSize')} (${unitQ('length')})`;
  /** A floor extent in whole units: they are round numbers of metres, 20 to 10 000. */
  const extentLabel = (m: number) => String(Math.round(toQ(m, 'length')));

  /** When true, skip outer toggle and show content directly (used in PRO dropdown). */

  /**
   * `flat` — everything open, no accordions.
   *
   * These sections collapse because they used to be stacked in one narrow left
   * column where five of them competed for the same vertical space. In the
   * ribbon layout only ONE of them is ever mounted, in a panel that already
   * names it and that the user can widen, so a disclosure triangle just hides
   * what they explicitly asked to see.
   */
  let { inline = false, flat = false }: any = $props();

  let showConfig = $state(false);
  let showGridSub = $state(false);
  let showStructureSub = $state(false);
  let showResultsSub = $state(false);


  // Listen for tour events to auto-open/close config section
  $effect(() => {
    const openConfig = () => { showConfig = true; };
    const closeConfig = () => { showConfig = false; };
    window.addEventListener('stabileo-open-config', openConfig);
    window.addEventListener('stabileo-close-config', closeConfig);
    return () => {
      window.removeEventListener('stabileo-open-config', openConfig);
      window.removeEventListener('stabileo-close-config', closeConfig);
    };
  });

  function setUsageSharing(granted: boolean) {
    usageConsent.set(granted ? 'granted' : 'denied');
    if (authStore.isAuthenticated) void authStore.recordConsent('usage_analytics', granted).catch(() => {});
  }
