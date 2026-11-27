import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Cosa calcola il software gratuito, e cosa non spiega",
  "excerpt": "Esiste software strutturale gratuito, ed è buono: modella, risolve, mostra i risultati. Quello che non abbiamo trovato è uno che si avvicini agli strumenti avanzati dal lato concettuale.",
  "blocks": [
    {
      "k": "p",
      "t": "Vale la pena partire da ciò che esiste: ce n’è molto, ed è buono. Chiunque insegni strutture oggi ha a disposizione strumenti gratuiti di prim’ordine, e diversi di essi fanno il loro lavoro meglio di quanto faccia il nostro."
    },
    {
      "k": "h",
      "t": "Cosa coprono davvero gli strumenti gratuiti"
    },
    {
      "k": "table",
      "caption": "Strumenti gratuiti di analisi strutturale, e cosa mostrano oltre al risultato.",
      "head": [
        "Strumento",
        "Gratuito",
        "Cosa fa molto bene",
        "Lato concettuale"
      ],
      "rows": [
        [
          "Ftool",
          "Sì",
          "Modellare telai piani e leggere diagrammi e linee d’influenza, con una fluidità che pochi eguagliano",
          "Mostra il comportamento, non il ragionamento che lo sta dietro"
        ],
        [
          "MASTAN2",
          "Sì (su MATLAB o sul suo runtime)",
          "Analisi matriciale lineare e non lineare, legata a McGuire, Gallagher e Ziemian",
          "La teoria sta nel libro; il programma esegue l’analisi"
        ],
        [
          "SkyCiv",
          "Piano gratuito",
          "Calcoli a mano passo dopo passo: corpi liberi, equazioni di equilibrio prima della sostituzione, distribuzione dei momenti per travi iperstatiche",
          "Numeri inseriti nelle formule, per la statica di base"
        ],
        [
          "sectionproperties",
          "Sì, open source",
          "Ingobbamento, centro di taglio e costante di Saint-Venant con gli elementi finiti",
          "Una libreria Python: restituisce numeri, senza interfaccia e senza spiegazioni"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Di quell’elenco, SkyCiv è quello che più si avvicina a quello che di solito chiamiamo “mostrare lo svolgimento”, e va detto chiaramente: i suoi calcoli a mano sono buoni. Disegna il corpo libero, scrive ΣM = 0 prima che entri qualsiasi numero e risolve con la distribuzione dei momenti quando la trave è iperstatica. Chi sostiene che nessun programma gratuito mostra i suoi passi può essere smentito con SkyCiv in circa un minuto."
    },
    {
      "k": "h",
      "t": "Mostrare i passi non basta se il programma non ti dice quando la formula smette di valere"
    },
    {
      "k": "p",
      "t": "Sostituire numeri in una formula corretta e spiegare perché quella formula è quella giusta sono cose diverse. La prima ti risparmia l’aritmetica. La seconda ti risparmia l’errore che l’aritmetica non può cogliere, perché l’errore sta un livello più in alto."
    },
    {
      "k": "p",
      "t": "I calcolatori di torsione che si trovano online illustrano il punto al contrario: scegli il tipo di sezione (piena, tubo chiuso, rettangolo) e il programma applica la formula corrispondente. Nessuno di quelli che abbiamo visto ti dice che hai scelto male, cosa avrebbe dato l’altra teoria, o da quale parte dell’errore ti trovi."
    },
    {
      "k": "quote",
      "t": "Un programma che si limita a calcolare non ti avviserà mai che stai calcolando la cosa sbagliata."
    },
    {
      "k": "h",
      "t": "Tre funzioni senza equivalente che abbiamo potuto trovare"
    },
    {
      "k": "ul",
      "items": [
        "Analisi cinematica, spiegata. Abbiamo cercato e non abbiamo trovato alcuno strumento gratuito che la faccia: ciò che salta fuori sono dispense in PDF. Il “software didattico per l’analisi cinematica” che abbiamo trovato riguarda i meccanismi delle macchine (leveraggi e manovelle), non la classificazione delle strutture.",
        "Dettaglio dell’armatura. L’unica opzione gratuita che abbiamo trovato è AutoRebar, ed è un componente aggiuntivo di AutoCAD, quindi usare la parte gratuita richiede una licenza costosa. Inoltre lavora a partire dal tuo disegno: tu disponi le barre, lui costruisce la distinta. Tutto il resto è una prova di sette giorni o software commerciale. Non abbiamo trovato alcuna opzione open source.",
        "Analisi della sezione, svolta. Qui esiste un’opzione gratuita seria, sectionproperties, e sull’ingobbamento con gli elementi finiti probabilmente ci batte. Ma è una libreria senza interfaccia: ti dà il centro di taglio senza spiegare perché si trova dove si trova."
      ]
    },
    {
      "k": "p",
      "t": "Tra gli strumenti che abbiamo esaminato, nessuno copre due delle tre, e non ne abbiamo trovato uno che affronti nemmeno una di esse dal lato concettuale. Questo è il divario che vediamo, ed è più stretto e più preciso di “siamo gli unici che insegnano”."
    },
    {
      "k": "h",
      "t": "Una schermata in cui si vede tutta la differenza"
    },
    {
      "k": "p",
      "t": "Qui sotto c’è una trave a due campate su tre appoggi. Tutti e tre impediscono solo il movimento verticale. È il caso da manuale, ed è anche quello che più spesso ho visto accettare come corretto in un esame."
    },
    {
      "k": "p",
      "t": "La formula del grado di iperstaticità dà GH = 3·m + r − 3·n − c = 3×2 + 3 − 3×3 − 0 = 0. Zero significa isostatica, e qualsiasi programma che si ferma alla formula lo riporterà esattamente così. Ma nulla trattiene la trave in orizzontale: è un meccanismo e non si può risolvere."
    },
    {
      "k": "table",
      "caption": "Cosa restituisce l’analisi cinematica su quella trave, passo dopo passo.",
      "head": [
        "Passo",
        "Cosa guarda",
        "Risultato"
      ],
      "rows": [
        [
          "2 · Iperstaticità",
          "GH = 3·m + r − 3·n − c",
          "0"
        ],
        [
          "3 · Matrice di rigidezza",
          "Modi di meccanismo rilevati",
          "1"
        ],
        [
          "3 · Matrice di rigidezza",
          "Gradi di libertà non vincolati",
          "6"
        ],
        [
          "4 · Suggerimenti",
          "Verdetto a schermo",
          "Non si può risolvere"
        ]
      ]
    },
    {
      "k": "p",
      "t": "L’app non si limita a riportare lo zero e lavarsene le mani. Lo smentisce nello stesso passo 2 che l’ha prodotto: “La formula dà GH = 0 (condizione necessaria per l’isostaticità), ma NON sufficiente”. Il passo 3 assembla la matrice di rigidezza globale 9×9 e, dopo i tre vincoli verticali, esamina la matrice ridotta 6×6, e segnala “Rilevato 1 modo di meccanismo” nonostante GH = 0 ≥ 0. Indica il nodo 3 e il suo spostamento orizzontale, fa notare che l’equazione del passo 2 conta i vincoli senza verificare dove stanno, e chiude con “✗ Meccanismo: non si può risolvere”."
    },
    {
      "k": "img",
      "base": "blog/hidden-mechanism",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base con una trave a due campate su tre carrelli orizzontali sotto 10 kN/m. Il pannello di analisi cinematica mostra GH = 3·2 + 3 − 3·3 = 0, e un messaggio dice “Struttura labile (meccanismo): nessun vincolo orizzontale in alcun appoggio”.",
      "caption": "La stessa trave nell’app: la formula dà zero, e il solutore la rifiuta comunque come meccanismo."
    },
    {
      "k": "embed",
      "query": "example=hidden-mechanism&kin=1",
      "label": "La trave su tre appoggi verticali, con il pannello di analisi cinematica aperto. Percorri i quattro passi: il secondo dà GH = 0 e il terzo trova il meccanismo che quello zero nasconde. Prova a sostituire un appoggio con una cerniera e a eseguire di nuovo: il grado diventa 1 e il meccanismo scompare."
    },
    {
      "k": "h",
      "t": "Perché un dipartimento dovrebbe interessarsene"
    },
    {
      "k": "p",
      "t": "Uno studente che impara la formula del grado e non vede mai fallire la condizione sufficiente se ne va con una regola incompleta e non lo sa. È difficile da mostrare alla lavagna, perché l’esempio che la smentisce sembra un errore di battitura. Qui sta su una sola schermata, con il numero e la contraddizione affiancati."
    },
    {
      "k": "p",
      "t": "Non c’è nulla da installare né da licenziare, e il dipartimento non deve acquistare nulla. Si apre in un browser, e il modello si condivide come link."
    },
    {
      "k": "note",
      "t": "Per essere chiari: nulla di tutto questo significa che siamo migliori. Ftool modella più in fretta e con meno attrito di noi. MASTAN2 ha dietro un libro di testo che non abbiamo scritto noi. I calcoli a mano di SkyCiv sono presentati meglio di diversi dei nostri pannelli. E sectionproperties risolve l’ingobbamento con gli elementi finiti dove noi approssimiamo. Ciò che affermiamo è più ristretto e abbastanza specifico: tra gli strumenti gratuiti che abbiamo esaminato, nessuno si avvicina agli strumenti avanzati dal lato concettuale. Se conosci uno strumento gratuito che spiega l’analisi cinematica, produce una distinta delle armature o svolge l’analisi della sezione, scrivici e correggeremo questo articolo."
    }
  ]
};

export default body;
