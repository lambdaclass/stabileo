import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bredt ou Saint-Venant : quelle théorie de la torsion s'applique, et ce que coûte un mauvais choix",
  "excerpt": "Trois formules, une section, trois valeurs différentes. Celle qui s'applique dépend de la paroi ; quand deux s'appliquent à la fois, Bredt donne une valeur trop faible de 2 à 15 %.",
  "blocks": [
    {
      "k": "p",
      "t": "Trois formules différentes donnent la contrainte de cisaillement due à la torsion. Pour une même section, elles peuvent différer de plusieurs ordres de grandeur, et celle qui s'applique dépend du type de paroi de la section."
    },
    {
      "k": "p",
      "t": "Jusque-là, rien qui ne figure dans n'importe quel manuel. Ce qu'on explique rarement, c'est ce qui se passe quand deux des trois s'appliquent à la même section : elles donnent des réponses différentes, et l'écart va toujours dans le même sens."
    },
    {
      "k": "h",
      "t": "Les trois formules"
    },
    {
      "k": "ul",
      "items": [
        "Cauchy, τ = T·r / Iₚ. Uniquement pour les sections circulaires, et là elle est exacte : c'est le seul cas où les sections planes restent planes. La contrainte croît linéairement avec le rayon, d'un minimum sur la face intérieure à un maximum sur la face extérieure.",
        "Bredt, τ = T / (2·Aₘ·t). Pour les sections fermées à parois minces. Le moment de torsion est repris par un flux de cisaillement qui circule autour de l'aire enfermée. Aₘ est l'aire délimitée par la ligne moyenne de la paroi, et non par sa face extérieure ; confondre les deux est une erreur courante.",
        "Saint-Venant, τ = T·t / J avec J = (1/3)·Σb·t³. Pour les sections ouvertes à parois minces. Faute de contour fermé, le flux doit revenir sur lui-même dans l'épaisseur, ce qui explique que l'épaisseur apparaisse au cube."
      ]
    },
    {
      "k": "note",
      "t": "Saint-Venant est souvent présentée comme « la théorie des sections ouvertes », mais c'est la théorie générale, et les deux autres en sont des cas particuliers à solution analytique. Sur une section circulaire, sa solution coïncide exactement avec celle de Cauchy, car la symétrie circulaire empêche la section de gauchir. Sur une paroi mince fermée, sa solution est celle de Bredt."
    },
    {
      "k": "h",
      "t": "Quand deux s'appliquent, elles ne concordent pas"
    },
    {
      "k": "p",
      "t": "Prenons un tube circulaire. Cauchy s'applique et est exacte. Bredt s'applique aussi : la paroi est fermée et un flux de cisaillement en fait le tour. Mais Bredt suppose une contrainte constante dans l'épaisseur, alors que chez Cauchy elle croît avec le rayon. Bredt donne donc la moyenne, et Cauchy le maximum."
    },
    {
      "k": "table",
      "caption": "Tube circulaire creux : de combien Bredt reste en dessous de la valeur exacte, selon l'épaisseur relative de la paroi.",
      "head": [
        "t / rₘ",
        "Exemple (rₘ = 50 mm)",
        "τ Bredt / τ exacte",
        "Bredt trop faible de"
      ],
      "rows": [
        [
          "0,05",
          "paroi de 2,5 mm",
          "0,976",
          "2,4 %"
        ],
        [
          "0,10",
          "paroi de 5,0 mm",
          "0,955",
          "4,5 %"
        ],
        [
          "0,20",
          "paroi de 10,0 mm",
          "0,918",
          "8,2 %"
        ],
        [
          "0,50",
          "paroi de 25,0 mm",
          "0,850",
          "15,0 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bredt est trop faible dans les quatre cas. Pour un tube de 5 mm de paroi et de 50 mm de rayon moyen, que la règle empirique habituelle range encore parmi les parois minces, la contrainte réelle est supérieure de 4,5 % à la contrainte calculée. Avec une paroi de 10 mm, de 8,2 %."
    },
    {
      "k": "quote",
      "t": "L'erreur a toujours le même signe : Bredt donne une valeur trop faible."
    },
    {
      "k": "p",
      "t": "Un écart de 4,5 % ne saute pas aux yeux dans une vérification de dimensionnement : une barre non conforme peut donc sembler conforme."
    },
    {
      "k": "embed",
      "query": "example=torsion-tube&inspect=1&open=torsion",
      "label": "Le même tube dans Stabileo : une console CHS 105×5 sous un moment de torsion de 1 kN·m. Le panneau s'ouvre sur Torsion et affiche Cauchy 13,34 MPa et Bredt 12,73 MPa, les 95 % du tableau ci-dessus. Déplacez le point ou changez de section, et les trois valeurs se mettent à jour."
    },
    {
      "k": "h",
      "t": "Ouvrir la paroi change l'ordre de grandeur"
    },
    {
      "k": "p",
      "t": "Entre théories qui se recouvrent, l'écart est de quelques pour cent. Entre une paroi fermée et une paroi ouverte, il est de plusieurs ordres de grandeur. Prenons un tube carré de 100×100 mm à paroi de 5 mm et fendons-le sur toute sa longueur : il conserve son aire, son poids et presque toute sa rigidité en flexion."
    },
    {
      "k": "table",
      "caption": "Le même tube carré 100×100×5, fermé puis fendu longitudinalement, sous un moment de torsion de 1 kN·m.",
      "head": [
        "",
        "Fermé",
        "Fendu",
        "Facteur"
      ],
      "rows": [
        [
          "J [mm⁴]",
          "4 286 875",
          "15 833",
          "271"
        ],
        [
          "τ [MPa]",
          "11,08",
          "315,79",
          "29"
        ]
      ]
    },
    {
      "k": "p",
      "t": "La rigidité en torsion est divisée par 271 et la contrainte multipliée par 29. Un profilé en U et un tube carré de même poids se comportent très différemment en torsion."
    },
    {
      "k": "note",
      "t": "Un autre terme est souvent oublié : le gauchissement. Lorsqu'une section ouverte ne peut pas gauchir librement, parce qu'elle est encastrée ou parce que le moment de torsion varie le long de la barre, une torsion de gauchissement s'ajoute à la torsion de Saint-Venant. L'ignorer conduit aussi à une sous-estimation."
    },
    {
      "k": "h",
      "t": "Ce qu'en fait Stabileo"
    },
    {
      "k": "p",
      "t": "Stabileo affiche les trois, chacune avec sa formule, ses termes et sa valeur. Celles qui ne s'appliquent pas sont affichées aussi, avec la raison. Et quand deux sont valables pour la même section, il montre l'écart entre elles au lieu d'en choisir une sans le dire."
    },
    {
      "k": "p",
      "t": "Le centre de gravité, le centre de cisaillement et le noyau central sont traités de la même façon : calculés pas à pas, sous vos yeux, sur le polygone réel de la section plutôt qu'à partir d'une formule propre à chaque forme."
    },
    {
      "k": "note",
      "t": "Pour le voir, ouvrez l'éditeur, dessinez ou choisissez une barre, puis allez dans Avancé → Analyse de section → Torsion. Pour un tube circulaire, vous verrez Cauchy et Bredt côte à côte, avec l'écart en pourcentage entre les deux. Pour un profilé en U, vous verrez Bredt marquée comme non applicable, avec la raison."
    },
    {
      "k": "h",
      "t": "En bref"
    },
    {
      "k": "ol",
      "items": [
        "La paroi forme-t-elle un circuit fermé ? Bredt, avec Aₘ mesurée sur la ligne moyenne.",
        "Est-elle ouverte ? Saint-Venant, et l'épaisseur intervient au cube : la paroi la plus épaisse est déterminante.",
        "Est-elle circulaire ? Cauchy, et elle est exacte. Si vous utilisez aussi Bredt, attendez-vous à une valeur trop faible.",
        "Le gauchissement est-il empêché ? Alors Saint-Venant seule ne suffit pas."
      ]
    },
    {
      "k": "p",
      "t": "Dans tous les cas, notez à côté de la valeur la théorie que vous avez utilisée."
    },
    {
      "k": "link",
      "slug": "bars-or-finite-elements",
      "t": "La même question (quelle théorie s'applique, et ce que coûte un mauvais choix) se pose quand on choisit entre barres et éléments finis :"
    },
    {
      "k": "note",
      "t": "Les valeurs de cet article proviennent de solutions analytiques pour les sections indiquées : un tube circulaire creux avec Aₘ sur la ligne moyenne, et un tube carré 100×100×5 avec le J fermé de Bredt et le J ouvert de Saint-Venant. Vous pouvez les reproduire dans Stabileo avec les mêmes sections."
    }
  ]
};

export default body;
