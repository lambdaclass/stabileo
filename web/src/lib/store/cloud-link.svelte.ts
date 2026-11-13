/**
 * Which saved project each tab's model came from, for which account, and the revision of it the
 * tab last received. Another project in a tab (a new one, a file, an example, a generated
 * structure) ends its link, so saving it never overwrites the project the tab held before;
 * switching tabs keeps every tab's own.
 */
export type Link = { id: string; account: string | null; revision: number };

const links = new Map<string, Link>();
const generations = new Map<string, number>();
let version = $state(0);

/** What a save started now compares with when it ends: the link moves only if the tab still holds this project. */
function generationOf(tab: string): number {
  return generations.get(tab) ?? 0;
}

function linkOf(tab: string, account: string | null): Link | null {
  void version;
  const link = links.get(tab);
  return link && link.account === account ? link : null;
}

export const cloudLink = {
  get(tab: string, account: string | null): string | null {
    return linkOf(tab, account)?.id ?? null;
  },

  link: linkOf,

  generation: generationOf,

  set(tab: string, link: Link, generation = generationOf(tab)): void {
    if (generationOf(tab) !== generation) return;
    links.set(tab, link);
    version += 1;
  },

  /** A change that left the content alone (a rename) moves every tab that held the revision before it. */
  advance(id: string, from: number, to: number): void {
    for (const [tab, link] of links) if (link.id === id && link.revision === from) links.set(tab, { ...link, revision: to });
    version += 1;
  },

  forgetTab(tab: string): void {
    generations.set(tab, generationOf(tab) + 1);
    links.delete(tab);
    version += 1;
  },

  forgetProject(id: string): void {
    for (const [tab, link] of links) if (link.id === id) links.delete(tab);
    version += 1;
  },
};
