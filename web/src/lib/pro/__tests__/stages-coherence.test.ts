/**
 * PRO's command tree has to stay coherent, because two surfaces draw it.
 *
 * # What this is guarding
 *
 * `buildProStages` is read by the desktop ribbon AND by the phone panel's
 * command grid. That is the whole point — a command added in one line reaches
 * both — but it also means a malformed entry now breaks two places, and one of
 * them is a phone nobody runs the suite against.
 *
 * PRO is under active development on other branches. The realistic failure is
 * not someone editing this file carelessly; it is someone adding a genuinely
 * good command and not knowing that `PRO_TAB_STAGE` is a second list that has
 * to learn about it. When that happens the ribbon looks fine, and the phone
 * silently shows the wrong stage — `PRO_TAB_STAGE[tab] ?? 'model'` falls back,
 * so the bar names MODELO while the panel shows a diagnostics table.
 *
 * Every assertion below is a rule a new command has to satisfy, and the message
 * says what to do about it rather than only what is wrong.
 */

import { describe, it, expect } from 'vitest';
import { buildProStages, proCmds, PRO_TAB_STAGE, type ProStage } from '../stages';

/** The context shape the real callers pass; values do not matter here. */
const stages: ProStage[] = buildProStages({
  solved: true,
  canSolve: true,
  canReport: true,
  onSolve: () => {},
  onReport: () => {},
});

const cmds = proCmds(stages);

describe('PRO stages', () => {
  it('every command id is unique across the whole tree', () => {
    /*
     * Both surfaces key by id — `data-testid="pm-cmd-{id}"` on the phone and
     * `pr-cmd-{id}` on the desktop — so a duplicate makes a Playwright locator
     * ambiguous and makes "which one is lit" undecidable.
     */
    const ids = cmds.map((c) => c.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `duplicated command ids: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
  });

  it('every command that names a tab has that tab mapped to a stage', () => {
    /*
     * THE rule this file exists for. Without the mapping the phone's bar names
     * whichever stage `?? 'model'` falls back to, while the panel shows the tab
     * you asked for — one control claiming you are somewhere you are not.
     */
    const unmapped = cmds
      .filter((c) => c.tab && PRO_TAB_STAGE[c.tab] === undefined)
      .map((c) => `${c.id} → tab "${c.tab}"`);
    expect(
      unmapped,
      `these commands open a tab that PRO_TAB_STAGE does not know about:\n  ${unmapped.join('\n  ')}\n` +
        'Add the tab to PRO_TAB_STAGE in lib/pro/stages.ts, mapped to the stage it belongs to.',
    ).toEqual([]);
  });

  it('every stage lands somewhere real', () => {
    /*
     * `home` is where picking a stage takes you. If it names a tab no command
     * in that stage opens, the stage selector moves the panel somewhere its own
     * grid cannot get back to.
     */
    for (const s of stages) {
      const tabs = s.groups.flatMap((g) => g.cmds).map((c) => c.tab).filter(Boolean);
      expect(
        s.home,
        `stage "${s.id}" goes home to "${s.home}", which none of its commands opens`,
      ).toSatisfy((home: string) => tabs.includes(home) || PRO_TAB_STAGE[home] === s.id);
    }
  });

  it('every mapped tab belongs to a stage that exists', () => {
    const ids = new Set(stages.map((s) => s.id));
    const orphans = Object.entries(PRO_TAB_STAGE)
      // '' is deliberate: Project belongs to no stage. See the module.
      .filter(([, stage]) => stage !== '' && !ids.has(stage))
      .map(([tab, stage]) => `${tab} → "${stage}"`);
    expect(orphans, `mapped to stages that do not exist: ${orphans.join(', ')}`).toEqual([]);
  });

  it('every command can be drawn — it has a label, and an icon or a symbol', () => {
    /*
     * The phone grid draws an icon and a short name in an 87 px cell. A command
     * with neither renders as an empty box, which is how it would ship: it
     * looks like a spacing bug rather than a missing field.
     */
    const undrawable = cmds
      .filter((c) => !c.labelKey || (!c.icon && !c.label))
      .map((c) => c.id);
    expect(
      undrawable,
      `these would render as blank cells on a phone: ${undrawable.join(', ')}. ` +
        'Give each an `icon` (see ribbon/Icon.svelte) or a `label` symbol.',
    ).toEqual([]);
  });

  it('no group is empty, and no stage is', () => {
    // An empty group draws a heading with nothing under it.
    for (const s of stages) {
      expect(s.groups.length, `stage "${s.id}" has no groups`).toBeGreaterThan(0);
      for (const g of s.groups) {
        expect(g.cmds.length, `group "${s.id}/${g.id}" has no commands`).toBeGreaterThan(0);
      }
    }
  });
});
