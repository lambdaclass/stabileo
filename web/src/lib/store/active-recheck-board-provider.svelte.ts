import { boardCovered, recheckBanner } from './recheck-banner.svelte';

export const showLocalBanner = (hosted: boolean) => !hosted || boardCovered();

export function observeRecheckBoard(hosted: () => boolean, read: () => typeof recheckBanner): void {
  $effect(() => {
    if (hosted()) Object.assign(recheckBanner, read());
  });
  $effect(() => () => {
    if (!hosted()) return;
    recheckBanner.text = null;
    recheckBanner.alert = false;
  });
}
