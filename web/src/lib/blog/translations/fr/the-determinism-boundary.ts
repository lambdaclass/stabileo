import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "La frontière du déterminisme : pourquoi un agent d'IA ne doit pas faire les calculs",
  "excerpt": "Un modèle de langage ne peut pas garantir qu'un nombre est juste. Dans l'architecture que nous proposons pour l'ingénierie des structures, l'agent interprète et propose, et chaque nombre provient d'un solveur vérifié.",
  "blocks": [
    {
      "k": "p",
      "t": "Des décennies de logiciels commerciaux ont rendu rapide la partie purement numérique de l'analyse des structures. Assembler une matrice de rigidité et résoudre un système linéaire est un problème bien maîtrisé, et peu coûteux à calculer. Le temps de l'ingénieur part ailleurs : construire le modèle, le reconstruire chaque fois que l'architecture change, définir les charges et les combinaisons, vérifier chaque élément selon la norme de dimensionnement, et produire la note de calcul et les plans."
    },
    {
      "k": "p",
      "t": "Le goulot d'étranglement, c'est ce travail manuel autour du calcul. Construire, modifier, vérifier et documenter le modèle : c'est là qu'un agent d'IA peut aider, à une condition : il ne doit jamais toucher au calcul lui-même."
    },
    {
      "k": "h",
      "t": "Ce qu'un modèle de langage ne peut pas garantir"
    },
    {
      "k": "p",
      "t": "Un modèle de langage génère du texte de manière probabiliste. Il n'a aucune connaissance de la physique ni du comportement des systèmes réels, et il peut halluciner : produire des réponses qui semblent plausibles et n'ont aucun sens. En analyse des structures, le risque est concret. La modélisation exige un raisonnement spatial et une cohérence topologique, et quand un modèle se construit en plusieurs étapes, les erreurs s'accumulent."
    },
    {
      "k": "p",
      "t": "La contrainte la plus forte vient toutefois de la pratique professionnelle. Chaque résultat structurel est signé, avec la qualité d'auteur et la responsabilité juridique qu'implique une signature. Le nombre qui dimensionne un poteau engage l'ingénieur habilité qui le valide. Un agent qui livre des résultats non contrôlés laisse au professionnel le risque de signer un calcul que personne n'a vérifié."
    },
    {
      "k": "quote",
      "t": "L'exactitude doit être une propriété du solveur, pas du langage."
    },
    {
      "k": "h",
      "t": "La frontière du déterminisme"
    },
    {
      "k": "p",
      "t": "L'architecture sépare le raisonnement en langage naturel du calcul numérique. L'agent propose des conceptions et des scénarios, mais un résultat ne compte qu'une fois sorti d'un programme que l'agent ne peut pas modifier et qui encode la physique du problème. Le modèle choisit quel outil déterministe appeler et avec quels paramètres, et travaille avec ce que l'outil renvoie. Il ne produit jamais de nombre de lui-même et n'invente jamais de géométrie."
    },
    {
      "k": "p",
      "t": "En pratique, cela demande trois couches. La couche d'intention est l'agent : il interprète le langage naturel, pose des questions de clarification et émet des actions typées. La couche de calcul déterministe contient tout ce qui produit des données d'ingénierie : le solveur, les modules CIRSOC qui exécutent les vérifications réglementaires, et les générateurs qui développent une typologie structurelle en un modèle complet. La couche de documentation produit les notes de calcul, les plans et les métrés à partir de résultats déjà calculés."
    },
    {
      "k": "p",
      "t": "Ce schéma n'a rien de nouveau. Il domine la littérature récente sur les agents d'ingénierie et apparaît dans des domaines voisins : les agents de programmation fonctionnent parce qu'un compilateur et une suite de tests leur disent si le code compile et passe les tests, et AlphaProof démontre des théorèmes parce qu'un vérificateur formel ne laisse passer aucune erreur. Nous l'adoptons délibérément comme principe de conception."
    },
    {
      "k": "h",
      "t": "Ce que la frontière garantit, et ce qui reste en dehors"
    },
    {
      "k": "p",
      "t": "Il est utile de préciser ce que cette frontière garantit et ce qu'elle laisse de côté. Ce qu'elle garantit :"
    },
    {
      "k": "ul",
      "items": [
        "Chaque nombre énoncé par l'agent peut être rattaché à un résultat précis du solveur : combinaison, station, élément.",
        "Chaque sortie de l'IA est validée par rapport au schéma du modèle avant d'être importée, et rejetée si elle est mal formée ou contient des champs inconnus.",
        "Si le service d'IA est indisponible, le solveur, l'éditeur et les vérifications réglementaires continuent de fonctionner."
      ]
    },
    {
      "k": "p",
      "t": "Ce qu'elle ne garantit pas : que le modèle idéalisé soit le bon pour le problème réel (c'est une décision d'ingénieur), que la conception soit optimale, que les charges et les hypothèses soient complètes, ou que la lecture de la norme ne demande aucune relecture."
    },
    {
      "k": "note",
      "t": "La frontière permet de contrôler d'où vient chaque résultat ; elle ne garantit pas que le modèle que vous avez établi représente correctement le problème réel. L'agent travaille comme un assistant de dessin : il propose une modification, l'utilisateur voit un résumé de ce qui va changer et peut l'appliquer, réessayer ou annuler. Chaque modification appliquée correspond à une seule étape d'annulation."
    },
    {
      "k": "h",
      "t": "Un cas où il faut recalculer le modèle"
    },
    {
      "k": "p",
      "t": "L'ingénieur décrit un portique en béton armé de 6 m de portée et 4 m de hauteur, encastré en pied, avec une charge répartie sur la poutre. L'agent demande ce qui manque : acier ou béton ? Pieds encastrés ou articulés ? Une charge latérale ? Il émet ensuite l'action qui crée le portique. Le backend la développe de manière déterministe en un modèle de 4 nœuds, 3 éléments et 6 degrés de liberté libres. Le projet utilise un béton H-21, une poutre de 25×40 cm pour commencer, des poteaux de 30×30 cm et 30 kN/m sur la poutre."
    },
    {
      "k": "p",
      "t": "Une fois le modèle calculé, chaque poteau reprend une réaction verticale de 90 kN et l'équilibre global est exactement vérifié : ΣRz = 180 kN = q·L. Le moment déterminant de la poutre est Mu = 80,8 kN·m à mi-portée. La vérification en flexion selon CIRSOC 201 de la poutre de 25×40 avec 3Ø16 donne une capacité φMn = 73,3 kN·m : la poutre n'est donc pas conforme."
    },
    {
      "k": "table",
      "caption": "Vérification en flexion de la poutre du portique, avant et après la correction.",
      "head": [
        "État",
        "Section",
        "Armature",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "S/R",
        "Conforme"
      ],
      "rows": [
        [
          "Initial",
          "25×40 cm",
          "3Ø16",
          "80,8",
          "73,3",
          "1,10",
          "Non"
        ],
        [
          "Corrigé",
          "30×55 cm",
          "3Ø16",
          "105,6",
          "108,6",
          "0,97",
          "Oui"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Regardez la colonne Mu. Agrandir la poutre de 25×40 à 30×55 fait passer la sollicitation de 80,8 à 105,6 kN·m. Dans un portique hyperstatique, la statique fixe la somme du moment sur appui et du moment à mi-portée ; la rigidité ne change que la façon dont cette somme se répartit. Une poutre plus rigide par rapport à ses poteaux reçoit d'eux un encastrement plus faible et se comporte davantage comme une poutre sur appuis simples : son moment à mi-portée, déterminant ici, augmente."
    },
    {
      "k": "quote",
      "t": "Un agent qui estimerait l'effet sans recalculer se tromperait, et serait tout aussi convaincant en le faisant."
    },
    {
      "k": "p",
      "t": "L'exemple montre pourquoi il faut recalculer le modèle, en plus de recalculer la capacité de la nouvelle section. Dans une structure hyperstatique, agrandir une section modifie la répartition des efforts internes, et la sollicitation peut augmenter précisément dans la barre que l'on voulait soulager."
    },
    {
      "k": "h",
      "t": "Supprimer un poteau d'un bâtiment déjà dimensionné"
    },
    {
      "k": "p",
      "t": "Le deuxième cas part d'un portique de quatre travées de 5 m et trois étages de 3 m, encastré en pied, avec des poutres de 25×50 cm (4Φ16), des poteaux de 35×35 cm et 25 kN/m sur chaque poutre : 20 nœuds, 27 éléments et 45 degrés de liberté libres. Une fois le modèle calculé et vérifié, toutes les poutres sont conformes avec de la marge."
    },
    {
      "k": "p",
      "t": "Une modification architecturale supprime un poteau intérieur du rez-de-chaussée. L'action d'édition le supprime avec une validation de l'intégrité structurelle, et le modèle est recalculé ; l'équilibre global est vérifié avant et après (ΣRz = 1500 kN). Les poutres qui s'appuyaient sur ce poteau franchissent désormais 10 m et, avec les poutres alignées au-dessus d'elles, reprennent l'appui perdu. Six poutres dépassent S/R = 1."
    },
    {
      "k": "table",
      "caption": "La poutre déterminante du bâtiment dans ses trois états.",
      "head": [
        "État",
        "Section",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "S/R",
        "Conforme"
      ],
      "rows": [
        [
          "Intact",
          "25×50 (4Φ16)",
          "54,2",
          "125,3",
          "0,43",
          "Oui"
        ],
        [
          "Poteau supprimé",
          "25×50 (4Φ16)",
          "203,9",
          "125,3",
          "1,63",
          "Non"
        ],
        [
          "Redimensionné",
          "30×65 (5Φ20)",
          "189,8",
          "313,7",
          "0,61",
          "Oui"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Le moment de la poutre déterminante est presque multiplié par quatre. Avec 30×65 cm et 5Φ20 dans les poutres concernées et un nouveau calcul, toutes les poutres redeviennent conformes. Le cas montre aussi qu'une modification qui, à la main, oblige à remodéliser, réanalyser, revérifier et reprendre le ferraillage de nombreuses barres peut se traiter en une courte conversation, avec chaque nombre traçable jusqu'au solveur et soumis à l'approbation de l'ingénieur."
    },
    {
      "k": "h",
      "t": "Quatre décisions de conception derrière la frontière"
    },
    {
      "k": "ol",
      "items": [
        "Des actions typées plutôt que de la génération de code libre. Dans plusieurs systèmes antérieurs, le modèle écrit des scripts Python qui sont ensuite exécutés contre un solveur externe. Ici, la sortie de l'agent se limite à un ensemble fermé d'appels aux contrats d'entrée et de sortie explicites, chacun validé par rapport à un schéma avant son exécution. Cette frontière est plus étroite que du code arbitraire et plus facile à auditer.",
        "Notre propre solveur, plutôt qu'une couche au-dessus de celui d'un autre. Le moteur est écrit de zéro en Rust, sans dépendance externe d'algèbre linéaire, et dispose de sa propre suite de vérification par rapport à des solutions analytiques et à des cas de référence : environ 6 800 tests réussis, plus des comparaisons avec un programme commercial sur les mêmes modèles, avec des écarts inférieurs à 0,1 %.",
        "La conformité réglementaire native. Des vérifications selon CIRSOC 201 et 301, que nous n'avons trouvées implémentées nativement dans aucun logiciel libre. Le module béton est implémenté et testé ; le module acier ne vit encore que dans le frontend et n'a pas de suite de tests dédiée. Nous le précisons pour ne pas surestimer sa maturité.",
        "Il s'exécute dans le navigateur. Le moteur est compilé en WebAssembly et s'exécute localement sur la machine de l'utilisateur, sans serveur de calcul et sans rien à installer."
      ]
    },
    {
      "k": "note",
      "t": "Mise à jour du 20 octobre 2026 : depuis la version 0.2.0, le moteur revérifie chaque vérification acier selon CIRSOC 301 (un résultat qu'il ne confirme pas est affiché comme non conforme ou comme non vérifié), et le module est testé par rapport à des exemples d'application publiés ; ces vérifications restent marquées comme expérimentales jusqu'à une revue indépendante. Les chiffres de cet article sont ceux de l'article publié, calculés avec la version d'août 2026, avant les corrections de la version 0.2.0 sur les vérifications béton (avis SA-2026-002) ; ils sont cités tels qu'ils y figurent."
    },
    {
      "k": "h",
      "t": "D'un solveur testé à un solveur prouvé"
    },
    {
      "k": "p",
      "t": "La frontière garantit que chaque affirmation de l'agent peut être rattachée à une sortie du solveur. Cette garantie hérite d'une limite : le solveur est digne de confiance parce qu'il est largement testé, mais son exactitude n'a pas été prouvée formellement. Une suite de tests, aussi complète soit-elle, ne couvre que les cas auxquels ses auteurs ont pensé."
    },
    {
      "k": "p",
      "t": "Cela compte encore plus dans ce contexte. Un agent construit des modèles, les modifie en plusieurs étapes et lit les résultats pour proposer de nouvelles actions ; en chemin, le solveur reçoit des données qu'aucun ingénieur n'a relues avant qu'elles n'atteignent le moteur. Si le moteur se comporte mal dans un cas limite (une matrice de rigidité presque singulière, une géométrie dégénérée, une combinaison de charges extrême), l'agent peut citer ce résultat sans le moindre avertissement."
    },
    {
      "k": "p",
      "t": "Deux techniques peuvent réduire cet écart. Le fuzzing fondé sur les propriétés génère des milliers de modèles aléatoires valides et vérifie des invariants qui doivent être respectés pour toute entrée :"
    },
    {
      "k": "ul",
      "items": [
        "Équilibre global : ΣR = P, quels que soient la géométrie, les matériaux ou les appuis.",
        "Symétrie de la matrice de rigidité : K = Kᵀ par construction.",
        "Caractère défini positif de K pour toute structure sans mécanisme.",
        "Invariance par transformation de corps rigide : translater ou faire tourner un modèle ne modifie pas les efforts internes."
      ]
    },
    {
      "k": "p",
      "t": "La vérification formelle aborde le même écart par l'autre côté : écrire une spécification mathématique de ces propriétés et prouver, avec un assistant de preuve comme Lean 4, que l'implémentation la satisfait. Les tests peuvent trouver des erreurs ; la vérification formelle peut montrer leur absence dans le domaine spécifié. Les deux se complètent : quand le fuzzer trouve une entrée qui viole une propriété, cette propriété devient candidate à une preuve."
    },
    {
      "k": "note",
      "t": "L'objectif est un solveur dont le noyau numérique critique est formellement vérifié. À ce stade, la frontière du déterminisme deviendrait une garantie mathématique : chaque nombre cité dans une note de calcul remonterait à un calcul prouvé correct."
    },
    {
      "k": "h",
      "t": "Où nous en sommes aujourd'hui"
    },
    {
      "k": "p",
      "t": "Pour conclure, ce qui est disponible et ce qui ne l'est pas. Le solveur, l'éditeur, les vérifications CIRSOC, le mode Enseignement et la génération de notes de calcul et de plans fonctionnent aujourd'hui dans le navigateur sur stabileo.com, sans rien à installer et sans compte. La couche agent est en développement actif : ses routes fonctionnent en développement et en test sur notre propre backend, avec le même solveur et les mêmes nombres que tout le reste, mais ce backend ne fait pas encore partie du site public."
    },
    {
      "k": "p",
      "t": "Le cycle fermé avec le solveur dans la boucle, où l'agent propose, calcule, évalue et modifie sans intervention humaine, figure dans la feuille de route et n'a pas été implémenté. La couverture réglementaire native se limite à CIRSOC 201 et 301 ; le reste est un travail futur."
    },
    {
      "k": "p",
      "t": "La CAO a pris en charge la partie mécanique du dessin et le tableur l'arithmétique répétitive, tandis que le jugement d'ingénieur restait à l'ingénieur. L'agent est l'étape suivante sur cette ligne : il se charge de construire et de modifier le modèle, de saisir les charges, de lancer les vérifications et de préparer la documentation. Rien de cela ne transfère la responsabilité : le nombre signé reste celui de l'ingénieur."
    },
    {
      "k": "note",
      "t": "Ce texte est adapté de « Desarrollo de un agente estructural de cálculo sobre un solver verificado » (Chesta, Bertero, Carrone et Kingston), présenté aux JAIE 2026. Les chiffres cités sont des sorties du solveur Stabileo et de son module CIRSOC 201, tirées de cet article."
    }
  ]
};

export default body;
