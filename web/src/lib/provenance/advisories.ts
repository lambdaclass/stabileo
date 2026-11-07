import type { ChangeCondition, Localised, ResultChangeRegistry } from './registry';

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
    title: {
      en: 'Harmonic analysis chose between modal superposition and the direct solve per load: superposition and reciprocity failed, and responses were off by up to 107 % at a node.',
      es: 'El análisis armónico elegía entre superposición modal y solución directa según la carga: la superposición y la reciprocidad fallaban, y las respuestas diferían hasta un 107 % en un nudo.',
      pt: 'A análise harmônica escolhia entre superposição modal e solução direta conforme a carga: a superposição e a reciprocidade falhavam, e as respostas diferiam até 107 % num nó.',
      de: 'Die harmonische Analyse wählte je Last zwischen Modalsuperposition und direkter Lösung: Superposition und Reziprozität versagten, und Antworten wichen an einem Knoten um bis zu 107 % ab.',
      fr: 'L\'analyse harmonique choisissait entre superposition modale et résolution directe selon la charge : la superposition et la réciprocité échouaient, et les réponses s\'écartaient jusqu\'à 107 % en un nœud.',
      tr: 'Harmonik analiz modal süperpozisyon ile doğrudan çözüm arasında yüke göre seçim yapıyordu: süperpozisyon ve karşılıklılık bozuluyor, yanıtlar bir düğümde %107\'ye kadar sapıyordu.',
    },
  },
  {
    id: 'issue-1569',
    issue: 1569,
    url: `${REPO}issues/1569`,
    introducedBy: null,
    fixedBy: 'span-check-shear-thermal',
    when: [
      { allOf: [['frameMembers'], ['memberThermalLoads'], ['hinges']] },
      { allOf: [['frameMembers'], ['shearAreas']] },
    ],
    title: {
      en: 'The small-displacement check missed a member\'s shear slope and the thermal curvature at a released end: a span turning past 0.1 rad was not warned.',
      es: 'La verificación de pequeños desplazamientos omitía la pendiente por corte de una barra y la curvatura térmica en un extremo liberado: un tramo que giraba más de 0,1 rad no se advertía.',
      pt: 'A verificação de pequenos deslocamentos omitia a inclinação por cisalhamento de uma barra e a curvatura térmica numa extremidade liberada: um vão que girava mais de 0,1 rad não era avisado.',
      de: 'Die Prüfung auf kleine Verschiebungen übersah die Schubneigung eines Stabs und die Temperaturkrümmung an einem gelösten Ende: ein Feld, das sich um mehr als 0,1 rad drehte, wurde nicht gewarnt.',
      fr: 'La vérification des petits déplacements ignorait la pente due à l\'effort tranchant d\'une barre et la courbure thermique à une extrémité libérée : une travée tournant de plus de 0,1 rad n\'était pas signalée.',
      tr: 'Küçük yer değiştirme kontrolü bir çubuğun kayma eğimini ve serbest bırakılmış bir uçtaki ısıl eğriliği atlıyordu: 0,1 rad\'dan fazla dönen bir açıklık için uyarı verilmiyordu.',
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
