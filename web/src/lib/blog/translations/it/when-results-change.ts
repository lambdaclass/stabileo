import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Quando un risultato cambia: versioni dei risultati, riverifiche e bollettini",
  "excerpt": "Come Stabileo ti dice quali dei tuoi progetti riguarda una correzione, come trattiene un risultato che sa poter essere sbagliato finché la correzione non esiste, e come la correzione viene pubblicata, con le quattordici versioni dei risultati integrate il 4 e 5 novembre.",
  "blocks": [
    {
      "k": "p",
      "t": "Ogni correzione a un solutore strutturale cambia un numero che qualcuno potrebbe già aver usato. Un moltiplicatore di instabilità che era troppo alto ora è più basso; un modello che si risolveva ora viene rifiutato. Una correzione che arriva all’app in silenzio lascia il vecchio numero nei calcoli già consegnati, e l’ingegnere che li ha prodotti non ha motivo di riguardare."
    },
    {
      "k": "p",
      "t": "Questo articolo descrive cosa fa Stabileo a riguardo, dal momento in cui si trova un difetto a quello in cui la sua correzione viene pubblicata. Gli esempi sono reali: il 4 e 5 novembre 2026 quattordici versioni dei risultati, dalla 16 alla 29, sono arrivate su stabileo.com."
    },
    {
      "k": "h",
      "t": "Cos’è una versione dei risultati"
    },
    {
      "k": "p",
      "t": "Una versione dei risultati è un numero intero, distinto dalla versione dell’app. Sale di uno ogni volta che arriva sul sito una modifica che fa dare numeri diversi allo stesso modello salvato, o che rifiuta un modello che prima si risolveva. Ogni modifica di questo tipo viene registrata con:"
    },
    {
      "k": "ul",
      "items": [
        "la versione con cui è entrata, la sua data e le sue pull request;",
        "quali modelli riguarda, scritto come caratteristiche del modello: un modello piano con vincoli, un’analisi di instabilità 2D con carichi lungo le aste, un’asta in calcestruzzo verificata secondo CIRSOC 201;",
        "un titolo e una spiegazione per l’ingegnere in ciascuna delle sei lingue dell’app, con cosa ricontrollare;",
        "un link alla descrizione completa: un bollettino, una nota di modifica dei risultati o il registro delle modifiche."
      ]
    },
    {
      "k": "p",
      "t": "Ogni calcolo imprime sul progetto la versione dei risultati che lo ha prodotto, insieme alla versione dell’app, al commit, alla versione del motore, a un hash del binario del motore e alle analisi eseguite. Il timbro viaggia con il progetto: un file salvato, un salvataggio automatico, una scheda aperta o un link condiviso lo portano tutti con sé."
    },
    {
      "k": "note",
      "t": "Una versione dei risultati non viene mai riutilizzata. Ogni merge nel ramo principale viene distribuito e imprime su ciò che risolve la versione corrente, quindi una voce aggiunta a una versione già sul sito non raggiungerebbe mai i progetti che quella versione ha timbrato. Un test fallisce davanti a un’aggiunta del genere."
    },
    {
      "k": "h",
      "t": "Perché cambia una versione"
    },
    {
      "k": "p",
      "t": "La maggior parte delle modifiche sono correzioni: un risultato era sbagliato e ora è giusto. Alcune sono rifiuti: un modello che prima dava un numero ora dà invece un messaggio chiaro, perché il numero non significava nulla. E una versione può anche annullare: la versione 15 ha ritirato tre modifiche della versione 14 le cui correzioni di revisione non erano arrivate sul sito con esse, e le versioni da 27 a 29 le hanno riportate, riviste. Un progetto risolto con la versione 14 viene informato di entrambe."
    },
    {
      "k": "table",
      "caption": "Versioni dei risultati da 16 a 29, integrate il 4 e 5 novembre 2026.",
      "head": [
        "Versione",
        "Modifica",
        "Tipo"
      ],
      "rows": [
        [
          "16",
          "Alluminio: viene verificato il taglio sull’asse debole",
          "Correzione"
        ],
        [
          "17",
          "Giunti in acciaio: i momenti sull’asse debole non vengono più ignorati",
          "Rifiuto"
        ],
        [
          "18",
          "ACI 318 ed EN 1992: le aste in calcestruzzo con torsione sono segnate come non verificate",
          "Rifiuto"
        ],
        [
          "19",
          "I pilastri in c.a. sono verificati anche sotto la loro compressione minima (SA-2026-041)",
          "Correzione"
        ],
        [
          "20",
          "Generatore di carichi: un piano in parte sotto una struttura di copertura bassa mantiene i suoi carichi di area (SA-2026-033)",
          "Correzione"
        ],
        [
          "21",
          "Le figure dei gusci esportate mostrano il campo e la scala dello schermo",
          "Correzione"
        ],
        [
          "22",
          "2D: un meccanismo dietro un collegamento rigido o un diaframma viene rifiutato",
          "Rifiuto"
        ],
        [
          "23",
          "Instabilità 2D di aste il cui sforzo normale varia lungo di esse (SA-2026-042)",
          "Correzione"
        ],
        [
          "24",
          "Analisi co-rotazionale 3D con grandi rotazioni attorno a più assi (SA-2026-037)",
          "Correzione"
        ],
        [
          "25",
          "Vincoli di un modello 2D ricavato da un piano Y–Z o X–Y (SA-2026-036)",
          "Correzione"
        ],
        [
          "26",
          "Il valore che governa un’asta e l’inviluppo 2D leggono il picco reale",
          "Correzione"
        ],
        [
          "27–29",
          "Tre modifiche del Base ritirate dalla versione 15 tornano, riviste: collasso plastico, P-Δ e segno delle linee d’influenza del momento",
          "Correzione"
        ]
      ]
    },
    {
      "k": "h",
      "t": "L’avviso di ricontrollo"
    },
    {
      "k": "p",
      "t": "Quando si apre un progetto, l’app confronta il suo timbro con il registro ed elenca le modifiche fatte da allora che riguardano quel modello. Un telaio piano con un’analisi di instabilità viene informato della correzione dell’instabilità 2D; un telaio in acciaio senza calcestruzzo non viene informato della verifica dei pilastri in c.a. L’elenco non è un avviso che scompare: l’avviso non ha un pulsante di chiusura, ignora Esc e i clic fuori da esso, e si chiude solo spuntando “Ho letto queste modifiche” e scegliendo di continuare o di ricalcolare."
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base che apre un telaio piano dagli esempi, salvato come risolto con la versione dei risultati 15. Una finestra intitolata “I risultati sono cambiati dall’ultima volta che questo progetto è stato calcolato” elenca le modifiche che lo riguardano, tra cui la correzione dell’instabilità 2D per aste con sforzo normale variabile e il valore che governa letto al picco reale, ciascuna con la sua spiegazione, e chiede di spuntare “Ho letto queste modifiche” prima di continuare o di rieseguire l’analisi.",
      "caption": "Un telaio piano risolto con la versione 15, aperto oggi: sono elencate solo le modifiche che riguardano questo modello, ciascuna con cosa ricontrollare."
    },
    {
      "k": "p",
      "t": "Finché il modello non viene risolto di nuovo, i suoi risultati sono segnati come obsoleti: un banner lo dice, e ogni relazione, cartella di lavoro e CSV esportati nel frattempo stampa un avviso di risultati OBSOLETI nella sua provenienza. “Ripeti analisi e progetto” risolve di nuovo e, in PRO, riverifica le aste in calcestruzzo con l’armatura già scelta; non le riprogetta, perché sovrascriverebbe le barre dell’ingegnere."
    },
    {
      "k": "p",
      "t": "Dal 4 novembre (#1406) l’avviso spiega ogni modifica nella lingua del lettore in tutte e sei le lingue dell’app. Prima, chi leggeva in tedesco, francese e turco riceveva titolo e spiegazione in inglese: 66 delle 72 modifiche registrate non avevano testo in quelle lingue. Ogni traduzione è stata verificata ritraducendola in inglese senza l’originale e confrontando il significato: numeri, segni, quale carico, quale verifica, lato sicuro o non sicuro. Quel controllo ha corretto frasi in tutte e tre le lingue, e ha mostrato che quattro spiegazioni in inglese erano ambigue all’origine; sono state corrette in tutte e sei le lingue."
    },
    {
      "k": "h",
      "t": "Prima della correzione: avvisare o rifiutare"
    },
    {
      "k": "p",
      "t": "Un difetto di solito si trova prima di correggerlo, a volte giorni prima. In quel tempo il risultato che colpisce è ancora a schermo. La regola che seguiamo è contenerlo prima e correggerlo poi (issue #447): ogni difetto aperto che può dare un risultato errato riceve, a ogni punto d’ingresso che colpisce, un avviso o un rifiuto."
    },
    {
      "k": "ul",
      "items": [
        "Un avviso mantiene il risultato e mostra, accanto, quale problema noto può riguardarlo e cosa controllare a mano.",
        "Un rifiuto non mostra il risultato e dice perché, quando il numero può essere sbagliato di un fattore grande senza modo di accorgersene dall’output, come un fattore che cambia più volte con la numerazione delle aste."
      ]
    },
    {
      "k": "img",
      "base": "blog/results-refusal",
      "w": 1600,
      "h": 1000,
      "alt": "Stabileo Base con l’esempio del meccanismo nascosto: una trave a due campate su tre vincoli che scorrono tutti in orizzontale, sotto un carico uniforme di 10 kN/m. Dopo Calcola non viene disegnato alcun diagramma; un messaggio rosso nell’angolo dice “Struttura instabile (meccanismo): nessun vincolo orizzontale in alcun appoggio.” con un pulsante per vedere l’analisi cinematica.",
      "caption": "La stessa regola fuori dal registro: un modello che è un meccanismo riceve un messaggio che dice perché, e nessun numero."
    },
    {
      "k": "p",
      "t": "Il contenimento è tenuto in un registro che elenca ogni problema di sicurezza aperto, il suo avviso o rifiuto, la condizione che lo fa scattare e il test che mostra che scatta, oppure la prova che non serve alcun contenimento. Un test mantiene d’accordo il registro e l’elenco dei problemi noti del motore, e un’attività pianificata confronta il registro con le issue aperte su GitHub. Le condizioni sono strette di proposito: sui 39 modelli del corpus dei risultati, ogni avviso scatta al massimo su due. La pull request che completa questo registro per ogni issue aperta (#807) è arrivata il 5 novembre, prima del rilascio 0.5.0."
    },
    {
      "k": "p",
      "t": "Un contenimento finisce quando arriva la sua correzione, e finisce nella stessa pull request. Questa settimana #1295 ha rimosso il rifiuto dei tagli da 3D a 2D che inflettevano le aste attorno all’asse sbagliato, perché ora il taglio è corretto; #1301 ha sostituito un avviso su ogni calcolo co-rotazionale 3D con uno che scatta solo quando l’estremo di un’asta ruota più di 0,02 rad rispetto alla sua corda, dove l’approssimazione residua può contare."
    },
    {
      "k": "h",
      "t": "Le correzioni di questa settimana"
    },
    {
      "k": "p",
      "t": "Instabilità 2D con carichi assiali lungo le aste (#1324, versione 23). La rigidezza geometrica di ogni asta usava il suo sforzo normale medio. Dove la compressione cresce verso l’estremo che ruota di più, come sotto la gravità su un puntone o con un carico assiale concentrato dentro la luce, il fattore di instabilità risultava troppo alto e nulla avvertiva. Ora ogni asta integra il suo sforzo normale variabile."
    },
    {
      "k": "table",
      "caption": "Un’asta, λP·L²/EI. Fonte: SA-2026-042.",
      "head": [
        "Caso",
        "Esatto",
        "Prima",
        "Ora"
      ],
      "rows": [
        [
          "Mensola, compressione che sale da 0 al vincolo a P all’estremità",
          "3.477",
          "4.972 (+43 %)",
          "3.542 (+1.9 %)"
        ],
        [
          "Mensola, spinta P all’estremità e un carico assiale opposto P a metà luce: compressione P solo da metà luce all’estremità",
          "2.961",
          "4.972 (+68 %)",
          "3.056 (+3.2 %)"
        ],
        [
          "Pilastro pesante di Eulero, compressione massima al vincolo",
          "7.837",
          "4.972 (−37 %)",
          "7.889 (+0.7 %)"
        ]
      ]
    },
    {
      "k": "p",
      "t": "Il restante pochi per cento è il normale errore di discretizzazione di un elemento per asta, e cala man mano che l’asta viene divisa. P-Delta usa ancora lo sforzo normale medio, e l’instabilità 3D con carichi lungo le aste mantiene il suo avviso fino alla propria correzione."
    },
    {
      "k": "p",
      "t": "Analisi co-rotazionale 3D (#1301, versione 24). Le rotazioni di estremità delle aste venivano sottratte come vettori di rotazione, il che è esatto solo quando tutte le rotazioni hanno lo stesso asse. La curva di 45° di Bathe–Bolourchi risultava con un errore dell’1,3 % rispetto alla sua soluzione pubblicata, e raffinare la mesh la allontanava dai riferimenti anziché avvicinarla. Ora le rotazioni sono composte come matrici di rotazione: la stessa curva è entro lo 0,4 % di due soluzioni pubblicate indipendenti e converge tra l’una e l’altra. Un’asta i cui estremi ruotano di più di 0,9π l’uno rispetto all’altro viene rifiutata, perché il risultato non può dire quale giro completo si intenda."
    },
    {
      "k": "p",
      "t": "Un meccanismo nascosto in 2D (#1298, versione 22). Un collegamento rigido o un diaframma da un nodo le cui aste sono tutte incernierate all’estremo di un’asta reticolare è un meccanismo, ma il solutore lo teneva con una piccolissima molla artificiale e restituiva spostamenti di centinaia di chilometri, che il certificato poi certificava. Un modello del genere ora viene rifiutato. La correzione non ha proposto alcun bollettino per questo caso: nei casi trovati gli spostamenti erano assurdi, intorno a 10⁵ m, e arrivavano con l’avviso dell’app di un probabile meccanismo. È un giudizio su quei casi, non la prova che nessun risultato interessato sembrasse plausibile. A essere sbagliata era l’affermazione del certificato, e la voce di versione informa i progetti che riguarda. Un caso simile attraverso un connettore anziché un collegamento rigido è stato trovato dopo (#1414); la sua correzione (#1415) è arrivata il 5 novembre."
    },
    {
      "k": "p",
      "t": "Tagliare un modello 3D in 2D (#1295). Il taglio usava l’inerzia sull’asse forte di ogni sezione per ogni asta, quindi pilastri in un taglio Y–Z, travi in un taglio X–Y e aste ruotate di 90° si inflettevano attorno all’asse sbagliato: un portale IPN 300 in Y–Z oscillava di 0,96 mm in 2D contro 13,0 mm in 3D. Ora ogni asta si inflette in 2D attorno all’asse attorno a cui si inflette in 3D, e i tagli che un modello piano non può rappresentare vengono rifiutati. Questa correzione non ha una versione dei risultati, ed è voluto: un modello 2D salvato si risolve esattamente come prima, perché a essere sbagliato era il modello prodotto dal taglio. L’avviso di ricontrollo non può raggiungere quei file, quindi il bollettino (SA-2026-035) è il canale: ritaglia il modello da 3D, oppure risolvilo in 3D."
    },
    {
      "k": "h",
      "t": "Dopo la correzione: i bollettini"
    },
    {
      "k": "p",
      "t": "Un difetto che potrebbe aver prodotto un risultato errato o non a favore di sicurezza in una versione rilasciata riceve un bollettino di sicurezza: cosa non andava, quali modelli riguarda, come riconoscerli, cosa ricontrollare nei risultati già consegnati e il caso che lo riproduce. I bollettini per le correzioni di questa settimana sono stati redatti ora nel repository e vengono pubblicati con il rilascio 0.5.0, come SA-2026-001 a 024 lo sono stati con 0.3.0 e 0.4.0."
    },
    {
      "k": "table",
      "caption": "Bollettini redatti per le correzioni integrate il 4 e 5 novembre 2026.",
      "head": [
        "Bollettino",
        "Cosa non andava",
        "Gravità"
      ],
      "rows": [
        [
          "SA-2026-033",
          "Il generatore di carichi lasciava fuori i carichi di area di un piano quando un’asta bassa si trovava sopra una sua parte",
          "Alta"
        ],
        [
          "SA-2026-034",
          "La verifica di equilibrio tornava per casi in cui la verifica lasciava fuori dei carichi",
          "Media"
        ],
        [
          "SA-2026-035",
          "Il taglio da 3D a 2D inflette le aste attorno all’asse di sezione sbagliato",
          "Alta"
        ],
        [
          "SA-2026-036",
          "Il taglio da 3D a 2D su Y–Z o X–Y leggeva i vincoli come se il telaio fosse in X–Z",
          "Alta"
        ],
        [
          "SA-2026-037",
          "L’analisi co-rotazionale 3D sottraeva i vettori di rotazione",
          "Media"
        ],
        [
          "SA-2026-040",
          "Le verifiche ACI 318 ed EN 1992 facevano passare aste in calcestruzzo senza verificarne la torsione",
          "Alta"
        ],
        [
          "SA-2026-041",
          "La verifica dei pilastri in c.a. abbinava il momento maggiore solo alla compressione maggiore",
          "Alta"
        ],
        [
          "SA-2026-042",
          "L’instabilità 2D sovrastimava il fattore delle aste la cui compressione cresce lungo di esse",
          "Alta"
        ]
      ]
    },
    {
      "k": "img",
      "base": "blog/results-changelog",
      "w": 1600,
      "h": 1000,
      "alt": "La pagina del registro delle modifiche di Stabileo sul sito: la voce più recente per prima, del 6 novembre, intitolata “Risultati errati corretti nelle verifiche di progetto e nella dinamica, carichi generati corretti e modalità di analisi di PRO completata”, che si apre con le modifiche al motore, con filtri per area a sinistra.",
      "caption": "La pagina del registro delle modifiche, dalla più recente, che si apre con le correzioni di questa settimana che cambiano i risultati."
    },
    {
      "k": "h",
      "t": "Cosa questo non fa"
    },
    {
      "k": "ul",
      "items": [
        "L’avviso conosce solo le modifiche registrate. Un difetto non ancora trovato non è in alcun registro; per questo serve la verifica che sta dietro il solutore, e questo è ciò che copre il contenimento una volta trovato qualcosa.",
        "Legge le caratteristiche del modello dal file salvato e, quando non riesce a capirlo, conta la caratteristica come presente: un avviso di troppo è meglio di una modifica nascosta al modello che riguarda.",
        "Non può seguire un numero una volta che esce dall’app, in un disegno, un foglio di calcolo o una relazione già consegnati. Per questo serve il bollettino.",
        "Contenuto, rifiutato o corretto, il risultato resta all’ingegnere da controllare prima di firmarlo."
      ]
    },
    {
      "k": "link",
      "slug": "safety-advisories",
      "t": "Ogni bollettino pubblicato, con cosa ricontrollare per ciascuno:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/testing/docs/PROVENANCE.md",
      "label": "Richiesta di ricontrollo, provenienza e riproducibilità",
      "t": "Come funzionano nel dettaglio versioni dei risultati, timbri e avviso:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Indice dei bollettini di sicurezza",
      "t": "I bollettini, comprese le bozze per la 0.5.0:"
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/issues/447",
      "label": "Issue #447: prima contenere, poi correggere",
      "t": "La politica di contenimento e i suoi progressi:"
    }
  ]
};

export default body;
