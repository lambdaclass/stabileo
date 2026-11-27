import type { PostBody } from '../../types';

const body: PostBody =  {
  "title": "Stabileo 0.6.1: gecorrigeerde staaftoetsingen en sneeuwbelastingen",
  "excerpt": "Bereken getroffen beton- en staalontwerptoetsingen opnieuw. Voor gegenereerde sneeuw geldt: genereer eerst de belastingen opnieuw, en bereken daarna getroffen belastinggevallen, combinaties, omhullenden en afgeleide ontwerptoetsingen opnieuw.",
  "blocks": [
    {
      "k": "p",
      "t": "Bereken getroffen beton- en staalontwerptoetsingen opnieuw. Voor gegenereerde sneeuw geldt: genereer eerst de belastingen opnieuw, en bereken daarna getroffen belastinggevallen, combinaties, omhullenden en afgeleide ontwerptoetsingen opnieuw. Alleen eerder opgeslagen belastingen opnieuw berekenen herstelt ze niet. Vergelijk belastingen, capaciteiten, wapening, benuttingsgraad, maatgevende combinaties en certificaten met de resultaten die je al gebruikte. Beoordeel geleverde berekeningen en de dimensionering die erop is gebaseerd. Een weigering, een niet beschikbare grootheid of niet getoetste wapening geeft geen geslaagd antwoord en is geen nulbelasting."
    },
    {
      "k": "note",
      "t": "De volgende vijf veiligheidsberichten met ernst Hoog zijn opgelost in 0.6.1. Volg bij elk veiligheidsbericht de getroffen invoer en de te nemen actie, ook als eerdere resultaten voldeden of gecertificeerd waren."
    },
    {
      "k": "h",
      "t": "Veiligheidsberichten"
    },
    {
      "k": "table",
      "caption": "Veiligheidsberichten",
      "head": [
        "Veiligheidsbericht",
        "Ernst",
        "Wat er veranderde en wat je moet doen"
      ],
      "rows": [
        [
          "SA-2026-064",
          "Hoog",
          "Cb voor staal kon uit een andere combinatie komen of uit een niet-gelokaliseerde korte onafgesteunde overspanning (#1316, #2088). Bereken CIRSOC 301-staaltoetsingen opnieuw en beoordeel de buigcapaciteit, de benutting van de interactie en de maatgevende combinaties."
        ],
        [
          "SA-2026-065",
          "Hoog",
          "Sneeuwophoping bij een daksprong kon op een hellend ontvangend dak ontbreken (#2082). Genereer CIRSOC 104-sneeuwbelastingen opnieuw en bereken getroffen analyses en ontwerptoetsingen opnieuw."
        ],
        [
          "SA-2026-066",
          "Hoog",
          "Cm voor beton kon eindmomentcrediet krijgen bij dwarsbelasting tussen de opleggingen (#2089). Controleer slanke betonkolommen en -wanden, vergrote momenten en wapening opnieuw."
        ],
        [
          "SA-2026-067",
          "Hoog",
          "Rotatie in het grondvlak kon gegenereerde sneeuwbelastingen veranderen (#2093). Genereer belastingen opnieuw met de werkelijke dakgeometrie, en bereken daarna analyses en toetsingen opnieuw; een oud model terugdraaien is geen herstel."
        ],
        [
          "SA-2026-068",
          "Hoog",
          "Torsie kon voldoen met ontoereikende ontworpen beugels (#2141). Bereken betonontwerptoetsingen opnieuw en beoordeel de werkelijk aangebrachte dwarswapening, de beugelafstand en de niet-geslaagde en niet-getoetste torsiegevallen. Niet getoetste langswapening is geen voldoende wapeningskorf."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index van veiligheidsberichten",
      "t": "Veiligheidsberichten:"
    },
    {
      "k": "h",
      "t": "Elke melding over gewijzigde resultaten sinds v0.6.0"
    },
    {
      "k": "p",
      "t": "Het register bij v0.6.0 eindigt bij resultatenversie 78; deze release bereikt 80. De tabel noemt alle 24 nieuwe meldingen. Meerdere meldingen delen een versie. Bereken elke toepasselijke toetsing opnieuw; bij sneeuwmeldingen: genereer de belastingen opnieuw voordat je opnieuw berekent."
    },
    {
      "k": "table",
      "caption": "Elke melding over gewijzigde resultaten sinds v0.6.0",
      "head": [
        "Resultatenversie",
        "Resultaat dat verandert"
      ],
      "rows": [
        [
          "79",
          "De dekking van sneeuwophoping volgt doorlopende dakranden"
        ],
        [
          "79",
          "Sneeuwoverschrijvingen behouden onevenwichtige zijden en doorsnedereeksen"
        ],
        [
          "79",
          "Vlakke sneeuwraamwerken volgen verbonden dakreeksen"
        ],
        [
          "79",
          "Sneeuwbelastingen respecteren lokale posities en ophopingsgrenzen"
        ],
        [
          "79",
          "Sneeuwfactoren volgen de oriëntatie van elk dak"
        ],
        [
          "79",
          "Sneeuwgevallen dekken elke nokoriëntatie"
        ],
        [
          "79",
          "De sneeuwaanvoerlengte volgt doorlopende daken en de gekozen geometrie"
        ],
        [
          "79",
          "Sneeuwbelastingen behouden hun grootte bij rotatie in het grondvlak"
        ],
        [
          "79",
          "Sneeuwophoping bij een daksprong gebruikt het vlak van het ontvangende dak"
        ],
        [
          "79",
          "Sneeuwbelastingen volgen elk verbonden dakoppervlak"
        ],
        [
          "79",
          "Sneeuwbelaste oppervlakken gebruiken binnenste dakoppervlakken"
        ],
        [
          "80",
          "Staaftoetsingen vereisen elke actieve combinatie"
        ],
        [
          "80",
          "Voor staaftoetsingen zijn volledige snededata vereist"
        ],
        [
          "80",
          "Gelijktijdige toetsingen behouden de maatgevende belastingen"
        ],
        [
          "80",
          "Ontwerp gebruikt gekozen staven en bekende overspanningsbelasting"
        ],
        [
          "80",
          "Interactietoetsingen gebruiken gelijktijdige snedekrachten"
        ],
        [
          "80",
          "Betontoetsingen behouden de secundaire slankheid"
        ],
        [
          "80",
          "Gelijktijdige gevallen behouden alle vereiste torsiewapening"
        ],
        [
          "80",
          "Vaste wapening behoudt de toetsing van het praktische maximum"
        ],
        [
          "80",
          "Ontwerpbelastingen respecteren gedrag en flensoverspanningen"
        ],
        [
          "80",
          "Torsie toetst elke teruggegeven beugelkorf"
        ],
        [
          "80",
          "Gedeelde liggers behouden hun assen; torsiewapening moet worden opgegeven"
        ],
        [
          "80",
          "Cb van staalinteractie gebruikt zijn eigen combinatiediagram"
        ],
        [
          "80",
          "Staalsneden gebruiken fysieke lengtes en behouden dwarskrachtbelastingen"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.nl.md",
      "label": "Volledige release-opmerkingen 0.6.1",
      "t": "Elke melding over gewijzigde resultaten sinds v0.6.0:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Een dialoogvenster voor het opnieuw controleren van resultaten in Stabileo Basic, met de wijzigingen die een ouder opgeslagen project raken.",
      "caption": "Je resultaten kunnen veranderen: bereken de getroffen projecten opnieuw"
    },
    {
      "k": "h",
      "t": "Andere wijzigingen"
    },
    {
      "k": "p",
      "t": "Beton- en staaltoetsingen behouden krachten uit dezelfde combinatie en snede. Onvolledige combinatie- of snededata weigert nu in plaats van een eindpuntresultaat te lenen. Vereiste en aangebrachte wapeningstoestanden blijven gescheiden, en ontbrekende langstorsiewapening wordt expliciet gemeld."
    },
    {
      "k": "h",
      "t": "Bekende beperkingen"
    },
    {
      "k": "ul",
      "items": [
        "Bekende onjuiste resultaten blijven open: #2096, #2142, #2143 en #2144. Deze release lost ze niet op. Raadpleeg hun getroffen reikwijdte en verifieer getroffen resultaten onafhankelijk voordat je ze gebruikt.",
        "SA-2026-056 blijft onopgelost: verifieer de berekende dynamische respons, waaronder staafkrachten en oplegreacties, onafhankelijk voor gekoppelde gemengde raamwerk-schaalmodellen waarvan de berekende respons na hernummeren, rotatie of eenhedenconversie wezenlijk verandert. Er is geen conservatieve correctiefactor vastgesteld.",
        "2D plastisch bezwijken blijft geweigerd in afwachting van #758, zoals beschreven in SA-2026-044. Een gecertificeerde 3D ondergrens certificeert de ruwe scharnierhistorie niet.",
        "Tijdsdomeinanalyse levert geen totale dynamische oplegbelastingen. Gebruik een onafhankelijke analyse met traagheid, demping en oplegbelasting. Niet ondersteunde kabelanalyses en niet-nul opgelegde oplegbeweging in kabel- of tijdsdomeinwerkstromen weigeren expliciet.",
        "Ruimtelijke booglengte- en verplaatsingsgestuurde solvers zijn niet toegevoegd. Bestaande waarschuwingen en beperkingen blijven van toepassing."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Wijzigingslogboek",
      "t": "Wijzigingslogboek:"
    }
  ]
};

export default body;
