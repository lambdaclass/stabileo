import type { PostBody } from '../../types';

const body: PostBody =  {
  "title": "Wat gratis software berekent en wat ze niet uitlegt",
  "excerpt": "Er is gratis constructiesoftware, en die is goed: ze modelleert, ze berekent, ze toont resultaten. Wat we niet konden vinden is software die de geavanceerde tools vanaf de conceptuele kant benadert.",
  "blocks": [
    {
      "k": "p",
      "t": "Het is de moeite waard te beginnen met wat er wel is: er is veel, en het is goed. Wie vandaag constructieleer geeft, heeft eersteklas gratis tools tot zijn beschikking, en verschillende ervan doen hun werk beter dan wij het onze."
    },
    {
      "k": "h",
      "t": "Wat de gratis tools feitelijk dekken"
    },
    {
      "k": "table",
      "caption": "Gratis constructieanalysetools en wat ze laten zien naast het resultaat.",
      "head": [
        "Tool",
        "Gratis",
        "Wat ze heel goed doet",
        "Conceptuele kant"
      ],
      "rows": [
        [
          "Ftool",
          "Ja",
          "Vlakke raamwerken modelleren en momentenlijnen en invloedslijnen aflezen, met een vlotheid die weinigen evenaren",
          "Toont het gedrag, niet de redenering erachter"
        ],
        [
          "MASTAN2",
          "Ja (op MATLAB of de runtime ervan)",
          "Lineaire en niet-lineaire matrixanalyse, verbonden met McGuire, Gallagher en Ziemian",
          "De theorie staat in het boek; het programma voert de analyse uit"
        ],
        [
          "SkyCiv",
          "Gratis versie",
          "Handberekeningen stap voor stap: vrijlichaamsschema's, evenwichtsvergelijkingen vóór het invullen, momentenverdeling voor statisch onbepaalde liggers",
          "Getallen ingevuld in formules, voor eenvoudige statica"
        ],
        [
          "sectionproperties",
          "Ja, open source",
          "Welving, dwarskrachtmiddelpunt en de constante van Saint-Venant met eindige elementen",
          "Een Python-bibliotheek: ze geeft getallen terug, zonder interface en zonder uitleg"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Van die lijst komt SkyCiv het dichtst bij wat we gewoonlijk \"de uitwerking tonen\" noemen, en dat moet onomwonden worden gezegd: de handberekeningen zijn goed. Het tekent het vrijlichaamsschema, schrijft ΣM = 0 op voordat er een getal wordt ingevuld en lost op met momentenverdeling wanneer de ligger statisch onbepaald is. Wie beweert dat geen enkel gratis programma zijn stappen toont, kan met SkyCiv in ongeveer een minuut worden tegengesproken."
    },
    {
      "k": "h",
      "t": "De stappen tonen is niet genoeg als het programma niet zegt wanneer de formule ophoudt te gelden"
    },
    {
      "k": "p",
      "t": "Getallen invullen in een juiste formule en uitleggen waarom die formule de juiste is, zijn twee verschillende dingen. Het eerste bespaart je het rekenwerk. Het tweede bespaart je de fout die het rekenwerk niet kan opvangen, omdat de fout één laag erboven zit."
    },
    {
      "k": "p",
      "t": "De wringingscalculators die je online vindt, illustreren het punt omgekeerd: je kiest het doorsnedetype (massief, gesloten buis, rechthoek) en het programma past de bijbehorende formule toe. Geen enkele die we zagen, zegt je dat je verkeerd hebt gekozen, wat de andere theorie zou hebben gegeven of aan welke kant van de fout je zit."
    },
    {
      "k": "quote",
      "t": "Een programma dat alleen rekent, waarschuwt je nooit dat je het verkeerde aan het berekenen bent."
    },
    {
      "k": "h",
      "t": "Drie functies zonder equivalent dat we konden vinden"
    },
    {
      "k": "ul",
      "items": [
        "Kinematische analyse, uitgelegd. We hebben gezocht en vonden geen gratis tool die dit doet: wat opduikt is collegemateriaal in PDF. De \"educatieve software voor kinematische analyse\" die we wel vonden, is voor machinemechanismen (stangenstelsels en krukken), niet voor het classificeren van constructies.",
        "Wapeningsdetaillering. De enige gratis optie die we vonden is AutoRebar, en dat is een AutoCAD-invoegtoepassing, dus voor het gratis deel is een dure licentie nodig. Het werkt ook vanuit je tekening: jij plaatst de staven, het bouwt de staatlijst. Al het andere is een proefversie van zeven dagen of commerciële software. We vonden geen open-sourceoptie.",
        "Doorsnedeanalyse, uitgewerkt. Hier is een serieuze gratis optie, sectionproperties, en op welving met eindige elementen verslaat het ons waarschijnlijk. Maar het is een bibliotheek zonder interface: het geeft je het dwarskrachtmiddelpunt zonder uit te leggen waarom het daar zit."
      ]
    },
    {
      "k": "p",
      "t": "Van de tools die we hebben bekeken, dekt er geen twee van de drie, en we vonden er geen die zelfs maar één ervan vanaf de conceptuele kant benadert. Dat is de leemte die we zien, en die is smaller en preciezer dan \"wij zijn de enigen die onderwijzen\"."
    },
    {
      "k": "h",
      "t": "Eén scherm waarop het hele verschil zichtbaar wordt"
    },
    {
      "k": "p",
      "t": "Hieronder staat een ligger met twee overspanningen op drie opleggingen. Alle drie houden alleen de verticale beweging tegen. Het is het schoolvoorbeeld, en ook het geval waarvan ik het vaakst heb gezien dat het bij een tentamen als juist werd geaccepteerd."
    },
    {
      "k": "p",
      "t": "De formule voor de graad van onbepaaldheid geeft GH = 3·m + r − 3·n − c = 3×2 + 3 − 3×3 − 0 = 0. Nul betekent statisch bepaald, en elk programma dat bij de formule stopt, zal precies dat melden. Maar niets houdt de ligger horizontaal vast: het is een mechanisme en het kan niet worden berekend."
    },
    {
      "k": "table",
      "caption": "Wat kinematische analyse op die ligger teruggeeft, stap voor stap.",
      "head": [
        "Stap",
        "Waar ze naar kijkt",
        "Resultaat"
      ],
      "rows": [
        [
          "2 · Statische onbepaaldheid",
          "GH = 3·m + r − 3·n − c",
          "0"
        ],
        [
          "3 · Stijfheidsmatrix",
          "Gedetecteerde mechanismevormen",
          "1"
        ],
        [
          "3 · Stijfheidsmatrix",
          "Niet-vastgehouden vrijheidsgraden",
          "1"
        ],
        [
          "4 · Suggesties",
          "Oordeel op het scherm",
          "Kan niet worden berekend"
        ]
      ]
    },
    {
      "k": "p",
      "t": "De app meldt niet alleen de nul en wast haar handen in onschuld. Ze spreekt die tegen in dezelfde stap 2 die hem opleverde: „De formule geeft GH = 0 (noodzakelijke voorwaarde voor statisch bepaald), maar NIET voldoende”. Stap 3 assembleert de globale stijfheidsmatrix, hier 6×6, en markeert „1 mechanismevorm gedetecteerd” ondanks GH = 0 ≥ 0. Ze noemt knoop 3 en zijn horizontale verplaatsing, wijst erop dat de vergelijking van stap 2 de vasthoudingen telt zonder te controleren waar ze zitten, en sluit af met „✗ Mechanisme — kan niet worden berekend”."
    },
    {
      "k": "img",
      "base": "blog/hidden-mechanism",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic met een ligger met twee overspanningen op drie horizontale rolopleggingen onder 10 kN/m. Het paneel voor kinematische analyse toont GH = 3·2 + 3 − 3·3 = 0, en een melding luidt „Instabiele constructie (mechanisme): geen horizontale vasthouding bij enige oplegging”.",
      "caption": "Dezelfde ligger in de app: de formule geeft nul, en de solver weigert hem toch als mechanisme."
    },
    {
      "k": "embed",
      "query": "example=hidden-mechanism&kin=1",
      "label": "De ligger op drie verticale opleggingen, met het paneel voor kinematische analyse geopend. Doorloop de vier stappen: de tweede geeft GH = 0 en de derde vindt het mechanisme dat die nul verbergt. Probeer een oplegging te vervangen door een scharnierende en voer het opnieuw uit: de graad wordt 1 en het mechanisme verdwijnt."
    },
    {
      "k": "h",
      "t": "Waarom een vakgroep dit kan interesseren"
    },
    {
      "k": "p",
      "t": "Een student die de formule voor de graad leert en nooit ziet dat de voldoende voorwaarde faalt, loopt weg met een onvolledige regel en weet het niet. Het is moeilijk te laten zien op een schoolbord, omdat het voorbeeld dat het breekt eruitziet als een tikfout. Hier staat het op één scherm, met het getal en de tegenspraak naast elkaar."
    },
    {
      "k": "p",
      "t": "Er hoeft niets te worden geïnstalleerd of in licentie te worden genomen, en de vakgroep hoeft niets te kopen. Het opent in een browser en het model wordt als link gedeeld."
    },
    {
      "k": "note",
      "t": "Voor de duidelijkheid: niets hiervan betekent dat wij beter zijn. Ftool modelleert sneller en met minder wrijving dan wij. MASTAN2 heeft een leerboek achter zich dat wij niet hebben geschreven. De handberekeningen van SkyCiv zijn beter gepresenteerd dan verschillende van onze panelen. En sectionproperties lost welving op met eindige elementen waar wij benaderen. Wat wij beweren is smaller en heel specifiek: van de gratis tools die we hebben bekeken, benadert geen enkele de geavanceerde tools vanaf de conceptuele kant. Als je een gratis tool kent die kinematische analyse uitlegt, een staatlijst maakt of doorsnedeanalyse uitwerkt, schrijf ons dan en we corrigeren dit bericht."
    }
  ]
};

export default body;
