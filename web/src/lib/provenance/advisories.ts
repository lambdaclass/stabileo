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
      it: 'analisi armonica',
      zh: '谐响应分析',
      nl: 'de harmonische analyse',
    },
    title: {
      en: 'Harmonic analysis chose between modal superposition and the direct solve per load: superposition and reciprocity failed, and responses were off by up to 107 % at a node.',
      es: 'El análisis armónico elegía entre superposición modal y solución directa según la carga: la superposición y la reciprocidad fallaban, y las respuestas diferían hasta un 107 % en un nudo.',
      pt: 'A análise harmônica escolhia entre superposição modal e solução direta conforme a carga: a superposição e a reciprocidade falhavam, e as respostas diferiam até 107 % num nó.',
      de: 'Die harmonische Analyse wählte je Last zwischen Modalsuperposition und direkter Lösung: Superposition und Reziprozität versagten, und Antworten wichen an einem Knoten um bis zu 107 % ab.',
      fr: 'L\'analyse harmonique choisissait entre superposition modale et résolution directe selon la charge : la superposition et la réciprocité échouaient, et les réponses s\'écartaient jusqu\'à 107 % en un nœud.',
      tr: 'Harmonik analiz modal süperpozisyon ile doğrudan çözüm arasında yüke göre seçim yapıyordu: süperpozisyon ve karşılıklılık bozuluyor, yanıtlar bir düğümde %107\'ye kadar sapıyordu.',
      hu: 'A harmonikus analízis terhenként választott a modális szuperpozíció és a közvetlen megoldás között: a szuperpozíció és a reciprocitás nem teljesült, és a válaszok egy csomópontban akár 107%-kal is eltértek.',
      it: 'L’analisi armonica sceglieva tra sovrapposizione modale e soluzione diretta per ogni carico: sovrapposizione e reciprocità fallivano, e le risposte differivano fino al 107 % in un nodo.',
      zh: '谐响应分析按每个荷载在模态叠加与直接求解之间选择：叠加性和互易性均不成立，某个节点处的响应偏差最高达 107 %。',
      nl: 'De harmonische analyse koos per belasting tussen modale superpositie en de directe oplossing: superpositie en reciprociteit gingen mis, en antwoorden weken op een knoop tot 107 % af.',
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
      it: 'un caso di carico che imponeva uno spostamento di un vincolo',
      zh: '一个施加了支座位移的荷载工况',
      nl: 'een belastinggeval dat een oplegverplaatsing oplegde',
    },
    title: {
      en: 'In a model with shells, a load case that imposed a support displacement lost all of its shell stresses, and its combinations and envelopes summed only the other cases\' shell stresses: the combined shell stresses could be unconservative, without a warning.',
      es: 'En un modelo con cáscaras, un caso de carga que imponía un desplazamiento de apoyo perdía todas sus tensiones de cáscara, y sus combinaciones y envolventes sumaban solo las de los demás casos: las tensiones de cáscara combinadas podían quedar del lado inseguro, sin aviso.',
      pt: 'Em um modelo com cascas, um caso de carga que impunha um deslocamento de apoio perdia todas as suas tensões de casca, e suas combinações e envoltórias somavam apenas as dos demais casos: as tensões de casca combinadas podiam ficar contra a segurança, sem aviso.',
      de: 'In einem Modell mit Schalen verlor ein Lastfall mit eingeprägter Auflagerverschiebung alle Schalenspannungen, und seine Kombinationen und Umhüllenden summierten nur die der anderen Lastfälle: die kombinierten Schalenspannungen konnten ohne Warnung auf der unsicheren Seite liegen.',
      fr: 'Dans un modèle avec coques, un cas de charge imposant un déplacement d\'appui perdait toutes ses contraintes de coque, et ses combinaisons et enveloppes ne sommaient que celles des autres cas : les contraintes de coque combinées pouvaient être du côté de l\'insécurité, sans avertissement.',
      tr: 'Kabuklu bir modelde mesnet yer değiştirmesi zorlayan bir yük durumu tüm kabuk gerilmelerini kaybediyor, kombinasyonları ve zarfları yalnızca diğer durumların kabuk gerilmelerini topluyordu: birleşik kabuk gerilmeleri uyarı vermeden güvensiz tarafta kalabiliyordu.',
      hu: 'Héjakat tartalmazó modellben a támaszelmozdulást előíró tehereset elvesztette összes héjfeszültségét, kombinációi és burkolói pedig csak a többi tehereset héjfeszültségeit összegezték: a kombinált héjfeszültségek figyelmeztetés nélkül a biztonság kárára tévedhettek.',
      it: 'In un modello con gusci, un caso di carico che imponeva uno spostamento di un vincolo perdeva tutte le sue tensioni nei gusci, e le sue combinazioni e inviluppi sommavano solo le tensioni nei gusci degli altri casi: le tensioni combinate nei gusci potevano essere non conservative, senza alcun avviso.',
      zh: '在带壳的模型中，施加了支座位移的荷载工况丢失了其全部壳应力，其组合和包络只对其他工况的壳应力求和：组合后的壳应力可能偏不安全，且没有任何警告。',
      nl: 'In een model met schalen verloor een belastinggeval dat een oplegverplaatsing oplegde al zijn schaalspanningen, en de combinaties en omhullenden ervan telden alleen de schaalspanningen van de andere gevallen op: de gecombineerde schaalspanningen konden onveilig uitvallen, zonder waarschuwing.',
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
      it: 'La verifica dei piccoli spostamenti non rilevava la pendenza di taglio di un’asta e la curvatura termica a un’estremità svincolata: una campata che ruotava oltre 0,1 rad non veniva segnalata.',
      zh: '小位移检查遗漏了杆件的剪切斜率以及杆端释放处的温度曲率：跨度转角超过 0.1 rad 时没有给出警告。',
      nl: 'De controle op kleine verplaatsingen miste de dwarskrachthelling van een staaf en de thermische kromming bij een vrijgemaakt uiteinde: een overspanning die meer dan 0,1 rad draaide kreeg geen waarschuwing.',
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
