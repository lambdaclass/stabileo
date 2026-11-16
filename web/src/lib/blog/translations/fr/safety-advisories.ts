import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Avis de sécurité : quels résultats ont changé et que faire",
  "excerpt": "Les défauts de Stabileo qui pouvaient donner des résultats erronés ou allant dans le sens de l'insécurité : qui ils concernent, comment savoir si un modèle est concerné, que faire en attendant et quand ils ont été corrigés.",
  "blocks": [
    {
      "k": "p",
      "t": "Les résultats de Stabileo servent à dimensionner des structures réelles. Lorsque nous trouvons un défaut qui a pu produire un résultat erroné, et surtout un résultat allant dans le sens de l'insécurité, nous le publions sous forme d'avis de sécurité : ce qui n'allait pas, quels modèles sont concernés, comment les reconnaître, que faire jusqu'à ce que la correction soit en ligne et ce qu'il faut revérifier dans les résultats déjà utilisés."
    },
    {
      "k": "p",
      "t": "Presque tous ces défauts ont été trouvés par notre propre programme de vérification : comparaison avec sept autres logiciels d'éléments finis, exemples résolus publiés, tests d'invariants physiques et relecture de la dérivation de chaque élément. Les publier fait partie de ce travail : un défaut qui n'est pas signalé reste dans les calculs déjà livrés."
    },
    {
      "k": "note",
      "t": "État au 12 novembre 2026 : SA-2026-001 à 020 sont corrigés dans la version 0.3.0, SA-2026-021 à 024 dans la version 0.4.0 et SA-2026-025 à 047 dans la version 0.5.0 (SA-2026-040 contenu : la vérification est marquée comme incomplète), sauf SA-2026-044 : le calcul de ruine plastique 2D reste refusé tant que #758 est ouvert. SA-2026-048 a été corrigé après la version 0.5.0 et est en ligne sur stabileo.com depuis le 8 novembre 2026. SA-2026-049, SA-2026-050, SA-2026-051, SA-2026-052 et SA-2026-053 ont été corrigés après la version 0.5.0 et sont en ligne sur stabileo.com depuis le 9 novembre 2026. Les publier fait partie de notre manière de vérifier les résultats ; ce n'est pas le signe qu'ils sont encore ouverts. Un avis est considéré comme corrigé lorsque la correction est en ligne sur stabileo.com, et non lorsque la modification existe. Tant qu'un avis est ouvert, appliquez sa solution de contournement et vérifiez à la main le résultat concerné avant de signer. SA-2026-054 — Brouillon : correction pas encore fusionnée ni publiée. SA-2026-055 — Brouillon : correction pas encore fusionnée ni publiée. SA-2026-056 — Brouillon : non résolu ; aucun correctif intégré ni déployé. SA-2026-057 — Brouillon : correction pas encore fusionnée ni publiée. SA-2026-059 — Corrigé dans PR #1921, en attente de publication. SA-2026-060 — Brouillon : correction locale en attente de revue et de publication. SA-2026-062 — Brouillon : correction locale en attente de revue et de publication."
    },
    {
      "k": "note",
      "t": "SA-2026-058 — Corrigé dans PR #1922, publication en attente."
    },
    {
      "k": "note",
      "t": "SA-2026-061 — Corrigé dans PR #1952, publication en attente."
    },
    {
      "k": "note",
      "t": "SA-2026-063 — Corrigé dans PR #2009, en attente de publication."
    },
    {"k": "note", "t": "SA-2026-064 — Corrigé dans 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-064-steel-cb-combination.md", "label": "SA-2026-064", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-065 — Corrigé dans 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-065-snow-roof-step.md", "label": "SA-2026-065", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-066 — Corrigé dans 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-066-cirsoc201-transverse-cm.md", "label": "SA-2026-066", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-067 — Corrigé dans 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-067-snow-roof-rotation.md", "label": "SA-2026-067", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-068 — Corrigé dans 0.6.1."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-068-provided-torsion-stirrups.md", "label": "SA-2026-068", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-069 — Brouillon 2026-11-15 ; corrigé dans la PR #2169, fusion et publication en attente."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-069-torsion-secondary-shear.md", "label": "SA-2026-069", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-070 — Corrigé dans PR #2170, publication en attente."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-070-interior-member-couples.md", "label": "SA-2026-070", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-072 — Corrigé dans la PR #2175, publication en attente."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-072-snow-ridge-subdivision.md", "label": "SA-2026-072", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-076 — Corrigé dans la PR #2220, fusion et publication en attente."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-076-wind-enclosure.md", "label": "SA-2026-076", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-077 — Corrigé dans la PR #2220, fusion et publication en attente."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-077-wind-wall-height-transfer.md", "label": "SA-2026-077", "t": "Données concernées et actions requises."},
    {"k": "note", "t": "SA-2026-078 — Corrigé dans la PR #2220, fusion et publication en attente."},
    {"k": "ext", "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-078-wind-roof-pressure-zones.md", "label": "SA-2026-078", "t": "Données concernées et actions requises."},
    {"k": "img", "base": "blog/recheck-stale", "w": 1600, "h": 1000, "alt": "Stabileo PRO avec un portique en béton enregistré avant que les résultats soient versionnés. Un bandeau en bas indique des résultats périmés : le projet a été résolu avec une version antérieure et 19 changements enregistrés le concernent, avec les boutons pour voir ce qui a changé et relancer le calcul.", "caption": "Comment une correction atteint un projet enregistré : tant qu’il n’est pas recalculé, ses résultats restent marqués périmés, et les changements qui le concernent sont à un clic."},
    {
      "k": "h",
      "t": "Résumé"
    },
    {
      "k": "table",
      "caption": "Avis publiés. Gravité : critique lorsque la capacité ou la sollicitation pouvait se trouver loin du côté de l'insécurité sans aucun signe visible.",
      "head": [
        "Avis",
        "Objet",
        "Gravité",
        "État"
      ],
      "rows": [
        [
          "SA-2026-001",
          "Combinaisons et charges générées (CIRSOC 101, 102, 103) allant dans le sens de l'insécurité",
          "Élevée",
          "Corrigé dans la 0.2.0"
        ],
        [
          "SA-2026-002",
          "Les vérifications béton (CIRSOC 201, ACI 318) surestimaient la capacité",
          "Critique",
          "Corrigé dans la 0.2.0"
        ],
        [
          "SA-2026-003",
          "Les vérifications acier, profilés formés à froid et assemblages surestimaient la capacité",
          "Critique",
          "Corrigé dans la 0.2.0"
        ],
        [
          "SA-2026-004",
          "Analyses qui ignoraient une partie du modèle (dynamique, flambement, effondrement plastique)",
          "Critique",
          "Corrigé dans la 0.2.0"
        ],
        [
          "SA-2026-005",
          "Barres inclinées 2D : effort normal sans la composante de la charge parallèle à la barre",
          "Élevée",
          "Corrigé le 2026-10-21"
        ],
        [
          "SA-2026-006",
          "Modèle plan calculé en 3D : moments nodaux et rotations imposées inversés",
          "Élevée",
          "Corrigé le 2026-10-21"
        ],
        [
          "SA-2026-007",
          "Flambement 3D sans les modes de torsion ou de flexion-torsion",
          "Élevée",
          "Corrigé le 2026-10-21"
        ],
        [
          "SA-2026-008",
          "Spectre de réponse : effort tranchant à la base SRSS sous CQC ; participation sans la masse couplée aux appuis",
          "Élevée",
          "Corrigé le 2026-10-21"
        ],
        [
          "SA-2026-009",
          "Coque volumique SHB8 22 % trop rigide en flexion de plaque mince (flèches 18 % trop faibles)",
          "Moyenne (plus élevée dans les structures hyperstatiques)",
          "Corrigé le 2026-10-19"
        ],
        [
          "SA-2026-010",
          "Le certificat spectral acceptait des résultats non finis",
          "Moyenne",
          "Corrigé le 2026-10-19"
        ],
        [
          "SA-2026-011",
          "Appui 3D passé de ressort à encastré ou articulé, calculé comme un ressort",
          "Élevée",
          "Corrigé le 2026-10-20"
        ],
        [
          "SA-2026-012",
          "Analyse non linéaire matérielle (moteur et WASM uniquement) : efforts élastiques dans les barres après plastification",
          "Moyenne",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-013",
          "Coques courbes : moments fléchissants affichés comme nuls ; les contraintes conservaient la déformation thermique libre",
          "Élevée",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-014",
          "Effondrement plastique 3D : le facteur dépendait de la numérotation des éléments (jusqu'à 2,4 fois la charge de ruine)",
          "Élevée",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-015",
          "Les câbles avec poids propre recevaient une traction trop faible dans les structures hyperstatiques",
          "Élevée",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-016",
          "Arcs (poutres courbes du moteur, outil arc de l'application) : Iy et Iz intervertis sur les segments presque verticaux",
          "Moyenne",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-017",
          "Interaction sol-structure : les courbes p-y, t-z et q-z s'écartaient de leurs références",
          "Élevée",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-018",
          "Coques MITC9 (moteur et WASM uniquement) sur géométrie courbe déformées par un mouvement de corps rigide",
          "Moyenne",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-019",
          "Charges de température sur barres (moteur et WASM ; l'application compensait depuis le 2026-10-07) : α de l'acier et hauteur d'un rectangle plein",
          "Moyenne",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-020",
          "Analyse non linéaire matérielle 3D (moteur et WASM uniquement) : surface de plastification moins conservatrice qu'en 2D",
          "Moyenne",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-021",
          "Toitures isolées : pas de vent parallèle au faîtage et, perpendiculairement, moins que le minimum du §2.1.5 (17 % de celui-ci à 20 m/s)",
          "Élevée",
          "Corrigé dans la 0.4.0"
        ],
        [
          "SA-2026-022",
          "Avec une poussée des terres H, la combinaison où la charge permanente s'y oppose manquait (27 à 45 % trop bas dans un exemple)",
          "Élevée",
          "Corrigé dans la 0.4.0"
        ],
        [
          "SA-2026-023",
          "Poteaux en béton armé : la vérification lisait un seul signe du moment ; les dispositions de barres non symétriques (6, 10, 14…) étaient acceptées du côté le plus fort",
          "Critique",
          "Corrigé dans la 0.4.0"
        ],
        [
          "SA-2026-024",
          "Semelles, nœuds, dalles, voiles et l'optimiseur acier dimensionnaient pour les charges non pondérées lorsque des combinaisons étaient définies mais non calculées (calcul en direct, échec du calcul d'une combinaison ou liste active vide)",
          "Élevée",
          "Corrigé dans la 0.4.0"
        ],
        [
          "SA-2026-025",
          "Effort tranchant G2 de l'AISC 360 (moteur et WASM uniquement) : sans aire d'âme, vérifié avec un taux 0, et certifié",
          "Moyenne",
          "Corrigé sur stabileo.com (#1234)"
        ],
        [
          "SA-2026-026",
          "Effort tranchant 6.2.6 de l'EC3 (moteur et WASM uniquement) : sans aire de cisaillement, Av = 0,5·A, Vpl,Rd 57 % trop élevé pour un HEB 300, et certifié",
          "Moyenne",
          "Corrigé sur stabileo.com (#1234)"
        ],
        [
          "SA-2026-027",
          "Enveloppe des coques : retenait la combinaison de plus grande contrainte de Von Mises, et non l'extrême de chaque composante (mx inférieur de 14 % dans un exemple)",
          "Élevée",
          "Correction en cours de revue"
        ],
        [
          "SA-2026-028",
          "Flexion EN 1992-1-1 (autres normes en PRO, certifiée) : supposait que l’acier tendu plastifie et n’itérait pas les armatures supérieures ; MRd jusqu’à 22 % trop élevé",
          "Élevée",
          "Corrigé après 0.4.0"
        ],
        [
          "SA-2026-029",
          "3D : les poteaux CIRSOC 201 de l'application étaient dimensionnés avec Mz sur la hauteur de la section (36 % d'armatures en moins dans un exemple) ; les vérifications certifiées 3D du moteur lisaient l'effort tranchant latéral Vy comme celui de l'âme",
          "Critique",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-030",
          "CIRSOC 301 en compression : une section dont l'aire est inférieure à ses tôles donnait un Qa négatif et une résistance supérieure à l'effort normal plastique, et était vérifiée",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-031",
          "Analyse temporelle : une charge appliquée à t = 0 sur un degré de liberté sans masse était perdue au premier pas (réciprocité fausse jusqu'à 33 fois, une chaîne à deux degrés de liberté écartée de 24 % de sa solution exacte)",
          "Moyenne",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-032",
          "Analyse modale : le mode à fréquence nulle d'un mécanisme était écarté et les autres modes rendus comme complets",
          "Moyenne",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-033",
          "Générateur de charges : un plancher avec une seule barre basse au-dessus d'une partie perdait toute sa charge surfacique (36 m² d'un plancher de 6 × 6 m dans un exemple) ; les fermes ne comptaient pas comme structure de toiture",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-034",
          "La vérification d'équilibre déclarait charges et réactions concordantes pour des cas dont la vérification laissait des charges de côté ; les modifications d'étages similaires atteignaient des barres de l'autre type et les copies perdaient leurs relâchements",
          "Moyenne",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-035",
          "Passage de la 3D à la 2D : la coupe faisait fléchir des barres autour du mauvais axe de section (un portique dans le plan Y–Z 13,5 fois trop rigide)",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-036",
          "Passage de la 3D à la 2D sur Y–Z ou X–Y : les liaisons étaient lues comme si le portique était dans X–Z (liaisons de déplacement perdues ou appliquées hors du plan)",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-037",
          "Analyse corotationnelle 3D : les vecteurs de rotation étaient soustraits (le coude de Bathe–Bolourchi à 1,3 %, sans amélioration au raffinement)",
          "Moyenne",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-038",
          "Flambement 3D : le facteur des barres dont la compression croît le long de la barre sous des charges dans son axe était trop élevé (+43 % pour une barre), et une barre comprimée seulement entre ses extrémités était refusée",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-039",
          "Import Excel et IFC : Iy et Iz des rectangles et des tubes étaient inversés (une console de 20 × 40 quatre fois trop souple, une de 40 × 20 quatre fois trop rigide)",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-040",
          "Vérifications ACI 318 et EN 1992 : barres en béton armé validées sans vérification de leur torsion",
          "Élevée",
          "Confiné dans la prochaine version"
        ],
        [
          "SA-2026-041",
          "Poteaux en béton armé : le moment maximal n'était vérifié qu'avec la compression maximale",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-042",
          "Flambement 2D : le facteur des barres dont la compression croît le long de la barre sous des charges dans son axe était trop élevé (+43 % à +68 % pour une barre)",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-043",
          "Analyse harmonique : la correction des modes omis perdait ses chiffres lorsqu’un mode était beaucoup plus souple que les autres (79 fois à 2,3 Hz dans un exemple)",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-044",
          "Effondrement plastique 2D : le facteur d'effondrement changeait avec la numérotation des nœuds, le sens des barres et les unités (jusqu'à 4,6 fois sur la même structure)",
          "Élevée",
          "Analyse limite corrigée dans la prochaine version ; l'effondrement plastique 2D reste retenu jusqu'à la clôture de #758"
        ],
        [
          "SA-2026-045",
          "Effondrement plastique 3D : une barre sans moment plastique utilisable était traitée comme si elle ne plastifiait jamais (6 fois trop haut dans un exemple, et certifié)",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-046",
          "Analyse harmonique : choisissait entre la superposition modale et la résolution directe selon la charge, si bien que la superposition et la réciprocité échouaient (107 % en un nœud dans un exemple) ; stabileo.com et les builds moteur/WASM de main, du 5 novembre 2026 jusqu'à la correction",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-047",
          "Coques : un cas de charge imposant un déplacement d'appui perdait ses contraintes de coque, et les combinaisons et enveloppes ne sommaient que celles des autres cas (parfois du côté de l'insécurité, sans avertissement) ; 0.2.0 à 0.4.0",
          "Élevée",
          "Corrigé dans la prochaine version"
        ],
        [
          "SA-2026-048",
          "Acier CIRSOC 301 : Cb manquait un changement de signe aux extrémités d’une longueur non maintenue déclarée plus courte que la barre (un profilé U en double courbure recevait Cb = 2,55 au lieu de 1, résistance au déversement surestimée) ; 0.2.0 à 0.5.0, les alphas de bureau et stabileo.com jusqu’au 8 novembre 2026",
          "Élevée",
          "Corrigé après 0.5.0 ; sur stabileo.com depuis le 8 novembre 2026"
        ],
        [
          "SA-2026-049",
          "Appuis avec un ressort positif et un blocage rigide sur le même degré de liberté : en 3D, le ressort libérait le blocage et modifiait la condition aux limites ; code du moteur de 0.2.0 à 0.5.0",
          "Élevée",
          "Corrigé après 0.5.0 ; sur stabileo.com depuis le 9 novembre 2026"
        ],
        [
          "SA-2026-050",
          "Le flambement pouvait transformer en zéro un calcul d’élancement ayant échoué, et les combinaisons pouvaient renvoyer des valeurs non finies dans un résultat réussi",
          "Moyenne",
          "Corrigé après 0.5.0 ; sur stabileo.com depuis le 9 novembre 2026"
        ],
        [
          "SA-2026-051",
          "Charges mobiles 3D : les enveloppes omettaient des pics intérieurs d’efforts et perdaient la composante axiale du poids des essieux sur les barres inclinées, pouvant sous-estimer la sollicitation sans avertissement ; 0.2.0 à 0.5.0 et desktop-v0.1.0-alpha.1 à alpha.3",
          "Élevée",
          "Corrigé après 0.5.0 ; sur stabileo.com depuis le 9 novembre 2026"
        ],
        [
          "SA-2026-052",
          "Charges mobiles 2D et 3D du moteur : les enveloppes axiales avec charges réparties axiales permanentes partielles omettaient des extrema aux limites des plages chargées entre les stations, pouvant sous-estimer la sollicitation sans avertissement ; aucune limite de versions publiées n’est affirmée",
          "Élevée",
          "Corrigé après 0.5.0 ; sur stabileo.com depuis le 9 novembre 2026"
        ],
        [
          "SA-2026-053",
          "Charges mobiles 2D et 3D : les charges ponctuelles aux extrémités incluaient dans les enveloppes des efforts extérieurs à la barre, ajoutant des extrema axiaux et tranchants parasites et surestimant la sollicitation ; aucune limite de versions publiées n’est affirmée",
          "Faible",
          "Corrigé après 0.5.0 ; sur stabileo.com depuis le 9 novembre 2026"
        ],
        [
          "SA-2026-054",
          "L’analyse linéaire pouvait renvoyer sans avertissement des résultats inexacts dus à une rigidité non résoluble ou à des composantes de charge omises par PCG",
          "Élevée",
          "Brouillon : correction pas encore fusionnée ni publiée"
        ],
        ["SA-2026-055", "P-Delta en 2D et 3D pouvait sous-estimer l’amplification et indiquer la stabilité lorsque l’effort normal variait sous des charges réparties ou ponctuelles le long d’une barre de portique", "Élevée", "Brouillon : correction pas encore fusionnée ni publiée"],
        [
          "SA-2026-056",
          "Modèles 3D associant portiques, coques et contraintes : les résultats harmoniques et temporels forcés changent entre descriptions équivalentes ; l’étendue au-delà du modèle conservé reste inconnue",
          "Élevée",
          "Brouillon : non résolu ; aucun correctif intégré ni déployé"
        ],
        [
          "SA-2026-057",
          "L’affichage du certificat plastique pouvait classer dans l’intervalle certifié un facteur situé en dehors ; l’extraction exacte des mécanismes écartait les refus liés aux ressources dans les versions de PR #1888 avant correction",
          "Moyenne",
          "Brouillon : correction pas encore fusionnée ni publiée"
        ],
        [
          "SA-2026-058",
          "Les modèles harmoniques 2D/3D dépassant 3000 degrés de liberté indépendants libres pouvaient conserver des réponses inexactes des modes omis hors de q ≤ 1/16 à des fréquences hors de la portée de l’avertissement de troncature (erreur complexe mesurée de 8,079 % sur la réponse cible)",
          "Élevée",
          "Corrigé dans PR #1922, publication en attente"
        ],
        [
          "SA-2026-059",
          "Les analyses web avancées pouvaient attribuer aux câbles une résistance à la compression sans avertissement (reproduction P-Delta : −4,599884347090908 kN) ; revoir les sollicitations des modèles avec câbles issues des analyses avancées, de l’analyse directe et des assistants pédagogiques",
          "Élevée",
          "Corrigé dans PR #1921, en attente de publication"
        ],
        [
          "SA-2026-061",
          "La longueur d’arc et le contrôle en déplacement omettaient les réactions et utilisaient les charges de barres sans mise à l’échelle ; vérifier aussi les omissions des résultats 2D/3D avec liaisons, Guyan, phases et historiques temporels. Recalculer ou vérifier indépendamment ; 0.2.0–0.5.0 et compilations ultérieures de main concernées.",
          "Élevée",
          "Corrigé dans PR #1952, publication en attente"
        ],
        ["SA-2026-060", "Le calcul par phases pouvait raidir sans avertissement des rotations réelles après un changement d’unités ou aux extrémités articulées avec ressorts d’appui ; revérifiez les modèles par phases avec libérations", "Haute", "Brouillon : correction locale en attente de revue et de publication"],
        ["SA-2026-062", "Le calcul plastique 3D brut pouvait annoncer zéro sans avertissement en cas d’échec de l’état élastique initial ; les anciennes versions certifiées conservaient ce facteur. Main renvoie déjà une borne certifiée positive avec avertissement ; la PR #1943 transmet le refus initial", "Haute", "Brouillon : correction locale en attente de revue et de publication"],
        ["SA-2026-063", "Les analyses par phases et non linéaires avec contraintes perdaient le mouvement imposé du maître ; les analyses de câbles et les historiques temporels refusent désormais les mouvements d’appui non pris en charge. Les avertissements dynamiques généraux existants ne signalaient pas cette omission", "Haute", "Corrigé dans PR #2009, en attente de publication"],
        ["SA-2026-064", "Le Cb de l’acier pouvait provenir d’une autre combinaison ou d’un court tronçon dont les maintiens étaient inconnus (#1316, #2088). Relancez les vérifications CIRSOC 301 et examinez résistance en flexion, taux d’interaction et combinaisons déterminantes.", "Élevée", "Corrigé dans 0.6.1"],
        ["SA-2026-065", "L’accumulation à un décrochement pouvait être omise sur une toiture réceptrice inclinée (#2082). Régénérez les charges de neige CIRSOC 104 et recalculez les analyses et vérifications concernées.", "Élevée", "Corrigé dans 0.6.1"],
        ["SA-2026-066", "Le Cm du béton pouvait être réduit d’après les moments d’extrémité malgré une charge transversale entre appuis (#2089). Revérifiez poteaux et voiles élancés, moments amplifiés et armatures.", "Élevée", "Corrigé dans 0.6.1"],
        ["SA-2026-067", "Une rotation en plan pouvait modifier les charges de neige générées (#2093). Régénérez les charges avec la géométrie réelle puis relancez analyses et vérifications ; revenir à l’orientation initiale ne répare pas les résultats.", "Élevée", "Corrigé dans 0.6.1"],
        ["SA-2026-068", "La torsion pouvait être validée avec des étriers dimensionnés insuffisants (#2141). Relancez les vérifications béton et examinez résistance transversale réelle, espacement des étriers et échecs en torsion. Des armatures longitudinales non vérifiées ne constituent pas une cage validée.", "Élevée", "Corrigé dans 0.6.1"],
        ["SA-2026-069", "La limite de section en torsion omettait le cisaillement secondaire concomitant (#2142). Relancez les calculs béton et examinez les échecs de section et les étriers absents ; ajouter des étriers ne corrige pas une section qui dépasse sa limite.", "Élevée", "Brouillon 2026-11-15 ; corrigé dans la PR #2169, fusion et publication en attente"],
        ["SA-2026-070", "La flèche et la rotation intérieures omettaient des charges de barre (#2143). Vérifiez déformées, lectures pédagogiques et contrôles de service acier/béton, y compris les charges trapézoïdales complètes et partielles. La récupération sous charge sans EI suffisant est désormais explicitement refusée.", "Élevée", "Corrigé dans PR #2170, publication en attente"],
        ["SA-2026-072", "Une subdivision inégale des bords du toit pouvait déplacer le faîtage et modifier les charges de neige générées (#2144). Régénérez les charges puis relancez analyses, combinaisons et vérifications. Recalculer les charges enregistrées ne les corrige pas.", "Élevée", "Corrigé dans la PR #2175, publication en attente"],
