import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Il confine del determinismo: perché un agente AI non deve fare i calcoli",
  "excerpt": "Un modello linguistico non può garantire che un numero sia giusto. Nell’architettura che proponiamo per l’ingegneria strutturale, l’agente interpreta e propone, e ogni numero proviene da un solutore verificato.",
  "blocks": [
    {
      "k": "p",
      "t": "Decenni di software commerciale hanno reso veloce la parte puramente numerica dell’analisi strutturale. Assemblare una matrice di rigidezza e risolvere un sistema lineare è un problema ben compreso e poco costoso da calcolare. Il tempo dell’ingegnere se ne va altrove: costruire il modello, ricostruirlo ogni volta che cambia l’architettura, definire carichi e combinazioni, verificare ogni elemento rispetto alla norma di progetto e produrre la relazione di calcolo e i disegni."
    },
    {
      "k": "p",
      "t": "Il collo di bottiglia è quel lavoro manuale attorno al calcolo. Costruire, modificare, verificare e documentare il modello è dove un agente AI può aiutare, a una condizione: non deve mai toccare il calcolo stesso."
    },
    {
      "k": "h",
      "t": "Cosa un modello linguistico non può garantire"
    },
    {
      "k": "p",
      "t": "Un modello linguistico genera testo in modo probabilistico. Non conosce la fisica né il comportamento dei sistemi reali, e può avere allucinazioni: produrre risposte che suonano plausibili e non hanno senso. Nell’analisi strutturale il rischio è concreto. La modellazione richiede ragionamento spaziale e coerenza topologica, e quando un modello si costruisce in più passi, gli errori si accumulano."
    },
    {
      "k": "p",
      "t": "Il vincolo più forte, però, viene dalla pratica professionale. Ogni risultato strutturale è firmato, con la paternità e la responsabilità legale che una firma comporta. Il numero che dimensiona un pilastro è un impegno dell’ingegnere abilitato che lo firma. Un agente che consegna risultati non verificati lascia al professionista il rischio di firmare un calcolo che nessuno ha verificato."
    },
    {
      "k": "quote",
      "t": "La correttezza deve essere una proprietà del solutore, non del linguaggio."
    },
    {
      "k": "h",
      "t": "Il confine del determinismo"
    },
    {
      "k": "p",
      "t": "L’architettura separa il ragionamento in linguaggio naturale dal calcolo numerico. L’agente propone progetti e scenari, ma un risultato conta solo quando è uscito da un programma che l’agente non può modificare, uno che codifica la fisica del problema. Il modello sceglie quale strumento deterministico chiamare e con quali parametri, e lavora con ciò che lo strumento restituisce. Non produce mai un numero proprio e non inventa mai la geometria."
    },
    {
      "k": "p",
      "t": "In pratica servono tre livelli. Il livello dell’intento è l’agente: interpreta il linguaggio naturale, pone domande di chiarimento ed emette azioni tipizzate. Il livello del calcolo deterministico contiene tutto ciò che produce dati ingegneristici: il solutore, i moduli CIRSOC che eseguono le verifiche normative e i generatori che espandono una tipologia strutturale in un modello completo. Il livello della documentazione produce relazioni, disegni e computi dei quantitativi a partire da risultati già calcolati."
    },
    {
      "k": "p",
      "t": "Non è un modello nuovo. Domina la letteratura recente sugli agenti per l’ingegneria e compare in campi vicini: gli agenti di programmazione funzionano perché un compilatore e una suite di test dicono loro se il codice compila e passa, e AlphaProof dimostra teoremi perché un verificatore formale non lascia passare alcun errore. Lo adottiamo deliberatamente come principio di progetto."
    },
    {
      "k": "h",
      "t": "Cosa garantisce il confine e cosa resta fuori"
    },
    {
      "k": "p",
      "t": "Conviene essere precisi su cosa garantisce questo confine e cosa lascia fuori. Cosa garantisce:"
    },
    {
      "k": "ul",
      "items": [
        "Ogni numero che l’agente afferma è riconducibile a un risultato specifico del solutore: combinazione, stazione, elemento.",
        "Ogni output dell’AI è validato rispetto allo schema del modello prima di essere importato, e rifiutato se è malformato o contiene campi sconosciuti.",
        "Se il servizio AI non è disponibile, il solutore, l’editor e le verifiche normative continuano a funzionare."
      ]
    },
    {
      "k": "p",
      "t": "Cosa non garantisce: che il modello idealizzato sia quello giusto per il problema reale (è una decisione ingegneristica), che il progetto sia ottimale, che i carichi e le ipotesi siano completi, o che la lettura della norma non richieda revisione."
    },
    {
      "k": "note",
      "t": "Il confine permette di controllare da dove viene ogni risultato; non garantisce che il modello che hai impostato rappresenti correttamente il problema reale. L’agente lavora come un assistente di disegno: propone una modifica, l’utente vede un riepilogo di ciò che verrà modificato e può applicarla, riprovare o annullare. Ogni modifica applicata è un unico passo di annullamento."
    },
    {
      "k": "h",
      "t": "Un caso in cui il modello va risolto di nuovo"
    },
    {
      "k": "p",
      "t": "L’ingegnere descrive un portale in calcestruzzo armato con una luce di 6 m e un’altezza di 4 m, basi incastrate e un carico distribuito sulla trave. L’agente chiede ciò che manca: acciaio o calcestruzzo? Basi incastrate o incernierate? Qualche carico laterale? Poi emette l’azione che crea il telaio. Il backend lo espande in modo deterministico in un modello con 4 nodi, 3 elementi e 6 gradi di libertà liberi. Il progetto usa calcestruzzo H-21, una trave di 25×40 cm per cominciare, pilastri di 30×30 cm e 30 kN/m sulla trave."
    },
    {
      "k": "p",
      "t": "Una volta risolto il modello, ogni pilastro porta una reazione verticale di 90 kN e l’equilibrio globale è esatto: ΣRz = 180 kN = q·L. Il momento governante nella trave è Mu = 80,8 kN·m a metà campata. La verifica a flessione CIRSOC 201 della trave 25×40 con 3Ø16 dà una capacità di φMn = 73,3 kN·m, quindi la trave non supera la verifica."
    },
    {
      "k": "img",
      "base": "blog/determinism-portal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base con un portale in calcestruzzo, largo 6 m e alto 4 m su basi incastrate, risolto con 30 kN/m sulla trave. Il diagramma del momento flettente indica 80,8 kN·m a metà campata, −54,2 kN·m agli estremi della trave e 27,0 kN·m alle basi dei pilastri.",
      "caption": "Il telaio di questa sezione in Stabileo (H-21, pilastri 30×30, trave 25×40): il solutore dà il momento di 80,8 kN·m a metà campata citato sopra."
    },
    {
      "k": "table",
      "caption": "Verifica a flessione della trave del telaio, prima e dopo la correzione.",
      "head": [
        "Stato",
        "Sezione",
        "Armatura",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Verificata"
      ],
      "rows": [
        [
          "Iniziale",
          "25×40 cm",
          "3Ø16",
          "80.8",
          "73.3",
          "1.10",
          "No"
        ],
        [
          "Corretta",
          "30×55 cm",
          "3Ø16",
          "105.6",
          "108.6",
          "0.97",
          "Sì"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Guarda la colonna Mu. Ingrandire la trave da 25×40 a 30×55 fa salire la sollecitazione da 80,8 a 105,6 kN·m. Per questa trave simmetricamente caricata la statica fissa la differenza con segno: M_mezzeria − M_estremità = 80,8 − (−54,2) = qL²/8 = 135 kN·m. La rigidezza cambia i singoli momenti. Una trave più rigida rispetto ai suoi pilastri riceve da questi un vincolo di estremità minore e si comporta più come una trave appoggiata, quindi il suo momento in mezzeria, che qui governa, aumenta."
    },
    {
      "k": "quote",
      "t": "Un agente che stimasse l’effetto senza ricalcolare sbaglierebbe, e suonerebbe altrettanto convincente mentre lo fa."
    },
    {
      "k": "p",
      "t": "L’esempio mostra perché il modello va risolto di nuovo, oltre a ricalcolare la capacità della nuova sezione. In una struttura iperstatica, ingrandire una sezione cambia come si distribuiscono le sollecitazioni interne, e la sollecitazione può salire proprio nell’asta che volevi alleggerire."
    },
    {
      "k": "h",
      "t": "Togliere un pilastro da un edificio già progettato"
    },
    {
      "k": "p",
      "t": "Il secondo caso parte da un telaio con quattro campate da 5 m e tre piani da 3 m, basi incastrate, travi 25×50 cm (4Φ16), pilastri 35×35 cm e 25 kN/m su ogni trave: 20 nodi, 27 elementi e 45 gradi di libertà liberi. Risolto e verificato, ogni trave supera la verifica con ampio margine."
    },
    {
      "k": "p",
      "t": "Una modifica architettonica elimina un pilastro interno del piano terra. L’azione di modifica lo cancella con una validazione di integrità strutturale, e il modello viene risolto di nuovo; l’equilibrio globale vale prima e dopo (ΣRz = 1500 kN). Le travi che poggiavano su quel pilastro ora hanno una luce di 10 m e, insieme alle travi allineate sopra, raccolgono il vincolo perso. Sei travi superano D/C = 1."
    },
    {
      "k": "table",
      "caption": "La trave governante dell’edificio nei suoi tre stati.",
      "head": [
        "Stato",
        "Sezione",
        "Mu [kN·m]",
        "φMn [kN·m]",
        "D/C",
        "Verificata"
      ],
      "rows": [
        [
          "Intatto",
          "25×50 (4Φ16)",
          "54.2",
          "125.3",
          "0.43",
          "Sì"
        ],
        [
          "Pilastro eliminato",
          "25×50 (4Φ16)",
          "203.9",
          "125.3",
          "1.63",
          "No"
        ],
        [
          "Ridimensionata",
          "30×65 (5Φ20)",
          "189.8",
          "313.7",
          "0.61",
          "Sì"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Il momento della trave governante quasi quadruplica. Con 30×65 cm e 5Φ20 nelle travi interessate e un nuovo calcolo, ogni trave torna a verificare. Il caso mostra anche che una modifica che a mano significa rimodellare, rianalizzare, riverificare e ridettagliare molte aste può essere gestita in una breve conversazione, con ogni numero riconducibile al solutore e soggetto all’approvazione dell’ingegnere."
    },
    {
      "k": "h",
      "t": "Quattro decisioni di progetto dietro il confine"
    },
    {
      "k": "ol",
      "items": [
        "Azioni tipizzate invece di generazione di codice libero. In diversi sistemi precedenti, il modello scrive script Python che vengono poi eseguiti su un solutore esterno. Qui l’output dell’agente è limitato a un insieme chiuso di chiamate con contratti espliciti di ingresso e uscita, ciascuna validata rispetto a uno schema prima di essere eseguita. Quel confine è più stretto del codice arbitrario e più facile da verificare.",
        "Un solutore nostro, invece di uno strato sopra quello di qualcun altro. Il motore è scritto da zero in Rust, senza dipendenze esterne di algebra lineare, e ha una propria suite di verifica rispetto a soluzioni analitiche e benchmark di riferimento: circa 6.800 test superati, più confronti con un programma commerciale sugli stessi modelli, con differenze inferiori allo 0,1%.",
        "Conformità nativa alle norme di progetto. Verifiche secondo CIRSOC 201 e 301, che non abbiamo trovato implementate in modo nativo in alcun software open source. Il modulo per il calcestruzzo è implementato e testato; il modulo per l’acciaio vive ancora solo nel frontend e non ha una suite di test dedicata. Lo diciamo per non sopravvalutarne la maturità.",
        "Funziona nel browser. Il motore si compila in WebAssembly e gira in locale sulla macchina dell’utente, senza server di calcolo e senza nulla da installare."
      ]
    },
    {
      "k": "note",
      "t": "Aggiornamento, 20 ottobre 2026: dalla versione 0.2.0 il motore ricontrolla ogni verifica CIRSOC 301 sull’acciaio (un risultato che non conferma viene mostrato come non superato o come non verificato), e il modulo è testato rispetto a esempi svolti pubblicati; restano etichettati come sperimentali fino a una revisione indipendente. Le cifre di questo articolo sono quelle del paper pubblicato, calcolate con la versione di agosto 2026, prima delle correzioni 0.2.0 alle verifiche del calcestruzzo (bollettino SA-2026-002); sono citate come compaiono lì."
    },
    {
      "k": "h",
      "t": "Da un solutore testato a uno dimostrato"
    },
    {
      "k": "p",
      "t": "Il confine garantisce che ogni affermazione dell’agente sia riconducibile a un output del solutore. Quella garanzia eredita un limite: il solutore è affidabile perché è testato in modo estensivo, ma la sua correttezza non è stata dimostrata formalmente. Una suite di test, per quanto accurata, copre solo i casi a cui hanno pensato i suoi autori."
    },
    {
      "k": "p",
      "t": "Questo conta ancora di più in questo contesto. Un agente costruisce modelli, li modifica in più passi e legge i risultati per proporre nuove azioni; lungo il percorso il solutore riceve ingressi che nessun ingegnere ha rivisto prima che arrivassero al motore. Se il motore si comporta male in un caso limite (una matrice di rigidezza quasi singolare, geometria degenere, una combinazione di carico estrema), l’agente può citare quel risultato senza alcun avviso."
    },
    {
      "k": "p",
      "t": "Due tecniche possono ridurre quel divario. Il fuzzing basato sulle proprietà genera migliaia di modelli casuali validi e controlla invarianti che devono valere per qualsiasi ingresso:"
    },
    {
      "k": "ul",
      "items": [
        "Equilibrio globale: ΣR = P, indipendentemente da geometria, materiali o vincoli.",
        "Simmetria della matrice di rigidezza: K = Kᵀ per costruzione.",
        "La matrice di rigidezza elastica lineare, ridotta ai gradi di libertà liberi di una struttura stabile e correttamente vincolata, è definita positiva.",
        "Invarianza per trasformazioni di corpo rigido: traslare o ruotare un modello non cambia le sollecitazioni interne."
      ]
    },
    {
      "k": "p",
      "t": "La verifica formale affronta lo stesso divario dall’altro lato: scrivere una specifica matematica di quelle proprietà e dimostrare, con un assistente di dimostrazione come Lean 4, che l’implementazione la soddisfa. Il testing può trovare errori; la verifica formale può mostrare che sono assenti nel dominio specificato. Le due cose si completano: quando il fuzzer trova un ingresso che viola una proprietà, quella proprietà diventa un candidato per una dimostrazione."
    },
    {
      "k": "note",
      "t": "L’obiettivo è un solutore il cui nucleo numerico critico sia verificato formalmente. A quel punto il confine del determinismo diventerebbe una garanzia matematica: ogni numero citato in una relazione di calcolo risalirebbe a un calcolo dimostrato corretto."
    },
    {
      "k": "h",
      "t": "A che punto siamo oggi"
    },
    {
      "k": "p",
      "t": "Per chiudere, cosa c’è e cosa no. Il solutore, l’editor, le verifiche CIRSOC, la modalità didattica e la generazione di relazioni e disegni funzionano oggi nel browser su stabileo.com, senza nulla da installare e senza bisogno di un account. Il livello dell’agente è in sviluppo attivo: le sue rotte girano in sviluppo e nei test sul nostro backend, con lo stesso solutore e gli stessi numeri di tutto il resto, ma quel backend non fa ancora parte del sito pubblico."
    },
    {
      "k": "p",
      "t": "Il ciclo chiuso con il solutore nel circuito, in cui l’agente propone, risolve, valuta e modifica senza intervento umano, è nella roadmap e non è stato implementato. La copertura nativa delle norme di progetto è limitata a CIRSOC 201 e 301; il resto è lavoro futuro."
    },
    {
      "k": "p",
      "t": "Il CAD ha preso in carico la parte meccanica del disegno e il foglio di calcolo l’aritmetica ripetitiva, mentre il giudizio ingegneristico è rimasto all’ingegnere. L’agente è il passo successivo lungo quella linea: si occupa di costruire e modificare il modello, inserire i carichi, eseguire le verifiche e preparare la documentazione. Nulla di tutto questo trasferisce la responsabilità: il numero firmato resta quello dell’ingegnere."
    },
    {
      "k": "note",
      "t": "Questo testo è adattato da \"Desarrollo de un agente estructural de cálculo sobre un solver verificado\" (Chesta, Bertero, Carrone e Kingston), presentato alle JAIE 2026. Le cifre citate sono output del solutore di Stabileo e del suo modulo CIRSOC 201, tratte da quel paper."
    }
  ]
};

export default body;
