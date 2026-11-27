import type { PostBody } from '../../types';

const body: PostBody = {
  "title": "Stabileo 0.6.0: ricalcola i progetti interessati",
  "excerpt": "Ricalcola le analisi interessate e rivedi i risultati che hai già usato. Da SA-2026-048 a SA-2026-063 spiegano cosa controllare; SA-2026-056 resta non corretto.",
  "blocks": [
    {
      "k": "p",
      "t": "Riesegui i casi di carico, le combinazioni e le storie non lineari o per fasi complete interessati. Confronta spostamenti, sollecitazioni delle aste, reazioni vincolari e sollecitazioni di progetto con i risultati già usati. Rivedi i calcoli consegnati e i dimensionamenti basati su di essi. Segui ogni bollettino per i dati interessati e l’azione richiesta all’utente. Un rifiuto o una grandezza non disponibile non fornisce alcuna risposta sostitutiva: non equivale a sollecitazione nulla né a una verifica soddisfatta."
    },
    {
      "k": "note",
      "t": "I bollettini da SA-2026-048 a SA-2026-063 sono stati aggiunti dopo la v0.5.0. Le correzioni qui sotto sono incluse nella 0.6.0, tranne SA-2026-056, che resta non corretto. Ricontrolla le funzioni elencate qui anche se l’analisi precedente era convergente o i suoi spostamenti sembravano plausibili."
    },
    {
      "k": "h",
      "t": "Bollettini di sicurezza"
    },
    {
      "k": "table",
      "caption": "Bollettini di sicurezza da SA-2026-048 a SA-2026-063",
      "head": [
        "Bollettino",
        "Gravità",
        "Cosa è cambiato e cosa fare"
      ],
      "rows": [
        [
          "SA-2026-048",
          "Alta",
          "Il CIRSOC 301 ometteva i momenti di estremità da Mmax per qualsiasi sezione con un tratto non controventato accorciato; profilati a C e a T a doppia curvatura potevano inoltre perdere un cambio di segno. Ricontrolla tutte le aste CIRSOC 301 con una Lb dichiarata più corta dell’asta, comprese le verifiche dell’acciaio e le proposte dell’ottimizzatore."
        ],
        [
          "SA-2026-049",
          "Alta",
          "Un vincolo rigido più una molla poteva diventare un vincolo elastico in 3D. Scegli esplicitamente la condizione al contorno voluta e riesegui le analisi interessate."
        ],
        [
          "SA-2026-050",
          "Media",
          "Una snellezza non calcolabile poteva diventare zero e i risultati multicaso potevano contenere numeri non finiti. Scarta quei valori, rivedi i dati e riesegui."
        ],
        [
          "SA-2026-051",
          "Alta",
          "I carichi mobili 3D perdevano i picchi interni e la componente assiale del peso degli assi. Riesegui gli inviluppi e rivedi il dimensionamento delle aste e le sollecitazioni di progetto."
        ],
        [
          "SA-2026-052",
          "Alta",
          "Gli inviluppi assiali dei carichi mobili 2D/3D perdevano i limiti dei carichi distribuiti. Riesegui e controlla gli estremi assiali interni; ridurre soltanto il passo del convoglio non basta."
        ],
        [
          "SA-2026-053",
          "Bassa",
          "Gli inviluppi dei carichi mobili includevano limiti esterni delle sollecitazioni per i carichi alle estremità delle aste. Riesegui gli inviluppi assiali/di taglio e rivedi il dimensionamento, mantenendo le reazioni vincolari nei controlli di equilibrio."
        ],
        [
          "SA-2026-054",
          "Alta",
          "Le soluzioni lineari potevano restituire risposte con rigidezza non risolta o perdere una componente di carico. Riesegui i casi statici e le combinazioni; verifica in modo indipendente le sollecitazioni quando il solutore corretto rifiuta."
        ],
        [
          "SA-2026-055",
          "Alta",
          "Il P-Delta sottostimava l’amplificazione sotto carichi assiali di campata. Riesegui le analisi interessate e le verifiche derivate, verifica la convergenza della mesh e rivaluta la stabilità."
        ],
        [
          "SA-2026-056",
          "Alta",
          "Non corretto: la dinamica di modelli misti telaio/guscio vincolati cambia con descrizioni equivalenti del modello. Verifica in modo indipendente le sollecitazioni dinamiche delle aste e le reazioni degli appoggi interessati prima di usarle; non è stabilito alcun coefficiente correttivo a favore di sicurezza."
        ],
        [
          "SA-2026-057",
          "Media",
          "Le visualizzazioni plastiche potevano indicare come interno al suo intervallo un moltiplicatore esterno. Riesegui i certificati e confronta gli estremi esatti. Un rifiuto per risorse non dimostra che non esista alcun meccanismo."
        ],
        [
          "SA-2026-058",
          "Alta",
          "I modelli armonici grandi mantenevano risposte imprecise dei modi omessi. Riesegui le scansioni e rivedi ampiezza, fase e picchi, comprese le frequenze fuori dall’avviso di troncamento."
        ],
        [
          "SA-2026-059",
          "Alta",
          "Le analisi web avanzate davano ai cavi resistenza a compressione. Usa il solutore dedicato ai cavi supportato o un’analisi indipendente; i flussi avanzati con cavi ora rifiutano esplicitamente."
        ],
        [
          "SA-2026-060",
          "Alta",
          "La rigidezza rotazionale artificiale nelle analisi per fasi cambiava traslazioni e azioni sulle aste. Riesegui le storie per fasi complete con svincoli o molle di vincolo e rivedi le sollecitazioni di progetto derivate."
        ],
        [
          "SA-2026-061",
          "Alta",
          "Le reazioni vincolari di percorso venivano omesse o recuperate a un carico sbagliato; le sollecitazioni per fasi e dinamiche potevano mancare. Riesegui e rivedi le sollecitazioni di vincoli, collegamenti e fondazioni. Le sollecitazioni non disponibili non sono zero; le reazioni dinamiche totali restano non disponibili."
        ],
        [
          "SA-2026-062",
          "Alta",
          "Un rifiuto elastico iniziale poteva diventare un moltiplicatore di collasso plastico 3D grezzo nullo e riuscito. Riesegui le analisi plastiche interessate; un rifiuto numerico non è prova di collasso a carico zero."
        ],
        [
          "SA-2026-063",
          "Alta",
          "I vincoli interni scartavano il moto imposto del nodo master vincolato. Riesegui le storie complete e rivedi spostamenti, sollecitazioni delle aste e reazioni vincolari insieme a SA-2026-061. Il moto dei vincoli non supportato nei flussi con cavi/time-history ora viene rifiutato."
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/advisories/README.md",
      "label": "Indice dei bollettini di sicurezza",
      "t": "Leggi ogni bollettino applicabile per i suoi dati interessati e l’azione richiesta:"
    },
    {
      "k": "h",
      "t": "Altre modifiche che influiscono sulle risposte"
    },
    {
      "k": "p",
      "t": "Il registro dei risultati termina alla versione 49 nella 0.5.0 e arriva a 78 nella 0.6.0. La tabella seleziona altre modifiche da rivedere insieme ai bollettini qui sopra. Ricalcola ogni analisi coperta da un avviso applicabile e confronta i suoi risultati. L’elenco completo, comprese le verifiche sostituite e ritirate, è nelle note di rilascio."
    },
    {
      "k": "table",
      "caption": "Avvisi di modifica dei risultati selezionati dalla 0.5.0",
      "head": [
        "Versione dei risultati",
        "Risultato che cambia"
      ],
      "rows": [
        [
          "50",
          "2D: le rotazioni trattenute solo da connettori e da essi lasciate libere vengono rifiutate"
        ],
        [
          "52",
          "3D: le rotazioni nodali che un connettore accoppia ma lascia libere vengono rifiutate"
        ],
        [
          "53",
          "L’instabilità non prende più la rigidezza geometrica da sforzi normali di arrotondamento. In 2D e 3D, le aste i cui sforzi normali non si distinguono dall’arrotondamento non contribuiscono con alcuna rigidezza geometrica. L’analisi viene rifiutata se la loro possibile compressione potrebbe abbassare il moltiplicatore critico di oltre l’1 %."
        ],
        [
          "54",
          "L’area netta di un’estremità bullonata sfalsata assume la catena peggiore, e un’estremità bullonata a tutti gli elementi richiede bulloni nell’anima"
        ],
        [
          "56",
          "I vincoli inclinati 3D contano i vincoli in un sistema di riferimento comune"
        ],
        [
          "58",
          "Le basi modali usano la scala di arrotondamento di ogni voce di Gram della massa"
        ],
        [
          "59",
          "L’analisi plastica 3D controllata restituisce il limite inferiore certificato"
        ],
        [
          "61",
          "Il controllo di carico a fibre del calcestruzzo affina il suo intervallo di arresto"
        ],
        [
          "63",
          "L’analisi lineare rifiuta un meccanismo o una rigidezza non risolvibile invece di risolverli con un avviso"
        ],
        [
          "65",
          "I contatti congelati non validi e le analisi dei cavi come aste vengono trattenuti"
        ],
        [
          "66",
          "I limiti di arrotondamento dell’instabilità seguono l’effettivo accoppiamento dei vincoli"
        ],
        [
          "67",
          "I moltiplicatori di instabilità usano il fascio di rigidezza originale"
        ],
        [
          "68",
          "Il bilancio plastico usa gli ID dei modelli risolti e i certificati preventivano i candidati effettivi"
        ],
        [
          "69",
          "La convergenza non lineare segue l’equilibrio fisico"
        ],
        [
          "71",
          "Includi le azioni trasversali delle aste reticolari nel bilancio condizionato delle aste"
        ],
        [
          "72",
          "La continuazione a lunghezza d’arco raggruppa di nuovo l’aritmetica del carico di riferimento"
        ],
        [
          "73",
          "L’analisi modale conserva l’intervallo fisico della massa"
        ],
        [
          "75",
          "L’SSI corregge i plateau del residuo elastico"
        ],
        [
          "76",
          "La riduzione dei vincoli conserva l’incertezza direzionale di arrotondamento"
        ],
        [
          "78",
          "Carichi compatibili sulle rotazioni svincolate"
        ]
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/docs/releases/v0.6.0.it.md",
      "label": "Note di rilascio complete della 0.6.0",
      "t": "Ogni avviso di modifica dei risultati, con i link al suo ambito e alle prove:"
    },
    {
      "k": "img",
      "base": "blog/results-recheck",
      "w": 1600,
      "h": 1000,
      "alt": "Una finestra di ricontrollo dei risultati in Stabileo Base, che elenca le modifiche che interessano un progetto salvato più vecchio.",
      "caption": "La finestra di ricontrollo dei risultati illustrata nell’articolo della 0.5.0."
    },
    {
      "k": "h",
      "t": "Due avvisi descrivono un comportamento già presente nella 0.5.0"
    },
    {
      "k": "p",
      "t": "Questi due avvisi sono stati registrati più tardi. Le modifiche sottostanti erano già nella v0.5.0, quindi non sono nuove modifiche numeriche di questa versione. Possono comunque comparire in un avviso di ricontrollo del progetto."
    },
    {
      "k": "table",
      "caption": "Avvisi successivi per modifiche già rilasciate nella 0.5.0",
      "head": [
        "Versione dei risultati",
        "Risultato che cambia"
      ],
      "rows": [
        [
          "72",
          "La galleria pubblica dei solai usa appoggi semplici rigidi sulle pareti"
        ],
        [
          "72",
          "L’SSI restituisce le reazioni vincolari e include le molle del terreno nelle forze dei vincoli interni"
        ]
      ]
    },
    {
      "k": "h",
      "t": "Limiti noti"
    },
    {
      "k": "ul",
      "items": [
        "SA-2026-056 resta non corretto: verifica in modo indipendente le sollecitazioni dinamiche delle aste e le reazioni degli appoggi in tutti i modelli misti telaio–guscio vincolati interessati prima di usarle, anche quando rinumerazione, rotazione o conversione delle unità danno risultati concordi. Non è stabilito alcun coefficiente correttivo a favore di sicurezza.",
        "Il collasso plastico 2D resta rifiutato in attesa di #758, come descritto in SA-2026-044. Un limite inferiore 3D certificato non certifica la storia grezza delle cerniere.",
        "La time-history non fornisce le sollecitazioni dinamiche totali sui vincoli. Usa un’analisi indipendente che includa inerzia, smorzamento e carico sui vincoli. Le analisi dei cavi non supportate e il moto imposto non nullo dei vincoli nei flussi con cavi/time-history vengono rifiutati esplicitamente.",
        "I solutori spaziali a lunghezza d’arco e a controllo di spostamento non sono aggiunti. Gli avvisi e le restrizioni esistenti restano applicabili."
      ]
    },
    {
      "k": "h",
      "t": "Altre modifiche"
    },
    {
      "k": "ul",
      "items": [
        "Le strutture piane generate ricevono vincoli espliciti, e le tettoie usano per impostazione predefinita un controventamento fisico. Rigenera e rivedi vincoli e controventi; i modelli salvati non cambiano.",
        "L’esperimento di controllo di forma di strisce piegate di Fehér, Sipos e Várkonyi ha un solutore interattivo, percorsi degli attuatori e un confronto con l’articolo in inglese, spagnolo e portoghese. Anche il riepilogo della striscia tagliata è tradotto in spagnolo e portoghese.",
        "L’articolo di rilascio sul blog della 0.5.0 ha ora traduzioni complete in tedesco, francese e turco. Gli avvisi dei certificati plastici e i rifiuti per risorse sono tradotti in ogni lingua offerta."
      ]
    },
    {
      "k": "ext",
      "href": "https://github.com/lambdaclass/stabileo/blob/main/CHANGELOG.md",
      "label": "Registro delle modifiche",
      "t": "Il registro tecnico completo:"
    }
  ]
};

export default body;
