/**
 * Whether a project holds work of the normative design: bars on a member, detailed assemblies or
 * decisions kept. Opened with design off in PRO's settings, such a project is offered to turn it
 * on (`noteDesignHeldIfOff`); it is never turned on for the reader, and nothing of it is dropped.
 */
import { modelStore } from './model.svelte';
import { uiStore } from './ui.svelte';
import { t } from '../i18n';

export function projectHoldsDesign(): boolean {
  const m = modelStore.model;
  for (const e of m.elements.values()) if ((e as { reinforcement?: unknown }).reinforcement) return true;
  if ((m.detailing?.assemblies.length ?? 0) > 0) return true;
  const d = m.designDecisions;
  return !!d && (d.locked.length > 0 || Object.keys(d.proposals).length > 0 || d.copies.length > 0);
}

/** The projects already told about in this session: a tab switched back to says nothing again. */
const told = new Set<string>();

/**
 * A PRO project opened with design off that holds design: say so, with the switch at hand.
 *
 * Said once a project is the one on screen, from every load path (`onProjectOpened`: a .ded, the
 * autosave, a tab, a share link), with the mode the project was opened in (the UI's may not be set
 * yet). Once per project and session.
 */
export function noteDesignHeldIfOff(analysisMode: string | undefined = uiStore.analysisMode): void {
  if (analysisMode !== 'pro' || uiStore.designInPro || !projectHoldsDesign()) return;
  const key = `${modelStore.model.name}|${modelStore.elements.size}|${modelStore.nodes.size}`;
  if (told.has(key)) return;
  told.add(key);
  uiStore.toast(t('design.heldWhileOff'), 'info', 'enable-design');
}

/**
 * The module's open limits, listed under the switch (`config.designLimits.<key>`). Each one is a
 * limitation the chain declares or measured, so turning design on says what it does not cover yet
 * rather than a general warning.
 */
export const DESIGN_LIMITS = ['coldFormed', 'e4', 'ec3', 'punching', 'joints', 'torsion', 'spectrum', 'issue'] as const;

/** Design was just turned on by the reader: say it is in development and where its limits are. */
export function announceDesignOn(): void {
  uiStore.toast(t('config.designEnabledNotice'), 'info');
}

/** The place of design a link asked for while design was off, opened if the reader turns it on. */
let askedTab: string | null = null;

/**
 * A link that names a place of design (a post's embed, `?proTab=design`) while design is off in
 * PRO's settings: say so and offer to turn it on for this visit. Nothing is turned on until the
 * reader answers (`enableDesignForLink`); left unanswered, the link lands where design off lands.
 */
export function askDesignForLink(tab: string): void {
  askedTab = tab;
  uiStore.toast(t('design.linkAsks'), 'info', 'enable-design-link', true);
}

/** The reader's yes to `askDesignForLink`: design on for the session, and the place it asked for. */
export function enableDesignForLink(): void {
  uiStore.designForSession();
  announceDesignOn();
  if (askedTab) uiStore.proActiveTab = askedTab;
  askedTab = null;
}
