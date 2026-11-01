import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Même modèle, mêmes chiffres : déterminisme et provenance",
  "excerpt": "Deux calculs du même modèle dans une même session pouvaient différer sur les derniers chiffres. Pourquoi, comment nous l'avons corrigé, et comment chaque rapport indique désormais la version et les données qui l'ont produit, pour que chacun puisse le reproduire.",
  "blocks": [
    {
      "k": "p",
      "t": "Une note de calcul signée doit être reproductible. Si quelqu'un rouvre le projet dans un an, ou si un autre ingénieur la contrôle, le même modèle doit donner les mêmes chiffres, et il doit être clair quelle version du logiciel les a produits."
    },
    {
      "k": "p",
      "t": "En le mesurant, nous avons constaté que ce n'était pas toujours le cas : deux calculs du même modèle dans une même session pouvaient différer sur les derniers chiffres, et certains résultats sortaient dans un ordre différent. Les écarts étaient minimes, mais un chiffre qui change alors que rien n'a changé est un chiffre que l'on ne peut pas vérifier."
    },
    {
      "k": "h",
      "t": "D'où venait l'écart"
    },
    {
      "k": "p",
      "t": "Le moteur range les nœuds, les barres, les appuis et les charges dans des tables de hachage, et chaque table est créée avec une graine aléatoire : le même fichier lu deux fois est parcouru dans deux ordres différents. Additionner des nombres à virgule flottante dans un autre ordre peut changer le dernier bit, car l'addition en machine n'est pas associative. Les assembleurs 3D triaient déjà les barres, mais pas les assembleurs 2D, ni les boucles sur les charges et les appuis, ni la plupart des autres analyses."
    },
    {
      "k": "ul",
      "items": [
        "Chaque parcours d'une table d'entrée suit désormais un ordre fixe, celui de ses clés : 587 endroits dans le moteur.",
        "Les sommes d'équilibre et les termes croisés des appuis inclinés sont eux aussi parcourus dans un ordre fixe.",
        "Les avertissements sortent triés par numéro de nœud ou de barre, et non au hasard."
      ]
    },
    {
      "k": "table",
      "caption": "Ce qui a changé dans le moteur, et comment c'est vérifié.",
      "head": [
        "Quoi",
        "Nombre"
      ],
      "rows": [
        [
          "Parcours de tables d'entrée mis dans un ordre fixe",
          "587"
        ],
        [
          "Lectures de chaque modèle aléatoire comparées au bit près",
          "6"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Un test lit chaque modèle aléatoire six fois, le calcule et compare les résultats sous forme de texte, au bit près, en analyse linéaire, modale, de flambement et P-Delta. Un parcours non ordonné qui modifie un résultat apparaît comme une différence entre les exécutions."
    },
    {
      "k": "h",
      "t": "Chaque rapport indique son origine"
    },
    {
      "k": "p",
      "t": "Chaque note de calcul, rapport PRO, classeur et CSV porte désormais un bloc de provenance : version et commit de l'application et du moteur, empreinte SHA-256 du module WebAssembly qui a effectué le calcul, une empreinte du modèle exact, des paramètres et des résultats affichés, et l'état des certificats (une enveloppe de charge mobile en enregistre moins : son modèle et ses paramètres). Si le projet a changé pendant la préparation de l'export, rien n'est exporté : un rapport ne porte jamais les chiffres d'un état sous la provenance d'un autre."
    },
    {
      "k": "p",
      "t": "Grâce à ce bloc, l'application peut reproduire un rapport : elle recalcule le projet et compare chaque empreinte. Le verdict n'est « reproduit » que si toutes concordent (une compilation WebAssembly différente est signalée à côté, sans compter comme une différence) ; si l'une d'elles n'a pas pu être recalculée, il indique « incomplet », jamais « reproduit ». Il existe aussi un outil en ligne de commande qui calcule deux fois la même entrée et vérifie les empreintes."
    },
    {
      "k": "h",
      "t": "Les anciens projets le signalent"
    },
    {
      "k": "p",
      "t": "Chaque projet enregistré conserve la version des résultats avec laquelle il a été calculé. Quand on ouvre un projet calculé avant une modification qui concerne ses fonctionnalités, l'application liste ces modifications, expliquées dans votre langue, et marque les résultats comme périmés jusqu'à un nouveau calcul. En cas de doute, une modification est considérée comme applicable : un avis de trop coûte une minute, un avis de moins peut cacher un chiffre qui a bougé."
    },
    {
      "k": "h",
      "t": "Une limite"
    },
    {
      "k": "p",
      "t": "L'application compare toujours WebAssembly avec WebAssembly. L'outil natif a reproduit au bit près les empreintes du navigateur sur le modèle de test, mais les fonctions trigonométriques proviennent de bibliothèques différentes sur chaque plateforme : un modèle dont l'assemblage les utilise d'une manière que les deux arrondissent différemment pourrait différer sur le dernier bit entre la ligne de commande et le navigateur."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "L'autre moitié de la confiance dans un chiffre : le vérifier par rapport au modèle :"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/verification/PROVENANCE.md",
      "label": "PROVENANCE.md",
      "t": "La description technique complète :"
    }
  ]
};

export default body;
