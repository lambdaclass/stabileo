import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.0: bereken getroffen projecten opnieuw",
  "excerpt": "Bereken getroffen analyses opnieuw en beoordeel de resultaten die je al gebruikte. SA-2026-048 tot en met SA-2026-063 leggen uit wat je moet controleren; SA-2026-056 blijft onopgelost.",
  "blocks": [
    {
      "k": "p",
      "t": "Bereken getroffen belastinggevallen, combinaties en volledige niet-lineaire of gefaseerde verlopen opnieuw. Vergelijk verplaatsingen, staafkrachten, reacties en ontwerpbelastingen met de resultaten die je al gebruikte. Beoordeel geleverde berekeningen en de dimensionering die erop is gebaseerd. Volg bij elk veiligheidsbericht de getroffen invoer en de te nemen actie. Een weigering of een niet beschikbare grootheid geeft geen vervangend antwoord: het is geen nulbelasting en geen geslaagde toetsing."
    },
    {
      "k": "note",
      "t": "De veiligheidsberichten SA-2026-048 tot en met SA-2026-063 zijn na v0.5.0 toegevoegd. De onderstaande fixes zitten in 0.6.0, behalve SA-2026-056, dat onopgelost blijft. Controleer de hier genoemde functies opnieuw, ook als de eerdere analyse convergeerde of de verplaatsingen aannemelijk leken."
    },
    {
      "k": "h",
      "t": "Veiligheidsberichten"
    },
    {
      "k": "table",
      "caption": "Veiligheidsberichten SA-2026-048 tot en met SA-2026-063",
      "head": [
        "Veiligheidsbericht",
        "Ernst",
        "Wat er veranderde en wat je moet doen"
      ],
      "rows": [
        [
          "SA-2026-048",
          "Hoog",
          "CIRSOC 301 liet eindmomenten weg uit Mmax voor elke doorsnede met een verkort onafgesteund segment; U-profielen en T-profielen in dubbele kromming konden ook een tekenwisseling missen. Controleer alle CIRSOC 301-staven met een opgegeven Lb die korter is dan de staaf opnieuw, inclusief staaltoetsingen en voorstellen van de optimalisatie."
        ],
        [
          "SA-2026-049",
          "Hoog",
          "Een vastgezette vrijheidsgraad met een veer in dezelfde richting kon in 3D een elastische oplegging worden. Kies de bedoelde randvoorwaarde expliciet en bereken getroffen analyses opnieuw."
        ],
        [
          "SA-2026-050",
          "Gemiddeld",
          "Een mislukte slankheid kon nul worden, en resultaten met meerdere gevallen konden niet-eindige getallen bevatten. Gooi die waarden weg, controleer de invoer en bereken opnieuw."
        ],
        [
          "SA-2026-051",
          "Hoog",
          "3D bewegende belastingen misten pieken in het binnenste deel en de component van de aslast in de lengterichting van de staaf. Bereken omhullenden opnieuw en beoordeel de staafdimensionering en ontwerpbelastingen."
        ],
        [
          "SA-2026-052",
          "Hoog",
          "Normaalkrachtomhullenden van bewegende belastingen in 2D/3D misten de grenzen van verdeelde belastingen. Bereken opnieuw en controleer de extreme normaalkrachten in het binnenste deel; alleen de stap van de trein verkleinen is onvoldoende."
        ],
        [
          "SA-2026-053",
          "Laag",
          "Omhullenden van bewegende belastingen bevatten uitwendige krachtgrenzen bij belastingen op staafuiteinden. Bereken normaalkracht- en dwarskrachtomhullenden opnieuw en beoordeel de dimensionering, met behoud van de opleggingsreacties in evenwichtscontroles."
        ],
        [
          "SA-2026-054",
          "Hoog",
          "Lineaire berekeningen konden onopgeloste stijfheidsresponsen teruggeven of een belastingcomponent missen. Bereken statische gevallen en combinaties opnieuw; bepaal de getroffen staafkrachten en oplegreacties onafhankelijk wanneer de gecorrigeerde solver weigert."
        ],
        [
          "SA-2026-055",
          "Hoog",
          "P-Delta onderschatte de versterking bij normaalkrachtbelastingen over de overspanning. Bereken getroffen analyses en afgeleide toetsingen opnieuw, verifieer de convergentie van het elementennet en beoordeel de stabiliteit opnieuw."
        ],
        [
          "SA-2026-056",
          "Hoog",
          "Onopgelost: de dynamica van gekoppelde gemengde raamwerk-schaalmodellen verandert bij gelijkwaardige modelbeschrijvingen. Verifieer de berekende dynamische staafkrachten en oplegreacties onafhankelijk voordat je ze gebruikt; er is geen conservatieve correctiefactor vastgesteld."
        ],
        [
          "SA-2026-057",
          "Gemiddeld",
          "Plastische weergaven konden een factor buiten het interval binnen het interval noemen. Bereken certificaten opnieuw en vergelijk exacte eindpunten. Een weigering wegens middelen bewijst niet dat er geen mechanisme bestaat."
        ],
        [
          "SA-2026-058",
          "Hoog",
          "Grote harmonische modellen behielden onnauwkeurige responsen van weggelaten eigenvormen. Bereken sweeps opnieuw en beoordeel amplitude, fase en pieken, ook voor frequenties buiten de afkappingswaarschuwing."
        ],
        [
          "SA-2026-059",
          "Hoog",
          "Geavanceerde webanalyses gaven kabels drukweerstand. Gebruik de ondersteunde specifieke kabelsolver of een onafhankelijke analyse; geavanceerde kabelwerkstromen weigeren nu expliciet."
        ],
        [
          "SA-2026-060",
          "Hoog",
          "Kunstmatige rotatiestijfheid in gefaseerde berekeningen veranderde verplaatsingen en staafacties. Bereken volledige gefaseerde verlopen met scharnieren of oplegveren opnieuw en beoordeel afgeleide ontwerpbelastingen."
        ],
        [
          "SA-2026-061",
          "Hoog",
          "Reacties van de padsolver ontbraken of werden bij de verkeerde belasting teruggewonnen; gefaseerde en dynamische krachten konden ontbreken. Bereken opnieuw en beoordeel belastingen op opleggingen, verbindingen en funderingen. Niet beschikbare krachten zijn niet nul; totale dynamische reacties blijven niet beschikbaar."
        ],
        [
          "SA-2026-062",
          "Hoog",
          "Een aanvankelijke elastische weigering kon een geslaagde ruwe 3D plastische bezwijkfactor nul worden. Bereken getroffen plastische analyses opnieuw; een numerieke weigering is geen bewijs van bezwijken bij nulbelasting."
        ],
        [
          "SA-2026-063",
          "Hoog",
          "Koppelingen lieten de beweging in een voorgeschreven vrijheidsgraad van de masterknoop vallen. Bereken volledige verlopen opnieuw en beoordeel verplaatsingen, staafkrachten en reacties samen met SA-2026-061. Niet ondersteunde oplegbeweging van kabels of tijdsdomeinanalyses weigert nu."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Index van veiligheidsberichten",
      "t": "Lees elk toepasselijk bericht voor de getroffen invoer en de vereiste actie:"
    },
    {
      "k": "h",
      "t": "Andere wijzigingen die antwoorden beïnvloeden"
    },
    {
      "k": "p",
      "t": "Het resultatenregister eindigt bij versie 49 in 0.5.0 en bereikt 78 in 0.6.0. De tabel selecteert andere wijzigingen om samen met de bovenstaande berichten te beoordelen. Bereken elke analyse die onder een toepasselijke melding valt opnieuw en vergelijk de uitvoer. De volledige lijst, inclusief vervangen en ingetrokken toetsingen, staat in de release-opmerkingen."
    },
    {
      "k": "table",
      "caption": "Geselecteerde meldingen over gewijzigde resultaten sinds 0.5.0",
      "head": [
        "Resultatenversie",
        "Resultaat dat verandert"
      ],
      "rows": [
        [
          "50",
          "2D: rotaties die alleen door verbindingen worden vastgehouden en door hen vrij worden gelaten, worden geweigerd"
        ],
        [
          "52",
          "3D: knoopverdraaiingen die een verbinding koppelt maar vrij laat, worden geweigerd"
        ],
        [
          "53",
          "Knik neemt geen geometrische stijfheid meer uit normaalkrachten van afrondingsfouten. In 2D en 3D leveren staven waarvan de normaalkrachten niet van afrondingsfouten te onderscheiden zijn geen geometrische stijfheid. De analyse wordt geweigerd als hun mogelijke druk de kritieke factor met meer dan 1 % zou kunnen verlagen."
        ],
        [
          "54",
          "Het nettooppervlak van een verspringend geboute uiteinde neemt zijn ongunstigste keten, en een geboute aansluiting met alle elementen heeft bouten in het lijf nodig"
        ],
        [
          "56",
          "Schuine 3D-opleggingen tellen inklemmingen in een gemeenschappelijk assenstelsel"
        ],
        [
          "58",
          "Modale bases gebruiken de afrondingsschaal van elke Gram-term van de massa"
        ],
        [
          "59",
          "Gecontroleerde 3D plastische analyse geeft de gecertificeerde ondergrens terug"
        ],
        [
          "61",
          "Belastingsturing van betonvezels verfijnt haar stopinterval"
        ],
        [
          "63",
          "Lineaire analyse weigert een mechanisme of een onoplosbare stijfheid in plaats van het met een waarschuwing te berekenen"
        ],
        [
          "65",
          "Ongeldige bevroren contacten en kabelstaafanalyses worden achtergehouden"
        ],
        [
          "66",
          "Afrondingsgrenzen bij knik volgen de werkelijke koppeling van de randvoorwaarden"
        ],
        [
          "67",
          "Knikfactoren gebruiken de oorspronkelijke stijfheidsbundel"
        ],
        [
          "68",
          "Plastische balans gebruikt opgeloste model-ID's en certificaten begroten de werkelijke kandidaten"
        ],
        [
          "69",
          "Niet-lineaire convergentie volgt het fysieke evenwicht"
        ],
        [
          "71",
          "Dwarse vakwerkacties opnemen in het voorwaardelijke staafevenwicht"
        ],
        [
          "72",
          "Booglengtevoortzetting groepeert de rekenkunde van de referentiebelasting opnieuw"
        ],
        [
          "73",
          "Modale analyse behoudt het fysieke massabereik"
        ],
        [
          "75",
          "SSI corrigeert elastische residuplateaus"
        ],
        [
          "76",
          "Reductie van randvoorwaarden behoudt richtingsafhankelijke afrondingsonzekerheid"
        ],
        [
          "78",
          "Compatibele belastingen op vrijgegeven rotaties"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.nl.md",
      "label": "Volledige release-opmerkingen van 0.6.0",
      "t": "Elke melding over gewijzigde resultaten, met links naar de reikwijdte en onderbouwing:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Een dialoogvenster voor het opnieuw controleren van resultaten in Stabileo Basic, met de wijzigingen die een ouder opgeslagen project raken.",
      "caption": "Het dialoogvenster voor het opnieuw controleren van resultaten, zoals afgebeeld in het artikel over 0.5.0."
    },
    {
      "k": "h",
      "t": "Twee meldingen beschrijven gedrag dat al in 0.5.0 zat"
    },
    {
      "k": "p",
      "t": "Deze twee meldingen zijn later geregistreerd. Hun onderliggende wijzigingen zaten al in v0.5.0, dus het zijn geen nieuwe numerieke wijzigingen in deze release. Ze kunnen nog steeds in een melding voor het opnieuw controleren van een project verschijnen."
    },
    {
      "k": "table",
      "caption": "Latere meldingen voor wijzigingen die al in 0.5.0 werden geleverd",
      "head": [
        "Resultatenversie",
        "Resultaat dat verandert"
      ],
      "rows": [
        [
          "72",
          "De openbare vloerengalerij gebruikt harde eenvoudige opleggingen op wanden"
        ],
        [
          "72",
          "SSI geeft opleggingsreacties terug en neemt grondveren op in de krachten van randvoorwaarden"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Bekende beperkingen"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-056 blijft onopgelost: verifieer de berekende dynamische respons, waaronder staafkrachten en oplegreacties, onafhankelijk voor alle getroffen gekoppelde raamwerk-schaalmodellen, ook als hernummeren, rotatie en eenhedenconversie dezelfde respons geven. Er is geen conservatieve correctiefactor vastgesteld.",
        "2D plastisch bezwijken blijft geweigerd in afwachting van #758, zoals beschreven in SA-2026-044. Een gecertificeerde 3D ondergrens certificeert de ruwe scharnierhistorie niet.",
        "Tijdsdomeinanalyse levert geen totale dynamische oplegbelastingen. Gebruik een onafhankelijke analyse met traagheid, demping en oplegbelasting. Niet ondersteunde kabelanalyses en niet-nul opgelegde oplegbeweging in kabel- of tijdsdomeinwerkstromen weigeren expliciet.",
        "Ruimtelijke booglengte- en verplaatsingsgestuurde solvers zijn niet toegevoegd. Bestaande waarschuwingen en beperkingen blijven van toepassing."
      ]
    },
    {
      "k": "h",
      "t": "Andere wijzigingen"
    },
    {
      "k": "ul",
      "items": [
        "Gegenereerde vlakke constructies krijgen expliciete inklemmingen, en afdaken krijgen standaard fysiek verband. Genereer opnieuw en beoordeel de opleggingen en het verband; opgeslagen modellen zijn ongewijzigd.",
        "Het experiment met vormcontrole van de gebogen strook van Fehér, Sipos en Várkonyi heeft een interactieve solver, actuatorpaden en een papervergelijking in het Engels, Spaans en Portugees. De samenvatting van de gesneden strook is ook vertaald naar het Spaans en Portugees.",
        "Het blogartikel over release 0.5.0 heeft nu volledige Duitse, Franse en Turkse vertalingen. Waarschuwingen over plastische certificaten en weigeringen wegens middelen zijn vertaald in elke aangeboden taal."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Wijzigingslogboek",
      "t": "Het volledige technische verslag:"
    }
  ]
};

export default body;
