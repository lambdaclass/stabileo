const links = new Map<string, string>();
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
  forget(tab: string): void {
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
