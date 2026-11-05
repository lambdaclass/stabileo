import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0 : seize avis de plus, et un avertissement ou un refus pour chaque défaut ouvert pouvant donner un résultat erroné",
  "excerpt": "Ce qui a changé depuis la 0.4.0 : seize défauts pouvant donner un résultat erroné ou non conservatif, corrigés et documentés sous forme d’avis ; un avertissement ou un refus pour chaque défaut encore ouvert ; le cours pas à pas dans Basic ; et l’application en six langues.",
  "blocks": [
    {
      "k": "p",
      "t": "Depuis la 0.4.0, nous avons continué à vérifier Stabileo sous plusieurs angles à la fois : le solveur par rapport à des solutions publiées et à d’autres logiciels, les vérifications de dimensionnement par rapport à des exemples traités, la même structure renumérotée, mise à l’échelle et déplacée, et les fichiers enregistrés par les versions précédentes. Cela a mis au jour seize défauts supplémentaires pouvant donner un résultat erroné ou non conservatif. Ils sont corrigés, et chacun fait l’objet d’un avis qui indique ce qui n’allait pas, qui est concerné et ce qu’il faut revérifier."
    },
    {
      "k": "note",
      "t": "stabileo.com publie chaque modification dès qu’elle est intégrée : la plupart de ces corrections sont donc déjà en ligne, chacune depuis le jour de son intégration. Les projets enregistrés avant une modification qui les concerne demandent une revérification à l’ouverture, dans la langue du lecteur."
    },
    {
      "k": "h",
      "t": "Relancez vos projets"
    },
    {
      "k": "p",
      "t": "Voici les cas qui modifient le plus un résultat de dimensionnement. Chaque avis contient le cas traité et ce qu’il faut faire des résultats déjà livrés."
    },
    {"k": "img", "base": "blog/release-050-recheck-de", "w": 1600, "h": 1000, "alt": "Stabileo Basic en allemand, à l’ouverture d’un portique plan des exemples calculé pour la dernière fois avec la version de résultats 15. La demande de revérification liste les changements qui le concernent, chacun avec son titre et son explication en allemand, et demande de cocher leur lecture avant de continuer ou de relancer l’analyse.", "caption": "La demande de revérification explique désormais chaque changement dans les six langues : ici, en allemand."},
    {
      "k": "table",
      "caption": "Quelques corrections de la 0.5.0, telles que chaque avis les documente.",
      "head": [
        "Avis",
        "Ce qui était faux",
        "Gravité"
      ],
      "rows": [
        [
          "SA-2026-029",
          "Les vérifications de dimensionnement 3D lisaient le moment ou l’effort tranchant latéral : un poteau CIRSOC 201 fléchi autour de Mz était vérifié sur sa hauteur, avec 36 % d’acier en moins que nécessaire dans un exemple",
          "Critique"
        ],
        [
          "SA-2026-028",
          "La flexion selon l’EN 1992-1-1 supposait que les armatures tendues plastifient : MRd jusqu’à 22 % trop élevé",
          "Élevée"
        ],
        [
          "SA-2026-030",
          "Compression CIRSOC 301 : une section avec Qa ≤ 0 recevait une résistance supérieure à sa charge d’écrasement, et était validée",
          "Élevée"
        ],
        [
          "SA-2026-041",
          "La vérification des poteaux en béton armé associait le plus grand moment uniquement à la plus grande compression : jusqu’à 15 % non conservatif dans un exemple",
          "Élevée"
        ],
        [
          "SA-2026-042",
          "Le flambement 2D surestimait le facteur des barres dont la compression croît le long de la barre : de +43 % à +68 % pour une barre",
          "Élevée"
        ],
        [
          "SA-2026-035",
          "Une coupe de 3D en 2D faisait fléchir les barres autour du mauvais axe de la section : un portique Y–Z 13,5 fois trop rigide",
          "Élevée"
        ],
        [
          "SA-2026-033",
          "Le générateur de charges omettait toute la charge surfacique d’un étage lorsqu’une barre basse se trouvait au-dessus d’une partie de celui-ci",
          "Élevée"
        ],
        [
          "SA-2026-027",
          "L’enveloppe des coques conservait la combinaison ayant le plus grand Von Mises, et non l’extrême de chaque composante : mx 14 % trop faible dans un exemple",
          "Élevée"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Les autres avis portent sur les barres en béton soumises à la torsion selon l’ACI 318 et l’EN 1992 (SA-2026-040), les liaisons cinématiques d’un modèle coupé en 2D depuis un plan Y–Z ou X–Y (SA-2026-036), l’analyse corotationnelle 3D en grandes rotations (SA-2026-037), une charge à t = 0 sur un nœud sans masse en analyse temporelle (SA-2026-031), le mode nul d’un mécanisme en analyse modale (SA-2026-032), le contrôle d’équilibre de la note de calcul après l’analyse (SA-2026-034) et, pour ceux qui appellent directement le moteur, l’effort tranchant de l’acier sans aire de cisaillement selon l’AISC 360 et l’EN 1993 (SA-2026-025 et 026)."
    },
    {
      "k": "h",
      "t": "Autres modifications qui font évoluer les résultats"
    },
    {
      "k": "p",
      "t": "Ce ne sont pas des défauts faisant l’objet d’un avis, mais elles changent des chiffres ; chacune figure donc dans la demande de revérification :"
    },
    {
      "k": "ul",
      "items": [
        "La valeur déterminante d’une barre et l’enveloppe 2D lisent le vrai pic du diagramme, et non le plus proche de 21 points de calcul : elles peuvent augmenter, de 0,23 % sous une charge triangulaire et de 1,05 % sous une charge partielle courte dans les cas documentés, et ne diminuent jamais.",
        "Les mécanismes sont refusés au lieu d’être calculés : derrière une liaison rigide ou un diaphragme en 2D, derrière un connecteur en 2D (#1415), et en analyse modale, qui écartait auparavant le mode nul et renvoyait les autres comme complets.",
        "Les valeurs propres multiples conservent leur multiplicité, et les résultats statiques et modaux vérifient leur propre équilibre et leur orthogonalité avant d’être affichés.",
        "Dans Basic, le P-Δ et la charge critique découpent chaque barre en éléments, l’effondrement plastique referme les rotules qui se déchargent, et la ligne d’influence du moment fléchissant compte comme positif le moment qui tend la fibre inférieure, comme tout autre moment dans Basic."
      ]
    },
    {
      "k": "h",
      "t": "Avertis ou refusés, en attendant chaque correction"
    },
    {
      "k": "p",
      "t": "Chaque défaut ouvert pouvant donner un résultat erroné fait désormais l’objet d’un avertissement ou d’un refus à chaque endroit où il peut atteindre l’ingénieur (#807). Un avertissement conserve le résultat et nomme le défaut à côté ; un refus retient le résultat et en indique la raison. Un registre dans le dépôt liste chaque défaut de sécurité ouvert avec son avertissement ou son refus, la condition qui le déclenche et le test qui prouve qu’il se déclenche, et un test le maintient en accord avec le moteur."
    },
    {
      "k": "ul",
      "items": [
        "Refusés : le facteur d’effondrement plastique 2D, qui peut varier jusqu’à 4,6 fois selon la numérotation, le sens des barres et les unités (#758) ; un facteur de flambement hors des bornes de son propre certificat (#741) ; les coques MITC4 sur des maillages distordus soumis à une flexion significative dans leur plan (#798) ; et les coques MITC4 et MITC9 sur une géométrie gauche (#1057).",
        "Avertis : entre autres, l’analyse temporelle, la superposition modale 3D, les modèles quasi singuliers, le flambement 3D avec des charges le long des barres, le contact, l’analyse non linéaire matérielle et les connecteurs à rigidités inégales.",
        "En dehors de ce qu’il refuse, ce confinement des défauts ouverts ne change qu’un seul chiffre : la réaction 2D d’un appui avec tassement imposé qui porte aussi un ressort dans la direction du tassement inclut désormais la force de ce ressort. Toutes les autres valeurs, sur les 145 515 du corpus de résultats, sont identiques."
      ]
    },
    {
      "k": "note",
      "t": "Deux refus retirent des résultats que certains lecteurs utilisent. Les facteurs d’effondrement plastique des portiques plans sont retenus jusqu’à la correction de #758. Certains maillages de coques distordus dont les résultats étaient à moins de 2 % de leurs références sont aussi retenus : nous avons préféré un refus de trop à une rigidité fausse affichée sans avertissement, et le restreindre figure dans la feuille de route."
    },
    {
      "k": "h",
      "t": "Aussi dans la 0.5.0"
    },
    {
      "k": "ul",
      "items": [
        "Basic enseigne le calcul des structures pas à pas : statique, méthodes des forces et des déplacements, lignes d’influence, second ordre et flambement, analyse plastique et dynamique, chacun expliqué pas à pas dans l’application.",
        "L’application et le site public en allemand, en français et en turc, aux côtés de l’espagnol, de l’anglais et du portugais. La demande de revérification explique chaque changement dans les six langues.",
        "PRO : étages maîtres et étages similaires, résultats de plaques par unité de largeur avec moments et directions principaux, la note de calcul après l’analyse, une visionneuse en lecture seule avec « Dupliquer et modifier », et un IFC lié affiché comme référence 3D.",
        "Les fichiers enregistrés par la 0.2.0, la 0.3.0 et la 0.4.0 s’ouvrent, sont migrés et donnent les mêmes résultats à chaque modification, sauf lorsqu’un changement de résultats enregistré s’applique ; un fichier enregistré par une version plus récente est refusé avec un message qui l’indique.",
        "La même structure mise à l’échelle, renumérotée, inversée ou déplacée doit donner la même réponse ; c’est vérifié sur 17 types d’analyse à chaque modification et sur 8 192 modèles générés chaque nuit.",
        "Stabileo Research et Stabileo Tools : des reproductions exécutables d’articles et de benchmarks publiés, révisées après une relecture par trois relecteurs, et des calculateurs gratuits qui tournent sur le même moteur."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "La liste complète des avis, avec ce qu’il faut revérifier pour chacun :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index des avis de sécurité",
      "t": "Chaque avis, avec sa gravité, son ticket et sa correction :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Journal des modifications",
      "t": "L’historique technique complet :"
    }
  ]
};

export default body;
