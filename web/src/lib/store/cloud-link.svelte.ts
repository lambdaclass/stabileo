type Link = { id: string; revision: number };

const links = new Map<string, Link>();
const generations = new Map<string, number>();
let version = $state(0);

/** Which cloud project, at which revision, each tab's open document was opened from or saved to. */
export const cloudLinks = {
  get(tab: string): string | null {
    void version;
    return links.get(tab)?.id ?? null;
  },
  /** Moves only when this tab opens or saves the project: a newer listing must not let an older document overwrite it. */
  revision(tab: string): number | undefined {
    return links.get(tab)?.revision;
  },
  set(tab: string, id: string, revision: number): void {
    links.set(tab, { id, revision });
    version += 1;
  },
  /** Moves on each time the tab gets another document; a link answered for an older one is dropped. */
  generation(tab: string): number {
    return generations.get(tab) ?? 0;
  },
  setIf(tab: string, generation: number, id: string, revision: number): void {
    if ((generations.get(tab) ?? 0) === generation) this.set(tab, id, revision);
  },
  advance(id: string, from: number, to: number): void {
    for (const link of links.values()) if (link.id === id && link.revision === from) link.revision = to;
  },
  forget(tab: string): void {
    generations.set(tab, (generations.get(tab) ?? 0) + 1);
    if (links.delete(tab)) version += 1;
  },
  forgetProject(id: string): void {
    for (const [tab, link] of links) if (link.id === id) links.delete(tab);
    version += 1;
  },
  clear(): void {
    links.clear();
    version += 1;
  },
};
