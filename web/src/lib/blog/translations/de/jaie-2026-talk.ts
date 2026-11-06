import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo auf den 29. Argentinischen Tagen des Konstruktiven Ingenieurbaus",
  "excerpt": "Am 18. September haben wir in Córdoba den Beitrag 86N vorgestellt: einen Agenten für die Tragwerksberechnung, der Änderungen vorschlägt und jede Zahl einem verifizierten Solver überlässt. Was wir gezeigt haben, warum der Agent von der Berechnung getrennt bleiben muss und was wir mitgenommen haben.",
  "blocks": [
    {
      "k": "p",
      "t": "Die 29. Argentinischen Tage des Konstruktiven Ingenieurbaus (JAIE) fanden vom 16. bis 18. September in Córdoba statt, veranstaltet von der Asociación de Ingenieros Estructurales. Am letzten Tag haben wir den Beitrag 86N vorgestellt, „Entwicklung eines Agenten für die Tragwerksberechnung auf einem verifizierten Solver“, von Bautista Chesta, Raúl Bertero, Federico Carrone und Diego Kingston, im Themenbereich künstliche Intelligenz im Bauingenieurwesen."
    },
    {
      "k": "photo",
      "src": "jaie-2026-talk",
      "w": 1600,
      "h": 1200,
      "alt": "Bautista Chesta spricht vor dem Publikum; auf der Leinwand ein Rahmen mit vier Feldern, ein Träger rot eingekreist, darüber der Titel „Das Tragwerk wird neu berechnet“.",
      "caption": "Der Vortrag zu Beitrag 86N. Auf der Leinwand der Moment, in dem ein Träger den Nachweis nicht mehr erfüllt und das ganze Modell neu gelöst wird."
    },
    {
      "k": "h",
      "t": "Was wir gezeigt haben"
    },
    {
      "k": "p",
      "t": "Der Beitrag beruht auf einer Architekturregel: Der KI-Agent versteht, was der Ingenieur verlangt, und schlägt Aktionen vor, aber jede Zahl kommt aus dem Solver und den CIRSOC-Modulen, die der Agent nicht verändern kann. Wir nennen das die Determinismusgrenze."
    },
    {
      "k": "p",
      "t": "Im Vortrag haben wir das an einem Stahlbetonrahmen gezeigt, der den Nachweis nicht erfüllt. Der Agent schlägt einen höheren Träger vor, der Solver löst das ganze Modell neu, und der Nachweis nach CIRSOC 201 wird am neuen Tragwerk wiederholt: Der Ausnutzungsgrad sinkt von 1,10 auf 0,97. Der Beitrag rechnet diesen Nachweis Schritt für Schritt von Hand nach."
    },
    {
      "k": "p",
      "t": "Der zweite Fall war ein Gebäude mit vier Feldern und drei Geschossen, bei dem eine Stütze entfernt wird. Einige Träger erfüllen den Nachweis nicht mehr, ihre Querschnitte werden neu bemessen, und danach erfüllen alle Stäbe ihn wieder, wobei der Solver bei jedem Schritt das ganze Modell löst."
    },
    {
      "k": "h",
      "t": "Warum es die Grenze braucht"
    },
    {
      "k": "p",
      "t": "Um das zu zeigen, haben wir allgemeinen KI-Assistenten fünfzehnmal dieselbe Vorbemessungsanfrage gestellt. Sie lieferten sieben verschiedene Querschnitte. Am aufschlussreichsten: Elf Durchläufe stimmten beim Bemessungsmoment überein und schlugen trotzdem sechs verschiedene Querschnitte vor."
    },
    {
      "k": "table",
      "caption": "Dieselbe Vorbemessungsanfrage, wiederholt, und der mit dem Solver korrigierte Rahmen.",
      "head": [
        "Was",
        "Wert"
      ],
      "rows": [
        [
          "Durchläufe derselben Anfrage",
          "15"
        ],
        [
          "Gelieferte verschiedene Querschnitte",
          "7"
        ],
        [
          "Verhältnis der größten zur kleinsten Fläche",
          "1,80"
        ],
        [
          "Durchläufe mit übereinstimmendem Mu = 207 kN·m",
          "11"
        ],
        [
          "Verschiedene Querschnitte unter diesen Durchläufen",
          "6"
        ],
        [
          "Ausnutzungsgrad des Rahmens vor der Korrektur",
          "1,10"
        ],
        [
          "Ausnutzungsgrad des Rahmens nach der Korrektur",
          "0,97"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Mit einem Solver dahinter liefert dasselbe Modell jedes Mal dieselbe Zahl, und diese Zahl lässt sich prüfen. Genau das soll ein Ingenieur mit gutem Gewissen unterschreiben können."
    },
    {
      "k": "photo",
      "src": "jaie-2026-backdrop",
      "w": 1152,
      "h": 1320,
      "alt": "Diego Kingston und Bautista Chesta mit Autorenausweisen vor der Sponsorenwand der Tagung.",
      "caption": "Mit Diego Kingston, Mitautor des Beitrags, auf der Tagung."
    },
    {
      "k": "h",
      "t": "Was wir mitgenommen haben"
    },
    {
      "k": "p",
      "t": "Wir haben Kontakte zu Tragwerksplanern aus dem ganzen Land mitgenommen und die Einladung, dem Netzwerk der Tragwerksingenieure beizutreten. Außerdem haben wir mit Universitäten in Córdoba darüber gesprochen, Stabileo in ihren Lehrveranstaltungen einzusetzen."
    },
    {
      "k": "p",
      "t": "Der vollständige Beitrag steht unter stabileo.com/paper, und Stabileo läuft im Browser, ohne Installation."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Eine Zusammenfassung des Beitrags, mit beiden Fällen und ihren Zahlen:"
    }
  ]
};

export default body;
