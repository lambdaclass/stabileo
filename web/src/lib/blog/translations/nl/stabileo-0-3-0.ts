import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.3.0: nog zestien correcties en alle berichten gepubliceerd",
  "excerpt": "Wat er sinds 0.2.0 is veranderd: zestien fouten die een verkeerd resultaat konden geven, verholpen en gepubliceerd als veiligheidsberichten; certificaten die het resultaat tegen het model controleren; en dezelfde getallen bij elke berekening.",
  "blocks": [
    {
      "k": "p",
      "t": "Versie 0.3.0 kwam uit op 21 oktober 2026. Sinds 0.2.0 bleven we de solver op verschillende onafhankelijke manieren controleren en vonden we nog zestien fouten die een verkeerd resultaat konden geven. Ze zijn verholpen, en elk heeft een gepubliceerd veiligheidsbericht waarin staat wat er mis was, wie het raakt en wat je opnieuw moet controleren."
    },
    {
      "k": "note",
      "t": "stabileo.com publiceert elke wijziging zodra die is samengevoegd, dus deze correcties zijn al live sinds 19, 20 of 21 oktober. De app meldt één keer dat resultaten kunnen zijn veranderd, en projecten die zijn opgeslagen vóór een wijziging die ze raakt, vragen bij het openen om een nieuwe controle."
    },
    {
      "k": "h",
      "t": "Voer je projecten opnieuw uit"
    },
    {
      "k": "p",
      "t": "Dit zijn de gevallen die een ontwerpresultaat het meest kunnen verschuiven. Elk bericht bevat het volledige uitgewerkte geval en wat je moet doen met resultaten die je al hebt opgeleverd."
    },
    {
      "k": "img",
      "base": "blog/recheck-notice",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO opent een in september opgeslagen betonraamwerk. Een dialoogvenster met de titel “Resultaten zijn veranderd sinds dit project voor het laatst is berekend” somt de wijzigingen op die het model raken, waaronder solvercorrecties gevonden met resultaatcertificaten en de rekcompatibiliteit van CIRSOC 201, en vraagt “Ik heb deze wijzigingen gelezen” aan te vinken voordat je verdergaat met verouderde resultaten of opnieuw berekent.",
      "caption": "Een project openen dat is berekend vóór een correctie die het raakt: de app somt die wijzigingen op en houdt de resultaten verouderd tot ze opnieuw zijn berekend."
    },
    {
      "k": "table",
      "caption": "Enkele van de correcties in 0.3.0: de juiste waarde en de waarde die de vorige versie gaf.",
      "head": [
        "Bericht",
        "Geval",
        "Juist",
        "Eerder"
      ],
      "rows": [
        [
          "SA-2026-005",
          "Dakspant van een zadeldak: normaalkracht aan de voet (kN)",
          "-56.67",
          "-41.67"
        ],
        [
          "SA-2026-007",
          "Kruisvormige kolom van 1,5 m: kritieke last (kN)",
          "2993",
          "5860"
        ],
        [
          "SA-2026-014",
          "Hernummerd ruimtelijk raamwerk: plastische bezwijkfactor",
          "176.47",
          "424.3"
        ],
        [
          "SA-2026-015",
          "Mast met tuidraden: trek in de tuidraad (kN)",
          "5.18",
          "4.34"
        ],
        [
          "SA-2026-013",
          "Koker van gebogen schalen: moment aan de inklemming (kN·m/m)",
          "35.0",
          "0"
        ]
      ]
    },
    {
      "k": "p",
      "t": "De overige berichten gaan over het responsspectrum met CQC, vlakke modellen die in 3D worden berekend met knoopmomenten, opleggingen die van veer naar stijf zijn veranderd, bogen buiten het X–Z-vlak, de grondcurven p-y, t-z en q-z, de volumeschaal in dunne platen en, voor wie de rekenkern of de API rechtstreeks gebruikt, materieel niet-lineaire analyse, gekromde MITC9-elementen en temperatuurbelastingen op staven."
    },
    {
      "k": "h",
      "t": "Gewaarschuwd in plaats van stilletjes fout"
    },
    {
      "k": "ul",
      "items": [
        "Een resultaat dat door een nog openstaande fout kan worden beïnvloed, krijgt een waarschuwing met de naam van die fout, in je taal. Er blijft er één over: materieel niet-lineaire analyse is een secantmodel voor de hele staaf.",
        "Wanneer een temperatuurbelasting de uitzettingscoëfficiënt of de doorsnedehoogte niet vermeldt, staat in het resultaat welke waarde is aangenomen.",
        "Wat geen oplossing heeft, wordt geweigerd: een moment op een knoop die niets kan laten draaien, een schaalbelasting op een element van een ander type, een grondcurve zonder de invoer die de verwijzing nodig heeft."
      ]
    },
    {
      "k": "h",
      "t": "Dieper gecontroleerd"
    },
    {
      "k": "ul",
      "items": [
        "End-to-end-certificaten voor raamwerken en vakwerken: een onafhankelijke controleur bouwt de stijfheid en de belastingen opnieuw op uit het model en certificeert de verplaatsingen tegen het model, niet alleen tegen de matrices die de rekenkern heeft opgebouwd. Hij vond al drie gevallen waarin rekenkern en model verschilden.",
        "Hetzelfde model geeft altijd dezelfde getallen, bit voor bit, en elk rapport, werkboek en CSV-bestand legt vast welke versie en welke gegevens het hebben voortgebracht.",
        "Het betonontwerp volgens CIRSOC 201 komt uit één implementatie in de rekenkern.",
        "Schattingen van de netfout voor platen en schalen, getoond als schattingen, nooit als gecertificeerd."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "De volledige lijst met berichten, met per bericht wat je opnieuw moet controleren:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.3.0.md",
      "label": "Release-opmerkingen 0.3.0",
      "t": "De volledige opmerkingen, met de bekende beperkingen:"
    }
  ]
};

export default body;
