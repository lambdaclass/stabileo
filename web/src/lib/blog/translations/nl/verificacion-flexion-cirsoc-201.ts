import type { PostBody } from '../../types';
import { minimumSteelExampleRows, flexureExampleRows, flexureExampleSteps } from '../../flexure-example';

const body: PostBody = {
  "title": "Buigtoetsing volgens CIRSOC 201, stap voor stap",
  "excerpt": "Bijna iedereen onthoudt φMn ≥ Mu. Dat is de laatste regel van de toetsing, niet de toetsing zelf. De uitkomst wordt eerder bepaald, en een van die stappen kan φ onder 0,9 trekken.",
  "blocks": [
    {
      "k": "p",
      "t": "De meeste mensen onthouden een buigtoetsing als één ongelijkheid: φMn ≥ Mu. Dat klopt, en het is de laatste regel. Wat de uitkomst bepaalt gebeurt eerder, in stappen die zelden goed worden bekeken omdat ze op papierwerk lijken."
    },
    {
      "k": "p",
      "t": "Dit geeft de CIRSOC 201-module van Stabileo terug voor een ligger van 20×40 cm van beton H-25, staal fy 420, 25 mm dekking en beugels van 8 mm, onder een moment van 60 kN·m:"
    },
    {
      "k": "ol",
      "items": flexureExampleSteps("Trekwapening: 2 Ø20 (6,28 cm²)")
    },
    {
      "k": "p",
      "t": "Tien stappen. De tiende is de stap die iedereen onthoudt. De stappen die het resultaat bepalen zijn de derde en de negende."
    },
    {
      "k": "h",
      "t": "Stap 3: het minimum is vaker maatgevend dan het lijkt"
    },
    {
      "k": "p",
      "t": "Artikel 9.6.1.2 vraagt een minimale buigwapening gelijk aan de grootste van 0.25·√f'c/fy·bw·d en 1.4/fy·bw·d. Het wordt meestal behandeld als een ondergrens die bijna nooit wordt bereikt. Bij woningliggers wordt die voortdurend bereikt."
    },
    {
      "k": "table",
      "caption": "Dezelfde ligger 20×40 H-25 onder toenemende momenten: wat de wapening bepaalt.",
      "head": [
        "Mu [kN·m]",
        "As volgens sterkte [cm²]",
        "As,min [cm²]",
        "Maatgevend"
      ],
      "rows": minimumSteelExampleRows("het minimum", "sterkte", ",")
    },
    {
      "k": "p",
      "t": "Het kruispunt ligt bij Mu = 31,1 kN·m bij toepassing van §9.6.1.2. Waar de uitzondering van §9.6.1.3 geldt, mag in elke doorsnede ten minste 4/3 van de volgens de analyse vereiste wapening worden aangebracht. Het loont om te weten aan welke kant van het kruispunt een ligger zit voordat je over de wapening discussieert."
    },
    {
      "k": "h",
      "t": "En het minimum hangt zelden af van het beton"
    },
    {
      "k": "p",
      "t": "Van de twee uitdrukkingen in het artikel is die met √f'c alleen groter dan de andere bij vrij sterk beton."
    },
    {
      "k": "table",
      "caption": "De twee uitdrukkingen voor het minimum, voor fy 420, in promille.",
      "head": [
        "Beton",
        "0.25·√f'c/fy",
        "1.4/fy",
        "Maatgevend"
      ],
      "rows": [
        [
          "H-20",
          "2.6620",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-25",
          "2.9762",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-30",
          "3.2603",
          "3.3333",
          "1.4/fy"
        ],
        [
          "H-35",
          "3.5215",
          "3.3333",
          "√f'c"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Het kruispunt ligt bij f'c = 31,36 MPa. In het hele bereik dat bij woningbouw wordt gebruikt (H-20, H-25, H-30) hangt de minimumwapening niet af van het beton: ze komt uit 1.4/fy en niets anders. Van H-20 naar H-30 gaan verlaagt het minimum niet met één enkele vierkante centimeter."
    },
    {
      "k": "h",
      "t": "Stap 9: φ is niet automatisch 0,9"
    },
    {
      "k": "p",
      "t": "De reductiefactor voor sterkte wordt onderwezen als 0,90 voor buiging en daarna als constante behandeld. Dat is hij niet. Hij komt uit de rek in het trekstaal in de uiterste toestand, en de module zegt dat in stap 9: εt ≥ 5‰ → trekgestuurd → φ = 0.90. Breng meer staal in de doorsnede en εt daalt, en φ daalt mee."
    },
    {
      "k": "table",
      "caption": "Dezelfde ligger, telkens verder belast. εt en φ komen uit stap 8 en 9.",
      "head": [
        "Mu [kN·m]",
        "Wapening",
        "εt [‰]",
        "φ",
        "φMn [kN·m]",
        "Ductiliteit"
      ],
      "rows": flexureExampleRows("Voldoet", "Voldoet niet")
    },
    {
      "k": "p",
      "t": "De doorsnede 2 Ø32 voldoet niet: de trekrek ligt onder het vereiste minimum. Een verlaagde φ voldoet niet aan de ductiliteitstoetsing. Ontwerp de doorsnede of haar wapening opnieuw."
    },
    {
      "k": "quote",
      "t": "De doorsnede 2 Ø32 voldoet niet: de trekrek ligt onder het vereiste minimum. Een verlaagde φ voldoet niet aan de ductiliteitstoetsing. Ontwerp de doorsnede of haar wapening opnieuw."
    },
    {
      "k": "h",
      "t": "Waarom drukwapening wordt toegevoegd"
    },
    {
      "k": "p",
      "t": "Drukwapening kan nodig zijn bij de ductiliteitsgrens. Wacht niet tot het trekstaal onder zijn vloeirek zakt; toets de herontworpen doorsnede op de werkelijke hoogtes van de staven."
    },
    {
      "k": "p",
      "t": "Drukwapening zit er dus om de doorsnede haar ductiliteit terug te geven en de factor te herstellen. De capaciteit volgt daaruit, als resultaat."
    },
    {
      "k": "note",
      "t": "Drukwapening kan nodig zijn bij de ductiliteitsgrens. Wacht niet tot het trekstaal onder zijn vloeirek zakt; toets de herontworpen doorsnede op de werkelijke hoogtes van de staven."
    },
    {
      "k": "h",
      "t": "Probeer het op een echte ligger"
    },
    {
      "k": "p",
      "t": "Hieronder staat het model: een ligger op twee steunpunten van 5 m, 20×40, H-25, met 12 kN/m permanente belasting en 8 kN/m veranderlijke belasting, plus eigen gewicht. Het opent in de ontwerpworkflow van PRO, met CIRSOC 201 als geldende ontwerpnorm."
    },
    {
      "k": "img",
      "base": "blog/cirsoc-201-beam",
      "w": 1600,
      "h": 1000,
      "alt": "Ontwerpbediening van Stabileo PRO met de ligger 20×40 geselecteerd.",
      "caption": "Deze schermafbeelding dateert van vóór de correctie van de oplegging. Het live voorbeeld hieronder toont het actuele resultaat."
    },
    {
      "k": "embed",
      "mode": "pro",
      "query": "example=rc-beam-flexure&proTab=design",
      "label": "De ligger in Stabileo, in de ontwerpworkflow van PRO. Als ontwerpen uit staat, druk je in de melding op \"Ontwerp aanzetten voor dit bezoek\". Drie knoppen, in deze volgorde: \"Belastingen berekenen\", \"Benodigd staal berekenen\" en \"Dimensioneren…\". Alleen de derde kiest de staven, en zolang er geen staven zijn valt er niets te toetsen: de tabel zegt \"geen wapening\". De overspanning van 5 m is gemodelleerd als twee elementen; beide voldoen bij D/C = 0,91. Positieve buiging in het veld (My+) is maatgevend. Wijzig de belasting en voer het opnieuw uit. Normdimensionering in PRO is nog in ontwikkeling; de betonmodule is het deel dat is geïmplementeerd en getest."
    },
    {
      "k": "h",
      "t": "Kortom"
    },
    {
      "k": "ol",
      "items": [
        "Controleer vóór het dimensioneren of het moment boven of onder het kruispunt met het minimum ligt. Eronder bepaalt het minimum de wapening bij toepassing van §9.6.1.2. Bij toepassing van §9.6.1.3 hangt de benodigde wapening af van de berekende staaloppervlakte.",
        "Van H-20 tot H-30 hangt het minimum niet af van het beton. Het komt uit 1.4/fy.",
        "φ hangt af van εt: lees de twee altijd samen.",
        "Drukwapening kan nodig zijn om voldoende ductiliteit te behouden of om bij beperkte liggerhoogte de vereiste momentcapaciteit te bereiken. Controleer de rekken voor de gekozen wapening."
      ]
    },
    {
      "k": "note",
      "t": "Bereken de effectieve hoogte opnieuw voor elke gekozen staafdiameter. De capaciteitstabel is gecontroleerd tegen de huidige rekenkern; capaciteit alleen is geen volledige toetsing."
    }
  ]
};

export default body;
