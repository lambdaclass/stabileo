import type { PostBody } from '../../types';

const body: PostBody =  {
  "title": "Zelfde model, zelfde getallen: determinisme en herkomst",
  "excerpt": "Twee berekeningen van hetzelfde model in één sessie konden in de laatste cijfers verschillen. Waarom dat gebeurde, hoe we het hebben verholpen en hoe elk rapport nu vermeldt welke versie en welke gegevens het hebben voortgebracht, zodat iedereen het kan reproduceren.",
  "blocks": [
    {
      "k": "p",
      "t": "Een ondertekend rekenrapport moet reproduceerbaar zijn. Als iemand het project over een jaar opnieuw opent, of een andere ingenieur het beoordeelt, moet hetzelfde model dezelfde getallen geven, en moet duidelijk zijn welke versie van het programma ze heeft voortgebracht."
    },
    {
      "k": "p",
      "t": "Toen we het maten, bleek dat dit niet altijd opging: twee berekeningen van hetzelfde model in één sessie konden in de laatste cijfers verschillen, en sommige resultaten kwamen in een andere volgorde uit. De verschillen waren minuscuul, maar een getal dat verandert terwijl er niets is veranderd, is een getal dat niet te controleren is."
    },
    {
      "k": "h",
      "t": "Waar het verschil vandaan kwam"
    },
    {
      "k": "p",
      "t": "De engine bewaart knopen, staven, opleggingen en belastingen in hashtabellen, en elke tabel wordt aangemaakt met een willekeurige seed: hetzelfde bestand dat twee keer wordt gelezen, wordt in twee verschillende volgordes doorlopen. Kommagetallen in een andere volgorde optellen kan het laatste bit veranderen, omdat optellen op een computer niet associatief is. De 3D-assemblers sorteerden staven al, maar de 2D-assemblers, de belastings- en opleggingslussen en de meeste andere analyses niet."
    },
    {
      "k": "ul",
      "items": [
        "Elke doorloop van een invoertabel gaat nu in een vaste volgorde, de volgorde van de sleutels: 587 plaatsen in de engine.",
        "Ook de evenwichtssommen en de kruistermen van schuine opleggingen worden in een vaste volgorde doorlopen.",
        "Waarschuwingen komen gesorteerd op knoop- of staafnummer, niet willekeurig."
      ]
    },
    {
      "k": "table",
      "caption": "Wat er in de engine is veranderd en hoe dat wordt gecontroleerd.",
      "head": [
        "Wat",
        "Aantal"
      ],
      "rows": [
        [
          "Doorlopen van invoertabellen in een vaste volgorde gezet",
          "587"
        ],
        [
          "Inleesbeurten van elk willekeurig model, bit voor bit vergeleken",
          "6"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Een test leest elk willekeurig model zes keer in, berekent het en vergelijkt de resultaten als tekst, bit voor bit, in lineaire, modale, knik- en P-Delta-analyses. Een ongeordende doorloop die een resultaat verandert, valt op als verschil tussen de runs."
    },
    {
      "k": "h",
      "t": "Elk rapport vermeldt waar het vandaan komt"
    },
    {
      "k": "p",
      "t": "Elk rekenrapport, PRO-rapport, werkboek en CSV bevat nu een herkomstblok: versie en commit van de app en van de engine, de SHA-256-vingerafdruk van de WebAssembly-module die de berekening deed, een vingerafdruk van het exacte model, van de instellingen en van de getoonde resultaten, en de status van de certificaten (een omhullende van een bewegende belasting legt minder vast: het model en de instellingen). Als het project veranderde terwijl de export werd voorbereid, wordt er niets geëxporteerd: een rapport bevat nooit de getallen van de ene toestand onder de herkomst van een andere."
    },
    {
      "k": "p",
      "t": "Met dat blok kan de app een rapport reproduceren: ze berekent het project opnieuw en vergelijkt elke vingerafdruk. Het oordeel is alleen „gereproduceerd” als ze allemaal overeenkomen (een andere WebAssembly-build wordt ernaast gemeld, niet als verschil geteld); als er een niet opnieuw kon worden berekend, staat er „onvolledig”, nooit „gereproduceerd”. Er is ook een opdrachtregeltool die dezelfde invoer twee keer berekent en de vingerafdrukken controleert."
    },
    {
      "k": "img",
      "base": "blog/reproduce",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic met het dialoogvenster „Reproduceren vanuit herkomst”: een vak om het herkomstblok van een rapport te plakken of het opgeslagen rapport te laden, en de knoppen „Solverinvoer downloaden” en „Opnieuw berekenen en vergelijken”.",
      "caption": "„Een geëxporteerd rapport controleren”: het geopende project wordt opnieuw berekend en elke vingerafdruk wordt vergeleken met die van het rapport."
    },
    {
      "k": "h",
      "t": "Oude projecten zeggen het"
    },
    {
      "k": "p",
      "t": "Elk opgeslagen project legt de resultatenversie vast waarmee het is berekend. Als een project dat vóór een wijziging is berekend die zijn functies raakt, wordt geopend, toont de app die wijzigingen, uitgelegd in jouw taal, en markeert ze de resultaten als verouderd totdat het opnieuw is berekend. Bij twijfel telt een wijziging als van toepassing: één melding te veel kost een minuut, één te weinig kan een getal verbergen dat is verschoven."
    },
    {
      "k": "h",
      "t": "Eén beperking"
    },
    {
      "k": "p",
      "t": "De app vergelijkt altijd WebAssembly met WebAssembly. De native tool reproduceerde de vingerafdrukken van de browser bit voor bit op het testmodel, maar goniometrische functies komen op elk platform uit andere bibliotheken, dus een model waarvan de assemblage ze zo gebruikt dat de twee ze anders afronden, kan in het laatste bit verschillen tussen de opdrachtregel en de browser."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "De andere helft van een getal vertrouwen: het tegen het model controleren:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/PROVENANCE.md",
      "label": "PROVENANCE.md",
      "t": "De volledige technische beschrijving:"
    }
  ]
};

export default body;
