import type { PostBody } from '../../types';
import { nextReleaseAdvisoryBlocks } from '../../next-release-advisories';

const body: PostBody = {
  "title": "Veiligheidsberichten: welke resultaten zijn veranderd en wat je moet doen",
  "excerpt": "De fouten in Stabileo die verkeerde of onveilige resultaten konden geven: wie ze raken, hoe je weet of een model getroffen is, wat je in de tussentijd moet doen en wanneer ze zijn verholpen.",
  "blocks": [
    {
      "k": "p",
      "t": "De resultaten van Stabileo worden gebruikt om echte constructies te ontwerpen. Als we een fout vinden die een verkeerd resultaat kon hebben opgeleverd, en vooral een onveilig resultaat, publiceren we die als veiligheidsbericht: wat er mis was, welke modellen het raakt, hoe je ze herkent, wat je moet doen tot de correctie live is en wat je opnieuw moet controleren in resultaten die al zijn gebruikt."
    },
    {
      "k": "p",
      "t": "Bijna al deze fouten zijn gevonden door ons eigen verificatieprogramma: vergelijking met zeven andere eindige-elementenprogramma’s, gepubliceerde uitgewerkte voorbeelden, tests op fysische invarianten en een review van de afleiding van elk element. Ze publiceren hoort bij dat werk: een fout die niet wordt gemeld, blijft zitten in de berekeningen die al zijn opgeleverd."
    },
    {
      "k": "note",
      "t": "Stand bij versie 0.6.0: SA-2026-001 tot 004 zijn verholpen in versie 0.2.0 en SA-2026-005 tot 020 in versie 0.3.0, SA-2026-021 tot 024 in versie 0.4.0 en SA-2026-025 tot 047 in versie 0.5.0 (SA-2026-040 ingedamd: de toetsing is als onvolledig gemarkeerd), behalve SA-2026-044: 2D plastisch bezwijken blijft geweigerd tot #758 is gesloten. SA-2026-048 is verholpen na versie 0.5.0 en staat sinds 8 november 2026 op stabileo.com. SA-2026-049, SA-2026-050, SA-2026-051, SA-2026-052 en SA-2026-053 zijn verholpen na versie 0.5.0 en staan sinds 9 november 2026 op stabileo.com. Ze publiceren hoort bij hoe we de resultaten verifiëren en is geen teken dat ze nog openstaan. Een bericht geldt als verholpen wanneer de correctie live staat op stabileo.com, niet wanneer de wijziging bestaat. Zolang een bericht openstaat, gebruik je de bijbehorende tijdelijke oplossing en controleer je het getroffen resultaat met de hand voordat je tekent. SA-2026-054 tot en met 063 zijn verholpen in 0.6.0, behalve SA-2026-056. Verifieer voor alle getroffen gekoppelde raamwerk-schaalmodellen de dynamische respons onafhankelijk, ook wanneer equivalente modelbeschrijvingen overeenkomen."
    },
    {
      "k": "note",
      "t": "SA-2026-058 — Verholpen in 0.6.0."
    },
    {
      "k": "note",
      "t": "SA-2026-061 — Verholpen in 0.6.0."
    },
    {
      "k": "note",
      "t": "SA-2026-063 — Verholpen in 0.6.0."
    },
    {
      "k": "note",
      "t": "SA-2026-064 — Verholpen in 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-064-steel-cb-combination.md",
      "label": "SA-2026-064",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-065 — Verholpen in 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-065-snow-roof-step.md",
      "label": "SA-2026-065",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-066 — Verholpen in 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-066-cirsoc201-transverse-cm.md",
      "label": "SA-2026-066",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-067 — Verholpen in 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-067-snow-roof-rotation.md",
      "label": "SA-2026-067",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-068 — Verholpen in 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-068-provided-torsion-stirrups.md",
      "label": "SA-2026-068",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-069 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-069-torsion-secondary-shear.md",
      "label": "SA-2026-069",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-070 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-070-interior-member-couples.md",
      "label": "SA-2026-070",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-071 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-071-incomplete-concurrent-demands.md",
      "label": "SA-2026-071",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-072 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-072-snow-ridge-subdivision.md",
      "label": "SA-2026-072",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-073 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-073-snow-crossing-moment.md",
      "label": "SA-2026-073",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-074 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-074-snow-panel-subdivision.md",
      "label": "SA-2026-074",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-075 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-075-cirsoc201-secondary-stirrup-legs.md",
      "label": "SA-2026-075",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-076 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-076-wind-enclosure.md",
      "label": "SA-2026-076",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-077 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-077-wind-wall-height-transfer.md",
      "label": "SA-2026-077",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-078 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-078-wind-roof-pressure-zones.md",
      "label": "SA-2026-078",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-079 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-079-gravity-shell-coverage.md",
      "label": "SA-2026-079",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-080 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-080-floor-zone-eccentricity.md",
      "label": "SA-2026-080",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-082 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-082-snow-companion-basis.md",
      "label": "SA-2026-082",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-083 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-083-concentrated-live-actions.md",
      "label": "SA-2026-083",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-084 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-fillet-weld-physical-runs.md",
      "label": "SA-2026-084",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-085 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-fillet-weld-physical-runs.md",
      "label": "SA-2026-085",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-086 — Verholpen in #2316, wacht op release."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-086-seismic-static-story-forces.md",
      "label": "SA-2026-086",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-087 — Genereren geweigerd in #2316, wacht op release."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-087-seismic-modal-load-generation.md",
      "label": "SA-2026-087",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-088 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-gravity-core.md#combined-member-diagram-extrema",
      "label": "SA-2026-088",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-089 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-089-roller-z-fixed.md",
      "label": "SA-2026-089",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-090 — Verholpen in 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-gravity-core.md#width-mode-level-mass-follows-loaded-carriers",
      "label": "SA-2026-090",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-091 — Ingedamd in #2338, wacht op release."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-091-rc-torsion-shear-verification.md",
      "label": "SA-2026-091",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-092 — Gecombineerd geval geweigerd in #2372 en sneden gecorrigeerd in #2382, wacht op release."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-092-section-stress-shear.md",
      "label": "SA-2026-092",
      "t": "Het voorbeeld van de dunne buis plaatst de vezel in de lokale assen van de staaf (y = 0.0995 m, z = 0). De oude berekening gaf 4.5697 MPa resulterende schuifspanning en 7.9149 MPa Von Mises, en de toetsing slaagde voor beide tekens van het wringend moment. Wanneer de schuifspanningsbijdragen elkaar versterken, is de som met teken 6.4625 MPa. De bijbehorende Von Mises-spanning is 11.1934 MPa, wat de vloeigrens van 9 MPa overschrijdt. Wanneer de bijdragen elkaar opheffen, is de Von Mises-spanning bijna nul en slaagt de toetsing."
    },
    {
      "k": "note",
      "t": "SA-2026-093 — Verholpen in #2381, wacht op release."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-093-plane-moving-load-axial-force.md",
      "label": "SA-2026-093",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-094 — Verholpen in #2364, wacht op release."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-094-plane-free-body-end-moments.md",
      "label": "SA-2026-094",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-095 — Verholpen in #2364, wacht op release."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-095-plane-signed-scoped-self-weight.md",
      "label": "SA-2026-095",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-096 — Verholpen in 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-096-static-seismic-stories-and-rafters.md",
      "label": "SA-2026-096",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-097 — Verholpen in 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-097-workbook-inputs-and-plane-springs.md",
      "label": "SA-2026-097",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-098 — Verholpen in 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-098-rc-drawn-reinforcement-verification.md",
      "label": "SA-2026-098",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-099 — Ingedamd in 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-099-gravity-and-roof-step-loads.md",
      "label": "SA-2026-099",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-100 — Verholpen in 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-100-result-display-signs.md",
      "label": "SA-2026-100",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-101 — Verholpen in 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-101-plate-analysis-conformity.md",
      "label": "SA-2026-101",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-102 — Verholpen in 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-102-diagram-extrema-and-span-demands.md",
      "label": "SA-2026-102",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-103 — Verholpen in 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-103-rc-torsion-evidence.md",
      "label": "SA-2026-103",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-104 — Verholpen in 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-104-member-load-reversal-and-planar-couples.md",
      "label": "SA-2026-104",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-105 — Verholpen in 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-105-restored-planar-moment-edits.md",
      "label": "SA-2026-105",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-106 — Ingedamd in 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-106-complementary-plate-remesh-arc.md",
      "label": "SA-2026-106",
      "t": "Getroffen invoer en wat je moet doen."
    },
    {
      "k": "note",
      "t": "SA-2026-107 — Ingedamd in 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-107-plate-remesh-shell-edits.md",
      "label": "SA-2026-107",
      "t": "Getroffen invoer en wat je moet doen."
    },
    ...nextReleaseAdvisoryBlocks('Volgende release na 0.6.4.', 'Getroffen invoer en wat je moet doen.'),
    {
      "k": "img",
      "base": "blog/recheck-stale",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO met een betonraamwerk dat is opgeslagen voordat resultaten een versie kregen. Een banner onderaan luidt “Resultaten verouderd: dit project is voor het laatst berekend met een oudere versie, en 19 geregistreerde wijzigingen raken het”, met de knoppen “Wat is er veranderd” en “Opnieuw uitvoeren”.",
      "caption": "Hoe een correctie een opgeslagen project bereikt: tot het opnieuw is berekend, blijven de resultaten gemarkeerd als verouderd, met de wijzigingen die ze raken één klik verderop."
    },
    {
      "k": "h",
      "t": "Overzicht"
    },
    {
      "k": "table",
      "caption": "Gepubliceerde berichten. Ernst: kritiek wanneer capaciteit of belasting ver aan de onveilige kant kon zitten zonder zichtbaar teken.",
      "head": [
        "Bericht",
        "Wat",
        "Ernst",
        "Status"
      ],
      "rows": [
        [
          "SA-2026-001",
          "Gegenereerde combinaties en belastingen (CIRSOC 101, 102, 103) aan de onveilige kant",
          "Hoog",
          "Verholpen in 0.2.0"
        ],
        [
          "SA-2026-002",
          "Betontoetsingen (CIRSOC 201, ACI 318) overschatten het draagvermogen",
          "Kritiek",
          "Verholpen in 0.2.0"
        ],
        [
          "SA-2026-003",
          "Staal-, koudgevormd-staal- en verbindingstoetsingen overschatten het draagvermogen",
          "Kritiek",
          "Verholpen in 0.2.0"
        ],
        [
          "SA-2026-004",
          "Berekeningen die een deel van het model negeerden (dynamica, knik, plastisch bezwijken)",
          "Kritiek",
          "Verholpen in 0.2.0"
        ],
        [
          "SA-2026-005",
          "2D schuine staven: normaalkracht zonder de belastingcomponent langs de staaf",
          "Hoog",
          "Verholpen 2026-10-21"
        ],
        [
          "SA-2026-006",
          "Vlak model in 3D berekend: knoopmomenten en opgelegde rotaties omgekeerd",
          "Hoog",
          "Verholpen 2026-10-21"
        ],
        [
          "SA-2026-007",
          "3D-knik zonder wring- of buigwringknikvormen",
          "Hoog",
          "Verholpen 2026-10-21"
        ],
        [
          "SA-2026-008",
          "Responsspectrum: basisdwarskracht met SRSS onder CQC; participatie zonder aan de opleggingen gekoppelde massa",
          "Hoog",
          "Verholpen 2026-10-21"
        ],
        [
          "SA-2026-009",
          "SHB8-volumeschaal 22 % te stijf bij buiging van dunne platen (doorbuigingen 18 % te laag)",
          "Gemiddeld (hoger in statisch onbepaalde constructies)",
          "Verholpen 2026-10-19"
        ],
        [
          "SA-2026-010",
          "Spectraal certificaat liet niet-eindige resultaten door",
          "Gemiddeld",
          "Verholpen 2026-10-19"
        ],
        [
          "SA-2026-011",
          "3D-oplegging omgezet van veer naar ingeklemd of scharnierend, berekend als veer",
          "Hoog",
          "Verholpen 2026-10-20"
        ],
        [
          "SA-2026-012",
          "Materieel niet-lineaire analyse (alleen rekenkern en WASM): elastische staafkrachten na vloeien",
          "Gemiddeld",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-013",
          "Gekromde schalen: buigende momenten als nul gerapporteerd; spanningen behielden de vrije thermische rek",
          "Hoog",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-014",
          "3D plastisch bezwijken: de factor hing af van de elementnummering (tot 2,4 keer de bezwijklast)",
          "Hoog",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-015",
          "Kabels met eigen gewicht kregen te weinig trek in statisch onbepaalde constructies",
          "Hoog",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-016",
          "Bogen (gekromde liggers van de rekenkern, boogtool van de app): Iy en Iz verwisseld op bijna verticale segmenten",
          "Gemiddeld",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-017",
          "Grond-constructie-interactie: p-y-, t-z- en q-z-curven weken af van hun referenties",
          "Hoog",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-018",
          "MITC9-schalen (alleen rekenkern en WASM) op gekromde geometrie kregen rek door starre beweging",
          "Gemiddeld",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-019",
          "Temperatuurbelastingen op staven (rekenkern en WASM; de app compenseerde sinds 2026-10-07): α van staal en de hoogte van een massieve rechthoek",
          "Gemiddeld",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-020",
          "3D materieel niet-lineaire analyse (alleen rekenkern en WASM): vloeioppervlak minder behoudend dan in 2D",
          "Gemiddeld",
          "Verholpen in 0.3.0"
        ],
        [
          "SA-2026-021",
          "Vrije daken: geen wind langs de nok en, dwars erop, minder dan het minimum van §2.1.5 (17 % ervan bij 20 m/s)",
          "Hoog",
          "Verholpen in 0.4.0"
        ],
        [
          "SA-2026-022",
          "Bij gronddruk H ontbrak de combinatie waarin het eigen gewicht ertegen werkt (27 tot 45 % te laag in een voorbeeld)",
          "Hoog",
          "Verholpen in 0.4.0"
        ],
        [
          "SA-2026-023",
          "Gewapend-betonkolommen: de toetsing las één teken van het moment; ongelijke wapeningsindelingen (6, 10, 14…) slaagden aan de sterkere kant",
          "Kritiek",
          "Verholpen in 0.4.0"
        ],
        [
          "SA-2026-024",
          "Funderingen, verbindingen, vloeren, wanden en de staaloptimalisatie ontworpen voor de ongefactoreerde belastingen als combinaties waren gedefinieerd maar niet berekend (live berekening, een mislukte combinatieberekening of een lege lijst actieve combinaties)",
          "Hoog",
          "Verholpen in 0.4.0"
        ],
        [
          "SA-2026-025",
          "AISC 360 G2-dwarskracht (alleen rekenkern en WASM): zonder lijfoppervlak slaagde de toetsing met ratio 0 en werd gecertificeerd",
          "Gemiddeld",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-026",
          "EC3 6.2.6-dwarskracht (alleen rekenkern en WASM): zonder afschuifoppervlak werd Av = 0.5·A genomen, Vpl,Rd 57 % te hoog bij een HEB 300, en gecertificeerd",
          "Gemiddeld",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-027",
          "Schaalomhullende: hield de combinatie met de grootste Von Mises aan, niet het uiterste van elke component (mx 14 % te laag in een voorbeeld)",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-028",
          "EN 1992-1-1-buiging (PRO andere normen, gecertificeerd): nam aan dat het trekstaal vloeit en itereerde de bovenwapening niet; MRd tot 22 % te hoog",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-029",
          "3D: CIRSOC 201-kolommen van de app werden ontworpen met Mz over de doorsnedehoogte (36 % te weinig staal in een voorbeeld); de gecertificeerde 3D-toetsingen van de rekenkern lazen de dwarskracht Vy als lijfdwarskracht",
          "Kritiek",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-030",
          "CIRSOC 301-druk: een doorsnede met een kleiner oppervlak dan zijn platen kreeg een negatieve Qa en een capaciteit boven de plastische normaalkracht, en slaagde",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-031",
          "Tijdsdomeinanalyse: een belasting op t = 0 op een massaloze vrijheidsgraad ging verloren in de eerste stap (reciprociteit tot 33 keer fout, een keten met twee vrijheidsgraden 24 % afwijkend van de gesloten oplossing)",
          "Gemiddeld",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-032",
          "Modale analyse: de nulfrequente vorm van een mechanisme werd weggelaten en de overige vormen werden als volledig teruggegeven",
          "Gemiddeld",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-033",
          "Belastinggenerator: een vloer met één lage staaf over een deel ervan verloor zijn hele vlakbelasting (36 m² van een vloer van 6 × 6 m in een voorbeeld); vakwerken telden niet als dakconstructie",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-034",
          "De evenwichtscontrole meldde belastingen en reacties in overeenstemming voor gevallen waarvan de controle belastingen wegliet; bewerkingen van gelijke verdiepingen bereikten staven van het andere type en kopieën verloren hun scharnieren",
          "Gemiddeld",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-035",
          "Omschakeling van 3D naar 2D: de doorsnede boog staven om de verkeerde doorsnedeas (een portaal in het Y–Z-vlak 13,5 keer te stijf)",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-036",
          "Omschakeling van 3D naar 2D op Y–Z of X–Y: constraints werden gelezen alsof het raamwerk in X–Z stond (windverbanden weggelaten of buiten het vlak toegepast)",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-037",
          "3D co-roterende analyse: rotatievectoren werden afgetrokken (de Bathe–Bolourchi-bocht 1,3 % afwijkend, niet afnemend bij verfijning)",
          "Gemiddeld",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-038",
          "3D-knik: de factor van staven waarvan de druk langs de staaf toeneemt onder belastingen langs hun as kwam te hoog uit (+43 % voor één staaf), en een staaf die alleen tussen zijn uiteinden wordt gedrukt werd geweigerd",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-039",
          "Excel- en IFC-import: Iy en Iz van rechthoeken en buizen waren verwisseld (een massieve rechthoek van 20 × 40 4 keer te slap, een van 40 × 20 4 keer te stijf)",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-040",
          "ACI 318- en EN 1992-toetsingen: gewapend-betonstaven slaagden zonder dat hun torsie werd getoetst",
          "Hoog",
          "Ingedamd in 0.5.0"
        ],
        [
          "SA-2026-041",
          "Gewapend-betonkolommen: het grootste moment werd alleen onder de grootste drukkracht getoetst",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-042",
          "2D-knik: de factor van staven waarvan de druk langs de staaf toeneemt onder belastingen langs hun as kwam te hoog uit (+43 % tot +68 % voor één staaf)",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-043",
          "Harmonische analyse: de correctie voor weggelaten vormen verloor haar cijfers als één vorm veel slapper was dan de rest (79 keer bij 2,3 Hz in een voorbeeld)",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-044",
          "2D plastisch bezwijken: de bezwijkfactor veranderde met knoopnummering, staafrichting en eenheden (tot 4,6 keer op dezelfde constructie)",
          "Hoog",
          "Niet verholpen in 0.5.0: 2D plastisch bezwijken wordt achtergehouden tot #758 is gesloten; de limietanalyse zit in 0.5.0"
        ],
        [
          "SA-2026-045",
          "3D plastisch bezwijken: een staaf zonder bruikbaar plastisch moment werd behandeld als een staaf die nooit vloeit (6 keer te hoog in een voorbeeld, en gecertificeerd)",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-046",
          "Harmonische analyse: koos per belasting tussen modale superpositie en de directe oplossing, waardoor superpositie en reciprociteit braken (107 % in een knoop in een voorbeeld); stabileo.com en rekenkern/WASM-builds van main, van 5 november 2026 tot de correctie",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-047",
          "Schalen: een belastinggeval met een opgelegde oplegverplaatsing verloor zijn schaalspanningen, en combinaties en omhullenden telden alleen de schaalspanningen van de andere gevallen op (kon onveilig zijn, zonder waarschuwing); 0.2.0 tot 0.4.0",
          "Hoog",
          "Verholpen in 0.5.0"
        ],
        [
          "SA-2026-048",
          "CIRSOC 301-staal: Cb miste een tekenwisseling aan de uiteinden van een opgegeven niet-gesteunde lengte korter dan de staaf (bij elk profiel met Lb korter dan de staaf konden ook eindmomenten in Mmax ontbreken. Een U-profiel in dubbele kromming kreeg Cb = 2.55 in plaats van 1, wat de kipcapaciteit overschatte); 0.2.0 tot 0.5.0, de desktop-alfa's en stabileo.com tot 8 november 2026",
          "Hoog",
          "Verholpen na 0.5.0; op stabileo.com sinds 8 november 2026"
        ],
        [
          "SA-2026-049",
          "Opleggingen met een positieve veer en starre inklemming op dezelfde vrijheidsgraad: in 3D maakte de veer de inklemming vrij en veranderde de randvoorwaarde; code van de rekenkern in 0.2.0 tot 0.5.0",
          "Hoog",
          "Verholpen na 0.5.0; op stabileo.com sinds 9 november 2026"
        ],
        [
          "SA-2026-050",
          "Knik kon een mislukte slankheidsberekening in nul veranderen, en een berekening met meerdere gevallen kon niet-eindige waarden teruggeven binnen een geslaagd resultaat",
          "Gemiddeld",
          "Verholpen na 0.5.0; op stabileo.com sinds 9 november 2026"
        ],
        [
          "SA-2026-051",
          "3D bewegende belastingen: omhullenden misten pieken van snedekrachten binnen de staaf en misten de component van de aslast langs de staaf op schuine staven. Controleer de snedekrachtenomhullende opnieuw; 0.2.0 tot 0.5.0 en desktop-v0.1.0-alpha.1 tot en met alpha.3",
          "Hoog",
          "Verholpen na 0.5.0; op stabileo.com sinds 9 november 2026"
        ],
        [
          "SA-2026-052",
          "2D- en 3D-rekenkern, bewegende belastingen: omhullenden van normaalkracht met permanente gedeeltelijke verdeelde normaalbelastingen misten extremen op de grenzen van belastingvlakken tussen stations, wat de belasting zonder waarschuwing kon onderschatten; er wordt geen grens in uitgebrachte versies beweerd",
          "Hoog",
          "Verholpen na 0.5.0; op stabileo.com sinds 9 november 2026"
        ],
        [
          "SA-2026-053",
          "2D en 3D bewegende belastingen: puntlasten op de uiteinden namen krachten buiten de staaf mee in omhullenden, wat valse extremen van normaalkracht en dwarskracht toevoegde en de belasting overschatte; er wordt geen grens in uitgebrachte versies beweerd",
          "Laag",
          "Verholpen na 0.5.0; op stabileo.com sinds 9 november 2026"
        ],
        [
          "SA-2026-054",
          "Lineaire analyse kon stilzwijgend onnauwkeurige resultaten geven door onopgeloste stijfheid of gemiste PCG-belastingcomponenten",
          "Hoog",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-055",
          "2D en 3D P-Delta kon de versterking onderschatten en stabiliteit melden als de normaalkracht varieerde onder verdeelde belastingen of puntlasten langs een raamwerkstaaf",
          "Hoog",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-056",
          "Beperkte 3D-raamwerk- en schaalmodellen: harmonische resultaten en resultaten van geforceerde tijdsdomeinanalyse veranderen bij gelijkwaardige beschrijvingen; de omvang buiten het behouden model is niet vastgesteld",
          "Hoog",
          "Onopgelost — onafhankelijke verificatie vereist"
        ],
        [
          "SA-2026-057",
          "Weergaven van plastische certificaten konden factoren buiten hun gecertificeerde interval als binnen het interval labelen; exacte mechanisme-extractie liet resourceweigeringen vallen in builds van vóór de correctie van PR #1888",
          "Gemiddeld",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-058",
          "Grote 2D/3D harmonische modellen boven 3000 onafhankelijke vrije vrijheidsgraden konden onnauwkeurige responsies van weggelaten vormen behouden buiten q ≤ 1/16 bij frequenties buiten het bereik van de truncatiewaarschuwing (8,079 % complexe doelfout gemeten)",
          "Hoog",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-059",
          "Geavanceerde webanalyses konden kabels zonder waarschuwing drukweerstand geven (P-Delta-herhaling: −4.599884347090908 kN); controleer kabelbelastingen uit geavanceerde analyses, directe analyse en onderwijswizards",
          "Hoog",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-060",
          "Gefaseerde analyse kon werkelijke rotaties stilzwijgend stijver maken na eenheidswijzigingen of bij vrijgemaakte uiteinden met opleggingsveren; controleer gefaseerde modellen met staafscharnieren opnieuw",
          "Hoog",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-061",
          "Booglengte- en verplaatsingsbesturing lieten reacties weg en gebruikten ongeschaalde staafbelastingen; ook weglatingen in resultaten van 2D/3D-constraints, Guyan, gefaseerde analyse en tijdsdomeinanalyse moeten worden beoordeeld. Voer de getroffen resultaten opnieuw uit of controleer ze onafhankelijk; 0.2.0–0.5.0 en daaropvolgende getroffen main-builds.",
          "Hoog",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-062",
          "Ruwe 3D plastische analyse kon stilzwijgend nul melden als de initiële elastische toestand mislukte; oudere gecertificeerde builds behielden die factor. Main geeft al een positieve gecertificeerde grens met een waarschuwing; PR #1943 geeft de initiële weigering door",
          "Hoog",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-063",
          "Beperkte gefaseerde en niet-lineaire analyses lieten voorgeschreven masterbeweging vallen; kabel en tijdsdomeinanalyse weigeren nu niet-ondersteunde oplegbeweging. Bestaande algemene waarschuwingen voor dynamica blijven los van deze weglating staan",
          "Hoog",
          "Verholpen in 0.6.0"
        ],
        [
          "SA-2026-064",
          "Staal-Cb kon uit een andere combinatie komen of uit een niet-gelokaliseerde korte niet-gesteunde overspanning (#1316, #2088). Voer de CIRSOC 301-staaltoetsingen opnieuw uit en beoordeel buigcapaciteit, interactiebenutting en maatgevende combinaties.",
          "Hoog",
          "Verholpen in 0.6.1"
        ],
        [
          "SA-2026-065",
          "Sneeuwophoping bij een daksprong kon ontbreken op een hellend ontvangend dak (#2082). Genereer de CIRSOC 104-sneeuwbelastingen opnieuw en voer de getroffen berekeningen en ontwerptoetsingen opnieuw uit.",
          "Hoog",
          "Verholpen in 0.6.1"
        ],
        [
          "SA-2026-066",
          "Beton-Cm kon momentcrediet voor uiteinden krijgen bij dwarsbelasting tussen de opleggingen (#2089). Controleer slanke betonkolommen en -wanden, vergrote momenten en wapening opnieuw.",
          "Hoog",
          "Verholpen in 0.6.1"
        ],
        [
          "SA-2026-067",
          "Rotatie van het grondplan kon gegenereerde sneeuwbelastingen veranderen (#2093). Genereer belastingen opnieuw met de werkelijke dakgeometrie en voer dan berekeningen en toetsingen opnieuw uit; een oud model terugdraaien is geen herstel.",
          "Hoog",
          "Verholpen in 0.6.1"
        ],
        [
          "SA-2026-068",
          "Torsie kon slagen met ontoereikende ontworpen beugels (#2141). Voer de betonontwerptoetsingen opnieuw uit en beoordeel de werkelijke dwarswapening, de beugelafstand en torsiefouten. Niet getoetste langswapening is geen geslaagde korf.",
          "Hoog",
          "Verholpen in 0.6.1"
        ],
        [
          "SA-2026-069",
          "De doorsnedegrens voor torsie liet de gelijktijdige secundaire dwarskracht weg (#2142). Bereken betonontwerpen opnieuw en beoordeel doorsnedefalen en ontbrekende beugels; beugels toevoegen kan een overschreden doorsnedegrens niet herstellen.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-070",
          "Doorbuiging en rotatie in het binnenste deel van een staaf lieten overspanningsbelastingen weg (#2143). Beoordeel vervormde vormen, onderwijsuitlezingen en toetsingen van de gebruiksgrenstoestand voor staal en beton, inclusief volledige en gedeeltelijke trapezia. Belaste terugwinning zonder voldoende EI weigert nu expliciet.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-071",
          "Staafverificatie kon voldoen met onvolledige gelijktijdig optredende snedekrachten en momenten uit de maatgevende combinatie (#2096). Bereken beton- en staalontwerpen opnieuw en beoordeel combinaties, staven, sneden en certificaten.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-072",
          "Ongelijke onderverdeling van de dakrand kon de sneeuwnok verplaatsen en gegenereerde belastingen veranderen (#2144). Genereer sneeuwbelastingen opnieuw en bereken daarna analyses, combinaties en ontwerptoetsingen opnieuw. Alleen opgeslagen belastingen opnieuw berekenen corrigeert ze niet.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-073",
          "Staven die een sneeuwnok kruisen, kregen één uniforme druk en verloren het fysieke belastingmoment. Belastingen splitsen nu op de fysieke nok. Genereer alle betreffende gegenereerde oppervlaktebelastingen opnieuw en voer daarna berekeningen, combinaties en ontwerptoetsingen opnieuw uit. Alleen opnieuw berekenen met de opgeslagen gegenereerde belastingen corrigeert ze niet. (#2176).",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-074",
          "Het onderverdelen van een schuin spantbeen kon een expliciet dakvlak als vloer classificeren en de sneeuw aan de dakrand stilzwijgend verwijderen. De classificatie van daken gebruikt nu fysieke voetafdrukken van vlakken. Genereer alle betreffende gegenereerde oppervlaktebelastingen opnieuw en voer daarna berekeningen, combinaties en ontwerptoetsingen opnieuw uit. Alleen opnieuw berekenen met opgeslagen belastingen corrigeert ze niet. (#2172). Een ongesplitst schuin spantbeen boven een apart lager vlak kon dat vlak ook ten onrechte als dak classificeren, waardoor dak- en vloeroppervlaktebelastingen veranderden en in breedtemodus stilzwijgend sneeuw werd toegevoegd.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-075",
          "CIRSOC 201-2005 en 2025: toetsingen van secundaire dwarskracht en torsie konden beugelbenen en breedte in de primaire richting meetellen. Liggers en kolommen konden zonder waarschuwing voldoen met te weinig secundaire wapening (#2171). Bereken na het bijwerken het ontwerp van gewapend beton opnieuw en beoordeel de melding voor het opnieuw controleren van opgeslagen projecten.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-076",
          "Eén open wand kon een gebouw als open classificeren en de inwendige druk verwijderen (#2203). Beoordeel elk record van wand- en dakopeningen, classificeer de omsluiting opnieuw, genereer W en Wa opnieuw en bereken daarna analyses, combinaties en ontwerptoetsingen opnieuw. Alleen opgeslagen belastingen opnieuw berekenen corrigeert ze niet.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-077",
          "Wandwind liet funderingskrachten weg en veranderde bij onderverdeling (#2204). Beoordeel elk record van wand- en dakopeningen, classificeer de omsluiting opnieuw, genereer W en Wa opnieuw en bereken daarna analyses, combinaties en ontwerptoetsingen opnieuw. Alleen opgeslagen belastingen opnieuw berekenen corrigeert ze niet.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-078",
          "Dakdrukzones en hun eerste momenten hingen af van de onderverdeling (#2205). Beoordeel elk record van wand- en dakopeningen, classificeer de omsluiting opnieuw, genereer W en Wa opnieuw en bereken daarna analyses, combinaties en ontwerptoetsingen opnieuw. Alleen opgeslagen belastingen opnieuw berekenen corrigeert ze niet.",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-079",
          "Gedeeltelijke schaaldekking kon zwaartekrachtbelasting verliezen of op de verkeerde sneden plaatsen. Genereer zwaartekrachtbelastingen in paneelmodus met schalen opnieuw en bereken daarna de analyse en het ontwerp opnieuw. (#2199, #2200)",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-080",
          "Vloerzones die excentrische staafbelastingen vereisen worden geweigerd. Beoordeel de definitie van de vloerbelasting voordat je berekent. Een zone die een compleet paneel bedekt, past de gewone paneelreacties toe. (#2201)",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-082",
          "Begeleidende combinaties gebruikten stilzwijgend door de helling gereduceerde sneeuw in plaats van staafbelasting voor een plat dak. Oudere seismische specificaties konden ook fysieke sneeuw en sneeuw op een plat dak door elkaar halen. Genereer sneeuwbelastingen en combinaties opnieuw en voer daarna berekeningen en ontwerptoetsingen opnieuw uit. (#2211).",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-083",
          "SA-2026-083: de automatische belastinggeneratie van CIRSOC 101 blokkeert geconcentreerde gebruiks- en dakacties waarvan de maatgevende plaatsingen niet zijn geëvalueerd (§4.4). Eerder gegenereerde gelijkmatige belastingen kunnen maatgevende acties weglaten. Bekijk de betrokken modellen en controleer geconcentreerde acties handmatig voordat je berekening en ontwerp opnieuw uitvoert. (#2207).",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-084",
          "Het onderverdelen van een aan het uiteinde belaste hoeklas kon de reductie van de effectieve lengte verwijderen (#2243). Bereken getroffen toetsingen van lasgroepen opnieuw.",
          "—",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-085",
          "Een korte hoeklas kon een te grote effectieve been toegerekend krijgen (#2244). Bereken getroffen toetsingen van lasgroepen opnieuw.",
          "—",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-086",
          "Gegenereerde statische seismische belastingen konden onjuiste verdiepingskrachten en staafbelastingen geven. Genereer de getroffen belastingen opnieuw en voer berekeningen en ontwerpen opnieuw uit.",
          "Hoog",
          "Verholpen in #2316, wacht op release"
        ],
        [
          "SA-2026-087",
          "Modale seismische belastinggeneratie kon onjuiste staafkrachten geven. Genereer de getroffen belastingen opnieuw met de statische methode waar die toepasbaar is, of wacht op #2319.",
          "Hoog",
          "Genereren geweigerd in #2316, wacht op release"
        ],
        [
          "SA-2026-088",
          "ABS- en SRSS-staafdiagrammen misten extrema van de gecombineerde functie tussen belastinggrenzen. Voer combinaties, diagrammen en afhankelijke controles opnieuw uit (#2273).",
          "—",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-089",
          "Een 3D rollerZ- of custom3d-oplegging zonder expliciete inklemmingen, of een onbekend opleggingstype, werd zonder waarschuwing als volledig ingeklemd geanalyseerd. Beoordeel de bedoelde oplegcondities en bereken daarna de analyse, combinaties en het ontwerp opnieuw. (#2276).",
          "Hoog",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-090",
          "Het oppervlak van een niveau in breedtemodus en het seismische gewicht kon afwijken van de gegenereerde staafbelastingen omdat ze knoopafmetingen gebruikten of een gesloten gebied vereisten. Ze gebruiken nu de aanvoeroppervlakken van de belaste dragers. Genereer zwaartekrachtplannen, seismische gewichten en seismische belastingen opnieuw en bereken daarna afhankelijke analyses, combinaties en ontwerptoetsingen opnieuw. Alleen opgeslagen belastingen opnieuw berekenen corrigeert seismische acties niet (#2269). (#2210)",
          "—",
          "Verholpen in 0.6.2"
        ],
        [
          "SA-2026-091",
          "Toetsingen van beton op dwarskracht, torsie en seismische beugels konden slagen zonder bewijs van wapening. Voer gecertificeerde ontwerpen opnieuw uit en beoordeel de maatgevende sneden, wapeningstekeningen en rapporten.",
          "Hoog",
          "Ingedamd in #2338, wacht op release"
        ],
        [
          "SA-2026-092",
          "Gedetailleerde doorsnedespanning kon de resulterende schuifspanning en de von Mises-spanning onderschatten en een voldoende teruggeven. Bereken de getroffen spanningen opnieuw en beoordeel de diagrammen, toetsingen en rapporten.",
          "Hoog",
          "Gecombineerd geval geweigerd in #2372 en sneden gecorrigeerd in #2382, wacht op release"
        ],
        [
          "SA-2026-093",
          "Vlakke bewegende belastingen konden sprongen in normaalkracht bij geconcentreerde assen uitsmeren. Voer de getroffen omhullenden en invloedslijnen voor normaalkracht opnieuw uit en beoordeel de rapporten die erop steunden.",
          "Hoog",
          "Verholpen in #2381, wacht op release"
        ],
        [
          "SA-2026-094",
          "De 2D-vrijlichaamsinspecteur kon globale staafuiteindemomenten met het verkeerde teken tonen. Analyseresultaten waren niet getroffen. Inspecteer de staven opnieuw en genereer de getroffen rapporten opnieuw en beoordeel ze.",
          "Gemiddeld",
          "Verholpen in #2364, wacht op release"
        ],
        [
          "SA-2026-095",
          "Opgeslagen 2D-projecten met eigen-gewichtsregels met teken of bereik konden zonder waarschuwing verkeerde reacties geven. Bij het openen van getroffen projecten verschijnt een hercontrolemelding. Bereken de resultaten opnieuw en genereer dan de getroffen rapporten opnieuw en beoordeel ze.",
          "Hoog",
          "Verholpen in #2364, wacht op release"
        ],
        [
          "SA-2026-096",
          "Statische seismische generatie kon verband- of netknopen als verdiepingen tellen en spanttraagheid op eindknopen plaatsen. Controleer vloerhoogtes en spantbelasting. Genereer de gevallen opnieuw voordat je analyse en ontwerptoetsingen opnieuw uitvoert.",
          "Hoog",
          "Verholpen in 0.6.3"
        ],
        [
          "SA-2026-097",
          "Werkboekimport kon modelgegevens weglaten en 2D-exports konden een rotatieveer als translatieveer benoemen. Vergelijk het geïmporteerde model met het oorspronkelijke werkboek. Corrigeer en importeer het opnieuw, verifieer de opleggingen en belastingen, bereken daarna getroffen analyses opnieuw en genereer exports opnieuw.",
          "Hoog",
          "Verholpen in 0.6.3"
        ],
        [
          "SA-2026-098",
          "Betontoetsingen konden een te grote beugelafstand accepteren of wapening meetellen die in de doorsnede ontbreekt. Kolomtekeningen konden de verkeerde staafdiameters tonen. Controleer opnieuw tegen de aangebrachte wapening en gelijktijdig optredende snedekrachten en momenten uit de maatgevende combinatie, en beoordeel daarna de getroffen tekeningen, staten en rapporten.",
          "Hoog",
          "Verholpen in 0.6.3"
        ],
        [
          "SA-2026-099",
          "Zwaartekrachtgeneratie kon schaal- en liggeroppervlakken dubbel belasten of draagtoewijzingen veranderen na rotatie of onderverdeling. Sneeuwoverdracht bij een daksprong kon kracht en moment verliezen. Genereer de belastingen opnieuw en gebruik onafhankelijk geverifieerde gevallen overal waar generatie weigert.",
          "Hoog",
          "Ingedamd in 0.6.3"
        ],
        [
          "SA-2026-100",
          "Reactiemomenten, uitlezingen van het vrije lichaam en lijsten van puntlasten konden de verkeerde tekens of assen tonen. Verifieer de getoonde waarden tegen het evenwicht en de bedoelde belastingrichtingen. Inspecteer de getroffen resultaten opnieuw en genereer rapporten opnieuw.",
          "Gemiddeld",
          "Verholpen in 0.6.4"
        ],
        [
          "SA-2026-101",
          "PRO kon berekenen met weggelaten platen, netten op basis van onvolledige invoer of losgekoppelde wand-vloerverbindingen. Vergelijk het net met de bedoelde geometrie, herstel de getroffen platen en aansluitingen, en bereken analyse en ontwerptoetsingen opnieuw.",
          "Hoog",
          "Verholpen in 0.6.4"
        ],
        [
          "SA-2026-102",
          "Diagrammen konden verkeerde pieken of snedekrachten geven bij geconcentreerde acties, en omgekeerde overspanningsstukken konden betonontwerpzijden verwisselen. Controleer maatgevende krachten, wapeningszijden en invoer voor de momentgradiënt bij staal. Bereken getroffen analyses en toetsingen opnieuw.",
          "Hoog",
          "Verholpen in 0.6.4"
        ],
        [
          "SA-2026-103",
          "Betontoetsingen van torsie en dwarskracht konden onvoldoende dwarswapening accepteren of niet-geverifieerde omtrek- of trekstaven meetellen. Herhaal de verificatie met de werkelijke wapening en gelijktijdig optredende snedekrachten en momenten uit de maatgevende combinatie, en beoordeel getroffen rapporten.",
          "Hoog",
          "Verholpen in 0.6.4"
        ],
        [
          "SA-2026-104",
          "Het omkeren van staven kon verdeelde belastingen omleiden, en de analyse kon oude vlakke puntkoppels weglaten. Controleer opgeslagen belastingrichtingen, eindordinaten en koppelvelden. Herstel de belastingen en bereken getroffen analyses en ontwerptoetsingen opnieuw.",
          "Hoog",
          "Verholpen in 0.6.4"
        ],
        [
          "SA-2026-105",
          "Een hersteld vlak puntkoppel op nul zetten kon het oude moment actief laten. Verifieer en voer de bedoelde momenten opnieuw in, en bereken daarna getroffen analyses en ontwerptoetsingen opnieuw.",
          "Hoog",
          "Verholpen in 0.6.4"
        ],
        [
          "SA-2026-106",
          "Opnieuw meshen kon de complementaire boog van een gekromde plaatrand gebruiken. Verifieer het net tegen de opgegeven hoek, bouw getroffen netten opnieuw op, en bereken analyse en ontwerptoetsingen opnieuw.",
          "Hoog",
          "Ingedamd in 0.6.4"
        ],
        [
          "SA-2026-107",
          "Opnieuw meshen kon schaaloffsets en kromtebewerkingen weggooien. Verifieer en herstel de bedoelde schaaleigenschappen voordat je analyse en ontwerptoetsingen opnieuw uitvoert.",
          "Hoog",
          "Ingedamd in 0.6.4"
        ],
        [
          "SA-2026-108",
          "XZ- of YZ-projectie kon stilzwijgend een knoopkrachtcomponent loodrecht op het analysevlak laten vallen. Controleer de knoopkrachten in elk belastinggeval en bereken getroffen analyses en ontwerptoetsingen opnieuw met het ruimtelijke model.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-109",
          "Onbekende labels van vlakke opleggingen in DXF konden stilzwijgend als scharnierende opleggingen worden geïmporteerd. Vergelijk geïmporteerde opleggingen met de oorspronkelijke tekening, corrigeer afwijkingen en bereken getroffen analyses opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-110",
          "Webanalyse kon stilzwijgend een veer met niet-eindige stijfheid of een belastinggeval in een combinatie weglaten. Controleer veerstijfheden, namen van gevallen en nettofactoren, en bereken daarna getroffen analyses en combinaties opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-111",
          "Automatische zwaartekrachtgeneratie in paneelmodus kon dezelfde vloerbelasting dubbel tellen. Controleer overlappende schalen en verbonden liggervelden, genereer getroffen opgeslagen zwaartekrachtplannen opnieuw en bereken getroffen analyses opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-112",
          "Basic 3D kon stilzwijgend alle schaalelementen weglaten. Bereken getroffen belastinggevallen en combinaties opnieuw in PRO 3D met het volledige schaalnet, en herhaal daarna afhankelijke ontwerptoetsingen.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-113",
          "De native Rust-API kon aangeleverde lineaire resultaten certificeren voor een belastinggeval dat de solver had geweigerd. Bereken getroffen analyses en certificering opnieuw, inclusief afhankelijke combinaties en omhullenden.",
          "Gemiddeld",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-114",
          "Opgeslagen combinatieregels konden zonder waarschuwing factoren op de verkeerde belastinggroep toepassen. Herstel de bedoelde groepen, genereer getroffen combinaties en samengestelde gevallen opnieuw en bereken hun analyses en omhullenden opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-115",
          "Zwaartekrachtgeneratie in paneelmodus kon hetzelfde vloergebied via meerdere dragers belasten. Genereer getroffen zwaartekrachtplannen opnieuw, los tegenstrijdige belastingen of geometrie op en bereken getroffen analyses opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-116",
          "Niet-lineaire solvers konden een onjuist booglengtepad accepteren of de tangentiële kracht bij een schuine roloplegging weglaten. Bereken getroffen vlakke niet-lineaire en ruimtelijke corotationele analyses opnieuw, inclusief gekromde raamwerken met dwarskrachtmiddelpuntoffsets.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-117",
          "Een negatieve of nul-dichtheid van een schaal kon het eigen gewicht omkeren of weglaten. Herstel de bedoelde dichtheden, bereken getroffen statische gevallen en combinaties opnieuw en herhaal afhankelijke toetsingen.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-118",
          "Een ongeldig doel van een eigengewichtgroep kon het gewicht van de groep weglaten. Herstel het doel, bereken getroffen gevallen en combinaties opnieuw en bouw hun omhullenden opnieuw op.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-119",
          "Een weggelaten materiaaldichtheid kon onjuiste modale frequenties geven. Herstel de dichtheid, bouw de massabron opnieuw op en bereken getroffen dynamische analyses opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-120",
          "Automatische zwaartekracht kon dekbelastingen dupliceren, belastingen overdragen naar velden voorbij de automatische overspanningsgrens, of de blootstelling van dak en vloer verkeerd classificeren. Genereer getroffen zwaartekracht-, sneeuw- en windplannen opnieuw, verifieer de belastingen en bereken afhankelijke analyses opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-121",
          "Vlakke niet-lineaire analyse kon onjuiste resultaten geven voor staafbelastingen. Bereken getroffen analyses opnieuw, ook die waarmee een voortzetting werd gestart, en beoordeel verplaatsingen, reacties en staafeindkrachten.",
          "Gemiddeld",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-122",
          "Gegenereerde combinaties konden vereiste alternatieven of handmatige veranderlijke dakbelastingen weglaten, de verkeerde sneeuwbasis gebruiken of verouderde windgevallen bevatten. Beoordeel de belastingen, regelfactoren en het lidmaatschap van de omhullende. Verwijder bevestigde verouderde lege belastinggevallen uit het model, inclusief gevallen die in 0.6.4 al leeg waren. Genereer de combinaties opnieuw en verifieer dat ze die gevals-ID's uitsluiten voordat je getroffen analyses opnieuw uitvoert.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-123",
          "Automatische zwaartekracht kon belastingen onder dekken met weinig doorgangshoogte behouden of belastingen toewijzen waar de afdekking onbepaald was. Genereer getroffen zwaartekracht-, dakwind- en sneeuwbelastingen opnieuw, verifieer de toewijzingen en bereken afhankelijke analyses opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-124",
          "Eigen gewicht met bereik kon ontbrekende doelen weglaten of het gewicht van een gekozen staaf aan slechts één segment geven. Herstel het bereik, verifieer het aangebrachte gewicht en bereken getroffen analyses en responsen van onderverdeelde vlakke dynamica in de cursus opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-125",
          "Kinematische rapporten van native en WASM konden een gedeelde starre inklemming dubbel tellen. Controleer de graad van statische onbepaaldheid, de classificatie en de diagnose opnieuw, en werk de getroffen rapporten bij.",
          "Gemiddeld",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-126",
          "Herhaalde termen konden maatgevende belastingpatronen weglaten of een alternatief zonder sneeuw genereren. Beoordeel de regels, genereer getroffen combinaties en samengestelde gevallen opnieuw en bereken analyses, omhullenden en ontwerptoetsingen opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-127",
          "Vloeren konden geen belasting aan wanden doorgeven waar de netverbinding onvolledig was. Meshe beide oppervlakken opnieuw met gedeelde netranden langs de hele bedoelde aansluiting, verifieer het belastingpad en bereken getroffen ruimtelijke analyses, omhullenden en ontwerptoetsingen opnieuw.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-128",
          "Conversie kon normaalkrachtbelastingen met tekenwisseling op staven van vlakke (2D-)modellen, ongeacht hun doorsnede, of op ruimtelijke vakwerkstaven weglaten. Verifieer de verdeelde belastingen en hun equivalente eindkrachten en bereken daarna getroffen analyses, omhullenden en ontwerptoetsingen opnieuw.",
          "Gemiddeld",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-129",
          "Bewegende-belastingomhullenden konden dwarskracht of normaalkracht verkeerd weergeven, en opgeslagen voertuigposities konden sprongen in de normaalkracht in ruimtelijke vakwerken weglaten. Bij exact samenvallen geven de as en de permanente puntlast samen één sprong in de dwarskracht. De dwarskracht ertussen heeft eenzijdige limieten wanneer de as de last nadert of passeert. Controleer beide limieten met de as net vóór en net na de last. Bereken de getroffen omhullenden opnieuw, genereer opgeslagen gevallen opnieuw en voer afhankelijke berekeningen en ontwerptoetsingen opnieuw uit.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-130",
          "Vlakke elastische berekening kon zonder waarschuwing alleen nulverplaatsingen teruggeven voor een mechanisme. Controleer buigscharnieren en opleggingen, los onbedoelde mechanismen op en voer getroffen berekeningen en ontwerptoetsingen opnieuw uit.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-131",
          "De analyse kon constructieve velden, beperkingen, combinatiemethoden, grondbewegingen of belastingen per bouwfase zonder waarschuwing weglaten of verkeerd lezen. Corrigeer de invoer en voer de getroffen analyses, combinaties en ontwerptoetsingen opnieuw uit.",
          "Hoog",
          "Volgende release na 0.6.4"
        ],
        [
          "SA-2026-132",
          "Een heropend Basic-project zonder opgeslagen tekenvlak kon in het verkeerde vlak worden doorgerekend. Bevestig het bedoelde vlak, de belastingrichtingen en de opleggingen en voer de getroffen analyses, combinaties en ontwerptoetsingen opnieuw uit.",
          "Hoog",
          "Volgende release na 0.6.4"
        ]
      ]
    },
    {
      "k": "table",
      "caption": "Gevallen die in elk bericht zijn gedocumenteerd: de juiste waarde en de waarde die Stabileo meldde.",
      "head": [
        "Bericht",
        "Geval",
        "Juist",
        "Gemeld",
        "Eenheid"
      ],
      "rows": [
        [
          "SA-2026-024",
          "Portaal 6 × 4 m, 20 kN/m permanente belasting op de ligger, 15 kN wind, 1,2D + 1,6W, na een bewerking met live berekening aan: verticale reactie van de fundering aan de windzijde",
          "65,61",
          "56,01",
          "kN"
        ],
        [
          "SA-2026-023",
          "Kolom 30×30 cm, 6 Ø20 (drie aan de onderzijde), Nu = 100 kN: φMn met de zijde met drie staven onder druk",
          "78,57",
          "101,57",
          "kN·m"
        ],
        [
          "SA-2026-013",
          "Koker van vier gekromde schalen, 4 × 1 × 0,2 m, 10 kN aan de top: mx in het element aan de inklemming",
          "35,0",
          "0",
          "kN·m/m"
        ],
        [
          "SA-2026-014",
          "Ruimtelijk raamwerk met 10 staven (frame3d-2), hernummerd: plastische bezwijkfactor",
          "176,47",
          "424,3",
          "—"
        ],
        [
          "SA-2026-015",
          "Mast van 20 m met tuidraad van staal van 1 cm², 5 kN aan de top: trek in de tuidraad",
          "5,18",
          "4,34",
          "kN"
        ],
        [
          "SA-2026-011",
          "Ligger op 0, 4 en 8 m, oplegging op 8 m getekend als ingeklemd: doorbuiging bij die oplegging",
          "0",
          "-14,4",
          "mm"
        ],
        [
          "SA-2026-017",
          "Zachte klei c = 20 kPa, D = 1 m, z = 4 m: uiterste grondweerstand p_u",
          "124",
          "84",
          "kN/m"
        ],
        [
          "SA-2026-008",
          "Twee vormen bij ω en 1,1ω: basisdwarskracht ten opzichte van de CQC-waarde",
          "1,00",
          "0,81",
          "—"
        ],
        [
          "SA-2026-007",
          "Kruisvormige kolom 200×10 mm, 1,5 m: kritieke last",
          "2993",
          "5860",
          "kN"
        ],
        [
          "SA-2026-006",
          "Portaal met knoopmomenten en krachten: zijdelingse verplaatsing",
          "0,92",
          "2,52",
          "mm"
        ],
        [
          "SA-2026-005",
          "Dakspar van een zadeldak: normaalkracht aan de voet",
          "-56,67",
          "-41,67",
          "kN"
        ],
        [
          "SA-2026-019",
          "IPE 300 aan beide uiteinden ingeklemd, gradiënt van 20 °C: eindmoment",
          "14,04",
          "9,76",
          "kN·m"
        ],
        [
          "SA-2026-012",
          "Gevloeide koker van 4 m, puntlast aan de top 1,2·Mp/L: moment bij de inklemming",
          "1012,5",
          "101250",
          "kN·m"
        ],
        [
          "SA-2026-016",
          "Halfronde boog van 5 m in het Y–Z-vlak, 40 segmenten: doorbuiging in de top",
          "-7,29",
          "-6,18",
          "mm"
        ],
        [
          "SA-2026-018",
          "MITC9 cilindrisch veld 2×2 m, pijl 0,2 m, staal, 50 mm, starre rotatie van 1 mrad: grootste Von Mises-spanning in een knoop",
          "0",
          "101",
          "MPa"
        ],
        [
          "SA-2026-020",
          "3D koker 4 m, N = 0,5·Np, puntlast aan de top: belasting bij eerste vloeien",
          "158,2",
          "182,7",
          "kN"
        ],
        [
          "SA-2026-009",
          "Dunne plaat op buiging, ν = 0,3: stijfheid ten opzichte van de juiste waarde",
          "1,000",
          "1,225",
          "—"
        ]
      ]
    },
    {
      "k": "h",
      "t": "SA-2026-021: minimale wind op vrije daken"
    },
    {
      "k": "p",
      "t": "Een vrij dak (een open loods, een carport, een afdak) kreeg alleen de netto drukken van Figuren 2.4-4 tot 2.4-7, loodrecht op het dak. CIRSOC 102-2025 §2.1.5 eist ook dat de windkracht op een open gebouw minstens 0,75 kN/m² × Af bedraagt, als een eigen horizontaal belastinggeval. Zonder dat minimum was de horizontale kracht nul bij wind langs de nok, en dwars erop viel de kracht bij lage en gemiddelde snelheden onder het minimum. Elke richting heeft nu dat belastinggeval."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-021-free-roof-wind-minimum.md",
      "label": "SA-2026-021 volledig",
      "t": "Het bericht, met de metingen:"
    },
    {
      "k": "h",
      "t": "SA-2026-022: gronddruk waartegen het eigen gewicht werkt"
    },
    {
      "k": "p",
      "t": "Bij H-belastingen moet je volgens CIRSOC 101-2025 ook rekening houden met het wegvallen van belastingen. De combinaties 0.9 D + 1.6 H en 1.2 D + 1.6 H werden nooit gegenereerd, dus waar het eigen gewicht de gronddruk weerstaat (kantelen of glijden van een wand) kwam het effect te laag uit. Ze worden nu gegenereerd, met of zonder wind of aardbeving in het model."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-022-earth-pressure-dead-load-resisting.md",
      "label": "SA-2026-022 volledig",
      "t": "Het bericht, met het voorbeeld:"
    },
    {
      "k": "h",
      "t": "SA-2026-023: gewapend-betonkolommen met ongelijke wapeningsindelingen"
    },
    {
      "k": "p",
      "t": "De momenten in de stations bereiken de kolomtoetsing als grootheden zonder teken, maar de capaciteit onder normaalkracht en buiging om één as werd voor slechts één teken berekend, met de bovenzijde onder druk. Bij 6, 10, 14, 18 of 22 staven plaatst de ontwerper de extra staven aan de onder- en rechterzijde, dus dat is het sterke teken: bij omgekeerd moment is de capaciteit lager, en die werd nooit getoetst. Een kolom van 30×30 cm met 6 Ø20 onder 100 kN drukkracht draagt de ene kant op 101.57 kN·m en de andere kant op 78.57, en slaagde voor Mu = 100 kN·m. Het raakt de CIRSOC 201-kolomtoetsing onder buiging om één as (van de staven die een staaf heeft, van de ontwerper en van de hercontrole van de rekenkern); de tweeassige toetsing nam al het slechtste kwadrant."
    },
    {
      "k": "ul",
      "items": [
        "Hoe je weet of het jou raakt: het model heeft betonkolommen die met CIRSOC 201 worden getoetst en waarvan de staven niet symmetrisch zijn om de buigas: 6, 10, 14, 18 of 22 staven van de ontwerper, of met de hand ingevoerde zijden met een verschillend aantal staven op tegenoverliggende zijden.",
        "Wat je moet doen: behoud bij een bestaande kolom de werkelijke wapening, toets beide momentrichtingen en gebruik de laagste capaciteit. Een symmetrische indeling is alleen een optie bij een daadwerkelijk herontwerp.",
        "Status: verholpen in 0.4.0, live op stabileo.com sinds 25 oktober 2026. De rekenkern berekent beide tekens en neemt het zwakste; symmetrische indelingen geven precies wat ze eerder gaven."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-023-column-moment-sign.md",
      "label": "Volledig SA-2026-023",
      "t": "Het bericht, met het testgeval:"
    },
    {
      "k": "h",
      "t": "SA-2026-024: funderingen, verbindingen, vloeren en wanden ontworpen voor de ongefactoreerde belastingen"
    },
    {
      "k": "p",
      "t": "Als combinaties zijn gedefinieerd en geen ervan is berekend, lezen funderingen en verbindingen het resultaat op het scherm, waarin elke belasting factor 1 heeft: ze werden ontworpen voor de gebruiksbelastingen in plaats van de gefactoreerde combinaties. Het gebeurde met live berekening aan (na een bewerking wordt alleen “Alle belastingen” opnieuw berekend zolang het enkele aanzicht op het scherm staat) of wanneer de combinatieberekening mislukte en de enkele berekening het overnam. In een portaal onder 1.2D + 1.6W kwam de reactie van een fundering 15 % te laag uit; met permanente en veranderlijke belasting 29 tot 38 %. Hetzelfde gebeurde bij vloeren en wanden, bij de staaloptimalisatie en bij een lege lijst actieve combinaties. Elk ontwerp weigert nu, met opgave van de reden, tot de combinaties zijn berekend."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-024-design-on-unfactored-results.md",
      "label": "Volledig SA-2026-024",
      "t": "Het bericht, met het voorbeeld:"
    },
    {
      "k": "h",
      "t": "SA-2026-014: 3D plastisch bezwijken hing af van de nummering"
    },
    {
      "k": "p",
      "t": "Bij tweeassige buiging konden de controles die een scharnier sluiten dat teruglopend draait en een gesloten scharnier heropenen dat buiten het vloeioppervlak werd geduwd, in een cyclus raken. De solver ging verder vanuit de toestand waarin de elementvolgorde hem liet en duwde een gesloten doorsnede door het vloeioppervlak: dezelfde constructie, hernummerd, gaf bezwijkfactoren van 75.9 tot 424.3, tegen een gecertificeerde 176.47. De analyse stopt nu in de laatste consistente toestand en meldt die factor als ondergrens, met een waarschuwing, voor elke nummering hetzelfde. Het raakt de 3D-pushover van het PRO-tabblad."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-014-plastic-3d-element-order.md",
      "label": "Volledig SA-2026-014",
      "t": "Het bericht, met het testmodel en de gecertificeerde waarde:"
    },
    {
      "k": "h",
      "t": "SA-2026-011: 3D-oplegging omgezet van veer naar ingeklemd"
    },
    {
      "k": "p",
      "t": "Het wijzigen van het type van een oplegging die veren had, behield de veerconstanten. In 3D-modus werden ze samen met de inklemming naar de solver gestuurd, en de solver behandelde die vrijheidsgraad als elastisch: de als ingeklemd getekende oplegging werd als veer berekend. Het raakt modellen die in 3D-modus zijn berekend, ook vlakke modellen die in 3D zijn berekend; 2D-modus is niet getroffen."
    },
    {
      "k": "ul",
      "items": [
        "Hoe je weet of het jou raakt: een oplegging was eerst een veer (of had veerconstanten) en is daarna omgezet naar ingeklemd, scharnierend of een roloplegging, of er is een vrijheidsgraad als vastgezet aangevinkt. Controleer in die bewerkingsgeschiedenis welke vrijheidsgraad verhinderd moest zijn en vergelijk daar de beweging met de voorgeschreven waarde, nul bij een onbeweeglijke oplegging.",
        "Wat je moet doen: bereken de 3D-modellen waarvan de opleggingen van veren naar stijf zijn bewerkt opnieuw op stabileo.com en vergelijk de resultaten bij die opleggingen met de resultaten die je al hebt gebruikt.",
        "Status: verholpen op stabileo.com op 20 oktober 2026. Elke vastgezette vrijheidsgraad wordt als vastgezet berekend, ook in projecten die eerder zijn opgeslagen."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-011-springs-on-fixed-supports.md",
      "label": "Volledig SA-2026-011",
      "t": "Het bericht met de reproductie en het testmodel:"
    },
    {
      "k": "h",
      "t": "SA-2026-013: momenten en thermische spanningen in gekromde schalen"
    },
    {
      "k": "p",
      "t": "Gekromde schalen (vierhoeken gemarkeerd als gekromd) meldden mx = my = mxy = 0 ongeacht de buiging, en onder een temperatuurbelasting behielden hun spanningen de vrije thermische rek: een schaal die vrij kan uitzetten meldde E·α·ΔT/(1−ν), en een ingeklemde niets. De app stuurde de temperatuur van een gekromde vierhoek bovendien als die van een vlakke vierhoek, wat de rekenkern liet vallen: de schaal werd zonder verwarming berekend. Deze resultaten werden gelezen door de contourplots van schalen (ook in geëxporteerde figuren), de PRO-resultatentabel en het PDF-rapport, en het vloerontwerp wanneer een paneel een gekromde vierhoek was; het resultatenwerkboek en CSV lieten die momenten al leeg."
    },
    {
      "k": "ul",
      "items": [
        "Hoe je weet of het jou raakt: het model heeft gekromde vierhoeken en je hebt hun momenten gebruikt (contouren, de PRO-tabel of het rapport, vloerontwerp), of het heeft een temperatuurbelasting op een gekromde vierhoek.",
        "Wat je moet doen: voer die modellen opnieuw uit en herhaal elk ontwerp of elke toetsing die hun momenten of hun spanningen onder temperatuur las. Modelleer het oppervlak tot dan met vlakke vierhoeken (MITC4).",
        "Status: verholpen in 0.3.0, live op stabileo.com sinds 21 oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-013-curved-shell-moments-and-thermal.md",
      "label": "Volledig SA-2026-013",
      "t": "Het bericht, met de test-koker en de thermische gevallen:"
    },
    {
      "k": "h",
      "t": "SA-2026-017: grondcurven in grond-constructie-interactie"
    },
    {
      "k": "p",
      "t": "De grondcurven volgden de referenties niet waarnaar ze verwezen. Zachte klei liet de J-term van Matlock weg (uiterste weerstand een derde tot de helft te laag dicht bij het oppervlak); zand gebruikte altijd de cyclische factor A = 0.9 en een getrapte k-tabel; stijve klei sprong bij y50 van de halve naar de volle weerstand en viel daarna terug naar 70 %. De t-z- en q-z-curven (alleen rekenkern en WASM) misten de schaftomtrek en het puntoppervlak. Het betreft PRO → Geavanceerd → Grond-constructie-interactie. Het paneel vraagt nu om J en de belasting van het zand, en de rekenkern weigert een curve waarvan een invoer ontbreekt in plaats van die aan te nemen. Wat je moet doen: voer die modellen opnieuw uit en controleer doorbuigingen en momenten van palen opnieuw."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-017-soil-curves.md",
      "label": "Volledig SA-2026-017",
      "t": "Het bericht, met waarden voor en na voor elke curve:"
    },
    {
      "k": "h",
      "t": "SA-2026-019: temperatuurbelastingen op staven"
    },
    {
      "k": "p",
      "t": "De rekenkern berekende de thermische belasting van elke staaf met α = 12·10⁻⁶ /°C (die van staal) en met de hoogte van de gelijkwaardige massieve rechthoek, √(12·I/A). Bij een IPE kwam een gradiëntmoment 30 % te laag uit, en bij aluminium de normaalkracht door temperatuur bijna de helft. De app compenseerde beide sinds 7 oktober 2026, dus dit raakt direct gebruik van de rekenkern of zijn WASM-API, en thermische modellen die vóór die datum in de app zijn berekend."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-019-frame-thermal-alpha-depth.md",
      "label": "Volledig SA-2026-019",
      "t": "Het bericht, met de testgevallen:"
    },
    {
      "k": "h",
      "t": "SA-2026-012: staafkrachten in materieel niet-lineaire analyse"
    },
    {
      "k": "p",
      "t": "Nadat een staaf was gaan vloeien, bracht de solver de belastingen in evenwicht met de verlaagde stijfheid, maar meldde krachten die met de elastische stijfheid waren berekend. Verplaatsingen en reacties waren juist; staafkrachten en benutting niet: in een koker was het gemelde moment 100 keer het werkelijke. Deze solver is alleen bereikbaar via de rekenkern of zijn WASM-API: geen enkel scherm in de app roept hem aan, dus resultaten op stabileo.com zijn niet getroffen."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-012-material-nonlinear-member-forces.md",
      "label": "Volledig SA-2026-012",
      "t": "Het bericht, met de test-koker:"
    },
    {
      "k": "h",
      "t": "SA-2026-016: doorsnedeassen op de bijna verticale segmenten van een boog"
    },
    {
      "k": "p",
      "t": "De rechte segmenten van een boog namen de standaard lokale assen van een rechte staaf, die voor een staaf binnen 2,56° van verticaal de globale X als referentie nemen. In het gedocumenteerde voorbeeld in het Y–Z-vlak draaide dat de doorsnede van de bijna verticale segmenten bij de aanzetten 90°: Iy en Iz waren daar verwisseld. In een halve cirkel van 40 segmenten in het Y–Z-vlak kwam de doorbuiging in de top 15 % te laag uit. Het raakt gekromde liggers van de rekenkern en bogen die zijn getekend met de boogtool van het tabblad Staven (PRO) wanneer een segment bijna verticaal is; krommen in het grondplan zijn niet getroffen. Eerder opgeslagen bogen krijgen de gecorrigeerde assen wanneer het project wordt geopend."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-016-curved-member-axes.md",
      "label": "Volledig SA-2026-016",
      "t": "Het bericht, met de testboog:"
    },
    {
      "k": "h",
      "t": "SA-2026-015: trek in kabels met eigen gewicht"
    },
    {
      "k": "p",
      "t": "De kabelanalyse gebruikte de modulus van Ernst, de raaklijn van de koordewet van een kabel die onder zijn eigen gewicht hangt, alsof het een secant vanaf het rechte koorde was. Doorhang neemt koordelengte in beslag, dus een kabel heeft voor een gegeven rek meer trek nodig dan EA·ε, niet minder. Waar evenwicht alleen de kabelkracht bepaalt, was de trek juist; waar de kabel de belasting deelt met andere staven (een mast met tuidraden, een kabel die een raamwerk verbindt) kreeg de kabel te weinig trek en de staven ernaast te veel: in de testmast 4.34 kN in plaats van 5.18 kN, en bij kleinere belastingen convergeerde de iteratie niet. In de app raakt het 3D-modellen met staven met gedrag “kabel” en een materiaal met dichtheid."
    },
    {
      "k": "ul",
      "items": [
        "Hoe je het weet: het model heeft staven met het gedrag “kabel”, hun materiaal heeft een dichtheid en de kabel is niet het enige lastpad.",
        "Wat je moet doen: controleer de maatgevende kabel- en ankerkrachten onafhankelijk, met het eigen gewicht van de kabel meegenomen. Voer de berekening opnieuw uit in een verholpen versie.",
        "Status: verholpen in 0.3.0. De kabelanalyse lost de koordewet nu zelf op met Newton-iteratie."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-015-cable-tension-chord-law.md",
      "label": "Volledig SA-2026-015",
      "t": "Het bericht, met de testmast en zijn gesloten oplossing:"
    },
    {
      "k": "h",
      "t": "SA-2026-018: MITC9-schalen op gekromde geometrie"
    },
    {
      "k": "p",
      "t": "Het MITC9-element is vlak: het projecteert zijn negen knopen op één vlak. Wanneer de knopen op de zijden of in het midden buiten dat vlak lagen (elk gekromd MITC9-net) miste de projectie de starre-koppelingscorrectie van de MITC4, zodat een starre rotatie het element deed rekken: een gekromd net weerstond de rotaties van zijn elementen en meldde er spanningen voor (101 MPa op een testveld dat 1 mrad was gedraaid). Dit element wordt alleen gebruikt via de rekenkern of zijn WASM-API: de app maakt geen elementen met negen knopen, dus resultaten op stabileo.com zijn niet getroffen."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-018-mitc9-curved-rigid-motion.md",
      "label": "Volledig SA-2026-018",
      "t": "Het bericht, met het testveld en de halve bol:"
    },
    {
      "k": "h",
      "t": "SA-2026-020: vloeioppervlak van 3D materieel niet-lineaire analyse"
    },
    {
      "k": "p",
      "t": "In 2D vloeit een staaf wanneer (N/Np)² + |M|/Mp groter is dan 1. In 3D gebruikte de solver (N/Np)² + (My/Mpy)² + (Mz/Mpz)², met gekwadrateerde momentverhoudingen, zodat bij normaalkracht of buiging om beide assen een 3D-staaf later vloeide dan dezelfde staaf in 2D en de gemelde benutting laag was: met N = 0.5·Np kwam de belasting bij eerste vloeien 15 % te hoog uit. 3D gebruikt nu (N/Np)² + |My|/Mpy + |Mz|/Mpz, wat voor buiging om één as het 2D-oppervlak is. Deze solver is alleen bereikbaar via de rekenkern of zijn WASM-API: geen enkel scherm van de app roept hem aan, dus resultaten op stabileo.com zijn niet getroffen."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md",
      "label": "Volledig SA-2026-020",
      "t": "Het bericht, met de testgevallen:"
    },
    {
      "k": "h",
      "t": "SA-2026-008: basisdwarskracht en modale participatie in spectrale analyse"
    },
    {
      "k": "p",
      "t": "Met de CQC-regel werd de gemelde basisdwarskracht nog steeds met SRSS gecombineerd. De modale basisdwarskrachten in één richting hebben hetzelfde teken, dus CQC geeft meer dan SRSS: bij twee dicht bij elkaar liggende vormen was de gemelde waarde 19 % te laag. De participatiefactoren lieten ook de massa weg die de consistente massamatrix aan de opleggingen koppelt, wat de respons onderschatte in modellen met weinig elementen per kolom."
    },
    {
      "k": "ul",
      "items": [
        "Hoe je weet of het jou raakt: je hebt een spectrale analyse met CQC uitgevoerd en de gemelde basisdwarskracht gebruikt (bijvoorbeeld om die op te schalen naar de statische basisdwarskracht), of je hebt consistente massa gebruikt met kolommen van één of twee elementen.",
        "Wat je moet doen: bereken de getroffen modellen opnieuw op stabileo.com en vergelijk met de resultaten die je al hebt gebruikt. De tijdelijke oplossing die dit bericht vóór de correctie gaf, geldt niet meer.",
        "Status: verholpen op stabileo.com op 21 oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-008-spectral-combination.md",
      "label": "Volledig SA-2026-008",
      "t": "Het bericht, met de twee fouten afzonderlijk:"
    },
    {
      "k": "h",
      "t": "SA-2026-007: wringknik en buigwringknik in 3D"
    },
    {
      "k": "p",
      "t": "De geometrische stijfheid van 3D-staven had alleen de buigtermen: geen Wagner-term en geen koppeling met het afschuifmiddelpunt. Wringknik en buigwringknik kwamen nooit voor en in plaats daarvan werd de eulerlast gemeld. Voor een kruisvormige kolom lag de gemelde last 96 % boven de maatgevende."
    },
    {
      "k": "ul",
      "items": [
        "Hoe je weet of het jou raakt: je hebt de 3D-knikfactor of 3D P-Delta gebruikt voor constructies met open dunwandige doorsneden met lage wringstijfheid: kruisvormige profielen, enkele of dubbele hoekprofielen, T-profielen, U-profielen. Dubbel symmetrische I-doorsneden, waarvoor onafhankelijk is aangetoond dat buigknik maatgevend is, zijn niet getroffen. Ontwerptoetsingen die zelf de wringknik berekenen (CIRSOC 301 E.4, sinds 0.2.0) zijn evenmin getroffen.",
        "Wat je moet doen: bereken de getroffen modellen opnieuw op stabileo.com en vergelijk met de resultaten die je al hebt gebruikt. De tijdelijke oplossing die dit bericht vóór de correctie gaf, geldt niet meer.",
        "Status: verholpen op stabileo.com op 21 oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-007-torsional-buckling.md",
      "label": "Volledig SA-2026-007",
      "t": "Het bericht, met de kruisvormige kolom uitgewerkt:"
    },
    {
      "k": "h",
      "t": "SA-2026-006: vlak model in 3D berekend met knoopmomenten"
    },
    {
      "k": "p",
      "t": "Een vlak model dat door de 3D-solver wordt berekend, staat in het X–Z-vlak, waar de vlakke rotatie een rotatie om −Y is. Knoopmomenten en opgelegde rotaties moesten van teken wisselen en deden dat niet, dus ze werkten als hun spiegelbeeld. In combinatie met krachten kunnen ze optellen in plaats van elkaar op te heffen."
    },
    {
      "k": "ul",
      "items": [
        "Hoe je weet of het jou raakt: het model is vlak (alle knopen in één vlak), is in 3D-modus berekend en heeft knoopmomenten of opgelegde oplegrotaties. Rotatieveren zijn niet getroffen.",
        "Wat je moet doen: bereken de getroffen modellen opnieuw op stabileo.com en vergelijk met de resultaten die je al hebt gebruikt. De tijdelijke oplossing die dit bericht vóór de correctie gaf, geldt niet meer.",
        "Status: verholpen op stabileo.com op 21 oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-006-mirrored-moments-2d-in-3d.md",
      "label": "Volledig SA-2026-006",
      "t": "Het bericht, met de drie testgevallen:"
    },
    {
      "k": "h",
      "t": "SA-2026-005: normaalkracht in schuine 2D-staven"
    },
    {
      "k": "p",
      "t": "De 2D-belastingopbouw verplaatste de component langs de staaf van een belasting op een schuine staaf naar de eindknopen. Reacties en verplaatsingen waren juist, maar de staaf zag die belasting niet in zijn overspanning, dus zijn normaalkracht bleef constant op het gemiddelde van zijn ware eindwaarden: 26 % te laag aan de voet van een dakspar. Het diagram, de inspecteur, het rapport, de Excel-export en het ontwerp gebruikten allemaal die waarde. Een koppel op een staaf werd ook weggelaten wanneer een vlak model in 3D werd berekend."
    },
    {
      "k": "ul",
      "items": [
        "Hoe je weet of het jou raakt: een 2D-model dat sinds 25/09/2026 is berekend met schuine staven (dakspars, trappen, windverbanden, bogen getekend als segmenten) met verdeelde belastingen, puntlasten of eigen gewicht met een component langs de staaf; of een vlak model met een koppel op een staaf dat in 3D is berekend. Op druk ontworpen staven lopen het meeste risico.",
        "Wat je moet doen: bereken de getroffen modellen opnieuw op stabileo.com en vergelijk met de resultaten die je al hebt gebruikt. De tijdelijke oplossing die dit bericht vóór de correctie gaf, geldt niet meer.",
        "Status: verholpen op stabileo.com op 21 oktober 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-005-inclined-member-loads.md",
      "label": "Volledig SA-2026-005",
      "t": "Het bericht, met de dakspar en de 3-4-5-staaf:"
    },
    {
      "k": "h",
      "t": "Verholpen op 19 oktober 2026"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-009: het volumeschaalelement SHB8 was 22 % te stijf bij buiging van dunne platen (Poisson-diktelocking), waardoor het doorbuigingen met ongeveer 18 % onderschatte. Controleer conclusies over doorbuiging en trillingen opnieuw voor modellen met volumeschaalplaten die vóór die datum zijn berekend; MITC4, MITC9, DKT en de gekromde schaal waren niet getroffen.",
        "SA-2026-010: het certificaat van de spectrale analyse kon niet-eindige resultaten (NaN) laten slagen. De getallen waren zichtbaar ongeldig; wat niet klopte was de verificatieclaim. Er hoeft niets opnieuw te worden gecontroleerd, tenzij een opgeleverd resultaat niet-eindige waarden toonde."
      ]
    },
    {
      "k": "h",
      "t": "Verholpen in versie 0.2.0"
    },
    {
      "k": "p",
      "t": "Versie 0.2.0, van 18 oktober 2026, verhielp de vier retroactieve berichten. Ze raken allemaal projecten die vóór 17 oktober 2026 zijn berekend, en het advies is voor elk hetzelfde: genereer belastingen en combinaties opnieuw, bereken en beoordeel de ontwerptoetsingen, en controleer elke oplevering die met een eerdere versie is gedaan opnieuw."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001: gegenereerde CIRSOC 101-, 102- en 103-combinaties en -belastingen aan de onveilige kant (in één voorbeeld was de normaalkracht van een kolom 29 % te laag).",
        "SA-2026-002: CIRSOC 201- en ACI 318-betontoetsingen overschatten het draagvermogen (φMn tot 18 % te hoog).",
        "SA-2026-003: staal-, koudgevormd-staal- en verbindingstoetsingen overschatten het draagvermogen (lijfdwarskracht tot 60 % te hoog).",
        "SA-2026-004: berekeningen die een deel van het model negeerden (tijdsdomeinanalyse van grondbeweging verloor tot de helft van de aardbevingsbelasting; 3D plastisch bezwijken tot 2,3 keer onveilig)."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Alle berichten",
      "t": "De volledige lijst, met elk bericht, zijn correctie en zijn ernst:"
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Hoe we deze fouten hebben gevonden, en wat geen enkele verificatie kan garanderen:"
    }
  ]
};

export default body;
