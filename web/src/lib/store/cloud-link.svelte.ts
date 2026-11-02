const links = new Map<string, string>();
const generations = new Map<string, number>();
let version = $state(0);

/** Which cloud project each tab's open document was opened from or saved to. */
export const cloudLinks = {
  get(tab: string): string | null {
    void version;
    return links.get(tab) ?? null;
  },
  set(tab: string, id: string): void {
    links.set(tab, id);
    version += 1;
  },
  /** Moves on each time the tab gets another document; a link answered for an older one is dropped. */
  generation(tab: string): number {
    return generations.get(tab) ?? 0;
  },
  setIf(tab: string, generation: number, id: string): void {
    if ((generations.get(tab) ?? 0) === generation) this.set(tab, id);
  },
  forget(tab: string): void {
    generations.set(tab, (generations.get(tab) ?? 0) + 1);
    if (links.delete(tab)) version += 1;
  },
  forgetProject(id: string): void {
    for (const [tab, linked] of links) if (linked === id) links.delete(tab);
    version += 1;
  },
  clear(): void {
    links.clear();
    version += 1;
  },
};
