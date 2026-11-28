import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.1: verifiche delle aste e carichi da neve corretti",
  "excerpt": "Riesegui le verifiche di progetto in calcestruzzo e in acciaio interessate. Per la neve generata, rigenera prima i carichi, poi riesegui i casi di carico, le combinazioni, gli inviluppi e le verifiche di progetto derivate interessati.",
  "blocks": [
    {
      "k": "p",
      "t": "Riesegui le verifiche di progetto in calcestruzzo e in acciaio interessate. Per la neve generata, rigenera prima i carichi, poi riesegui i casi di carico, le combinazioni, gli inviluppi e le verifiche di progetto derivate interessati. Ricalcolare soltanto i carichi salvati in precedenza non li ripara. Confronta sollecitazioni, capacità, armature, coefficienti di utilizzo, combinazioni determinanti e certificati con i risultati già usati. Rivedi i calcoli consegnati e i dimensionamenti basati su di essi. Un rifiuto, una grandezza non disponibile o un’armatura non verificata non forniscono alcuna risposta di verifica soddisfatta e non equivalgono a una sollecitazione nulla."
    },
    {
      "k": "note",
      "t": "I cinque bollettini di gravità Alta seguenti sono corretti nella 0.6.1. Segui ciascun bollettino per i dati interessati e l’azione da intraprendere, anche se i risultati precedenti risultavano verificati o certificati."
    },
    {
      "k": "h",
      "t": "Bollettini di sicurezza"
    },
    {
      "k": "table",
      "caption": "Bollettini di sicurezza",
      "head": [
        "Bollettino",
        "Gravità",
        "Cosa è cambiato e cosa fare"
      ],
      "rows": [
        [
          "SA-2026-064",
          "Alta",
          "Il Cb dell’acciaio poteva provenire da un’altra combinazione o da una breve luce non controventata non individuata (#1316, #2088). Riesegui le verifiche dell’acciaio secondo CIRSOC 301 e rivedi capacità flessionale, coefficiente di utilizzo a interazione e combinazioni determinanti."
        ],
        [
          "SA-2026-065",
          "Alta",
          "L’accumulo di neve al gradino di copertura poteva essere omesso su una copertura inclinata ricevente (#2082). Rigenera i carichi da neve CIRSOC 104 e riesegui le analisi e le verifiche di progetto interessate."
        ],
        [
          "SA-2026-066",
          "Alta",
          "Il Cm del calcestruzzo poteva ricevere il beneficio dei momenti di estremità con carico trasversale tra gli appoggi (#2089). Riverifica pilastri e pareti snelli in calcestruzzo, momenti amplificati e armature."
        ],
        [
          "SA-2026-067",
          "Alta",
          "La rotazione in pianta poteva cambiare i carichi da neve generati (#2093). Rigenera i carichi usando l’effettiva geometria della copertura, poi riesegui analisi e verifiche; ruotare di nuovo un vecchio modello non è una riparazione."
        ],
        [
          "SA-2026-068",
          "Alta",
          "La torsione poteva risultare verificata con staffe progettate inadeguate (#2141). Riesegui le verifiche di progetto del calcestruzzo e rivedi l’effettiva capacità trasversale, il passo delle staffe e i casi di torsione non verificati. Un’armatura longitudinale non verificata non è una gabbia che passa la verifica."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Indice dei bollettini di sicurezza",
      "t": "Bollettini di sicurezza:"
    },
    {
      "k": "h",
      "t": "Ogni avviso di modifica dei risultati dalla v0.6.0"
    },
    {
      "k": "p",
      "t": "Il registro alla v0.6.0 termina alla versione dei risultati 78; questa versione arriva a 80. La tabella elenca tutti i 24 nuovi avvisi. Diversi avvisi condividono una versione. Ricalcola ogni verifica applicabile; per gli avvisi sulla neve, rigenera i carichi prima di ricalcolare."
    },
    {
      "k": "table",
      "caption": "Ogni avviso di modifica dei risultati dalla v0.6.0",
      "head": [
        "Versione dei risultati",
        "Risultato che cambia"
      ],
      "rows": [
        [
          "79",
          "La copertura dell’accumulo di neve segue i bordi continui della copertura"
        ],
        [
          "79",
          "Le sostituzioni della neve conservano i lati non bilanciati e i tratti di sezione"
        ],
        [
          "79",
          "I telai piani da neve seguono i tratti di copertura collegati"
        ],
        [
          "79",
          "I carichi da neve rispettano le posizioni locali e i limiti dell’accumulo"
        ],
        [
          "79",
          "I coefficienti della neve seguono l’orientamento di ciascuna copertura"
        ],
        [
          "79",
          "I casi di neve coprono ogni orientamento del colmo"
        ],
        [
          "79",
          "La distanza di trasporto della neve dipende dalla continuità delle coperture e dalla geometria selezionata"
        ],
        [
          "79",
          "I carichi da neve mantengono la loro intensità con la rotazione in pianta"
        ],
        [
          "79",
          "L’accumulo al gradino di copertura usa il piano della copertura ricevente"
        ],
        [
          "79",
          "I carichi da neve seguono ogni superficie di copertura collegata"
        ],
        [
          "79",
          "Le aree di competenza della neve usano le superfici interne della copertura"
        ],
        [
          "80",
          "Le verifiche delle aste richiedono ogni combinazione attiva"
        ],
        [
          "80",
          "Per le verifiche delle aste servono dati completi nelle sezioni"
        ],
        [
          "80",
          "Le verifiche concomitanti conservano le sollecitazioni determinanti"
        ],
        [
          "80",
          "Il progetto usa le barre selezionate e il carico noto sulla campata"
        ],
        [
          "80",
          "Le verifiche di interazione usano le sollecitazioni concomitanti nelle sezioni"
        ],
        [
          "80",
          "Le verifiche del calcestruzzo conservano la snellezza secondaria"
        ],
        [
          "80",
          "I casi concomitanti conservano tutta l’armatura a torsione richiesta"
        ],
        [
          "80",
          "L’armatura fissa conserva la verifica del massimo pratico"
        ],
        [
          "80",
          "Le sollecitazioni di progetto rispettano il comportamento e le luci delle ali"
        ],
        [
          "80",
          "La torsione verifica ogni gabbia di staffe restituita"
        ],
        [
          "80",
          "Le travi condivise conservano i loro assi; l’armatura a torsione va dichiarata"
        ],
        [
          "80",
          "Il Cb di interazione dell’acciaio usa il proprio diagramma di combinazione"
        ],
        [
          "80",
          "Le sezioni dell’acciaio usano le lunghezze fisiche e conservano le sollecitazioni di taglio"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.1.it.md",
      "label": "Note di rilascio complete della 0.6.1",
      "t": "Ogni avviso di modifica dei risultati dalla v0.6.0:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Una finestra di ricontrollo dei risultati in Stabileo Base, che elenca le modifiche che interessano un progetto salvato più vecchio.",
      "caption": "I tuoi risultati possono cambiare: ricalcola i progetti interessati"
    },
    {
      "k": "h",
      "t": "Altre modifiche"
    },
    {
      "k": "p",
      "t": "Le verifiche del calcestruzzo e dell’acciaio usano le sollecitazioni della stessa combinazione e della stessa sezione quando disponibili, ma la 0.6.1, pur rifiutando alcuni dati incompleti, poteva ancora accettare sollecitazioni concomitanti mancanti (#2096, SA-2026-071). Verificale indipendentemente o riesegui le verifiche con la 0.6.2 o successiva. Gli stati di armatura richiesta e fornita restano separati e la mancanza di armatura longitudinale a torsione viene segnalata esplicitamente."
    },
    {
      "k": "h",
      "t": "Limiti noti"
    },
    {
      "k": "ul",
      "items": [
        "Restano aperti risultati errati noti: #2096, #2142, #2143 e #2144. Questa versione non li corregge. Consulta il loro ambito di applicazione e verifica in modo indipendente i risultati interessati prima di usarli.",
        "SA-2026-056 resta non corretto: verifica in modo indipendente le sollecitazioni dinamiche dei modelli misti telaio–guscio vincolati prima di usarle, anche quando rinumerazione, rotazione o conversione delle unità danno risultati concordi. Non è stato stabilito alcun fattore di correzione cautelativo.",
        "Il collasso plastico 2D resta rifiutato in attesa di #758, come descritto in SA-2026-044. Un limite inferiore 3D certificato non certifica la cronologia grezza delle cerniere.",
        "L’analisi time-history non fornisce le sollecitazioni dinamiche totali ai vincoli. Usa un’analisi indipendente che comprenda inerzia, smorzamento e carico sui vincoli. Le analisi dei cavi non supportate e il moto imposto non nullo ai vincoli nei flussi con cavi/time-history vengono rifiutati esplicitamente.",
        "I solutori spaziali a lunghezza d’arco e a controllo di spostamento non sono stati aggiunti. Gli avvisi e le restrizioni esistenti restano applicabili."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Registro delle modifiche",
      "t": "Registro delle modifiche:"
    }
  ]
};

export default body;
