import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.1: vérifications des éléments et charges de neige corrigées",
  "excerpt": "Relancez les vérifications béton et acier concernées. Pour la neige générée, régénérez d’abord les charges, puis recalculez les cas, combinaisons, enveloppes et vérifications de dimensionnement concernés.",
  "blocks": [
    {
      "k": "p",
      "t": "Relancez les vérifications béton et acier concernées. Pour la neige générée, régénérez d’abord les charges, puis recalculez les cas, combinaisons, enveloppes et vérifications de dimensionnement concernés. Résoudre à nouveau avec les anciennes charges enregistrées ne les corrige pas. Comparez sollicitations, résistances, armatures, taux d’utilisation, combinaisons déterminantes et certificats aux résultats déjà utilisés. Réexaminez les calculs livrés et les dimensionnements fondés sur ceux-ci. Un refus, une grandeur indisponible ou des armatures non vérifiées ne valent ni validation ni sollicitation nulle."
    },
    {
      "k": "note",
      "t": "Les cinq avis de gravité Élevée ci-dessous sont corrigés dans 0.6.1. Suivez chaque avis pour identifier les données concernées et les actions requises, même si les résultats précédents étaient validés ou certifiés."
    },
    {
      "k": "h",
      "t": "Avis de sécurité"
    },
    {
      "k": "table",
      "caption": "Avis de sécurité",
      "head": [
        "Avis",
        "Gravité",
        "Changement et action requise"
      ],
      "rows": [
        [
          "SA-2026-064",
          "Élevée",
          "Le Cb de l’acier pouvait provenir d’une autre combinaison ou d’un court tronçon dont les maintiens étaient inconnus (#1316, #2088). Relancez les vérifications CIRSOC 301 et examinez résistance en flexion, taux d’interaction et combinaisons déterminantes."
        ],
        [
          "SA-2026-065",
          "Élevée",
          "L’accumulation à un décrochement pouvait être omise sur une toiture réceptrice inclinée (#2082). Régénérez les charges de neige CIRSOC 104 et recalculez les analyses et vérifications concernées."
        ],
        [
          "SA-2026-066",
          "Élevée",
          "Le Cm du béton pouvait être réduit d’après les moments d’extrémité malgré une charge transversale entre appuis (#2089). Revérifiez poteaux et voiles élancés, moments amplifiés et armatures."
        ],
        [
          "SA-2026-067",
          "Élevée",
          "Une rotation en plan pouvait modifier les charges de neige générées (#2093). Régénérez les charges avec la géométrie réelle puis relancez analyses et vérifications ; revenir à l’orientation initiale ne répare pas les résultats."
        ],
        [
          "SA-2026-068",
          "Élevée",
          "La torsion pouvait être validée avec des étriers dimensionnés insuffisants (#2141). Relancez les vérifications béton et examinez résistance transversale réelle, espacement des étriers et échecs en torsion. Des armatures longitudinales non vérifiées ne constituent pas une cage validée."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index des avis de sécurité",
      "t": "Avis de sécurité:"
    },
    {
      "k": "h",
      "t": "Tous les avis de changement de résultats depuis v0.6.0"
    },
    {
      "k": "p",
      "t": "Le registre de v0.6.0 se termine à la version de résultats 78 ; cette version atteint 80. Le tableau contient les 24 nouveaux avis. Plusieurs partagent une version. Relancez chaque vérification applicable ; pour la neige, régénérez les charges avant de résoudre."
    },
    {
      "k": "table",
      "caption": "Tous les avis de changement de résultats depuis v0.6.0",
      "head": [
        "Version de résultats",
        "Résultat modifié"
      ],
      "rows": [
        [
          "79",
          "Les congères suivent les bords continus du toit"
        ],
        [
          "79",
          "La neige conserve les côtés dissymétriques et les tronçons du toit"
        ],
        [
          "79",
          "Le repère de neige suit les tronçons connectés du toit plat"
        ],
        [
          "79",
          "Les charges de neige respectent les positions et limites locales"
        ],
        [
          "79",
          "Les facteurs de neige suivent chaque orientation de toiture"
        ],
        [
          "79",
          "Les cas de neige couvrent chaque orientation de faîtage"
        ],
        [
          "79",
          "La neige suit les toits continus et la géométrie sélectionnée"
        ],
        [
          "79",
          "Les charges de neige conservent leur intensité après rotation en plan"
        ],
        [
          "79",
          "Les accumulations aux décrochements utilisent le plan récepteur"
        ],
        [
          "79",
          "Les charges de neige suivent chaque surface de toiture connectée"
        ],
        [
          "79",
          "Les surfaces tributaires de neige suivent l’intérieur du toit"
        ],
        [
          "80",
          "Les vérifications exigent toutes les combinaisons actives"
        ],
        [
          "80",
          "Les vérifications exigent des données complètes par section"
        ],
        [
          "80",
          "Les vérifications simultanées conservent les efforts déterminants"
        ],
        [
          "80",
          "Le calcul utilise les barres choisies et les charges de la portée"
        ],
        [
          "80",
          "Les interactions utilisent les efforts simultanés par section"
        ],
        [
          "80",
          "Le béton conserve l’élancement secondaire"
        ],
        [
          "80",
          "Les cas concomitants conservent toutes les armatures de torsion requises"
        ],
        [
          "80",
          "Les armatures fixées conservent le contrôle du maximum pratique"
        ],
        [
          "80",
          "Les efforts de calcul respectent le comportement et les portées des semelles"
        ],
        [
          "80",
          "La torsion vérifie tous les étriers fournis"
        ],
        [
          "80",
          "Les poutres conservent leurs axes ; les armatures de torsion doivent être déclarées"
        ],
        [
          "80",
          "Le Cb de l’interaction de l’acier utilise le diagramme de sa propre combinaison"
        ],
        [
          "80",
          "Les stations acier utilisent les longueurs physiques et conservent le cisaillement"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.fr.md",
      "label": "Notes complètes de la version 0.6.1",
      "t": "Tous les avis de changement de résultats depuis v0.6.0:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Un dialogue de réexamen des résultats dans Stabileo Basic, listant les changements qui concernent un projet enregistré auparavant.",
      "caption": "Vos résultats peuvent changer : recalculez les projets concernés"
    },
    {
      "k": "h",
      "t": "Autres changements"
    },
    {
      "k": "p",
      "t": "Les vérifications béton et acier conservent les efforts de la même combinaison et de la même section de calcul. Les données incomplètes de combinaisons ou de sections sont refusées plutôt que remplacées par les efforts aux extrémités. Les états d’armatures requises et fournies restent distincts ; l’absence d’armatures longitudinales fournies pour la torsion est signalée explicitement."
    },
    {
      "k": "h",
      "t": "Limites connues"
    },
    {
      "k": "ul",
      "items": [
        "Des résultats incorrects connus restent ouverts : #2096, #2142, #2143 et #2144. Cette version ne les corrige pas. Consultez leur portée et vérifiez indépendamment les résultats concernés avant utilisation.",
        "SA-2026-056 reste non corrigé : vérifiez indépendamment les sollicitations dynamiques des modèles mixtes barres-coques avec contraintes qui changent sensiblement après renumérotation, rotation ou conversion d’unités. Aucun facteur correctif conservateur n’est établi.",
        "Le calcul de ruine plastique 2D reste refusé en attendant #758, selon SA-2026-044. Une borne inférieure 3D certifiée ne certifie pas l’historique brut des rotules.",
        "L’analyse temporelle ne fournit pas les sollicitations dynamiques totales aux appuis. Utilisez une analyse indépendante incluant inertie, amortissement et charges aux appuis. Les analyses de câbles non prises en charge et les déplacements d’appui imposés non nuls dans les procédures câbles ou temporelles sont explicitement refusés.",
        "Aucun solveur spatial par longueur d’arc ou contrôle de déplacement n’est ajouté. Les avertissements et restrictions existants restent applicables."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Journal des modifications",
      "t": "Journal des modifications:"
    }
  ]
};

export default body;
