import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.5.0 : 23 avis de plus ; avertissement ou refus pour tout défaut de résultat ouvert",
  "excerpt": "Ce qui a changé depuis la 0.4.0 : vingt-trois défauts pouvant donner un résultat erroné ou non conservatif, documentés dans des avis et tous corrigés sauf un ; un avertissement ou un refus pour chaque défaut encore ouvert ; et le cours pas à pas dans Basic.",
  "blocks": [
    {
      "k": "p",
      "t": "Depuis la 0.4.0, nous avons continué à vérifier Stabileo de plusieurs façons à la fois : le solveur face à des solutions publiées et à d’autres logiciels, les vérifications de dimensionnement face à des exemples résolus, la même structure renumérotée, mise à l’échelle et déplacée, et les fichiers enregistrés par les versions précédentes. Nous avons ainsi trouvé vingt-trois autres défauts pouvant donner un résultat erroné ou non conservatif. Chacun fait l’objet d’un avis qui précise ce qui était faux, qui est concerné et ce qu’il faut revérifier. Vingt-deux sont corrigés ; le calcul de ruine plastique 2D (SA-2026-044) reste refusé tant que #758 n’est pas corrigé."
    },
    {
      "k": "note",
      "t": "stabileo.com publie chaque modification dès son intégration : la plupart de ces corrections sont donc déjà en ligne, chacune depuis le jour de son intégration. Les projets enregistrés avant une modification qui les concerne demandent une revérification à l’ouverture, dans la langue du lecteur. Deux corrections ne peuvent pas le faire : un modèle 2D découpé dans un modèle 3D avant #1295 s’ouvre sans notification, car c’est le modèle qui était faux (SA-2026-035). Refaites la coupe depuis le modèle 3D, ou calculez-le en 3D. Il en va de même pour une section rectangulaire ou tubulaire importée depuis Excel ou IFC avant #1310 (SA-2026-039) : importez-la de nouveau."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic ouvrant un portique plan des exemples, enregistré comme calculé avec la version de résultats 15. Une boîte de dialogue intitulée « Les résultats ont changé depuis le dernier calcul de ce projet » liste les modifications qui le concernent, notamment la correction du flambement 2D pour les barres à effort normal variable et la valeur déterminante lue à l’extrême réel, chacune avec son explication. Elle demande de cocher « J’ai lu ces modifications » avant de continuer ou de relancer l’analyse.",
      "caption": "Un projet enregistré avant une modification qui le concerne demande une revérification à l’ouverture et énumère chaque modification."
    },
    {
      "k": "h",
      "t": "Recalculez vos projets"
    },
    {
      "k": "p",
      "t": "Voici les cas qui modifient le plus un résultat de dimensionnement. Chaque avis contient le cas résolu et indique quoi faire des résultats déjà livrés."
    },
    {
      "k": "table",
      "caption": "Quelques corrections de la 0.5.0, telles que documentées dans chaque avis, avec la version de résultats qui les a introduites ; SA-2026-035 n’en a pas, son avis est donc la seule notification.",
      "head": [
        "Avis",
        "Version de résultats",
        "Ce qui était faux",
        "Gravité"
      ],
      "rows": [
        [
          "SA-2026-029",
          "7",
          "Les vérifications de dimensionnement 3D lisaient le moment ou l’effort tranchant latéral : un poteau CIRSOC 201 fléchi autour de Mz était vérifié sur sa hauteur de section, avec 36 % d’armatures en moins que nécessaire dans un exemple",
          "Critique"
        ],
        [
          "SA-2026-028",
          "8",
          "La flexion selon EN 1992-1-1 supposait que les armatures tendues atteignaient leur limite d’élasticité : MRd surestimé de jusqu’à 22 %",
          "Élevée"
        ],
        [
          "SA-2026-030",
          "12",
          "Compression selon CIRSOC 301 : une section avec Qa ≤ 0 recevait une résistance supérieure à sa charge d’écrasement et satisfaisait la vérification",
          "Élevée"
        ],
        [
          "SA-2026-041",
          "19",
          "La vérification des poteaux en béton armé associait le moment maximal à la seule compression maximale : jusqu’à 15 % du côté non conservatif dans un exemple",
          "Élevée"
        ],
        [
          "SA-2026-042",
          "23",
          "Le flambement 2D surestimait le facteur des barres dont la compression augmente le long de la barre : de +43 % à +68 % pour une barre",
          "Élevée"
        ],
        [
          "SA-2026-038",
          "35",
          "Le flambement 3D utilisait l’effort normal moyen de chaque barre : +43 % sur le facteur d’une barre portant une charge répartie le long de celle-ci",
          "Élevée"
        ],
        [
          "SA-2026-043",
          "32",
          "L’analyse harmonique perdait la correction des modes omis lorsqu’un mode était bien plus souple que les autres : résultat erroné d’un facteur 79 à 2.3 Hz dans un exemple",
          "Élevée"
        ],
        [
          "SA-2026-035",
          "—",
          "Une coupe de 3D vers 2D faisait fléchir les barres autour du mauvais axe de section : un portique Y–Z était 13.5 fois trop rigide",
          "Élevée"
        ],
        [
          "SA-2026-033",
          "20",
          "Le générateur de charges omettait toute la charge surfacique d’un étage lorsqu’une barre basse surplombait une partie de celui-ci",
          "Élevée"
        ],
        [
          "SA-2026-027",
          "11",
          "L’enveloppe des coques conservait la combinaison donnant le plus grand Von Mises, et non l’extrême de chaque composante : mx sous-estimé de 14 % dans un exemple",
          "Élevée"
        ],
        [
          "SA-2026-047",
          "49",
          "Dans un modèle avec des coques, un cas de charge imposant un déplacement d’appui perdait toutes ses contraintes de coque ; les combinaisons et enveloppes ne sommaient donc que les contraintes de coque des autres cas : les contraintes de coque combinées pouvaient être non conservatives, sans avertissement. Dans les versions 0.2.0, 0.3.0 et 0.4.0 (#1676)",
          "Élevée"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Tout projet avec des coques calculé avant #1676 mentionne SA-2026-047 à l’ouverture (#1691) : comme affecté si le modèle contient un cas de charge imposant un déplacement d’appui et des combinaisons de charges, et comme potentiellement affecté sinon, car un projet enregistré ne peut pas prouver qu’il n’a jamais contenu un tel cas de charge. Le recalcul supprime la notification ; comparez ensuite les contraintes de coque des combinaisons qui incluent ce cas."
    },
    {
      "k": "p",
      "t": "Les autres avis concernent les barres en béton soumises à la torsion selon ACI 318 et EN 1992 (SA-2026-040), les contraintes cinématiques d’un modèle découpé en 2D depuis un plan Y–Z ou X–Y (SA-2026-036), l’analyse corotationnelle 3D avec de grandes rotations (SA-2026-037), une charge à t = 0 sur un nœud sans masse en analyse temporelle (SA-2026-031), le mode nul d’un mécanisme en analyse modale (SA-2026-032), la vérification d’équilibre du rapport après l’analyse (SA-2026-034), la ruine plastique 2D, qui reste refusée tant que #758 n’est pas corrigé (SA-2026-044), la ruine plastique 3D avec une barre sans moment plastique exploitable, désormais refusée (SA-2026-045), l’analyse harmonique qui choisissait entre superposition modale et résolution directe pour chaque charge, ce qui rompait la superposition (SA-2026-046), les sections rectangulaires et tubulaires importées depuis Excel ou IFC avec Iy et Iz intervertis (SA-2026-039) et, pour les appels directs au moteur, le cisaillement de l’acier sans aire de cisaillement selon AISC 360 et EN 1993 (SA-2026-025 et 026)."
    },
    {
      "k": "h",
      "t": "Autres modifications qui changent les résultats"
    },
    {
      "k": "p",
      "t": "D’autres modifications changent aussi les valeurs : chacune figure donc dans la notification de revérification. La plupart n’ont pas d’avis propre ; le mode nul en analyse modale correspond à SA-2026-032 ci-dessus :"
    },
    {
      "k": "ul",
      "items": [
        "La valeur déterminante d’une barre et l’enveloppe 2D lisent l’extrême réel du diagramme des efforts internes, et non le point le plus proche parmi 21 stations : elles peuvent augmenter, de 0.23 % sous une charge triangulaire et de 1.05 % sous une courte charge partielle dans les cas documentés, et ne diminuent jamais.",
        "Les mécanismes sont refusés au lieu d’être calculés : derrière une liaison rigide ou un diaphragme en 2D, derrière un connecteur en 2D (#1415), et en analyse modale, qui supprimait auparavant le mode nul et présentait les autres comme un ensemble complet, y compris pour un mécanisme glissant sur des appuis inclinés.",
        "L’analyse 3D non linéaire en matériau calcule des ossatures mêlant des barres avec et sans constante de gauchissement, ainsi que des nœuds reliés uniquement à des barres de treillis, au lieu de planter ou de les refuser ; les modèles déjà calculables donnent les mêmes valeurs.",
        "Les valeurs propres multiples conservent leur multiplicité, et les résultats statiques et modaux vérifient leur propre équilibre et leur orthogonalité avant d’être affichés.",
        "Dans Basic, P-Δ et la charge critique subdivisent chaque barre en éléments, le calcul de ruine plastique referme les rotules qui se déchargent, et la ligne d’influence du moment fléchissant prend comme positif le moment qui tend la fibre inférieure, comme tous les autres moments dans Basic.",
        "Une vérification de dimensionnement impossible à évaluer est refusée au lieu d’être déclarée satisfaite, et une rotation nodale souple mais réelle n’est plus bloquée lorsque le modèle possède une partie beaucoup plus rigide.",
        "L’analyse linéaire avertit lorsqu’une rotation dépasse 0.1 rad, y compris à l’intérieur d’une barre (en tenant compte de la pente ajoutée à son axe par la déformation de cisaillement et de la courbure due à un gradient thermique à une extrémité libérée, #1569), ainsi que sur les déplacements propres à une combinaison, et lorsque la compression peut amplifier ses moments de plus de 10 % ; tant que ce second avertissement est affiché, les vérifications CIRSOC 301 sont suspendues. En cas d’avertissement de rotation, lancez une analyse géométriquement non linéaire à grandes rotations ; en cas d’avertissement d’amplification, une analyse P-Δ ou une autre analyse du second ordre."
      ]
    },
    {
      "k": "h",
      "t": "Un avertissement ou un refus, en attendant chaque correction"
    },
    {
      "k": "p",
      "t": "Chaque défaut encore ouvert pouvant donner un résultat erroné fait désormais l’objet d’un avertissement ou d’un refus à chaque endroit où il peut atteindre l’ingénieur (#807). Un avertissement conserve le résultat et nomme le défaut à côté ; un refus retient le résultat et en donne la raison. Un registre du dépôt énumère chaque défaut de sécurité encore ouvert, son avertissement ou son refus, la condition de déclenchement et le test qui prouve ce déclenchement ; un test maintient ce registre en accord avec le moteur."
    },
    {
      "k": "ul",
      "items": [
        "Refusés : le facteur de ruine plastique 2D, qui peut varier d’un facteur allant jusqu’à 4.6 selon la numérotation, le sens des barres et les unités (#758) ; un facteur de flambement hors des bornes de son propre certificat (#741) ; les coques MITC4 sur des maillages distordus sous flexion significative dans leur plan (#798) ; et les coques MITC4 et MITC9 sur une géométrie gauchie (#1057).",
        "Avec avertissement : entre autres, l’analyse temporelle, la superposition modale 3D, les modèles quasi singuliers, le contact, l’analyse non linéaire en matériau et les connecteurs de rigidités différentes.",
        "En dehors des résultats refusés, ce dispositif de confinement des défauts ouverts change une seule valeur : la réaction 2D d’un appui avec tassement imposé qui comporte aussi un ressort dans la direction du tassement inclut désormais la force de ce ressort. Toutes les autres valeurs parmi les 145 515 du corpus de résultats sont identiques."
      ]
    },
    {
      "k": "note",
      "t": "Deux refus retirent des résultats que certains lecteurs utilisent. Les facteurs de ruine plastique des portiques plans sont retenus tant que #758 n’est pas corrigé. Certains maillages de coques distordus dont les résultats s’écartaient de moins de 2 % de leurs références sont également retenus : nous avons choisi un refus de trop plutôt qu’une rigidité fausse affichée sans avertissement, et la feuille de route prévoit d’en restreindre le périmètre."
    },
    {
      "k": "h",
      "t": "Également dans la 0.5.0"
    },
    {
      "k": "ul",
      "items": [
        "Basic enseigne l’analyse des structures pas à pas : statique, méthodes des forces et des déplacements, lignes d’influence, second ordre et flambement, analyse plastique et dynamique, chaque sujet étant expliqué pas à pas dans l’application. Son module de ruine plastique reste retenu avec le reste du calcul de ruine plastique 2D tant que #758 n’est pas corrigé.",
        "L’allemand, le français et le turc ne sont pas proposés dans la 0.5.0 : ils reviendront une fois vérifiés par un locuteur natif ; d’ici là, leurs pages s’ouvrent en anglais.",
        "L’assistant IA fonctionne avec votre propre clé Anthropic ou OpenAI, conservée uniquement dans votre navigateur, et /examples propose des modèles interactifs que le moteur recalcule lorsque vous déplacez un curseur.",
        "PRO : étages maîtres et étages similaires, résultats de plaques par unité de largeur avec moments et directions principaux, rapport après l’analyse, visualiseur en lecture seule avec « Dupliquer et modifier », et fichier IFC lié dessiné comme référence 3D.",
        "Les fichiers enregistrés par les versions 0.2.0, 0.3.0 et 0.4.0 s’ouvrent, sont migrés et donnent les mêmes résultats à chaque modification, sauf lorsqu’une modification de résultats enregistrée s’applique ; un fichier enregistré par une version plus récente est refusé avec un message qui le précise.",
        "La même structure mise à l’échelle, renumérotée, inversée ou déplacée doit donner la même réponse : cela est vérifié sur 17 types d’analyse à chaque modification et sur 8 192 modèles générés chaque nuit.",
        "Également corrigés : l’interaction sol-structure fournit ses réactions d’appui, qu’elle renvoyait auparavant vides (#1675) ; les coques de deux familles ayant la même numérotation sont refusées dans les combinaisons et enveloppes, au lieu de combiner l’une à la place de l’autre (#1669) ; et les contraintes de von Mises et principales des coques ne subissent plus de dépassement de capacité ni de sous-dépassement aux ordres de grandeur extrêmes, avec des résultats identiques bit à bit dans la plage normale (#1688).",
        "Un projet calculé avec une version présentant un défaut de résultat connu dans une fonction qu’il utilise mentionne l’avis jusqu’à son recalcul (#1657), et les projets enregistrent chaque analyse effectuée : un avis concernant une analyse demeure donc tant que cette analyse n’est pas relancée (#1663).",
        "Plus rapide : la sauvegarde automatique toutes les 30 s ignore un projet inchangé (#1664), un grand espace de travail 3D se rouvre en laissant moins de mémoire à récupérer (#1668), et les résultats 3D publiés sont figés, de sorte que la vérification de refus pour défauts connus s’exécute une fois par résultat (#1689).",
        "Davantage de vérifications du moteur : réciprocité avec les moments, combinaisons pondérées et superposition de chaque composante de contrainte des coques (#1665), et un enregistrement de résultat par nœud, appui, élément et coque pour chaque analyse (#1674), ce qui a révélé les défauts d’interaction sol-structure et de combinaisons de coques mentionnés ci-dessus.",
        "Stabileo Research et Stabileo Tools : reproductions exécutables d’articles et de benchmarks publiés, révisées après une passe de trois relecteurs, et calculateurs gratuits utilisant le même moteur."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Le fonctionnement des avis et les vingt-quatre premiers :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index des avis de sécurité",
      "t": "Chaque avis, avec sa gravité, son issue et sa correction :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Journal des modifications",
      "t": "L’historique technique complet :"
    }
  ]
};

export default body;
