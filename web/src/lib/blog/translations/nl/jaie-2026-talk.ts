import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo presenteren op het 29e Argentijnse congres voor constructietechniek",
  "excerpt": "Op 18 september presenteerden we in Córdoba paper 86N: een agent voor constructieberekeningen die wijzigingen voorstelt en elk getal overlaat aan een geverifieerde solver. Wat we lieten zien, waarom de agent gescheiden moet blijven van de berekening en wat we meenamen.",
  "blocks": [
    {
      "k": "p",
      "t": "Het 29e Argentijnse congres voor constructietechniek (JAIE) vond van 16 tot 18 september plaats in Córdoba, georganiseerd door de Asociación de Ingenieros Estructurales. Op de laatste dag presenteerden we paper 86N, \"Development of a structural calculation agent on a verified solver\", van Bautista Chesta, Raúl Bertero, Federico Carrone en Diego Kingston, in het spoor over kunstmatige intelligentie toegepast op civiele techniek."
    },
    {
      "k": "photo",
      "src": "jaie-2026-talk",
      "w": 1600,
      "h": 1200,
      "alt": "Bautista Chesta spreekt het publiek toe; op het scherm een raamwerk met vier overspanningen waarvan één ligger rood is omcirkeld, met de titel \"The structure is recomputed\".",
      "caption": "Presentatie van paper 86N. Op het scherm het moment waarop een ligger niet meer voldoet aan de toetsing en het hele model opnieuw wordt berekend."
    },
    {
      "k": "h",
      "t": "Wat we lieten zien"
    },
    {
      "k": "p",
      "t": "Het paper rust op één architectuurregel: de AI-agent interpreteert wat de ingenieur vraagt en stelt acties voor, maar elk getal komt van de solver en de CIRSOC-modules, die de agent niet kan wijzigen. Wij noemen dat de determinismegrens."
    },
    {
      "k": "p",
      "t": "In de presentatie lieten we het zien aan een portaal van gewapend beton dat niet voldoet aan de toetsing. De agent stelt een hogere ligger voor, de solver berekent het hele model opnieuw en de toetsing volgens CIRSOC 201 wordt herberekend op de nieuwe constructie: de verhouding belasting/capaciteit daalt van 1,10 naar 0,97. Het paper reproduceert die toetsing met de hand, stap voor stap."
    },
    {
      "k": "p",
      "t": "Het tweede geval was een gebouw met vier overspanningen en drie verdiepingen waarvan één kolom is weggenomen. Sommige liggers voldoen niet meer, hun doorsneden worden aangepast en elke staaf voldoet weer, waarbij de solver bij elke stap het hele model berekent."
    },
    {
      "k": "h",
      "t": "Waarom de grens nodig is"
    },
    {
      "k": "p",
      "t": "Om dat te laten zien gaven we algemene AI-assistenten vijftien keer hetzelfde verzoek voor een voorlopige dimensionering. Ze gaven zeven verschillende doorsneden terug. Het meest veelzeggende: elf runs kwamen overeen over het ontwerpmoment en stelden toch zes verschillende doorsneden voor."
    },
    {
      "k": "table",
      "caption": "Hetzelfde verzoek voor voorlopige dimensionering, herhaald, en het portaal gecorrigeerd met de solver.",
      "head": [
        "Wat",
        "Waarde"
      ],
      "rows": [
        [
          "Runs van hetzelfde verzoek",
          "15"
        ],
        [
          "Verschillende doorsneden teruggegeven",
          "7"
        ],
        [
          "Verhouding van de grootste tot de kleinste oppervlakte",
          "1.80"
        ],
        [
          "Runs die overeenkwamen over Mu = 207 kN·m",
          "11"
        ],
        [
          "Verschillende doorsneden onder die runs",
          "6"
        ],
        [
          "D/C van het portaal vóór de correctie",
          "1.10"
        ],
        [
          "D/C van het portaal na de correctie",
          "0.97"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Met een solver erachter geeft hetzelfde model elke keer hetzelfde getal, en dat getal kan worden gecontroleerd. Dat willen we een ingenieur kunnen laten ondertekenen met vertrouwen."
    },
    {
      "k": "photo",
      "src": "jaie-2026-backdrop",
      "w": 1152,
      "h": 1320,
      "alt": "Diego Kingston en Bautista Chesta, met auteursbadges, voor de sponsorwand van het congres.",
      "caption": "Met Diego Kingston, coauteur van het paper, op het congres."
    },
    {
      "k": "h",
      "t": "Wat we meenamen"
    },
    {
      "k": "p",
      "t": "We kwamen terug met contacten onder constructeurs uit het hele land en een uitnodiging om lid te worden van het netwerk van constructeurs. We spraken ook met universiteiten in Córdoba over het gebruik ervan in hun cursussen."
    },
    {
      "k": "p",
      "t": "Het volledige paper staat op stabileo.com/paper, en Stabileo draait in de browser zonder iets te installeren."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Een samenvatting van het paper, met beide gevallen en hun getallen:"
    }
  ]
};

export default body;
