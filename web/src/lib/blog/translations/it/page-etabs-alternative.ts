import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Un’alternativa gratuita e open source a ETABS",
  "description": "Confronta Stabileo con il tuo flusso di lavoro in ETABS: analisi gratuita nel browser, open source, prove di verifica, limiti attuali e importazione prevista.",
  "eyebrow": "Un’alternativa gratuita e open source a ETABS",
  "lead": "Stabileo offre analisi strutturale gratuita e open source nel tuo browser. Se si adatta al tuo flusso di lavoro in ETABS dipende dalle analisi e dalle verifiche che ti servono; non è una dichiarazione di parità di funzioni.",
  "blocks": [
    {
      "k": "h",
      "t": "Che cosa copre Stabileo oggi"
    },
    {
      "k": "p",
      "t": "La matrice delle capacità del solutore registra l’analisi statica lineare 2D e 3D, telai e travature reticolari, combinazioni di carico e inviluppi, P-Delta, instabilità e analisi modale. Documenta anche le famiglie di piastre e gusci. L’analisi Base e PRO è disponibile; il progetto normativo e l’assistente AI sono in sviluppo."
    },
    {
      "k": "p",
      "t": "Per i flussi di lavoro sugli edifici, distingui le capacità del solutore per piastre e gusci dall’interfaccia PRO per solai, pareti e modelli complessi. Il progetto normativo in PRO è ancora in sviluppo; l’esistenza di una funzione del solutore non significa che un flusso di lavoro completo di progettazione degli edifici sia pronto."
    },
    {
      "k": "h",
      "t": "Limiti attuali"
    },
    {
      "k": "p",
      "t": "L’importazione di modelli SAP2000/ETABS è prevista, non disponibile. Non aspettarti di aprire file .s2k o .e2k. La matrice delle capacità registra le lacune rimanenti nella robustezza non lineare, nei casi misti telaio/guscio e nella validazione di modelli più grandi. L’assistente AI è in sviluppo, in arrivo più avanti."
    },
    {
      "k": "h",
      "t": "Come si verificano i risultati"
    },
    {
      "k": "p",
      "t": "Benchmark pubblicati, confronti con implementazioni indipendenti e test offrono livelli diversi di evidenza. Le analisi e le verifiche di progetto supportate possono portare limiti verificati dalla macchina; questo non certifica ogni risultato né il modello ingegneristico. La matrice di maturità elenca le evidenze e i problemi aperti di ogni famiglia."
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/BENCHMARKS.md#solver-capability-matrix",
      "label": "Capacità del solutore",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Maturità della verifica",
      "t": ""
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/roadmap/PRODUCT_ROADMAP.md",
      "label": "Roadmap del prodotto",
      "t": ""
    }
  ],
  "faqTitle": "Fonti e ambito",
  "faq": [
    {
      "q": "È una sostituzione completa di ETABS?",
      "a": "Non si dichiara alcuna equivalenza funzione per funzione. Esamina le capacità e i limiti documentati per il tuo progetto. ETABS è nominato solo per identificare il flusso di lavoro confrontato; non si intende alcuna affiliazione né approvazione."
    }
  ]
};

export default body;
