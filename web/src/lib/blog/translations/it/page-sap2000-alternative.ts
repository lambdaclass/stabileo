import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Un’alternativa gratuita e open source a SAP2000 per l’analisi, nel tuo browser",
  "description": "Stabileo: analisi strutturale gratuita e open source nel tuo browser. Telai 2D/3D, gusci, P-Delta, modale e spettro; verifiche normative in moduli a pagamento.",
  "eyebrow": "Alternativa a SAP2000",
  "lead": "Stabileo è un software di analisi strutturale gratuito e open source (AGPL-3.0) che gira nel browser, senza installazione, chiave di licenza né account. Il solutore è scritto in Rust e compilato in WebAssembly, quindi il modello viene risolto sul tuo computer. La modalità Base modella, carica, calcola e legge i risultati di telai e travature reticolari 2D e 3D; la modalità PRO aggiunge solai e pareti, importazione DXF e IFC, carichi normativi e verifiche degli elementi. L’analisi è gratuita per tutti; i moduli di progetto sono a pagamento, e gratuiti per le università.",
  "blocks": [
    {
      "k": "h",
      "t": "Quando è una buona alternativa"
    },
    {
      "k": "ul",
      "items": [
        "Analizzare telai, travature reticolari ed edifici senza pagare una licenza né installare nulla, su qualsiasi sistema operativo con un browser moderno.",
        "Controllare i risultati di un altro programma: Stabileo è confrontato con altri sette programmi agli elementi finiti, e ogni riga del suo codice si può leggere.",
        "Insegnare e imparare: mostra il metodo della rigidezza passo dopo passo.",
        "Verificare elementi in acciaio e calcestruzzo secondo AISC 360, EN 1993-1-1, AISI S100, ACI 318, EN 1992-1-1 e le norme CIRSOC argentine, in modalità PRO."
      ]
    },
    {
      "k": "h",
      "t": "Quando non lo è ancora"
    },
    {
      "k": "ul",
      "items": [
        "Se ti serve la gamma di norme di progetto e i decenni di esperienza di un programma commerciale affermato: il progetto normativo in Stabileo è ancora in sviluppo.",
        "Se la tua azienda richiede software revisionato in modo indipendente da un ingegnere abilitato: quella revisione non è ancora avvenuta."
      ]
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Come verifichiamo i risultati, e dove si fermano le verifiche:"
    }
  ],
  "faqTitle": "Domande frequenti",
  "faq": [
    {
      "q": "Qual è la migliore alternativa gratuita a SAP2000?",
      "a": "Dipende da come usi SAP2000. Per l’analisi di telai, travature reticolari e gusci 2D e 3D nel browser, senza nulla da installare, Stabileo è gratuito e open source. Per l’analisi non lineare di ricerca via script, OpenSees è l’opzione open source consolidata."
    },
    {
      "q": "Posso usare Stabileo invece di pagare una licenza SAP2000 o ETABS?",
      "a": "Per l’analisi di telai, travature reticolari e molti edifici, e per le verifiche degli elementi secondo AISC 360, ACI 318, gli Eurocodici e CIRSOC, sì. L’analisi è gratuita; i moduli di progetto specializzati sono a pagamento, e gratuiti per le università. Per la gamma completa di norme di progetto e una lunga esperienza in produzione, i programmi commerciali offrono ancora di più; il progetto normativo in Stabileo è ancora in sviluppo."
    },
    {
      "q": "Stabileo è davvero gratuito?",
      "a": "Il programma di base, per l’analisi strutturale nel browser, è open source e gratuito per tutti. Alcuni moduli specialistici sono a pagamento; le università li ottengono gratis. Stabileo AI e il calcolo intensivo nel cloud sono a pagamento per tutti, università comprese, a un prezzo che copre ciò che costano."
    },
    {
      "q": "Funziona su Mac o Linux?",
      "a": "Sì. Funziona in qualsiasi browser moderno, su qualsiasi sistema operativo."
    }
  ]
};

export default body;
