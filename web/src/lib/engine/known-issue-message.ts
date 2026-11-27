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

const WARNING_BANDS = new Set(['SH-MITC4-DISTORTION', 'SH-WARPED-MITC4', 'SH-WARPED-MITC9']);

export function knownIssueMessage(d: { code: string; phase?: string; value?: number; message: string; severity?: string; elementIds?: number[]; nodeIds?: number[] }): string {
  // A thermal load solved with a default it did not state (#407): `phase` names the default.
  if (d.code === 'thermal_default_assumed' && d.phase) {
    const key = `thermalDefault.${d.phase}`;
    const text = t(key);
    return text === key ? d.message : text;
  }
  if (d.code === 'known_issue' && d.phase === 'BU-UNRESOLVED-MODE') {
    const modes = [...d.message.matchAll(/mode (\d+) \(/g)].map(m => m[1]).join(', ');
    if (t('knownIssue.BU-UNRESOLVED-MODE') === 'knownIssue.BU-UNRESOLVED-MODE') return d.message;
    const text = tp('knownIssue.BU-UNRESOLVED-MODE', { modes: modes || '?' });
    return d.value !== undefined ? `${text} (#${d.value})` : text;
  }
  // A cable whose own weight gives most of its tension (#527): `value` the largest share.
  if (d.code === 'cable_self_weight_tension') {
    if (t('cableDiag.selfWeight') === 'cableDiag.selfWeight') return d.message;
    return tp('cableDiag.selfWeight', { pct: Math.round(100 * Math.min(1, d.value ?? 1)) });
  }
  if (d.code === 'contact_state_invalid' && d.phase === 'element_behavior') return tp('analysisValidity.member', { elements: d.elementIds?.join(', ') || '?' });
  if (d.code === 'contact_tolerance_invalid') return t('analysisValidity.contactTolerance');
  if (d.code === 'cable_analysis_required' || d.code === 'contact_state_invalid') {
    const key = d.code === 'cable_analysis_required' ? 'analysisValidity.cable' : 'analysisValidity.contact';
    return tp(key, { elements: d.elementIds?.join(', ') || d.nodeIds?.join(', ') || '?' });
  }
  if (d.code === 'plastic_capacity_missing') {
    if (t('plasticDiag.noCapacity') === 'plasticDiag.noCapacity' || d.elementIds?.length !== 1 || d.value === undefined) return d.message;
    return tp('plasticDiag.noCapacity', { member: d.elementIds[0]!, section: d.value });
  }
  if (d.code !== 'known_issue' || !d.phase) return d.message;
  const key = `knownIssue.${d.phase}${WARNING_BANDS.has(d.phase) && d.severity === 'warning' ? '.warning' : ''}`;
  const text = t(key);
  if (text === key) return d.message;
  const sentence = d.value !== undefined ? `${text} (#${d.value})` : text;
  return d.phase === 'PL-3D-CERTIFICATE-MISMATCH' ? `${sentence}\n${d.message}` : sentence;
}
