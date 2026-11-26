import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bredt of Saint-Venant: welke torsietheorie geldt, en wat de verkeerde keuze kost",
  "excerpt": "Drie formules, één doorsnede, drie verschillende getallen. Welke geldt hangt af van de wand; waar er twee tegelijk gelden, komt Bredt 2 tot 15% te laag uit.",
  "blocks": [
    {
      "k": "p",
      "t": "Drie verschillende formules geven de schuifspanning door wringing. Voor dezelfde doorsnede kunnen ze ordes van grootte verschillen, en welke geldt hangt af van het soort wand dat de doorsnede heeft."
    },
    {
      "k": "p",
      "t": "Dat staat in elk leerboek. Wat zelden wordt uitgelegd is wat er gebeurt wanneer twee van de drie gelden voor dezelfde doorsnede: ze geven verschillende antwoorden, en het verschil gaat altijd dezelfde kant op."
    },
    {
      "k": "h",
      "t": "De drie formules"
    },
    {
      "k": "ul",
      "items": [
        "Cauchy, τ = T·r / Iₚ. Alleen voor cirkelvormige doorsneden, en daar is ze exact: het is het enige geval waarin vlakke doorsneden vlak blijven. De spanning groeit lineair met de straal, van een minimum aan de binnenzijde tot een maximum aan de buitenzijde.",
        "Bredt, τ = T / (2·Aₘ·t). Voor gesloten dunwandige doorsneden. Het wringend moment wordt gedragen door een schuifstroom die rond het ingesloten oppervlak circuleert. Aₘ is het oppervlak dat door de middellijn van de wand wordt ingesloten, niet door de buitenzijde; die twee door elkaar halen is een veelgemaakte fout.",
        "Saint-Venant, τ = T·t / J met J = (1/3)·Σb·t³. Voor open dunwandige doorsneden. Zonder gesloten pad moet de stroom over de dikte op zichzelf terugkeren, en daarom komt de dikte in de derde macht voor."
      ]
    },
    {
      "k": "note",
      "t": "Saint-Venant wordt vaak gepresenteerd als \"de theorie voor open doorsneden\", maar het is de algemene theorie, en de andere twee zijn bijzondere gevallen ervan met oplossingen in gesloten vorm. Bij een cirkelvormige doorsnede komt haar oplossing exact overeen met Cauchy, omdat cirkelsymmetrie betekent dat de doorsnede niet welft. Bij een dunne gesloten wand is haar oplossing die van Bredt."
    },
    {
      "k": "h",
      "t": "Als er twee gelden, verschillen ze"
    },
    {
      "k": "p",
      "t": "Neem een cirkelvormige buis. Cauchy is van toepassing en is exact. Bredt is ook van toepassing: de wand is gesloten en er loopt een schuifstroom omheen. Maar Bredt veronderstelt dat de spanning constant is over de dikte, terwijl ze bij Cauchy met de straal groeit. Bredt geeft dus het gemiddelde en Cauchy het maximum."
    },
    {
      "k": "table",
      "caption": "Cirkelvormige holle buis: hoeveel Bredt onder de exacte waarde blijft, per relatieve wanddikte.",
      "head": [
        "t / rₘ",
        "Voorbeeld (rₘ = 50 mm)",
        "τ Bredt / τ exact",
        "Bredt te laag met"
      ],
      "rows": [
        [
          "0.05",
          "wand van 2.5 mm",
          "0.976",
          "2.4 %"
        ],
        [
          "0.10",
          "wand van 5.0 mm",
          "0.955",
          "4.5 %"
        ],
        [
          "0.20",
          "wand van 10.0 mm",
          "0.918",
          "8.2 %"
        ],
        [
          "0.50",
          "wand van 25.0 mm",
          "0.850",
          "15.0 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bredt is in alle vier de gevallen te laag. Bij een buis met een wand van 5 mm en een gemiddelde straal van 50 mm, die volgens de gebruikelijke vuistregel nog als dunwandig geldt, is de werkelijke spanning 4,7% hoger dan de berekende. Bij een wand van 10 mm 8,9%."
    },
    {
      "k": "quote",
      "t": "De fout heeft altijd hetzelfde teken: Bredt komt te laag uit."
    },
    {
      "k": "p",
      "t": "Een verschil van 4,5% valt in een toetsing niet op, dus een staaf die niet voldoet kan eruitzien alsof hij wel voldoet."
    },
    {
      "k": "img",
      "base": "blog/torsion-tube",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Basic met een CHS 105×5 console onder een wringend moment van 1 kN·m. Het doorsnedepaneel staat open op Torsion: T = 1.00 kN·m, τmax = 13.34 MPa, J = 393.7 cm⁴, met het label “Circular — exact”, gevolgd door de drie theorieën, te beginnen met Saint-Venant.",
      "caption": "De buis uit de tabel in Stabileo: 13,34 MPa, met daaronder elke theorie en haar formule."
    },
    {
      "k": "embed",
      "query": "example=torsion-tube&inspect=1&open=torsion",
      "label": "Dezelfde buis in Stabileo: een CHS 105×5 console onder een wringend moment van 1 kN·m. Het paneel opent op Torsion en toont Cauchy 13,34 MPa en Bredt 12,73 MPa, de 95% uit de tabel hierboven. Verplaats het punt of wijzig de doorsnede en alle drie de waarden worden bijgewerkt."
    },
    {
      "k": "h",
      "t": "Een open wand verandert de orde van grootte"
    },
    {
      "k": "p",
      "t": "Tussen elkaar overlappende theorieën is het verschil enkele procenten. Tussen een gesloten en een open wand zijn het ordes van grootte. Neem een vierkante buis van 100×100 mm met een wand van 5 mm en snijd hem in de lengterichting open: hij behoudt zijn oppervlak, zijn gewicht en bijna al zijn buigstijfheid."
    },
    {
      "k": "table",
      "caption": "Dezelfde vierkante buis 100×100×5, gesloten en met een lengtesnede, onder een wringend moment van 1 kN·m.",
      "head": [
        "",
        "Gesloten",
        "Opengesneden",
        "Factor"
      ],
      "rows": [
        [
          "J [mm⁴]",
          "4,286,875",
          "15,833",
          "271"
        ],
        [
          "τ [MPa]",
          "11.08",
          "315.79",
          "29"
        ]
      ]
    },
    {
      "k": "p",
      "t": "De wringstijfheid daalt met een factor 271 en de spanning stijgt met een factor 29. Een U-profiel en een vierkante buis van hetzelfde gewicht gedragen zich bij wringing heel verschillend."
    },
    {
      "k": "note",
      "t": "Er is nog een term die vaak wordt weggelaten: welving. Wanneer een open doorsnede niet vrij kan welven, omdat ze is ingeklemd of omdat het wringend moment langs de staaf varieert, komt welvingstorsie bovenop de Saint-Venant-torsie. Ook het negeren daarvan leidt tot een onderschatting."
    },
    {
      "k": "h",
      "t": "Wat Stabileo hiermee doet"
    },
    {
      "k": "p",
      "t": "Stabileo toont alle drie, elk met zijn formule, zijn termen en zijn waarde. Ook de theorieën die niet gelden worden getoond, met de reden. En wanneer er twee gelden voor dezelfde doorsnede, toont het het verschil ertussen in plaats van stilletjes een te kiezen."
    },
    {
      "k": "p",
      "t": "Het zwaartepunt, het dwarskrachtencentrum en de kern worden op dezelfde manier behandeld: stap voor stap berekend, in het volle zicht, op de werkelijke veelhoek van de doorsnede in plaats van met een formule per vorm."
    },
    {
      "k": "note",
      "t": "Om het te zien open je de editor, teken of kies je een staaf en ga je naar Advanced → Section analysis → Torsion. Bij een cirkelvormige buis zie je Cauchy en Bredt naast elkaar, met het procentuele verschil ertussen. Bij een U-profiel zie je Bredt gemarkeerd als niet van toepassing, met de reden."
    },
    {
      "k": "h",
      "t": "Kortom"
    },
    {
      "k": "ol",
      "items": [
        "Vormt de wand een gesloten circuit? Bredt, met Aₘ gemeten op de middellijn.",
        "Is hij open? Saint-Venant, en de dikte komt in de derde macht voor: de dikste wand is maatgevend.",
        "Is hij cirkelvormig? Cauchy, en die is exact. Als je ook Bredt gebruikt, verwacht dan dat die te laag uitkomt.",
        "Is welving verhinderd? Dan is Saint-Venant alleen niet genoeg."
      ]
    },
    {
      "k": "p",
      "t": "Leg in beide gevallen vast welke theorie je hebt gebruikt, samen met de waarde."
    },
    {
      "k": "link",
      "slug": "bars-or-finite-elements",
      "t": "Dezelfde vraag (welke theorie geldt, en wat de verkeerde keuze kost) komt op bij de keuze tussen raamwerkstaven en eindige elementen:"
    },
    {
      "k": "note",
      "t": "De cijfers in dit bericht komen uit oplossingen in gesloten vorm voor de genoemde doorsneden: een cirkelvormige holle buis met Aₘ op de middellijn, en een vierkante buis 100×100×5 met de gesloten J van Bredt en de open J van Saint-Venant. Je kunt ze in Stabileo reproduceren met dezelfde doorsneden."
    }
  ]
};

export default body;
