/**
 * The command palette's search: every ribbon command with the stage and group it sits in, found by
 * the words of its label, accents and case aside. Pure.
 */
import type { ProStage, ProCmd } from './stages';

export interface PaletteEntry { cmd: ProCmd; label: string; path: string; enabled: boolean }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The ribbon's commands, then `extra` (what lives outside it), each once. */
export function paletteEntries(stages: readonly ProStage[], t: (k: string) => string, extra: ReadonlyArray<{ cmd: ProCmd; pathKey: string }> = []): PaletteEntry[] {
  const seen = new Set<string>();
  const out: PaletteEntry[] = [];
  for (const s of stages) for (const g of s.groups) for (const c of g.cmds) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({ cmd: c, label: c.label ?? t(c.labelKey), path: `${t(s.labelKey)} › ${t(g.labelKey)}`, enabled: c.enabled ? c.enabled() : true });
  }
  for (const x of extra) {
    if (seen.has(x.cmd.id)) continue;
    seen.add(x.cmd.id);
    out.push({ cmd: x.cmd, label: t(x.cmd.labelKey).replace(/…$/, ''), path: t(x.pathKey), enabled: x.cmd.enabled ? x.cmd.enabled() : true });
  }
  return out;
}

/** Entries whose label or path hold every word typed, the label matches first. */
export function searchPalette(entries: readonly PaletteEntry[], query: string): PaletteEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  const scored = entries.flatMap((e) => {
    const label = fold(e.label), all = `${label} ${fold(e.path)} ${fold(e.cmd.id)}`;
    if (!words.every((w) => all.includes(w))) return [];
    const score = words.reduce((s, w) => s + (label.startsWith(w) ? 3 : label.includes(w) ? 2 : 1), 0);
    return [{ e, score }];
  });
  return scored.sort((a, b) => b.score - a.score).map((x) => x.e);
}
