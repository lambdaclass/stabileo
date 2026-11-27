import type { PostBody } from '../../types';
import { minimumSteelExampleRows, flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

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
      "items": flexureExampleSteps("Armature tendue : 2 Ø20 (6,28 cm²)")
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
      "rows": minimumSteelExampleRows("le minimum", "la résistance", ",")
    },
    {
      "k": "p",
      "t": "Le croisement se situe à Mu = 31,1 kN·m. Cet exemple applique le §9.6.1.2. Lorsque l’exception du §9.6.1.3 est applicable, on peut prévoir dans chaque section au moins 4/3 de l’armature requise par le calcul. Il vaut la peine de savoir de quel côté du croisement se trouve une poutre avant de discuter de son armature."
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
        "φMn [kN·m]",
        "Ductilité"
      ],
      "rows": flexureExampleRows("Conforme", "Non conforme")
    },
    {
      "k": "p",
      "t": "La section avec 2 Ø32 n’est pas conforme : sa déformation de traction est inférieure au minimum requis. Réduire φ ne satisfait pas le contrôle de ductilité. Redimensionner la section ou ses armatures."
    },
    {
      "k": "quote",
      "t": "La section avec 2 Ø32 n’est pas conforme : sa déformation de traction est inférieure au minimum requis. Réduire φ ne satisfait pas le contrôle de ductilité. Redimensionner la section ou ses armatures."
    },
    {
      "k": "h",
      "t": "Pourquoi on ajoute de l'acier comprimé"
    },
    {
      "k": "p",
      "t": "Des armatures comprimées peuvent être nécessaires dès la limite de ductilité. Ne pas attendre que l’acier tendu cesse de plastifier ; vérifier la section redimensionnée avec les profondeurs réelles des barres."
    },
    {
      "k": "p",
      "t": "L'acier comprimé sert donc à rendre sa ductilité à la section et à récupérer le coefficient. La capacité suit, comme conséquence."
    },
    {
      "k": "note",
      "t": "Des armatures comprimées peuvent être nécessaires dès la limite de ductilité. Ne pas attendre que l’acier tendu cesse de plastifier ; vérifier la section redimensionnée avec les profondeurs réelles des barres."
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
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "Commandes de dimensionnement de Stabileo PRO avec la poutre de 20×40 sélectionnée.",
      "caption": "Cette capture est antérieure à la correction des appuis. L'exemple interactif ci-dessous montre le résultat actuel."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "La poutre dans Stabileo, dans le flux de dimensionnement de PRO. Si le dimensionnement est désactivé, cliquez sur « Activer le dimensionnement pour cette visite » dans l'avis. Trois boutons, dans cet ordre : « Calculer les sollicitations », « Calculer l'acier requis » et « Dimensionner… ». Seul le troisième choisit les barres, et tant qu'il n'y a pas de barres, il n'y a rien à vérifier : le tableau indique « sans armatures ». La portée de 5 m est modélisée en deux éléments ; les deux sont vérifiés à S/R = 0,91. La flexion positive en travée (My+) est déterminante. Modifiez la charge et relancez le calcul. Le dimensionnement réglementaire dans PRO est encore en développement ; le module béton est la partie implémentée et testée."
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
      "t": "Recalculer la hauteur utile pour chaque diamètre choisi. Le tableau des capacités est vérifié avec le moteur actuel ; la capacité seule ne constitue pas une vérification complète."
    }
  ]
};

export default body;
