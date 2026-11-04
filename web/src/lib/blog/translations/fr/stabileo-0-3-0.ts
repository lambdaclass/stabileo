import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.3.0 : seize corrections de plus et tous les avis publiés",
  "excerpt": "Ce qui a changé depuis la 0.2.0 : seize défauts pouvant donner un résultat erroné, corrigés et publiés sous forme d'avis ; des certificats qui vérifient le résultat par rapport au modèle ; et les mêmes chiffres à chaque calcul.",
  "blocks": [
    {
      "k": "p",
      "t": "La version 0.3.0 est sortie le 21 octobre 2026. Depuis la 0.2.0, nous avons continué à vérifier le solveur par plusieurs voies indépendantes et trouvé seize autres défauts pouvant donner un résultat erroné. Ils sont corrigés, et chacun fait l'objet d'un avis de sécurité publié qui indique ce qui n'allait pas, qui est concerné et ce qu'il faut revérifier."
    },
    {
      "k": "note",
      "t": "stabileo.com publie chaque modification dès qu'elle est intégrée : ces corrections sont donc en ligne depuis le 19, le 20 ou le 21 octobre. L'application signale une fois que les résultats ont pu changer, et les projets enregistrés avant une modification qui les concerne demandent une revérification à l'ouverture."
    },
    {
      "k": "h",
      "t": "Relancez vos projets"
    },
    {
      "k": "p",
      "t": "Voici les cas qui peuvent le plus modifier un résultat de dimensionnement. Chaque avis contient le cas complet, calculé pas à pas, et ce qu'il faut faire des résultats déjà livrés."
    },
    {
      "k": "table",
      "caption": "Quelques corrections de la 0.3.0 : la valeur correcte et celle que donnait la version précédente.",
      "head": [
        "Avis",
        "Cas",
        "Correct",
        "Avant"
      ],
      "rows": [
        [
          "SA-2026-005",
          "Arbalétrier d'une toiture à deux versants : effort normal en pied (kN)",
          "-56,67",
          "-41,67"
        ],
        [
          "SA-2026-007",
          "Poteau cruciforme de 1,5 m : charge critique (kN)",
          "2993",
          "5860"
        ],
        [
          "SA-2026-014",
          "Portique spatial renuméroté : facteur d'effondrement plastique",
          "176,47",
          "424,3"
        ],
        [
          "SA-2026-015",
          "Mât haubané : traction dans le hauban (kN)",
          "5,18",
          "4,34"
        ],
        [
          "SA-2026-013",
          "Console en coques courbes : moment à l'encastrement (kN·m/m)",
          "35,0",
          "0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Les autres avis portent sur le spectre de réponse avec CQC, les modèles plans calculés en 3D avec des moments nodaux, les appuis passés de ressort à rigide, les arcs hors du plan X–Z, les courbes de sol p-y, t-z et q-z, la coque volumique dans les plaques minces et, pour ceux qui utilisent directement le moteur ou son API, l'analyse non linéaire matérielle, les éléments courbes MITC9 et les charges de température sur les barres."
    },
    {
      "k": "h",
      "t": "Un avertissement plutôt qu'une erreur silencieuse"
    },
    {
      "k": "ul",
      "items": [
        "Un résultat qu'un défaut encore ouvert pourrait affecter porte un avertissement qui le nomme, dans votre langue. Il en reste un : l'analyse non linéaire matérielle repose sur un modèle sécant à l'échelle de la barre entière.",
        "Quand une charge de température n'indique pas le coefficient de dilatation ou la hauteur de la section, le résultat précise quelle valeur a été adoptée.",
        "Ce qui n'a pas de solution est refusé : un moment sur un nœud que rien ne peut faire tourner, une charge de coque sur un élément d'un autre type, une courbe de sol sans les données qu'exige sa référence."
      ]
    },
    {
      "k": "h",
      "t": "Une vérification plus profonde"
    },
    {
      "k": "ul",
      "items": [
        "Certificats de bout en bout pour les portiques et les treillis : un vérificateur indépendant reconstruit la rigidité et les charges à partir du modèle et certifie les déplacements par rapport au modèle, et pas seulement par rapport aux matrices assemblées par le moteur. Il a déjà trouvé trois cas où le moteur et le modèle ne concordaient pas.",
        "Le même modèle donne toujours les mêmes chiffres, au bit près, et chaque rapport, classeur et CSV enregistre la version et les données qui l'ont produit.",
        "Le dimensionnement du béton selon CIRSOC 201 provient d'une implémentation unique dans le moteur.",
        "Estimations de l'erreur de maillage pour les plaques et les coques, présentées comme des estimations, jamais comme certifiées."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "La liste complète des avis, avec ce qu'il faut revérifier pour chacun :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.3.0.md",
      "label": "Notes de version 0.3.0",
      "t": "Les notes complètes, avec les limitations connues :"
    }
  ]
};

export default body;
