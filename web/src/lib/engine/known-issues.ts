/**
 * The engine's known-issue warnings (engine/src/known_issues.rs), and its warnings that a thermal
 * load was solved with a default it did not state, in the reader's language.
 *
 * The engine writes them in English for the API and the MCP server, with the finding's id in
 * `phase` and the issue number in `value`. The app shows its own sentence for the id, so a
 * Spanish or Portuguese reader is warned in their language; an id the app does not know yet
 * keeps the engine's English rather than nothing.
 */
import { t, tp } from '../i18n';

export function knownIssueMessage(d: { code: string; phase?: string; value?: number; message: string }): string {
  // A thermal load solved with a default it did not state (#407): `phase` names the default.
  if (d.code === 'thermal_default_assumed' && d.phase) {
    const key = `thermalDefault.${d.phase}`;
    const text = t(key);
    return text === key ? d.message : text;
  }
  // A cable whose own weight gives most of its tension (#527): `value` the largest share.
  if (d.code === 'cable_self_weight_tension') {
    if (t('cableDiag.selfWeight') === 'cableDiag.selfWeight') return d.message;
    return tp('cableDiag.selfWeight', { pct: Math.round(100 * Math.min(1, d.value ?? 1)) });
  }
  if (d.code !== 'known_issue' || !d.phase) return d.message;
  const key = `knownIssue.${d.phase}`;
  const text = t(key);
  if (text === key) return d.message;
  return d.value !== undefined ? `${text} (#${d.value})` : text;
}
