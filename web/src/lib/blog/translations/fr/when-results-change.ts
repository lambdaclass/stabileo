import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Quand un résultat change : versions de résultats, revérifications et avis de sécurité",
  "excerpt": "Comment Stabileo vous dit lesquels de vos projets une correction concerne, comment il retient un résultat qu’il sait pouvoir être faux jusqu’à ce que la correction existe, et comment la correction est publiée, avec les quatorze versions de résultats fusionnées les 4 et 5 novembre.",
  "blocks": [
    {
      "k": "p",
      "t": "Chaque correction d’un solveur de structures change un chiffre que quelqu’un a peut-être déjà utilisé. Un facteur de flambement qui était trop élevé est maintenant plus bas ; un modèle qui se calculait auparavant est maintenant refusé. Une correction qui arrive discrètement dans l’application laisse l’ancien chiffre dans des notes de calcul déjà remises, et l’ingénieur qui les a produites n’a aucune raison d’y revenir."
    },
    {
      "k": "p",
      "t": "Cet article décrit ce que fait Stabileo à ce sujet, depuis le moment où un défaut est trouvé jusqu’au moment où sa correction est publiée. Les exemples sont réels : les 4 et 5 novembre 2026, quatorze versions de résultats, de 16 à 29, ont atteint stabileo.com."
    },
    {
      "k": "h",
      "t": "Ce qu’est une version de résultats"
    },
    {
      "k": "p",
      "t": "Une version de résultats est un nombre entier, distinct de la version de l’application. Elle augmente de un chaque fois qu’arrive sur le site un changement qui fait donner des chiffres différents au même modèle enregistré, ou qui refuse un modèle qui se calculait auparavant. Chaque changement de ce type est enregistré avec :"
    },
    {
      "k": "ul",
      "items": [
        "la version avec laquelle il est entré, sa date et ses pull requests ;",
        "les modèles qu’il concerne, décrits par des caractéristiques de modèle : un modèle plan avec des liaisons, une analyse de flambement 2D avec des charges le long des barres, une barre en béton vérifiée selon le CIRSOC 201 ;",
        "un titre et une explication pour l’ingénieur dans chacune des six langues de l’application, avec ce qu’il faut revérifier ;",
        "un lien vers la description complète : un avis de sécurité, une note de changement de résultats ou le journal des modifications."
      ]
    },
    {
      "k": "p",
      "t": "Chaque calcul appose sur le projet un tampon indiquant la version de résultats qui l’a produit, ainsi que la version de l’application, le commit, la version du moteur, une empreinte (hash) du binaire du moteur et les analyses exécutées. Le tampon voyage avec le projet : un fichier enregistré, une sauvegarde automatique, un onglet ouvert ou un lien partagé le portent tous."
    },
    {
      "k": "note",
      "t": "Une version de résultats n’est jamais réutilisée. Chaque merge dans la branche principale est déployé et tamponne ce qu’il calcule avec la version actuelle ; une entrée ajoutée à une version déjà en ligne n’atteindrait donc jamais les projets que cette version a tamponnés. Un test échoue sur un tel ajout."
    },
    {
      "k": "h",
      "t": "Pourquoi une version change"
    },
    {
      "k": "p",
      "t": "La plupart des changements sont des corrections : un résultat était faux et il est maintenant juste. Certains sont des refus : un modèle qui donnait un chiffre donne maintenant à la place un message clair, parce que le chiffre ne signifiait rien. Et une version peut aussi annuler : la version 15 a retiré trois changements de la version 14 dont les corrections issues de la revue n’étaient pas arrivées sur le site avec eux, et les versions 27 à 29 les ont rétablis, revus. Un projet calculé avec la version 14 est informé des deux."
    },
    {
      "k": "table",
      "caption": "Versions de résultats 16 à 29, fusionnées les 4 et 5 novembre 2026.",
      "head": [
        "Version",
        "Changement",
        "Type"
      ],
      "rows": [
        [
          "16",
          "Aluminium : l’effort tranchant selon l’axe faible est vérifié",
          "Correction"
        ],
        [
          "17",
          "Assemblages en acier : les moments selon l’axe faible ne sont plus ignorés",
          "Refus"
        ],
        [
          "18",
          "ACI 318 et EN 1992 : les barres en béton soumises à la torsion sont marquées non vérifiées",
          "Refus"
        ],
        [
          "19",
          "Les poteaux en béton armé sont aussi vérifiés sous leur compression minimale (SA-2026-041)",
          "Correction"
        ],
        [
          "20",
          "Générateur de charges : un plancher situé en partie sous une structure de toiture basse conserve ses charges surfaciques (SA-2026-033)",
          "Correction"
        ],
        [
          "21",
          "Les figures de coques exportées montrent le champ et l’échelle de l’écran",
          "Correction"
        ],
        [
          "22",
          "2D : un mécanisme derrière une liaison rigide ou un diaphragme est refusé",
          "Refus"
        ],
        [
          "23",
          "Flambement 2D des barres dont l’effort normal varie le long de la barre (SA-2026-042)",
          "Correction"
        ],
        [
          "24",
          "Analyse corotationnelle 3D avec de grandes rotations autour de plusieurs axes (SA-2026-037)",
          "Correction"
        ],
        [
          "25",
          "Liaisons d’un modèle 2D découpé dans un plan Y–Z ou X–Y (SA-2026-036)",
          "Correction"
        ],
        [
          "26",
          "La valeur déterminante d’une barre et l’enveloppe 2D lisent le vrai pic",
          "Correction"
        ],
        [
          "27–29",
          "Trois changements de Basic retirés par la version 15 reviennent, revus : effondrement plastique, P-Δ et le signe des lignes d’influence du moment",
          "Correction"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Le message de revérification"
    },
    {
      "k": "p",
      "t": "À l’ouverture d’un projet, l’application compare son tampon avec le registre et liste les changements faits depuis qui concernent ce modèle. Un portique plan avec une analyse de flambement est informé de la correction du flambement 2D ; un portique en acier sans béton n’est pas informé de la vérification des poteaux en béton armé. La liste n’est pas une notification qui disparaît : le message n’a pas de bouton de fermeture, ignore Échap et les clics à l’extérieur, et ne se ferme qu’en cochant « J’ai lu ces changements » et en choisissant de continuer ou de relancer le calcul."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic ouvrant un portique plan des exemples, enregistré comme calculé avec la version de résultats 15. Une boîte de dialogue intitulée « Les résultats ont changé depuis le dernier calcul de ce projet » liste les changements qui le concernent, dont la correction du flambement 2D pour les barres dont l’effort normal varie et la valeur déterminante lue au vrai pic, chacun avec son explication, et demande de cocher « J’ai lu ces changements » avant de continuer ou de relancer l’analyse.",
      "caption": "Un portique plan calculé avec la version 15, ouvert aujourd’hui : seuls les changements qui concernent ce modèle sont listés, chacun avec ce qu’il faut revérifier."
    },
    {
      "k": "p",
      "t": "Tant que le modèle n’est pas recalculé, ses résultats sont marqués obsolètes : un bandeau l’indique, et chaque rapport, classeur et CSV exporté entre-temps imprime un avertissement OBSOLÈTE dans sa provenance. « Relancer l’analyse et le dimensionnement » recalcule et, dans PRO, revérifie les barres en béton avec le ferraillage déjà choisi ; il ne les redimensionne pas, car cela écraserait les armatures de l’ingénieur."
    },
    {
      "k": "p",
      "t": "Depuis le 4 novembre (#1406), le message explique chaque changement dans la langue du lecteur, dans les six langues de l’application. Auparavant, les lecteurs en allemand, en français et en turc recevaient le titre et l’explication en anglais : 66 des 72 changements enregistrés n’avaient pas de texte dans ces langues. Chaque traduction a été contrôlée en la retraduisant en anglais sans l’original et en comparant le sens : chiffres, signes, quelle charge, quelle vérification, côté de la sécurité ou de l’insécurité. Ce contrôle a corrigé des phrases dans les trois langues, et il a montré que quatre explications anglaises étaient ambiguës à la source ; elles ont été corrigées dans les six langues."
    },
    {
      "k": "h",
      "t": "Avant la correction : avertir ou refuser"
    },
    {
      "k": "p",
      "t": "Un défaut est généralement trouvé avant d’être corrigé, parfois des jours avant. Pendant ce temps, le résultat qu’il affecte reste à l’écran. La règle que nous suivons est de le confiner d’abord et de le corriger ensuite (issue #447) : chaque défaut ouvert qui peut donner un résultat faux reçoit, à chaque point d’entrée qu’il affecte, soit un avertissement, soit un refus."
    },
    {
      "k": "ul",
      "items": [
        "Un avertissement conserve le résultat et montre, à côté, quel problème connu peut l’affecter et ce qu’il faut vérifier à la main.",
        "Un refus retient le résultat et dit pourquoi, lorsque le chiffre peut être faux d’un grand facteur sans moyen de s’en apercevoir dans la sortie, comme un facteur qui devient plusieurs fois plus grand ou plus petit selon la numérotation des barres."
      ]
    },
    {
      "k": "img",
      "base": "blog/results-refusal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic avec l’exemple du mécanisme caché : une poutre à deux travées sur trois appuis qui glissent tous horizontalement, sous une charge uniforme de 10 kN/m. Après le calcul, aucun diagramme n’est tracé ; un message rouge dans le coin indique que la structure est instable, un mécanisme, car aucun appui ne retient le déplacement horizontal, avec un bouton pour voir l’analyse cinématique.",
      "caption": "La même règle hors de l’inventaire : un modèle qui est un mécanisme reçoit un message qui dit pourquoi, et aucun chiffre."
    },
    {
      "k": "p",
      "t": "Le confinement est tenu dans un inventaire qui liste chaque problème de sécurité ouvert, son avertissement ou son refus, la condition qui le déclenche et le test qui montre qu’il se déclenche, ou la preuve qu’aucun confinement n’est nécessaire. Un test maintient l’accord entre cet inventaire et la liste des problèmes connus du moteur, et une tâche planifiée compare l’inventaire avec les issues ouvertes sur GitHub. Les conditions sont étroites à dessein : sur les 39 modèles du corpus de résultats, chaque avertissement se déclenche sur deux au plus. La pull request qui complète cet inventaire pour chaque issue ouverte (#807) est en revue finale au moment où nous écrivons ; elle sera intégrée avant la version 0.5.0."
    },
    {
      "k": "p",
      "t": "Un confinement prend fin quand sa correction est intégrée, et il prend fin dans la même pull request. Cette semaine, #1295 a supprimé le refus des découpes 3D vers 2D qui faisaient fléchir des barres autour du mauvais axe, parce que la découpe est maintenant juste ; #1301 a remplacé un avertissement émis à chaque calcul corotationnel 3D par un avertissement qui ne se déclenche que lorsqu’une extrémité de barre tourne de plus de 0,02 rad par rapport à sa corde, là où l’approximation restante peut compter."
    },
    {
      "k": "h",
      "t": "Les corrections de la semaine"
    },
    {
      "k": "p",
      "t": "Flambement 2D avec des charges axiales le long des barres (#1324, version 23). La rigidité géométrique de chaque barre utilisait son effort normal moyen. Là où la compression croît vers l’extrémité qui tourne le plus, comme sous la pesanteur dans un chevron ou sous une charge axiale ponctuelle à l’intérieur de la portée, le facteur de flambement sortait trop élevé et rien ne le signalait. Chaque barre intègre maintenant son effort normal variable."
    },
    {
      "k": "table",
      "caption": "Une barre, λP·L²/EI. Source : SA-2026-042.",
      "head": [
        "Cas",
        "Exact",
        "Avant",
        "Maintenant"
      ],
      "rows": [
        [
          "Console, compression croissant de 0 à l’appui jusqu’à P à l’extrémité",
          "3,477",
          "4,972 (+43 %)",
          "3,542 (+1,9 %)"
        ],
        [
          "Console, charge axiale ponctuelle à mi-portée : aucun effort normal de l’appui jusqu’au milieu, compression P de là jusqu’à l’extrémité",
          "2,961",
          "4,972 (+68 %)",
          "3,056 (+3,2 %)"
        ],
        [
          "Colonne pesante d’Euler, compression maximale à l’appui",
          "7,837",
          "4,972 (−37 %)",
          "7,889 (+0,7 %)"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Les quelques pour cent restants sont l’erreur de discrétisation ordinaire d’un élément par barre, et ils diminuent quand la barre est subdivisée. Le P-Delta utilise toujours l’effort normal moyen, et le flambement 3D avec des charges le long des barres garde son avertissement jusqu’à sa propre correction."
    },
    {
      "k": "p",
      "t": "Analyse corotationnelle 3D (#1301, version 24). Les rotations aux extrémités des barres étaient soustraites comme des vecteurs de rotation, ce qui n’est exact que lorsque toutes les rotations partagent un même axe. Le coude à 45° de Bathe–Bolourchi s’écartait de 1,3 % de sa solution publiée, et raffiner le maillage l’éloignait des références au lieu de l’en rapprocher. Les rotations sont maintenant composées comme des matrices de rotation : le même coude est à moins de 0,4 % de deux solutions publiées indépendantes et converge entre elles. Une barre dont les extrémités tournent de plus de 0,9π l’une par rapport à l’autre est refusée, car le résultat ne peut pas dire de quel tour complet il s’agit."
    },
    {
      "k": "p",
      "t": "Un mécanisme caché en 2D (#1298, version 22). Une liaison rigide ou un diaphragme allant d’un nœud dont toutes les barres sont articulées jusqu’à l’extrémité d’une barre de treillis est un mécanisme, mais le solveur le retenait avec un minuscule ressort artificiel et renvoyait des déplacements de centaines de kilomètres, que le certificat certifiait ensuite. Un tel modèle est maintenant refusé. La correction n’a proposé aucun avis de sécurité pour celui-ci : dans les cas trouvés, les déplacements étaient absurdes, de l’ordre de 10⁵ m, et s’accompagnaient de l’avertissement de l’application d’un mécanisme probable. C’est un jugement sur ces cas, pas une preuve qu’aucun résultat concerné n’avait l’air plausible. Ce qui était faux, c’était l’affirmation du certificat, et l’entrée de version en informe les projets qu’il concerne. Un cas similaire passant par un connecteur au lieu d’une liaison rigide a été trouvé ensuite (#1414) ; sa correction (#1415) est en revue et sera intégrée avec la 0.5.0."
    },
    {
      "k": "p",
      "t": "Découpe d’un modèle 3D en 2D (#1295). La découpe utilisait pour chaque barre l’inertie selon l’axe fort de sa section, si bien que les poteaux d’une découpe Y–Z, les poutres d’une découpe X–Y et les barres tournées de 90° fléchissaient autour du mauvais axe : un portique en IPN 300 dans le plan Y–Z se déplaçait latéralement de 0,96 mm en 2D contre 13,0 mm en 3D. Chaque barre fléchit maintenant en 2D autour de l’axe autour duquel elle fléchit en 3D, et les découpes qu’un modèle plan ne peut pas représenter sont refusées. Cette correction n’a pas de version de résultats, et c’est délibéré : un modèle 2D enregistré se calcule exactement comme avant, car ce qui était faux, c’était le modèle produit par la découpe. Le message de revérification ne peut pas atteindre ces fichiers, c’est donc l’avis de sécurité (SA-2026-035) qui sert de canal : redécoupez le modèle depuis la 3D, ou calculez-le en 3D."
    },
    {
      "k": "h",
      "t": "Après la correction : les avis de sécurité"
    },
    {
      "k": "p",
      "t": "Un défaut qui a pu produire un résultat faux ou allant dans le sens de l’insécurité dans une version publiée fait l’objet d’un avis de sécurité : ce qui n’allait pas, quels modèles il concerne, comment les reconnaître, ce qu’il faut revérifier dans les résultats déjà remis, et le cas qui le reproduit. Les avis des corrections de cette semaine sont rédigés à l’état de brouillon dans le dépôt et sont publiés avec la version 0.5.0, comme SA-2026-001 à 024 l’ont été avec 0.3.0 et 0.4.0."
    },
    {
      "k": "table",
      "caption": "Avis de sécurité rédigés pour les corrections fusionnées les 4 et 5 novembre 2026.",
      "head": [
        "Avis",
        "Ce qui n’allait pas",
        "Gravité"
      ],
      "rows": [
        [
          "SA-2026-033",
          "Le générateur de charges omettait les charges surfaciques d’un plancher lorsqu’une barre basse se trouvait au-dessus d’une partie de celui-ci",
          "Élevée"
        ],
        [
          "SA-2026-034",
          "La vérification d’équilibre concordait pour des cas dont la vérification laissait des charges de côté",
          "Moyenne"
        ],
        [
          "SA-2026-035",
          "La découpe 3D vers 2D faisait fléchir des barres autour du mauvais axe de section",
          "Élevée"
        ],
        [
          "SA-2026-036",
          "La découpe 3D vers 2D sur Y–Z ou X–Y lisait les liaisons comme si le portique était dans X–Z",
          "Élevée"
        ],
        [
          "SA-2026-037",
          "L’analyse corotationnelle 3D soustrayait des vecteurs de rotation",
          "Moyenne"
        ],
        [
          "SA-2026-040",
          "Les vérifications ACI 318 et EN 1992 validaient des barres en béton sans vérifier leur torsion",
          "Élevée"
        ],
        [
          "SA-2026-041",
          "La vérification des poteaux en béton armé n’associait le moment maximal qu’à la compression maximale",
          "Élevée"
        ],
        [
          "SA-2026-042",
          "Le flambement 2D surestimait le facteur des barres dont la compression croît le long de la barre",
          "Élevée"
        ]
      ]
    },
    {
      "k": "img",
      "base": "blog/results-changelog",
      "w": 1600,
      "h": 1000,
      "alt": "La page du journal des modifications de Stabileo sur le site web : en premier l’entrée la plus récente, du 6 novembre, sur des résultats erronés corrigés dans les vérifications de dimensionnement et la dynamique, qui commence par ses changements du moteur, et à gauche les filtres par domaine.",
      "caption": "La page du journal des modifications, le plus récent d’abord, qui s’ouvre sur les corrections de cette semaine qui changent des résultats."
    },
    {
      "k": "h",
      "t": "Ce que cela ne fait pas"
    },
    {
      "k": "ul",
      "items": [
        "Le message ne connaît que les changements enregistrés. Un défaut pas encore trouvé n’est dans aucun registre ; c’est à cela que sert la vérification derrière le solveur, et c’est ce que couvre le confinement une fois que quelque chose est trouvé.",
        "Il lit les caractéristiques du modèle dans le fichier enregistré et, quand il ne peut pas les déterminer, il compte la caractéristique comme présente : un message de trop vaut mieux qu’un changement caché au modèle qu’il concerne.",
        "Il ne peut pas suivre un chiffre une fois qu’il a quitté l’application, dans un plan, un tableur ou un rapport déjà remis. C’est à cela que sert l’avis de sécurité.",
        "Confiné, refusé ou corrigé, le résultat reste à vérifier par l’ingénieur avant d’être signé."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Chaque avis de sécurité publié, avec ce qu’il faut revérifier pour chacun :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/PROVENANCE.md",
      "label": "Message de revérification, provenance et reproductibilité",
      "t": "Comment fonctionnent en détail les versions de résultats, les tampons et le message :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index des avis de sécurité",
      "t": "Les avis de sécurité, y compris les brouillons pour la 0.5.0 :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/issues/447",
      "label": "Issue #447 : confiner d’abord, corriger ensuite",
      "t": "La politique de confinement et son avancement :"
    }
  ]
};

export default body;
