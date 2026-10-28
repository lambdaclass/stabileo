/**
 * What differs between the browser and the desktop app (`desktop/`, `vite build --mode desktop`).
 *
 * Every branch tests `import.meta.env.VITE_DESKTOP` where it is used: Vite replaces it at build
 * time, so the browser bundle drops the desktop code and never loads the Tauri packages.
 */

export function isDesktop(): boolean {
  return import.meta.env.VITE_DESKTOP === '1';
}

/** Open a project: the browser clicks the page's file input, the desktop app shows the native dialog. */
export function chooseProjectFile(input: HTMLInputElement | undefined | null): void {
  if (import.meta.env.VITE_DESKTOP === '1') {
    void import('./desktop.svelte').then((m) => m.openProjectDialog());
    return;
  }
  input?.click();
}

/** Save as, on the desktop app; null in the browser, which has no file to save over. */
export function desktopSaveAs(): boolean {
  if (import.meta.env.VITE_DESKTOP === '1') {
    void import('./desktop.svelte').then((m) => m.runCommand('save_as'));
    return true;
  }
  return false;
}
