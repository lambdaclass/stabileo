import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Barres ou éléments finis ? Deux modèles, pas deux méthodes",
  "excerpt": "Pour une barre prismatique, la méthode des déplacements est le cas particulier exact de la méthode des éléments finis. Ce qui change, c'est le modèle, et pour une poutre de grande hauteur le modèle à barres donne une flèche trop faible de 19 à 34 %.",
  "blocks": [
    {
      "k": "p",
      "t": "« Faut-il utiliser la méthode des déplacements ou les éléments finis ? » La question revient dans chaque salle de cours et chaque bureau d'études, et elle est mal posée. Le problème est qu'elle traite les deux comme des alternatives interchangeables, ce qu'elles ne sont pas."
    },
    {
      "k": "p",
      "t": "La méthode des déplacements est la méthode des éléments finis appliquée aux barres. Ce qui distingue un programme « à barres » d'un programme « aux éléments finis », c'est le modèle. Un élément de barre porte une théorie unidimensionnelle de la déformation d'une barre ; un maillage de coques est un milieu continu bidimensionnel discrétisé. Choisir entre les deux est une décision d'ingénieur, et cet article explique quand la prendre et ce que coûte une erreur."
    },
    {
      "k": "h",
      "t": "Une barre droite n'a pas besoin de maillage"
    },
    {
      "k": "p",
      "t": "En éléments finis, le déplacement à l'intérieur de chaque élément est approché par des fonctions de forme. Pour une barre en flexion, les fonctions habituelles sont les polynômes cubiques d'Hermite. Or la solution de l'équation de la poutre d'Euler-Bernoulli sans charge le long de la portée est elle-même un polynôme cubique : l'approximation coïncide donc avec la solution exacte."
    },
    {
      "k": "p",
      "t": "C'est pourquoi la matrice de rigidité d'une barre prismatique, celle de n'importe quel manuel de calcul matriciel, est exacte, et pourquoi découper une barre en plusieurs éléments n'améliore rien. Avec une charge répartie, il en va de même aux nœuds, à condition que les charges nodales équivalentes soient calculées de façon cohérente."
    },
    {
      "k": "table",
      "caption": "Poutre sur appuis simples de 6 m, section 20×60, 10 kN/m, E = 30 000 MPa. Flèche à mi-portée avec la poutre découpée en différents nombres d'éléments de barre.",
      "head": [
        "Éléments de barre dans la poutre",
        "Flèche à mi-portée [mm]"
      ],
      "rows": [
        [
          "2",
          "1,5625"
        ],
        [
          "4",
          "1,5625"
        ],
        [
          "10",
          "1,5625"
        ],
        [
          "50",
          "1,5625"
        ],
        [
          "Formule fermée 5qL⁴/384EI",
          "1,5625"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Deux éléments ou cinquante, le moteur renvoie le même nombre, et il correspond à la formule fermée."
    },
    {
      "k": "quote",
      "t": "Mailler une barre droite ne la rend pas plus précise : cela la rend plus lente."
    },
    {
      "k": "note",
      "t": "Cette exactitude vaut dans le cadre de la théorie des poutres. La matrice résout exactement l'équation d'Euler-Bernoulli, mais si la barre ne se comporte pas comme une poutre d'Euler-Bernoulli, une solution exacte de cette équation ne sert à rien. La suite de cet article porte sur ces cas."
    },
    {
      "k": "h",
      "t": "Là où ils divergent"
    },
    {
      "k": "p",
      "t": "La théorie d'Euler-Bernoulli suppose que les sections planes restent planes et perpendiculaires à l'axe, ce qui revient à négliger la déformation d'effort tranchant. Pour une poutre élancée, c'est une très bonne approximation. Pour une poutre de grande hauteur, ce n'en est pas une."
    },
    {
      "k": "p",
      "t": "Nous avons pris la même poutre de 6 m sous la même charge et augmenté sa hauteur pas à pas. Chaque cas a été calculé deux fois : avec des éléments de barre, comme le fait le mode Basique, et comme une coque MITC4 maillée dans le plan de la poutre, ce que permet le mode PRO."
    },
    {
      "k": "table",
      "caption": "Poutre sur appuis simples de 6 m, 20 cm de large, 10 kN/m, E = 30 000 MPa, ν = 0,2. Flèche à mi-portée, sur l'axe.",
      "head": [
        "L/h",
        "Hauteur h [m]",
        "Éléments de barre [mm]",
        "Coques [mm]",
        "Écart par défaut du modèle à barres"
      ],
      "rows": [
        [
          "20",
          "0,30",
          "12,500",
          "12,567",
          "0,5 %"
        ],
        [
          "10",
          "0,60",
          "1,5625",
          "1,5961",
          "2,1 %"
        ],
        [
          "5",
          "1,20",
          "0,19531",
          "0,21206",
          "7,9 %"
        ],
        [
          "3",
          "2,00",
          "0,042188",
          "0,052145",
          "19,1 %"
        ],
        [
          "2",
          "3,00",
          "0,012500",
          "0,019017",
          "34,3 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "À L/h = 10, une poutre ordinaire, l'écart est de 2 %. À L/h = 5, il atteint presque 8 %. À L/h = 3, le modèle à barres donne une flèche plus faible de 19 %, et à L/h = 2, plus faible d'un tiers."
    },
    {
      "k": "quote",
      "t": "Le modèle à barres rend toujours la poutre plus rigide qu'elle ne l'est réellement."
    },
    {
      "k": "h",
      "t": "Le vérifier avec une calculatrice"
    },
    {
      "k": "p",
      "t": "Inutile de croire la coque sur parole. La théorie des poutres de Timoshenko inclut la déformation d'effort tranchant et, pour une poutre sur appuis simples sous charge uniforme, elle ajoute un terme à la flèche : q·L² / (8·κ·G·A), avec κ = 5/6 pour une section rectangulaire et G = E / (2·(1+ν))."
    },
    {
      "k": "table",
      "caption": "Poutre à L/h = 3 (portée de 6 m, 2 m de hauteur) : quatre réponses à la même question.",
      "head": [
        "Modèle",
        "Flèche à mi-portée [mm]"
      ],
      "rows": [
        [
          "Éléments de barre (Euler-Bernoulli)",
          "0,0422"
        ],
        [
          "Éléments de barre plus le terme d'effort tranchant, à la main",
          "0,0530"
        ],
        [
          "Coques MITC4",
          "0,0521"
        ],
        [
          "Élasticité plane, formule fermée",
          "0,0523"
        ]
      ]
    },
    {
      "k": "p",
      "t": "À L/h = 3, ce terme vaut 0,0108 mm ; ajouté aux 0,0422 mm d'Euler-Bernoulli, il donne 0,0530 mm. La coque donne 0,0521 mm, et la solution fermée d'élasticité plane de Timoshenko et Goodier donne 0,0523 mm. Les trois réponses qui tiennent compte de l'effort tranchant concordent à 2 % près. Celle qui l'ignore est trop faible de 19 %."
    },
    {
      "k": "note",
      "t": "La flèche ne dit pas tout. À cette hauteur, la distribution des contraintes normales n'est plus linéaire, et la formule de Navier ne s'applique plus non plus. C'est pourquoi l'ACI 318, base du CIRSOC 201, traite comme poutre de grande hauteur toute barre dont la portée libre ne dépasse pas quatre fois sa hauteur, et exige un dimensionnement qui tienne compte de la distribution non linéaire des déformations, par exemple avec un modèle bielles-tirants."
    },
    {
      "k": "h",
      "t": "Quelques centièmes de millimètre, est-ce important ?"
    },
    {
      "k": "p",
      "t": "Pour cette poutre seule, pas vraiment. Dans une structure isostatique, une erreur de rigidité n'affecte que la flèche, et une poutre de 2 m de hauteur fléchit de toute façon très peu. L'erreur commence à compter quand la rigidité décide de la répartition des charges, ce qui se produit dans toute structure hyperstatique."
    },
    {
      "k": "p",
      "t": "Le cas typique est le voile de contreventement. Dans un modèle à barres, un voile est un poteau très large : il reçoit l'inertie du voile et se place sur l'axe du voile. Pour un voile trapu, long par rapport à sa hauteur, l'élément de barre le rend nettement plus rigide qu'il ne l'est réellement."
    },
    {
      "k": "table",
      "caption": "Voile de 20 cm d'épaisseur, encastré en pied, avec 100 kN appliqués horizontalement en tête. Déplacement du bord supérieur.",
      "head": [
        "Voile, longueur × hauteur [m]",
        "Hauteur / longueur",
        "Élément de barre [mm]",
        "Coque [mm]",
        "Rigidité excédentaire de l'élément de barre"
      ],
      "rows": [
        [
          "4 × 3",
          "0,75",
          "0,0281",
          "0,0627",
          "2,23 fois"
        ],
        [
          "3 × 3",
          "1,00",
          "0,0667",
          "0,1129",
          "1,69 fois"
        ],
        [
          "2 × 3",
          "1,50",
          "0,2250",
          "0,2943",
          "1,31 fois"
        ],
        [
          "3 × 6",
          "2,00",
          "0,533",
          "0,625",
          "1,17 fois"
        ],
        [
          "3 × 9",
          "3,00",
          "1,800",
          "1,937",
          "1,08 fois"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Un voile de 4 m de long et 3 m de haut, soit un étage, ressort 2,2 fois plus rigide quand on le modélise avec un élément de barre. Un voile de 3 m de long et 9 m de haut, soit trois étages, n'est plus rigide que de 8 %. L'écart compte surtout pour les voiles trapus."
    },
    {
      "k": "p",
      "t": "Et cela change la répartition de l'effort tranchant. Prenons deux voiles sur une même file, l'un de 4 m et l'autre de 2 m de long, tous deux de 3 m de haut et liés par la dalle. Avec des éléments de barre, le voile court reprend 11,1 % de l'effort tranchant. Avec des coques, il en reprend 17,6 %, soit 58 % de plus que ce que prévoit le modèle à barres. La charge supplémentaire que le modèle à barres attribue au voile long est retirée au voile court, qui finit dimensionné pour un effort tranchant inférieur à celui qu'il reprendra réellement."
    },
    {
      "k": "h",
      "t": "Des questions auxquelles un modèle à barres ne peut pas répondre"
    },
    {
      "k": "p",
      "t": "Jusqu'ici, il s'agissait de cas où les éléments de barre donnent un mauvais nombre. Dans d'autres, ils ne peuvent donner aucun nombre, parce que la question n'a pas de place dans le modèle."
    },
    {
      "k": "ul",
      "items": [
        "Un plancher-dalle. La façon dont le moment se partage entre la bande sur appuis et la bande centrale, et la part qui se concentre au-dessus de chaque poteau, est une information bidimensionnelle. Un grillage de poutres peut l'approcher, mais cette information n'est pas dans le modèle.",
        "Un voile avec ouvertures. Un élément de barre n'a qu'une seule section en chaque point de son axe : une fenêtre au milieu du voile n'a donc nulle part où aller.",
        "Le nœud. Dans un modèle à barres, le nœud poutre-poteau est un point, et le moment maximal apparaît donc sur l'axe. En réalité, le nœud a la taille du poteau, et la section que l'on dimensionne est celle au nu du poteau.",
        "Une charge concentrée près d'un appui. Les sections planes ne restent pas planes dans cette zone, pour la même raison que dans la poutre de grande hauteur."
      ]
    },
    {
      "k": "h",
      "t": "Là où ils doivent concorder"
    },
    {
      "k": "p",
      "t": "L'autre moitié de l'argument compte tout autant. Pour la poutre élancée de la première ligne, à L/h = 20, éléments de barre et coques diffèrent de 0,5 %. Ce n'est pas zéro, car l'effort tranchant est toujours présent, mais c'est négligeable. Et c'est ce qu'on doit attendre : si les deux modèles ne concordent pas sur une barre élancée, vérifiez d'abord le modèle aux éléments finis, et en particulier le maillage."
    },
    {
      "k": "note",
      "t": "Le verrouillage en cisaillement est un exemple classique d'élément défaillant. Un quadrangle de plaque épaisse formulé naïvement devient bien plus rigide qu'il ne devrait quand la plaque est mince, et la dalle se comporte comme si elle était plus épaisse. L'élément MITC4 de Stabileo existe pour l'éviter : il interpole différemment les déformations de cisaillement, de sorte que l'élément ne se verrouille pas."
    },
    {
      "k": "link",
      "slug": "torsion-bredt-saint-venant",
      "t": "Choisir la théorie selon l'épaisseur, et ce que coûte un mauvais choix, c'est la même question que pose la torsion :"
    },
    {
      "k": "h",
      "t": "Les deux modèles dans un même programme"
    },
    {
      "k": "p",
      "t": "Disposer d'éléments de barre et de coques dans le même programme n'a rien de nouveau. SAP2000, ETABS, Robot et midas combinent les deux dans un même modèle, et c'est le minimum attendu d'un logiciel professionnel. Mais ils ne sont pas conçus pour expliquer ce qu'ils calculent. À l'autre extrémité, des outils d'enseignement comme Ftool et MASTAN2 enseignent très bien le calcul des barres, mais s'arrêtent avant les éléments finis."
    },
    {
      "k": "p",
      "t": "Stabileo réunit les deux modes dans un même programme. Le mode Basique calcule avec des éléments de barre et déroule la méthode des déplacements en neuf étapes : numérotation des degrés de liberté, matrices locales, transformation, assemblage, vecteur des charges, conditions aux limites, résolution, réactions et efforts internes. Le mode PRO calcule par éléments finis, avec des coques MITC4 et des plaques DKT aux côtés des éléments de barre. Parmi les outils que nous avons examinés, nous n'en avons pas trouvé d'autre qui permette d'apprendre le fonctionnement de l'analyse puis de l'appliquer à un modèle plus complet sans changer d'outil."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-bar",
      "label": "La poutre à L/h = 3 en mode Basique : portée de 6 m, section 20×200 cm et 10 kN/m, modélisée avec deux éléments de barre. Survolez le milieu de la poutre : l'affichage indique « uz : -0.042 mm », ce qui correspond à la formule d'Euler-Bernoulli."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-shell",
      "mode": "pro",
      "label": "La même poutre en mode PRO, modélisée comme une coque de 192 éléments MITC4 de 25 cm. Sous Analyse → Déplacements, le nœud 113 (à mi-portée, à mi-hauteur) indique « -5.19e-5 » m, soit 0,0519 mm. Le tableau ci-dessus utilise un maillage plus fin et donne 0,0521 mm. PRO est en version bêta."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Ce que les outils gratuits expliquent et n'expliquent pas, outil par outil :"
    },
    {
      "k": "h",
      "t": "En résumé"
    },
    {
      "k": "ol",
      "items": [
        "Pour une barre prismatique, la méthode des déplacements est le cas particulier exact des éléments finis. Ce que vous choisissez, c'est le modèle.",
        "Une barre droite n'a pas besoin de maillage. Si la découper change le résultat, c'est que quelque chose d'autre ne va pas.",
        "En dessous de L/h ≈ 5, le modèle à barres sous-estime la flèche de plus de 8 %, et en dessous de 3, de plus de 19 %. Il rend toujours la poutre plus rigide.",
        "Dans une structure hyperstatique, cette erreur modifie la répartition des charges. Vérifiez les voiles trapus avant les poutres.",
        "Les planchers-dalles, les voiles avec ouvertures et les charges près des appuis posent des questions auxquelles un modèle à barres ne peut pas répondre.",
        "Là où la barre est élancée, les deux modèles doivent concorder. S'ils ne concordent pas, vérifiez le maillage."
      ]
    },
    {
      "k": "note",
      "t": "Comment les nombres ont été calculés : tous proviennent du moteur de Stabileo, celui qu'utilise l'application. Éléments de barre : Euler-Bernoulli, avec les appuis sur l'axe. Coques : MITC4 dans le plan de la poutre, avec 24 éléments sur la hauteur (16 changent le quatrième chiffre), la charge sur le bord supérieur et les appuis répartis sur toute la hauteur des sections d'extrémité. Voiles : la même formulation, avec la base encastrée sur toute sa longueur et la charge horizontale répartie le long du bord supérieur. Le terme d'effort tranchant et la solution d'élasticité plane sont des formules fermées que l'on peut vérifier à la main."
    }
  ]
};

export default body;
