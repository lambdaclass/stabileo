import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Come verifichiamo i risultati di Stabileo, e dove si fermano i controlli",
  "excerpt": "Il solutore, la verifica formale e l’IA: come cerchiamo errori nei numeri che dà Stabileo, cosa dimostrano i certificati e cosa nessuna verifica può garantire.",
  "blocks": [
    {
      "k": "p",
      "t": "Un programma di analisi strutturale può dare un numero sbagliato senza alcun segno visibile. Nelle ultime settimane abbiamo provato ogni parte di Stabileo in più modi indipendenti, abbiamo trovato decine di difetti reali, molti a sfavore di sicurezza, e ne abbiamo corretti la maggior parte. Ciascuno viene classificato e, se può aver influito su risultati già in uso, pubblicato come bollettino con ciò che fare nel frattempo; alcuni sono ancora in classificazione. Questo articolo spiega come cerchiamo quei difetti, cosa dimostrano i certificati che accompagnano i risultati e, con la stessa franchezza, cosa sta fuori da qualsiasi verifica."
    },
    {
      "k": "h",
      "t": "Un solo motore"
    },
    {
      "k": "p",
      "t": "Il solutore è scritto in Rust e compilato in WebAssembly: gira sul computer dell’utente, senza installazione e senza inviare il modello a nessun server. È lo stesso codice che gira nell’integrazione continua. Nell’ottobre 2026 abbiamo rimosso i calcoli paralleli in TypeScript che sostituivano in silenzio il motore quando non era disponibile: ora l’applicazione lo dice, invece di calcolare con una copia non verificata."
    },
    {
      "k": "h",
      "t": "Cinque modi di cercare gli errori"
    },
    {
      "k": "p",
      "t": "Nessun singolo test trova ogni errore, quindi ne usiamo diversi che falliscono in modi diversi:"
    },
    {
      "k": "ul",
      "items": [
        "Confronto con altri programmi. Gli stessi modelli, fissi e casuali generati ogni notte, vengono risolti con OpenSees, Code_Aster, Frame3DD, PyNite, MYSTRAN, Kratos e CalculiX. Ogni differenza viene indagata finché non sappiamo se l’errore è nostro o se i due programmi modellano il caso in modo diverso.",
        "Riferimenti pubblicati. Una suite di accettazione di casi i cui risultati sono stati pubblicati dai loro autori, non da un altro programma commerciale, con tolleranze fissate dalla precisione stampata nella fonte. Le verifiche di progetto sono confrontate con esempi svolti pubblicati (INTI-CIRSOC, AISC e altri).",
        "Invarianti fisici. Ruotare, specchiare o rinumerare un modello, o cambiarne le unità, deve cambiare la risposta esattamente come dice la fisica; sovrapposizione degli effetti, reciprocità e bilancio energetico devono valere. Questi test non richiedono alcun valore di riferimento.",
        "Derivazioni. Le matrici degli elementi di telaio sono derivate simbolicamente dai principi primi e confrontate termine per termine con quelle del codice; per gli altri elementi ci sono derivazioni scritte che un altro ingegnere può rivedere.",
        "Fuzzing e mutation testing. Milioni di input generati cercano arresti anomali e risultati non finiti, e si introducono apposta errori nel codice per verificare che i test li individuino."
      ]
    },
    {
      "k": "table",
      "caption": "Alcune cifre del lavoro di verifica, ricavate dai documenti nel repository.",
      "head": [
        "Cosa",
        "Numero"
      ],
      "rows": [
        [
          "Programmi a elementi finiti indipendenti nel confronto",
          "7"
        ],
        [
          "Casi di accettazione con risultati pubblicati",
          "12"
        ],
        [
          "Valori di riferimento pubblicati in quei casi",
          "105"
        ],
        [
          "Teoremi in Lean i cui assiomi sono controllati dall’integrazione continua",
          "37"
        ]
      ]
    },
    {
      "k": "note",
      "t": "I 105 valori di riferimento sono per lo più frequenze di telai di edifici (SAC, IASC-ASCE, Bathe e Wilson). Coprono bene l’analisi modale e lineare dei telai; non sono una prova per altri tipi di analisi."
    },
    {
      "k": "h",
      "t": "Certificati: un risultato con un limite d’errore"
    },
    {
      "k": "p",
      "t": "Per i risultati che lo consentono, Stabileo tenta anche in background un certificato: un limite, calcolato con l’aritmetica degli intervalli, che contiene la soluzione esatta del sistema che ha risolto. Quando non ci riesce, il risultato è contrassegnato come non certificato, con il motivo. Il limite riguarda l’errore numerico, non l’errore di discretizzazione della mesh o del passo temporale. Per l’analisi lineare, le combinazioni, la modale e il collasso plastico, la matematica di fondo di quel limite è dimostrata in Lean, un assistente di dimostrazione in cui il computer controlla ogni passaggio; alcuni passaggi (vincoli, una condizione della verifica modale) non sono ancora formalizzati. Anche le analisi P-Delta, spettrale, armonica e time-history hanno certificati, ma la loro matematica non è ancora formalizzata in Lean. L’integrazione continua rifiuta qualsiasi dimostrazione incompleta o assioma aggiunto, e per alcuni tipi di certificato il verificatore che gira è proprio il codice Lean su cui vertono le dimostrazioni."
    },
    {
      "k": "img",
      "base": "blog/certificate",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo modalità Base con l’esempio del telaio a portale risolto. Il pannello dei risultati mostra gli spostamenti dei nodi e, sotto Controlli del risultato, “Certificato: errore di spostamento ≤ 3.41e-16” con un link per scaricare il certificato, e “Verificato da capo a fondo: un riassemblaggio indipendente del modello concorda”.",
      "caption": "Un telaio risolto: il limite del certificato sull’errore di spostamento e la verifica da capo a fondo, sotto Controlli del risultato."
    },
    {
      "k": "h",
      "t": "Cosa non dicono i certificati"
    },
    {
      "k": "ul",
      "items": [
        "Un certificato limita l’errore nel risolvere il sistema così com’è stato assemblato. Non dimostra che il sistema rappresenti il modello: l’assemblaggio della matrice di rigidezza e dei carichi è provato nei modi sopra, ma non certificato. Quando mancava l’instabilità torsionale (SA-2026-007), il certificato certificava il problema sbagliato. Dalla 0.3.0, i certificati da capo a fondo riassemblano il sistema in modo indipendente per telai e travature reticolari e controllano il risultato rispetto al modello stesso; gusci, solidi e connettori non sono ancora coperti.",
        "Lean dimostra la matematica; che il codice Rust implementi esattamente quell’algoritmo non è dimostrato, tranne che per i verificatori che sono codice Lean.",
        "Le verifiche di progetto certificate valutano le loro formule in aritmetica degli intervalli, ma le formule stesse non sono formalizzate: sono confrontate con esempi svolti pubblicati, dove esistono, e la copertura di ciascuna norma (quali articoli, quali esempi) è nella matrice di maturità. Muratura, collegamenti, fondazioni e stati limite di esercizio non sono certificati.",
        "Nessuna verifica del programma verifica il modello. Carichi, vincoli e idealizzazione sono decisioni dell’ingegnere; la revisione del modello avvisa sugli errori più comuni, ma non sostituisce il giudizio.",
        "Non c’è ancora stata una revisione indipendente da parte di un ingegnere strutturista abilitato. I risultati secondo CIRSOC 301 sono ancora etichettati come sperimentali."
      ]
    },
    {
      "k": "h",
      "t": "L’IA redige e rivede; non calcola"
    },
    {
      "k": "p",
      "t": "L’assistente IA redige modelli a partire da una descrizione e rivede quelli esistenti, ma non calcola i risultati: i numeri vengono dal solutore e dai moduli di verifica di progetto dell’applicazione. Le sue spiegazioni sono testo di un modello linguistico e possono essere sbagliate; i valori che contano sono quelli dei risultati. Prima di applicare una modifica mostra cosa modificherà, e la si può annullare in un solo passaggio. Le funzioni IA inviano la descrizione e il modello a un server che interroga un modello linguistico; il solutore, i risultati e le verifiche non ne hanno bisogno e funzionano offline."
    },
    {
      "k": "link",
      "slug": "the-determinism-boundary",
      "t": "Perché un agente IA non dovrebbe calcolare, con un caso svolto:"
    },
    {
      "k": "h",
      "t": "Quando qualcosa non funziona"
    },
    {
      "k": "p",
      "t": "I difetti che possono aver influito su risultati già in uso sono pubblicati come bollettini di sicurezza, con il modo di riconoscere un modello interessato e cosa fare nel frattempo; gli altri difetti di sicurezza sono in fase di valutazione e vengono aggiunti quando lo giustificano. I bollettini aperti vengono chiusi quando la correzione è attiva su stabileo.com."
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "I bollettini pubblicati e il loro stato:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/TRUSTED_BASE.md",
      "label": "Base fidata dei certificati",
      "t": "Cosa è dimostrato, cosa è sottoposto a test e cosa è affidato alla fiducia, componente per componente:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/MATURITY.md",
      "label": "Matrice di maturità della verifica",
      "t": "Per ogni analisi, elemento e norma di progetto, il livello di verifica raggiunto e le prove:"
    }
  ]
};

export default body;
