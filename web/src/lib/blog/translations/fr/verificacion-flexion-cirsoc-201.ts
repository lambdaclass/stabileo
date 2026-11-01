import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Vérification en flexion selon CIRSOC 201, pas à pas",
  "excerpt": "Presque tout le monde se souvient de φMn ≥ Mu. C'est la dernière ligne de la vérification, pas la vérification. L'issue se décide avant, et l'une de ces étapes peut faire descendre φ sous 0,9.",
  "blocks": [
    {
      "k": "p",
      "t": "La plupart des gens retiennent une vérification en flexion comme une seule inégalité : φMn ≥ Mu. C'est exact, et c'est la dernière ligne. Ce qui décide du résultat se joue avant, dans des étapes que l'on regarde rarement de près parce qu'elles ressemblent à de la formalité."
    },
    {
      "k": "p",
      "t": "Voici ce que renvoie le module CIRSOC 201 de Stabileo pour une poutre de 20×40 cm en béton H-25, acier fy 420, enrobage de 25 mm et cadres de 8 mm, sous un moment de 60 kN·m :"
    },
    {
      "k": "ol",
      "items": [
        "d = 35,9 cm, d' = 4,1 cm",
        "Mu = 60,00 kN·m",
        "As,min = 2,39 cm²",
        "As,max (armature simple) = 11,58 cm²",
        "As,req (traction) = 4,73 cm²",
        "Armature tendue : 2 Ø20 (6,28 cm²)",
        "a = 6,21 cm, c = 7,31 cm",
        "εt = 11,74 ‰",
        "εt ≥ 5 ‰ → contrôlée par la traction → φ = 0,90",
        "φMn = 77,90 kN·m"
      ]
    },
    {
      "k": "p",
      "t": "Dix étapes. La dixième est celle dont tout le monde se souvient. Celles qui décident du résultat sont la troisième et la neuvième."
    },
    {
      "k": "h",
      "t": "Étape 3 : le minimum est déterminant plus souvent qu'il n'y paraît"
    },
    {
      "k": "p",
      "t": "L'article 9.6.1.2 exige une armature minimale de flexion égale à la plus grande des deux valeurs 0.25·√f'c/fy·bw·d et 1.4/fy·bw·d. On la traite d'ordinaire comme un plancher que l'on n'atteint presque jamais. Dans les poutres de logements, on l'atteint tout le temps."
    },
    {
      "k": "table",
      "caption": "La même poutre 20×40 en H-25 sous des moments croissants : ce qui décide de l'armature.",
      "head": [
        "Mu [kN·m]",
        "As par résistance [cm²]",
        "As,min [cm²]",
        "Déterminant"
      ],
      "rows": [
        [
          "15",
          "1,12",
          "2,39",
          "le minimum"
        ],
        [
          "30",
          "2,28",
          "2,39",
          "le minimum"
        ],
        [
          "60",
          "4,73",
          "2,39",
          "la résistance"
        ],
        [
          "90",
          "7,38",
          "2,39",
          "la résistance"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Le croisement se situe à Mu = 31,5 kN·m. En dessous de ce moment, dimensionner à la résistance ne sert à rien : la section porte 2,39 cm² de toute façon. Il vaut la peine de savoir de quel côté du croisement se trouve une poutre avant de discuter de son armature."
    },
    {
      "k": "h",
      "t": "Et le minimum dépend rarement du béton"
    },
    {
      "k": "p",
      "t": "Des deux expressions de l'article, celle en √f'c ne dépasse l'autre que pour des bétons assez résistants."
    },
    {
      "k": "table",
      "caption": "Les deux expressions du minimum, pour fy 420, en pour mille.",
      "head": [
        "Béton",
        "0.25·√f'c/fy",
        "1.4/fy",
        "Déterminant"
      ],
      "rows": [
        [
          "H-20",
          "2,6620",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-25",
          "2,9762",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-30",
          "3,2603",
          "3,3333",
          "1.4/fy"
        ],
        [
          "H-35",
          "3,5215",
          "3,3333",
          "√f'c"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Le croisement se situe à f'c = 31,36 MPa. Sur toute la plage utilisée dans le logement (H-20, H-25, H-30), l'armature minimale ne dépend pas du béton : elle vient de 1.4/fy et de rien d'autre. Passer de H-20 à H-30 ne réduit pas le minimum d'un seul centimètre carré."
    },
    {
      "k": "h",
      "t": "Étape 9 : φ ne vaut pas automatiquement 0,9"
    },
    {
      "k": "p",
      "t": "On enseigne que le coefficient de réduction de résistance vaut 0,90 en flexion, puis on le traite comme une constante. Ce n'en est pas une. Il découle de la déformation de l'acier tendu à l'état ultime, et le module l'indique à l'étape 9 : εt ≥ 5 ‰ → contrôlée par la traction → φ = 0,90. Mettez davantage d'acier dans la section et εt diminue, entraînant φ avec elle."
    },
    {
      "k": "table",
      "caption": "La même poutre, chargée un peu plus à chaque fois. εt et φ proviennent des étapes 8 et 9.",
      "head": [
        "Mu [kN·m]",
        "Armature",
        "εt [‰]",
        "φ",
        "φMn [kN·m]"
      ],
      "rows": [
        [
          "30",
          "2 Ø16",
          "20,03",
          "0,90",
          "51,6"
        ],
        [
          "60",
          "2 Ø20",
          "11,74",
          "0,90",
          "77,9"
        ],
        [
          "90",
          "2 Ø25",
          "6,44",
          "0,90",
          "115,2"
        ],
        [
          "120",
          "2 Ø32",
          "2,76",
          "0,707",
          "133,5"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Dans la dernière ligne, la section est entrée dans la zone de transition et φ est tombé à 0,707. La capacité n'a pas augmenté comme l'acier : entre les deux dernières lignes, la section d'acier passe de 9,82 à 16,08 cm² nominaux et φMn ne passe que de 115,2 à 133,5 kN·m. Une bonne part de ce que l'on ajoute se perd dans le coefficient."
    },
    {
      "k": "quote",
      "t": "Une section surarmée n'échoue pas à la vérification. Elle échoue dans φ, et le résultat continue de dire qu'elle est conforme."
    },
    {
      "k": "h",
      "t": "Pourquoi on ajoute de l'acier comprimé"
    },
    {
      "k": "p",
      "t": "La réponse habituelle est « pour que les barres rentrent ». C'est la conséquence, pas la raison. Pour Mu = 200 kN·m sur cette même poutre, le module trouve εt = 1,51 ‰, en dessous de la limite, et ajoute une armature comprimée. Avec elle, l'axe neutre remonte, εt revient à 7,46 ‰ et φ revient à 0,90."
    },
    {
      "k": "p",
      "t": "L'acier comprimé sert donc à rendre sa ductilité à la section et à récupérer le coefficient. La capacité suit, comme conséquence."
    },
    {
      "k": "note",
      "t": "Les étapes que le module produit pour ce cas le disent dans cet ordre : « εt = 1,51 ‰ < 2,1 ‰ → A's requise », puis « ΔM = 144,50 kN·m, A's,req = 11,40 cm² », et seulement à la fin « εt = 7,46 ‰ → contrôlée par la traction → φ = 0,90 »."
    },
    {
      "k": "h",
      "t": "Essayez sur une vraie poutre"
    },
    {
      "k": "p",
      "t": "Voici le modèle : une poutre de 5 m sur appuis simples, 20×40, H-25, avec 12 kN/m de charge permanente et 8 kN/m de charge d'exploitation, plus son poids propre. Il s'ouvre dans le flux de dimensionnement de PRO, avec CIRSOC 201 comme norme de dimensionnement en vigueur."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "La poutre dans Stabileo, dans le flux de dimensionnement de PRO. Si le dimensionnement est désactivé, cliquez sur « Activer le dimensionnement pour cette visite » dans l'avis. Trois boutons, dans cet ordre : « Calculer les sollicitations », « Calculer l'acier requis » et « Dimensionner… ». Seul le troisième choisit les barres, et tant qu'il n'y a pas de barres, il n'y a rien à vérifier : le tableau indique « sans armatures ». La portée de 5 m est modélisée en deux éléments ; les deux aboutissent à S/R = 0,90, avec l'effort tranchant en travée comme critère déterminant : la flexion et l'ancrage des barres restent en dessous. Modifiez la charge et relancez le calcul. PRO est en développement ; le module béton est la partie implémentée et testée."
    },
    {
      "k": "h",
      "t": "En résumé"
    },
    {
      "k": "ol",
      "items": [
        "Avant de dimensionner, vérifiez si le moment est au-dessus ou en dessous du croisement avec le minimum. En dessous, l'armature est déjà décidée.",
        "De H-20 à H-30, le minimum ne dépend pas du béton. Il vient de 1.4/fy.",
        "φ dépend de εt : lisez toujours les deux ensemble.",
        "Si de l'acier comprimé apparaît, c'est que la section a perdu de la ductilité, pas qu'elle manque de capacité."
      ]
    },
    {
      "k": "note",
      "t": "Tous les chiffres de cet article proviennent du module CIRSOC 201 de Stabileo, exécuté sur les sections indiquées, et non d'un tableau. Un avertissement qui mérite d'être transmis, parce que la première version de cet article s'est trompée : le calcul à la main donnait S/R = 0,74 et l'application 0,81. La différence venait du poids propre, 2 kN/m que l'application ajoute au cas des charges permanentes. L'application avait raison. Et une remarque sur l'éditeur ci-dessus, pour que les deux chiffres ne se contredisent pas : ce 0,81 suppose 2 Ø25, l'armature avec laquelle travaille cet article ; le 0,90 qu'affiche l'éditeur correspond aux barres qu'il choisit lui-même lorsqu'il dimensionne. Même poutre, deux armatures différentes. Si un chiffre de cet article cesse un jour de correspondre à l'éditeur, croyez l'éditeur."
    }
  ]
};

export default body;
