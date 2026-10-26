/**
 * The panel view each stage was last on, so returning to a stage returns to the command last
 * used in it. A stage used to land on its home every time (Model on Nodes, Analyse on Results),
 * so a reader who had opened Sections, looked at the results and came back found Nodes again
 * and had to find their place twice. Read by both surfaces that draw the stages (the desktop
 * ribbon, the phone's stage list). Design keeps its own place (`deskUi.tab`), so it is not here.
 */
import { PRO_TAB_STAGE } from './stages';
import { uiStore } from '../store';

const last = $state<Record<string, string>>({});

/** Note the panel view now open, under the stage it belongs to. */
export function rememberStageTab(tab: string): void {
  const stage = PRO_TAB_STAGE[tab];
  if (stage && stage !== 'design' && last[stage] !== tab) last[stage] = tab;
}

/** Where entering `stage` lands: the view it was last on, else its home. */
export function stageEntryTab(stage: string, home: string): string {
  return last[stage] ?? home;
}

/** A new project starts every stage on its home. */
export function forgetStageTabs(): void {
  for (const k of Object.keys(last)) delete last[k];
}
uiStore.onSessionReset(forgetStageTabs);
