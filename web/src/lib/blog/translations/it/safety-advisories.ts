import { nextReleaseAdvisoryBlocks } from '../../next-release-advisories';
import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Bollettini di sicurezza: quali risultati sono cambiati e cosa fare",
  "excerpt": "I difetti di Stabileo che potevano dare risultati errati o non a favore di sicurezza: chi riguardano, come capire se un modello è interessato, cosa fare nel frattempo e quando sono stati corretti.",
  "blocks": [
    {
      "k": "p",
      "t": "I risultati di Stabileo si usano per progettare strutture reali. Quando troviamo un difetto che avrebbe potuto produrre un risultato errato, e in particolare non a favore di sicurezza, lo pubblichiamo come bollettino di sicurezza: cosa non andava, quali modelli riguarda, come riconoscerli, cosa fare finché la correzione non è online e cosa ricontrollare nei risultati già utilizzati."
    },
    {
      "k": "p",
      "t": "Quasi tutti questi difetti sono stati trovati dal nostro programma di verifica: confronto con altri sette programmi agli elementi finiti, esempi svolti pubblicati, prove di invarianti fisici e una revisione della derivazione di ogni elemento. Pubblicarli fa parte di quel lavoro: un difetto non segnalato resta nei calcoli già consegnati."
    },
    {
      "k": "note",
      "t": "Stato dopo la versione 0.6.0: sono stati corretti i difetti da SA-2026-001 a 004 nella versione 0.2.0 e da SA-2026-005 a 020 nella versione 0.3.0, da SA-2026-021 a 024 nella versione 0.4.0 e da SA-2026-025 a 047 nella versione 0.5.0, con due eccezioni. Per SA-2026-040 la verifica a torsione resta incompleta. Per SA-2026-044 il collasso plastico 2D resta rifiutato finché #758 non si chiude. SA-2026-048 è stato corretto dopo la versione 0.5.0 ed è su stabileo.com dall’8 novembre 2026. SA-2026-049, SA-2026-050, SA-2026-051, SA-2026-052 e SA-2026-053 sono stati corretti dopo la versione 0.5.0 e sono su stabileo.com dal 9 novembre 2026. Pubblicarli fa parte di come verifichiamo i risultati, non è segno che siano ancora aperti. Un bollettino conta come corretto quando la correzione è online su stabileo.com, non quando la modifica esiste. Finché un bollettino è aperto, usa il suo rimedio e controlla a mano il risultato interessato prima di firmare. Da SA-2026-054 a SA-2026-063 le correzioni sono incluse nella 0.6.0, tranne SA-2026-056: verifica in modo indipendente le sollecitazioni dinamiche interessate prima di usarle."
    },
    {
      "k": "note",
      "t": "SA-2026-058 — Correzione della PR #1922 pubblicata nella 0.6.0."
    },
    {
      "k": "note",
      "t": "SA-2026-061 — Correzione della PR #1952 pubblicata nella 0.6.0."
    },
    {
      "k": "note",
      "t": "SA-2026-063 — Correzione della PR #2009 pubblicata nella 0.6.0."
    },
    {
      "k": "note",
      "t": "SA-2026-064 — Risolto nella 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-064-steel-cb-combination.md",
      "label": "SA-2026-064",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-065 — Risolto nella 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-065-snow-roof-step.md",
      "label": "SA-2026-065",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-066 — Risolto nella 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-066-cirsoc201-transverse-cm.md",
      "label": "SA-2026-066",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-067 — Risolto nella 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-067-snow-roof-rotation.md",
      "label": "SA-2026-067",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-068 — Risolto nella 0.6.1."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-068-provided-torsion-stirrups.md",
      "label": "SA-2026-068",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-069 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-069-torsion-secondary-shear.md",
      "label": "SA-2026-069",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-070 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-070-interior-member-couples.md",
      "label": "SA-2026-070",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-071 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-071-incomplete-concurrent-demands.md",
      "label": "SA-2026-071",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-072 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-072-snow-ridge-subdivision.md",
      "label": "SA-2026-072",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-073 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-073-snow-crossing-moment.md",
      "label": "SA-2026-073",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-074 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-074-snow-panel-subdivision.md",
      "label": "SA-2026-074",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-075 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-075-cirsoc201-secondary-stirrup-legs.md",
      "label": "SA-2026-075",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-076 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-076-wind-enclosure.md",
      "label": "SA-2026-076",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-077 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-077-wind-wall-height-transfer.md",
      "label": "SA-2026-077",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-078 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-078-wind-roof-pressure-zones.md",
      "label": "SA-2026-078",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-079 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-079-gravity-shell-coverage.md",
      "label": "SA-2026-079",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-080 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-080-floor-zone-eccentricity.md",
      "label": "SA-2026-080",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-082 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-082-snow-companion-basis.md",
      "label": "SA-2026-082",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-083 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-083-concentrated-live-actions.md",
      "label": "SA-2026-083",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-084 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-fillet-weld-physical-runs.md",
      "label": "SA-2026-084",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-085 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-fillet-weld-physical-runs.md",
      "label": "SA-2026-085",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-086 — Risolto in #2316, in attesa di rilascio."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-086-seismic-static-story-forces.md",
      "label": "SA-2026-086",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-087 — Generazione rifiutata in #2316, in attesa di rilascio."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-087-seismic-modal-load-generation.md",
      "label": "SA-2026-087",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-088 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-gravity-core.md#combined-member-diagram-extrema",
      "label": "SA-2026-088",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-089 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-089-roller-z-fixed.md",
      "label": "SA-2026-089",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-090 — Risolto nella 0.6.2."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/results-changes/2026-11-gravity-core.md#width-mode-level-mass-follows-loaded-carriers",
      "label": "SA-2026-090",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-091 — Contenuto in #2338, in attesa di rilascio."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-091-rc-torsion-shear-verification.md",
      "label": "SA-2026-091",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-092 — Caso combinato rifiutato in #2372 e sezioni di taglio corrette in #2382, in attesa di rilascio."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-092-section-stress-shear.md",
      "label": "SA-2026-092",
      "t": "L’esempio del tubo sottile colloca la fibra negli assi locali dell’asta (y = 0,0995 m, z = 0). Il vecchio calcolo dava 4,5697 MPa di taglio totale e 7,9149 MPa di von Mises, e la verifica passava per entrambi i segni del momento torcente. Quando i contributi di taglio si sommano, la somma di taglio con segno è 6,4625 MPa. La tensione di von Mises corrispondente è 11,1934 MPa, che supera la tensione di snervamento di 9 MPa. Quando i contributi si elidono, la tensione di von Mises è prossima a zero e la verifica è superata."
    },
    {
      "k": "note",
      "t": "SA-2026-093 — Risolto in #2381, in attesa di rilascio."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-093-plane-moving-load-axial-force.md",
      "label": "SA-2026-093",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-094 — Risolto in #2364, in attesa di rilascio."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-094-plane-free-body-end-moments.md",
      "label": "SA-2026-094",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-095 — Risolto in #2364, in attesa di rilascio."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-095-plane-signed-scoped-self-weight.md",
      "label": "SA-2026-095",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-096 — Risolto nella 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-096-static-seismic-stories-and-rafters.md",
      "label": "SA-2026-096",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-097 — Risolto nella 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-097-workbook-inputs-and-plane-springs.md",
      "label": "SA-2026-097",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-098 — Risolto nella 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-098-rc-drawn-reinforcement-verification.md",
      "label": "SA-2026-098",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-099 — Contenuto nella 0.6.3."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-099-gravity-and-roof-step-loads.md",
      "label": "SA-2026-099",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-100 — Corretto nella 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-100-result-display-signs.md",
      "label": "SA-2026-100",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-101 — Corretto nella 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-101-plate-analysis-conformity.md",
      "label": "SA-2026-101",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-102 — Corretto nella 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-102-diagram-extrema-and-span-demands.md",
      "label": "SA-2026-102",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-103 — Corretto nella 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-103-rc-torsion-evidence.md",
      "label": "SA-2026-103",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-104 — Corretto nella 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-104-member-load-reversal-and-planar-couples.md",
      "label": "SA-2026-104",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-105 — Corretto nella 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-105-restored-planar-moment-edits.md",
      "label": "SA-2026-105",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-106 — Contenuto nella 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-106-complementary-plate-remesh-arc.md",
      "label": "SA-2026-106",
      "t": "Dati interessati e azione per l’utente."
    },
    {
      "k": "note",
      "t": "SA-2026-107 — Contenuto nella 0.6.4."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-107-plate-remesh-shell-edits.md",
      "label": "SA-2026-107",
      "t": "Dati interessati e azione per l’utente."
    },
    ...nextReleaseAdvisoryBlocks('Prossimo rilascio dopo la 0.6.4.', 'Dati interessati e azione per l’utente.'),
    {
      "k": "img",
      "base": "blog/recheck-stale",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo PRO con un telaio in calcestruzzo salvato prima che i risultati fossero versionati. Un banner in fondo riporta “Risultati obsoleti: questo progetto è stato calcolato l’ultima volta con una versione precedente e 19 modifiche registrate lo riguardano”, con i pulsanti “Cosa è cambiato” e “Ricalcola”.",
      "caption": "Come una correzione raggiunge un progetto salvato: finché non viene calcolato di nuovo, i suoi risultati restano segnati come obsoleti, con le modifiche che lo riguardano a un clic di distanza."
    },
    {
      "k": "h",
      "t": "Riepilogo"
    },
    {
      "k": "table",
      "caption": "Bollettini pubblicati. Gravità: critica quando la resistenza o la sollecitazione potrebbero essere molto dal lato non sicuro senza alcun segno visibile.",
      "head": [
        "Bollettino",
        "Cosa",
        "Gravità",
        "Stato"
      ],
      "rows": [
        [
          "SA-2026-001",
          "Combinazioni e carichi generati (CIRSOC 101, 102, 103) non a favore di sicurezza",
          "Alta",
          "Risolto nella 0.2.0"
        ],
        [
          "SA-2026-002",
          "Le verifiche del calcestruzzo (CIRSOC 201, ACI 318) sovrastimavano la resistenza",
          "Critica",
          "Risolto nella 0.2.0"
        ],
        [
          "SA-2026-003",
          "Le verifiche di acciaio, formato a freddo e collegamenti sovrastimavano la resistenza",
          "Critica",
          "Risolto nella 0.2.0"
        ],
        [
          "SA-2026-004",
          "Analisi che ignoravano parte del modello (dinamica, instabilità, collasso plastico)",
          "Critica",
          "Risolto nella 0.2.0"
        ],
        [
          "SA-2026-005",
          "Aste inclinate 2D: sforzo normale senza la componente del carico lungo l’asta",
          "Alta",
          "Risolto il 21 ottobre 2026"
        ],
        [
          "SA-2026-006",
          "Modello piano risolto in 3D: momenti nodali e rotazioni imposte invertiti",
          "Alta",
          "Risolto il 21 ottobre 2026"
        ],
        [
          "SA-2026-007",
          "Instabilità 3D senza modi torsionali o flesso-torsionali",
          "Alta",
          "Risolto il 21 ottobre 2026"
        ],
        [
          "SA-2026-008",
          "Spettro di risposta: taglio alla base SRSS con CQC; partecipazione senza massa accoppiata ai vincoli",
          "Alta",
          "Risolto il 21 ottobre 2026"
        ],
        [
          "SA-2026-009",
          "Guscio solido SHB8 più rigido del 22 % a flessione di piastra sottile (frecce inferiori del 18 %)",
          "Media (più alta nelle strutture iperstatiche)",
          "Risolto il 19 ottobre 2026"
        ],
        [
          "SA-2026-010",
          "Il certificato spettrale lasciava passare risultati non finiti",
          "Media",
          "Risolto il 19 ottobre 2026"
        ],
        [
          "SA-2026-011",
          "Vincolo 3D passato da molla a incastro o cerniera, risolto come molla",
          "Alta",
          "Risolto il 20 ottobre 2026"
        ],
        [
          "SA-2026-012",
          "Analisi non lineare di materiale (solo motore e WASM): sollecitazioni elastiche delle aste dopo lo snervamento",
          "Media",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-013",
          "Gusci curvi: momenti flettenti riportati come zero; le tensioni conservavano la deformazione termica libera",
          "Alta",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-014",
          "Collasso plastico 3D: il fattore dipendeva dalla numerazione degli elementi (fino a 2,4 volte il carico di collasso)",
          "Alta",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-015",
          "Cavi con peso proprio con tiro insufficiente nelle strutture iperstatiche",
          "Alta",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-016",
          "Archi (travi curve del motore, strumento arco dell’app): Iy e Iz scambiati sui segmenti quasi verticali",
          "Media",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-017",
          "Interazione terreno-struttura: le curve p-y, t-z e q-z si discostavano dai loro riferimenti",
          "Alta",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-018",
          "Gusci MITC9 (solo motore e WASM) su geometria curva deformati da un moto rigido",
          "Media",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-019",
          "Carichi termici sulle aste (motore e WASM; l’app compensava dal 7 ottobre 2026): α dell’acciaio e altezza di un rettangolo pieno",
          "Media",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-020",
          "Analisi non lineare di materiale 3D (solo motore e WASM): superficie di snervamento meno conservativa che in 2D",
          "Media",
          "Risolto nella 0.3.0"
        ],
        [
          "SA-2026-021",
          "Coperture libere: nessun vento lungo il colmo e, trasversalmente, meno del minimo del §2.1.5 (il 17 % di esso a 20 m/s)",
          "Alta",
          "Risolto nella 0.4.0"
        ],
        [
          "SA-2026-022",
          "Con la spinta del terreno H mancava la combinazione in cui il carico permanente la contrasta (dal 27 al 45 % in meno in un esempio)",
          "Alta",
          "Risolto nella 0.4.0"
        ],
        [
          "SA-2026-023",
          "Pilastri in c.a.: la verifica leggeva un solo segno del momento; le disposizioni di barre non uniformi (6, 10, 14…) passavano dal lato più resistente",
          "Critica",
          "Risolto nella 0.4.0"
        ],
        [
          "SA-2026-024",
          "Plinti, nodi, solai, pareti e ottimizzatore dell’acciaio progettavano per i carichi non amplificati quando le combinazioni erano definite ma non calcolate (calcolo in tempo reale, calcolo di combinazione fallito o elenco attivo vuoto)",
          "Alta",
          "Risolto nella 0.4.0"
        ],
        [
          "SA-2026-025",
          "Taglio AISC 360 G2 (solo motore e WASM): senza l’area dell’anima passava con rapporto 0 e veniva certificato",
          "Media",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-026",
          "Taglio EC3 6.2.6 (solo motore e WASM): senza l’area a taglio assumeva Av = 0,5·A, con Vpl,Rd superiore del 57 % su un HEB 300, e veniva certificato",
          "Media",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-027",
          "Inviluppo dei gusci: manteneva la combinazione con il Von Mises maggiore, non l’estremo di ogni componente (mx inferiore del 14 % in un esempio)",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-028",
          "Flessione EN 1992-1-1 (PRO altre norme, certificata): assumeva che l’acciaio teso snervasse e non iterava le barre superiori; MRd fino al 22 % superiore",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-029",
          "3D: i pilastri CIRSOC 201 dell’app erano progettati con Mz sull’altezza della sezione (36 % di acciaio in meno in un esempio); le verifiche 3D certificate del motore leggevano il taglio laterale Vy come taglio dell’anima",
          "Critica",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-030",
          "Compressione CIRSOC 301: una sezione con area inferiore a quella delle sue piastre otteneva un Qa negativo e una capacità superiore al carico di schiacciamento, e passava",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-031",
          "Time history: un carico applicato a t = 0 su un grado di libertà senza massa si perdeva al primo passo (reciprocità fino a 33 volte fuori, una catena a due gradi di libertà del 24 % fuori dalla sua forma chiusa)",
          "Media",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-032",
          "Analisi modale: il modo a frequenza zero di un meccanismo veniva scartato e gli altri modi restituiti come completi",
          "Media",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-033",
          "Generatore di carichi: un piano con un’asta bassa su una parte perdeva tutto il suo carico di area (36 m² di un piano di 6 × 6 m in un esempio); le travature reticolari non contavano come struttura di copertura",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-034",
          "La verifica di equilibrio riportava carichi e reazioni in accordo per casi in cui la verifica lasciava fuori dei carichi; le modifiche a piani simili raggiungevano aste dell’altro tipo e le copie perdevano i loro svincoli",
          "Media",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-035",
          "Passaggio da 3D a 2D: il taglio faceva inflettere le aste attorno all’asse di sezione sbagliato (un portale nel piano Y–Z 13,5 volte troppo rigido)",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-036",
          "Passaggio da 3D a 2D su Y–Z o X–Y: i vincoli venivano letti come se il telaio fosse in X–Z (tiranti di spostamento laterale persi o applicati fuori piano)",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-037",
          "Analisi 3D co-rotazionale: i vettori di rotazione venivano sottratti (la curva di Bathe–Bolourchi con errore dell’1,3 %, che non si riduceva raffinando)",
          "Media",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-038",
          "Instabilità 3D: il fattore delle aste la cui compressione cresce lungo di esse sotto carichi lungo il proprio asse risultava alto (+43 % per un’asta), e un’asta compressa solo tra gli estremi veniva rifiutata",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-039",
          "Importazione da Excel e IFC: Iy e Iz di rettangoli e tubi erano scambiati (una mensola 20 × 40 4 volte troppo flessibile, una 40 × 20 4 volte troppo rigida)",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-040",
          "Verifiche ACI 318 ed EN 1992: aste in c.a. superavano la verifica senza che la loro torsione fosse controllata",
          "Alta",
          "Contenuto nella 0.5.0"
        ],
        [
          "SA-2026-041",
          "Pilastri in c.a.: il momento maggiore veniva verificato solo sotto la compressione maggiore",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-042",
          "Instabilità 2D: il fattore delle aste la cui compressione cresce lungo di esse sotto carichi lungo il proprio asse risultava alto (da +43 % a +68 % per un’asta)",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-043",
          "Analisi armonica: la correzione dei modi omessi perdeva le sue cifre quando un modo era molto più morbido degli altri (79 volte a 2,3 Hz in un esempio)",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-044",
          "Collasso plastico 2D: il fattore di collasso cambiava con la numerazione dei nodi, la direzione delle aste e le unità (fino a 4,6 volte sulla stessa struttura)",
          "Alta",
          "Non corretto nella 0.5.0: collasso plastico 2D non mostrato finché #758 non si chiude; l’analisi limite è nella 0.5.0"
        ],
        [
          "SA-2026-045",
          "Collasso plastico 3D: un’asta senza un momento plastico utilizzabile veniva trattata come una che non snerva mai (6 volte alto in un esempio, e certificato)",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-046",
          "Analisi armonica: sceglieva tra sovrapposizione modale e calcolo diretto per ciascun carico, quindi sovrapposizione e reciprocità si rompevano (107 % in un nodo in un esempio); stabileo.com e build di motore/WASM di main, dal 5 novembre 2026 fino alla correzione",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-047",
          "Gusci: un caso di carico che imponeva uno spostamento di vincolo perdeva le tensioni nei gusci, e combinazioni e inviluppi sommavano solo le tensioni nei gusci degli altri casi (poteva essere non a favore di sicurezza, senza avviso); da 0.2.0 a 0.4.0",
          "Alta",
          "Risolto nella 0.5.0"
        ],
        [
          "SA-2026-048",
          "Acciaio CIRSOC 301: Cb poteva perdere un cambio di segno o omettere i momenti di estremità da Mmax. Ricontrolla ogni sezione con lunghezza non controventata dichiarata più corta dell’asta, anche senza inversione di segno (un profilo a C a doppia curvatura otteneva Cb = 2,55 invece di 1, sovrastimando la capacità flesso-torsionale); da 0.2.0 a 0.5.0, le alfa desktop e stabileo.com fino all’8 novembre 2026",
          "Alta",
          "Risolto dopo la 0.5.0; su stabileo.com dal 8 novembre 2026"
        ],
        [
          "SA-2026-049",
          "Vincoli con una molla positiva e un vincolo rigido sullo stesso grado di libertà: in 3D la molla liberava il vincolo e cambiava la condizione al contorno; codice del motore da 0.2.0 a 0.5.0",
          "Alta",
          "Risolto dopo la 0.5.0; su stabileo.com dal 9 novembre 2026"
        ],
        [
          "SA-2026-050",
          "L’instabilità poteva trasformare in zero un calcolo di snellezza fallito, e l’analisi a più casi poteva restituire valori non finiti dentro un risultato riuscito",
          "Media",
          "Risolto dopo la 0.5.0; su stabileo.com dal 9 novembre 2026"
        ],
        [
          "SA-2026-051",
          "Carichi mobili 3D: gli inviluppi non coglievano i picchi interni delle sollecitazioni e perdevano la componente assiale del peso degli assi sulle aste inclinate, con possibile sottostima della sollecitazione senza avviso; da 0.2.0 a 0.5.0 e da desktop-v0.1.0-alpha.1 ad alpha.3",
          "Alta",
          "Risolto dopo la 0.5.0; su stabileo.com dal 9 novembre 2026"
        ],
        [
          "SA-2026-052",
          "Carichi mobili del motore 2D e 3D: gli inviluppi assiali con carichi assiali distribuiti parziali permanenti non coglievano gli estremi ai confini delle zone di carico tra le sezioni, con possibile sottostima della sollecitazione senza avviso; non si dichiara alcun limite di versione rilasciata",
          "Alta",
          "Risolto dopo la 0.5.0; su stabileo.com dal 9 novembre 2026"
        ],
        [
          "SA-2026-053",
          "Carichi mobili 2D e 3D: i carichi concentrati agli estremi includevano forze fuori dall’asta negli inviluppi, aggiungendo estremi spuri di sforzo normale e taglio e sovrastimando la sollecitazione; non si dichiara alcun limite di versione rilasciata",
          "Bassa",
          "Risolto dopo la 0.5.0; su stabileo.com dal 9 novembre 2026"
        ],
        [
          "SA-2026-054",
          "L’analisi lineare poteva restituire in silenzio risultati imprecisi per rigidezza non risolta o componenti di carico PCG mancate",
          "Alta",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-055",
          "Il P-Delta 2D e 3D poteva sottostimare l’amplificazione e segnalare stabilità quando lo sforzo normale variava sotto carichi distribuiti o concentrati lungo un’asta di telaio",
          "Alta",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-056",
          "Modelli 3D di telai e gusci con vincoli interni: i risultati armonici e time-history forzati cambiano con descrizioni equivalenti; l’estensione oltre il modello mantenuto non è stabilita",
          "Alta",
          "Irrisolto: verifica indipendente prima dell’uso"
        ],
        [
          "SA-2026-057",
          "Le visualizzazioni dei certificati plastici potevano etichettare come interni fattori fuori dal loro intervallo certificato; l’estrazione esatta dei meccanismi scartava i rifiuti per risorse nelle build precedenti alla correzione della PR #1888",
          "Media",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-058",
          "I modelli armonici 2D/3D grandi, oltre 3000 gradi di libertà liberi indipendenti, potevano mantenere risposte inaccurate dei modi omessi fuori da q ≤ 1/16 a frequenze non coperte dall’avviso di troncamento (misurato un errore complesso del bersaglio dell’8,079%)",
          "Alta",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-059",
          "Le analisi avanzate web potevano dare ai cavi resistenza a compressione senza avviso (replay P-Delta: −4,599884347090908 kN); rivedi le sollecitazioni dei modelli di cavo provenienti da analisi avanzate, analisi diretta e procedure guidate didattiche",
          "Alta",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-060",
          "L’analisi per fasi poteva irrigidire in silenzio rotazioni reali dopo cambi di unità o negli estremi svincolati con molle di vincolo; ricontrolla i modelli per fasi con svincoli nelle aste",
          "Alta",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-061",
          "L’arc-length e il controllo in spostamento omettevano le reazioni e usavano carichi sulle aste non scalati; vanno riviste anche le omissioni nei risultati 2D/3D con vincoli interni, Guyan, per fasi e time-history. Riesegui i risultati interessati o verificali in modo indipendente; 0.2.0–0.5.0 e le build successive di main interessate.",
          "Alta",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-062",
          "L’analisi plastica 3D grezza poteva riportare zero in silenzio quando falliva lo stato elastico iniziale; le build certificate più vecchie mantenevano quel fattore. Main restituisce già un limite certificato positivo con un avviso; la PR #1943 propaga il rifiuto iniziale",
          "Alta",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-063",
          "Le analisi per fasi e non lineari con vincoli interni scartavano il moto imposto del master; cavi e time-history ora rifiutano il moto di vincolo non supportato. Gli avvisi dinamici generali esistenti restano distinti da questa omissione",
          "Alta",
          "Risolto nella 0.6.0"
        ],
        [
          "SA-2026-064",
          "Il Cb dell’acciaio poteva venire da un’altra combinazione o da una breve luce non controventata non localizzata (#1316, #2088). Riesegui le verifiche dell’acciaio CIRSOC 301 e rivedi la capacità flessionale, il coefficiente di utilizzo a interazione e le combinazioni dominanti.",
          "Alta",
          "Risolto nella 0.6.1"
        ],
        [
          "SA-2026-065",
          "L’accumulo di neve dovuto al dislivello della copertura poteva essere omesso su una copertura ricevente a falde (#2082). Rigenera i carichi di neve CIRSOC 104 e riesegui le analisi e le verifiche di progetto interessate.",
          "Alta",
          "Risolto nella 0.6.1"
        ],
        [
          "SA-2026-066",
          "Il Cm del calcestruzzo poteva ricevere il beneficio del momento di estremità con carico trasversale tra gli appoggi (#2089). Ricontrolla pilastri e pareti snelli in calcestruzzo, i momenti amplificati e l’armatura.",
          "Alta",
          "Risolto nella 0.6.1"
        ],
        [
          "SA-2026-067",
          "La rotazione in pianta poteva cambiare i carichi di neve generati (#2093). Rigenera i carichi usando la geometria reale della copertura, poi riesegui analisi e verifiche; ruotare di nuovo un vecchio modello non è una riparazione.",
          "Alta",
          "Risolto nella 0.6.1"
        ],
        [
          "SA-2026-068",
          "La torsione poteva risultare verificata con staffe progettate inadeguate (#2141). Riesegui le verifiche di progetto del calcestruzzo e rivedi la capacità trasversale effettiva, il passo delle staffe e i fallimenti a torsione. Un’armatura longitudinale non verificata non è una gabbia che verifica.",
          "Alta",
          "Risolto nella 0.6.1"
        ],
        [
          "SA-2026-069",
          "Il limite della sezione a torsione ometteva il taglio secondario concomitante (#2142). Riesegui i progetti del calcestruzzo e rivedi i fallimenti di sezione e le staffe mancanti; aggiungere staffe non può riparare un limite di sezione superato.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-070",
          "Gli spostamenti e le rotazioni nelle sezioni interne dell’asta non tenevano conto dei carichi applicati lungo la campata (#2143). Rivedi le deformate, le letture didattiche e le verifiche di esercizio di acciaio e calcestruzzo, inclusi i trapezi pieni e parziali. Il recupero con carico senza EI sufficiente ora rifiuta in modo esplicito.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-071",
          "La verifica delle aste poteva risultare positiva con sollecitazioni concomitanti incomplete (#2096). Riesegui i progetti di calcestruzzo e acciaio e rivedi combinazioni, aste, stazioni e certificati.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-072",
          "Una suddivisione disuguale del bordo di copertura poteva spostare il colmo della neve e cambiare i carichi generati (#2144). Rigenera i carichi di neve, poi riesegui analisi, combinazioni e verifiche di progetto. Risolvere di nuovo i soli carichi memorizzati non li corregge.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-073",
          "Le aste che attraversano un colmo di neve ricevevano un’unica pressione uniforme e perdevano il momento fisico del carico. Ora i carichi si dividono nel colmo fisico. Rigenera tutti i carichi di superficie generati interessati, poi riesegui analisi, combinazioni e verifiche di progetto. Risolvere di nuovo i soli carichi generati memorizzati non li corregge. (#2176).",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-074",
          "Suddividere un puntone inclinato poteva classificare un pannello di copertura esplicito come solaio e togliere in silenzio la sua neve di gronda. Ora la classificazione dei pannelli di copertura usa le impronte fisiche dei pannelli. Rigenera tutti i carichi di superficie generati interessati, poi riesegui analisi, combinazioni e verifiche di progetto. Risolvere di nuovo i soli carichi memorizzati non li corregge. (#2172). Un puntone inclinato non suddiviso sopra un pannello inferiore separato poteva anche classificare quel pannello come copertura, cambiando i carichi di superficie di copertura/solaio e aggiungendo in silenzio neve in modalità larghezza.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-075",
          "Le verifiche CIRSOC 201-2005 e 2025 del taglio secondario e della torsione potevano accreditare bracci e larghezza delle staffe della direzione principale. Travi e pilastri potevano risultare verificati senza avviso con troppa poca armatura secondaria (#2171). Dopo l’aggiornamento, riesegui il progetto del calcestruzzo armato e rivedi l’avviso di ricontrollo del progetto salvato.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-076",
          "Una sola parete aperta poteva classificare un edificio come aperto e togliere la pressione interna (#2203). Rivedi ogni record di aperture di pareti e copertura, riclassifica l’involucro, rigenera W e Wa, poi riesegui analisi, combinazioni e verifiche di progetto. Risolvere di nuovo i soli carichi memorizzati non li corregge.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-077",
          "Il vento sulle pareti ometteva le forze di fondazione e cambiava con la suddivisione (#2204). Rivedi ogni record di aperture di pareti e copertura, riclassifica l’involucro, rigenera W e Wa, poi riesegui analisi, combinazioni e verifiche di progetto. Risolvere di nuovo i soli carichi memorizzati non li corregge.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-078",
          "Le zone di pressione sulla copertura e i loro momenti statici dipendevano dalla suddivisione (#2205). Rivedi ogni record di aperture di pareti e copertura, riclassifica l’involucro, rigenera W e Wa, poi riesegui analisi, combinazioni e verifiche di progetto. Risolvere di nuovo i soli carichi memorizzati non li corregge.",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-079",
          "Una copertura parziale con gusci poteva perdere carico gravitazionale o collocarlo nelle stazioni sbagliate. Rigenera con i gusci i carichi gravitazionali in modalità pannello, poi riesegui analisi e progetto. (#2199, #2200)",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-080",
          "Le zone di solaio che richiedono carichi eccentrici sulle aste vengono rifiutate. Rivedi la definizione del carico di piano prima di calcolare. Una zona che copre un pannello completo applica le ordinarie reazioni del pannello. (#2201)",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-082",
          "Le combinazioni di accompagnamento usavano in silenzio neve ridotta per pendenza invece del carico sulle aste per copertura piana. Anche le specifiche sismiche precedenti possono confondere la neve fisica con quella di copertura piana. Rigenera i carichi di neve e le combinazioni, poi riesegui analisi e verifiche di progetto. (#2211).",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-083",
          "SA-2026-083: La generazione automatica CIRSOC 101 blocca le azioni concentrate d’uso e di copertura le cui posizioni più sfavorevoli non sono valutate (§4.4). I carichi uniformi generati in precedenza possono omettere azioni determinanti. Esaminare i modelli interessati e verificare manualmente le azioni concentrate prima di ripetere analisi e dimensionamento. (#2207).",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-084",
          "Suddividere un cordone d’angolo caricato in testa poteva eliminare la sua riduzione della lunghezza efficace (#2243). Riesegui le verifiche dei gruppi di saldature interessati.",
          "—",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-085",
          "Un cordone d’angolo corto poteva ricevere un lato efficace eccessivo (#2244). Riesegui le verifiche dei gruppi di saldature interessati.",
          "—",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-086",
          "I carichi sismici statici generati potevano dare forze d’interpiano e azioni sulle aste errate. Rigenera i carichi interessati e riesegui analisi e progetti.",
          "Alta",
          "Risolto in #2316, in attesa di rilascio"
        ],
        [
          "SA-2026-087",
          "La generazione dei carichi sismici modali poteva dare sollecitazioni delle aste errate. Rigenera i carichi interessati con il metodo statico, dove applicabile, oppure attendi la #2319.",
          "Alta",
          "Generazione rifiutata in #2316, in attesa di rilascio"
        ],
        [
          "SA-2026-088",
          "I diagrammi delle aste ABS e SRSS includono gli estremi della funzione combinata tra i limiti dei carichi. Riesegui combinazioni, diagrammi e verifiche che ne dipendono (#2273).",
          "—",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-089",
          "Un vincolo 3D rollerZ o custom3d senza bloccaggi espliciti, o un tipo di vincolo sconosciuto, veniva analizzato come completamente incastrato senza avviso. Rivedi i bloccaggi previsti, poi riesegui analisi, combinazioni e progetto. (#2276).",
          "Alta",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-090",
          "L’area di livello in modalità larghezza e il peso sismico potevano non concordare con i carichi generati sulle aste perché usavano le estensioni dei nodi o richiedevano una regione chiusa. Ora usano le aree di influenza degli elementi portanti caricati. Rigenera i piani di gravità, i pesi sismici e i carichi sismici, poi riesegui le analisi, le combinazioni e le verifiche di progetto dipendenti. Risolvere di nuovo i soli carichi salvati non corregge le azioni sismiche (#2269). (#2210)",
          "—",
          "Risolto nella 0.6.2"
        ],
        [
          "SA-2026-091",
          "Le verifiche di taglio, torsione e staffe sismiche del calcestruzzo potevano risultare positive senza evidenza di armatura. Riesegui i progetti certificati e rivedi le sezioni dominanti, i disegni dell’armatura e le relazioni.",
          "Alta",
          "Contenuto in #2338, in attesa di rilascio"
        ],
        [
          "SA-2026-092",
          "La tensione di sezione dettagliata poteva sottostimare il taglio totale e von Mises e restituire un esito positivo. Ricalcola le tensioni interessate e rivedi diagrammi, verifiche e relazioni.",
          "Alta",
          "Caso combinato rifiutato in #2372 e sezioni di taglio corrette in #2382, in attesa di rilascio"
        ],
        [
          "SA-2026-093",
          "I carichi mobili piani potevano sfumare i salti di sforzo normale in corrispondenza degli assi concentrati. Riesegui gli inviluppi e le linee d’influenza dello sforzo normale interessati e rivedi le relazioni che vi si basavano.",
          "Alta",
          "Risolto in #2381, in attesa di rilascio"
        ],
        [
          "SA-2026-094",
          "L’ispettore a corpo libero 2D poteva mostrare i momenti di estremità d’asta globali con il segno sbagliato. I risultati dell’analisi non erano interessati. Ispeziona di nuovo le aste, e rigenera e rivedi le relazioni interessate.",
          "Media",
          "Risolto in #2364, in attesa di rilascio"
        ],
        [
          "SA-2026-095",
          "I progetti 2D salvati con regole di peso proprio con segno o con ambito potevano restituire reazioni sbagliate senza avviso. Quando si aprono i progetti interessati compare un avviso di ricontrollo. Ricalcola i risultati, poi rigenera e rivedi le relazioni interessate.",
          "Alta",
          "Risolto in #2364, in attesa di rilascio"
        ],
        [
          "SA-2026-096",
          "La generazione sismica statica poteva contare come piani i nodi di controvento o di mesh e mettere l’inerzia delle falde nei nodi di estremità. Controlla le quote dei piani e il carico delle falde. Rigenera i casi prima di rieseguire analisi e verifiche di progetto.",
          "Alta",
          "Risolto nella 0.6.3"
        ],
        [
          "SA-2026-097",
          "L’importazione dalla cartella di lavoro poteva omettere dati del modello e le esportazioni 2D potevano etichettare una molla rotazionale come traslazionale. Confronta il modello importato con la cartella di lavoro originale. Correggilo e importalo di nuovo, verifica vincoli e carichi, poi riesegui le analisi interessate e rigenera le esportazioni.",
          "Alta",
          "Risolto nella 0.6.3"
        ],
        [
          "SA-2026-098",
          "Le verifiche del calcestruzzo potevano accettare un passo eccessivo delle staffe o accreditare armatura assente nella sezione. I disegni dei pilastri potevano mostrare diametri di barra sbagliati. Ricontrolla rispetto all’armatura fornita e alle sollecitazioni concomitanti, poi rivedi disegni, distinte e relazioni interessati.",
          "Alta",
          "Risolto nella 0.6.3"
        ],
        [
          "SA-2026-099",
          "La generazione dei carichi gravitazionali poteva caricare due volte le aree di gusci e travi o cambiare l’assegnazione degli elementi portanti dopo rotazione o suddivisione. Il trasferimento della neve dai gradini di copertura poteva perdere forza e momento. Rigenera i carichi e usa casi verificati in modo indipendente dove la generazione rifiuta.",
          "Alta",
          "Contenuto nella 0.6.3"
        ],
        [
          "SA-2026-100",
          "I momenti delle reazioni, le letture a corpo libero e gli elenchi dei carichi concentrati potevano mostrare segni o assi sbagliati. Verifica i valori mostrati rispetto all’equilibrio e alle direzioni di carico previste. Ispeziona di nuovo i risultati interessati e rigenera le relazioni.",
          "Media",
          "Corretto nella 0.6.4"
        ],
        [
          "SA-2026-101",
          "PRO poteva risolvere con piastre omesse, mesh basate su dati incompleti o collegamenti parete-solaio scollegati. Confronta la mesh con la geometria prevista, ripara le piastre e le giunzioni interessate e riesegui analisi e verifiche di progetto.",
          "Alta",
          "Corretto nella 0.6.4"
        ],
        [
          "SA-2026-102",
          "I diagrammi potevano dare picchi o sollecitazioni di sezione sbagliati vicino ad azioni concentrate, e i tratti di campata invertiti potevano scambiare le facce di progetto del calcestruzzo. Controlla le sollecitazioni dominanti, le facce dell’armatura e i dati del gradiente di momento per l’acciaio. Riesegui le analisi e le verifiche interessate.",
          "Alta",
          "Corretto nella 0.6.4"
        ],
        [
          "SA-2026-103",
          "Le verifiche di torsione e taglio del calcestruzzo potevano accettare acciaio trasversale insufficiente o accreditare barre perimetrali o tese non verificate. Ripeti la verifica con l’armatura effettiva e le sollecitazioni concomitanti e rivedi le relazioni interessate.",
          "Alta",
          "Corretto nella 0.6.4"
        ],
        [
          "SA-2026-104",
          "Invertire le aste poteva reindirizzare i carichi distribuiti, e l’analisi poteva omettere coppie concentrate piane precedenti. Controlla le direzioni di carico salvate, le ordinate di estremità e i campi delle coppie. Ripara i carichi e riesegui le analisi e le verifiche di progetto interessate.",
          "Alta",
          "Corretto nella 0.6.4"
        ],
        [
          "SA-2026-105",
          "Modificare a zero una coppia concentrata piana ripristinata poteva lasciare attivo il vecchio momento. Verifica e reinserisci i momenti previsti, poi riesegui le analisi e le verifiche di progetto interessate.",
          "Alta",
          "Corretto nella 0.6.4"
        ],
        [
          "SA-2026-106",
          "La rigenerazione della mesh poteva usare l’arco complementare di un bordo curvo di una piastra. Verifica la mesh rispetto all’ampiezza indicata, ricostruisci le mesh interessate e riesegui analisi e verifiche di progetto.",
          "Alta",
          "Contenuto nella 0.6.4"
        ],
        [
          "SA-2026-107",
          "La rigenerazione della mesh poteva scartare le eccentricità dei gusci e le modifiche di curvatura. Verifica e ripristina le proprietà previste dei gusci prima di rieseguire analisi e verifiche di progetto.",
          "Alta",
          "Contenuto nella 0.6.4"
        ],
        [
          "SA-2026-108",
          "La proiezione XZ o YZ poteva scartare in silenzio una componente di forza nodale perpendicolare al piano di analisi. Controlla le forze nodali in ogni caso di carico e riesegui le analisi e le verifiche di progetto interessate con il modello spaziale.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-109",
          "Le etichette di vincolo DXF piane sconosciute potevano essere importate in silenzio come cerniere. Confronta i vincoli importati con il disegno originale, correggi le discrepanze e riesegui le analisi interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-110",
          "L’analisi web poteva omettere in silenzio una molla con rigidezza non finita o un caso di carico in una combinazione. Controlla le rigidezze delle molle, i nomi dei casi e i fattori netti, poi riesegui le analisi e le combinazioni interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-111",
          "La generazione automatica dei carichi gravitazionali per pannelli poteva contare due volte lo stesso carico di piano. Controlla i gusci sovrapposti e le campate di trave collegate, rigenera i piani dei carichi gravitazionali salvati interessati e riesegui le analisi interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-112",
          "Il 3D della modalità Base poteva omettere in silenzio tutti gli elementi guscio. Riesegui i casi di carico e le combinazioni interessati in PRO 3D con la mesh completa dei gusci, poi ripeti le verifiche di progetto dipendenti.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-113",
          "L’API Rust nativa poteva certificare risultati lineari forniti per un caso di carico che il solutore aveva rifiutato. Riesegui le analisi e la certificazione interessate, incluse le combinazioni e gli inviluppi dipendenti.",
          "Media",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-114",
          "Le regole di combinazione salvate potevano applicare i coefficienti al gruppo di carico sbagliato senza avviso. Ripristina i gruppi previsti, rigenera le combinazioni e i casi compositi interessati e riesegui le loro analisi e i loro inviluppi.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-115",
          "La generazione dei carichi gravitazionali per pannelli poteva caricare la stessa regione di piano tramite più elementi portanti. Rigenera i piani gravitazionali interessati, risolvi i carichi o le geometrie in conflitto e riesegui le analisi interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-116",
          "I solutori non lineari potevano accettare un percorso arc-length errato o omettere la forza tangenziale in un carrello inclinato. Riesegui le analisi non lineari piane e corotazionali spaziali interessate, inclusi i telai curvi con eccentricità del centro di taglio.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-117",
          "Una densità dei gusci negativa o nulla poteva invertire o omettere il peso proprio. Ripristina le densità previste, riesegui i casi statici e le combinazioni interessati e ripeti le verifiche dipendenti.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-118",
          "Un bersaglio non valido del gruppo di peso proprio poteva omettere il peso del gruppo. Ripara il bersaglio, riesegui i casi e le combinazioni interessati e ricostruisci i loro inviluppi.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-119",
          "Una densità del materiale omessa poteva dare frequenze modali errate. Ripristina la densità, ricostruisci la sorgente di massa e riesegui le analisi dinamiche interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-120",
          "Il carico gravitazionale automatico poteva duplicare i carichi dell’impalcato, trasferire carichi a campate oltre il limite automatico di luce o classificare male l’esposizione di copertura e di solaio. Rigenera i piani gravitazionali, della neve e del vento interessati, verifica i carichi e riesegui le analisi dipendenti.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-121",
          "L’analisi non lineare piana poteva restituire risultati errati per i carichi sulle aste. Riesegui le analisi interessate, comprese quelle usate per avviare una continuazione, e rivedi spostamenti, reazioni e sollecitazioni di estremità delle aste.",
          "Media",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-122",
          "Le combinazioni generate potevano omettere alternative obbligatorie o sovraccarichi di copertura inseriti manualmente, usare una base errata per la neve o includere casi di vento obsoleti. Verifica i carichi, i fattori delle regole e i casi inclusi negli inviluppi. Rimuovi dal modello i casi di carico vuoti che hai verificato essere obsoleti, compresi quelli già vuoti nella versione 0.6.4. Rigenera le combinazioni e verifica che escludano gli identificativi di questi casi prima di ripetere le analisi interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-123",
          "I carichi gravitazionali automatici potevano essere mantenuti sotto impalcati con altezza libera insufficiente o assegnati dove la copertura era indeterminata. Rigenera i carichi gravitazionali, di vento in copertura e di neve interessati, verifica le assegnazioni e ripeti le analisi dipendenti.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-124",
          "Il peso proprio assegnato a una selezione poteva omettere destinazioni mancanti o attribuire tutto il peso di un’asta selezionata a un solo tratto. Correggi la selezione, verifica il peso applicato e ricalcola le analisi interessate e le risposte del corso di dinamica piana con aste suddivise.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-125",
          "I rapporti cinematici nativi e WASM potevano contare due volte un vincolo rigido condiviso. Ricontrolla il grado di iperstaticità, la classificazione e la diagnosi, quindi aggiorna i rapporti interessati.",
          "Media",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-126",
          "Termini ripetuti potevano escludere disposizioni di carico determinanti o generare un’alternativa senza neve. Rivedi le regole, rigenera le combinazioni e i casi compositi interessati e ripeti analisi, inviluppi e verifiche di progetto.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-127",
          "Le solette potevano non trasferire carichi alle pareti se la connessione delle mesh era incompleta. Rigenera la mesh di entrambe le superfici con spigoli condivisi lungo tutta la giunzione prevista, verifica il percorso dei carichi e ripeti le analisi spaziali, gli inviluppi e le verifiche di progetto interessati.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-128",
          "La conversione poteva omettere carichi assiali che cambiano segno sulle aste dei modelli piani (2D), indipendentemente dalla sezione, o sulle aste reticolari spaziali. Verifica i carichi distribuiti e le forze di estremità equivalenti, quindi ripeti le analisi, gli inviluppi e le verifiche di progetto interessati.",
          "Media",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-129",
          "Le scansioni dei carichi mobili potevano fornire valori errati di taglio o sforzo normale e le posizioni del veicolo salvate potevano omettere i salti di sforzo normale nelle reticolari spaziali. Quando l’asse e il carico puntuale permanente coincidono esattamente, producono un unico salto di taglio combinato. Il taglio tra i due carichi ha limiti unilaterali quando l’asse si avvicina al carico o lo oltrepassa. Verifica entrambi i limiti con l’asse appena prima e appena dopo il carico. Ripeti le scansioni interessate, rigenera i casi salvati e ripeti le analisi e le verifiche di progetto dipendenti.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-130",
          "L’analisi elastica piana poteva restituire spostamenti tutti nulli per un meccanismo senza alcun avviso. Controlla gli svincoli flessionali e gli appoggi, elimina eventuali meccanismi involontari e ripeti le analisi e le verifiche di progetto interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-131",
          "L’analisi poteva omettere o interpretare erroneamente senza avviso campi strutturali, vincoli, metodi di combinazione, moto del terreno o carichi di fase. Correggi i dati e ripeti le analisi, le combinazioni e le verifiche di progetto interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ],
        [
          "SA-2026-132",
          "I progetti Basic riaperti senza un piano di disegno salvato potevano essere calcolati nel piano errato. Verifica il piano previsto, le direzioni dei carichi e gli appoggi, quindi ripeti le analisi, le combinazioni e le verifiche di progetto interessate.",
          "Alta",
          "Prossimo rilascio dopo la 0.6.4"
        ]
      ]
    },
    {
      "k": "table",
      "caption": "Casi documentati in ogni bollettino: il valore corretto e quello riportato da Stabileo.",
      "head": [
        "Bollettino",
        "Caso",
        "Corretto",
        "Riportato",
        "Unità"
      ],
      "rows": [
        [
          "SA-2026-024",
          "Portale 6 × 4 m, 20 kN/m di carico permanente sulla trave, 15 kN di vento, 1,2D + 1,6W, dopo una modifica con il calcolo in tempo reale attivo: reazione verticale del plinto sopravento",
          "65,61",
          "56,01",
          "kN"
        ],
        [
          "SA-2026-023",
          "Pilastro 30×30 cm, 6 Ø20 (tre sulla faccia inferiore), Nu = 100 kN: φMn con la faccia a tre barre compressa",
          "78,57",
          "101,57",
          "kN·m"
        ],
        [
          "SA-2026-013",
          "Mensola di quattro gusci curvi, 4 × 1 × 0,2 m, 10 kN in punta: mx nell’elemento all’incastro",
          "35,0",
          "0",
          "kN·m/m"
        ],
        [
          "SA-2026-014",
          "Telaio spaziale di 10 aste (frame3d-2), rinumerato: moltiplicatore di collasso plastico",
          "176,47",
          "424,3",
          "—"
        ],
        [
          "SA-2026-015",
          "Antenna strallata di 20 m, strallo d’acciaio da 1 cm², 5 kN in testa: tensione dello strallo",
          "5,18",
          "4,34",
          "kN"
        ],
        [
          "SA-2026-011",
          "Trave a 0, 4 e 8 m, vincolo disegnato come incastro a 8 m: freccia in quel vincolo",
          "0",
          "-14,4",
          "mm"
        ],
        [
          "SA-2026-017",
          "Argilla tenera c = 20 kPa, D = 1 m, z = 4 m: resistenza ultima del terreno p_u",
          "124",
          "84",
          "kN/m"
        ],
        [
          "SA-2026-008",
          "Due modi a ω e 1,1ω: taglio alla base rispetto al valore CQC",
          "1,00",
          "0,81",
          "—"
        ],
        [
          "SA-2026-007",
          "Pilastro cruciforme 200×10 mm, 1,5 m: carico critico",
          "2993",
          "5860",
          "kN"
        ],
        [
          "SA-2026-006",
          "Portale con momenti e forze nodali: spostamento laterale",
          "0,92",
          "2,52",
          "mm"
        ],
        [
          "SA-2026-005",
          "Puntone di falda a capanna: sforzo normale alla base",
          "-56,67",
          "-41,67",
          "kN"
        ],
        [
          "SA-2026-019",
          "IPE 300 incastrata a entrambi gli estremi, gradiente di 20 °C: momento di estremità",
          "14,04",
          "9,76",
          "kN·m"
        ],
        [
          "SA-2026-012",
          "Mensola snervata di 4 m, carico in punta 1,2·Mp/L: momento all’incastro",
          "1012,5",
          "101250",
          "kN·m"
        ],
        [
          "SA-2026-016",
          "Arco semicircolare di 5 m nel piano Y–Z, 40 segmenti: freccia in chiave",
          "-7,29",
          "-6,18",
          "mm"
        ],
        [
          "SA-2026-018",
          "Porzione cilindrica MITC9 2×2 m, freccia 0,2 m, acciaio, 50 mm, rotazione rigida di 1 mrad: massima tensione di von Mises nodale",
          "0",
          "101",
          "MPa"
        ],
        [
          "SA-2026-020",
          "Mensola 3D di 4 m, N = 0,5·Np, carico in punta: carico al primo snervamento",
          "158,2",
          "182,7",
          "kN"
        ],
        [
          "SA-2026-009",
          "Piastra sottile inflessa, ν = 0,3: rigidezza rispetto al valore corretto",
          "1,000",
          "1,225",
          "—"
        ]
      ]
    },
    {
      "k": "h",
      "t": "SA-2026-021: vento minimo sulle coperture libere"
    },
    {
      "k": "p",
      "t": "Una copertura libera (una tettoia aperta, una pensilina, un baldacchino) riceveva solo le pressioni nette delle Figure 2.4-4 a 2.4-7, normali alla copertura. La CIRSOC 102-2025 §2.1.5 richiede inoltre che la forza del vento su un edificio aperto sia almeno 0,75 kN/m² × Af, come caso di carico orizzontale a sé stante. Senza quel minimo, con il vento lungo il colmo la forza orizzontale era nulla e, in direzione trasversale, la forza scendeva sotto il minimo a velocità basse e moderate. Ora ogni direzione ha quel caso di carico."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-021-free-roof-wind-minimum.md",
      "label": "SA-2026-021 per intero",
      "t": "Il bollettino, con le misure:"
    },
    {
      "k": "h",
      "t": "SA-2026-022: spinta del terreno contrastata dal peso permanente"
    },
    {
      "k": "p",
      "t": "Con i carichi H, la CIRSOC 101-2025 richiede di valutare anche le combinazioni in cui i carichi pertinenti sono assenti. Le combinazioni 0,9 D + 1,6 H e 1,2 D + 1,6 H non venivano mai generate, quindi dove il carico permanente contrasta la spinta del terreno (il ribaltamento o lo scorrimento di un muro) l’effetto risultava basso. Ora vengono generate, con o senza vento o sisma nel modello."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-022-earth-pressure-dead-load-resisting.md",
      "label": "SA-2026-022 per intero",
      "t": "Il bollettino, con l’esempio:"
    },
    {
      "k": "h",
      "t": "SA-2026-023: pilastri in c.a. con disposizioni di barre non uniformi"
    },
    {
      "k": "p",
      "t": "I momenti nelle stazioni arrivano alla verifica del pilastro come moduli, ma la capacità sotto sforzo normale e flessione attorno a un asse veniva calcolata per un solo segno, con la faccia superiore compressa. Con 6, 10, 14, 18 o 22 barre il progettista mette le barre in più sulle facce inferiore e destra, quindi quello è il segno forte: con il momento invertito la capacità è minore e non veniva mai controllata. Un pilastro 30×30 cm con 6 Ø20 sotto 100 kN di compressione porta 101,57 kN·m in un verso e 78,57 nell’altro, e risultava verificato con Mu = 100 kN·m. Riguarda la verifica del pilastro CIRSOC 201 a flessione attorno a un asse (delle barre che ha un’asta, del progettista e del ricontrollo del motore); la verifica biassiale già assumeva il quadrante peggiore."
    },
    {
      "k": "ul",
      "items": [
        "Come capire se ti riguarda: il modello ha pilastri in calcestruzzo verificati con la CIRSOC 201 le cui barre non sono simmetriche rispetto all’asse di flessione: 6, 10, 14, 18 o 22 barre dal progettista, oppure facce inserite a mano con un numero diverso di barre su facce opposte.",
        "Cosa fare: in una versione precedente alla correzione, usa disposizioni simmetriche (4, 8, 12, 16, 20 o 24 barre, oppure facce opposte uguali), oppure verifica il pilastro anche con le barre specchiate: governa la minore delle due capacità.",
        "Stato: corretto nella 0.4.0, attivo su stabileo.com dal 25 ottobre 2026. Il motore calcola entrambi i segni e prende il più sfavorevole; le disposizioni simmetriche danno esattamente ciò che davano prima."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-023-column-moment-sign.md",
      "label": "SA-2026-023 completo",
      "t": "Il bollettino, con il caso di prova:"
    },
    {
      "k": "h",
      "t": "SA-2026-024: plinti, nodi, solai e pareti progettati con i carichi non amplificati"
    },
    {
      "k": "p",
      "t": "Con combinazioni definite e nessuna di esse calcolata, plinti e nodi leggono il risultato a schermo, che in quel caso è ogni carico con coefficiente 1: sono stati progettati per i carichi di esercizio anziché per le combinazioni amplificate. Succedeva con il calcolo in tempo reale attivo (dopo una modifica ricalcola solo “Tutti i carichi” finché è a schermo la vista singola) oppure quando il calcolo delle combinazioni falliva e subentrava quello singolo. In un portale sotto 1,2D + 1,6W la reazione di un plinto risultava inferiore del 15 %; con carichi permanenti e variabili, del 29-38 %. Lo stesso accadeva a solai e pareti, all’ottimizzatore dell’acciaio e con un elenco vuoto di combinazioni attive. Ora ogni progetto si rifiuta e ne spiega il motivo finché le combinazioni non sono calcolate."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-024-design-on-unfactored-results.md",
      "label": "SA-2026-024 completo",
      "t": "Il bollettino, con l’esempio:"
    },
    {
      "k": "h",
      "t": "SA-2026-014: il collasso plastico 3D dipendeva dalla numerazione"
    },
    {
      "k": "p",
      "t": "Con flessione biassiale, i controlli che chiudono una cerniera che gira all’indietro e riaprono una chiusa spinta fuori dalla superficie di snervamento potevano ciclare. Il solutore proseguiva dallo stato in cui lo lasciava l’ordine degli elementi e spingeva una sezione chiusa attraverso la superficie di snervamento: la stessa struttura, rinumerata, dava moltiplicatori di collasso da 75,9 a 424,3, contro un valore certificato di 176,47. Ora l’analisi si ferma all’ultimo stato coerente e riporta quel moltiplicatore come limite inferiore, con un avviso, uguale per qualsiasi numerazione. Riguarda l’analisi pushover 3D della scheda PRO."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-014-plastic-3d-element-order.md",
      "label": "SA-2026-014 completo",
      "t": "Il bollettino, con il modello di prova e il valore certificato:"
    },
    {
      "k": "h",
      "t": "SA-2026-011: vincolo 3D passato da molla a incastro"
    },
    {
      "k": "p",
      "t": "Cambiare il tipo di un vincolo che aveva molle ne conservava le costanti elastiche. In modalità 3D venivano inviate al solutore insieme al vincolo, e il solutore trattava quel grado di libertà come elastico: il vincolo disegnato come incastro veniva calcolato come molla. Riguarda i modelli calcolati in modalità 3D, compresi quelli piani calcolati in 3D; la modalità 2D non è interessata."
    },
    {
      "k": "ul",
      "items": [
        "Come capire se sei interessato: un vincolo era prima una molla (o aveva costanti elastiche) ed è stato poi cambiato in incastro, cerniera o carrello, oppure un grado di libertà è stato spuntato come vincolato. Nei risultati, controlla lo spostamento o la rotazione del solo grado di libertà passato da elastico a bloccato: deve coincidere con il valore prescritto, nullo per un vincolo senza cedimento o rotazione imposta.",
        "Cosa fare: ricalcola su stabileo.com i modelli 3D i cui vincoli sono stati modificati da molle a rigidi e confronta i risultati vicino a quei vincoli con quelli che hai già usato.",
        "Stato: corretto su stabileo.com il 20 ottobre 2026. Ogni grado di libertà vincolato è calcolato come vincolato, anche nei progetti salvati prima."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-011-springs-on-fixed-supports.md",
      "label": "SA-2026-011 completo",
      "t": "Il bollettino con la riproduzione e il modello di prova:"
    },
    {
      "k": "h",
      "t": "SA-2026-013: momenti dei gusci curvi e tensioni termiche"
    },
    {
      "k": "p",
      "t": "I gusci curvi (quadrilateri contrassegnati come curvi) riportavano mx = my = mxy = 0 qualunque fosse la flessione, e sotto un carico di temperatura le loro tensioni conservavano la deformazione termica libera: un guscio libero di dilatarsi riportava E·α·ΔT/(1−ν), e uno vincolato nulla. L’app inviava inoltre la temperatura di un quadrilatero curvo come quella di uno piano, che il motore scartava: il guscio veniva analizzato non riscaldato. Questi risultati erano letti dai grafici a contorni dei gusci (anche nelle figure esportate), dalla tabella dei risultati PRO e dalla relazione in PDF, e dal progetto dei solai quando un pannello era un quadrilatero curvo; la cartella di lavoro dei risultati e il CSV lasciavano già in bianco quei momenti."
    },
    {
      "k": "ul",
      "items": [
        "Come capire se ti riguarda: il modello ha quadrilateri curvi e hai usato i loro momenti (contorni, tabella o relazione PRO, progetto dei solai), oppure ha un carico di temperatura su un quadrilatero curvo.",
        "Cosa fare: riesegui quei modelli e ripeti ogni progetto o verifica che leggeva i loro momenti o le loro tensioni sotto temperatura. Fino ad allora, modella la superficie con quadrilateri piani (MITC4).",
        "Stato: corretto nella 0.3.0, attivo su stabileo.com dal 21 ottobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-013-curved-shell-moments-and-thermal.md",
      "label": "SA-2026-013 completo",
      "t": "Il bollettino, con la mensola di prova e i casi termici:"
    },
    {
      "k": "h",
      "t": "SA-2026-017: curve del terreno nell’interazione terreno-struttura"
    },
    {
      "k": "p",
      "t": "Le curve del terreno non seguivano i riferimenti citati. L’argilla molle ometteva il termine J di Matlock (resistenza ultima inferiore di un terzo o metà vicino alla superficie); la sabbia usava sempre il fattore ciclico A = 0.9 e una tabella a gradini per k; l’argilla rigida saltava da metà a piena resistenza a y50 e scendeva al 70 % oltre. Le curve t-z e q-z (solo motore e WASM) non tenevano conto del perimetro del fusto e dell’area della punta. Riguarda PRO → Avanzate → Interazione terreno-struttura. Il pannello ora chiede J e il carico sulla sabbia, e il motore rifiuta una curva a cui manca un dato invece di assumerlo. Cosa fare: riesegui quei modelli e ricontrolla spostamenti e momenti dei pali."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-017-soil-curves.md",
      "label": "SA-2026-017 completo",
      "t": "Il bollettino, con i valori prima e dopo per ciascuna curva:"
    },
    {
      "k": "h",
      "t": "SA-2026-019: carichi di temperatura sulle aste"
    },
    {
      "k": "p",
      "t": "Il motore calcolava il carico termico di ogni asta con α = 12·10⁻⁶ /°C (quello dell’acciaio) e con l’altezza del rettangolo pieno equivalente, √(12·I/A). Su un IPE un momento da gradiente risultava inferiore del 30 %, e sull’alluminio lo sforzo normale da temperatura quasi della metà. L’app compensava entrambi dal 7 ottobre 2026, quindi riguarda l’uso diretto del motore o della sua API WASM e i modelli termici calcolati nell’app prima di quella data."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-019-frame-thermal-alpha-depth.md",
      "label": "SA-2026-019 completo",
      "t": "Il bollettino, con i casi di prova:"
    },
    {
      "k": "h",
      "t": "SA-2026-012: sollecitazioni delle aste nell’analisi con non linearità del materiale"
    },
    {
      "k": "p",
      "t": "Dopo lo snervamento di un’asta, il solutore equilibrava i carichi con la rigidezza ridotta ma riportava sollecitazioni calcolate con la rigidezza elastica. Spostamenti e reazioni erano giusti; sollecitazioni delle aste e coefficiente di utilizzo no: in una mensola il momento riportato era 100 volte quello reale. Questo solutore è raggiungibile solo dal motore o dalla sua API WASM: nessuna schermata dell’app lo richiama, quindi i risultati ottenuti su stabileo.com non sono interessati."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-012-material-nonlinear-member-forces.md",
      "label": "SA-2026-012 completo",
      "t": "Il bollettino, con la mensola di prova:"
    },
    {
      "k": "h",
      "t": "SA-2026-016: assi della sezione nei segmenti quasi verticali di un arco"
    },
    {
      "k": "p",
      "t": "I segmenti rettilinei di un arco prendevano gli assi locali predefiniti di un’asta rettilinea, che per un’asta entro 2,56° dalla verticale assumono come riferimento l’asse X globale. In un arco fuori dal piano X–Z questo ruotava di 90° la sezione dei segmenti quasi verticali alle imposte: lì Iy e Iz erano scambiati. In una semicirconferenza di 40 segmenti nel piano Y–Z la freccia in chiave risultava inferiore del 15 %. Riguarda le travi curve del motore e gli archi disegnati con lo strumento arco della scheda Aste (PRO) quando un segmento è quasi verticale; le curve in pianta non sono interessate. Gli archi salvati prima prendono gli assi corretti all’apertura del progetto."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-016-curved-member-axes.md",
      "label": "SA-2026-016 completo",
      "t": "Il bollettino, con l’arco di prova:"
    },
    {
      "k": "h",
      "t": "SA-2026-015: tensione dei cavi con peso proprio"
    },
    {
      "k": "p",
      "t": "L’analisi dei cavi usava il modulo di Ernst, la tangente della legge della corda di un cavo appeso sotto il proprio peso, come se fosse una secante dalla corda rettilinea. La freccia assorbe lunghezza della corda, quindi un cavo richiede più tensione di EA·ε per un dato allungamento, non meno. Dove il solo equilibrio fissa la forza nel cavo, la tensione era giusta; dove il cavo condivide il carico con altre aste (un’antenna strallata, un cavo che controventa un telaio) il cavo riceveva troppa poca tensione e le aste vicine troppa: nell’antenna di prova, 4,34 kN invece di 5,18 kN, e con carichi minori l’iterazione non convergeva. Nell’app riguarda i modelli 3D con aste il cui comportamento è “cavo” e il cui materiale ha una densità."
    },
    {
      "k": "ul",
      "items": [
        "Come capire: il modello ha aste con comportamento “cavo”, il loro materiale ha una densità e il cavo non è l’unico percorso di carico.",
        "Cosa fare: verifica in modo indipendente le forze determinanti nel cavo e negli ancoraggi includendo il peso proprio del cavo. Riesegui l’analisi con una versione corretta.",
        "Stato: corretto nella 0.3.0. L’analisi dei cavi ora risolve la legge della corda con l’iterazione di Newton."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-015-cable-tension-chord-law.md",
      "label": "SA-2026-015 completo",
      "t": "Il bollettino, con l’antenna di prova e la sua forma chiusa:"
    },
    {
      "k": "h",
      "t": "SA-2026-018: gusci MITC9 su geometria curva"
    },
    {
      "k": "p",
      "t": "L’elemento MITC9 è piano: proietta i suoi nove nodi su un piano. Quando i nodi di lato o centrale giacevano fuori da quel piano (qualsiasi mesh MITC9 curva) alla proiezione mancava la correzione del collegamento rigido del MITC4, quindi una rotazione rigida deformava l’elemento: una mesh curva si opponeva alle rotazioni dei suoi elementi e riportava tensioni per esse (101 MPa su una porzione di prova ruotata di 1 mrad). Questo elemento è usato solo dal motore o dalla sua API WASM: l’app non crea elementi a nove nodi, quindi i risultati ottenuti su stabileo.com non sono interessati."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-018-mitc9-curved-rigid-motion.md",
      "label": "SA-2026-018 completo",
      "t": "Il bollettino, con la porzione di prova e l’emisfero:"
    },
    {
      "k": "h",
      "t": "SA-2026-020: superficie di snervamento dell’analisi 3D con non linearità del materiale"
    },
    {
      "k": "p",
      "t": "In 2D un’asta snerva quando (N/Np)² + |M|/Mp supera 1. In 3D il solutore usava (N/Np)² + (My/Mpy)² + (Mz/Mpz)², con i rapporti dei momenti al quadrato, quindi con sforzo normale o flessione attorno a entrambi gli assi un’asta 3D snervava più tardi della stessa asta in 2D e il coefficiente di utilizzo riportato era basso: con N = 0,5·Np il carico al primo snervamento risultava superiore del 15 %. Ora il 3D usa (N/Np)² + |My|/Mpy + |Mz|/Mpz, che per flessione attorno a un solo asse è la superficie 2D. Questo solutore è raggiungibile solo dal motore o dalla sua API WASM: nessuna schermata dell’app lo richiama, quindi i risultati ottenuti su stabileo.com non sono interessati."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-020-material-nonlinear-3d-yield-surface.md",
      "label": "SA-2026-020 completo",
      "t": "Il bollettino, con i casi di prova:"
    },
    {
      "k": "h",
      "t": "SA-2026-008: taglio alla base e partecipazione modale nell’analisi spettrale"
    },
    {
      "k": "p",
      "t": "Con la regola CQC, il taglio alla base riportato era ancora combinato con SRSS. I tagli modali alla base in una direzione hanno lo stesso segno, quindi il CQC dà più dell’SRSS: con due modi vicini il valore riportato era inferiore del 19 %. I fattori di partecipazione omettevano inoltre la massa che la matrice di massa consistente accoppia ai vincoli, il che sottostimava la risposta nei modelli con pochi elementi per pilastro."
    },
    {
      "k": "ul",
      "items": [
        "Come capire se sei interessato: hai eseguito un’analisi spettrale con CQC e hai usato il taglio alla base riportato (ad esempio per scalarlo al taglio statico alla base), oppure hai usato la massa consistente con pilastri di uno o due elementi.",
        "Cosa fare: ricalcola i modelli interessati su stabileo.com e confronta con i risultati che hai già usato. Il rimedio indicato da questo bollettino prima della correzione non si applica più.",
        "Stato: corretto su stabileo.com il 21 ottobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-008-spectral-combination.md",
      "label": "SA-2026-008 completo",
      "t": "Il bollettino, con i due difetti separati:"
    },
    {
      "k": "h",
      "t": "SA-2026-007: instabilità torsionale e flesso-torsionale in 3D"
    },
    {
      "k": "p",
      "t": "La rigidezza geometrica delle aste 3D aveva solo i termini flessionali: né il termine di Wagner né l’accoppiamento con il centro di taglio. L’instabilità torsionale e flesso-torsionale non compariva mai e veniva riportato invece il carico di Eulero. Per un pilastro a croce il carico riportato era superiore del 96 % a quello determinante."
    },
    {
      "k": "ul",
      "items": [
        "Come capire se sei interessato: hai usato il moltiplicatore di instabilità 3D o il P-Delta 3D per strutture con sezioni aperte a pareti sottili di bassa rigidezza torsionale: croci, angolari singoli o doppi, T, profili a C. Anche per una I doppiamente simmetrica, escludi il ricontrollo solo se hai verificato indipendentemente che governa l’instabilità flessionale. Nemmeno le verifiche di progetto che calcolano da sole l’instabilità torsionale (CIRSOC 301 E.4, dalla 0.2.0) sono interessate.",
        "Cosa fare: ricalcola i modelli interessati su stabileo.com e confronta con i risultati che hai già usato. Il rimedio indicato da questo bollettino prima della correzione non si applica più.",
        "Stato: corretto su stabileo.com il 21 ottobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-007-torsional-buckling.md",
      "label": "SA-2026-007 completo",
      "t": "Il bollettino, con il pilastro a croce svolto:"
    },
    {
      "k": "h",
      "t": "SA-2026-006: modello piano calcolato in 3D con momenti nodali"
    },
    {
      "k": "p",
      "t": "Un modello piano calcolato dal solutore 3D sta nel piano X–Z, dove la rotazione piana è una rotazione attorno a −Y. Momenti nodali e rotazioni imposte dovevano cambiare segno e non lo facevano, quindi agivano come la loro immagine speculare. Combinati con le forze, possono sommarsi invece di compensarsi."
    },
    {
      "k": "ul",
      "items": [
        "Come capire se sei interessato: il modello è piano (tutti i nodi in un piano), è stato calcolato in modalità 3D e ha momenti nodali o rotazioni imposte ai vincoli. Le molle rotazionali non sono interessate.",
        "Cosa fare: ricalcola i modelli interessati su stabileo.com e confronta con i risultati che hai già usato. Il rimedio indicato da questo bollettino prima della correzione non si applica più.",
        "Stato: corretto su stabileo.com il 21 ottobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-006-mirrored-moments-2d-in-3d.md",
      "label": "SA-2026-006 completo",
      "t": "Il bollettino, con i tre casi di prova:"
    },
    {
      "k": "h",
      "t": "SA-2026-005: sforzo normale nelle aste inclinate 2D"
    },
    {
      "k": "p",
      "t": "Il costruttore dei carichi 2D spostava ai nodi di estremità la componente lungo l’asta di un carico su un’asta inclinata. Reazioni e spostamenti erano giusti, ma l’asta non vedeva quel carico lungo la sua campata, quindi il suo sforzo normale restava costante alla media dei suoi veri valori di estremità: inferiore del 26 % alla base di un puntone di falda. Il diagramma, l’ispettore, la relazione, l’esportazione in Excel e il progetto usavano tutti quel valore. Una coppia applicata su un’asta veniva inoltre ignorata quando un modello piano era calcolato in 3D."
    },
    {
      "k": "ul",
      "items": [
        "Come capire se sei interessato: un modello 2D calcolato dal 25/09/2026 con aste inclinate (puntoni di falda, scale, controventi, archi disegnati come segmenti) con carichi distribuiti, concentrati o di peso proprio con una componente lungo l’asta; oppure un modello piano con una coppia su un’asta calcolato in 3D. Le aste progettate a compressione sono le più esposte.",
        "Cosa fare: ricalcola i modelli interessati su stabileo.com e confronta con i risultati che hai già usato. Il rimedio indicato da questo bollettino prima della correzione non si applica più.",
        "Stato: corretto su stabileo.com il 21 ottobre 2026."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/SA-2026-005-inclined-member-loads.md",
      "label": "SA-2026-005 completo",
      "t": "Il bollettino, con il puntone di falda e l’asta 3-4-5:"
    },
    {
      "k": "h",
      "t": "Corretti il 19 ottobre 2026"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-009: l’elemento guscio solido SHB8 era troppo rigido del 22 % nella flessione di piastre sottili (blocco da spessore di Poisson), quindi sottostimava le frecce di circa il 18 %. Ricontrolla le conclusioni su frecce e vibrazioni per i modelli con piastre a guscio solido calcolati prima di quella data; MITC4, MITC9, DKT e il guscio curvo non erano interessati.",
        "SA-2026-010: il certificato dell’analisi spettrale poteva lasciar passare risultati non finiti (NaN). I numeri erano visibilmente non validi; a essere sbagliata era l’affermazione di verifica. Non occorre ricontrollare nulla, a meno che un risultato consegnato non mostrasse valori non finiti."
      ]
    },
    {
      "k": "h",
      "t": "Corretti nella versione 0.2.0"
    },
    {
      "k": "p",
      "t": "La versione 0.2.0, del 18 ottobre 2026, ha corretto i quattro bollettini retroattivi. Riguardano tutti progetti calcolati prima del 17 ottobre 2026, e l’indicazione è la stessa per ciascuno: rigenera carichi e combinazioni, calcola e rivedi le verifiche di progetto, e ricontrolla ogni elaborato emesso con una versione precedente."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001: combinazioni e carichi CIRSOC 101, 102 e 103 generati a sfavore di sicurezza (in un esempio lo sforzo normale di un pilastro era inferiore del 29 %).",
        "SA-2026-002: le verifiche del calcestruzzo CIRSOC 201 e ACI 318 sovrastimavano la capacità (φMn fino al 18 % troppo alto).",
        "SA-2026-003: le verifiche di acciaio, formati a freddo e collegamenti sovrastimavano la capacità (taglio dell’anima fino al 60 % troppo alto).",
        "SA-2026-004: analisi che ignoravano parte del modello (la time-history con moto del suolo perdeva fino a metà del carico sismico; il collasso plastico 3D fino a 2,3 volte a sfavore di sicurezza)."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Tutti i bollettini",
      "t": "L’elenco completo, con ogni bollettino, la sua correzione e la sua gravità:"
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Come abbiamo trovato questi difetti, e cosa nessuna verifica può garantire:"
    }
  ]
};

export default body;
