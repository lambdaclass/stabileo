import type { StandingPage } from '../../pages';

const body: StandingPage['i18n']['en'] = {
  "title": "Quanto è affidabile Stabileo? Come si verificano i suoi risultati",
  "description": "Come Stabileo verifica i risultati: sette altri programmi FE, esempi pubblicati, limiti d’errore dimostrati in Lean e bollettini pubblici.",
  "eyebrow": "Affidabilità",
  "lead": "Il software è verificato con cinque metodi, tra cui il confronto con altri sette programmi agli elementi finiti. Solo i risultati supportati ricevono un certificato numerico quando la verifica del limite d’errore riesce. La matematica del limite è dimostrata in Lean. I difetti che potrebbero aver influito su risultati già in uso vengono pubblicati come bollettini di sicurezza (alcune segnalazioni sono ancora in fase di valutazione, in pubblico), e l’elenco qui sotto dice quali sono risolti e in quale versione. Come qualsiasi programma di analisi, non verifica il tuo modello: carichi, vincoli e idealizzazione sono decisioni dell’ingegnere.",
  "blocks": [
    {
      "k": "h",
      "t": "Cinque modi di cercare errori"
    },
    {
      "k": "ul",
      "items": [
        "Confronto con altri programmi: gli stessi modelli, quelli fissi e quelli casuali generati ogni notte, vengono risolti con OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos e CalculiX, e ogni differenza viene indagata.",
        "Riferimenti pubblicati: casi i cui risultati sono stati pubblicati dai loro autori, e verifiche di progetto confrontate con esempi svolti pubblicati (INTI-CIRSOC, AISC e altri).",
        "Invarianti fisici: ruotare, specchiare o rinumerare un modello, o cambiarne le unità, deve cambiare la risposta esattamente come dice la fisica.",
        "Derivazioni: le matrici dell’elemento di telaio sono derivate in forma simbolica e confrontate termine per termine con il codice.",
        "Fuzzing e mutation testing: milioni di input generati cercano guasti, e si introducono errori di proposito per verificare che i test li rilevino."
      ]
    },
    {
      "k": "h",
      "t": "Risultati con un limite d’errore"
    },
    {
      "k": "p",
      "t": "Per i risultati che lo consentono, Stabileo calcola, in aritmetica degli intervalli, un limite che contiene la soluzione esatta del sistema risolto; quando non può, il risultato è marcato come non certificato, con il motivo. La matematica di fondo è dimostrata in Lean per l’analisi lineare, le combinazioni, l’analisi modale e il collasso plastico. Dalla 0.3.0, per l’analisi lineare di telai e travature reticolari il limite viene verificato anche rispetto al modello stesso, con un assemblaggio indipendente."
    },
    {
      "k": "link",
      "slug": "end-to-end-certificates",
      "t": "Come funziona la verifica rispetto al modello:"
    },
    {
      "k": "h",
      "t": "Perché pubblichiamo bollettini di sicurezza"
    },
    {
      "k": "p",
      "t": "Questa verifica ha trovato difetti reali, molti dei quali non conservativi. Pubblichiamo quelli che potrebbero aver influito su risultati già in uso, con il modo di riconoscere un modello interessato e ciò che occorre ricontrollare, perché un difetto che nessuno segnala resta nei calcoli già consegnati."
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-001 – 004 sono stati risolti nella versione 0.2.0.",
        "SA-2026-005 – 020 sono stati risolti nella versione 0.3.0.",
        "SA-2026-021 – 024 sono stati risolti nella versione 0.4.0.",
        "SA-2026-025 – 047 sono stati pubblicati con la versione 0.5.0 e risolti in essa con due eccezioni. Per SA-2026-040 la verifica a torsione resta incompleta. Per SA-2026-044 il collasso plastico 2D resta rifiutato finché non si chiude #758.",
        "L’app avvisa una volta quando i risultati possono essere cambiati, e i progetti salvati prima di una modifica che li riguarda chiedono una nuova verifica quando si aprono."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "L’elenco completo dei bollettini:"
    },
    {
      "k": "h",
      "t": "Ciò che nessuna verifica garantisce"
    },
    {
      "k": "ul",
      "items": [
        "Un limite d’errore delimita l’errore numerico; non dimostra che il modello sia giusto e non delimita l’errore di discretizzazione della mesh.",
        "Non c’è ancora stata una revisione indipendente da parte di un ingegnere strutturista abilitato, e i risultati sull’acciaio secondo CIRSOC 301 sono ancora etichettati come sperimentali.",
        "L’analisi non lineare del materiale è un modello secante sull’intera asta.",
        "Il progetto normativo in PRO (armature, dettagli costruttivi e unioni) è ancora in sviluppo ed è disattivato per impostazione predefinita.",
        "I problemi di sicurezza aperti sono pubblici su GitHub, e il livello di verifica di ogni analisi, elemento e norma è nella matrice di maturità."
      ]
    },
    {
      "k": "p",
      "t": "In breve: Stabileo si adatta ad analisi che puoi controllare incrociando i risultati, alla didattica e a lavori di progetto in cui un ingegnere rivede i risultati che governano, come con qualsiasi programma. Se il tuo processo richiede software commerciale revisionato in modo indipendente o certificato, Stabileo non è ancora a quel punto, e lo diciamo."
    },
    {
      "k": "link",
      "slug": "how-stabileo-checks-its-results",
      "t": "Ogni verifica nel dettaglio, e i suoi limiti:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Matrice di maturità",
      "t": "Il livello di verifica di ogni parte:"
    }
  ],
  "faqTitle": "Domande frequenti",
  "faq": [
    {
      "q": "Stabileo è affidabile per un lavoro reale di progettazione strutturale?",
      "a": "Cinque metodi verificano il software, tra cui i benchmark con altri sette programmi agli elementi finiti. La certificazione numerica riguarda solo i risultati supportati e verificati, con limiti d’errore fondati su dimostrazioni in Lean. I difetti che potrebbero aver influito su risultati già in uso vengono pubblicati; quelli ancora in valutazione sono pubblici su GitHub. Non ha ancora avuto una revisione indipendente da parte di un ingegnere abilitato e il progetto normativo è ancora in sviluppo, quindi, come con qualsiasi programma, l’ingegnere rivede il modello e i risultati che governano."
    },
    {
      "q": "Perché Stabileo pubblica bollettini di sicurezza?",
      "a": "Perché la sua verifica ha trovato difetti reali, molti dei quali non conservativi, e un difetto che nessuno segnala resta nei calcoli già consegnati. Ogni bollettino dice come riconoscere un modello interessato e che cosa ricontrollare."
    },
    {
      "q": "I bollettini pubblicati sono risolti?",
      "a": "Tra SA-2026-001 e SA-2026-047, tutti tranne due. Per lo stato degli avvisi successivi consulta la tabella dei bollettini. SA-2026-001 – 004 sono stati risolti nella versione 0.2.0, SA-2026-005 – 020 nella 0.3.0, SA-2026-021 – 024 nella 0.4.0 e SA-2026-025 – 047 nella 0.5.0, tranne SA-2026-040 e SA-2026-044. SA-2026-040 è contenuto: la verifica è marcata come incompleta. SA-2026-044 non è risolto: il collasso plastico 2D resta rifiutato finché non si chiude #758."
    }
  ]
};

export default body;
