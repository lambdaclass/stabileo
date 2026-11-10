import type { ChangeCondition, Localised, ResultChangeRegistry } from './registry';
import type { AnalysisKind } from './model-features';

/**
 * A known wrong-result bug and the results versions it affected: from the version of
 * `introducedBy` (null: every version before the fix) up to, not including, that of `fixedBy`.
 * Both are result-change ids, so the range is read from the registry and never typed in.
 */
export interface Advisory {
  id: string;
  issue: number;
  url: string;
  introducedBy: string | null;
  fixedBy: string;
  /** Any one of these holds: the model uses the affected feature. */
  when: ChangeCondition[];
  /**
   * The analysis the bug was in. The warning stays up until it is run again, and, for a stamp
   * that does not record it, says the results may be affected if `ifUsed` was used.
   */
  analysis?: AnalysisKind;
  /** Any one of these holds: the model provably hit the bug. Otherwise it may have, if `ifUsed` was used. */
  certain?: ChangeCondition[];
  ifUsed?: Localised;
  title: Localised;
}

const REPO = 'https://github.com/lambdaclass/stabileo/';

export const ADVISORIES: readonly Advisory[] = [
  {
    id: 'SA-2026-046',
    issue: 1587,
    url: `${REPO}blob/main/docs/advisories/SA-2026-046-harmonic-modal-or-direct-per-load.md`,
    introducedBy: 'harmonic-modal-residual-checked',
    fixedBy: 'harmonic-modal-or-direct-per-frequency',
    when: [{ allOf: [['members', 'shells', 'curvedShells', 'connectors', 'springs']], any: ['analysis:harmonic'] }],
    analysis: 'harmonic',
    ifUsed: {
      en: 'harmonic analysis',
      es: 'el análisis armónico',
      pt: 'a análise harmônica',
      de: 'die harmonische Analyse',
      fr: 'l\'analyse harmonique',
      tr: 'harmonik analiz',
      hu: 'harmonikus analízis',
    },
    title: {
      en: 'Harmonic analysis chose between modal superposition and the direct solve per load: superposition and reciprocity failed, and responses were off by up to 107 % at a node.',
      es: 'El análisis armónico elegía entre superposición modal y solución directa según la carga: la superposición y la reciprocidad fallaban, y las respuestas diferían hasta un 107 % en un nudo.',
      pt: 'A análise harmônica escolhia entre superposição modal e solução direta conforme a carga: a superposição e a reciprocidade falhavam, e as respostas diferiam até 107 % num nó.',
      de: 'Die harmonische Analyse wählte je Last zwischen Modalsuperposition und direkter Lösung: Superposition und Reziprozität versagten, und Antworten wichen an einem Knoten um bis zu 107 % ab.',
      fr: 'L\'analyse harmonique choisissait entre superposition modale et résolution directe selon la charge : la superposition et la réciprocité échouaient, et les réponses s\'écartaient jusqu\'à 107 % en un nœud.',
      tr: 'Harmonik analiz modal süperpozisyon ile doğrudan çözüm arasında yüke göre seçim yapıyordu: süperpozisyon ve karşılıklılık bozuluyor, yanıtlar bir düğümde %107\'ye kadar sapıyordu.',
      hu: 'A harmonikus analízis terhenként választott a modális szuperpozíció és a közvetlen megoldás között: a szuperpozíció és a reciprocitás nem teljesült, és a válaszok egy csomópontban akár 107%-kal is eltértek.',
    },
  },
  {
    id: 'SA-2026-047',
    issue: 1673,
    url: `${REPO}blob/main/docs/advisories/SA-2026-047-case-displacement-shell-stresses.md`,
    introducedBy: null,
    fixedBy: 'combined-shell-stresses',
    when: [{ any: ['shells', 'curvedShells'] }],
    certain: [{ allOf: [['shells', 'curvedShells'], ['caseDisplacements'], ['combinations']] }],
    ifUsed: {
      en: 'a load case that imposed a support displacement',
      es: 'un caso de carga que imponía un desplazamiento de apoyo',
      pt: 'um caso de carga que impunha um deslocamento de apoio',
      de: 'einen Lastfall mit eingeprägter Auflagerverschiebung',
      fr: 'un cas de charge imposant un déplacement d\'appui',
      tr: 'mesnet yer değiştirmesi zorlayan bir yük durumu',
      hu: 'egy támaszelmozdulást előíró tehereset',
    },
    title: {
      en: 'In a model with shells, a load case that imposed a support displacement lost all of its shell stresses, and its combinations and envelopes summed only the other cases\' shell stresses: the combined shell stresses could be unconservative, without a warning.',
      es: 'En un modelo con cáscaras, un caso de carga que imponía un desplazamiento de apoyo perdía todas sus tensiones de cáscara, y sus combinaciones y envolventes sumaban solo las de los demás casos: las tensiones de cáscara combinadas podían quedar del lado inseguro, sin aviso.',
      pt: 'Em um modelo com cascas, um caso de carga que impunha um deslocamento de apoio perdia todas as suas tensões de casca, e suas combinações e envoltórias somavam apenas as dos demais casos: as tensões de casca combinadas podiam ficar contra a segurança, sem aviso.',
      de: 'In einem Modell mit Schalen verlor ein Lastfall mit eingeprägter Auflagerverschiebung alle Schalenspannungen, und seine Kombinationen und Umhüllenden summierten nur die der anderen Lastfälle: die kombinierten Schalenspannungen konnten ohne Warnung auf der unsicheren Seite liegen.',
      fr: 'Dans un modèle avec coques, un cas de charge imposant un déplacement d\'appui perdait toutes ses contraintes de coque, et ses combinaisons et enveloppes ne sommaient que celles des autres cas : les contraintes de coque combinées pouvaient être du côté de l\'insécurité, sans avertissement.',
      tr: 'Kabuklu bir modelde mesnet yer değiştirmesi zorlayan bir yük durumu tüm kabuk gerilmelerini kaybediyor, kombinasyonları ve zarfları yalnızca diğer durumların kabuk gerilmelerini topluyordu: birleşik kabuk gerilmeleri uyarı vermeden güvensiz tarafta kalabiliyordu.',
      hu: 'Héjakat tartalmazó modellben a támaszelmozdulást előíró tehereset elvesztette összes héjfeszültségét, kombinációi és burkolói pedig csak a többi tehereset héjfeszültségeit összegezték: a kombinált héjfeszültségek figyelmeztetés nélkül a biztonság kárára tévedhettek.',
    },
  },
  {
    id: 'issue-1569',
    issue: 1569,
    url: `${REPO}issues/1569`,
    introducedBy: null,
    fixedBy: 'span-check-shear-thermal',
    when: [
      { allOf: [['thermalAtRelease']] },
      { allOf: [['frameMembers'], ['shearAreas']] },
    ],
    title: {
      en: 'The small-displacement check missed a member\'s shear slope and the thermal curvature at a released end: a span turning past 0.1 rad was not warned.',
      es: 'La verificación de pequeños desplazamientos omitía la pendiente por corte de una barra y la curvatura térmica en un extremo liberado: un tramo que giraba más de 0,1 rad no se advertía.',
      pt: 'A verificação de pequenos deslocamentos omitia a inclinação por cisalhamento de uma barra e a curvatura térmica numa extremidade liberada: um vão que girava mais de 0,1 rad não era avisado.',
      de: 'Die Prüfung auf kleine Verschiebungen übersah die Schubneigung eines Stabs und die Temperaturkrümmung an einem gelösten Ende: ein Feld, das sich um mehr als 0,1 rad drehte, wurde nicht gewarnt.',
      fr: 'La vérification des petits déplacements ignorait la pente due à l\'effort tranchant d\'une barre et la courbure thermique à une extrémité libérée : une travée tournant de plus de 0,1 rad n\'était pas signalée.',
      tr: 'Küçük yer değiştirme kontrolü bir çubuğun kayma eğimini ve serbest bırakılmış bir uçtaki ısıl eğriliği atlıyordu: 0,1 rad\'dan fazla dönen bir açıklık için uyarı verilmiyordu.',
      hu: 'A kis elmozdulások ellenőrzése figyelmen kívül hagyta a rúd nyírásból adódó hajlásszögét és a felszabadított végnél fellépő hőmérsékleti görbületet: a 0,1 rad-nál jobban elforduló támaszközre nem érkezett figyelmeztetés.',
    },
  },
];

export function advisoryName(a: Advisory): string {
  return a.id.startsWith('SA-') ? a.id : `#${a.issue}`;
}

const versionOf = (registry: ResultChangeRegistry, id: string): number | undefined =>
  registry.changes.find((c) => c.id === id)?.resultsVersion;

/** The advisories whose affected versions include `solvedVersion` (0: unknown) and whose feature the model uses. */
export function advisoriesFor(
  solvedVersion: number,
  holds: (w: ChangeCondition) => boolean,
  registry: ResultChangeRegistry,
  advisories: readonly Advisory[] = ADVISORIES,
): Advisory[] {
  return advisories.filter((a) => {
    const from = a.introducedBy === null ? 0 : versionOf(registry, a.introducedBy);
    const to = versionOf(registry, a.fixedBy);
    return from !== undefined && to !== undefined && solvedVersion >= from && solvedVersion < to && a.when.some(holds);
  });
}
