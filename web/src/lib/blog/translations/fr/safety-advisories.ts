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
      "t": "État au 28 octobre 2026 : SA-2026-001 à 020 sont corrigés dans la version 0.3.0 et SA-2026-021 à 024 dans la version 0.4.0 (en ligne sur stabileo.com, SA-2026-021 et 022 depuis le 22 octobre et SA-2026-023 et 024 depuis le 25 et le 26 octobre). Les publier fait partie de notre manière de vérifier les résultats ; ce n'est pas le signe qu'ils sont encore ouverts. Un avis est considéré comme corrigé lorsque la correction est en ligne sur stabileo.com, et non lorsque la modification existe. Tant qu'un avis est ouvert, appliquez sa solution de contournement et vérifiez à la main le résultat concerné avant de signer."
    },
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
          "SA-2026-011",
          "Appui 3D passé de ressort à encastré ou articulé, calculé comme un ressort",
          "Élevée",
          "Corrigé le 2026-10-20"
        ],
        [
          "SA-2026-017",
          "Interaction sol-structure : les courbes p-y, t-z et q-z s'écartaient de leurs références",
          "Élevée",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-008",
          "Spectre de réponse : effort tranchant à la base SRSS sous CQC ; participation sans la masse couplée aux appuis",
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
          "SA-2026-006",
          "Modèle plan calculé en 3D : moments nodaux et rotations imposées inversés",
          "Élevée",
          "Corrigé le 2026-10-21"
        ],
        [
          "SA-2026-005",
          "Barres inclinées 2D : effort normal sans la composante de la charge parallèle à la barre",
          "Élevée",
          "Corrigé le 2026-10-21"
        ],
        [
          "SA-2026-019",
          "Charges de température sur barres (moteur et WASM ; l'application compensait depuis le 2026-10-07) : α de l'acier et hauteur d'un rectangle plein",
          "Moyenne",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-012",
          "Analyse non linéaire matérielle (moteur et WASM uniquement) : efforts élastiques dans les barres après plastification",
          "Moyenne",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-016",
          "Arcs (poutres courbes du moteur, outil arc de l'application) : Iy et Iz intervertis sur les segments presque verticaux",
          "Moyenne",
          "Corrigé dans la 0.3.0"
        ],
        [
          "SA-2026-018",
          "Coques MITC9 (moteur et WASM uniquement) sur géométrie courbe déformées par un mouvement de corps rigide",
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
          "SA-2026-010",
          "Le certificat spectral acceptait des résultats non finis",
          "Moyenne",
          "Corrigé le 2026-10-19"
        ],
        [
          "SA-2026-009",
          "Coque volumique SHB8 22 % trop rigide en flexion de plaque mince (flèches 18 % trop faibles)",
          "Moyenne (plus élevée dans les structures hyperstatiques)",
          "Corrigé le 2026-10-19"
        ],
        [
          "SA-2026-004",
          "Analyses qui ignoraient une partie du modèle (dynamique, flambement, effondrement plastique)",
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
          "SA-2026-002",
          "Les vérifications béton (CIRSOC 201, ACI 318) surestimaient la capacité",
          "Critique",
          "Corrigé dans la 0.2.0"
        ],
        [
          "SA-2026-001",
          "Combinaisons et charges générées (CIRSOC 101, 102, 103) allant dans le sens de l'insécurité",
          "Élevée",
          "Corrigé dans la 0.2.0"
        ]
      ]
    },
    {
      "k": "table",
      "caption": "Cas documentés dans chaque avis : la valeur correcte et celle qu'indiquait Stabileo.",
      "head": [
        "Avis",
        "Cas",
        "Correct",
        "Indiqué",
        "Unité"
      ],
      "rows": [
        [
          "SA-2026-024",
          "Portique de 6 × 4 m, 20 kN/m de charge permanente sur la poutre, 15 kN de vent, 1.2D + 1.6W, après une modification avec le calcul en direct activé : réaction verticale de la semelle au vent",
          "65,61",
          "56,01",
          "kN"
        ],
        [
          "SA-2026-023",
          "Poteau de 30×30 cm, 6 Ø20 (trois sur la face inférieure), Nu = 100 kN : φMn avec la face à trois barres comprimée",
          "78,57",
          "101,57",
          "kN·m"
        ],
        [
          "SA-2026-013",
          "Console de quatre coques courbes, 4 × 1 × 0,2 m, 10 kN à l'extrémité : mx dans l'élément d'encastrement",
          "35,0",
          "0",
          "kN·m/m"
        ],
        [
          "SA-2026-014",
          "Portique spatial de 10 barres (frame3d-2), renuméroté : facteur d'effondrement plastique",
          "176,47",
          "424,3",
          "—"
        ],
        [
          "SA-2026-015",
          "Mât haubané de 20 m, hauban en acier de 1 cm², 5 kN au sommet : traction dans le hauban",
          "5,18",
          "4,34",
          "kN"
        ],
        [
          "SA-2026-011",
          "Poutre avec appuis à 0, 4 et 8 m, appui dessiné comme encastré à 8 m : déplacement vertical sur cet appui",
          "0",
          "-14,4",
          "mm"
        ],
        [
          "SA-2026-017",
          "Argile molle c = 20 kPa, D = 1 m, z = 4 m : résistance ultime du sol p_u",
          "124",
          "84",
          "kN/m"
        ],
        [
          "SA-2026-008",
          "Deux modes à ω et 1.1ω : effort tranchant à la base rapporté à la valeur CQC",
          "1,00",
          "0,81",
          "—"
        ],
        [
          "SA-2026-007",
          "Poteau cruciforme 200×10 mm, 1,5 m : charge critique",
          "2993",
          "5860",
          "kN"
        ],
        [
          "SA-2026-006",
          "Portique avec moments et forces nodaux : déplacement latéral",
          "0,92",
          "2,52",
          "mm"
        ],
        [
          "SA-2026-005",
          "Arbalétrier à deux versants : effort normal en pied",
          "-56,67",
          "-41,67",
          "kN"
        ],
        [
          "SA-2026-019",
          "IPE 300 encastré aux deux extrémités, gradient de 20 °C : moment d'extrémité",
          "14,04",
          "9,76",
          "kN·m"
        ],
        [
          "SA-2026-012",
          "Console de 4 m plastifiée, charge en bout 1.2·Mp/L : moment à l'encastrement",
          "1012,5",
          "101250",
          "kN·m"
        ],
        [
          "SA-2026-016",
          "Arc semi-circulaire de 5 m dans le plan Y–Z, 40 segments : déplacement à la clé",
          "-7,29",
          "-6,18",
          "mm"
        ],
        [
          "SA-2026-018",
          "Panneau cylindrique MITC9 de 2×2 m, montée de 0,2 m, acier, 50 mm, rotation rigide de 1 mrad : plus grande contrainte nodale de von Mises",
          "0",
          "101",
          "MPa"
        ],
        [
          "SA-2026-020",
          "Console 3D de 4 m, N = 0.5·Np, charge en bout : charge à la première plastification",
          "158,2",
          "182,7",
          "kN"
        ],
        [
          "SA-2026-009",
          "Plaque mince en flexion, ν = 0,3 : rigidité rapportée à la valeur correcte",
          "1,000",
          "1,225",
          "—"
        ]
      ]
    },
    {
      "k": "h",
      "t": "SA-2026-021 : vent minimal sur les toitures isolées"
    },
    {
      "k": "p",
      "t": "Une toiture isolée (un hangar ouvert, un abri de voiture, un auvent) ne recevait que les pressions nettes des figures 2.4-4 à 2.4-7, normales à la toiture. Le §2.1.5 de CIRSOC 102-2025 exige aussi que la force du vent sur une construction ouverte soit au moins égale à 0,75 kN/m² × Af, comme cas de charge horizontal à part entière. Sans ce minimum, avec le vent parallèle au faîtage, la force horizontale était nulle, et perpendiculairement au faîtage, la force passait sous le minimum aux vitesses faibles et modérées. Chaque direction dispose désormais de ce cas de charge."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-021-free-roof-wind-minimum.md",
      "label": "SA-2026-021 complet",
      "t": "L'avis, avec les mesures :"
    },
    {
      "k": "h",
      "t": "SA-2026-022 : poussée des terres équilibrée par la charge permanente"
    },
    {
      "k": "p",
      "t": "En présence de charges H, CIRSOC 101-2025 demande de considérer les effets des charges qui n'agissent pas. Les combinaisons 0.9 D + 1.6 H et 1.2 D + 1.6 H n'étaient jamais générées : là où la charge permanente s'oppose à la poussée des terres (renversement ou glissement d'un mur), l'effet était sous-estimé. Elles sont désormais générées, avec ou sans vent ou séisme dans le modèle."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-022-earth-pressure-dead-load-resisting.md",
      "label": "SA-2026-022 complet",
      "t": "L'avis, avec l'exemple :"
    },
    {
      "k": "h",
      "t": "SA-2026-023 : poteaux en béton armé avec des dispositions de barres non symétriques"
    },
    {
      "k": "p",
      "t": "Les moments aux points d'évaluation arrivent à la vérification des poteaux en valeur absolue, mais la capacité sous effort normal et flexion selon un axe n'était calculée que pour un seul signe, avec la face supérieure comprimée. Avec 6, 10, 14, 18 ou 22 barres, l'outil de dimensionnement place les barres supplémentaires sur les faces inférieure et droite : c'est donc le signe fort. Avec le moment inversé, la capacité est plus faible, et elle n'était jamais vérifiée. Un poteau de 30×30 cm avec 6 Ø20 sous 100 kN de compression reprend 101,57 kN·m dans un sens et 78,57 dans l'autre, et il était accepté pour Mu = 100 kN·m. Cela concerne la vérification des poteaux selon CIRSOC 201 en flexion selon un axe (celle des barres d'une barre du modèle, celle de l'outil de dimensionnement et celle de la revérification du moteur) ; la vérification en flexion déviée prenait déjà le quadrant le plus défavorable."
    },
    {
      "k": "ul",
      "items": [
        "Comment savoir si vous êtes concerné : le modèle comporte des poteaux en béton vérifiés selon CIRSOC 201 dont les barres ne sont pas symétriques par rapport à l'axe de flexion : 6, 10, 14, 18 ou 22 barres issues de l'outil de dimensionnement, ou des faces saisies à la main avec un nombre de barres différent sur des faces opposées.",
        "Que faire : sur une version antérieure à la correction, utilisez des dispositions symétriques (4, 8, 12, 16, 20 ou 24 barres, ou des faces opposées identiques), ou vérifiez aussi le poteau avec les barres en miroir : la plus petite des deux capacités est déterminante.",
        "État : corrigé dans la 0.4.0, en ligne sur stabileo.com depuis le 25 octobre 2026. Le moteur calcule les deux signes et retient le plus faible ; les dispositions symétriques donnent exactement le même résultat qu'avant."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-023-column-moment-sign.md",
      "label": "SA-2026-023 complet",
      "t": "L'avis, avec le cas de test :"
    },
    {
      "k": "h",
      "t": "SA-2026-024 : semelles, nœuds, dalles et voiles dimensionnés pour les charges non pondérées"
    },
    {
      "k": "p",
      "t": "Lorsque des combinaisons étaient définies sans qu'aucune soit calculée, les semelles et les nœuds lisaient le résultat affiché, qui correspond alors à toutes les charges avec un facteur 1 : ils étaient dimensionnés pour les charges de service au lieu des combinaisons pondérées. Cela se produisait avec le calcul en direct activé (après une modification, il ne recalcule que « Toutes les charges » tant que la vue simple est affichée) ou lorsque le calcul des combinaisons échouait et que le calcul simple prenait sa place. Dans un portique sous 1.2D + 1.6W, la réaction d'une semelle était sous-estimée de 15 % ; avec charge permanente et charge d'exploitation, de 29 à 38 %. Il en allait de même pour les dalles et les voiles, pour l'optimiseur acier et avec une liste vide de combinaisons actives. Tout dimensionnement est désormais refusé, avec la raison, tant que les combinaisons ne sont pas calculées."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-024-design-on-unfactored-results.md",
      "label": "SA-2026-024 complet",
      "t": "L'avis, avec l'exemple :"
    },
    {
      "k": "h",
      "t": "SA-2026-014 : l'effondrement plastique 3D dépendait de la numérotation"
    },
    {
      "k": "p",
      "t": "En flexion déviée, les contrôles qui referment une rotule tournant en sens inverse et rouvrent une rotule fermée poussée hors de la surface de plastification pouvaient boucler. Le solveur repartait de l'état dans lequel l'ordre des éléments l'avait laissé et faisait traverser la surface de plastification à une section fermée : la même structure, renumérotée, donnait des facteurs d'effondrement de 75,9 à 424,3, contre une valeur certifiée de 176,47. L'analyse s'arrête désormais au dernier état cohérent et indique ce facteur comme borne inférieure, avec un avertissement, identique quelle que soit la numérotation. Cela concerne le pushover 3D de l'onglet Pro."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-014-plastic-3d-element-order.md",
      "label": "SA-2026-014 complet",
      "t": "L'avis, avec le modèle de test et la valeur certifiée :"
    },
    {
      "k": "h",
      "t": "SA-2026-011 : appui 3D passé de ressort à encastré"
    },
    {
      "k": "p",
      "t": "Changer le type d'un appui qui avait des ressorts conservait ses raideurs de ressort. En mode 3D, elles étaient envoyées au solveur avec le blocage, et le solveur traitait ce degré de liberté comme élastique : l'appui dessiné comme encastré était calculé comme un ressort. Cela concerne les modèles calculés en mode 3D, y compris les modèles plans calculés en 3D ; le mode 2D n'est pas concerné."
    },
    {
      "k": "ul",
      "items": [
        "Comment savoir si vous êtes concerné : un appui était d'abord un ressort (ou avait des raideurs de ressort), puis a été changé en encastré, articulé ou à rouleau, ou a eu un degré de liberté coché comme bloqué. Dans les résultats, cet appui présente un déplacement ou une rotation non nuls.",
        "Que faire : recalculez sur stabileo.com les modèles 3D dont les appuis sont passés de ressorts à rigides, et comparez les résultats au voisinage de ces appuis avec ceux que vous avez déjà utilisés.",
        "État : corrigé sur stabileo.com le 20 octobre 2026. Tout degré de liberté bloqué est calculé comme bloqué, y compris dans les projets enregistrés auparavant."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-011-springs-on-fixed-supports.md",
      "label": "SA-2026-011 complet",
      "t": "L'avis, avec la reproduction et le modèle de test :"
    },
    {
      "k": "h",
      "t": "SA-2026-013 : moments des coques courbes et contraintes thermiques"
    },
    {
      "k": "p",
      "t": "Les coques courbes (quadrangles marqués comme courbes) donnaient mx = my = mxy = 0 quelle que soit la flexion, et sous une charge de température, leurs contraintes conservaient la déformation thermique libre : une coque libre de se dilater donnait E·α·ΔT/(1−ν), et une coque bridée, rien. L'application envoyait aussi la température d'un quadrangle courbe comme celle d'un quadrangle plan, que le moteur ignorait : la coque était analysée sans échauffement. Ces résultats étaient lus par les isovaleurs des coques (y compris dans les figures exportées), le tableau des résultats et le rapport PDF de Pro, et le dimensionnement des dalles lorsqu'un panneau était un quadrangle courbe ; le classeur des résultats et le CSV laissaient déjà ces moments vides."
    },
    {
      "k": "ul",
      "items": [
        "Comment savoir si vous êtes concerné : le modèle comporte des quadrangles courbes et vous avez utilisé leurs moments (isovaleurs, tableau ou rapport de Pro, dimensionnement des dalles), ou il comporte une charge de température sur un quadrangle courbe.",
        "Que faire : relancez ces modèles et refaites tout dimensionnement ou toute vérification qui a lu leurs moments ou leurs contraintes sous température. D'ici là, modélisez la surface avec des quadrangles plans (MITC4).",
        "État : corrigé dans la 0.3.0, en ligne sur stabileo.com depuis le 21 octobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-013-curved-shell-moments-and-thermal.md",
      "label": "SA-2026-013 complet",
      "t": "L'avis, avec la console de test et les cas thermiques :"
    },
    {
      "k": "h",
      "t": "SA-2026-017 : courbes de sol dans l'interaction sol-structure"
    },
    {
      "k": "p",
      "t": "Les courbes de sol ne suivaient pas les références qu'elles citaient. L'argile molle omettait le terme J de Matlock (résistance ultime sous-estimée d'un tiers à la moitié près de la surface) ; le sable utilisait toujours le facteur cyclique A = 0,9 et une table de k en escalier ; l'argile raide sautait de la moitié à la totalité de la résistance à y50 et retombait à 70 % au-delà. Les courbes t-z et q-z (moteur et WASM uniquement) omettaient le périmètre du fût et l'aire de la pointe. Cela concerne PRO → Avancé → Interaction sol-structure. Le panneau demande désormais J et le type de chargement du sable, et le moteur refuse une courbe à laquelle il manque une donnée au lieu de la supposer. Que faire : relancez ces modèles et revérifiez les déplacements et les moments des pieux."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-017-soil-curves.md",
      "label": "SA-2026-017 complet",
      "t": "L'avis, avec les valeurs avant et après pour chaque courbe :"
    },
    {
      "k": "h",
      "t": "SA-2026-019 : charges de température sur les barres"
    },
    {
      "k": "p",
      "t": "Le moteur calculait la charge thermique de chaque barre avec α = 12·10⁻⁶ /°C (celui de l'acier) et avec la hauteur du rectangle plein équivalent, √(12·I/A). Sur un IPE, le moment dû à un gradient était sous-estimé de 30 %, et sur l'aluminium, l'effort normal dû à la température l'était de près de moitié. L'application compensait les deux depuis le 7 octobre 2026 : cela concerne donc l'utilisation directe du moteur ou de son API WASM, ainsi que les modèles thermiques calculés dans l'application avant cette date."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-019-frame-thermal-alpha-depth.md",
      "label": "SA-2026-019 complet",
      "t": "L'avis, avec les cas de test :"
    },
    {
      "k": "h",
      "t": "SA-2026-012 : efforts dans les barres en analyse non linéaire matérielle"
    },
    {
      "k": "p",
      "t": "Après la plastification d'une barre, le solveur équilibrait les charges avec la rigidité réduite, mais indiquait des efforts calculés avec la rigidité élastique. Les déplacements et les réactions étaient justes ; les efforts dans les barres et le taux de travail ne l'étaient pas : dans une console, le moment indiqué valait 100 fois le moment réel. Ce solveur n'est accessible que depuis le moteur ou son API WASM : aucun écran de l'application ne l'appelle, de sorte que les résultats obtenus sur stabileo.com ne sont pas concernés."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-012-material-nonlinear-member-forces.md",
      "label": "SA-2026-012 complet",
      "t": "L'avis, avec la console de test :"
    },
    {
      "k": "h",
      "t": "SA-2026-016 : axes de section sur les segments presque verticaux d'un arc"
    },
    {
      "k": "p",
      "t": "Les segments droits d'un arc prenaient les axes locaux par défaut d'une barre droite, qui, pour une barre à moins de 2,56° de la verticale, prennent l'axe X global comme référence. Dans un arc hors du plan X–Z, cela faisait tourner de 90° la section des segments presque verticaux aux naissances : Iy et Iz y étaient intervertis. Dans un demi-cercle de 40 segments dans le plan Y–Z, le déplacement à la clé était sous-estimé de 15 %. Cela concerne les poutres courbes du moteur et les arcs dessinés avec l'outil arc de l'onglet Barres (PRO) lorsqu'un segment est presque vertical ; les courbes en plan ne sont pas concernées. Les arcs enregistrés auparavant prennent les axes corrigés à l'ouverture du projet."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-016-curved-member-axes.md",
      "label": "SA-2026-016 complet",
      "t": "L'avis, avec l'arc de test :"
    },
    {
      "k": "h",
      "t": "SA-2026-015 : traction des câbles avec poids propre"
    },
    {
      "k": "p",
      "t": "L'analyse des câbles utilisait le module d'Ernst, la tangente de la loi de corde d'un câble suspendu sous son poids propre, comme s'il s'agissait d'une sécante depuis la corde rectiligne. La flèche consomme de la longueur de corde : pour un allongement donné, un câble a donc besoin de plus de traction que EA·ε, et non de moins. Là où l'équilibre seul fixe l'effort dans le câble, la traction était juste ; là où le câble partage la charge avec d'autres barres (un mât haubané, un câble qui contrevente un portique), le câble recevait trop peu de traction et les barres voisines en recevaient trop : dans le mât de test, 4,34 kN au lieu de 5,18 kN, et avec des charges plus faibles, l'itération ne convergeait pas. Dans l'application, cela concerne les modèles 3D comportant des barres dont le comportement est « câble » et dont le matériau a une masse volumique."
    },
    {
      "k": "ul",
      "items": [
        "Comment le savoir : le modèle comporte des barres avec le comportement « câble », leur matériau a une masse volumique, et le câble n'est pas le seul cheminement des charges.",
        "Que faire : vérifiez à la main les efforts déterminants dans les câbles et les ancrages, ou calculez sans masse volumique pour le matériau du câble (sans poids, la loi était juste) ; une fois la correction publiée, relancez le calcul.",
        "État : corrigé dans la 0.3.0. L'analyse des câbles résout désormais la loi de corde elle-même par itération de Newton."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-015-cable-tension-chord-law.md",
      "label": "SA-2026-015 complet",
      "t": "L'avis, avec le mât de test et sa solution analytique :"
    },
    {
      "k": "h",
      "t": "SA-2026-018 : coques MITC9 sur géométrie courbe"
    },
    {
      "k": "p",
      "t": "L'élément MITC9 est plan : il projette ses neuf nœuds sur un même plan. Lorsque les nœuds milieux de côté ou le nœud central se trouvaient hors de ce plan (tout maillage MITC9 courbe), la projection n'avait pas la correction par liaison rigide du MITC4 : une rotation rigide déformait donc l'élément. Un maillage courbe résistait aux rotations de ses éléments et indiquait des contraintes pour celles-ci (101 MPa sur un panneau de test tourné de 1 mrad). Cet élément n'est utilisé que depuis le moteur ou son API WASM : l'application ne crée aucun élément à neuf nœuds, de sorte que les résultats obtenus sur stabileo.com ne sont pas concernés."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-018-mitc9-curved-rigid-motion.md",
      "label": "SA-2026-018 complet",
      "t": "L'avis, avec le panneau de test et l'hémisphère :"
    },
    {
      "k": "h",
      "t": "SA-2026-020 : surface de plastification de l'analyse non linéaire matérielle 3D"
    },
    {
      "k": "p",
      "t": "En 2D, une barre se plastifie lorsque (N/Np)² + |M|/Mp dépasse 1. En 3D, le solveur utilisait (N/Np)² + (My/Mpy)² + (Mz/Mpz)², avec les rapports de moments au carré : avec un effort normal ou une flexion selon les deux axes, une barre 3D se plastifiait donc plus tard que la même barre en 2D, et le taux de travail indiqué était trop faible. Avec N = 0.5·Np, la charge à la première plastification était surestimée de 15 %. La 3D utilise désormais (N/Np)² + |My|/Mpy + |Mz|/Mpz, qui, en flexion selon un axe, redonne la surface 2D. Ce solveur n'est accessible que depuis le moteur ou son API WASM : aucun écran de l'application ne l'appelle, de sorte que les résultats obtenus sur stabileo.com ne sont pas concernés."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md",
      "label": "SA-2026-020 complet",
      "t": "L'avis, avec les cas de test :"
    },
    {
      "k": "h",
      "t": "SA-2026-008 : effort tranchant à la base et participation modale en analyse spectrale"
    },
    {
      "k": "p",
      "t": "Avec la règle CQC, l'effort tranchant à la base indiqué était toujours combiné par SRSS. Les efforts tranchants modaux à la base dans une direction ont le même signe, si bien que CQC donne plus que SRSS : avec deux modes proches, la valeur indiquée était sous-estimée de 19 %. Les facteurs de participation omettaient aussi la masse que la matrice de masse cohérente couple aux appuis, ce qui sous-estimait la réponse dans les modèles comportant peu d'éléments par poteau."
    },
    {
      "k": "ul",
      "items": [
        "Comment savoir si vous êtes concerné : vous avez effectué une analyse spectrale avec CQC et utilisé l'effort tranchant à la base indiqué (par exemple pour le mettre à l'échelle de l'effort tranchant statique à la base), ou vous avez utilisé la masse cohérente avec des poteaux d'un ou deux éléments.",
        "Que faire : recalculez les modèles concernés sur stabileo.com et comparez avec les résultats que vous avez déjà utilisés. La solution de contournement que donnait cet avis avant la correction ne s'applique plus.",
        "État : corrigé sur stabileo.com le 21 octobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-008-spectral-combination.md",
      "label": "SA-2026-008 complet",
      "t": "L'avis, avec les deux défauts traités séparément :"
    },
    {
      "k": "h",
      "t": "SA-2026-007 : flambement par torsion et par flexion-torsion en 3D"
    },
    {
      "k": "p",
      "t": "La rigidité géométrique des barres 3D ne comportait que les termes de flexion : ni terme de Wagner ni couplage avec le centre de cisaillement. Le flambement par torsion et par flexion-torsion n'apparaissait jamais, et c'est la charge d'Euler qui était indiquée à la place. Pour un poteau cruciforme, la charge indiquée dépassait de 96 % la charge déterminante."
    },
    {
      "k": "ul",
      "items": [
        "Comment savoir si vous êtes concerné : vous avez utilisé le facteur de flambement 3D ou le P-Delta 3D pour des structures à sections ouvertes à parois minces de faible rigidité de torsion : cruciformes, cornières simples ou doubles, tés, profilés en U. Les sections en I bisymétriques, où le flambement par flexion est déterminant, ne sont pas concernées. Les vérifications réglementaires qui calculent elles-mêmes le flambement par torsion (CIRSOC 301 E.4, depuis la 0.2.0) ne sont pas concernées non plus.",
        "Que faire : recalculez les modèles concernés sur stabileo.com et comparez avec les résultats que vous avez déjà utilisés. La solution de contournement que donnait cet avis avant la correction ne s'applique plus.",
        "État : corrigé sur stabileo.com le 21 octobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-007-torsional-buckling.md",
      "label": "SA-2026-007 complet",
      "t": "L'avis, avec le calcul détaillé du poteau cruciforme :"
    },
    {
      "k": "h",
      "t": "SA-2026-006 : modèle plan calculé en 3D avec des moments nodaux"
    },
    {
      "k": "p",
      "t": "Un modèle plan calculé par le solveur 3D se trouve dans le plan X–Z, où la rotation dans le plan est une rotation autour de −Y. Les moments nodaux et les rotations imposées devaient changer de signe et ne le faisaient pas : ils agissaient donc comme leur image miroir. Combinés à des forces, ils peuvent s'ajouter au lieu de se compenser."
    },
    {
      "k": "ul",
      "items": [
        "Comment savoir si vous êtes concerné : le modèle est plan (tous les nœuds dans un même plan), a été calculé en mode 3D et comporte des moments nodaux ou des rotations d'appui imposées. Les ressorts en rotation ne sont pas concernés.",
        "Que faire : recalculez les modèles concernés sur stabileo.com et comparez avec les résultats que vous avez déjà utilisés. La solution de contournement que donnait cet avis avant la correction ne s'applique plus.",
        "État : corrigé sur stabileo.com le 21 octobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-006-mirrored-moments-2d-in-3d.md",
      "label": "SA-2026-006 complet",
      "t": "L'avis, avec les trois cas de test :"
    },
    {
      "k": "h",
      "t": "SA-2026-005 : effort normal dans les barres inclinées 2D"
    },
    {
      "k": "p",
      "t": "Le générateur de charges 2D reportait sur les nœuds d'extrémité la composante parallèle à la barre d'une charge appliquée sur une barre inclinée. Les réactions et les déplacements étaient justes, mais la barre ne voyait pas cette charge dans sa portée : son effort normal restait constant, égal à la moyenne de ses vraies valeurs d'extrémité, soit 26 % de moins en pied d'un arbalétrier. Le diagramme, l'inspecteur, le rapport, l'export Excel et le dimensionnement utilisaient tous cette valeur. Un couple appliqué sur une barre était en outre ignoré lorsqu'un modèle plan était calculé en 3D."
    },
    {
      "k": "ul",
      "items": [
        "Comment savoir si vous êtes concerné : un modèle 2D calculé depuis le 25/09/2026 avec des barres inclinées (arbalétriers, escaliers, contreventements, arcs dessinés en segments) portant des charges réparties, ponctuelles ou de poids propre ayant une composante parallèle à la barre ; ou un modèle plan avec un couple sur une barre calculé en 3D. Les barres dimensionnées en compression sont les plus exposées.",
        "Que faire : recalculez les modèles concernés sur stabileo.com et comparez avec les résultats que vous avez déjà utilisés. La solution de contournement que donnait cet avis avant la correction ne s'applique plus.",
        "État : corrigé sur stabileo.com le 21 octobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-005-inclined-member-loads.md",
      "label": "SA-2026-005 complet",
      "t": "L'avis, avec l'arbalétrier et la barre 3-4-5 :"
    },
    {
      "k": "h",
      "t": "Corrigés le 19 octobre 2026"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-009 : l'élément de coque volumique SHB8 était 22 % trop rigide en flexion de plaque mince (verrouillage en épaisseur dû au coefficient de Poisson) ; il sous-estimait donc les flèches d'environ 18 %. Revérifiez les conclusions sur les flèches et les vibrations des modèles comportant des plaques en coque volumique calculés avant cette date ; MITC4, MITC9, DKT et la coque courbe n'étaient pas concernés.",
        "SA-2026-010 : le certificat de l'analyse spectrale pouvait accepter des résultats non finis (NaN). Les chiffres étaient visiblement invalides ; ce qui était faux, c'était l'affirmation de vérification. Il n'y a rien à revérifier, sauf si un résultat livré présentait des valeurs non finies."
      ]
    },
    {
      "k": "h",
      "t": "Corrigés dans la version 0.2.0"
    },
    {
      "k": "p",
      "t": "La version 0.2.0, du 18 octobre 2026, a corrigé les quatre avis rétroactifs. Ils concernent tous les projets calculés avant le 17 octobre 2026, et la consigne est la même pour chacun : régénérez les charges et les combinaisons, recalculez et revoyez les vérifications réglementaires, et revérifiez tout livrable émis avec une version antérieure."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001 : combinaisons et charges CIRSOC 101, 102 et 103 générées du côté de l'insécurité (dans un exemple, l'effort normal d'un poteau était sous-estimé de 29 %).",
        "SA-2026-002 : les vérifications béton selon CIRSOC 201 et ACI 318 surestimaient la capacité (φMn jusqu'à 18 % trop élevé).",
        "SA-2026-003 : les vérifications acier, profilés formés à froid et assemblages surestimaient la capacité (cisaillement de l'âme jusqu'à 60 % trop élevé).",
        "SA-2026-004 : analyses qui ignoraient une partie du modèle (l'analyse temporelle sous mouvement du sol perdait jusqu'à la moitié de la charge sismique ; l'effondrement plastique 3D allait jusqu'à 2,3 fois du côté de l'insécurité)."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Tous les avis",
      "t": "La liste complète, avec chaque avis, sa correction et sa gravité :"
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Comment nous avons trouvé ces défauts, et ce qu'aucune vérification ne peut garantir :"
    }
  ]
};

export default body;
