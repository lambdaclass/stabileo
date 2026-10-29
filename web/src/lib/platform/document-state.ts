/**
 * Which file each tab belongs to, and whether it has changes that are not in that file.
 *
 * A tab's content is compared by fingerprint (`fingerprint()`, a hash of what Save would write)
 * against its baseline: the fingerprint when it was opened, saved, created or restored. Every tab
 * gets its baseline when it first appears, and "unsaved" is decided when asked, from the content
 * as it is then, never from a timer that may not have fired yet. A tab with no baseline counts as
 * unsaved: being wrong that way costs a question, the other way a project.
 *
 * Kept free of the stores and of Tauri so it can be tested on its own (`desktop.svelte.ts` wires
 * it to the tabs).
 */

export interface TabDoc {
  id: string;
  fingerprint: () => number;
  generation?: number;
}

export class DocumentState {
  generation = 0;
  private readonly paths = new Map<string, string>();
  private readonly baselines = new Map<string, number>();

  /** The file the tab was opened from or last saved to, if any. */
  path(id: string): string | undefined {
    return this.paths.get(id);
  }

  /** Give new tabs their baseline (their content now), and forget tabs that are gone. */
  track(tabs: readonly TabDoc[]): void {
    this.prune(tabs);
    for (const t of tabs) if (!this.baselines.has(t.id)) this.baselines.set(t.id, t.fingerprint());
  }

  prune(tabs: readonly TabDoc[]): void {
    const live = new Set(tabs.map((t) => t.id));
    for (const id of [...this.baselines.keys()]) if (!live.has(id)) this.baselines.delete(id);
    for (const id of [...this.paths.keys()]) if (!live.has(id)) this.paths.delete(id);
  }

  /**
   * A session file replaced every tab. Its tabs may reuse ids the replaced ones had, so nothing of
   * theirs carries over: no tab has a file (Save asks where), and each starts clean as restored.
   */
  replaceAll(tabs: readonly TabDoc[]): void {
    this.generation++;
    this.paths.clear();
    this.baselines.clear();
    this.track(tabs);
  }

  /** The tab's content is what its file now holds (just opened or saved); `path` when it has one. */
  markSaved(tab: TabDoc, path?: string): void {
    if (tab.generation !== undefined && tab.generation !== this.generation) return;
    this.baselines.set(tab.id, tab.fingerprint());
    if (path !== undefined) this.paths.set(tab.id, path);
  }

  /**
   * The same content, seen through another representation: a tab's stored snapshot and the live
   * model it is loaded into may serialize differently. When the tab was clean as `before`, it stays
   * clean as `after`.
   */
  rebase(id: string, before: number, after: number): void {
    if (this.baselines.get(id) === before) this.baselines.set(id, after);
  }

  isUnsaved(tab: TabDoc): boolean {
    const base = this.baselines.get(tab.id);
    return base === undefined || tab.fingerprint() !== base;
  }

  unsaved(tabs: readonly TabDoc[]): TabDoc[] {
    return tabs.filter((t) => this.isUnsaved(t));
  }
}

/** cyrb53: enough to tell a project from its saved copy without keeping the text. */
export function hash(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
