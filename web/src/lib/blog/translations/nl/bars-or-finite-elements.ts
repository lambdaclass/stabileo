import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Staafelementen of eindige elementen? Twee modellen, niet twee methoden",
  "excerpt": "Voor een prismatische staaf is de verplaatsingsmethode het exacte bijzondere geval van de eindige-elementenmethode. Wat verandert is het model, en bij een hoge ligger geeft het raamwerkmodel een doorbuiging die 19 tot 34% te klein is.",
  "blocks": [
    {
      "k": "p",
      "t": "\"Moet ik de verplaatsingsmethode gebruiken of eindige elementen?\" komt in elke collegezaal en elk ontwerpbureau voor, en het is de verkeerde vraag. Het probleem is dat ze de twee behandelt als onderling verwisselbare alternatieven, en dat zijn ze niet."
    },
    {
      "k": "p",
      "t": "De verplaatsingsmethode is de eindige-elementenmethode toegepast op raamwerkstaven. Wat een \"raamwerk\"-programma scheidt van een \"eindige-elementen\"-programma is het model. Een raamwerkelement draagt een eendimensionale theorie over hoe een staaf vervormt; een schaalnet is een gediscretiseerd tweedimensionaal continuüm. Kiezen tussen die twee is een technische beslissing, en dit bericht gaat over wanneer je die neemt en wat het kost om het verkeerd te doen."
    },
    {
      "k": "h",
      "t": "Een rechte staaf heeft geen net nodig"
    },
    {
      "k": "p",
      "t": "Bij eindige elementen wordt de verplaatsing binnen elk element benaderd met vormfuncties. Voor een staaf op buiging zijn de gebruikelijke kubische Hermite-polynomen. En de oplossing van de Euler-Bernoulli-liggervergelijking zonder belasting over de overspanning is zelf een kubisch polynoom, dus de benadering valt samen met de exacte oplossing."
    },
    {
      "k": "p",
      "t": "Daarom is de stijfheidsmatrix voor een prismatische staaf, die uit elk leerboek over matrixanalyse, exact, en daarom verbetert een staaf in meer elementen opdelen niets. Bij een verdeelde belasting geldt hetzelfde in de knopen, zolang de equivalente knoopbelastingen consistent worden berekend."
    },
    {
      "k": "table",
      "caption": "Ligger op twee steunpunten van 6 m, doorsnede 20×60 cm, 10 kN/m, E = 30 000 MPa. Doorbuiging in het midden van de overspanning wanneer de ligger in verschillende aantallen raamwerkelementen is verdeeld.",
      "head": [
        "Raamwerkelementen in de ligger",
        "Doorbuiging midden overspanning [mm]"
      ],
      "rows": [
        [
          "2",
          "1,5625"
        ],
        [
          "4",
          "1,5625"
        ],
        [
          "10",
          "1,5625"
        ],
        [
          "50",
          "1,5625"
        ],
        [
          "Gesloten vorm 5qL⁴/384EI",
          "1,5625"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Twee elementen of vijftig, de rekenkern geeft hetzelfde getal terug, en het komt overeen met de gesloten vorm."
    },
    {
      "k": "quote",
      "t": "Bij alle getoonde verdelingen ligt in het midden een knoop. Verdere onderverdeling verandert de verplaatsing op die knoop niet."
    },
    {
      "k": "note",
      "t": "Die exactheid geldt binnen de liggertheorie. De knoopverplaatsingen zijn in dit voorbeeld exact binnen de Euler-Bernoulli-theorie, maar als de staaf zich niet gedraagt als een Euler-Bernoulli-ligger, helpt een exacte oplossing van die vergelijking niet. De rest van dit bericht gaat over die gevallen."
    },
    {
      "k": "h",
      "t": "Waar ze uiteengaan"
    },
    {
      "k": "p",
      "t": "De Euler-Bernoulli-theorie veronderstelt dat vlakke doorsneden vlak blijven en loodrecht op de as, wat neerkomt op het negeren van schuifvervorming. Voor een slanke ligger is dat een heel goede benadering. Voor een hoge ligger niet."
    },
    {
      "k": "p",
      "t": "We namen dezelfde ligger van 6 m onder dezelfde belasting en vergrootten stap voor stap de hoogte. Elk geval werd twee keer berekend: met raamwerkelementen, zoals de Basic-modus doet, en als een MITC4-schaal die in het vlak van de ligger is verdeeld in een net, wat de PRO-modus kan."
    },
    {
      "k": "table",
      "caption": "Ligger op twee steunpunten van 6 m, 20 cm breed, 10 kN/m, E = 30 000 MPa, ν = 0,2. Doorbuiging in het midden van de overspanning, op de as.",
      "head": [
        "L/h",
        "Hoogte h [m]",
        "Raamwerkelementen [mm]",
        "Schalen [mm]",
        "Raamwerkmodel te laag met"
      ],
      "rows": [
        [
          "20",
          "0,30",
          "12,500",
          "12,567",
          "0,5 %"
        ],
        [
          "10",
          "0,60",
          "1,5625",
          "1,5961",
          "2,1 %"
        ],
        [
          "5",
          "1,20",
          "0,19531",
          "0,21206",
          "7,9 %"
        ],
        [
          "3",
          "2,00",
          "0,042188",
          "0,052145",
          "19,1 %"
        ],
        [
          "2",
          "3,00",
          "0,012500",
          "0,019017",
          "34,3 %"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bij L/h = 10, een gewone ligger, is het verschil 2%. Bij L/h = 5 bijna 8%. Bij L/h = 3 geeft het raamwerkmodel een 19% kleinere doorbuiging, en bij L/h = 2 een derde kleiner."
    },
    {
      "k": "quote",
      "t": "Bij deze belasting geeft het verwaarlozen van schuifvervorming een kleinere doorbuiging."
    },
    {
      "k": "h",
      "t": "Controleren met een rekenmachine"
    },
    {
      "k": "p",
      "t": "Je hoeft de schaal niet op haar woord te geloven. De Timoshenko-liggertheorie omvat schuifvervorming, en voor een ligger op twee steunpunten onder gelijkmatige belasting voegt ze één term toe aan de doorbuiging: q·L² / (8·κ·G·A), met κ = 5/6 voor een rechthoekige doorsnede en G = E / (2·(1+ν))."
    },
    {
      "k": "table",
      "caption": "Ligger bij L/h = 3 (overspanning 6 m, 2 m hoog): vier antwoorden op dezelfde vraag.",
      "head": [
        "Model",
        "Doorbuiging midden overspanning [mm]"
      ],
      "rows": [
        [
          "Raamwerkelementen (Euler-Bernoulli)",
          "0,0422"
        ],
        [
          "Raamwerkelementen plus de schuifterm, met de hand",
          "0,0530"
        ],
        [
          "MITC4-schalen",
          "0,0521"
        ],
        [
          "Vlakke elasticiteit, gesloten vorm",
          "0,0523"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Bij L/h = 3 is die term 0,0108 mm; opgeteld bij de 0,0422 mm van Euler-Bernoulli geeft dat 0,0530 mm. De schaal geeft 0,0521 mm, en de gesloten-vormoplossing voor vlakke elasticiteit van Timoshenko en Goodier geeft 0,0523 mm. De drie antwoorden die schuif omvatten komen binnen 2% overeen. Het antwoord dat schuif negeert is 19% te laag."
    },
    {
      "k": "note",
      "t": "Doorbuiging is niet het hele verhaal. Bij die hoogte is de verdeling van de normaalspanning niet meer lineair, dus ook de formule van Navier geldt niet. Daarom behandelt ACI 318, de basis van CIRSOC 201, liggers die op één vlak worden belast en op het tegenoverliggende vlak worden ondersteund zodat drukschoren kunnen ontstaan, als hoge liggers wanneer de vrije overspanning hoogstens viermaal de hoogte is of een gebied een puntlast binnen tweemaal de hoogte van het oplegvlak bevat, en vereist een ontwerp dat rekening houdt met de niet-lineaire rekverdeling, bijvoorbeeld met een stempel-en-trekbandmodel."
    },
    {
      "k": "h",
      "t": "Maken een paar honderdsten van een millimeter uit?"
    },
    {
      "k": "p",
      "t": "In die ligger op zichzelf niet veel. In een statisch bepaalde constructie beïnvloedt een stijfheidsfout alleen de doorbuiging, en een ligger van 2 m hoog buigt toch al weinig door. De fout gaat meetellen wanneer de stijfheid bepaalt hoe de belastingen worden verdeeld, wat gebeurt in elke statisch onbepaalde constructie."
    },
    {
      "k": "p",
      "t": "Het typische geval is de stabiliteitswand. In een raamwerkmodel is een wand een zeer brede kolom: hij krijgt het traagheidsmoment van de wand en staat op de hartlijn van de wand. Voor een gedrongen wand, lang ten opzichte van zijn hoogte, maakt het raamwerkelement hem aanzienlijk stijver dan hij werkelijk is."
    },
    {
      "k": "table",
      "caption": "Wand van 20 cm dik, ingeklemd aan de voet, met 100 kN horizontaal aangebracht aan de top. Verplaatsing van de bovenrand.",
      "head": [
        "Wand, lengte × hoogte [m]",
        "Hoogte / lengte",
        "Raamwerkelement [mm]",
        "Schaal [mm]",
        "Raamwerkelement stijver met"
      ],
      "rows": [
        [
          "4 × 3",
          "0,75",
          "0,0281",
          "0,0627",
          "2,23 keer"
        ],
        [
          "3 × 3",
          "1,00",
          "0,0667",
          "0,1129",
          "1,69 keer"
        ],
        [
          "2 × 3",
          "1,50",
          "0,2250",
          "0,2943",
          "1,31 keer"
        ],
        [
          "3 × 6",
          "2,00",
          "0,533",
          "0,625",
          "1,17 keer"
        ],
        [
          "3 × 9",
          "3,00",
          "1,800",
          "1,937",
          "1,08 keer"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Een wand van 4 m lang en 3 m hoog, één verdieping hoog, komt 2,2 keer stijver uit wanneer hij met een raamwerkelement wordt gemodelleerd. Een wand van 3 m lang en 9 m hoog, drie verdiepingen, is maar 8% stijver. Het verschil is het grootst bij gedrongen wanden."
    },
    {
      "k": "p",
      "t": "En dat verandert hoe de dwarskracht wordt verdeeld. Neem twee wanden op dezelfde lijn, één van 4 m en één van 2 m lang, beide 3 m hoog en door de vloer aan elkaar gekoppeld. Met raamwerkelementen neemt de korte wand 11,1% van de dwarskracht op. Met schalen neemt hij 17,6% op, 58% meer dan het raamwerkmodel voorspelt. De extra belasting die het raamwerkmodel aan de lange wand toewijst komt van de korte af, die zo wordt ontworpen voor minder dwarskracht dan hij in werkelijkheid zal dragen."
    },
    {
      "k": "h",
      "t": "Vragen die een raamwerkmodel niet kan beantwoorden"
    },
    {
      "k": "p",
      "t": "Tot nu toe zijn dit gevallen waarin raamwerkelementen het verkeerde getal geven. In andere kunnen ze helemaal geen getal geven, omdat de vraag geen plaats heeft in het model."
    },
    {
      "k": "ul",
      "items": [
        "Een vlakke plaatvloer. Hoe het moment zich verdeelt over de kolomstrook en de middenstrook, en hoeveel ervan zich boven elke kolom concentreert, is tweedimensionale informatie. Een liggerrooster kan het benaderen, maar die informatie zit niet in het model.",
        "Een wand met openingen. Een raamwerkelement heeft op elk punt langs zijn as één doorsnede, dus een raam midden in de wand kan nergens heen.",
        "De knoop. In een raamwerkmodel is de ligger-kolomaansluiting een punt, dus het piekmoment verschijnt op de hartlijn. In werkelijkheid is de aansluiting zo groot als de kolom, en de doorsnede die je ontwerpt is die aan de kolomrand.",
        "Een geconcentreerde belasting bij een oplegging. Vlakke doorsneden blijven in dat gebied niet vlak, om dezelfde reden als bij de hoge ligger."
      ]
    },
    {
      "k": "h",
      "t": "Waar ze moeten overeenkomen"
    },
    {
      "k": "p",
      "t": "De andere helft van het betoog is even belangrijk. Voor de slanke ligger in de eerste rij, bij L/h = 20, verschillen raamwerkelementen en schalen 0,5%. Dat is niet nul, omdat schuif er altijd is, maar het is verwaarloosbaar. En dat hoort ook: als de twee modellen het oneens zijn over een slanke staaf, controleer dan eerst het eindige-elementenmodel, en met name het net."
    },
    {
      "k": "note",
      "t": "Schuifvergrendeling (shear locking) is een klassiek voorbeeld van een element dat faalt. Een naïef geformuleerde vierhoek voor dikke platen wordt veel stijver dan hij zou moeten zijn wanneer de plaat dun is, en de vloer gedraagt zich alsof hij dikker is. Het MITC4-element in Stabileo bestaat om dit te voorkomen: het interpoleert de schuifrekken anders, zodat het element niet vergrendelt."
    },
    {
      "k": "link",
      "slug": "torsion-bredt-saint-venant",
      "t": "De theorie kiezen op basis van de dikte, en wat een verkeerde keuze kost, is dezelfde vraag die torsie oproept:"
    },
    {
      "k": "h",
      "t": "Beide modellen in één programma"
    },
    {
      "k": "p",
      "t": "Raamwerkelementen en schalen in hetzelfde programma hebben is niets nieuws. SAP2000, ETABS, Robot en midas combineren beide in één model, en dat is de basis voor professionele software. Maar ze zijn niet gebouwd om uit te leggen wat ze berekenen. Aan de andere kant leren onderwijstools zoals Ftool en MASTAN2 raamwerkberekening heel goed aan, maar bieden geen schaalmodellering."
    },
    {
      "k": "p",
      "t": "Stabileo heeft beide modi in één programma. De Basic-modus rekent met raamwerkelementen en doorloopt de verplaatsingsmethode in negen stappen: nummering van de vrijheidsgraden, lokale matrices, transformatie, opbouw, belastingvector, randvoorwaarden, oplossing, reacties en snedekrachten. De PRO-modus rekent met eindige elementen, met MITC4-schalen en DKT-platen naast raamwerkelementen. In de tools die we hebben bekeken vonden we geen ander programma waarmee je kunt leren hoe de berekening werkt en die daarna kunt toepassen op een completer model zonder van tool te wisselen."
    },
    {
      "k": "img",
      "base": "blog/deep-beam-shell",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO, werkruimte Analyse, met de ligger van 6 m bij 2 m hoog gemodelleerd als een wand van schaalelementen en berekend. Het resultatenpaneel toont 225 verplaatsingen en 192 schaalspanningen; onder Result checks schat het de discretisatiefout op ongeveer 11 % in energienorm en vraagt het om het net te verfijnen of de convergentiecontrole uit te voeren voordat de resultaten worden gebruikt.",
      "caption": "Het schaalmodel hieronder, berekend: de app schat haar eigen netfout en zegt wanneer het net te grof is om op te vertrouwen."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-bar",
      "label": "De ligger met L/h = 3 in de Basic-modus: overspanning 6 m, doorsnede 20×200 cm en 10 kN/m, gemodelleerd als twee raamwerkelementen. Beweeg de aanwijzer over het midden van de ligger en er staat \"uz: -0,042 mm\", overeenkomend met de Euler-Bernoulli-formule."
    },
    {
      "k": "embed",
      "query": "example=deep-beam-shell",
      "mode": "pro",
      "label": "Dezelfde ligger in de PRO-modus, gemodelleerd als een schaal met 192 MITC4-elementen van 25 cm. Onder Analyseren → Verplaatsingen staat bij knoop 113 (midden overspanning, op halve hoogte) \"-5.19e-5\" m, dat is −0,0519 mm. De tabel hierboven gebruikt een fijner net en geeft 0,0521 mm."
    },
    {
      "k": "link",
      "slug": "conceptual-side-advanced-tools",
      "t": "Wat de gratis tools wel en niet uitleggen, tool voor tool:"
    },
    {
      "k": "h",
      "t": "Kortom"
    },
    {
      "k": "ol",
      "items": [
        "Voor een prismatische staaf is de verplaatsingsmethode het exacte bijzondere geval van eindige elementen. Wat je kiest is het model.",
        "Bij deze lineair-elastische prismatische Euler-Bernoulli-ligger met consistente knooplasten veranderen de verplaatsingen op bestaande knopen niet door onderverdeling. Tussen knopen kan de interpolatie wel veranderen.",
        "Voor de vrij opgelegde rechthoekige ligger onder gelijkmatig verdeelde belasting in de tabel is de doorbuiging bij L/h = 5 circa 8% en bij L/h = 3 circa 19% kleiner dan in het schaalmodel.",
        "In een onbepaalde constructie verandert die fout hoe belastingen worden verdeeld. Controleer gedrongen wanden vóór liggers.",
        "Vlakke plaatvloeren, wanden met openingen en belastingen bij opleggingen roepen vragen op die een raamwerkmodel niet kan beantwoorden.",
        "Waar de staaf slank is, moeten de twee modellen overeenkomen. Als dat niet zo is, controleer dan het net."
      ]
    },
    {
      "k": "note",
      "t": "Hoe de getallen zijn berekend: ze komen allemaal uit de rekenkern van Stabileo, dezelfde die de toepassing gebruikt. Raamwerkelementen: Euler-Bernoulli, met opleggingen op de as. Schalen: MITC4 in het vlak van de ligger, met 24 elementen over de hoogte (16 verandert het vierde cijfer), de belasting op de bovenrand en de opleggingen verdeeld over de volle hoogte van de uiteinddoorsneden. Wanden: dezelfde formulering, met de voet over zijn volle lengte ingeklemd en de horizontale belasting verdeeld langs de top. De schuifterm en de oplossing voor vlakke elasticiteit zijn gesloten vormen die je met de hand kunt controleren."
    }
  ]
};

export default body;
