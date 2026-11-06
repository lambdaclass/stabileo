import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Recherche, outils et vérification de nos tests",
  "excerpt": "Ce que nous avons publié ces derniers jours : des recherches exécutables, huit calculateurs et des contrôles des modèles de référence eux-mêmes. Ce qui fonctionne, ce qui était faux et ce qui reste à revoir.",
  "blocks": [
    {
      "k": "p",
      "t": "Ces derniers jours, nous avons ajouté Stabileo Research et Stabileo Tools et renforcé leurs contrôles. Stabileo est un logiciel gratuit et open source de calcul de structures avec IA, publié par Ergodic Group. LambdaClass est sa branche de développement."
    },
    {
      "k": "h",
      "t": "Des recherches que vous pouvez exécuter"
    },
    {
      "k": "p",
      "t": "Nous portons des articles publiés de calcul de structures et des benchmarks classiques dans le navigateur, avec le visualiseur de Stabileo. Chaque page précise ce qu’elle reproduit, comment nous l’avons vérifié et les limites de la comparaison. Nous complétons les pages dont certaines comparaisons restent ouvertes."
    },
    {"k": "img", "base": "blog/research", "w": 1600, "h": 1000, "alt": "La page Stabileo Research, « Recherche en génie des structures », avec la mention qu’il s’agit de recherche et non d’un outil de dimensionnement, et la première entrée exécutable, le portique de Lee (1968), avec son chemin de chargement.", "caption": "stabileo.com/research : chaque page indique ce qu’elle reproduit et comment c’est vérifié."},
    {
      "k": "p",
      "t": "Les pages disponibles couvrent la rupture par champ de phase de Shauer (2025) ; les réseaux de ressorts de Grossman et Boudaoud (2026) ; l’optimisation topologique d’Andreassen et al. (2011) ; la stabilité du portique de Roorda de Ferrari et Sigmund (2025) ; la recherche de forme de réseaux de câbles de Pastrana et al. (2026) ; les arcs à claquage de Zmyślony, Khan et Biggins (2026) ; et les coques réticulées de Fairclough et al. (2026)."
    },
    {
      "k": "p",
      "t": "Les classiques du moteur sont MacNeal–Harder, le parcours de tests de coques, l’élastique de Mattiasson, Riks/Crisfield, Newmark, CQC, la ruine plastique, la plaque de Navier, le portique de Lee et l’arc de DaDeppo–Schmidt. Les pages distinguent le calcul en direct de la lecture de résultats enregistrés et montrent les limites des comparaisons. La comparaison de Koiter de Ferrari reste inachevée ; Fairclough couvre un exemple à cinq nœuds ; le saut d’équilibre de l’arc n’est pas une simulation transitoire."
    },
    {
      "k": "p",
      "t": "Nous publions le périmètre et les preuves et les examinons ouvertement. Les résultats de recherche ne sont pas des résultats de dimensionnement, et l’accord avec un benchmark n’est pas une certification."
    },
    {
      "k": "table",
      "caption": "Disponible aujourd’hui :",
      "head": [
        "Offre",
        "Nombre"
      ],
      "rows": [
        [
          "Pages d’articles exécutables",
          "7"
        ],
        [
          "Pages de benchmarks du moteur",
          "10"
        ],
        [
          "Calculateurs",
          "8"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Les tests aussi doivent être vérifiés"
    },
    {
      "k": "p",
      "t": "Certaines pages étaient erronées parce que nos modèles de test étaient faux. Chaque page de benchmark du moteur et son test de CI lisent désormais le même fichier de cas : corriger le modèle met les deux à jour. Certaines comparaisons provisoires restent explicitement ignorées dans la CI et ne bloquent pas encore les intégrations ; nous les complétons."
    },
    {
      "k": "p",
      "t": "Nous avons corrigé les références de Mattiasson et le traitement de l’allongement axial (#845), un portique à nœuds rigides comparé à une formule de treillis purement axial (#846), ainsi que des modèles d’appuis et de chargement de coques incorrects (#810). Nous changeons la manière de construire les benchmarks pour que cette catégorie d’erreurs ne passe plus. La première partie est intégrée : chaque benchmark est une spécification avec deux références indépendantes qui doivent concorder et des contrôles automatiques de la charge appliquée, de l’équilibre des réactions et de la symétrie, avec comparaison entre demi-modèle et modèle complet. Nous ajoutons la convergence sur au moins trois maillages, un test avec erreur de signe qui prouve que chaque benchmark peut échouer et la validation d’un ingénieur pour l’ensemble principal."
    },
    {"k": "img", "base": "blog/research-mattiasson", "w": 1600, "h": 1000, "alt": "La page du benchmark de l’élastique de Mattiasson (1981), onglet Résultats : un graphique de u/L et v/L en fonction de PL²/EI avec les courbes de Stabileo et des cercles pour les références analytiques, et un tableau des valeurs avec leurs erreurs relatives. À gauche, 5 vérifications sur 5 réussies et la mention qu’il s’agit de recherche, pas d’un outil de dimensionnement.", "caption": "La page Mattiasson corrigée : la réponse du moteur face à deux références analytiques indépendantes."},
    {
      "k": "p",
      "t": "Nous intégrons aussi les unités au système de types (#864), afin de détecter les confusions kN/N ou m/mm à la compilation. La première étape, pour le chemin des matériaux et des sections des portiques 2D, a été intégrée le 3 novembre."
    },
    {
      "k": "h",
      "t": "Deuxième tour : chaque page revue à nouveau"
    },
    {
      "k": "p",
      "t": "Chaque page de recherche en ligne a ensuite fait l’objet d’une deuxième revue, par trois modèles d’IA successifs (Kimi, puis Codex, puis Claude), et chaque remarque que nous avons pu vérifier a été corrigée. Quinze pages ont été révisées ensemble et publiées le 4 novembre (#1068) : six articles (Shauer, Pastrana, Ferrari, Zmyślony, Grossman et Fairclough) et neuf benchmarks du moteur (Newmark, Riks/Crisfield, Navier, Lee, MacNeal–Harder, DaDeppo–Schmidt, l’exemple de ruine plastique d’après Horne, SRSS/CQC et Mattiasson, qui a eu un troisième tour). Aucune tolérance n’a été relâchée et aucun test n’a été supprimé. La revue par des ingénieurs en exercice reste à venir."
    },
    {
      "k": "ul",
      "items": [
        "MacNeal–Harder comparait des valeurs absolues : un résultat de signe erroné aurait donc été accepté. Les références portent maintenant leur signe, et un test rejette une réponse inversée pour chaque cas.",
        "Riks/Crisfield pouvait signaler un point limite sans chute de charge. Un point limite exige désormais une chute de charge entre des pas convergés ; la page dit que le calcul franchit le point limite supérieur au lieu de « traces the snap-through », et ses tolérances sont passées de 5 % à des valeurs entre 5e-3 et 1e-5.",
        "Navier expliquait l’erreur de MITC4 au lieu de la mesurer. Elle est maintenant comparée à une série de Reissner–Mindlin indépendante, et l’erreur de MITC4 en appui simple dur passe de −1,951 % en 4×4 à −0,036 % en 32×32, avec une convergence d’ordre deux.",
        "Les pages disent à quoi elles sont comparées. Newmark est vérifié par rapport à des solutions exactes en forme fermée, pas à « the author’s code » ; SRSS/CQC est une illustration de la méthode, pas une reproduction du bâtiment de l’article ; les bornes de ruine plastique sont nos propres dérivations à la main, pas une citation ; la référence de 1,83 kN du portique de Lee est lue sur une figure publiée, donc nous n’annonçons que des écarts en pourcentages entiers."
      ]
    },
    {
      "k": "h",
      "t": "Sur téléphones et tablettes"
    },
    {
      "k": "p",
      "t": "D’après nos mesures sur le site en ligne, les pages de recherche ne débordaient pas sur un téléphone, mais l’expérience se trouvait sous tout l’article, le visualiseur était à l’étroit (356×189 px pour une plaque carrée) et chaque page comptait 25 à 40 commandes de moins de 32 px et 14 à 20 éléments de texte de moins de 12 px. L’expérience vient maintenant juste après le titre, le visualiseur est dimensionné selon le modèle, les commandes font au moins 44 px et le texte au moins 12 px (#831)."
    },
    {"k": "img", "base": "blog/research-phone", "w": 1600, "h": 1000, "alt": "Deux captures d’écran de Stabileo Research sur téléphone, côte à côte, de 390 px de large. À gauche, la page du réseau de câbles d’après Pastrana et al. (2026), « Four cables, one equilibrium », avec la visionneuse juste sous le titre ; à droite, le benchmark de la plaque de Navier, dont la visionneuse occupe toute la largeur de l’écran et montre le déplacement vertical de la plaque vers le bas.", "caption": "La recherche sur téléphone : l’expérience après le titre et un visualiseur aussi large que l’écran."},
    {
      "k": "p",
      "t": "Un contrôle permanent affiche la galerie et chaque page exécutable à 360, 390, 844×390 et 810 px, en espagnol, en anglais et en portugais, et échoue en cas de débordement horizontal, de commandes trop petites, de texte trop petit ou de visualiseur absent, trop petit ou trop bas. Ses premières exécutions ont trouvé de vrais bugs, et ce sont les mises en page qui ont été corrigées, pas le contrôle : le visualiseur de Mattiasson faisait 187 px de haut sur téléphone en paysage et en fait maintenant 280, et un graphique de convergence affichait ses étiquettes à 9 px. Un test de reflow a montré que les onglets de Shauer débordaient en portugais et en turc à 360 px."
    },
    {
      "k": "h",
      "t": "Huit calculateurs, avec accès à l’éditeur"
    },
    {
      "k": "p",
      "t": "Stabileo Tools propose des calculateurs gratuits pour les poutres simplement appuyées, les consoles, le flambement élastique des poteaux, les poutres continues, les portiques à une travée, les treillis plans, les lignes d’influence de charges mobiles et les fréquences de flexion des poutres. Ils utilisent le moteur de production, montrent des comparaisons classiques indépendantes et précisent leurs hypothèses. Chacun ouvre son modèle dans l’éditeur complet. Ce sont des outils d’analyse, pas des vérifications réglementaires complètes."
    },
    {"k": "img", "base": "blog/tools", "w": 1600, "h": 1000, "alt": "La page Stabileo Tools, « Calculateurs d’ingénierie gratuits », qui commence par le calculateur de poutre sur deux appuis : une poutre sous charge répartie avec sa déformée et un bouton pour l’ouvrir.", "caption": "stabileo.com/tools : huit calculateurs sur le moteur de production."},
    {
      "k": "h",
      "t": "Contenir les résultats erronés"
    },
    {
      "k": "p",
      "t": "Nous travaillons à contenir tous les problèmes connus de résultats incorrects : les refus ou avertissements du moteur portent l’identifiant du problème, au lieu de renvoyer un nombre non vérifié (#807, intégré le 5 novembre). Chaque refus est testé, y compris les modèles dynamiques non pris en charge avec excentrements de barres ou de coques."
    },
    {
      "k": "p",
      "t": "Les tests métamorphiques ont révélé des défauts d’invariance : des modèles équivalents pouvaient être refusés après rotation, réflexion ou changement d’échelle des unités. Nous exécutons désormais la suite métamorphique à chaque modification pour détecter ces régressions. Nous ajoutons une exécution nocturne de modèles aléatoires qui regroupe les observations par cause racine et ouvre une issue par cause racine."
    },
    {
      "k": "h",
      "t": "Depuis : du 1er au 3 novembre"
    },
    {
      "k": "ul",
      "items": [
        "Le mode d’analyse de PRO est terminé. Des résultats faux sans aucun avertissement sont corrigés : le générateur de charges ne charge plus les avant-toits d’un hangar comme un plancher, et le poids sismique de chaque niveau inclut désormais les dalles et les murs dessinés en coques, qu’il oubliait (#1076).",
        "Les exports fonctionnent sur de vrais bâtiments. Les grandes feuilles Excel sont écrites ligne par ligne, et la note de calcul d’un bâtiment de six étages prend une dizaine de secondes au lieu de quatre minutes. « Vérifier un rapport exporté » compare maintenant les nombres imprimés, pas seulement les empreintes (#1076).",
        "PRO a reçu une aide en ligne désactivable, un état d’enregistrement dans l’en-tête, une note de calcul après l’analyse, des résultats de plaques et une visionneuse en lecture seule pour les modèles partagés, avec « Dupliquer et modifier » (#1077, #1078).",
        "Un facteur de flambement supérieur à sa borne supérieure certifiée indépendamment est désormais refusé, en 2D et en 3D (#817, version de résultats 6). Relancez la certification avant de vous fier à un certificat de flambement antérieur.",
        "Les liens partagés contenant des nombres non finis, ou des barres, appuis ou charges qui renvoient à un élément manquant, sont refusés au lieu d’être ouverts (#1058).",
        "La suite d’invariance vérifie maintenant six analyses prioritaires sous rotation, symétrie et superposition, et quatre d’entre elles sous mise à l’échelle uniforme de la rigidité (#1060)."
      ]
    },
    {
      "k": "h",
      "t": "Des contrôles qui répondent en vingt minutes"
    },
    {
      "k": "p",
      "t": "Avant d’atteindre main, chaque modification de Stabileo passe les contrôles qu’elle peut affecter, et une modification du moteur les passe tous : tests du moteur, tests unitaires web, builds de production, tests de bout en bout dans un navigateur, les instantanés de résultats et le contrôle de déterminisme. Une correction d’un résultat erroné n’arrive pas plus vite que ces contrôles ; le 4 novembre, nous avons donc travaillé sur leur vitesse. Nous avons d’abord mesuré. Dans une exécution propre de la file de fusion de 44 à 47 minutes, les tests du moteur et les tests unitaires se terminaient 8 à 15 minutes avant la fin : en lancer davantage en parallèle n’aurait rien fait gagner. Le temps partait dans la construction des bundles de recherche l’un après l’autre et dans le shard de bout en bout le plus lent. Une fois ces étapes raccourcies, le shard le plus lent l’était à cause de la préparation : dans une exécution, il a consacré 7,2 de ses 16 minutes aux tests et six et demie au téléchargement de paquets de navigateurs depuis un miroir lent."
    },
    {
      "k": "ul",
      "items": [
        "Construire une fois, tester ce qui a été construit. Les tests des builds de production faisaient cinq builds supplémentaires de leur côté, dont quatre du même arbre que la CI venait de construire ; ces quatre lisent maintenant ce build (#1411). Chaque build porte un tampon de tout ce à partir de quoi il a été construit, et un test échoue, sans jamais être ignoré, si le tampon ne correspond pas à l’arbre sur lequel il s’exécute.",
        "Mettre en cache par entrées. Chaque bundle de recherche est mis en cache sous une clé calculée sur ses propres entrées, y compris le moteur que chaque bundle lie, si bien qu’une modification d’un article ne reconstruit que cet article et qu’une modification du moteur les reconstruit tous. Une pull request réutilise les bundles que la file de fusion a déjà construits à partir des mêmes entrées, après avoir vérifié chaque fichier par rapport à sa somme de contrôle, et elle peut lire ce cache mais jamais y écrire (#1395). Les paquets de navigateurs viennent aussi d’un cache, au lieu du miroir (#1413).",
        "N’exécuter que ce qu’une modification peut affecter. Une modification de la documentation ne construit rien et se termine en une ou deux minutes au lieu d’une exécution complète. Une modification du seul site saute les jobs du moteur mais garde tous les shards de bout en bout, car 59 des 281 specs lisent du texte à l’écran (#1381). Dans la file, chaque entrée est délimitée par son propre diff par rapport à l’entrée qui la précède, ce qui est correct car une entrée n’est fusionnée que si toutes les entrées qui la précèdent ont réussi ; quand le diff manque ou n’est pas clair, tout s’exécute (#1400).",
        "Équilibrer le chemin le plus lent. Les tests de bout en bout tournent sur 14 shards au lieu de 10, équilibrés sur des durées mesurées (#1382). L’ancienne table de durées prévoyait 41,5 minutes de tests là où une exécution en a pris 69,8."
      ]
    },
    {
      "k": "table",
      "caption": "Durée réelle des exécutions de CI réussies ayant lancé tous les jobs, de leur création au dernier job, mesurée via l’API GitHub Actions. Avant : 4 novembre, de 08:00 UTC (pull requests) ou 13:48 UTC (file de fusion) à 21:10 UTC ; après : de 21:15 UTC à 03:00 UTC le 5 novembre.",
      "head": [
        "Exécutions",
        "Nombre",
        "Médiane",
        "Plage"
      ],
      "rows": [
        [
          "File de fusion, avant",
          "20",
          "42 min",
          "25 à 56 min"
        ],
        [
          "File de fusion, après",
          "10",
          "20 min",
          "15 à 26 min"
        ],
        [
          "Pull requests (première tentative), avant",
          "69",
          "59 min",
          "35 à 127 min"
        ],
        [
          "Pull requests (première tentative), après",
          "19",
          "27 min",
          "16 à 45 min"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Un contrôle rouge dont la modification n’est pas responsable"
    },
    {
      "k": "p",
      "t": "Un échec dû au réseau ou à une machine perdue est du bruit, mais c’est aussi un contrôle rouge que quelqu’un doit examiner, et l’habitude de relancer les contrôles rouges est la manière dont un vrai échec finit par passer. Les jobs en échec d’une pull request sont donc relancés une fois, automatiquement, uniquement lorsque chaque job en échec porte une preuve positive d’une panne d’infrastructure : un délai dépassé dans une étape de téléchargement, une machine de CI perdue en cours de tâche, une erreur réseau qui met fin à la dernière tentative d’un téléchargement (#1380). Tout ce qui ressemble à un échec de test n’importe où dans le journal bloque la relance, de même que tout ce que le classificateur ne reconnaît pas. Cela la garde prudente : elle relance au plus une fois et jamais après une étape de test en échec. Ce n’est pas une garantie : un échec intermittent que le classificateur prendrait à tort pour une panne d’infrastructure pourrait passer à la relance, et c’est pourquoi tout ce qu’il ne reconnaît pas bloque la relance."
    },
    {
      "k": "p",
      "t": "Deux autres corrections ont supprimé de fausses alertes. Une exécution de pull request annulée parce qu’une exécution plus récente sur le même commit l’avait remplacée affichait un contrôle obligatoire rouge ; elle saute maintenant ce contrôle, mais seulement après avoir confirmé que l’exécution plus récente existe et n’a pas échoué, car un contrôle obligatoire sauté compte comme réussi (#1397). Et un téléchargement bloqué pouvait laisser un processus détenir le verrou du gestionnaire de paquets, si bien que la nouvelle tentative échouait sur le verrou plutôt que sur le téléchargement ; une tentative n’est désormais considérée comme bloquée qu’après plusieurs minutes sans sortie, elle est arrêtée avec tout ce qu’elle a lancé, et la nouvelle tentative attend le verrou (#1408)."
    },
    {
      "k": "h",
      "t": "La suite"
    },
    {
      "k": "p",
      "t": "Nous complétons les comparaisons ouvertes et accélérons le site et le solveur. Les prochains éléments de la feuille de route sont un paquet Python (pip install stabileo) et un manuel public de vérification généré à partir des benchmarks."
    }
  ]
};

export default body;
