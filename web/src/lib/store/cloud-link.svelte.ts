type Link = { id: string; revision: number; base: string; cloud: string; edit: number };

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
  /** The name to save: the document's own when it was renamed here, else the cloud's, which a rename from the list may have changed. */
  name(tab: string, current: string): string {
    const link = links.get(tab);
    return link && current === link.base ? link.cloud : current;
  },
  /** Whether the tab's document is unchanged since it was last opened from or saved to the cloud, `edit` being the model's edit count now. */
  synced(tab: string, edit: number): boolean {
    return links.get(tab)?.edit === edit;
  },
  /** `base` is the name the tab's document had, `cloud` the name the project has there. */
  set(tab: string, id: string, revision: number, base: string, cloud: string, edit: number): void {
    links.set(tab, { id, revision, base, cloud, edit });
    version += 1;
  },
  /** Moves on each time the tab gets another document; a link answered for an older one is dropped. */
  generation(tab: string): number {
    return generations.get(tab) ?? 0;
  },
  setIf(tab: string, generation: number, id: string, revision: number, base: string, cloud: string, edit: number): void {
    if ((generations.get(tab) ?? 0) === generation) this.set(tab, id, revision, base, cloud, edit);
  },
  /** Whether `current` is still the name the tab's document had from the cloud, not one given here. */
  keepsCloudName(tab: string, current: string): boolean {
    return links.get(tab)?.base === current;
  },
  renamed(id: string, name: string, from: number | undefined, to: number, activeTab: string): void {
    for (const [tab, link] of links) {
      if (link.id !== id) continue;
      link.cloud = name;
      if (tab === activeTab) link.base = name;
      if (from !== undefined && link.revision === from && to === from + 1) link.revision = to;
    }
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
