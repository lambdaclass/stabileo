/**
 * The boundary where engine messages become sentences.
 *
 * Pure engines return `EngineMessage` — `{ key, params }` with raw numbers. Every surface
 * that shows one to a human goes through here: the PRO panels, the PDF report, the DXF
 * annotation writer and the XLSX bar schedule. That is the whole point of the split; if a
 * fifth surface appears it gets locale-correct text for free.
 *
 * Numbers are formatted with `Intl.NumberFormat` against the active locale, so the same
 * message reads "Wi = 1,234.5 kN" in English and "Wi = 1.234,5 kN" in Spanish without the
 * engine knowing either convention exists.
 */
import { isMessage, type EngineMessage } from '../codes/message';
import { AMBIGUOUS_ROLLER_Z } from '../engine/support-dofs-3d';
import { DIAGRAM_EXTREMA_UNAVAILABLE } from '../engine/member-diagram';
import type { StructuredDiagnostic } from '../engine/types';
import { asCodedRefusal, CodedRefusal, refusalDiagnostic } from '../engine/containment-error';
import { i18n, registerFeatureDictionaries, tAt } from './store.svelte';
import type { Locale } from './offered';
import { axesStore } from '../axes/axes.svelte';
import { axisTokensIn } from '../axes/case-names';

/**
 * Locale-aware number formatting for message parameters.
 *
 * Integers stay integers — "3 element(s)" must not become "3.0". Non-integers keep up to
 * three decimals, which is the most any engine currently emits (kPa to 3 dp).
 */
function formatNumber(value: number, locale: string): string {
  if (!Number.isFinite(value)) return String(value);
  const decimals = Number.isInteger(value)
    ? 0
    : Math.min(3, (String(value).split('.')[1] ?? '').length);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Translate one engine message into the active locale. */
export function te(m: EngineMessage): string {
  return teAt(m, i18n.locale);
}

/** Translate a list, preserving order. */
export function teAll(messages: readonly EngineMessage[]): string[] {
  return messages.map(te);
}

/**
 * Translate for a non-reactive consumer at an explicit locale.
 *
 * The report and export writers run outside a component, and a user may want a Spanish PDF
 * while reading an English UI. They pass the locale in rather than reading the store.
 */
export function teAt(m: EngineMessage, locale: string): string {
  const raw = AXES_IN_TEXT.has(m.key) ? axisTokensIn(axesStore.frame, tAt(m.key, locale)) : tAt(m.key, locale);
  if (!m.params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = m.params![name];
    if (v === undefined || v === null) return whole;
    // Nested messages resolve inside-out, so a sentence can quote a regulation label.
    if (isMessage(v)) return teAt(v, locale);
    if (typeof v === 'number') return formatNumber(v, locale);
    return AXIS_PARAMS.has(name) ? axisTokensIn(axesStore.frame, String(v)) : String(v);
  });
}

/** Parameters the load generators fill with a model axis ("X", "+Y"): read in the user's axes. */
const AXIS_PARAMS = new Set(['dir', 'dirX', 'dirY', 'axis']);
const AXES_IN_TEXT = new Set(['loadPlan.derivation.adjacentSpans']);

/** Translate a list at an explicit locale. */
export function teAllAt(messages: readonly EngineMessage[], locale: string): string[] {
  return messages.map((m) => teAt(m, locale));
}

/**
 * Render a load combination's factors with the reader's decimal separator.
 *
 * `LoadCombinationSpec.label` is canonical notation with a point, because it is also the
 * identity a stored combination is matched on. CIRSOC prints `1,2 D + 1,6 L`, and an
 * Argentine engineer reading `1.2 D` sees a different number, so the separator is applied
 * here rather than baked into the engine.
 *
 * Only the numeric coefficients are touched; the load symbols D, L, W, E are the
 * regulation's own notation and are not translated.
 */
export function formatCombinationLabel(
  spec: { terms: ReadonlyArray<{ symbol: string; factor: number }> },
  locale: string,
): string {
  const nf = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  });
  return spec.terms
    .filter((term) => term.factor !== 0)
    .map((term) => `${nf.format(term.factor)} ${term.symbol}`)
    .join(' + ');
}

const PDELTA_PHYSICAL_RESIDUAL = 'svc.engine.pdeltaPhysicalResidual';
const pdeltaPhysicalResidual: Record<Locale, string> = {
  de: "Die P-Delta-Ergebnisse wurden zurückgehalten, weil das physikalische Residuum der freien Freiheitsgrade die geforderte Toleranz nicht einhielt.",
  en: "P-Delta results were withheld because the physical free-DOF residual did not meet the requested tolerance.",
  es: "Se retuvieron los resultados de P-Delta porque el residuo físico en los grados de libertad libres no cumplió la tolerancia solicitada.",
  fr: "Les résultats P-Delta ont été retenus, car le résidu physique aux degrés de liberté libres ne satisfait pas la tolérance demandée.",
  hu: "A P-Delta-eredmények nem érhetők el, mert a szabad szabadságfokok fizikai maradéka nem teljesítette a kért tűrést.",
  pt: "Os resultados de P-Delta foram retidos porque o resíduo físico nos graus de liberdade livres não atendeu à tolerância solicitada.",
  tr: "Serbestlik derecelerindeki fiziksel artık istenen toleransı karşılamadığı için P-Delta sonuçları verilmedi.",
  zh: "自由自由度的物理残差未达到要求的容差，因此未提供 P-Delta 结果。",
};
registerFeatureDictionaries(Object.fromEntries(
  Object.entries(pdeltaPhysicalResidual).map(([locale, message]) => [locale, { [PDELTA_PHYSICAL_RESIDUAL]: message }]),
));

const REDUCED_STIFFNESS_RANK = 'svc.engine.reducedStiffnessRank';
const reducedStiffnessRank: Record<Locale, string> = {
  de: 'Der Rang der reduzierten Steifigkeitsmatrix lässt sich mit der Genauigkeit der Assemblierung nicht bestimmen. Prüfen Sie Freigaben, Auflager, Federn und Kopplungen auf einen Mechanismus.',
  en: 'The reduced stiffness rank cannot be resolved at assembly precision. Check member releases, supports, springs and constraints for a mechanism.',
  es: 'El rango de la rigidez reducida no se puede determinar con la precisión del ensamblaje. Revisá las liberaciones, los apoyos, los resortes y las restricciones para detectar un mecanismo.',
  fr: 'Le rang de la raideur réduite ne peut pas être déterminé à la précision de l’assemblage. Vérifiez les relâchements, les appuis, les ressorts et les contraintes pour détecter un mécanisme.',
  hu: 'A redukált merevségi mátrix rangja az összeállítás pontosságával nem határozható meg. Mechanizmus kereséséhez ellenőrizze a rúdvégi feloldásokat, a támaszokat, a rugókat és a kényszereket.',
  pt: 'Não é possível determinar o posto da rigidez reduzida com a precisão da montagem. Verifique as liberações, os apoios, as molas e as restrições para identificar um mecanismo.',
  tr: 'İndirgenmiş rijitlik matrisinin mertebesi montaj hassasiyetiyle belirlenemiyor. Bir mekanizma olup olmadığını görmek için eleman mafsallarını, mesnetleri, yayları ve kısıtları kontrol edin.',
  zh: '在组装精度下无法判定约化刚度矩阵的秩。请检查杆端释放、支座、弹簧和约束是否形成机构。',
};
registerFeatureDictionaries(Object.fromEntries(
  Object.entries(reducedStiffnessRank).map(([locale, message]) => [locale, { [REDUCED_STIFFNESS_RANK]: message }]),
));

const CONSTRAINT_STIFFNESS_RANK = 'svc.engine.constraintStiffnessRank';
const CONSTRAINT_STIFFNESS_NODES = 'svc.engine.constraintStiffnessNodes';
const constraintStiffnessRank: Record<Locale, [string, string]> = {
  de: ['Bei der Reduktion der Kopplungen heben sich Steifigkeitsbeiträge{where} auf. Wegen Rundung lässt sich die verbleibende Steifigkeit nicht bestimmen. Verringern Sie extreme Steifigkeitsunterschiede oder überarbeiten Sie die Kopplungen.', ' an den Knoten {nodes}'],
  en: ['Constraint reduction cancels stiffness contributions{where}. Rounding prevents resolving the remaining stiffness. Reduce extreme stiffness contrasts or revise the constraints.', ' at nodes {nodes}'],
  es: ['La reducción de las restricciones cancela aportes de rigidez{where}. El redondeo impide determinar la rigidez restante. Reducí los contrastes extremos de rigidez o revisá las restricciones.', ' en los nodos {nodes}'],
  fr: ['La réduction des contraintes annule des contributions à la raideur{where}. L’arrondi empêche de déterminer la raideur restante. Réduisez les contrastes extrêmes de raideur ou révisez les contraintes.', ' aux nœuds {nodes}'],
  hu: ['A kényszerek redukciója kioltja a merevségi hozzájárulásokat{where}. A kerekítés miatt a fennmaradó merevség nem határozható meg. Csökkentse a szélsőséges merevségkülönbségeket, vagy módosítsa a kényszereket.', ' a(z) {nodes} csomópontokban'],
  pt: ['A redução das restrições cancela contribuições de rigidez{where}. O arredondamento impede determinar a rigidez restante. Reduza os contrastes extremos de rigidez ou revise as restrições.', ' nos nós {nodes}'],
  tr: ['Kısıtların indirgenmesi{where} rijitlik katkılarını birbirini götürecek şekilde birleştiriyor. Yuvarlama kalan rijitliğin belirlenmesini engelliyor. Aşırı rijitlik farklarını azaltın veya kısıtları gözden geçirin.', ' {nodes} düğümlerinde'],
  zh: ['约束消元使刚度贡献{where}相互抵消。舍入误差导致剩余刚度无法判定。请减小过大的刚度差异或调整约束。', '在节点 {nodes} 处'],
};
registerFeatureDictionaries(Object.fromEntries(
  Object.entries(constraintStiffnessRank).map(([locale, [message, nodes]]) => [locale, {
    [CONSTRAINT_STIFFNESS_RANK]: message,
    [CONSTRAINT_STIFFNESS_NODES]: nodes,
  }]),
));

const AXIAL_JOINT_MECHANISM = 'svc.engine.axialJointMechanism';
const axialJointMechanism: Record<Locale, string> = {
  de: 'Am Knoten {node} liegt ein Mechanismus vor. Der Knoten kann sich verschieben, ohne die angeschlossenen Fachwerkstäbe zu dehnen oder die Lagerbedingungen zu verletzen.',
  en: 'There is a mechanism at joint {node}. The joint can translate without straining its attached truss members or violating the restraints.',
  es: 'Hay un mecanismo en el nudo {node}. El nudo puede desplazarse sin deformar las barras articuladas conectadas ni violar las restricciones.',
  fr: 'Le nœud {node} présente un mécanisme. Il peut se déplacer sans déformer les barres de treillis connectées ni violer les contraintes.',
  hu: 'A(z) {node} csomópontnál mechanizmus van. A csomópont elmozdulhat a kapcsolódó rácsrudak alakváltozása és a kényszerek megsértése nélkül.',
  pt: 'Há um mecanismo no nó {node}. O nó pode se deslocar sem deformar as barras de treliça ligadas a ele e sem violar as restrições.',
  tr: '{node} düğümünde bir mekanizma var. Düğüm, bağlı kafes çubuklarını deforme etmeden ve kısıtları ihlal etmeden ötelenebilir.',
  zh: '节点 {node} 处存在机构。该节点可以平移，而不使相连的桁架杆产生应变，也不违反约束。',
};
registerFeatureDictionaries(Object.fromEntries(
  Object.entries(axialJointMechanism).map(([locale, message]) => [locale, { [AXIAL_JOINT_MECHANISM]: message }]),
));

const AXIAL_JOINT_REASON = /^the structure is a mechanism at nodes \[(\d+)\]: a translation of this joint leaves all attached trusses unstrained and satisfies the restraints$/;

const FRAME_SWING_MECHANISM = 'svc.engine.frameSwingMechanism';
const frameSwingMechanism: Record<Locale, string> = {
  de: 'Am Knoten {node} liegt ein Mechanismus vor. Ein Stab kann sich um ein Gelenkende drehen, ohne sich zu verformen oder seine Lagerbedingungen zu verletzen.',
  en: 'There is a mechanism at joint {node}. A frame member can rotate about a released end without strain or movement at its restraints.',
  es: 'Hay un mecanismo en el nudo {node}. Una barra puede girar alrededor de un extremo liberado sin deformarse ni mover sus restricciones.',
  fr: 'Le nœud {node} présente un mécanisme. Une barre peut pivoter autour d’une extrémité articulée sans se déformer ni déplacer ses appuis.',
  hu: 'A(z) {node} csomópontnál mechanizmus van. Egy rúd a csuklós vége körül alakváltozás és a megtámasztások elmozdulása nélkül elfordulhat.',
  pt: 'Há um mecanismo no nó {node}. Uma barra pode girar em torno de uma extremidade liberada sem se deformar nem deslocar seus apoios.',
  tr: '{node} düğümünde bir mekanizma var. Bir çubuk, şekil değiştirmeden veya mesnetlerini hareket ettirmeden mafsallı ucu etrafında dönebilir.',
  zh: '节点 {node} 处存在机构。一根框架杆可绕释放端转动，杆件无应变，约束处无位移。',
};
registerFeatureDictionaries(Object.fromEntries(
  Object.entries(frameSwingMechanism).map(([locale, message]) => [locale, { [FRAME_SWING_MECHANISM]: message }]),
));

const FRAME_SWING_REASON = /^the structure is a mechanism at nodes \[(\d+)\]: a frame can swing about a released end without straining its members or moving its restraints$/;

const CONSTRAINT_RANK_REASON = /^the structure is a mechanism or so close to one that its stability cannot be decided in double precision(?: at nodes (\[[0-9, ]+\]))?: constraint reduction cancels stiffness contributions whose rounding is too large to resolve the remaining stiffness; reduce extreme stiffness contrasts or revise the constraints$/;

/**
 * The solver's own error sentences, which it writes in English, in the app's language.
 *
 * They reached the user as the engine wrote them: "Singular stiffness matrix — structure is a
 * mechanism" in a Spanish or Portuguese interface. The known sentences are replaced wherever
 * they appear in a message; anything else is left as it is.
 */
const ENGINE_SENTENCES: ReadonlyArray<[string, string]> = [
  ['the structure is a mechanism or so close to one that its stability cannot be decided in double precision: the reduced stiffness rank cannot be resolved at assembly precision. Check member releases, supports, springs and constraints for a mechanism.', REDUCED_STIFFNESS_RANK],
  [reducedStiffnessRank.en, REDUCED_STIFFNESS_RANK],
  ['The reduced stiffness rank cannot be resolved at assembly precision.', REDUCED_STIFFNESS_RANK],
  [DIAGRAM_EXTREMA_UNAVAILABLE, DIAGRAM_EXTREMA_UNAVAILABLE],
  ['distinct member diagram cuts share a normalized station', DIAGRAM_EXTREMA_UNAVAILABLE],
  ['interior member diagram extremum has no distinct normalized station', DIAGRAM_EXTREMA_UNAVAILABLE],
  ['member diagram extrema cannot be evaluated at the requested station', DIAGRAM_EXTREMA_UNAVAILABLE],
  ['non-finite member diagram polynomial', DIAGRAM_EXTREMA_UNAVAILABLE],
  ['non-finite moving load member diagram', DIAGRAM_EXTREMA_UNAVAILABLE],
  ['Repeated load case factors cancel to zero in this combination.', 'svc.engine.cancelledCombination'],
  ['Moving loads: axle position cannot be resolved at a path joint', 'svc.engine.unresolvedMovingAxle'],
  [AMBIGUOUS_ROLLER_Z, 'svc.engine.ambiguousRollerZ'],
  ['out-of-plane nodal component', 'xls.err.nodalOutOfPlane'],
  ['Mass density must be finite and nonnegative', 'svc.engine.nonnegativeMassDensity'],
  ['Unsupported point load field', 'svc.engine.unsupportedPointLoadMoment'],
  ['apply the moment at a 3D node at the original load position', 'svc.engine.applyPointLoadMomentAtNode'],
  ['P-Delta results were withheld because the physical free-DOF residual did not meet the requested tolerance.', PDELTA_PHYSICAL_RESIDUAL],
  ['exact plastic LP resource budget exceeded', 'plasticDiag.resourceBudget'],
  ['Singular stiffness matrix — structure is a mechanism', 'svc.engine.mechanism'],
  ['All diagonal entries are zero — singular matrix', 'svc.engine.zeroDiagonal'],
  ['Singular stiffness matrix', 'svc.engine.singular'],
];

export function localizeEngineText(message: string): string {
  const rankRefusal = asCodedRefusal(message, 'reduced_stiffness_rank');
  const original = rankRefusal instanceof CodedRefusal ? rankRefusal.message : message;
  const axialJoint = AXIAL_JOINT_REASON.exec(original);
  if (axialJoint) return fill(AXIAL_JOINT_MECHANISM, { node: axialJoint[1] });
  const modalSwing = refusalDiagnostic(message, 'reduced_stiffness_rank');
  const modalSwingNode = modalSwing?.nodeIds?.[0];
  if (modalSwing?.phase === 'modal' && typeof modalSwingNode === 'number') {
    return fill(FRAME_SWING_MECHANISM, { node: String(modalSwingNode) });
  }
  const frameSwing = FRAME_SWING_REASON.exec(original);
  if (frameSwing) return fill(FRAME_SWING_MECHANISM, { node: frameSwing[1] });
  const constraintRank = CONSTRAINT_RANK_REASON.exec(original);
  if (constraintRank) {
    const nodes = constraintRank[1];
    return fill(CONSTRAINT_STIFFNESS_RANK, {
      where: nodes ? fill(CONSTRAINT_STIFFNESS_NODES, { nodes }) : '',
    });
  }
  let out = original;
  let translatedRank = false;
  for (const [en, key] of ENGINE_SENTENCES) {
    if ((key === REDUCED_STIFFNESS_RANK && translatedRank) || !out.includes(en)) continue;
    out = out.split(en).join(tAt(key, i18n.locale));
    translatedRank ||= key === REDUCED_STIFFNESS_RANK;
  }
  if (rankRefusal instanceof CodedRefusal && !translatedRank) {
    out = `${tAt(REDUCED_STIFFNESS_RANK, i18n.locale)} ${out}`;
  }
  out = out.replace(/Non-finite number \((NaN|Infinity|-Infinity)\) at (\S+)/g, (_, value: string, path: string) =>
    fill('svc.engine.nonFiniteNumber', { value, path }));
  return out.replace(SELF_CHECK_REFUSAL, (whole, check: string, mode: string | undefined, rest: string) => {
    const name = selfCheckName(check, mode);
    if (!name) return whole;
    const exceeds = /^(\S+) exceeds (\S+)$/.exec(rest);
    const value = exceeds ? Number(exceeds[1]) : NaN;
    const limit = exceeds ? Number(exceeds[2]) : NaN;
    if (Number.isFinite(value) && Number.isFinite(limit)) return fill('selfCheck.refused', { check: name, value: scientific(value), threshold: scientific(limit) });
    return fill('selfCheck.refusedInvalid', { check: name, reason: selfCheckReason(rest) });
  });
}

const SELF_CHECKS = new Set(['static_residual', 'static_balance', 'modal_residual', 'modal_orthogonality', 'modal_mass']);
const SELF_CHECK_REFUSAL = /REFUSE: self-check ([a-z_]+)(?::(\d+))?: ([^\n]*)/g;

type Translate = (key: string) => string;
const active: Translate = (key) => tAt(key, i18n.locale);

function fill(key: string, params: Record<string, string>, translate: Translate = active): string {
  return translate(key).replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}

const SELF_CHECK_REASONS: ReadonlyArray<[RegExp, string]> = [
  [/^non-finite /, 'selfCheck.reason.nonFinite'],
  [/^non-positive modal mass$/, 'selfCheck.reason.nonPositiveMass'],
];

function selfCheckReason(reason: string): string {
  const known = SELF_CHECK_REASONS.find(([pattern]) => pattern.test(reason));
  return known ? active(known[1]) : reason;
}

function scientific(value: number): string {
  return value.toExponential(2);
}

function selfCheckName(check: string, mode: string | undefined, translate: Translate = active): string | null {
  return SELF_CHECKS.has(check) ? fill(`selfCheck.check.${check}`, { mode: mode ?? '' }, translate) : null;
}

/** A self-check diagnostic in the app's language, or `translate`'s; the engine's English text when it is not one. */
export function selfCheckWarningText(d: StructuredDiagnostic, translate: Translate = active): string {
  const [, check, mode] = d.phase?.split(':') ?? [];
  const name = check ? selfCheckName(check, mode, translate) : null;
  if (!name || d.value === undefined || d.threshold === undefined) return d.message;
  return fill('selfCheck.warning', { check: name, value: scientific(d.value), threshold: scientific(d.threshold) }, translate);
}
