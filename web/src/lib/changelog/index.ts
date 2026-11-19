import type { PublicLocale } from '../i18n/store.svelte';

export type ChangelogArea = 'basic' | 'pro' | 'edu' | 'app' | 'engine' | 'site';

export const CHANGELOG_AREAS: readonly ChangelogArea[] = ['basic', 'pro', 'edu', 'app', 'engine', 'site'];

export type ChangelogShot = {
  /** A stem under /screenshots, served by Shot.svelte at 800 and 1600 px. */
  base: string;
  w: number;
  h: number;
  alt: Record<PublicLocale, string>;
};

export type ChangelogEntry = {
  date: string;
  /** Before the weekly reports started in June 2026, the history is told a month at a time. */
  period?: 'month';
  /** Areas of the items, in order: `items` in every language follows it. */
  areas: ChangelogArea[];
  shot?: ChangelogShot;
  advisories?: { id: string; href: string }[];
  i18n: Record<PublicLocale, { title: string; items: string[] }>;
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-11-16',
    advisories: [
      { id: 'SA-2026-064', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-064-steel-cb-combination.md' },
      { id: 'SA-2026-065', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-065-snow-roof-step.md' },
      { id: 'SA-2026-066', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-066-cirsoc201-transverse-cm.md' },
      { id: 'SA-2026-067', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-067-snow-roof-rotation.md' },
      { id: 'SA-2026-068', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-068-provided-torsion-stirrups.md' },
      { id: 'SA-2026-069', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-069-torsion-secondary-shear.md' },
      { id: 'SA-2026-070', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-070-interior-member-couples.md' },
      { id: 'SA-2026-071', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-071-incomplete-concurrent-demands.md' },
      { id: 'SA-2026-072', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-072-snow-ridge-subdivision.md' },
      { id: 'SA-2026-073', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-073-snow-crossing-moment.md' },
      { id: 'SA-2026-074', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-074-snow-panel-subdivision.md' },
      { id: 'SA-2026-089', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-089-roller-z-fixed.md' },
    ],
    areas: ['engine', 'engine', 'engine', 'engine', 'pro', 'pro', 'pro', 'pro', 'pro', 'pro', 'app', 'app', 'app', 'site', 'site'],
    i18n: {
      es: {
        title: 'Cargas de barra, cargas gravitatorias y apoyos 3D corregidos',
        items: [
          'La lectura sobre la barra y la deformada incluyen cuplas concentradas y cargas distribuidas parciales mediante una recuperación compartida en 2D y 3D. La recuperación con carga sin rigidez de flexión suficiente se rechaza explícitamente. Hay que repetir los análisis afectados y revisar flechas interiores y chequeos de servicio (SA-2026-070).',
          'Las cargas compatibles con rotaciones liberadas conservan su respuesta al girar o cambiar unidades. Se conserva la cancelación de momentos nodales; los momentos residuales realmente no soportados siguen rechazándose. Hay que repetir los análisis afectados.',
          'Las cargas distribuidas sobre tramos demasiado cortos se rechazan con un mensaje que indica la barra y el intervalo. El chequeo de equilibrio de fuerzas cuenta de forma independiente la carga aplicada. Hay que revisar los intervalos rechazados y repetir los análisis afectados.',
          'Los diagramas de barras 3D para combinaciones ABS y SRSS incluyen los picos entre los puntos de dibujo y los valores a ambos lados de los saltos. Hay que recalcular los diagramas afectados y revisar los chequeos que usaron sus máximos.',
          'Los chequeos de interacción de hormigón y acero conservan esfuerzos de la misma combinación y estación. Se corrigen los factores de gradiente de momentos del acero, la amplificación del hormigón y los estribos provistos para torsión. Hay que repetir los diseños afectados y revisar combinaciones y armaduras (SA-2026-064, SA-2026-066, SA-2026-068).',
          'El límite de sección de corte–torsión CIRSOC 201 incluye ambas direcciones de corte concurrente en vigas, columnas y tabiques. Una sección antes aceptada puede fallar; más estribos no reparan un límite de sección excedido. Hay que repetir los diseños de hormigón afectados (SA-2026-069).',
          'El diseño y la certificación rechazan combinaciones, barras o estaciones declaradas faltantes en vez de chequear solo las demandas disponibles. Las envolventes de vigas conservan cada combinación con grillas de estaciones distintas. Hay que repetir los diseños guardados de hormigón y acero y revisar rechazos y certificados (SA-2026-071).',
          'La acumulación de nieve en escalones con cubierta receptora inclinada y los anchos siguen los planos físicos del techo, sin depender del giro en planta. Las regiones conectadas conservan acumulación, deslizamiento y patrones desequilibrados. Hay que regenerar la nieve antes de repetir análisis, combinaciones y chequeos de diseño (SA-2026-065, SA-2026-067).',
          'Agregar nodos ya no mueve las cumbreras de nieve ni convierte paneles refinados de cúpulas en pisos. Las cargas sobre barras que cruzan la cumbrera conservan fuerza y momento, también al seleccionar solo algunas barras. Hay que regenerar todas las cargas de área afectadas, incluidas las de techo y piso, y repetir análisis, combinaciones y chequeos; resolver las cargas guardadas no alcanza (SA-2026-072, SA-2026-073, SA-2026-074).',
          'En paños con cáscaras, las vigas reciben la carga de las franjas descubiertas que pueden soportar. Si la cobertura es ambigua, se rechaza la generación. En el modo por ancho tributario, el área de cada nivel y la masa sísmica se calculan a partir de las barras cargadas. Se rechazan las zonas de piso cuya excentricidad no se puede representar. Hay que regenerar las cargas gravitatorias y sísmicas afectadas antes de repetir los análisis y los chequeos.',
          'Las traducciones al húngaro incluyen las guías de versiones y los avisos de proyectos guardados. Los controles ampliados de Fehér en Research, Tools consolidado, los nuevos accesos a Mohr y el juego de diagramas siguen siendo opcionales y desactivados por defecto. Las cuentas y la medición publicitaria siguen desactivadas por defecto.',
          'Las herramientas de tensiones conservan tensiones principales y cortes pequeños no nulos, y los enlaces de Mohr conservan el estado ingresado. Las calculadoras mantienen las respuestas ligadas a los datos actuales. Abrir el espacio de armaduras repite menos trabajo geométrico, con la misma geometría y resultados.',
          'En 3D se rechazan los tipos de apoyo desconocidos. Los rodillos ambiguos y los apoyos personalizados requieren restricciones explícitas. El ejemplo de viga de hormigón usa los apoyos simples previstos. Hay que confirmar qué movimientos restringen los apoyos afectados y repetir análisis, combinaciones y chequeos de diseño (SA-2026-089).',
          'Las notas y artículos de las versiones 0.6.0 y 0.6.1 explican qué proyectos recalcular y qué cargas regenerar. Las correcciones posteriores de esta entrada se publicaron en la versión 0.6.2. Los hallazgos abiertos de la auditoría siguen registrados.',
          'Un nuevo experimento de Research, basado en el trabajo de Heyman sobre mampostería, explora el espesor mínimo de los arcos y cómo colapsan bajo carga.',
        ],
      },
      en: {
        title: 'Corrected member loads, gravity loads and 3D supports',
        items: [
          'Member hover readings and deformed shapes include concentrated couples and partial distributed loads through shared recovery in 2D and 3D. Loaded recovery without sufficient bending stiffness refuses explicitly. Re-run affected analyses and review interior deflections and serviceability checks (SA-2026-070).',
          'Loads compatible with released rotations retain their answers after rotation or unit conversion. Cancelling nodal moments are preserved; genuinely unsupported residual moments still refuse. Re-run affected analyses.',
          'Distributed loads over spans that are too short are refused with a message identifying the member and interval. The force-balance check counts the applied load independently. Review refused intervals and rerun affected analyses.',
          'ABS and SRSS 3D member diagrams include peaks between plot points and values on both sides of jumps. Recompute affected diagrams and review checks that used their peaks.',
          'Concrete and steel interaction checks keep forces from the same combination and station. Steel moment-gradient factors, concrete moment magnification and provided torsion stirrups are corrected. Re-run affected member designs and review governing combinations and reinforcement (SA-2026-064, SA-2026-066, SA-2026-068).',
          'CIRSOC 201 shear–torsion section limits include both concurrent shear directions in beams, columns and walls. Previously accepted sections can fail; extra stirrups cannot repair an exceeded section limit. Re-run affected concrete designs (SA-2026-069).',
          'Member design and certification refuse missing combinations, members or declared stations instead of checking only the demands available. Unequal station grids retain every combination in beam-line envelopes. Re-run saved concrete and steel designs and review refusals and certificates (SA-2026-071).',
          'Snow roof-step drift on pitched receiving roofs and roof widths follow physical roof planes, independently of plan rotation. Connected roof regions retain drift, sliding and unbalanced patterns. Regenerate affected snow loads before rerunning analyses, combinations and design checks (SA-2026-065, SA-2026-067).',
          'Adding nodes no longer moves snow ridges or turns refined dome panels into floors. Loads on members crossing a ridge retain force and moment, including selected carrier subsets. Regenerate all affected generated area loads, including roof and floor loads, then rerun analyses, combinations and design checks; solving stored loads alone is insufficient (SA-2026-072, SA-2026-073, SA-2026-074).',
          'In bays with shells, beams carry the load on uncovered strips they can support. Load generation stops when coverage is unclear. In tributary-width mode, level area and seismic mass follow the loaded members. Floor zones are refused when their eccentric loading cannot be represented. Regenerate affected gravity and seismic loads before rerunning analyses and checks.',
          'Hungarian translations include release guidance and saved-project notices. Expanded Fehér research controls, consolidated Tools, new Mohr entry points and the diagram game remain optional and disabled by default. Accounts and advertising measurement remain disabled by default.',
          'Stress tools retain small nonzero principal stresses and shear, and shared Mohr links preserve the entered stress state. Calculators keep answers tied to the current inputs. Opening the reinforcement workspace does less repeated geometry work, with unchanged geometry and analysis results.',
          '3D analysis refuses unknown support types. Ambiguous rollers and custom supports require explicit restraints. The concrete beam example uses its intended simple supports. Confirm which movements the affected supports restrain, then rerun analyses, combinations and design checks (SA-2026-089).',
          'Release notes and blog posts for 0.6.0 and 0.6.1 explain which projects need recalculation and which loads need regeneration. The later corrections listed here shipped in 0.6.2. Open audit findings remain tracked.',
          'A new Research experiment based on Heyman’s work on masonry explores the least thickness of arches and how they collapse under load.',
        ],
      },
      pt: {
        title: 'Cargas em barras, cargas gravitacionais e apoios 3D corrigidos',
        items: [
          'As leituras sobre as barras e as deformadas incluem momentos concentrados e cargas distribuídas parciais por uma recuperação comum em 2D e 3D. A recuperação com carga sem rigidez à flexão suficiente é recusada explicitamente. Repita as análises afetadas e revise flechas interiores e verificações de serviço (SA-2026-070).',
          'Cargas compatíveis com rotações liberadas mantêm suas respostas após rotação ou mudança de unidades. Momentos nodais que se cancelam são preservados; momentos residuais realmente não suportados continuam recusados. Repita as análises afetadas.',
          'Cargas distribuídas em trechos curtos demais são recusadas com uma mensagem que indica a barra e o intervalo. A verificação do equilíbrio de forças contabiliza a carga aplicada de forma independente. Revise os intervalos recusados e repita as análises afetadas.',
          'Os diagramas de barras 3D para combinações ABS e SRSS incluem picos entre os pontos do gráfico e valores dos dois lados dos saltos. Recalcule os diagramas afetados e revise as verificações que usaram seus picos.',
          'As verificações de interação de concreto e aço mantêm os esforços da mesma combinação e estação. Corrigem-se os fatores de gradiente de momentos do aço, a amplificação do concreto e os estribos fornecidos para torção. Repita os dimensionamentos afetados e revise combinações e armaduras (SA-2026-064, SA-2026-066, SA-2026-068).',
          'O limite de seção de cisalhamento–torção CIRSOC 201 inclui as duas direções de cisalhamento simultâneo em vigas, pilares e paredes. Seções antes aceitas podem falhar; mais estribos não corrigem um limite de seção excedido. Repita os dimensionamentos de concreto afetados (SA-2026-069).',
          'O dimensionamento e a certificação recusam combinações, barras ou estações declaradas ausentes, em vez de verificar apenas as demandas disponíveis. As envoltórias de vigas mantêm cada combinação com malhas de estações diferentes. Repita os dimensionamentos salvos de concreto e aço e revise recusas e certificados (SA-2026-071).',
          'O acúmulo de neve em desníveis com cobertura receptora inclinada e as larguras seguem os planos físicos do telhado, sem depender da rotação em planta. Regiões conectadas mantêm acúmulo, deslizamento e padrões desequilibrados. Gere novamente a neve antes de repetir análises, combinações e verificações (SA-2026-065, SA-2026-067).',
          'Adicionar nós já não desloca cumeeiras de neve nem transforma painéis refinados de cúpulas em pisos. As cargas em barras que cruzam a cumeeira conservam força e momento, inclusive em subconjuntos de barras selecionadas. Gere novamente todas as cargas de área afetadas, incluindo cobertura e piso, e repita análises, combinações e verificações; resolver apenas as cargas salvas não basta (SA-2026-072, SA-2026-073, SA-2026-074).',
          'Em painéis com cascas, as vigas recebem a carga das faixas descobertas que podem sustentar. Se a cobertura for ambígua, a geração é recusada. No modo por largura tributária, a área de cada pavimento e a massa sísmica seguem as barras carregadas. Zonas de piso são recusadas quando sua carga excêntrica não pode ser representada. Gere novamente as cargas gravitacionais e sísmicas afetadas antes de repetir as análises e verificações.',
          'As traduções para húngaro incluem orientações das versões e avisos de projetos salvos. Os controles ampliados de Fehér no Research, o Tools consolidado, os novos acessos a Mohr e o jogo de diagramas continuam opcionais e desativados por padrão. Contas e medição publicitária continuam desativadas por padrão.',
          'As ferramentas de tensões preservam pequenas tensões principais e cisalhamentos não nulos, e os links de Mohr mantêm o estado informado. As calculadoras vinculam as respostas aos dados atuais. Abrir o espaço de armaduras repete menos trabalho geométrico, sem alterar geometria ou resultados.',
          'A análise 3D recusa tipos de apoio desconhecidos. Apoios móveis ambíguos e apoios personalizados exigem restrições explícitas. O exemplo da viga de concreto usa os apoios simples previstos. Confirme quais movimentos os apoios afetados restringem e repita as análises, combinações e verificações de dimensionamento (SA-2026-089).',
          'As notas e artigos das versões 0.6.0 e 0.6.1 explicam quais projetos recalcular e quais cargas gerar novamente. As correções posteriores desta entrada foram publicadas na versão 0.6.2. Os achados abertos da auditoria continuam registrados.',
          'Um novo experimento no Research, baseado no trabalho de Heyman sobre alvenaria, explora a espessura mínima dos arcos e como eles colapsam sob carga.',
        ],
      },
      de: {
        title: 'Korrigierte Stablasten, Schwerkraftlasten und 3D-Auflager',
        items: [
          'Ablesewerte am Stab und Verformungsfiguren enthalten konzentrierte Momente und abschnittsweise Streckenlasten durch eine gemeinsame Rückrechnung in 2D und 3D. Belastete Rückrechnungen ohne ausreichende Biegesteifigkeit werden ausdrücklich verweigert. Betroffene Analysen erneut ausführen und Durchbiegungen und Gebrauchstauglichkeit prüfen (SA-2026-070).',
          'Mit freigegebenen Rotationen verträgliche Lasten behalten ihre Antworten nach Drehung oder Einheitenwechsel. Sich aufhebende Knotenmomente bleiben erhalten; tatsächlich nicht aufnehmbare Restmomente werden weiter verweigert. Betroffene Analysen erneut ausführen.',
          'Streckenlasten auf zu kurzen Abschnitten werden mit Angabe von Stab und Lastabschnitt abgelehnt. Die Prüfung des Kräftegleichgewichts erfasst die angesetzte Last unabhängig. Abgelehnte Lastabschnitte prüfen und betroffene Analysen wiederholen.',
          '3D-Stabdiagramme für ABS- und SRSS-Kombinationen erfassen Spitzenwerte zwischen den gezeichneten Punkten und Werte auf beiden Seiten von Sprüngen. Betroffene Diagramme neu berechnen und Nachweise prüfen, die diese Spitzenwerte verwenden.',
          'Interaktionsnachweise für Beton und Stahl behalten Schnittgrößen derselben Kombination und Stabstelle bei. Momentengradientenfaktoren für Stahl, Momentenvergrößerung für Beton und vorhandene Torsionsbügel werden korrigiert. Betroffene Bemessungen erneut ausführen und maßgebende Kombinationen und Bewehrung prüfen (SA-2026-064, SA-2026-066, SA-2026-068).',
          'Die Querschnittsgrenze für Querkraft und Torsion nach CIRSOC 201 berücksichtigt beide gleichzeitigen Querkraftrichtungen bei Balken, Stützen und Wänden. Bisher akzeptierte Querschnitte können versagen; zusätzliche Bügel beheben eine überschrittene Querschnittsgrenze nicht. Betroffene Betonbemessungen erneut ausführen (SA-2026-069).',
          'Bemessung und Zertifizierung verweigern fehlende Kombinationen, Stäbe oder deklarierte Stabstellen, statt nur vorhandene Beanspruchungen zu prüfen. Balkenhüllkurven behalten jede Kombination auch bei unterschiedlichen Stationsrastern. Gespeicherte Beton- und Stahlbemessungen erneut ausführen und Ablehnungen und Zertifikate prüfen (SA-2026-071).',
          'Schneeverwehungen an Dachsprüngen mit geneigtem Aufnahmedach und Dachbreiten folgen den tatsächlichen Dachebenen, unabhängig von der Drehung im Grundriss. Zusammenhängende Dachbereiche behalten Verwehungen, Abrutschen und unsymmetrische Lastbilder. Betroffene Schneelasten vor Analysen, Kombinationen und Bemessungen neu erzeugen (SA-2026-065, SA-2026-067).',
          'Zusätzliche Knoten verschieben keine Schneefirste mehr und machen verfeinerte Kuppeldachfelder nicht zu Geschossflächen. Lasten auf firstüberschreitenden Stäben erhalten Kraft und Moment, auch bei ausgewählten Teilmengen. Alle betroffenen erzeugten Flächenlasten einschließlich Dach- und Geschosslasten neu erzeugen, dann Analysen, Kombinationen und Nachweise wiederholen; gespeicherte Lasten nur erneut zu lösen reicht nicht (SA-2026-072, SA-2026-073, SA-2026-074).',
          'Bei Feldern mit Schalen tragen die Balken die Last auf den freien Streifen, die sie abstützen können. Bei unklarer Abdeckung wird die Lasterzeugung abgelehnt. Bei der Berechnung nach Einflussbreite folgen Geschossfläche und seismische Masse den belasteten Stäben. Geschosslastzonen werden abgelehnt, wenn ihre exzentrische Belastung nicht abgebildet werden kann. Betroffene Schwerkraft- und Erdbebenlasten vor erneuten Analysen und Nachweisen neu erzeugen.',
          'Ungarische Übersetzungen umfassen Versionshinweise und Hinweise für gespeicherte Projekte. Erweiterte Fehér-Steuerungen in Research, die zusammengefassten Tools, neue Mohr-Zugänge und das Diagrammspiel bleiben optional und standardmäßig deaktiviert. Konten und Werbemessung bleiben standardmäßig deaktiviert.',
          'Spannungswerkzeuge erhalten kleine von null verschiedene Haupt- und Schubspannungen; geteilte Mohr-Links bewahren den eingegebenen Spannungszustand. Rechner ordnen Antworten den aktuellen Eingaben zu. Der Bewehrungsarbeitsbereich benötigt beim Öffnen weniger wiederholte Geometriearbeit, bei gleicher Geometrie und gleichen Analyseergebnissen.',
          'Die 3D-Analyse lehnt unbekannte Auflagertypen ab. Mehrdeutige Rollenlager und benutzerdefinierte Auflager brauchen eindeutig festgelegte Freiheitsgrade. Das Betonbalkenbeispiel verwendet die vorgesehenen einfachen Auflager. Prüfen, welche Bewegungen die betroffenen Auflager sperren, und Analysen, Kombinationen und Bemessungsnachweise wiederholen (SA-2026-089).',
          'Versionshinweise und Blogbeiträge zu 0.6.0 und 0.6.1 erklären, welche Projekte neu zu berechnen und welche Lasten neu zu erzeugen sind. Die hier aufgeführten späteren Korrekturen wurden mit Version 0.6.2 veröffentlicht. Offene Auditbefunde werden weiterhin verfolgt.',
          'Ein neues Experiment in Research untersucht anhand von Heymans Arbeit zum Mauerwerk die Mindestdicke von Bögen und ihr Versagen unter Last.',
        ],
      },
      fr: {
        title: 'Charges sur les barres, charges gravitaires et appuis 3D corrigés',
        items: [
          'Les lectures sur les barres et les déformées incluent les couples concentrés et les charges réparties partielles par une restitution commune en 2D et 3D. La restitution sous charge sans rigidité de flexion suffisante est explicitement refusée. Relancer les analyses concernées et vérifier flèches intérieures et états de service (SA-2026-070).',
          'Les charges compatibles avec les rotations libérées conservent leurs réponses après rotation ou changement d’unités. Les moments nodaux qui s’annulent sont préservés ; les moments résiduels réellement non repris restent refusés. Relancer les analyses concernées.',
          'Les charges réparties sur des tronçons trop courts sont refusées avec un message qui indique la barre et le tronçon. La vérification de l’équilibre des forces comptabilise indépendamment la charge appliquée. Revoir les tronçons refusés et relancer les analyses concernées.',
          'Les diagrammes de barres 3D des combinaisons ABS et SRSS incluent les pics entre les points du tracé et les valeurs des deux côtés des sauts. Recalculer les diagrammes concernés et revoir les vérifications qui ont utilisé ces pics.',
          'Les vérifications d’interaction du béton et de l’acier conservent les efforts de la même combinaison et de la même station. Les facteurs de gradient de moments de l’acier, la majoration des moments du béton et les étriers de torsion fournis sont corrigés. Relancer les dimensionnements concernés et vérifier combinaisons et armatures (SA-2026-064, SA-2026-066, SA-2026-068).',
          'La limite de section en cisaillement–torsion CIRSOC 201 inclut les deux directions de cisaillement concomitantes des poutres, poteaux et voiles. Des sections auparavant acceptées peuvent échouer ; ajouter des étriers ne répare pas un dépassement de la limite de section. Relancer les dimensionnements en béton concernés (SA-2026-069).',
          'Le dimensionnement et la certification refusent les combinaisons, barres ou stations déclarées manquantes au lieu de vérifier seulement les sollicitations disponibles. Les enveloppes de poutres conservent chaque combinaison malgré des grilles de stations différentes. Relancer les dimensionnements enregistrés et examiner refus et certificats (SA-2026-071).',
          'Les accumulations de neige aux décrochements avec toiture réceptrice inclinée et les largeurs suivent les plans physiques des toitures, indépendamment de la rotation en plan. Les régions continues conservent accumulation, glissement et cas dissymétriques. Régénérer la neige avant de relancer analyses, combinaisons et vérifications (SA-2026-065, SA-2026-067).',
          'L’ajout de nœuds ne déplace plus les faîtages de neige et ne transforme plus les panneaux affinés de dômes en planchers. Les charges sur les barres traversant un faîtage conservent force et moment, même pour une sélection partielle. Régénérer toutes les charges surfaciques concernées, y compris de toiture et de plancher, puis relancer analyses, combinaisons et vérifications ; recalculer avec les seules charges enregistrées ne suffit pas (SA-2026-072, SA-2026-073, SA-2026-074).',
          'Dans les travées avec des coques, les poutres reprennent la charge des bandes non couvertes qu’elles peuvent porter. La génération des charges s’arrête si la couverture est ambiguë. En mode largeur tributaire, la surface de chaque niveau et la masse sismique suivent les barres chargées. Les zones de plancher sont refusées lorsque leur charge excentrée ne peut pas être représentée. Régénérer les charges gravitaires et sismiques concernées avant de relancer les analyses et les vérifications.',
          'Les traductions hongroises incluent les consignes de version et les avis des projets enregistrés. Les commandes Fehér étendues de Research, les Tools regroupés, les nouveaux accès à Mohr et le jeu de diagrammes restent facultatifs et désactivés par défaut. Les comptes et la mesure publicitaire restent désactivés par défaut.',
          'Les outils de contraintes préservent les petites contraintes principales et de cisaillement non nulles ; les liens Mohr partagés conservent l’état saisi. Les calculateurs relient les réponses aux données actuelles. L’ouverture de l’espace d’armatures répète moins de calculs géométriques, sans modifier géométrie ni résultats.',
          'L’analyse 3D refuse les types d’appuis inconnus. Les appuis à rouleau ambigus et les appuis personnalisés doivent définir explicitement leurs blocages. L’exemple de poutre en béton utilise les appuis simples prévus. Confirmer les mouvements bloqués par les appuis concernés, puis relancer les analyses, les combinaisons et les vérifications de dimensionnement (SA-2026-089).',
          'Les notes et articles des versions 0.6.0 et 0.6.1 expliquent quels projets recalculer et quelles charges régénérer. Les corrections ultérieures de cette entrée ont été publiées dans la version 0.6.2. Le suivi des constats d’audit encore ouverts se poursuit.',
          'Une nouvelle expérience dans Research, fondée sur les travaux de Heyman sur la maçonnerie, explore l’épaisseur minimale des arcs et leur effondrement sous charge.',
        ],
      },
      tr: {
        title: 'Eleman yükleri, düşey yükler ve 3B mesnetler düzeltildi',
        items: [
          'Eleman üzerindeki okumalar ve şekil değiştirmiş geometri, 2B ve 3B ortak geri hesaplamayla tekil çift momentleri ve kısmi yayılı yükleri içerir. Yeterli eğilme rijitliği olmayan yüklü geri hesaplama açıkça reddedilir. Etkilenen analizleri yeniden çalıştırıp iç sehimleri ve kullanılabilirlik kontrollerini inceleyin (SA-2026-070).',
          'Serbest bırakılmış dönmelerle uyumlu yükler dönme veya birim değişiminden sonra yanıtlarını korur. Birbirini götüren düğüm momentleri korunur; gerçekten taşınamayan artık momentler reddedilmeye devam eder. Etkilenen analizleri yeniden çalıştırın.',
          'Çok kısa aralıklara uygulanan yayılı yükler, elemanı ve aralığı belirten bir mesajla reddedilir. Kuvvet dengesi kontrolü uygulanan yükü bağımsız olarak hesaba katar. Reddedilen aralıkları gözden geçirin ve etkilenen analizleri yeniden çalıştırın.',
          'ABS ve SRSS birleşimlerinin 3B eleman diyagramları, çizim noktaları arasındaki tepe değerleri ve sıçramaların iki yanındaki değerleri içerir. Etkilenen diyagramları yeniden hesaplayın ve tepe değerlerini kullanan kontrolleri gözden geçirin.',
          'Betonarme ve çelik etkileşim kontrolleri aynı birleşim ve istasyondaki kuvvetleri korur. Çelik moment gradyanı katsayıları, betonarme moment büyütmesi ve mevcut burulma etriyeleri düzeltilmiştir. Etkilenen tasarımları yeniden çalıştırın; belirleyici birleşimleri ve donatıyı inceleyin (SA-2026-064, SA-2026-066, SA-2026-068).',
          'CIRSOC 201 kesme–burulma kesit sınırı, kiriş, kolon ve perdelerde eşzamanlı iki kesme yönünü de kapsar. Önceden kabul edilen kesitler başarısız olabilir; ek etriye aşılmış kesit sınırını gidermez. Etkilenen betonarme tasarımlarını yeniden çalıştırın (SA-2026-069).',
          'Eleman tasarımı ve sertifikalandırma, yalnızca mevcut talepleri kontrol etmek yerine eksik birleşimleri, elemanları veya tanımlı istasyonları reddeder. Farklı istasyon ağlarında kiriş zarfları her birleşimi korur. Kayıtlı betonarme ve çelik tasarımlarını yeniden çalıştırıp retleri ve sertifikaları inceleyin (SA-2026-071).',
          'Eğimli alıcı çatılardaki kademe kar birikmesi ve çatı genişlikleri, plandaki dönmeden bağımsız olarak fiziksel çatı düzlemlerini izler. Bağlantılı çatı bölgeleri birikme, kayma ve dengesiz yük düzenlerini korur. Analizleri, birleşimleri ve kontrolleri tekrarlamadan önce etkilenen kar yüklerini yeniden üretin (SA-2026-065, SA-2026-067).',
          'Düğüm eklemek artık kar mahyalarını kaydırmaz veya inceltilmiş kubbe panellerini döşemeye dönüştürmez. Mahyayı geçen elemanların yükleri, seçili alt kümelerde de kuvvet ve momenti korur. Çatı ve döşeme yükleri dahil etkilenen tüm üretilmiş alan yüklerini yeniden üretip analizleri, birleşimleri ve kontrolleri tekrarlayın; kayıtlı yüklerle yeniden çözmek yetmez (SA-2026-072, SA-2026-073, SA-2026-074).',
          'Kabuk içeren açıklıklarda kirişler taşıyabildikleri açık şeritlerin yükünü alır. Kaplama belirsizse yük üretimi durur. Etki genişliği modunda kat alanı ve deprem kütlesi yüklenen elemanlara göre hesaplanır. Eksantrik yükü temsil edilemeyen döşeme bölgeleri reddedilir. Etkilenen düşey yükleri ve deprem yüklerini yeniden üretip analizleri ve kontrolleri tekrarlayın.',
          'Macarca çeviriler sürüm rehberlerini ve kayıtlı proje bildirimlerini içerir. Research içindeki genişletilmiş Fehér kontrolleri, birleştirilmiş Tools, yeni Mohr girişleri ve diyagram oyunu isteğe bağlıdır ve varsayılan olarak kapalıdır. Hesaplar ve reklam ölçümü varsayılan olarak kapalı kalır.',
          'Gerilme araçları sıfır olmayan küçük asal ve kayma gerilmelerini korur; paylaşılan Mohr bağlantıları girilen gerilme durumunu saklar. Hesaplayıcılar yanıtları güncel girdilerle ilişkilendirir. Donatı çalışma alanı açılırken daha az geometri işi tekrarlanır; geometri ve analiz sonuçları değişmez.',
          '3B analiz bilinmeyen mesnet türlerini reddeder. Yönü belirsiz makaralı mesnetlerde ve özel mesnetlerde kısıtlamalar açıkça belirtilmelidir. Betonarme kiriş örneği öngörülen basit mesnetleri kullanır. Etkilenen mesnetlerin hangi hareketleri kısıtladığını doğrulayın ve analizleri, birleşimleri ve tasarım kontrollerini tekrarlayın (SA-2026-089).',
          '0.6.0 ve 0.6.1 sürüm notları ve yazıları hangi projelerin yeniden hesaplanacağını ve hangi yüklerin yeniden üretileceğini açıklar. Burada listelenen sonraki düzeltmeler 0.6.2 sürümünde yayımlandı. Açık denetim bulguları izlenmeye devam ediyor.',
          'Research içindeki yeni bir deney, Heyman’ın yığma yapılar üzerine çalışmasından yola çıkarak kemerlerin en küçük kalınlığını ve yük altında nasıl göçtüğünü inceliyor.',
        ],
      },
      hu: {
        title: 'Javított rúdterhek, gravitációs terhek és 3D támaszok',
        items: [
          'A rúd fölötti leolvasás és az alakváltozási ábra a koncentrált nyomatékokat és részleges megoszló terheket közös 2D és 3D visszaszámítással veszi figyelembe. Megfelelő hajlítási merevség nélkül a terhelt visszaszámítást kifejezetten elutasítja. Futtassa újra az érintett analíziseket, és ellenőrizze a belső lehajlásokat és használhatósági feltételeket (SA-2026-070).',
          'A felszabadított elfordulásokkal összeegyeztethető terhek elforgatás vagy egységváltás után is megtartják válaszukat. A kiegyenlítő csomóponti nyomatékok megmaradnak; a valóban fel nem vehető maradó nyomatékokat továbbra is elutasítja. Futtassa újra az érintett analíziseket.',
          'A túl rövid szakaszra megadott megoszló terheket a rúd és a szakasz megjelölésével utasítja el a program. Az erőegyensúly ellenőrzése függetlenül veszi számításba a megadott terhet. Ellenőrizze az elutasított szakaszokat, és futtassa újra az érintett analíziseket.',
          'Az ABS és SRSS kombinációk 3D rúdábrái a rajzi pontok közötti csúcsértékeket és az ugrások mindkét oldalán felvett értékeket is tartalmazzák. Számítsa újra az érintett ábrákat, és vizsgálja felül a csúcsértékeket használó ellenőrzéseket.',
          'A beton- és acélszerkezetek interakciós ellenőrzései azonos kombinációhoz és rúdszelvényhez tartozó erőket tartanak meg. Javulnak az acél nyomatéki gradiens tényezői, a beton nyomatéknövelése és a megadott csavarási kengyelek ellenőrzése. Futtassa újra az érintett méretezéseket, és ellenőrizze a mértékadó kombinációkat és vasalást (SA-2026-064, SA-2026-066, SA-2026-068).',
          'A CIRSOC 201 nyírás–csavarás keresztmetszeti korlátja gerendákban, oszlopokban és falakban mindkét egyidejű nyírási irányt figyelembe veszi. Korábban elfogadott szelvények megbukhatnak; több kengyel nem javítja ki a túllépett keresztmetszeti korlátot. Futtassa újra az érintett betonméretezéseket (SA-2026-069).',
          'A rúdméretezés és tanúsítás elutasítja a hiányzó kombinációkat, rudakat vagy előírt rúdpontokat a rendelkezésre álló részhalmaz ellenőrzése helyett. A gerendák burkolói eltérő pontkiosztások mellett is megtartják az összes kombinációt. Futtassa újra a mentett beton- és acélméretezéseket, és vizsgálja meg az elutasításokat és tanúsítványokat (SA-2026-071).',
          'A ferde fogadótetőnél fellépő tetőlépcső menti hófelhalmozódás és a tetőszélesség a tényleges tetősíkokat követi, az alaprajzi elforgatástól függetlenül. Az összefüggő tetőrégiók megtartják a felhalmozódási, lecsúszási és aszimmetrikus tehereseteket. Generálja újra az érintett hóterheket az analízisek, kombinációk és méretezések ismétlése előtt (SA-2026-065, SA-2026-067).',
          'További csomópontok már nem mozdítják el a hóterhek gerincét, és a finomított kupolapaneleket nem minősítik födémnek. A gerincet keresztező rudak terhei kiválasztott részhalmazokon is megőrzik az erőt és nyomatékot. Generálja újra az összes érintett generált felületi terhet, a tető- és födémterheket is, majd ismételje meg az analíziseket, kombinációkat és ellenőrzéseket; a mentett terhek újraszámítása önmagában nem elég (SA-2026-072, SA-2026-073, SA-2026-074).',
          'A héjakat tartalmazó mezőkben a gerendák az általuk megtámasztható fedetlen sávok terhét kapják. Bizonytalan lefedettségnél a tehergenerálás leáll. Tehergyűjtő szélesség használatakor a terhelt rudak határozzák meg a szint területét és a szeizmikus tömeget. A program elutasítja azokat a födémzónákat, amelyek külpontos terhe nem adható meg a modellben. Generálja újra az érintett gravitációs és szeizmikus terheket, majd ismételje meg az analíziseket és az ellenőrzéseket.',
          'A magyar fordítások a verzióútmutatókat és a mentett projektek figyelmeztetéseit is tartalmazzák. A Research kibővített Fehér-vezérlői, az összevont Tools, az új Mohr-belépési pontok és a diagramjáték továbbra is választhatók, alapértelmezésben kikapcsolva. A fiókok és a hirdetési mérés alapértelmezésben kikapcsolva maradnak.',
          'A feszültségi eszközök megőrzik a kis, nem nulla fő- és nyírófeszültségeket, a megosztott Mohr-hivatkozások pedig a megadott feszültségállapotot. A kalkulátorok válaszai az aktuális bemenethez tartoznak. A vasalási munkaterület megnyitásakor kevesebb geometriai munka ismétlődik, változatlan geometriával és analíziseredményekkel.',
          'A 3D analízis elutasítja az ismeretlen támasztípusokat. A többértelmű görgős és az egyedi támaszoknál meg kell adni a gátolt mozgásokat. A vasbeton gerenda példája a tervezett egyszerű támaszokat használja. Ellenőrizze az érintett támaszok gátolt mozgásait, majd ismételje meg az analíziseket, kombinációkat és méretezési ellenőrzéseket (SA-2026-089).',
          'A 0.6.0 és 0.6.1 verziójegyzetei és cikkei ismertetik, mely projekteket kell újraszámítani és mely terheket újragenerálni. Az itt felsorolt későbbi javítások a 0.6.2-es verzióban jelentek meg. A nyitott auditmegállapítások továbbra is követhetők.',
          'A Research új kísérlete Heyman falazatokról szóló munkája alapján vizsgálja a boltívek legkisebb vastagságát és teher alatti összeomlását.',
        ],
      },
      zh: {
        "title": "杆件荷载、重力荷载和 3D 支座已更正",
        "items": [
          "杆件悬停读数和变形图通过 2D 和 3D 共用的内力恢复，计入集中力偶和部分分布荷载。抗弯刚度不足时，有荷载的内力恢复会明确拒绝求解。请重新运行受影响的分析，并复核杆件内部挠度和正常使用验算（SA-2026-070）。",
          "与已释放转动相容的荷载，在旋转或单位换算后仍保持原有结果。相互抵消的节点弯矩得以保留；确实无法承受的残余弯矩仍会被拒绝。请重新运行受影响的分析。",
          "长度过短区段上的分布荷载会被拒绝，并给出指明杆件和区间的提示。力平衡校核独立计入所施加的荷载。请复核被拒绝的区间，并重新运行受影响的分析。",
          "ABS 和 SRSS 组合的 3D 杆件内力图计入绘图点之间的峰值以及突变两侧的数值。请重新计算受影响的内力图，并复核使用了其峰值的验算。",
          "混凝土和钢结构的相关作用验算采用同一组合、同一截面位置的内力。钢结构弯矩梯度系数、混凝土弯矩放大以及实配抗扭箍筋均已更正。请重新运行受影响的杆件设计，并复核控制组合和配筋（SA-2026-064、SA-2026-066、SA-2026-068）。",
          "CIRSOC 201 剪扭截面限值在梁、柱和墙中同时计入两个方向的同时剪力。以前通过的截面可能不再满足；增加箍筋无法弥补已超出的截面限值。请重新运行受影响的混凝土设计（SA-2026-069）。",
          "杆件设计和证书在缺少组合、杆件或声明的截面位置时会拒绝，而不再只验算现有的内力需求。截面位置划分不同时，梁线包络仍保留每个组合。请重新运行已保存的混凝土和钢结构设计，并复核拒绝情况和证书（SA-2026-071）。",
          "坡形受雪屋面上屋面高差处的雪堆积以及屋面宽度，均按实际屋面平面确定，与平面旋转无关。相连的屋面区域保留堆积、滑落和不均匀分布工况。请先重新生成受影响的雪荷载，再重新运行分析、组合和设计验算（SA-2026-065、SA-2026-067）。",
          "增加节点不再移动雪荷载的屋脊，也不再把细分后的穹顶板件归类为楼板。跨越屋脊的杆件上的荷载，在所选承载构件子集上也保持其合力和合力矩。请重新生成所有受影响的生成面荷载（包括屋面和楼面荷载），然后重新运行分析、组合和设计验算；仅重新求解已存储的荷载是不够的（SA-2026-072、SA-2026-073、SA-2026-074）。",
          "在含有壳的板块中，梁承受其能够支承的未覆盖条带上的荷载。覆盖情况不明确时，荷载生成会被拒绝。在从属宽度模式下，各楼层面积和地震质量按受荷杆件计算。无法表示其偏心荷载的楼面区域会被拒绝。请先重新生成受影响的重力荷载和地震荷载，再重新运行分析和验算。",
          "匈牙利语翻译包含版本说明和已保存项目的通知。扩展的 Fehér 研究控件、合并后的工具页、新的 Mohr 入口和弯矩图游戏仍为可选功能，默认关闭。账户和广告效果测量仍默认关闭。",
          "应力工具保留较小的非零主应力和剪应力，分享的 Mohr 链接保留所输入的应力状态。计算器的结果与当前输入保持一致。打开配筋工作区时重复的几何计算更少，几何和分析结果不变。",
          "3D 分析拒绝未知的支座类型。方向不明确的滚动支座和自定义支座需要明确的约束。混凝土梁示例使用预期的简支支座。请确认受影响的支座约束哪些位移，然后重新运行分析、组合和设计验算（SA-2026-089）。",
          "0.6.0 和 0.6.1 的版本说明和博客文章说明了哪些项目需要重新计算、哪些荷载需要重新生成。此处列出的后续修正已在 main 上，等待 0.6.2 版本发布；尚未关闭的审计发现仍在跟踪。",
          "一个新的 Research 实验基于 Heyman 关于砌体的研究，探讨拱的最小厚度以及拱在荷载下如何倒塌。",
        ],
      },
    },
  },
  {
    date: '2026-11-13',
    advisories: [
      { id: 'SA-2026-060', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-060-staged-orphan-rotations.md' },
      { id: 'SA-2026-061', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-061-path-solver-reactions.md' },
      { id: 'SA-2026-062', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-062-plastic-conditioning-zero-collapse.md' },
      { id: 'SA-2026-063', href: 'https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-063-prescribed-master-motion.md' },
    ],
    areas: ['engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'engine', 'pro', 'app'],
    i18n: {
      es: {
        title: 'Estabilidad antes de calcular, cargas móviles y P-Delta corregidos, límites más claros',
        items: [
          'Los análisis lineales 2D y 3D comprueban la estabilidad de la rigidez antes de calcular. Los mecanismos, la rigidez negativa y la rigidez demasiado incierta se rechazan con una razón, en lugar de resolverse con resortes o desplazamientos artificiales. Hay que volver a correr los análisis afectados y sus chequeos de diseño.',
          'Un resorte en un grado de libertad restringido rígidamente se rechaza en 2D y 3D. Las cargas móviles 3D capturan los máximos bajo un eje dentro del tramo, incluida su fuerza axial en barras inclinadas y sus esfuerzos de extremo. Hay que recalcular las envolventes afectadas.',
          'P-Delta integra el esfuerzo axial variable a lo largo de cada barra en 2D y 3D y corrige la amplificación subestimada bajo cargas de tramo. El análisis armónico resuelve de forma completa las frecuencias sin una cota para el truncamiento modal, también por encima del límite de tamaño denso. Hay que repetir estos análisis y los chequeos derivados.',
          'El colapso plástico 3D certificado informa su cota inferior certificada y rechaza un certificado no válido. El análisis plástico comprueba el trabajo y la memoria necesarios antes de reservarlos. El control por carga con fibras acota su carga límite en vez de informar una que cambia con el tamaño del paso.',
          'El contacto rechaza un estado congelado que incumple las condiciones finales de contacto. Los cables se rechazan fuera del análisis específico de cables, donde no se puede representar su destensado. Estos límites rigen en el motor nativo y en el navegador.',
          'Las combinaciones de cáscaras conservan las tensiones de los casos con desplazamientos impuestos e incluyen las tensiones nodales de los quads; la interacción suelo-estructura devuelve las reacciones en 2D y 3D. El pandeo y los análisis multicaso rechazan resultados no finitos. Los proyectos guardados identifican los análisis de versiones con errores conocidos y piden repetir el análisis afectado.',
          'El pandeo 2D y 3D mantiene las cotas de redondeo del esfuerzo axial dentro de las partes realmente acopladas. Un vínculo en una estructura independiente ya no impide resolver otra columna; la compresión incierta dentro de una parte acoplada sigue rechazándose. Hay que repetir el pandeo y P-Delta guardados para actualizar los factores B2 y la estabilidad.',
          'Las pruebas de regresión cubren 28 modelos reportados que ahora se rechazan con una razón; la revisión de la evidencia permitió cerrar 25 incidencias candidatas. Siete modelos antiguos de cáscaras tienen una rotación rígida libre en su plano: las pruebas nativas y del navegador confirman su rechazo y comprueban las respuestas al añadir la restricción que faltaba.',
          'Los análisis por etapas 2D y 3D comparten el tratamiento de rotaciones libres del análisis lineal. Las liberaciones de extremo y los cambios de unidades ya no añaden rigidez rotacional artificial, y los asentamientos conservan el movimiento previsto. Hay que repetir los análisis por etapas afectados y sus chequeos de diseño (SA-2026-060). Un rechazo elástico inicial en el análisis plástico 3D sigue siendo un rechazo, en vez de convertirse en un factor de colapso cero sin aviso (SA-2026-062).',
          'Los chequeos de equilibrio plástico ya no fallan con modelos importados cuyas etiquetas de registro difieren de los identificadores de barras y nodos. Los certificados plásticos cuentan el almacenamiento realmente necesario y conservan las últimas cotas válidas si un refinamiento opcional supera el límite. Algunos pórticos antes rechazados ahora pueden certificarse con los mismos límites.',
          'La certificación plástica es más rápida, con las mismas respuestas y límites de recursos. El ejemplo de outrigger también se resuelve más rápido y conserva su rango de deslizadores verificado.',
          'Los análisis no lineales 2D y 3D comprueban el equilibrio físico de forma consistente al rotar, reflejar o cambiar unidades. P-Delta, los asentamientos impuestos y los resortes de suelo conservan respuestas pequeñas resolubles sin relajar los límites de convergencia. Hay que repetir los análisis no lineales, P-Delta y de interacción suelo-estructura afectados.',
          'Los factores de pandeo se recuperan con las matrices de rigidez originales en 2D y 3D, corrigiendo pequeñas sobreestimaciones y rechazos incorrectos de modelos con vínculos o barras curvas. El cálculo didáctico conserva modos válidos al cambiar unidades. Hay que repetir el pandeo afectado; los límites del certificado no cambian.',
          'Las cargas de barra de reticulados entran en el chequeo de equilibrio en 2D y 3D. Los modelos válidos ya no se rechazan cuando sus cargas nodales equivalentes se resuelven. Hay que repetir los análisis de reticulados afectados.',
          'El análisis modal conserva el rango físico de la masa al aplicar vínculos y apoyos inclinados. Los modelos con direcciones sin masa pueden devolver sus modos finitos válidos sin que un modo adicional espurio provoque un rechazo. Hay que repetir los análisis modales afectados y sus respuestas dinámicas derivadas.',
          'Los asentamientos y giros impuestos en maestros restringidos de vínculos llegan a los nodos dependientes en análisis por etapas, Winkler, contacto, material no lineal, corrotacional 2D y longitud de arco. Los análisis con elementos cable y las historias lineales rechazan movimientos impuestos no nulos que no pueden representar. Hay que repetir los análisis afectados y sus chequeos derivados (SA-2026-063).',
          'La longitud de arco y el control por desplazamiento recuperan reacciones y esfuerzos de barra con el factor de carga final. La recuperación no lineal y por etapas incluye las fuerzas transmitidas por vínculos, excluye rigidez artificial y usa el estado físico y los ejes finales de cada barra. Hay que repetir los análisis afectados y sus chequeos derivados (SA-2026-061).',
          'P-Delta distingue un residuo físico fallido de una limitación del equilibrio de momentos en la geometría desplazada. El fallo físico deja fuerzas y tensiones no disponibles; la segunda limitación conserva respuestas válidas de pequeños desplazamientos con una advertencia. La historia temporal no entrega las reacciones totales y máximas no disponibles y conserva las historias y máximos de desplazamiento. Hay que revisar los esfuerzos guardados (SA-2026-061).',
          'Los análisis por etapas rechazan retirar una barra con esfuerzos internos en 2D y 3D. Los cambios de rigidez o de resortes de apoyo tras cargas o movimientos pueden dejar fuerzas y tensiones no disponibles, con un diagnóstico. Se conservan las respuestas de retiros exactamente descargados y de etapas determinadas solo por restricciones; la redistribución de fuerzas de barras cargadas sigue sin implementarse (SA-2026-061).',
          'La interacción suelo-estructura corrige el equilibrio elástico sin reiniciar un cálculo que no cambió. Los modelos girados o con otras unidades, sin suelo o con suelo en su rango lineal inicial, pueden converger con la tolerancia y el límite de iteraciones existentes. Hay que repetir los análisis afectados.',
          'Los pórticos y reticulados con vínculos ya no se rechazan incorrectamente por la cota de redondeo al girarlos o reflejarlos. Los cálculos lineales, por etapas, de fluencia y de inicio de P-Delta conservan la rigidez física resoluble en 2D y 3D; los límites de mecanismos y precisión no cambian. Hay que repetir los análisis afectados.',
          'El diseño de acero CIRSOC 301 toma del motor el gradiente de momentos y las propiedades de sección. El factor de gradiente incluye un cambio de signo en los extremos del tramo no arriostrado; el área neta a tracción verifica todas las cadenas de bulones escalonados y rechaza una conexión de todos los elementos sin bulones en el alma o la segunda ala de un ángulo. Hay que revisar las barras afectadas.',
          'Vuelven alemán, francés y turco. Research incorpora un riser marino con contacto con el fondo y el control de forma de una tira curvada, con sus comparaciones y límites a la vista. El guardado conserva edificios diseñados y avisa cuando el navegador no puede guardar.',
        ],
      },
      en: {
        title: 'Stability checked before solving, corrected moving loads and P-Delta, clearer limits',
        items: [
          'Linear 2D and 3D analyses check stiffness stability before solving. Mechanisms, negative stiffness and stiffness too uncertain to resolve are refused with a reason, instead of being solved with artificial springs or shifts. Re-run affected linear analyses and their design checks.',
          'A spring on a rigidly restrained degree of freedom is refused in both 2D and 3D. 3D moving loads capture peaks under an axle inside the span, including its axial force on inclined members and its end forces. Re-run affected moving-load envelopes.',
          'P-Delta integrates axial force varying along each member in 2D and 3D, correcting understated amplification under span loads. Harmonic analysis solves frequencies without a bounded modal truncation in full, including models above the dense size limit. Re-run these analyses and derived checks.',
          'Checked 3D plastic collapse reports its certified lower bound and refuses an unsound certificate. Plastic analysis checks its work and memory needs before allocating. Fibre load control brackets its load limit instead of reporting one that changes with step size.',
          'Contact analyses refuse a frozen state that fails the final contact conditions. Cable elements are refused outside the dedicated cable analysis, where their slackening cannot be represented. These limits apply to native and browser analyses.',
          'Shell combinations retain stresses from imposed-displacement cases and include quad nodal stresses; SSI returns support reactions in 2D and 3D. Buckling and multi-case analyses refuse non-finite results. Saved projects identify analyses from versions with known wrong results and ask for the affected analysis to be run again.',
          '2D and 3D buckling keep axial-force round-off bounds within parts that are actually coupled. A constraint in an independent structure no longer prevents another column from being solved; uncertain compression within a coupled part is still refused. Re-run saved buckling and P-Delta analyses to refresh B2 factors and stability.',
          'Regression checks cover 28 reported models now refused with a reason; evidence review allowed 25 candidate issues to close. Seven old shell models have a free in-plane rigid rotation: native and browser tests confirm their refusal and check the answers after adding the missing restraint.',
          'Staged 2D and 3D analyses share linear analysis’s free-rotation handling. End releases and unit changes no longer add artificial rotational stiffness, and settlements retain their intended motion. Re-run affected staged analyses and derived design checks (SA-2026-060). Initial elastic refusals in 3D plastic analysis now remain refusals instead of becoming silent zero collapse factors (SA-2026-062).',
          'Plastic balance checks no longer crash on imported models whose record labels differ from their member and node IDs. Plastic certificates count the storage actually needed and retain the last valid bounds when an optional refinement exceeds the limit. Previously refused frames can now certify within the same limits.',
          'Plastic certification runs faster with unchanged answers and resource limits. The outrigger example also solves faster while retaining its checked slider range.',
          'Nonlinear 2D and 3D analyses check physical equilibrium consistently after rotation, reflection and unit changes. P-Delta, prescribed settlements and soil springs retain small resolved responses without relaxing convergence limits. Re-run affected nonlinear, P-Delta and soil–structure analyses.',
          'Buckling factors are recovered from the original stiffness matrices in 2D and 3D, correcting small overestimates and false refusals of constrained or curved-member models. Valid teaching modes are retained across different units. Re-run affected buckling analyses; certificate limits are unchanged.',
          'Truss member loads now enter the equilibrium check in 2D and 3D, so valid member-loaded models are no longer refused when equivalent nodal loads solve. Re-run affected truss analyses.',
          'Modal analysis preserves the physical mass rank through constraints and inclined supports. Models with massless directions can return their valid finite modes without a spurious extra mode causing refusal. Re-run affected modal analyses and dependent dynamic responses.',
          'Prescribed settlements and rotations at restrained constraint masters now reach dependent nodes in staged, Winkler, contact, material nonlinear, 2D corotational and arc-length analyses. Cable-element and linear time-history analyses refuse nonzero prescribed support motion they cannot represent. Re-run affected analyses and derived checks (SA-2026-063).',
          'Arc-length and displacement control recover support reactions and member forces at the final load factor. Nonlinear and staged recovery includes forces transferred through constraints, excludes artificial stiffness and uses the final physical state and member frame. Re-run affected analyses and derived checks (SA-2026-061).',
          'P-Delta distinguishes a failed physical residual from a displaced-geometry moment-balance limitation. Failed physical equilibrium withholds forces and stresses; the latter limitation keeps valid small-displacement answers with a warning. Time history withholds unavailable total and peak support reactions while retaining displacement histories and peaks. Recheck saved forces (SA-2026-061).',
          'Staged histories that remove a member carrying internal force are refused in 2D and 3D. Stiffness or support-spring changes after loading or motion can leave forces and stresses unavailable with a diagnostic. Exactly unloaded removals and fully determined constraint-only stages retain their answers; loaded-member force redistribution remains unsupported (SA-2026-061).',
          'Soil–structure interaction corrects elastic equilibrium without restarting an unchanged solve. Rotated and unit-scaled models with no soil or soil in its initial linear range can converge within the existing tolerance and iteration limit. Re-run affected SSI analyses.',
          'Rotated or mirrored constrained frames and trusses no longer receive false refusals from the rounding bound. Linear, staged, creep and P-Delta initial solves retain resolvable physical stiffness in 2D and 3D; mechanism and accuracy limits remain unchanged. Re-run affected analyses.',
          'CIRSOC 301 steel design reads moment-gradient and section properties from the engine. The moment-gradient factor includes a sign change at the ends of an unbraced segment; tension net area checks every staggered bolt chain and refuses an all-elements connection missing web or second-leg bolts. Re-check affected steel members.',
          'German, French and Turkish are offered again. Research adds an offshore riser with seabed contact and shape control of a bent strip, with the comparisons and limits shown on their pages. Workspace saves preserve designed buildings and report when the browser cannot save.',
        ],
      },
      pt: {
        title: 'Estabilidade antes do cálculo, cargas móveis e P-Delta corrigidos, limites mais claros',
        items: [
          'As análises lineares 2D e 3D verificam a estabilidade da rigidez antes do cálculo. Mecanismos, rigidez negativa e rigidez com incerteza excessiva são recusados com uma razão, em vez de resolvidos com molas ou deslocamentos artificiais. Refaça as análises afetadas e suas verificações de projeto.',
          'Uma mola em um grau de liberdade rigidamente restringido é recusada em 2D e 3D. As cargas móveis 3D capturam os picos sob um eixo dentro do vão, incluindo sua força axial em barras inclinadas e seus esforços de extremidade. Recalcule as envoltórias afetadas.',
          'P-Delta integra a força axial variável ao longo de cada barra em 2D e 3D, corrigindo a amplificação subestimada sob cargas no vão. A análise harmônica resolve integralmente as frequências sem limite comprovado para o truncamento modal, inclusive acima do limite de tamanho denso. Refaça essas análises e as verificações derivadas.',
          'O colapso plástico 3D certificado informa seu limite inferior certificado e recusa um certificado inválido. A análise plástica verifica o trabalho e a memória necessários antes da alocação. O controle por carga com fibras delimita sua carga limite em vez de informar uma que muda com o tamanho do passo.',
          'A análise de contato recusa um estado congelado que viola as condições finais de contato. Cabos são recusados fora da análise específica de cabos, onde seu afrouxamento não pode ser representado. Esses limites valem para análises nativas e no navegador.',
          'As combinações de cascas mantêm as tensões dos casos com deslocamentos impostos e incluem as tensões nodais dos quads; a interação solo-estrutura retorna reações em 2D e 3D. Flambamento e análises multicaso recusam resultados não finitos. Projetos salvos identificam análises de versões com erros conhecidos e pedem para refazer a análise afetada.',
          'O flambamento 2D e 3D mantém os limites de arredondamento da força axial nas partes realmente acopladas. Um vínculo em uma estrutura independente já não impede o cálculo de outra coluna; a compressão incerta em uma parte acoplada continua sendo recusada. Refaça as análises salvas de flambamento e P-Delta para atualizar os fatores B2 e a estabilidade.',
          'Os testes de regressão cobrem 28 modelos relatados que agora são recusados com uma razão; a revisão das evidências permitiu encerrar 25 ocorrências candidatas. Sete modelos antigos de cascas têm uma rotação rígida livre no plano: testes nativos e no navegador confirmam a recusa e verificam as respostas após adicionar a restrição que faltava.',
          'As análises por etapas 2D e 3D compartilham o tratamento de rotações livres da análise linear. Liberações de extremidade e mudanças de unidades já não acrescentam rigidez rotacional artificial, e os recalques mantêm o movimento previsto. Refaça as análises por etapas afetadas e suas verificações de projeto (SA-2026-060). Recusas elásticas iniciais na análise plástica 3D continuam sendo recusas, em vez de se tornarem fatores de colapso zero sem aviso (SA-2026-062).',
          'As verificações de equilíbrio plástico já não falham em modelos importados cujos rótulos de registro diferem dos identificadores de barras e nós. Os certificados plásticos contam o armazenamento realmente necessário e mantêm os últimos limites válidos quando um refinamento opcional excede o limite. Pórticos antes recusados agora podem ser certificados dentro dos mesmos limites.',
          'A certificação plástica está mais rápida, com as mesmas respostas e limites de recursos. O exemplo de outrigger também resolve mais rápido, mantendo a faixa verificada dos controles deslizantes.',
          'As análises não lineares 2D e 3D verificam o equilíbrio físico de forma consistente após rotação, reflexão e mudança de unidades. P-Delta, recalques impostos e molas de solo preservam respostas pequenas resolvíveis sem relaxar os limites de convergência. Refaça as análises não lineares, P-Delta e de interação solo-estrutura afetadas.',
          'Os fatores de flambagem são recuperados com as matrizes de rigidez originais em 2D e 3D, corrigindo pequenas superestimativas e recusas incorretas de modelos com vínculos ou barras curvas. O cálculo didático mantém modos válidos em diferentes unidades. Refaça as análises de flambagem afetadas; os limites do certificado permanecem iguais.',
          'As cargas de barra de treliças entram na verificação de equilíbrio em 2D e 3D. Modelos válidos já não são recusados quando suas cargas nodais equivalentes são resolvidas. Refaça as análises de treliças afetadas.',
          'A análise modal preserva o posto físico da massa ao aplicar vínculos e apoios inclinados. Modelos com direções sem massa podem retornar seus modos finitos válidos sem recusa por um modo adicional espúrio. Refaça as análises modais afetadas e suas respostas dinâmicas derivadas.',
          'Recalques e rotações impostos em mestres restringidos de vínculos chegam aos nós dependentes nas análises por etapas, Winkler, contato, material não linear, corrotacional 2D e comprimento de arco. Análises com elementos de cabo e histórias lineares recusam movimentos impostos não nulos que não conseguem representar. Refaça as análises afetadas e suas verificações derivadas (SA-2026-063).',
          'O comprimento de arco e o controle por deslocamento recuperam reações e esforços de barra no fator de carga final. A recuperação não linear e por etapas inclui forças transmitidas por vínculos, exclui rigidez artificial e usa o estado físico e os eixos finais de cada barra. Refaça as análises afetadas e suas verificações derivadas (SA-2026-061).',
          'P-Delta distingue uma falha do resíduo físico de uma limitação do equilíbrio de momentos na geometria deslocada. A falha física deixa forças e tensões indisponíveis; a segunda limitação conserva respostas válidas de pequenos deslocamentos com aviso. A história temporal não fornece reações totais e máximas indisponíveis, preservando histórias e picos de deslocamento. Revise os esforços salvos (SA-2026-061).',
          'Histórias por etapas que removem uma barra com esforços internos são recusadas em 2D e 3D. Mudanças de rigidez ou de molas de apoio após cargas ou movimentos podem deixar forças e tensões indisponíveis, com diagnóstico. Remoções exatamente descarregadas e etapas determinadas apenas por restrições mantêm suas respostas; a redistribuição de forças de barras carregadas segue sem suporte (SA-2026-061).',
          'A interação solo-estrutura corrige o equilíbrio elástico sem reiniciar um cálculo inalterado. Modelos girados ou com outras unidades, sem solo ou com solo no intervalo linear inicial, podem convergir com a tolerância e o limite de iterações existentes. Refaça as análises afetadas.',
          'Pórticos e treliças com vínculos já não recebem recusas indevidas pelo limite de arredondamento ao girar ou espelhar o modelo. Análises lineares, por etapas, de fluência e soluções iniciais de P-Delta preservam a rigidez física resolúvel em 2D e 3D; os limites de mecanismos e precisão não mudam. Refaça as análises afetadas.',
          'O dimensionamento de aço CIRSOC 301 lê o gradiente de momentos e as propriedades da seção do motor. O fator de gradiente inclui a mudança de sinal nas extremidades do trecho não travado; a área líquida à tração verifica todas as cadeias de parafusos alternados e recusa uma ligação de todos os elementos sem parafusos na alma ou na segunda aba. Verifique novamente as barras afetadas.',
          'Alemão, francês e turco voltam a ser oferecidos. Research inclui um riser marítimo com contato com o fundo e o controle de forma de uma tira curvada, com comparações e limites visíveis. O salvamento preserva edifícios dimensionados e avisa quando o navegador não consegue salvar.',
        ],
      },
      de: {
        title: 'Stabilität vor dem Rechnen, Wanderlasten und P-Delta korrigiert, klarere Grenzen',
        items: [
          'Lineare 2D- und 3D-Analysen prüfen die Stabilität der Steifigkeit vor dem Lösen. Mechanismen, negative Steifigkeit und zu unsichere Steifigkeit werden begründet abgelehnt, statt mit künstlichen Federn oder Verschiebungen gelöst zu werden. Betroffene Analysen und Bemessungsprüfungen erneut ausführen.',
          'Eine Feder an einem starr gehaltenen Freiheitsgrad wird in 2D und 3D abgelehnt. 3D-Wanderlasten erfassen Spitzen unter einer Achse im Feld, einschließlich ihrer Normalkraft auf geneigten Stäben und ihrer Endkräfte. Betroffene Hüllkurven neu berechnen.',
          'P-Delta integriert die veränderliche Normalkraft entlang jedes Stabs in 2D und 3D und korrigiert zu geringe Verstärkung unter Feldlasten. Die harmonische Analyse löst Frequenzen ohne begrenzten modalen Abschneidefehler vollständig, auch oberhalb der dichten Größengrenze. Diese Analysen und abgeleitete Prüfungen erneut ausführen.',
          'Der zertifizierte plastische 3D-Kollaps meldet seine zertifizierte Untergrenze und lehnt ungültige Zertifikate ab. Die plastische Analyse prüft Rechen- und Speicherbedarf vor der Belegung. Die Faseranalyse unter Laststeuerung grenzt ihre Grenzlast ein, statt einen von der Schrittweite abhängigen Wert zu melden.',
          'Kontaktanalysen lehnen einen eingefrorenen Zustand ab, der die abschließenden Kontaktbedingungen verletzt. Seile werden außerhalb der eigenen Seilanalyse abgelehnt, wo ihr Erschlaffen nicht dargestellt werden kann. Diese Grenzen gelten nativ und im Browser.',
          'Schalenkombinationen erhalten Spannungen aus Lastfällen mit vorgegebenen Verschiebungen und enthalten Quad-Knotenspannungen; die Boden-Bauwerk-Interaktion liefert Auflagerreaktionen in 2D und 3D. Knick- und Mehrlastfallanalysen lehnen nicht endliche Ergebnisse ab. Gespeicherte Projekte erkennen Analysen aus Versionen mit bekannten Fehlern und fordern deren erneute Berechnung.',
          'Die 2D- und 3D-Knickanalyse begrenzt Rundungsfehlerschranken der Normalkraft auf tatsächlich gekoppelte Teile. Eine Zwangsbedingung in einer unabhängigen Struktur verhindert nicht mehr die Berechnung einer anderen Stütze; unsichere Druckkräfte innerhalb eines gekoppelten Teils werden weiterhin abgelehnt. Gespeicherte Knick- und P-Delta-Analysen erneut ausführen, um B2-Faktoren und Stabilität zu aktualisieren.',
          'Regressionstests decken 28 gemeldete Modelle ab, die jetzt begründet abgelehnt werden; nach Prüfung der Belege konnten 25 Verdachtsfälle geschlossen werden. Sieben alte Schalenmodelle haben eine freie Starrkörperdrehung in ihrer Ebene: Tests nativ und im Browser bestätigen die Ablehnung und prüfen die Ergebnisse nach Ergänzung der fehlenden Lagerung.',
          'Die Bauphasenanalyse in 2D und 3D behandelt freie Drehungen wie die lineare Analyse. Endgelenke und Einheitenwechsel erzeugen keine künstliche Drehsteifigkeit mehr; Setzungen behalten die vorgesehene Bewegung. Betroffene Bauphasenanalysen und Bemessungsprüfungen erneut ausführen (SA-2026-060). Eine anfängliche elastische Ablehnung in der plastischen 3D-Analyse bleibt eine Ablehnung, statt unbemerkt zu einem Kollapsfaktor null zu werden (SA-2026-062).',
          'Plastische Gleichgewichtsprüfungen stürzen bei importierten Modellen mit abweichenden Datensatzbezeichnungen und Stab- oder Knotenkennungen nicht mehr ab. Plastische Zertifikate berücksichtigen den tatsächlich benötigten Speicher und behalten die letzten gültigen Schranken, wenn eine optionale Verfeinerung die Grenze überschreitet. Zuvor abgelehnte Rahmen können innerhalb derselben Grenzen zertifiziert werden.',
          'Die plastische Zertifizierung läuft schneller, bei unveränderten Ergebnissen und Ressourcengrenzen. Auch das Outrigger-Beispiel rechnet schneller und behält seinen geprüften Schiebereglerbereich.',
          'Nichtlineare 2D- und 3D-Analysen prüfen das physikalische Gleichgewicht nach Drehung, Spiegelung und Einheitenwechsel einheitlich. P-Delta, vorgegebene Setzungen und Bodenfedern erhalten kleine auflösbare Antworten, ohne Konvergenzgrenzen zu lockern. Betroffene nichtlineare, P-Delta- und Boden-Bauwerk-Analysen erneut ausführen.',
          'Knickfaktoren werden in 2D und 3D aus den ursprünglichen Steifigkeitsmatrizen bestimmt. Das korrigiert kleine Überschätzungen und falsche Ablehnungen bei Zwangsbedingungen oder gekrümmten Stäben. Die Lehrberechnung erhält gültige Moden bei Einheitenwechseln. Betroffene Knickanalysen erneut ausführen; die Zertifikatsgrenzen bleiben gleich.',
          'Stablasten von Fachwerken gehen in 2D und 3D in die Gleichgewichtsprüfung ein. Gültige Modelle werden nicht mehr abgelehnt, wenn die gleichwertigen Knotenlasten lösbar sind. Betroffene Fachwerkanalysen erneut ausführen.',
          'Die Modalanalyse erhält den physikalischen Rang der Masse bei Bindungen und geneigten Auflagern. Modelle mit masselosen Richtungen können ihre gültigen endlichen Eigenmoden liefern, ohne durch einen zusätzlichen unechten Modus abgelehnt zu werden. Betroffene Modalanalysen und davon abhängige dynamische Antworten erneut berechnen.',
          'Vorgegebene Setzungen und Drehungen an gehaltenen Masterfreiheitsgraden erreichen abhängige Knoten in Bauphasen-, Winkler-, Kontakt-, materialnichtlinearen, korotationalen 2D- und Bogenlängenanalysen. Analysen mit Seilelementen und lineare Zeitverlaufsanalysen lehnen vorgegebene Auflagerbewegungen ungleich null ab, die sie nicht darstellen können. Betroffene Analysen und abgeleitete Nachweise erneut ausführen (SA-2026-063).',
          'Bogenlängen- und Verschiebungssteuerung berechnen Auflagerreaktionen und Stabkräfte beim endgültigen Lastfaktor. Nichtlineare und Bauphasenanalysen berücksichtigen über Bindungen übertragene Kräfte, schließen künstliche Steifigkeit aus und nutzen den endgültigen physikalischen Zustand und die endgültigen Stabachsen. Betroffene Analysen und abgeleitete Nachweise erneut ausführen (SA-2026-061).',
          'P-Delta unterscheidet ein fehlgeschlagenes physikalisches Residuum von einer Einschränkung des Momentengleichgewichts an der verschobenen Geometrie. Bei physikalischem Ungleichgewicht werden Kräfte und Spannungen zurückgehalten; bei der zweiten Einschränkung bleiben gültige Antworten für kleine Verschiebungen mit Warnung erhalten. Zeitverlaufsanalysen halten nicht verfügbare gesamte und maximale Auflagerreaktionen zurück; Verschiebungsverläufe und Spitzen bleiben erhalten. Gespeicherte Kräfte erneut prüfen (SA-2026-061).',
          'Bauphasenverläufe, die einen Stab mit inneren Kräften entfernen, werden in 2D und 3D abgelehnt. Änderungen von Steifigkeit oder Auflagerfedern nach Belastung oder Bewegung können Kräfte und Spannungen mit Diagnose als nicht verfügbar ausweisen. Genau unbelastete Entfernungen und allein durch Bindungen vollständig bestimmte Phasen behalten ihre Antworten; die Kraftumlagerung entfernter belasteter Stäbe bleibt nicht unterstützt (SA-2026-061).',
          'Die Boden-Bauwerk-Interaktion korrigiert das elastische Gleichgewicht, ohne eine unveränderte Lösung neu zu starten. Gedrehte oder in andere Einheiten umgerechnete Modelle ohne Boden oder mit Boden im anfänglichen linearen Bereich können innerhalb der bisherigen Toleranz und Iterationsgrenze konvergieren. Betroffene SSI-Analysen erneut ausführen.',
          'Gedrehte oder gespiegelte Rahmen und Fachwerke mit Bindungen werden nicht mehr wegen einer unzutreffenden Rundungsschranke abgelehnt. Lineare, Bauphasen-, Kriechanalysen und P-Delta-Anfangslösungen erhalten auflösbare physikalische Steifigkeit in 2D und 3D; Mechanismus- und Genauigkeitsgrenzen bleiben unverändert. Betroffene Analysen erneut ausführen.',
          'Die Stahlbemessung nach CIRSOC 301 liest Momentengradient und Querschnittswerte aus dem Rechenkern. Der Gradientenfaktor berücksichtigt Vorzeichenwechsel an den Enden eines ungestützten Abschnitts; die Nettozugfläche prüft jede versetzte Schraubenkette und lehnt einen Anschluss aller Teile ohne Steg- oder zweite Schenkelschrauben ab. Betroffene Stäbe erneut prüfen.',
          'Deutsch, Französisch und Türkisch werden wieder angeboten. Research ergänzt einen Offshore-Riser mit Meeresbodenkontakt und die Formsteuerung eines gebogenen Streifens, mit sichtbaren Vergleichen und Grenzen. Das Speichern erhält bemessene Gebäude und meldet, wenn der Browser nicht speichern kann.',
        ],
      },
      fr: {
        title: 'Stabilité avant le calcul, charges mobiles et P-Delta corrigés, limites plus claires',
        items: [
          'Les analyses linéaires 2D et 3D vérifient la stabilité de la rigidité avant de résoudre. Les mécanismes, rigidités négatives et rigidités trop incertaines sont refusés avec une raison, au lieu d’être résolus avec des ressorts ou décalages artificiels. Relancez les analyses concernées et leurs vérifications de dimensionnement.',
          'Un ressort sur un degré de liberté bloqué rigidement est refusé en 2D et 3D. Les charges mobiles 3D capturent les pics sous un essieu dans la travée, y compris sa force axiale sur les barres inclinées et ses efforts aux extrémités. Recalculez les enveloppes concernées.',
          'P-Delta intègre l’effort axial variable le long de chaque barre en 2D et 3D et corrige une amplification sous-estimée sous charges de travée. L’analyse harmonique résout intégralement les fréquences sans borne de troncature modale, même au-delà de la limite de taille dense. Relancez ces analyses et les vérifications dérivées.',
          'Le collapse plastique 3D certifié rapporte sa borne inférieure certifiée et refuse un certificat invalide. L’analyse plastique vérifie le travail et la mémoire nécessaires avant allocation. Le contrôle en charge par fibres encadre sa charge limite au lieu de rapporter une valeur dépendant du pas.',
          'Les analyses de contact refusent un état figé qui viole les conditions finales de contact. Les câbles sont refusés hors de l’analyse dédiée aux câbles, où leur détente ne peut être représentée. Ces limites valent en natif et dans le navigateur.',
          'Les combinaisons de coques conservent les contraintes des cas à déplacements imposés et incluent les contraintes nodales des quads ; l’interaction sol-structure fournit les réactions en 2D et 3D. Le flambement et les analyses multicas refusent les résultats non finis. Les projets enregistrés identifient les analyses de versions avec des erreurs connues et demandent de relancer l’analyse concernée.',
          'Le flambement 2D et 3D limite les bornes d’arrondi de l’effort axial aux parties réellement couplées. Une contrainte dans une structure indépendante n’empêche plus le calcul d’un autre poteau ; une compression incertaine dans une partie couplée reste refusée. Relancez les analyses enregistrées de flambement et de P-Delta pour actualiser les facteurs B2 et la stabilité.',
          'Les tests de régression couvrent 28 modèles signalés désormais refusés avec une raison ; la revue des preuves a permis de clore 25 signalements candidats. Sept anciens modèles de coques ont une rotation rigide libre dans leur plan : les tests natifs et du navigateur confirment leur refus et vérifient les réponses après ajout du blocage manquant.',
          'Les analyses par phases 2D et 3D traitent les rotations libres comme l’analyse linéaire. Les libérations d’extrémité et les changements d’unités n’ajoutent plus de rigidité de rotation artificielle ; les tassements conservent le mouvement prévu. Relancez les analyses par phases concernées et leurs vérifications de dimensionnement (SA-2026-060). Un refus élastique initial en analyse plastique 3D reste un refus au lieu de devenir un facteur de ruine nul sans avertissement (SA-2026-062).',
          'Les vérifications d’équilibre plastique ne plantent plus sur les modèles importés dont les étiquettes diffèrent des identifiants de barres et de nœuds. Les certificats plastiques comptent le stockage réellement nécessaire et conservent les dernières bornes valides si un raffinement facultatif dépasse la limite. Des portiques auparavant refusés peuvent désormais être certifiés dans les mêmes limites.',
          'La certification plastique est plus rapide, avec les mêmes résultats et limites de ressources. L’exemple d’outrigger se calcule aussi plus vite et conserve la plage vérifiée de ses curseurs.',
          'Les analyses non linéaires 2D et 3D vérifient l’équilibre physique de façon cohérente après rotation, réflexion et changement d’unités. P-Delta, les tassements imposés et les ressorts de sol préservent les petites réponses résolubles sans assouplir les limites de convergence. Relancez les analyses non linéaires, P-Delta et d’interaction sol-structure concernées.',
          'Les facteurs de flambement sont calculés à partir des matrices de rigidité d’origine en 2D et 3D, corrigeant de légères surestimations et des refus injustifiés de modèles avec liaisons ou barres courbes. Le calcul pédagogique conserve les modes valides dans différentes unités. Relancez les analyses de flambement concernées ; les limites du certificat restent inchangées.',
          'Les charges de barre des treillis entrent dans la vérification d’équilibre en 2D et 3D. Les modèles valides ne sont plus refusés lorsque leurs charges nodales équivalentes permettent une solution. Relancez les analyses de treillis concernées.',
          'L’analyse modale conserve le rang physique de la masse après application des liaisons et des appuis inclinés. Les modèles avec des directions sans masse peuvent fournir leurs modes finis valides sans refus causé par un mode supplémentaire artificiel. Relancez les analyses modales concernées et les réponses dynamiques qui en dépendent.',
          'Les tassements et rotations imposés aux maîtres bloqués des liaisons atteignent les nœuds dépendants dans les analyses par phases, Winkler, de contact, de matériau non linéaire, corotationnelles 2D et de longueur d’arc. Les analyses avec éléments de câble et les analyses temporelles linéaires refusent les mouvements imposés non nuls qu’elles ne peuvent représenter. Relancez les analyses concernées et leurs vérifications dérivées (SA-2026-063).',
          'La longueur d’arc et le contrôle en déplacement calculent les réactions et efforts de barre au facteur de charge final. La récupération non linéaire et par phases inclut les forces transmises par les liaisons, exclut la rigidité artificielle et utilise l’état physique et les axes finaux des barres. Relancez les analyses concernées et leurs vérifications dérivées (SA-2026-061).',
          'P-Delta distingue un échec du résidu physique d’une limite de l’équilibre des moments sur la géométrie déplacée. L’échec physique rend les forces et contraintes indisponibles ; la seconde limite conserve les réponses valides en petits déplacements avec un avertissement. L’analyse temporelle ne fournit pas les réactions totales et maximales indisponibles, tout en conservant les historiques et pics de déplacement. Revérifiez les efforts enregistrés (SA-2026-061).',
          'Les historiques par phases retirant une barre qui porte des efforts internes sont refusés en 2D et 3D. Un changement de rigidité ou de ressorts d’appui après chargement ou mouvement peut rendre les forces et contraintes indisponibles, avec un diagnostic. Les retraits exactement déchargés et les phases entièrement déterminées par les seules liaisons conservent leurs réponses ; la redistribution des forces des barres chargées reste non prise en charge (SA-2026-061).',
          'L’interaction sol-structure corrige l’équilibre élastique sans recommencer une résolution inchangée. Les modèles tournés ou convertis dans d’autres unités, sans sol ou avec un sol dans sa plage linéaire initiale, peuvent converger avec la tolérance et la limite d’itérations existantes. Relancez les analyses concernées.',
          'Les portiques et treillis avec liaisons, tournés ou réfléchis, ne subissent plus de refus injustifiés dus à la borne d’arrondi. Les calculs linéaires, par phases, de fluage et les solutions initiales de P-Delta préservent la rigidité physique résoluble en 2D et 3D ; les limites de mécanismes et de précision ne changent pas. Relancez les analyses concernées.',
          'Le dimensionnement acier CIRSOC 301 lit le gradient de moments et les propriétés de section dans le moteur. Le facteur de gradient tient compte du changement de signe aux extrémités du tronçon non maintenu ; l’aire nette en traction vérifie toutes les chaînes de boulons décalés et refuse une liaison de tous les éléments sans boulons dans l’âme ou la seconde aile de cornière. Revérifiez les barres concernées.',
          'L’allemand, le français et le turc sont à nouveau proposés. Research ajoute un riser marin en contact avec le fond et le contrôle de forme d’une bande courbée, avec comparaisons et limites visibles. La sauvegarde conserve les bâtiments dimensionnés et signale un refus du navigateur.',
        ],
      },
      tr: {
        title: 'Çözüm öncesi kararlılık kontrolü, düzeltilmiş hareketli yükler ve P-Delta, daha açık sınırlar',
        items: [
          'Doğrusal 2D ve 3D analizler çözümden önce rijitlik kararlılığını kontrol eder. Mekanizmalar, negatif rijitlik ve çözülemeyecek kadar belirsiz rijitlik, yapay yaylar veya kaydırmalarla çözülmek yerine gerekçesiyle reddedilir. Etkilenen analizleri ve tasarım kontrollerini yeniden çalıştırın.',
          'Rijit tutulan serbestlik derecesindeki yay hem 2D hem 3D için reddedilir. 3D hareketli yükler, açıklık içindeki dingil altında oluşan tepe değerlerini, eğik çubuklardaki eksenel kuvveti ve uç kuvvetlerini yakalar. Etkilenen zarfları yeniden hesaplayın.',
          'P-Delta, 2D ve 3D çubuklar boyunca değişen eksenel kuvveti integre ederek açıklık yükleri altında düşük hesaplanan büyütmeyi düzeltir. Harmonik analiz, modal kesme hatası sınırlandırılamayan frekansları yoğun çözüm boyut sınırının üstünde de tam olarak çözer. Bu analizleri ve bunlardan türetilen kontrolleri yeniden çalıştırın.',
          'Sertifikalı 3D plastik göçme, sertifikalı alt sınırını bildirir ve geçersiz sertifikayı reddeder. Plastik analiz bellek ayırmadan önce iş ve bellek gereksinimini kontrol eder. Lifli yük kontrolü, adım boyutuna göre değişen bir yük sınırı bildirmek yerine sınırı aralık içine alır.',
          'Temas analizleri son temas koşullarını sağlamayan donmuş durumu reddeder. Gevşemenin temsil edilemediği özel kablo analizi dışındaki analizlerde kablolar reddedilir. Bu sınırlar yerel ve tarayıcı analizlerinde geçerlidir.',
          'Kabuk birleşimleri, zorlanmış yer değiştirme durumlarının gerilmelerini korur ve quad düğüm gerilmelerini içerir; zemin-yapı etkileşimi 2D ve 3D mesnet tepkilerini verir. Burkulma ve çok durumlu analizler sonlu olmayan sonuçları reddeder. Kayıtlı projeler bilinen hatalı sürümlerdeki analizleri tanımlar ve etkilenen analizin yeniden çalıştırılmasını ister.',
          '2D ve 3D burkulma analizi, eksenel kuvvet yuvarlama sınırlarını gerçekten bağlı parçalar içinde tutar. Bağımsız bir yapıdaki kısıt artık başka bir kolonun çözülmesini engellemez; bağlı bir parçadaki belirsiz basınç kuvveti yine reddedilir. B2 katsayılarını ve kararlılığı güncellemek için kayıtlı burkulma ve P-Delta analizlerini yeniden çalıştırın.',
          'Regresyon testleri artık gerekçesiyle reddedilen 28 bildirilmiş modeli kapsar; kanıt incelemesiyle 25 aday sorun kapatıldı. Yedi eski kabuk modelinde düzlem içi serbest rijit dönme vardır: yerel ve tarayıcı testleri reddi doğrular ve eksik kısıt eklendikten sonraki sonuçları kontrol eder.',
          'Aşamalı 2D ve 3D analizler serbest dönmeleri doğrusal analizle aynı şekilde ele alır. Uç serbestlikleri ve birim değişiklikleri artık yapay dönme rijitliği eklemez; oturmalar öngörülen hareketi korur. Etkilenen aşamalı analizleri ve tasarım kontrollerini yeniden çalıştırın (SA-2026-060). 3D plastik analizde başlangıç elastik çözümünün reddi, uyarısız sıfır göçme katsayısına dönüşmek yerine ret olarak iletilir (SA-2026-062).',
          'Plastik denge kontrolleri, kayıt etiketleri çubuk ve düğüm kimliklerinden farklı olan içe aktarılmış modellerde artık çökmez. Plastik sertifikalar gerçekten gereken depolamayı sayar; isteğe bağlı bir iyileştirme sınırı aşarsa son geçerli sınırlar korunur. Daha önce reddedilen çerçeveler aynı sınırlar içinde sertifikalanabilir.',
          'Plastik sertifikalama aynı yanıtlar ve kaynak sınırlarıyla daha hızlı çalışır. Outrigger örneği de doğrulanmış kaydırıcı aralığını koruyarak daha hızlı çözülür.',
          'Doğrusal olmayan 2D ve 3D analizler dönme, yansıma ve birim değişikliklerinden sonra fiziksel dengeyi tutarlı biçimde kontrol eder. P-Delta, tanımlı oturmalar ve zemin yayları yakınsama sınırlarını gevşetmeden küçük çözülebilir tepkileri korur. Etkilenen doğrusal olmayan, P-Delta ve zemin-yapı etkileşimi analizlerini yeniden çalıştırın.',
          'Burkulma katsayıları 2D ve 3D için özgün rijitlik matrislerinden hesaplanır; küçük fazla tahminler ve kısıtlı ya da eğri çubuklu modellerdeki hatalı retler düzeltilir. Öğretim hesabı birim değişikliklerinde geçerli modları korur. Etkilenen burkulma analizlerini yeniden çalıştırın; sertifika sınırları değişmedi.',
          'Kafes çubuk yükleri artık 2D ve 3D denge kontrolüne katılır. Eşdeğer düğüm yükleriyle çözülen geçerli modeller çubuk yükleriyle artık reddedilmez. Etkilenen kafes analizlerini yeniden çalıştırın.',
          'Modal analiz, kısıtlar ve eğik mesnetler uygulanırken kütlenin fiziksel mertebesini korur. Kütlesiz yönleri olan modeller, yapay bir ek mod nedeniyle reddedilmeden geçerli sonlu modlarını verebilir. Etkilenen modal analizleri ve bunlara bağlı dinamik yanıtları yeniden hesaplayın.',
          'Kısıtların tutulu ana serbestlik derecelerine tanımlanan oturma ve dönmeler; aşamalı, Winkler, temas, malzeme bakımından doğrusal olmayan, 2D korotasyonel ve yay uzunluğu analizlerinde bağımlı düğümlere aktarılır. Kablo elemanlı analizler ve doğrusal zaman tanım alanı analizleri, temsil edemedikleri sıfırdan farklı tanımlı mesnet hareketlerini reddeder. Etkilenen analizleri ve türetilen kontrolleri yeniden çalıştırın (SA-2026-063).',
          'Yay uzunluğu ve yer değiştirme kontrolü, mesnet tepkilerini ve çubuk kuvvetlerini son yük katsayısında hesaplar. Doğrusal olmayan ve aşamalı hesaplar, kısıtlarla aktarılan kuvvetleri içerir, yapay rijitliği dışlar ve son fiziksel durumu ve çubuk eksenlerini kullanır. Etkilenen analizleri ve türetilen kontrolleri yeniden çalıştırın (SA-2026-061).',
          'P-Delta, fiziksel artık hatasını yer değiştirmiş geometrideki moment dengesi sınırlamasından ayırır. Fiziksel denge sağlanmazsa kuvvetler ve gerilmeler verilmez; ikinci sınırlamada geçerli küçük yer değiştirme yanıtları uyarıyla korunur. Zaman tanım alanı analizi, mevcut olmayan toplam ve tepe mesnet tepkilerini vermez; yer değiştirme geçmişlerini ve tepe değerlerini korur. Kayıtlı kuvvetleri yeniden kontrol edin (SA-2026-061).',
          'İç kuvvet taşıyan bir çubuğu kaldıran aşamalı geçmişler 2D ve 3D için reddedilir. Yükleme veya hareketten sonra rijitlik ya da mesnet yayları değişirse kuvvetler ve gerilmeler tanıyla birlikte kullanılamaz olabilir. Tam olarak yüksüz kaldırmalar ve yalnızca kısıtlarla tamamen belirlenen aşamalar yanıtlarını korur; yüklü çubukların kuvvetlerinin yeniden dağıtılması desteklenmiyor (SA-2026-061).',
          'Zemin-yapı etkileşimi, değişmeyen çözümü yeniden başlatmadan elastik dengeyi düzeltir. Zeminsiz veya zemini başlangıçtaki doğrusal aralıkta kalan döndürülmüş ve birimleri değiştirilmiş modeller mevcut tolerans ve iterasyon sınırı içinde yakınsayabilir. Etkilenen analizleri yeniden çalıştırın.',
          'Döndürülmüş veya yansıtılmış kısıtlı çerçeve ve kafesler artık yuvarlama sınırından kaynaklanan hatalı retlerle karşılaşmaz. Doğrusal, aşamalı, sünme ve P-Delta başlangıç çözümleri 2D ve 3D için çözülebilir fiziksel rijitliği korur; mekanizma ve doğruluk sınırları değişmez. Etkilenen analizleri yeniden çalıştırın.',
          'CIRSOC 301 çelik tasarımı moment gradyanını ve kesit özelliklerini motordan okur. Gradyan katsayısı yanal tutulmamış parçanın uçlarındaki işaret değişimini içerir; çekme net alanı şaşırtmalı cıvataların tüm zincirlerini kontrol eder ve gövde veya ikinci kol cıvataları eksik olan tüm eleman bağlantısını reddeder. Etkilenen çubukları yeniden kontrol edin.',
          'Almanca, Fransızca ve Türkçe yeniden sunuluyor. Research, deniz tabanı temaslı bir riser ve eğilmiş şeridin şekil kontrolünü, karşılaştırmaları ve sınırları görünür biçimde ekler. Kayıt işlemi tasarlanmış binaları korur ve tarayıcı kaydedemediğinde bildirir.',
        ],
      },
      hu: {
        "title": "Stabilitásellenőrzés a megoldás előtt, javított mozgó terhek és P-Delta, világosabb korlátok",
        "items": [
          "A lineáris 2D és 3D analízis a megoldás előtt ellenőrzi a merevség stabilitását. A mechanizmusokat, a negatív merevséget és a túl bizonytalan, fel nem oldható merevséget indoklással elutasítja, ahelyett hogy mesterséges rugókkal vagy eltolással oldaná meg őket. Futtassa újra az érintett lineáris analíziseket és a hozzájuk tartozó méretezési ellenőrzéseket.",
          "A mereven megtámasztott szabadságfokra helyezett rugót 2D-ben és 3D-ben is elutasítja. A 3D mozgó terhek a mezőn belül egy tengely alatt fellépő csúcsokat is megtalálják, a ferde rudak normálerejével és a rúdvégi erőkkel együtt. Futtassa újra az érintett mozgóteher-burkolókat.",
          "A P-Delta 2D-ben és 3D-ben minden rúd mentén a változó normálerőt integrálja, így helyesbíti a mezőbeli terhek alatt alulbecsült növekményt. A harmonikus analízis korlátos modális csonkítás nélkül, teljes egészében oldja meg a frekvenciákat, a sűrű méretkorlát feletti modelleknél is. Futtassa újra ezeket az analíziseket és a belőlük származó ellenőrzéseket.",
          "Az ellenőrzött 3D képlékeny tönkremenetel a tanúsított alsó korlátját közli, és elutasítja a megalapozatlan tanúsítványt. A képlékeny analízis a memóriafoglalás előtt ellenőrzi a munka- és memóriaigényét. A szálmodellek terhelésvezérelt analízise közrefogja a teherhatárt, ahelyett hogy a lépésköztől függő értéket közölne.",
          "A kontaktanalízis elutasítja azt a befagyasztott állapotot, amely nem teljesíti a végső kontaktfeltételeket. A kábelelemeket a külön kábelanalízisen kívül elutasítja, mert ott a meglazulásuk nem ábrázolható. Ezek a korlátok a natív és a böngészőbeli analízisekre egyaránt érvényesek.",
          "A héjkombinációk megtartják az előírt elmozdulású esetekből származó feszültségeket, és tartalmazzák a négyszögelemek csomóponti feszültségeit; a talaj–szerkezet kölcsönhatás 2D-ben és 3D-ben is visszaadja a támaszreakciókat. A kihajlási és a többesetes analízisek elutasítják a nem véges eredményeket. A mentett projektek felismerik az ismert hibás eredményű verziókból származó analíziseket, és kérik az érintett analízis újrafuttatását.",
          "A 2D és 3D kihajlás a normálerő kerekítési korlátait csak a ténylegesen összekapcsolt részeken belül veszi figyelembe. Egy független szerkezet kényszere már nem akadályozza meg egy másik oszlop megoldását; az összekapcsolt részen belüli bizonytalan nyomást továbbra is elutasítja. Futtassa újra a mentett kihajlási és P-Delta analíziseket, hogy a B2 tényezők és a stabilitás frissüljenek.",
          "A regressziós ellenőrzések 28 bejelentett modellt fednek le, amelyeket most indoklással elutasít; a bizonyítékok áttekintése után 25 jelölt issue lezárható volt. Hét régi héjmodellnek szabad síkbeli merevtest-elfordulása van: a natív és a böngészőbeli tesztek megerősítik az elutasításukat, és a hiányzó megtámasztás hozzáadása után ellenőrzik a válaszokat.",
          "A fázisos 2D és 3D analízis a lineáris analízissel közös szabadforgás-kezelést használ. A végkioldások és egységváltások többé nem adnak mesterséges forgási merevséget, a süllyedések megőrzik előírt mozgásukat. Futtassa újra az érintett fázisos vizsgálatokat és méretezési ellenőrzéseket (SA-2026-060). A 3D képlékeny analízis kezdeti rugalmas elutasítása elutasítás marad, és nem válik figyelmeztetés nélküli nulla összeomlási tényezővé (SA-2026-062).",
          "A képlékeny egyensúlyellenőrzés többé nem omlik össze olyan importált modelleken, amelyek rekordcímkéi eltérnek a rúd- és csomópontazonosítóktól. A képlékeny tanúsítvány a ténylegesen szükséges tárolást számolja, és megőrzi az utolsó érvényes korlátokat, ha egy választható finomítás túllépi az erőforráskorlátot. Korábban elutasított keretek változatlan határok mellett tanúsíthatók.",
          "A képlékeny tanúsítás gyorsabb, változatlan válaszokkal és erőforráskorlátokkal. Az outrigger példa is gyorsabban oldódik meg, ellenőrzött csúszkatartománya megőrzésével.",
          "A nemlineáris 2D és 3D vizsgálatok forgatás, tükrözés és egységváltás után következetesen ellenőrzik a fizikai egyensúlyt. A P-Delta, az előírt süllyedések és a talajrugók a konvergenciakorlátok lazítása nélkül őrzik meg a kis, feloldható válaszokat. Futtassa újra az érintett nemlineáris, P-Delta és talaj–szerkezet vizsgálatokat.",
          "A kihajlási tényezők 2D-ben és 3D-ben az eredeti merevségi mátrixokból állnak helyre, javítva a kényszeres vagy görbe rudas modellek kis felülbecsléseit és téves elutasításait. Az érvényes oktatási módusok egységváltás mellett is megmaradnak. Futtassa újra az érintett kihajlási vizsgálatokat; a tanúsítási határok nem változnak.",
          "A rácsrudak terhei 2D-ben és 3D-ben is bekerülnek az egyensúlyi ellenőrzésbe, így az érvényes, rúdterhekkel terhelt modelleket már nem utasítja el, ha az egyenértékű csomóponti terhekkel megoldhatók. Futtassa újra az érintett rácsszerkezeti analíziseket.",
          "A modális analízis a kényszerek és a ferde támaszok alkalmazásakor megőrzi a tömeg fizikai rangját. A tömeg nélküli irányokat tartalmazó modellek visszaadhatják érvényes, véges sajátmódusaikat anélkül, hogy egy további, hamis módus elutasítást okozna. Futtassa újra az érintett modális analíziseket és a tőlük függő dinamikai válaszok számítását.",
          "A kényszerek megtámasztott mester-szabadságfokain előírt süllyedések és elfordulások eljutnak a függő csomópontokhoz a fázisos, Winkler-, kontakt-, anyagilag nemlineáris, 2D korotációs és ívhossz-analízisekben. A kábelelemeket tartalmazó analízisek és a lineáris időtörténeti analízisek elutasítják azokat a nem nulla előírt támaszmozgásokat, amelyeket nem tudnak ábrázolni. Futtassa újra az érintett analíziseket és a belőlük származó ellenőrzéseket (SA-2026-063).",
          "Az ívhossz- és az elmozdulásvezérlés a végső tehertényezőnél számítja vissza a támaszreakciókat és a rúderőket. A nemlineáris és a fázisos visszaszámítás tartalmazza a kényszereken átadott erőket, kizárja a mesterséges merevséget, és a végső fizikai állapotot és a rudak végső koordinátarendszerét használja. Futtassa újra az érintett analíziseket és a belőlük származó ellenőrzéseket (SA-2026-061).",
          "A P-Delta megkülönbözteti a fizikai egyensúly maradékhibájának ellenőrzési kudarcát az elmozdult geometrián felírt nyomatéki egyensúly korlátjától. Hibás fizikai egyensúly esetén az erők és feszültségek nem elérhetők; a második korlát esetén az érvényes kis elmozdulású válaszok figyelmeztetés mellett megmaradnak. Az időtörténeti analízis nem közli a nem elérhető teljes támaszreakciókat és azok csúcsértékeit, az elmozdulástörténeteket és azok csúcsértékeit viszont megtartja. Ellenőrizze újra a mentett erőket (SA-2026-061).",
          "A fázisos terhelési történetekben a belső erőt hordozó rúd eltávolítását 2D-ben és 3D-ben is elutasítja. A terhelés vagy mozgás utáni merevség- vagy támaszrugó-változások miatt az erők és feszültségek diagnosztikai üzenet mellett elérhetetlenné válhatnak. A pontosan terheletlen rudak eltávolítása és a kizárólag kényszerek által teljesen meghatározott fázisok megtartják a válaszaikat; a terhelt rudak erőinek átrendeződése továbbra sem támogatott (SA-2026-061).",
          "A talaj–szerkezet kölcsönhatás korrigálja a rugalmas egyensúlyt anélkül, hogy újraindítana egy változatlan számítást. Az elforgatott vagy más mértékegységekkel megadott modellek talaj nélkül vagy a talaj kezdeti lineáris tartományában a meglévő tűrésen és iterációkorláton belül konvergálhatnak. Futtassa újra az érintett talaj–szerkezet kölcsönhatási analíziseket.",
          "Az elforgatott vagy tükrözött, kényszerekkel ellátott keretek és rácsok már nem kapnak téves elutasítást a kerekítési korlát miatt. A lineáris, fázisos és kúszási számítások, valamint a P-Delta kezdeti megoldásai 2D-ben és 3D-ben is megőrzik a feloldható fizikai merevséget; a mechanizmus- és pontossági korlátok változatlanok. Futtassa újra az érintett analíziseket.",
          "A CIRSOC 301 szerinti acélméretezés a nyomatéki gradiens és a keresztmetszeti jellemzők értékeit a számítómagból olvassa. A nyomatéki gradiens tényezője figyelembe veszi az előjelváltást az oldalirányban meg nem támasztott szakasz végein; a húzott nettó keresztmetszet minden eltolt csavarláncot ellenőriz, és elutasítja azt a minden elemre kiterjedő kapcsolatot, amelyből hiányoznak a gerinc vagy a második szár csavarjai. Ellenőrizze újra az érintett acélrudakat.",
          "A német, a francia és a török nyelv ismét elérhető. A Research egy tengerfenékkel érintkező offshore riserrel és egy hajlított szalag alakszabályozásával bővül, az oldalaikon bemutatott összehasonlításokkal és korlátokkal. A munkaterület mentése megőrzi a méretezett épületeket, és jelzi, ha a böngésző nem tud menteni."
        ]
      },
      zh: {
        "title": "求解前先检查稳定性，移动荷载与 P-Δ 已更正，限制更清晰",
        "items": [
          "2D 和 3D 线性分析在求解前先检查刚度稳定性。机构、负刚度以及不确定性过大而无法求解的刚度会被拒绝并给出原因，而不再借助人工弹簧或平移来求解。请重新运行受影响的线性分析及其设计验算。",
          "在刚性约束的自由度上设置弹簧，2D 和 3D 中均会被拒绝。3D 移动荷载可捕捉跨内某一轴下的峰值，包括斜杆上的轴力及其杆端力。请重新运行受影响的移动荷载包络。",
          "P-Δ 分析在 2D 和 3D 中沿每根杆件对变化的轴力积分，更正了跨间荷载下被低估的放大效应。谐响应分析可完整求解频率，无需有界的模态截断，包括超出稠密规模限制的模型。请重新运行这些分析及相关验算。",
          "经认证的 3D 塑性倒塌分析会给出其经认证的下限，并拒绝不可靠的证书。塑性分析在分配内存前先检查所需的计算量和内存。纤维荷载控制会限定其极限荷载，而不再给出随步长变化的数值。",
          "接触分析会拒绝不满足最终接触条件的冻结状态。索单元在专用索分析之外会被拒绝，因为那里无法表示其松弛。这些限制同时适用于原生分析和浏览器内分析。",
          "壳组合保留强制位移工况产生的应力，并包含四边形单元的节点应力；土-结构相互作用在 2D 和 3D 中返回支座反力。屈曲分析和多工况分析会拒绝非有限结果。已保存的项目会识别出由存在已知错误结果的版本得出的分析，并要求重新运行受影响的分析。",
          "2D 和 3D 屈曲分析仅在确实耦合的部分内保留轴力的舍入界限。独立结构中的约束不再妨碍另一根柱的求解；耦合部分内不确定的压力仍会被拒绝。请重新运行已保存的屈曲和 P-Δ 分析，以更新 B₂ 系数和稳定性。",
          "回归检查覆盖了 28 个已报告的模型，这些模型现在会被拒绝并给出原因；经证据审查，25 个候选问题得以关闭。七个旧的壳模型存在面内自由刚体转动：原生测试和浏览器测试确认其被拒绝，并在补上缺失的约束后检验其结果。",
          "2D 和 3D 分阶段分析与线性分析共用自由转动的处理方式。杆端释放和单位变更不再增加人工转动刚度，支座沉降保持其预期的位移。请重新运行受影响的分阶段分析及相关设计验算（SA-2026-060）。3D 塑性分析中最初的弹性拒绝现在仍是拒绝，不再悄悄变成零倒塌系数（SA-2026-062）。",
          "对于记录标签与杆件和节点编号不一致的导入模型，塑性平衡检查不再崩溃。塑性证书按实际所需的存储量计数，当可选的细化超出限制时保留最后一个有效界限。此前被拒绝的框架现在可在相同限制内获得认证。",
          "塑性认证运行更快，结果和资源限制不变。外伸臂示例求解也更快，并保留其经检验的滑块范围。",
          "2D 和 3D 非线性分析在旋转、镜像和单位变更后，一致地检查物理平衡。P-Δ、强制沉降和土弹簧在不放宽收敛限制的情况下保留可求解的小响应。请重新运行受影响的非线性、P-Δ 和土-结构分析。",
          "屈曲系数在 2D 和 3D 中由原始刚度矩阵恢复，更正了带约束或曲杆模型中轻微的高估和错误的拒绝。有效的教学振型在不同单位下得以保留。请重新运行受影响的屈曲分析；证书限制不变。",
          "桁架杆件荷载现在在 2D 和 3D 中都进入平衡检查，因此当等效节点荷载可以求解时，带杆件荷载的有效模型不再被拒绝。请重新运行受影响的桁架分析。",
          "模态分析在经过约束和斜支座后仍保持质量的物理秩。含无质量方向的模型可以返回其有效的有限模态，而不会因多出一个虚假模态而被拒绝。请重新运行受影响的模态分析及相关的动力响应。",
          "受约束的约束主节点上的强制沉降和转角，现在可传递到分阶段、Winkler、接触、材料非线性、2D 共旋和弧长分析中的从属节点。索单元分析和线性时程分析会拒绝其无法表示的非零强制支座位移。请重新运行受影响的分析及相关验算（SA-2026-063）。",
          "弧长法和位移控制在最终荷载系数下恢复支座反力和杆件内力。非线性和分阶段的恢复包含经约束传递的力，不含人工刚度，并采用每根杆件最终的物理状态和杆件坐标系。请重新运行受影响的分析及相关验算（SA-2026-061）。",
          "P-Δ 分析区分物理残差失败与变位几何上的力矩平衡局限。物理平衡失败时，力和应力暂不提供；后一种局限则保留有效的小位移结果并给出警告。时程分析对不可用的总支座反力和峰值支座反力暂不提供，同时保留位移历程和峰值。请复核已保存的内力（SA-2026-061）。",
          "在 2D 和 3D 中，移除承受内力的杆件的分阶段历程会被拒绝。荷载或位移之后刚度或支座弹簧的变化，可能使力和应力不可用并给出诊断信息。完全卸载的移除以及仅由约束完全确定的阶段保留其结果；受荷杆件的内力重分布仍未支持（SA-2026-061）。",
          "土-结构相互作用修正弹性平衡，而不会重启未变化的求解。旋转后或单位缩放后的模型，无论没有土还是土处于初始线性范围，都可在现有容差和迭代次数限制内收敛。请重新运行受影响的土-结构分析。",
          "旋转或镜像后的带约束框架和桁架，不再因舍入界限而被错误拒绝。2D 和 3D 的线性、分阶段、徐变和 P-Δ 初始求解保留可求解的物理刚度；机构和精度的限制不变。请重新运行受影响的分析。",
          "CIRSOC 301 钢结构设计从计算引擎读取弯矩梯度和截面特性。弯矩梯度系数包含无支撑段两端的符号变化；受拉净面积检查每一条交错螺栓链，并拒绝腹板或角钢第二肢缺少螺栓的全单元连接。请重新验算受影响的钢构件。",
          "重新提供德语、法语和土耳其语。Research 新增了带海床接触的海洋立管，以及弯曲板条的形状控制，对比和限制均在各自页面上列出。工作区保存会保留已设计的建筑，并在浏览器无法保存时给出提示。",
        ]
      },
    },
  },
  {
    date: '2026-11-06',
    areas: ['pro', 'pro', 'engine', 'engine', 'engine', 'pro', 'basic'],
    i18n: {
      es: {
        title: 'Cargas, diseño y análisis corregidos; más herramientas para calcular y aprender',
        items: [
          'Las cargas generadas conservan la carga de los pisos parcialmente cubiertos y de las losas giradas, y cuentan las cáscaras en el peso sísmico. El chequeo de equilibrio nombra las cargas que no puede sumar. Hay que volver a generar las cargas afectadas.',
          'Los chequeos de acero y hormigón corrigen áreas de corte, flexión sobrearmada, columnas rectangulares y compresión de tubos. Las uniones y los miembros con torsión no verificada dicen qué queda sin evaluar. Cada componente de la envolvente de cáscaras conserva sus propios extremos. Conviene volver a correr estos diseños.',
          'El pandeo 2D integra el esfuerzo axial a lo largo de la barra; los mecanismos detrás de vínculos rígidos se rechazan, y el análisis corrotacional 3D compone las rotaciones grandes. La dinámica conserva las cargas iniciales en nudos sin masa y rechaza los mecanismos. Los resultados no finitos se rechazan con una razón.',
          'Se incorpora el análisis límite plástico 2D, pero el colapso plástico sigue retenido hasta completar la validación de #758. El pandeo 3D distingue la compresión del redondeo; el análisis armónico elige el método por modelo y frecuencia, sin cambiarlo con la carga. El análisis lineal avisa de rotaciones grandes y posibles efectos de segundo orden.',
          "Las cáscaras MITC4 y MITC9 siguen siendo demasiado flexibles en geometría alabeada: en el benchmark con 90° de torsión, los desplazamientos eran aproximadamente un 30% mayores para MITC4 y hasta 2,4 veces los de referencia para MITC9. El error crece con la torsión y no aparece en elementos planos. La formulación sigue sin corregirse (#1057). El PR #1074 incorporó advertencias y rechazos según los límites medidos; esa contención no corrige la formulación.",
          'La memoria del PRO imprime el conjunto de resultados elegido y verifica sus tablas exportadas. Hay vistas guardadas, planta y 3D juntas, referencia IFC, enlaces de solo lectura y más resultados de placas. Excel e IFC conservan el eje de inercia correcto de las secciones rectangulares.',
          'El curso del Básico vuelve con estática, líneas de influencia, segundo orden, pandeo, plasticidad y dinámica. Llegan ejemplos paramétricos y el asistente con una clave propia de Anthropic u OpenAI. Las páginas de Research y Tools abren más rápido en el teléfono.',
        ],
      },
      en: {
        title: 'Corrected loads, design and analysis; more ways to calculate and learn',
        items: [
          'Generated loads keep floor loads under partial cover and on rotated decks, and include shells in seismic weight. The equilibrium check names loads it cannot sum. Generate affected loads again.',
          'Steel and concrete checks correct shear areas, over-reinforced bending, rectangular columns and tube compression. Connections and members with unchecked torsion state what is unevaluated. Each shell envelope component keeps its own extremes. Re-run affected designs.',
          '2D buckling integrates axial force along the member; mechanisms behind rigid constraints are refused, and 3D co-rotational analysis composes large rotations. Dynamics keeps initial loads on massless nodes and refuses mechanisms. Non-finite results are refused with a reason.',
          '2D plastic limit analysis is added, but plastic collapse stays withheld until the validation for #758 is complete. 3D buckling distinguishes compression from round-off; harmonic analysis chooses its method per model and frequency without changing it with the load. Linear analysis warns about large rotations and possible second-order effects.',
          "MITC4 and MITC9 shells remain too flexible on warped geometry: in the benchmark with 90° of twist, displacements were about 30% above the reference for MITC4 and up to 2.4 times the reference for MITC9. The error grows with twist and is absent on flat elements. The formulation remains unfixed (#1057). PR #1074 added warnings and refusals at measured limits; that containment does not correct the formulation.",
          'PRO reports print the chosen result set and check their exported tables. There are saved views, combined plan and 3D views, IFC references, read-only links and more plate results. Excel and IFC imports keep the correct inertia axis of rectangular sections.',
          'The Basic course returns with statics, influence lines, second order, buckling, plasticity and dynamics. Parametric examples and an assistant using your own Anthropic or OpenAI key are available. Research and Tools pages open faster on phones.',
        ],
      },
      pt: {
        title: 'Cargas, dimensionamento e análises corrigidos; mais formas de calcular e aprender',
        items: [
          'As cargas geradas mantêm as cargas dos pisos parcialmente cobertos e das lajes giradas, e incluem as cascas no peso sísmico. A verificação de equilíbrio identifica as cargas que não consegue somar. Gere novamente as cargas afetadas.',
          'As verificações de aço e concreto corrigem áreas de cisalhamento, flexão superarmada, pilares retangulares e compressão de tubos. Ligações e barras com torção não verificada indicam o que fica sem avaliar. Cada componente da envoltória de cascas mantém seus próprios extremos. Refaça os dimensionamentos afetados.',
          'O flambamento 2D integra a força axial ao longo da barra; mecanismos atrás de vínculos rígidos são recusados, e a análise corrotacional 3D compõe grandes rotações. A dinâmica mantém as cargas iniciais em nós sem massa e recusa mecanismos. Resultados não finitos são recusados com uma razão.',
          'A análise limite plástica 2D foi adicionada, mas o colapso plástico continua retido até completar a validação de #758. O flambamento 3D distingue compressão de arredondamento; a análise harmônica escolhe o método por modelo e frequência, sem mudá-lo com a carga. A análise linear avisa sobre grandes rotações e possíveis efeitos de segunda ordem.',
          "As cascas MITC4 e MITC9 continuam flexíveis demais em geometria empenada: no benchmark com 90° de torção, os deslocamentos eram cerca de 30% maiores que a referência no MITC4 e até 2,4 vezes a referência no MITC9. O erro cresce com a torção e não aparece em elementos planos. A formulação segue sem correção (#1057). O PR #1074 adicionou avisos e recusas nos limites medidos; essa contenção não corrige a formulação.",
          'A memória do PRO imprime o conjunto de resultados escolhido e verifica suas tabelas exportadas. Há vistas salvas, planta e 3D juntas, referências IFC, links somente para leitura e mais resultados de placas. As importações Excel e IFC mantêm o eixo de inércia correto das seções retangulares.',
          'O curso do Básico volta com estática, linhas de influência, segunda ordem, flambamento, plasticidade e dinâmica. Há exemplos paramétricos e um assistente com sua própria chave Anthropic ou OpenAI. As páginas Research e Tools abrem mais rápido no celular.',
        ],
      },
      de: {
        title: 'Lasten, Bemessung und Analysen korrigiert; mehr Möglichkeiten zum Rechnen und Lernen',
        items: [
          'Erzeugte Lasten erhalten die Geschosslasten unter teilweiser Überdeckung und auf gedrehten Decken und berücksichtigen Schalen beim seismischen Gewicht. Die Gleichgewichtsprüfung nennt Lasten, die sie nicht summieren kann. Betroffene Lasten neu erzeugen.',
          'Stahl- und Betonprüfungen korrigieren Schubflächen, überbewehrte Biegung, rechteckige Stützen und Rohrdruck. Anschlüsse und Stäbe mit ungeprüfter Torsion nennen die offenen Nachweise. Jede Komponente der Schalenhülle behält ihre eigenen Extremwerte. Betroffene Bemessungen erneut ausführen.',
          '2D-Knicken integriert die Normalkraft entlang des Stabs; Mechanismen hinter starren Bindungen werden abgelehnt, und die korotationale 3D-Analyse setzt große Drehungen zusammen. Die Dynamik erhält Anfangslasten an masselosen Knoten und lehnt Mechanismen ab. Nicht endliche Ergebnisse werden mit Begründung abgelehnt.',
          'Die plastische 2D-Grenzlastanalyse ist ergänzt; der plastische Kollaps bleibt bis zum Abschluss der Validierung für #758 gesperrt. 3D-Knicken unterscheidet Druck von Rundung; die harmonische Analyse wählt die Methode je Modell und Frequenz, ohne sie mit der Last zu wechseln. Lineare Analysen warnen vor großen Drehungen und möglichen Effekten zweiter Ordnung.',
          "MITC4- und MITC9-Schalen sind auf verwundener Geometrie weiterhin zu weich: Im Benchmark mit 90° Verdrillung lagen die Verschiebungen bei MITC4 etwa 30% über der Referenz und bei MITC9 bis zum 2,4-Fachen der Referenz. Der Fehler wächst mit der Verdrillung und tritt bei ebenen Elementen nicht auf. Die Formulierung ist weiterhin nicht korrigiert (#1057). PR #1074 führte Warnungen und Ablehnungen an gemessenen Grenzen ein; diese Absicherung korrigiert die Formulierung nicht.",
          'PRO-Berichte drucken den gewählten Ergebnissatz und prüfen die exportierten Tabellen. Es gibt gespeicherte Ansichten, Grundriss und 3D zusammen, IFC-Referenzen, schreibgeschützte Links und weitere Plattenergebnisse. Excel- und IFC-Importe erhalten die richtige Trägheitsachse rechteckiger Querschnitte.',
          'Der Basic-Kurs ist mit Statik, Einflusslinien, Theorie zweiter Ordnung, Knicken, Plastizität und Dynamik zurück. Parametrische Beispiele und ein Assistent mit eigenem Anthropic- oder OpenAI-Schlüssel sind verfügbar. Research und Tools öffnen auf dem Handy schneller.',
        ],
      },
      fr: {
        title: 'Charges, dimensionnement et analyses corrigés ; plus de moyens de calculer et apprendre',
        items: [
          'Les charges générées conservent les charges des planchers partiellement couverts et des dalles tournées, et incluent les coques dans le poids sismique. La vérification équilibre nomme les charges impossibles à sommer. Générez à nouveau les charges concernées.',
          'Les vérifications acier et béton corrigent les aires de cisaillement, la flexion surarmée, les poteaux rectangulaires et la compression des tubes. Les assemblages et barres avec torsion non vérifiée indiquent les contrôles non évalués. Chaque composante de l’enveloppe des coques conserve ses propres extrêmes. Relancez les dimensionnements concernés.',
          'Le flambement 2D intègre l’effort axial le long de la barre ; les mécanismes derrière des liaisons rigides sont refusés, et l’analyse corotationnelle 3D compose les grandes rotations. La dynamique conserve les charges initiales aux nœuds sans masse et refuse les mécanismes. Les résultats non finis sont refusés avec une raison.',
          'L’analyse limite plastique 2D est ajoutée, mais le collapse plastique reste suspendu en attendant la validation de #758. Le flambement 3D distingue compression et arrondi ; l’analyse harmonique choisit sa méthode par modèle et fréquence sans changer avec la charge. L’analyse linéaire avertit des grandes rotations et des effets possibles du second ordre.',
          "Les coques MITC4 et MITC9 restent trop souples sur une géométrie gauche : dans le benchmark avec 90° de torsion, les déplacements dépassaient la référence d’environ 30 % en MITC4 et atteignaient jusqu’à 2,4 fois la référence en MITC9. L’erreur croît avec la torsion et n’apparaît pas sur des éléments plans. La formulation reste à corriger (#1057). La PR #1074 a ajouté des avertissements et des refus aux limites mesurées ; cette protection ne corrige pas la formulation.",
          'Les notes PRO impriment le jeu de résultats choisi et vérifient leurs tableaux exportés. Sont disponibles : vues enregistrées, plan et 3D ensemble, références IFC, liens en lecture seule et davantage de résultats de plaques. Les imports Excel et IFC conservent le bon axe d’inertie des sections rectangulaires.',
          'Le cours Basic revient avec statique, lignes d’influence, second ordre, flambement, plasticité et dynamique. Des exemples paramétriques et un assistant avec votre clé Anthropic ou OpenAI sont disponibles. Les pages Research et Tools ouvrent plus vite sur téléphone.',
        ],
      },
      tr: {
        title: 'Yükler, tasarım ve analizler düzeltildi; hesaplama ve öğrenme için daha fazla araç',
        items: [
          'Üretilen yükler, kısmen örtülü döşemelerin ve döndürülmüş plakların yüklerini korur; deprem ağırlığına kabukları da katar. Denge kontrolü toplayamadığı yükleri adlandırır. Etkilenen yükleri yeniden üretin.',
          'Çelik ve beton kontrollerinde kesme alanları, aşırı donatılı eğilme, dikdörtgen kolonlar ve boru basıncı düzeltildi. Burulması kontrol edilmeyen birleşimler ve çubuklar, değerlendirilmemiş kontrolleri belirtir. Kabuk zarfının her bileşeni kendi uç değerlerini korur. Etkilenen tasarımları yeniden çalıştırın.',
          '2D burkulma çubuk boyunca eksenel kuvveti integre eder; rijit kısıtların arkasındaki mekanizmalar reddedilir ve 3D eşdönel analiz büyük dönmeleri birleştirir. Dinamik analiz kütlesiz düğümlerdeki başlangıç yüklerini korur ve mekanizmaları reddeder. Sonlu olmayan sonuçlar gerekçesiyle reddedilir.',
          '2D plastik limit analiz eklendi; ancak #758 doğrulaması tamamlanana kadar plastik göçme sonucu sunulmuyor. 3D burkulma basıncı yuvarlamadan ayırır; harmonik analiz yöntemi model ve frekans başına seçer, yükle değiştirmez. Doğrusal analiz büyük dönmeler ve olası ikinci mertebe etkileri için uyarır.',
          "MITC4 ve MITC9 kabukları çarpılmış geometride hâlâ fazla esnektir: 90° burulmalı karşılaştırma modelinde yer değiştirmeler MITC4 için referanstan yaklaşık %30 fazla, MITC9 için referansın 2,4 katına kadardı. Hata burulmayla büyür ve düz elemanlarda görülmez. Formülasyon hâlâ düzeltilmedi (#1057). PR #1074, ölçülen sınırlarda uyarı ve ret ekledi; bu önlem formülasyonu düzeltmez.",
          'PRO raporları seçilen sonuç kümesini basar ve dışa aktarılan tablolarını kontrol eder. Kayıtlı görünümler, birlikte plan ve 3D, IFC referansları, salt okunur bağlantılar ve daha fazla plak sonucu sunulur. Excel ve IFC içe aktarımları dikdörtgen kesitlerin doğru atalet eksenini korur.',
          'Basic kursu statik, tesir çizgileri, ikinci mertebe, burkulma, plastisite ve dinamikle geri döndü. Parametrik örnekler ve kendi Anthropic veya OpenAI anahtarınızı kullanan asistan sunuluyor. Research ve Tools sayfaları telefonda daha hızlı açılır.',
        ],
      },
      hu: {
        "title": "Javított terhek, méretezés és analízis; több lehetőség a számításra és a tanulásra",
        "items": [
          "A generált terhek megtartják a részben fedett szintek és az elforgatott födémek terheit, és a szeizmikus tömegbe a héjakat is beszámítják. Az egyensúlyi ellenőrzés megnevezi azokat a terheket, amelyeket nem tud összegezni. Generálja újra az érintett terheket.",
          "Az acél- és betonellenőrzések helyesbítik a nyírási területeket, a túlvasalt hajlítást, a téglalap keresztmetszetű oszlopokat és a csövek nyomását. Az ellenőrizetlen csavarású kapcsolatok és rudak megnevezik, mi marad kiértékeletlenül. A héjburkoló minden komponense megtartja a saját szélsőértékeit. Futtassa újra az érintett méretezéseket.",
          "A 2D kihajlás a rúd mentén integrálja a normálerőt; a merev kényszerek mögötti mechanizmusokat elutasítja, a 3D korotációs analízis pedig helyesen összegzi a nagy elfordulásokat. A dinamika megtartja a tömeg nélküli csomópontok kezdeti terheit, és elutasítja a mechanizmusokat. A nem véges eredményeket indoklással elutasítja.",
          "Bekerült a 2D képlékeny határanalízis, de a képlékeny tönkremenetel eredménye a #758 validálásának lezárásáig vissza van tartva. A 3D kihajlás megkülönbözteti a nyomást a kerekítési hibától; a harmonikus analízis modellenként és frekvenciánként választja meg a módszert, és a teherrel nem váltja. A lineáris analízis figyelmeztet a nagy elfordulásokra és a lehetséges másodrendű hatásokra.",
          "A MITC4 és MITC9 héjelemek vetemedett geometrián továbbra is túl hajlékonyak: a 90°-os csavarású benchmarkban az elmozdulások MITC4 esetén mintegy 30%-kal haladták meg a referenciát, MITC9 esetén pedig annak akár 2,4-szeresét is elérték. A hiba a csavarással nő, sík elemeken nem jelentkezik. A formuláció továbbra sincs javítva (#1057). A #1074-es PR a mért határoknál figyelmeztetéseket és elutasításokat vezetett be; ez a korlátozás nem javítja a formulációt.",
          "A PRO számítási jelentése a kiválasztott eredményhalmazt nyomtatja, és ellenőrzi az exportált táblázatait. Vannak mentett nézetek, együtt látható alaprajz és 3D, IFC-referenciák, csak olvasható hivatkozások és több lemezeredmény. Az Excel- és IFC-importálás megtartja a téglalap keresztmetszetek helyes inerciatengelyét.",
          "Visszatért az Alap mód tananyaga statikával, hatásábrákkal, másodrendű analízissel, kihajlással, képlékenységgel és dinamikával. Elérhetők paraméteres példák és egy saját Anthropic- vagy OpenAI-kulccsal működő asszisztens. A Research és a Tools oldalak gyorsabban nyílnak meg telefonon."
        ]
      },
      zh: {
        "title": "荷载、设计与分析的更正；更多的计算与学习方式",
        "items": [
          "生成的荷载在局部覆盖和旋转楼板上保留楼面荷载，并将壳计入地震重量。平衡检查会指出无法求和的荷载。请重新生成受影响的荷载。",
          "钢结构和混凝土验算更正了抗剪面积、超筋受弯、矩形柱和管截面受压。未验算扭转的连接和构件会说明哪些内容未评估。壳包络的每个分量保留各自的极值。请重新运行受影响的设计。",
          "2D 屈曲分析沿杆件对轴力积分；刚性约束后的机构会被拒绝，3D 共旋分析可合成大转动。动力分析在无质量节点上保留初始荷载，并拒绝机构。非有限结果会被拒绝并给出原因。",
          "新增 2D 塑性极限分析，但在 #758 的验证完成之前，塑性倒塌仍暂不提供。3D 屈曲分析区分压力与舍入误差；谐响应分析按模型和频率选择方法，不随荷载而改变。线性分析会对大转动和可能的二阶效应给出警告。",
          "MITC4 和 MITC9 壳在翘曲几何上仍然过柔：在扭转 90° 的基准算例中，MITC4 的位移比参考值高约 30%，MITC9 最高达参考值的 2.4 倍。误差随扭转增大，平面单元上则不存在。该公式尚未修正（#1057）。PR #1074 按实测限值增加了警告和拒绝；这种遏制并不能修正公式。",
          "PRO 报告会打印所选的结果集，并检查其导出的表格。新增已保存视图、平面与 3D 组合视图、IFC 引用、只读链接以及更多板结果。Excel 和 IFC 导入会保留矩形截面正确的惯性轴。",
          "基础课程回归，涵盖静力学、影响线、二阶效应、屈曲、塑性和动力学。提供参数化示例，以及使用您自己的 Anthropic 或 OpenAI 密钥的助手。Research 和 Tools 页面在手机上打开更快。",
        ]
      },
    },
  },
  {
    date: '2026-10-30',
    areas: ['engine', 'engine', 'pro', 'pro', 'basic', 'app', 'site', 'site', 'site'],
    i18n: {
      es: {
        title: 'Stabileo Research, Herramientas y la app en alemán, francés y turco',
        items: [
          'Las tensiones de las cáscaras sólidas fuera del plano X–Y ahora son correctas; la app avisa para volver a calcular los proyectos afectados.',
          'El motor se prueba con chequeos de invariancia en cada cambio y con modelos aleatorios cada noche; tres supuestos errores del motor resultaron ser modelos de prueba mal armados, y cada benchmark ahora necesita dos referencias independientes, chequeos del modelo y un estudio de convergencia.',
          'Placas como objetos físicos que se mallan al calcular, barras curvas como una sola pieza, plantillas DXF en varios niveles y zonas de uso por piso con sus sobrecargas.',
          'Las exportaciones se eligen por lo que sale (resultados, informe de cálculo, planos e IFC), y el informe de cálculo también en Word, con sus figuras.',
          'Copiar y pegar en el Básico como en el PRO, con una vista previa de dónde queda; Ctrl+S ya no desplaza la vista 3D, deshacer ya no acuesta un modelo 2D en 3D y los desplazamientos en la deformada se muestran a pedido.',
          'La app y el sitio, ahora también en alemán, francés y turco.',
          'Stabileo Research: 17 artículos publicados y benchmarks clásicos de mecánica computacional que corren en el navegador con el motor de Stabileo, cada uno con lo que se compara y cómo se verifica.',
          'Herramientas: ocho calculadoras gratuitas (vigas, voladizos, columnas de Euler y más) que resuelven con el motor real, muestran la fórmula clásica al lado y abren el modelo en Stabileo.',
          'El artículo de JAIE 2026 completo en /paper, y esta página de historial de cambios.',
        ],
      },
      en: {
        title: 'Stabileo Research, Tools, and the app in German, French and Turkish',
        items: [
          'Solid-shell stresses of shells outside the X–Y plane are now correct; the app asks you to re-run the projects affected.',
          'The engine is tested with invariance checks on every change and with random models every night; three suspected engine errors turned out to be wrong test models, and every benchmark now needs two independent references, model checks and a convergence study.',
          'Plates as physical objects meshed when you solve, curved members as single pieces, DXF templates over several levels, and use zones per floor with their live loads.',
          'Exports chosen by what comes out (results, calculation report, drawings and IFC), and the calculation report also in Word, with its figures.',
          'Copy and paste in Basic as in PRO, with a preview of where it lands; Ctrl+S no longer moves the 3D view, undo no longer lays a 2D model flat in 3D, and displacements on the deformed shape show on request.',
          'The app and the site are now also in German, French and Turkish.',
          'Stabileo Research: 17 published papers and classic computational-mechanics benchmarks that run in the browser on Stabileo\'s engine, each stating what it is compared with and how it is checked.',
          'Tools: eight free calculators (beams, cantilevers, Euler columns and more) that solve on the real engine, show the classical formula beside the result, and open the model in Stabileo.',
          'The JAIE 2026 paper in full at /paper, and this changelog.',
        ],
      },
      pt: {
        title: 'Stabileo Research, Ferramentas e o app em alemão, francês e turco',
        items: [
          'As tensões das cascas sólidas fora do plano X–Y agora estão corretas; o app avisa para recalcular os projetos afetados.',
          'O motor é testado com verificações de invariância a cada mudança e com modelos aleatórios toda noite; três supostos erros do motor eram modelos de teste errados, e cada benchmark agora precisa de duas referências independentes, verificações do modelo e um estudo de convergência.',
          'Placas como objetos físicos que recebem malha ao calcular, barras curvas como uma só peça, modelos DXF em vários níveis e zonas de uso por andar com suas sobrecargas.',
          'As exportações são escolhidas pelo que sai (resultados, relatório de cálculo, desenhos e IFC), e o relatório de cálculo também em Word, com suas figuras.',
          'Copiar e colar no Básico como no PRO, com uma prévia de onde fica; Ctrl+S não desloca mais a vista 3D, desfazer não deita mais um modelo 2D no 3D e os deslocamentos na deformada aparecem sob demanda.',
          'O app e o site agora também em alemão, francês e turco.',
          'Stabileo Research: 17 artigos publicados e benchmarks clássicos de mecânica computacional que rodam no navegador com o motor do Stabileo, cada um dizendo com o que é comparado e como é verificado.',
          'Ferramentas: oito calculadoras gratuitas (vigas, balanços, pilares de Euler e mais) que resolvem com o motor real, mostram a fórmula clássica ao lado e abrem o modelo no Stabileo.',
          'O artigo da JAIE 2026 completo em /paper, e este histórico de mudanças.',
        ],
      },
      de: {
        title: 'Stabileo Research, Werkzeuge und die App auf Deutsch, Französisch und Türkisch',
        items: [
          'Die Spannungen von Volumenschalen außerhalb der X–Y-Ebene sind jetzt korrekt; die App weist darauf hin, die betroffenen Projekte neu zu berechnen.',
          'Der Rechenkern wird bei jeder Änderung mit Invarianzprüfungen und jede Nacht mit Zufallsmodellen getestet; drei vermutete Fehler des Rechenkerns waren falsche Testmodelle, und jeder Benchmark braucht jetzt zwei unabhängige Referenzen, Modellprüfungen und eine Konvergenzstudie.',
          'Platten als physische Objekte, die beim Rechnen vernetzt werden, gekrümmte Stäbe als ein Stück, DXF-Vorlagen über mehrere Ebenen und Nutzungszonen je Geschoss mit ihren Nutzlasten.',
          'Exporte werden danach gewählt, was herauskommt (Ergebnisse, statische Berechnung, Pläne und IFC), und die statische Berechnung gibt es auch in Word, mit ihren Abbildungen.',
          'Kopieren und Einfügen in Basis wie in PRO, mit einer Vorschau, wo das Eingefügte landet; Strg+S verschiebt die 3D-Ansicht nicht mehr, Rückgängig legt ein 2D-Modell in 3D nicht mehr flach, und die Verschiebungen an der Verformungsfigur erscheinen auf Wunsch.',
          'App und Website gibt es jetzt auch auf Deutsch, Französisch und Türkisch.',
          'Stabileo Research: 17 veröffentlichte Arbeiten und klassische Benchmarks der numerischen Mechanik, die im Browser mit dem Rechenkern von Stabileo laufen, jeweils mit der Angabe, womit sie verglichen und wie sie geprüft werden.',
          'Werkzeuge: acht kostenlose Rechner (Balken, Kragarme, Euler-Stützen und mehr), die mit dem echten Rechenkern rechnen, die klassische Formel daneben zeigen und das Modell in Stabileo öffnen.',
          'Der JAIE-2026-Artikel vollständig unter /paper, und dieser Änderungsverlauf.',
        ],
      },
      fr: {
        title: 'Stabileo Research, les Outils, et l\'application en allemand, français et turc',
        items: [
          'Les contraintes des coques volumiques hors du plan X–Y sont désormais correctes ; l\'application invite à recalculer les projets concernés.',
          'Le moteur est testé par des contrôles d\'invariance à chaque modification et par des modèles aléatoires chaque nuit ; trois erreurs supposées du moteur étaient des modèles de test erronés, et chaque benchmark exige désormais deux références indépendantes, des contrôles du modèle et une étude de convergence.',
          'Les plaques comme objets physiques maillés au calcul, les barres courbes d\'une seule pièce, des gabarits DXF sur plusieurs niveaux et des zones d\'usage par étage avec leurs charges d\'exploitation.',
          'Les exports se choisissent selon ce qui en sort (résultats, note de calcul, plans et IFC), et la note de calcul existe aussi en Word, avec ses figures.',
          'Copier-coller dans Basique comme dans PRO, avec un aperçu de l\'endroit où l\'élément arrive ; Ctrl+S ne déplace plus la vue 3D, annuler ne couche plus un modèle 2D à plat en 3D, et les déplacements sur la déformée s\'affichent à la demande.',
          'L\'application et le site existent désormais aussi en allemand, en français et en turc.',
          'Stabileo Research : 17 articles publiés et benchmarks classiques de mécanique numérique qui tournent dans le navigateur sur le moteur de Stabileo, chacun indiquant à quoi il est comparé et comment il est vérifié.',
          'Outils : huit calculateurs gratuits (poutres, consoles, poteaux d\'Euler et plus) qui calculent avec le vrai moteur, affichent la formule classique à côté du résultat et ouvrent le modèle dans Stabileo.',
          'L\'article JAIE 2026 en entier sur /paper, et cet historique des modifications.',
        ],
      },
      tr: {
        title: 'Stabileo Research, Araçlar ve Almanca, Fransızca ve Türkçe uygulama',
        items: [
          'X–Y düzlemi dışındaki kabukların katı kabuk (solid-shell) gerilmeleri artık doğru; uygulama etkilenen projelerin yeniden hesaplanması için uyarıyor.',
          'Motor her değişiklikte değişmezlik kontrolleriyle ve her gece rastgele modellerle test ediliyor; motor hatası sanılan üç durum hatalı test modelleriydi ve her karşılaştırma testi artık iki bağımsız referans, model kontrolleri ve bir yakınsama çalışması gerektiriyor.',
          'Hesap sırasında ağ örülen fiziksel nesneler olarak plaklar, tek parça eğri çubuklar, birden çok kat üzerinde DXF şablonları ve hareketli yükleriyle birlikte kat başına kullanım bölgeleri.',
          'Dışa aktarmalar çıkan şeye göre seçiliyor (sonuçlar, hesap raporu, çizimler ve IFC); hesap raporu şekilleriyle birlikte Word olarak da alınabiliyor.',
          'Temel\'de PRO\'daki gibi kopyalayıp yapıştırma, nereye yerleşeceğini gösteren bir önizlemeyle; Ctrl+S artık 3B görünümü kaydırmıyor, geri alma 2B modeli 3B\'de yere yatırmıyor ve şekil değiştirmiş durumdaki yer değiştirmeler istendiğinde gösteriliyor.',
          'Uygulama ve site artık Almanca, Fransızca ve Türkçe olarak da kullanılabiliyor.',
          'Stabileo Research: tarayıcıda Stabileo\'nun motoruyla çalışan 17 yayımlanmış makale ve klasik hesaplamalı mekanik karşılaştırma testi; her biri neyle karşılaştırıldığını ve nasıl doğrulandığını belirtiyor.',
          'Araçlar: gerçek motorla çözen, klasik formülü sonucun yanında gösteren ve modeli Stabileo\'da açan sekiz ücretsiz hesaplayıcı (kirişler, konsollar, Euler kolonları ve daha fazlası).',
          'JAIE 2026 makalesinin tamamı /paper adresinde, ve bu değişiklik geçmişi.',
        ],
      },
      hu: {
        "title": "Stabileo Research, Eszközök, és az alkalmazás németül, franciául és törökül",
        "items": [
          "Az X–Y síkon kívüli héjak solid-shell feszültségei most helyesek; az alkalmazás kéri, hogy futtassa újra az érintett projekteket.",
          "A számítómagot minden változtatáskor invariancia-ellenőrzésekkel, minden éjjel pedig véletlenszerű modellekkel tesztelik; három feltételezett számítómag-hibáról kiderült, hogy hibás tesztmodell okozta, és minden benchmarkhoz mostantól két független referencia, modellellenőrzés és konvergenciavizsgálat szükséges.",
          "Fizikai objektumként kezelt lemezek, amelyek a számításkor hálózódnak, egyetlen darabból álló görbe rudak, több szintre kiterjedő DXF-sablonok, valamint szintenkénti rendeltetési zónák a hasznos terheikkel.",
          "Exportálás aszerint, hogy mi készül (eredmények, számítási jelentés, rajzok és IFC), a számítási jelentés pedig Word formátumban is, ábráival együtt.",
          "Másolás és beillesztés az Alap módban ugyanúgy, mint a PRO-ban, előnézettel arról, hová kerül; a Ctrl+S már nem mozdítja el a 3D nézetet, a visszavonás már nem fekteti le a 2D modellt 3D-ben, a deformált alakon pedig kérésre megjelennek az elmozdulások.",
          "Az alkalmazás és az oldal mostantól németül, franciául és törökül is elérhető.",
          "Stabileo Research: 17 publikált cikk és klasszikus számítógépes mechanikai benchmark, amelyek a böngészőben, a Stabileo számítómagján futnak, és mindegyik megadja, mivel vetik össze és hogyan ellenőrzik.",
          "Eszközök: nyolc ingyenes kalkulátor (gerendák, konzolok, Euler-oszlopok és mások), amelyek a valódi számítómagon számolnak, az eredmény mellett a klasszikus képletet is mutatják, és megnyitják a modellt a Stabileóban.",
          "A JAIE 2026 cikk teljes terjedelmében a /paper oldalon, valamint ez a változásnapló."
        ]
      },
      zh: {
        "title": "Stabileo Research、Tools，以及德语、法语和土耳其语版本的应用",
        "items": [
          "位于 X–Y 平面之外的壳的实体壳应力现已正确；应用会提示您重新运行受影响的项目。",
          "计算引擎在每次变更时进行不变性检查，并每晚用随机模型测试；三个疑似的引擎错误最终证明是错误的测试模型，现在每个基准算例都需要两个独立的参考、模型检查和一次收敛研究。",
          "板作为实体对象，在求解时划分网格；曲杆作为单个构件；跨多个标高的 DXF 模板；以及按楼层划分的使用区及其活荷载。",
          "按输出内容选择导出（结果、计算书、图纸和 IFC），计算书也可导出为带插图的 Word 文件。",
          "基础模式的复制粘贴与 PRO 一致，并预览落点；Ctrl+S 不再移动 3D 视图，撤销不再把 2D 模型平放进 3D，变形图上的位移可按需显示。",
          "应用和网站现在也提供德语、法语和土耳其语。",
          "Stabileo Research：17 篇已发表的论文和经典计算力学基准算例，在浏览器中基于 Stabileo 的引擎运行，每个都说明其对比对象和检验方式。",
          "Tools：八个免费计算器（梁、悬臂梁、欧拉柱等），在真实的引擎上求解，在结果旁给出经典公式，并可在 Stabileo 中打开模型。",
          "完整的 JAIE 2026 论文位于 /paper，以及本更新日志。",
        ]
      },
    },
  },
  {
    date: '2026-10-23',
    areas: ['engine', 'engine', 'app', 'site', 'site'],
    i18n: {
      es: {
        title: 'Verificaciones en el motor y versiones 0.2.0 y 0.3.0',
        items: [
          'Las verificaciones de hormigón armado (CIRSOC 201) y de acero (CIRSOC 301) pasaron a calcularse dentro del motor, con baterías de validación contra modelos de referencia publicados.',
          'Para los resultados que lo admiten, el motor calcula una cota de error con aritmética de intervalos.',
          'Se publicaron las versiones 0.2.0 y 0.3.0, con notas en español, inglés y portugués. Cuando un cambio afecta resultados, la app avisa para volver a calcular los proyectos guardados.',
          'La landing suma una sección sobre verificación y ahora carga 152 KB en lugar de 6,4 MB.',
          'Dos notas nuevas en el blog, un índice rediseñado y una página que detalla qué verifica Stabileo de cada reglamento CIRSOC.',
        ],
      },
      en: {
        title: 'Design checks in the engine, and versions 0.2.0 and 0.3.0',
        items: [
          'Reinforced concrete (CIRSOC 201) and steel (CIRSOC 301) design-code checks now run inside the engine, with validation suites against published reference models.',
          'For the results that allow it, the engine computes an error bound with interval arithmetic.',
          'Versions 0.2.0 and 0.3.0 were released, with notes in Spanish, English and Portuguese. When a change affects results, the app asks you to re-run your saved projects.',
          'The landing page adds a section on verification and now loads 152 KB instead of 6.4 MB.',
          'Two new blog posts, a redesigned index, and a page listing what Stabileo checks from each CIRSOC code.',
        ],
      },
      pt: {
        title: 'Verificações no motor e versões 0.2.0 e 0.3.0',
        items: [
          'As verificações de concreto armado (CIRSOC 201) e de aço (CIRSOC 301) passaram a ser calculadas dentro do motor, com baterias de validação contra modelos de referência publicados.',
          'Para os resultados que permitem, o motor calcula um limite de erro com aritmética de intervalos.',
          'Foram publicadas as versões 0.2.0 e 0.3.0, com notas em espanhol, inglês e português. Quando uma mudança afeta resultados, o app avisa para recalcular os projetos salvos.',
          'A landing ganhou uma seção sobre verificação e agora carrega 152 KB em vez de 6,4 MB.',
          'Dois artigos novos no blog, um índice redesenhado e uma página que detalha o que o Stabileo verifica de cada norma CIRSOC.',
        ],
      },
      de: {
        title: 'Nachweise im Rechenkern und die Versionen 0.2.0 und 0.3.0',
        items: [
          'Die Nachweise für Stahlbeton (CIRSOC 201) und Stahl (CIRSOC 301) laufen jetzt im Rechenkern, mit Validierungsreihen an veröffentlichten Referenzmodellen.',
          'Für die Ergebnisse, die es zulassen, berechnet der Rechenkern mit Intervallarithmetik eine Fehlerschranke.',
          'Die Versionen 0.2.0 und 0.3.0 sind erschienen, mit Versionshinweisen auf Spanisch, Englisch und Portugiesisch. Betrifft eine Änderung Ergebnisse, weist die App darauf hin, gespeicherte Projekte neu zu berechnen.',
          'Die Startseite erhält einen Abschnitt zur Verifikation und lädt jetzt 152 KB statt 6,4 MB.',
          'Zwei neue Blogbeiträge, ein überarbeitetes Verzeichnis und eine Seite, die zeigt, was Stabileo aus jeder CIRSOC-Norm nachweist.',
        ],
      },
      fr: {
        title: 'Les vérifications dans le moteur, et les versions 0.2.0 et 0.3.0',
        items: [
          'Les vérifications du béton armé (CIRSOC 201) et de l\'acier (CIRSOC 301) sont désormais calculées dans le moteur, avec des séries de validation sur des modèles de référence publiés.',
          'Pour les résultats qui s\'y prêtent, le moteur calcule une borne d\'erreur par arithmétique d\'intervalles.',
          'Les versions 0.2.0 et 0.3.0 sont sorties, avec des notes en espagnol, en anglais et en portugais. Quand une modification touche les résultats, l\'application invite à recalculer les projets enregistrés.',
          'La page d\'accueil gagne une section sur la vérification et ne charge plus que 152 Ko au lieu de 6,4 Mo.',
          'Deux nouveaux articles de blog, un sommaire repensé et une page qui détaille ce que Stabileo vérifie de chaque règlement CIRSOC.',
        ],
      },
      tr: {
        title: 'Motorda kontroller ve 0.2.0 ile 0.3.0 sürümleri',
        items: [
          'Betonarme (CIRSOC 201) ve çelik (CIRSOC 301) kontrolleri artık motorun içinde hesaplanıyor; yayımlanmış referans modellere karşı doğrulama setleri de var.',
          'İzin veren sonuçlar için motor, aralık aritmetiğiyle bir hata sınırı hesaplıyor.',
          '0.2.0 ve 0.3.0 sürümleri İspanyolca, İngilizce ve Portekizce notlarla yayımlandı. Bir değişiklik sonuçları etkilediğinde uygulama, kayıtlı projelerin yeniden hesaplanması için uyarıyor.',
          'Açılış sayfasına doğrulama üzerine bir bölüm eklendi ve sayfa artık 6,4 MB yerine 152 KB yükleniyor.',
          'Blogda iki yeni yazı, yeniden tasarlanmış bir dizin ve Stabileo\'nun her CIRSOC yönetmeliğinden neyi kontrol ettiğini ayrıntılı anlatan bir sayfa.',
        ],
      },
      hu: {
        "title": "Méretezési ellenőrzések a számítómagban, valamint a 0.2.0 és a 0.3.0 verzió",
        "items": [
          "A vasbeton (CIRSOC 201) és acél (CIRSOC 301) szabvány szerinti méretezési ellenőrzései most a számítómagon belül futnak, publikált referenciamodellekkel szembeni validációs tesztsorozatokkal.",
          "Azoknál az eredményeknél, amelyeknél ez lehetséges, a számítómag intervallumaritmetikával hibakorlátot számít.",
          "Megjelent a 0.2.0 és a 0.3.0 verzió, spanyol, angol és portugál kiadási jegyzetekkel. Ha egy változás érinti az eredményeket, az alkalmazás kéri, hogy futtassa újra a mentett projektjeit.",
          "A nyitóoldal az ellenőrzésről szóló szakasszal bővült, és most 6,4 MB helyett 152 KB-ot tölt be.",
          "Két új blogbejegyzés, megújult tartalomjegyzék, és egy oldal, amely felsorolja, mit ellenőriz a Stabileo az egyes CIRSOC szabványokból."
        ]
      },
      zh: {
        "title": "引擎中的设计验算，以及 0.2.0 和 0.3.0 版本",
        "items": [
          "钢筋混凝土（CIRSOC 201）和钢结构（CIRSOC 301）的设计规范验算现在在引擎内运行，并配有针对已发表参考模型的验证套件。",
          "对于允许的结果，引擎使用区间算术计算误差界限。",
          "发布了 0.2.0 和 0.3.0 版本，附有西班牙语、英语和葡萄牙语的版本说明。当某项变更影响结果时，应用会提示您重新运行已保存的项目。",
          "落地页新增了一个关于验证的板块，现在加载量为 152 KB，而不是 6.4 MB。",
          "两篇新博客文章，重新设计的索引，以及一个列出 Stabileo 对每部 CIRSOC 规范检查内容的页面。",
        ]
      },
    },
  },
  {
    date: '2026-10-16',
    areas: ['basic', 'basic', 'basic', 'pro', 'pro', 'pro'],
    shot: {
      base: 'changelog-basic-report',
      w: 1600,
      h: 1000,
      alt: {
        es: 'El diálogo del informe de cálculo del modo Básico, con la lista de contenidos para elegir qué incluir',
        en: 'The Basic mode calculation report dialog, with the list of contents to choose what to include',
        pt: 'O diálogo do relatório de cálculo do modo Básico, com a lista de conteúdos para escolher o que incluir',
        de: 'Der Dialog der statischen Berechnung im Basis-Modus, mit der Inhaltsliste, in der man auswählt, was aufgenommen wird',
        fr: 'La boîte de dialogue de la note de calcul du mode Basique, avec la liste des contenus où l\'on choisit ce qu\'elle inclut',
        tr: 'Temel modundaki hesap raporu iletişim kutusu; neyin dahil edileceğini seçmek için içerik listesiyle',
        hu: 'Az Alap mód számítási jelentésének párbeszédablaka a tartalomlistával, amelyből kiválasztható, mi kerüljön bele',
        zh: '基础模式的计算书对话框，列出可选择包含哪些内容的目录',
      },
    },
    i18n: {
      es: {
        title: 'Informe a medida en el Básico y cargas dinámicas en el PRO',
        items: [
          'Zoom de kilómetros a milímetros, selección de barras superpuestas, ocultar partes del modelo y etiquetas más legibles.',
          'El informe de cálculo en PDF se arma eligiendo qué incluir, entre otras cosas el análisis cinemático y el despiece equilibrado, y las figuras se exportan listas para imprimir.',
          'Un video que muestra la estructura construyéndose piso por piso.',
          'Casos de carga compuestos y de referencia, cargas nocionales y combinaciones por SRSS y ABS.',
          'Cargas dinámicas y móviles: espectros de respuesta propios del proyecto y vehículos de catálogo.',
          'Unidades en todo el PRO y exportaciones a Excel, CSV, informe PDF, DXF e imágenes, cada una con un diálogo que muestra qué sale.',
        ],
      },
      en: {
        title: 'A report you put together in Basic, and dynamic loads in PRO',
        items: [
          'Zoom from kilometers down to millimeters, picking members that overlap, hiding parts of the model, and easier-to-read labels.',
          'You build the PDF calculation report by choosing what goes in, including the kinematic analysis and the balanced free-body diagrams, and figures export ready to print.',
          'A video of the structure going up floor by floor.',
          'Composite and reference load cases, notional loads, and SRSS and ABS combinations.',
          'Dynamic and moving loads: project-specific response spectra and catalog vehicles.',
          'Units across PRO, and exports to Excel, CSV, PDF report, DXF and images, each with a dialog that shows what comes out.',
        ],
      },
      pt: {
        title: 'Relatório sob medida no Básico e cargas dinâmicas no PRO',
        items: [
          'Zoom de quilômetros a milímetros, seleção de barras sobrepostas, ocultar partes do modelo e rótulos mais legíveis.',
          'O relatório de cálculo em PDF é montado escolhendo o que incluir, entre outras coisas a análise cinemática e os diagramas de corpo livre em equilíbrio, e as figuras saem prontas para imprimir.',
          'Um vídeo que mostra a estrutura sendo construída andar por andar.',
          'Casos de carga compostos e de referência, cargas nocionais e combinações por SRSS e ABS.',
          'Cargas dinâmicas e móveis: espectros de resposta próprios do projeto e veículos de catálogo.',
          'Unidades em todo o PRO e exportações para Excel, CSV, relatório PDF, DXF e imagens, cada uma com um diálogo que mostra o que sai.',
        ],
      },
      de: {
        title: 'Eine statische Berechnung nach Maß in Basis und dynamische Lasten in PRO',
        items: [
          'Zoom von Kilometern bis zu Millimetern, Auswahl überlappender Stäbe, Ausblenden von Modellteilen und besser lesbare Beschriftungen.',
          'Die statische Berechnung als PDF wird zusammengestellt, indem man auswählt, was hineinkommt, unter anderem die kinematische Analyse und die Freikörperbilder im Gleichgewicht, und die Abbildungen werden druckfertig exportiert.',
          'Ein Video, das zeigt, wie das Tragwerk Geschoss für Geschoss entsteht.',
          'Zusammengesetzte Lastfälle und Referenzlastfälle, Ersatzlasten und Kombinationen nach SRSS und ABS.',
          'Dynamische und bewegliche Lasten: projekteigene Antwortspektren und Fahrzeuge aus dem Katalog.',
          'Einheiten im gesamten PRO und Exporte nach Excel, CSV, PDF-Bericht, DXF und als Bilder, jeweils mit einem Dialog, der zeigt, was ausgegeben wird.',
        ],
      },
      fr: {
        title: 'Une note de calcul sur mesure dans Basique, et des charges dynamiques dans PRO',
        items: [
          'Zoom du kilomètre au millimètre, sélection de barres superposées, masquage de parties du modèle et étiquettes plus lisibles.',
          'La note de calcul en PDF se compose en choisissant ce qu\'elle contient, entre autres l\'analyse cinématique et les corps libres en équilibre, et les figures s\'exportent prêtes à imprimer.',
          'Une vidéo qui montre la structure s\'élever étage par étage.',
          'Cas de charge composés et de référence, charges notionnelles et combinaisons SRSS et ABS.',
          'Charges dynamiques et mobiles : spectres de réponse propres au projet et véhicules de catalogue.',
          'Unités dans tout PRO et exports vers Excel, CSV, note de calcul PDF, DXF et images, chacun avec une boîte de dialogue qui montre ce qui sera produit.',
        ],
      },
      tr: {
        title: 'Temel\'de isteğe göre hazırlanan rapor ve PRO\'da dinamik yükler',
        items: [
          'Kilometreden milimetreye yakınlaştırma, üst üste binen çubukların seçimi, modelin bölümlerini gizleme ve daha okunaklı etiketler.',
          'PDF hesap raporu, içine ne gireceği seçilerek hazırlanıyor; bunlar arasında kinematik analiz ve dengedeki serbest cisim diyagramları da var. Şekiller yazdırmaya hazır olarak dışa aktarılıyor.',
          'Yapının kat kat yükselişini gösteren bir video.',
          'Bileşik ve referans yük durumları, fiktif yükler ve SRSS ile ABS kombinasyonları.',
          'Dinamik ve hareketli yükler: projeye özgü tepki spektrumları ve katalogdan araçlar.',
          'PRO\'nun tamamında birimler ve Excel, CSV, PDF rapor, DXF ve görüntü olarak dışa aktarma; her biri neyin çıkacağını gösteren bir iletişim kutusuyla.',
        ],
      },
      hu: {
        "title": "Összeállítható jelentés az Alap módban és dinamikus terhek a PRO-ban",
        "items": [
          "Nagyítás kilométertől milliméterig, egymást átfedő rudak kijelölése, a modell részeinek elrejtése és jobban olvasható feliratok.",
          "A PDF számítási jelentést a tartalmának kiválasztásával állíthatja össze, beleértve a kinematikai analízist és az egyensúlyban lévő szabadtest-ábrákat, az ábrák pedig nyomtatásra készen exportálhatók.",
          "Videó, amelyen a szerkezet szintről szintre épül fel.",
          "Összetett és referencia-teheresetek, helyettesítő vízszintes terhek, valamint SRSS és ABS kombinációk.",
          "Dinamikus és mozgó terhek: projektspecifikus válaszspektrumok és katalógusbeli járművek.",
          "Mértékegységek a teljes PRO-ban, valamint exportálás Excelbe, CSV-be, PDF-jelentésbe, DXF-be és képekbe, mindegyik egy párbeszédablakkal, amely megmutatja, mi készül."
        ]
      },
      zh: {
        "title": "在基础模式中自行组合的报告，以及 PRO 中的动力荷载",
        "items": [
          "从千米到毫米的缩放，选取相互重叠的杆件，隐藏模型的部分内容，以及更易读的标签。",
          "通过选择包含的内容来生成 PDF 计算书，包括几何组成分析和平衡的隔离体图，图形可直接导出打印。",
          "一段展示结构逐层建成过程的视频。",
          "复合荷载工况和参考荷载工况、名义荷载，以及 SRSS 和 ABS 组合。",
          "动力荷载和移动荷载：项目专用的反应谱和目录中的车辆。",
          "整个 PRO 中的单位，以及导出为 Excel、CSV、PDF 报告、DXF 和图像，每种导出都配有显示输出内容的对话框。",
        ]
      },
    },
  },
  {
    date: '2026-10-09',
    areas: ['pro', 'pro', 'pro', 'pro'],
    i18n: {
      es: {
        title: 'Cargas según reglamento en el PRO',
        items: [
          'El generador de cargas según reglamento cubre techos, acumulación de nieve y cargas alternadas, y calcula el factor de ráfaga del viento según el CIRSOC 102.',
          'Las cargas sobre barras, nodos y placas se escriben a mano con su dirección, su variación y la zona que cubren.',
          'Unidades de visualización, barras de sección variable y mejoras al editor de secciones.',
          'El diseño de hormigón armado de un edificio entero tarda menos de la mitad que antes.',
        ],
      },
      en: {
        title: 'Code-based loads in PRO',
        items: [
          'The code load generator covers roofs, snow drifts and pattern loading, and computes the wind gust factor per CIRSOC 102.',
          'Loads on members, nodes and plates can be typed in with their direction, their variation and the area they cover.',
          'Display units, tapered members and improvements to the section editor.',
          'Reinforced concrete design of a whole building takes less than half the time it used to.',
        ],
      },
      pt: {
        title: 'Cargas conforme a norma no PRO',
        items: [
          'O gerador de cargas conforme a norma cobre telhados, acúmulo de neve e cargas alternadas, e calcula o fator de rajada do vento segundo a CIRSOC 102.',
          'As cargas em barras, nós e placas podem ser digitadas com sua direção, sua variação e a região que cobrem.',
          'Unidades de visualização, barras de seção variável e melhorias no editor de seções.',
          'O dimensionamento de concreto armado de um edifício inteiro leva menos da metade do tempo de antes.',
        ],
      },
      de: {
        title: 'Lasten nach Norm in PRO',
        items: [
          'Der Lastgenerator nach Norm deckt Dächer, Schneeverwehungen und feldweise Lastanordnung ab und berechnet den Böenfaktor des Winds nach CIRSOC 102.',
          'Lasten auf Stäben, Knoten und Platten lassen sich mit Richtung, Verlauf und belasteter Fläche von Hand eingeben.',
          'Anzeigeeinheiten, gevoutete Stäbe und Verbesserungen am Querschnittseditor.',
          'Die Stahlbetonbemessung eines ganzen Gebäudes dauert weniger als halb so lange wie zuvor.',
        ],
      },
      fr: {
        title: 'Charges réglementaires dans PRO',
        items: [
          'Le générateur de charges réglementaires couvre les toitures, les accumulations de neige et les charges en damier, et calcule le facteur de rafale du vent selon le CIRSOC 102.',
          'Les charges sur les barres, les nœuds et les plaques se saisissent à la main avec leur direction, leur variation et la zone qu\'elles couvrent.',
          'Unités d\'affichage, barres à inertie variable et améliorations de l\'éditeur de sections.',
          'Le dimensionnement en béton armé d\'un bâtiment entier prend moins de la moitié du temps qu\'auparavant.',
        ],
      },
      tr: {
        title: 'PRO\'da yönetmeliğe göre yükler',
        items: [
          'Yönetmeliğe göre yük oluşturucu çatıları, kar birikmesini ve dama tahtası yüklemesini kapsıyor ve rüzgârın hamle faktörünü CIRSOC 102\'ye göre hesaplıyor.',
          'Çubuklara, düğümlere ve plaklara gelen yükler doğrultuları, değişimleri ve kapladıkları alanla elle girilebiliyor.',
          'Görüntüleme birimleri, değişken kesitli çubuklar ve kesit düzenleyicide iyileştirmeler.',
          'Bütün bir binanın betonarme boyutlandırması eskisinin yarısından daha kısa sürüyor.',
        ],
      },
      hu: {
        "title": "Szabvány szerinti terhek a PRO-ban",
        "items": [
          "A szabvány szerinti teher-generátor lefedi a tetőket, a hózugokat és a sakktáblaszerű teherelrendezést, és kiszámítja a széllökési tényezőt a CIRSOC 102 szerint.",
          "A rudak, csomópontok és lemezek terhei az irányukkal, a változásukkal és az általuk lefedett területtel adhatók meg.",
          "Megjelenítési mértékegységek, változó keresztmetszetű rudak és fejlesztések a keresztmetszet-szerkesztőben.",
          "Egy teljes épület vasbeton méretezése kevesebb mint feleannyi ideig tart, mint korábban."
        ]
      },
      zh: {
        "title": "PRO 中基于规范的荷载",
        "items": [
          "规范荷载生成器涵盖屋面、雪堆积和荷载布置，并按 CIRSOC 102 计算风阵风系数。",
          "杆件、节点和板上的荷载可连同方向、变化形式和作用面积一并输入。",
          "显示单位、变截面杆件以及对截面编辑器的改进。",
          "整栋建筑的钢筋混凝土设计所需时间不到以往的一半。",
        ]
      },
    },
  },
  {
    date: '2026-10-02',
    areas: ['basic', 'basic', 'basic', 'pro', 'pro', 'pro', 'pro', 'pro', 'engine'],
    shot: {
      base: 'pro-building-model',
      w: 1600,
      h: 1192,
      alt: {
        es: 'Un edificio de varios pisos modelado en el modo PRO, con grillas y niveles',
        en: 'A multi-story building modeled in PRO mode, with grids and levels',
        pt: 'Um edifício de vários andares modelado no modo PRO, com eixos e níveis',
        de: 'Ein mehrgeschossiges Gebäude, im PRO-Modus mit Raster und Geschossen modelliert',
        fr: 'Un bâtiment de plusieurs étages modélisé dans le mode PRO, avec grilles et niveaux',
        tr: 'PRO modunda aks ızgaraları ve katlarla modellenmiş çok katlı bir bina',
        hu: 'Többszintes épület a PRO módban modellezve, raszterrel és szintekkel',
        zh: '在 PRO 模式中建模的多层建筑，带轴网和标高',
      },
    },
    i18n: {
      es: {
        title: 'Del ejercicio al proyecto real en el PRO',
        items: [
          'Las barras se dibujan punto a punto, con referencias a nodos, puntos medios y cruces, y la app pregunta si conectar lo que se cruza.',
          'Un paso a paso explicado que cubre quince métodos de cálculo.',
          'El análisis dinámico dibuja los modos de vibración.',
          'Grillas y niveles, generadores de estructuras que se insertan en el modelo, y copiar y pegar.',
          'Cargas de piso por área tributaria, mallado de placas, apoyos elásticos y fundaciones.',
          'Tablas de resultados, límites de flecha, contornos en placas, un libro Excel del proyecto e informe.',
          'Un editor para dibujar secciones compuestas y la búsqueda del perfil más liviano que verifica.',
          'Siete estructuras de referencia publicadas, modeladas para contrastar los resultados, y una galería de 24 ejemplos.',
          'Un resolvedor que acelera mucho los modelos grandes y una corrección de los elementos de placa.',
        ],
      },
      en: {
        title: 'From exercises to real projects in PRO',
        items: [
          'Members are drawn point to point, snapping to nodes, midpoints and crossings, and the app asks whether to connect what crosses.',
          'Explained step-by-step solutions covering fifteen analysis methods.',
          'Dynamic analysis draws the mode shapes.',
          'Grids and levels, structure generators that insert into the model, and copy and paste.',
          'Floor loads by tributary area, plate meshing, elastic supports and foundations.',
          'Result tables, deflection limits, plate contours, a project Excel workbook and a report.',
          'An editor to draw built-up sections, and a search for the lightest section that passes.',
          'Seven published reference structures, modeled to check the results against, and a gallery of 24 examples.',
          'A solver that makes large models much faster, and a fix to the plate elements.',
        ],
      },
      pt: {
        title: 'Do exercício ao projeto real no PRO',
        items: [
          'As barras são desenhadas ponto a ponto, com referências a nós, pontos médios e cruzamentos, e o app pergunta se deve conectar o que se cruza.',
          'Um passo a passo explicado que cobre quinze métodos de cálculo.',
          'A análise dinâmica desenha os modos de vibração.',
          'Eixos e níveis, geradores de estruturas que se inserem no modelo, e copiar e colar.',
          'Cargas de piso por área de influência, malha de placas, apoios elásticos e fundações.',
          'Tabelas de resultados, limites de flecha, contornos em placas, uma pasta Excel do projeto e relatório.',
          'Um editor para desenhar seções compostas e a busca do perfil mais leve que verifica.',
          'Sete estruturas de referência publicadas, modeladas para comparar os resultados, e uma galeria de 24 exemplos.',
          'Um solucionador que acelera muito os modelos grandes e uma correção dos elementos de placa.',
        ],
      },
      de: {
        title: 'Von der Übung zum echten Projekt in PRO',
        items: [
          'Stäbe werden von Punkt zu Punkt gezeichnet, mit Fang an Knoten, Mittelpunkten und Schnittpunkten, und die App fragt, ob sich Kreuzendes verbinden soll.',
          'Erklärte Schritt-für-Schritt-Lösungen für fünfzehn Berechnungsverfahren.',
          'Die dynamische Analyse zeichnet die Eigenformen.',
          'Raster und Geschosse, Tragwerksgeneratoren, die in das Modell einfügen, sowie Kopieren und Einfügen.',
          'Deckenlasten über Einzugsflächen, Vernetzung von Platten, elastische Auflager und Gründungen.',
          'Ergebnistabellen, Durchbiegungsgrenzen, Isoliniendarstellungen auf Platten, eine Excel-Arbeitsmappe des Projekts und ein Bericht.',
          'Ein Editor zum Zeichnen zusammengesetzter Querschnitte und die Suche nach dem leichtesten Profil, das den Nachweis erfüllt.',
          'Sieben veröffentlichte Referenztragwerke, modelliert, um die Ergebnisse daran zu prüfen, und eine Galerie mit 24 Beispielen.',
          'Ein Gleichungslöser, der große Modelle deutlich beschleunigt, und eine Korrektur der Plattenelemente.',
        ],
      },
      fr: {
        title: 'De l\'exercice au vrai projet dans PRO',
        items: [
          'Les barres se dessinent de point à point, avec accrochage aux nœuds, aux milieux et aux intersections, et l\'application demande s\'il faut relier ce qui se croise.',
          'Des solutions pas à pas commentées couvrant quinze méthodes de calcul.',
          'L\'analyse dynamique dessine les modes propres.',
          'Grilles et niveaux, générateurs de structures qui s\'insèrent dans le modèle, et copier-coller.',
          'Charges de plancher par aire d\'influence, maillage des plaques, appuis élastiques et fondations.',
          'Tableaux de résultats, limites de flèche, isovaleurs sur les plaques, un classeur Excel du projet et une note de calcul.',
          'Un éditeur pour dessiner des sections composées, et la recherche du profilé le plus léger qui est conforme.',
          'Sept structures de référence publiées, modélisées pour confronter les résultats, et une galerie de 24 exemples.',
          'Un solveur qui accélère nettement les grands modèles, et une correction des éléments de plaque.',
        ],
      },
      tr: {
        title: 'PRO\'da alıştırmadan gerçek projeye',
        items: [
          'Çubuklar noktadan noktaya çiziliyor; düğümlere, orta noktalara ve kesişimlere yakalama var ve uygulama kesişen elemanların birleştirilip birleştirilmeyeceğini soruyor.',
          'On beş hesap yöntemini kapsayan açıklamalı adım adım çözümler.',
          'Dinamik analiz mod şekillerini çiziyor.',
          'Aks ızgaraları ve katlar, modele eklenen yapı oluşturucular ve kopyala yapıştır.',
          'Etki alanına göre döşeme yükleri, plaklarda ağ oluşturma, elastik mesnetler ve temeller.',
          'Sonuç tabloları, sehim sınırları, plaklarda kontur çizimleri, projenin Excel çalışma kitabı ve bir rapor.',
          'Yapma kesitleri çizmek için bir düzenleyici ve kontrolleri sağlayan en hafif profilin aranması.',
          'Sonuçları karşılaştırmak için modellenmiş, yayımlanmış yedi referans yapı ve 24 örneklik bir galeri.',
          'Büyük modelleri belirgin biçimde hızlandıran bir çözücü ve plak elemanlarında bir düzeltme.',
        ],
      },
      hu: {
        "title": "A feladatoktól a valódi projektekig a PRO-ban",
        "items": [
          "A rudak pontról pontra rajzolhatók, csomópontokhoz, felezőpontokhoz és metszéspontokhoz illesztve, és az alkalmazás megkérdezi, összekösse-e az egymást keresztezőket.",
          "Magyarázatokkal ellátott, lépésről lépésre bemutatott megoldások tizenöt analízismódszerre.",
          "A dinamikai analízis megrajzolja a rezgésalakokat.",
          "Raszterek és szintek, a modellbe beillesztő szerkezetgenerátorok, valamint másolás és beillesztés.",
          "Födémterhek hatásfelület szerint, lemezek hálózása, rugalmas támaszok és alapozások.",
          "Eredménytáblázatok, lehajlási határértékek, lemezek szintvonalas ábrái, projekt Excel-munkafüzet és jelentés.",
          "Szerkesztő összetett keresztmetszetek rajzolásához, és a legkönnyebb megfelelő keresztmetszet keresése.",
          "Hét publikált referenciaszerkezet, amelyeket az eredmények ellenőrzésére modelleztek, és egy 24 példát tartalmazó galéria.",
          "Megoldó, amely sokkal gyorsabbá teszi a nagy modelleket, és javítás a lemezelemekben."
        ]
      },
      zh: {
        "title": "在 PRO 中从练习走向真实项目",
        "items": [
          "杆件逐点绘制，可捕捉节点、中点和交点，并询问是否连接相交处。",
          "涵盖十五种分析方法的分步讲解解答。",
          "动力分析会绘制各阶模态的振型。",
          "轴网和标高、可插入模型的结构生成器，以及复制粘贴。",
          "按从属面积计算楼面荷载、板网格划分、弹性支座和基础。",
          "结果表、挠度限值、板云图、项目 Excel 工作簿和报告。",
          "用于绘制组合截面的编辑器，以及搜索满足要求的最轻截面。",
          "七个已发表的参考结构，经建模用于对照检验结果，以及包含 24 个示例的示例库。",
          "一个使大型模型快得多的求解器，以及对板单元的一处修复。",
        ]
      },
    },
  },
  {
    date: '2026-09-25',
    areas: ['site', 'site', 'basic', 'basic', 'basic', 'edu', 'pro', 'pro', 'engine'],
    shot: {
      base: 'pro-rebar-3d',
      w: 1600,
      h: 834,
      alt: {
        es: 'Las armaduras diseñadas de una estructura de hormigón armado, vistas en 3D en el modo PRO',
        en: 'The designed reinforcement of a reinforced concrete structure, shown in 3D in PRO mode',
        pt: 'As armaduras dimensionadas de uma estrutura de concreto armado, vistas em 3D no modo PRO',
        de: 'Die bemessene Bewehrung eines Stahlbetontragwerks, im PRO-Modus in 3D dargestellt',
        fr: 'Les armatures dimensionnées d\'une structure en béton armé, vues en 3D dans le mode PRO',
        tr: 'Betonarme bir yapının boyutlandırılmış donatıları, PRO modunda 3B olarak',
        hu: 'Vasbeton szerkezet méretezett vasalása 3D-ben, a PRO módban',
        zh: '在 PRO 模式中以 3D 显示的钢筋混凝土结构设计配筋',
      },
    },
    i18n: {
      es: {
        title: 'Diseño de hormigón armado en el PRO',
        items: [
          'Una landing más corta, con la propuesta de precios y un panel de contacto que también aparece dentro de la app.',
          'Una nota nueva en el blog sobre cuándo modelar con barras y cuándo con elementos finitos, y una guía de usuario.',
          'La calculadora de hormigón armado según el CIRSOC Flex ahora propone las barras, y quedó contrastada con la planilla original.',
          'Paso a paso por los métodos de rigidez y de flexibilidades, en 2D y 3D.',
          'Cargas de temperatura en todos los análisis.',
          'El modo Educativo pasó a ser un panel dentro del Básico.',
          'Diseño de hormigón armado y una interfaz del PRO reorganizada.',
          'Control de equilibrio del modelo y análisis dinámicos: modal, espectral e historia en el tiempo.',
          'Un modelo mal armado se rechaza con un mensaje en lugar de devolver ceros.',
        ],
      },
      en: {
        title: 'Reinforced concrete design in PRO',
        items: [
          'A shorter landing page, with the pricing proposal and a contact panel that also shows inside the app.',
          'A new blog post on when to model with members and when with finite elements, and a user guide.',
          'The CIRSOC Flex reinforced concrete calculator now proposes the bars, and was checked against the original spreadsheet.',
          'Step-by-step solutions by the stiffness and flexibility methods, in 2D and 3D.',
          'Temperature loads in every analysis.',
          'Education mode became a panel inside Basic.',
          'Reinforced concrete design, and a reorganized PRO interface.',
          'A model equilibrium check, and dynamic analyses: modal, response spectrum and time history.',
          'A badly built model is now rejected with a message instead of returning zeros.',
        ],
      },
      pt: {
        title: 'Dimensionamento de concreto armado no PRO',
        items: [
          'Uma landing mais curta, com a proposta de preços e um painel de contato que também aparece dentro do app.',
          'Um artigo novo no blog sobre quando modelar com barras e quando com elementos finitos, e um guia do usuário.',
          'A calculadora de concreto armado segundo o CIRSOC Flex agora propõe as barras e foi comparada com a planilha original.',
          'Passo a passo pelos métodos da rigidez e das flexibilidades, em 2D e 3D.',
          'Cargas de temperatura em todas as análises.',
          'O modo Educativo virou um painel dentro do Básico.',
          'Dimensionamento de concreto armado e uma interface do PRO reorganizada.',
          'Verificação de equilíbrio do modelo e análises dinâmicas: modal, espectral e histórico no tempo.',
          'Um modelo mal montado agora é rejeitado com uma mensagem em vez de devolver zeros.',
        ],
      },
      de: {
        title: 'Stahlbetonbemessung in PRO',
        items: [
          'Eine kürzere Startseite mit dem Preisvorschlag und einem Kontaktbereich, der auch in der App erscheint.',
          'Ein neuer Blogbeitrag dazu, wann man mit Stäben und wann mit finiten Elementen modelliert, und ein Benutzerhandbuch.',
          'Der Stahlbetonrechner nach CIRSOC Flex schlägt jetzt die Bewehrungsstäbe vor und wurde mit der ursprünglichen Tabellenkalkulation abgeglichen.',
          'Schritt-für-Schritt-Lösungen nach dem Weggrößen- und dem Kraftgrößenverfahren, in 2D und 3D.',
          'Temperaturlasten in allen Berechnungen.',
          'Der Lehrmodus wurde zu einem Bereich innerhalb von Basis.',
          'Stahlbetonbemessung und eine neu geordnete PRO-Oberfläche.',
          'Eine Gleichgewichtskontrolle des Modells und dynamische Analysen: modal, mit Antwortspektrum und im Zeitverlauf.',
          'Ein fehlerhaft aufgebautes Modell wird jetzt mit einer Meldung abgewiesen, statt Nullen zu liefern.',
        ],
      },
      fr: {
        title: 'Le dimensionnement du béton armé dans PRO',
        items: [
          'Une page d\'accueil plus courte, avec la proposition tarifaire et un panneau de contact qui apparaît aussi dans l\'application.',
          'Un nouvel article de blog sur le moment de modéliser avec des barres ou avec des éléments finis, et un guide d\'utilisation.',
          'La calculatrice de béton armé selon CIRSOC Flex propose désormais les barres, et a été confrontée au tableur d\'origine.',
          'Des solutions pas à pas par la méthode des déplacements et par la méthode des forces, en 2D et en 3D.',
          'Charges thermiques dans tous les calculs.',
          'Le mode Enseignement est devenu un panneau à l\'intérieur de Basique.',
          'Le dimensionnement du béton armé et une interface PRO réorganisée.',
          'Un contrôle de l\'équilibre du modèle et des analyses dynamiques : modale, spectrale et temporelle.',
          'Un modèle mal construit est désormais refusé avec un message au lieu de renvoyer des zéros.',
        ],
      },
      tr: {
        title: 'PRO\'da betonarme boyutlandırma',
        items: [
          'Fiyat önerisini ve uygulamanın içinde de görünen bir iletişim panelini içeren daha kısa bir açılış sayfası.',
          'Blogda ne zaman çubuklarla, ne zaman sonlu elemanlarla modellemek gerektiğine dair yeni bir yazı ve bir kullanım kılavuzu.',
          'CIRSOC Flex\'e göre betonarme hesap aracı artık donatı çubuklarını öneriyor ve özgün hesap tablosuyla karşılaştırıldı.',
          'Rijitlik ve esneklik yöntemleriyle adım adım çözümler, 2B ve 3B\'de.',
          'Tüm analizlerde sıcaklık yükleri.',
          'Eğitim modu, Temel\'in içinde bir panel oldu.',
          'Betonarme boyutlandırma ve yeniden düzenlenmiş bir PRO arayüzü.',
          'Model denge kontrolü ve dinamik analizler: modal, tepki spektrumu ve zaman tanım alanında.',
          'Hatalı kurulmuş bir model artık sıfır döndürmek yerine bir iletiyle reddediliyor.',
        ],
      },
      hu: {
        "title": "Vasbeton méretezés a PRO-ban",
        "items": [
          "Rövidebb nyitóoldal, az árazási javaslattal és egy kapcsolatfelvételi panellel, amely az alkalmazáson belül is megjelenik.",
          "Új blogbejegyzés arról, mikor érdemes rudakkal és mikor végeselemekkel modellezni, valamint felhasználói útmutató.",
          "A CIRSOC Flex vasbeton kalkulátor most a betonacélokat is javasolja, és az eredeti táblázattal vetették össze.",
          "Lépésről lépésre bemutatott megoldások elmozdulás- és erőmódszerrel, 2D-ben és 3D-ben.",
          "Hőmérsékleti terhek minden analízisben.",
          "Az Oktatási mód az Alap módon belüli panellé vált.",
          "Vasbeton méretezés és átszervezett PRO felület.",
          "A modell egyensúlyának ellenőrzése és dinamikai analízisek: modális, válaszspektrum- és időtörténeti analízis.",
          "A hibásan felépített modellt az alkalmazás most üzenettel elutasítja ahelyett, hogy nullákat adna vissza."
        ]
      },
      zh: {
        "title": "PRO 中的钢筋混凝土设计",
        "items": [
          "更简短的落地页，带有定价方案和一个也显示在应用内的联系面板。",
          "一篇新博客文章，讲述何时用杆件建模、何时用有限元建模，另有用户指南。",
          "CIRSOC Flex 钢筋混凝土计算器现在会给出钢筋建议，并已对照原始电子表格验证。",
          "按刚度法和柔度法的分步解答，支持 2D 和 3D。",
          "所有分析中均支持温度作用。",
          "教学模式成为基础模式内的一个面板。",
          "钢筋混凝土设计，以及重新组织的 PRO 界面。",
          "模型平衡检查，以及动力分析：模态、反应谱和时程分析。",
          "构建有误的模型现在会被拒绝并给出提示，而不是返回零值。",
        ]
      },
    },
  },
  {
    date: '2026-09-11',
    areas: ['app', 'basic', 'basic', 'pro'],
    shot: {
      base: 'changelog-mobile',
      w: 1600,
      h: 3464,
      alt: {
        es: 'El modo Básico en un celular, con el diagrama de momentos de un pórtico',
        en: 'Basic mode on a phone, with the bending moment diagram of a frame',
        pt: 'O modo Básico em um celular, com o diagrama de momentos de um pórtico',
        de: 'Der Basis-Modus auf einem Smartphone, mit der Momentenlinie eines Rahmens',
        fr: 'Le mode Basique sur un téléphone, avec le diagramme des moments d\'un portique',
        tr: 'Telefonda Temel modu; bir çerçevenin eğilme momenti diyagramıyla',
        hu: 'Az Alap mód telefonon, egy keret hajlítónyomatéki ábrájával',
        zh: '手机上的基础模式，显示框架的弯矩图',
      },
    },
    i18n: {
      es: {
        title: 'Stabileo en el celular',
        items: [
          'Una interfaz para el celular, con el mismo marco para el Básico y el PRO.',
          'Importación de modelos desde Excel, y los links compartidos vuelven a abrir el modelo completo.',
          'Dimensionado de armaduras de secciones según el CIRSOC Flex, la planilla que usan casi todos los ingenieros civiles.',
          'Estructuras metálicas: selectores de secciones y materiales, generadores, el flujo de trabajo en acero y el diseño de uniones.',
        ],
      },
      en: {
        title: 'Stabileo on your phone',
        items: [
          'A phone interface, with the same layout for Basic and PRO.',
          'Model import from Excel, and shared links open the full model again.',
          'Reinforcement design of sections per CIRSOC Flex, the spreadsheet most civil engineers in Argentina use.',
          'Steel structures: section and material pickers, generators, the steel workflow and connection design.',
        ],
      },
      pt: {
        title: 'Stabileo no celular',
        items: [
          'Uma interface para celular, com a mesma estrutura para o Básico e o PRO.',
          'Importação de modelos a partir do Excel, e os links compartilhados voltam a abrir o modelo completo.',
          'Dimensionamento de armaduras de seções segundo o CIRSOC Flex, a planilha que quase todos os engenheiros civis argentinos usam.',
          'Estruturas metálicas: seletores de seções e materiais, geradores, o fluxo de trabalho em aço e o dimensionamento de ligações.',
        ],
      },
      de: {
        title: 'Stabileo auf dem Smartphone',
        items: [
          'Eine Oberfläche für das Smartphone, mit demselben Aufbau für Basis und PRO.',
          'Import von Modellen aus Excel, und geteilte Links öffnen wieder das vollständige Modell.',
          'Bewehrungsbemessung von Querschnitten nach CIRSOC Flex, der Tabellenkalkulation, die die meisten Bauingenieure in Argentinien verwenden.',
          'Stahltragwerke: Auswahl von Querschnitten und Werkstoffen, Generatoren, der Arbeitsablauf im Stahlbau und die Bemessung von Anschlüssen.',
        ],
      },
      fr: {
        title: 'Stabileo sur votre téléphone',
        items: [
          'Une interface pour téléphone, avec la même disposition pour Basique et PRO.',
          'Import de modèles depuis Excel, et les liens partagés rouvrent le modèle complet.',
          'Dimensionnement des armatures de sections selon CIRSOC Flex, le tableur qu\'utilisent la plupart des ingénieurs civils en Argentine.',
          'Structures métalliques : sélection des sections et des matériaux, générateurs, le flux de travail acier et le dimensionnement des assemblages.',
        ],
      },
      tr: {
        title: 'Stabileo telefonunuzda',
        items: [
          'Temel ve PRO için aynı düzene sahip bir telefon arayüzü.',
          'Excel\'den model içe aktarma; paylaşılan bağlantılar da yeniden tam modeli açıyor.',
          'Arjantin\'deki inşaat mühendislerinin çoğunun kullandığı hesap tablosu CIRSOC Flex\'e göre kesitlerin donatı boyutlandırması.',
          'Çelik yapılar: kesit ve malzeme seçicileri, oluşturucular, çelik iş akışı ve birleşim boyutlandırması.',
        ],
      },
      hu: {
        "title": "A Stabileo a telefonján",
        "items": [
          "Telefonos felület, ugyanazzal az elrendezéssel az Alap és a PRO módban.",
          "Modellimportálás Excelből, a megosztott hivatkozások pedig ismét a teljes modellt nyitják meg.",
          "Keresztmetszetek vasalásának méretezése a CIRSOC Flex szerint, azzal a táblázattal, amelyet Argentínában a legtöbb építőmérnök használ.",
          "Acélszerkezetek: keresztmetszet- és anyagválasztók, generátorok, acél munkafolyamat és kapcsolatok méretezése."
        ]
      },
      zh: {
        "title": "手机上的 Stabileo",
        "items": [
          "手机界面，基础模式和 PRO 使用相同的布局。",
          "从 Excel 导入模型，共享链接再次打开完整的模型。",
          "按 CIRSOC Flex 进行截面配筋设计，这是阿根廷大多数土木工程师使用的电子表格。",
          "钢结构：截面和材料选择器、生成器、钢结构工作流程和连接设计。",
        ]
      },
    },
  },
  {
    date: '2026-08-28',
    areas: ['pro', 'site', 'basic', 'engine'],
    shot: {
      base: '3d-industrial',
      w: 1600,
      h: 876,
      alt: {
        es: 'Una nave industrial metálica generada con parámetros editables',
        en: 'A steel industrial shed built from editable parameters',
        pt: 'Um galpão industrial metálico gerado com parâmetros editáveis',
        de: 'Eine Industriehalle aus Stahl, aus bearbeitbaren Parametern erzeugt',
        fr: 'Une halle industrielle métallique générée à partir de paramètres modifiables',
        tr: 'Düzenlenebilir parametrelerle oluşturulmuş çelik bir endüstriyel yapı',
        hu: 'Szerkeszthető paraméterekből felépített acél ipari csarnok',
        zh: '由可编辑参数构建的钢结构工业厂房',
      },
    },
    i18n: {
      es: {
        title: 'Estructuras metálicas y sitio en tres idiomas',
        items: [
          'Generadores de cabriadas, columnas reticuladas y naves industriales a partir de parámetros editables, con un selector de perfiles con catálogo y filtros.',
          'La landing y el blog en español, inglés y portugués. El sitio pasó a ser indexable por los buscadores, con dieciocho páginas y cuatro notas.',
          'Siete tutoriales cortos, que reemplazan al recorrido guiado.',
          'Tres errores de cálculo corregidos: el corte de un tubo circular, el corte pico y un análisis por etapas que descartaba losas y tabiques.',
        ],
      },
      en: {
        title: 'Steel structures, and the site in three languages',
        items: [
          'Generators for trusses, lattice columns and industrial sheds from editable parameters, with a section picker that has a catalog and filters.',
          'The landing page and the blog in Spanish, English and Portuguese. The site became indexable by search engines, with eighteen pages and four posts.',
          'Seven short tutorials, replacing the guided tour.',
          'Three calculation errors fixed: the shear of a circular tube, peak shear, and a staged analysis that dropped slabs and walls.',
        ],
      },
      pt: {
        title: 'Estruturas metálicas e site em três idiomas',
        items: [
          'Geradores de treliças de cobertura, pilares treliçados e galpões industriais a partir de parâmetros editáveis, com um seletor de perfis com catálogo e filtros.',
          'A landing e o blog em espanhol, inglês e português. O site passou a ser indexável pelos buscadores, com dezoito páginas e quatro artigos.',
          'Sete tutoriais curtos, que substituem o tour guiado.',
          'Três erros de cálculo corrigidos: o cortante de um tubo circular, o cortante de pico e uma análise por etapas que descartava lajes e paredes.',
        ],
      },
      de: {
        title: 'Stahltragwerke und die Website in drei Sprachen',
        items: [
          'Generatoren für Fachwerke, Gitterstützen und Industriehallen aus bearbeitbaren Parametern, mit einer Profilauswahl samt Katalog und Filtern.',
          'Die Startseite und der Blog auf Spanisch, Englisch und Portugiesisch. Die Website wurde für Suchmaschinen indexierbar, mit achtzehn Seiten und vier Beiträgen.',
          'Sieben kurze Anleitungen, die die geführte Tour ersetzen.',
          'Drei Rechenfehler behoben: die Querkraft eines Kreisrohrs, die Spitzenquerkraft und eine Berechnung in Bauphasen, die Decken und Wände wegließ.',
        ],
      },
      fr: {
        title: 'Les structures métalliques, et le site en trois langues',
        items: [
          'Générateurs de fermes, de poteaux en treillis et de halles industrielles à partir de paramètres modifiables, avec un sélecteur de profilés doté d\'un catalogue et de filtres.',
          'La page d\'accueil et le blog en espagnol, en anglais et en portugais. Le site est devenu indexable par les moteurs de recherche, avec dix-huit pages et quatre articles.',
          'Sept tutoriels courts, qui remplacent la visite guidée.',
          'Trois erreurs de calcul corrigées : l\'effort tranchant d\'un tube circulaire, l\'effort tranchant de pointe et une analyse par phases qui omettait des dalles et des voiles.',
        ],
      },
      tr: {
        title: 'Çelik yapılar ve üç dilde site',
        items: [
          'Düzenlenebilir parametrelerden kafes kirişler, kafes kolonlar ve endüstriyel yapılar için oluşturucular; katalog ve filtreler içeren bir profil seçiciyle.',
          'Açılış sayfası ve blog İspanyolca, İngilizce ve Portekizce. Site, on sekiz sayfa ve dört yazıyla arama motorlarında dizine eklenebilir hâle geldi.',
          'Rehberli turun yerini alan yedi kısa öğretici.',
          'Üç hesap hatası düzeltildi: dairesel bir borunun kesme kuvveti, tepe kesme kuvveti ve döşemeleri ve perde duvarları atlayan aşamalı bir analiz.',
        ],
      },
      hu: {
        "title": "Acélszerkezetek és az oldal három nyelven",
        "items": [
          "Generátorok rácsos tartókhoz, rácsos oszlopokhoz és ipari csarnokokhoz szerkeszthető paraméterekből, katalógussal és szűrőkkel ellátott keresztmetszet-választóval.",
          "A nyitóoldal és a blog spanyolul, angolul és portugálul. Az oldalt a keresőmotorok indexelhetik, tizennyolc oldallal és négy bejegyzéssel.",
          "Hét rövid oktatóanyag a bemutató túra helyett.",
          "Három számítási hiba javítva: a kör keresztmetszetű cső nyírása, a csúcs-nyíróerő, és egy építési fázisokra bontott analízis, amely kihagyta a födémeket és a falakat."
        ]
      },
      zh: {
        "title": "钢结构，以及三种语言的网站",
        "items": [
          "根据可编辑参数生成桁架、格构柱和工业厂房的生成器，配有带目录和筛选功能的截面选择器。",
          "落地页和博客提供西班牙语、英语和葡萄牙语版本。网站可被搜索引擎收录，共十八个页面和四篇文章。",
          "七个简短教程，取代了引导式导览。",
          "修复了三处计算错误：圆管的剪力、峰值剪力，以及一个遗漏了楼板和墙的分阶段分析。",
        ]
      },
    },
  },
  {
    date: '2026-08-21',
    areas: ['basic', 'basic', 'basic', 'pro'],
    shot: {
      base: '2d-section-analysis',
      w: 1600,
      h: 997,
      alt: {
        es: 'El análisis de sección del modo Básico, con el estado tensional sobre el contorno real del perfil',
        en: 'Basic mode section analysis, with the stress state over the real outline of the section',
        pt: 'A análise de seção do modo Básico, com o estado de tensões sobre o contorno real do perfil',
        de: 'Die Querschnittsanalyse im Basis-Modus, mit dem Spannungszustand über dem tatsächlichen Umriss des Profils',
        fr: 'L\'analyse de section du mode Basique, avec l\'état de contrainte sur le contour réel du profilé',
        tr: 'Temel modunda kesit analizi; profilin gerçek konturu üzerindeki gerilme durumuyla',
        hu: 'Keresztmetszet-vizsgálat az Alap módban, a feszültségi állapottal a keresztmetszet valós kontúrján',
        zh: '基础模式的截面分析，应力状态绘制在截面的真实轮廓上',
      },
    },
    i18n: {
      es: {
        title: 'Análisis de sección y nueva interfaz del PRO',
        items: [
          'Haciendo clic en cualquier punto de la estructura se obtiene el estado tensional sobre la sección real, con tensiones principales, círculo de Mohr, núcleo central y un punto de carga que se arrastra para ver el efecto de la excentricidad.',
          'Una base de materiales y perfiles de Argentina, Europa, Estados Unidos y Brasil, con más de 700 perfiles revisados contra sus normas.',
          'Herramientas de selección y movimiento más cómodas, y mapas de tensiones con escala de colores.',
          'El PRO se rediseñó con la misma identidad visual que el Básico.',
        ],
      },
      en: {
        title: 'Section analysis, and a new PRO interface',
        items: [
          'Clicking any point of the structure gives the stress state over the actual section, with principal stresses, Mohr\'s circle, the section kern, and a load point you drag to see the effect of eccentricity.',
          'A materials and sections database for Argentina, Europe, the United States and Brazil, with more than 700 sections checked against their standards.',
          'Easier selection and move tools, and stress maps with a color scale.',
          'PRO was redesigned with the same visual identity as Basic.',
        ],
      },
      pt: {
        title: 'Análise de seção e nova interface do PRO',
        items: [
          'Clicando em qualquer ponto da estrutura se obtém o estado de tensões sobre a seção real, com tensões principais, círculo de Mohr, núcleo central e um ponto de carga que se arrasta para ver o efeito da excentricidade.',
          'Uma base de materiais e perfis da Argentina, Europa, Estados Unidos e Brasil, com mais de 700 perfis conferidos com suas normas.',
          'Ferramentas de seleção e movimento mais práticas, e mapas de tensões com escala de cores.',
          'O PRO foi redesenhado com a mesma identidade visual do Básico.',
        ],
      },
      de: {
        title: 'Querschnittsanalyse und eine neue PRO-Oberfläche',
        items: [
          'Ein Klick auf einen beliebigen Punkt des Tragwerks liefert den Spannungszustand über dem tatsächlichen Querschnitt, mit Hauptspannungen, Mohr-Spannungskreis, Querschnittskern und einem Lastpunkt, den man verschiebt, um die Wirkung der Exzentrizität zu sehen.',
          'Eine Werkstoff- und Profildatenbank für Argentinien, Europa, die Vereinigten Staaten und Brasilien, mit mehr als 700 anhand ihrer Normen geprüften Profilen.',
          'Komfortablere Werkzeuge zum Auswählen und Verschieben und Spannungsbilder mit Farbskala.',
          'PRO wurde mit derselben visuellen Identität wie Basis neu gestaltet.',
        ],
      },
      fr: {
        title: 'L\'analyse de section, et une nouvelle interface PRO',
        items: [
          'Un clic sur n\'importe quel point de la structure donne l\'état de contrainte sur la section réelle, avec les contraintes principales, le cercle de Mohr, le noyau central et un point de charge que l\'on fait glisser pour voir l\'effet de l\'excentricité.',
          'Une base de matériaux et de profilés pour l\'Argentine, l\'Europe, les États-Unis et le Brésil, avec plus de 700 profilés vérifiés par rapport à leurs normes.',
          'Des outils de sélection et de déplacement plus pratiques, et des cartes de contraintes avec une échelle de couleurs.',
          'PRO a été redessiné avec la même identité visuelle que Basique.',
        ],
      },
      tr: {
        title: 'Kesit analizi ve yeni PRO arayüzü',
        items: [
          'Yapının herhangi bir noktasına tıklamak gerçek kesit üzerindeki gerilme durumunu veriyor: asal gerilmeler, Mohr dairesi, kesit çekirdeği ve dışmerkezliğin etkisini görmek için sürüklenen bir yük noktası.',
          'Arjantin, Avrupa, ABD ve Brezilya için bir malzeme ve profil veritabanı; standartlarına göre kontrol edilmiş 700\'den fazla profille.',
          'Daha rahat seçme ve taşıma araçları ve renk ölçekli gerilme haritaları.',
          'PRO, Temel ile aynı görsel kimlikle yeniden tasarlandı.',
        ],
      },
      hu: {
        "title": "Keresztmetszet-vizsgálat és új PRO felület",
        "items": [
          "A szerkezet bármely pontjára kattintva megjelenik a feszültségi állapot a valós keresztmetszeten, főfeszültségekkel, Mohr-körrel, a keresztmetszet magidomával és egy húzható erőponttal, amellyel a külpontosság hatása látható.",
          "Anyag- és keresztmetszet-adatbázis Argentínára, Európára, az Egyesült Államokra és Brazíliára, több mint 700 keresztmetszettel, amelyeket a szabványaikkal vetettek össze.",
          "Egyszerűbb kijelölő és mozgató eszközök, valamint feszültségtérképek színskálával.",
          "A PRO-t újratervezték, az Alap móddal azonos arculattal."
        ]
      },
      zh: {
        "title": "截面分析，以及全新的 PRO 界面",
        "items": [
          "点击结构上的任意一点，即可得到实际截面上的应力状态，包括主应力、莫尔圆、截面核心，以及可拖动的荷载点，用来观察偏心的影响。",
          "面向阿根廷、欧洲、美国和巴西的材料与截面数据库，包含 700 多种已对照其标准检验的截面。",
          "更易用的选择和移动工具，以及带色标的应力云图。",
          "PRO 采用与基础模式相同的视觉标识重新设计。",
        ]
      },
    },
  },
  {
    date: '2026-08-14',
    areas: ['basic', 'basic', 'edu', 'pro', 'engine'],
    shot: {
      base: 'edu-exercise',
      w: 1600,
      h: 769,
      alt: {
        es: 'Un ejercicio del modo Educativo, con los diagramas que traza el alumno corregidos contra el cálculo',
        en: 'An Education mode exercise, with the diagrams the student draws graded against the analysis',
        pt: 'Um exercício do modo Educativo, com os diagramas traçados pelo aluno corrigidos contra o cálculo',
        de: 'Eine Übung im Lehrmodus, bei der die von den Studierenden gezeichneten Verläufe mit der Berechnung abgeglichen und bewertet werden',
        fr: 'Un exercice du mode Enseignement, avec les diagrammes tracés par l\'étudiant corrigés par rapport au calcul',
        tr: 'Eğitim modunda bir alıştırma; öğrencinin çizdiği diyagramlar hesaba göre değerlendiriliyor',
        hu: 'Feladat az Oktatási módban, a hallgató által rajzolt ábrákkal, amelyeket az alkalmazás az analízis alapján értékel',
        zh: '教学模式中的练习，学生绘制的图形会对照分析结果评分',
      },
    },
    i18n: {
      es: {
        title: 'Identidad visual nueva y modo Educativo',
        items: [
          'Toda la interfaz del Básico con la identidad visual de la landing nueva.',
          'Cada perfil se resuelve a su contorno exacto. Si no lo tiene, la app no calcula tensiones en lugar de inventar los espesores que faltan.',
          'El docente arma el ejercicio dentro de la app y el alumno lo resuelve; los diagramas que traza se corrigen contra el cálculo.',
          'Fundaciones de hormigón armado: del diseño de la armadura a un archivo de CAD, con el despiece en 3D.',
          'Correcciones en las verificaciones de diseño: valores por defecto del lado inseguro, estados límite que faltaban y datos que se ignoraban.',
        ],
      },
      en: {
        title: 'A new visual identity, and Education mode',
        items: [
          'The whole Basic interface with the visual identity of the new landing page.',
          'Every section resolves to its exact outline. When it has none, the app declines to compute stresses instead of inventing the missing thicknesses.',
          'The teacher builds the exercise inside the app and the student solves it; the diagrams the student draws are graded against the analysis.',
          'Reinforced concrete footings: from reinforcement design to a CAD file, with the bar schedule in 3D.',
          'Fixes to the design checks: unconservative defaults, missing limit states and inputs that were being ignored.',
        ],
      },
      pt: {
        title: 'Identidade visual nova e modo Educativo',
        items: [
          'Toda a interface do Básico com a identidade visual da nova landing.',
          'Cada perfil é resolvido no seu contorno exato. Se não tiver um, o app não calcula tensões em vez de inventar as espessuras que faltam.',
          'O professor monta o exercício dentro do app e o aluno o resolve; os diagramas que ele traça são corrigidos contra o cálculo.',
          'Fundações de concreto armado: do dimensionamento da armadura a um arquivo de CAD, com o detalhamento em 3D.',
          'Correções nas verificações de dimensionamento: valores padrão contra a segurança, estados limites que faltavam e dados que eram ignorados.',
        ],
      },
      de: {
        title: 'Eine neue visuelle Identität und der Lehrmodus',
        items: [
          'Die gesamte Oberfläche von Basis in der visuellen Identität der neuen Startseite.',
          'Jedes Profil wird auf seinen genauen Umriss zurückgeführt. Fehlt dieser, berechnet die App keine Spannungen, statt die fehlenden Dicken zu erfinden.',
          'Die Lehrkraft erstellt die Übung in der App und die Studierenden lösen sie; die von ihnen gezeichneten Verläufe werden mit der Berechnung abgeglichen und bewertet.',
          'Stahlbetonfundamente: von der Bewehrungsbemessung bis zu einer CAD-Datei, mit der Biegeliste in 3D.',
          'Korrekturen an den Nachweisen: Standardwerte auf der unsicheren Seite, fehlende Grenzzustände und Eingaben, die ignoriert wurden.',
        ],
      },
      fr: {
        title: 'Une nouvelle identité visuelle, et le mode Enseignement',
        items: [
          'Toute l\'interface de Basique avec l\'identité visuelle de la nouvelle page d\'accueil.',
          'Chaque profilé est ramené à son contour exact. S\'il n\'en a pas, l\'application ne calcule pas de contraintes plutôt que d\'inventer les épaisseurs manquantes.',
          'L\'enseignant construit l\'exercice dans l\'application et l\'étudiant le résout ; les diagrammes qu\'il trace sont corrigés par rapport au calcul.',
          'Semelles en béton armé : du dimensionnement des armatures jusqu\'à un fichier CAO, avec la nomenclature des armatures en 3D.',
          'Corrections des vérifications : valeurs par défaut du côté de l\'insécurité, états limites manquants et données qui étaient ignorées.',
        ],
      },
      tr: {
        title: 'Yeni bir görsel kimlik ve Eğitim modu',
        items: [
          'Temel\'in tüm arayüzü yeni açılış sayfasının görsel kimliğiyle.',
          'Her profil tam konturuna çözümleniyor. Konturu yoksa uygulama, eksik kalınlıkları uydurmak yerine gerilme hesaplamıyor.',
          'Öğretmen alıştırmayı uygulamanın içinde hazırlıyor, öğrenci çözüyor; öğrencinin çizdiği diyagramlar hesaba göre değerlendiriliyor.',
          'Betonarme temeller: donatı boyutlandırmasından bir CAD dosyasına, donatı açılımı 3B olarak.',
          'Kontrollerde düzeltmeler: güvensiz taraftaki varsayılan değerler, eksik sınır durumları ve göz ardı edilen girdiler.',
        ],
      },
      hu: {
        "title": "Új arculat és az Oktatási mód",
        "items": [
          "Az Alap mód teljes felülete az új nyitóoldal arculatával.",
          "Minden keresztmetszet a pontos kontúrjára vezethető vissza. Ha ilyen nincs, az alkalmazás nem számít feszültségeket, ahelyett hogy kitalálná a hiányzó vastagságokat.",
          "Az oktató az alkalmazáson belül állítja össze a feladatot, a hallgató pedig megoldja; a hallgató által rajzolt ábrákat az analízis alapján értékeli.",
          "Vasbeton alaptestek: a vasalás méretezésétől a CAD-fájlig, a vaskivonattal 3D-ben.",
          "Javítások a méretezési ellenőrzésekben: a biztonság kárára tévedő alapértékek, hiányzó határállapotok és figyelmen kívül hagyott bemenetek."
        ]
      },
      zh: {
        "title": "全新的视觉标识，以及教学模式",
        "items": [
          "整个基础界面采用新落地页的视觉标识。",
          "每个截面都解析为其精确的轮廓。没有轮廓时，应用拒绝计算应力，而不是臆造缺失的厚度。",
          "教师在应用内创建练习，学生在其中解答；学生绘制的图形会对照分析结果评分。",
          "钢筋混凝土基础：从配筋设计到 CAD 文件，并附 3D 钢筋表。",
          "对设计验算的修复：偏不安全的默认值、缺失的极限状态，以及被忽略的输入。",
        ]
      },
    },
  },
  {
    date: '2026-08-07',
    areas: ['site', 'pro', 'engine'],
    i18n: {
      es: {
        title: 'Landing nueva y reglamentos CIRSOC 2025',
        items: [
          'La landing se rehízo: explica qué es Stabileo, qué funciona hoy y qué está en desarrollo, con secciones para el Básico, el Educativo y el PRO.',
          'Cargas y verificaciones según los reglamentos CIRSOC 2025, con la edición de cada reglamento registrada en el proyecto.',
          'Posproceso y visor 3D más rápidos en modelos grandes.',
        ],
      },
      en: {
        title: 'A new landing page, and the 2025 CIRSOC codes',
        items: [
          'The landing page was rebuilt: it explains what Stabileo is, what works today and what is in development, with sections for Basic, Education and PRO.',
          'Loads and design checks per the 2025 CIRSOC codes, with the edition of each code recorded in the project.',
          'Faster post-processing and 3D viewer on large models.',
        ],
      },
      pt: {
        title: 'Landing nova e normas CIRSOC 2025',
        items: [
          'A landing foi refeita: explica o que é o Stabileo, o que funciona hoje e o que está em desenvolvimento, com seções para o Básico, o Educativo e o PRO.',
          'Cargas e verificações segundo as normas CIRSOC 2025, com a edição de cada norma registrada no projeto.',
          'Pós-processamento e visualizador 3D mais rápidos em modelos grandes.',
        ],
      },
      de: {
        title: 'Eine neue Startseite und die CIRSOC-Normen 2025',
        items: [
          'Die Startseite wurde neu aufgebaut: Sie erklärt, was Stabileo ist, was heute funktioniert und was in Entwicklung ist, mit Abschnitten zu Basis, Lehre und PRO.',
          'Lasten und Nachweise nach den CIRSOC-Normen 2025, wobei die Ausgabe jeder Norm im Projekt festgehalten wird.',
          'Schnellere Nachbearbeitung und eine schnellere 3D-Ansicht bei großen Modellen.',
        ],
      },
      fr: {
        title: 'Une nouvelle page d\'accueil, et les règlements CIRSOC 2025',
        items: [
          'La page d\'accueil a été refaite : elle explique ce qu\'est Stabileo, ce qui fonctionne aujourd\'hui et ce qui est en développement, avec des sections pour Basique, Enseignement et PRO.',
          'Charges et vérifications selon les règlements CIRSOC 2025, avec l\'édition de chaque règlement enregistrée dans le projet.',
          'Post-traitement et vue 3D plus rapides sur les grands modèles.',
        ],
      },
      tr: {
        title: 'Yeni açılış sayfası ve CIRSOC 2025 yönetmelikleri',
        items: [
          'Açılış sayfası yeniden yapıldı: Stabileo\'nun ne olduğunu, bugün neyin çalıştığını ve neyin geliştirilmekte olduğunu Temel, Eğitim ve PRO bölümleriyle anlatıyor.',
          'CIRSOC 2025 yönetmeliklerine göre yükler ve kontroller; her yönetmeliğin baskısı projeye kaydediliyor.',
          'Büyük modellerde daha hızlı son işlem ve 3B görüntüleyici.',
        ],
      },
      hu: {
        "title": "Új nyitóoldal és a 2025-ös CIRSOC szabványok",
        "items": [
          "A nyitóoldalt újraépítették: elmagyarázza, mi a Stabileo, mi működik ma és mi van fejlesztés alatt, külön szakaszokkal az Alap, az Oktatási és a PRO mód számára.",
          "Terhek és méretezési ellenőrzések a 2025-ös CIRSOC szabványok szerint, az egyes szabványok kiadásának rögzítésével a projektben.",
          "Gyorsabb utófeldolgozás és 3D megjelenítő nagy modelleken."
        ]
      },
      zh: {
        "title": "全新的落地页，以及 2025 版 CIRSOC 规范",
        "items": [
          "重建了落地页：说明 Stabileo 是什么、目前可用的功能和开发中的功能，并设有基础模式、教学模式和 PRO 板块。",
          "按 2025 版 CIRSOC 规范进行荷载和设计验算，各规范的版本会记录在项目中。",
          "大型模型上更快的后处理和 3D 查看器。",
        ]
      },
    },
  },
  {
    date: '2026-07-31',
    areas: ['app', 'engine', 'engine'],
    i18n: {
      es: {
        title: 'Resultados que siempre corresponden al modelo',
        items: [
          'Al editar el modelo se invalidan los resultados y las verificaciones que quedaron desactualizados, para no mostrar resultados que ya no corresponden.',
          'Cálculos más rápidos: los casos de carga reusan la factorización, las combinaciones se resuelven en lote y el cálculo corre en segundo plano.',
          'Correcciones en restricciones y apoyos inclinados.',
        ],
      },
      en: {
        title: 'Results that always match the model',
        items: [
          'Editing the model invalidates the results and design checks it made stale, so results that no longer apply are never shown.',
          'Faster analysis: load cases reuse the factorization, combinations are solved in batches and the analysis runs in the background.',
          'Fixes to constraints and inclined supports.',
        ],
      },
      pt: {
        title: 'Resultados que sempre correspondem ao modelo',
        items: [
          'Ao editar o modelo, os resultados e as verificações desatualizados são invalidados, para não mostrar resultados que já não correspondem.',
          'Cálculos mais rápidos: os casos de carga reutilizam a fatoração, as combinações são resolvidas em lote e o cálculo roda em segundo plano.',
          'Correções em vínculos e apoios inclinados.',
        ],
      },
      de: {
        title: 'Ergebnisse, die immer zum Modell passen',
        items: [
          'Wird das Modell bearbeitet, werden die dadurch veralteten Ergebnisse und Nachweise ungültig, sodass nie Ergebnisse angezeigt werden, die nicht mehr gelten.',
          'Schnellere Berechnung: Lastfälle verwenden die Faktorisierung wieder, Kombinationen werden gebündelt gelöst und die Berechnung läuft im Hintergrund.',
          'Korrekturen an Kopplungen und geneigten Auflagern.',
        ],
      },
      fr: {
        title: 'Des résultats qui correspondent toujours au modèle',
        items: [
          'Modifier le modèle invalide les résultats et les vérifications devenus obsolètes, si bien que des résultats qui ne s\'appliquent plus ne sont jamais affichés.',
          'Calcul plus rapide : les cas de charge réutilisent la factorisation, les combinaisons sont résolues par lots et le calcul s\'exécute en arrière-plan.',
          'Corrections des liaisons et des appuis inclinés.',
        ],
      },
      tr: {
        title: 'Her zaman modele karşılık gelen sonuçlar',
        items: [
          'Model düzenlendiğinde güncelliğini yitiren sonuçlar ve kontroller geçersiz sayılıyor; böylece artık geçerli olmayan sonuçlar hiçbir zaman gösterilmiyor.',
          'Daha hızlı analiz: yük durumları ayrıştırmayı yeniden kullanıyor, kombinasyonlar toplu çözülüyor ve analiz arka planda çalışıyor.',
          'Kısıtlarda ve eğik mesnetlerde düzeltmeler.',
        ],
      },
      hu: {
        "title": "Eredmények, amelyek mindig a modellhez illeszkednek",
        "items": [
          "A modell szerkesztése érvényteleníti az általa elavulttá tett eredményeket és méretezési ellenőrzéseket, így a már nem érvényes eredmények sosem jelennek meg.",
          "Gyorsabb analízis: a teheresetek újrahasznosítják a faktorizációt, a kombinációk kötegekben számítódnak, és az analízis a háttérben fut.",
          "Javítások a kényszerekben és a ferde támaszokban."
        ]
      },
      zh: {
        "title": "结果始终与模型一致",
        "items": [
          "编辑模型会使由此过时的结果和设计验算失效，因此不再适用的结果绝不会显示。",
          "更快的分析：荷载工况复用分解，组合成批求解，分析在后台运行。",
          "对约束和斜支座问题的修复。",
        ]
      },
    },
  },
  {
    date: '2026-07-24',
    areas: ['pro'],
    i18n: {
      es: {
        title: 'Importador de planos DXF',
        items: [
          'El importador de planos DXF suma vista previa y diagnósticos, control de unidades, varias plantas e interpretación de vigas, con un asistente más claro.',
        ],
      },
      en: {
        title: 'DXF drawing importer',
        items: [
          'The DXF drawing importer adds a preview and diagnostics, unit control, multiple floors and beam interpretation, with a clearer wizard.',
        ],
      },
      pt: {
        title: 'Importador de plantas DXF',
        items: [
          'O importador de plantas DXF ganhou pré-visualização e diagnósticos, controle de unidades, vários pavimentos e interpretação de vigas, com um assistente mais claro.',
        ],
      },
      de: {
        title: 'Import von DXF-Plänen',
        items: [
          'Der Import von DXF-Plänen erhält eine Vorschau und Diagnosen, eine Einheitenkontrolle, mehrere Geschosse und die Erkennung von Balken, mit einem übersichtlicheren Assistenten.',
        ],
      },
      fr: {
        title: 'Import de plans DXF',
        items: [
          'L\'import de plans DXF gagne un aperçu et des diagnostics, le contrôle des unités, plusieurs niveaux et l\'interprétation des poutres, avec un assistant plus clair.',
        ],
      },
      tr: {
        title: 'DXF plan içe aktarıcı',
        items: [
          'DXF plan içe aktarıcıya önizleme ve tanılama, birim kontrolü, birden çok kat ve kiriş yorumlama eklendi; sihirbaz da daha anlaşılır.',
        ],
      },
      hu: {
        "title": "DXF-rajzimportáló",
        "items": [
          "A DXF-rajzimportáló előnézettel és diagnosztikával, mértékegység-kezeléssel, több szinttel és gerendafelismeréssel bővült, áttekinthetőbb varázslóval."
        ]
      },
      zh: {
        "title": "DXF 图纸导入器",
        "items": [
          "DXF 图纸导入器新增预览和诊断、单位控制、多楼层和梁识别，向导也更清晰。",
        ]
      },
    },
  },
  {
    date: '2026-06-26',
    areas: ['basic'],
    i18n: {
      es: {
        title: 'Despiece de barras en el Básico',
        items: [
          'Despiece (cuerpo libre) de barras en 2D y 3D, con articulaciones deslizantes en 2D y de seis grados de libertad en 3D, e inspección de los vectores en cada extremo.',
        ],
      },
      en: {
        title: 'Member free-body diagrams in Basic',
        items: [
          'Free-body diagrams of members in 2D and 3D, with sliding hinges in 2D and six-degree-of-freedom releases in 3D, and the force vectors at each end.',
        ],
      },
      pt: {
        title: 'Diagramas de corpo livre no Básico',
        items: [
          'Diagramas de corpo livre de barras em 2D e 3D, com articulações deslizantes em 2D e de seis graus de liberdade em 3D, e os vetores em cada extremidade.',
        ],
      },
      de: {
        title: 'Freikörperbilder der Stäbe in Basis',
        items: [
          'Freikörperbilder von Stäben in 2D und 3D, mit Schiebegelenken in 2D und Freigaben in allen sechs Freiheitsgraden in 3D sowie den Kraftvektoren an jedem Ende.',
        ],
      },
      fr: {
        title: 'Les corps libres des barres dans Basique',
        items: [
          'Corps libres des barres en 2D et en 3D, avec des rotules glissantes en 2D et des libérations sur les six degrés de liberté en 3D, et les vecteurs d\'effort à chaque extrémité.',
        ],
      },
      tr: {
        title: 'Temel\'de çubukların serbest cisim diyagramları',
        items: [
          'Çubukların 2B ve 3B serbest cisim diyagramları; 2B\'de kayan mafsallar, 3B\'de altı serbestlik derecesinde serbestlikler ve her uçtaki kuvvet vektörleri.',
        ],
      },
      hu: {
        "title": "Rudak szabadtest-ábrái az Alap módban",
        "items": [
          "Rudak szabadtest-ábrái 2D-ben és 3D-ben, 2D-ben csúszó csuklókkal, 3D-ben hat szabadságfokú kioldásokkal, és az erővektorokkal minden rúdvégen."
        ]
      },
      zh: {
        "title": "基础模式中的杆件隔离体图",
        "items": [
          "2D 和 3D 中杆件的隔离体图，2D 中带滑动铰，3D 中带六自由度释放，并显示每端的力矢量。",
        ]
      },
    },
  },
  {
    date: '2026-06-19',
    areas: ['pro', 'pro', 'basic'],
    i18n: {
      es: {
        title: 'Del plano de CAD al modelo de hormigón',
        items: [
          'De un plano DXF a un borrador estructural de hormigón armado: asistente con clasificación de capas, plantilla descargable y ejemplos.',
          'Convención de ejes locales en 3D corregida en la interfaz y en el motor, con migración de los modelos existentes.',
          'Ejes y secciones unificados en el Básico 2D y 3D.',
        ],
      },
      en: {
        title: 'From a CAD drawing to a concrete model',
        items: [
          'From a DXF drawing to a reinforced concrete structural draft: a wizard that classifies layers, a downloadable template and examples.',
          'The 3D local-axis convention fixed in the interface and in the engine, with existing models migrated.',
          'Axes and sections unified across Basic 2D and 3D.',
        ],
      },
      pt: {
        title: 'Da planta de CAD ao modelo de concreto',
        items: [
          'De uma planta DXF a um rascunho estrutural de concreto armado: assistente com classificação de camadas, modelo para baixar e exemplos.',
          'Convenção de eixos locais em 3D corrigida na interface e no motor, com migração dos modelos existentes.',
          'Eixos e seções unificados no Básico 2D e 3D.',
        ],
      },
      de: {
        title: 'Vom CAD-Plan zum Stahlbetonmodell',
        items: [
          'Von einem DXF-Plan zu einem Tragwerksentwurf in Stahlbeton: ein Assistent, der Layer klassifiziert, eine herunterladbare Vorlage und Beispiele.',
          'Die Konvention der lokalen Achsen in 3D wurde in der Oberfläche und im Rechenkern korrigiert, und bestehende Modelle wurden migriert.',
          'Achsen und Querschnitte in Basis 2D und 3D vereinheitlicht.',
        ],
      },
      fr: {
        title: 'Du plan CAO au modèle en béton armé',
        items: [
          'D\'un plan DXF à une ébauche de structure en béton armé : un assistant qui classe les calques, un gabarit téléchargeable et des exemples.',
          'La convention des axes locaux en 3D corrigée dans l\'interface et dans le moteur, avec migration des modèles existants.',
          'Axes et sections unifiés dans Basique 2D et 3D.',
        ],
      },
      tr: {
        title: 'CAD planından betonarme modele',
        items: [
          'Bir DXF planından betonarme bir yapı taslağına: katmanları sınıflandıran bir sihirbaz, indirilebilir bir şablon ve örnekler.',
          '3B yerel eksen kuralı arayüzde ve motorda düzeltildi; mevcut modeller de taşındı.',
          'Temel 2B ve 3B\'de eksenler ve kesitler birleştirildi.',
        ],
      },
      hu: {
        "title": "CAD-rajztól a betonmodellig",
        "items": [
          "DXF-rajzból vasbeton szerkezeti vázlat: rétegeket osztályozó varázsló, letölthető sablon és példák.",
          "A 3D helyi tengelyek konvenciója javítva a felületen és a számítómagban, a meglévő modellek migrálásával.",
          "Egységes tengelyek és keresztmetszetek az Alap mód 2D és 3D nézetében."
        ]
      },
      zh: {
        "title": "从 CAD 图纸到混凝土模型",
        "items": [
          "从 DXF 图纸到钢筋混凝土结构草案：一个对图层分类的向导、一个可下载的模板和示例。",
          "3D 局部坐标轴的约定已在界面和引擎中统一，已有模型也完成了迁移。",
          "基础模式的 2D 和 3D 中统一了坐标轴和截面。",
        ]
      },
    },
  },
  {
    date: '2026-06-12',
    areas: ['pro', 'pro', 'pro', 'pro', 'basic'],
    shot: {
      base: 'pro-building-axial',
      w: 1600,
      h: 1192,
      alt: {
        es: 'Los esfuerzos normales de un edificio en el modo PRO, con perfiles reales en el visor 3D',
        en: 'Axial forces in a building in PRO mode, with real section shapes in the 3D viewer',
        pt: 'Os esforços normais de um edifício no modo PRO, com perfis reais no visualizador 3D',
        de: 'Die Normalkräfte eines Gebäudes im PRO-Modus, mit realen Querschnittsformen in der 3D-Ansicht',
        fr: 'Les efforts normaux d\'un bâtiment dans le mode PRO, avec les formes réelles des sections dans la vue 3D',
        tr: 'PRO modunda bir binanın normal kuvvetleri; 3B görüntüleyicide gerçek kesit şekilleriyle',
        hu: 'Normálerők egy épületben a PRO módban, valós keresztmetszet-alakokkal a 3D megjelenítőben',
        zh: 'PRO 模式中某建筑的轴力，3D 查看器中显示真实的截面形状',
      },
    },
    i18n: {
      es: {
        title: 'Un flujo profesional en el PRO',
        items: [
          'Diseño, cargas e informe de cálculo integrados en el PRO, con las verificaciones de diseño unificadas.',
          'Consulta de resultados por caso, combinación y envolvente.',
          'Visor 3D con perfiles reales y ejes locales, y excentricidades de barras para modelar vigas en la cara de la columna.',
          'Losas y muros con visualización, ejes, tensiones principales e informe.',
          'El modo Básico se reescribió, con límites más claros frente al PRO.',
        ],
      },
      en: {
        title: 'A professional workflow in PRO',
        items: [
          'Design, loads and the calculation report working together in PRO, with unified design checks.',
          'Results by load case, combination and envelope.',
          'A 3D viewer with real section shapes and local axes, and member offsets to model beams framing into the column face.',
          'Slabs and walls with display, axes, principal stresses and report.',
          'Basic mode was rewritten, with a clearer line between it and PRO.',
        ],
      },
      pt: {
        title: 'Um fluxo profissional no PRO',
        items: [
          'Dimensionamento, cargas e relatório de cálculo integrados no PRO, com as verificações de dimensionamento unificadas.',
          'Consulta de resultados por caso, combinação e envoltória.',
          'Visualizador 3D com perfis reais e eixos locais, e excentricidades de barras para modelar vigas na face do pilar.',
          'Lajes e paredes com visualização, eixos, tensões principais e relatório.',
          'O modo Básico foi reescrito, com limites mais claros em relação ao PRO.',
        ],
      },
      de: {
        title: 'Ein professioneller Arbeitsablauf in PRO',
        items: [
          'Bemessung, Lasten und statische Berechnung greifen in PRO ineinander, mit vereinheitlichten Nachweisen.',
          'Ergebnisse nach Lastfall, Kombination und Einhüllender.',
          'Eine 3D-Ansicht mit realen Querschnittsformen und lokalen Achsen sowie Stabversätze, um Balken an der Stützenseite anzuschließen.',
          'Decken und Wände mit Darstellung, Achsen, Hauptspannungen und Bericht.',
          'Der Basis-Modus wurde neu geschrieben, mit einer klareren Abgrenzung zu PRO.',
        ],
      },
      fr: {
        title: 'Un flux de travail professionnel dans PRO',
        items: [
          'Dimensionnement, charges et note de calcul fonctionnent ensemble dans PRO, avec des vérifications unifiées.',
          'Résultats par cas de charge, par combinaison et par enveloppe.',
          'Une vue 3D avec les formes réelles des sections et les axes locaux, et des excentrements de barres pour modéliser les poutres au nu du poteau.',
          'Dalles et voiles avec affichage, axes, contraintes principales et note de calcul.',
          'Le mode Basique a été réécrit, avec une séparation plus nette par rapport à PRO.',
        ],
      },
      tr: {
        title: 'PRO\'da profesyonel bir iş akışı',
        items: [
          'PRO\'da boyutlandırma, yükler ve hesap raporu birlikte çalışıyor; kontroller de birleştirildi.',
          'Yük durumu, kombinasyon ve zarfa göre sonuçlar.',
          'Gerçek kesit şekilleri ve yerel eksenlerle bir 3B görüntüleyici; kirişleri kolon yüzünde modellemek için çubuk kaçıklıkları.',
          'Görüntüleme, eksenler, asal gerilmeler ve raporla döşemeler ve perde duvarlar.',
          'Temel modu yeniden yazıldı; PRO ile arasındaki sınır daha net.',
        ],
      },
      hu: {
        "title": "Professzionális munkafolyamat a PRO-ban",
        "items": [
          "Méretezés, terhek és számítási jelentés együttműködve a PRO-ban, egységes méretezési ellenőrzésekkel.",
          "Eredmények teheresetenként, kombinációnként és burkolóként.",
          "3D megjelenítő valós keresztmetszet-alakokkal és helyi tengelyekkel, valamint rúdvégi eltolások az oszlop oldallapjához csatlakozó gerendák modellezéséhez.",
          "Födémek és falak megjelenítéssel, tengelyekkel, főfeszültségekkel és jelentéssel.",
          "Az Alap módot újraírták, világosabb határvonallal közte és a PRO között."
        ]
      },
      zh: {
        "title": "PRO 中的专业工作流程",
        "items": [
          "设计、荷载和计算书在 PRO 中协同工作，设计验算统一。",
          "按荷载工况、组合和包络给出结果。",
          "带真实截面形状和局部坐标轴的 3D 查看器，以及用于对梁与柱面相接建模的杆件偏移。",
          "楼板和墙的显示、坐标轴、主应力和报告。",
          "基础模式经过重写，与 PRO 的界线更清晰。",
        ]
      },
    },
  },
  {
    date: '2026-04-01',
    period: 'month',
    areas: ['site', 'engine', 'engine', 'app', 'app', 'app'],
    i18n: {
      es: {
        title: 'Un visor 3D más fluido y un motor más robusto',
        items: [
          'Una landing rediseñada.',
          'Cerca de mil tests nuevos de robustez, con correcciones de exactitud en el motor, los elementos y las restricciones, y avisos de inestabilidad antes de calcular.',
          'Articulaciones en 3D liberadas eje por eje en cada extremo de barra.',
          'El visor 3D se mueve con fluidez en modelos de más de mil nodos: los nodos se dibujan de una vez y la selección de barras es más rápida.',
          'Los ejes quedaron unificados con Z hacia arriba en toda la app, y se corrigieron los momentos My y Mz en tensiones y verificaciones.',
          'Correcciones en el guardado, los links compartidos y las exportaciones.',
        ],
      },
      en: {
        title: 'A smoother 3D viewer and a sturdier engine',
        items: [
          'A redesigned landing page.',
          'Close to a thousand new robustness tests, with accuracy fixes in the engine, the elements and the constraints, and instability warnings before the analysis runs.',
          'Hinges in 3D released axis by axis at each member end.',
          'The 3D viewer moves smoothly on models with over a thousand nodes: nodes are drawn in one pass and picking members is faster.',
          'Axes were unified with Z up across the app, and the My and Mz moments were fixed in stresses and design checks.',
          'Fixes to saving, shared links and exports.',
        ],
      },
      pt: {
        title: 'Um visualizador 3D mais fluido e um motor mais robusto',
        items: [
          'Uma landing redesenhada.',
          'Perto de mil testes novos de robustez, com correções de exatidão no motor, nos elementos e nas restrições, e avisos de instabilidade antes de calcular.',
          'Articulações em 3D liberadas eixo por eixo em cada extremidade da barra.',
          'O visualizador 3D se move com fluidez em modelos com mais de mil nós: os nós são desenhados de uma vez e a seleção de barras ficou mais rápida.',
          'Os eixos foram unificados com Z para cima em todo o app, e os momentos My e Mz foram corrigidos nas tensões e verificações.',
          'Correções no salvamento, nos links compartilhados e nas exportações.',
        ],
      },
      de: {
        title: 'Eine flüssigere 3D-Ansicht und ein robusterer Rechenkern',
        items: [
          'Eine neu gestaltete Startseite.',
          'Fast tausend neue Robustheitstests, mit Genauigkeitskorrekturen im Rechenkern, in den Elementen und den Kopplungen, sowie Warnungen vor Instabilität, bevor die Berechnung läuft.',
          'Gelenke in 3D, an jedem Stabende Achse für Achse freigegeben.',
          'Die 3D-Ansicht bewegt sich bei Modellen mit über tausend Knoten flüssig: Die Knoten werden in einem Durchgang gezeichnet, und die Auswahl von Stäben ist schneller.',
          'Die Achsen wurden in der ganzen App mit Z nach oben vereinheitlicht, und die Momente My und Mz wurden in Spannungen und Nachweisen korrigiert.',
          'Korrekturen beim Speichern, bei geteilten Links und bei Exporten.',
        ],
      },
      fr: {
        title: 'Une vue 3D plus fluide et un moteur plus robuste',
        items: [
          'Une page d\'accueil repensée.',
          'Près de mille nouveaux tests de robustesse, avec des corrections de précision dans le moteur, les éléments et les liaisons, et des avertissements d\'instabilité avant le calcul.',
          'Rotules en 3D libérées axe par axe à chaque extrémité de barre.',
          'La vue 3D reste fluide sur des modèles de plus de mille nœuds : les nœuds sont dessinés en une seule passe et la sélection des barres est plus rapide.',
          'Les axes ont été unifiés avec Z vers le haut dans toute l\'application, et les moments My et Mz ont été corrigés dans les contraintes et les vérifications.',
          'Corrections de l\'enregistrement, des liens partagés et des exports.',
        ],
      },
      tr: {
        title: 'Daha akıcı bir 3B görüntüleyici ve daha sağlam bir motor',
        items: [
          'Yeniden tasarlanmış bir açılış sayfası.',
          'Bine yakın yeni sağlamlık testi; motorda, elemanlarda ve kısıtlarda doğruluk düzeltmeleri ve analiz çalışmadan önce kararsızlık uyarıları.',
          '3B\'de her çubuk ucunda eksen eksen serbest bırakılan mafsallar.',
          '3B görüntüleyici bini aşkın düğümlü modellerde akıcı hareket ediyor: düğümler tek geçişte çiziliyor ve çubuk seçimi daha hızlı.',
          'Eksenler uygulamanın tamamında Z yukarı olacak biçimde birleştirildi; gerilmelerde ve kontrollerde My ve Mz momentleri düzeltildi.',
          'Kaydetmede, paylaşılan bağlantılarda ve dışa aktarmalarda düzeltmeler.',
        ],
      },
      hu: {
        "title": "Gördülékenyebb 3D megjelenítő és robusztusabb számítómag",
        "items": [
          "Újratervezett nyitóoldal.",
          "Közel ezer új robusztussági teszt, pontossági javításokkal a számítómagban, az elemekben és a kényszerekben, valamint instabilitási figyelmeztetésekkel az analízis futtatása előtt.",
          "3D csuklók tengelyenkénti kioldással minden rúdvégen.",
          "A 3D megjelenítő ezernél több csomópontú modelleken is gördülékenyen mozog: a csomópontok egyetlen menetben rajzolódnak ki, és a rudak kijelölése gyorsabb.",
          "A tengelyeket az egész alkalmazásban felfelé mutató Z tengellyel egységesítették, és javították az My és Mz nyomatékokat a feszültségekben és a méretezési ellenőrzésekben.",
          "Javítások a mentésben, a megosztott hivatkozásokban és az exportálásban."
        ]
      },
      zh: {
        "title": "更流畅的 3D 查看器和更稳固的引擎",
        "items": [
          "重新设计的落地页（首页）。",
          "近一千个新的稳健性测试，并修正了引擎、单元和约束中的精度问题，在分析运行前给出不稳定警告。",
          "3D 中的铰可在每根杆件的每一端逐轴释放。",
          "3D 查看器在超过一千个节点的模型上依然流畅：节点一次绘制完成，杆件拾取更快。",
          "整个应用统一采用 Z 轴向上，并修复了应力和设计验算中的 My 和 Mz 弯矩。",
          "对保存、共享链接和导出的修复。",
        ]
      },
    },
  },
  {
    date: '2026-03-01',
    period: 'month',
    areas: ['engine', 'engine', 'engine', 'engine', 'site', 'pro', 'pro', 'edu', 'basic', 'app'],
    shot: {
      base: '3d-frame',
      w: 1600,
      h: 876,
      alt: {
        es: 'Un pórtico espacial con su diagrama de momentos en 3D',
        en: 'A space frame with its bending moment diagram in 3D',
        pt: 'Um pórtico espacial com seu diagrama de momentos em 3D',
        de: 'Ein räumlicher Rahmen mit seiner Momentenlinie in 3D',
        fr: 'Un portique spatial avec son diagramme des moments en 3D',
        tr: '3B eğilme momenti diyagramıyla bir uzay çerçeve',
        hu: 'Térbeli keret a hajlítónyomatéki ábrájával 3D-ben',
        zh: '带 3D 弯矩图的空间框架',
      },
    },
    i18n: {
      es: {
        title: 'El motor en Rust, el modo PRO y el nombre Stabileo',
        items: [
          'El motor de cálculo se reescribió en Rust y corre en el navegador con WebAssembly. Antes de reemplazar al anterior, se comparó con él en 90 modelos.',
          'Más de dos mil tests de validación contra soluciones de libros de texto y casos de referencia publicados.',
          'Análisis no lineal geométrico y de material, dinámica modal, espectral y en el tiempo, placas y cáscaras, cables, construcción por etapas y fundaciones sobre resortes.',
          'Un solver para matrices dispersas que acelera los modelos grandes: el análisis modal en 3D pasó a ser 11,8 veces más rápido.',
          'El proyecto pasó a llamarse Stabileo, con dominio propio, landing y la interfaz en 14 idiomas.',
          'El modo PRO, con verificación de hormigón armado según CIRSOC 201, cargas automáticas, diagnósticos e informe de cálculo.',
          'Un flujo de hormigón armado con la combinación que gobierna cada barra, verificación automática, armado y nudos, y ejemplos grandes como un estadio de 1005 nodos.',
          'El modo Educativo, con ejercicios guiados que se corrigen paso a paso.',
          'El modo Básico suma la vista 3D y el pase de modelos de 3D a 2D.',
          'Un asistente con IA que arma y edita modelos a partir de una conversación.',
        ],
      },
      en: {
        title: 'The engine in Rust, PRO mode and the Stabileo name',
        items: [
          'The analysis engine was rewritten in Rust and runs in the browser through WebAssembly. Before it replaced the old one, the two were compared on 90 models.',
          'Over two thousand validation tests against textbook solutions and published reference cases.',
          'Geometric and material nonlinear analysis, modal, spectral and time-history dynamics, plates and shells, cables, staged construction and foundations on springs.',
          'A sparse matrix solver that speeds up large models: 3D modal analysis became 11.8 times faster.',
          'The project was renamed Stabileo, with its own domain, a landing page and the interface in 14 languages.',
          'PRO mode, with reinforced concrete checks to CIRSOC 201, automatic loads, diagnostics and a calculation report.',
          'A reinforced concrete workflow with the governing combination for each member, automatic checks, detailing and joints, and large examples such as a 1005-node stadium.',
          'Education mode, with guided exercises checked step by step.',
          'Basic mode adds the 3D view and turning 3D models into 2D ones.',
          'An AI assistant that builds and edits models from a conversation.',
        ],
      },
      pt: {
        title: 'O motor em Rust, o modo PRO e o nome Stabileo',
        items: [
          'O motor de cálculo foi reescrito em Rust e roda no navegador com WebAssembly. Antes de substituir o anterior, os dois foram comparados em 90 modelos.',
          'Mais de dois mil testes de validação contra soluções de livros-texto e casos de referência publicados.',
          'Análise não linear geométrica e de material, dinâmica modal, espectral e no tempo, placas e cascas, cabos, construção em etapas e fundações sobre molas.',
          'Um solver para matrizes esparsas que acelera os modelos grandes: a análise modal em 3D ficou 11,8 vezes mais rápida.',
          'O projeto passou a se chamar Stabileo, com domínio próprio, landing e a interface em 14 idiomas.',
          'O modo PRO, com verificação de concreto armado segundo a CIRSOC 201, cargas automáticas, diagnósticos e relatório de cálculo.',
          'Um fluxo de concreto armado com a combinação que governa cada barra, verificação automática, armação e nós, e exemplos grandes como um estádio de 1005 nós.',
          'O modo Educativo, com exercícios guiados corrigidos passo a passo.',
          'O modo Básico ganha a vista 3D e a passagem de modelos de 3D para 2D.',
          'Um assistente com IA que monta e edita modelos a partir de uma conversa.',
        ],
      },
      de: {
        title: 'Der Rechenkern in Rust, der PRO-Modus und der Name Stabileo',
        items: [
          'Der Rechenkern wurde in Rust neu geschrieben und läuft über WebAssembly im Browser. Bevor er den alten ersetzte, wurden beide an 90 Modellen verglichen.',
          'Über zweitausend Validierungstests gegen Lehrbuchlösungen und veröffentlichte Referenzfälle.',
          'Geometrisch und materiell nichtlineare Berechnung, Dynamik modal, mit Antwortspektrum und im Zeitverlauf, Platten und Schalen, Seile, Berechnung in Bauphasen und federnd gelagerte Gründungen.',
          'Ein Löser für dünnbesetzte Matrizen, der große Modelle beschleunigt: Die Modalanalyse in 3D wurde 11,8-mal schneller.',
          'Das Projekt wurde in Stabileo umbenannt, mit eigener Domain, einer Startseite und der Oberfläche in 14 Sprachen.',
          'Der PRO-Modus, mit Stahlbetonnachweisen nach CIRSOC 201, automatischen Lasten, Diagnosen und statischer Berechnung.',
          'Ein Arbeitsablauf für Stahlbeton mit der maßgebenden Kombination für jeden Stab, automatischen Nachweisen, Bewehrungsführung und Knoten, sowie großen Beispielen wie einem Stadion mit 1005 Knoten.',
          'Der Lehrmodus, mit geführten Übungen, die Schritt für Schritt bewertet werden.',
          'Der Basis-Modus erhält die 3D-Ansicht und die Umwandlung von 3D-Modellen in 2D-Modelle.',
          'Ein KI-Assistent, der Modelle aus einem Gespräch heraus erstellt und bearbeitet.',
        ],
      },
      fr: {
        title: 'Le moteur en Rust, le mode PRO et le nom Stabileo',
        items: [
          'Le moteur de calcul a été réécrit en Rust et s\'exécute dans le navigateur grâce à WebAssembly. Avant qu\'il remplace l\'ancien, les deux ont été comparés sur 90 modèles.',
          'Plus de deux mille tests de validation par rapport à des solutions de manuels et à des cas de référence publiés.',
          'Analyse non linéaire géométrique et matérielle, dynamique modale, spectrale et temporelle, plaques et coques, câbles, construction par phases et fondations sur ressorts.',
          'Un solveur pour matrices creuses qui accélère les grands modèles : l\'analyse modale en 3D est devenue 11,8 fois plus rapide.',
          'Le projet a été renommé Stabileo, avec son propre domaine, une page d\'accueil et l\'interface en 14 langues.',
          'Le mode PRO, avec la vérification du béton armé selon le CIRSOC 201, des charges automatiques, des diagnostics et une note de calcul.',
          'Un flux de travail pour le béton armé avec la combinaison déterminante pour chaque barre, la vérification automatique, le ferraillage et les nœuds, et de grands exemples comme un stade de 1005 nœuds.',
          'Le mode Enseignement, avec des exercices guidés corrigés pas à pas.',
          'Le mode Basique ajoute la vue 3D et le passage de modèles 3D en modèles 2D.',
          'Un assistant d\'IA qui construit et modifie des modèles à partir d\'une conversation.',
        ],
      },
      tr: {
        title: 'Rust ile yazılan motor, PRO modu ve Stabileo adı',
        items: [
          'Hesap motoru Rust ile yeniden yazıldı ve tarayıcıda WebAssembly ile çalışıyor. Eskisinin yerini almadan önce ikisi 90 model üzerinde karşılaştırıldı.',
          'Ders kitabı çözümlerine ve yayımlanmış referans durumlara karşı iki binden fazla doğrulama testi.',
          'Geometrik ve malzeme bakımından doğrusal olmayan analiz; modal, spektral ve zaman tanım alanında dinamik; plaklar ve kabuklar, kablolar, aşamalı yapım ve yaylar üzerinde temeller.',
          'Büyük modelleri hızlandıran bir seyrek matris çözücüsü: 3B modal analiz 11,8 kat hızlandı.',
          'Projenin adı Stabileo oldu; kendi alan adı, bir açılış sayfası ve 14 dilde arayüzle.',
          'CIRSOC 201\'e göre betonarme kontrolleri, otomatik yükler, tanılamalar ve hesap raporuyla PRO modu.',
          'Her çubuk için belirleyici kombinasyonu, otomatik kontrolleri, donatı detaylandırmayı ve düğümleri içeren bir betonarme iş akışı ve 1005 düğümlü bir stadyum gibi büyük örnekler.',
          'Adım adım değerlendirilen rehberli alıştırmalarla Eğitim modu.',
          'Temel moduna 3B görünüm ve 3B modellerin 2B\'ye dönüştürülmesi eklendi.',
          'Bir konuşmadan modeller oluşturan ve düzenleyen bir yapay zekâ asistanı.',
        ],
      },
      hu: {
        "title": "Rust nyelvű számítómag, a PRO mód és a Stabileo név",
        "items": [
          "Az analízis számítómagját Rust nyelven újraírták, és WebAssemblyn keresztül fut a böngészőben. Mielőtt leváltotta a régit, a kettőt 90 modellen vetették össze.",
          "Több mint kétezer validációs teszt tankönyvi megoldásokkal és publikált referenciaesetekkel szemben.",
          "Geometriailag és anyagilag nemlineáris analízis, modális, spektrális és időtörténeti dinamika, lemezek és héjak, kötelek, építési fázisok és rugókon álló alapozások.",
          "Ritka mátrixos megoldó, amely felgyorsítja a nagy modelleket: a 3D modális analízis 11,8-szor gyorsabb lett.",
          "A projekt a Stabileo nevet kapta, saját domainnel, nyitóoldallal és 14 nyelvű felülettel.",
          "PRO mód, CIRSOC 201 szerinti vasbeton-ellenőrzésekkel, automatikus terhekkel, diagnosztikával és számítási jelentéssel.",
          "Vasbeton munkafolyamat minden rúd mértékadó kombinációjával, automatikus ellenőrzésekkel, részletképzéssel és csomópontokkal, valamint nagy példákkal, például egy 1005 csomópontos stadionnal.",
          "Oktatási mód lépésről lépésre ellenőrzött, vezetett feladatokkal.",
          "Az Alap mód 3D nézettel bővült, és a 3D modellek 2D modellekké alakíthatók.",
          "MI-asszisztens, amely beszélgetés alapján épít és szerkeszt modelleket."
        ]
      },
      zh: {
        "title": "Rust 引擎、PRO 模式和 Stabileo 之名",
        "items": [
          "分析引擎用 Rust 重写，通过 WebAssembly 在浏览器中运行。在取代旧引擎之前，两者在 90 个模型上做过对比。",
          "超过两千项对照教科书解答和已发表参考算例的验证测试。",
          "几何非线性和材料非线性分析、模态、反应谱和时程动力分析、板和壳、索、分阶段施工以及弹簧支承的基础。",
          "稀疏矩阵求解器加快了大型模型：3D 模态分析快了 11.8 倍。",
          "项目更名为 Stabileo，拥有自己的域名、落地页和 14 种语言的界面。",
          "PRO 模式，带有按 CIRSOC 201 的钢筋混凝土验算、自动荷载、诊断和计算书。",
          "钢筋混凝土工作流程：每根杆件的控制组合、自动验算、配筋构造和节点，以及 1005 个节点的体育场等大型示例。",
          "教学模式，带有逐步检查的引导式练习。",
          "基础模式新增 3D 视图，以及把 3D 模型转换为 2D 模型。",
          "一个可通过对话来构建和编辑模型的 AI 助手。",
        ]
      },
    },
  },
  {
    date: '2026-02-01',
    period: 'month',
    areas: ['basic', 'basic', 'basic', 'basic', 'engine', 'edu', 'app'],
    shot: {
      base: '2d-moments',
      w: 1600,
      h: 997,
      alt: {
        es: 'Un pórtico plano con su diagrama de momentos flectores en el modo Básico',
        en: 'A plane frame with its bending moment diagram in Basic mode',
        pt: 'Um pórtico plano com seu diagrama de momentos fletores no modo Básico',
        de: 'Ein ebener Rahmen mit seiner Momentenlinie im Basis-Modus',
        fr: 'Un portique plan avec son diagramme des moments fléchissants dans le mode Basique',
        tr: 'Temel modunda eğilme momenti diyagramıyla bir düzlem çerçeve',
        hu: 'Síkbeli keret a hajlítónyomatéki ábrájával az Alap módban',
        zh: '基础模式中带弯矩图的平面框架',
      },
    },
    i18n: {
      es: {
        title: 'El comienzo: un editor de estructuras en el navegador',
        items: [
          'La primera versión, el 10 de febrero: barras, apoyos y cargas en 2D, con reacciones, diagramas y deformada, sin instalar nada.',
          'Cargas puntuales, distribuidas parciales y móviles, casos de carga, combinaciones y envolventes con sus dos curvas.',
          'Secciones de acero y de hormigón con un constructor de perfiles, y tensiones en la sección por Navier, Jourawski y Von Mises.',
          'Apoyos inclinados, resortes y asentamientos, y peso propio de las barras.',
          'Un motor 3D con seis grados de libertad por nodo y su visor, además de P-Delta, pandeo y líneas de influencia en 2D.',
          'Análisis cinemático didáctico, que explica barra por barra por qué una estructura es o no un mecanismo.',
          'Interfaz para celulares, links compartidos que llevan el modelo, un recorrido guiado y atajos de teclado.',
        ],
      },
      en: {
        title: 'The beginning: a structural editor in the browser',
        items: [
          'The first version, on 10 February: members, supports and loads in 2D, with reactions, diagrams and the deflected shape, with nothing to install.',
          'Point, partial distributed and moving loads, load cases, combinations and envelopes with both curves.',
          'Steel and concrete sections with a section builder, and stresses in the section by Navier, Jourawski and Von Mises.',
          'Inclined supports, springs and settlements, and member self-weight.',
          'A 3D engine with six degrees of freedom per node and its viewer, plus P-Delta, buckling and influence lines in 2D.',
          'A teaching kinematic analysis that explains, member by member, why a structure is or is not a mechanism.',
          'A mobile interface, shared links that carry the model, a guided tour and keyboard shortcuts.',
        ],
      },
      pt: {
        title: 'O começo: um editor de estruturas no navegador',
        items: [
          'A primeira versão, em 10 de fevereiro: barras, apoios e cargas em 2D, com reações, diagramas e deformada, sem instalar nada.',
          'Cargas pontuais, distribuídas parciais e móveis, casos de carga, combinações e envoltórias com suas duas curvas.',
          'Seções de aço e de concreto com um construtor de perfis, e tensões na seção por Navier, Jourawski e Von Mises.',
          'Apoios inclinados, molas e recalques, e peso próprio das barras.',
          'Um motor 3D com seis graus de liberdade por nó e seu visualizador, além de P-Delta, flambagem e linhas de influência em 2D.',
          'Análise cinemática didática, que explica barra por barra por que uma estrutura é ou não um mecanismo.',
          'Interface para celulares, links compartilhados que levam o modelo, um tour guiado e atalhos de teclado.',
        ],
      },
      de: {
        title: 'Der Anfang: ein Tragwerkseditor im Browser',
        items: [
          'Die erste Version, am 10. Februar: Stäbe, Auflager und Lasten in 2D, mit Auflagerreaktionen, Schnittgrößenverläufen und Verformungsfigur, ohne etwas zu installieren.',
          'Einzellasten, abschnittsweise Streckenlasten und Wanderlasten, Lastfälle, Kombinationen und Einhüllende mit ihren beiden Kurven.',
          'Stahl- und Betonquerschnitte mit einem Profileditor sowie Spannungen im Querschnitt nach Navier, Jourawski und von Mises.',
          'Geneigte Auflager, Federn und Setzungen sowie das Eigengewicht der Stäbe.',
          'Ein 3D-Rechenkern mit sechs Freiheitsgraden je Knoten und seine Ansicht, dazu P-Delta, Knicken und Einflusslinien in 2D.',
          'Eine kinematische Analyse für die Lehre, die Stab für Stab erklärt, warum ein Tragwerk ein Mechanismus ist oder nicht.',
          'Eine Oberfläche für Mobilgeräte, geteilte Links, die das Modell mitnehmen, eine geführte Tour und Tastenkürzel.',
        ],
      },
      fr: {
        title: 'Les débuts : un éditeur de structures dans le navigateur',
        items: [
          'La première version, le 10 février : barres, appuis et charges en 2D, avec réactions, diagrammes et déformée, sans rien installer.',
          'Charges ponctuelles, réparties partielles et mobiles, cas de charge, combinaisons et enveloppes avec leurs deux courbes.',
          'Sections en acier et en béton avec un constructeur de profilés, et contraintes dans la section selon Navier, Jourawski et von Mises.',
          'Appuis inclinés, ressorts et tassements, et poids propre des barres.',
          'Un moteur 3D à six degrés de liberté par nœud et sa vue, ainsi que P-Delta, flambement et lignes d\'influence en 2D.',
          'Une analyse cinématique pédagogique, qui explique barre par barre pourquoi une structure est ou n\'est pas un mécanisme.',
          'Une interface pour mobile, des liens partagés qui transportent le modèle, une visite guidée et des raccourcis clavier.',
        ],
      },
      tr: {
        title: 'Başlangıç: tarayıcıda bir yapı düzenleyici',
        items: [
          'İlk sürüm, 10 Şubat\'ta: 2B\'de çubuklar, mesnetler ve yükler; tepkiler, diyagramlar ve şekil değiştirmiş durumla, hiçbir şey kurmadan.',
          'Tekil, kısmi yayılı ve hareketli yükler, yük durumları, kombinasyonlar ve iki eğrisiyle zarflar.',
          'Profil oluşturucuyla çelik ve beton kesitler; Navier, Jourawski ve von Mises\'e göre kesit gerilmeleri.',
          'Eğik mesnetler, yaylar ve oturmalar ile çubukların öz ağırlığı.',
          'Düğüm başına altı serbestlik dereceli bir 3B motor ve görüntüleyicisi; ayrıca 2B\'de P-Delta, burkulma ve tesir çizgileri.',
          'Bir yapının neden mekanizma olduğunu ya da olmadığını çubuk çubuk açıklayan öğretici bir kinematik analiz.',
          'Mobil arayüz, modeli taşıyan paylaşılan bağlantılar, rehberli tur ve klavye kısayolları.',
        ],
      },
      hu: {
        "title": "A kezdet: szerkezeti szerkesztő a böngészőben",
        "items": [
          "Az első verzió, február 10-én: rudak, támaszok és terhek 2D-ben, támaszerőkkel, igénybevételi ábrákkal és deformált alakkal, telepítés nélkül.",
          "Koncentrált, részleges megoszló és mozgó terhek, teheresetek, kombinációk és mindkét görbét mutató burkolók.",
          "Acél- és beton-keresztmetszetek keresztmetszet-szerkesztővel, valamint feszültségek a keresztmetszetben Navier, Jourawski és von Mises szerint.",
          "Ferde támaszok, rugók és támaszsüllyedések, valamint a rudak önsúlya.",
          "3D számítómag csomópontonként hat szabadságfokkal és a hozzá tartozó megjelenítővel, továbbá P-Delta, kihajlás és hatásvonalak 2D-ben.",
          "Oktatási célú kinematikai analízis, amely rúdról rúdra elmagyarázza, miért mechanizmus egy szerkezet, vagy miért nem az.",
          "Mobil felület, a modellt magukban hordozó megosztott hivatkozások, bemutató túra és billentyűparancsok."
        ]
      },
      zh: {
        "title": "开端：浏览器中的结构编辑器",
        "items": [
          "2 月 10 日发布的第一个版本：2D 中的杆件、支座和荷载，带反力、内力图和挠曲形状，无需安装任何东西。",
          "集中荷载、局部分布荷载和移动荷载，荷载工况、组合以及两条曲线的包络。",
          "带截面构建器的钢截面和混凝土截面，以及按 Navier、Jourawski 和 Von Mises 计算的截面应力。",
          "斜支座、弹簧和支座沉降，以及杆件自重。",
          "每个节点六个自由度的 3D 引擎及其查看器，另有 2D 中的 P-Δ、屈曲和影响线。",
          "一个教学用的几何组成分析，逐杆件解释结构为何是或不是机构。",
          "手机界面、携带模型的共享链接、引导式导览和键盘快捷键。",
        ]
      },
    },
  },
];

export const AREA_LABELS: Record<PublicLocale, Record<ChangelogArea, string>> = {
  es: { basic: 'Básico', pro: 'PRO', edu: 'Educativo', app: 'App', engine: 'Motor', site: 'Sitio' },
  en: { basic: 'Basic', pro: 'PRO', edu: 'Education', app: 'App', engine: 'Engine', site: 'Website' },
  pt: { basic: 'Básico', pro: 'PRO', edu: 'Educativo', app: 'App', engine: 'Motor', site: 'Site' },
  de: { basic: 'Basis', pro: 'PRO', edu: 'Lehre', app: 'App', engine: 'Rechenkern', site: 'Website' },
  fr: { basic: 'Basique', pro: 'PRO', edu: 'Enseignement', app: 'Application', engine: 'Moteur', site: 'Site' },
  tr: { basic: 'Temel', pro: 'PRO', edu: 'Eğitim', app: 'Uygulama', engine: 'Motor', site: 'Site' },
  hu: { basic: 'Alap', pro: 'PRO', edu: 'Oktatás', app: 'Alkalmazás', engine: 'Számítómag', site: 'Weboldal' },
  zh: { basic: '基础', pro: 'PRO', edu: '教学', app: '应用', engine: '计算引擎', site: '网站' },
};

/** Parsed by parts, so no time zone moves the day back. */
function localDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatChangeDate(iso: string, locale: string): string {
  return localDay(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function changeStamp(entry: ChangelogEntry, locale: string): { big: string; small: string | null } {
  const date = localDay(entry.date);
  const month = date.toLocaleDateString(locale, { month: 'short' }).replace(/\.$/, '');
  return entry.period === 'month' ? { big: month, small: null } : { big: String(date.getDate()), small: month };
}

export function formatChangeWhen(entry: ChangelogEntry, locale: string): string {
  return entry.period === 'month' ? formatChangeMonth(entry.date, locale) : formatChangeDate(entry.date, locale);
}

export function formatChangeMonth(iso: string, locale: string, { capitalize = true } = {}): string {
  const text = localDay(iso).toLocaleDateString(locale, { year: 'numeric', month: 'long' });
  return capitalize ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}

export function changeCount(entries: readonly ChangelogEntry[], area: ChangelogArea | null = null): number {
  return entries.reduce((n, e) => n + (area ? e.areas.filter((a) => a === area).length : e.areas.length), 0);
}

export function changesPerArea(entries: readonly ChangelogEntry[]): Record<ChangelogArea, number> {
  return Object.fromEntries(CHANGELOG_AREAS.map((a) => [a, changeCount(entries, a)])) as Record<ChangelogArea, number>;
}

export function entryAreas(entry: ChangelogEntry): ChangelogArea[] {
  return [...new Set(entry.areas)];
}

export function itemsByArea(entry: ChangelogEntry, locale: PublicLocale): { area: ChangelogArea; items: string[] }[] {
  const items = entry.i18n[locale].items;
  return entryAreas(entry).map((area) => ({ area, items: items.filter((_, i) => entry.areas[i] === area) }));
}

/** Expects entries newest first, as CHANGELOG is. */
export function changelogByMonth(entries: ChangelogEntry[]): { key: string; entries: ChangelogEntry[] }[] {
  const months: { key: string; entries: ChangelogEntry[] }[] = [];
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const last = months.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else months.push({ key, entries: [entry] });
  }
  return months;
}
