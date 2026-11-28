import { courseMethodCounts } from '../../posts/course-method-counts';
import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Leer constructieberekening stap voor stap in Stabileo Basic",
  "excerpt": "Basic heeft nu een cursus: kies een methode en de app berekent je constructie, of een voorbeeld, stap voor stap zoals op papier. Statica, invloedslijnen, tweede orde, plastische berekening en dynamica. Gratis.",
  "blocks": [
    {
      "k": "p",
      "t": "Rekensoftware geeft je de resultaten in één keer. Leren vraagt het tegenovergestelde: zien waar elk getal vandaan komt, in de volgorde waarin het op het bord wordt gedaan. Dat is “Stap voor stap uitgelegd”, de cursus die nu in Stabileo Basic zit. Je kiest een methode, de app past die toe op je constructie en werkt hem stap voor stap uit, met de vergelijkingen, de figuren en de getallen van dat model, en sluit af met het vergelijken van het resultaat met de matrixmethode."
    },
    {
      "k": "p",
      "t": "De cursus is geschreven door Bautista Chesta, civiel ingenieur (FIUBA), en komt in zes eenheden: de gedeelde basis, statica en klassieke methoden, invloedslijnen, tweede orde en knik, plastische berekening en dynamica. Hij is gratis, net als heel Basic: hij opent in de browser, zonder iets te installeren en zonder account, en bij de introductie waren de teksten beschikbaar in het Spaans, Engels, Portugees, Duits, Frans en Turks."
    },
    {
      "k": "h",
      "t": "Hoe je hem opent"
    },
    {
      "k": "ol",
      "items": [
        "Ga naar stabileo.com/app/basic.",
        "Druk op Geavanceerd. Op een telefoon staat het in de balk onderaan.",
        "Druk onder “Verkennen en leren” op Stap voor stap uitgelegd. De catalogus van methoden opent, gegroepeerd per onderwerp.",
        "Elke methode zegt hoe de constructie moet zijn om haar uit te proberen en of jouw model daaraan voldoet; het ? legt uit wat ze doet. “Een voorbeeld openen” laadt een model dat voldoet en opent de methode; “Openen” past haar toe op het model op het scherm.",
        "Volgende en Vorige gaan door de stappen, en de genummerde tabbladen springen naar een stap. Methoden gaat terug naar de catalogus."
      ]
    },
    {
      "k": "img",
      "base": "blog/course-catalog",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic met de catalogus “Stap voor stap uitgelegd” open in het zijpaneel: de methoden onder verplaatsingsmethode, krachtenmethode en doorlopende liggers, elk met wat de constructie moet zijn en de knoppen Openen en Een voorbeeld openen.",
      "caption": "De catalogus: elke methode zegt wat het model nodig heeft en komt met een voorbeeld dat daaraan voldoet."
    },
    {
      "k": "note",
      "t": "De uitgelegde methoden werken op vlakke modellen. In de 3D-werkruimte openen alleen de twee wizards, verplaatsingsmethode en krachtenmethode; “Een voorbeeld openen” bij een andere methode schakelt eerst terug naar het vlak."
    },
    {
      "k": "h",
      "t": "Statica, de krachtenmethode en de verplaatsingsmethode"
    },
    {
      "k": "p",
      "t": "Dit is de grootste eenheid: doorlopende liggers met de drie-momentenvergelijking en momentenverdeling, raamwerken met hoekverdraaiingsmethode, momentenverdeling met en zonder zijdelingse verplaatsing en de verplaatsingsmethode, vakwerken per knoop, per snede (Ritter) en met de compatibiliteitsmatrix, en doorbuigingen door dubbele integratie, momentenoppervlakken, virtuele arbeid en Castigliano. De graad van onbepaaldheid wordt overal op dezelfde manier geteld (GH = 3·m + r − 3·n − c voor een vlak raamwerk, GH = m + r − 2·n voor een vakwerk), met de inwendige scharnieren uitgeschreven en gesplitst in zijn uitwendige en inwendige delen."
    },
    {
      "k": "p",
      "t": "Bij de krachtenmethode kies je de basisconstructie: je geeft opleggingen of staafuiteinden vrij totdat er evenveel overtollige onbekenden zijn als de graad, en als jouw keuze een mechanisme overlaat, legt de app uit waarom in plaats van het op te lossen. Daarna doorloopt ze de negen stappen, met normaalstijfheid aan of uit en staven en veren term voor term uitgeschreven. Virtuele arbeid berekent verplaatsingen, rotaties en relatieve bewegingen, ook met veren, zettingen en temperatuur. Om het te proberen: Voorbeelden → Portaal, Geavanceerd → Stap voor stap uitgelegd → Krachtenmethode → Openen."
    },
    {
      "k": "img",
      "base": "blog/course-force-method",
      "w": 1600,
      "h": 1000,
      "alt": "De wizard van de krachtenmethode bij het voorbeeld Portaal, bij de stap van de basisconstructie: de drie reacties van de rechteroplegging zijn vrijgegeven en de app noemt de drie gekozen overtollige onbekenden.",
      "caption": "Krachtenmethode: jij kiest de basisconstructie, en de app zegt je of de keuze werkt."
    },
    {
      "k": "h",
      "t": "Invloedslijnen"
    },
    {
      "k": "p",
      "t": "Voorbeelden → Doorlopende ligger, daarna Geavanceerd → Invloedslijn, en tik op een doorsnede van de ligger. Er zijn lijnen voor reacties, moment, dwarskracht, normaalkracht, verplaatsingen en rotaties, in elke doorsnede, staafuiteinden inbegrepen, en de doorsnede kan achteraf worden verplaatst. Het paneel belast de lijn met de permanente belasting g, de veranderlijke belasting q en een puntlast P voor de uiterste waarden, tekent de omhullende langs de staaf en opent de stap-voor-stapuitleg met de figuren van Müller-Breslau. “Belastinggevallen en omhullenden” vindt de grootste en kleinste effecten. De momentenlijn is positief waar ze de onderste vezel op trek belast, zoals het statische diagram."
    },
    {
      "k": "img",
      "base": "blog/course-influence",
      "w": 1600,
      "h": 1000,
      "alt": "Het voorbeeld Doorlopende ligger met de momentenomhullende die is verkregen door de invloedslijnen te belasten, rood voor het maximum en blauw voor het minimum, en het paneel dat de momentenlijn 2 m van de linkeroplegging belast met g = 10 en q = 5 kN/m: maximum 20.00 kN·m en minimum 10.00 kN·m, elk bevestigd door een directe berekening.",
      "caption": "De invloedslijn voor het moment, belast voor haar uiterste waarden, en de omhullende langs de ligger."
    },
    {
      "k": "h",
      "t": "Tweede orde en knik"
    },
    {
      "k": "p",
      "t": "Met een belast raamwerk: Geavanceerd → P-Δ (2e orde) of Pcr (Euler). Onder “Hoe het wordt berekend” kies je de methode, met stabiliteitsfuncties φ, de geometrische matrix of de koordematrix (P/L), en uit hoeveel elementen elke staaf bestaat. P-Δ toont zijn iteraties, en B₂ = 1/(1 − 1/λ₁) komt uit het knikken van hetzelfde model met dezelfde discretisatie, naast de versterking van de verplaatsing in de knoop die in eerste orde het meest beweegt. Knik gebruikt standaard vier elementen per staaf, en wanneer de discretisatie de factor niet kan weergeven, weigert de app hem in plaats van hem te melden. In de catalogus komt de groep “Tweede orde en knik” met een raamwerk dat voor alle vier de methoden is voorbereid."
    },
    {
      "k": "h",
      "t": "Plastische berekening"
    },
    {
      "k": "p",
      "t": "Voorbeelden → Portaal, daarna Geavanceerd → Plastisch bezwijken. De eenheid is geschreven: elke belastingstap, de λ–verplaatsingskromme, de plastische rotaties, het mechanisme getekend op het model en gecontroleerd met virtuele arbeid, en een mechanisme dat je kiest door te tikken waar de scharnieren komen. Bij de introductie werden de resultaten achtergehouden. We ontdekten dat de grensberekening erachter een bezwijkfactor kan geven die tot 4,6 keer verschilt wanneer de staven worden hernummerd of omgekeerd, of de eenheden veranderen (#758). De beoordeelde correcties in resultaatversies 27–29 hieven deze weigering voor het 2D-portaal niet op. Het paneel en beide cursusmethoden verwijzen voor dit geval nog steeds naar #758."
    },
    {
      "k": "img",
      "base": "blog/course-plastic",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic met het voorbeeld Portaal en Geavanceerd → Plastisch bezwijken gekozen: er wordt geen kromme of mechanisme getoond; een omkaderde melding zegt dat de resultaten worden achtergehouden omdat de plastische bezwijkfactor in 2D tot 4,6 keer kan veranderen met nummering, staafrichting of eenheden, en linkt kwestie #758.",
      "caption": "Plastisch bezwijken van het portaal, bij de introductie achtergehouden wegens #758. Deze weigering geldt nog voor het getoonde 2D-portaal."
    },
    {
      "k": "h",
      "t": "Dynamica"
    },
    {
      "k": "p",
      "t": "Geavanceerd → Dynamisch opent het dynamicapaneel. Een systeem met één vrijheidsgraad wordt uit het model genomen, met zijn vrije respons en zijn gedwongen respons op een harmonische belasting; een systeem met meerdere vrijheidsgraden wordt opgelost met modale superpositie, het schuifgebouw inbegrepen. Massamodellen, geconcentreerd of consistent en met condensatie, worden vergeleken met de frequenties van de rekenkern, en puntmassa’s kunnen in knopen worden geplaatst, met hun rotatietraagheid, die de modale analyse ook gebruikt. In de catalogusgroep “Constructiedynamica” laadt “Een voorbeeld openen” een kolom met een massa aan de top, een schuifraamwerk met twee verdiepingen of, voor verdeelde massa, een console."
    },
    {
      "k": "img",
      "base": "blog/course-dynamics",
      "w": 1600,
      "h": 1000,
      "alt": "Een kolom als console met een massa aan de top en het dynamicapaneel open op het systeem met één vrijheidsgraad dat uit het model is genomen: k = 2250 kN/m, m = 5 t, ω = 21.21 rad/s, de gedempte vrije trilling en de respons op een harmonische kracht met haar factor β.",
      "caption": "Eén vrijheidsgraad: de kolom met een massa aan de top onder een harmonische kracht."
    },
    {
      "k": "h",
      "t": "Alles in de catalogus"
    },
    {
      "k": "table",
      "caption": "De methoden in “Stap voor stap uitgelegd”, per groep, in de volgorde van de catalogus.",
      "head": [
        "Groep",
        "Aantal",
        "Methoden"
      ],
      "rows": [
        [
          "Verplaatsingsmethode",
          courseMethodCounts.stiffness,
          "Matrixmethode, als wizard"
        ],
        [
          "Krachtenmethode",
          courseMethodCounts.flexibility,
          "Krachtenmethode, als wizard"
        ],
        [
          "Doorlopende liggers",
          courseMethodCounts.continuous,
          "Drie momenten (Clapeyron); momentenverdeling (Hardy Cross)"
        ],
        [
          "Raamwerken",
          courseMethodCounts.frames,
          "Kinematische onbekenden; momentenverdeling zonder en met zijdelingse verplaatsing; hoekverdraaiingsmethode"
        ],
        [
          "Vakwerken",
          courseMethodCounts.trusses,
          "Knopen; sneden (Ritter); compatibiliteitsmatrix"
        ],
        [
          "Vervormingen en energie",
          courseMethodCounts.deformation,
          "Dubbele integratie; momentenoppervlakken; virtuele arbeid; Castigliano; snedekrachten door sneden"
        ],
        [
          "Invloedslijnen",
          courseMethodCounts.influence,
          "Invloedslijn"
        ],
        [
          "Tweede orde en knik",
          courseMethodCounts.secondOrder,
          "P-Δ met φ-functies; P-Δ met een geometrische matrix (consistent of koordematrix P/L); knik met modustelling; knik met eigenwaarden"
        ],
        [
          "Plastische berekening",
          courseMethodCounts.plastic,
          "Kinematische methode; statische methode (voor dit 2D-portaal geweigerd wegens #758)"
        ],
        [
          "Constructiedynamica",
          courseMethodCounts.dynamics,
          "Eén vrijheidsgraad; meerdere vrijheidsgraden door modale ontbinding; verdeelde massa"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Als je constructieleer geeft, kun je hem zo in de les gebruiken: een model wordt gedeeld met een link en elke student opent het in zijn eigen browser, in zijn eigen taal. Als een stap onduidelijk is of een getal niet overeenkomt met wat je met de hand krijgt, schrijf ons: dat is precies wat we moeten weten."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Nog een tool die voor de les is gemaakt, de kinematische analyse die uitlegt waarom een constructie een mechanisme is:"
    }
  ]
};

export default body;
